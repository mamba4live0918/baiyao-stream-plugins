(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PuppetPinchFrames=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const FPS=12,COUNT=8,HEIGHT_RATIO=1,POSES=[0,.25,.60,.88,.78,1,.42,.08],TILTS=[0,.1,-.05,0,-.22,.22,-.15,.05];
let bank=null,bankImage=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function frameAt(elapsed,duration){
 if(!Number.isFinite(elapsed)||!Number.isFinite(duration)||duration<=0)throw new RangeError('逐帧时长无效');
 const p=clamp(elapsed/duration,0,1);if(p<.12)return 0;if(p<.18)return 1;if(p<.22)return 2;
 if(p<.78){const sequence=[3,3,4,4,3,3,5,5];return sequence[Math.floor(Math.max(0,elapsed-duration*.22)/(1000/FPS))%sequence.length];}
 if(p<.86)return 6;if(p<1)return 7;return 0;
}
function warpPoint(x,y,contact,frame){
 if(![x,y,contact?.x,contact?.y].every(Number.isFinite)||!Number.isInteger(frame)||frame<0||frame>=COUNT)throw new RangeError('逐帧坐标无效');
 const influence=smooth(.56,.83,x)*(1-smooth(.07,.28,Math.abs(y-contact.y)));
 const grip=POSES[frame],tilt=TILTS[frame],dx=x-contact.x,dy=y-contact.y;
 return {x:x-dx*.012*grip*influence,y:y-dy*.18*grip*influence+dx*.003*tilt*influence};
}
function triangle(ctx,source,s,d){
 const [p,q,r]=s,[u,v,w]=d;
 const den=p.x*(q.y-r.y)+q.x*(r.y-p.y)+r.x*(p.y-q.y);
 const coeff=axis=>({a:(u[axis]*(q.y-r.y)+v[axis]*(r.y-p.y)+w[axis]*(p.y-q.y))/den,c:(u[axis]*(r.x-q.x)+v[axis]*(p.x-r.x)+w[axis]*(q.x-p.x))/den,e:(u[axis]*(q.x*r.y-r.x*q.y)+v[axis]*(r.x*p.y-p.x*r.y)+w[axis]*(p.x*q.y-q.x*p.y))/den});
 const X=coeff('x'),Y=coeff('y'),center={x:(u.x+v.x+w.x)/3,y:(u.y+v.y+w.y)/3};
 const expanded=d.map(p=>{const dx=p.x-center.x,dy=p.y-center.y,length=Math.hypot(dx,dy)||1;return {x:p.x+dx/length*.4,y:p.y+dy/length*.4};});
 ctx.save();ctx.beginPath();ctx.moveTo(expanded[0].x,expanded[0].y);ctx.lineTo(expanded[1].x,expanded[1].y);ctx.lineTo(expanded[2].x,expanded[2].y);ctx.closePath();ctx.clip();ctx.setTransform(X.a,Y.a,X.c,Y.c,X.e,Y.e);ctx.drawImage(source,0,0);ctx.restore();
}
function prepare(image,meta){
 if(bank&&bankImage===image)return bank;
 if(!image?.naturalWidth||!meta?.contact||!root.document)throw new Error('手部逐帧素材尚未加载');
 const width=Math.min(768,image.naturalWidth),height=Math.max(1,Math.round(width*image.naturalHeight/image.naturalWidth));
 const source=root.document.createElement('canvas');source.width=width;source.height=height;source.getContext('2d').drawImage(image,0,0,width,height);
 // One indexed surface avoids alpha accumulating along separately clipped
 // canvas triangles. Extend only the forearm, keeping the hand/contact fixed.
 const targetHeight=Math.round(height*HEIGHT_RATIO),surface=root.document.createElement('canvas');surface.width=width;surface.height=targetHeight;
 const gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
 let program,buffer,texture;
 if(gl){
   const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('逐帧渲染初始化失败');return s;};
   const vs=shader(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position,0.,1.);}');
   const fs=shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 tex;uniform sampler2D sprite;void main(){gl_FragColor=texture2D(sprite,tex);}');
   program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
   buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   const pos=gl.getAttribLocation(program,'position'),uv=gl.getAttribLocation(program,'uv');gl.enableVertexAttribArray(pos);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,16,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
   texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.viewport(0,0,width,targetHeight);gl.disable(gl.BLEND);
 }
 const frames=[];
 for(let frame=0;frame<COUNT;frame++){
   const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=targetHeight;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';const vertices=[];
   const cols=12,rows=16;
   for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
     const uv=[{x:col/cols,y:row/rows},{x:(col+1)/cols,y:row/rows},{x:(col+1)/cols,y:(row+1)/rows},{x:col/cols,y:(row+1)/rows}];
     const src=uv.map(p=>({x:p.x*width,y:p.y*height}));
     const dst=uv.map(p=>{const v=warpPoint(p.x,p.y,meta.contact,frame);const y=v.y<=.52?v.y:.52+(v.y-.52)*(HEIGHT_RATIO-.52)/.48;return {x:v.x*width,y:y*height};});
     if(gl){for(const i of [0,1,2,0,2,3])vertices.push(dst[i].x/width*2-1,1-dst[i].y/targetHeight*2,uv[i].x,uv[i].y);}
     else{triangle(ctx,source,[src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);triangle(ctx,source,[src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);}
   }
   if(gl){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/4);ctx.drawImage(surface,0,0);}
   frames.push(canvas);
 }
 if(gl){gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
 bank={width,height:targetHeight,frames};bankImage=image;return bank;
}
function draw(canvas,frame){
 if(!bank||!Number.isInteger(frame)||frame<0||frame>=COUNT)throw new Error('手部逐帧素材尚未就绪');
 if(canvas.width!==bank.width)canvas.width=bank.width;if(canvas.height!==bank.height)canvas.height=bank.height;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bank.frames[frame],0,0);canvas.dataset.frame=String(frame);
}
return {FPS,COUNT,HEIGHT_RATIO,frameAt,warpPoint,prepare,draw};
});
