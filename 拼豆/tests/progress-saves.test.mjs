import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProgressSave,parseProgressSave,validateProgressSave,createProgressStore} from '../src/progress-saves.js';
import {createPresetPattern} from '../src/patterns.js';
import {PegGame} from '../src/game.js';
import {normalizeCampaign} from '../src/play-modes.js';
import {INTERACTIONS,createInteractionRules} from '../src/interaction-rules.js';
function sample(){const pattern=createPresetPattern('cherries',30),g=new PegGame({pattern});const bead=g.place('#123456',1,1);g.fall(bead.id);g.place('#654321',2,2);g.spill();g.pressRestore();g.addRounds(2);return{pattern,game:g.snapshot(),finished:null,playMode:'pattern',campaign:normalizeCampaign(),modeSessions:{},settings:{toolSensitivity:1,defaultTool:'tweezers',penCapacity:3,finishQuality:'high',workbenchQuality:'high',heldGlow:true,rules:createInteractionRules(),colorTier:48,jarFilter:'all',desk:false,hint:true,magnifierKey:'KeyM',magnifierMode:'hold',magnifierZoom:2.5,magnifierSize:220,customColors:[]}};}
test('progress file retains placed, fallen, tray restoration and extra rounds',()=>{const state=sample(),save=makeProgressSave(state,'未完成作品');const parsed=parseProgressSave(JSON.stringify(save));assert.deepEqual(parsed.state,state);state.game.placed.fill(null);assert.equal(parsed.state.game.placed.filter(Boolean).length,1);});
test('corrupt positions, invalid settings and unsupported versions cannot be loaded',()=>{for(const change of [s=>s.version=2,s=>s.state.game.placed[62].row=9,s=>s.state.settings.magnifierZoom=null,s=>s.state.pattern.cells.pop(),s=>s.state.game.nextId=1]){const s=makeProgressSave(sample(),'备份');change(s);assert.throws(()=>validateProgressSave(s),/存档无效/);}assert.throws(()=>parseProgressSave('{broken'),/存档无效/);});
test('missing browser storage reports an error rather than pretending to save',async()=>{const store=createProgressStore({indexedDB:null});await assert.rejects(()=>store.save('a',makeProgressSave(sample(),'A')),/不可用/);});
test('a recovered tray and a fractional near-full stage restore without losing progress',()=>{const s=sample();s.game.trayRestoreStage=5;s.game.traySpilled=false;s.game.restoreProgress=0;assert.equal(PegGame.fromSnapshot(s.game,{pattern:s.pattern}).trayRestoreStage,5);s.game.trayRestoreStage=2;s.game.traySpilled=true;s.game.restoreProgress=99.4;assert.equal(PegGame.fromSnapshot(s.game,{pattern:s.pattern}).restoreProgress,99.4);});

function fakeIndexedDB() {
  const records = new Map();
  const fake = { failNextPut: false, seed: record => records.set(record.id, structuredClone(record)) };
  let hasStore = false;
  const db = {
    objectStoreNames: { contains: name => name === 'saves' && hasStore },
    createObjectStore(name) {
      if (name !== 'saves') throw Error('wrong store');
      hasStore = true;
    },
    close() {},
    transaction(name) {
      if (name !== 'saves' || !hasStore) throw Error('missing store');
      let pending = 0;
      let aborted = false;
      const transaction = {
        oncomplete: null, onabort: null, onerror: null, error: null,
        abort() { aborted = true; queueMicrotask(() => transaction.onabort?.()); },
        objectStore() {
          function request(work) {
            const req = { result: undefined, error: null, onsuccess: null, onerror: null };
            pending++;
            queueMicrotask(() => {
              if (aborted) return;
              try {
                req.result = work();
                req.onsuccess?.();
              } catch (error) {
                req.error = error;
                transaction.error = error;
                req.onerror?.();
                aborted = true;
                queueMicrotask(() => transaction.onabort?.());
              }
              pending--;
              if (!aborted && pending === 0) queueMicrotask(() => {
                if (!aborted && pending === 0) transaction.oncomplete?.();
              });
            });
            return req;
          }
          return {
            count: () => request(() => records.size),
            get: id => request(() => structuredClone(records.get(id))),
            getAll: () => request(() => structuredClone([...records.values()])),
            put: record => request(() => {
              if (fake.failNextPut) {
                fake.failNextPut = false;
                throw Error('quota full');
              }
              records.set(record.id, structuredClone(record));
              return record.id;
            }),
            delete: id => request(() => records.delete(id))
          };
        }
      };
      return transaction;
    }
  };
  fake.open = () => {
    const req = { result: undefined, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      req.result = db;
      if (!hasStore) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  };
  return fake;
}

test('progress slots preserve old data after failed overwrite and reserve recovery separately',async()=>{
 const fake=fakeIndexedDB(),store=createProgressStore({indexedDB:fake});
 const a=makeProgressSave(sample(),'A');await store.save('slot',a);fake.failNextPut=true;
 await assert.rejects(()=>store.save('slot',makeProgressSave(sample(),'B')),/quota|存档/);assert.equal((await store.list())[0].save.name,'A');
 for(let i=1;i<20;i++)await store.save('slot'+i,a);await assert.rejects(()=>store.save('overflow',a),/20/);await store.save('recovery',a);assert.equal((await store.list()).length,21);
});


test('old saves default to hold and new saves retain toggle mode',()=>{const s=makeProgressSave(sample(),'旧存档');delete s.state.settings.magnifierMode;assert.equal(validateProgressSave(s).state.settings.magnifierMode,'hold');s.state.settings.magnifierMode='toggle';assert.equal(validateProgressSave(s).state.settings.magnifierMode,'toggle');s.state.settings.magnifierMode='invalid';assert.throws(()=>validateProgressSave(s),/触发方式/);});

test('tool sensitivity migrates older saves and preserves the chosen follow speed',()=>{const s=makeProgressSave(sample(),'灵敏度');delete s.state.settings.toolSensitivity;assert.equal(validateProgressSave(s).state.settings.toolSensitivity,1);s.state.settings.toolSensitivity=.25;assert.equal(validateProgressSave(s).state.settings.toolSensitivity,.25);s.state.settings.toolSensitivity=0;assert.throws(()=>validateProgressSave(s),/灵敏度/);});

test('older saves without tool settings load as tweezers, and bad tool values are rejected',()=>{
 const state=sample();delete state.settings.defaultTool;delete state.settings.penCapacity;delete state.settings.finishQuality;delete state.settings.workbenchQuality;
 const parsed=parseProgressSave(JSON.stringify(makeProgressSave(state,'旧存档')));
 assert.equal(parsed.state.settings.defaultTool,'tweezers');assert.equal(parsed.state.settings.finishQuality,'high');assert.equal(parsed.state.settings.penCapacity,3);
 const pen=sample();pen.settings.defaultTool='pen';pen.settings.penCapacity=8;
 assert.equal(parseProgressSave(JSON.stringify(makeProgressSave(pen,'笔'))).state.settings.penCapacity,8);
 for(const change of [s=>s.state.settings.finishQuality='8k',s=>s.state.settings.workbenchQuality='low',s=>s.state.settings.defaultTool='spoon',s=>s.state.settings.penCapacity=1,s=>s.state.settings.penCapacity=21]){const s=makeProgressSave(sample(),'备份');change(s);assert.throws(()=>validateProgressSave(s),/存档无效/);}
});

test('custom interaction levels survive JSON export and import without changing IDs or parameters',()=>{
 const state=sample(),rule=state.settings.rules.find(r=>r.id==='shake');
 rule.levels.push({id:'my-strong-level',name:'我的强震',enabled:true,giftName:'强震礼物',amount:3,strength:94,duration:8,presses:8,decay:10,capacity:10});
 const saved=makeProgressSave(state,'自定义互动');
 const parsed=parseProgressSave(JSON.stringify(saved));
 assert.deepEqual(parsed.state.settings.rules.find(r=>r.id==='shake').levels[1],{
  id:'my-strong-level',name:'我的强震',enabled:true,giftName:'强震礼物',amount:3,strength:94,duration:8,presses:8,decay:10,capacity:10
 });
});

test('valid old three-level progress files migrate names while preserving IDs, gifts and effect parameters',()=>{
 const saved=makeProgressSave(sample(),'旧三档');
 saved.state.settings.rules=INTERACTIONS.map(effect=>({id:effect.id,levels:['light','medium','heavy'].map((id,index)=>({
  id,enabled:true,giftName:`${effect.gift}-${id}`,amount:index+1,strength:23+index,duration:3+index,
  presses:6+index,decay:11+index,capacity:7+index
 }))}));
 const original=structuredClone(saved);
 const parsed=parseProgressSave(JSON.stringify(saved));
 const shake=parsed.state.settings.rules.find(r=>r.id==='shake').levels;
 const spill=parsed.state.settings.rules.find(r=>r.id==='spill').levels;
 const pen=parsed.state.settings.rules.find(r=>r.id==='pen').levels;
 assert.deepEqual(shake.map(l=>[l.id,l.name,l.giftName,l.amount,l.strength,l.duration]),[
  ['light','轻档','摇摇乐-light',1,23,3],['medium','中档','摇摇乐-medium',2,24,4],['heavy','重档','摇摇乐-heavy',3,25,5]
 ]);
 assert.deepEqual(spill.map(l=>[l.presses,l.decay]),[[6,11],[7,12],[8,13]]);
 assert.deepEqual(pen.map(l=>l.capacity),[7,8,9]);
 assert.deepEqual(saved,original,'validating an old file does not mutate its bytes in memory');
});

test('old single-rule progress files migrate to the medium level',()=>{
 const saved=makeProgressSave(sample(),'旧单档');
 saved.state.settings.rules=INTERACTIONS.map(effect=>({id:effect.id,enabled:true,giftName:`${effect.gift}-旧`,amount:2,
  strength:67,duration:6,presses:9,decay:12,capacity:14}));
 const parsed=parseProgressSave(JSON.stringify(saved));
 const shake=parsed.state.settings.rules.find(r=>r.id==='shake').levels;
 assert.deepEqual([shake[1].id,shake[1].name,shake[1].giftName,shake[1].amount,shake[1].strength,shake[1].duration],
  ['medium','中档','摇摇乐-旧',2,67,6]);
});

test('legacy progress files import an enabled empty gift as a disabled inert level',()=>{
 const oldThree=makeProgressSave(sample(),'旧三档空名');
 oldThree.state.settings.rules=INTERACTIONS.map(effect=>({id:effect.id,levels:['light','medium','heavy'].map(id=>({
  id,enabled:true,giftName:`${effect.gift}-${id}`,amount:2,
  strength:55,duration:2,presses:8,decay:10,capacity:10
 }))}));
 oldThree.state.settings.rules.find(rule=>rule.id==='shake').levels[1].giftName='';
 const parsedThree=parseProgressSave(JSON.stringify(oldThree));
 const migratedThree=parsedThree.state.settings.rules.find(rule=>rule.id==='shake').levels[1];
 assert.deepEqual([migratedThree.id,migratedThree.enabled,migratedThree.giftName],['medium',false,'']);

 const oldFlat=makeProgressSave(sample(),'旧单条空名');
 oldFlat.state.settings.rules=INTERACTIONS.map(effect=>({id:effect.id,enabled:true,giftName:`${effect.gift}-旧`,amount:2,
  strength:55,duration:2,presses:8,decay:10,capacity:10}));
 oldFlat.state.settings.rules.find(rule=>rule.id==='help').giftName='';
 const parsedFlat=parseProgressSave(JSON.stringify(oldFlat));
 const migratedFlat=parsedFlat.state.settings.rules.find(rule=>rule.id==='help').levels[1];
 assert.deepEqual([migratedFlat.id,migratedFlat.enabled,migratedFlat.giftName],['medium',false,'']);
});

test('an old progress file with a missing saved quantity is rejected rather than reset',()=>{
 const saved=makeProgressSave(sample(),'旧档损坏');
 saved.state.settings.rules=INTERACTIONS.map(effect=>({id:effect.id,levels:['light','medium','heavy'].map(id=>({
  id,enabled:true,giftName:`${effect.gift}-${id}`,amount:2,
  strength:55,duration:2,presses:8,decay:10,capacity:10
 }))}));
 delete saved.state.settings.rules[0].levels[1].amount;
 assert.throws(()=>parseProgressSave(JSON.stringify(saved)),/互动设置损坏/);
});

test('damaged new interaction levels are rejected instead of reset to defaults',()=>{
 const bad=[
  save=>{save.state.settings.rules[0].levels[0].name='';},
  save=>{save.state.settings.rules[0].levels[0].id='';},
  save=>{save.state.settings.rules[0].levels.push({...save.state.settings.rules[0].levels[0]});},
  save=>{save.state.settings.rules[0].levels[0].giftName='';}
 ];
 for(const mutate of bad){const saved=makeProgressSave(sample(),'坏档位');mutate(saved);
  assert.throws(()=>parseProgressSave(JSON.stringify(saved)),/互动设置损坏/);}
});
