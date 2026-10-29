(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafLayout=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const W=1440,H=810,ALPHA_MIN=32;
function fit(w,h){const scale=Math.min(w/W,h/H);return{scale,x:(w-W*scale)/2,y:(h-H*scale)/2};}
function point(x,y,rect){return{x:(x-rect.left)*W/rect.width,y:(y-rect.top)*H/rect.height};}
function spriteComponents(data,w,h,alphaMin=ALPHA_MIN){
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),best=new Array(9).fill(null);
  for(let p=0;p<w*h;p++){
    if(seen[p]||data[p*4+3]<alphaMin)continue;
    let read=0,end=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=p;seen[p]=1;
    while(read<end){
      const q=queue[read++],x=q%w,y=(q/w)|0;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      const nb=[x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1];
      for(const n of nb)if(n>=0&&!seen[n]&&data[n*4+3]>=alphaMin){seen[n]=1;queue[end++]=n;}
    }
    if(end<=20)continue;
    const col=Math.min(2,Math.floor((minX+maxX)/2/w*3)),row=Math.min(2,Math.floor((minY+maxY)/2/h*3)),k=row*3+col;
    if(best[k]&&best[k].area>=end)continue;
    const rw=maxX-minX+1,rh=maxY-minY+1,mask=new Uint8Array(rw*rh);
    for(let i=0;i<end;i++){const q=queue[i];mask[(((q/w)|0)-minY)*rw+(q%w-minX)]=1;}
    best[k]={x:minX,y:minY,w:rw,h:rh,area:end,mask};
  }
  return best;
}
return{width:W,height:H,ALPHA_MIN,fit,point,spriteComponents};
});
