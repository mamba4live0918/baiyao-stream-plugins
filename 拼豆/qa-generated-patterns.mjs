import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {PRESETS,createPresetPattern,colorByHex} from './src/patterns.js';
import {PegGame} from './src/game.js';
import {chooseOption,autoConfirm} from './qa-select-helper.mjs';
const out=resolve(import.meta.dirname,'tmp/qa-generated');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
await context.route('**/*',route=>/^http:\/\/(127\.0\.0\.1|localhost):8137\//.test(route.request().url())?route.continue():route.abort());
await context.routeWebSocket('**/*',ws=>ws.close());
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await autoConfirm(page);
async function menu(tab='base'){await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator(`[data-menu-tab="${tab}"]`).click();}
async function close(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
const snapshot=()=>page.evaluate(()=>window.__pegQa.snapshot());
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot());
 assert.equal((await snapshot()).patternId,PRESETS[0].id);
 assert.equal(await page.evaluate(()=>window.__pegQa.mode().settings.desk),false);
 await menu('library');await page.locator('#menu-choose-pattern').click();assert.equal(await page.locator('.pattern-card').count(),52);
 await page.screenshot({path:resolve(out,'gallery.png')});
 await page.getByRole('button',{name:'甜品咖啡馆',exact:true}).click();assert.equal(await page.locator('.pattern-card').count(),16);
 const entry=PRESETS.find(p=>p.name==='薄荷巧克力冰淇淋');await page.locator('.pattern-card').filter({hasText:entry.name}).click();
 await page.waitForFunction(id=>window.__pegQa.snapshot().patternId===id,entry.id);
 const p=createPresetPattern(entry.id,46);assert.equal((await snapshot()).size,46);
 const needed=[...new Set(p.cells.filter(Boolean))];const inventory=await page.evaluate(()=>window.__pegQa.inventory());assert.deepEqual(new Set(inventory.slice(0,needed.length).map(c=>c.hex)),new Set(needed));assert.ok(inventory.slice(0,needed.length).every(c=>/^[PG]\d+$/.test(c.code)));
 await menu();await chooseOption(page,'#jar-filter','needed');await page.locator('#custom-board-size').fill('16');await page.locator('#apply-board-size').click();assert.equal((await snapshot()).size,46);await close();
 const i=p.cells.findIndex(Boolean),row=Math.floor(i/p.size),col=i%p.size,hex=p.cells[i];
 const source=await page.evaluate(code=>window.__pegQa.palettePoint(code),colorByHex(hex).code),dest=await page.evaluate(pos=>window.__pegQa.cellPoint(pos.row,pos.col),{row,col});
 await page.mouse.click(source.x,source.y);await page.waitForFunction(code=>document.getElementById('held-name').textContent.includes(code),colorByHex(hex).code);await page.mouse.click(dest.x,dest.y);await page.waitForFunction(at=>window.__pegQa.snapshot().placed[at],i);
 assert.equal((await snapshot()).placed[i].color,hex);await page.screenshot({path:resolve(out,'board-color-codes.png')});
 await menu('saves');await page.locator('#save-name').fill('新图纸恢复测试');await page.locator('#save-progress').click();await page.locator('.progress-save-row').filter({hasText:'新图纸恢复测试'}).waitFor();const downloading=page.waitForEvent('download');await page.locator('#export-progress').click();await(await downloading).saveAs(resolve(out,'new-pattern-save.json'));
 const save=JSON.parse(await readFile(resolve(out,'new-pattern-save.json'),'utf8'));assert.equal(save.state.pattern.source.kind,'generated');assert.deepEqual(save.state.pattern.cells,p.cells);await close();
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());assert.equal((await snapshot()).placed[i].color,hex);assert.equal((await snapshot()).patternId,entry.id);
 await menu('effects');await page.locator('[data-effect="help"]').click();const tier=page.locator('[data-tier="medium"]');await tier.locator('[data-param="amount"]').fill('2304');await tier.locator('[data-param="amount"]').press('Tab');await tier.getByRole('button',{name:'预览此档'}).click();await close();await page.waitForFunction(()=>!document.getElementById('iron-button').disabled);await page.screenshot({path:resolve(out,'completed-board.png')});
 await page.locator('#iron-button').click();await page.locator('.iron-option').filter({hasText:'双面保孔烫'}).click();await page.locator('#start-iron').click();await page.waitForFunction(()=>!document.getElementById('download-glb-button').disabled);
 const download=page.waitForEvent('download');await page.locator('#download-glb-button').click();await(await download).saveAs(resolve(out,'generated-finished.glb'));assert.equal((await readFile(resolve(out,'generated-finished.glb'))).readUInt32LE(0),0x46546c67);await page.screenshot({path:resolve(out,'finished-3d.png')});await page.locator('#start-iron').click();assert.equal(await page.locator('#iron-overlay').isVisible(),false);
 const legacyContext=await browser.newContext({viewport:{width:1280,height:720}});const old=createPresetPattern('camera',30),g=new PegGame({pattern:old});g.help(7);await legacyContext.addInitScript(record=>localStorage.setItem('songlan-peg-studio-v2',JSON.stringify(record)),{pattern:old,game:g.snapshot(),settings:{appearanceVersion:3,desk:false}});const legacy=await legacyContext.newPage();await legacy.goto('http://127.0.0.1:8137/?qa=1');await legacy.waitForFunction(()=>window.__pegQa?.snapshot());assert.equal(await legacy.locator('#pattern-overlay').isVisible(),true);assert.equal((await legacy.evaluate(()=>window.__pegQa.snapshot())).placed.filter(Boolean).length,7);assert.match(await legacy.locator('#pattern-name').textContent(),/旧版进度/);assert.equal(await legacy.locator('.pattern-card').count(),52);await legacyContext.close();
 assert.deepEqual(errors,[]);const result={presets:52,categories:6,newDefault:true,nativeGridPreserved:true,requiredColorsOnFirstPage:true,shortColorCodes:true,manualPlacement:true,namedSaveAndFileExport:true,reloadPreservesProgress:true,threeDimensionalFinishAndGLB:true,finishButtonReturns:true,oldProgressPreserved:true,offlineResourceDependencies:true,errors};await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(result);
}catch(e){await page.screenshot({path:resolve(out,'failure.png')});throw e;}finally{await browser.close();}
