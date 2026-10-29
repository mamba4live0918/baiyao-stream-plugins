const {test}=require('node:test');const assert=require('node:assert/strict');
test('screenshot million-token value gets an actionable error, and default is accepted',async()=>{
 const {providerFormErrors,modelTokenDefault}=await import('../src/provider-form.mjs');
 const fields={baseUrl:'https://api.deepseek.com/v1',model:'deepseek-flash',maxTokens:'1000000',modelInfo:{maxOutputTokens:393216}};
 assert.match(providerFormErrors(fields).tokens,/393,216/);
 assert.equal(modelTokenDefault(fields.modelInfo),393216);
 assert.equal(modelTokenDefault({contextWindow:1000000}),8192);
 assert.deepEqual(providerFormErrors({...fields,maxTokens:'8192'}),{});
 assert.match(providerFormErrors({...fields,maxTokens:'8192',model:''}).model,/同步/);
 assert.match(providerFormErrors({...fields,maxTokens:'8192',baseUrl:'https://example.com/v1/chat/completions'}).baseUrl,/基础/);
});
