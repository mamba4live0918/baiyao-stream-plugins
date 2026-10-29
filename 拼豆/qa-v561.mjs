// V5.6.1 验收：摇掉很多豆后掉落豆合批绘制、落定后可逐颗拾取、一次摇晃只存一次档；新镊子与拼豆笔模型。
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const out=resolve(import.meta.dirname,'tmp/qa-v561');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
let browser;try{browser=await chromium.launch({channel:'chrome',headless:true,args});}catch{browser=await chromium.launch({headless:true,args});}
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};
 // 统计写存档次数（本插件的主存档键）。
 const set=Storage.prototype.setItem;window.__saves=0;Storage.prototype.setItem=function(k,v){if(/peg|拼豆|bead/i.test(k))window.__saves++;return set.call(this,k,v);};});
const page=await context.newPage(),errors=[],dialogs=[];page.setDefaultTimeout(180000);
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
const qa=(fn,arg)=>page.evaluate(fn,arg);
const gift=(name,count=1)=>qa(g=>window.__sendGift({giftName:g.name,count:g.count,nickName:'验收'}),{name,count});
const result={};
try{
 await page.goto(pathToFileURL(resolve(import.meta.dirname,'拼豆-1.html')).href+'?qa=1');
 await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 // 1. 手持镊子。
 const jar=await qa(()=>window.__pegQa.palettePoint('G698'));await page.mouse.click(jar.x,jar.y);
 const cell=await qa(()=>window.__pegQa.cellPoint(12,20));await page.mouse.move(cell.x,cell.y,{steps:4});await page.waitForTimeout(1500);
 let tool=(await qa(()=>window.__pegQa.stats())).tool;assert.equal(tool.visible,true);assert.equal(tool.tweezers,true);assert.equal(tool.pen,false);
 await page.screenshot({path:resolve(out,'tweezers.png'),clip:{x:cell.x-200,y:cell.y-220,width:420,height:320}});
 // 2. 拼豆笔：笔管里的豆数 = 手里剩余（最多显示 12）。
 await page.keyboard.press('Escape');await gift('拼豆笔');await page.waitForTimeout(1500);
 await page.mouse.click(jar.x,jar.y);await page.mouse.move(cell.x,cell.y,{steps:4});await page.waitForTimeout(1500);
 tool=(await qa(()=>window.__pegQa.stats())).tool;const n=Number((await page.locator('#held-name').innerText()).match(/×(\d+)/)?.[1]||1);
 assert.equal(tool.pen,true);assert.equal(tool.tweezers,false);assert.equal(tool.penBeads,Math.min(12,n));
 await page.mouse.click(cell.x,cell.y);await page.waitForTimeout(600);
 const after=(await qa(()=>window.__pegQa.stats())).tool.penBeads;assert.equal(after,Math.min(12,n-1),'放下一颗，笔里少一颗');
 await page.screenshot({path:resolve(out,'pen.png'),clip:{x:cell.x-200,y:cell.y-220,width:420,height:320}});
 result.tools={pen:{held:n,beads:tool.penBeads,afterPlace:after}};
 await page.keyboard.press('Escape');
 // 3. 摇掉很多豆。
 const base=(await qa(()=>window.__pegQa.stats())).drawCalls;
 await gift('助力拼豆',60);await page.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=400,null,{timeout:120000});
 await page.waitForFunction(()=>window.__pegQa.stats().beadMeshes===0,null,{timeout:180000});
 const saves0=await qa(()=>window.__saves);
 await gift('摇摇乐',6);
 // 等所有摇晃结算完：至少 20 秒，且掉落数连续 8 秒不变。
 let last=-1,stableSince=Date.now();
 for(const t0=Date.now();Date.now()-t0<120000;){await page.waitForTimeout(1000);const f=await qa(()=>window.__pegQa.snapshot().fallen.length);if(f!==last){last=f;stableSince=Date.now();}else if(f>0&&Date.now()-t0>=20000&&Date.now()-stableSince>=8000)break;}
 await page.waitForFunction(()=>window.__pegQa.stats().beadMeshes===window.__pegQa.snapshot().fallen.length,null,{timeout:60000});
 const shaken=await qa(()=>({fallen:window.__pegQa.snapshot().fallen.length,stats:window.__pegQa.stats(),saves:window.__saves}));
 assert.ok(shaken.fallen>=100,`摇 6 次应掉很多豆，实际 ${shaken.fallen}`);
 assert.ok(shaken.stats.drawCalls<base+40,`掉落 ${shaken.fallen} 颗后绘制次数 ${shaken.stats.drawCalls}（摇前 ${base}）`);
 const savesDuringShake=shaken.saves-saves0;assert.ok(savesDuringShake<=30,`掉 ${shaken.fallen} 颗只应存几次档，实际 ${savesDuringShake}`);
 await page.screenshot({path:resolve(out,'shake-fallen.png')});
 // 4. 落定后逐颗拾取。
 for(let k=0;k<3;k++){
  const target=await qa(()=>{for(const b of window.__pegQa.snapshot().fallen){const p=window.__pegQa.fallenPoint(b.id);if(p&&p.x>40&&p.x<1240&&p.y>40&&p.y<680)return {id:b.id,...p};}return null;});
  assert.ok(target,'找得到可点的掉落豆');await page.mouse.click(target.x,target.y);
  await page.waitForFunction(id=>!window.__pegQa.snapshot().fallen.some(b=>b.id===id),target.id,{timeout:20000});
 }
 assert.equal((await qa(()=>window.__pegQa.snapshot())).fallen.length,shaken.fallen-3);
 // 5. 刷新后掉落豆仍在原处、仍合批。
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 // 刷新后已拼的豆会重新落柱，等它们套稳后，剩下的非柱上豆应恰好是掉落豆。
 await page.waitForFunction(()=>window.__pegQa.stats().beadMeshes===window.__pegQa.snapshot().fallen.length,null,{timeout:120000});
 const reloaded=await qa(()=>({fallen:window.__pegQa.snapshot().fallen.length,stats:window.__pegQa.stats()}));
 assert.equal(reloaded.fallen,shaken.fallen-3);assert.equal(reloaded.stats.looseDraw,reloaded.fallen);
 result.shake={fallen:shaken.fallen,drawCallsBefore:base,drawCallsAfter:shaken.stats.drawCalls,savesDuringShake,pickedUp:3,afterReload:reloaded.fallen};
 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);result.pageErrors=0;result.nativeDialogs=0;
 await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('errors',errors);throw e;}
finally{await browser.close();}
