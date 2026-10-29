// V5.2 验收：默认拼豆笔、升级笔划动放豆、礼物逐条播报、计时累加、连续摇桌、页面内确认框。
// 用法：先 npm run build，再在 127.0.0.1:8137 提供 拼豆-1.html（作为 index.html），然后 node qa-v52.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {PRESETS,createPresetPattern,colorByHex} from './src/patterns.js';
import {chooseOption} from './qa-select-helper.mjs';

const out=resolve(import.meta.dirname,'tmp/qa-v52');await mkdir(out,{recursive:true});
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
let browser;try{browser=await chromium.launch({channel:'chrome',headless:true,args});}catch{browser=await chromium.launch({headless:true,args});}
const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.route('**/*',route=>/^http:\/\/(127\.0\.0\.1|localhost):8137\//.test(route.request().url())?route.continue():route.abort());
await context.routeWebSocket('**/*',ws=>ws.close());
// 模拟菘蓝宿主：拿到插件注册的礼物回调。
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[],dialogs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
const snapshot=()=>page.evaluate(()=>window.__pegQa.snapshot());
const gift=(name,count=1,nick='测试观众')=>page.evaluate(g=>window.__sendGift({giftName:g.name,count:g.count,nickName:g.nick}),{name,count,nick});
const feedTexts=()=>page.locator('#gift-feed .gift-feed-item').allInnerTexts();
async function menu(tab='base'){await page.mouse.dblclick(25,30);await page.locator('#settings-overlay.open').waitFor();await page.locator(`[data-menu-tab="${tab}"]`).click();}
async function closeMenu(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
const point=(row,col)=>page.evaluate(p=>window.__pegQa.cellPoint(p.row,p.col),{row,col});
async function pick(hex){const p=await page.evaluate(code=>window.__pegQa.palettePoint(code),colorByHex(hex).code);assert.ok(p,'颜色应在豆盒第一页');await page.mouse.click(p.x,p.y);await page.waitForTimeout(350);}
async function drag(cells){const first=await point(...cells[0]);await page.mouse.move(first.x,first.y);await page.mouse.down();for(const c of cells.slice(1)){const p=await point(...c);await page.mouse.move(p.x,p.y,{steps:4});}await page.mouse.up();await page.waitForTimeout(500);}
const result={};
try{
 await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 const pattern=createPresetPattern(PRESETS[0].id,30),size=pattern.size,cell=(r,c)=>pattern.cells[r*size+c];
 assert.equal((await snapshot()).size,size);
 const probe=pattern.cells.findIndex(Boolean),pp=await point(Math.floor(probe/size),probe%size);
 assert.equal((await page.evaluate(p=>window.__pegQa.hit(p.x,p.y),pp)).target,pattern.cells[probe]);

 // 选出同一颜色的三段：连续 4 格；本色后接异色；本色后接空白。
 let plan=null;
 const scan=hex=>{const runs=[],wrongs=[],edges=[];for(let r=0;r<size;r++)for(let c=0;c+3<size;c++){const a=cell(r,c),b=cell(r,c+1),d=cell(r,c+2);
  if(a===hex&&b===hex&&d===hex&&cell(r,c+3)===hex)runs.push([r,c]);if(a===hex&&b&&b!==hex&&d)wrongs.push([r,c]);if(a===hex&&b===null&&c+2<size)edges.push([r,c]);}return{runs,wrongs,edges};};
 const span=([r,c],n)=>Array.from({length:n},(_,k)=>r*size+c+k);
 const colors=[...new Set(pattern.cells.filter(Boolean))];
 for(const hex of colors){const {runs,wrongs}=scan(hex);
  for(const run of runs){for(const wrong of wrongs){const all=[...span(run,4),...span(wrong,3)];if(new Set(all).size!==all.length)continue;
   for(const edgeHex of colors){if(edgeHex===hex)continue;const edge=scan(edgeHex).edges.find(e=>!span(e,3).some(i=>all.includes(i)));if(edge){plan={hex,run,wrong,edgeHex,edge,used:new Set([...all,...span(edge,3)])};break;}}
   if(plan)break;}if(plan)break;}
  if(plan)break;
 }
 assert.ok(plan,'图案中应能找到测试所需的三段');

 // 1. 设置里把默认工具改成拼豆笔，每次 4 颗。
 await menu();await chooseOption(page,'#default-tool','pen');await page.locator('#pen-capacity').fill('4');await page.locator('#pen-capacity').press('Tab');await closeMenu();
 const other=pattern.cells.findIndex((h,i)=>h&&h!==plan.hex&&h!==plan.edgeHex&&!plan.used.has(i));
 await pick(pattern.cells[other]);
 assert.match(await page.locator('#held-name').innerText(),/×4/);assert.equal(await page.locator('#tool-name').innerText(),'拼豆笔就绪');
 const op=await point(Math.floor(other/size),other%size);await page.mouse.click(op.x,op.y);await page.waitForFunction(i=>!!window.__pegQa.snapshot().placed[i],other);
 assert.match(await page.locator('#held-name').innerText(),/×3/);
 result.defaultPen={capacity:4,afterOnePlaced:'×3'};
 await page.keyboard.press('Escape');

 // 2. 四个观众同时送礼：逐条执行、逐条播报，不互相覆盖。
 const t0=Date.now();
 await page.evaluate(()=>{const s=window.__sendGift;s({giftName:'遮图纸',count:1,nickName:'小A'});s({giftName:'没收镊子',count:1,nickName:'小B'});s({giftName:'助力拼豆',count:1,nickName:'小C'});s({giftName:'拼豆笔',count:1,nickName:'小D'});});
 await page.waitForTimeout(250);const early=await feedTexts();
 assert.equal(early.length,1,'礼物应逐条结算，第一条先出现');assert.match(early[0],/小A/);
 await page.waitForFunction(()=>document.querySelectorAll('#gift-feed .gift-feed-item').length===4,null,{timeout:6000});
 const feed=await feedTexts();assert.deepEqual(feed.map(t=>t.slice(0,2)),['小A','小B','小C','小D']);assert.match(feed[1],/没收了拼豆笔/);assert.match(feed[3],/升级拼豆笔/);
 await page.screenshot({path:resolve(out,'gift-feed.png')});
 result.giftFeed={items:feed,orderedWithin_ms:Date.now()-t0};

 // 3. 分开送的遮图纸时间累加。
 const before=await snapshot(),remaining=()=>snapshot().then(s=>(s.hintHiddenUntil-Date.now())/1000);
 const r1=await remaining();await gift('遮图纸',1,'小E');await page.waitForTimeout(1300);const r2=await remaining();
 assert.ok(r2-r1>27&&r2-r1<31,`第二次遮图纸应再加约 30 秒，实际 ${r1.toFixed(1)} → ${r2.toFixed(1)}`);
 result.hideStacking={before:Math.round(r1),after:Math.round(r2)};

 // 4. 默认拼豆笔被没收，但观众送的升级笔仍可用：容量 10，可划动连放。
 // 软件渲染较慢：先补送一份重档没收与升级笔，保证后续步骤都在生效期内（也顺带验证累加）。
 await gift('没收镊子（重）',3,'小F');await page.waitForTimeout(1000);await gift('拼豆笔（重）',3,'小G');await page.waitForTimeout(1000);
 const now=await snapshot();assert.ok(now.tweezersLockedUntil-Date.now()>150000);assert.ok(now.penUntil-Date.now()>150000);assert.equal(now.penCapacity,15,'重档容量更大，升级');
 await pick(plan.hex);assert.match(await page.locator('#held-name').innerText(),/×15/);
 const [rr,rc]=plan.run;await drag([[rr,rc],[rr,rc+1],[rr,rc+2],[rr,rc+3]]);
 let s=await snapshot();for(let k=0;k<4;k++)assert.equal(s.placed[rr*size+rc+k]?.color,plan.hex,`划动应放下第 ${k+1} 颗`);
 assert.match(await page.locator('#held-name').innerText(),/×11/);
 const [wr,wc]=plan.wrong;await drag([[wr,wc],[wr,wc+1],[wr,wc+2]]);s=await snapshot();
 assert.equal(s.placed[wr*size+wc]?.color,plan.hex);assert.equal(s.placed[wr*size+wc+1]?.color,plan.hex,'异色格照样放下并圈红');assert.equal(s.placed[wr*size+wc+2],null,'放错后应停笔');
 assert.match(await page.locator('#notice').innerText(),/已停笔/);
 await pick(plan.edgeHex);const [er,ec]=plan.edge;await drag([[er,ec],[er,ec+1],[er,Math.min(size-1,ec+2)]]);s=await snapshot();
 assert.equal(s.placed[er*size+ec]?.color,plan.edgeHex);assert.equal(s.placed[er*size+ec+1],null,'划出图案区域应停笔');assert.equal(s.placed[er*size+ec+2],null);
 await page.screenshot({path:resolve(out,'stroke.png')});
 result.stroke={capacity:15,run:4,stopsOnWrong:true,stopsOutsidePattern:true};

 // 5. 页面内确认框：取消不改动，确认后才清空并换板格。
 await page.keyboard.press('Escape');
 const placedBefore=(await snapshot()).placed.filter(Boolean).length;
 await menu();await page.locator('#custom-board-size').fill('48');await page.locator('#apply-board-size').click();
 await page.locator('#confirm-layer:not([hidden])').waitFor();await page.screenshot({path:resolve(out,'confirm.png')});
 await page.locator('#confirm-cancel').click();await page.waitForTimeout(300);
 assert.equal((await snapshot()).size,size);assert.equal((await snapshot()).placed.filter(Boolean).length,placedBefore);
 await page.locator('#apply-board-size').click();await page.locator('#confirm-ok').click();await page.waitForFunction(()=>window.__pegQa.snapshot().size===48);
 assert.equal((await snapshot()).placed.filter(Boolean).length,0);await closeMenu();
 result.confirm={cancelKeeps:placedBefore,okResizes:48,nativeDialogs:dialogs.length};

 // 6. 刷新后默认工具设置保留。
 await page.reload();await page.waitForFunction(()=>window.__pegQa?.snapshot());
 const saved=await page.evaluate(()=>window.__pegQa.mode().settings);assert.equal(saved.defaultTool,'pen');assert.equal(saved.penCapacity,4);
 result.reload={defaultTool:saved.defaultTool,penCapacity:saved.penCapacity};

 // 7. 摇桌：同力度再摇仍能摇松新豆，礼物数量 3 会连摇 3 次。
 await gift('助力拼豆（重）',40,'帮手');await page.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=900,null,{timeout:10000});
 await page.waitForTimeout(2500);
 const fallen=()=>snapshot().then(v=>v.fallen.length);
 await gift('摇摇乐',1,'摇1');await page.waitForTimeout(3500);const f1=await fallen();
 await gift('摇摇乐',1,'摇2');await page.waitForTimeout(3500);const f2=await fallen();
 await gift('摇摇乐',3,'摇3');await page.waitForTimeout(4500);const f3=await fallen();
 assert.ok(f1>0,'第一次中档摇桌应摇落豆');assert.ok(f2>f1,`第二次同力度摇桌应继续摇落：${f1} → ${f2}`);assert.ok(f3>f2,`数量 3 的摇桌应继续摇落：${f2} → ${f3}`);
 await page.screenshot({path:resolve(out,'shake.png')});
 result.shake={afterFirst:f1,afterSecond:f2,afterTriple:f3};

 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);
 result.pageErrors=0;result.nativeDialogs=0;
 await writeFile(resolve(out,'summary.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('errors',errors,'dialogs',dialogs);throw e;}
finally{await browser.close();}
