'use strict';
const {normalizeBaseUrl}=require('./model-api.cjs');
class CatalogError extends Error {}
const fail=message=>{throw new CatalogError(message);};
const safeText=(value,key,max=200)=>typeof value==='string'&&value.trim()&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value)&&!value.includes(key)?value.trim():null;
const positive=value=>Number.isSafeInteger(value)&&value>0?value:undefined;

async function listModels({config,apiKey,fetchImpl=globalThis.fetch,timeoutMs=30000}){
 const base=normalizeBaseUrl(config.baseUrl),anthropic=config.protocol==='anthropic';
 if(!anthropic&&config.protocol!=='openai-compatible')fail('模型同步不支持此协议。');
 if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>8192||/[\x00-\x1f]/.test(apiKey))fail('请先填写有效的 API Key，再同步模型。');
 const controller=new AbortController();let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const models=new Map(),cursors=new Set();let after='',bytes=0;
 try{
  for(let page=0;page<20;page++){
   const url=new URL(base+'/models');
   if(anthropic){url.searchParams.set('limit','100');if(after)url.searchParams.set('after_id',after);}
   const response=await fetchImpl(url.toString(),{method:'GET',redirect:'error',signal:controller.signal,headers:{accept:'application/json',...(anthropic?{'x-api-key':apiKey,'anthropic-version':'2023-06-01'}:{authorization:`Bearer ${apiKey}`})}});
   if(!response.ok){await response.body?.cancel().catch(()=>{});fail(response.status===404||response.status===405?'此服务未提供模型列表接口，请手动填写模型 ID。':`同步模型失败（HTTP ${response.status}）。请检查地址、密钥及服务权限。`);}
   if(!response.body)fail('模型列表响应为空。');
   const reader=response.body.getReader(),chunks=[];
   try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2*1024*1024)fail('模型列表超过 2 MiB 限制。');chunks.push(Buffer.from(chunk.value));}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('模型列表格式无效，请手动填写模型 ID。');}
   if(!Array.isArray(data?.data)||data.error)fail('模型列表格式无效，请手动填写模型 ID。');
   for(const item of data.data){
    const id=safeText(item?.id,apiKey);if(!id||models.has(id))continue;
    const model={id,name:safeText(item.display_name??item.name,apiKey)||id};
    const contextWindow=positive(item.context_window??item.context_length??item.max_input_tokens),maxOutputTokens=positive(item.max_output_tokens??(anthropic?item.max_tokens:undefined)??item.top_provider?.max_completion_tokens);
    if(contextWindow)model.contextWindow=contextWindow;
    if(maxOutputTokens)model.maxOutputTokens=maxOutputTokens;
    const modalities=item.input_modalities??item.architecture?.input_modalities;
    if(Array.isArray(modalities)&&modalities.includes('text'))model.vision=modalities.includes('image');
    else if(anthropic&&typeof item.capabilities?.image_input?.supported==='boolean')model.vision=item.capabilities.image_input.supported;
    models.set(id,model);if(models.size>5000)fail('模型列表超过 5000 项，请使用范围更小的服务接口。');
   }
   if(data.has_more!==true){if(!models.size)fail('服务没有返回可用模型，请检查账号权限，或手动填写模型 ID。');return {models:[...models.values()],syncedAt:new Date().toISOString()};}
   if(!anthropic)fail('此兼容服务返回分页目录，暂不支持其分页协议，请手动填写模型 ID。');
   after=safeText(data.last_id,apiKey);if(!after||cursors.has(after))fail('模型列表分页无效，请稍后重试。');cursors.add(after);
  }
  fail('模型目录分页过多，请手动填写模型 ID。');
 }catch(error){
  if(timedOut)throw new CatalogError('同步模型超时，请检查网络后重试。');
  if(error instanceof CatalogError)throw error;
  throw new CatalogError('同步模型失败：网络连接、重定向或响应格式异常。');
 }finally{clearTimeout(timer);}
}
module.exports={listModels};
