(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PetCanvas=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 // Above ~1000 pets the per-pet <button> layers (style, compositing, commit) cost 24–44 ms a frame. Pets whose
 // bitmaps are baked are drawn into this one canvas at the pets' z-index instead; their buttons stay in the DOM,
 // hidden, and are shown again whenever a pet needs real DOM (held, flying home or into the tornado, art not baked).
 // Geometry follows the CSS: .calf translate+rotate about 50% 85%, then the image's scale about 50% 91%.
 const ROTATE_ORIGIN=.85,BODY_ORIGIN=.91,FILTER_BUDGET=96,AVATAR_BAKES_PER_FRAME=2;
 // v2.css gives pet images drop-shadow(0 5px 3px #9d789530): a Gaussian of deviation 3px moved 5px down, so beyond
 // 9px (3 deviations, under 0.3% of its 19% alpha) nothing shows. Pads are the CSS px it can reach around the box.
 const SHADOW=Object.freeze({dx:0,dy:5,blur:3,color:'#9d789530'}),PAD=Object.freeze({x:9,t:5,b:14}),AVATAR_PAD=Object.freeze({x:24,t:20,b:34});

 // [a,b,c,d,e,f] for the pet image: .calf translate(tx,ty) rotate(rot) about (50%,85%), image scale(sx,sy) about (50%,oy).
 function matrix(size,tx,ty,rot,sx,sy,oy=BODY_ORIGIN,out=[0,0,0,0,0,0],originX=.5){
  const r=rot*Math.PI/180,cos=rot?Math.cos(r):1,sin=rot?Math.sin(r):0,ox=size/2,ry=size*ROTATE_ORIGIN,ix=size*originX,iy=size*oy;
  const eo=tx+ox-(cos*ox-sin*ry),fo=ty+ry-(sin*ox+cos*ry),ei=ix-sx*ix,fi=iy-sy*iy;
  out[0]=cos*sx;out[1]=sin*sx;out[2]=-sin*sy;out[3]=cos*sy;out[4]=cos*ei-sin*fi+eo;out[5]=sin*ei+cos*fi+fo;
  return out;
 }
 // The <button> hit area: its border box (border-radius 50%) after the .calf transform.
 function hitCircle(size,tx,ty,rot){
  const r=rot*Math.PI/180,dy=size/2-size*ROTATE_ORIGIN;
  return{x:tx+size/2-Math.sin(r)*dy,y:ty+size*ROTATE_ORIGIN+Math.cos(r)*dy,r:size/2};
 }

 function cubicBezier(x1,y1,x2,y2){
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const fx=t=>((ax*t+bx)*t+cx)*t,fy=t=>((ay*t+by)*t+cy)*t,slope=t=>(3*ax*t+2*bx)*t+cx;
  return x=>{
   if(x<=0)return 0;if(x>=1)return 1;
   let t=x;for(let i=0;i<8;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)return fy(t);const d=slope(t);if(Math.abs(d)<1e-6)break;t-=e/d;}
   let lo=0,hi=1;t=x;for(let i=0;i<40&&hi-lo>1e-7;i++){if(fx(t)<x)lo=t;else hi=t;t=(lo+hi)/2;}
   return fy(t);
  };
 }
 const EASE_OUT=cubicBezier(0,0,.58,1),REVEAL=cubicBezier(.18,.82,.3,1.22);
 // Keyframes of the DOM effects: effects.css fx-gift-glow, ball-mode.css seal-reveal, aquarium.css aquatic-*.
 // "group" effects animate the whole .calf (body, accessory, bubble); the reveal animates only the body image.
 // Fading to transparent keeps the hue, as CSS interpolates colours premultiplied.
 const EFFECTS={
  'gift-arrival':{ms:1100,ease:EASE_OUT,group:true,keys:[[0,{alpha:.4,blur:22,color:[255,216,146,1],bright:1.6}],[.35,{alpha:1,blur:15,color:[255,216,146,1],bright:1}],[1,{alpha:1,blur:0,color:[255,216,146,0],bright:1}]]},
  'seal-ball-reveal':{ms:620,ease:REVEAL,group:false,brightFirst:true,origin:.84,keys:[[0,{alpha:0,scale:.2,bright:2,blur:18,color:[255,255,255,1]}],[.45,{alpha:1,scale:1.22,bright:1.5,blur:18,color:[247,224,255,1]}],[1,{alpha:1,scale:1,bright:1,blur:0,color:[247,224,255,0]}]]},
  'aquatic-arrival':{ms:700,ease:EASE_OUT,group:true,keys:[[0,{alpha:0,blur:6,color:[183,238,242,1]}],[1,{alpha:1,blur:0,color:[183,238,242,0]}]],
   ring:{ms:700,ease:EASE_OUT,inset:.1,color:'#a4e2e8',keys:[[0,{alpha:.8,scale:.75}],[1,{alpha:0,scale:1.15}]]}},
 };
 const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
 function keyframes(keys,t,ease){
  let i=0;while(i<keys.length-2&&t>=keys[i+1][0])i++;
  const [a,from]=keys[i],[b,to]=keys[i+1],e=ease(b>a?(t-a)/(b-a):1),out={};
  for(const k in from){const x=from[k],y=to[k];out[k]=Array.isArray(x)?x.map((n,j)=>n+(y[j]-n)*e):x+(y-x)*e;}
  return out;
 }
 function filterOf(v,brightFirst){
  const c=v.color,alpha=c?clamp(c[3],0,1):0,blur=Math.max(0,v.blur||0);
  const glow=blur>.05&&alpha>.004?'drop-shadow(0px 0px '+blur.toFixed(2)+'px rgba('+c.slice(0,3).map(n=>Math.round(clamp(n,0,255))).join(',')+','+alpha.toFixed(3)+'))':'';
  const bright=v.bright!==undefined&&Math.abs(v.bright-1)>.002?'brightness('+Math.max(0,v.bright).toFixed(3)+')':'';
  return(brightFirst?[bright,glow]:[glow,bright]).filter(Boolean).join(' ');
 }
 // c.fx = {name,start} on the performance.now() clock; null once the effect has played out. An effect started during
 // the frame being drawn has a start later than the frame time: it shows its first keyframe, as the CSS animation would.
 function effectAt(fx,now){
  const def=fx&&EFFECTS[fx.name];if(!def)return null;
  const elapsed=Math.max(0,now-fx.start),t=elapsed/def.ms;if(!(t>=0)||t>=1)return null;
  const v=keyframes(def.keys,t,def.ease),out={group:def.group,alpha:clamp(v.alpha??1,0,1),scale:v.scale??1,origin:def.origin??BODY_ORIGIN,filter:filterOf(v,def.brightFirst),ring:null};
  if(def.ring){const rt=elapsed/def.ring.ms;if(rt<1){const r=keyframes(def.ring.keys,rt,def.ring.ease);out.ring={alpha:clamp(r.alpha,0,1),scale:r.scale,inset:def.ring.inset,color:def.ring.color};}}
  return out;
 }

 // GIF uploads stay animated <img> pets (a canvas only draws the first frame); APNG and animated WebP likewise.
 function animatedData(src){
  if(typeof src!=='string'||!src.startsWith('data:image/'))return false;
  if(/^data:image\/gif[;,]/i.test(src))return true;
  const comma=src.indexOf(',');if(comma<0||!/;base64$/i.test(src.slice(0,comma)))return false;
  const b64=src.slice(comma+1,comma+1+8192).replace(/[^A-Za-z0-9+/]/g,'');
  let bytes;try{bytes=atob(b64.slice(0,b64.length-b64.length%4));}catch{return false;}
  if(/^data:image\/png/i.test(src)){for(let at=8;at+8<=bytes.length;){const len=((bytes.charCodeAt(at)<<24)|(bytes.charCodeAt(at+1)<<16)|(bytes.charCodeAt(at+2)<<8)|bytes.charCodeAt(at+3))>>>0,type=bytes.slice(at+4,at+8);if(type==='acTL')return true;if(type==='IDAT'||type==='IEND')return false;at+=12+len;}return false;}
  if(/^data:image\/webp/i.test(src))return bytes.slice(12,16)==='VP8X'&&(bytes.charCodeAt(20)&2)===2;
  return false;
 }

 function bakeShadow(ctx,k,shadow=SHADOW){
  const css='drop-shadow('+shadow.dx*k+'px '+shadow.dy*k+'px '+shadow.blur*k+'px '+shadow.color+')';
  if('filter' in ctx){ctx.filter=css;if(ctx.filter&&ctx.filter!=='none')return;}
  // Canvas shadowBlur is twice the Gaussian deviation; CSS drop-shadow's blur value is the deviation itself.
  ctx.shadowColor=shadow.color;ctx.shadowOffsetX=shadow.dx*k;ctx.shadowOffsetY=shadow.dy*k;ctx.shadowBlur=shadow.blur*k*2;
 }
 // .calf.viewer-avatar>img: cover-fitted photo in a circle, #fff3fa backing, 3px white border and a
 // 0 5px 14px #735b9860 box-shadow, then the drop-shadow every pet image has. box is in bitmap px, drawn at ref CSS px.
 function bakeAvatar(img,box,ref,makeCanvas){
  const k=box/ref,px=Math.ceil(AVATAR_PAD.x*k),pt=Math.ceil(AVATAR_PAD.t*k),pb=Math.ceil(AVATAR_PAD.b*k),cw=box+2*px,ch=box+pt+pb;
  const layer=makeCanvas(cw,ch),lx=layer.getContext('2d'),out=makeCanvas(cw,ch),ctx=out.getContext('2d');
  if(!lx||!ctx)throw Error('no 2d context');
  const r=box/2,x=px+r,y=pt+r,b=3*k,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  if(!(iw>0&&ih>0))throw Error('avatar not decoded');
  lx.save();lx.shadowColor='#735b9860';lx.shadowOffsetY=5*k;lx.shadowBlur=14*k;lx.fillStyle='#fff3fa';lx.beginPath();lx.arc(x,y,r,0,Math.PI*2);lx.fill();lx.restore();
  const inner=box-2*b,cover=Math.max(inner/iw,inner/ih),dw=iw*cover,dh=ih*cover;
  lx.save();lx.beginPath();lx.arc(x,y,r-b,0,Math.PI*2);lx.clip();lx.imageSmoothingQuality='high';lx.drawImage(img,x-dw/2,y-dh/2,dw,dh);lx.restore();
  lx.beginPath();lx.arc(x,y,r-b/2,0,Math.PI*2);lx.lineWidth=b;lx.strokeStyle='#fff';lx.stroke();
  bakeShadow(ctx,k);ctx.drawImage(layer,0,0);
  return{bitmap:out,frames:1,cols:1,cw,ch,w:box,h:box,px,pt};
 }

 // atlas: {bitmap,cols,cw,ch,w,h,px,pt}; cell i holds the size x size pet box at (px,pt), w x h bitmap px.
 function drawCell(ctx,atlas,index,size){
  const col=index%atlas.cols,row=(index-col)/atlas.cols,kx=size/atlas.w,ky=size/atlas.h;
  ctx.drawImage(atlas.bitmap,col*atlas.cw,row*atlas.ch,atlas.cw,atlas.ch,-atlas.px*kx,-atlas.pt*ky,atlas.cw*kx,atlas.ch*ky);
 }

 // What both renderers share: the pets drawn last frame (for picking), the pointer/hover state and the avatar bakes.
 class Surface{
  constructor({host,document:doc=root.document,viewport=()=>({w:root.innerWidth||0,h:root.innerHeight||0}),dpr=()=>root.devicePixelRatio||1,onLost=null,onRestored=null,onBroken=null}={}){
   Object.assign(this,{host,doc,viewport,dpr,onLost,onRestored,onBroken});
   this.list=[];this.pointer=null;this.hover=null;this.cursor='';this.lost=false;this.avatars=new Map();this.bakes=0;this.m=[0,0,0,0,0,0];this.canvas=null;
  }
  makeCanvas(w,h){
   if(typeof root.OffscreenCanvas==='function')return new root.OffscreenCanvas(w,h);
   const c=this.doc.createElement('canvas');c.width=w;c.height=h;return c;
  }
  // Full-field canvas at the pets' z-index; it never takes pointer events (pets are picked by hitTest).
  styleCanvas(canvas,className){
   canvas.className=className;canvas.setAttribute?.('aria-hidden','true');
   Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'10'});
   return canvas;
  }
  // Canvas size in device px for the current viewport.
  fit(canvas){
   const view=this.viewport()||{},ratio=this.dpr()||1,w=Math.max(1,Math.round((view.w||0)*ratio)),h=Math.max(1,Math.round((view.h||0)*ratio));
   if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
   return{w,h,ratio};
  }
  // Baked once per photo and drawn size; at most a couple per frame so a crowd of new viewers does not stall a frame.
  avatar(url,img,box){
   if(!url||!img||!img.complete||!(img.naturalWidth>0)||!box)return null;
   const key=url+'#'+box.px;let a=this.avatars.get(key);if(a)return a;
   if(this.bakes>=AVATAR_BAKES_PER_FRAME)return null;
   this.bakes++;try{a=bakeAvatar(img,box.px,box.ref,(w,h)=>this.makeCanvas(w,h));}catch{return null;}
   a.key=key;this.avatars.set(key,a);return a;
  }
  pruneAvatars(isUsed){for(const key of this.avatars.keys()){let used=true;try{used=isUsed(key)!==false;}catch{}if(!used)this.avatars.delete(key);}}
  setPointer(x,y){this.pointer=Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;}
  // Pets the app put on the canvas, in creation order: the DOM order their buttons had.
  collect(actors){
   const list=[];let sorted=true,last=-Infinity;
   for(const c of actors){if(!c?.onCanvas||c.dead||c.el?.isConnected===false)continue;list.push(c);if(c.id<last)sorted=false;last=c.id;}
   if(!sorted)list.sort((a,b)=>a.id-b.id);
   return list;
  }
  // Buttons are hidden only once their pet has been drawn here, so a pet never vanishes for a frame.
  hideButtons(list){for(const c of list)if(!c.domHidden&&c.el){c.el.classList.add('pet-canvas');c.domHidden=true;}}
  // Topmost pet under (x,y) among the pets drawn last frame, which is what is on screen.
  hitTest(x,y){
   if(!Number.isFinite(x)||!Number.isFinite(y))return null;
   for(let i=this.list.length-1;i>=0;i--){
    const c=this.list[i],s=c.cvState;if(!s||!c.onCanvas||c.dead||c.held||c.ballEmerging||c.windActive)continue;
    const h=hitCircle(c.size,s.tx,s.ty,s.rot);if((x-h.x)*(x-h.x)+(y-h.y)*(y-h.y)<=h.r*h.r)return c;
   }
   return null;
  }
  updateHover(){
   const next=this.pointer?this.hitTest(this.pointer.x,this.pointer.y):null,cursor=next?'grab':'';this.hover=next;
   if(cursor!==this.cursor){this.cursor=cursor;if(this.host?.style)this.host.style.cursor=cursor;}
  }
  broken(atlas,c,error){if(atlas)try{this.onBroken?.(atlas,c,error);}catch{}}
 }

 // Canvas 2D renderer: every pet one drawImage. About 8 µs of GPU-process time per pet in Chromium, so it carries
 // ~1500 pets at 90 fps; it is the fallback without WebGL2 and draws the few pets with CSS-filter effects over it.
 class Layer extends Surface{
  constructor(opts={}){
   super(opts);this.ctx=null;this.curAlpha=1;this.curFilter='';
   const {host,doc}=this;if(!host||typeof doc?.createElement!=='function')return;
   const canvas=doc.createElement('canvas');let ctx=null;try{ctx=canvas.getContext?.('2d');}catch{}
   if(!ctx||typeof ctx.drawImage!=='function'||typeof ctx.setTransform!=='function')return;
   this.styleCanvas(canvas,opts.className||'pet-canvas-layer');
   canvas.addEventListener?.('contextlost',()=>{this.lost=true;this.list.length=0;try{this.onLost?.();}catch{}});
   canvas.addEventListener?.('contextrestored',()=>{this.lost=false;this.avatars.clear();try{this.onRestored?.();}catch{}});
   // QA scripts read pet positions through this (read-only, like the _petFrameClass expandos).
   if(!opts.className)canvas._petLayer=this;
   host.append(canvas);this.canvas=canvas;this.ctx=ctx;
  }
  get active(){return!!this.ctx&&!this.lost;}
  setAlpha(a){if(a!==this.curAlpha){this.ctx.globalAlpha=a;this.curAlpha=a;}}
  setFilter(f){if(f!==this.curFilter){this.ctx.filter=f||'none';this.curFilter=f;}}
  draw(actors,now=0,reduced=false){
   if(!this.ctx)return 0;this.bakes=0;
   const list=this.lost?[]:this.collect(actors);
   this.paint(list,now,reduced);this.list=list;this.hideButtons(list);this.updateHover();
   return list.length;
  }
  // Clears the canvas and draws these pets in order; filtered effects are capped per frame.
  paint(list,now,reduced){
   const ctx=this.ctx;if(!ctx)return;
   const {w,h,ratio}=this.fit(this.canvas);
   ctx.setTransform(1,0,0,1,0,0);this.curAlpha=NaN;this.curFilter=null;this.setAlpha(1);this.setFilter('');ctx.clearRect(0,0,w,h);
   if(this.lost)return;
   let budget=FILTER_BUDGET;
   for(const c of list){if(c.ballEmerging)continue;try{if(this.drawPet(c,now,reduced,ratio,budget>0))budget--;}catch(error){const s=c.cvState;this.broken(s?.body,c,error);if(s?.acc)this.broken(s.acc,c,error);}}
   ctx.setTransform(1,0,0,1,0,0);this.setAlpha(1);this.setFilter('');
  }
  drawPet(c,now,reduced,ratio,allowFilter){
   const s=c.cvState;if(!s||!s.body)return false;
   const fx=!reduced&&c.fx?effectAt(c.fx,now):null,hover=allowFilter&&this.hover===c?'brightness(1.035)':'';
   const bodyFilter=allowFilter&&fx?.filter||hover,accFilter=allowFilter&&fx?.group&&fx.filter||hover;
   const ctx=this.ctx,size=c.size,m=this.m,r=ratio,sc=fx?fx.scale:1;
   matrix(size,s.tx,s.ty,s.rot,s.sx*sc,s.sy*sc,s.originY??(fx?fx.origin:BODY_ORIGIN),m,s.originX??.5);
   this.setAlpha(fx?fx.alpha:1);this.setFilter(bodyFilter);
   ctx.setTransform(m[0]*r,m[1]*r,m[2]*r,m[3]*r,m[4]*r,m[5]*r);drawCell(ctx,s.body,s.bodyIndex||0,size);
   const ring=fx?.ring;
   if(ring&&ring.alpha>0){
    matrix(size,s.tx,s.ty,s.rot,1,1,BODY_ORIGIN,m);ctx.setTransform(m[0]*r,m[1]*r,m[2]*r,m[3]*r,m[4]*r,m[5]*r);
    this.setFilter('');this.setAlpha(clamp((fx.group?fx.alpha:1)*ring.alpha,0,1));
    ctx.beginPath();ctx.arc(size/2,size/2,Math.max(0,size*(.5-ring.inset)-.5)*ring.scale,0,Math.PI*2);ctx.lineWidth=ring.scale;ctx.strokeStyle=ring.color;ctx.stroke();
   }
   if(s.acc){
    matrix(size,s.tx,s.ty,s.rot,s.sx,s.sy,s.originY??BODY_ORIGIN,m,s.originX??.5);
    this.setAlpha(fx?.group?fx.alpha:1);this.setFilter(accFilter);
    ctx.setTransform(m[0]*r,m[1]*r,m[2]*r,m[3]*r,m[4]*r,m[5]*r);drawCell(ctx,s.acc,s.accIndex||0,size);
   }
   return!!(bodyFilter||accFilter);
  }
  dispose(){this.canvas?.remove?.();this.list.length=0;this.avatars.clear();this.ctx=null;}
 }

 // Shelf packing on one texture page. Freed rects are reused by anything that fits; a page whose atlases are all gone
 // starts over, so long sessions do not fragment it.
 class Shelves{
  constructor(size){this.size=size;this.reset();}
  reset(){this.shelves=[];this.free=[];this.top=0;this.live=0;}
  alloc(w,h){
   if(w>this.size||h>this.size)return null;
   let r=null;
   for(let i=0;i<this.free.length;i++){const f=this.free[i];if(f.w>=w&&f.h>=h){this.free.splice(i,1);r=f;break;}}
   if(!r)for(const s of this.shelves)if(h<=s.h&&h>=s.h*.7&&s.x+w<=this.size){r={x:s.x,y:s.y,w,h:s.h};s.x+=w;break;}
   if(!r&&this.top+h<=this.size){const s={y:this.top,h,x:w};this.shelves.push(s);this.top+=h;r={x:0,y:s.y,w,h};}
   if(r)this.live++;
   return r;
  }
  release(r){this.free.push(r);if(--this.live<=0)this.reset();}
 }

 // Pages are allocated as needed; eight 4096px pages hold every built-in kind at default size (WebGL2 has >=16 units).
 const GL_PAGE=4096,GL_PAGES=8,GL_FLOATS=18,GL_IDLE_FRAMES=180;
 const GL_VS='#version 300 es\nin vec2 corner;in vec4 lin;in vec2 move;in vec4 dst;in vec4 src;in vec4 look;uniform vec2 view;uniform vec2 page;out vec2 uv;out vec2 tint;flat out int unit;\n'+
  'void main(){vec2 p=dst.xy+corner*dst.zw;vec2 s=vec2(lin.x*p.x+lin.z*p.y+move.x,lin.y*p.x+lin.w*p.y+move.y);gl_Position=vec4(s.x/view.x*2.-1.,1.-s.y/view.y*2.,0.,1.);uv=(src.xy+corner*src.zw)/page;tint=look.xy;unit=int(look.z+.5);}';
 // Pages hold premultiplied pixels; brightness() scales colour like the CSS filter, clamped to the alpha.
 const GL_FS='#version 300 es\nprecision highp float;in vec2 uv;in vec2 tint;flat in int unit;uniform sampler2D p0;uniform sampler2D p1;uniform sampler2D p2;uniform sampler2D p3;uniform sampler2D p4;uniform sampler2D p5;uniform sampler2D p6;uniform sampler2D p7;out vec4 o;\n'+
  'vec4 page(){if(unit<4){if(unit<2)return unit==0?textureLod(p0,uv,0.):textureLod(p1,uv,0.);return unit==2?textureLod(p2,uv,0.):textureLod(p3,uv,0.);}if(unit<6)return unit==4?textureLod(p4,uv,0.):textureLod(p5,uv,0.);return unit==6?textureLod(p6,uv,0.):textureLod(p7,uv,0.);}\n'+
  'void main(){vec4 c=page();o=vec4(min(c.rgb*tint.y,vec3(c.a)),c.a)*tint.x;}';

 // WebGL2 renderer: baked atlases are copied into up to four 4096px texture pages and every plain pet is one
 // instance of a single draw call, so thousands of pets cost a few ms. Pets in a CSS-filter effect (gift glow, ball
 // reveal, water arrival), cross-origin avatar photos WebGL may not read, and anything that finds no page room are
 // drawn by a 2D overlay on top; those are almost always the newest pets, which are on top anyway.
 class GLLayer extends Surface{
  constructor(opts={}){
   super(opts);this.gl=null;this.overlay=null;this.slots=new Map();this.pages=[];this.frame=0;this.data=new Float32Array(0);
   const {host,doc}=this;if(!host||typeof doc?.createElement!=='function')return;
   const canvas=doc.createElement('canvas');let gl=null;
   // A software WebGL (SwiftShader, e.g. OBS with browser hardware acceleration off) is refused: it measured slower
   // than the DOM pets (300 pets 37 vs 60 fps).
   try{gl=canvas.getContext?.('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,failIfMajorPerformanceCaveat:true});}catch{}
   if(!gl||typeof gl.createShader!=='function'||typeof gl.drawArraysInstanced!=='function')return;
   try{this.gl=gl;this.setup();}catch{this.gl=null;return;}
   this.canvas=this.styleCanvas(canvas,'pet-canvas-layer');
   canvas.addEventListener?.('webglcontextlost',e=>{e.preventDefault?.();this.lost=true;this.list.length=0;this.slots.clear();this.pages=[];try{this.onLost?.();}catch{}});
   canvas.addEventListener?.('webglcontextrestored',()=>{try{this.setup();this.lost=false;}catch{this.gl=null;return;}this.avatars.clear();try{this.onRestored?.();}catch{}});
   canvas._petLayer=this;host.append(canvas);
   this.overlay=new Layer({...opts,className:'pet-canvas-overlay',onLost:()=>{this.list.length=0;try{this.onLost?.();}catch{}},onRestored:()=>{this.avatars.clear();try{this.onRestored?.();}catch{}}});
   if(!this.overlay.active){this.dispose();}
  }
  get active(){return!!this.gl&&!this.lost&&!!this.overlay?.active;}
  setup(){
   const gl=this.gl,shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'shader');return s;};
   const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,GL_VS));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,GL_FS));gl.linkProgram(prog);
   if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog)||'link');
   gl.useProgram(prog);this.prog=prog;this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
   const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
   const corner=gl.getAttribLocation(prog,'corner');gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
   this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);this.capacity=0;
   let offset=0;for(const [name,size] of [['lin',4],['move',2],['dst',4],['src',4],['look',4]]){const at=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,GL_FLOATS*4,offset*4);gl.vertexAttribDivisor(at,1);offset+=size;}
   this.uView=gl.getUniformLocation(prog,'view');gl.uniform2f(gl.getUniformLocation(prog,'page'),GL_PAGE,GL_PAGE);
   for(let i=0;i<GL_PAGES;i++)gl.uniform1i(gl.getUniformLocation(prog,'p'+i),i);
   // Units without a page still need a complete texture bound.
   this.blank=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.blank);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
   gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
   this.slots.clear();this.pages=[];
  }
  newPage(){
   const gl=this.gl,tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,GL_PAGE,GL_PAGE);
   for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
   const page={tex,unit:this.pages.length,shelves:new Shelves(GL_PAGE)};this.pages.push(page);return page;
  }
  // Frees pages slots of atlases that are closed (pruned by the provider) or unused for a while.
  evict(all=false){for(const [atlas,slot] of this.slots)if(all||this.frame-slot.used>GL_IDLE_FRAMES||!(atlas.bitmap?.width>0)){slot.page.shelves.release(slot.rect);this.slots.delete(atlas);}}
  // Where an atlas sits in the pages, uploading it on first use; null if it cannot be there (the overlay draws it).
  slot(atlas){
   let slot=this.slots.get(atlas);if(slot){slot.used=this.frame;return slot;}
   if(atlas.tainted||atlas.broken||atlas.tooBig)return null;
   const w=atlas.bitmap?.width|0,h=atlas.bitmap?.height|0;if(!(w>0&&h>0))return null;
   // Bigger than a page (huge uploads drawn huge): never placeable, so no page is allocated for it.
   if(w+2>GL_PAGE||h+2>GL_PAGE){atlas.tooBig=true;return null;}
   const place=()=>{for(const page of this.pages){const rect=page.shelves.alloc(w+2,h+2);if(rect)return{page,rect};}if(this.pages.length<GL_PAGES){const page=this.newPage();const rect=page.shelves.alloc(w+2,h+2);if(rect)return{page,rect};}return null;};
   let spot=place();if(!spot){this.evict();spot=place();}if(!spot)return null;
   const gl=this.gl,{x,y}=spot.rect;gl.bindTexture(gl.TEXTURE_2D,spot.page.tex);
   try{gl.texSubImage2D(gl.TEXTURE_2D,0,x+1,y+1,gl.RGBA,gl.UNSIGNED_BYTE,atlas.bitmap);}
   catch(error){spot.page.shelves.release(spot.rect);if(error?.name==='SecurityError')atlas.tainted=true;else this.broken(atlas,null,error);return null;}
   // Clear the 1px gutter: a reused rect still holds its previous atlas, and linear sampling at a cell edge reads it.
   const zero=new Uint8Array(4*(Math.max(w,h)+2));
   gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,w+2,1,gl.RGBA,gl.UNSIGNED_BYTE,zero);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y+h+1,w+2,1,gl.RGBA,gl.UNSIGNED_BYTE,zero);
   gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,1,h+2,gl.RGBA,gl.UNSIGNED_BYTE,zero);gl.texSubImage2D(gl.TEXTURE_2D,0,x+w+1,y,1,h+2,gl.RGBA,gl.UNSIGNED_BYTE,zero);
   slot={page:spot.page,rect:spot.rect,x:x+1,y:y+1,used:this.frame};this.slots.set(atlas,slot);return slot;
  }
  put(o,m,r,atlas,slot,index,size,bright){
   const d=this.data,col=index%atlas.cols,row=(index-col)/atlas.cols,kx=size/atlas.w,ky=size/atlas.h;
   d[o]=m[0]*r;d[o+1]=m[1]*r;d[o+2]=m[2]*r;d[o+3]=m[3]*r;d[o+4]=m[4]*r;d[o+5]=m[5]*r;
   d[o+6]=-atlas.px*kx;d[o+7]=-atlas.pt*ky;d[o+8]=atlas.cw*kx;d[o+9]=atlas.ch*ky;
   d[o+10]=slot.x+col*atlas.cw;d[o+11]=slot.y+row*atlas.ch;d[o+12]=atlas.cw;d[o+13]=atlas.ch;
   d[o+14]=1;d[o+15]=bright;d[o+16]=slot.page.unit;d[o+17]=0;
   return o+GL_FLOATS;
  }
  draw(actors,now=0,reduced=false){
   const gl=this.gl;if(!gl)return 0;
   this.bakes=0;this.overlay.bakes=0;this.frame++;
   const {w,h,ratio}=this.fit(this.canvas),all=this.lost?[]:this.collect(actors),plain=[],special=[];
   for(const c of all){
    const s=c.cvState;if(c.ballEmerging||!s?.body)continue;
    const fx=!reduced&&c.fx?effectAt(c.fx,now):null;
    if(fx||!this.slot(s.body)||s.acc&&!this.slot(s.acc))special.push(c);else plain.push(c);
   }
   const need=plain.length*2*GL_FLOATS;if(this.data.length<need)this.data=new Float32Array(Math.max(need,this.data.length*2,GL_FLOATS*64));
   let o=0;const m=this.m;
   for(const c of plain){
    const s=c.cvState,bright=this.hover===c?1.035:1;
    matrix(c.size,s.tx,s.ty,s.rot,s.sx,s.sy,s.originY??BODY_ORIGIN,m,s.originX??.5);
    o=this.put(o,m,ratio,s.body,this.slots.get(s.body),s.bodyIndex||0,c.size,bright);
    if(s.acc)o=this.put(o,m,ratio,s.acc,this.slots.get(s.acc),s.accIndex||0,c.size,bright);
   }
   gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   if(o&&!this.lost){
    gl.useProgram(this.prog);gl.bindVertexArray(this.vao);gl.uniform2f(this.uView,w,h);
    for(let i=0;i<GL_PAGES;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.pages[i]?.tex||this.blank);}
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(this.capacity<this.data.length){gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);this.capacity=this.data.length;}
    gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,o);
    gl.drawArraysInstanced(gl.TRIANGLES,0,6,o/GL_FLOATS);
   }
   this.overlay.hover=this.hover;this.overlay.paint(special,now,reduced);
   // Picking follows what is on screen: overlay pets are above every WebGL pet.
   this.list=plain.concat(special);this.hideButtons(all);this.updateHover();
   this.stats={webgl:plain.length,overlay:special.length,pages:this.pages.length,atlases:this.slots.size};
   if(this.frame%GL_IDLE_FRAMES===0)this.evict();
   return all.length;
  }
  dispose(){this.canvas?.remove?.();this.overlay?.dispose();this.list.length=0;this.avatars.clear();this.slots.clear();this.pages=[];this.gl=null;}
 }

 // WebGL2 when the host has it, else the 2D canvas; null-like (active false) if neither works.
 // Whether this page has a real GPU: a hardware WebGL1 context can be made (failIfMajorPerformanceCaveat refuses software).
 function gpuBacked(doc){
  let gl=null;try{gl=doc.createElement('canvas').getContext?.('webgl',{failIfMajorPerformanceCaveat:true});}catch{}
  if(!gl||typeof gl.getParameter!=='function')return false;
  try{gl.getExtension?.('WEBGL_lose_context')?.loseContext();}catch{}
  return true;
 }
 // Hardware WebGL2: the instanced renderer. A GPU without WebGL2: the 2D canvas (also GPU-backed there). Software-only
 // rendering: null, and the app keeps its DOM pets, which measured fastest without a GPU (300 pets: DOM 60, software
 // WebGL 37, software 2D canvas 24 fps).
 function create(opts={}){
  const gl=new GLLayer(opts);if(gl.active)return gl;gl.dispose();
  const doc=opts.document||root.document;if(!doc||!gpuBacked(doc))return null;
  const layer=new Layer(opts);return layer.active?layer:null;
 }

 return{Layer,GLLayer,Shelves,create,matrix,hitCircle,cubicBezier,effectAt,EFFECTS,animatedData,bakeAvatar,bakeShadow,drawCell,SHADOW,PAD,AVATAR_PAD,FILTER_BUDGET,GL_PAGE,GL_PAGES};
});
