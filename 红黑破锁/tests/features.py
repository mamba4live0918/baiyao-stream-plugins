"""红黑破锁回归：锁多久按礼物规则设置（加几层 + 每层连点几次）、锁链固定完整外观 + 特效、清空锁链、自定义音效、左右锁链一致、V1.3/V1.4 存档迁移。"""
from pathlib import Path
from tempfile import TemporaryDirectory
import io
import json
import math
import os
import struct
import wave
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def tone(path, seconds=0.2):
    rate = 22050
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(rate)
        out.writeframes(b''.join(struct.pack('<h', int(9000 * math.sin(i * 2 * math.pi * 660 / rate))) for i in range(int(rate * seconds))))


def tap(page, times=1):
    for _ in range(times):
        page.keyboard.down('Space'); page.wait_for_timeout(40); page.keyboard.up('Space'); page.wait_for_timeout(45)


def open_settings(page):
    page.locator('#arena').dblclick(position={'x': 200, 'y': 200})
    page.locator('#settings').wait_for()
    page.evaluate("window.LockMenu?.activate('gifts')")


def close_settings(page):
    page.locator('#settings-close').click()


def rule_row(page, index):
    return page.locator('#rules .rule-row').nth(index)


def edit(field, value):
    field.fill(str(value)); field.dispatch_event('change'); field.page.wait_for_timeout(30)


with TemporaryDirectory() as tmp, sync_playwright() as p:
    tmp = Path(tmp)
    good, bad, big = tmp / '咔嚓.wav', tmp / 'broken.wav', tmp / 'huge.wav'
    tone(good); bad.write_bytes(b'not really audio' * 50); tone(big, seconds=80)
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    context.add_init_script('''(()=>{window.__played=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.__played++;return start.apply(this,a);};window.SonglanPlugin={onGift(cb){window.__gift=cb}};})()''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('typeof window.__gift === "function"')

    # 1. 没有档位：锁多久直接在礼物规则里设（每份加几层 + 每层连点几次）
    open_settings(page)
    check(page.locator('#tiers,#add-tier,#simulate-tier').count() == 0, 'tier UI still present')
    r0 = rule_row(page, 0)
    check(r0.locator('.rule-target-range').is_visible() and r0.locator('.rule-value-min').input_value() == '1' and r0.locator('.rule-target-min').input_value() == '60', 'default lock rule fields wrong')
    check(rule_row(page, 3).locator('.rule-value-range').is_visible() and rule_row(page, 3).locator('.rule-target-range').is_hidden(), 'relief rule fields wrong')
    ui_v2.set_range(r0,'value',2)
    for wrong in (0, 100000, 1.5):
        edit(rule_row(page, 0).locator('.rule-target-max'), wrong)
        check(json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))[0]['targetMax'] == 60, f'invalid taps per layer accepted: {wrong}')
        check('未保存' in rule_row(page,0).locator('.rule-save-status').inner_text(), 'invalid range has no feedback')
    ui_v2.set_range(rule_row(page,0),'target',1)
    rules = json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))
    check(all(rules[0].get(k)==v for k,v in {'name': '小心心', 'kind': 'lock', 'value': 2, 'target': 1, 'valueMax':2,'targetMax':1}.items()), f'rule not saved: {rules[0]}')
    close_settings(page)
    page.evaluate("window.__gift({giftName:'小心心',count:2,eventId:'g1'})")
    check(page.locator('#typing-lock-layers').inner_text() == '×4', 'gift count did not multiply layers')
    check(page.locator('#typing-lock-progress').inner_text() == '0 / 1', 'rule taps-per-layer not used')
    check(page.locator('#typing-lock-grade').inner_text() == '小心心', 'gift name not shown')
    check(page.locator('#typing-lock-overlay').get_attribute('data-tier') == 'legendary', 'lock glow not kept at the strongest level')
    check(page.locator('.chain-arm').count() == 4 and page.locator('.lock-tier-strand').count() == 0, 'chains must be the original whole art, no overlaid strand pieces')
    thick = page.evaluate("parseFloat(getComputedStyle(document.getElementById('typing-lock-overlay')).getPropertyValue('--lock-thickness'))")
    check(thick >= 40, f'chains too thin to show link details at 1280x800: {thick}')
    tap(page)
    check(page.locator('#typing-lock-layers').inner_text() == '×3', 'one tap did not clear a 1-tap layer')
    check(page.evaluate("document.getElementById('lock-fx').childElementCount") > 0, 'no break effect spawned')

    # 2. 改规则只影响之后的礼物；不同礼物的锁按到达顺序、各用各的次数
    open_settings(page)
    ui_v2.set_range(rule_row(page,0),'target',50)
    close_settings(page)
    check(page.locator('#typing-lock-progress').inner_text() == '0 / 1', 'queued lock changed after rule edit')
    page.evaluate("window.__gift({giftName:'玫瑰',count:1,eventId:'g2'})")
    check(page.locator('#typing-lock-layers').inner_text() == '×4', 'second gift not queued')
    tap(page, 3)
    check(page.locator('#typing-lock-layers').inner_text() == '×1' and page.locator('#typing-lock-progress').inner_text() == '0 / 120', 'next gift batch not promoted with its own taps: '+page.locator('#typing-lock-progress').inner_text())
    check(page.locator('#typing-lock-grade').inner_text() == '玫瑰', 'next gift name not shown')
    open_settings(page)
    # 3. 清空：点一次只提示，两次才清空；3 秒后自动取消
    page.locator('#clear-locks').click()
    check(page.locator('#typing-lock-overlay').is_visible() and page.locator('#clear-locks').inner_text() == '再点一次确认清空（1 层）', 'first click cleared or not armed: '+page.locator('#clear-locks').inner_text())
    page.wait_for_timeout(3200)
    check(page.locator('#clear-locks').inner_text() == '清空全部锁链', 'clear did not disarm')
    page.locator('#clear-locks').dblclick()
    page.wait_for_timeout(300)
    check(page.locator('#typing-lock-overlay').is_visible(), 'double-click bypassed clear confirmation')
    page.wait_for_timeout(200)
    page.locator('#clear-locks').click()
    page.locator('#typing-lock-overlay').wait_for(state='hidden', timeout=2000)
    saved_state = json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))
    check(saved_state['lock'] is None, 'clear not saved')

    # 4. 自定义音效：解码并保存后才替换，坏文件和超限文件不覆盖
    lock_row = page.locator('#sounds .sound-row[data-sound="lock"]')
    lock_row.locator('input[type=file]').set_input_files(str(good))
    page.wait_for_function("document.querySelector('#sounds .sound-row[data-sound=lock] .sound-note').textContent.includes('咔嚓.wav')", timeout=5000)
    check(lock_row.locator('button[data-value="custom"]').get_attribute('aria-pressed') == 'true', 'custom mode not selected after upload')
    page.locator('#sounds .sound-row[data-sound="lock"] input[type=file]').set_input_files(str(bad))
    page.wait_for_timeout(600)
    check('咔嚓.wav' in page.locator('#sounds .sound-row[data-sound="lock"] .sound-note').inner_text(), 'broken audio replaced custom sound')
    page.locator('#sounds .sound-row[data-sound="lock"] input[type=file]').set_input_files(str(big))
    page.wait_for_timeout(300)
    check('3 MB' in page.locator('#toast').inner_text(), 'oversize audio not rejected')
    page.locator('#sounds .sound-row[data-sound="hit"] button[data-value="off"]').click()
    before = page.evaluate('window.__played')
    page.locator('#simulate-lock').click()
    check(page.evaluate('window.__played') == before + 1, 'custom lock sound did not play')
    page.reload()
    page.wait_for_function("document.querySelector('#sounds .sound-row[data-sound=lock] .sound-note').textContent.includes('咔嚓.wav')", timeout=5000)
    s = json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:settings')"))['sound']
    check(s['events']['lock']['mode'] == 'custom' and s['events']['hit']['mode'] == 'off', f'sound settings not restored: {s}')
    open_settings(page)
    page.locator('#sounds .sound-row[data-sound="lock"] button', has_text='移除').click()
    page.wait_for_timeout(300)
    check(page.locator('#sounds .sound-row[data-sound="lock"] button[data-value="default"]').get_attribute('aria-pressed') == 'true', 'remove did not restore default')
    check(not errors, f'page errors: {errors}')
    context.close()

    # QA 回归：换主题后改音效仍保存；双击 × 只删一条；编辑后紧接着点同一行按钮不丢；长礼物名不溢出
    qa = browser.new_context(viewport={'width': 1280, 'height': 800})
    qa.add_init_script("window.SonglanPlugin={onGift(cb){window.__gift=cb}};")
    qp = qa.new_page()
    qp.goto(URL)
    open_settings(qp)
    qp.locator('#theme button[data-value="cyber"]').click()
    qp.locator('#sounds .sound-row[data-sound="hit"] button[data-value="off"]').click()
    qp.locator('#lock-key button[data-value="KeyF"]').click()
    slider = qp.locator('#sounds .sound-row[data-sound="layer"] input[type=range]')
    slider.evaluate("e=>{e.value='20';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'))}")
    snd = json.loads(qp.evaluate("localStorage.getItem('red-black-lock-v1:settings')"))['sound']['events']
    check(snd['hit']['mode'] == 'off' and snd['layer']['volume'] == 20, f'sound edits lost after theme/key change: {snd}')
    rule_row(qp, 0).locator('.rule-delete').dblclick()
    qp.wait_for_timeout(50)
    check(qp.locator('#rules .rule-row').count() == 3, 'double-click deleted more than one rule')
    edit(rule_row(qp,0).locator('.rule-target-min'),7)
    target = rule_row(qp, 0).locator('.rule-target-max')
    target.fill('7')
    relief_btn = rule_row(qp, 0).locator('button[data-value="relief"]')
    relief_btn.scroll_into_view_if_needed()
    box = relief_btn.bounding_box()
    qp.mouse.move(box['x'] + 5, box['y'] + 5); qp.mouse.down(); qp.wait_for_timeout(90); qp.mouse.up()
    r0 = json.loads(qp.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))[0]
    check(r0['kind'] == 'relief' and r0['target'] == 7, f'click after edit lost: {r0}')
    long_name = '超长的礼物名称用来测试面板会不会被撑破溢出到锁链上面去'
    edit(rule_row(qp, 0).locator('input').first, long_name)
    rule_row(qp, 0).locator('button[data-value="lock"]').click()
    close_settings(qp)
    qp.evaluate("window.__gift({giftName:'" + long_name + "',count:1,eventId:'q1'})")
    check(qp.locator('#typing-lock-progress').inner_text() == '0 / 7', 'renamed rule did not lock with its taps')
    grade = qp.evaluate("(()=>{const g=document.getElementById('typing-lock-grade').getBoundingClientRect(),p=document.querySelector('.lock-info').getBoundingClientRect();return [g.left>=p.left-1,g.right<=p.right+1]})()")
    check(grade == [True, True], f'long gift name overflows panel: {grade}')
    qa.close()

    # 5. 存档迁移：V1.3 三档难度、V1.4 自定义档位 → 每条规则自带次数；旧锁链照常保留，外观统一
    legacy = browser.new_context(viewport={'width': 1280, 'height': 800})
    legacy.add_init_script('''if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');
      localStorage.setItem('red-black-lock-v1:settings',JSON.stringify({theme:'cyber',key:'Space',motion:'off',targets:{normal:7,rare:8,legendary:9}}));
      localStorage.setItem('red-black-lock-v1:rules',JSON.stringify([{name:'小心心',kind:'lock',tier:'normal',value:1},{name:'玫瑰',kind:'lock',tier:'rare',value:2},{name:'嘉年华',kind:'lock',tier:'legendary',value:1},{name:'钥匙',kind:'relief',tier:'normal',value:30}]));
      localStorage.setItem('red-black-lock-v1:state',JSON.stringify({version:1,cleared:4,lock:{layers:2,target:8,key:'Space',tier:'rare',progress:0,relief:0,updatedAt:Date.now(),lastHitAt:Date.now(),queue:[{layers:2,target:8,key:'Space',tier:'rare',source:'玫瑰'}]}}));}''')
    old = legacy.new_page()
    old.goto(URL)
    check(old.locator('#typing-lock-grade').inner_text() == '稀有' and old.locator('#typing-lock-layers').inner_text() == '×2' and old.locator('#typing-lock-progress').inner_text() == '0 / 8', 'V1.3 lock not restored')
    check(old.locator('#typing-lock-overlay').get_attribute('data-tier') == 'legendary', 'legacy lock not shown with the full look')
    saved = json.loads(old.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))
    check(all('tier' in rule and 'target' not in rule for rule in saved), f'restore overwrote legacy rules without an explicit save: {saved}')
    open_settings(old)
    check([old.locator('#rules .rule-row').nth(index).locator('.rule-target-min').input_value() for index in range(3)] == ['7','8','9'], 'V1.3 runtime ranges did not preserve legacy targets')
    old.locator('#rules .rule-row').first.locator('.rule-test').click()
    check(json.loads(old.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['lock']['queue'][-1]['target'] == 7, 'V1.3 migrated rule test did not use its target')
    legacy.close()
    v14 = browser.new_context(viewport={'width': 1280, 'height': 800})
    v14.add_init_script('''if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');
      localStorage.setItem('red-black-lock-v1:settings',JSON.stringify({theme:'horror',key:'Space',motion:'on',tiers:[{id:'tabc',name:'小锁',target:3,look:'legendary'}],sound:{master:50}}));
      localStorage.setItem('red-black-lock-v1:rules',JSON.stringify([{name:'棒棒糖',kind:'lock',tier:'tabc',value:2}]));}''')
    pg14 = v14.new_page()
    pg14.goto(URL)
    open_settings(pg14)
    pg14.locator('#theme button[data-value="pixel"]').click()  # 保存新格式设置（不再含档位）
    pg14.reload()
    saved = json.loads(pg14.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))
    check(saved == [{'name': '棒棒糖', 'kind': 'lock', 'tier': 'tabc', 'value': 2}], f'V1.4 legacy record was overwritten without a rule save: {saved}')
    open_settings(pg14)
    check(pg14.locator('#rules .rule-row').first.locator('.rule-target-min').input_value() == '3', 'Saving a theme lost the legacy target context before reload')
    check(json.loads(pg14.evaluate("localStorage.getItem('red-black-lock-v1:settings')"))['sound']['master'] == 50, 'V1.4 sound settings lost')
    v14.close()

    # 特效：动画关闭时不生成任何特效节点；开启时高频连点节点数有上限
    fxc = browser.new_context(viewport={'width': 1280, 'height': 720})
    fp = fxc.new_page()
    fp.goto(URL)
    open_settings(fp)
    fp.locator('#motion button[data-value="off"]').click()
    fp.locator('#simulate-target').fill('2'); fp.locator('#simulate-layers').fill('50'); fp.locator('#simulate-lock').click()
    close_settings(fp)
    tap(fp, 4)
    check(fp.evaluate("document.getElementById('lock-fx').childElementCount") == 0, 'effects spawned with motion off')
    open_settings(fp)
    fp.locator('#motion button[data-value="on"]').click()
    close_settings(fp)
    peak = fp.evaluate('''()=>new Promise(res=>{let peak=0;const ev=t=>document.dispatchEvent(new KeyboardEvent(t,{key:' ',code:'Space',keyCode:32,bubbles:true}));
      const tm=setInterval(()=>{ev('keydown');setTimeout(()=>ev('keyup'),25);peak=Math.max(peak,document.getElementById('lock-fx').childElementCount);},55);
      setTimeout(()=>{clearInterval(tm);res(peak);},2500);})''')
    check(0 < peak <= 90, f'effect node count out of range: {peak}')
    fxc.close()

    # 6. V2 四角锁链连接到锁头真实可见像素；不再固定旧中心 X 形变换矩阵。
    view = browser.new_page(viewport={'width': 1280, 'height': 720})
    view.goto(URL)
    view.locator('#quick-lock').evaluate('b=>b.click()')
    view.wait_for_function("[...document.querySelectorAll('.chain-arm')].every(arm=>arm.dataset.endX&&arm.dataset.endY)")
    edges = view.evaluate('''async()=>{
      const overlay=document.getElementById('typing-lock-overlay'),art=document.querySelector('.lock-art');
      const url=getComputedStyle(document.querySelector('.lock-shackle')).backgroundImage.match(/^url\\(["']?(.*?)["']?\\)$/)[1];
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const rect=art.getBoundingClientRect(),area=overlay.getBoundingClientRect(),scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
      const left=rect.left+(rect.width-image.naturalWidth*scale)/2,top=rect.top+(rect.height-image.naturalHeight*scale)/2;
      return [...document.querySelectorAll('.chain-arm')].map(arm=>{
        const px=Math.round((Number(arm.dataset.endX)+area.left-left)/scale),py=Math.round((Number(arm.dataset.endY)+area.top-top)/scale);
        let alpha=0;
        for(let y=Math.max(0,py-3);y<Math.min(canvas.height,py+4);y++)for(let x=Math.max(0,px-3);x<Math.min(canvas.width,px+4);x++)alpha=Math.max(alpha,ctx.getImageData(x,y,1,1).data[3]);
        return {alpha,x:Number(arm.dataset.endX),y:Number(arm.dataset.endY)};
      });
    }''')
    check(len(edges) == 4 and all(edge['alpha'] > 8 for edge in edges), f'chain endpoints missed visible lock pixels: {edges}')
    browser.close()
    browser.close()
print('PASS V1.6: rule-based lock length (layers x taps, validation, queued snapshot, FIFO), original whole chain art + effects (motion off = none, node cap), clear with confirm, custom sounds, V1.3/V1.4 migration, QA regressions, mirrored chains')
