'use strict';
const TOKEN_LIMITS=require('./token-limits.json');
const {normalizeBaseUrl}=require('./model-api.cjs');
const presets=[
 {id:'deepseek',name:'DeepSeek',protocol:'openai-compatible',baseUrl:'https://api.deepseek.com/v1'},
 {id:'openrouter',name:'OpenRouter',protocol:'openai-compatible',baseUrl:'https://openrouter.ai/api/v1'},
 {id:'siliconflow',name:'硅基流动',protocol:'openai-compatible',baseUrl:'https://api.siliconflow.cn/v1'},
 {id:'custom',name:'自定义兼容接口',protocol:'openai-compatible',baseUrl:''},
 {id:'anthropic',name:'Claude',protocol:'anthropic',baseUrl:'https://api.anthropic.com/v1'}
];
async function createProviderStore({storage,secretCodec=null}){
 let engine='codex',activeProvider='deepseek';
 let profiles=Object.fromEntries(presets.map(p=>[p.id,{...p,model:'',maxTokens:8192}]));
 let encrypted={};let sessionKeys=new Map();
 async function load(file){try{return JSON.parse(await storage.read(file,128*1024));}catch(e){if(e.code==='ENOENT')return null;throw new Error('模型配置无法读取，请检查本地配置文件。');}}
 const saved=await load('provider-state.json')||await load('provider-config.json');
 if(saved){
  if(['codex','api'].includes(saved.engine))engine=saved.engine;
  if(Object.hasOwn(profiles,saved.activeProvider))activeProvider=saved.activeProvider;
  for(const preset of presets){const p=saved.profiles?.[preset.id];if(p){profiles[preset.id]={...preset,baseUrl:typeof p.baseUrl==='string'&&p.baseUrl?normalizeBaseUrl(p.baseUrl):preset.baseUrl,model:typeof p.model==='string'?p.model.slice(0,200):'',maxTokens:Number.isInteger(p.maxTokens)&&p.maxTokens>=256&&p.maxTokens<=TOKEN_LIMITS.max?p.maxTokens:8192};}}
 }
 const keys=saved?.keys??await load('provider-keys.json');
 if(keys&&typeof keys==='object')for(const id of Object.keys(profiles)){const record=keys[id];if(record&&typeof record.origin==='string'&&typeof record.ciphertext==='string')encrypted[id]={origin:record.origin,ciphertext:record.ciphertext};}
 // One private snapshot commits public configuration and encrypted keys together.
 // Only publicSettings() crosses IPC; ciphertext and session secrets never do.
 const persist=(next={})=>storage.atomic('provider-state.json',JSON.stringify({version:2,engine,activeProvider,profiles,keys:encrypted,...next},null,2));
 function profile(id){if(typeof id!=='string'||!Object.hasOwn(profiles,id))throw new Error('未知的模型服务');return profiles[id];}
 function getKey(id){
  const p=profile(id),origin=p.baseUrl?new URL(p.baseUrl).origin:'';
  const memory=sessionKeys.get(id);if(memory?.origin===origin)return {value:memory.key,storage:'session'};
  const record=encrypted[id];if(!record)return {value:'',storage:'missing'};
  if(record.origin!==origin)return {value:'',storage:'missing',error:'服务地址已改变，请重新填写 API Key。'};
  if(!secretCodec)return {value:'',storage:'missing',error:'当前环境无法解密已保存的 Key，请在桌面版使用或重新填写。'};
  try{const key=secretCodec.decrypt(record.ciphertext);if(typeof key!=='string'||!key)throw new Error();return {value:key,storage:'encrypted'};}
  catch{return {value:'',storage:'missing',error:'无法解密已保存的 Key，请在当前 Windows 账户重新填写。'};}
 }
 function publicSettings(){return {engine,activeProvider,keyStorageAvailable:Boolean(secretCodec),providers:presets.map(({id})=>{const key=getKey(id);return {...profiles[id],hasKey:Boolean(key.value),keyStorage:key.storage,...(key.error?{keyError:key.error}:{})};})};}
 function credentials(id=activeProvider){const p=profile(id),key=getKey(id);if(!p.baseUrl||!p.model)throw new Error('请先保存服务地址和模型名称。');if(!key.value)throw new Error(key.error||'请先为该服务填写 API Key。');return {config:{...p},apiKey:key.value};}
 function discovery(input){
  const p=profile(input.id),baseUrl=normalizeBaseUrl(input.baseUrl??p.baseUrl);
  if(input.apiKey!==undefined&&typeof input.apiKey!=='string')throw new Error('API Key 必须为文本。');
  let apiKey=(input.apiKey||'').trim();
  if(apiKey.length>8192||/[\x00-\x1f]/.test(apiKey))throw new Error('API Key 格式不正确。');
  if(!apiKey){
   if(!p.baseUrl||new URL(baseUrl).origin!==new URL(p.baseUrl).origin)throw new Error('服务主机已改变，请填写对应的新密钥后同步模型。');
   const key=getKey(p.id);if(!key.value)throw new Error(key.error||'请先填写 API Key，再同步模型。');apiKey=key.value;
  }
  return {config:{...p,baseUrl},apiKey};
 }
 async function select(input){
  if(input.engine!==undefined&&!['codex','api'].includes(input.engine))throw new Error('无效的生成方式');
  if(input.activeProvider!==undefined)profile(input.activeProvider);
  const next={engine:input.engine??engine,activeProvider:input.activeProvider??activeProvider};
  await persist(next);({engine,activeProvider}=next);
  return publicSettings();
 }
 async function save(input){
  const old=profile(input.id);
  const baseUrl=normalizeBaseUrl(input.baseUrl??old.baseUrl);
  const model=(input.model??old.model);
  if(typeof model!=='string'||!model.trim()||model.length>200||/[\x00-\x1f]/.test(model))throw new Error('模型名称须为 1–200 个字符。');
  const maxTokens=input.maxTokens??old.maxTokens;
  if(!Number.isInteger(maxTokens)||maxTokens<256||maxTokens>TOKEN_LIMITS.max)throw new Error('输出上限须为 256–2097152 的整数。');
  if(input.apiKey!==undefined&&typeof input.apiKey!=='string')throw new Error('API Key 必须为文本。');
  const key=(input.apiKey||'').trim();if(key.length>8192||/[\x00-\x1f]/.test(key))throw new Error('API Key 格式不正确。');
  if(input.clearKey&&key)throw new Error('不能同时填写和清除 Key。');
  const origin=new URL(baseUrl).origin;
  const existing=encrypted[old.id]||sessionKeys.get(old.id);
  if(existing&&existing.origin!==origin&&!key&&!input.clearKey)throw new Error('更换服务地址后，请重新填写对应服务的 API Key，或先清除旧 Key。');
  const next={...old,baseUrl,model:model.trim(),maxTokens};
  const nextEncrypted={...encrypted};
  const nextMemory=new Map(sessionKeys);
  if(input.clearKey){delete nextEncrypted[old.id];nextMemory.delete(old.id);}
  else if(key){
   if(secretCodec){let ciphertext;try{ciphertext=secretCodec.encrypt(key);}catch{throw new Error('Windows 密钥加密失败，配置未保存。');}nextEncrypted[old.id]={origin,ciphertext};nextMemory.delete(old.id);}
   else{delete nextEncrypted[old.id];nextMemory.set(old.id,{origin,key});}
  }
  try{
   const nextProfiles={...profiles,[old.id]:next};
   await persist({profiles:nextProfiles,keys:nextEncrypted});
   profiles=nextProfiles;encrypted=nextEncrypted;sessionKeys=nextMemory;
  }catch{throw new Error('模型配置保存失败，原配置与密钥已保留。');}
  return publicSettings();
 }
 return {publicSettings,credentials,discovery,select,save,dispose(){sessionKeys.clear();}};
}
module.exports={createProviderStore};

