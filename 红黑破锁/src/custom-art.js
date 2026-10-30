/* User artwork stays separate from bundled theme artwork; only committed writes become visible. */
(()=>{
  'use strict';
  const THEME_NAMES={fufu:'芙芙奈 · 奶酪鼠鼠',horror:'暗黑恐怖 · 红黑',cyber:'赛博终端',typewriter:'复古打字机',notebook:'手写纸张',pixel:'像素游戏',chalk:'课堂黑板',terminal:'老式电脑',cream:'可爱奶油'};
  const KINDS={chain:'锁链',lock:'锁头',cageBar:'笼子竖栏',cageTop:'笼子上横梁',cageBottom:'笼子底座',cageDoor:'门框横梁',cageLatch:'门扣'},MAX_BYTES=5*1024*1024,MAX_SIDE=4096,MAX_TOTAL_BYTES=90*1024*1024;
  const CAGE={cageBar:'bar',cageTop:'top',cageBottom:'bottom',cageDoor:'door',cageLatch:'latch'};
  const blobOf=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('无法生成素材图片')),'image/png'));
  async function cageParts(kind,canvas){
    if(!CAGE[kind]||kind==='cageLatch')return null;
    const vertical=kind==='cageBar',axis=vertical?canvas.height:canvas.width,cross=vertical?canvas.width:canvas.height;
    if(axis<cross*1.5)throw new Error(vertical?'竖栏请使用竖长图片，可先下载素材示例':'横梁请使用横长图片，可先下载素材示例');
    const cap=Math.max(1,Math.floor(axis*.2)),middle=axis-cap*2,urls=[];
    const slice=async(start,length,mirror=false)=>{const c=document.createElement('canvas');c.width=vertical?cross:length*(mirror?2:1);c.height=vertical?length*(mirror?2:1):cross;const x=c.getContext('2d');x.drawImage(canvas,vertical?0:start,vertical?start:0,vertical?cross:length,vertical?length:cross,0,0,vertical?cross:length,vertical?length:cross);if(mirror){x.save();x.translate(vertical?0:length*2,vertical?length*2:0);x.scale(vertical?1:-1,vertical?-1:1);x.drawImage(canvas,vertical?0:start,vertical?start:0,vertical?cross:length,vertical?length:cross,0,0,vertical?cross:length,vertical?length:cross);x.restore();}const url=URL.createObjectURL(await blobOf(c));urls.push(url);return url;};
    try{return {head:await slice(0,cap),mid:await slice(cap,middle,true),tail:await slice(axis-cap,cap),capRatio:cap/cross,tileRatio:middle*2/cross,urls};}catch(e){urls.forEach(URL.revokeObjectURL);throw e;}
  }
  async function builtinExample(kind,overlay){
    const style=getComputedStyle(overlay),url=value=>value.trim().replace(/^url\(["']?/,'').replace(/["']?\)$/,'');
    const read=async value=>{const im=new Image();im.src=url(value);await im.decode();return im;};
    const canvas=document.createElement('canvas');let images,vertical=false;
    if(!CAGE[kind]||kind==='cageLatch'){images=[await read(style.getPropertyValue(CAGE[kind]?'--cage-latch-image':'--typing-lock-'+(kind==='lock'?'padlock':'chain')))];canvas.width=images[0].width;canvas.height=images[0].height;canvas.getContext('2d').drawImage(images[0],0,0);}
    else{vertical=kind==='cageBar';images=await Promise.all(['head','mid','tail'].map(part=>read(style.getPropertyValue('--cage-'+CAGE[kind]+'-'+part))));canvas.width=vertical?images[1].width:images.reduce((n,im)=>n+im.width,0);canvas.height=vertical?images.reduce((n,im)=>n+im.height,0):images[1].height;const ctx=canvas.getContext('2d');let offset=0;for(const im of images){ctx.drawImage(im,vertical?0:offset,vertical?offset:0);offset+=vertical?im.height:im.width;}}
    if(Math.max(canvas.width,canvas.height)>1024){const small=document.createElement('canvas'),ratio=1024/Math.max(canvas.width,canvas.height);small.width=Math.max(1,Math.round(canvas.width*ratio));small.height=Math.max(1,Math.round(canvas.height*ratio));small.getContext('2d').drawImage(canvas,0,0,small.width,small.height);return small;}return canvas;
  }
  const DB_NAME='red-black-lock-art-v1',STORE='art',MIMES=new Set(['image/png','image/jpeg','image/webp']);
  const CANCELLED=()=>new Error('素材操作已过期');
  const keyFor=(theme,kind)=>theme+':'+kind;
  const base64=bytes=>{const v=new Uint8Array(bytes);let text='';for(let i=0;i<v.length;i+=0x8000)text+=String.fromCharCode.apply(null,v.subarray(i,i+0x8000));return btoa(text);};
  function readBase64(text){
    if(typeof text!=='string'||!text.length||text.length>Math.ceil(MAX_BYTES/3)*4+4||!(/^[A-Za-z0-9+/]*={0,2}$/.test(text)))throw new Error('图片数据无效或超过 5 MB');
    const raw=atob(text),v=new Uint8Array(raw.length);if(!v.length||v.length>MAX_BYTES)throw new Error('图片不能超过 5 MB');
    for(let i=0;i<raw.length;i++)v[i]=raw.charCodeAt(i);return v.buffer;
  }
  function imageType(bytes){
    const v=new Uint8Array(bytes);
    if(v.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>v[i]===x))return 'image/png';
    if(v.length>=3&&v[0]===255&&v[1]===216&&v[2]===255)return 'image/jpeg';
    if(v.length>=16&&String.fromCharCode(...v.subarray(0,4))==='RIFF'&&String.fromCharCode(...v.subarray(8,12))==='WEBP')return 'image/webp';
    throw new Error('请选择 PNG、JPEG 或 WebP 图片');
  }
  async function decodeArt(bytes,name,type,kind){
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1||bytes.byteLength>MAX_BYTES)throw new Error('图片不能为空或超过 5 MB');
    if(type&&!MIMES.has(type))throw new Error('请选择 PNG、JPEG 或 WebP 图片');
    const detected=imageType(bytes),blob=new Blob([bytes],{type:detected});
    // Reject excessive PNG dimensions before allocating the browser decoder.
    if(detected==='image/png'){
      const view=new DataView(bytes);if(view.getUint32(16)>MAX_SIDE||view.getUint32(20)>MAX_SIDE)throw new Error('图片宽高各不能超过 4096 像素');
    }
    let decoded,sourceUrl;
    try{
      if(typeof createImageBitmap==='function')decoded=await createImageBitmap(blob);
      else{sourceUrl=URL.createObjectURL(blob);decoded=new Image();decoded.src=sourceUrl;await decoded.decode();}
      const width=decoded.width||decoded.naturalWidth,height=decoded.height||decoded.naturalHeight;
      if(!width||!height||width>MAX_SIDE||height>MAX_SIDE)throw new Error('图片宽高各不能超过 4096 像素');
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('浏览器无法读取图片');
      ctx.drawImage(decoded,0,0);const rgba=ctx.getImageData(0,0,width,height).data;
      let left=width,top=height,right=-1,bottom=-1,variation=false;
      const first=[rgba[0],rgba[1],rgba[2],rgba[3]];
      for(let y=0,i=0;y<height;y++)for(let x=0;x<width;x++,i+=4){
        if(!variation&&(rgba[i]!==first[0]||rgba[i+1]!==first[1]||rgba[i+2]!==first[2]||rgba[i+3]!==first[3]))variation=true;
        if(rgba[i+3]<=8)continue;
        if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
      }
      if(right<left||bottom<top||!variation)throw new Error('图片为空白，请选择能看见图案的图片');
      const crop=document.createElement('canvas');crop.width=right-left+1;crop.height=bottom-top+1;
      crop.getContext('2d').drawImage(canvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
      const cropped=await new Promise((resolve,reject)=>crop.toBlob(b=>b?resolve(b):reject(new Error('无法读取图片图案')),'image/png'));
      const parts=await cageParts(kind,crop);
      return {name:String(name||'自定义图片').slice(0,80),type:detected,bytes,url:URL.createObjectURL(cropped),width,height,cropWidth:crop.width,cropHeight:crop.height,parts};
    }catch(error){
      if(error instanceof Error&&(/图片|浏览器|请选择|无法/.test(error.message)))throw error;
      throw new Error('无法解码这张图片，请重新导出 PNG、JPEG 或 WebP');
    }finally{decoded?.close?.();if(sourceUrl)URL.revokeObjectURL(sourceUrl);}
  }
  function create({getTheme,getMode=()=>overlay?.dataset.mode||'lock',overlay,holder,notify=()=>{},onStorageError=()=>{}}){
    if(typeof getTheme!=='function'||!overlay)throw new Error('LockCustomArt requires getTheme and overlay');
    const records=new Map(),tokens=new Map(),pending=new Map(),activeWrites=new Set(),preparedSets=new WeakSet();
    let dbPromise,lastTheme=null,themeVersion=0,mutationVersion=0,loadVersion=0,writeQueue=Promise.resolve(),importing=false;
    const theme=()=>Object.hasOwn(THEME_NAMES,getTheme())?getTheme():'horror';
    const release=record=>{if(record?.url)URL.revokeObjectURL(record.url);record?.parts?.urls.forEach(URL.revokeObjectURL);};
    const budgetFits=(key,size)=>[...records].reduce((sum,[existing,r])=>sum+(existing===key?0:r.bytes.byteLength),0)+size<=MAX_TOTAL_BYTES;
    function storageError(error,message){onStorageError(error);notify(message||'浏览器未能保存图片，已保留原素材');}
    function cancelWrites(match){for(const entry of activeWrites)if(match(entry)){entry.cancelled=true;try{entry.tx.abort();}catch{}}}
    function syncTheme(){
      const next=theme();if(next!==lastTheme){lastTheme=next;themeVersion++;cancelWrites(entry=>entry.theme!==null&&entry.theme!==next);}
      return next;
    }
    function openDb(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
        if(!window.indexedDB){reject(new Error('IndexedDB 不可用'));return;}
        let request,blocked=false;try{request=indexedDB.open(DB_NAME,1);}catch(error){reject(error);return;}
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
        request.onerror=()=>reject(request.error||new Error('图片存储无法打开'));
        request.onblocked=()=>{blocked=true;reject(new Error('图片存储正在被其他页面占用'));};
        request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>{db.close();dbPromise=undefined;};resolve(db);};
      }).catch(error=>{dbPromise=undefined;throw error;});
      return dbPromise;
    }
    async function readRecords(){
      const db=await openDb();return await new Promise((resolve,reject)=>{
        let found=[];const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).openCursor();
        request.onsuccess=()=>{const cursor=request.result;if(cursor){found.push([cursor.key,cursor.value]);cursor.continue();}};
        tx.oncomplete=()=>resolve(found);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('图片读取失败'));
      });
    }
    function write(change,guard,originTheme=null,originKey=null,prepared=null){
      const task=async()=>{
        if(!guard())throw CANCELLED();const db=await openDb();if(!guard())throw CANCELLED();
        await new Promise((resolve,reject)=>{
          let tx;try{tx=db.transaction(STORE,'readwrite');}catch(error){reject(error);return;}
          const entry={tx,theme:originTheme,key:originKey,prepared,cancelled:false};activeWrites.add(entry);
          const fail=()=>{activeWrites.delete(entry);reject(entry.cancelled?CANCELLED():(tx.error||new Error('图片保存中断')));};
          tx.onabort=tx.onerror=fail;
          tx.oncomplete=()=>{activeWrites.delete(entry);resolve();};
          try{change(tx.objectStore(STORE));if(!guard()){entry.cancelled=true;tx.abort();}}
          catch(error){try{tx.abort();}catch{}activeWrites.delete(entry);reject(error);}
        });
      };
      const result=writeQueue.then(task,task);writeQueue=result.catch(()=>{});return result;
    }
    function apply(){
      const current=syncTheme(),chain=records.get(keyFor(current,'chain')),lock=records.get(keyFor(current,'lock'));
      if(chain){overlay.dataset.customChain='true';overlay.style.setProperty('--custom-chain-image',`url("${chain.url}")`);overlay.style.setProperty('--custom-chain-ratio',String(chain.cropWidth/chain.cropHeight));}
      else{delete overlay.dataset.customChain;overlay.style.removeProperty('--custom-chain-image');overlay.style.removeProperty('--custom-chain-ratio');}
      if(lock){overlay.dataset.customLock='true';overlay.style.setProperty('--custom-lock-image',`url("${lock.url}")`);}
      else{delete overlay.dataset.customLock;overlay.style.removeProperty('--custom-lock-image');}
      let hasCage=false;for(const [kind,slug] of Object.entries(CAGE)){const record=records.get(keyFor(current,kind));hasCage||=!!record;
        if(kind==='cageLatch'){if(record)overlay.style.setProperty('--custom-cage-latch-image',`url("${record.url}")`);else overlay.style.removeProperty('--custom-cage-latch-image');continue;}
        for(const part of ['head','mid','tail','cap-ratio','tile-ratio']){const prop='--custom-cage-'+slug+'-'+part;const value=record?.parts?.[part==='cap-ratio'?'capRatio':part==='tile-ratio'?'tileRatio':part];if(value!==undefined)overlay.style.setProperty(prop,typeof value==='number'?value:`url("${value}")`);else overlay.style.removeProperty(prop);}
      }if(hasCage)overlay.dataset.customCage='true';else delete overlay.dataset.customCage;
    }
    function render(){
      const current=syncTheme();if(!holder)return;
      const expanded=new Set([...holder.querySelectorAll('details[open]')].map(d=>d.id||d.dataset.exampleKind));
      holder.replaceChildren();holder.classList.add('custom-art-panel');holder.dataset.theme=current;
      const label=document.createElement('p');label.className='custom-art-theme';label.textContent='现在的样子：'+THEME_NAMES[current]+'（每种样子的图各存各的）';holder.append(label);
      let cageHolder=null;if(getMode()==='cage'){cageHolder=document.createElement('details');cageHolder.id='cage-custom-settings';cageHolder.open=expanded.has(cageHolder.id);const summary=document.createElement('summary');summary.textContent='换笼子的栏杆和门（可选）';cageHolder.append(summary);const hint=document.createElement('p');hint.textContent='每一项传一张零件图，不是整个笼子。照着下面的示例做，会自己拼起来，开门和拍门的动画照常。';cageHolder.append(hint);}
      for(const [kind,title] of Object.entries(KINDS)){
        if(CAGE[kind]&&!cageHolder)continue;
        const key=keyFor(current,kind),record=records.get(key),busy=pending.has(key)||importing;
        const row=document.createElement('div');row.className='custom-art-row';row.dataset.artKind=kind;
        const preview=document.createElement('div');preview.className='custom-art-preview';preview.setAttribute('aria-label',title+'素材预览');
        const builtin=CAGE[kind]?'--cage-'+CAGE[kind]+(kind==='cageLatch'?'-image':'-mid'):'--typing-lock-'+(kind==='lock'?'padlock':'chain');
        preview.style.setProperty('--custom-art-preview-image',record?`url("${record.url}")`:getComputedStyle(overlay).getPropertyValue(builtin)||'none');
        const text=document.createElement('div');text.className='custom-art-details';
        const heading=document.createElement('strong');heading.textContent=title;
        const note=document.createElement('span');note.className='custom-art-name';note.textContent=busy?'正在读取或保存…':record?'自定义：'+record.name+'（'+record.width+' × '+record.height+'）':'用的是这个样子自带的图';
        const controls=document.createElement('div');controls.className='custom-art-actions';
        const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;file.disabled=busy;
        file.setAttribute('aria-label','上传'+title+'图片');
        file.onchange=()=>{const selected=file.files?.[0];file.value='';if(theme()===current)upload(kind,selected);};
        const choose=document.createElement('button');choose.type='button';choose.className='secondary small';choose.textContent=record?'更换'+title:'上传'+title;choose.disabled=busy;choose.onclick=()=>file.click();
        const restore=document.createElement('button');restore.type='button';restore.className='secondary small';restore.textContent='恢复默认';restore.disabled=busy||!record;restore.onclick=()=>{if(theme()===current)reset(kind);};
        const example=document.createElement('details');example.className='art-example';example.dataset.exampleKind=kind;example.open=expanded.has(kind);const summary=document.createElement('summary');summary.textContent='素材示例与下载';example.append(summary);
        const sample=document.createElement('img');sample.alt=title+'透明素材示例';example.append(sample);
        const guidance=document.createElement('p');guidance.textContent=kind==='lock'?'完整正面锁头，四周透明，建议保留锁梁开口。':kind==='chain'?'横向锁链片段，环心透明，首尾便于重复衔接。':kind==='cageBar'?'一根竖长栏杆，头尾各约20%，中间材质均匀，用作笼条和门栏。':kind==='cageLatch'?'一块正面门扣片，透明底；左右门会对称使用。':'一根横长组件，头尾各约20%，中间材质均匀；不要带整座笼子背景。';example.append(guidance);
        const download=document.createElement('button');download.type='button';download.className='secondary small';download.dataset.exampleDownload=kind;download.textContent='下载透明 PNG 示例';example.append(download);
        let cached=null;const get=()=>cached||(cached=builtinExample(kind,overlay).catch(e=>{cached=null;throw e;}));
        example.addEventListener('toggle',()=>{if(example.open&&!sample.src)get().then(canvas=>{if(theme()===current&&holder.contains(example))sample.src=canvas.toDataURL('image/png');}).catch(()=>notify('示例暂未能读取，请重试'));});
        download.onclick=async()=>{download.disabled=true;try{const canvas=await get();if(theme()!==current)return;const url=URL.createObjectURL(await blobOf(canvas)),a=document.createElement('a');a.href=url;a.download=current+'-'+kind+'-示例.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{notify('示例下载失败，请重试');}finally{download.disabled=false;}};
        controls.append(choose,restore,file);text.append(heading,note,controls,example);row.append(preview,text);(CAGE[kind]?cageHolder:holder).append(row);
      }
      if(cageHolder)holder.append(cageHolder);
      const help=document.createElement('p');help.className='custom-art-help';help.textContent='PNG / JPG / WebP，一张不超过 5 MB、长宽不超过 4096。最好用透明底：锁链传横着的一小段（会自己接成一长条），锁头传完整的一个。图片存在这个浏览器里，「导出设置」会把它们一起带走。';holder.append(help);
    }
    function begin(kind){
      const current=syncTheme(),key=keyFor(current,kind),token=(tokens.get(key)||0)+1;
      tokens.set(key,token);cancelWrites(entry=>entry.key===key);pending.set(key,token);
      const snapshot={themeVersion,mutationVersion};
      return {current,key,token,valid:()=>!importing&&theme()===current&&themeVersion===snapshot.themeVersion&&mutationVersion===snapshot.mutationVersion&&tokens.get(key)===token};
    }
    async function upload(kind,file){
      if(!Object.hasOwn(KINDS,kind)||!file)return false;
      if(importing){notify('设置素材正在导入，请完成后再上传');return false;}
      if(!file.size||file.size>MAX_BYTES){notify('图片不能为空或超过 5 MB');return false;}
      if(file.type&&!MIMES.has(file.type)){notify('请选择 PNG、JPEG 或 WebP 图片');return false;}
      const currentKey=keyFor(theme(),kind);if(!budgetFits(currentKey,file.size)){notify('自定义图片合计不能超过 90 MB，请先恢复不需要的素材');return false;}
      const op=begin(kind);render();let next;
      try{
        next=await decodeArt(await file.arrayBuffer(),file.name,file.type,kind);if(!op.valid())return false;
        await write(store=>{if(!budgetFits(op.key,next.bytes.byteLength)){const error=new Error('自定义图片合计不能超过 90 MB，请先恢复不需要的素材');error.artBudget=true;throw error;}store.put({name:next.name,type:next.type,data:next.bytes},op.key);},op.valid,op.current,op.key);
        if(!op.valid())return false;
        release(records.get(op.key));records.set(op.key,next);next=null;apply();notify('已保存「'+KINDS[kind]+'」，仅用于'+THEME_NAMES[op.current]);return true;
      }catch(error){if(op.valid()){if(next&&!error.artBudget)storageError(error);else notify(error.message||'图片读取失败，已保留原素材');}return false;}
      finally{release(next);if(pending.get(op.key)===op.token)pending.delete(op.key);render();}
    }
    async function reset(kind){
      if(!Object.hasOwn(KINDS,kind)||importing)return false;
      const op=begin(kind);render();
      try{
        await write(store=>store.delete(op.key),op.valid,op.current,op.key);if(!op.valid())return false;
        release(records.get(op.key));records.delete(op.key);apply();notify('已恢复'+THEME_NAMES[op.current]+'默认'+KINDS[kind]);return true;
      }catch(error){if(op.valid())storageError(error,'浏览器未能删除图片，已保留原素材');return false;}
      finally{if(pending.get(op.key)===op.token)pending.delete(op.key);render();}
    }
    async function load(){
      const version=++loadVersion,mutation=mutationVersion,snapshot=new Map(tokens);let invalid=0;
      try{
        const saved=await readRecords();
        for(const [key,item] of saved){
          if(version!==loadVersion||mutation!==mutationVersion)return;
          const [current,kind,...extra]=String(key).split(':');
          if(extra.length||!Object.hasOwn(THEME_NAMES,current)||!Object.hasOwn(KINDS,kind)){invalid++;continue;}
          let next;try{next=await decodeArt(item?.data,item?.name,item?.type,kind);}
          catch{invalid++;continue;}
          if(version!==loadVersion||mutation!==mutationVersion||(tokens.get(key)||0)!==(snapshot.get(key)||0)){release(next);continue;}
          release(records.get(key));records.set(key,next);
        }
        if(invalid)notify('有 '+invalid+' 张已存图片无法读取，暂用默认素材；原记录未删除');
      }catch(error){storageError(error,'浏览器未能读取图片素材，暂用默认素材；原记录未删除');}
      finally{apply();render();}
    }
    function exportAssets(){
      return {version:1,items:[...records].sort(([a],[b])=>a.localeCompare(b)).map(([key,record])=>{
        const [current,kind]=key.split(':');return {theme:current,kind,name:record.name,type:record.type,data:base64(record.bytes)};
      })};
    }
    async function validateImport(payload){
      if(!payload||payload.version!==1||!Array.isArray(payload.items)||payload.items.length>Object.keys(THEME_NAMES).length*Object.keys(KINDS).length)throw new Error('设置中的自定义素材格式无效');
      const prepared={records:new Map(),disposed:false,inUse:false,cancelled:false};
      try{
        let totalBytes=0;for(const item of payload.items){
          if(!item||!Object.hasOwn(THEME_NAMES,item.theme)||!Object.hasOwn(KINDS,item.kind))throw new Error('设置中的图片主题或类别无效');
          const key=keyFor(item.theme,item.kind);if(prepared.records.has(key))throw new Error('设置中有重复的主题图片');
          const bytes=readBase64(item.data);totalBytes+=bytes.byteLength;if(totalBytes>MAX_TOTAL_BYTES)throw new Error('自定义图片合计不能超过 90 MB');
          const record=await decodeArt(bytes,item.name,item.type,item.kind);prepared.records.set(key,record);
        }
        preparedSets.add(prepared);return prepared;
      }catch(error){for(const record of prepared.records.values())release(record);throw error;}
    }
    function discardImport(prepared){
      if(!preparedSets.has(prepared)||prepared.disposed)return;
      if(prepared.inUse){prepared.cancelled=true;cancelWrites(entry=>entry.prepared===prepared);return;}
      for(const record of prepared.records.values())if(![...records.values()].includes(record))release(record);
      prepared.disposed=true;
    }
    async function importAssets(prepared,isCurrent=()=>true){
      if(!preparedSets.has(prepared)||prepared.disposed)throw new Error('请先重新预览需要导入的图片素材');
      if(importing)throw new Error('图片素材正在导入');
      const valid=()=>importing&&!prepared.cancelled&&isCurrent();
      importing=true;prepared.inUse=true;mutationVersion++;loadVersion++;pending.clear();cancelWrites(()=>true);render();
      try{
        await write(store=>{store.clear();for(const [key,record] of prepared.records)store.put({name:record.name,type:record.type,data:record.bytes},key);},valid,null,null,prepared);
        for(const record of records.values())release(record);records.clear();for(const [key,record] of prepared.records)records.set(key,record);
        prepared.disposed=true;apply();
      }catch(error){if(!prepared.cancelled&&isCurrent())storageError(error,'图片素材未能完整保存，已保留原素材；设置未导入');throw error;}
      finally{importing=false;prepared.inUse=false;if(prepared.cancelled)discardImport(prepared);render();}
    }
    apply();render();
    return {load,render,apply,exportAssets,validateImport,importAssets,discardImport,upload,reset};
  }
  window.LockCustomArt=Object.freeze({create});
})();
