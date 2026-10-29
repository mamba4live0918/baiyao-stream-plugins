const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function resolveDelivered(rel){
 if(typeof rel!=='string'||path.isAbsolute(rel)||path.relative(root,path.resolve(root,rel)).startsWith('..'))return null;
 const file=p=>{try{return fs.statSync(p).isFile()?path.resolve(p):null;}catch{return null;}};
 const current=file(path.join(root,rel));if(current)return current;
 const roots=Object.hasOwn(process.env,'PET_ARCHIVE_ROOTS')?process.env.PET_ARCHIVE_ROOTS.split(';').filter(Boolean):[path.join(root,'..','归档')];
 for(const base of roots){let dirs=[];try{dirs=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort().reverse();}catch{}for(const name of dirs){const found=file(path.join(base,name,'抓萌宠通用版',rel));if(found)return found;}}
 return null;
}
module.exports={resolveDelivered};
