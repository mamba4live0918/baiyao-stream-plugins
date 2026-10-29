// V5.6 工具模型截图：停放的镊子、手持镊子夹豆、拼豆笔装豆。
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const out=resolve(import.meta.dirname,'tmp/qa-v56');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
const browser=await chromium.launch({headless:true,args});
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(240000);page.on('pageerror',e=>errors.push(e.message));
const qa=(fn,arg)=>page.evaluate(fn,arg);
try{
 await page.goto(pathToFileURL(resolve(import.meta.dirname,'拼豆-1.html')).href+'?qa=1');
 await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 await page.waitForTimeout(1500);await page.screenshot({path:resolve(out,'tools-parked.png')});
 const jar=await qa(()=>window.__pegQa.palettePoint('G698'));await page.mouse.click(jar.x,jar.y);
 const cell=await qa(()=>window.__pegQa.cellPoint(12,20));await page.mouse.move(cell.x,cell.y,{steps:4});await page.waitForTimeout(2500);
 console.log('tweezers',JSON.stringify((await qa(()=>window.__pegQa.stats())).tool));
 await page.screenshot({path:resolve(out,'tools-tweezers-held.png')});
 await page.screenshot({path:resolve(out,'tools-tweezers-zoom.png'),clip:{x:cell.x-160,y:cell.y-200,width:360,height:300}});
 await page.keyboard.press('Escape');
 await qa(()=>window.__sendGift({giftName:'拼豆笔',count:1,nickName:'验收'}));await page.waitForTimeout(2500);
 await page.mouse.click(jar.x,jar.y);await page.mouse.move(cell.x,cell.y,{steps:4});await page.waitForTimeout(2500);
 console.log('pen',JSON.stringify((await qa(()=>window.__pegQa.stats())).tool));
 await page.screenshot({path:resolve(out,'tools-pen.png')});
 await page.screenshot({path:resolve(out,'tools-pen-zoom.png'),clip:{x:cell.x-160,y:cell.y-200,width:360,height:300}});
 console.log('errors',errors);
}finally{await browser.close();}
