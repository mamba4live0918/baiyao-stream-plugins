import test from 'node:test';
import assert from 'node:assert/strict';
import {dragBoard,boardRect} from '../src/ui/movable.js';
import {sanitizeExtras} from '../src/extras.js';
import {wantedRect} from '../src/events/scene.js';

const viewport={width:1920,height:1080};

test('拖牌子：位置按画面比例算，拖出画面会被拉回来',()=>{
 const rect={x:100,y:100,width:200,height:50};
 assert.deepEqual(dragBoard({mode:'move',rect,scale:1,dx:860,dy:440,viewport}),{x:960/1920,y:540/1080,scale:1});
 const out=dragBoard({mode:'move',rect,scale:1.5,dx:5000,dy:-5000,viewport});
 assert.equal(out.x,(1920-200)/1920);assert.equal(out.y,0);assert.equal(out.scale,1.5);
});

test('拖右下角改大小：左上角不动，倍数限制在 0.4～3',()=>{
 const rect={x:100,y:100,width:200,height:50};
 const big=dragBoard({mode:'resize',rect,scale:1,dx:200,dy:0,viewport});
 assert.equal(big.scale,2);assert.equal(big.x,100/1920);assert.equal(big.y,100/1080);
 assert.equal(dragBoard({mode:'resize',rect,scale:1,dx:0,dy:25,viewport}).scale,1.5,'往下拖也按比例放大');
 assert.equal(dragBoard({mode:'resize',rect,scale:1,dx:9999,dy:0,viewport}).scale,3);
 assert.equal(dragBoard({mode:'resize',rect,scale:1,dx:-9999,dy:0,viewport}).scale,.4);
});

test('存的位置换成像素：没存就用默认（x、y 为 null），出了画面拉回来',()=>{
 assert.deepEqual(boardRect(null,{width:100,height:40},viewport),{x:null,y:null,width:100,height:40,scale:1});
 assert.deepEqual(boardRect({x:.5,y:.5,scale:2},{width:100,height:40},viewport),{x:960,y:540,width:200,height:80,scale:2});
 const edge=boardRect({x:1,y:1,scale:1},{width:100,height:40},viewport);assert.equal(edge.x,1820);assert.equal(edge.y,1040);
});

test('牌子位置单独存：只认计时牌以外的三块牌子，坏值回默认',()=>{
 const x=sanitizeExtras({boards:{count:{x:.2,y:.3,scale:1.2},outside:{x:2,y:-1,scale:99},wanted:{x:'a'},hack:{x:.1,y:.1}}});
 assert.deepEqual(x.boards,{count:{x:.2,y:.3,scale:1.2},outside:{x:1,y:0,scale:3},wanted:{x:null,y:null,scale:1}});
 assert.deepEqual(sanitizeExtras({}).boards,{});
});

test('通缉令：默认在柜台左上方；拖过就用存的位置和大小',()=>{
 const c={x:10,y:805,width:1900,height:270},u=1;
 assert.deepEqual(wantedRect(1920,1080,c,u,undefined),{x:20,y:80,width:150,height:200});
 assert.deepEqual(wantedRect(1920,1080,c,u,{x:.5,y:.25,scale:1.5}),{x:960,y:270,width:225,height:300});
});
