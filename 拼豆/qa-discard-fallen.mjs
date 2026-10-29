import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {colorByHex} from './src/patterns.js';
const out=resolve(import.meta.dirname,'tmp/qa-discard');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:720}});await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const pause=ms=>page.waitForTimeout(ms),snap=()=>page.evaluate(()=>window.__pegQa.snapshot());
async function effect(id,params={},tier='medium'){await page.mouse.dblclick(25,30);await page.locator('[data-menu-tab="effects"]').click();await page.locator(`[data-effect="${id}"]`).click();const c=page.locator(`[data-tier="${tier}"]`);for(const[k,v]of Object.entries(params)){await c.locator(`[data-param="${k}"]`).fill(String(v));await c.locator(`[data-param="${k}"]`).press('Tab');}await c.getByRole('button',{name:'预览此档'}).click();await page.getByRole('button',{name:'完成设置',exact:true}).click();}
async function clickPoint(point){await page.mouse.click(point.x,point.y);await pause(400);}
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot());await effect('help',{amount:10});await effect('shake',{amount:1,strength:100},'heavy');await page.waitForFunction(()=>window.__pegQa.snapshot().fallen.length>=2);await pause(1600);
 const before=await snap(),removed=before.fallen[0],index=removed.row*before.size+removed.col;await clickPoint(await page.evaluate(id=>window.__pegQa.fallenPoint(id),removed.id));await page.waitForFunction(id=>!window.__pegQa.snapshot().fallen.some(b=>b.id===id),removed.id);
 assert.equal(await page.locator('#held-name').textContent(),'还没有豆子');assert.equal((await snap()).placed[index],null);
 await clickPoint(await page.evaluate(b=>window.__pegQa.cellPoint(b.row,b.col),removed));assert.equal((await snap()).placed[index],null,'removed loose bead must not be reusable from hand');
 await clickPoint(await page.evaluate(code=>window.__pegQa.palettePoint(code),colorByHex(removed.color).code));await clickPoint(await page.evaluate(b=>window.__pegQa.cellPoint(b.row,b.col),removed));assert.equal((await snap()).placed[index].color,removed.color);
 await effect('pen',{amount:60,capacity:5});await clickPoint(await page.evaluate(()=>window.__pegQa.palettePoint('P03')));const held=await page.locator('#held-name').textContent();assert.match(held,/×5/);const second=(await snap()).fallen[0];await clickPoint(await page.evaluate(id=>window.__pegQa.fallenPoint(id),second.id));await page.waitForFunction(id=>!window.__pegQa.snapshot().fallen.some(b=>b.id===id),second.id);assert.equal(await page.locator('#held-name').textContent(),held,'discard must not replace or consume already-held fresh beads');
 await page.screenshot({path:resolve(out,'discard-keeps-held.png')});await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());assert.ok(!(await snap()).fallen.some(b=>[removed.id,second.id].includes(b.id)));assert.equal((await snap()).placed[index].color,removed.color);assert.equal(await page.locator('#held-name').textContent(),'还没有豆子');
 assert.deepEqual(errors,[]);const result={clickDiscards:true,emptyHandStaysEmpty:true,requiresNewBottleBead:true,heldPenBeadsUnchanged:true,refreshDoesNotRestoreDiscarded:true,errors};await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
