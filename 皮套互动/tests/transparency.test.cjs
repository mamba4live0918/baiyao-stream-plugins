const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const deps=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(deps,'playwright')),{PNG}=require(path.join(deps,'pngjs'));
let browser;test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});});test.after(async()=>browser?.close());
const html=fs.readFileSync(path.join(__dirname,'../皮套互动-1.html'),'utf8');
test('closed overlay stays transparent inside a light host iframe and preserves dark settings controls',async t=>{
 const page=await browser.newPage({viewport:{width:800,height:600}});t.after(()=>page.close());
 await page.setContent('<style>html,body{margin:0;background:transparent}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style><iframe></iframe>');
 await page.locator('iframe').evaluate((frame,source)=>frame.srcdoc=source,html);
 const frame=page.frameLocator('iframe');await frame.locator('#hide-settings').click();
 assert.equal(await frame.locator('#settings').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
 const png=PNG.sync.read(await page.screenshot({omitBackground:true}));
 for(let i=3;i<png.data.length;i+=4)assert.equal(png.data[i],0,'every idle overlay pixel must have zero alpha');
 await frame.locator('body').dblclick({position:{x:200,y:200}});assert.equal(await frame.locator('#settings').isVisible(),true);
 await frame.locator('#hide-settings').click();const reopened=PNG.sync.read(await page.screenshot({omitBackground:true}));
 for(let i=3;i<reopened.data.length;i+=4)assert.equal(reopened.data[i],0);
});

test('parent SDK gift objects pass validation across an actual iframe boundary',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<iframe></iframe>');
 await page.evaluate(()=>{window.SonglanPlugin={handlers:[],onGift(cb){this.handlers.push(cb)},dispatch(data){this.handlers.forEach(cb=>cb(data))}}});
 await page.locator('iframe').evaluate((frame,source)=>frame.srcdoc=source,html);
 const frame=page.frameLocator('iframe');await frame.locator('#hide-settings').waitFor();
 await frame.locator('body').evaluate(()=>parent.SonglanPlugin.onGift(raw=>window.lastGiftResult=PuppetCore.normalizeGift(raw)));
 await page.evaluate(()=>SonglanPlugin.dispatch({giftName:'小心心',count:1,nickName:'测试用户',giftIcon:''}));
 const result=await frame.locator('body').evaluate(()=>window.lastGiftResult);
 assert.equal(result.ok,true,result.error);assert.deepEqual(result.value,{name:'小心心',count:1});
});
