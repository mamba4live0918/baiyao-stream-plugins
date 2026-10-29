const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('牛棚显示在边缘时使用实际中心，拖动不会突然跳位',()=>{const g=C.penGeometry({penX:0,penY:0,penWidth:330},1280,720);near(g.x,165);near(g.y,165);const moved=C.movePen(g.x+90,g.y+45,g.width,g.height,1280,720);near(moved.penX,255/1280*100);near(moved.penY,210/720*100)});
test('移动后的牛棚完整留在画布内，竖图按真实高度约束',()=>{const g=C.penGeometry({penX:99,penY:99,penWidth:800},1280,720,2);near(g.width,252);near(g.height,504);assert(g.x+g.width/2<=1280+1e-8);assert(g.y+g.height/2<=708+1e-8);const moved=C.movePen(-999,999,g.width,g.height,1280,720);near(moved.penX,g.width/2/1280*100);near(moved.penY,(720-12-g.height/2)/720*100)});
test('从中心缩放保持宽高比并限制尺寸',()=>{near(C.resizePen(330,35,25,1280,720),390);near(C.resizePen(330,-900,-900,1280,720),120);near(C.resizePen(330,999,999,1280,720),504)});
