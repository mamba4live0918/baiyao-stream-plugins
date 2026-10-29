import test from 'node:test';
import assert from 'node:assert/strict';
import {eventLayout,eventDropAction,eventPointInFace,eventNeedsAnimation} from '../src/events/scene.js';
import {counterRect} from '../src/crowd/renderer.js';
import {defaultZone} from '../src/zone.js';

function fixture(w=1920,h=1080){const c=counterRect(w,h),u=Math.min(w,h)/1080;return eventLayout({width:w,height:h,counter:c,tools:{pot:{x:c.x+c.width*.4-110*u,y:c.y-80*u,width:220*u,height:140*u},jar:{x:c.x+c.width*.94-60*u,y:c.y-65*u,width:120*u,height:130*u},dish:{x:c.x+c.width*.68-55*u,y:c.y-18*u,width:110*u,height:85*u}},zone:defaultZone(w/h),actors:[],state:{active:{}},now:0});}
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
test('interactive tool regions remain inside all five delivery viewports',()=>{
 for(const [w,h]of [[1920,1080],[1080,1920],[2560,1080],[720,1280],[480,854]]){
  const r=fixture(w,h);for(const id of ['extinguisher','fuse','cat']){const p=r[id];assert.ok(p.x>=0&&p.y>=0,id);assert.ok(p.x+p.width<=w+.1&&p.y+p.height<=h+.1,id);}
 }
});
test('extinguisher must be dragged onto the fire rather than released elsewhere',()=>{
 const r=fixture();assert.deepEqual(eventDropAction('extinguisher',center(r.extinguisher),center(r.fire),r),{type:'extinguish'});
 assert.equal(eventDropAction('extinguisher',center(r.extinguisher),{x:1500,y:200},r),null);
});
test('power lever restores only after an upward drag of at least twenty logical pixels',()=>{
 const r=fixture(),p=center(r.fuse);assert.equal(eventDropAction('fuse',p,{x:p.x,y:p.y+40},r),null);
 assert.equal(eventDropAction('fuse',p,{x:p.x,y:p.y-19},r),null);
 assert.deepEqual(eventDropAction('fuse',p,{x:p.x,y:p.y-20},r),{type:'restorePower'});
});
test('a cat click cannot throw it out; a deliberate drag out of the work area can',()=>{
 const r=fixture(),p=center(r.cat);assert.equal(eventDropAction('cat',p,p,r),null);
 assert.equal(eventDropAction('cat',p,{x:p.x+70,y:p.y},r),null);
 assert.deepEqual(eventDropAction('cat',p,{x:p.x,y:r.workingArea.y-1},r),{type:'removeCat'});
});
test('face hit geometry uses the actual polygon, including its empty bounding corners',()=>{
 const z={enabled:true,pts:[[50,10],[60,30],[50,50],[40,30]]};
 assert.equal(eventPointInFace({x:500,y:300},z,1000,1000),true);
 assert.equal(eventPointInFace({x:400,y:100},z,1000,1000),false);
});
test('persistent soot, burnt fire, sitting cat, wanted and waiting helpers do not keep RAF alive',()=>{
 const s={active:{boom:{remaining:8},fire:{burnt:true,burnAt:2},cat:{nextEatAt:9000},blackout:{until:20000},spice:{until:10}},effects:[],wanted:[{}],helper:{credits:8}};
 assert.equal(eventNeedsAnimation(s,null,100,[]),false);
 assert.equal(eventNeedsAnimation({...s,active:{fire:{burnt:false,burnAt:8000}}},null,100,[]),true);
 assert.equal(eventNeedsAnimation(s,{pot:{status:'smoking'}},100,[]),true);
 assert.equal(eventNeedsAnimation({...s,effects:[{until:500}]},null,100,[]),true);
 assert.equal(eventNeedsAnimation({...s,active:{cat:{lastEatAt:100,nextEatAt:4100}}},null,200,[]),true);
 assert.equal(eventNeedsAnimation({...s,active:{cat:{lastEatAt:100,nextEatAt:4100}}},null,600,[]),false);
});
test('sushi fire and cat positions follow the actual board, not the unused soup pot',()=>{
 const c=counterRect(1920,1080),board={x:640,y:820,width:330,height:60},pot={x:10,y:200,width:220,height:140};
 const r=eventLayout({width:1920,height:1080,counter:c,tools:{board,pot},shop:'sushi',zone:defaultZone(16/9)});
 assert.deepEqual(r.pot,board);assert.equal(center(r.fire).x,center(board).x);assert.equal(center(r.cat).x,center(board).x);
});
