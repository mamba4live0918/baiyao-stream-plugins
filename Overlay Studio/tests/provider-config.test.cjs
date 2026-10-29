const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createStorage}=require('../electron/storage.cjs');
const {createProviderStore}=require('../electron/provider-config.cjs');
const dummy='fixture-provider-key-never-live';
const testCryptoKey=crypto.randomBytes(32);
const codec={encrypt(text){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',testCryptoKey,iv);return Buffer.concat([iv,c.update(text,'utf8'),c.final(),c.getAuthTag()]).toString('base64');},decrypt(text){const b=Buffer.from(text,'base64'),d=crypto.createDecipheriv('aes-256-gcm',testCryptoKey,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString('utf8');}};
async function fixture(t,secretCodec=codec){const root=await fs.mkdtemp(path.join(os.tmpdir(),'overlay-provider-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const storage=await createStorage(root);const store=await createProviderStore({storage,secretCodec});return {root,storage,store};}
const config={id:'deepseek',baseUrl:'https://api.deepseek.com/v1',model:'fixture-model',maxTokens:8192};
test('keys persist encrypted, never return publicly, and remain separated by provider',async t=>{
 const {root,storage,store}=await fixture(t);await store.save({...config,apiKey:dummy});await store.save({id:'anthropic',baseUrl:'https://api.anthropic.com/v1',model:'fixture-claude',maxTokens:8192,apiKey:'other-fixture-key'});
 const pub=store.publicSettings();assert(!JSON.stringify(pub).includes(dummy));assert(pub.providers.find(p=>p.id==='deepseek').hasKey);
 for(const file of await fs.readdir(root)){if(file.endsWith('.json'))assert(!(await fs.readFile(path.join(root,file),'utf8')).includes(dummy));}
 const restarted=await createProviderStore({storage,secretCodec:codec});assert.equal(restarted.credentials('deepseek').apiKey,dummy);assert.equal(restarted.credentials('anthropic').apiKey,'other-fixture-key');
});
test('empty key preserves, origin changes require explicit replacement, clearing removes key',async t=>{
 const {store}=await fixture(t);await store.save({...config,apiKey:dummy});await store.save({...config,apiKey:''});assert.equal(store.credentials('deepseek').apiKey,dummy);
 await assert.rejects(store.save({...config,baseUrl:'https://different.example/v1'}),/重新|地址/);assert.equal(store.credentials('deepseek').apiKey,dummy);
 await store.save({...config,baseUrl:'https://different.example/v1',apiKey:'replacement-fixture'});assert.equal(store.credentials('deepseek').apiKey,'replacement-fixture');
 await store.save({...config,baseUrl:'https://different.example/v1',clearKey:true});assert.equal(store.publicSettings().providers.find(p=>p.id==='deepseek').hasKey,false);assert.throws(()=>store.credentials('deepseek'),/Key/);
});
test('unavailable OS encryption stores session key only and cannot silently recover it after restart',async t=>{
 const {root,store,storage}=await fixture(t,null);await store.save({...config,apiKey:dummy});assert.equal(store.publicSettings().providers.find(p=>p.id==='deepseek').keyStorage,'session');assert.equal(store.credentials('deepseek').apiKey,dummy);
 const restarted=await createProviderStore({storage,secretCodec:null});assert.equal(restarted.publicSettings().providers.find(p=>p.id==='deepseek').hasKey,false);
 assert(!(await fs.readFile(path.join(root,'provider-state.json'),'utf8')).includes(dummy));
});
test('engine selections persist, settings validation is bounded, damaged encryption is reported without disclosure',async t=>{
 const {store,storage}=await fixture(t);await store.select({engine:'api',activeProvider:'anthropic'});const again=await createProviderStore({storage,secretCodec:codec});assert.equal(again.publicSettings().activeProvider,'anthropic');
 for(const input of [{...config,model:''},{...config,maxTokens:-1},{...config,id:'../../escape'},{...config,baseUrl:'http://external.example/v1'}])await assert.rejects(store.save(input));
 await store.save({...config,apiKey:dummy});const broken=await createProviderStore({storage,secretCodec:{encrypt:codec.encrypt,decrypt(){throw new Error(dummy);}}});const p=broken.publicSettings().providers.find(p=>p.id==='deepseek');assert.equal(p.hasKey,false);assert(p.keyError);assert(!p.keyError.includes(dummy));
});
test('failed configuration commit preserves both previous host and encrypted key across reload',async t=>{
 const {store,storage}=await fixture(t);await store.save({...config,apiKey:dummy});
 const atomic=storage.atomic;storage.atomic=async(file,content)=>{if(['provider-config.json','provider-state.json'].includes(file))throw new Error('fixture disk failure');return atomic(file,content);};
 await assert.rejects(store.save({...config,baseUrl:'https://new-host.example/v1',apiKey:'replacement-fixture-key'}));
 assert.equal(store.credentials('deepseek').config.baseUrl,config.baseUrl);assert.equal(store.credentials('deepseek').apiKey,dummy);
 const restarted=await createProviderStore({storage,secretCodec:codec});assert.equal(restarted.credentials('deepseek').apiKey,dummy);assert.equal(restarted.credentials('deepseek').config.baseUrl,config.baseUrl);
});
