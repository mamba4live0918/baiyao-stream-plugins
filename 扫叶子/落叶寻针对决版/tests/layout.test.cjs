const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../src/layout.js');

function image(w,h,rects){const data=new Uint8ClampedArray(w*h*4);for(const [x0,y0,x1,y1,a=255]of rects)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)data[(y*w+x)*4+3]=a;return data;}

test('fit keeps 16:9 stage centered',()=>{
  const a=L.fit(1920,1080);assert.equal(a.x,0);assert.equal(a.y,0);assert.ok(Math.abs(a.scale-4/3)<1e-9);
  const b=L.fit(1000,1000);assert.equal(b.x,0);assert.ok(Math.abs(b.y-218.75)<1e-9);
  assert.deepEqual(L.fit(2000,810),{scale:1,x:280,y:0});
});
test('point maps client coordinates into the 1440×810 stage',()=>{
  const p=L.point(460,252.5,{left:100,top:50,width:720,height:405});assert.equal(p.x,720);assert.equal(p.y,405);
});
test('spriteComponents: largest per cell by bbox centre, own-pixel mask, 4-connected, alpha ≥ 32, specks ≤ 20',()=>{
  const data=image(30,30,[[12,0,18,2],[5,5,24,7],[21,1,27,3],[1,11,5,15,32],[6,11,8,15,31],[1,17,7,19],[21,10,22,18],[21,17,28,18],[25,11,26,12],[0,21,3,25],[11,20,15,24],[16,25,19,29],[25,20,29,24]]);
  const parts=L.spriteComponents(data,30,30),box=p=>p&&[p.x,p.y,p.w,p.h,p.area];
  assert.deepEqual(parts.map(box),[null,[5,5,20,3,60],[21,1,7,3,21],[1,11,5,5,25],null,[21,10,8,9,30],null,[11,20,5,5,25],[25,20,5,5,25]]);
  const mask=[];for(let y=10;y<=18;y++)for(let x=21;x<=28;x++)mask.push(x<=22||y>=17?1:0);
  assert.deepEqual(Array.from(parts[5].mask),mask);
});
test('spriteComponents uses the shared alpha threshold by default',()=>{
  assert.equal(L.ALPHA_MIN,32);
  const data=image(30,30,[[1,1,6,6,L.ALPHA_MIN-1],[21,21,26,26,L.ALPHA_MIN]]);
  const parts=L.spriteComponents(data,30,30);assert.equal(parts[0],null);assert.equal(parts[8].area,36);
});
