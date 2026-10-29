// V5.4 验收：图纸随板格缩小 / 放大（确认前预览）、64 格板合批绘制、装豆盒倾倒与复原动画、刷新后散落状态恢复。
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {PRESETS,createPresetPattern} from './src/patterns.js';

const out=resolve(import.meta.dirname,'tmp/qa-v54');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
let browser;try{browser=await chromium.launch({channel:'chrome',headless:true,args});}catch{browser=await chromium.launch({headless:true,args});}
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.route('**/*',route=>/^http:\/\/(127\.0\.0\.1|localhost):8137\//.test(route.request().url())?route.continue():route.abort());
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[],dialogs=[];page.setDefaultTimeout(180000);
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
const snap=()=>page.evaluate(()=>window.__pegQa.snapshot());
const stats=()=>page.evaluate(()=>window.__pegQa.stats());
const gift=(name,count=1)=>page.evaluate(g=>window.__sendGift({giftName:g.name,count:g.count,nickName:'验收'}),{name,count});
const ready=()=>page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
async function menu(){await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator('[data-menu-tab="base"]').click();}
async function closeMenu(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
async function resizeTo(size,expectWord){
 await menu();await page.locator('#custom-board-size').fill(String(size));await page.locator('#apply-board-size').click();
 await page.locator('#confirm-layer:not([hidden])').waitFor();
 const message=await page.locator('#confirm-message').innerText();assert.match(message,expectWord);
 assert.equal(await page.locator('#confirm-preview').isVisible(),true,'换板确认要显示预览');
 await page.screenshot({path:resolve(out,`confirm-${size}.png`)});
 await page.locator('#confirm-ok').click();await page.waitForFunction(n=>window.__pegQa.snapshot().size===n,size);await closeMenu();
 return message;
}
const result={};
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await ready();
 const id=PRESETS[0].id,targets=n=>createPresetPattern(id,n,{fit:'board'}).cells.filter(Boolean).length;
 const target=async()=>page.evaluate(()=>{const s=window.__pegQa.snapshot();return s.placed.length;});
 // 1. 缩小到 30 格。
 let message=await resizeTo(30,/缩小/);
 assert.match(await page.locator('#current-pattern-source').innerText(),/缩小版/);
 assert.match(await page.locator('#progress-text').innerText(),new RegExp(`/ ${targets(30)}$`));
 result.shrink30={message,beads:targets(30)};
 // 2. 放大到 64 格。
 message=await resizeTo(64,/放大/);
 assert.match(await page.locator('#current-pattern-source').innerText(),/放大版/);
 assert.match(await page.locator('#progress-text').innerText(),new RegExp(`/ ${targets(64)}$`));
 result.enlarge64={message,beads:targets(64)};
 // 3. 64 格填满后，已套稳的豆合批绘制。
 await gift('助力拼豆（重）',120);await gift('助力拼豆（重）',120);await page.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=2600,null,{timeout:60000});
 await page.waitForFunction(()=>window.__pegQa.stats().beadMeshes===0,null,{timeout:240000});
 await page.waitForTimeout(800);const full=await stats();
 assert.ok(full.seatedInstances>=2600);assert.ok(full.drawCalls<700,`绘制次数应受控，实际 ${full.drawCalls}`);
 await page.screenshot({path:resolve(out,'board-64-full.png')});
 result.board64={placed:full.seatedInstances,drawCalls:full.drawCalls,triangles:full.triangles};
 // 4. 换回原尺寸。
 message=await resizeTo(46,/换回原尺寸/);assert.match(await page.locator('#progress-text').innerText(),/\/ 1304$/);result.back46={message};
 // 5. 装豆盒倾倒：豆盒倒下、豆飞出落到桌上。
 await gift('掀翻托盘');await page.waitForTimeout(400);
 let tray=(await stats()).tray;assert.equal(tray.spilled,true);assert.ok(tray.loose>=100);
 await page.waitForFunction(()=>{const t=window.__pegQa.stats().tray;return (t.phases.rest||0)>=t.loose*.9;},null,{timeout:240000});
 await page.screenshot({path:resolve(out,'tray-spilled.png')});
 result.spill={loose:tray.loose};
 // 6. 刷新后仍是散落状态。
 await page.reload();await ready();tray=(await stats()).tray;assert.equal(tray.spilled,true);assert.ok((tray.phases.rest||0)>=100,'刷新后桌上仍有散落的豆');
 await page.screenshot({path:resolve(out,'tray-after-reload.png')});
 // 7. 分五段复原：每段一批豆飞回，全部复原后豆盒装满、临时豆清理。
 const presses=(await snap()).trayPresses;
 for(let stage=1;stage<=5;stage++){
  for(let k=0;k<presses+1;k++){await page.keyboard.press('Space');await page.waitForTimeout(70);}
  await page.waitForFunction(n=>window.__pegQa.snapshot().trayRestoreStage>=n||!window.__pegQa.snapshot().traySpilled,stage,{timeout:60000});
  if(stage===2)await page.screenshot({path:resolve(out,'tray-returning.png')});
 }
 await page.waitForFunction(()=>{const t=window.__pegQa.stats().tray;return !t.spilled&&t.loose===0&&!t.finishing;},null,{timeout:300000});
 assert.equal((await snap()).traySpilled,false);
 await page.screenshot({path:resolve(out,'tray-restored.png')});
 result.restore={presses,cleared:true};
 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);result.pageErrors=0;
 await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('errors',errors);throw e;}
finally{await browser.close();}
