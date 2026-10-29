const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../collector.js');const api=fs.existsSync(file)?require(file):{};
function fixture(balance=0,options={}){
 assert.equal(typeof api.PointCollector,'function','periodic point collection must be implemented');
 const charges=[];let wallet=balance;
 const collector=new api.PointCollector({getBalance:()=>wallet,setBalance:n=>wallet=n,onCharge:r=>charges.push(r),...options});
 return{collector,charges,get wallet(){return wallet},set wallet(v){wallet=v}};
}
test('first elimination starts the clock; a funded period deducts points only once',()=>{
 const f=fixture(4500);f.collector.tick(90000);assert.equal(f.charges.length,0);
 assert.equal(f.collector.snapshot().intervalSeconds,60);assert.equal(f.collector.snapshot().amount,3000);
 f.collector.start();f.collector.tick(59999);assert.equal(f.charges.length,0);f.collector.tick(1);assert.equal(f.wallet,1500);
 assert.equal(f.charges.length,1);assert.equal(f.charges[0].shortfall,0);f.collector.tick(0);assert.equal(f.charges.length,1);
});
test('an underfunded period collects available points and produces one shortfall, then the next period is independent',()=>{
 const f=fixture(1200);f.collector.start();f.collector.tick(60000);assert.equal(f.wallet,0);assert.equal(f.charges[0].paid,1200);assert.equal(f.charges[0].shortfall,1800);
 for(let n=0;n<10;n++)f.collector.tick(0);assert.equal(f.charges.length,1);
 f.collector.tick(60000);assert.equal(f.charges.length,2);assert.equal(f.charges[1].index,2);assert.equal(f.charges[1].shortfall,3000);
});
test('pause freezes billing; animation delays settlement without losing or duplicating the period',()=>{
 const f=fixture(9000);f.collector.start();f.collector.tick(60000,{paused:true});assert.equal(f.collector.snapshot().remainingMs,60000);
 f.collector.tick(60000,{canSettle:false});assert.equal(f.charges.length,0);assert.equal(f.wallet,9000);
 f.collector.tick(0);assert.equal(f.charges.length,1);assert.equal(f.wallet,6000);assert.equal(f.collector.snapshot().remainingMs,60000);
});
test('parameter changes are validated, saved, and do not charge immediately or restore old periods',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const f=fixture(5000,{storage});f.collector.start();f.collector.tick(30000);
 assert.equal(f.collector.configure({intervalSeconds:20,amount:1200,difficulty:'hard'}),true);assert.equal(f.collector.snapshot().remainingMs,20000);assert.equal(f.charges.length,0);
 assert.equal(f.collector.configure({intervalSeconds:0}),false);assert.equal(f.collector.configure({amount:NaN}),false);assert.equal(f.collector.configure({difficulty:'wrong'}),false);
 f.collector.tick(20000);assert.equal(f.wallet,3800);
 const g=fixture(0,{storage});assert.equal(g.collector.snapshot().started,false);assert.equal(g.collector.snapshot().amount,1200);g.collector.tick(90000);assert.equal(g.charges.length,0);
});
test('settings storage failures do not stop point collection, and reentrant charge callbacks cannot double-collect',()=>{
 let f;f=fixture(7000,{storage:{getItem(){throw Error('denied')},setItem(){throw Error('denied')}},onCharge:()=>f.collector.tick(0)});
 f.collector.start();f.collector.tick(60000);assert.equal(f.wallet,4000);assert.equal(f.collector.snapshot().periods,1);
});
test('hard mode awards fewer points on the same board and keeps a stable playable board',()=>{
 const{MatchGame}=require('../engine.js');const random=()=>{let s=77;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296)};
 const standard=new MatchGame(random(),'standard'),hard=new MatchGame(random(),'hard');assert.equal(hard.difficulty,'hard');
 const move=standard.possibleMoves()[0];assert.equal(standard.swap(...move).valid,true);assert.equal(hard.swap(...move).valid,true);assert.ok(hard.score<standard.score);
 assert.equal(hard.groups().length,0);assert.ok(hard.possibleMoves().length);assert.equal(hard.setDifficulty('invalid'),false);assert.equal(hard.setDifficulty('hell'),true);
});
