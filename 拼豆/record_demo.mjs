import {chooseOption} from './qa-select-helper.mjs';
/**
 * 拼豆工坊演示分镜（约 1 分 45 秒）：
 * 00–18s  标题与真实安装步骤字幕卡。此段不展示、也不冒充菘蓝宿主界面。
 * 18–48s  独立 HTML 真浏览器画面：透明背景、52 款预设、板尺寸、图片上传。
 * 48–60s  从色号盒逐颗取豆，并在 3D 柱位逐颗放置。
 * 60–80s  礼物规则与离线测试：摇桌影响已拼豆，打翻影响装豆托盘。
 * 80–92s  连续单击空格，分五段复原托盘和库存豆；已拼豆板不变。
 * 92–115s 五种熨烫、真实 3D 成品拖动、PNG/GLB、成品库 3D 复看。
 *
 * 默认只打印分镜。主应用稳定后运行 `node record_demo.mjs --record`。
 * 录制使用真实 Chrome 页面和 UI 输入；底部中文字幕在后期叠加。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { colorByHex, createPresetPattern } from './src/patterns.js';

const ROOT = resolve(import.meta.dirname);
const TEMP = resolve(ROOT, 'tmp');
const DELIVERY = resolve(ROOT, '交付');
const HTML = resolve(ROOT, '拼豆-1.html');
const OUTPUT = resolve(DELIVERY, '拼豆演示.mp4');
const VIDEO_SIZE = { width: 1280, height: 720 };
const STORYBOARD = [
  '菘蓝整蛊机：自定义插件导入单 HTML（步骤卡，不冒充宿主操作）',
  'OBS：添加菘蓝给出的浏览器源，右键「交互」进行拼豆操作',
  '独立 HTML 真浏览器画面：透明底、52 款预设、尺寸和图片上传',
  '按色号从盒中逐颗取豆，放上 3D 豆盘的小柱位',
  '礼物规则设置与测试：摇桌会摇落已拼豆，打翻只影响装豆托盘',
  '连续单击空格，分五段复原托盘和库存豆，已拼柱板保持原样',
  '选择烫制方式，拖动查看 3D 成品，下载 PNG/GLB，成品库再次 3D 打开',
];

if (!process.argv.includes('--record')) {
  console.log('录制脚本已备好；主应用交互稳定后执行 node record_demo.mjs --record。');
  STORYBOARD.forEach((item, index) => console.log(`${index + 1}. ${item}`));
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) throw new Error(`录制中止：${message}`);
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const secs = Math.floor(centiseconds / 100) % 60;
  const hundredths = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function makeAss(captions) {
  const heading = `[Script Info]\nTitle: 拼豆工坊操作字幕\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Caption,Microsoft YaHei,44,&H00FFFFFF,&H00FFFFFF,&H00251A30,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,175,175,33,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  return heading + captions.map(({ start, end, text }) =>
    `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${text.replace(/\r?\n/g, '\\N')}`,
  ).join('\n') + '\n';
}

async function installCard(page, title, lines) {
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;background:radial-gradient(circle at 22% 15%,#52446b,#221a33 68%);color:#fff;font-family:"Microsoft YaHei",Arial,sans-serif}
    main{height:100%;padding:80px 94px;box-sizing:border-box}small{color:#ffd3e7;font-size:20px;letter-spacing:.1em}h1{font-size:56px;margin:20px 0 38px}p{font-size:30px;line-height:1.6;margin:15px 0}footer{position:absolute;bottom:36px;font-size:17px;color:#d5bfdd}
  </style><main><small>拼豆工坊 · 操作演示</small><h1>${title}</h1>${lines.map(line => `<p>${line}</p>`).join('')}<footer>步骤说明画面｜本段未录制菘蓝宿主界面</footer></main></html>`);
}

async function makeUploadImage(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffd267'; ctx.fillRect(27, 28, 10, 31);
    ctx.fillStyle = '#ff769f';
    for (const [x, y] of [[28, 7], [12, 21], [43, 21], [19, 37], [36, 37]]) ctx.fillRect(x, y, 16, 16);
    ctx.fillStyle = '#ffe7ef'; ctx.fillRect(26, 24, 13, 13);
    return canvas.toDataURL('image/png');
  });
  const path = resolve(TEMP, '演示上传图案.png');
  await writeFile(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  return path;
}


async function record() {
 await mkdir(TEMP,{recursive:true});await mkdir(DELIVERY,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:VIDEO_SIZE,acceptDownloads:true,recordVideo:{dir:TEMP,size:VIDEO_SIZE}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());const start=Date.now(),captions=[];
 const elapsed=()=>(Date.now()-start)/1000,pause=ms=>page.waitForTimeout(ms);
 function caption(text){if(captions.length)captions.at(-1).end=elapsed();captions.push({start:elapsed(),end:null,text});}
 async function menu(tab='base'){await page.mouse.dblclick(30,35);await page.locator('#settings-overlay.open').waitFor();await page.locator(`[data-menu-tab="${tab}"]`).click();}
 async function close(){await page.getByRole('button',{name:'完成设置',exact:true}).click();}
 async function test(id,params={},tier='medium'){
  await menu('effects');await page.locator(`[data-effect="${id}"]`).click();const card=page.locator(`[data-tier="${tier}"]`);
  for(const[key,value]of Object.entries(params)){await card.locator(`[data-param="${key}"]`).fill(String(value));await card.locator(`[data-param="${key}"]`).press('Tab');}
  await pause(1000);await card.getByRole('button',{name:'预览此档'}).click();await close();
 }
 try{
  caption('V5.0 拼豆工坊：透明直播、逐颗拼豆、红黑互动和可检视的 3D 成品。');
  await installCard(page,'把拼豆工坊装进直播间',['解压 V5.0 分享包，取得 HTML、PDF 和本视频。','一个 HTML，内置图案、3D 引擎与材质。']);await pause(4500);
  caption('菘蓝自定义插件导入 HTML，复制 OBS 源；本段是安装步骤说明。');
  await installCard(page,'① 菘蓝 → ② OBS',['菘蓝「自定义插件」→ 导入「拼豆-1.html」。','复制 OBS 源地址，添加到 OBS 浏览器来源。','右键来源 →「交互」，即可操作鼠标和键盘。']);await pause(7000);
  caption('默认透明背景。双击空白打开菜单，点击外部或 Esc 关闭。');
  await page.goto('http://127.0.0.1:8137/?qa=1');await page.waitForFunction(()=>window.__pegQa?.snapshot());await pause(1800);
  await menu();await pause(2000);await page.locator('#transparent-background').uncheck();await close();await pause(1800);
  await menu();await page.locator('#transparent-background').check();await close();await pause(1000);
  caption('52 款新图纸，萌宠、甜品、人物和花饰；每款显示颜色数与用豆量。');
  await menu('library');await page.locator('#menu-choose-pattern').click();await pause(2500);
  await page.locator('#pattern-grid .pattern-card').filter({hasText:'薄荷巧克力冰淇淋'}).first().click();await pause(1500);
  caption('豆板支持 16–48 格；只显示当前用色时，豆盒会紧密重新排列。');
  await menu();await page.locator('#custom-board-size').fill('48');await page.locator('#apply-board-size').click();await pause(1000);
  await chooseOption(page,'#jar-filter','needed');await close();await pause(1800);
  caption('双击部件解锁；拖动位置，拖右下角或滚轮缩放，再双击锁定。');
  for(const part of ['board','tray']){
   const r=await page.evaluate(p=>window.__pegQa.bounds(p),part);await page.mouse.dblclick(r.x+r.width*.25,r.y+r.height*.25);
   const box=page.locator(`.layout-edit-box[data-part="${part}"]`);await box.waitFor({state:'visible'});await pause(600);
   const b=await box.boundingBox();await page.mouse.move(b.x+b.width*.4,b.y+b.height*.4);await page.mouse.down();await page.mouse.move(b.x+b.width*.4+25,b.y+b.height*.4-15,{steps:18});await page.mouse.up();await page.mouse.wheel(0,-80);await pause(900);await box.dblclick();
  }
  caption('豆板、整组豆盒、停放镊子、熨斗、参考图和状态条都可独立调整；刷新仍保留。');await pause(1500);
  const demoPattern=createPresetPattern('gen-desserts-02',48);const candidates=demoPattern.cells.map((color,i)=>color?{color,row:Math.floor(i/demoPattern.size),col:i%demoPattern.size}:null).filter(Boolean).slice(0,3);
  assert(candidates.length===3,'目标格不足');
  caption('半透明提示标注 P/G 色号，与豆盒一致。按住 M，鼠标局部放大。');
  const focal=await page.evaluate(p=>window.__pegQa.cellPoint(p.row,p.col),candidates[0]);await page.mouse.move(focal.x,focal.y);await page.keyboard.down('KeyM');await pause(2700);await page.mouse.move(focal.x+25,focal.y+32,{steps:18});await pause(1700);await page.keyboard.up('KeyM');
  caption('从同色号豆盒取一颗，点对应柱位放一颗；空手点错豆可取走。');
  for(const p of candidates){const source=await page.evaluate(code=>window.__pegQa.palettePoint(code),colorByHex(p.color).code);const dest=await page.evaluate(p=>window.__pegQa.cellPoint(p.row,p.col),p);await page.mouse.click(source.x,source.y);await pause(450);await page.mouse.move(dest.x,dest.y,{steps:15});await page.mouse.click(dest.x,dest.y);await pause(1100);}
  assert((await page.evaluate(()=>window.__pegQa.snapshot())).placed.filter(Boolean).length===3,'手动放豆失败');
  caption('九种互动分别设置，每种都有轻、中、重三档；名称、开关、用量相互独立。');
  await menu('effects');await page.locator('[data-effect="shake"]').click();await pause(2700);await page.locator('[data-effect="pen"]').click();await pause(1800);await close();
  caption('摇桌后的散落豆不会自动消失，点击直接移走；继续拼需从豆盒取新豆。');
  await test('shake',{strength:100,amount:1,duration:2},'heavy');await pause(2200);
  for(let i=0;i<5;i++){const s=await page.evaluate(()=>window.__pegQa.snapshot());if(!s.fallen.length)break;const p=await page.evaluate(id=>window.__pegQa.fallenPoint(id),s.fallen[0].id);await page.mouse.move(p.x,p.y,{steps:12});await page.mouse.click(p.x,p.y);await pause(650);await pause(400);}
  assert(!(await page.evaluate(()=>window.__pegQa.snapshot())).fallen.length,'散落豆未拾完');
  caption('打翻的是库存豆盒托盘。每档可独立设置连按次数和进度回落速度。');
  await test('spill',{presses:4,decay:7},'light');await pause(1700);
  caption('反复按下、松开空格，共五段；每完成一段，库存豆逐步飞回盒子。');
  for(let i=0;i<30&&(await page.evaluate(()=>window.__pegQa.snapshot())).traySpilled;i++){await page.keyboard.press('Space');await pause(160);}
  assert(!(await page.evaluate(()=>window.__pegQa.snapshot())).traySpilled,'托盘未复原');await pause(1000);
  caption('用帮助拼豆预览补齐本次演示，然后选择熨烫方式。');await test('help',{amount:2304});await pause(1000);await page.locator('#iron-button').click();
  caption('五种真实 3D 材质：澡巾、褶皱烘焙纸、毛巾、双面保孔、单面无孔。');
  for(const name of ['澡巾烫','褶皱烘焙纸烫','毛巾烫','双面保孔烫','单面无孔烫']){await page.locator('.iron-option').filter({hasText:name}).click();await pause(1000);}
  await page.locator('.iron-option').filter({hasText:'褶皱烘焙纸烫'}).click();await page.locator('#start-iron').click();
  caption('熨斗动画完成后，可旋转查看立体厚度、纹理和背面。');
  await page.waitForFunction(()=>!document.getElementById('save-button').disabled&&document.querySelector('#iron-overlay.open'));
  const b=await page.locator('#finished-viewer canvas').boundingBox();await page.mouse.move(b.x+b.width*.45,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.74,b.y+b.height*.38,{steps:25});await page.mouse.up();await pause(2500);
  caption('下载透明 PNG、GLB 3D 模型，或保存到当前浏览器作品库。');
  for(const[id,name]of [['download-button','演示成品.png'],['download-glb-button','演示成品.glb']]){const d=page.waitForEvent('download');await page.locator('#'+id).click();await(await d).saveAs(resolve(TEMP,name));}
  await page.locator('#save-button').click();await pause(1200);
  caption('点击「完成，返回工作台」即可正常退出；成品库随时重新 3D 检视。');
  await page.locator('#start-iron').click();await pause(1000);await menu('library');await page.locator('#menu-gallery').click();await pause(1300);await page.getByRole('button',{name:'3D 检视',exact:true}).click();await pause(2000);
  await page.screenshot({path:resolve(TEMP,'演示-作品库3D复看.png')});
  await page.locator('[data-close="viewer-overlay"]').click();await page.locator('[data-close="gallery-overlay"]').click();
  caption('新增五档颜色精细度：48、96、144、256 色，以及不合并采样色的原色保留。');
  await menu('modes');await chooseOption(page,'#color-tier','256');await pause(2100);await page.locator('[data-menu-tab="base"]').click();await chooseOption(page,'#jar-filter','all');await close();await page.locator('#palette-next').click();await pause(1200);
  caption('自由模式从空板开始，开放全色库，也能自选任意颜色加入豆盒。');
  await menu('modes');await chooseOption(page,'#play-mode','free');await page.locator('#free-name').fill('我的自由作品');await page.locator('#free-name').press('Tab');await page.locator('#free-color').fill('#317b95');await page.locator('#free-color-add').click();await pause(1500);await close();
  for(const col of [11,12]){const source=await page.evaluate(()=>window.__pegQa.palettePoint('#317B95')),dest=await page.evaluate(c=>window.__pegQa.cellPoint(12,c),col);await page.mouse.click(source.x,source.y);await pause(300);await page.mouse.move(dest.x,dest.y,{steps:12});await page.mouse.click(dest.x,dest.y);await pause(600);}
  caption('自由作品按自己实际放下的豆生成 3D 成品；没有标准答案，不自动帮拼。');await pause(1600);
  caption('关卡列表可以逐关选图或上传、改名、排序，并选择每关的板格和颜色精度。');
  await menu('modes');await chooseOption(page,'#play-mode','pattern');await page.locator('#level-size').fill('48');await page.locator('#level-add-preset').click();await pause(1500);await page.locator('#pattern-grid .pattern-card').filter({hasText:'薄荷巧克力冰淇淋'}).first().click();await page.locator('[data-menu-tab="modes"]').click();await pause(2000);await page.locator('.level-row').last().getByRole('button',{name:'↑',exact:true}).click();await pause(1000);
  caption('进入关卡模式按顺序挑战。每关熨烫结束后，返回工作台再点下一关。');await chooseOption(page,'#play-mode','campaign');await close();await test('help',{amount:2304});await page.locator('#iron-button').click();await page.locator('.iron-option').filter({hasText:'澡巾烫'}).click();await page.locator('#start-iron').click();await page.waitForFunction(()=>!document.getElementById('save-button').disabled&&document.querySelector('#iron-overlay.open'));await pause(1600);await page.locator('#start-iron').click();await page.locator('#next-level').click();await pause(2200);
  caption('一次拼不完，可以给未完成的作品命名保存；自动保存也会显示最近成功时间。');
  await test('help',{amount:5});await menu('saves');await page.locator('#save-name').fill('下次继续这件作品');await page.locator('#save-progress').click();await page.locator('.progress-save-row').filter({hasText:'下次继续这件作品'}).waitFor();await pause(2200);
  caption('导出本地 JSON 备份，换设备也能导入；导入先预览，不会立即覆盖画板。');
  const saveDownload=page.waitForEvent('download');await page.locator('#export-progress').click();const savePath=resolve(TEMP,'演示进度.拼豆存档.json');await(await saveDownload).saveAs(savePath);await page.locator('#save-file').setInputFiles(savePath);await page.locator('#save-import-preview').waitFor({state:'visible'});await pause(2200);await page.locator('#cancel-save-import').click();await close();
  await test('help',{amount:3});await menu('saves');caption('继续拼豆前，当前画板会先保存为恢复备份；掉落豆、托盘和遍数也一并恢复。');
  await page.locator('.progress-save-row').filter({hasText:'下次继续这件作品'}).getByRole('button',{name:'继续拼豆'}).click();await pause(1600);await menu('saves');await page.locator('[data-save-id="recovery"]').waitFor();await pause(2200);
  caption('安装与操作演示结束。真实直播前，请先在菘蓝测试礼物名称与连接。');await pause(3200);
  captions.at(-1).end=elapsed();assert(!errors.length,errors.join('；'));const duration=elapsed(),video=page.video();await page.close();const raw=resolve(TEMP,'拼豆演示-浏览器原片.webm');await video.saveAs(raw);await context.close();await browser.close();
  await writeFile(resolve(TEMP,'demo.ass'),makeAss(captions),'utf8');
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-vf','scale=1600:900:flags=lanczos,pad=1920:1080:160:0:color=0x211a2d,ass=demo.ass','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',OUTPUT],{cwd:TEMP,encoding:'utf8',maxBuffer:8*1024*1024});
  assert(result.status===0,result.stderr);console.log(`V5.0 演示生成：${duration.toFixed(1)} 秒，${captions.length} 条字幕，脚本错误 ${errors.length}`);
 }catch(error){await browser.close().catch(()=>{});throw error;}
}
await record();
