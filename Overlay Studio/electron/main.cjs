const {app,BrowserWindow,ipcMain,dialog,shell,session,nativeTheme,safeStorage,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{fileURLToPath}=require('node:url');
const {createStudio}=require('./service.cjs');
app.setName('Overlay Studio');
nativeTheme.themeSource='dark';
if(process.env.OVERLAY_STUDIO_DATA)app.setPath('userData',path.resolve(process.env.OVERLAY_STUDIO_DATA));
const smokeIndex=process.argv.indexOf('--smoke-output');
const smokePath=smokeIndex>=0?process.argv[smokeIndex+1]:null;
const smokeSettings=Boolean(smokePath&&process.argv.includes('--smoke-settings'));
let window,service,closing=false;
const allowed=new Set(['bootstrap','status','projects.list','projects.create','projects.get','projects.save','projects.import','projects.seed','projects.export','projects.restore','projects.commit','jobs.start','jobs.cancel','jobs.current','rules.read','settings.save','providers.save','providers.test','providers.models','references.add','references.get','references.update','references.remove','interview.update','interview.send','review.start']);
if(!app.requestSingleInstanceLock())app.quit();
else {
app.on('second-instance',()=>{if(window){window.show();window.focus();}});
app.whenReady().then(async()=>{
 const root=path.join(app.getPath('userData'),'workspace');
 const skillDir=path.join(app.getAppPath(),'resources','build-live-overlay-games');
 const secretCodec=safeStorage.isEncryptionAvailable()?{encrypt:value=>safeStorage.encryptString(value).toString('base64'),decrypt:value=>safeStorage.decryptString(Buffer.from(value,'base64'))}:null;
 service=await createStudio({root,skillDir,secretCodec,emit:event=>{if(window&&!window.isDestroyed())window.webContents.send('studio:event',event);}});
 window=new BrowserWindow({width:1440,height:smokeSettings?1280:1000,minWidth:940,minHeight:680,title:'Overlay Studio · 直播小游戏工作台',backgroundColor:'#090b0c',show:false,autoHideMenuBar:true,icon:path.join(app.getAppPath(),'resources','icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,offscreen:Boolean(smokePath),backgroundThrottling:!smokePath}});
 window.setMenu(null);
 let markReady;
 const rendererReady=new Promise(resolve=>{markReady=resolve;});
 ipcMain.on('studio:ready',event=>{if(event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame)markReady();});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.on('will-frame-navigate',(event,details)=>{const url=details?.url||event.url||'';if(url!=='about:blank'&&url!=='about:srcdoc')event.preventDefault();});
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
  try{
   const url=new URL(details.url);
   if(url.protocol==='file:'){
    const target=fileURLToPath(url),base=path.join(app.getAppPath(),'dist');
    const rel=path.relative(base,target);callback({cancel:rel.startsWith('..')||path.isAbsolute(rel)});return;
   }
   callback({cancel:!['data:','blob:','about:','devtools:'].includes(url.protocol)});
  }catch{callback({cancel:true});}
 });
 ipcMain.handle('studio:invoke',async(event,action,payload={})=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('无效的页面请求');
  if(typeof action!=='string'||!payload||typeof payload!=='object')throw new Error('无效请求');
  if(allowed.has(action))return service.invoke(action,payload);
  if(action==='system.copyText'){
   if(typeof payload.text!=='string'||payload.text.length>30000)throw new Error('复制内容须为不超过 30000 字符的文本');
   clipboard.writeText(payload.text);return {ok:true};
  }
  if(action==='system.capturePreview'){
   const rect=Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.round(payload[key])]));
   const [width,height]=window.getContentSize();
   if(!Object.values(rect).every(Number.isFinite)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.width>4096||rect.height>4096||rect.x+rect.width>width||rect.y+rect.height>height)throw new Error('请先让预览区域完整显示在窗口内，再附加截图。');
   const png=(await window.webContents.capturePage(rect)).toPNG();
   if(png.length>4*1024*1024)throw new Error('预览截图超过 4 MiB，请缩小预览区域后重试。');
   return {dataUrl:'data:image/png;base64,'+png.toString('base64')};
  }
  if(action==='files.import'){
   const choice=await dialog.showOpenDialog(window,{title:'导入 HTML 插件副本',properties:['openFile'],filters:[{name:'HTML 插件',extensions:['html','htm']}]});
   if(choice.canceled)return null;const filename=choice.filePaths[0];const stat=await fs.stat(filename);
   if(!stat.isFile()||stat.size>20*1024*1024)throw new Error('请选择不超过 20 MB 的 HTML 文件');
   return service.invoke('projects.import',{name:path.basename(filename).replace(/\.html?$/i,''),html:await fs.readFile(filename,'utf8')});
  }
  if(action==='files.export'){
   const output=await service.invoke('projects.export',payload);
   const filename=output.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.html?$/i,'')+'.html';
   const choice=await dialog.showSaveDialog(window,{title:'导出独立 HTML 插件',defaultPath:path.join(app.getPath('downloads'),filename),filters:[{name:'HTML 插件',extensions:['html']}]});
   if(choice.canceled)return {cancelled:true};await fs.writeFile(choice.filePath,output.html,'utf8');return {cancelled:false,path:choice.filePath};
  }
  if(action==='system.openData'){await shell.openPath(root);return {ok:true};}
  if(action==='system.chooseCodex'){
   const choice=await dialog.showOpenDialog(window,{title:'选择 Codex 可执行文件',properties:['openFile'],filters:[{name:'Codex',extensions:['exe']}]});
   return choice.canceled?null:{path:choice.filePaths[0]};
  }
  throw new Error('不支持的操作');
 });
 await window.loadFile(path.join(app.getAppPath(),'dist','index.html'),smokeSettings?{query:{view:'settings'}}:{});
 if(smokePath){
  let readyTimer;
  try{await Promise.race([rendererReady,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(new Error('界面初始化超时')),25000);})]);}finally{clearTimeout(readyTimer);}
  const status=await service.invoke('status');
  const encryptionCheck='overlay-studio-local-encryption-check';
  const keyEncryptionRoundtrip=Boolean(secretCodec&&secretCodec.decrypt(secretCodec.encrypt(encryptionCheck))===encryptionCheck);
  await fs.mkdir(path.dirname(smokePath),{recursive:true});await fs.writeFile(smokePath,JSON.stringify({title:window.getTitle(),url:window.webContents.getURL(),status,keyStorageAvailable:Boolean(secretCodec),keyEncryptionRoundtrip},null,2));
  await fs.writeFile(smokePath+'.png',(await window.webContents.capturePage()).toPNG());app.quit();
 }else window.show();
}).catch(async error=>{if(smokePath)await fs.writeFile(smokePath,JSON.stringify({error:error.message})).catch(()=>{});else dialog.showErrorBox('Overlay Studio 启动失败',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(service&&!closing){event.preventDefault();closing=true;Promise.resolve(service.dispose()).finally(()=>app.quit());}});
}

