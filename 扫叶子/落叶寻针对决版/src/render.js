(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafRender=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STRIDE=17;
const VS=`#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_center;
layout(location=2) in vec3 a_u;
layout(location=3) in vec3 a_v;
layout(location=4) in vec4 a_uv;
layout(location=5) in vec4 a_tint;
uniform mat4 u_viewProj;
out vec2 v_uv;out vec4 v_tint;
void main(){vec3 p=a_center+a_u*a_corner.x+a_v*a_corner.y;gl_Position=u_viewProj*vec4(p,1.0);v_uv=mix(a_uv.xy,a_uv.zw,a_corner+0.5);v_tint=a_tint;}`;
const FS=`#version 300 es
precision mediump float;
uniform sampler2D u_tex;in vec2 v_uv;in vec4 v_tint;out vec4 o;
void main(){vec4 c=texture(u_tex,v_uv);o=vec4(c.rgb*v_tint.rgb,c.a)*v_tint.a;}`;
class SpriteBatch{
  constructor(capacity=256){this.data=new Float32Array(Math.max(1,capacity)*STRIDE);this.count=0;}
  clear(){this.count=0;return this;}
  push(c,u,v,uv,tint){
    if((this.count+1)*STRIDE>this.data.length){const d=new Float32Array(this.data.length*2);d.set(this.data);this.data=d;}
    const d=this.data,o=this.count*STRIDE;
    d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=u[0];d[o+4]=u[1];d[o+5]=u[2];d[o+6]=v[0];d[o+7]=v[1];d[o+8]=v[2];
    d[o+9]=uv[0];d[o+10]=uv[1];d[o+11]=uv[2];d[o+12]=uv[3];d[o+13]=tint[0];d[o+14]=tint[1];d[o+15]=tint[2];d[o+16]=tint[3];
    this.count++;return this;
  }
  flat(x,y,z,yaw,size,uv,tint){const c=Math.cos(yaw)*size,s=Math.sin(yaw)*size;return this.push([x,y,z],[c,s,0],[-s,c,0],uv,tint);}
  billboard(base,w,h,cam,uv,tint){const U=cam.up,R=cam.right;return this.push([base[0]+U[0]*h/2,base[1]+U[1]*h/2,base[2]+U[2]*h/2],[R[0]*w,R[1]*w,R[2]*w],[U[0]*h,U[1]*h,U[2]*h],uv,tint);}
}
function compile(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('着色器编译失败：'+gl.getShaderInfoLog(s));return s;}
class SpriteRenderer{
  constructor(canvas){
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true,depth:false,stencil:false});
    if(!gl)throw new Error('WebGL2 不可用');
    this.gl=gl;this.canvas=canvas;this.textures=new Map();
    const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,VS));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('着色器链接失败：'+gl.getProgramInfoLog(p));
    this.prog=p;this.uViewProj=gl.getUniformLocation(p,'u_viewProj');this.uTex=gl.getUniformLocation(p,'u_tex');
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,.5,.5]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    this.inst=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.inst);
    for(const [loc,size,off]of [[1,3,0],[2,3,3],[3,3,6],[4,4,9],[5,4,13]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,STRIDE*4,off*4);gl.vertexAttribDivisor(loc,1);}
    gl.bindVertexArray(null);
  }
  texture(name,source){
    const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.textures.set(name,t);return t;
  }
  resize(w,h){if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
  begin(viewProj){
    const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);gl.uniformMatrix4fv(this.uViewProj,false,viewProj);gl.uniform1i(this.uTex,0);gl.bindVertexArray(this.vao);
  }
  draw(name,batch){
    if(!batch.count)return;const gl=this.gl;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures.get(name));
    gl.bindBuffer(gl.ARRAY_BUFFER,this.inst);gl.bufferData(gl.ARRAY_BUFFER,batch.data.subarray(0,batch.count*STRIDE),gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,batch.count);
  }
}
return{SpriteBatch,SpriteRenderer,STRIDE};
});
