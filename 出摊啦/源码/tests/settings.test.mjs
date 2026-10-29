import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, sanitizeSettings, loadSettings, saveSettings, KEY_SETTINGS, KEY_STATS } from '../src/settings.js';
import { defaultZone, zoneRect, zoneDist } from '../src/zone.js';

test('defaults are isolated, unlimited and use new storage keys', () => {
  const a = defaultSettings(), b = defaultSettings();
  a.order.keywords.push('变了');
  a.display.zone.pts[0][0] = 0;
  assert.equal(b.shop, 'noodle');
  assert.equal(b.order.perPerson, 1);
  assert.equal(b.limits.queue, 0);
  assert.equal('mode' in b.rent, false, 'V1.5：加班都送去白曜加班机，没有加班机选择了');
  assert.equal('port' in b.rent, false);
  assert.ok(!b.order.keywords.includes('变了'));
  assert.notEqual(b.display.zone.pts[0][0], 0);
  assert.equal(KEY_SETTINGS, 'chutan.v1_1.settings');
  assert.equal(KEY_STATS, 'chutan.v1_1.stats');
});

test('malformed values fall back; valid zero limits and large quantities survive', () => {
  const s = sanitizeSettings({shop:'invalid', order:{perPerson:0}, audio:{volume:8}, rent:{minutes:0,port:70000}, rules:{pool:[],mess:[{name:'测试',min:100001,max:100002}]}, limits:{queue:0}});
  assert.equal(s.shop, 'noodle');
  assert.equal(s.order.perPerson, 0);
  assert.equal(s.audio.volume, 1);
  assert.equal(s.rent.minutes, 10);
  assert.equal('port' in s.rent, false);
  assert.equal('mode' in sanitizeSettings({rent:{mode:'miebo',port:7037}}).rent, false, 'V1.5：旧存档的咩播 / 自带加班机选择不要了');
  assert.equal(sanitizeSettings({rent:{hours:3.5}}).rent.hours, 3.5, 'V1.4 的「今天播多久」留在存档里，退回 V1.4 还在');
  assert.deepEqual(s.rules.pool, []);
  assert.equal(s.rules.mess[0].max, 100002);
  assert.equal(s.limits.queue, 0);
  assert.deepEqual(sanitizeSettings(null), defaultSettings());
});

test('stored legacy defaults migrate while custom keyword lists remain intact', () => {
  const legacy = ['点单', '来一份', '来一碗', '来一杯', '来一盘', '来个'];
  const current = ['点单', '来一份', '来一碗', '来一杯', '来一盘'];
  assert.deepEqual(defaultSettings().order.keywords, current);
  for (const keywords of [legacy, [...legacy].reverse()]) {
    const storage = { getItem() { return JSON.stringify({ order: { keywords } }); } };
    assert.deepEqual(loadSettings(storage).settings.order.keywords, current);
  }
  for (const keywords of [['老板来一份'], ['来个'], [...legacy, '老板来一份'], []]) {
    assert.deepEqual(sanitizeSettings({ order: { keywords } }).order.keywords, keywords);
  }
});

test('gift tables normalize duplicates, ranges and supported helpers', () => {
  const s = sanitizeSettings({rules:{pool:['fire','fire','bad'],mess:[{name:'玫瑰',min:5,max:2},{name:' 玫瑰 🌹 ',min:1,max:1}],help:[{name:'帮忙',action:'helper',min:2,max:4},{name:'错',action:'unknown',min:1,max:1}]}});
  assert.deepEqual(s.rules.pool,['fire']);
  assert.deepEqual(s.rules.mess,[{name:'玫瑰',min:2,max:5}]);
  assert.deepEqual(s.rules.help,[{name:'帮忙',action:'helper',min:2,max:4}]);
});

test('storage failures never throw or read another plugin key', () => {
  let value = null;
  const store = {getItem(key){assert.ok([KEY_SETTINGS,'chutan.v1.settings'].includes(key));return value;},setItem(key,data){assert.equal(key,KEY_SETTINGS);value=data;}};
  assert.equal(loadSettings(store).readable,true);
  assert.equal(saveSettings(store,{...defaultSettings(),shop:'sushi'}),true);
  assert.equal(loadSettings(store).settings.shop,'sushi');
  value = '{bad';
  assert.equal(loadSettings(store).readable,false);
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  assert.equal(loadSettings(denied).readable,false);
  assert.equal(saveSettings(denied,defaultSettings()),false);
});

test('automatic face shapes adapt while manual face points remain percentages', () => {
  const wide=defaultZone(16/9), tall=defaultZone(9/16);
  assert.notDeepEqual(wide.pts,tall.pts);
  const rect=zoneRect(tall,1080,1920);
  assert.ok(zoneDist(rect,rect.ix,rect.iy)<0);
  const custom=sanitizeSettings({display:{zone:{enabled:true,pts:[[20,20],[80,20],[50,80]],auto:false}}});
  assert.equal(custom.display.zone.auto,false);
  assert.deepEqual(custom.display.zone.pts,[[20,20],[80,20],[50,80]]);
});

test('crowd defaults are independent and old saved settings gain them without changing queue limits', () => {
  const a=defaultSettings(),b=defaultSettings();
  assert.deepEqual(a.crowd,{compress:true,moodSeconds:[30,60,120]});
  a.crowd.moodSeconds[0]=5;
  assert.deepEqual(b.crowd.moodSeconds,[30,60,120]);
  const old={shop:'tea',order:{keywords:['老板来一杯'],perPerson:0},limits:{queue:0}};
  const loaded=loadSettings({getItem:()=>JSON.stringify(old)}).settings;
  assert.deepEqual(loaded.crowd,{compress:true,moodSeconds:[30,60,120]});
  assert.equal(loaded.shop,'tea');
  assert.equal(loaded.order.perPerson,0);
  assert.equal(loaded.limits.queue,0);
  assert.deepEqual(loaded.order.keywords,['老板来一杯']);
});

test('crowd timing accepts finite nonnegative seconds and makes reversed values strictly increasing', () => {
  const cases=[
    [{compress:false,moodSeconds:[10.9,20.8,30.7]},{compress:false,moodSeconds:[10,20,30]}],
    [{compress:'no',moodSeconds:[90,20,10]},{compress:true,moodSeconds:[90,91,92]}],
    [{moodSeconds:[0,0,0]},{compress:true,moodSeconds:[0,1,2]}],
    [{moodSeconds:[-1,NaN,Infinity]},{compress:true,moodSeconds:[30,60,120]}],
    [{moodSeconds:[20]},{compress:true,moodSeconds:[20,60,120]}],
    [{moodSeconds:'5,10,20'},{compress:true,moodSeconds:[30,60,120]}],
    [{moodSeconds:[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE]},{compress:true,moodSeconds:[9007199254740989,9007199254740990,9007199254740991]}],
  ];
  for(const [crowd,expected]of cases)assert.deepEqual(sanitizeSettings({crowd}).crowd,expected);
});

test('crowd preferences survive storage together with existing display and unlimited settings', () => {
  let saved;
  const storage={getItem:()=>saved??null,setItem:(key,value)=>{saved=value;}};
  assert.equal(saveSettings(storage,{crowd:{compress:false,moodSeconds:[5,10,20]},display:{names:false},limits:{queue:0}}),true);
  const settings=loadSettings(storage).settings;
  assert.deepEqual(settings.crowd,{compress:false,moodSeconds:[5,10,20]});
  assert.equal(settings.display.names,false);
  assert.equal(settings.limits.queue,0);
});

test('old settings gain cooking defaults without replacing custom preferences', () => {
  const stored={shop:'tea',order:{perPerson:0,keywords:['老板来一杯']},cooking:{baseCoins:25,quantities:{sushi:[7,7]},discounts:{angry:.3}}};
  const loaded=loadSettings({getItem:key=>{assert.equal(key,KEY_SETTINGS);return JSON.stringify(stored);}}).settings;
  assert.deepEqual(loaded.cooking,{
    quantities:{noodle:[1,3],sushi:[7,7],pancake:[1,2],tea:[1,3]},
    baseCoins:25,differenceCoins:3,ruinedCoins:0,fine:10,
    shortProbabilities:[.15,.4,.7],discounts:{impatient:.8,angry:.3},
    capacity:0,fishPieces:8,spoilProbability:.5,spoilFine:10,
    heat:{noodle:{cookSeconds:4,readySeconds:6,smokeSeconds:3},pancake:{cookSeconds:4,readySeconds:6,smokeSeconds:3},tea:{cookSeconds:4,readySeconds:6,smokeSeconds:3}}
  });
  assert.equal(loaded.order.perPerson,0);
  assert.deepEqual(loaded.order.keywords,['老板来一杯']);
  const first=defaultSettings(),second=defaultSettings();
  first.cooking.quantities.noodle[0]=8;
  first.cooking.shortProbabilities[0]=1;
  first.cooking.discounts.angry=0;
  assert.deepEqual(second.cooking.quantities,{noodle:[1,3],sushi:[3,5],pancake:[1,2],tea:[1,3]});
  assert.deepEqual(second.cooking.shortProbabilities,[.15,.4,.7]);
  assert.deepEqual(second.cooking.discounts,{impatient:.8,angry:.5});
});

test('cooking validates quantities, probabilities and finite positive durations', () => {
  const cooking=sanitizeSettings({cooking:{
    quantities:{noodle:[9,2],sushi:[4.9,8.9],pancake:[0,Infinity],tea:'1,3'},
    baseCoins:-1,differenceCoins:NaN,ruinedCoins:0,fine:Infinity,
    shortProbabilities:[-2,2,NaN],discounts:{impatient:2,angry:'0.5'},
    capacity:0,fishPieces:0,cookSeconds:0,readySeconds:-1
  }}).cooking;
  assert.deepEqual(cooking,{
    quantities:{noodle:[2,9],sushi:[4,8],pancake:[1,2],tea:[1,3]},
    baseCoins:15,differenceCoins:3,ruinedCoins:0,fine:10,
    shortProbabilities:[0,1,.7],discounts:{impatient:1,angry:.5},
    capacity:0,fishPieces:8,spoilProbability:.5,spoilFine:10,
    heat:{noodle:{cookSeconds:4,readySeconds:6,smokeSeconds:3},pancake:{cookSeconds:4,readySeconds:6,smokeSeconds:3},tea:{cookSeconds:4,readySeconds:6,smokeSeconds:3}}
  });
  assert.deepEqual(sanitizeSettings({cooking:{shortProbabilities:[Infinity],discounts:{impatient:NaN,angry:-2},cookSeconds:Infinity,readySeconds:NaN}}).cooking,{
    quantities:{noodle:[1,3],sushi:[3,5],pancake:[1,2],tea:[1,3]},
    baseCoins:15,differenceCoins:3,ruinedCoins:0,fine:10,
    shortProbabilities:[.15,.4,.7],discounts:{impatient:.8,angry:0},
    capacity:0,fishPieces:8,spoilProbability:.5,spoilFine:10,
    heat:{noodle:{cookSeconds:4,readySeconds:6,smokeSeconds:3},pancake:{cookSeconds:4,readySeconds:6,smokeSeconds:3},tea:{cookSeconds:4,readySeconds:6,smokeSeconds:3}}
  });
});

test('cooking keeps fixed quantities, zero amounts and large valid settings through storage', () => {
  let saved;
  const store={getItem:key=>{assert.equal(key,KEY_SETTINGS);return saved??null;},setItem:(key,value)=>{assert.equal(key,KEY_SETTINGS);saved=value;}};
  const raw={cooking:{quantities:{noodle:[500003,500003],sushi:[1,1],pancake:[2,2],tea:[5,5]},baseCoins:0,differenceCoins:0,ruinedCoins:6,fine:0,shortProbabilities:[0,.25,1],discounts:{impatient:0,angry:1},capacity:900000,fishPieces:800000,cookSeconds:10000000000,readySeconds:20000000000}};
  assert.equal(saveSettings(store,raw),true);
  assert.deepEqual(loadSettings(store).settings.cooking,{
    quantities:{noodle:[500003,500003],sushi:[1,1],pancake:[2,2],tea:[5,5]},
    baseCoins:0,differenceCoins:0,ruinedCoins:6,fine:0,shortProbabilities:[0,.25,1],discounts:{impatient:0,angry:1},capacity:900000,fishPieces:800000,spoilProbability:.5,spoilFine:10,
    heat:{noodle:{cookSeconds:10000000000,readySeconds:20000000000,smokeSeconds:3},pancake:{cookSeconds:10000000000,readySeconds:20000000000,smokeSeconds:3},tea:{cookSeconds:10000000000,readySeconds:20000000000,smokeSeconds:3}}
  });
});
