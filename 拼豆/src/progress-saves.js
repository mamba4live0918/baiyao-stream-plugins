import {validPattern,MODES} from './play-modes.js';
import {isKnownIronStyle} from './finished-viewer.js';
import {createInteractionRules,isLegacyInteractionRules,validateLegacyRuleSet,validateRuleSet} from './interaction-rules.js';
import {validColorTier} from './patterns.js';
import {normalizeToolSensitivity,validToolSensitivity,normalizeDefaultTool,normalizePenCapacity,validPenCapacity} from './mouse-controls.js';
export const SAVE_FORMAT='peg-bead-progress';
export const MAX_SAVE_BYTES=15*1024*1024;
const fail=message=>{throw new Error(`存档无效：${message}`);};
const color=c=>c===null||typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
const integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
function grid(cells,size){return Array.isArray(cells)&&cells.length===size*size&&cells.every(color);}
function patternCheck(p){
 if(!validPattern(p)||typeof p.id!=='string'||p.id.length>160||typeof p.name!=='string'||p.name.length>128)fail('图案或板格损坏');
 if(p.sourceCells&&!grid(p.sourceCells,p.size))fail('原色图案损坏');
 if(p.preview&&(!integer(p.preview.width,1,256)||!integer(p.preview.height,1,256)||!Array.isArray(p.preview.cells)||p.preview.cells.length!==p.preview.width*p.preview.height||!p.preview.cells.every(color)))fail('图案预览损坏');
}
function gameCheck(g,p){
 if(!g||g.version!==3||g.patternId!==p.id||g.size!==p.size||!Array.isArray(g.placed)||g.placed.length!==p.size*p.size)fail('拼豆进度与图案不匹配');
 const ids=new Set();let maxId=0;
 const beadCheck=(b,index)=>{if(!b||typeof b.id!=='string'||!/^b\d+$/.test(b.id)||ids.has(b.id)||!integer(b.row,0,p.size-1)||!integer(b.col,0,p.size-1)||!b.color||!color(b.color))fail('豆子信息损坏');if(index!==undefined&&b.row*p.size+b.col!==index)fail('豆子位置损坏');ids.add(b.id);maxId=Math.max(maxId,Number(b.id.slice(1)));};
 g.placed.forEach((b,i)=>{if(b!==null)beadCheck(b,i);});
 if(!Array.isArray(g.fallen)||g.fallen.length>2304)fail('掉落豆数据损坏');
 for(const b of g.fallen){beadCheck(b);const p=b.pose;if(!p||!['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<1000)||!p.rotation||!['x','y','z','w'].every(k=>Number.isFinite(p.rotation[k])&&Math.abs(p.rotation[k])<=1.001))fail('掉落豆位置损坏');}
 if(!integer(g.nextId,maxId+1,Number.MAX_SAFE_INTEGER)||!integer(g.requiredRounds,1,20)||!integer(g.completedRounds,0,g.requiredRounds))fail('遍数或编号损坏');
 if(typeof g.traySpilled!=='boolean'||!integer(g.trayRestoreStage,0,5)||!Number.isFinite(g.restoreProgress)||g.restoreProgress<0||g.restoreProgress>=100||!integer(g.trayPresses,2,50)||!Number.isFinite(g.trayDecay)||g.trayDecay<0||g.trayDecay>50||!integer(g.penCapacity,2,20))fail('托盘或工具状态损坏');
 if(g.traySpilled&&g.trayRestoreStage===5)fail('托盘复原状态矛盾');
 if(g.replayCells!==null&&!grid(g.replayCells,p.size))fail('重复作品目标损坏');
 for(const k of ['hintHiddenUntil','tweezersLockedUntil','penUntil'])if(!Number.isFinite(g[k])||g[k]<0||g[k]>1e15)fail('限时效果损坏');
}
function finishedCheck(f){if(f!==null&&f!==undefined&&(!integer(f.size,16,64)||!grid(f.cells,f.size)||!isKnownIronStyle(f.style)||typeof f.id!=='string'||typeof f.name!=='string'||!integer(f.textureSeed,0,0xffffffff)))fail('待保存成品损坏');}
function checkpointCheck(c){if(!c||typeof c!=='object')fail('模式进度缺失');patternCheck(c.pattern);gameCheck(c.game,c.pattern);finishedCheck(c.finished);}
export function validateProgressSave(raw){
 if(!raw||raw.format!==SAVE_FORMAT||raw.version!==1||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80||!Number.isFinite(raw.savedAt)||raw.savedAt<0)fail('文件类型、名称或版本不支持');
 const s=raw.state;checkpointCheck(s);if(!MODES.includes(s.playMode))fail('模式不支持');
 if(!s.campaign||!Array.isArray(s.campaign.levels)||!integer(s.campaign.levels.length,1,100)||!integer(s.campaign.index,0,s.campaign.levels.length-1))fail('关卡列表损坏');
 for(const level of s.campaign.levels){if(!level||typeof level.id!=='string'||typeof level.name!=='string'||level.name.length>128)fail('关卡名称损坏');patternCheck(level.pattern);}
 if(!s.modeSessions||typeof s.modeSessions!=='object'||Array.isArray(s.modeSessions))fail('模式存档损坏');for(const[key,c]of Object.entries(s.modeSessions)){if(!MODES.includes(key))fail('未知的模式进度');checkpointCheck(c);}
 if(!s.settings||!Array.isArray(s.settings.rules))fail('互动设置损坏');
 let rules=s.settings.rules;
 if(isLegacyInteractionRules(rules)){
  if(validateLegacyRuleSet(rules).length)fail('互动设置损坏');
  try{rules=createInteractionRules(rules);}catch{fail('互动设置损坏');}
 }
 if(validateRuleSet(rules).length)fail('互动设置损坏');
 const cfg=s.settings;if(!validColorTier(cfg.colorTier)||!['all','needed'].includes(cfg.jarFilter)||typeof cfg.desk!=='boolean'||typeof cfg.hint!=='boolean'||!/^Key[A-Z]$|^Digit[0-9]$/.test(cfg.magnifierKey)||!Number.isFinite(cfg.magnifierZoom)||cfg.magnifierZoom<1.5||cfg.magnifierZoom>5||!Number.isFinite(cfg.magnifierSize)||cfg.magnifierSize<120||cfg.magnifierSize>360||!Array.isArray(cfg.customColors)||cfg.customColors.length>128||cfg.customColors.some(c=>!c||!color(c)))fail('画面设置损坏');
 const result=structuredClone(raw);delete result.state.giftQueue;result.state.finished&&delete result.state.finished.dataUrl;
 result.state.settings.rules=structuredClone(rules);
 if(cfg.magnifierMode!==undefined&&!['hold','toggle'].includes(cfg.magnifierMode))fail('放大镜触发方式损坏');
 result.state.settings.magnifierMode=cfg.magnifierMode||'hold';
 if(cfg.toolSensitivity!==undefined&&!validToolSensitivity(cfg.toolSensitivity))fail('镊子灵敏度损坏');
 result.state.settings.toolSensitivity=normalizeToolSensitivity(cfg.toolSensitivity);
 if(cfg.defaultTool!==undefined&&!['tweezers','pen'].includes(cfg.defaultTool))fail('默认工具设置损坏');
 if(cfg.penCapacity!==undefined&&!validPenCapacity(cfg.penCapacity))fail('拼豆笔容量设置损坏');
 result.state.settings.defaultTool=normalizeDefaultTool(cfg.defaultTool);
 result.state.settings.penCapacity=normalizePenCapacity(cfg.penCapacity);
 if(cfg.heldGlow!==undefined&&typeof cfg.heldGlow!=='boolean')fail('位置提示设置损坏');result.state.settings.heldGlow=cfg.heldGlow!==false;
 for(const key of ['finishQuality','workbenchQuality']){if(cfg[key]!==undefined&&!['standard','high','ultra'].includes(cfg[key]))fail('画质设置损坏');result.state.settings[key]=cfg[key]||'high';}
 return result;
}
export function makeProgressSave(state,name,now=Date.now()){return validateProgressSave({format:SAVE_FORMAT,version:1,name:String(name||state.pattern.name).trim().slice(0,80),savedAt:now,state});}
export function parseProgressSave(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_SAVE_BYTES)fail('文件超过 15 MB');let raw;try{raw=JSON.parse(text);}catch{fail('不是有效 JSON 文件');}return validateProgressSave(raw);}
export function progressSummary(save){const s=save.state,count=s.game.placed.filter(Boolean).length;return`${{pattern:'单图',campaign:'关卡',free:'自由'}[s.playMode]} · ${s.pattern.size}×${s.pattern.size} · 已放 ${count} 颗${s.game.fallen.length?` · 待拾 ${s.game.fallen.length} 颗`:''}${s.game.traySpilled?' · 托盘待复原':''}`;}
export function createProgressStore({indexedDB=globalThis.indexedDB}={}){
 let promise;
 const db=()=>promise||=(new Promise((resolve,reject)=>{if(!indexedDB)return reject(new Error('浏览器存档库不可用，请导出本地文件保存'));const r=indexedDB.open('peg-bead-progress-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves',{keyPath:'id'});r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();promise=null;};resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('存档库被其他页面占用'));})).catch(e=>{promise=null;throw e;});
 async function transaction(mode,run){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('saves',mode);let value,error;try{run(tx.objectStore('saves'),v=>value=v,e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error||tx.error||new Error('存档未能写入，原存档保持不变'));tx.onerror=()=>{};});}
 return{
  async save(id,save){const record={id,save:validateProgressSave(save)};return transaction('readwrite',(store,done,abort)=>{const get=store.get(id);get.onsuccess=()=>{const all=store.getAll();all.onsuccess=()=>{if(!get.result&&all.result.filter(r=>r.id!=='recovery').length>=20&&id!=='recovery')return abort(new Error('最多保存 20 份命名存档，请覆盖已有存档或先导出整理'));const put=store.put(record);put.onsuccess=()=>done(record);};};});},
  async list(){return transaction('readonly',(store,done)=>{const r=store.getAll();r.onsuccess=()=>done(r.result.sort((a,b)=>b.save.savedAt-a.save.savedAt));});},
  async remove(id){return transaction('readwrite',(store,done)=>{const r=store.delete(id);r.onsuccess=()=>done();});},
 };
}
