const test=require('node:test'),assert=require('node:assert/strict');
const {pick}=require('../src/button-choices.js');
function field(value='classic'){
 const s=new EventTarget();s.value=value;s.disabled=false;s.options=[{value:'classic'},{value:'wind'},{value:'giant',disabled:true}];s.ownerDocument={defaultView:{Event}};return s;
}
test('button selection sets the value before bubbling input and change events',()=>{
 const s=field(),seen=[];for(const name of ['input','change'])s.addEventListener(name,e=>seen.push([e.type,s.value,e.bubbles]));
 assert.equal(pick(s,'wind'),true);assert.deepEqual(seen,[['input','wind',true],['change','wind',true]]);
});
test('selected, disabled and unknown choices never trigger a reset or form edit',()=>{
 const s=field();let calls=0;s.addEventListener('change',()=>calls++);
 assert.equal(pick(s,'classic'),false);assert.equal(pick(s,'missing'),false);assert.equal(pick(s,'giant'),false);s.disabled=true;assert.equal(pick(s,'wind'),false);assert.equal(calls,0);
});
test('failed draft validation may restore the original selection synchronously',()=>{
 const s=field();s.addEventListener('change',()=>{s.value='classic';});pick(s,'wind');assert.equal(s.value,'classic');
});
test('rule handlers may rebuild their fields without duplicate change events',()=>{
 const s=field();let calls=0;s.addEventListener('change',()=>{calls++;s.options=[];});assert.equal(pick(s,'wind'),true);assert.equal(calls,1);
});
