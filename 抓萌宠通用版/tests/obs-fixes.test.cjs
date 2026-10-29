const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function renderer(dpr){const source=read('src/app.js');const a=source.indexOf('function size()'),b=source.indexOf('function ballBurst(',a),c=source.indexOf('function sequenceFrame('),d=source.indexOf('function penRect(',c);
 const ctx={C:require('../src/core.js'),PetRoamGeometry:require('../src/roam-geometry.js'),W:1280,H:720,devicePixelRatio:dpr,prefs:{size:90},state:{avatarKinds:[]},custom:{cowScale:()=>1.15,cowWalk:()=>null,cowFrameMeta:()=>({kind:'image',frames:1,fps:0}),cowSource:()=>'dog.png',cowStaticSource:()=>'dog.png',cowName:()=>'小狗',cowMotion:()=>'plod'},reduced:()=>false};
 vm.runInNewContext(source.slice(a,b)+source.slice(c,d)+';globalThis.api={cowVisual,renderCow};',ctx);return ctx.api;}
const pet=o=>({kind:0,x:300.37,y:411.61,held:false,airborne:false,facing:1,motionTilt:0,hopLift:-2.33,hopScaleX:1,hopScaleY:1,el:{style:{},dataset:{},setAttribute(){}},im:{style:{}},sprite:{style:{}},...o});
const nums=t=>t.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/).slice(1).map(Number);
test('落地萌宠按整像素定位，避免合成层半像素发糊',()=>{const api=renderer(1),p=pet();api.cowVisual(p);api.renderCow(p);for(const n of nums(p.el.style.transform))assert(Number.isInteger(n),p.el.style.transform);});
test('高分屏按设备像素对齐',()=>{const api=renderer(1.25),p=pet();api.cowVisual(p);api.renderCow(p);for(const n of nums(p.el.style.transform))assert(Number.isInteger(Math.round(n*1.25*1e6)/1e6),p.el.style.transform);});
test('抓起放大在内层绘制，外层不缩放',()=>{const api=renderer(1),p=pet({held:true});api.cowVisual(p);api.renderCow(p);assert.doesNotMatch(p.el.style.transform,/scale/);assert.match(p.im.style.transform,/scale\(1\.12,1\.12\)/);assert.match(p.sprite.style.transform,/scale\(1\.12,1\.12\)/);});
test('OBS 下拉兼容脚本在所有页面脚本前注入并可解析',()=>{const js=read('src/obs-select.js');new vm.Script(js);assert.match(js,/__obsSelect/);assert.match(read('开发/V1/build.cjs'),/obs-key-shim\.js'\)\+'<\/script><script>'\+read\('src\/obs-select\.js'\)/);});
test('打开设置不给直播画面加模糊或暗色遮罩',()=>{const html=read('src/index.html');const rule=html.match(/#shade\{[^}]*\}/)[0];assert.doesNotMatch(rule,/blur|#2e201a/);assert.match(rule,/background:transparent/);});
