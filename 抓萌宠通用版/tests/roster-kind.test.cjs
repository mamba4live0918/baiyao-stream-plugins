const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'../src/roster.js'),Roster=fs.existsSync(file)?require(file):{};
function catalog(cows){assert.equal(typeof Roster.catalog,'function','native roster catalog is available');return Roster.catalog(cows);}
test('appending explicit native kinds never consumes existing custom IDs or changes old kinds',()=>{
 const old=Array.from({length:95},(_,i)=>({id:'old-'+i})),ducks=Array.from({length:8},(_,i)=>({id:'duck-'+i,kind:2000000+i}));
 const cows=old.concat(ducks),before=JSON.stringify(cows),r=catalog(cows);
 assert.deepEqual(r.kinds,Array.from({length:95},(_,i)=>i).concat([2000000,2000001,2000002,2000003,2000004,2000005,2000006,2000007]));
 assert.equal(r.index(2000005),100);assert.equal(r.get(2000005),ducks[5]);assert.equal(r.has(2000007),true);
 assert.equal(r.index(100),-1);assert.equal(r.get(100),undefined);assert.equal(r.has(1000000),false);assert.equal(JSON.stringify(cows),before);
});
test('legacy short asset arrays and explicitly unchanged legacy kinds retain their index mapping',()=>{
 const cows=[{id:'a'},{id:'b',kind:1}],r=catalog(cows);
 assert.equal(Roster.kindOf(cows[0],0),0);assert.equal(Roster.kindOf(cows[1],1),1);assert.deepEqual(r.kinds,[0,1]);assert.equal(r.index(1),1);
 for(const value of ['1',null,NaN,Infinity,-1]){assert.equal(r.has(value),false);assert.equal(r.index(value),-1);assert.equal(r.get(value),undefined);}
});
test('catalog rejects custom/avatar collisions, malformed kinds, duplicates and unsafe implicit indices',()=>{
 for(const kind of [100,999999,1000000,1999999,2100000,-1,2.5,'2000000',null,undefined])assert.throws(()=>catalog([{id:'bad',kind}]));
 assert.throws(()=>catalog([{kind:1}]));assert.throws(()=>catalog([{kind:2000000},{kind:2000000}]));
 assert.throws(()=>catalog(Array.from({length:101},()=>({}))));assert.throws(()=>catalog([null]));assert.throws(()=>catalog({}));
 assert.equal(catalog([{kind:2099999}]).index(2099999),0);
});
test('cached catalogs reuse stable mappings and rebuild after valid roster mutations',()=>{
 const cows=[{id:'a'}],r=catalog(cows);assert.equal(catalog(cows),r);
 assert.throws(()=>r.kinds.push(100));cows.push({id:'duck',kind:2000000});const appended=catalog(cows);assert.notEqual(appended,r);assert.equal(appended.index(2000000),1);
 cows[1]={id:'replacement',kind:2000001};assert.equal(catalog(cows).get(2000001),cows[1]);
 cows[1].kind=2000002;assert.equal(catalog(cows).has(2000001),false);assert.equal(catalog(cows).has(2000002),true);
 cows[1].kind=100;assert.throws(()=>catalog(cows));
});
test('browser export offers the same sparse ID lookup without CommonJS dependencies',()=>{
 assert.equal(typeof Roster.catalog,'function');const sandbox={};vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
 const duck={kind:2000000};assert.equal(sandbox.PetRoster.catalog([duck]).get(2000000),duck);
});
