import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {autoConfirm} from './qa-select-helper.mjs';
import {createPresetPattern,colorByHex} from './src/patterns.js';
const out=resolve(import.meta.dirname,'tmp/qa-saves');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await autoConfirm(page);
const pause=ms=>page.waitForTimeout(ms),snapshot=()=>page.evaluate(()=>window.__pegQa.snapshot());
async function menu(tab='saves'){if(!await page.locator('#settings-overlay').isVisible())await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator(`[data-menu-tab="${tab}"]`).click();}
async function close(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
async function effect(id,params={},tier='medium'){await menu('effects');await page.locator(`[data-effect="${id}"]`).click();const card=page.locator(`[data-tier="${tier}"]`);for(const[k,v]of Object.entries(params)){await card.locator(`[data-param="${k}"]`).fill(String(v));await card.locator(`[data-param="${k}"]`).press('Tab');}await card.getByRole('button',{name:'预览此档'}).click();await close();}
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot());
 await effect('help',{amount:8});await effect('shake',{strength:100,amount:1},'heavy');await pause(1800);assert.ok((await snapshot()).fallen.length>0);
 await effect('spill',{presses:4,decay:0},'light');await page.keyboard.press('Space');assert.equal((await snapshot()).restoreProgress,25);
 await effect('extra',{amount:2});await menu();await page.locator('#save-name').fill('中途 A');await page.locator('#save-progress').click();await page.locator('.progress-save-row').filter({hasText:'中途 A'}).waitFor();
 const dl=page.waitForEvent('download');await page.locator('#export-progress').click();await(await dl).saveAs(resolve(out,'progress.json'));const saved=JSON.parse(await readFile(resolve(out,'progress.json'),'utf8'));assert.equal(saved.state.game.traySpilled,true);assert.equal(saved.state.game.restoreProgress,25);assert.equal(saved.state.game.requiredRounds,3);
 await page.screenshot({path:resolve(out,'saved.png')});await close();for(let i=0;i<19;i++)await page.keyboard.press('Space');await effect('help',{amount:2});assert.equal((await snapshot()).traySpilled,false);
 await menu();await page.locator('.progress-save-row').filter({hasText:'中途 A'}).getByRole('button',{name:'继续拼豆'}).click();await page.waitForFunction(()=>window.__pegQa.snapshot().traySpilled);assert.equal((await snapshot()).restoreProgress,25);assert.equal((await snapshot()).fallen.length,saved.state.game.fallen.length);
 await menu();await page.locator('.progress-save-row[data-save-id="recovery"]').waitFor();await page.screenshot({path:resolve(out,'recovery.png')});
 const bad=structuredClone(saved);bad.state.game.nextId=0;await writeFile(resolve(out,'corrupt.json'),JSON.stringify(bad));const before=await snapshot();await page.locator('#save-file').setInputFiles(resolve(out,'corrupt.json'));await pause(100);assert.equal(await page.locator('#save-import-preview').isVisible(),false);assert.equal((await snapshot()).placed.filter(Boolean).length,before.placed.filter(Boolean).length);
 await page.locator('#save-file').setInputFiles(resolve(out,'progress.json'));await page.locator('#save-import-preview').waitFor({state:'visible'});await page.screenshot({path:resolve(out,'import-preview.png')});await page.locator('#cancel-save-import').click();assert.equal(await page.locator('#save-import-preview').isVisible(),false);
 await page.locator('#save-file').setInputFiles(resolve(out,'progress.json'));await page.locator('#confirm-save-import').click();await page.waitForFunction(()=>document.querySelectorAll('.progress-save-row').length===3);
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());assert.equal((await snapshot()).traySpilled,true);assert.equal((await snapshot()).restoreProgress,25);await menu();assert.equal(await page.locator('.progress-save-row').count(),3);
 const noStorage=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});await noStorage.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});const q=await noStorage.newPage();await q.goto('http://127.0.0.1:8137/?qa=1');await q.waitForFunction(()=>window.__pegQa?.snapshot());await q.mouse.dblclick(25,30);await q.locator('[data-menu-tab="saves"]').click();assert.match(await q.locator('#auto-save-status').textContent(),/失败/);const exportFailedStorage=q.waitForEvent('download');await q.locator('#export-progress').click();await(await exportFailedStorage).saveAs(resolve(out,'without-localstorage.json'));assert.equal(JSON.parse(await readFile(resolve(out,'without-localstorage.json'),'utf8')).format,'peg-bead-progress');await noStorage.close();
 assert.deepEqual(errors,[]);console.log({namedSave:true,export:true,restoreFallenAndTrayAndRounds:true,recoveryBeforeLoad:true,invalidImportPreservesCurrent:true,importPreviewAndCancel:true,refreshPersists:true,exportWithoutLocalStorage:true,errors});
}catch(e){await page.screenshot({path:resolve(out,'failure.png')});console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();}
