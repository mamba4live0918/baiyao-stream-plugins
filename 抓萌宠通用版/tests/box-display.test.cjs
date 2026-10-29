const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../src/box-display.js');
function fixture(){
 assert(fs.existsSync(file),'physical box display must exist');const Display=require(file),calls=[],show={style:{},dataset:{}},art={style:{}},motion={restore(raw,w,h){return raw?{...raw,w,h}:{x:w/2,y:-80,w,h,bounces:0,done:false};},step(r,dt,core,reduced){r.y+=120;if(reduced||r.y>300){r.y=300;r.done=true;}r.bounces++;},rebase(){}};
 const d=new Display({motion,core:{},viewport:()=>({w:1200,h:600}),size:()=>280,show,art,animate:()=>true,onPhase:(r,p,play)=>calls.push(['phase',p,play]),onBurst:(r,preview)=>{calls.push(['burst',preview]);r.applied=!preview;}});return{d,calls,show,art};
}
test('the physical box settles before revealing and invokes the burst only once',()=>{
 const f=fixture(),r={id:1,phase:0,applied:false};f.d.prepare(r);assert.equal(r.boxFall.y,-80);for(let i=0;i<3;i++)assert.equal(f.d.step(r,.05,false),false);assert(!f.calls.some(c=>c[0]==='burst'));f.d.step(r,.05,false);assert(r.applied);assert.equal(f.calls.filter(c=>c[0]==='burst').length,1);for(let i=0;i<30;i++)f.d.step(r,.05,false);assert.equal(f.calls.filter(c=>c[0]==='burst').length,1);assert.equal(f.d.step(r,.05,false),true);
});
test('restored already-applied boxes keep their result without a second burst or reward',()=>{
 const f=fixture(),r={phase:2,applied:true,boxAge:.4,boxFall:{x:600,y:300,done:true,bounces:3}};f.d.prepare(r);for(let i=0;i<40;i++)f.d.step(r,.05,false);assert(!f.calls.some(c=>c[0]==='burst'));assert(r.applied);
});
test('preview uses the same physical display but never marks a result applied',()=>{
 const f=fixture(),r={phase:0,applied:false};f.d.prepare(r);for(let i=0;i<8;i++)f.d.step(r,.05,true);assert.equal(r.applied,false);assert.equal(f.calls.filter(c=>c[0]==='burst').length,1);assert.equal(f.calls.find(c=>c[0]==='burst')[1],true);assert.equal(f.show.style.left,'600px');
});
