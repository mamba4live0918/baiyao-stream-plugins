// 在白曜重工同样的内容安全策略（不允许 WebAssembly、不允许 Blob 线程）下打开插件：
// 物理自动改用简化模式，落豆、摇掉、拾取、托盘、熨烫成品都照常，且不弹「物理初始化失败」。
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; media-src data: blob: 'self'";
const file=resolve(process.argv[2]||resolve(import.meta.dirname,'拼豆-1.html'));const html=await readFile(file);
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP,'Cache-Control':'no-store'});res.end(html);});
await new Promise(r=>server.listen(8199,'127.0.0.1',r));
const out=resolve(import.meta.dirname,'tmp/qa-csp');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
const browser=await chromium.launch({headless:true,args});
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[],csp=[];page.setDefaultTimeout(240000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|unsafe-eval/i.test(m.text()))csp.push(m.text().slice(0,160));});
const qa=(fn,a)=>page.evaluate(fn,a);const gift=(name,count=1)=>qa(g=>window.__sendGift({giftName:g.name,count:g.count,nickName:'验收'}),{name,count});
const result={};
try{
 await page.goto('http://127.0.0.1:8199/?qa=1',{timeout:240000});
 await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 await page.waitForFunction(()=>window.__pegQa.physicsMode?.());
 result.physicsMode=await qa(()=>window.__pegQa.physicsMode());
 result.wasmBlocked=csp.some(t=>/WebAssembly|unsafe-eval/i.test(t))||result.physicsMode==='lite';
 const notice=await page.locator('#notice').innerText().catch(()=>'');
 assert.doesNotMatch(notice,/物理初始化失败/,'不应再提示物理初始化失败');
 // 手动放一颗豆：落到柱上。
 const jar=await qa(()=>window.__pegQa.palettePoint('G698'));await page.mouse.click(jar.x,jar.y);await page.waitForFunction(()=>!/还没有豆子/.test(document.getElementById('held-name').textContent));
 const cell=await qa(()=>window.__pegQa.cellPoint(12,20));await page.mouse.move(cell.x,cell.y,{steps:4});await page.waitForTimeout(800);await page.mouse.click(cell.x,cell.y);
 await page.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=1);
 // 帮拼、摇掉、拾取。
 await gift('助力拼豆',40);await page.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=300,null,{timeout:120000});
 await page.waitForFunction(()=>window.__pegQa.stats().beadMeshes===0,null,{timeout:120000});
 await gift('摇摇乐',4);
 let last=-1,since=Date.now();for(const t0=Date.now();Date.now()-t0<120000;){await page.waitForTimeout(1000);const f=await qa(()=>window.__pegQa.snapshot().fallen.length);if(f!==last){last=f;since=Date.now();}else if(f>0&&Date.now()-t0>15000&&Date.now()-since>=6000)break;}
 const fallen=await qa(()=>window.__pegQa.snapshot().fallen.length);assert.ok(fallen>=50,`简化物理下也能摇掉豆，实际 ${fallen}`);
 await page.screenshot({path:resolve(out,'shaken.png')});
 const target=await qa(()=>{for(const b of window.__pegQa.snapshot().fallen){const p=window.__pegQa.fallenPoint(b.id);if(p&&p.x>40&&p.x<1240&&p.y>40&&p.y<680)return {id:b.id,...p};}return null;});
 await page.mouse.click(target.x,target.y);await page.waitForFunction(id=>!window.__pegQa.snapshot().fallen.some(b=>b.id===id),target.id,{timeout:20000});
 result.shake={fallen,pickedUp:1};
 // 托盘打翻与复原。
 await gift('掀翻托盘');await page.waitForFunction(()=>window.__pegQa.snapshot().traySpilled,null,{timeout:30000});
 const presses=(await qa(()=>window.__pegQa.snapshot())).trayPresses;
 for(let stage=1;stage<=5;stage++){for(let k=0;k<presses+1;k++){await page.keyboard.press('Space');await page.waitForTimeout(60);}await page.waitForFunction(n=>window.__pegQa.snapshot().trayRestoreStage>=n||!window.__pegQa.snapshot().traySpilled,stage,{timeout:60000});}
 await page.waitForFunction(()=>!window.__pegQa.snapshot().traySpilled,null,{timeout:60000});result.tray='restored';
 // 熨烫成品：新开一页（清空存档）补齐图案再熨烫。后台线程被 CSP 拦下时，成品改在当前线程生成。
 await page.close();
 const c2=await browser.newContext({viewport:{width:1280,height:800}});await c2.routeWebSocket('**/*',ws=>ws.close());
 await c2.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
 const p2=await c2.newPage();p2.setDefaultTimeout(600000);p2.on('pageerror',e=>errors.push(e.message));
 await p2.goto('http://127.0.0.1:8199/?qa=1',{timeout:240000});
 await p2.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 await p2.evaluate(()=>window.__sendGift({giftName:'助力拼豆',count:170,nickName:'验收'}));
 await p2.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=1304,null,{timeout:300000});
 await p2.keyboard.press('Escape');
 await p2.locator('#iron-button').click();await p2.locator('.iron-option').first().click();await p2.waitForTimeout(800);
 await p2.locator('#start-iron').click();
 await p2.waitForFunction(()=>!document.getElementById('download-glb-button').disabled,null,{timeout:600000});
 result.finish={worker:await p2.evaluate(()=>window.__pegQa.finishWorker?.()),stats:await p2.evaluate(()=>window.__pegQa.finishStats?.())};
 await p2.waitForTimeout(1500);await p2.screenshot({path:resolve(out,'finished.png')});
 result.pageErrors=errors.length;assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('errors',errors,'csp',csp.slice(0,5));throw e;}
finally{await browser.close();server.close();}
