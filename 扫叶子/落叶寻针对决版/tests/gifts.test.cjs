const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/gifts.js');
const gift=(name,count=1,extra={})=>({name,count,eventId:null,nickname:'观众',avatar:null,...extra});

test('normalizeName folds full width, case, whitespace and common symbols but keeps other text',()=>{
  const cases=[['  ＡＢＣ玫瑰  ','abc玫瑰'],['Love·You！','loveyou'],['【比心】兔兔～','比心兔兔'],['“暮光”(星辰)','暮光星辰'],['Ｒｏｓｅ－１','rose1'],
    ['加油 鸭','加油鸭'],['加油\u3000鸭','加油鸭'],['一束：花开；','一束花开'],['‘摸摸’头？','摸摸头'],['🌹玫瑰2','🌹玫瑰2'],['a+b#','a+b#'],['！！','']];
  for(const [raw,want]of cases)assert.equal(G.normalizeName(raw),want,raw);
  assert.equal(G.normalizeName(null),'');assert.equal(G.normalizeName(undefined),'');assert.equal(G.normalizeName(520),'520');
});

test('parseGift reads Songlan SDK callbacks that carry no type',()=>{
  assert.deepEqual(G.parseGift({giftName:'玫瑰',count:3,nickname:'小明',avatar:'https://a.cn/b.png',eventId:'e1'}),gift('玫瑰',3,{eventId:'e1',nickname:'小明',avatar:'https://a.cn/b.png'}));
  assert.deepEqual(G.parseGift({gift:{name:'加油鸭',count:2},user:{nickname:'阿花',avatar:'http://x.cn/y.jpg'},msgId:'m2'}),gift('加油鸭',2,{eventId:'m2',nickname:'阿花',avatar:'http://x.cn/y.jpg'}));
  assert.deepEqual(G.parseGift({gift:{giftName:'鲜花',avatar:'https://g.cn/i.png'},userName:'u1',comboCount:5}),gift('鲜花',5,{nickname:'u1',avatar:'https://g.cn/i.png'}));
  assert.deepEqual(G.parseGift({name:'抖音'}),gift('抖音'));
  assert.deepEqual(G.parseGift({giftName:520}),gift('520'),'numeric gift names become text');
});

test('parseGift reads WebSocket messages: JSON text, typed envelopes and nested data',()=>{
  assert.deepEqual(G.parseGift(JSON.stringify({type:'gift',giftName:' 玫瑰 ',giftCount:'4',id:77})),gift('玫瑰',4,{eventId:'77'}));
  assert.deepEqual(G.parseGift({type:'WebcastGiftMessage',data:{giftName:'棒棒糖',repeatCount:2,user:{nickName:'糖糖'}},msgId:'w1'}),gift('棒棒糖',2,{eventId:'w1',nickname:'糖糖'}));
  assert.deepEqual(G.parseGift({type:'礼物',data:JSON.stringify({gift:{name:'摸摸头'},count:6,eventId:'d1'})}),gift('摸摸头',6,{eventId:'d1'}));
  assert.deepEqual(G.parseGift({type:5,data:{giftName:'一束花开'}}),gift('一束花开'));
  assert.deepEqual(G.parseGift({type:'2',giftName:'鲜花'}),gift('鲜花'));
  assert.deepEqual(G.parseGift({data:{type:'gift',giftName:'珍爱玫瑰'}}),gift('珍爱玫瑰'),'type falls back to data.type');
  assert.deepEqual(G.parseGift({type:'gift',giftName:'玫瑰',data:'  '}),gift('玫瑰'),'blank data is ignored');
  assert.deepEqual(G.parseGift({type:'gift',giftName:'玫瑰',data:'[1,2]'}),gift('玫瑰'),'non-object data is ignored');
});

test('parseGift lets non-null data fields win, keeps the outer type and only trusts the outer bare id',()=>{
  assert.deepEqual(G.parseGift({type:'gift',giftName:'外层',count:2,data:{giftName:'内层',count:null}}),gift('内层',2));
  assert.deepEqual(G.parseGift({type:'gift',data:{type:'combo',giftName:'玫瑰'}}),gift('玫瑰'));
  assert.equal(G.parseGift({type:'chat',data:{type:'gift',giftName:'玫瑰'}}),null);
  assert.equal(G.parseGift({type:'gift',data:{id:123,giftName:'玫瑰'}}).eventId,null);
  assert.equal(G.parseGift({type:'gift',id:'top-1',data:{id:9,giftName:'玫瑰'}}).eventId,'top-1');
  assert.equal(G.parseGift({type:'gift',data:{eventId:'in-1',giftName:'玫瑰'}}).eventId,'in-1');
  assert.equal(G.parseGift({giftName:'玫瑰',eventId:'E',msgId:'M',id:'I'}).eventId,'E');
  assert.equal(G.parseGift({giftName:'玫瑰',msgId:' 7300000000000000001 '}).eventId,'7300000000000000001');
  assert.equal(G.parseGift({giftName:'玫瑰',id:2**53+2}).eventId,null,'ids JSON may already have rounded are not trusted');
});

test('parseGift rejects non-gifts and broken messages',()=>{
  for(const m of [null,undefined,42,'not json','[1,2]',[{giftName:'玫瑰'}],{},{type:'gift'},{type:'gift',giftName:'   '},{type:'like',giftName:'玫瑰'},
    {type:'chat',content:'hi',name:'小明'},{type:'gift',giftName:'玫瑰',data:'{bad json'},{type:0,giftName:'玫瑰'}])
    assert.equal(G.parseGift(m),null,JSON.stringify(m));
});

test('parseGift accepts counts 1–100000 and rejects the whole message on an invalid first count',()=>{
  const c=v=>{const g=G.parseGift({giftName:'玫瑰',count:v});return g&&g.count;};
  assert.deepEqual([c('12'),c(' 7 '),c(1),c(100000),c(undefined),c(null),c('  ')],[12,7,1,100000,1,1,1]);
  for(const bad of [0,-1,1.5,'1.5','1e3','abc','-3',100001,NaN,Infinity,true,{}])assert.equal(c(bad),null,String(bad));
  assert.equal(G.parseGift({giftName:'玫瑰',count:'',giftCount:3}).count,3,'blank counts fall through');
  assert.equal(G.parseGift({giftName:'玫瑰',count:0,giftCount:3}),null,'the first present count decides');
  assert.equal(G.parseGift({giftName:'玫瑰',gift:{count:9}}).count,9);
  assert.equal(G.MAX_COUNT,100000);
});

test('nicknames are trimmed, picked in order, truncated to 24 characters and default to 观众',()=>{
  const nick=m=>G.parseGift({giftName:'玫瑰',...m}).nickname;
  assert.equal(nick({}),'观众');assert.equal(nick({nickname:'   '}),'观众');assert.equal(nick({nickname:'  小明  '}),'小明');
  assert.equal(nick({nickname:'甲',nickName:'乙',userName:'丙',user:{nickname:'丁'}}),'甲');
  assert.equal(nick({userName:'丙',user:{nickname:'丁',name:'戊'}}),'丙');
  assert.equal(nick({user:{nickName:'己',name:'戊'}}),'己');assert.equal(nick({user:{name:'戊'}}),'戊');
  assert.equal(nick({nickname:12345}),'12345');
  assert.equal(nick({nickname:'一二三四五六七八九十'.repeat(3)}),'一二三四五六七八九十'.repeat(2)+'一二三四');
  const emoji=nick({nickname:'😀'.repeat(30)});assert.equal(Array.from(emoji).length,24);assert.equal(emoji,'😀'.repeat(24),'no broken surrogate pairs');
});

test('avatars accept only http(s) and data:image URLs, falling through to the next candidate',()=>{
  const ava=m=>G.parseGift({giftName:'玫瑰',...m}).avatar;
  for(const ok of ['https://p.cn/a.png','http://p.cn/a.png','HTTPS://P.CN/A.PNG','data:image/png;base64,AAAA'])assert.equal(ava({avatar:ok}),ok);
  assert.equal(ava({avatar:' https://p.cn/a.png '}),'https://p.cn/a.png');
  for(const bad of ['javascript:alert(1)','data:text/html,<b>x</b>','//cdn.cn/a.png','ftp://p.cn/a.png','file:///C:/a.png','blob:https://p.cn/1',{url:'https://p.cn'},'']) assert.equal(ava({avatar:bad}),null,String(bad));
  assert.equal(ava({user:{avatar:'javascript:x'},avatar:'https://ok.cn/a.png'}),'https://ok.cn/a.png');
  assert.equal(ava({user:{avatarUrl:'https://u.cn/a.png'},gift:{name:'玫瑰',avatar:'https://g.cn/a.png'}}),'https://u.cn/a.png');
  assert.equal(ava({avatarUrl:'https://m.cn/a.png',user:{avatarUrl:'https://u.cn/a.png'}}),'https://m.cn/a.png');
});

test('parseLike reads typed likes, untyped SDK likes and nameless numeric-type messages',()=>{
  const like=(count,extra={})=>({count,eventId:null,nickname:'观众',avatar:null,...extra});
  assert.deepEqual(G.parseLike({type:'like',count:15,nickname:'点点',msgId:'k1'}),like(15,{nickname:'点点',eventId:'k1'}));
  assert.deepEqual(G.parseLike({type:'WebcastLikeMessage',data:{likeCount:'30'}}),like(30));
  assert.deepEqual(G.parseLike(JSON.stringify({type:'点赞'})),like(1),'typed likes without a count count as 1');
  assert.deepEqual(G.parseLike({count:20,user:{nickname:'阿赞',avatar:'https://a.cn/z.png'}}),like(20,{nickname:'阿赞',avatar:'https://a.cn/z.png'}));
  assert.deepEqual(G.parseLike({likeCount:8}),like(8));
  assert.deepEqual(G.parseLike({type:'like',giftName:'玫瑰',count:3}),like(3),'an explicit like type wins over a gift name');
  assert.deepEqual(G.parseLike({type:5,data:{count:4}}),like(4));
});

test('parseLike ignores gifts, comments, online counts and invalid counts',()=>{
  for(const m of [{type:'gift',giftName:'玫瑰',count:3},{type:'comment',count:3},{type:'online',count:300},{count:3,giftName:'玫瑰'},{count:3,gift:{name:'玫瑰'}},
    {nickname:'只有昵称'},{type:'like',count:0},{type:'like',count:'1.5'},{type:'like',likeCount:100001},'garbage',null])
    assert.equal(G.parseLike(m),null,JSON.stringify(m));
  assert.equal(G.parseGift({type:'like',count:5}),null);
});

test('Dedupe remembers ids for the window measured from the first sighting',()=>{
  const d=new G.Dedupe({windowMs:1000});
  assert.equal(d.seen('a',0),false);assert.equal(d.seen('a',999),true);
  assert.equal(d.seen('a',1000),false,'expired at exactly the window, then recorded again');
  assert.equal(d.seen('a',1999),true);assert.equal(d.seen('a',2000),false);
  assert.equal(d.seen(42,3000),false);assert.equal(d.seen('42',3001),true,'numeric and text ids are the same event');
  for(const none of [null,undefined,'',1.5,NaN,{},[]])assert.equal(d.seen(none,3002),false);
  assert.equal(d.seen('b',3003),false);assert.equal(d.seen('b',3004),true);
});

test('Dedupe keeps at most cap ids, evicting the oldest, and falls back to sane options',()=>{
  const d=new G.Dedupe({cap:3});
  for(const [id,t]of [['a',1],['b',2],['c',3],['d',4]])assert.equal(d.seen(id,t),false);
  assert.equal(d.seen('a',5),false,'a was evicted');assert.equal(d.seen('c',6),true);assert.equal(d.seen('d',6),true);assert.equal(d.seen('b',6),false);
  assert.equal(d.ids.size,3);
  const def=new G.Dedupe(),bad=new G.Dedupe({windowMs:-1,cap:2.5});
  assert.deepEqual([def.windowMs,def.cap,bad.windowMs,bad.cap],[60000,500,60000,500]);
});

test('Dedupe survives a JSON round trip and fromJSON tolerates junk',()=>{
  const d=new G.Dedupe();d.seen('x',1000);d.seen(7,2000);
  const text=JSON.stringify(d);assert.equal(text,'[["x",1000],["7",2000]]');
  const r=G.Dedupe.fromJSON(JSON.parse(text));
  assert.equal(r.seen(7,2500),true);assert.equal(r.seen('x',3000),true);assert.equal(r.seen('x',61000),false,'restored ids still expire');
  assert.deepEqual(G.Dedupe.fromJSON('nope').toJSON(),[]);
  assert.deepEqual(G.Dedupe.fromJSON([['a',1],['',2],[null,3],['b','x'],'c',[5,4]]).toJSON(),[['a',1],['5',4]]);
  assert.deepEqual(G.Dedupe.fromJSON([['a',3],['b',1],['c',2]],{cap:2}).toJSON(),[['c',2],['a',3]],'keeps the newest when over cap');
  assert.equal(G.Dedupe.fromJSON([['a',0]],{windowMs:10}).seen('a',10),false);
});

test('matchRule compares normalised names and returns the first hit',()=>{
  const rules=[{gift:'玫瑰',effect:'drift'},{gift:'Ｌｏｖｅ 你！',effect:'sun'},{gift:'',effect:'frost'},null,'junk',{gift:520,effect:'time'},{gift:'玫瑰',effect:'gust'}];
  assert.equal(G.matchRule(rules,' 玫瑰 '),rules[0]);
  assert.equal(G.matchRule(rules,'love你'),rules[1]);assert.equal(G.matchRule(rules,'LOVE·你'),rules[1]);
  assert.equal(G.matchRule(rules,'520'),rules[5]);assert.equal(G.matchRule(rules,520),rules[5]);
  for(const miss of ['','！！','不存在',null])assert.equal(G.matchRule(rules,miss),null,String(miss));
  assert.equal(G.matchRule(null,'玫瑰'),null);assert.equal(G.matchRule('玫瑰','玫瑰'),null);
});

test('duplicateNames lists normalised names bound more than once, ignoring blanks',()=>{
  const rules=[{gift:'玫瑰'},{gift:' 玫瑰！'},{gift:'ＡＢ'},{gift:'ab'},{gift:'鲜花'},{gift:''},{gift:''},{gift:'  '},{gift:'！'},null,{}];
  assert.deepEqual(G.duplicateNames(rules),['玫瑰','ab']);
  assert.deepEqual(G.duplicateNames([{gift:'玫瑰'},{gift:'鲜花'}]),[]);assert.deepEqual(G.duplicateNames('x'),[]);
});

test('LikeCounter fires once per full step and keeps the remainder',()=>{
  const c=new G.LikeCounter();
  assert.equal(c.add(999,1000),0);assert.deepEqual(c.toJSON(),{total:999,carry:999});
  assert.equal(c.add(1,1000),1);assert.deepEqual(c.toJSON(),{total:1000,carry:0});
  assert.equal(c.add(2500,1000),2);assert.deepEqual(c.toJSON(),{total:3500,carry:500});
  assert.equal(c.add(1700,1000),2);assert.deepEqual(c.toJSON(),{total:5200,carry:200});
  assert.equal(c.add(0,1000),0);
});

test('LikeCounter ignores bad counts and only totals likes while the step is invalid',()=>{
  const c=new G.LikeCounter({total:10,carry:5});
  for(const n of [-5,1.5,'10',NaN,null])assert.equal(c.add(n,100),0);
  assert.deepEqual(c.toJSON(),{total:10,carry:5});
  for(const step of [0,-1,'100',2.5,undefined])assert.equal(c.add(100,step),0);
  assert.deepEqual(c.toJSON(),{total:510,carry:5},'carry untouched, so a later valid step does not burst');
  assert.equal(c.add(95,100),1);assert.deepEqual(c.toJSON(),{total:605,carry:0});
});

test('LikeCounter survives a JSON round trip and repairs junk',()=>{
  const c=new G.LikeCounter();c.add(2345,1000);
  const back=G.LikeCounter.fromJSON(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(back.toJSON(),{total:2345,carry:345});assert.equal(back.add(655,1000),1);
  assert.deepEqual(G.LikeCounter.fromJSON(null).toJSON(),{total:0,carry:0});
  assert.deepEqual(G.LikeCounter.fromJSON({total:-1,carry:'5'}).toJSON(),{total:0,carry:0});
});
