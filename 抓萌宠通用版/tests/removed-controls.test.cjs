const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('removed chant miss input cannot prevent remaining typed settings from binding',()=>{
 const ids=new Set([...read('src/settings.html').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])),bound=[];assert(!ids.has('miss'));
 const code=read('src/app.js').split('\n').find(s=>s.startsWith("for(const [k,min,max]of[['miss'")&&s.includes('addEventListener')),ctx={$:k=>ids.has(k)?{addEventListener:type=>bound.push([k,type])}:null,prefs:{},cows:[],savePrefs(){},setCowSize(){}};
 assert.doesNotThrow(()=>vm.runInNewContext(code,ctx));assert.deepEqual(bound,[['interval','input'],['size','input']]);
});
