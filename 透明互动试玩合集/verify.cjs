const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'plugins');
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.html'))){
 const s=fs.readFileSync(path.join(dir,file),'utf8');
 assert(!/(?:src|href)=["']https?:/i.test(s),file+' external resource');
 assert(!/color-scheme\s*:\s*dark/.test(s),file+' forces dark canvas');
 assert(/background\s*:\s*transparent\s*!important/.test(s),file+' no transparent root');
 const ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,file+' duplicate IDs');
 const scripts=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];for(const script of scripts)new vm.Script(script[1]);
 assert(scripts.length>0,file+' no scripts');console.log('PASS',file,'scripts',scripts.length,'bytes',Buffer.byteLength(s));
}
