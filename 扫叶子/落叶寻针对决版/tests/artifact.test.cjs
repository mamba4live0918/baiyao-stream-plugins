const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.resolve(__dirname,'../../落叶寻针-v0.12-2.5D小样.html');
const html=()=>fs.readFileSync(file,'utf8');

test('prototype HTML is one self-contained file',()=>{
  const h=html();
  assert.equal((h.match(/data:image\/png;base64,/g)||[]).length,1);
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(h));
  // 唯一允许的本机地址是没有菘蓝 SDK 时的礼物通道 ws://localhost:10030
  assert.ok(!/C:\\Users|127\.0\.0\.1|localhost/.test(h.split('ws://localhost:10030').join('')));
  for(const g of ['LeafGifts','LeafEffects','LeafFace','LeafLive','LeafFx','LeafGiftUI','AutumnNeedle'])assert.ok(h.includes(g),g);
  assert.ok(!/\/\*__(KEYSHIM|STYLE|CORE|APP)__\*\/|__LEAF_ATLAS__/.test(h));
});
test('all script blocks parse',()=>{
  const scripts=[...html().matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,3);for(const [,s]of scripts)new vm.Script(s);
});
test('page and canvas stay transparent; key shim runs before the game',()=>{
  const h=html();
  assert.match(h,/html,body\{[^}]*background:transparent/);assert.match(h,/#scene\{[^}]*background:transparent/);assert.match(h,/#fx2d\{[^}]*background:transparent/);
  assert.match(h,/premultipliedAlpha:true/);assert.match(h,/clearColor\(0,0,0,0\)/);
  assert.ok(h.indexOf('__obsKeyShim')>=0&&h.indexOf('__obsKeyShim')<h.indexOf('LeafPile'));
  assert.doesNotMatch(h,/id="preview-background"/);
});
