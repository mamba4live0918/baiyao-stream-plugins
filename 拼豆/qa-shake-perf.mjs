// 摇桌性能对比：填满 46 格板后连送重档摇桌，统计之后 12 秒的帧间隔、绘制次数和掉落豆数。
// 用法：node qa-shake-perf.mjs <html 路径> <标签>
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const [file,label='run']=process.argv.slice(2);
// V5.6 起新用户每种互动默认只有一个级别：助力拼豆（每份 8 颗）、摇摇乐（力度 55%）。
const HELP=process.env.HELP||'助力拼豆',HELP_COUNT=+(process.env.HELP_COUNT||180),SHAKE=process.env.SHAKE||'摇摇乐',SHAKE_COUNT=+(process.env.SHAKE_COUNT||6);
const args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
const browser=await chromium.launch({headless:true,args});
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(()=>{window.SonglanPlugin={onGift(cb){window.__sendGift=cb;return()=>{};}};});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
const qa=(fn,a)=>page.evaluate(fn,a);
try{
 await page.goto(pathToFileURL(resolve(file)).href+'?qa=1');
 await page.waitForFunction(()=>window.__pegQa?.snapshot()&&document.querySelector('.layout-edit-box'));
 await qa(a=>window.__sendGift({giftName:a.h,count:a.n,nickName:'测'}),{h:HELP,n:HELP_COUNT});
 await page.waitForFunction(()=>window.__pegQa.snapshot().placed.filter(Boolean).length>=1304,null,{timeout:300000});
 await page.waitForFunction(()=>window.__pegQa.stats().beadMeshes===0,null,{timeout:300000});
 await page.waitForTimeout(1500);
 const base=await qa(()=>window.__pegQa.stats());
 // 开始记录帧间隔。
 await qa(()=>{window.__frames=[];let last=performance.now();const tick=t=>{window.__frames.push(t-last);last=t;if(!window.__stopFrames)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 await qa(()=>{window.__long=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({type:'longtask'});});
 await qa(a=>window.__sendGift({giftName:a.h,count:a.n,nickName:'测'}),{h:SHAKE,n:SHAKE_COUNT});
 const samples=[];
 for(let i=0;i<12;i++){await page.waitForTimeout(1000);const s=await qa(()=>{const st=window.__pegQa.stats();return {drawCalls:st.drawCalls,loose:st.beadMeshes,placed:window.__pegQa.snapshot().placed.filter(Boolean).length};});samples.push(s);}
 const frames=await qa(()=>{const f=window.__frames;window.__frames=[];return f;});
 // 再记录 6 秒：豆子都落定之后（桌上散着一千多颗豆）的帧间隔。
 await page.waitForTimeout(6000);const rest=await qa(()=>{window.__stopFrames=true;return window.__frames;});
 const restAvg=rest.reduce((a,b)=>a+b,0)/Math.max(1,rest.length);
 const sorted=[...frames].sort((a,b)=>a-b),avg=frames.reduce((a,b)=>a+b,0)/frames.length;
 const longTasks=await qa(()=>window.__long.slice().sort((a,b)=>b-a).slice(0,5));
 const result={label,longTasks,baseDrawCalls:base.drawCalls,frames:frames.length,avgFrameMs:+avg.toFixed(1),p95FrameMs:+sorted[Math.floor(sorted.length*.95)].toFixed(1),maxFrameMs:+sorted.at(-1).toFixed(1),restFrames:rest.length,restAvgFrameMs:+restAvg.toFixed(1),restDrawCalls:(await qa(()=>window.__pegQa.stats().drawCalls)),peakDrawCalls:Math.max(...samples.map(s=>s.drawCalls)),looseAfter12s:samples.at(-1).loose,placedAfter:samples.at(-1).placed,samples,errors};
 await mkdir('tmp/perf',{recursive:true});await page.screenshot({path:`tmp/perf/${label}.png`});
 await writeFile(`tmp/perf/${label}.json`,JSON.stringify(result,null,1));console.log(JSON.stringify({...result,samples:undefined}));
}finally{await browser.close();}
