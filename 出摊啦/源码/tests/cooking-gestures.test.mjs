import test from 'node:test';
import assert from 'node:assert/strict';
import {createGesture,moveGesture,gestureResult} from '../src/cooking/gestures.js';
function trace(kind,points,unit=1){let g=createGesture(kind,points[0],{unit,center:{x:0,y:0}});for(const p of points.slice(1))g=moveGesture(g,p);return gestureResult(g);}
test('粗L形和未闭合粗弧都算摊开，不要求精确整圆',()=>{
 assert.equal(trace('spread',[{x:0,y:0},{x:60,y:0},{x:60,y:60}]).accepted,true);
 assert.equal(trace('spread',[{x:-60,y:0},{x:-40,y:-40},{x:0,y:-60},{x:40,y:-40}]).accepted,true);
});
test('点击、直线和同一直线折返不算画圈',()=>{
 assert.equal(trace('spread',[{x:0,y:0}]).accepted,false);
 assert.equal(trace('spread',[{x:0,y:0},{x:200,y:200}]).accepted,false);
 assert.equal(trace('spread',[{x:0,y:0},{x:90,y:90},{x:0,y:0}]).accepted,false);
});
test('宽松摊饼阈值随短边unit缩放',()=>{
 const result=trace('spread',[{x:0,y:0},{x:30,y:0},{x:30,y:30}],.5);assert.equal(result.accepted,true);assert.equal(result.progress,1);
});
test('左右一次反向、带上下偏移的摇茶也算',()=>{
 assert.equal(trace('shake',[{x:0,y:0},{x:-60,y:80},{x:60,y:-60}]).accepted,true);
 assert.equal(trace('shake',[{x:0,y:0},{x:30,y:5},{x:-30,y:10}],.5).accepted,true);
});
test('仅单向横移、纯竖移和小范围抖动不算摇茶',()=>{
 assert.equal(trace('shake',[{x:0,y:0},{x:200,y:0}]).accepted,false);assert.equal(trace('shake',[{x:0,y:0},{x:0,y:200},{x:0,y:0}]).accepted,false);
 const points=[{x:0,y:0}];for(let i=0;i<100;i++)points.push({x:i%2?2:-2,y:0});assert.equal(trace('shake',points).accepted,false);
});
test('动作状态不可变，无效坐标不推进',()=>{
 const g=Object.freeze(createGesture('spread',{x:0,y:0}));const next=moveGesture(g,{x:50,y:0});assert.notEqual(next,g);assert.equal(g.distance,0);assert.equal(moveGesture(next,{x:NaN,y:0}),next);assert.throws(()=>createGesture('other',{x:0,y:0}),RangeError);
});
