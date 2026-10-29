import {chooseOption,autoConfirm} from './qa-select-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=import.meta.dirname,out=resolve(root,'tmp/qa-v4');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await autoConfirm(page);
page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
const pause=ms=>page.waitForTimeout(ms),snapshot=()=>page.evaluate(()=>window.__pegQa.snapshot()),mode=()=>page.evaluate(()=>window.__pegQa.mode());
const shot=name=>page.screenshot({path:resolve(out,name+'.png'),omitBackground:true});
async function menu(tab='modes'){await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator(`[data-menu-tab="${tab}"]`).click();}
async function close(){await page.getByRole('button',{name:'完成设置',exact:true}).click();await pause(100);}
async function effect(id,amount=1){await menu('effects');await page.locator(`[data-effect="${id}"]`).click();const card=page.locator('[data-tier="medium"]');await card.locator('[data-param="amount"]').fill(String(amount));await card.locator('[data-param="amount"]').press('Tab');await card.getByRole('button',{name:'预览此档'}).click();await close();}
async function place(code,row,col){const p=await page.evaluate(c=>window.__pegQa.palettePoint(c),code);assert.ok(p,'visible color '+code);await page.mouse.click(p.x,p.y);await pause(280);const q=await page.evaluate(([r,c])=>window.__pegQa.cellPoint(r,c),[row,col]);await page.mouse.click(q.x,q.y);await pause(280);}
async function iron(style='matte'){await page.locator('#iron-button').click();await page.locator(`.iron-option`).filter({hasText:{matte:'澡巾烫',crinkle:'褶皱烘焙纸烫',soft:'毛巾烫',double:'双面保孔烫',flat:'单面无孔烫'}[style]}).click();await page.locator('#start-iron').click();await page.waitForFunction(()=>!document.getElementById('save-button').disabled&&document.querySelector('#iron-overlay.open'));}
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.mode());await menu();await shot('modes');
 await chooseOption(page,'#color-tier','256');await close();assert.match(await page.locator('#palette-page-note').textContent(),/256/);await page.locator('#palette-next').click();assert.match(await page.locator('#palette-page-note').textContent(),/^2/);
 await menu();await chooseOption(page,'#play-mode','free');await pause(200);assert.equal((await mode()).playMode,'free');assert.equal((await snapshot()).placed.filter(Boolean).length,0);
 await page.locator('#free-name').fill('自选色小作品');await page.locator('#free-name').press('Tab');await page.locator('#free-color').fill('#123456');await page.locator('#free-color-add').click();await close();
 await place('#123456',10,10);await place('#123456',10,11);assert.equal((await snapshot()).placed.filter(Boolean).length,2);assert.equal(await page.locator('#iron-button').isEnabled(),true);await shot('free');
 await effect('help',20);assert.equal((await snapshot()).placed.filter(Boolean).length,2);await effect('extra',1);
 await iron('flat');const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('songlan-peg-studio-v2')).finished);assert.equal(finished.cells.filter(Boolean).length,2);assert.ok(finished.cells.filter(Boolean).every(c=>c==='#123456'));
 await page.locator('#start-iron').click();assert.equal((await snapshot()).placed.filter(Boolean).length,0);assert.equal((await snapshot()).replayCells.filter(Boolean).length,2);
 await place('#123456',10,10);await place('#123456',10,11);await iron('soft');await page.locator('#save-button').click();await page.locator('#start-iron').click();
 await menu();await chooseOption(page,'#play-mode','pattern');await pause(200);await page.locator('#level-size').fill('24');await page.locator('#level-add-preset').click();await page.locator('#pattern-grid .pattern-card').filter({hasText:'红苹果'}).first().click();assert.equal((await mode()).campaign.levels.length,4);
 await page.locator('[data-menu-tab="modes"]').click();await chooseOption(page,'#color-tier','original');await page.locator('#level-size').fill('16');await page.locator('#image-input').setInputFiles([]);
 const chooser=page.waitForEvent('filechooser');await page.locator('#level-add-upload').click();await(await chooser).setFiles(resolve(out,'gradient.png'));await page.waitForFunction(()=>window.__pegQa.mode().campaign.levels.length===5);
 const levels=(await mode()).campaign.levels;assert.equal(levels[4].pattern.size,16);assert.equal(levels[4].pattern.colorTier,'original');assert.ok(new Set(levels[4].pattern.cells).size>48);
 await page.locator('.level-row').last().getByRole('button',{name:'↑',exact:true}).click();assert.equal((await mode()).campaign.levels[3].pattern.id,'custom');await shot('campaign-editor');
 await chooseOption(page,'#play-mode','campaign');await close();await effect('help',500);
 await page.locator('#iron-button').click();
 for(const[name,id]of [['澡巾烫','matte'],['褶皱烘焙纸烫','crinkle'],['毛巾烫','soft'],['双面保孔烫','double'],['单面无孔烫','flat']]){await page.locator('.iron-option').filter({hasText:name}).click();await pause(250);await shot('finish-'+id);}
 await page.locator('.iron-option').filter({hasText:'褶皱烘焙纸烫'}).click();await page.locator('#start-iron').click();await page.waitForFunction(()=>!document.getElementById('save-button').disabled&&document.querySelector('#iron-overlay.open'));
 const dl=page.waitForEvent('download');await page.locator('#download-glb-button').click();await(await dl).saveAs(resolve(out,'crinkle.glb'));const glb=await readFile(resolve(out,'crinkle.glb'));const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());assert.ok(json.materials.some(m=>m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture));
 await page.locator('#start-iron').click();assert.equal(await page.locator('#next-level').isVisible(),true);await page.locator('#next-level').click();assert.equal((await mode()).campaign.index,1);assert.equal((await snapshot()).placed.filter(Boolean).length,0);
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.mode());assert.equal((await mode()).campaign.index,1);assert.equal((await mode()).playMode,'campaign');
 await menu();await chooseOption(page,'#play-mode','free');await pause(200);assert.equal((await snapshot()).completedRounds,2);await close();await page.locator('#iron-button').click();assert.equal(await page.locator('#finished-viewer canvas').count(),1);await shot('saved-free');
 await page.locator('#start-iron').click();await menu();await chooseOption(page,'#play-mode','pattern');await page.locator('[data-menu-tab="library"]').click();const rawChooser=page.waitForEvent('filechooser');await page.locator('#menu-upload').click();await(await rawChooser).setFiles(resolve(out,'gradient.png'));await page.waitForFunction(()=>window.__pegQa.snapshot().patternId==='custom');await close();await pause(200);const stats=await page.evaluate(()=>window.__pegQa.stats());assert.ok(stats.drawCalls<500,'raw hints must remain batched');await shot('raw-colors');
 assert.deepEqual(errors,[]);const result={modes:['pattern','free','campaign'],palette256:true,originalUpload:true,levels:5,manualFreeColors:2,freeExtraRound:true,campaignAdvanceAndReload:true,materialNormalAndRoughnessExport:true,rawRenderStats:stats,errors};await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));console.log(result);
}catch(e){await shot('failure');console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();}
