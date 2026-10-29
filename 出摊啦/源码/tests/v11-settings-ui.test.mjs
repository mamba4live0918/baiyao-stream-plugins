import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingsUI} from '../src/ui/settings-ui.js';
import '../src/local-overtime.cjs';
// V1.6 插件自带的加班机：用真的那份，存在内存里
const makeLocal=()=>{const memory=new Map();return globalThis.LocalOvertime.createLocalOvertime({storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},now:()=>0});};
import {defaultSettings,sanitizeSettings} from '../src/settings.js';
import {defaultStats} from '../src/stats.js';
import {RentScene} from '../src/rent/scene.js';

// A document boundary for the generated controls; layout is checked by browser QA.
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.style={};this.hidden=false;this.scrollTop=0;this.value='';this._text='';}
 setAttribute(key,value){this.attrs[key]=String(value);if(key==='value')this.value=String(value);}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(node=>typeof node==='string'?node:node.textContent).join('');}
 querySelector(selector){return nodes(this).find(node=>selector.startsWith('#')?node.attrs.id===selector.slice(1):selector.startsWith('[')?node.attrs[selector.slice(1,-1)]!==undefined:node.tagName===selector)??null;}
 querySelectorAll(selector){return nodes(this).filter(node=>node.tagName===selector);}
}
const nodes=root=>[root,...root.children.filter(node=>typeof node!=='string').flatMap(nodes)];
const labelled=(root,label)=>nodes(root).find(node=>node.attrs['aria-label']===label);
const byText=(root,tag,text)=>nodes(root).find(node=>node.tagName===tag&&node.textContent.startsWith(text));
function fixture(settings=defaultSettings()){
 const oldDocument=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 const keys=[];
 const app={settings,stats:{...defaultStats(),coins:30,served:8,badReviews:2,abandoned:3},live:{status:()=>''},overtime:{mode:'bridge',targetValue:'auto',keyValid:false,local:makeLocal(),route(){return this.targetValue!=='auto'?this.targetValue:(this.mode==='baiyao'||this.keyValid)?'baiyao':'local';},target(){return this.targetValue;},setTarget(v){this.targetValue=v;},snapshot(){return {mode:this.mode,state:'locked',key:''};},describe(){return this.mode==='baiyao'?'已接上白曜加班机':'连上白曜了，填上连接码才能加时间';},pendingCount:()=>0,setKey:value=>{keys.push(value);return true;},normalizeKey:value=>String(value).toUpperCase(),connect:()=>true,test:async()=>({ok:true,trusted:false,error:'还没填连接码'})},applySettings(value){this.settings=sanitizeSettings(value);},getConnectionState:()=>({testing:false,pending:0}),notify(){}};
 const ui=Object.assign(Object.create(SettingsUI.prototype),{app,root:new Element('section'),advOpen:false,focusNewGift:null,confirmations:new Set()});
 return{ui,app,keys,restore(){for(const confirmation of ui.confirmations)confirmation.dispose();globalThis.document=oldDocument;}};
}
function change(input,value){input.value=String(value);input.onchange({target:input});}

test('an empty gift table offers explicit example rules without replacing custom rules',()=>{
 const f=fixture();try{
  f.ui.render();const button=byText(f.ui.root,'button','一键填入示例礼物');assert.ok(button);
  button.onclick();
  // V1.2: 小心心 is the default order gift, so the sabotage example moves to 人气票.
  assert.deepEqual(f.app.settings.rules.order,[{name:'小心心',min:1,max:1}]);
  assert.deepEqual(f.app.settings.rules.mess,[{name:'人气票',min:1,max:1}]);
  assert.deepEqual(f.app.settings.rules.help,[{name:'玫瑰',action:'helper',min:1,max:1}]);
  assert.equal(byText(f.ui.root,'button','一键填入示例礼物'),undefined);
 }finally{f.restore();}
});

test('message menu keeps its JSON draft and separates parsing from explicit local play',()=>{
 const f=fixture(),calls=[];
 f.app.live.testMessage=(text,options)=>{calls.push({text,options});return{ok:true,status:'matched',reason:'命中捣乱礼物',event:{kind:'gift',id:'demo-1',uid:'viewer-1',nick:'小明',gift:{name:'小心心',count:2}},matches:[{kind:'fire',count:2}],played:options.play};};
 try{
  f.ui.render();const summary=byText(f.ui.root,'summary','测试礼物消息');assert.ok(summary,'settings should offer the message parser menu');
  const input=labelled(f.ui.root,'模拟收到的消息 JSON');assert.ok(input);assert.equal(calls.length,0);
  const raw='{"type":"gift","giftName":"小心心","count":2}';input.value=raw;input.oninput({target:input});
  byText(f.ui.root,'button','只解析').onclick();assert.equal(calls.length,1);assert.equal(calls[0].text,raw);assert.equal(calls[0].options.play,false);
  assert.match(f.ui.root.textContent,/小明/);assert.match(f.ui.root.textContent,/小心心/);assert.match(f.ui.root.textContent,/放火.*2/);
  f.ui.render();assert.equal(labelled(f.ui.root,'模拟收到的消息 JSON'),input);assert.equal(input.value,raw);
  byText(f.ui.root,'button','解析并试玩').onclick();assert.equal(calls.length,2);assert.equal(calls[1].options.play,true);assert.match(f.ui.root.textContent,/本地试玩已触发/);
 }finally{f.restore();}
});

test('message examples use current configured gift names without changing rules and report invalid input',()=>{
 const f=fixture();
 f.app.settings.rules.order=[];f.app.settings.rules.mess=[{name:'灯牌',min:1,max:2}];
 f.app.live.testMessage=()=>({ok:false,status:'error',reason:'JSON 格式不正确',event:null,matches:[],played:false});
 try{
  f.ui.render();const source=labelled(f.ui.root,'模拟消息来源'),input=labelled(f.ui.root,'模拟收到的消息 JSON');assert.ok(source);
  assert.equal(JSON.parse(input.value).giftName,'灯牌');
  f.app.settings.rules.mess[0].name='棒棒糖';source.value=source.children[1].attrs.value;source.onchange({target:source});
  byText(f.ui.root,'button','填入示例').onclick();assert.equal(JSON.parse(input.value).giftName,'棒棒糖');assert.equal(f.app.settings.rules.mess.length,1);
  input.value='{';input.oninput({target:input});byText(f.ui.root,'button','只解析').onclick();assert.match(f.ui.root.textContent,/解析失败/);assert.match(f.ui.root.textContent,/JSON 格式不正确/);
 }finally{f.restore();}
});

test('shop controls expose separate heat settings for noodle, pancake and tea (not sushi)',()=>{
 const f=fixture();
 try{
  for(const [shop,seconds] of [['noodle',2.5],['pancake',8],['tea',5]]){
   f.app.settings.shop=shop;f.ui.render();
   const first=f.ui.root.children.find(node=>node.tagName==='section');
   assert.equal(labelled(first,'煮多久')?.value,'4');
   assert.equal(labelled(first,'熟了能放多久')?.value,'6');assert.equal(labelled(first,'冒烟多久着火')?.value,'3');
   change(labelled(first,'煮多久'),seconds);assert.equal(f.app.settings.cooking.heat[shop].cookSeconds,seconds);
   const advanced=byText(f.ui.root,'details','高级设置');assert.equal(labelled(advanced,'煮多久'),undefined);assert.equal(labelled(advanced,'冒烟多久着火'),undefined);
  }
  assert.equal(f.app.settings.cooking.heat.noodle.cookSeconds,2.5);assert.equal(f.app.settings.cooking.heat.pancake.cookSeconds,8);assert.equal(f.app.settings.cooking.heat.tea.cookSeconds,5);
  for(const shop of ['sushi']){f.app.settings.shop=shop;assert.equal(labelled(f.ui.shopSection(),'煮多久'),undefined);assert.equal(labelled(f.ui.shopSection(),'熟了能放多久'),undefined);assert.equal(labelled(f.ui.shopSection(),'冒烟多久着火'),undefined);}
 }finally{f.restore();}
});

test('enabling abandonment reveals configurable wait, penalty and amount and turning it off hides them',()=>{
 const f=fixture();
 try{
  f.ui.render();assert.equal(labelled(f.ui.root,'生气后再等'),undefined);
  let toggle=byText(f.ui.root,'label','顾客等急了会走');assert.ok(toggle);toggle.children[0].checked=true;toggle.children[0].onchange({target:toggle.children[0]});
  assert.equal(f.app.settings.order.abandon.enabled,true);assert.equal(labelled(f.ui.root,'生气后再等')?.value,'60');
  change(labelled(f.ui.root,'生气后再等'),22.5);change(labelled(f.ui.root,'跑单惩罚'),'rent');change(labelled(f.ui.root,'跑单金额'),14);
  assert.deepEqual(f.app.settings.order.abandon,{enabled:true,angryWaitSeconds:22.5,penalty:'rent',amount:14});
  toggle=byText(f.ui.root,'label','顾客等急了会走');toggle.children[0].checked=false;toggle.children[0].onchange({target:toggle.children[0]});
  assert.equal(labelled(f.ui.root,'生气后再等'),undefined);assert.equal(labelled(f.ui.root,'跑单惩罚'),undefined);assert.equal(labelled(f.ui.root,'跑单金额'),undefined);
  assert.equal(f.app.settings.order.abandon.amount,14);
 }finally{f.restore();}
});

test('advanced money controls save spoil percentage as a fraction and display abandonment statistics',()=>{
 const f=fixture();
 try{
  f.ui.render();assert.equal(labelled(f.ui.root,'做坏扣钱概率')?.value,'50');assert.equal(labelled(f.ui.root,'做坏罚款')?.value,'10');
  change(labelled(f.ui.root,'做坏扣钱概率'),25);change(labelled(f.ui.root,'做坏罚款'),17);
  assert.equal(f.app.settings.cooking.spoilProbability,.25);assert.equal(f.app.settings.cooking.spoilFine,17);
  change(labelled(f.ui.root,'做坏扣钱概率'),0);assert.equal(f.app.settings.cooking.spoilProbability,0);
  assert.match(f.ui.root.textContent,/跑单 3/);assert.match(byText(f.ui.root,'h2','出摊啦').textContent,/V1\.6/);
 }finally{f.restore();}
});

test('rent sign includes next surcharge and restores ordinary amount after it is paid',()=>{
 const scene=Object.assign(Object.create(RentScene.prototype),{root:new Element('div'),panelNode:new Element('div'),sign:new Element('div'),signText:new Element('div'),resize(){},textUpdates:0});
 scene.signText.append(new Element('span'),new Element('small'));
 const view={started:true,remainingSeconds:120,overtimeSeconds:0,chargeCoins:130,abandonSurcharge:30};
 scene.sync(view,{enabled:true,coins:100},{open:true});assert.equal(scene.signText.children[1].textContent,'要交 130 铜板（跑单 +30）');
 scene.sync({...view,chargeCoins:100,abandonSurcharge:0},{enabled:true,coins:100},{open:true});assert.equal(scene.signText.children[1].textContent,'要交 100 铜板');
});

test('V1.6 第③栏：加班机默认自动——白曜外没填码时用插件自带的（倒计时、预设时长、礼物加减表），也能填连接码改用白曜的；在白曜里不用填',async()=>{
 const f=fixture();
 try{
  f.ui.render();const rent=byText(f.ui.root,'section','③ 交租和加班');assert.ok(rent);
  for(const word of ['咩播','端口','联调','今天播多久'])assert.equal(rent.textContent.includes(word),false,word);
  for(const word of ['加班记到','插件自带的加班机','距离下播','预设时长','手动加减','礼物加减时间','白曜加班机'])assert.ok(rent.textContent.includes(word),word);
  assert.ok(labelled(f.ui.root,'加班记到'));
  byText(rent,'button','＋ 添加礼物').onclick();
  change(labelled(f.ui.root,'第 1 行礼物名'),'玫瑰');change(labelled(f.ui.root,'第 1 行最少分钟'),5);change(labelled(f.ui.root,'第 1 行最多分钟'),5);
  assert.deepEqual(f.app.overtime.local.snapshot().gifts,[{name:'玫瑰',mode:'add',min:5,max:5}],'填好就存');
  const key=labelled(f.ui.root,'白曜加班机连接码');assert.ok(key,'自动：白曜外还能填连接码');key.value='abcd2345';
  await byText(f.ui.root,'button','测试连接').onclick({target:{disabled:false}});assert.deepEqual(f.keys,[],'测试连接只试不存');
  byText(f.ui.root,'button','连接').onclick();assert.deepEqual(f.keys,['abcd2345'],'点「连接」才用上');
  f.app.overtime.setTarget('local');f.ui.render();assert.equal(labelled(f.ui.root,'白曜加班机连接码'),undefined,'固定用自带的：不显示连接码');
  f.app.overtime.setTarget('auto');f.app.overtime.mode='baiyao';f.ui.render();
  assert.equal(labelled(f.ui.root,'白曜加班机连接码'),undefined,'在白曜里不用填连接码');
  const inside=byText(f.ui.root,'section','③ 交租和加班');
  assert.ok(inside.textContent.includes('已接上白曜加班机'));assert.equal(inside.textContent.includes('预设时长'),false,'记到白曜时不显示自带加班机');
 }finally{f.restore();}
});
