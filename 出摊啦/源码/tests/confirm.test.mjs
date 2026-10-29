import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoubleConfirmation} from '../src/ui/confirm.js';
function fixture(){let now=0,hits=0;const timers=new Map(),states=[];let next=0;
 const confirmation=createDoubleConfirmation({now:()=>now,onConfirm:()=>hits++,onChange:value=>states.push(value),setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 return{confirmation,timers,states,get hits(){return hits;},time:t=>now=t,expire(){now=3000;const timer=[...timers.values()][0];timer.fn();}};
}
test('first click only arms and a second click within three seconds confirms once',()=>{
 const f=fixture();assert.equal(f.confirmation.click(),false);assert.equal(f.hits,0);assert.equal(f.confirmation.snapshot().armed,true);assert.deepEqual(f.states,[true]);
 f.time(2999);assert.equal(f.confirmation.click(),true);assert.equal(f.hits,1);assert.equal(f.confirmation.snapshot().armed,false);assert.equal(f.timers.size,0);
 f.confirmation.click();assert.equal(f.hits,1,'a later first click is not a second confirmation');
});
test('three-second timeout resets the label and stale clicks only re-arm',()=>{
 const f=fixture();f.confirmation.click();f.expire();assert.equal(f.confirmation.snapshot().armed,false);assert.equal(f.hits,0);assert.deepEqual(f.states,[true,false]);
 f.confirmation.click();assert.equal(f.hits,0);assert.equal(f.confirmation.snapshot().armed,true);
});
test('even if the timer is delayed, a click at the deadline does not execute',()=>{
 const f=fixture();f.confirmation.click();f.time(3000);assert.equal(f.confirmation.click(),false);assert.equal(f.hits,0);assert.equal(f.timers.size,1);
});
test('separate reset buttons never confirm one another and closing cancels the pending action',()=>{
 const a=fixture(),b=fixture();a.confirmation.click();b.confirmation.click();assert.equal(a.hits,0);assert.equal(b.hits,0);
 a.confirmation.reset();assert.equal(a.timers.size,0);assert.equal(a.confirmation.snapshot().armed,false);a.confirmation.click();assert.equal(a.hits,0);
 b.time(1000);b.confirmation.click();assert.equal(b.hits,1);assert.equal(a.hits,0);
});
