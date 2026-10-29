import {chooseOption} from './qa-select-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createPresetPattern} from './src/patterns.js';
const out=resolve(import.meta.dirname,'tmp/qa-highlight');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const pause=ms=>page.waitForTimeout(ms),count=()=>page.evaluate(()=>window.__pegQa.stats().errorHighlights);
async function expectCount(n){await page.waitForFunction(n=>window.__pegQa.stats().errorHighlights===n,n,{timeout:5000});assert.equal(await count(),n);}
const target=createPresetPattern('cherries',30).cells.findIndex(c=>c==='#ef4b5a');
async function cell(index){const p=await page.evaluate(i=>window.__pegQa.cellPoint(Math.floor(i/30),i%30),index);await page.mouse.click(p.x,p.y);await pause(280);}
async function place(code,index){const p=await page.evaluate(c=>window.__pegQa.palettePoint(c),code);await page.mouse.click(p.x,p.y);await pause(280);await cell(index);}
async function effect(id,amount){await page.mouse.dblclick(25,30);await page.locator('[data-menu-tab="effects"]').click();await page.locator(`[data-effect="${id}"]`).click();const c=page.locator('[data-tier="medium"]');await c.locator('[data-param="amount"]').fill(String(amount));await c.locator('[data-param="amount"]').press('Tab');await c.getByRole('button',{name:'预览此档'}).click();await page.getByRole('button',{name:'完成设置',exact:true}).click();}
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.stats());
 await place('P14',target);await expectCount(1);await place('P14',target-1);await expectCount(2);await pause(500);await page.screenshot({path:resolve(out,'wrong-and-extra.png')});
 assert.match(await page.locator('#status-note').textContent(),/1 颗错色.*1 颗多余/);
 const p=await page.evaluate(i=>window.__pegQa.cellPoint(Math.floor(i/30),i%30),target);await page.mouse.move(p.x,p.y);await page.keyboard.down('KeyM');await pause(1800);await page.screenshot({path:resolve(out,'magnified.png')});await page.keyboard.up('KeyM');
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.stats().errorHighlights===2);
 await cell(target);await expectCount(1);await place('P03',target);await expectCount(1);await cell(target-1);await expectCount(0);
 await effect('swap',1);await expectCount(1);await effect('help',500);await expectCount(0);
 await page.mouse.dblclick(25,30);await page.locator('[data-menu-tab="modes"]').click();await chooseOption(page,'#play-mode','free');await page.getByRole('button',{name:'完成设置',exact:true}).click();await place('P14',0);await expectCount(0);
 const fallbackContext=await browser.newContext({viewport:{width:1280,height:720}});await fallbackContext.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return original.call(this,type,...args);};});
 const f=await fallbackContext.newPage();await f.goto('http://127.0.0.1:8137/?qa=1');await f.locator('.fallback-grid').waitFor();await f.getByRole('button',{name:/取 P14/}).click();await f.locator('.fallback-cell').nth(target).click();assert.equal(await f.locator('.fallback-cell.bead-error').count(),1);await f.locator('.fallback-cell').nth(target).click();assert.equal(await f.locator('.fallback-cell.bead-error').count(),0);await fallbackContext.close();
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'summary.json'),JSON.stringify({wrongAndExtra:true,correctClears:true,giftSwapAndHelp:true,refreshRestores:true,freeModeUnmarked:true,fallback:true,errors},null,2));console.log('Highlight regression passed');
 const video=page.video();await page.close();await video.saveAs(resolve(out,'highlight-demo.webm'));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')});throw e;}finally{await browser.close();}
