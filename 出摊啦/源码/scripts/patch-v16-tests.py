# 出摊啦 V1.6：设置界面测试的假 app 补上「加班记到」和插件自带加班机；V1.5 第③栏测试改写成 V1.6。一次性补丁。
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'tests'
FAKE_OLD = "overtime:{mode:'bridge',"
FAKE_NEW = ("overtime:{mode:'bridge',targetValue:'auto',keyValid:false,local:makeLocal(),"
            "route(){return this.targetValue!=='auto'?this.targetValue:(this.mode==='baiyao'||this.keyValid)?'baiyao':'local';},"
            "target(){return this.targetValue;},setTarget(v){this.targetValue=v;},")
HELPER = ("import '../src/local-overtime.cjs';\n"
          "// V1.6 插件自带的加班机：用真的那份，存在内存里\n"
          "const makeLocal=()=>{const memory=new Map();return globalThis.LocalOvertime.createLocalOvertime({storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},now:()=>0});};\n")

for name in ['v11-settings-ui.test.mjs', 'order-gifts-ui.test.mjs']:
    p = root / name
    s = p.read_text(encoding='utf-8')
    assert s.count(FAKE_OLD) == 1, (name, s.count(FAKE_OLD))
    s = s.replace(FAKE_OLD, FAKE_NEW)
    first_import_end = s.index('\n', s.index("import {SettingsUI}")) + 1
    s = s[:first_import_end] + HELPER + s[first_import_end:]
    p.write_text(s, encoding='utf-8')

p = root / 'v11-settings-ui.test.mjs'
s = p.read_text(encoding='utf-8')
a = s.index("test('V1.5 第③栏：")
b = s.index("});", a) + 3
new_test = """test('V1.6 第③栏：加班机默认自动——白曜外没填码时用插件自带的（倒计时、预设时长、礼物加减表），也能填连接码改用白曜的；在白曜里不用填',async()=>{
 const f=fixture();
 try{
  f.ui.render();const rent=byText(f.ui.root,'section','③ 交租和加班');assert.ok(rent);
  for(const word of ['咩播','端口','联调','今天播多久'])assert.equal(rent.textContent.includes(word),false,word);
  for(const word of ['加班记到','插件自带的加班机','距离下播','预设时长','手动加减','礼物加减时间','白曜加班机'])assert.ok(rent.textContent.includes(word),word);
  assert.ok(labelled(f.ui.root,'加班记到'));
  byText(rent,'button','＋ 添加礼物').onclick();
  change(labelled(f.ui.root,'第 1 行礼物名'),'玫瑰');change(labelled(f.ui.root,'第 1 行最少分钟'),5);change(labelled(f.ui.root,'第 1 行最多分钟'),5);
  assert.deepEqual(f.app.overtime.local.snapshot().gifts,[{name:'玫瑰',mode:'add',min:5,max:5}],'填好就存');
  const key=labelled(f.ui.root,'白曜加班机连接码');assert.ok(key,'自动：白曜外还能填连接码');key.value='abcd2345';
  await byText(f.ui.root,'button','测试连接').onclick({target:{disabled:false}});assert.deepEqual(f.keys,[],'测试连接只试不存');
  byText(f.ui.root,'button','连接').onclick();assert.deepEqual(f.keys,['abcd2345'],'点「连接」才用上');
  f.app.overtime.setTarget('local');f.ui.render();assert.equal(labelled(f.ui.root,'白曜加班机连接码'),undefined,'固定用自带的：不显示连接码');
  f.app.overtime.setTarget('auto');f.app.overtime.mode='baiyao';f.ui.render();
  assert.equal(labelled(f.ui.root,'白曜加班机连接码'),undefined,'在白曜里不用填连接码');
  const inside=byText(f.ui.root,'section','③ 交租和加班');
  assert.ok(inside.textContent.includes('已接上白曜加班机'));assert.equal(inside.textContent.includes('预设时长'),false,'记到白曜时不显示自带加班机');
 }finally{f.restore();}
});"""
s = s[:a] + new_test + s[b:]
p.write_text(s, encoding='utf-8')
print('tests patched')
