import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeExtras,labelOk} from '../src/extras.js';
import {onFace} from '../src/ui/movable.js';
import {eventLayout} from '../src/events/scene.js';
import {defaultZone} from '../src/zone.js';

test('屏幕名字：「盲盒」中间夹空格、标点、零宽字符也拦住；正常名字照用',()=>{
 for(const t of ['盲盒','盲 盒','盲·盒','盲-盒','盲'+String.fromCodePoint(0x200b)+'盒','惊喜盲盒!'])assert.equal(labelOk(t),false,t);
 for(const t of ['续命咖啡','早点下班','',undefined])assert.equal(labelOk(t),true,String(t));
 assert.equal(sanitizeExtras({overtimeGifts:[{name:'星星',min:1,max:5,label:'盲·盒'}]}).overtimeGifts[0].label,'','存档里的旧名字也拦');
});

test('加班礼物名：和礼物表一样不分大小写、全半角、空格标点；只有标点的名字不收',()=>{
 const x=sanitizeExtras({overtimeGifts:[{name:'咖啡',min:1},{name:'咖 啡',min:2},{name:'!!!'},{name:'ＣＯＦＦＥＥ'},{name:'coffee'}]});
 assert.deepEqual(x.overtimeGifts.map(g=>g.name),['咖啡','ＣＯＦＦＥＥ']);
});

test('牌子中心压在露脸区里就不让放；露脸区关掉时随便放',()=>{
 const viewport={width:1920,height:1080},zone={enabled:true,pts:defaultZone(16/9).pts};
 const xs=zone.pts.map(p=>p[0]*19.2),ys=zone.pts.map(p=>p[1]*10.8),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 assert.equal(onFace({x:cx-140,y:cy-100,width:280,height:200},zone,viewport),true);
 assert.equal(onFace({x:1620,y:70,width:280,height:223},zone,viewport),false,'默认右上角不算');
 assert.equal(onFace({x:cx-140,y:cy-100,width:280,height:200},{...zone,enabled:false},viewport),false);
 assert.equal(onFace(null,zone,viewport),false);
});

test('奶茶小锅矮：猫往上挪，锅的下面大半还能点到（面锅不变）',()=>{
 const c={x:10,y:805,width:1900,height:270},pot={x:700,y:760,width:120,height:90};
 const tea=eventLayout({width:1920,height:1080,counter:c,tools:{pot},shop:'tea'}).cat;
 const noodle=eventLayout({width:1920,height:1080,counter:c,tools:{pot},shop:'noodle'}).cat;
 assert.ok(pot.y+pot.height-(tea.y+tea.height)>=60,'奶茶锅至少留 60 能点');
 assert.equal(noodle.y,pot.y-115);
});
