const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const person = (key, name=key) => ({key,uid:key,name,avatar:'',note:''});
const act = (s,type,key,extra={}) => E.apply(s,{type,person:person(key),now:100,...extra});
const keys = s => [s.current?.key,...s.waiting.map(p=>p.key)].filter(Boolean);
test('first arrival starts; ordinary duplicates do not occupy another slot; same names retain IDs',()=>{
 let s=E.createState(); const initial=JSON.stringify(s); s=act(s,'join','a');
 assert.equal(s.current.key,'a'); assert.equal(JSON.stringify(E.createState()),initial);
 s=act(s,'join','a'); assert.equal(s.serial,1);
 s=act(s,'join','b',{person:person('b','a')}); assert.deepEqual(keys(s),['a','b']);
 const before=JSON.stringify(s); const next=E.apply(s,{type:'finish',advance:true,now:200});
 assert.equal(JSON.stringify(s),before); assert.equal(next.current.key,'b'); assert.equal(next.history[0].status,'completed');
});
test('priority is FIFO, never preempts current, and repeated priority does not move an existing priority',()=>{
 let s=E.createState(); for(const k of ['a','b','c','d']) s=act(s,'join',k);
 s=act(s,'priority','c'); s=act(s,'priority','d'); s=act(s,'priority','c');
 assert.deepEqual(keys(s),['a','c','d','b']);
 s=act(s,'priority','a'); assert.deepEqual(keys(s),['a','c','d','a','b']);
 s=act(s,'repeat','c',{opportunities:2}); assert.deepEqual(keys(s),['a','c','d','a','b','c','c']);
 assert.deepEqual(s.waiting.filter(x=>x.key==='c').map(x=>x.round),[1,2,3]);
});
test('finish only pauses future arrivals until explicitly started, including after reload',()=>{
 let s=act(E.createState(),'join','a'); s=E.apply(s,{type:'finish',advance:false,now:200});
 s=act(E.validate(JSON.parse(JSON.stringify(s))),'join','b'); assert.equal(s.current,null);
 s=E.apply(s,{type:'start'}); assert.equal(s.current.key,'b');
});
test('undo compensates a completion while retaining new arrivals and profile edits',()=>{
 let s=act(act(E.createState(),'join','a'),'join','b'); s=E.apply(s,{type:'finish',advance:true,now:200});
 s=act(s,'join','c'); s=E.apply(s,{type:'profile',person:person('x','收藏')});
 s=E.apply(E.validate(JSON.parse(JSON.stringify(s))),{type:'undo'});
 assert.deepEqual(keys(s),['a','b','c']); assert.equal(s.history.length,0); assert.equal(s.profiles[0].name,'收藏');
 assert.throws(()=>E.apply(s,{type:'undo'}),/撤销/);
});
test('undo refuses conflicting queue edits, removed is distinct from completed',()=>{
 let s=act(act(E.createState(),'join','a'),'join','b'); s=E.apply(s,{type:'finish',advance:true,now:200});
 s=E.apply(s,{type:'remove',id:s.current.id,now:201});
 assert.equal(s.history[1].status,'removed'); assert.throws(()=>E.apply(s,{type:'undo'}),/撤销/);
});
test('move remains inside priority class; edit does not silently rewrite saved profile',()=>{
 let s=act(act(act(E.createState(),'join','a'),'join','b'),'join','c'); s=act(s,'priority','c');
 assert.throws(()=>E.apply(s,{type:'move',id:s.waiting[1].id,direction:-1}),/优先/);
 s=E.apply(s,{type:'profile',person:person('a','别名')}); s=E.apply(s,{type:'edit',id:s.current.id,name:'临时',note:'备注'});
 assert.equal(s.current.name,'临时'); assert.equal(s.profiles[0].name,'别名');
 s=E.apply(s,{type:'forgetProfile',key:'a'}); assert.equal(s.profiles.length,0); assert.equal(s.current.key,'a');
});
test('pending records are independent, immutable and removable',()=>{
 const gift={name:'花',person:{key:'a'},count:1}; const s=E.apply(E.createState(),{type:'pendingAdd',gift,reason:'身份待确认'});
 gift.person.key='mutated'; assert.equal(s.pending[0].gift.person.key,'a');
 assert.equal(E.apply(s,{type:'pendingRemove',id:s.pending[0].id}).pending.length,0);
});
test('validation rejects malformed and nonfinite state, duplicate IDs and unsafe images; strips unknown keys',()=>{
 for(const value of [null,[],{...E.createState(),serial:Infinity},{...E.createState(),waiting:{}},{...E.createState(),version:9}]) assert.throws(()=>E.validate(value));
 let s=act(E.createState(),'join','a'); assert.throws(()=>E.validate({...s,waiting:[s.current]}));
 assert.throws(()=>act(s,'join','x',{person:{...person('x'),avatar:'javascript:alert(1)'}}));
 const clean=E.validate({...s,untrusted:'ignored'}); assert.equal(clean.untrusted,undefined);
 assert.throws(()=>act(s,'repeat','x',{opportunities:21})); assert.throws(()=>act(s,'join','x',{now:NaN}));
});
test('active and history limits reject changes without dropping original records',()=>{
 let s=E.createState(); for(let i=0;i<25;i++) s=act(s,'repeat','a',{opportunities:20});
 assert.equal(keys(s).length,500); const old=JSON.stringify(s); assert.throws(()=>act(s,'join','b'),/500/); assert.equal(JSON.stringify(s),old);
 const base=act(E.createState(),'join','z'); base.serial=2001;
 base.history=Array.from({length:2000},(_,i)=>({...base.current,id:'old'+i,ticket:i+1,round:i+1,status:'completed',endedAt:200}));
 base.current.id='active'; base.current.ticket=2001; base.current.round=2001;
 const full=E.validate(base); assert.throws(()=>E.apply(full,{type:'finish',advance:true,now:300}),/2000/); assert.equal(full.history.length,2000); assert.equal(full.current.id,'active');
});
test('undo after finishing an empty queue retains a new automatically started arrival',()=>{
 let s=act(E.createState(),'join','a'); s=E.apply(s,{type:'finish',advance:true,now:200});
 s=act(s,'join','b'); assert.equal(s.current.key,'b'); s=E.apply(s,{type:'undo'});
 assert.deepEqual(keys(s),['a','b']);
});
test('undo keeps new priority arrivals ahead of the returned ordinary next person',()=>{
 let s=act(act(E.createState(),'join','a'),'join','b'); s=E.apply(s,{type:'finish',advance:true,now:200});
 s=act(s,'priority','c'); s=E.apply(s,{type:'undo'}); assert.deepEqual(keys(s),['a','c','b']);
});
test('imported arbitrary IDs cannot collide with generated IDs',()=>{
 let s=act(E.createState(),'join','a'); s.current.id='q-2';
 s=act(E.validate(s),'join','b'); assert.notEqual(s.current.id,s.waiting[0].id); assert.doesNotThrow(()=>E.validate(s));
});
test('removing current pauses so later arrivals cannot skip existing waiting people',()=>{
 let s=act(act(E.createState(),'join','a'),'join','b');
 s=E.apply(s,{type:'remove',id:s.current.id,now:200}); s=act(s,'join','c');
 assert.equal(s.current,null); assert.deepEqual(s.waiting.map(p=>p.key),['b','c']);
 s=E.apply(s,{type:'start'}); assert.equal(s.current.key,'b');
});
