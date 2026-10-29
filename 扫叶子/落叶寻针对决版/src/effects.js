(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./gifts.js'),require('./pile.js'));else root.LeafEffects=factory(null,null);})(typeof globalThis!=='undefined'?globalThis:this,function(giftsMod,pileMod){
'use strict';
const G=typeof globalThis!=='undefined'?globalThis:{};
// 浏览器里各模块按拼接顺序挂到全局，用到时再取，不依赖加载顺序
const gifts=()=>{const m=giftsMod||G.LeafGifts;if(!m)throw new Error('effects.js 需要先加载 gifts.js');return m;};
const hcell=()=>(pileMod||G.LeafPile||{}).HCELL||8;
const TIERS=Object.freeze(['small','medium','large']),TIER_NAMES=Object.freeze({small:'小',medium:'中',large:'大'}),TIER_SCORE=Object.freeze({small:1,medium:5,large:20});
const MAX_RULES=100,MAX_GIFT=40,STAGE_W=1440,STAGE_H=810;
// 礼物数量可能极大（个数 × 份数），各处上限防卡死
const LIMITS=Object.freeze({quantity:1500,sceneQueue:50,frost:99,quickMs:600000,leaves:8000,bury:60});
const SCENE_GAP=500,FROST_IDLE=1500,FROST_STEP=400,EDGE=20,VIEW_PAD=60,TOSS_MIN=250,TOSS_MS=900;

const P=(key,label,min,max,tiers,step=1)=>({key,label,min,max,step,tiers});
const EFFECTS=[
  {id:'drift',name:'飘落叶',icon:'🍂',side:'troll',kind:'quantity',params:[P('count','每份片数',1,200,[5,15,40])]},
  {id:'gust',name:'一阵风',icon:'🌬',side:'troll',kind:'scene',params:[P('count','吹进坑里的片数',1,300,[25,40,80])]},
  {id:'frost',name:'结霜',icon:'🧊',side:'troll',kind:'stack',params:[P('clicks','每层要点几下',1,200,[10,20,35])]},
  {id:'rain',name:'落叶雨',icon:'🍁',side:'troll',kind:'scene',params:[P('count','新增片数',1,1000,[60,120,250])]},
  {id:'burst',name:'篮子炸了',icon:'🧺',side:'troll',kind:'quantity',params:[P('count','退回最近捡的片数',1,500,[30,60,120])]},
  {id:'tornado',name:'龙卷风',icon:'🌪',side:'troll',kind:'scene',params:[P('seconds','持续秒数',1,20,[4,6,9]),P('radius','半径',20,300,[70,100,140]),P('count','最多卷起片数',1,500,[60,120,220]),P('needleDepth','能卷走多深的针（层，0 为不卷）',0,60,[0,10,15])]},
  {id:'sweep',name:'扫一扫',icon:'🧹',side:'help',kind:'quantity',params:[P('count','每份片数',1,200,[3,8,20])]},
  {id:'tailwind',name:'顺风',icon:'🍃',side:'help',kind:'quantity',params:[P('count','吹走片数',1,500,[25,40,100])]},
  {id:'quick',name:'快手',icon:'✋',side:'help',kind:'stack',params:[P('seconds','持续秒数',1,120,[5,10,20]),P('layers','每点一下连捡层数',2,10,[2,3,4])]},
  {id:'sun',name:'阳光',icon:'☀️',side:'help',kind:'scene',params:[P('area','光圈面积占叶堆（%）',5,60,[33,25,12.5],0.5),P('seconds','亮几秒',1,60,[6,8,10])]},
  {id:'time',name:'加时',icon:'⏱',side:'help',kind:'stack',params:[P('seconds','秒数',1,600,[15,30,60])]}
];
for(const e of EFFECTS){for(const p of e.params){Object.freeze(p.tiers);Object.freeze(p);}Object.freeze(e.params);Object.freeze(e);}
Object.freeze(EFFECTS);
const EFFECT_BY_ID=Object.freeze(Object.fromEntries(EFFECTS.map(e=>[e.id,e])));
// 用 hasOwnProperty：礼物规则来自存档，'constructor' 之类的名字不能被当成效果
const effectOf=id=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(EFFECT_BY_ID,id)?EFFECT_BY_ID[id]:null;
const isTier=t=>TIERS.includes(t);

const PRESETS=[['玫瑰','drift','small',1],['加油鸭','gust','medium',1],['暮光星辰','rain','medium',1],['珍爱玫瑰','tornado','large',1],['比心兔兔','tornado','medium',1],['棒棒糖','burst','medium',1],['抖音','sweep','small',1],['鲜花','tailwind','medium',1],['一束花开','sun','medium',1],['摸摸头','quick','medium',1],['浪漫营地','tailwind','medium',5]];
const rule=([gift,effect,tier,portions])=>({gift,effect,tier,portions});
function presetRules(){return PRESETS.map(rule);}
function defaultParams(){
  const out={};
  for(const e of EFFECTS){out[e.id]={};TIERS.forEach((t,i)=>{out[e.id][t]=Object.fromEntries(e.params.map(p=>[p.key,p.tiers[i]]));});}
  return out;
}
// 结霜、加时默认不绑礼物，留两条空名规则给主播填
function defaultConfig(){
  return{params:defaultParams(),rules:[...presetRules(),rule(['','frost','medium',1]),rule(['','time','medium',1])],
    likes:{enabled:true,step:1000,effect:'drift',tier:'small',portions:2},legend:{visible:true,x:24,y:560,collapsed:false}};
}

const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const missing=v=>v===undefined||v===null;
const NUM=/^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?\s*$/i;
const num=v=>typeof v==='number'?v:typeof v==='string'&&NUM.test(v)?Number(v):NaN;
// 缺失的字段用默认值补齐（旧存档迁移）；存在但非法的报错，config 里该处同样用默认值，保证总能拿来用
function validateConfig(cfg){
  const errors=[],def=defaultConfig(),err=(path,message)=>{errors.push({path,message});};
  if(missing(cfg))return{ok:true,errors,config:def};
  if(!isObj(cfg)){err('','设置的格式不对，已改用默认设置');return{ok:false,errors,config:def};}
  const sec=(v,path,label)=>{if(missing(v))return{};if(isObj(v))return v;err(path,`${label}的格式不对`);return{};};
  const number=(v,fb,path,label,min,max,int)=>{
    if(missing(v))return fb;
    const n=num(v);
    if(!Number.isFinite(n)){err(path,`${label}要填数字`);return fb;}
    if(int&&!Number.isInteger(n)){err(path,`${label}要填整数`);return fb;}
    if(n<min||n>max){err(path,`${label}要在 ${min}–${max} 之间`);return fb;}
    return n;
  };
  const bool=(v,fb,path,label)=>{if(missing(v))return fb;if(typeof v==='boolean')return v;err(path,`${label}只能是开或关`);return fb;};
  const pick=(v,fb,path,label,ok)=>{if(missing(v))return fb;if(ok(v))return v;err(path,`${label}不存在`);return fb;};

  const src=sec(cfg.params,'params','效果参数'),params={};
  for(const e of EFFECTS){
    const pe=sec(src[e.id],`params.${e.id}`,`「${e.name}」的参数`);params[e.id]={};
    for(const t of TIERS){
      const pt=sec(pe[t],`params.${e.id}.${t}`,`「${e.name}·${TIER_NAMES[t]}」的参数`),out={};
      for(const p of e.params)out[p.key]=number(pt[p.key],def.params[e.id][t][p.key],`params.${e.id}.${t}.${p.key}`,`${e.name}·${TIER_NAMES[t]}的「${p.label}」`,p.min,p.max,p.step===1);
      params[e.id][t]=out;
    }
  }

  let rules=def.rules;
  if(!missing(cfg.rules)){
    if(!Array.isArray(cfg.rules))err('rules','礼物规则的格式不对');
    else{
      if(cfg.rules.length>MAX_RULES)err('rules',`礼物规则最多 ${MAX_RULES} 条`);
      rules=[];const at=[];
      cfg.rules.slice(0,MAX_RULES).forEach((r,i)=>{
        const path=`rules.${i}`,label=`第 ${i+1} 条规则`;
        if(!isObj(r)){err(path,`${label}的格式不对`);return;}
        const e=effectOf(r.effect);
        if(!e){err(`${path}.effect`,`${label}选的效果不存在`);return;}
        let gift='';
        if(typeof r.gift==='string'||typeof r.gift==='number')gift=String(r.gift).trim();
        else if(!missing(r.gift))err(`${path}.gift`,`${label}的礼物名要填文字`);
        const chars=Array.from(gift);
        if(chars.length>MAX_GIFT){err(`${path}.gift`,`${label}的礼物名最多 ${MAX_GIFT} 个字`);gift=chars.slice(0,MAX_GIFT).join('');}
        rules.push({gift,effect:e.id,tier:pick(r.tier,'medium',`${path}.tier`,`${label}的档位`,isTier),portions:number(r.portions,1,`${path}.portions`,`${label}的份数`,1,100,true)});
        at.push(i);
      });
      const {duplicateNames,normalizeName}=gifts(),dups=new Set(duplicateNames(rules));
      rules.forEach((r,k)=>{if(r.gift&&dups.has(normalizeName(r.gift)))err(`rules.${at[k]}.gift`,`礼物名「${r.gift}」重复了，一个礼物只能绑一条规则`);});
    }
  }

  const lk=sec(cfg.likes,'likes','点赞设置'),dl=def.likes;
  const likes={
    enabled:bool(lk.enabled,dl.enabled,'likes.enabled','点赞开关'),
    step:number(lk.step,dl.step,'likes.step','点赞累计步长',1,100000,true),
    effect:pick(lk.effect,dl.effect,'likes.effect','点赞触发的效果',v=>!!effectOf(v)),
    tier:pick(lk.tier,dl.tier,'likes.tier','点赞触发的档位',isTier),
    portions:number(lk.portions,dl.portions,'likes.portions','点赞触发的份数',1,100,true)
  };
  const lg=sec(cfg.legend,'legend','说明牌设置'),dg=def.legend;
  const legend={
    visible:bool(lg.visible,dg.visible,'legend.visible','说明牌显示'),
    x:number(lg.x,dg.x,'legend.x','说明牌位置（横）',0,STAGE_W,false),
    y:number(lg.y,dg.y,'legend.y','说明牌位置（竖）',0,STAGE_H,false),
    collapsed:bool(lg.collapsed,dg.collapsed,'legend.collapsed','说明牌收起')
  };
  return{ok:!errors.length,errors,config:{params,rules,likes,legend}};
}

const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const segDist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,L=dx*dx+dy*dy,t=L?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/L,0,1):0;return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);};

class EffectEngine{
  constructor({pile,config,random=Math.random,getTarget=null,adjustLanding=p=>p,bucket=[],bucketPos=[600,-20,150],cameraPos=null,glintThreshold=()=>8,view=null,afterRemove=null}={}){
    if(!pile)throw new Error('EffectEngine 需要叶堆');
    // afterRemove(叶片列表)：效果拿走叶子后通知 app，让周围的叶堆跟着塌落（埋针模拟里的撤回不通知）
    Object.assign(this,{pile,random,getTarget,adjustLanding,bucket,bucketPos,cameraPos,glintThreshold,afterRemove});
    this.view=view||{x0:pile.x0+VIEW_PAD,y0:pile.y0+VIEW_PAD,x1:pile.x0+pile.w-VIEW_PAD,y1:pile.y0+pile.h-VIEW_PAD};
    this.setConfig(config);
    this.state={frost:{layers:0,progress:0,need:0,stack:[],lastClick:0},quick:{until:0,layers:1},sun:null,timeBonus:0,needleHiddenUntil:0};
    this.pending=[];this.queue=[];this.tornadoes=[];this.lanes={};this.now=0;this.seq=0;this.tid=0;this.sorted=true;this.cappedCount=0;
  }
  // 排队中的场面型开场时才读参数，所以换配置也作用于还没上场的那些
  setConfig(config){this.config=validateConfig(config).config;}
  canPick(){return this.state.frost.layers===0;}
  pickLayers(now=this.now){const q=this.state.quick;return q.until>now?q.layers:1;}

  rnd(a,b){return a+(b-a)*this.random();}
  clampPt(p,fb){const P=this.pile,x=p&&finite(p.x)?p.x:fb?fb.x:0,y=p&&finite(p.y)?p.y:fb?fb.y:0;return{x:clamp(x,P.x0+EDGE,P.x0+P.w-EDGE),y:clamp(y,P.y0+EDGE,P.y0+P.h-EDGE)};}
  // adjustLanding 返回坏值时退回推开前的点，dropLeaf 永远拿到界内的有限数
  land(p,size){const q=this.clampPt(p);return this.clampPt(this.adjustLanding({x:q.x,y:q.y,size}),q);}
  ellipsePoint(k=0.85){const P=this.pile,ang=this.random()*Math.PI*2,r=Math.sqrt(this.random())*k;return{x:P.a*r*Math.cos(ang),y:P.b*r*Math.sin(ang)};}
  discPoint(c,R){const ang=this.random()*Math.PI*2,r=Math.sqrt(this.random())*R;return{x:c.x+r*Math.cos(ang),y:c.y+r*Math.sin(ang)};}
  target(){const t=this.getTarget?this.getTarget():null;return t&&finite(t.x)&&finite(t.y)?this.clampPt(t):this.clampPt(this.ellipsePoint());}
  newLeaf(){const P=this.pile;return{x:0,y:0,yaw:this.random()*Math.PI*2,size:P.sizeMin+this.random()*(P.sizeMax-P.sizeMin),type:Math.min(P.masks.length-1,Math.floor(this.random()*P.masks.length))};}
  room(){return Math.max(0,LIMITS.leaves-this.pile.leaves.length-this.pending.length);}
  // 中心没被盖住的表层叶子很少，要一轮轮剥：每轮把剥到的放进 skip，下一轮就能看到下面一层
  peel(x,y,r,n,skip=new Set()){const out=[];while(out.length<n){const s=this.pile.surfaceLeaves(x,y,r,n-out.length,skip);if(!s.length)break;for(const l of s){skip.add(l);out.push(l);}}return out;}
  // 坑格容量 = 还差几层才不算坑；每落一片就把它盖住的格各减一层，填平后改落别处，免得几十片叠成一座塔
  pits(center=null,R=0){
    const P=this.pile,base=P.baseHeight,t=P.thickness,cs=hcell(),cells=[],rem=new Map();
    if(!base)return{cells,rem};
    let c0=0,c1=P.hcols-1,r0=0,r1=P.hrows-1;
    if(center){c0=Math.max(0,Math.floor((center.x-R-P.x0)/cs));c1=Math.min(c1,Math.floor((center.x+R-P.x0)/cs));r0=Math.max(0,Math.floor((center.y-R-P.y0)/cs));r1=Math.min(r1,Math.floor((center.y+R-P.y0)/cs));}
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){
      const i=r*P.hcols+c,d=(base[i]-P.height[i])/t-2;
      if(d>0&&(!center||Math.hypot(P.x0+(c+0.5)*cs-center.x,P.y0+(r+0.5)*cs-center.y)<=R)){rem.set(i,Math.ceil(d));cells.push(i);}
    }
    return{cells,rem};
  }
  takePit(pk,size){
    const P=this.pile,cs=hcell(),{cells,rem}=pk;
    while(cells.length){
      const j=Math.floor(this.random()*cells.length),i=cells[j];
      if(!(rem.get(i)>0)){cells[j]=cells[cells.length-1];cells.pop();continue;}
      const c=i%P.hcols,r=(i-c)/P.hcols,k=Math.ceil(size*0.4/cs);
      for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++){
        const rr=r+dr,cc=c+dc,q=rr*P.hcols+cc;
        if(rr>=0&&cc>=0&&rr<P.hrows&&cc<P.hcols&&dr*dr+dc*dc<=k*k&&rem.has(q))rem.set(q,rem.get(q)-1);
      }
      return{x:P.x0+(c+this.random())*cs,y:P.y0+(r+this.random())*cs};
    }
    return null;
  }
  schedule(at,leaf){this.pending.push({at,seq:this.seq++,leaf});this.sorted=false;}
  // 新叶落地前不进叶堆，免得点到还在空中的叶子；to 的高度只是估计，真正的 z 落地时由 dropLeaf 算
  fall(kind,leaf,t0,t1,from,toZ){
    this.schedule(t1,leaf);
    const z=finite(toZ)?toZ:this.pile.heightAt(leaf.x,leaf.y)+this.pile.thickness;
    return{type:'fall',leaf:{...leaf},from:from||[leaf.x,leaf.y,z+500],to:[leaf.x,leaf.y,z],t0,t1,kind};
  }
  // 落地前再推一次：护脸圈可能在叶子飞行时被拖动过
  drop(s){const p=this.land(s,s.size);return this.pile.dropLeaf({x:p.x,y:p.y,yaw:s.yaw,size:s.size,type:s.type});}
  landDue(now){
    if(!this.sorted){this.pending.sort((a,b)=>a.at-b.at||a.seq-b.seq);this.sorted=true;}
    let k=0;while(k<this.pending.length&&this.pending[k].at<=now)k++;
    for(const d of this.pending.splice(0,k))this.drop(d.leaf);
  }

  doDrift(n,now,ev){
    // 一次几十片挤在 110 内会叠出近 30 层的高塔，片数多时按面积放大落点范围
    const t=this.target(),R=Math.min(360,110*Math.max(1,Math.sqrt(n/15)));
    for(let i=0;i<n;i++){
      const s=this.newLeaf(),p=this.land(this.discPoint(t,R),s.size);s.x=p.x;s.y=p.y;
      ev.push(this.fall('drift',s,now+this.rnd(0,300),now+this.rnd(1000,1600),[p.x+this.rnd(-60,60),p.y+this.rnd(-30,30),this.pile.heightAt(p.x,p.y)+this.rnd(450,600)]));
    }
  }
  takeNear(n){
    const t=this.target(),skip=new Set(),got=[];
    for(let r=80;got.length<n;r+=60){got.push(...this.peel(t.x,t.y,Math.min(r,600),n-got.length,skip));if(r>=600)break;}
    this.pile.removeMany(got);this.removed(got);return got;
  }
  removed(list){if(this.afterRemove&&list.length)this.afterRemove(list);}
  doSweep(n,now,ev){
    const got=this.takeNear(n),gap=Math.min(80,1000/Math.max(1,got.length));
    got.forEach((l,i)=>{
      this.bucket.push({x:l.x,y:l.y,yaw:l.yaw,size:l.size,type:l.type,at:now});
      const t0=now+i*gap;ev.push({type:'fly',leaf:l,from:[l.x,l.y,l.z],to:this.bucketPos.slice(),t0,t1:t0+500,into:'bucket'});
    });
  }
  doTailwind(n,now,ev){
    const got=this.takeNear(n),gap=Math.min(40,800/Math.max(1,got.length)),dir=this.random()<0.5?-1:1,V=this.view;
    got.forEach((l,i)=>{const t0=now+i*gap;ev.push({type:'fly',leaf:l,from:[l.x,l.y,l.z],to:[dir>0?V.x1+300:V.x0-300,l.y+this.rnd(-150,150),l.z+this.rnd(150,350)],t0,t1:t0+900,into:'away'});});
  }
  fromBucket(o){
    const s=this.newLeaf(),t=o&&finite(o.x)&&finite(o.y)?o:this.target();
    s.x=t.x;s.y=t.y;
    if(o&&finite(o.yaw))s.yaw=o.yaw;
    if(o&&finite(o.size)&&o.size>0)s.size=o.size;
    if(o&&Number.isInteger(o.type)&&o.type>=0&&o.type<this.pile.masks.length)s.type=o.type;
    return s;
  }
  doBurst(n,now,ev){
    const B=this.bucket,k=Math.min(n,B.length),m=Math.min(k,this.room());
    if(m<k)this.cappedCount++;
    ev.push({type:'burst',t0:now,t1:now+500});
    for(const o of B.splice(B.length-m,m).reverse()){
      const s=this.fromBucket(o),p=this.land(s,s.size);s.x=p.x;s.y=p.y;
      const t0=now+500+this.rnd(0,150);ev.push(this.fall('burst',s,t0,t0+this.rnd(500,1200),this.bucketPos.slice()));
    }
  }

  runQueue(now,ev){
    const busy=new Set();
    for(let i=0;i<this.queue.length;){
      const q=this.queue[i];
      if(busy.has(q.id)||(this.lanes[q.id]||0)>now){busy.add(q.id);i++;continue;}
      this.queue.splice(i,1);busy.add(q.id);
      const P=this.config.params[q.id][q.tier];
      const end=q.id==='gust'?this.startGust(P,now,ev):q.id==='rain'?this.startRain(P,now,ev):q.id==='tornado'?this.startTornado(P,now,ev):this.startSun(P,now,ev);
      this.lanes[q.id]=end+SCENE_GAP;
    }
  }
  startGust(P,now,ev){
    const t=this.target(),dir=this.random()<0.5?-1:1,src=this.peel(t.x-dir*300,t.y,150,P.count),pk=this.pits(t,140);
    this.pile.removeMany(src);this.removed(src);
    ev.push({type:'gust',dir,center:{x:t.x,y:t.y},t0:now,t1:now+1400});
    for(const l of src){
      const s={x:0,y:0,yaw:l.yaw,size:l.size,type:l.type},p=this.land(this.takePit(pk,l.size)||this.discPoint(t,140),l.size);s.x=p.x;s.y=p.y;
      ev.push(this.fall('gust',s,now,now+this.rnd(800,1400),[l.x,l.y,l.z]));
    }
    return now+1400;
  }
  startRain(P,now,ev){
    const room=this.room(),n=Math.min(P.count,LIMITS.quantity,room),nPit=Math.round(n*0.7),pk=this.pits(),V=this.view;
    if(n<P.count)this.cappedCount++;
    for(let i=0;i<n;i++){
      const s=this.newLeaf(),raw=i<nPit?this.takePit(pk,s.size)||this.ellipsePoint(0.95):{x:this.rnd(V.x0,V.x1),y:this.rnd(V.y0,V.y1)},p=this.land(raw,s.size);s.x=p.x;s.y=p.y;
      const t1=now+this.rnd(600,2200);
      ev.push(this.fall('rain',s,Math.max(now,t1-this.rnd(600,900)),t1,[p.x+this.rnd(-80,80),p.y-this.rnd(0,60),this.pile.heightAt(p.x,p.y)+this.rnd(700,900)]));
    }
    return now+2200;
  }
  startSun(P,now,ev){
    const L=this.pile,R=Math.sqrt(P.area/100*L.a*L.b),n=L.needle,until=now+P.seconds*1000;
    // 光圈要罩住整根针：圆心偏移不超过 半径 − 半针长（留 8 的边）；圈比针还短时就以针为中心
    const c=this.clampPt(n&&!n.pulled?this.discPoint(n,Math.max(0,Math.min(0.6*R,R-n.length/2-8))):this.ellipsePoint());
    this.state.sun={until,center:c,radius:R,start:now};
    ev.push({type:'sun',center:{x:c.x,y:c.y},radius:R,t0:now,t1:until});
    return until;
  }
  startTornado(P,now,ev){
    const t=this.target(),V=this.view,L=this.pile,r=P.radius,dir=this.random()<0.5?1:-1,id=++this.tid;
    const A=[dir>0?V.x0-r-40:V.x1+r+40,t.y+this.rnd(-120,120)],B=[dir>0?V.x1+r+40:V.x0-r-40,t.y+this.rnd(-120,120)],M=[t.x+this.rnd(-0.3,0.3)*r,t.y+this.rnd(-0.3,0.3)*r];
    // 二次贝塞尔的控制点取成让路线中点正好经过 M（目标点附近）
    const tor={id,t0:now,t1:now+P.seconds*1000,radius:r,count:Math.min(P.count,LIMITS.quantity),depth:P.needleDepth,A,C:[2*M[0]-(A[0]+B[0])/2,2*M[1]-(A[1]+B[1])/2],B,taken:[],tossed:false,last:null,fIn:0.3,fOut:0.7};
    // 卷叶配额只在漏斗扫过叶堆的那段里按进度放开，免得一碰到叶堆边缘就卷满
    let fIn=-1,fOut=-1;
    for(let k=0;k<=200;k++){const q=this.pathAt(tor,k/200);if((q.x/(L.a+r))**2+(q.y/(L.b+r))**2<=1){if(fIn<0)fIn=k/200;fOut=k/200;}}
    if(fIn>=0&&fOut>fIn){tor.fIn=fIn;tor.fOut=fOut;}
    this.tornadoes.push(tor);
    ev.push({type:'tornado',id,path:Array.from({length:17},(_,k)=>{const q=this.pathAt(tor,k/16);return[q.x,q.y];}),radius:r,t0:now,t1:tor.t1});
    return tor.t1;
  }
  pathAt(tor,f){const u=1-f,{A,C,B}=tor;return{x:u*u*A[0]+2*u*f*C[0]+f*f*B[0],y:u*u*A[1]+2*u*f*C[1]+f*f*B[1]};}
  // 逐帧推进：漏斗到哪才卷哪里，否则龙卷风还没到，叶堆上就先出现空洞
  stepTornado(tor,now,ev){
    const f=clamp((now-tor.t0)/(tor.t1-tor.t0),0,1),q=this.pathAt(tor,f),last=tor.last||q;tor.last=q;
    const allow=Math.min(tor.count,Math.ceil(tor.count*clamp((f-tor.fIn)/(tor.fOut-tor.fIn),0,1))),k=allow-tor.taken.length;
    // 甩出去的针所在处（含针身下面和埋针的叶子）这阵风不再刨，配额留到离开后再补
    const guarded=tor.guard&&Math.hypot(q.x-tor.guard.x,q.y-tor.guard.y)<tor.radius+tor.guard.r;
    if(k>0&&!guarded){
      const got=this.peel(q.x,q.y,tor.radius,k);this.pile.removeMany(got);this.removed(got);
      for(const l of got){tor.taken.push(l);ev.push({type:'fly',leaf:l,from:[l.x,l.y,l.z],to:[q.x,q.y,l.z+this.rnd(80,200)],t0:now,t1:now+400,into:'tornado',tornado:tor.id});}
    }
    const n=this.pile.needle;
    // 按这一帧走过的线段判断是否经过针，帧间隔大时也不会跳过去；针还在空中或正被埋时不再卷
    if(!tor.tossed&&tor.depth>0&&n&&!n.pulled&&now>=this.state.needleHiddenUntil&&segDist(n,last,q)<tor.radius&&this.pile.minCover()<=tor.depth){tor.tossed=true;this.tossNeedle(tor,f,now,ev);}
    return f>=1;
  }
  endTornado(tor,now,ev,instant){
    const pk=this.pits();
    for(const l of tor.taken){
      const s={x:0,y:0,yaw:l.yaw,size:l.size,type:l.type},p=this.land(this.takePit(pk,l.size)||this.ellipsePoint(0.95),l.size);s.x=p.x;s.y=p.y;
      ev.push(this.fall('tornado',s,now,instant?now:now+this.rnd(300,1100),[p.x+this.rnd(-100,100),p.y,this.pile.heightAt(p.x,p.y)+this.rnd(500,700)]));
    }
    tor.taken=[];
  }
  // 先在新位置模拟埋针，算出要落哪些叶子后撤回，等针落地再按时真正落下
  tossNeedle(tor,f,now,ev){
    const L=this.pile,n=L.needle,from=[n.x,n.y,n.z],yaw0=n.yaw;
    // 优先离原位够远且不在漏斗剩下路线上的点；找不到就退而只要够远，再不行取最远的
    let best=null,far=null,farD=-1,alt=null;
    for(let i=0;i<80&&!best;i++){
      const p=this.land(this.ellipsePoint(0.8),n.length),d=Math.hypot(p.x-n.x,p.y-n.y);
      if(d>=TOSS_MIN){if(this.offPath(tor,f,p))best=p;else if(!alt)alt=p;}
      if(d>farD){far=p;farD=d;}
    }
    best=best||alt||far;
    const m=L.placeNeedleAt(best.x,best.y,this.random()*Math.PI),g=this.glintThreshold(),want=(finite(g)?g:8)+2,cam=this.cameraPos,sim=[];
    tor.guard={x:m.x,y:m.y,r:m.length/2+60};
    const buried=()=>L.minCover()>=want&&(!cam||L.exposure(cam()).ratio===0);
    for(let k=0;sim.length<LIMITS.bury&&!buried();k=(k+1)%3){
      const s=this.newLeaf(),o=(k-1)*50,p=this.land({x:m.x+o*m.cos,y:m.y+o*m.sin},s.size);
      sim.push(L.dropLeaf({x:p.x,y:p.y,yaw:s.yaw,size:s.size,type:s.type}));
    }
    const specs=sim.map(l=>({leaf:{x:l.x,y:l.y,yaw:l.yaw,size:l.size,type:l.type},z:l.z}));
    L.removeMany(sim);
    const landAt=now+TOSS_MS,gap=specs.length?Math.min(60,1500/specs.length):0;
    ev.push({type:'needleToss',from,to:[m.x,m.y,m.z],yaw:[yaw0,m.yaw],t0:now,t1:landAt});
    let last=landAt;
    specs.forEach((s,i)=>{last=landAt+200+i*gap;ev.push(this.fall('bury',s.leaf,last-600,last,[s.leaf.x,s.leaf.y,s.z+450],s.z));});
    this.state.needleHiddenUntil=Math.max(this.state.needleHiddenUntil,last);
  }
  // 新位置避开漏斗剩下的路线，免得刚埋好的针又被同一阵风刨出来
  offPath(tor,f,p){for(let g=f;g<1+1e-9;g+=0.05){const q=this.pathAt(tor,Math.min(1,g));if(Math.hypot(q.x-p.x,q.y-p.y)<tor.radius+80)return false;}return true;}

  addFrost(P,portions,now,ev){
    const F=this.state.frost,add=Math.min(portions,LIMITS.frost-F.stack.length);
    if(add<portions)this.cappedCount++;
    if(!F.layers){F.progress=0;F.lastClick=now;}
    for(let i=0;i<add;i++)F.stack.push(P.clicks);
    F.layers=F.stack.length;F.need=F.stack[0]||0;
    ev.push({type:'frost',layers:F.layers,need:F.need});
  }
  addQuick(P,portions,now,ev){
    const Q=this.state.quick,live=Q.until>now;
    let until=Math.max(Q.until,now)+P.seconds*1000*portions;
    if(until>now+LIMITS.quickMs){until=now+LIMITS.quickMs;this.cappedCount++;}
    this.state.quick={until,layers:live?Math.max(Q.layers,P.layers):P.layers};
    ev.push({type:'quick',until,layers:this.state.quick.layers});
  }
  trigger(id,tier,portions,now){
    const e=effectOf(id),fail=reason=>({ok:false,visual:[],reason});
    if(!e)return fail('没有这个效果');
    if(!isTier(tier))return fail('没有这个档位');
    if(!Number.isSafeInteger(portions)||portions<1)return fail('份数要是正整数');
    if(!finite(now))return fail('缺少当前时间');
    this.now=now;
    const P=this.config.params[id][tier],ev=[],res={ok:true,visual:ev},c0=this.cappedCount;
    if(e.kind==='quantity'){
      const want=P.count*portions,n=Math.min(want,LIMITS.quantity,id==='drift'?this.room():Infinity);
      if(n<want)this.cappedCount++;
      if(id==='drift')this.doDrift(n,now,ev);else if(id==='sweep')this.doSweep(n,now,ev);else if(id==='tailwind')this.doTailwind(n,now,ev);else this.doBurst(n,now,ev);
    }else if(e.kind==='scene'){
      const have=this.queue.reduce((k,q)=>k+(q.id===id?1:0),0),add=Math.max(0,Math.min(portions,LIMITS.sceneQueue-have));
      for(let i=0;i<add;i++)this.queue.push({id,tier});
      if(add<portions){res.dropped=portions-add;this.cappedCount++;}
      this.runQueue(now,ev);
    }else if(id==='frost')this.addFrost(P,portions,now,ev);
    else if(id==='quick')this.addQuick(P,portions,now,ev);
    else{const s=P.seconds*portions;this.state.timeBonus+=s;ev.push({type:'time',seconds:s});}
    if(this.cappedCount>c0)res.capped=true;
    return res;
  }
  update(now){
    const ev=[];if(!finite(now))return ev;
    this.now=now;this.landDue(now);
    for(let i=0;i<this.tornadoes.length;){const tor=this.tornadoes[i];if(this.stepTornado(tor,now,ev)){this.endTornado(tor,now,ev,false);this.tornadoes.splice(i,1);}else i++;}
    this.runQueue(now,ev);
    // 停手 1.5 秒后每 0.4 秒回落一下：每回落一下把 lastClick 后移 0.4 秒，下一下仍按「lastClick+1.5 秒」判断
    const F=this.state.frost;let decayed=false;
    while(F.layers>0&&F.progress>0&&now>=F.lastClick+FROST_IDLE){F.progress--;F.lastClick+=FROST_STEP;decayed=true;}
    if(decayed)ev.push({type:'frostCrack',progress:F.progress,need:F.need,layers:F.layers,decay:true});
    if(this.state.quick.until&&now>=this.state.quick.until)this.state.quick={until:0,layers:1};
    if(this.state.sun&&now>=this.state.sun.until)this.state.sun=null;
    return ev;
  }
  frostClick(now){
    const F=this.state.frost;if(!F.layers)return[];
    if(finite(now))F.lastClick=now;
    F.progress++;
    if(F.progress<F.need)return[{type:'frostCrack',progress:F.progress,need:F.need,layers:F.layers}];
    F.stack.shift();F.layers=F.stack.length;F.progress=0;F.need=F.stack[0]||0;
    return[F.layers?{type:'frostLayer',layers:F.layers,need:F.need}:{type:'frostBreak'}];
  }
  // 存档前用：在路上的叶子立即落地，正在刮的龙卷风立即结束；还没上场的场面型留在 queue
  flushAll(){
    const now=this.now,ev=[];
    for(const tor of this.tornadoes)this.endTornado(tor,now,ev,true);
    if(this.tornadoes.length)this.lanes.tornado=now+SCENE_GAP;
    this.tornadoes=[];
    if(!this.sorted)this.pending.sort((a,b)=>a.at-b.at||a.seq-b.seq);
    const due=this.pending;this.pending=[];this.sorted=true;
    for(const d of due)this.drop(d.leaf);
    if(this.state.needleHiddenUntil>now)this.state.needleHiddenUntil=now;
    return ev;
  }
}
EffectEngine.LIMITS=LIMITS;
return{EFFECTS,EFFECT_BY_ID,TIERS,TIER_NAMES,TIER_SCORE,defaultConfig,presetRules,validateConfig,EffectEngine};
});
