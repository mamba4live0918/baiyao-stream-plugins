import {chooseOption} from './qa-select-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const out=resolve(import.meta.dirname,'tmp/qa-magnifier-mode');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const lens=page.locator('.local-magnifier'),pause=ms=>page.waitForTimeout(ms);
async function menu(){await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();}
async function close(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot());await page.mouse.move(735,365);
 await page.keyboard.down('KeyM');assert.equal(await lens.isVisible(),true);await pause(700);await page.keyboard.up('KeyM');assert.equal(await lens.isVisible(),false);
 await menu();assert.equal(await page.locator('#magnifier-mode').inputValue(),'hold');await chooseOption(page,'#magnifier-mode','toggle');await page.screenshot({path:resolve(out,'setting.png')});await close();
 await page.mouse.move(735,365);await page.keyboard.down('KeyM');await page.keyboard.down('KeyM');assert.equal(await lens.isVisible(),true);await page.keyboard.up('KeyM');assert.equal(await lens.isVisible(),true);await pause(1300);await page.mouse.move(780,395,{steps:12});await page.screenshot({path:resolve(out,'toggle-on.png')});await pause(700);await page.keyboard.press('KeyM');assert.equal(await lens.isVisible(),false);
 await page.keyboard.press('KeyM');await page.keyboard.press('Escape');assert.equal(await lens.isVisible(),false);await page.keyboard.press('KeyM');assert.equal(await lens.isVisible(),true);
 await menu();assert.equal(await lens.isVisible(),false);await page.locator('#magnifier-key').press('KeyZ');await close();await page.keyboard.press('KeyM');assert.equal(await lens.isVisible(),false);await page.keyboard.press('KeyZ');assert.equal(await lens.isVisible(),true);await page.keyboard.press('KeyZ');assert.equal(await lens.isVisible(),false);
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());await menu();assert.equal(await page.locator('#magnifier-mode').inputValue(),'toggle');assert.equal(await page.locator('#magnifier-key').inputValue(),'Z');await page.locator('#magnifier-key').press('KeyM');await close();await page.keyboard.press('KeyM');assert.equal(await lens.isVisible(),true);
 // Headless Chrome does not transfer OS focus when switching tabs; exercise the lifecycle event explicitly.
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await lens.isVisible(),false);
 await menu();await page.locator('[data-menu-tab="saves"]').click();await page.locator('#save-name').fill('mmmmm');assert.equal(await lens.isVisible(),false);await page.locator('[data-menu-tab="base"]').click();await chooseOption(page,'#magnifier-mode','hold');await close();await page.keyboard.down('KeyM');assert.equal(await lens.isVisible(),true);await page.keyboard.up('KeyM');assert.equal(await lens.isVisible(),false);
 assert.deepEqual(errors,[]);console.log({hold:true,toggle:true,repeatIgnored:true,customKey:true,refresh:true,menuAndEscapeClose:true,blurHandler:true,editingIgnored:true,errors});const video=page.video();await page.close();await video.saveAs(resolve(out,'magnifier-mode.webm'));
}finally{await browser.close();}
