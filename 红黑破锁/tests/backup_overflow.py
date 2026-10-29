"""V1.7 回归：超过 2 万层的礼物排队不丢；设置导出/导入（含自定义音效，先预览后生效）。"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import os
import struct
import wave
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()
SDK = "window.SonglanPlugin={onGift(cb){window.__gift=cb}};"


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def state(page):
    return json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))


def open_settings(page):
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    page.locator('#settings').wait_for()
    page.evaluate("window.LockMenu?.activate('gifts')")


with TemporaryDirectory() as tmp, sync_playwright() as p:
    tmp = Path(tmp)
    tone = tmp / '叮.wav'
    with wave.open(str(tone), 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(22050)
        out.writeframes(b''.join(struct.pack('<h', int(9000 * math.sin(i * 0.19))) for i in range(4400)))
    browser = p.chromium.launch(headless=True)

    # 1. 超上限：先加满 2 万层，多出的排队；减链会继续扣补进来的锁；刷新保留；清空连排队的一起清
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    ctx.add_init_script(SDK)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function('typeof window.__gift === "function"')
    page.evaluate("__gift({giftName:'小心心',count:15000,eventId:'a'})")
    page.evaluate("__gift({giftName:'玫瑰',count:8000,eventId:'b'})")
    s = state(page)
    check(page.locator('#typing-lock-layers').inner_text() == '×23,000', 'total including waiting not shown')
    check(s['lock']['layers'] == 20000 and s['waiting'] == [{'layers': 3000, 'target': 120, 'key': 'Space', 'source': '玫瑰', 'tierName': '玫瑰', 'multiplier': 1, 'challengeMode': 'bar'}], f'overflow not queued: {s["waiting"]}')
    page.evaluate("__gift({giftName:'嘉年华',count:1,eventId:'c'})")
    check(state(page)['waiting'][-1]['source'] == '嘉年华', 'later gift jumped ahead of waiting ones')
    page.evaluate("__gift({giftName:'破锁钥匙',count:20000,eventId:'d'})")  # 1,200,000 点
    s = state(page)
    check(s['waiting'] == [] and s['lock']['layers'] == 5501, f'relief did not continue into poured layers: {s["lock"] and s["lock"]["layers"]} {s["waiting"]}')
    page.reload()
    check(page.locator('#typing-lock-layers').inner_text() == '×5,501', 'overflow state not restored')
    open_settings(page)
    page.locator('#clear-locks').click()
    check('5,501 层' in page.locator('#clear-locks').inner_text(), 'clear label missing total')
    page.wait_for_timeout(450)
    page.locator('#clear-locks').click()
    s = state(page)
    check(s['lock'] is None and s['waiting'] == [], 'clear left waiting layers')
    # 打满上限后连点，破一层就从排队里补一层
    page.locator('#simulate-target').fill('1'); page.locator('#simulate-layers').fill('20003'); page.locator('#simulate-lock').click()
    page.locator('#settings-close').click()
    check(state(page)['lock']['layers'] == 20000 and state(page)['waiting'][0]['layers'] == 3, 'simulate overflow wrong')
    for _ in range(2):
        page.keyboard.down('Space'); page.wait_for_timeout(40); page.keyboard.up('Space'); page.wait_for_timeout(50)
    s = state(page)
    check(s['lock']['layers'] == 20000 and s['waiting'][0]['layers'] == 1, f'taps did not pour waiting layers: {s["lock"]["layers"]} {s["waiting"]}')
    check(not errors, f'page errors: {errors}')
    ctx.close()

    # 2. 导出：在 A 配好主题、按键、规则、音效
    a = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    pa = a.new_page()
    pa.goto(URL)
    open_settings(pa)
    pa.locator('#theme button[data-value="cream"]').click()
    pa.locator('#lock-key button[data-value="KeyJ"]').click()
    first = pa.locator('#rules .rule-row').first
    first.locator('input').first.fill('棒棒糖'); first.locator('input').first.dispatch_event('change')
    ui_v2.set_range(first,'target',33)
    pa.locator('#sounds .sound-row[data-sound="clear"] input[type=file]').set_input_files(str(tone))
    pa.wait_for_function("document.querySelector('#sounds .sound-row[data-sound=clear] .sound-note').textContent.includes('叮.wav')")
    pa.locator('#sounds .sound-row[data-sound="hit"] button[data-value="off"]').click()
    with pa.expect_download() as info:
        pa.locator('#export-settings').click()
    backup = tmp / info.value.suggested_filename
    info.value.save_as(backup)
    data = json.loads(backup.read_text(encoding='utf-8'))
    check(backup.name.startswith('红黑破锁设置-') and data['app'] == 'red-black-lock' and 'clear' in data['sounds'], f'export content wrong: {backup.name} {list(data)}')
    a.close()

    # 3. 导入到全新的 B：坏文件拒绝；预览后取消不生效；确认后全部替换，刷新仍在
    b = browser.new_context(viewport={'width': 1280, 'height': 900})
    b.add_init_script(SDK)
    pb = b.new_page()
    berrors = []
    pb.on('pageerror', lambda e: berrors.append(str(e)))
    pb.goto(URL)
    pb.wait_for_function('typeof window.__gift === "function"')
    pb.evaluate("__gift({giftName:'玫瑰',count:2,eventId:'keep'})")
    open_settings(pb)
    junk = tmp / 'junk.json'; junk.write_text('{"hello":1}', encoding='utf-8')
    pb.locator('#import-file').set_input_files(str(junk))
    pb.wait_for_timeout(300)
    check(pb.locator('#import-preview').is_hidden() and '不是红黑破锁' in pb.locator('#toast').inner_text(), 'foreign file not rejected')
    pb.locator('#import-file').set_input_files(str(backup))
    pb.locator('#import-preview').wait_for()
    summary = pb.locator('#import-summary').inner_text()
    check('可爱奶油' in summary and '棒棒糖' in summary and '自定义音效 1 个' in summary, f'preview wrong: {summary}')
    pb.locator('#import-cancel').click()
    check(pb.locator('html').get_attribute('data-theme') == 'horror', 'cancel still applied')
    pb.locator('#import-file').set_input_files(str(backup))
    pb.locator('#import-preview').wait_for()
    pb.locator('#import-confirm').click()
    pb.wait_for_function("document.querySelector('#sounds .sound-row[data-sound=clear] .sound-note').textContent.includes('叮.wav')")
    check(pb.locator('html').get_attribute('data-theme') == 'cream', 'theme not imported')
    check(pb.locator('#lock-key button[data-value="KeyJ"]').get_attribute('aria-pressed') == 'true', 'key not imported')
    check(pb.locator('#rules .rule-row').first.locator('input').first.input_value() == '棒棒糖', 'rules not imported')
    check(pb.locator('#typing-lock-layers').inner_text() == '×2' and pb.locator('#typing-lock-progress').inner_text().endswith('/ 120'), 'import disturbed current lock')
    pb.reload()
    pb.wait_for_function("document.querySelector('#sounds .sound-row[data-sound=clear] .sound-note').textContent.includes('叮.wav')")
    saved = json.loads(pb.evaluate("localStorage.getItem('red-black-lock-v1:settings')"))
    check(saved['theme'] == 'cream' and saved['sound']['events']['clear']['mode'] == 'custom' and saved['sound']['events']['hit']['mode'] == 'off', f'imported settings not persisted: {saved}')
    check(json.loads(pb.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))[0]['target'] == 33, 'imported rule target lost')
    check(not berrors, f'page errors: {berrors}')
    b.close()
    # 4. 礼物清空：规则类型选「清空」，观众送一份就清掉当前和排队的全部锁链；没有锁时不生效；导出导入保留该规则
    c = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    c.add_init_script(SDK)
    pc = c.new_page()
    cerrors = []
    pc.on('pageerror', lambda e: cerrors.append(str(e)))
    pc.goto(URL)
    pc.wait_for_function('typeof window.__gift === "function"')
    open_settings(pc)
    pc.locator('#add-rule').click()
    row = pc.locator('#rules .rule-row').last
    row.locator('input').first.fill('清空卡'); row.locator('input').first.dispatch_event('change')
    row.locator('button[data-value="clear"]').click()
    check(row.locator('.rule-target-range').is_hidden() and row.locator('.rule-value-range').is_hidden() and row.locator('.rule-factor-range').is_hidden(), 'clear rule fields wrong')
    saved = json.loads(pc.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))[-1]
    check(all(saved.get(k)==v for k,v in {'name': '清空卡', 'kind': 'clear', 'value': 1, 'target': 60}.items()), f'clear rule not saved: {saved}')
    pc.locator('#settings-close').click()
    pc.evaluate("__gift({giftName:'清空卡',count:1,eventId:'c0'})")
    check('没有锁链' in pc.locator('#toast').inner_text(), 'clear with no lock not reported')
    pc.evaluate("__gift({giftName:'小心心',count:25000,eventId:'c1'})")
    check(pc.locator('#typing-lock-layers').inner_text() == '×25,000', 'large gift count dropped')
    pc.evaluate("__gift({giftName:'清空卡',count:2,eventId:'c2'})")
    pc.locator('#typing-lock-overlay').wait_for(state='hidden', timeout=3000)
    s = state(pc)
    check(s['lock'] is None and s['waiting'] == [], f'gift clear left locks: {s}')
    check('清空全部锁链（25,000 层）' in pc.locator('#last-event').inner_text(), 'gift clear not recorded')
    open_settings(pc)
    with pc.expect_download() as info:
        pc.locator('#export-settings').click()
    exported = json.loads(Path(info.value.path()).read_text(encoding='utf-8'))
    check(exported['rules'][-1]['kind'] == 'clear', 'clear rule missing from export')
    check(not cerrors, f'page errors: {cerrors}')
    c.close()

    browser.close()
print('PASS V1.7.1: gift-triggered clear rule (clears queued too, no-lock notice, export); PASS V1.7: >20000 layers queue in order (relief continues, taps pour, reload, clear), settings export/import with sounds (reject foreign, preview, cancel, persist)')
