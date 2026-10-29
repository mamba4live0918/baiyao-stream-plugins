const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/pet-canvas.js');

// 3x3 affine helpers: the CSS transform chain written out step by step, to check the closed form in matrix().
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const T=(x,y)=>[1,0,0,1,x,y],S=(x,y)=>[x,0,0,y,0,0],R=deg=>{const r=deg*Math.PI/180;return[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0];};
const apply=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function cssChain(size,tx,ty,rot,sx,sy,oy=.91){
 // .calf: translate(tx,ty) rotate(rot), transform-origin 50% 85%; image: scale(sx,sy), transform-origin 50% oy.
 const outer=[T(tx,ty),T(size/2,size*.85),R(rot),T(-size/2,-size*.85)].reduce(mul);
 const inner=[T(size/2,size*oy),S(sx,sy),T(-size/2,-size*oy)].reduce(mul);
 return mul(outer,inner);
}
const close=(a,b,eps=1e-9)=>a.every((v,i)=>Math.abs(v-b[i])<eps);

// Records what a 2D context is asked to do.
function fakeContext(){
 const calls=[];const ctx={calls,globalAlpha:1,filter:'none',lineWidth:1,strokeStyle:'',
  setTransform(...a){calls.push(['setTransform',...a]);},drawImage(...a){calls.push(['drawImage',...a,{alpha:this.globalAlpha,filter:this.filter}]);},
  clearRect(){calls.push(['clearRect']);},beginPath(){},arc(...a){calls.push(['arc',...a]);},stroke(){calls.push(['stroke',this.strokeStyle,this.globalAlpha]);}};
 return ctx;
}
function fakeDocument(ctx){
 const doc={created:[],createElement(tag){const listeners={};const el={tagName:tag,style:{},width:0,height:0,listeners,setAttribute(){},addEventListener(k,fn){listeners[k]=fn;},getContext:()=>tag==='canvas'?ctx:null};doc.created.push(el);return el;}};
 return doc;
}
function layer(opts={}){
 const ctx=fakeContext(),doc=fakeDocument(ctx),host={children:[],style:{},append(n){this.children.push(n);}};
 const {dpr=1,...hooks}=opts,l=new P.Layer({host,document:doc,viewport:()=>({w:800,h:600}),dpr:()=>dpr,...hooks});
 return{l,ctx,doc,host};
}
const atlas=(frames=12,extra={})=>({bitmap:{id:'bmp'+frames},frames,cols:Math.ceil(Math.sqrt(frames)),cw:118,ch:125,w:96,h:96,px:11,pt:11,...extra});
function pet(id,extra={}){
 const classes=new Set();
 return{id,size:85,onCanvas:true,el:{isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}},
  cvState:{tx:100,ty:200,rot:0,sx:1,sy:1,body:atlas(),bodyIndex:0,acc:null,accIndex:0},...extra};
}
const draws=ctx=>ctx.calls.filter(c=>c[0]==='drawImage');
test('2D canvas honors a noncentral sprite pivot on mirroring while keeping its hit circle at the actor center',()=>{
 const {l,ctx}=layer(),p=pet(123);p.size=100;p.cvState={...p.cvState,tx:50,ty:130,sx:-1,sy:1,originX:.25,originY:.7};
 l.draw([p]);const transforms=ctx.calls.filter(c=>c[0]==='setTransform').map(c=>c.slice(1));
 assert(transforms.some(m=>close(m,[-1,0,0,1,100,130])),'2D matrix pivots at x=25');
 assert.equal(l.hitTest(100,180),p);assert.equal(l.hitTest(50,130),null);
});
test('2D canvas maps a scaled noncentral pivot to its unscaled world position and retains it during reveal',()=>{
 const {l,ctx}=layer(),p=pet(123);p.size=200;p.cvState={...p.cvState,tx:50,ty:130,sx:-1,sy:1.2,originX:.25,originY:.7};
 l.draw([p]);const transforms=ctx.calls.filter(c=>c[0]==='setTransform').map(c=>c.slice(1));
 assert(transforms.some(m=>close(m,[-1,0,0,1.2,150,102])),'scaled pivot maps to (100,270)');
 p.fx={name:'seal-ball-reveal',start:0};ctx.calls.length=0;l.draw([p],0);
 const m=ctx.calls.filter(c=>c[0]==='setTransform')[1].slice(1),mapped=apply(m,50,140);
 assert(close(mapped,[100,270]),'reveal also scales about the inline custom pivot');
});
test('matrix leaves an arbitrary pivot fixed during scale and mirror, even with outer rotation',()=>{
 for(const [size,angle,sx,sy] of [[100,0,-1,1],[200,0,-1,1.2],[160,17,-1.12,1.12]]){
  const tx=40,ty=90,px=.25*size,py=.7*size;
  const scaled=P.matrix(size,tx,ty,angle,sx,sy,.7,undefined,.25),plain=P.matrix(size,tx,ty,angle,1,1,.7,undefined,.25);
  assert(close(apply(scaled,px,py),apply(plain,px,py)));
 }
});

test('the closed-form pet matrix equals the CSS transform chain for mirrored, rotated, squashed and held poses',()=>{
 for(const [size,tx,ty,rot,sx,sy,oy] of [[85,10,20,0,1,1],[85,10.5,-3,9,-1,1],[120,0,0,-14,1.12,1.12],[64,300,40,4,-1.08,.93],[200,5,5,0,1.3,.7,.84]]){
  assert(close(P.matrix(size,tx,ty,rot,sx,sy,oy),cssChain(size,tx,ty,rot,sx,sy,oy)),[size,tx,ty,rot,sx,sy].join());
 }
});

test('the hit circle is the button box after its rotation, so box corners outside the round button miss',()=>{
 for(const rot of [0,12,-30]){
  const size=90,tx=40,ty=70,h=P.hitCircle(size,tx,ty,rot),centre=apply(cssChain(size,tx,ty,rot,1,1),size/2,size/2);
  assert(Math.abs(h.x-centre[0])<1e-9&&Math.abs(h.y-centre[1])<1e-9);assert.equal(h.r,45);
 }
 const {l}=layer(),a=pet(1);l.draw([a]);
 assert.equal(l.hitTest(142,242),a,'button centre');
 assert.equal(l.hitTest(101,201),null,'top-left corner of the box is outside border-radius 50%');
});

test('canvas pets are drawn in creation order, which was the DOM order, and the topmost one is hit',()=>{
 const {l,ctx}=layer(),a=pet(5),b=pet(2),c=pet(9);a.cvState.body=atlas(12,{bitmap:{id:'a'}});b.cvState.body=atlas(12,{bitmap:{id:'b'}});c.cvState.body=atlas(12,{bitmap:{id:'c'}});
 assert.equal(l.draw([a,b,c]),3);
 assert.deepEqual(draws(ctx).map(d=>d[1].id),['b','a','c']);
 assert.equal(l.hitTest(142,242),c,'all three overlap; the last drawn wins');
 c.held=true;assert.equal(l.hitTest(142,242),a,'held pets are DOM and never hit on the canvas');
});

test('only pets marked for the canvas are drawn; their buttons hide after the draw, ball pets stay invisible',()=>{
 const {l,ctx}=layer(),shown=pet(1),dom=pet(2,{onCanvas:false}),ball=pet(3,{ballEmerging:true}),gone=pet(4,{dead:true}),detached=pet(5);detached.el.isConnected=false;
 assert.equal(shown.el.classList.contains('pet-canvas'),false);
 l.draw([shown,dom,ball,gone,detached]);
 assert.equal(draws(ctx).length,1);
 assert(shown.el.classList.contains('pet-canvas'));assert.equal(shown.domHidden,true);
 assert(ball.el.classList.contains('pet-canvas'),'a pet inside its ball is invisible either way');
 assert.equal(dom.el.classList.contains('pet-canvas'),false);assert.equal(l.hitTest(142,242),shown,'ball pets cannot be grabbed (pointer-events none)');
});

test('a body cell maps the baked pad back around the pet box and the accessory is drawn on top unpadded',()=>{
 const {l,ctx}=layer({dpr:1.25}),a=pet(1);a.cvState.bodyIndex=5;a.cvState.acc=atlas(12,{bitmap:{id:'acc'},cw:96,ch:96,px:0,pt:0});a.cvState.accIndex=7;
 l.draw([a]);
 const [body,acc]=draws(ctx),k=85/96;
 assert.equal(body[1].id,'bmp12');assert.deepEqual(body.slice(2,6),[1*118,1*125,118,125]);
 assert.deepEqual(body.slice(6,10).map(v=>+v.toFixed(6)),[-11*k,-11*k,118*k,125*k].map(v=>+v.toFixed(6)));
 assert.equal(acc[1].id,'acc');assert.deepEqual(acc.slice(2,10).map(v=>v+0),[3*96,1*96,96,96,0,0,85,85]);
 const transforms=ctx.calls.filter(c=>c[0]==='setTransform').slice(1).map(c=>c.slice(1));
 assert(close(transforms[0],P.matrix(85,100,200,0,1,1).map(v=>v*1.25)),'device pixel ratio scales the whole pet');
 assert.equal(l.canvas.width,1000);assert.equal(l.canvas.height,750);
});

test('effects replay the CSS keyframes: gift glow, ball reveal on the body only, aquatic fade with its bubble',()=>{
 const gift=P.effectAt({name:'gift-arrival',start:0},0);
 assert.equal(gift.alpha,.4);assert.match(gift.filter,/^drop-shadow\(0px 0px 22\.00px rgba\(255,216,146,1\.000\)\) brightness\(1\.600\)$/);
 const at35=P.effectAt({name:'gift-arrival',start:0},385);assert.equal(at35.alpha,1);assert.match(at35.filter,/drop-shadow\(0px 0px 15\.00px/);assert.doesNotMatch(at35.filter,/brightness/);
 assert.equal(P.effectAt({name:'gift-arrival',start:0},1100),null,'over after 1.1 s');
 const reveal=P.effectAt({name:'seal-ball-reveal',start:0},0);
 assert.equal(reveal.group,false);assert.equal(reveal.alpha,0);assert.equal(reveal.scale,.2);assert.equal(reveal.origin,.84);assert.match(reveal.filter,/^brightness\(2\.000\) drop-shadow/);
 const scales=Array.from({length:60},(_,i)=>P.effectAt({name:'seal-ball-reveal',start:0},i*10)?.scale).filter(Number.isFinite);
 assert(Math.max(...scales)>1.22,'the cubic-bezier overshoots past 1.22 like the CSS');assert(Math.min(...scales.slice(30))<1,'and settles back through 1');
 const fish=P.effectAt({name:'aquatic-arrival',start:0},0);assert.equal(fish.alpha,0);assert.deepEqual([fish.ring.alpha,fish.ring.scale],[.8,.75]);
 assert(P.effectAt({name:'aquatic-arrival',start:0},350).alpha>.5);assert.equal(P.effectAt({name:'aquatic-arrival',start:0},700),null);
 assert.equal(P.effectAt({name:'unknown',start:0},10),null);
 // Started during the frame being drawn (performance.now() after the frame time): the first keyframe, never the plain pet.
 const early=P.effectAt({name:'seal-ball-reveal',start:1000},990);assert.deepEqual([early.alpha,early.scale],[0,.2]);
 assert.equal(P.effectAt({name:'aquatic-arrival',start:1000},995).alpha,0);
 const ease=P.cubicBezier(0,0,.58,1);assert.equal(ease(0),0);assert.equal(ease(1),1);assert(Math.abs(ease(.5)-.6847)<.002,'CSS ease-out at 50%');
});

test('drawing an effect pet applies alpha and filter per the effect, then restores them for the next pet',()=>{
 const {l,ctx}=layer(),a=pet(1,{fx:{name:'gift-arrival',start:0}}),b=pet(2);a.cvState.acc=atlas(1,{bitmap:{id:'acc'},cw:96,ch:96,px:0,pt:0});
 l.draw([a,b],0);
 const [body,acc,plain]=draws(ctx);
 assert.equal(body.at(-1).alpha,.4);assert.match(body.at(-1).filter,/brightness\(1\.600\)/);
 assert.equal(acc.at(-1).alpha,.4,'gift glow is on the whole .calf, accessory included');assert.match(acc.at(-1).filter,/drop-shadow/);
 assert.equal(plain.at(-1).alpha,1);assert.equal(plain.at(-1).filter,'none');
 const r=layer(),ball=pet(3,{fx:{name:'seal-ball-reveal',start:0}});ball.cvState.acc=atlas(1,{bitmap:{id:'acc'},cw:96,ch:96,px:0,pt:0});r.l.draw([ball],100);
 const [rb,ra]=draws(r.ctx);assert(rb.at(-1).alpha>0&&rb.at(-1).alpha<=1);assert.equal(ra.at(-1).alpha,1,'the reveal animates only the body image');assert.equal(ra.at(-1).filter,'none');
 const q=layer(),fish=pet(4,{fx:{name:'aquatic-arrival',start:0}});q.l.draw([fish],100);
 assert(q.ctx.calls.some(c=>c[0]==='stroke'&&c[1]==='#a4e2e8'),'the bubble ring is drawn');
 const z=layer(),still=pet(5,{fx:{name:'gift-arrival',start:0}});z.l.draw([still],0,true);assert.equal(draws(z.ctx)[0].at(-1).filter,'none','no animation when motion is reduced');
});

test('filtered effects are capped per frame so thousands of arrivals cannot stall a frame',()=>{
 const {l,ctx}=layer(),list=Array.from({length:P.FILTER_BUDGET+40},(_,i)=>pet(i+1,{fx:{name:'gift-arrival',start:0}}));
 l.draw(list,0);
 const filtered=draws(ctx).filter(d=>d.at(-1).filter!=='none');
 assert.equal(filtered.length,P.FILTER_BUDGET);assert.equal(draws(ctx).length,list.length,'every pet is still drawn');
 assert(draws(ctx).every(d=>d.at(-1).alpha===.4),'fades still apply beyond the cap');
});

test('hovering a canvas pet brightens it slightly and shows the grab cursor, like button:hover on .calf',()=>{
 const {l,ctx,host}=layer(),a=pet(1);l.draw([a]);
 l.setPointer(142,242);l.draw([a]);assert.equal(l.hover,a);assert.equal(host.style.cursor,'grab');
 ctx.calls.length=0;l.draw([a]);assert.equal(draws(ctx)[0].at(-1).filter,'brightness(1.035)');
 l.setPointer(NaN,NaN);l.draw([a]);assert.equal(l.hover,null);assert.equal(host.style.cursor,'');
});

test('without a 2D context there is no layer; context loss and restore are reported',()=>{
 const host={append(){},style:{}};
 assert.equal(new P.Layer({host,document:{createElement:()=>({getContext:()=>null})}}).active,false);
 let lost=0,restored=0;const {l,doc}=layer({onLost:()=>lost++,onRestored:()=>restored++}),a=pet(1);l.draw([a]);
 const canvas=doc.created[0];assert.equal(canvas.style.pointerEvents,'none');assert.equal(canvas.style.zIndex,'10');
 canvas.listeners.contextlost();assert.equal(l.active,false);assert.equal(lost,1);assert.equal(l.hitTest(142,242),null);
 canvas.listeners.contextrestored();assert.equal(l.active,true);assert.equal(restored,1);
});

test('a bitmap that can no longer be drawn is reported instead of breaking the frame',()=>{
 const broken=[],{l,ctx}=layer({onBroken:a=>broken.push(a)}),a=pet(1),b=pet(2);
 const draw=ctx.drawImage;ctx.drawImage=function(img,...rest){if(img.id==='bad')throw Error('closed');return draw.call(this,img,...rest);};
 a.cvState.body=atlas(12,{bitmap:{id:'bad'}});
 assert.doesNotThrow(()=>l.draw([a,b]));assert.deepEqual(broken,[a.cvState.body]);assert.equal(draws(ctx).length,1);
});

test('GIF, APNG and animated WebP uploads are recognised so they stay animated DOM images',()=>{
 const b64=bytes=>'data:image/png;base64,'+Buffer.from(bytes,'binary').toString('base64');
 const chunk=(type,len=0)=>String.fromCharCode(0,0,0,len)+type+'\0'.repeat(len)+'\0\0\0\0';
 const sig='\x89PNG\r\n\x1a\n';
 assert.equal(P.animatedData('data:image/gif;base64,R0lGODlh'),true);
 assert.equal(P.animatedData(b64(sig+chunk('IHDR',13)+chunk('acTL',8)+chunk('IDAT',4))),true);
 assert.equal(P.animatedData(b64(sig+chunk('IHDR',13)+chunk('IDAT',4)+chunk('acTL',8))),false,'acTL after IDAT is not APNG');
 const webp=flags=>'data:image/webp;base64,'+Buffer.from('RIFF\0\0\0\0WEBPVP8X'+String.fromCharCode(10,0,0,0,flags)+'\0'.repeat(20),'binary').toString('base64');
 assert.equal(P.animatedData(webp(2)),true);assert.equal(P.animatedData(webp(16)),false);
 for(const v of ['blob:x','https://a/b.png',null,'data:image/jpeg;base64,/9j/4AAQ'])assert.equal(P.animatedData(v),false);
});

test('a viewer avatar is baked once per photo and size: cover-fit photo, ring, backing and both shadows',()=>{
 const ops=[];const make=(w,h)=>({width:w,height:h,getContext:()=>new Proxy({filter:'none'},{get:(o,k)=>k in o?o[k]:typeof k==='string'&&!['filter','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY','fillStyle','strokeStyle','lineWidth','imageSmoothingQuality'].includes(k)?(...a)=>ops.push([k,...a]):undefined,set:(o,k,v)=>{o[k]=v;ops.push(['set',k,v]);return true;}})});
 const img={naturalWidth:200,naturalHeight:100,complete:true},a=P.bakeAvatar(img,96,88,make),k=96/88;
 assert.equal(a.w,96);assert.equal(a.px,Math.ceil(24*k));assert.equal(a.cw,96+2*a.px);assert.equal(a.ch,96+Math.ceil(20*k)+Math.ceil(34*k));
 const photo=ops.find(o=>o[0]==='drawImage'&&o[1]===img);const inner=96-6*k;assert(Math.abs(photo[5]-inner)<1e-9,'cover: the short side fills the inner circle');assert(Math.abs(photo[4]-inner*2)<1e-9);
 assert(ops.some(o=>o[0]==='set'&&o[1]==='shadowColor'&&o[2]==='#735b9860'),'box-shadow');
 assert(ops.some(o=>o[0]==='set'&&o[1]==='filter'&&/drop-shadow\(0px [\d.]+px [\d.]+px #9d789530\)/.test(o[2])),'image drop-shadow');
 const {l}=layer(),box={px:96,ref:88};
 assert.equal(l.avatar('u',{complete:false,naturalWidth:0},box),null,'not before the photo loads');
});
