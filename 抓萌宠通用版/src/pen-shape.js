(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PetPenShape=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function fromPixels(data,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4)throw new Error('Invalid alpha raster');
  const bits=new Uint8Array(width*height),rectangles=[];let previous=new Map();
  for(let y=0;y<height;y++){
   const current=new Map();let x=0;
   while(x<width){if(data[(y*width+x)*4+3]<32){x++;continue;}const start=x;while(x<width&&data[(y*width+x)*4+3]>=32){bits[y*width+x]=1;x++;}
    const key=start+':'+x;let r=previous.get(key);if(r)r.height++;else{r={x:start,y,width:x-start,height:1};rectangles.push(r);}current.set(key,r);
   }previous=current;
  }
  const n=v=>Number(v.toFixed(7));
  const path=rectangles.map(r=>`M${n(r.x/width)} ${n(r.y/height)}h${n(r.width/width)}v${n(r.height/height)}h-${n(r.width/width)}Z`).join('');
  return{width,height,bits,rectangles,path};
 }
 function contains(mask,u,v){return !!(mask&&Number.isFinite(u)&&Number.isFinite(v)&&u>=0&&v>=0&&u<1&&v<1&&mask.bits[Math.floor(v*mask.height)*mask.width+Math.floor(u*mask.width)]);}
 function hit(mask,x,y,rect,width,height,matrix={a:1,b:0,c:0,d:1}){
  const{a,b,c,d}=matrix,det=a*d-b*c;if(!mask||!det||!width||!height)return false;
  const dx=x-rect.left-rect.width/2,dy=y-rect.top-rect.height/2;
  return contains(mask,((d*dx-c*dy)/det+width/2)/width,((-b*dx+a*dy)/det+height/2)/height);
 }
 let sequence=0;
 class HitRegion{
  constructor(image,pen,onWarning=()=>{},reduced=()=>false){
   this.image=image;this.pen=pen;this.onWarning=onWarning;this.reduced=reduced;this.mask=null;this.source='';this.warned='';this.generation=0;this.animation=null;this.raf=0;this.imageVisibility=image.style.visibility;
   const ns='http://www.w3.org/2000/svg',id='pen-alpha-clip-'+(++sequence),svg=document.createElementNS(ns,'svg'),defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath');
   svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;width:0;height:0;pointer-events:none';clip.id=id;clip.setAttribute('clipPathUnits','objectBoundingBox');this.path=document.createElementNS(ns,'path');clip.append(this.path);defs.append(clip);svg.append(defs);pen.append(svg);
   this.target=document.createElement('div');this.target.id='pen-hit';this.target.setAttribute('aria-hidden','true');this.target.style.clipPath='url(#'+id+')';pen.append(this.target);
   this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});
   this.displayCanvas=document.createElement('canvas');this.displayCanvas.className='pen-frame';this.displayCanvas.hidden=true;this.displayCanvas.setAttribute('aria-hidden','true');pen.insertBefore(this.displayCanvas,image.nextSibling);this.displayCtx=this.displayCanvas.getContext('2d');
   image.addEventListener('load',()=>this.refresh());image.addEventListener('error',()=>this.invalidate());
   this.observer=new MutationObserver(()=>{this.invalidate();if(image.complete&&image.naturalWidth)this.refresh();});this.observer.observe(image,{attributes:true,attributeFilter:['src']});
   pen.addEventListener('pointerenter',()=>{clearTimeout(this.leaveTimer);pen.classList.add('shape-controls');});
   pen.addEventListener('pointerleave',()=>{this.leaveTimer=setTimeout(()=>pen.classList.remove('shape-controls'),700);});
   if(image.complete&&image.naturalWidth)this.refresh();
  }
  invalidate(){this.generation++;cancelAnimationFrame(this.raf);this.raf=0;this.animation=null;this.frameData=null;this.mask=null;this.source='';this.path.setAttribute('d','');this.target.style.pointerEvents='none';this.displayCanvas.hidden=true;this.image.style.visibility=this.imageVisibility;}
  paintMask(source,width,height){
   const scale=Math.min(1,256/Math.max(width,height));this.canvas.width=Math.max(1,Math.round(width*scale));this.canvas.height=Math.max(1,Math.round(height*scale));
   this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.ctx.drawImage(source,0,0,this.canvas.width,this.canvas.height);
   const mask=fromPixels(this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data,this.canvas.width,this.canvas.height);
   this.mask=mask;this.path.setAttribute('d',mask.path);this.target.style.pointerEvents=mask.path?'auto':'none';
  }
  showCanvas(){this.displayCanvas.hidden=false;this.image.style.visibility='hidden';}
  paintFrame(index){
   if(index===this.frameIndex)return;
   const{width,height,frames}=this.animation;this.frameData??=this.displayCtx.createImageData(width,height);this.frameData.data.set(frames[index].pixels);this.displayCtx.putImageData(this.frameData,0,0);
   this.paintMask(this.displayCanvas,width,height);this.frameIndex=index;this.showCanvas();
  }
  syncMotion(){
   if(!this.animation)return;const reduced=!!this.reduced();if(reduced===this.motionReduced)return;
   this.motionReduced=reduced;cancelAnimationFrame(this.raf);this.raf=0;this.paintFrame(0);
   if(reduced||this.animation.frames.length<2)return;
   this.started=performance.now();const generation=this.generation;
   const step=now=>{
    this.raf=0;if(generation!==this.generation||!this.animation)return;
    if(!!this.reduced()!==this.motionReduced){this.syncMotion();return;}
    const elapsed=Math.max(0,now-this.started),{frames,repetitionCount,total}=this.animation;
    const finished=Number.isFinite(repetitionCount)&&elapsed>=total*(repetitionCount+1);let index=frames.length-1;
    if(!finished){let time=elapsed%total;index=0;while(index<frames.length-1&&time>=frames[index].durationMs){time-=frames[index].durationMs;index++;}}
    this.paintFrame(index);if(!finished)this.raf=requestAnimationFrame(step);
   };
   this.raf=requestAnimationFrame(step);
  }
  async refresh(){
   this.invalidate();const generation=this.generation,img=this.image,src=img.currentSrc||img.src;if(!img.complete||!img.naturalWidth)return;
   const current=()=>generation===this.generation&&src===(img.currentSrc||img.src);
   try{
    this.source=src;
    if(!/^data:image\/gif[;,]/i.test(src)){this.paintMask(img,img.naturalWidth,img.naturalHeight);return;}
    // Freeze the browser's first frame while decoding; it is also the failure fallback.
    this.displayCanvas.width=img.naturalWidth;this.displayCanvas.height=img.naturalHeight;this.displayCtx.clearRect(0,0,img.naturalWidth,img.naturalHeight);this.displayCtx.drawImage(img,0,0);this.paintMask(this.displayCanvas,img.naturalWidth,img.naturalHeight);this.showCanvas();
    try{
     const encoded=/^data:image\/gif;base64,([a-z0-9+/=\s]+)$/i.exec(src);if(!encoded)throw Error('Invalid GIF data URL');
     const binary=atob(encoded[1]),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));const decoded=await SealGifDecode.decode(bytes);if(!current())return;
     const{width,height,frames,repetitionCount}=decoded;
     if(!Number.isInteger(width)||width<1||width>2048||!Number.isInteger(height)||height<1||height>2048||!Array.isArray(frames)||!frames.length||frames.length>24||width*height*frames.length>25000000)throw Error('Invalid GIF frames');
     for(const frame of frames)if(frame.pixels?.length!==width*height*4||!Number.isFinite(frame.durationMs)||frame.durationMs<=0)throw Error('Invalid GIF frame');
     if(repetitionCount!==Infinity&&(!Number.isInteger(repetitionCount)||repetitionCount<0))throw Error('Invalid GIF repetition count');
     this.displayCanvas.width=width;this.displayCanvas.height=height;this.animation={width,height,frames,repetitionCount,total:frames.reduce((sum,frame)=>sum+frame.durationMs,0)};this.frameIndex=-1;this.motionReduced=null;this.syncMotion();
    }catch(error){if(current()&&this.warned!==src){this.warned=src;this.onWarning('小窝 GIF 动画未能解码，已改为静态首帧，点击轮廓与显示一致；原图片记录保留。动画支持 1–24 帧、单边不超过 2048 像素、总帧像素不超过 2500 万。');}}
   }catch(error){if(current()){this.invalidate();if(this.warned!==src){this.warned=src;this.onWarning('小窝轮廓读取失败，请重新选择小窝图片');}}}
  }
  contains(x,y){
   if(this.source!==(this.image.currentSrc||this.image.src))return false;
   const style=getComputedStyle(this.pen),matrix=style.transform==='none'?undefined:new DOMMatrixReadOnly(style.transform);
   return hit(this.mask,x,y,this.image.getBoundingClientRect(),this.image.clientWidth,this.image.clientHeight,matrix);
  }
 }
 return{fromPixels,contains,hit,HitRegion};
});
