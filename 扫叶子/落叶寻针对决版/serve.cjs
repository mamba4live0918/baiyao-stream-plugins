const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.PORT||8768);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{let file;try{const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);file=path.resolve(root,'.'+(name==='/'?'/落叶寻针对决版/试玩.html':name));if(name.includes('\0')||file!==root&&!file.startsWith(root+path.sep))throw new Error('outside');}catch{res.writeHead(400).end();return;}
fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(data);});
}).listen(port,'127.0.0.1',()=>console.log(`Leaf duel preview: http://127.0.0.1:${port}/`));
