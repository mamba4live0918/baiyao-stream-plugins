from pathlib import Path
from tempfile import gettempdir
import os
import hashlib
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()
SHOTS = Path(gettempdir()) / 'red-black-lock-qa'
SHOTS.mkdir(exist_ok=True)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def tap(page, key='Space', times=1):
    # 真人连点：按下约 40 ms、两次之间留出松开时间；瞬时连发会被当成长按过滤。
    for _ in range(times):
        page.keyboard.down(key)
        page.wait_for_timeout(40)
        page.keyboard.up(key)
        page.wait_for_timeout(45)


def set_sim_target(page, value):
    page.locator('#simulate-target').fill(str(value))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='no-preference')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    check(page.title() == '红黑破锁 · 独立直播互动插件', 'wrong page title')
    check(page.evaluate('getComputedStyle(document.documentElement).colorScheme') == 'normal', 'root dark color scheme can make embedded canvas black')
    check(page.locator('#typing-lock-overlay').is_hidden(), 'idle lock should be absent')
    check(page.locator('html').get_attribute('data-theme') == 'horror', 'red-black theme is not default')
    check(page.locator('.topbar').is_hidden() and page.locator('#idle-screen').is_hidden(), 'ordinary UI is visible')
    page.screenshot(path=str(SHOTS / 'desktop-idle.png'), omit_background=True)
    check(Image.open(SHOTS / 'desktop-idle.png').getpixel((720, 180))[3] == 0, 'desktop background is not transparent')

    page.locator('#arena').dblclick(position={'x': 700, 'y': 210})
    check(page.locator('#settings').is_visible(), 'double click did not open settings')
    check(page.locator('#settings select').count() == 0, 'settings still contain native dropdowns')
    # Legacy screenshot coordinates apply to the explicitly retained standard preset.
    page.locator('#display-size button[data-value="standard"]').click()
    page.locator('#lock-key button[data-value="KeyF"]').click()
    check(page.locator('#lock-key button[data-value="KeyF"]').get_attribute('aria-pressed') == 'true', 'key button did not select')
    page.locator('#lock-key button[data-value="Space"]').click()
    first_rule = page.locator('#rules .rule-row').first
    first_rule.locator('button[data-value="relief"]').click()
    check(page.locator('#rules .rule-row').first.locator('button[data-value="relief"]').get_attribute('aria-pressed') == 'true', 'rule kind button did not select')
    check(first_rule.locator('.rule-value-range').is_visible() and first_rule.locator('.rule-target-range').is_hidden(), 'rule fields did not switch')
    page.locator('#rules .rule-row').first.locator('button[data-value="lock"]').click()
    page.screenshot(path=str(SHOTS / 'desktop-settings.png'), omit_background=True)
    set_sim_target(page, 5)
    page.locator('#simulate-layers').fill('1')
    page.locator('#simulate-lock').click()
    page.get_by_role('button', name='关闭设置').click()
    check(page.locator('#typing-lock-overlay').is_visible(), 'lock overlay missing')
    check(page.locator('.chain-arm').count() == 4 and page.locator('.lock-tier-strand').count() == 0, 'expected exactly four whole chains, no overlaid extra strands')
    geometry = page.evaluate('''() => {
      const arm=document.querySelector('.arm-br');
      return {angle:getComputedStyle(arm).transform,length:getComputedStyle(document.querySelector('#typing-lock-overlay')).getPropertyValue('--lock-arm-length'),image:getComputedStyle(arm.querySelector('.lock-chain')).backgroundImage};
    }''')
    check(geometry['image'].startswith('url("data:image/webp;base64,'), 'chain is not embedded')
    page.wait_for_timeout(1700)
    check(page.locator('#typing-lock-meter').is_visible(), 'current layer progress bar missing')
    check(page.locator('#typing-lock-key').is_visible(), 'break key instruction missing')
    check(page.locator('#typing-lock-layers').is_visible(), 'remaining layer count missing')
    page.screenshot(path=str(SHOTS / 'desktop-locked.png'), omit_background=True)
    check(Image.open(SHOTS / 'desktop-locked.png').getpixel((720, 180))[3] == 0, 'locked background is not transparent')
    tap(page, times=2)
    check(int(page.locator('#typing-lock-meter').get_attribute('aria-valuenow')) > 0, 'pressing break key did not advance visible progress')
    before = page.locator('#typing-lock-progress').inner_text()
    page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',repeat:true,bubbles:true}))")
    check(page.locator('#typing-lock-progress').inner_text() == before, 'auto-repeat counted')
    page.reload()
    check(page.locator('#typing-lock-overlay').is_visible(), 'locked state not restored')
    tap(page, times=5)
    page.locator('#typing-lock-overlay').wait_for(state='hidden', timeout=2000)
    check(page.locator('#typing-lock-overlay').is_hidden(), 'lock did not clear')

    page.locator('#arena').dblclick(position={'x': 700, 'y': 210})
    set_sim_target(page, 5)
    page.locator('#simulate-layers').fill('2')
    page.locator('#simulate-lock').click()
    set_sim_target(page, 6)
    page.locator('#simulate-layers').fill('1')
    page.locator('#simulate-lock').click()
    check(page.locator('#typing-lock-layers').inner_text() == '×3', 'batch stack count incorrect')
    page.locator('#simulate-points').fill('10')
    page.get_by_role('button', name='模拟减链').click()
    check(page.locator('#typing-lock-layers').inner_text() == '×1', 'relief did not clear first batch')
    check(page.locator('#typing-lock-progress').inner_text().endswith('/ 6'), 'FIFO batch target not promoted')
    page.get_by_role('button', name='关闭设置').click()
    page.wait_for_timeout(1700)
    page.screenshot(path=str(SHOTS / 'desktop-rare.png'), omit_background=True)

    themes = ['fufu', 'horror', 'cyber', 'typewriter', 'notebook', 'pixel', 'chalk', 'terminal', 'cream']
    chain_hashes, lock_hashes = set(), set()
    for theme in themes:
        page.locator('#arena').dblclick(position={'x': 700, 'y': 210})
        page.locator(f'#theme button[data-value="{theme}"]').click()
        page.get_by_role('button', name='关闭设置').click()
        check(page.locator('html').get_attribute('data-theme') == theme, f'theme did not switch: {theme}')
        check(page.locator('#typing-lock-meter').is_visible(), f'progress hidden in theme {theme}')
        images = page.evaluate('''() => [
            getComputedStyle(document.querySelector('.chain-arm .lock-chain')).backgroundImage,
            getComputedStyle(document.querySelector('.lock-body')).backgroundImage
        ]''')
        check(all(value.startswith('url("data:image/webp;base64,') or theme=='fufu' and value.startswith('url("blob:') for value in images), f'theme asset missing: {theme}')
        chain_hashes.add(hashlib.sha256(images[0].encode()).hexdigest())
        lock_hashes.add(hashlib.sha256(images[1].encode()).hexdigest())
        page.screenshot(path=str(SHOTS / f'theme-{theme}.png'), omit_background=True)
    check(len(chain_hashes) == 9 and len(lock_hashes) == 9, 'some themes share chain or padlock art')
    page.reload()
    check(page.locator('html').get_attribute('data-theme') == 'cream', 'theme selection not restored')
    check(not errors, f'page errors: {errors}')
    context.close()

    reduced = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    mobile = reduced.new_page()
    mobile_errors = []
    mobile.on('pageerror', lambda error: mobile_errors.append(str(error)))
    mobile.goto(URL)
    mobile.locator('#arena').dblclick(position={'x': 190, 'y': 150})
    mobile.locator('#motion button[data-value="on"]').click()
    mobile.locator('#simulate-layers').fill('1')
    mobile.locator('#simulate-lock').click()
    mobile.get_by_role('button', name='关闭设置').click()
    animation = mobile.locator('.arm-br .lock-chain').first.evaluate('(node)=>getComputedStyle(node).animationName')
    check(animation != 'none' and mobile.locator('#typing-lock-overlay').get_attribute('data-motion') == 'on', f'explicit motion overridden by reduced motion: {animation}')
    mobile.wait_for_timeout(1700)
    mobile.screenshot(path=str(SHOTS / 'mobile-reduced-explicit-on.png'), omit_background=True)
    check(Image.open(SHOTS / 'mobile-reduced-explicit-on.png').getpixel((195, 160))[3] == 0, 'mobile background is not transparent')
    mobile.locator('#arena').dblclick(position={'x': 190, 'y': 150})
    mobile.locator('#motion button[data-value="auto"]').click()
    check(mobile.locator('#typing-lock-overlay').get_attribute('data-motion') == 'off', 'follow system ignored reduced motion')
    check(not mobile_errors, f'mobile page errors: {mobile_errors}')
    reduced.close()

    sdk_context = browser.new_context(viewport={'width': 1280, 'height': 720})
    sdk_context.add_init_script("window.SonglanPlugin={onGift(callback){window.__giftCallback=callback}}")
    sdk_page = sdk_context.new_page()
    sdk_page.goto(URL)
    sdk_page.wait_for_function('typeof window.__giftCallback === "function"')
    sdk_page.evaluate("window.__giftCallback({giftName:'小心心',count:2,eventId:'event-1'})")
    check(sdk_page.locator('#typing-lock-layers').inner_text() == '×2', 'SDK gift count did not add layers')
    sdk_page.evaluate("window.__giftCallback({giftName:'小心心',count:2,eventId:'event-1'})")
    check(sdk_page.locator('#typing-lock-layers').inner_text() == '×2', 'SDK duplicate event applied twice')
    sdk_page.evaluate("window.__giftCallback({giftName:'破锁钥匙',count:2,eventId:'event-2'})")
    sdk_page.locator('#typing-lock-overlay').wait_for(state='hidden', timeout=2000)
    sdk_context.close()

    storage_context = browser.new_context(viewport={'width': 1280, 'height': 720})
    storage_context.add_init_script("Storage.prototype.setItem=function(){throw new Error('quota full')}")
    storage_page = storage_context.new_page()
    storage_page.goto(URL)
    storage_page.locator('#arena').dblclick(position={'x': 400, 'y': 200})
    storage_page.locator('#simulate-lock').click()
    check('浏览器存储不可用' in storage_page.locator('#settings-storage-status').inner_text(), 'storage failure not shown in settings')
    check(storage_page.locator('#typing-lock-overlay').is_visible(), 'storage failure stopped temporary play')
    storage_context.close()
    browser.close()

sheet = Image.new('RGB', (4 * 380, 2 * 270), (29, 26, 32))
draw = ImageDraw.Draw(sheet)
for index, theme in enumerate(themes):
    shot = Image.open(SHOTS / f'theme-{theme}.png').convert('RGBA')
    shot.thumbnail((380, 240))
    x, y = (index % 4) * 380, (index // 4) * 270
    sheet.paste(shot, (x, y), shot)
    draw.text((x + 12, y + 244), theme, fill=(246, 234, 238))
sheet.save(SHOTS / 'eight-themes.jpg', quality=90)
print(f'PASS file-open desktop/mobile, nine themes, stack, relief, persistence, repeat, motion, SDK, storage failure; screenshots: {SHOTS}')
