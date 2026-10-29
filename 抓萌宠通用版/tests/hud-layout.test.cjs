const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('统计栏缩放同时改变文字与面板尺寸，超出画布时完整收进来',()=>{const g=C.hudGeometry({x:99,y:0,scale:200},348,78,1280,720);near(g.width,696);near(g.height,156);assert(g.x+g.width/2<=1272);assert(g.y-g.height/2>=8);});
test('候场面板右下角缩放以实际显示大小开始，不从原始超限位置跳变',()=>{const scale=C.resizeHud(264,88,264,30,10,1280,720);near(scale,324/264*100);const g=C.hudGeometry({x:0,y:100,scale},264,88,1280,720);const moved=C.moveHud(g.x+60,g.y-40,g.width,g.height,1280,720);near(moved.x/100*1280,g.x+60);near(moved.y/100*720,g.y-40);});
test('小画布与大字体仍限制在可见范围，修改尺寸不影响游戏数据',()=>{const state=C.fresh();state.outside=461;const before=JSON.stringify(state);const g=C.hudGeometry({x:50,y:50,scale:250},348,78,320,180);assert(g.width<=304);assert(g.height<=164);assert(g.scale<250);assert.equal(JSON.stringify(state),before);});
