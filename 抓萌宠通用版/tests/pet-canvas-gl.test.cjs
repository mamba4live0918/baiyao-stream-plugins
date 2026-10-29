const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/pet-canvas.js');

// A WebGL2 context that records what the layer uploads and draws.
function fakeGL({compiles=true}={}){
 let ids=0;const calls=[],textures=new Map();
 const gl={calls,textures,VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TEXTURE_2D:9,RGBA:10,RGBA8:11,UNSIGNED_BYTE:12,
  TEXTURE_MIN_FILTER:13,TEXTURE_MAG_FILTER:14,TEXTURE_WRAP_S:15,TEXTURE_WRAP_T:16,LINEAR:17,CLAMP_TO_EDGE:18,BLEND:19,ONE:20,ONE_MINUS_SRC_ALPHA:21,UNPACK_PREMULTIPLY_ALPHA_WEBGL:22,COLOR_BUFFER_BIT:23,TRIANGLES:24,TEXTURE0:100,
  createShader:()=>({id:++ids}),shaderSource(){},compileShader(){},getShaderParameter:()=>compiles,getShaderInfoLog:()=>'bad shader',createProgram:()=>({id:++ids}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,getProgramInfoLog:()=>'',
  useProgram(){},createVertexArray:()=>({}),bindVertexArray(){},createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:(p,n)=>n.length,enableVertexAttribArray(){},vertexAttribPointer(){},vertexAttribDivisor(){},
  getUniformLocation:(p,n)=>n,uniform2f(){},uniform1i(){},createTexture(){const t={id:++ids};textures.set(t,[]);return t;},bound:null,bindTexture(t,tex){this.bound=tex;},texImage2D(){},texStorage2D(){calls.push(['page']);},texParameteri(){},
  texSubImage2D(t,l,x,y,...rest){
   // (…, width, height, format, type, typedArray): the gutter is cleared with zeros.
   if(rest.length===5){const [w,h,,,data]=rest;calls.push(['zero',x,y,w,h,data.every(v=>v===0)]);return;}
   const src=rest[2];if(src.tainted)throw Object.assign(Error('cross-origin'),{name:'SecurityError'});if(src.closed)throw Object.assign(Error('closed'),{name:'InvalidStateError'});calls.push(['upload',src.id,x,y]);textures.get(this.bound).push(src.id);
  },
  enable(){},blendFunc(){},pixelStorei(){},viewport(){},clearColor(){},clear(){calls.push(['clear']);},activeTexture(){},
  bufferSubData(t,o,data,start,len){calls.push(['data',Array.from(data.subarray(0,len))]);},drawArraysInstanced(mode,first,n,count){calls.push(['draw',count]);}};
 return gl;
}
function context2d(){const calls=[];return{calls,globalAlpha:1,filter:'none',setTransform(){},drawImage(img){calls.push(['drawImage',img.id,this.filter]);},clearRect(){},beginPath(){},arc(){},stroke(){}};}
// webgl: a hardware WebGL2 context is offered; gpu: a hardware WebGL1 probe succeeds (the page is GPU-backed).
function setup({gl=fakeGL(),webgl=true,gpu=true,dpr=1}={}){
 const ctx=context2d(),created=[],probe={getParameter(){},getExtension:()=>({loseContext(){probe.lost=true;}})},asked=[];
 const doc={createElement(tag){const listeners={},el={tagName:tag,style:{},width:0,height:0,listeners,setAttribute(){},addEventListener(k,fn){listeners[k]=fn;},remove(){this.removed=true;},getContext:(type,attrs)=>{asked.push([type,attrs]);return type==='webgl2'?(webgl?gl:null):type==='webgl'?(gpu?probe:null):type==='2d'?ctx:null;}};created.push(el);return el;}};
 const host={children:[],style:{},append(n){this.children.push(n);}};
 const layer=P.create({host,document:doc,viewport:()=>({w:800,h:600}),dpr:()=>dpr});
 return{layer,gl,ctx,host,created,probe,asked};
}
const atlas=(id,frames=12,extra={})=>({bitmap:{id,width:4*118,height:3*125},frames,cols:4,cw:118,ch:125,w:96,h:96,px:9,pt:5,...extra});
function pet(id,extra={}){const classes=new Set();return{id,size:85,onCanvas:true,el:{isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}},cvState:{tx:100+id*10,ty:200,rot:0,sx:1,sy:1,body:atlas('a'+id),bodyIndex:0,acc:null,accIndex:0},...extra};}
const last=(gl,kind)=>gl.calls.filter(c=>c[0]===kind).at(-1);
test('WebGL matrix uses noncentral pivot without moving the hit circle',()=>{
 const {layer,gl}=setup(),p=pet(123);p.size=100;p.cvState={...p.cvState,tx:50,ty:130,sx:-1,sy:1,originX:.25,originY:.7};
 layer.draw([p]);const m=last(gl,'data')[1].slice(0,6);assert(m.every((v,i)=>Math.abs(v-[-1,0,0,1,100,130][i])<1e-4));
 assert.equal(layer.hitTest(100,180),p);assert.equal(layer.hitTest(50,130),null);
});
test('WebGL matrix preserves noncentral pivot under scaling',()=>{
 const {layer,gl}=setup(),p=pet(123);p.size=200;p.cvState={...p.cvState,tx:50,ty:130,sx:-1,sy:1.2,originX:.25,originY:.7};
 layer.draw([p]);const m=last(gl,'data')[1].slice(0,6);assert(m.every((v,i)=>Math.abs(v-[-1,0,0,1.2,150,102][i])<1e-4));
});

test('hardware WebGL2 is preferred; a GPU without it gets the 2D canvas; software-only rendering keeps DOM pets',()=>{
 const a=setup();assert(a.layer instanceof P.GLLayer);assert.equal(a.layer.active,true);
 assert.deepEqual(a.host.children.map(c=>c.className),['pet-canvas-layer','pet-canvas-overlay'],'the 2D overlay sits above the WebGL canvas');
 assert.equal(a.asked[0][0],'webgl2');assert.equal(a.asked[0][1].failIfMajorPerformanceCaveat,true,'software WebGL is refused');
 const b=setup({webgl:false});assert(b.layer instanceof P.Layer);assert.equal(b.layer.active,true);
 assert(b.asked.some(([t,o])=>t==='webgl'&&o.failIfMajorPerformanceCaveat),'GPU probe');assert.equal(b.probe.lost,true,'the probe context is released');
 const c=setup({gl:fakeGL({compiles:false})});assert(c.layer instanceof P.Layer);assert.deepEqual(c.host.children.map(x=>x.className),['pet-canvas-layer']);
 const d=setup({webgl:false,gpu:false});assert.equal(d.layer,null,'no GPU: the app keeps DOM pets');assert.deepEqual(d.host.children,[]);
});

test('plain pets become instances of one draw call, carrying the CSS matrix, the cell and its page',()=>{
 const {layer,gl}=setup({dpr:1.25}),a=pet(1),b=pet(2);b.cvState.sx=-1;b.cvState.bodyIndex=5;b.cvState.acc=atlas('prop',12,{cw:96,ch:96,px:0,pt:0,bitmap:{id:'prop',width:384,height:288}});b.cvState.accIndex=5;
 assert.equal(layer.draw([b,a]),2);
 assert.deepEqual(last(gl,'draw'),['draw',3],'two bodies and one accessory');
 const d=last(gl,'data')[1],F=18,uploads=gl.calls.filter(c=>c[0]==='upload');
 assert.deepEqual(uploads.map(u=>u[1]),['a1','a2','prop'],'each atlas uploads once, in drawing order');
 const slotA=uploads[0].slice(2),body=d.slice(0,F),k=85/96;
 const m=P.matrix(85,110,200,0,1,1).map(v=>v*1.25);
 assert(body.slice(0,6).every((v,i)=>Math.abs(v-m[i])<1e-4),'matrix in device px');
 assert(body.slice(6,10).every((v,i)=>Math.abs(v-[-9*k,-5*k,118*k,125*k][i])<1e-4),'cell rect with its shadow pad, in CSS px');
 assert.deepEqual(body.slice(10,14),[slotA[0],slotA[1],118,125]);assert.deepEqual(body.slice(14,18),[1,1,0,0]);
 const second=d.slice(F,2*F),slotB=uploads[1].slice(2);
 assert.deepEqual(second.slice(10,12),[slotB[0]+1*118,slotB[1]+1*125],'frame 5 of a 4-column atlas');assert(second[0]<0,'mirrored');
 assert.deepEqual(d.slice(2*F,3*F).slice(10,12),[uploads[2][2]+1*96,uploads[2][3]+1*96],'the accessory follows its body');
 gl.calls.length=0;layer.draw([a,b]);assert.equal(gl.calls.filter(c=>c[0]==='upload').length,0,'no re-upload');
 assert(a.el.classList.contains('pet-canvas')&&b.el.classList.contains('pet-canvas'));
});

test('pets mid-effect are painted by the 2D overlay with their CSS filters, above every WebGL pet',()=>{
 const {layer,gl,ctx}=setup(),a=pet(1),b=pet(2,{fx:{name:'gift-arrival',start:0}}),c=pet(3);
 layer.draw([a,b,c],100);
 assert.deepEqual(last(gl,'draw'),['draw',2]);assert.deepEqual(ctx.calls.map(x=>x[1]),['a2']);assert.match(ctx.calls[0][2],/drop-shadow/);
 assert.deepEqual(layer.list.map(p=>p.id),[1,3,2],'picking sees the overlay pet on top');
 assert.equal(layer.hitTest(160,242),b,'b overlaps a and c but is drawn above them');
 ctx.calls.length=0;layer.draw([a,b,c],2000);assert.deepEqual(last(gl,'draw'),['draw',3],'back in WebGL once the effect is over');assert.equal(ctx.calls.length,0);
 layer.draw([a,b,c],100,true);assert.deepEqual(last(gl,'draw'),['draw',3],'no effects with reduced motion');
});

test('cross-origin avatar photos WebGL may not read stay on the 2D overlay',()=>{
 const {layer,gl,ctx}=setup(),a=pet(1),b=pet(2);b.cvState.body=atlas('photo',1,{cols:1,bitmap:{id:'photo',width:120,height:120,tainted:true}});
 layer.draw([a,b]);
 assert.equal(b.cvState.body.tainted,true);assert.deepEqual(last(gl,'draw'),['draw',1]);assert.deepEqual(ctx.calls.map(x=>x[1]),['photo']);
});

test('hovering brightens a WebGL pet in the shader and shows the grab cursor',()=>{
 const {layer,gl,host}=setup(),a=pet(1);layer.draw([a]);layer.setPointer(152,242);layer.draw([a]);
 assert.equal(host.style.cursor,'grab');layer.draw([a]);assert.equal(last(gl,'data')[1][15],Math.fround(1.035));
});

test('page room: closed or idle atlases are evicted before a pet has to fall back to the overlay',()=>{
 const {layer,gl,ctx}=setup(),big=n=>atlas('big'+n,30,{bitmap:{id:'big'+n,width:2600,height:2600}});
 const pets=Array.from({length:P.GL_PAGES},(_,i)=>{const p=pet(i+1);p.cvState.body=big(i);return p;});
 layer.draw(pets);assert.equal(layer.pages.length,P.GL_PAGES,'one big atlas per page');assert.deepEqual(last(gl,'draw'),['draw',P.GL_PAGES]);
 const extra=pet(99);extra.cvState.body=big(99);
 layer.draw(pets.concat(extra));assert.deepEqual(ctx.calls.map(c=>c[1]),['big99'],'no room: drawn by the overlay');
 pets[0].cvState.body.bitmap.width=0;ctx.calls.length=0;
 layer.draw(pets.slice(1).concat(extra));assert.equal(ctx.calls.length,0,'a closed bitmap frees its page');assert.equal(last(gl,'draw')[1],P.GL_PAGES);
});

test('a lost WebGL context hands every pet back; a restored one rebuilds and reports it',()=>{
 let lost=0,restored=0;const {layer,created}=setup();layer.onLost=()=>lost++;layer.onRestored=()=>restored++;
 const a=pet(1);layer.draw([a]);const canvas=created.find(c=>c.className==='pet-canvas-layer');
 let prevented=false;canvas.listeners.webglcontextlost({preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'restoration is requested');assert.equal(layer.active,false);assert.equal(lost,1);assert.equal(layer.slots.size,0);
 canvas.listeners.webglcontextrestored();assert.equal(layer.active,true);assert.equal(restored,1);
 layer.draw([a]);assert.equal(layer.slots.size,1,'uploads again into fresh pages');
});

test('a bitmap that can no longer be uploaded is reported and the pet goes to the overlay',()=>{
 const broken=[],{layer}=setup();layer.onBroken=a=>broken.push(a);layer.overlay.onBroken=a=>broken.push(a);
 const a=pet(1);a.cvState.body.bitmap.closed=true;
 assert.doesNotThrow(()=>layer.draw([a]));assert(broken.includes(a.cvState.body));
});

test('shelves reuse freed rects, refuse what does not fit and start over once empty',()=>{
 const s=new P.Shelves(100),r1=s.alloc(60,40),r2=s.alloc(30,40),r3=s.alloc(50,50);
 assert.deepEqual([r1.x,r1.y,r2.x,r2.y,r3.x,r3.y],[0,0,60,0,0,40]);assert.equal(s.alloc(80,20),null,'only 10px of height left');
 s.release(r1);assert.equal(s.alloc(50,30),r1);assert.equal(s.alloc(200,10),null);
 for(const r of [r1,r2,r3])s.release(r);assert.deepEqual([s.top,s.free.length,s.shelves.length],[0,0,0],'an emptied page is not fragmented');
 assert.deepEqual(s.alloc(100,100),{x:0,y:0,w:100,h:100});
});

test('each upload clears the 1px gutter around it, since a reused rect still holds the previous atlas',()=>{
 const {layer,gl}=setup(),a=pet(1);layer.draw([a]);
 const [up]=gl.calls.filter(c=>c[0]==='upload'),x=up[2]-1,y=up[3]-1,w=a.cvState.body.bitmap.width,h=a.cvState.body.bitmap.height;
 const zeros=gl.calls.filter(c=>c[0]==='zero').map(c=>c.slice(1));
 assert.deepEqual(zeros.map(z=>z.slice(0,4)).sort(),[[x,y,w+2,1],[x,y+h+1,w+2,1],[x,y,1,h+2],[x+w+1,y,1,h+2]].sort());assert(zeros.every(z=>z[4]));
});

test('an atlas bigger than a page goes to the overlay without allocating any page',()=>{
 const {layer,gl,ctx}=setup(),a=pet(1);a.cvState.body=atlas('huge',24,{bitmap:{id:'huge',width:4260,height:900}});
 layer.draw([a]);layer.draw([a]);
 assert.equal(layer.pages.length,0);assert.equal(a.cvState.body.tooBig,true);assert.equal(gl.calls.filter(c=>c[0]==='page').length,0);
 assert.deepEqual(ctx.calls.map(c=>c[1]),['huge','huge']);
});
