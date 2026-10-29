const test=require('node:test');
const assert=require('node:assert/strict');
const {keyPixels}=require('../src/white-key.js');

function canvas(w,h,color=[252,252,252,255]){const pixels=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)pixels.set(color,i*4);return pixels;}
function put(p,w,x,y,rgba){p.set(rgba,(y*w+x)*4);}
function at(p,w,x,y){return [...p.slice((y*w+x)*4,(y*w+x)*4+4)];}

test('只去掉与边缘连通的浅色背景，保护封闭白色细节和主体',()=>{
 const w=7,h=7,p=canvas(w,h),blue=[20,80,240,255],white=[252,252,252,255];
 for(let y=2;y<=4;y++)for(let x=2;x<=4;x++)put(p,w,x,y,blue);
 put(p,w,3,3,white);
 const original=p.slice(),out=keyPixels(p,w,h,28);
 assert.equal(out.removed,40);
 assert.equal(at(out.pixels,w,0,0)[3],0);
 assert.deepEqual(at(out.pixels,w,2,2),blue);
 assert.deepEqual(at(out.pixels,w,3,3),white);
 assert.deepEqual([...p],[...original]);
});

test('边缘近白抗锯齿像素软化并去掉白晕',()=>{
 const w=5,h=5,p=canvas(w,h);
 put(p,w,2,2,[30,70,210,255]);
 put(p,w,2,1,[216,220,235,255]);
 const out=keyPixels(p,w,h,28);
 assert.equal(at(out.pixels,w,0,0)[3],0);
 const edge=at(out.pixels,w,2,1);
 assert(edge[3]>0&&edge[3]<255);
 assert(edge[0]<216);
 assert.deepEqual(at(out.pixels,w,2,2),[30,70,210,255]);
});

test('已有透明底或非浅色背景不做误抠除',()=>{
 const transparent=canvas(4,4,[252,252,252,0]);
 put(transparent,4,1,1,[255,255,255,255]);
 const a=keyPixels(transparent,4,4,28);
 assert.equal(a.removed,0);
 assert.equal(at(a.pixels,4,1,1)[3],255);
 const pink=canvas(4,4,[240,160,180,255]);
 const b=keyPixels(pink,4,4,28);
 assert.equal(b.removed,0);
 assert.deepEqual([...b.pixels],[...pink]);
});

test('逐帧图有透明留白时仍可识别内部矩形白底',()=>{
 const w=7,h=7,p=canvas(w,h,[0,0,0,0]);
 for(let y=2;y<=4;y++)for(let x=1;x<=5;x++)put(p,w,x,y,[252,252,252,255]);
 put(p,w,3,3,[20,80,240,255]);
 const out=keyPixels(p,w,h,28);
 assert.equal(out.removed,14);
 assert.equal(at(out.pixels,w,1,2)[3],0);
 assert.deepEqual(at(out.pixels,w,3,3),[20,80,240,255]);
});
