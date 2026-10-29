import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrowdOffset, applyCrowdVariation } from '../src/crowd/variation.js';
import { layoutCrowd, rectIntersectsZone } from '../src/crowd/layout.js';
import { defaultZone } from '../src/zone.js';
import { CrowdScene } from '../src/crowd/renderer.js';

test('entry offsets use exactly three random draws with the requested inclusive bounds',()=>{
  let draws=0;const values=[0,.5,1];
  assert.deepEqual(createCrowdOffset(()=>values[draws++]),{x:-.12,y:0,scale:.05});
  assert.equal(draws,3);
  assert.deepEqual(createCrowdOffset(()=>.5),{x:0,y:0,scale:0});
});

test('variation uses spacing horizontally, height vertically, and a bottom-center size anchor',()=>{
  const slot=Object.freeze({x:500,y:500,width:110,height:130,scale:1,row:0,front:true});
  const offset=Object.freeze({x:.12,y:-.06,scale:.05});
  const result=applyCrowdVariation(slot,offset,{width:1920,height:1080,zone:{enabled:false},counterTop:870});
  assert.ok(Math.abs(result.width-115.5)<1e-7);
  assert.ok(Math.abs(result.height-136.5)<1e-7);
  assert.ok(Math.abs(result.x-(500+110*.7*.12-(115.5-110)/2))<1e-7);
  assert.ok(Math.abs(result.y-(500-130*.06-(136.5-130)))<1e-7);
  assert.equal(result.scale,1.05);
  assert.deepEqual(result,applyCrowdVariation(slot,offset,{width:1920,height:1080,zone:{enabled:false},counterTop:870}));
});

test('full-size face safety falls back to the original slot rather than discarding a customer',()=>{
  const slot={x:285,y:500,width:110,height:130,scale:1,row:0,front:true};
  const zone={enabled:true,pts:[[40,0],[60,0],[60,100],[40,100]]};
  const result=applyCrowdVariation(slot,{x:.12,y:0,scale:.05},{width:1000,height:1080,zone,counterTop:900});
  assert.deepEqual(result,slot);
});

for(const [width,height] of [[1920,1080],[1080,1920],[2560,1080],[720,1280],[480,854]]){
  test(`${width}x${height}: worst entry offsets preserve all 500, top coverage and full face/jump clearance`,()=>{
    const unit=Math.min(width,height)/1080,counterTop=height-210*unit,zone=defaultZone(width/height);
    const layout=layoutCrowd({width,height,counterTop,zone,count:500});
    for(const offset of [{x:-.12,y:-.06,scale:.05},{x:.12,y:.06,scale:.05},{x:-.12,y:.06,scale:-.05},{x:.12,y:-.06,scale:-.05}]){
      const varied=layout.slots.map(slot=>applyCrowdVariation(slot,offset,{width,height,counterTop,zone}));
      assert.equal(varied.length+layout.outside,500);
      assert.equal(varied.length,500);
      assert.ok(Math.min(...varied.map(slot=>slot.y))<=30*unit);
      for(let index=0;index<varied.length;index++){
        const slot=varied[index],base=layout.slots[index],jump=20*unit*slot.scale;
        assert.ok(slot.scale>=base.scale*.95-1e-7&&slot.scale<=base.scale*1.05+1e-7);
        assert.ok(slot.x>=-1e-7&&slot.x+slot.width<=width+1e-7);
        assert.ok(slot.y-jump>=6*unit-1e-7);
        assert.ok(slot.y+slot.height<=counterTop+12*unit+1e-7);
        assert.equal(rectIntersectsZone({...slot,y:slot.y-jump,height:slot.height+jump},zone,width,height,4*unit),false);
      }
    }
  });
}

test('renderer layout reapplies each order fixed offset after refill without rerolling',()=>{
  const orders=Array.from({length:6},(_,index)=>({key:`order:${index+1}`,receivedAt:0,nick:'顾客',crowdOffset:{x:(index%2?1:-1)*.12,y:-.03,scale:.02}}));
  const scene=Object.assign(Object.create(CrowdScene.prototype),{width:1920,height:1080,byKey:new Map(),views:[],getOrders:()=>orders,getSettings:()=>({crowd:{compress:true},display:{names:true}}),getZone:()=>({enabled:false}),clockOffset:0,pausedAt:null});
  scene.updateLayout(1000);
  const offset=orders[1].crowdOffset,initial=scene.byKey.get('order:2').target;
  const base=layoutCrowd({width:1920,height:1080,zone:{enabled:false},count:orders.length,counterTop:870}).slots[1];
  assert.notEqual(initial.x,base.x);
  orders.shift();
  scene.updateLayout(2000);
  const expected=applyCrowdVariation(layoutCrowd({width:1920,height:1080,zone:{enabled:false},count:orders.length,counterTop:870}).slots[0],offset,{width:1920,height:1080,zone:{enabled:false},counterTop:870});
  assert.deepEqual(scene.byKey.get('order:2').target,{...expected,key:'order:2'});
  assert.equal(orders[0].crowdOffset,offset);
  assert.equal(scene.snapshot().actors[0].crowdOffset,offset);
});
