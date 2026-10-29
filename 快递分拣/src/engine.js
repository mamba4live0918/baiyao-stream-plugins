(function(root){
'use strict';
class Game {
 constructor(target=30,options={}){this.target=target;this.speed=options.speed??1;this.spawnSeconds=options.spawnSeconds??4.2;this.status='ready';this.parcels=[];this.returns=[];this.done=0;this.mistakes=0;this.combo=0;this.best=0;this.elapsed=0;this.serial=0;this.spawn=0;this.held=null;this.effects={reverse:0,slow:0,sticky:0};this.counts=[0,0,0];this.events=[];}
 snapshot(){return JSON.parse(JSON.stringify({...this,held:null,events:[]}));}
 static restore(s){const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;const int=(v,min,max)=>num(v,min,max)&&Number.isInteger(v);if(!s||!int(s.target,10,200)||!['ready','playing','paused','complete'].includes(s.status)||!num(s.speed,.4,3)||!num(s.spawnSeconds,1,10)||!int(s.done,0,s.target)||!int(s.mistakes,0,1e7)||!int(s.combo,0,s.done)||!int(s.best,s.combo,s.done)||!num(s.elapsed,0,1e9)||!int(s.serial,0,1e8)||!num(s.spawn,-1,10)||!Array.isArray(s.counts)||s.counts.length!==3||!s.counts.every(n=>int(n,0,s.done))||s.counts.reduce((a,b)=>a+b,0)!==s.done||!Array.isArray(s.parcels)||!Array.isArray(s.returns)||s.parcels.length+s.returns.length>40)throw new Error('快递存档字段无效');if(s.status==='complete'&&s.done!==s.target||s.status!=='complete'&&s.done>=s.target)throw new Error('快递结算状态无效');if(!s.effects||!num(s.effects.reverse,0,120)||!num(s.effects.slow,0,120)||!int(s.effects.sticky,0,12))throw new Error('快递效果无效');const seen=new Set();for(const p of [...s.parcels,...s.returns.map(r=>r.parcel)]){if(!p||!int(p.id,1,s.serial)||seen.has(p.id)||!int(p.color,0,2)||typeof p.name!=='string'||p.name.length>30||typeof p.big!=='boolean'||!num(p.x,-8,8)||!int(p.lane,0,1)||(p.glue!==undefined&&!int(p.glue,0,3)))throw new Error('包裹记录无效');seen.add(p.id);}if(!s.returns.every(r=>num(r.wait,0,3)))throw new Error('返工计时无效');const g=new Game(s.target,{speed:s.speed,spawnSeconds:s.spawnSeconds});const clean=JSON.parse(JSON.stringify(s));for(const k of ['target','speed','spawnSeconds','parcels','returns','done','mistakes','combo','best','elapsed','serial','spawn','effects','counts'])g[k]=clean[k];g.held=null;g.events=[];g.status=s.status==='playing'?'paused':s.status;return g;}
 start(){if(this.status==='ready')this.status='playing';}
 pause(){if(this.status==='playing')this.status='paused';else if(this.status==='paused')this.status='playing';}
 add(color=Math.floor(Math.random()*3),name='路过的小伙伴',big=false){
  if(this.parcels.length+this.returns.length>=40)return null;
  const p={id:++this.serial,color,name:String(name).slice(0,16),big,x:this.effects.reverse>0?.88:.02,lane:this.serial%2};this.parcels.push(p);return p;
 }
 tell(text,type='info'){this.events.push({text,type});}
 back(p){this.parcels=this.parcels.filter(x=>x.id!==p.id);this.returns.push({parcel:p,wait:2.6});this.combo=0;this.mistakes++;}
 sort(id,color){
  if(this.status!=='playing')return 'blocked';
  const p=this.parcels.find(x=>x.id===id);if(!p)return 'missing';
  if(p.color!==color){this.back(p);this.tell(p.name+'的包裹分错啦，稍后返工','bad');return 'wrong';}
  this.parcels=this.parcels.filter(x=>x.id!==id);this.done++;this.counts[color]++;this.combo++;this.best=Math.max(this.best,this.combo);
  if(this.done>=this.target){this.status='complete';this.held=null;this.tell('本班任务完成，下班啦！','good');}
  return 'correct';
 }
 effect(kind,name='热心观众',amount){
  if(this.status!=='playing')return false;
  const defaults={rush:5,giant:1,reverse:8,sticky:1,slow:10,robot:3};amount=amount??defaults[kind];const limits={rush:40,giant:10,reverse:120,sticky:12,slow:120,robot:40};if(!Number.isInteger(amount)||amount<1||amount>(limits[kind]??0))return false;
  if(kind==='rush'){let n=0;for(let i=0;i<amount;i++){let p=this.add(i%3,name);if(p){p.x=this.effects.reverse>0?.95+i*.14:-.1-i*.14;n++;}}this.tell(name+'加急派件 +'+n);if(!n)return false;}
  else if(kind==='giant'){let n=0;for(let i=0;i<amount;i++)if(this.add(undefined,name,true))n++;if(!n){this.tell('候场已满，请先处理包裹');return false;}this.tell(name+'寄来了 '+n+' 件超大包裹');}
  else if(kind==='reverse'){this.effects.reverse=Math.min(120,this.effects.reverse+amount);this.tell(name+'让传送带倒转了');}
  else if(kind==='sticky'){this.effects.sticky=Math.min(12,this.effects.sticky+amount);this.tell('胶带来了！下次拿件要先点击拆胶带');}
  else if(kind==='slow'){this.effects.slow=Math.min(120,this.effects.slow+amount);this.tell(name+'开启慢速救场','good');}
  else if(kind==='robot'){let n=0;for(const p of [...this.parcels].filter(x=>x.id!==this.held).slice(0,amount)){if(this.status!=='playing')break;this.sort(p.id,p.color);n++;}this.tell('机器人帮忙分好了 '+n+' 件','good');if(!n)return false;}
  else return false;return true;
 }
 tick(dt){
  if(this.status!=='playing')return;this.elapsed+=dt;
  for(const k of ['reverse','slow'])this.effects[k]=Math.max(0,this.effects[k]-dt);
  for(const r of [...this.returns]){r.wait-=dt;if(r.wait<=0){r.parcel.x=this.effects.reverse>0?.9:.02;this.parcels.push(r.parcel);this.returns.splice(this.returns.indexOf(r),1);}}
  const dir=this.effects.reverse>0?-1:1;const speed=.038*this.speed*(this.effects.slow>0?.38:1);
  for(const p of [...this.parcels]){if(p.id===this.held)continue;p.x+=dt*speed*dir;if((dir>0&&p.x>1.12)||(dir<0&&p.x<-.18)){this.back(p);this.tell('漏接了 '+p.name+' 的包裹','bad');}}
  this.spawn-=dt;if(this.spawn<=0){if(this.parcels.length+this.returns.length<12)this.add(undefined,['小桃','今天不加班','白曜','奶茶三分糖','路过的猫','小熊快跑'][Math.floor(Math.random()*6)]);this.spawn=this.spawnSeconds;}
 }
}
if(typeof module!=='undefined'&&module.exports)module.exports={Game};else root.ParcelGame=Game;
})(globalThis);
