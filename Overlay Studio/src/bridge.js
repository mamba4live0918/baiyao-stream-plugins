const listeners=new Set();
let sessionPromise, events;
const session=()=>sessionPromise??=fetch('/api/session').then(r=>{if(!r.ok)throw new Error('本地服务不可用');return r.json();});
async function request(action,payload={}){
 const {token}=await session();
 const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify({action,payload})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败');return result.value;
}
async function browserInvoke(action,payload={}){
 if(action==='system.copyText'){
  if(typeof payload.text!=='string'||payload.text.length>30000)throw new Error('复制内容须为不超过 30000 字符的文本');
  await navigator.clipboard.writeText(payload.text);return {ok:true};
 }
 if(action==='files.export'){
  const {name,html}=await request('projects.export',payload);const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name.endsWith('.html')?name:name+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);return {cancelled:false,path:a.download};
 }
 if(action==='files.import')return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='.html,.htm';
  input.oncancel=()=>resolve(null);input.onchange=async()=>{try{const file=input.files[0];if(!file)return resolve(null);if(file.size>20*1024*1024)throw new Error('HTML 文件不能超过 20 MB');resolve(await request('projects.import',{name:file.name.replace(/\.html?$/i,''),html:await file.text()}));}catch(e){reject(e);}};input.click();
 });
 if(action.startsWith('system.'))throw new Error('此操作请在桌面 App 中使用。');
 return request(action,payload);
}
const browserBridge={invoke:browserInvoke,isDesktop:false,subscribe(fn){
 listeners.add(fn);
 if(!events)session().then(({token})=>{if(events||!listeners.size)return;events=new EventSource('/api/events?token='+encodeURIComponent(token));events.onmessage=e=>{try{const data=JSON.parse(e.data);for(const f of listeners)f(data);}catch{}};}).catch(()=>{});
 return ()=>{listeners.delete(fn);if(!listeners.size&&events){events.close();events=null;}};
}};
export const studio=window.studio||browserBridge;
