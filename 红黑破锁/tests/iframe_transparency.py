"""Verify compositing through the same srcdoc iframe used by Songlan."""
from pathlib import Path
from io import BytesIO
import os
from PIL import Image
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
source = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).read_text(encoding='utf-8')
GREEN = (71, 163, 107)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 800, 'height': 600})
    # Songlan's viewer has no document-wide dark color scheme and uses srcdoc.
    page.set_content('''<style>
      html,body{margin:0;width:100%;height:100%;background:rgb(71,163,107)}
      iframe{border:none;width:100%;height:100%;position:absolute;top:0;left:0}
    </style><iframe></iframe>''')
    page.locator('iframe').evaluate('(frame,source)=>frame.srcdoc=source', source)
    frame = page.frame_locator('iframe')
    frame.locator('#arena').wait_for()

    def expect_backdrop():
        # Normal screenshot: no forced transparent-background override.
        image = Image.open(BytesIO(page.screenshot())).convert('RGB')
        if image.getcolors(2) != [(800 * 600, GREEN)]:
            from tempfile import gettempdir
            image.save(Path(gettempdir()) / 'lock-iframe-failure.png')
            print('Unexpected pixels:', sorted(image.getcolors(800*600), reverse=True)[:5])
        assert image.getcolors(2) == [(800 * 600, GREEN)], 'iframe covers the host backdrop'

    expect_backdrop()
    frame.locator('#arena').dblclick(position={'x': 200, 'y': 200})
    assert frame.locator('#settings').is_visible()
    assert frame.locator('#settings').evaluate('(node)=>getComputedStyle(node).colorScheme') == 'dark'
    frame.locator('#settings-close').click()
    expect_backdrop()
    frame.locator('#arena').dblclick(position={'x': 200, 'y': 200})
    frame.locator('#simulate-target').fill('5')
    frame.locator('#simulate-layers').fill('2')
    frame.locator('#simulate-lock').click()
    frame.locator('#settings-close').click()
    assert frame.locator('#typing-lock-meter').is_visible()
    assert frame.locator('#typing-lock-key').inner_text() == '空格'
    frame.locator('#arena').focus()
    page.keyboard.down('Space'); page.wait_for_timeout(40); page.keyboard.up('Space')
    assert int(frame.locator('#typing-lock-meter').get_attribute('aria-valuenow')) > 0
    # Send native key events to the focused frame without repeatedly resolving
    # its 16 MB srcdoc between hits, which can exceed the gameplay decay grace.
    for _ in range(5):
        page.wait_for_timeout(45)
        page.keyboard.down('Space'); page.wait_for_timeout(40); page.keyboard.up('Space')
    assert frame.locator('#typing-lock-layers').inner_text() == '×1', frame.locator('#typing-lock-progress').inner_text()
    for _ in range(5):
        page.wait_for_timeout(45)
        page.keyboard.down('Space'); page.wait_for_timeout(40); page.keyboard.up('Space')
    frame.locator('#typing-lock-overlay').wait_for(state='hidden')
    expect_backdrop()
    page.add_style_tag(content='html,body{background:transparent}')
    image = Image.open(BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
    assert image.getchannel('A').getextrema() == (0, 0), 'idle iframe contains opaque pixels'
    browser.close()
print('PASS Songlan-style iframe: visible progress, keyboard clears two layers, host backdrop visible, all idle alpha=0')
