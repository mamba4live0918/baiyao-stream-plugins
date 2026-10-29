const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Shape=require('../src/pen-shape.js');
function raster(rows){const h=rows.length,w=rows[0].length,data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[(y*w+x)*4+3]=rows[y][x]==='#'?255:rows[y][x]==='.'?1:0;return Shape.fromPixels(data,w,h);}
test('roof, walls and bottom are all valid; transparent corners and holes are not',()=>{
 const mask=raster(['  ##  ',' #### ','##  ##','######']);
 for(const [x,y] of [[2,0],[0,2],[5,2],[2,3]])assert(Shape.contains(mask,(x+.5)/6,(y+.5)/4));
 for(const [x,y] of [[0,0],[5,0],[2,2],[3,2]])assert.equal(Shape.contains(mask,(x+.5)/6,(y+.5)/4),false);
 assert.equal(Shape.contains(mask,1,.5),false);assert.equal(Shape.contains(mask,-.1,.5),false);
});
test('the pointer clipping rectangles match the same alpha hit mask including holes',()=>{
 const mask=raster(['. ## .',' #### ','##  ##','######']);
 for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){
  const painted=mask.rectangles.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);
  assert.equal(painted,Shape.contains(mask,(x+.5)/mask.width,(y+.5)/mask.height));
 }
 assert(mask.path.startsWith('M'));assert.equal(Shape.contains(mask,.01,.01),false);
});
test('screen coordinates map to the image across scaling, movement and rotation',()=>{
 const mask=raster(['# ','  ']);
 const rect={left:100,top:200,width:200,height:100};
 assert(Shape.hit(mask,120,210,rect,200,100));assert.equal(Shape.hit(mask,280,280,rect,200,100),false);
 // A quarter-turn maps local top-left to screen top-right.
 const rotated={left:150,top:150,width:100,height:200};
 assert(Shape.hit(mask,230,170,rotated,200,100,{a:0,b:1,c:-1,d:0}));
 assert.equal(Shape.hit(mask,170,330,rotated,200,100,{a:0,b:1,c:-1,d:0}),false);
 assert.equal(Shape.hit(null,0,0,rect,200,100),false);
});
test('empty or unavailable masks never create a rectangular drop target',()=>{
 const mask=raster(['   ','   ']);assert.equal(mask.path,'');assert.equal(Shape.contains(mask,.5,.5),false);
 assert.throws(()=>Shape.fromPixels(new Uint8Array(2),2,2));
});
