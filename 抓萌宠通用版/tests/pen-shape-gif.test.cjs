const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Decoder=require('../src/gif-decode.js');
const source=fs.readFileSync(path.join(__dirname,'../src/pen-shape.js'),'utf8');
const gif='data:image/gif;base64,R0lGODlhAwABAIIBAAAAAP8AAAD/AAAA/////wAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQECgAAACwAAAAAAwABAAADAhiaACH5BAgUAAAALAEAAAABAAEAAAMCKAkAIfkEDB4AAAAsAgAAAAEAAQAAAwI4CQAh+QQEKAAAACwAAAAAAQABAAADAkgJADs=';
const red=new Uint8ClampedArray([255,0,0,255,255,0,0,255,255,0,0,255]);
function fixture(decode=bytes=>Decoder.decode(bytes,{preferNative:false})){
 let now=0,serial=0,reduced=false;const pending=new Map(),warnings=[];
 class Element extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.style={visibility:''};this.children=[];this.attrs={};this.classList={add(){},remove(){}};this.hidden=false;}
  append(...items){this.children.push(...items);}
  insertBefore(item,next){const at=this.children.indexOf(next);if(at<0)this.append(item);else this.children.splice(at,0,item);}
  setAttribute(k,v){this.attrs[k]=v;}
  getBoundingClientRect(){return{left:0,top:0,width:3,height:1};}
 }
 function element(tag){const el=new Element(tag);if(tag==='canvas'){
  el.width=3;el.height=1;el.pixels=new Uint8ClampedArray(12);
  const ctx={clearRect(){el.pixels=new Uint8ClampedArray(el.width*el.height*4);},drawImage(img){el.pixels=new Uint8ClampedArray(img.pixels);},getImageData(){return{data:new Uint8ClampedArray(el.pixels)};},createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4),width:w,height:h};},putImageData(data){el.pixels=new Uint8ClampedArray(data.data);}};
  el.getContext=()=>ctx;
 }return el;}
 const document={createElement:element,createElementNS:(_,tag)=>element(tag)};
 const context={document,Uint8Array,Uint8ClampedArray,SealGifDecode:{decode},atob:s=>Buffer.from(s,'base64').toString('binary'),performance:{now:()=>now},requestAnimationFrame:fn=>{const id=++serial;pending.set(id,fn);return id;},cancelAnimationFrame:id=>pending.delete(id),setTimeout:()=>0,clearTimeout(){},MutationObserver:class{constructor(fn){this.fn=fn;}observe(){}},getComputedStyle:()=>({transform:'none'}),Event};
 vm.runInNewContext(source,context);
 const image=element('img'),pen=element('div');image.complete=false;image.naturalWidth=3;image.naturalHeight=1;image.clientWidth=3;image.clientHeight=1;image.pixels=red;pen.append(image);
 const region=new context.PetPenShape.HitRegion(image,pen,message=>warnings.push(message),()=>reduced);
 const load=src=>{image.src=src;image.currentSrc=src;image.complete=true;return region.refresh();};
 const advance=time=>{now=time;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn(time));};
 const display=()=>pen.children.find(el=>el.tagName==='canvas');
 return{region,image,pen,warnings,pending,load,advance,display,setReduced:value=>{reduced=value;region.syncMotion();}};
}
test('GIF display and hit mask advance from the same decoded frame',async()=>{
 const f=fixture();await f.load(gif);
 assert.equal(f.image.style.visibility,'hidden');assert.equal(f.display().hidden,false);
 assert.deepEqual(Array.from(f.display().pixels),Array.from(red));assert.equal(f.region.contains(1.5,.5),true);
 f.advance(300);
 assert.deepEqual(Array.from(f.display().pixels.slice(4,8)),[0,0,0,0]);assert.equal(f.region.contains(1.5,.5),false);
 assert.equal(f.region.contains(2.5,.5),true);
 assert.equal(f.pending.size,1);
});
test('finite GIF repetitions stop at the final frame without a remaining animation loop',async()=>{
 const f=fixture(async bytes=>({...await Decoder.decode(bytes,{preferNative:false}),repetitionCount:1}));await f.load(gif);
 f.advance(1000);assert.deepEqual(Array.from(f.display().pixels),Array.from(red));assert.equal(f.pending.size,1);
 f.advance(2000);assert.deepEqual(Array.from(f.display().pixels.slice(0,4)),[255,255,255,255]);assert.equal(f.region.contains(1.5,.5),false);assert.equal(f.pending.size,0);
});
test('reduced motion shows the first frame and explicit animation resumes synchronized playback',async()=>{
 const f=fixture();await f.load(gif);f.advance(300);assert.equal(f.region.contains(1.5,.5),false);
 f.setReduced(true);assert.equal(f.region.contains(1.5,.5),true);assert.deepEqual(Array.from(f.display().pixels),Array.from(red));assert.equal(f.pending.size,0);
 f.setReduced(false);assert.equal(f.pending.size,1);f.advance(600);assert.equal(f.region.contains(1.5,.5),false);
});
test('switching back to a static image cancels animation and restores the original image display',async()=>{
 const f=fixture();await f.load(gif);f.advance(300);
 f.image.pixels=new Uint8ClampedArray([0,0,0,0,255,0,0,255,0,0,0,0]);await f.load('data:image/png;base64,new');
 assert.equal(f.image.style.visibility,'');assert.equal(f.display().hidden,true);assert.equal(f.pending.size,0);
 assert.equal(f.region.contains(.5,.5),false);assert.equal(f.region.contains(1.5,.5),true);
 f.advance(800);assert.equal(f.region.contains(1.5,.5),true);
});
test('late GIF decoding and rejection cannot replace a newly selected static image',async()=>{
 for(const rejectOld of [false,true]){
  let resolve,reject;const f=fixture(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));const old=f.load(gif);
  await f.load('data:image/png;base64,new');
  if(rejectOld)reject(Error('old failed'));else resolve(await Decoder.decode(Buffer.from(gif.split(',')[1],'base64'),{preferNative:false}));
  await old;assert.equal(f.image.style.visibility,'');assert.equal(f.display().hidden,true);assert.equal(f.pending.size,0);assert.equal(f.warnings.length,0);assert.equal(f.region.source,'data:image/png;base64,new');
 }
});
test('out-of-order GIF decodes cannot overwrite a newer animated selection',async()=>{
 const result=await Decoder.decode(Buffer.from(gif.split(',')[1],'base64'),{preferNative:false});let resolveOld,calls=0;
 const fresh={...result,frames:[result.frames[2]],repetitionCount:0};
 const f=fixture(()=>++calls===1?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(fresh));
 const old=f.load(gif);await f.load(gif+'\n');assert.equal(f.region.contains(1.5,.5),false);
 resolveOld(result);await old;
 assert.equal(f.region.contains(1.5,.5),false);assert.equal(f.pending.size,0);assert.equal(f.warnings.length,0);
});
test('starting in reduced motion decodes only once and displays a stable first frame',async()=>{
 let calls=0;const f=fixture(bytes=>{calls++;return Decoder.decode(bytes,{preferNative:false});});f.setReduced(true);await f.load(gif);
 assert.equal(f.pending.size,0);assert.equal(f.region.contains(1.5,.5),true);
 f.setReduced(false);f.advance(300);assert.equal(f.region.contains(1.5,.5),false);assert.equal(calls,1);
});
test('failed and over-limit decoding displays a matching static first frame with a warning',async()=>{
 const single=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
 const tooMany=Buffer.concat([single.subarray(0,19),...Array.from({length:25},()=>single.subarray(19,-1)),single.subarray(-1)]);
 for(const src of ['data:image/gif;base64,bm90LWEtZ2lm','data:image/gif;base64,'+tooMany.toString('base64')]){
  const f=fixture();await f.load(src);
  assert.equal(f.image.style.visibility,'hidden');assert.equal(f.display().hidden,false);assert.deepEqual(Array.from(f.display().pixels),Array.from(red));
  assert.equal(f.region.contains(1.5,.5),true);assert.equal(f.pending.size,0);assert.equal(f.warnings.length,1);assert.equal(f.image.src,src);
 }
});
