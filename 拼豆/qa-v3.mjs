import {chooseOption} from './qa-select-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createPresetPattern} from './src/patterns.js';
const out=resolve(import.meta.dirname,'tmp/qa-v3');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const url=process.argv[2]||'http://127.0.0.1:8137/?qa=1';
const pause=ms=>page.waitForTimeout(ms);
const snap=()=>page.evaluate(()=>window.__pegQa.snapshot());
async function shot(name){await page.screenshot({path:resolve(out,`${name}.png`),omitBackground:true});}
async function menu(){await page.mouse.dblclick(30,35);await page.locator('#settings-overlay.open').waitFor();}
async function close(){await page.getByRole('button',{name:'完成设置',exact:true}).click();await pause(100);}
async function effect(id,params={},tier='medium'){
 await menu();await page.locator('[data-menu-tab="effects"]').click();await page.locator(`[data-effect="${id}"]`).click();const card=page.locator(`[data-tier="${tier}"]`);
 for(const[key,value]of Object.entries(params)){const input=card.locator(`[data-param="${key}"]`);await input.fill(String(value));await input.press('Tab');}
 await card.getByRole('button',{name:'预览此档'}).click();await close();
}
try{
 await page.goto(url);await page.waitForFunction(()=>window.__pegQa?.snapshot());await pause(300);
 assert.equal(await page.locator('.topbar').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('songlan-peg-studio-v2')).settings.desk),false);await shot('transparent');
 const stats=await page.evaluate(()=>window.__pegQa.stats());assert.ok(stats.drawCalls<550);
 await menu();await shot('settings');await chooseOption(page,'#jar-filter','needed');await close();
 const compact=await page.evaluate(()=>window.__pegQa.bounds('tray'));assert.ok(compact.width<220,'needed colors compact');await shot('compact');
 const pattern=createPresetPattern('cherries',30),target=pattern.cells.findIndex(c=>c==='#ef4b5a');
 const source=await page.evaluate(()=>window.__pegQa.palettePoint('P03'));await page.mouse.click(source.x,source.y);await pause(280);assert.match(await page.locator('#held-name').textContent(),/P03/);
 const dest=await page.evaluate(i=>window.__pegQa.cellPoint(Math.floor(i/30),i%30),target);await page.mouse.click(dest.x,dest.y);await pause(280);assert.equal((await snap()).placed.filter(Boolean).length,1);
 // All four components move, resize and lock independently.
 for(const part of ['board','tray','card','dock']){
  const selector=part==='card'?'.paper-card':'.bottom-dock';const rect=['board','tray'].includes(part)?await page.evaluate(p=>window.__pegQa.bounds(p),part):await page.locator(selector).boundingBox();
  await page.mouse.dblclick(rect.x+rect.width*.3,rect.y+rect.height*.25);const box=page.locator(`.layout-edit-box[data-part="${part}"]`);await box.waitFor({state:'visible'});
  const r=await box.boundingBox();await page.mouse.move(r.x+r.width*.3,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.3+22,r.y+r.height*.3-12,{steps:5});await page.mouse.up();
  if(part==='board'){const corner=await box.locator('.layout-resize-corner').boundingBox();await page.mouse.move(corner.x+8,corner.y+8);await page.mouse.down();await page.mouse.move(corner.x+36,corner.y+36,{steps:5});await page.mouse.up();}else await page.mouse.wheel(0,-80);await pause(250);assert.ok((await page.evaluate(()=>window.__pegQa.layout()))[part].scale>1);
  await box.dblclick();assert.equal(await box.isVisible(),false);
 }
 const layout=await page.evaluate(()=>window.__pegQa.layout());await page.reload();await page.waitForFunction(()=>window.__pegQa?.layout());assert.deepEqual(await page.evaluate(()=>window.__pegQa.layout()),layout);
 await menu();await page.locator('[data-menu-tab="base"]').click();await page.locator('#reset-layout').click();await close();
 const focal=await page.evaluate(i=>window.__pegQa.cellPoint(Math.floor(i/30),i%30),target+1);await page.mouse.move(focal.x,focal.y);await page.keyboard.down('KeyM');await pause(150);assert.equal(await page.locator('.local-magnifier').isVisible(),true);await shot('magnifier');await page.keyboard.up('KeyM');assert.equal(await page.locator('.local-magnifier').isVisible(),false);
 await menu();await page.locator('#magnifier-key').press('KeyZ');await close();await page.keyboard.down('KeyZ');assert.equal(await page.locator('.local-magnifier').isVisible(),true);await page.keyboard.up('KeyZ');assert.equal(await page.locator('.local-magnifier').isVisible(),false);await menu();await page.locator('#magnifier-key').press('KeyM');await close();
 await menu();await page.locator('[data-menu-tab="effects"]').click();assert.equal(await page.locator('[data-effect]').count(),9);
 for(const id of ['shake','swap','help','remove','hide','spill','confiscate','pen','extra']){await page.locator(`[data-effect="${id}"]`).click();assert.equal(await page.locator('.tier-card').count(),3);}await shot('tiers');await close();
 await effect('help',{amount:25});await effect('shake',{strength:100,amount:1},'heavy');await pause(6200);
 let fallen=(await snap()).fallen;assert.ok(fallen.length>0,'shake must leave manual pickup beads');const count=fallen.length;await shot('fallen');await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());await pause(250);assert.equal((await snap()).fallen.length,count);
 for(let n=0;n<count;n++){fallen=(await snap()).fallen;const point=await page.evaluate(id=>window.__pegQa.fallenPoint(id),fallen[0].id);await page.mouse.click(point.x,point.y);await pause(280);assert.equal((await snap()).fallen.length,count-n-1);await page.keyboard.press('Escape');}
 await effect('spill',{presses:4,decay:0},'light');const before=(await snap()).placed.filter(Boolean).length;
 await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');assert.equal((await snap()).restoreProgress,25);
 for(let i=0;i<19;i++)await page.keyboard.press('Space');assert.equal((await snap()).traySpilled,false);assert.equal((await snap()).placed.filter(Boolean).length,before);
 await effect('help',{amount:500});await page.locator('#iron-button').click();assert.equal(await page.locator('.iron-option').count(),5);
 for(const name of ['澡巾烫','褶皱烘焙纸烫','毛巾烫','双面保孔烫','单面无孔烫'])await page.locator('.iron-option').filter({hasText:name}).click();
 await page.locator('.iron-option').filter({hasText:'褶皱烘焙纸烫'}).click();await page.locator('#start-iron').click();await page.waitForFunction(()=>!document.getElementById('save-button').disabled&&document.querySelector('#iron-overlay.open'));await shot('finished');
 assert.equal(await page.locator('#start-iron').isEnabled(),true);
 const gp=page.waitForEvent('download');await page.locator('#download-glb-button').click();await(await gp).saveAs(resolve(out,'finished.glb'));
 const glb=await readFile(resolve(out,'finished.glb'));assert.equal(glb.subarray(0,4).toString(),'glTF');
 await page.locator('#save-button').click();await page.locator('#start-iron').click();assert.equal(await page.locator('#iron-overlay').isVisible(),false);
 await page.locator('#iron-button').click();await page.locator('#start-iron').click();assert.equal(await page.locator('#iron-overlay').isVisible(),false);
 assert.deepEqual(errors,[]);const summary={url,checks:'default transparency; four layouts move/scale/lock/persist; compact bins; manual placement; magnifier; nine interactions × three tiers; fallen beads survive 6 seconds and reload, manually picked; tray restore; five finishes; finish return; saved GLB',fallenCount:count,stats,errors};await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2));console.log(summary);
}catch(e){await shot('failure');console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();}

