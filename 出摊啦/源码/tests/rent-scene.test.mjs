import test from 'node:test';
import assert from 'node:assert/strict';
import {rentLayout,rentClipPath,formatDuration} from '../src/rent/scene.js';
import {counterRect} from '../src/crowd/renderer.js';
import {defaultZone} from '../src/zone.js';

test('V1.5 交租牌：只剩交租牌（加班时间看白曜加班机）；五个尺寸默认都在画面里且不压柜台',()=>{
 for(const [w,h] of [[1920,1080],[1080,1920],[2560,1080],[720,1280],[480,854]]){
  const c=counterRect(w,h),r=rentLayout(w,h,c),p=r.panel,u=Math.min(w,h)/1080;
  assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=w+.01&&p.y+p.height<=h+.01,`${w}x${h} 在画面里`);
  assert.equal(Math.round(p.width/u),240);assert.equal(Math.round(p.height/u),100);
  assert.equal(r.clock,undefined,'没有自带加班机了');
  assert.ok(p.y+p.height<c.y,'默认不压柜台');
 }
});
test('V1.3 起交租牌位置按画面比例存，拖出画面会被拉回来，大小限制在 0.4～3 倍',()=>{
 const w=1920,h=1080,c=counterRect(w,h);
 let r=rentLayout(w,h,c,{x:.1,y:.2,scale:2});
 assert.equal(Math.round(r.panel.x),192);assert.equal(Math.round(r.panel.y),216);assert.equal(Math.round(r.panel.width),480);
 r=rentLayout(w,h,c,{x:.99,y:.99,scale:1});assert.ok(r.panel.x+r.panel.width<=w+.01&&r.panel.y+r.panel.height<=h+.01);
 assert.equal(rentLayout(w,h,c,{scale:9}).scale,3);assert.equal(rentLayout(w,h,c,{scale:.01}).scale,.4);
});
test('face clipping is an explicit evenodd hole including edited face zones',()=>{
 assert.equal(rentClipPath(1920,1080,{enabled:false}), 'none');
 const z=defaultZone(16/9),path=rentClipPath(1920,1080,z);
 assert.match(path,/^path\(evenodd,/);assert.match(path,/M0 0H1920V1080H0Z M/);assert.ok(path.endsWith('Z")'));
});
test('overtime duration keeps seconds and large hours without a hidden cap',()=>{
 assert.equal(formatDuration(0),'0:00');assert.equal(formatDuration(61),'1:01');
 assert.equal(formatDuration(7200),'2:00:00');assert.equal(formatDuration(360001),'100:00:01');
});
