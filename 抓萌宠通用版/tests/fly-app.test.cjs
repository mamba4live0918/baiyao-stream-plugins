const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const {bootstrap,dispatch,flushSave}=require('./helpers/app-harness.cjs');
async function fixture(){const f=await bootstrap(C.fresh(),null,{realEffects:true}),c=f.ctx.customInstance;Object.assign(c.assets.cows[0],{motion:'fly',frames:30,articulated:true,flyCycleMs:1200,particleStyle:'butterfly'});c.renderCows();return f;}
function add(f){const card=f.document.getElementById('cow-gallery').children.find(n=>Number(n.dataset.cow)===0),control=card.querySelector('.species-add-controls');control.querySelector('input').value='1';control.querySelector('button').click();const actor=f.ctx.effectInstance.getCows().at(-1);actor.flyClock=0;return actor;}
test('manual native flyer appears at flight height and resumes hovering after a real drag release',async()=>{
 const f=await fixture(),actor=add(f);assert.equal(actor.motionMode,'fly');assert.equal(actor.flying,true);assert.equal(actor.airborne,false);assert.equal(actor.vy,0);assert(actor.y>0);
 f.ctx.customInstance.cfg.wander=false;for(let t=0;t<500;t+=20)f.ctx.frame(t);const frame=actor.hopFrame;assert(frame>0);assert.equal(actor.sprite.hidden,false);
 dispatch(actor.el,'pointerdown',{clientX:actor.x,clientY:actor.y});assert.equal(actor.held,true);dispatch(f.document.getElementById('field'),'pointermove',{clientX:300,clientY:350});dispatch(f.document.getElementById('field'),'pointerup',{clientX:300,clientY:350});
 assert.equal(actor.held,false);assert.equal(actor.airborne,false);assert.equal(actor.vy,0);const y=actor.y;for(let t=500;t<1000;t+=20)f.ctx.frame(t);assert.equal(actor.y,y);assert.notEqual(actor.hopFrame,frame);assert.equal(flushSave(f.ctx,f.store).positions[0].kind,0);
});
test('fly mode in the real gallery selects and preserves explicit old modes without changing storage keys',async()=>{
 const f=await fixture(),card=f.document.getElementById('cow-gallery').children.find(n=>Number(n.dataset.cow)===0),select=card.querySelector('.cow-motion-select');assert(select.options.some(o=>o.value==='fly'));
 select.value='walk';dispatch(select,'change');const walker=add(f);assert.equal(walker.motionMode,'walk');assert.equal(walker.flying,false);assert.equal(walker.airborne,true);
 select.value='fly';dispatch(select,'change');assert.equal(walker.flying,true);assert.equal(walker.airborne,false);assert.equal(f.ctx.customInstance.cowSetting(0).motion,'fly');assert(f.store.has('pet-catch-v1-custom'));
});
test('reduced animation stops flyer poses and returning native flyers keep original recall semantics',async()=>{
 const f=await fixture(),actor=add(f);for(let t=0;t<500;t+=20)f.ctx.frame(t);assert(actor.hopFrame>0);
 const motion=f.document.getElementById('motion');motion.value='off';dispatch(motion,'change');f.ctx.frame(520);assert.equal(actor.el.dataset.frame,'0');assert.equal(actor.sprite.hidden,true);
 motion.value='on';dispatch(motion,'change');f.ctx.frame(550);assert.equal(actor.sprite.hidden,false);
 f.document.getElementById('collect-test').click();assert.equal(actor.dead,true);assert.equal(flushSave(f.ctx,f.store).outside,0);assert.equal(flushSave(f.ctx,f.store).home,1);
});
