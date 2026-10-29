import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLayout} from '../src/layout-controller.js';
test('old four-part layouts keep their values and gain locked tool positions',()=>{
 const previous={board:{x:8,z:-3,scale:.7,locked:false},card:{x:.1,y:.2,scale:1.2}};
 const state=normalizeLayout(previous);assert.equal(state.board.x,8);assert.equal(state.card.y,.2);for(const p of ['tweezers','iron'])assert.deepEqual(state[p],{x:0,y:0,z:0,scale:1,locked:true});
});
test('tool offsets use world units and keep position size and lock state',()=>{
 const s=normalizeLayout({tweezers:{x:12,z:4,scale:1.7,locked:false},iron:{x:-10,z:-6,scale:.6,locked:true}});
 assert.equal(s.tweezers.x,12);assert.equal(s.iron.x,-10);assert.equal(s.tweezers.locked,false);assert.equal(s.iron.scale,.6);
});
test('the gift feed is a movable part that older layouts gain unlocked-free and centred',()=>{
 const s=normalizeLayout({card:{x:.1,y:.2,scale:1.2}});assert.deepEqual(s.feed,{x:0,y:0,z:0,scale:1,locked:true});
 assert.equal(normalizeLayout({feed:{x:.3,y:-.1,scale:1.4,locked:false}}).feed.x,.3);
});
