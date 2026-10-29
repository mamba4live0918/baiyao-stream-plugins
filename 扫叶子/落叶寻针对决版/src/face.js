(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafFace=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// 护脸圈：屏幕上的一块透明实体（硬规则）。一律按叶片在画面上的投影（含高度）判断，投影碰到圈就算进圈。
const PAD=2,EDGE=20,NEEDLE_R=10;
const leafRadius=(size,scale)=>size*0.5*scale;
class FaceGuard{
  constructor({cam,get}){this.cam=cam;this.get=get;}
  active(){const f=this.get();return f&&f.enabled?f:null;}
  hits(x,y,z,size){
    const f=this.active();if(!f)return false;
    const s=this.cam.project([x,y,z]);return Math.hypot(s.x-f.x,s.y-f.y)<f.r+leafRadius(size,s.scale);
  }
  // 一步推出：投影在高度 z 处碰到圈，就沿「圈心→投影」方向在屏幕上推到圈外，再换回地面
  // （屏幕 x≈地面 x·scale，屏幕 y≈−地面 y·scale·sin仰角）。不碰圈返回 null。
  push(pile,x,y,z,size){
    const f=this.active();if(!f)return null;
    const s=this.cam.project([x,y,z]),dx=s.x-f.x,dy=s.y-f.y,d=Math.hypot(dx,dy),need=f.r+leafRadius(size,s.scale)+PAD;
    if(d>=need)return null;
    const ux=d>1e-3?dx/d:0,uy=d>1e-3?dy/d:1,k=need-d+1,sinE=Math.sin(this.cam.elevation*Math.PI/180);
    return{x:Math.min(pile.x0+pile.w-EDGE,Math.max(pile.x0+EDGE,x+ux*k/s.scale)),y:Math.min(pile.y0+pile.h-EDGE,Math.max(pile.y0+EDGE,y-uy*k/(s.scale*sinE)))};
  }
  // 预估落点（效果动画的目的地用）：按当前表面高度估；真正落地时 pile.dropLeaf 还会按真实高度再推一次
  adjust(pile,p){
    let x=p.x,y=p.y;
    for(let i=0;i<8;i++){const q=this.push(pile,x,y,pile.heightAt(x,y)+pile.thickness,p.size);if(!q)break;x=q.x;y=q.y;}
    return{x,y};
  }
  // 交给 pile.landing：任何 dropLeaf 都按真实落点高度避开圈
  landingFor(pile){return(l,z)=>this.push(pile,l.x,l.y,z,l.size);}
  // 开关圈、拖完圈、改仰角后：投影碰到圈的叶子从低到高搬到圈外重新落下
  relocate(pile){
    if(!this.active())return 0;
    const out=pile.leaves.filter(l=>this.hits(l.x,l.y,l.z,l.size));if(!out.length)return 0;
    pile.removeMany(out);
    out.sort((a,b)=>a.z-b.z||a.id-b.id);
    const keep=pile.landing;pile.landing=this.landingFor(pile);
    for(const l of out){const q=this.adjust(pile,l);pile.dropLeaf({x:q.x,y:q.y,yaw:l.yaw,size:l.size,type:l.type});}
    pile.landing=keep;
    return out.length;
  }
  needleHits(pile){
    const f=this.active(),n=pile.needle;if(!f||!n||n.pulled)return false;
    return pile.needleSamples(n).some(([x,y,z])=>{const s=this.cam.project([x,y,z]);return Math.hypot(s.x-f.x,s.y-f.y)<f.r+NEEDLE_R*s.scale;});
  }
}
return{FaceGuard};
});
