"""V1.8 回归：礼物规则「禁用」——观众送礼让破锁键失效若干秒。"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()
SDK = "window.SonglanPlugin={onGift(cb){window.__gift=cb}};"


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def open_settings(page):
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    page.locator('#settings').wait_for()
    page.evaluate("window.LockMenu?.activate('gifts')")


def tap(page, times=1):
    for _ in range(times):
        page.keyboard.down('Space'); page.wait_for_timeout(40); page.keyboard.up('Space'); page.wait_for_timeout(50)


def left(page):
    return json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['frozenUntil'] - page.evaluate('Date.now()')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    ctx.add_init_script(SDK)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function('typeof window.__gift === "function"')

    # 1. 规则界面：选「禁用」，填每份秒数
    open_settings(page)
    page.locator('#add-rule').click()
    row = page.locator('#rules .rule-row').last
    row.locator('input').first.fill('冰冻'); row.locator('input').first.dispatch_event('change')
    row.locator('button[data-value="freeze"]').click()
    check(row.locator('.rule-value-range').is_visible() and row.locator('.rule-target-range').is_hidden(), 'freeze fields not shown')
    for wrong in (0, 3601):
        row.locator('.rule-value-max').fill(str(wrong)); row.locator('.rule-value-max').dispatch_event('change')
        check(json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))[-1]['valueMax'] == 10, f'invalid seconds accepted: {wrong}')
        check('未保存' in row.locator('.rule-save-status').inner_text(), 'invalid range has no feedback')
    ui_v2.set_range(row,'value',2)
    saved = json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))[-1]
    check(saved['kind'] == 'freeze' and saved['value'] == 2, f'freeze rule not saved: {saved}')
    page.locator('#simulate-target').fill('50')
    page.locator('#settings-close').click()

    # 2. 没锁时先送禁用，锁来了仍在禁用中；多份叠加；禁用期间按键不计数
    page.evaluate("__gift({giftName:'冰冻',count:1,eventId:'f1'})")
    page.evaluate("__gift({giftName:'小心心',count:3,eventId:'l1'})")
    check(page.locator('#typing-lock-freeze').is_visible(), 'freeze badge missing when lock arrives during freeze')
    check('lock-frozen' in page.locator('#typing-lock-overlay').get_attribute('class'), 'frozen class missing')
    page.evaluate("__gift({giftName:'冰冻',count:2,eventId:'f2'})")
    check(4800 < left(page) <= 6000, f'freeze did not stack to ~6s: {left(page)}')
    tap(page, 4)
    check(page.locator('#typing-lock-progress').inner_text().startswith('0 /'), 'taps counted while frozen')

    # 3. 刷新后禁用继续；解除按钮立即恢复
    page.reload()
    check(page.locator('#typing-lock-freeze').is_visible(), 'freeze lost after reload')
    open_settings(page)
    page.locator('#unfreeze').click()
    page.locator('#settings-close').click()
    page.wait_for_timeout(120)
    check(page.locator('#typing-lock-freeze').is_hidden(), 'unfreeze did not lift')
    tap(page, 2)
    check(page.locator('#typing-lock-progress').inner_text().startswith('2 /'), 'taps not counted after unfreeze')

    # 4. 到时自动恢复
    before_hits = page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:state')).lock.totalHits")
    page.evaluate("__gift({giftName:'冰冻',count:1,eventId:'f3'})")
    tap(page)
    check(page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:state')).lock.totalHits") == before_hits, 'tap counted while frozen (2)')
    page.wait_for_timeout(2200)
    check(page.locator('#typing-lock-freeze').is_hidden(), 'freeze did not expire')
    before = int(page.locator('#typing-lock-progress').inner_text().split(' / ')[0])
    tap(page, 2)
    after = int(page.locator('#typing-lock-progress').inner_text().split(' / ')[0])
    check(after == before + 2, f'taps not counted after expiry: {before} -> {after}')

    # 5. 上限 1 小时；清空（手动/礼物）一并解除禁用
    open_settings(page)
    page.locator('#simulate-seconds').fill('3600'); page.locator('#simulate-freeze').click(); page.locator('#simulate-freeze').click()
    check(left(page) <= 3600 * 1000, f'freeze exceeded 1 hour: {left(page)}')
    page.locator('#clear-locks').click(); page.wait_for_timeout(450); page.locator('#clear-locks').click()
    check(json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['frozenUntil'] == 0, 'manual clear kept freeze')
    page.locator('#settings-close').click()
    page.evaluate("__gift({giftName:'小心心',count:1,eventId:'l2'})")
    page.evaluate("__gift({giftName:'冰冻',count:5,eventId:'f4'})")
    page.evaluate("__gift({giftName:'清空卡不存在',count:1,eventId:'noop'})")
    open_settings(page)
    page.locator('#add-rule').click()
    row = page.locator('#rules .rule-row').last
    row.locator('input').first.fill('清空卡'); row.locator('input').first.dispatch_event('change')
    row.locator('button[data-value="clear"]').click()
    page.locator('#settings-close').click()
    page.evaluate("__gift({giftName:'清空卡',count:1,eventId:'c1'})")
    check(json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['frozenUntil'] == 0, 'gift clear kept freeze')
    check(not errors, f'page errors: {errors}')
    ctx.close()

    # 6. 动画关闭：不生成特效，但禁用标志和倒计时照常显示
    off = browser.new_context(viewport={'width': 1280, 'height': 800})
    po = off.new_page()
    po.goto(URL)
    open_settings(po)
    po.locator('#motion button[data-value="off"]').click()
    po.locator('#simulate-lock').click()
    po.locator('#simulate-seconds').fill('5'); po.locator('#simulate-freeze').click()
    po.locator('#settings-close').click()
    tap(po, 2)
    check(po.evaluate("document.getElementById('lock-fx').childElementCount") == 0, 'effects spawned with motion off')
    check(po.locator('#typing-lock-freeze').is_visible(), 'badge hidden with motion off')
    off.close()
    browser.close()
print('PASS V1.8: freeze rule (UI validation, gift stacking, pre-lock freeze, taps blocked, reload, unfreeze, expiry, 1h cap, clears lift freeze, motion off)')
