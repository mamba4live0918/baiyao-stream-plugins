"""V1.9 回归：停手回落速度可自定义（预设、自定义数值、等待时间、无效值、刷新保留、导出导入带上）。"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def progress(page):
    return int(page.locator('#typing-lock-progress').inner_text().split(' / ')[0])


def tap(page, times):
    for _ in range(times):
        page.keyboard.down('Space'); page.wait_for_timeout(35); page.keyboard.up('Space'); page.wait_for_timeout(45)


def setup(page, target=100):
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    page.locator('#settings').wait_for()
    page.locator('#simulate-target').fill(str(target)); page.locator('#simulate-layers').fill('1'); page.locator('#simulate-lock').click()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    setup(page)
    check(page.locator('#decay-rate').input_value() == '35' and page.locator('#decay-delay').input_value() == '0.25', 'defaults changed')

    # 1. 「不回落」：停手 1.5 秒进度不变
    page.locator('#decay-presets button[data-value="0"]').click()
    check('不会回落' in page.locator('#decay-hint').inner_text(), 'hint not updated')
    page.locator('#settings-close').click()
    tap(page, 10)
    before = progress(page); page.wait_for_timeout(1500)
    check(before == 10 and progress(page) == 10, f'progress fell with decay off: {before} -> {progress(page)}')

    # 2. 自定义 100%/秒、等待 0：一层 100 次，约 0.1 秒掉 10 次
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    page.locator('#decay-rate').fill('100'); page.locator('#decay-rate').dispatch_event('change')
    page.locator('#decay-delay').fill('0'); page.locator('#decay-delay').dispatch_event('change')
    page.locator('#settings-close').click()
    page.wait_for_timeout(150)
    check(progress(page) == 0, f'fast decay did not empty 10 taps in 0.15s: {progress(page)}')

    # 3. 等待时间：停手 1 秒内不回落，之后才掉
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    page.locator('#decay-rate').fill('10'); page.locator('#decay-rate').dispatch_event('change')
    page.locator('#decay-delay').fill('1'); page.locator('#decay-delay').dispatch_event('change')
    page.locator('#settings-close').click()
    tap(page, 20)
    page.wait_for_timeout(700)
    check(progress(page) == 20, f'decayed before delay: {progress(page)}')
    page.wait_for_timeout(1300)
    check(5 <= progress(page) <= 16, f'did not decay ~10/s after the 1s delay: {progress(page)}')

    # 4. 无效值不生效；刷新保留；导出文件带上
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    for bad in ('501', '-1', '2.5'):
        page.locator('#decay-rate').fill(bad); page.locator('#decay-rate').dispatch_event('change')
        check(page.locator('#decay-rate').input_value() == '10', f'invalid rate accepted: {bad}')
    page.locator('#decay-delay').fill('11'); page.locator('#decay-delay').dispatch_event('change')
    check(page.locator('#decay-delay').input_value() == '1', 'invalid delay accepted')
    page.reload()
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    check(page.locator('#decay-rate').input_value() == '10' and page.locator('#decay-delay').input_value() == '1', 'decay settings not restored')
    with page.expect_download() as info:
        page.locator('#export-settings').click()
    exported = json.loads(Path(info.value.path()).read_text(encoding='utf-8'))
    check(exported['settings']['decayRate'] == 10 and exported['settings']['decayDelay'] == 1, 'decay missing from export')
    check(not errors, f'page errors: {errors}')
    browser.close()
print('PASS V1.9: custom decay (off preset, fast custom, start delay, invalid values, reload, export)')
