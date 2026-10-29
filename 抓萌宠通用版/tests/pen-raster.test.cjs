const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createCanvas,loadImage,Path2D}=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const Shape=require('../src/pen-shape.js'),root=path.join(__dirname,'..');
test('all shipped nests clip to their alpha silhouettes, including upper and outer areas',async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'素材/manifest.json'),'utf8')),height=Math.ceil(manifest.barns.length/2)*300,proof=createCanvas(1200,height),pc=proof.getContext('2d');pc.fillStyle='#edf3f6';pc.fillRect(0,0,1200,height);
 for(const [i,barn]of manifest.barns.entries()){
  const img=await loadImage(path.join(root,'素材',barn.src)),scale=256/Math.max(img.width,img.height),w=Math.round(img.width*scale),h=Math.round(img.height*scale),canvas=createCanvas(w,h),ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data,mask=Shape.fromPixels(pixels,w,h),clip=createCanvas(w,h),cc=clip.getContext('2d');
  cc.scale(w,h);cc.fillStyle='#228f83';cc.fill(new Path2D(mask.path));const clipped=cc.getImageData(0,0,w,h).data;let upper=0,outer=0,transparent=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const alpha=pixels[(y*w+x)*4+3],contains=Shape.contains(mask,(x+.5)/w,(y+.5)/h);assert.equal(contains,alpha>=32);assert.equal(clipped[(y*w+x)*4+3]>=128,contains);
   if(contains&&y<h*.4)upper++;if(contains&&(x<w*.16||x>w*.88))outer++;if(!contains)transparent++;
  }
  assert(upper>0,barn.name+' roof');assert(outer>0,barn.name+' sides');assert(transparent>0,barn.name+' corners');
  const x=(i%2)*600,y=Math.floor(i/2)*300;pc.fillStyle='#273942';pc.font='18px sans-serif';pc.fillText('Nest '+(i+1)+' / image + hit silhouette',x+16,y+26);pc.drawImage(canvas,x+16,y+40,256,256);pc.drawImage(clip,x+310,y+40,256,256);
 }
 const out=path.join(root,'artifacts/pen-shape');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'all-nests.png'),proof.toBuffer('image/png'));
});
