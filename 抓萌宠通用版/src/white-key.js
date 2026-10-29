/* Optional color-keying for user-supplied animation frames. */
(function(root){
'use strict';
function keyPixels(source,width,height,tolerance=28){
 const count=width*height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||source?.length!==count*4)throw Error('无效的逐帧像素');
 const pixels=new Uint8ClampedArray(source);let left=width,right=-1,top=height,bottom=-1,solid=0;
 for(let i=0;i<count;i++)if(source[i*4+3]>=245){const x=i%width,y=(i-x)/width;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);solid++}
 const boxW=right-left+1,boxH=bottom-top+1,boxArea=boxW*boxH;
 if(boxW<3||boxH<3||boxArea<Math.max(9,count*.15)||solid<boxArea*.7)return{pixels,removed:0,reason:'already-transparent'};
 const edgeIndices=new Set();
 for(let x=left;x<=right;x++){edgeIndices.add(top*width+x);edgeIndices.add(bottom*width+x)}
 for(let y=top+1;y<bottom;y++){edgeIndices.add(y*width+left);edgeIndices.add(y*width+right)}
 const border=[...edgeIndices].filter(i=>source[i*4+3]>=245);
 if(border.length<edgeIndices.size*.7)return{pixels,removed:0,reason:'already-transparent'};
 const channel=k=>{const values=border.map(i=>source[i*4+k]).sort((a,b)=>a-b);return values[Math.floor(values.length/2)]};
 const bg=[channel(0),channel(1),channel(2)];
 if(Math.min(...bg)<215||Math.max(...bg)-Math.min(...bg)>25)return{pixels,removed:0,reason:'not-light'};
 const threshold=Math.max(0,Math.min(48,Number.isFinite(tolerance)?tolerance:28));
 const difference=i=>Math.max(Math.abs(source[i*4]-bg[0]),Math.abs(source[i*4+1]-bg[1]),Math.abs(source[i*4+2]-bg[2]));
 const eligible=i=>source[i*4+3]>=200&&difference(i)<=threshold;
 if(border.filter(eligible).length<border.length*.6)return{pixels,removed:0,reason:'not-uniform'};
 const selected=new Uint8Array(count),queue=new Int32Array(count);let head=0,tail=0;
 const push=i=>{if(!selected[i]&&eligible(i)){selected[i]=1;queue[tail++]=i}};
 for(const i of edgeIndices)push(i);
 while(head<tail){const i=queue[head++],x=i%width,y=(i-x)/width;if(x>0)push(i-1);if(x+1<width)push(i+1);if(y>0)push(i-width);if(y+1<height)push(i+width)}
 for(let i=0;i<count;i++)if(selected[i]){const o=i*4;pixels[o]=pixels[o+1]=pixels[o+2]=pixels[o+3]=0}
 const feather=24;
 for(let i=0;i<count;i++){
  if(selected[i]||source[i*4+3]===0)continue;
  const x=i%width,y=(i-x)/width,near=(x>0&&selected[i-1])||(x+1<width&&selected[i+1])||(y>0&&selected[i-width])||(y+1<height&&selected[i+width]);
  if(!near)continue;
  const delta=difference(i);if(delta<=threshold||delta>=threshold+feather)continue;
  const opacity=(delta-threshold)/feather,o=i*4;
  for(let k=0;k<3;k++)pixels[o+k]=Math.max(0,Math.min(255,(source[o+k]-(1-opacity)*bg[k])/opacity));
  pixels[o+3]=Math.round(source[o+3]*opacity);
 }
 return{pixels,removed:tail,bg};
}
const api={keyPixels};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SealWhiteKey=api;
})(typeof window==='undefined'?globalThis:window);
