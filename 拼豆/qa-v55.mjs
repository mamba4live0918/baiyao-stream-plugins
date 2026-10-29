// V5.5 验收：拿豆时目标位置闪烁提示；成品在后台线程生成（熨烫动画期间主线程不被长时间占用）；file:// 下能启动后台线程。
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {PRESETS,createPresetPattern,colorByHex} from './src/patterns.js';
import {chooseOption} from './qa-select-helper.mjs';

const out=resolve(import.meta.dirname,'tmp/qa-v55');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
let browser;try{browser=await chromium.launch({channel:'chrome',headless:true,args});}catch{browser=await chromium.launch({headless:true,args});}
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(240000);page.on('pageerror',e=>errors.push(e.message));
const qa=(fn,arg)=>page.evaluate(fn,arg);
const glow=()=>qa(()=>window.__pegQa.stats().heldGlow);
const glowIs=n=>page.waitForFunction(v=>window.__pegQa.stats().heldGlow===v,n,{timeout:30000}).then(()=>true,()=>false);
const result={};
try{
 // 直接以本地文件打开（与 OBS 本地文件来源相同的 file:// 环境）。
 await page.goto(pathToFileURL(resolve(import.meta.dirname,'拼豆-1.html')).href+'?qa=1');
 await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 const pattern=createPresetPattern(PRESETS[0].id,30),hex='#fc5d69',expected=pattern.cells.filter(c=>c===hex).length;
 const jar=await qa(code=>window.__pegQa.palettePoint(code),colorByHex(hex).code);await page.mouse.click(jar.x,jar.y);await glowIs(expected);
 assert.equal(await glow(),expected,'拿着这个颜色时，所有需要它的空位都亮');
 const i=pattern.cells.indexOf(hex),cell=await qa(p=>window.__pegQa.cellPoint(p.r,p.c),{r:Math.floor(i/pattern.size),c:i%pattern.size});
 await page.mouse.click(cell.x,cell.y);await page.waitForFunction(n=>!!window.__pegQa.snapshot().placed[n],i);
 await page.mouse.click(jar.x,jar.y);await glowIs(expected-1);
 assert.equal(await glow(),expected-1,'放下一颗后少亮一个');
 await page.screenshot({path:resolve(out,'held-glow.png')});
 await qa(()=>window.__sendGift({giftName:'遮图纸',count:1,nickName:'验收'}));await glowIs(0);
 assert.equal(await glow(),0,'遮图纸期间不提示');
 result.heldGlow={color:hex,cells:expected,afterPlace:expected-1,hiddenByGift:0};
 // 关闭设置后不亮。
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator('#held-glow-toggle').uncheck();await page.getByRole('button',{name:'完成设置',exact:true}).click();
 await page.waitForFunction(()=>window.__pegQa.snapshot().hintHiddenUntil<Date.now());
 await page.mouse.click(jar.x,jar.y);await page.waitForFunction(()=>document.getElementById('held-name').textContent.includes('G698'));await page.waitForTimeout(1500);assert.equal(await glow(),0,'关掉设置后不亮');
 // 成品：超高画质褶皱纸在后台线程生成。
 await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await chooseOption(page,'#finish-quality','ultra');await page.getByRole('button',{name:'完成设置',exact:true}).click();
 await qa(()=>window.__sendGift({giftName:'助力拼豆（重）',count:80,nickName:'验收'}));
 await page.waitForFunction(()=>{const s=window.__pegQa.snapshot();return s.placed.filter(Boolean).length>=1304;},null,{timeout:60000});
 await page.keyboard.press('Escape');
 // 记录主线程上的长任务：没有后台线程时，超高褶皱纸会占住主线程好几秒。
 await qa(()=>{window.__longTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__longTasks.push(e.duration);}).observe({type:'longtask',buffered:false});});
 await page.locator('#iron-button').click();await page.locator('.iron-option').filter({hasText:'褶皱烘焙纸烫'}).click();await page.waitForTimeout(1500);
 await qa(()=>{window.__longTasks=[];});
 const t0=Date.now();await page.locator('#start-iron').click();
 await page.waitForFunction(()=>!document.getElementById('download-glb-button').disabled,null,{timeout:600000});
 const fin=await qa(()=>({stats:window.__pegQa.finishStats(),worker:window.__pegQa.finishWorker(),longest:Math.max(0,...window.__longTasks)}));
 assert.equal(fin.worker,true,'成品在后台线程生成（file:// 页面也能启动）');assert.equal(fin.stats.quality,'ultra');assert.equal(fin.stats.textureSide,3584);
 result.finish={...fin.stats,worker:fin.worker,longestMainThreadTaskMs:Math.round(fin.longest),seconds:Math.round((Date.now()-t0)/1000)};
 await page.waitForTimeout(1500);await page.screenshot({path:resolve(out,'finished-ultra-worker.png'),timeout:240000});
 assert.deepEqual(errors,[]);result.pageErrors=0;
 await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('errors',errors);throw e;}
finally{await browser.close();}
