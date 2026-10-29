(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReviewThemes=api;})(globalThis,function(){
  'use strict';
  const themes=[
    {id:'glass',name:'简约玻璃',accent:'#86e4c4',background:'#13272d',text:'#f6f8f7',border:'#86e4c4',radius:22,motif:'✦'},
    {id:'cream',name:'奶油手账',accent:'#d99a68',background:'#fff3de',text:'#624737',border:'#d7b998',radius:34,motif:'✿'},
    {id:'neon',name:'霓虹电玩',accent:'#b7ff56',background:'#211438',text:'#f4eeff',border:'#b37aff',radius:3,motif:'⚡'},
    {id:'pixel',name:'暗黑像素',accent:'#ed848e',background:'#1b2024',text:'#e8e5de',border:'#879795',radius:0,motif:'✚'},
    {id:'sakura',name:'樱花来信',accent:'#c85987',background:'#fff0f5',text:'#733e58',border:'#e4a3be',radius:30,motif:'❀'},
    {id:'ocean',name:'深海蓝调',accent:'#78cfff',background:'#112e50',text:'#edf7ff',border:'#639dcc',radius:58,motif:'◇'},
    {id:'sunset',name:'落日橘光',accent:'#ffd08a',background:'#703e39',text:'#fff2e4',border:'#ffba86',radius:8,motif:'☀'},
    {id:'gold',name:'纸感黑金',accent:'#e3c082',background:'#252320',text:'#f7eddc',border:'#bda277',radius:7,motif:'✧'}
  ];
  const artBodies={
    'glass-1':'<path d="M32 3 40 23 60 32 40 41 32 61 24 41 4 32 24 23Z" fill="var(--accent)"/><path d="m32 12 5 16 15 4-15 4-5 16-5-16-15-4 15-4Z" fill="var(--card-text)" opacity=".7"/><path d="M32 12v40M12 32h40" opacity=".5"/>',
    'glass-2':'<circle cx="32" cy="32" r="21" fill="rgba(var(--card-rgb),.7)"/><ellipse cx="32" cy="32" rx="29" ry="10" fill="none" transform="rotate(-28 32 32)"/><circle cx="48" cy="16" r="6" fill="var(--accent)"/><circle cx="24" cy="26" r="5" fill="var(--card-text)" opacity=".55"/>',
    'cream-1':'<circle cx="15" cy="15" r="10" fill="#f4c999"/><circle cx="49" cy="15" r="10" fill="#f4c999"/><path d="M7 34C7 10 57 10 57 34v7C56 59 8 59 7 41Z" fill="#ffe4bf"/><ellipse cx="32" cy="42" rx="13" ry="10" fill="#fff5df" stroke="none"/><g fill="#6f4a31" stroke="none"><circle cx="22" cy="31" r="2.5"/><circle cx="42" cy="31" r="2.5"/><ellipse cx="32" cy="38" rx="4" ry="3"/></g><path d="M32 41v4m-5 0q5 5 10 0" fill="none" stroke="#6f4a31"/><g fill="#edab9c" stroke="none"><ellipse cx="15" cy="39" rx="5" ry="3"/><ellipse cx="49" cy="39" rx="5" ry="3"/></g>',
    'cream-2':'<path d="M29 27Q8 5 6 18v27q10 11 23-9m6-9Q56 5 58 18v27Q48 56 35 36" fill="var(--accent)"/><path d="m27 37-8 22 12-7 6 7 3-22" fill="var(--card-text)"/><rect x="25" y="24" width="14" height="18" rx="5" fill="#ffe7d2"/><path d="m11 24 12 8-12 9m42-17-12 8 12 9" fill="none" opacity=".7"/>',
    'neon-1':'<path d="m35 3-24 34h19l-5 24L55 24H36L43 3Z" fill="var(--accent)"/><path d="m31 18-9 13h18l-4 14" fill="none" stroke="var(--card-text)"/>',
    'neon-2':'<path d="M11 19h42l7 27-8 6-10-10H22L12 52l-8-6Z" fill="rgb(var(--card-rgb))"/><path d="M15 31h14m-7-7v14" stroke="var(--accent)" stroke-width="5"/><g fill="var(--accent)"><circle cx="44" cy="28" r="3"/><circle cx="51" cy="35" r="3"/></g><path d="m28 20 4-9h12" fill="none"/>',
    'pixel-1':'<path d="M16 7h32v7h7v29h-8v14h-9v-8H26v8h-9V43H9V14h7Z" fill="var(--card-text)"/><path d="M17 23h12v13H17zm20 0h12v13H37zm-9 16h9v7h-9z" fill="rgb(var(--card-rgb))" stroke="none"/>',
    'pixel-2':'<path d="M6 12h16v7h20v-7h16v23h-7v8h-8v8H32v8h-1v-8H21v-8h-8v-8H6Z" fill="var(--accent)"/><path d="M13 19h8v8h-8z" fill="var(--card-text)" stroke="none"/>',
    'sakura-1':'<g fill="var(--accent)"><path d="M32 31Q11 21 14 10q12-5 18 15Q37 4 49 9q6 12-11 22Q59 23 61 36q-5 12-23 1Q48 57 35 61q-13-2-6-23Q9 50 3 38q0-13 22-7Z"/></g><circle cx="32" cy="32" r="7" fill="#ffdf86" stroke="none"/><path d="m32 17 0 8m13 4-7 1m0 10 4 7m-18-6-5 4m1-16 7 1" stroke="var(--card-text)" stroke-width="1.4"/>',
    'sakura-2':'<rect x="5" y="14" width="54" height="40" rx="4" fill="var(--card-text)"/><path d="m7 16 25 20 25-20M7 52l20-18m30 18L38 34" fill="none" stroke="var(--accent)"/><path d="M32 43c-17-9-11-20 0-12 11-8 17 3 0 12" fill="var(--accent)" stroke="none"/>',
    'ocean-1':'<circle cx="32" cy="11" r="7" fill="none"/><path d="M32 18v40M18 26h28M8 39q0 17 24 19 24-2 24-19M5 47l3-10 10 4m28 0 10-4 3 10" fill="none" stroke="var(--accent)" stroke-width="5"/>',
    'ocean-2':'<path d="M28 56 6 34Q0 15 16 15 20 0 32 8 45 0 49 15 64 15 58 34L37 56Z" fill="var(--accent)"/><path d="m32 51-16-30m16 30V13m0 38 17-30m-17 30L8 32m24 19 25-19" fill="none" stroke="rgb(var(--card-rgb))" stroke-width="1.5"/><path d="M24 54h16v7H24Z" fill="var(--card-text)"/>',
    'sunset-1':'<circle cx="32" cy="32" r="15" fill="var(--accent)"/><path d="M32 3v8m0 42v8M3 32h8m42 0h8M11 11l6 6m30 30 6 6m0-42-6 6M17 47l-6 6M21 5l3 8m16 38 3 8M5 21l8 3m38 16 8 3M43 5l-3 8M24 51l-3 8M5 43l8-3m38-16 8-3" fill="none" stroke="var(--accent)" stroke-width="3"/>',
    'sunset-2':'<path d="M3 51 24 16 39 36l9-13 13 28Z" fill="var(--accent)"/><path d="m15 32 9-16 10 15-10-4Zm27 0 6-9 6 10-6-3Z" fill="var(--card-text)" stroke="none"/><path d="M4 58h56" stroke="var(--card-text)"/>',
    'gold-1':'<path d="M27 58Q1 42 17 9m20 49Q63 42 47 9" fill="none"/><g fill="var(--accent)"><ellipse cx="15" cy="17" rx="5" ry="9" transform="rotate(-30 15 17)"/><ellipse cx="10" cy="31" rx="5" ry="9" transform="rotate(-50 10 31)"/><ellipse cx="16" cy="45" rx="5" ry="9" transform="rotate(-55 16 45)"/><ellipse cx="49" cy="17" rx="5" ry="9" transform="rotate(30 49 17)"/><ellipse cx="54" cy="31" rx="5" ry="9" transform="rotate(50 54 31)"/><ellipse cx="48" cy="45" rx="5" ry="9" transform="rotate(55 48 45)"/></g><path d="m32 16 4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1Z" fill="var(--card-text)"/>',
    'gold-2':'<path d="m32 3 8 5 10 0 4 9 7 7-3 10 1 10-9 5-6 9-11-1-10 4-7-8-10-4 0-10-4-9 6-8 3-10 11-1Z" fill="var(--accent)"/><circle cx="32" cy="32" r="19" fill="rgb(var(--card-rgb))"/><circle cx="32" cy="32" r="15" fill="none"/><path d="m32 20 3 8 9 1-7 6 2 9-7-5-7 5 2-9-7-6 9-1Z" fill="var(--accent)" stroke="none"/>'
  };
  const artNames={'glass-1':'水晶星芒','glass-2':'星环','cream-1':'奶油小熊','cream-2':'蝴蝶结','neon-1':'能量闪电','neon-2':'电玩手柄','pixel-1':'像素骷髅','pixel-2':'像素爱心','sakura-1':'樱花','sakura-2':'情书信封','ocean-1':'船锚','ocean-2':'贝壳','sunset-1':'复古太阳','sunset-2':'落日山峰','gold-1':'月桂徽章','gold-2':'火漆印章'};
  function ornament(id){if(!Object.prototype.hasOwnProperty.call(artBodies,id))return '';return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;width:100%;height:100%;overflow:visible"><g stroke="var(--card-border)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+artBodies[id]+'</g></svg>';}
  function ornamentName(id){return artNames[id]||'主题装饰';}
  const clone=v=>JSON.parse(JSON.stringify(v));
  function defaults(){
    const template=(t,type)=>[{id:t.id+'-'+type+'-1',kind:'builtin',value:t.id+'-1',edge:'top',position:91,width:type==='current'?46:30,rotation:12,z:2,hidden:false},{id:t.id+'-'+type+'-2',kind:'builtin',value:t.id+'-2',edge:'left',position:87,width:type==='current'?32:24,rotation:-12,z:2,hidden:false}];
    return Object.fromEntries(themes.map(t=>[t.id,{accent:t.accent,background:t.background,text:t.text,border:t.border,opacity:88,decorations:{current:template(t,'current'),waiting:template(t,'waiting')}}]));
  }
  function settings(){return {theme:'glass',title:'锐评候场室',reviewingLabel:'正在评价',layout:'vertical',width:380,gap:12,visible:5,x:8,y:8,scale:1,menuFont:18,showEmpty:true,showSource:false,motion:'system',skins:defaults()};}
  const color=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
  const safeImage=v=>typeof v==='string'&&((/^https?:\/\//i.test(v)&&v.length<=4096)||(/^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(v)&&v.length<=3000000));
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const edges=['top','right','bottom','left'];
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function clampStagePosition({x,y,width,height,canvasWidth,canvasHeight}){
    if(![x,y,width,height,canvasWidth,canvasHeight].every(Number.isFinite)||width<0||height<0||canvasWidth<=0||canvasHeight<=0)throw Error('整组位置或画布尺寸无效');
    const bound=(size,canvas)=>size>=canvas?0:Math.min(90,(canvas-size)/canvas*100);
    return {x:clamp(x,0,bound(width,canvasWidth)),y:clamp(y,0,bound(height,canvasHeight))};
  }
  function resizeStageScale({startScale,width,height,dx,dy}){
    if(![startScale,width,height,dx,dy].every(Number.isFinite)||startScale<.5||startScale>2.5||width<=0||height<=0)throw Error('整组缩放参数无效');
    // Project physical pointer movement onto the unscaled stage diagonal.
    // Normalize dimensions before multiplying so large finite sizes stay safe.
    const magnitude=Math.max(width,height),w=width/magnitude,h=height/magnitude;
    const delta=((dx*w/2+dy*h/2)/magnitude)*(2/(w*w+h*h));
    return Math.round((clamp(startScale+delta,.5,2.5)+Number.EPSILON)*100)/100;
  }
  function geometry(width,height,radius,border){
    if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||!Number.isFinite(radius)||radius<0||!Number.isFinite(border)||border<0||border>Math.min(width,height))throw Error('卡片边框尺寸无效');
    const inset=border/2;
    const start=Math.max(inset,Math.min(radius,Math.min(width,height)/2));
    return {inset,start,width,height};
  }
  // Coordinates are local to the border box. Percentages increase left-to-right
  // on top/bottom, and top-to-bottom on left/right, between rounded tangencies.
  function edgePoint(edge,position,width,height,radius=0,border=1){
    if(!edges.includes(edge)||!Number.isFinite(position)||position<0||position>100)throw Error('挂件边缘位置无效');
    const g=geometry(width,height,radius,border);
    if(edge==='top'||edge==='bottom')return {x:g.start+(width-2*g.start)*(position/100),y:edge==='top'?g.inset:height-g.inset};
    return {x:edge==='left'?g.inset:width-g.inset,y:g.start+(height-2*g.start)*(position/100)};
  }
  function snapEdge(x,y,width,height,radius=0,border=1){
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('拖动位置无效');
    const g=geometry(width,height,radius,border);
    let nearest=null;
    for(const edge of edges){
      const horizontal=edge==='top'||edge==='bottom';
      const span=(horizontal?width:height)-2*g.start;
      const coordinate=clamp(horizontal?x:y,g.start,(horizontal?width:height)-g.start);
      const position=span>0?clamp((coordinate-g.start)/span*100,0,100):50;
      const point=edgePoint(edge,position,width,height,radius,border);
      const distance=Math.hypot(x-point.x,y-point.y);
      if(nearest===null||distance<nearest.distance)nearest={edge,position,distance};
    }
    return {edge:nearest.edge,position:nearest.position};
  }
  function decorationList(raw,legacy=false){
    if(!Array.isArray(raw)||raw.length>24)throw Error('每种卡片模板最多 24 个挂件');
    const ids=new Set();
    return raw.map(a=>{
      if(!record(a)||typeof a.id!=='string'||!a.id.trim()||a.id.length>100||ids.has(a.id))throw Error('挂件编号无效');ids.add(a.id);
      if(!['text','image','builtin'].includes(a.kind)||(a.kind==='builtin'&&!Object.prototype.hasOwnProperty.call(artBodies,a.value))||(a.kind==='image'&&!safeImage(a.value))||(a.kind==='text'&&(typeof a.value!=='string'||a.value.length>12)))throw Error('挂件内容无效');
      for(const [k,min,max]of [['width',16,400],['rotation',-180,180],['z',0,9]])if(!Number.isFinite(a[k])||a[k]<min||a[k]>max)throw Error('挂件大小、旋转或层级无效');
      if(typeof a.hidden!=='boolean')throw Error('挂件显示设置须为布尔值');
      let anchor;
      if(legacy){
        if(!Number.isFinite(a.x)||a.x< -20||a.x>120||!Number.isFinite(a.y)||a.y< -20||a.y>120)throw Error('旧版挂件位置无效');
        anchor=snapEdge(a.x,a.y,100,100,0,0);
      }else{
        if(!edges.includes(a.edge)||!Number.isFinite(a.position)||a.position<0||a.position>100)throw Error('挂件须位于卡片边框');
        anchor={edge:a.edge,position:a.position};
      }
      const out={id:a.id,kind:a.kind,value:a.value,...anchor,width:a.width,rotation:a.rotation,z:a.z,hidden:a.hidden};
      if(a.name!==undefined){if(typeof a.name!=='string'||a.name.length>100)throw Error('挂件名称无效');out.name=a.name;}
      return out;
    });
  }
  function validate(raw){
    if(!raw||typeof raw!=='object'||!themes.some(t=>t.id===raw.theme))throw Error('主题设置无效');
    const s=settings();s.theme=raw.theme;
    if(raw.scale!==undefined){if(!Number.isFinite(raw.scale)||raw.scale<.5||raw.scale>2.5)throw Error('整组缩放须在 0.5–2.5 倍');s.scale=raw.scale;}
    if(raw.menuFont!==undefined){if(!Number.isInteger(raw.menuFont)||raw.menuFont<16||raw.menuFont>28)throw Error('菜单字号须为 16–28 的整数');s.menuFont=raw.menuFont;}
    if(raw.reviewingLabel!==undefined){if(typeof raw.reviewingLabel!=='string'||!raw.reviewingLabel.trim()||raw.reviewingLabel.length>20)throw Error('评价状态文字须为 1–20 个字符');s.reviewingLabel=raw.reviewingLabel.trim();}
    const nums={width:[240,760],gap:[0,40],visible:[1,20],x:[0,90],y:[0,90]};
    for(const [k,[min,max]]of Object.entries(nums)){if(!Number.isFinite(raw[k])||raw[k]<min||raw[k]>max)throw Error('布局数值无效：'+k);s[k]=raw[k];}
    if(!['vertical','horizontal'].includes(raw.layout)||!['on','system','off'].includes(raw.motion))throw Error('布局或动画设置无效');
    s.layout=raw.layout;s.motion=raw.motion;s.title=String(raw.title||'').slice(0,40);s.showEmpty=raw.showEmpty!==false;s.showSource=raw.showSource===true;
    for(const t of themes){const skin=raw.skins&&raw.skins[t.id];if(!skin)throw Error('缺少主题配置');
      for(const k of ['accent','background','text','border']){if(!color(skin[k]))throw Error('主题颜色无效');s.skins[t.id][k]=skin[k];}
      if(!Number.isFinite(skin.opacity)||skin.opacity<0||skin.opacity>100)throw Error('不透明度须在 0–100%');s.skins[t.id].opacity=skin.opacity;
      if(Object.prototype.hasOwnProperty.call(skin,'decorations')){
        if(!record(skin.decorations))throw Error('卡片挂件模板格式无效');
        s.skins[t.id].decorations={current:decorationList(skin.decorations.current),waiting:decorationList(skin.decorations.waiting)};
      }else{
        const migrated=decorationList(skin.stickers,true);
        s.skins[t.id].decorations={current:migrated,waiting:clone(migrated)};
      }
      for(const kind of ['current','waiting'])for(const a of s.skins[t.id].decorations[kind]){const match=a.id.match(new RegExp('^'+t.id+'(?:-current|-waiting)?-([12])$'));if(match&&a.kind==='text'&&a.value===t.motif){a.kind='builtin';a.value=t.id+'-'+match[1];}}
    }return s;
  }
  return {themes,defaults,settings,validate,color,safeImage,clone,ornament,ornamentName,edgePoint,snapEdge,clampStagePosition,resizeStageScale};
});
