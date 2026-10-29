const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/core.js');

test('single physical key validation expands beyond presets without accepting modifier-only keys',()=>{
  assert.equal(typeof M.keyValid,'function');
  for(const code of ['KeyA','KeyZ','Digit0','Digit9','ArrowUp','ArrowLeft','Slash','Quote','Backquote','IntlBackslash','Tab','Escape','Backspace','Delete','Insert','Home','End','PageUp','PageDown','F1','F24','Numpad0','Numpad9','NumpadAdd','NumpadSubtract','NumpadDivide','NumpadMultiply','NumpadDecimal','NumpadEqual','NumpadComma','NumpadEnter'])assert.equal(M.keyValid(code),true,code);
  for(const code of ['','A','Unidentified','Process','ShiftLeft','ShiftRight','ControlLeft','AltRight','MetaLeft','Fn','KeyAA','Digit10','F0','F25','Numpad10',null,13])assert.equal(M.keyValid(code),false,String(code));
  assert.deepEqual(M.keys,{Space:'空格',KeyF:'F',KeyJ:'J',Enter:'回车'});
});

test('physical codes win over shifted text and numpad Enter remains the shared Enter key',()=>{
  assert.equal(typeof M.keyFromEvent,'function');
  assert.equal(M.keyFromEvent({code:'Digit1',key:'!',shiftKey:true,keyCode:49}),'Digit1');
  assert.equal(M.keyFromEvent({code:'KeyQ',key:'a',keyCode:65}),'KeyQ');
  assert.equal(M.keyFromEvent({code:'NumpadEnter',key:'Enter',location:3,keyCode:13}),'Enter');
  assert.equal(M.keyFromEvent({code:'Enter',key:'Enter',keyCode:13}),'Enter');
  assert.equal(M.keyFromEvent({code:'Numpad2',key:'ArrowDown',keyCode:40}),'Numpad2');
});

test('missing host codes recover normal keys and punctuation from key or virtual key code',()=>{
  assert.equal(typeof M.keyFromEvent,'function');
  const cases=[
    [{code:'',key:'z'},'KeyZ'],[{code:'Unidentified',key:'7'},'Digit7'],
    [{key:'?'},'Slash'],[{key:'_'},'Minus'],[{key:'{'},'BracketLeft'],
    [{key:'Tab'},'Tab'],[{key:'Esc'},'Escape'],[{key:'Left'},'ArrowLeft'],
    [{key:'F24'},'F24'],[{keyCode:123},'F12'],[{keyCode:135},'F24'],
    [{keyCode:186},'Semicolon'],[{which:65},'KeyA'],[{key:'Unidentified',keyCode:8},'Backspace']
  ];
  for(const [event,expected] of cases)assert.equal(M.keyFromEvent(event),expected,JSON.stringify(event));
});

test('keypad fallback separates top-row digits and NumLock navigation appearances',()=>{
  assert.equal(typeof M.keyFromEvent,'function');
  const cases=[
    [{code:'',key:'2',keyCode:98},'Numpad2'],[{code:'Unidentified',key:'2',keyCode:50},'Digit2'],
    [{key:'2',location:3,keyCode:50},'Numpad2'],[{key:'ArrowDown',location:3,keyCode:40},'Numpad2'],
    [{key:'End',location:3,keyCode:35},'Numpad1'],[{key:'Insert',location:3,keyCode:45},'Numpad0'],
    [{key:'Delete',location:3,keyCode:46},'NumpadDecimal'],[{key:'Clear',location:3,keyCode:12},'Numpad5'],
    [{key:'+',location:3,keyCode:107},'NumpadAdd'],[{key:'-',keyCode:109},'NumpadSubtract'],
    [{key:'/',keyCode:111},'NumpadDivide'],[{key:'*',keyCode:106},'NumpadMultiply'],
    [{key:',',location:3,keyCode:108},'NumpadComma'],[{key:'=',location:3},'NumpadEqual']
  ];
  for(const [event,expected] of cases)assert.equal(M.keyFromEvent(event),expected,JSON.stringify(event));
});

test('old shim navigation codes cannot disguise numeric keypad keys when location is available',()=>{
  assert.equal(typeof M.keyFromEvent,'function');
  assert.equal(M.keyFromEvent({code:'ArrowDown',key:'ArrowDown',keyCode:40,location:3,__obsKeyFixed:true}),'Numpad2');
  assert.equal(M.keyFromEvent({code:'Digit2',key:'2',keyCode:50,location:3,__obsKeyFixed:true}),'Numpad2');
  assert.equal(M.keyFromEvent({code:'ArrowDown',key:'ArrowDown',keyCode:40,location:0}),'ArrowDown');
});

test('composition and modifier-only events never yield a usable breaking key',()=>{
  assert.equal(typeof M.keyFromEvent,'function');
  for(const event of [{code:'KeyA',key:'a',isComposing:true},{code:'KeyA',keyCode:229},{code:'KeyA',key:'Process'},
    {code:'ShiftLeft',key:'Shift',keyCode:16},{key:'Control',keyCode:17},{keyCode:91},{keyCode:92},{key:'AltGraph',keyCode:225},
    {code:'Unidentified',key:'Unidentified'},{code:'Unidentified'},null])assert.equal(M.keyFromEvent(event),'',JSON.stringify(event));
});

test('unknown host key strings cannot become inherited object properties',()=>{
  for(const key of ['toString','constructor','__proto__','NotARealKey']){
    assert.equal(M.keyFromEvent({code:'Unidentified',key}),'');
    assert.equal(M.keyFromEvent({code:'Unidentified',key,location:3}),'');
  }
});

test('display labels describe arbitrary keys and retain preset names',()=>{
  assert.equal(typeof M.keyLabel,'function');
  assert.equal(M.keyLabel('KeyA'),'A');assert.equal(M.keyLabel('Digit2'),'2');
  assert.match(M.keyLabel('Numpad2'),/小键盘.*2/);assert.match(M.keyLabel('ArrowDown'),/下/);
  assert.equal(M.keyLabel('F24'),'F24');assert.equal(M.keyLabel('Space'),'空格');
  assert.equal(M.keyLabel('NumpadEnter'),'回车');assert.equal(M.keyLabel('Unidentified'),'');
});

test('custom breaking keys survive queue snapshots and storage restoration',()=>{
  M.setDecay({rate:0});const setting={key:'Numpad2',target:2},s=M.create(1,setting,0);assert.ok(s);
  assert.equal(s.key,'Numpad2');assert.equal(M.add(s,1,0,{key:'F24',target:1}),true);
  setting.key='Space';const saved=JSON.parse(JSON.stringify(s)),restored=M.restore(saved,0);assert.ok(restored);
  assert.equal(restored.key,'Numpad2');M.press(restored,0);assert.equal(M.press(restored,0),true);
  assert.equal(restored.key,'F24');assert.equal(M.press(restored,0),true);assert.equal(restored.layers,0);
  const bad=JSON.parse(JSON.stringify(s));bad.queue[0].key='ControlLeft';assert.equal(M.restore(bad,0),null);
  assert.equal(M.config({key:'NumpadEnter'}).key,'Enter');
});
