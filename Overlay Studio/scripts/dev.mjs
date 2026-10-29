import http from 'node:http';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{createStudio}=require('../electron/service.cjs');
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||54921),origin=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex'),clients=new Set();
const studio=await createStudio({root:process.env.OVERLAY_STUDIO_DATA||path.join(base,'.dev-data'),skillDir:path.join(base,'resources/build-live-overlay-games'),emit:event=>{for(const response of clients)response.write(`data: ${JSON.stringify(event)}\n\n`);}});
const vite=await createServer({root:base,server:{middlewareMode:true},appType:'spa'});
const respond=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){respond(res,403,{error:'Host rejected'});return;}
 const url=new URL(req.url,origin);
 if(url.pathname==='/api/session'&&req.method==='GET'){respond(res,200,{token});return;}
 if(url.pathname==='/api/events'&&req.method==='GET'){
  if(url.searchParams.get('token')!==token){respond(res,403,{error:'Invalid session'});return;}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
 }
 if(url.pathname==='/api/invoke'&&req.method==='POST'){
  if(req.headers['x-studio-token']!==token||req.headers.origin!==origin){respond(res,403,{error:'Invalid local request'});return;}
  try{let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024)throw new Error('请求过大');body+=chunk;}const {action,payload}=JSON.parse(body);respond(res,200,{value:await studio.invoke(action,payload)});}catch(error){respond(res,400,{error:error.message});}return;
 }
 if(url.pathname.startsWith('/api/')){respond(res,404,{error:'Not found'});return;}
 vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
});
server.listen(port,'127.0.0.1',()=>console.log(`Overlay Studio development: ${origin}`));
async function close(){for(const response of clients)response.end();await studio.dispose();await vite.close();server.close(()=>process.exit(0));}
process.on('SIGINT',close);process.on('SIGTERM',close);
