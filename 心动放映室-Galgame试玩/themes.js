(()=>{
 'use strict';
 const themes={
  night:{name:'夜樱心约',skin:'dialogue-skin.png',surface:'M28 1H732L759 33 732 65H28L1 33Z',trim:'M31 6H729L750 33 729 60H31L10 33Z'},
  sky:{name:'晴空来信',skin:'theme-sky.png',surface:'M11 1H749Q759 1 759 11V55Q759 65 749 65H11Q1 65 1 55V11Q1 1 11 1Z',trim:'M14 6H746Q753 6 753 13V53Q753 60 746 60H14Q7 60 7 53V13Q7 6 14 6Z'},
  candy:{name:'糖心物语',skin:'theme-candy.png',surface:'M33 1H727A32 32 0 0 1 727 65H33A32 32 0 0 1 33 1Z',trim:'M34 6H726A27 27 0 0 1 726 60H34A27 27 0 0 1 34 6Z'},
  washi:{name:'墨染花札',skin:'theme-washi.png',surface:'M13 1H747V9H759V57H747V65H13V57H1V9H13Z',trim:'M18 6H742V14H753V52H742V60H18V52H7V14H18Z'},
  orbit:{name:'星轨终端',skin:'theme-orbit.png',surface:'M1 1H733L759 27V65H27L1 39Z',trim:'M7 6H730L753 29V60H30L7 37Z'}
 };
 const storageKey='galgame-heart-room:theme:v1';
 const buttons=Array.from(document.querySelectorAll('[data-set-theme]'));
 const status=document.getElementById('themeStatus');
 const skin=document.getElementById('dialogueSkin');
 const output=document.querySelector('.output-link');
 const choices=document.getElementById('choices');
 const cachedImages=new Map();
 let active='night',requestId=0;
 const valid=id=>typeof id==='string'&&Object.hasOwn(themes,id);
 function syncChoiceShapes(){
  const theme=themes[active];
  choices.querySelectorAll('.choice-frame').forEach(frame=>{
   frame.querySelector('.surface').setAttribute('d',theme.surface);
   frame.querySelector('.trim').setAttribute('d',theme.trim);
  });
 }
 function loadSkin(id){
  if(cachedImages.has(id))return cachedImages.get(id);
  const pending=new Promise((resolve,reject)=>{
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(new Error('Theme asset did not load: '+id));
   img.src=themes[id].skin;
  });
  cachedImages.set(id,pending);
  pending.catch(()=>cachedImages.delete(id));
  return pending;
 }
 function save(id){
  try{localStorage.setItem(storageKey,id);}catch{}
  try{const url=new URL(location.href);url.searchParams.set('theme',id);history.replaceState(null,'',url.href);}catch{}
 }
 function syncControls(){
  buttons.forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.setTheme===active));
   button.removeAttribute('aria-busy');
  });
  output.href='index.html?theme='+encodeURIComponent(active);
  output.title='打开「'+themes[active].name+'」透明输出';
 }
 async function selectTheme(id,{persist=true,announce=true}={}){
  if(!valid(id))return;
  const ticket=++requestId;
  buttons.forEach(button=>{if(button.dataset.setTheme===id)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');});
  try{
   const image=await loadSkin(id);
   if(ticket!==requestId)return;
   active=id;
   skin.src=image.src;
   document.body.dataset.theme=id;
   syncChoiceShapes();
   syncControls();
   if(persist)save(id);
   if(announce)status.textContent='已切换为'+themes[id].name+'，当前剧情保持不变。';
  }catch{
   if(ticket!==requestId)return;
   syncControls();
   status.textContent='主题素材未能加载，请保留文件夹内的完整主题图片后重试。';
  }
 }
 buttons.forEach(button=>button.addEventListener('click',()=>{void selectTheme(button.dataset.setTheme);}));
 const observer=new MutationObserver(syncChoiceShapes);
 observer.observe(choices,{childList:true});
 let saved='night';
 try{const value=localStorage.getItem(storageKey);if(valid(value))saved=value;}catch{}
 const requested=new URLSearchParams(location.search).get('theme');
 const initial=valid(requested)?requested:saved;
 void selectTheme(initial,{persist:false,announce:false});
 // Five bounded local assets; no remote requests, timers, gameplay hooks, or event queues.
 for(const id of Object.keys(themes))void loadSkin(id).catch(()=>{});
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 window.addEventListener('pageshow',event=>{if(event.persisted){observer.observe(choices,{childList:true});syncChoiceShapes();}});
})();
