const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const implementation=path.join(__dirname,'../src/effects.js');
let browser;
test.before(async()=>{const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});});
test.after(async()=>{await browser?.close();});
async function setup(t){
  assert.ok(fs.existsSync(implementation),'the new transparent prop renderer must exist');
  const page=await browser.newPage();t.after(()=>page.close());
  await page.setContent('<style>body{margin:0}.layer{position:relative;overflow:hidden}.a{width:1920px;height:1080px}.b{width:480px;height:270px}</style><div id="a" class="layer a"></div><div id="b" class="layer b"></div>');
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/v2-anime/manifest.json'),'utf8')),art={},meta={};
  for(const[k,v]of Object.entries(manifest)){const bytes=fs.readFileSync(path.join(__dirname,'../assets/v2-anime',v.file));art[k]='data:image/png;base64,'+bytes.toString('base64');meta[k]={...v,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
  await page.addScriptTag({content:'window.PuppetArt='+JSON.stringify(art)+';window.PuppetArtMeta='+JSON.stringify(meta)});await page.addScriptTag({path:path.join(__dirname,'../src/pinch-marks.js')});await page.addScriptTag({path:path.join(__dirname,'../src/pinch-frames.js')});await page.addScriptTag({path:implementation});
  await page.evaluate(async()=>{await PuppetEffects.preload();window.anchors={hit:{x:.6,y:.3},pinchLeft:{x:.4,y:.4},pinchRight:{x:.6,y:.4},kick:{x:.5,y:.7}};});
  return page;
}
test('renders decodable generated props and completes with no effect nodes left',async t=>{
  const page=await setup(t);
  for(const kind of ['hit','pinch','kick']){
    const result=await page.evaluate(async kind=>{const layer=document.getElementById('a'),pending=PuppetEffects.play({kind,settings:{size:.2,duration:.12,intensity:1,direction:'left'},anchors,layers:[layer]});const images=[...layer.querySelectorAll('.fx-art')];const before=images.length;await Promise.all(images.filter(img=>img.decode).map(img=>img.decode()));const widths=images.map(img=>img.naturalWidth||img.width);await pending;return {before,widths,after:layer.childElementCount};},kind);
    assert.equal(result.before,kind==='pinch'?2:1);assert.ok(result.widths.every(w=>w>700));assert.equal(result.after,0);
  }
});
test('contact points scale identically in the full scene and reduced preview',async t=>{
  const page=await setup(t);
  const result=await page.evaluate(async()=>{const layers=['a','b'].map(id=>document.getElementById(id)),abort=new AbortController();const task=PuppetEffects.play({kind:'pinch',settings:{size:.2,duration:1,intensity:1},anchors,layers,signal:abort.signal});const ratios=layers.map(layer=>[...layer.querySelectorAll('.fx-prop')].map(el=>{const origin=el.style.transformOrigin.split(' ').map(parseFloat);return [(parseFloat(el.style.left)+parseFloat(el.style.width)*origin[0]/100)/layer.clientWidth,(parseFloat(el.style.top)+parseFloat(el.style.height)*origin[1]/100)/layer.clientHeight];}));abort.abort();await task;return ratios;});
  for(const ratios of result){assert.ok(Math.abs(ratios[0][0]-.4)<1e-5);assert.ok(Math.abs(ratios[1][0]-.6)<1e-5);assert.ok(ratios.every(p=>Math.abs(p[1]-.4)<1e-5));}
});
test('abort immediately removes all animated sprites, bursts and particles without late reappearance',async t=>{
  const page=await setup(t);
  const result=await page.evaluate(async()=>{const layer=document.getElementById('a'),abort=new AbortController();const pending=PuppetEffects.play({kind:'kick',settings:{size:.2,duration:2,intensity:3},anchors,layers:[layer],signal:abort.signal});const before=layer.childElementCount;abort.abort();await Promise.race([pending,new Promise((_,reject)=>setTimeout(()=>reject(Error('cancellation hung')),100))]);await new Promise(r=>setTimeout(r,80));return {before,after:layer.childElementCount,animations:document.getAnimations().length};});
  assert.ok(result.before>1);assert.equal(result.after,0);assert.equal(result.animations,0);
});
test('pre-aborted and invalid requests create no graphics',async t=>{
  const page=await setup(t);const result=await page.evaluate(async()=>{const layer=document.getElementById('a'),abort=new AbortController();abort.abort();await PuppetEffects.play({kind:'hit',settings:{size:.2,duration:1},anchors,layers:[layer],signal:abort.signal});let rejected=false;try{await PuppetEffects.play({kind:'invalid',settings:{},anchors,layers:[layer]});}catch{rejected=true;}return {rejected,nodes:layer.childElementCount};});assert.equal(result.rejected,true);assert.equal(result.nodes,0);
});
test('long pinch uses same-skin creases without impact rings and cancels both hands and marks',async t=>{
 const page=await setup(t);const result=await page.evaluate(async()=>{const layer=document.getElementById('a'),abort=new AbortController();const pending=PuppetEffects.play({kind:'pinch',settings:{size:.2,duration:15,skinColor:'#694631',pinchMarkScale:1.3,pinchMarkOpacity:.9},anchors,layers:[layer],signal:abort.signal});const marks=[...layer.querySelectorAll('.fx-pinch-mark')],data={marks:marks.length,colors:marks.map(e=>e.dataset.skinColor),creases:layer.querySelectorAll('.pm-creases').length,rings:layer.querySelectorAll('.fx-shock,.fx-burst,.fx-pinch-spark').length,markDuration:marks[0]?.getAnimations()[0]?.effect.getTiming().duration};abort.abort();await pending;data.remaining=layer.childElementCount;return data;});
 assert.equal(result.marks,2);assert.deepEqual(result.colors,['#694631','#694631']);assert.equal(result.creases,2);assert.equal(result.rings,0);assert.ok(result.markDuration>15000);assert.equal(result.remaining,0);
});
test('skin color validation occurs before drawing and zero mark opacity omits skin patches',async t=>{
 const page=await setup(t);const result=await page.evaluate(async()=>{const layer=document.getElementById('a');let invalid=false;try{await PuppetEffects.play({kind:'pinch',settings:{size:.2,duration:1,skinColor:'url(bad)'},anchors,layers:[layer]});}catch{invalid=true;}const afterInvalid=layer.childElementCount;const abort=new AbortController();const pending=PuppetEffects.play({kind:'pinch',settings:{size:.2,duration:1,pinchMarkOpacity:0},anchors,layers:[layer],signal:abort.signal});const marks=layer.querySelectorAll('.fx-pinch-mark').length,hands=layer.querySelectorAll('.fx-art').length;abort.abort();await pending;return {invalid,afterInvalid,marks,hands};});assert.equal(result.invalid,true);assert.equal(result.afterInvalid,0);assert.equal(result.marks,0);assert.equal(result.hands,2);
});

test('hit contact follows head anchor and scales independently of the hand and impact',async t=>{
 const page=await setup(t);const result=await page.evaluate(async()=>{
  const layer=document.getElementById('a');const records=[];
  for(const contactScale of [.5,2]){const c=new AbortController();const pending=PuppetEffects.play({kind:'hit',settings:{size:.2,duration:1,hitTarget:'head',contactScale,effectScale:.5},anchors:{...anchors,hitHead:{x:.3,y:.2}},layers:[layer],signal:c.signal});
   const hand=layer.querySelector('.fx-prop'),mark=layer.querySelector('.fx-hit-contact');records.push({handWidth:parseFloat(hand.style.width),markWidth:parseFloat(mark.style.width),center:parseFloat(mark.style.left)+parseFloat(mark.style.width)/2,target:mark.dataset.target});c.abort();await pending;
  }return {records,remaining:layer.childElementCount};
 });assert.equal(result.records[0].handWidth,result.records[1].handWidth);assert.equal(result.records[1].markWidth/result.records[0].markWidth,4);assert.equal(result.records[0].center,1920*.3);assert.equal(result.records[0].target,'head');assert.equal(result.remaining,0);
});
