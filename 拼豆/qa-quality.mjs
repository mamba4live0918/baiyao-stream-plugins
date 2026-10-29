// V5.3 验收：画质设置（成品 3D 与工作台）、切换不丢进度、成品按画质生成并可下载 GLB。
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {chooseOption,autoConfirm} from './qa-select-helper.mjs';
const out=resolve(import.meta.dirname,'tmp/qa-quality');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
let browser;try{browser=await chromium.launch({channel:'chrome',headless:true,args});}catch{browser=await chromium.launch({headless:true,args});}
const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
await context.route('**/*',route=>/^http:\/\/(127\.0\.0\.1|localhost):8137\//.test(route.request().url())?route.continue():route.abort());
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await autoConfirm(page);
page.setDefaultTimeout(240000);
const qa=(fn,arg)=>page.evaluate(fn,arg);
async function menu(){await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator('[data-menu-tab="base"]').click();}
async function closeMenu(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
const result={};
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 const base=await qa(()=>window.__pegQa.stats());assert.equal(base.quality,'high');result.defaultWorkbench={pixelRatio:base.pixelRatio,shadowMap:base.shadowMap};
 await qa(()=>window.__sendGift({giftName:'助力拼豆（重）',count:60,nickName:'帮手'}));
 await page.waitForFunction(()=>{const s=window.__pegQa.snapshot();return s.placed.filter(Boolean).length>=1304;},null,{timeout:60000});
 await page.waitForTimeout(1500);
 const before=await qa(()=>window.__pegQa.snapshot().placed.filter(Boolean).length);
 await menu();await chooseOption(page,'#workbench-quality','ultra');
 await page.waitForFunction(()=>window.__pegQa.stats()?.quality==='ultra',null,{timeout:120000});
 const ws=await qa(()=>window.__pegQa.stats());assert.equal(ws.shadowMap,4096);assert.equal(ws.pixelRatio,1.5);
 assert.equal(await qa(()=>window.__pegQa.snapshot().placed.filter(Boolean).length),before,'切换工作台画质不应丢进度');
 await chooseOption(page,'#finish-quality','ultra');await closeMenu();
 result.workbenchUltra={pixelRatio:ws.pixelRatio,shadowMap:ws.shadowMap,placedKept:before};
 await page.screenshot({path:resolve(out,'workbench-ultra.png')});
 await page.locator('#iron-button').click();await page.locator('.iron-option').filter({hasText:'褶皱烘焙纸烫'}).click();
 const preview=await qa(()=>window.__pegQa.finishStats());assert.equal(preview.quality,'standard','熨烫前的小预览用标准画质');
 const t0=Date.now();await page.locator('#start-iron').click();
 await page.waitForFunction(()=>!document.getElementById('download-glb-button').disabled,null,{timeout:600000});
 const fin=await qa(()=>window.__pegQa.finishStats());assert.equal(fin.quality,'ultra');assert.ok(fin.textureSide>=3072);
 result.finishUltra={...fin,revealSeconds:Math.round((Date.now()-t0)/1000)};
 await page.waitForTimeout(2000);await page.screenshot({path:resolve(out,'finished-ultra.png'),timeout:240000});
 const download=page.waitForEvent('download');await page.locator('#download-glb-button').click();const file=resolve(out,'finished-ultra.glb');await(await download).saveAs(file);
 const glb=await readFile(file);assert.equal(glb.readUInt32LE(0),0x46546c67);result.glbBytes=glb.length;
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());
 const saved=await qa(()=>window.__pegQa.mode().settings);assert.equal(saved.finishQuality,'ultra');assert.equal(saved.workbenchQuality,'ultra');
 assert.equal((await qa(()=>window.__pegQa.stats())).quality,'ultra');
 assert.deepEqual(errors,[]);result.pageErrors=0;
 await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('errors',errors);throw e;}
finally{await browser.close();}
