const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studio',{
 isDesktop:true,
 ready:()=>ipcRenderer.send('studio:ready'),
 invoke:(action,payload={})=>ipcRenderer.invoke('studio:invoke',action,payload),
 subscribe(fn){const listener=(_event,data)=>fn(data);ipcRenderer.on('studio:event',listener);return ()=>ipcRenderer.removeListener('studio:event',listener);}
});
