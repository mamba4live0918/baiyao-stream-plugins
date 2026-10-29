"""用户设置次数范围、每层独立抽取、刷新与排队快照回归。"""
from pathlib import Path
import os, json
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1280,'height':800})
    context.add_init_script("window.SonglanPlugin={onGift(cb){window.__gift=cb}}")
    page = context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL)
    page.locator('#arena').dblclick(position={'x':200,'y':200})
    assert page.locator('#target-pool,#multiplier-levels').count()==0, 'removed central settings are still present'
    assert page.locator('#custom-art').count()==1, 'missing custom chain/lock settings'
    row=page.locator('#rules .rule-row').first
    ui_v2.set_range(row,'target',1,3)
    ui_v2.set_range(row,'value',20)
    ui_v2.set_range(row,'factor',1)
    rules=json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:rules')"))
    assert rules[0]['targetMin']==1 and rules[0]['targetMax']==3
    page.locator('#decay-presets button[data-value="0"]').click()
    page.locator('#settings-close').click()
    page.evaluate("window.__gift({giftName:'小心心',count:1})")
    page.wait_for_function("JSON.parse(localStorage.getItem('red-black-lock-v1:state')).lock?.layers===20")
    targets=[]
    for i in range(10):
        saved=json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['lock']
        assert 1<=saved['target']<=3
        targets.append(saved['target'])
        for _ in range(saved['target']):
            page.keyboard.down('Space');page.wait_for_timeout(40)
            page.keyboard.up('Space');page.wait_for_timeout(45)
    assert len(set(targets))>1, f'layers did not draw independently: {targets}'
    before=json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['lock']
    page.reload()
    after=json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['lock']
    assert before['target']==after['target'] and before['queue']==after['queue'], 'reload redrew targets'
    page.locator('#arena').dblclick(position={'x':200,'y':200})
    row=page.locator('#rules .rule-row').first
    ui_v2.set_range(row,'target',900)
    old=page.evaluate("localStorage.getItem('red-black-lock-v1:rules')")
    row.locator('.rule-target-max').fill('800');row.locator('.rule-target-max').dispatch_event('change')
    assert page.evaluate("localStorage.getItem('red-black-lock-v1:rules')")==old, 'invalid upper bound overwrote the saved rule'
    assert '未保存' in row.locator('.rule-save-status').inner_text()
    row.locator('.rule-target-max').fill('901');row.locator('.rule-target-max').dispatch_event('change')
    queued=json.loads(page.evaluate("localStorage.getItem('red-black-lock-v1:state')"))['lock']
    assert queued['queue'][0]['targetPool'][0]['max']==3, 'editing range changed already queued locks'
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('#settings').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'), 'narrow settings overflow'
    assert not errors, errors
    browser.close()
    print('PASS: ranges, per-layer draws, refresh, queue snapshots, invalid range, narrow menu, no runtime errors')
