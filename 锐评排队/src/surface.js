// Keep the transparent iframe in the embedder's used color scheme. A mismatch
// can make Chromium paint an opaque canvas even when CSS backgrounds are clear.
(function(root){
 'use strict';
 const html=document.documentElement;
 let frame=null,host=null,capture=!!root.obsstudio;
 try{frame=root.frameElement;if(frame){host=root.parent;capture=capture||!!host.obsstudio;}}catch(_){frame=null;host=null;}
 function sync(){
  let scheme='normal';
  try{if(frame&&host){const declared=host.getComputedStyle(frame).colorScheme;const dark=/\bdark\b/.test(declared),light=/\blight\b/.test(declared);scheme=dark&&(!light||host.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':light?'light':'normal';}}catch(_){}
  html.style.colorScheme=scheme;
 }
 sync();
 let observer=null,media=null;
 function connect(){
  if(!host||!frame)return;
  observer?.disconnect();observer=new MutationObserver(sync);
  const options={attributes:true,attributeFilter:['style','class','data-theme']};
  observer.observe(frame,options);observer.observe(host.document.documentElement,options);if(host.document.body)observer.observe(host.document.body,options);
  media=host.matchMedia('(prefers-color-scheme: dark)');media.addEventListener?.('change',sync);
 }
 try{connect();}catch(_){}
 root.addEventListener('load',sync);
 root.addEventListener('pagehide',()=>{observer?.disconnect();media?.removeEventListener?.('change',sync);});
 root.addEventListener('pageshow',e=>{if(e.persisted){sync();try{connect();}catch(_){}}});
 root.ReviewSurface=Object.freeze({capture,sync});
})(window);
