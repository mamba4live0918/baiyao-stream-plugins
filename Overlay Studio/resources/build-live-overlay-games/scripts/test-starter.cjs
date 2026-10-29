// Template logic only; not a browser or livestream-host test.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../assets/overlay-starter.html'),'utf8');
const source=html.match(/<script id="runtime">([\s\S]*?)<\/script>/)[1];
const sandbox={}; vm.runInNewContext(source+'\nthis.make=createOverlayRuntime;',sandbox);
let clock=0, passed=0;
const fresh=()=>sandbox.make(()=>clock), event=(id,count=1)=>({id,count,actor:'测试'});
function test(name,fn){clock=0;fn();passed++;console.log('PASS '+name);}
test('ready queues; landing scores once',()=>{const r=fresh();r.receive(event('a'));r.step(1);assert.equal(r.snapshot().active,0);r.start();for(let i=0;i<100;i++)r.step(.05);assert.equal(r.snapshot().score,1);assert.equal(r.snapshot().pending,0);});
test('pause freezes',()=>{const r=fresh();r.start();r.receive(event('a'));r.step(.05);r.pause();const before=JSON.stringify(r.snapshot());r.step(2);assert.equal(JSON.stringify(r.snapshot()),before);});
test('dedup and input validation',()=>{const r=fresh();assert(r.receive(event('a')).ok);assert.equal(r.receive(event('a')).reason,'duplicate');for(const c of [0,-1,NaN,Infinity,1.5,101])assert.equal(r.receive(event('bad'+c,c)).ok,false);assert.equal(r.receive(null).ok,false);assert.equal(r.snapshot().pending,1);});
test('capacity rejects whole event; retry allowed',()=>{const r=fresh();r.receive(event('a',100));r.receive(event('b',100));assert.equal(r.receive(event('c')).reason,'capacity');r.reset();assert(r.receive(event('c')).ok);});
test('TTL uses real time while paused',()=>{const r=fresh();r.receive(event('a',3));clock=31000;r.start();r.step(.05);assert.equal(r.snapshot().pending,0);assert.equal(r.snapshot().active,0);assert.equal(r.snapshot().expired,3);});
test('reset discards work but retains session dedup',()=>{const r=fresh();r.receive(event('a',5));r.start();r.step(.05);r.reset();assert.equal(r.snapshot().pending,0);assert.equal(r.snapshot().active,0);assert.equal(r.snapshot().score,0);assert.equal(r.receive(event('a')).reason,'duplicate');assert.equal(fresh().snapshot().pending,0);});
test('long frame does not dump queue',()=>{const r=fresh();r.receive(event('a',100));r.start();r.step(500);assert(r.snapshot().active<=1);assert(r.snapshot().pending>=99);});
test('sustained input bounded',()=>{const r=fresh();r.start();for(let i=0;i<2000;i++){clock+=50;r.receive(event('e'+i));r.step(.05);}const s=r.snapshot();assert(s.active<=80);assert(s.pending<=200);assert(s.seen<=512);assert(s.rejected>0);});
console.log(`${passed} logic tests passed`);
