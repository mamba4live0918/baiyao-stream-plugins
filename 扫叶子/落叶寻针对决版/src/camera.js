(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafCamera=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STAGE_W=1440,STAGE_H=810;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
class Camera{
  constructor(opts={}){this.set(opts);}
  set({elevation=this.elevation??60,focal=this.focal??1500,distance=this.distance??1500,center=this.center??[720,500],target=this.target??[0,0,0]}={}){
    this.elevation=Math.min(75,Math.max(45,Number(elevation)||60));
    this.focal=focal;this.distance=distance;this.center=center.slice();this.target=target.slice();
    const t=this.elevation*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
    this.forward=[0,c,-s];this.right=[1,0,0];this.up=[0,s,c];
    this.position=[this.target[0],this.target[1]-distance*c,this.target[2]+distance*s];
    return this;
  }
  toCamera(p){const d=[p[0]-this.position[0],p[1]-this.position[1],p[2]-this.position[2]];return[dot(d,this.right),dot(d,this.up),dot(d,this.forward)];}
  project(p){const [x,y,z]=this.toCamera(p);return{x:this.center[0]+this.focal*x/z,y:this.center[1]-this.focal*y/z,depth:z,scale:this.focal/z};}
  ray(sx,sy){
    const dx=(sx-this.center[0])/this.focal,dy=-(sy-this.center[1])/this.focal,R=this.right,U=this.up,F=this.forward;
    const d=[R[0]*dx+U[0]*dy+F[0],R[1]*dx+U[1]*dy+F[1],R[2]*dx+U[2]*dy+F[2]],n=Math.hypot(d[0],d[1],d[2]);
    return{origin:this.position.slice(),dir:[d[0]/n,d[1]/n,d[2]/n]};
  }
  viewProj(near=10,far=20000){
    const f=this.focal,[cx,cy]=this.center,C=this.position,row=v=>[v[0],v[1],v[2],-dot(v,C)];
    const Rr=row(this.right),Ur=row(this.up),Fr=row(this.forward),a=(far+near)/(far-near),b=-2*far*near/(far-near);
    const rows=[Rr.map((v,i)=>2*f/STAGE_W*v+(2*cx/STAGE_W-1)*Fr[i]),Ur.map((v,i)=>2*f/STAGE_H*v+(1-2*cy/STAGE_H)*Fr[i]),Fr.map((v,i)=>a*v+(i===3?b:0)),Fr];
    const m=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)m[c*4+r]=rows[r][c];return m;
  }
}
function rayAtHeight(ray,z){const t=(z-ray.origin[2])/ray.dir[2];return{t,x:ray.origin[0]+ray.dir[0]*t,y:ray.origin[1]+ray.dir[1]*t,z};}
return{Camera,rayAtHeight,dot,STAGE_W,STAGE_H};
});
