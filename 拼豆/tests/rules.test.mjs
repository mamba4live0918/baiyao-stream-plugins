import test from 'node:test';
import assert from 'node:assert/strict';
import * as rulesModule from '../src/interaction-rules.js';

const { INTERACTIONS, MAX_INTERACTION_LEVELS, createInteractionLevel, createInteractionRules, resolveGiftRule, validateRuleSet } = rulesModule;

const clone = value => structuredClone(value);

test('new users get one editable example per interaction', () => {
 const rules = createInteractionRules();
 assert.equal(rules.length, 9);
 assert.ok(rules.every(rule => rule.levels.length === 1));
 assert.ok(rules.every(rule => rule.levels[0].name === '互动级别 1'));
 assert.deepEqual(validateRuleSet(rules), []);
 const help = rules.find(rule => rule.id === 'help').levels[0];
 assert.equal(help.giftName, '助力拼豆');
 assert.equal(help.amount, 8);
 assert.equal(resolveGiftRule(rules, { name: '助力拼豆', count: 2 }).count, 16);
});

test('a present empty saved rule list is rejected rather than treated as a new user', () => {
 assert.equal(createInteractionRules().length, 9);
 assert.throws(() => createInteractionRules([]), /互动设置损坏/);
 assert.throws(() => createInteractionRules(null), /互动设置损坏/);
});

test('new levels have stable unique IDs and survive adding, editing and removal', () => {
 assert.equal(typeof createInteractionLevel, 'function');
 const rules = createInteractionRules();
 const shake = rules.find(rule => rule.id === 'shake');
 const first = createInteractionLevel('shake', shake.levels);
 const second = createInteractionLevel('shake', [...shake.levels, first]);
 assert.notEqual(first.id, second.id);
 assert.equal(first.enabled, false);
 assert.equal(first.giftName, '');
 assert.deepEqual([first.amount, first.strength, first.duration], [1, 55, 2]);
 first.name = '自选微震'; first.giftName = '自选礼物'; first.amount = 2;
 first.strength = 73; first.duration = 7; first.enabled = true;
 shake.levels.push(first, second);
 assert.deepEqual(validateRuleSet(rules), []);
 const restored = createInteractionRules(rules);
 assert.deepEqual(restored, rules);
 assert.notEqual(restored[0], rules[0]);
 assert.equal(resolveGiftRule(restored, { name: '自选礼物', count: 3 }).count, 6);
 assert.equal(resolveGiftRule(restored, { name: '自选礼物', count: 3 }).strength, 73);
 const restoredShake = restored.find(rule => rule.id === 'shake');
 restoredShake.levels.splice(1, 1);
 assert.equal(resolveGiftRule(restored, { name: '自选礼物', count: 1 }), null);
 assert.equal(resolveGiftRule(rules, { name: '自选礼物', count: 1 }).count, 2);
});

test('disabled and empty interactions never route gifts', () => {
 const rules = createInteractionRules();
 const help = rules.find(rule => rule.id === 'help');
 help.levels[0].enabled = false;
 assert.equal(resolveGiftRule(rules, { name: '助力拼豆', count: 1 }), null);
 help.levels = [];
 assert.deepEqual(validateRuleSet(rules), []);
 assert.equal(resolveGiftRule(rules, { name: '助力拼豆', count: 1 }), null);
});

test('old light, medium and heavy IDs preserve gift names and effect parameters', () => {
 const old = INTERACTIONS.map(effect => ({ id: effect.id, levels: ['light', 'medium', 'heavy'].map((id, index) => ({
  id, enabled: true, giftName: `${effect.gift}-${id}`, amount: index + 1,
  strength: 21 + index, duration: 4 + index, presses: 6 + index,
  decay: 11 + index, capacity: 7 + index
 })) }));
 const rules = createInteractionRules(old);
 const shake = rules.find(rule => rule.id === 'shake');
 const spill = rules.find(rule => rule.id === 'spill');
 const pen = rules.find(rule => rule.id === 'pen');
 assert.deepEqual(shake.levels.map(level => [level.id, level.name, level.giftName, level.amount, level.strength, level.duration]), [
  ['light', '轻档', '摇摇乐-light', 1, 21, 4],
  ['medium', '中档', '摇摇乐-medium', 2, 22, 5],
  ['heavy', '重档', '摇摇乐-heavy', 3, 23, 6]
 ]);
 assert.deepEqual(spill.levels.map(level => [level.presses, level.decay]), [[6, 11], [7, 12], [8, 13]]);
 assert.deepEqual(pen.levels.map(level => level.capacity), [7, 8, 9]);
 assert.deepEqual(validateRuleSet(rules), []);
 assert.equal(resolveGiftRule(rules, { name: '摇摇乐-heavy', count: 2 }).tier, 'heavy');
});

test('old single gift rule remains the middle legacy level', () => {
 const old = INTERACTIONS.map(effect => ({
  id: effect.id, enabled: true, giftName: `${effect.gift}-旧`, amount: 2,
  strength: 67, duration: 6, presses: 9, decay: 12, capacity: 14
 }));
 const rules = createInteractionRules(old);
 const help = rules.find(rule => rule.id === 'help');
 const shake = rules.find(rule => rule.id === 'shake');
 const pen = rules.find(rule => rule.id === 'pen');
 assert.equal(help.levels.length, 3);
 assert.deepEqual([help.levels[1].id, help.levels[1].giftName, help.levels[1].amount], ['medium', '助力拼豆-旧', 2]);
 assert.deepEqual([shake.levels[1].strength, shake.levels[1].duration], [67, 6]);
 assert.equal(pen.levels[1].capacity, 14);
 assert.deepEqual(validateRuleSet(rules), []);
});

test('an enabled old three-tier level with an empty gift stays inert after migration', () => {
 const old=INTERACTIONS.map(effect=>({id:effect.id,levels:['light','medium','heavy'].map(id=>({
  id,enabled:true,giftName:`${effect.gift}-${id}`,amount:1,strength:55,duration:2,presses:8,decay:10,capacity:10
 }))}));
 old.find(rule=>rule.id==='shake').levels[1].giftName='';
 const rules=createInteractionRules(old),level=rules.find(rule=>rule.id==='shake').levels[1];
 assert.equal(level.id,'medium');
 assert.equal(level.giftName,'');
 assert.equal(level.enabled,false);
 assert.deepEqual(validateRuleSet(rules),[]);
 assert.equal(resolveGiftRule(rules,{name:'',count:1}),null);
});

test('an enabled old flat rule with an empty gift stays inert after migration', () => {
 const old=INTERACTIONS.map(effect=>({id:effect.id,enabled:true,giftName:`${effect.gift}-旧`,amount:2,
  strength:55,duration:2,presses:8,decay:10,capacity:10}));
 old.find(rule=>rule.id==='help').giftName='';
 const rules=createInteractionRules(old),level=rules.find(rule=>rule.id==='help').levels[1];
 assert.equal(level.id,'medium');
 assert.equal(level.giftName,'');
 assert.equal(level.enabled,false);
 assert.deepEqual(validateRuleSet(rules),[]);
 assert.equal(resolveGiftRule(rules,{name:'',count:1}),null);
});

test('level validation rejects malformed identity, names, quantities and parameters', () => {
 const base = createInteractionRules();
 const invalid = [
  rules => { rules[0].levels[0].id = ''; },
  rules => { rules[0].levels.push(clone(rules[0].levels[0])); },
  rules => { rules[0].levels[0].name = ''; },
  rules => { rules[0].levels[0].giftName = ''; },
  rules => { rules[1].levels[0].giftName = rules[0].levels[0].giftName; },
  rules => { rules[0].levels[0].amount = 0; },
  rules => { rules[0].levels[0].strength = 101; },
  rules => { rules[5].levels[0].presses = 1; },
  rules => { rules[7].levels[0].capacity = 21; },
  rules => { rules[0].levels = Array.from({ length: 21 }, (_, i) => ({ ...rules[0].levels[0], id: `extra-${i}`, giftName: `独立礼物-${i}` })); }
 ];
 for (const mutate of invalid) { const rules = clone(base); mutate(rules); assert.notDeepEqual(validateRuleSet(rules), []); }
});

test('gift quantity multiplies only the matched level and stops at each effect limit', () => {
 const rules = createInteractionRules();
 const pen = rules.find(rule => rule.id === 'pen');
 const custom = createInteractionLevel('pen', pen.levels);
 Object.assign(custom, { name: '极速笔', giftName: '极速笔礼物', enabled: true, amount: 17, capacity: 19 });
 pen.levels.push(custom);
 const routed = resolveGiftRule(rules, { name: '极速笔礼物', count: 10000 });
 assert.equal(routed.tier, custom.id);
 assert.equal(routed.count, 3600);
 assert.equal(routed.capacity, 19);
 assert.equal(resolveGiftRule(rules, { name: '拼豆笔', count: 2 }).count, 60);
});

test('a twentieth level is valid and another cannot be created', () => {
 const rules=createInteractionRules(),shake=rules.find(rule=>rule.id==='shake');
 while(shake.levels.length<MAX_INTERACTION_LEVELS)shake.levels.push(createInteractionLevel('shake',shake.levels));
 assert.equal(shake.levels.length,20);
 assert.deepEqual(validateRuleSet(rules),[]);
 assert.throws(()=>createInteractionLevel('shake',shake.levels),/最多 20/);
});
