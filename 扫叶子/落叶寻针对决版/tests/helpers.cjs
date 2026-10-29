function discMask(M=32,r=0.45){const data=new Uint8Array(M*M);for(let row=0;row<M;row++)for(let col=0;col<M;col++){const u=(col+0.5)/M-0.5,v=0.5-(row+0.5)/M;if(u*u+v*v<=r*r)data[row*M+col]=1;}return{size:M,data};}
function quadrantMask(M=32){const data=new Uint8Array(M*M);for(let row=0;row<M/2;row++)for(let col=0;col<M/2;col++)data[row*M+col]=1;return{size:M,data};}
const discs=(r=0.45)=>Array.from({length:6},()=>discMask(32,r));
module.exports={discMask,quadrantMask,discs};
