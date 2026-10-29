const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core.js'),Mixer=require('../src/audio-mixer.js'),Tornado=require('../src/tornado-visual.js');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8'),app=read('app.js');
const body=name=>app.split('\n').find(line=>line.startsWith('function '+name+'('));
class AudioStub{
 constructor(src){this.src=src;this.paused=true;this.ended=false;this.events={};}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(f=>f!==fn);}
 play(){this.paused=false;for(const fn of this.events.play||[])fn();return Promise.resolve();}pause(){this.paused=true;for(const fn of this.events.pause||[])fn();}
}
function audioFixture(){
 const mixer=new Mixer({storage:{getItem:()=>null,setItem(){}}}),players=[],gains=[],oscillators=[];
 const ctx={prefs:{sound:true,voice:true},voicePlayer:null,beatPlayer:null,sceneAudio:new Set(),synthVoices:new Set(),audioMixer:mixer,Audio:class extends AudioStub{constructor(src){super(src);players.push(this);}},custom:{audio:key=>({key,src:key})},unlockAudio(){},audioCtx:{currentTime:0,destination:{},createGain(){const g={gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};gains.push(g);return g;},createOscillator(){const o={frequency:{},connect(){},disconnect(){},start(){},stop(){}};oscillators.push(o);return o;}},toast(){},document:{hidden:false}};
 vm.runInNewContext([body('disposeSynthVoice'),body('sound'),body('boxCue')].join('\n'),ctx);return{ctx,mixer,players,gains,oscillators};
}
test('actual effect, opening, reveal and preview routes obey live volume and mute',()=>{
 const f=audioFixture();for(const kind of ['clap','grab','home','recall','tornado','boom','ballpop'])f.ctx.sound(kind);
 for(const key of ['boxopen','boxreveal'])f.ctx.boxCue(key);
 assert.equal(f.players.length,9);assert(f.players.every(a=>a.volume>0&&a.volume<=.24));
 f.mixer.setMaster(0);assert(f.players.filter(a=>!a.paused).every(a=>a.volume===0));
 const context={Audio:f.ctx.Audio};vm.runInNewContext(read('customize.js')+';globalThis.Custom= CowCustomizer;',context);
 const custom=Object.create(context.Custom.prototype);Object.assign(custom,{audio:key=>({key,src:key}),audioMixer:f.mixer,syncStartAudio(){},toast(){}});
 custom.previewAudio('audio:tornado');assert.equal(custom.player.volume,0);f.mixer.setMaster(50);assert.equal(custom.player.volume,.35);
 f.mixer.setLevel('audio:tornado',20);assert.equal(custom.player.volume,.07);
});
test('synthesized effects have separate live level gains and release each route',()=>{
 const f=audioFixture();f.ctx.custom.audio=()=>({src:''});f.ctx.sound('home');assert.equal(f.gains.length,6);
 f.mixer.setLevel('audio:home',0);for(const i of [1,3,5])assert.equal(f.gains[i].gain.value,0);
 for(const o of f.oscillators)o.onended();assert.equal(f.mixer._gains.size,0);
});
test('malformed restored tier IDs cannot crash the audio mixer on the next cue',()=>{
 for(const id of ['', 'bad/id','x'.repeat(61),null]){
  const state=C.fresh();state.current={id:1,tierId:id,count:15,success:true,applied:false,phase:1,times:[0,100,200,300,400]};
  const restored=C.restore(JSON.stringify(state));assert(restored);assert.equal(restored.current.tierId,'default-15');
  const m=new Mixer({storage:{getItem:()=>null,setItem(){}}});assert.doesNotThrow(()=>m.volume('tier:'+restored.current.tierId));
 }
});
test('drop targets and pointer blocking are wired to the same nest silhouette',()=>{
 let received;const ctx={penShape:{contains(x,y){received=[x,y];return true;}}};vm.runInNewContext(body('inPen'),ctx);
 assert.equal(ctx.inPen(12,34),true);assert.deepEqual(received,[12,34]);
 const css=read('pen-shape.css');assert.match(css,/#pen\{pointer-events:none/);assert.match(css,/#pen-lock,#pen-resize\{[^}]*pointer-events:none/);assert.match(css,/#pen\.is-locked #pen-lock\{[^}]*pointer-events:auto/);
 const shape=read('pen-shape.js');assert.match(shape,/clipPathUnits','objectBoundingBox/);
});
test('wind collection uses a continuous spiral and does not double-credit on finish',()=>{
 assert.match(read('effects.css'),/\.calf\.wind-swept\{[^}]*transform-origin:50% 50%/);
 const state=C.fresh();state.outside=1;let finish,removed=0;const pet={x:70,y:100,size:80,kind:0,el:{style:{},classList:{add(){}},remove(){removed++;},animate(frames,opts){assert.equal(frames.length,66);assert.equal(opts.easing,'linear');return{set onfinish(fn){finish=fn;}}}}};
 const ctx={C,state,cows:[pet],windFlights:new Set(),PetTornado:Tornado,Date,queueBlocked:false,replenish(){},save(){},updateHUD(){},penRect:()=>({x:300,y:100,w:80,h:80}),particles(){},$:()=>({classList:{add(){},remove(){}},offsetWidth:1}),reduced:()=>false};
 vm.runInNewContext(body('windCollect'),ctx);assert.equal(ctx.windCollect(pet,150,150),1);assert.equal(state.home,1);assert.equal(state.outside,0);finish();finish();assert.equal(state.home,1);assert.equal(removed,1);
});
