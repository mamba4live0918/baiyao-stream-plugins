import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingsUI} from '../src/ui/settings-ui.js';
import '../src/local-overtime.cjs';
// V1.6 插件自带的加班机：用真的那份，存在内存里
const makeLocal=()=>{const memory=new Map();return globalThis.LocalOvertime.createLocalOvertime({storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},now:()=>0});};
import {defaultSettings,sanitizeSettings} from '../src/settings.js';
import {defaultStats} from '../src/stats.js';

// Same minimal document as v11-settings-ui.test.mjs; layout is checked by browser QA.
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
 const sims=[],notices=[];
 const keys=[];
 const app={settings,stats:defaultStats(),live:{status:()=>'',simGift:(...args)=>{sims.push(args);return true;}},overtime:{mode:'bridge',targetValue:'auto',keyValid:false,local:makeLocal(),route(){return this.targetValue!=='auto'?this.targetValue:(this.mode==='baiyao'||this.keyValid)?'baiyao':'local';},target(){return this.targetValue;},setTarget(v){this.targetValue=v;},snapshot(){return {mode:this.mode,state:'locked',key:''};},describe(){return this.mode==='baiyao'?'已接上白曜加班机':'连上白曜了，填上连接码才能加时间';},pendingCount:()=>0,setKey:value=>{keys.push(value);return true;},normalizeKey:value=>String(value).toUpperCase(),connect:()=>true,test:async()=>({ok:true,trusted:false,error:'还没填连接码'})},applySettings(value){this.settings=sanitizeSettings(value);},getConnectionState:()=>({testing:false,pending:0}),notify(text){notices.push(text);}};
 const ui=Object.assign(Object.create(SettingsUI.prototype),{app,root:new Element('section'),advOpen:false,focusNewGift:null,confirmations:new Set()});
 return{ui,app,sims,notices,restore(){for(const confirmation of ui.confirmations)confirmation.dispose();globalThis.document=oldDocument;}};
}
function change(input,value){input.value=String(value);input.onchange({target:input});}
const orderSection=root=>byText(root,'section','② 点单');

test('section ② lists the order gifts and ▶ simulates one gift',()=>{
 const f=fixture();try{
  f.ui.render();const section=orderSection(f.ui.root);assert.ok(section,'② 点单 should exist');
  const name=nodes(section).find(node=>node.attrs['data-gift-name']!==undefined);
  assert.equal(name?.value,'小心心');
  labelled(section,'试一下 小心心').onclick();
  assert.deepEqual(f.sims,[['小心心',1,'试玩观众']]);
 }finally{f.restore();}
});

test('order gift ranges are edited per row',()=>{
 const f=fixture();try{
  f.ui.render();change(labelled(orderSection(f.ui.root),'小心心 最多'),3);
  assert.deepEqual(f.app.settings.rules.order,[{name:'小心心',min:1,max:3}]);
 }finally{f.restore();}
});

test('adding an order gift picks a name that no table uses yet',()=>{
 const settings=defaultSettings();settings.rules.mess=[{name:'新礼物 1',min:1,max:1}];
 const f=fixture(settings);try{
  f.ui.render();byText(orderSection(f.ui.root),'button','＋ 添加一个点单礼物').onclick();
  assert.deepEqual(f.app.settings.rules.order,[{name:'小心心',min:1,max:1},{name:'新礼物 2',min:1,max:1}]);
 }finally{f.restore();}
});

test('an order gift cannot take a name used for sabotage',()=>{
 const settings=defaultSettings();settings.rules.mess=[{name:'人气票',min:1,max:1}];
 const f=fixture(settings);try{
  f.ui.render();const name=nodes(orderSection(f.ui.root)).find(node=>node.attrs['data-gift-name']!==undefined);
  change(name,'人气票');
  assert.deepEqual(f.app.settings.rules.order,[{name:'小心心',min:1,max:1}]);
  assert.deepEqual(f.notices,['这个礼物已经在表里了']);
 }finally{f.restore();}
});

test('deleting the last order gift explains that gifts will not bring customers',()=>{
 const f=fixture();try{
  f.ui.render();labelled(orderSection(f.ui.root),'删除 小心心').onclick();
  assert.deepEqual(f.app.settings.rules.order,[]);
  assert.match(orderSection(f.ui.root).textContent,/还没有点单礼物/);
 }finally{f.restore();}
});

test('the example button fills the empty sabotage and helper tables around the default order gift',()=>{
 const f=fixture();try{
  f.ui.render();byText(f.ui.root,'button','一键填入示例礼物').onclick();
  assert.deepEqual(f.app.settings.rules.order,[{name:'小心心',min:1,max:1}]);
  assert.deepEqual(f.app.settings.rules.mess,[{name:'人气票',min:1,max:1}]);
  assert.deepEqual(f.app.settings.rules.help,[{name:'玫瑰',action:'helper',min:1,max:1}]);
 }finally{f.restore();}
});

test('the message menu example uses the first order gift',()=>{
 const settings=defaultSettings();settings.rules.order=[{name:'嘉年华',min:1,max:1}];settings.rules.mess=[{name:'灯牌',min:1,max:1}];
 const f=fixture(settings);f.app.live.testMessage=()=>({ok:true,status:'matched',reason:'',event:null,matches:[],played:false});
 try{
  f.ui.render();assert.equal(JSON.parse(labelled(f.ui.root,'模拟收到的消息 JSON').value).giftName,'嘉年华');
 }finally{f.restore();}
});
