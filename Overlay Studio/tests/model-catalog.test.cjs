const {test}=require('node:test');
const assert=require('node:assert/strict');
const {listModels}=require('../electron/model-catalog.cjs');
const config={baseUrl:'https://provider.example/v1',protocol:'openai-compatible'};
const apiKey='fixture-models-key';
const json=value=>new Response(JSON.stringify(value));
test('model discovery uses GET without a model and returns bounded metadata, not context as output limit',async()=>{
 const result=await listModels({config,apiKey,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://provider.example/v1/models');assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);assert.equal(opts.redirect,'error');assert.equal(opts.headers.authorization,`Bearer ${apiKey}`);
  return json({data:[{id:'flash',name:'Flash',context_window:1048576,max_output_tokens:393216,input_modalities:['text','image']},{id:'flash'},{id:'other',context_window:1000000},{id:apiKey}]});
 }});
 assert.deepEqual(result.models,[{id:'flash',name:'Flash',contextWindow:1048576,maxOutputTokens:393216,vision:true},{id:'other',name:'other',contextWindow:1000000}]);
 assert(!JSON.stringify(result).includes(apiKey));
});
test('Claude discovery follows bounded cursor pagination and sends native auth',async()=>{
 let calls=0;
 const result=await listModels({config:{...config,protocol:'anthropic'},apiKey,fetchImpl:async(url,opts)=>{
  assert.equal(opts.headers['x-api-key'],apiKey);assert.equal(opts.headers['anthropic-version'],'2023-06-01');assert(!opts.headers.authorization);
  if(calls++===0)return json({data:[{id:'claude-one',display_name:'Claude One',max_tokens:200000,capabilities:{image_input:{supported:true}}}],has_more:true,last_id:'claude-one'});
  assert.equal(new URL(url).searchParams.get('after_id'),'claude-one');return json({data:[{id:'claude-two'}],has_more:false});
 }});assert.equal(result.models.length,2);assert.equal(calls,2);assert.equal(result.models[0].maxOutputTokens,200000);assert.equal(result.models[0].vision,true);
});
test('discovery errors never expose raw provider responses or credentials',async()=>{
 for(const fetchImpl of [async()=>new Response(apiKey,{status:401}),async()=>new Response(apiKey,{status:404}),async()=>{throw new Error(apiKey)},async()=>json({error:apiKey}),async()=>new Response('not json')]){
  await assert.rejects(listModels({config,apiKey,fetchImpl}),e=>!e.message.includes(apiKey)&&/模型|同步/.test(e.message));
 }
});
test('empty lists, repeated pagination and oversized responses fail explicitly',async()=>{
 for(const fetchImpl of [async()=>json({data:[]}),async()=>new Response('x'.repeat(2*1024*1024+1)),async()=>json({data:[{id:'same'}],has_more:true,last_id:'same'})])await assert.rejects(listModels({config:{...config,protocol:'anthropic'},apiKey,fetchImpl}));
});
test('model discovery times out without revealing network details',async()=>{
 await assert.rejects(listModels({config,apiKey,timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error(apiKey))))}),/超时/);
});
