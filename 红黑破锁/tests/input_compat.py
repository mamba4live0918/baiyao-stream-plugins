"""按键兼容与防长按回归。

模拟 OBS「交互」窗口：event.code 为空、长按不带 repeat 标记，且自动重复可能被拆成「松开 + 按下」成对转发。
只有一下一下的真人点按计数；各种长按形态都只算第一下。
"""
from pathlib import Path
import os
import time
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()

SCRIPT = '''async ([key,keyCode,plan])=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const arena=document.getElementById('arena');
  const send=(type,extra={})=>arena.dispatchEvent(new KeyboardEvent(type,{bubbles:true,code:'',key,keyCode,...extra}));
  const read=()=>Number(document.getElementById('typing-lock-layers').textContent.replace(/[^0-9]/g,''));
  for(const step of plan){
    if(step[0]==='tap'){for(let i=0;i<step[1];i++){send('keydown');await sleep(40);send('keyup');await sleep(60);}}
    else if(step[0]==='hold-paired'){send('keydown');await sleep(300);for(let i=0;i<step[1];i++){send('keyup');send('keydown');await sleep(step[2]);}send('keyup');await sleep(80);}
    else if(step[0]==='hold-plain'){send('keydown');for(let i=0;i<step[1];i++){await sleep(33);send('keydown');}await sleep(20);send('keyup');await sleep(80);}
    else if(step[0]==='repeat-flag'){send('keydown');await sleep(40);send('keydown',{repeat:true});await sleep(40);send('keyup');await sleep(80);}
    else if(step[0]==='fast'){for(let i=0;i<step[1];i++){send('keydown');await sleep(step[2]);send('keyup');await sleep(step[3]);}await sleep(60);}
    else if(step[0]==='ime'){send('keydown',{isComposing:true,keyCode:229});await sleep(80);}
    else if(step[0]==='unidentified'){send('keydown',{key:'Unidentified'});await sleep(40);send('keyup',{key:'Unidentified'});await sleep(80);}
  }
  return read();
}'''


def open_locked(browser, code, target=1):
    # 每层 1 次：每次有效点击恰好破一层，用剩余层数计数，不受进度回落影响。
    page = browser.new_page(viewport={'width': 1000, 'height': 850})
    page.goto(URL)
    page.locator('#arena').dblclick(position={'x': 150, 'y': 200})
    page.locator(f'#lock-key button[data-value="{code}"]').click()
    page.locator('#simulate-target').fill(str(target))
    page.locator('#simulate-layers').fill('900')
    page.locator('#simulate-lock').click()
    page.locator('#settings-close').click()
    return page


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for code, key, keycode in [('Space', ' ', 32), ('KeyF', 'f', 70), ('KeyJ', 'j', 74), ('Enter', 'Enter', 13)]:
        page = open_locked(browser, code)
        cases = [
            ([['tap', 6]], 6, 'separate taps'),
            ([['fast', 12, 30, 20]], 12, 'fast two-finger taps: 30 ms down / 20 ms up (20 Hz)'),
            ([['fast', 12, 45, 12]], 12, 'fast taps with 12 ms release gap'),
            ([['hold-paired', 25, 33]], 1, 'OBS paired auto-repeat (33 ms)'),
            ([['hold-paired', 8, 110]], 1, 'OBS paired auto-repeat, slow keyboard rate (110 ms)'),
            ([['hold-plain', 25]], 1, 'auto-repeat without repeat flag or keyup'),
            ([['repeat-flag']], 1, 'native repeat flag'),
            ([['ime']], 0, 'IME composition'),
            ([['unidentified']], 1, 'legacy keyCode only'),
        ]
        for plan, expected, label in cases:
            before = page.evaluate("()=>Number(document.getElementById('typing-lock-layers').textContent.replace(/[^0-9]/g,''))")
            after = page.evaluate(SCRIPT, [key, keycode, plan])
            assert before - after == expected, (code, label, before, after)
        page.close()

    # 锁链降临前就按住的键：降临后继续长按不算点击。
    page = browser.new_page(viewport={'width': 1000, 'height': 850})
    page.goto(URL)
    page.keyboard.down('Space')
    page.evaluate("()=>{}")
    page.locator('#quick-lock').evaluate('b=>b.click()')
    for _ in range(10):
        page.keyboard.down('Space')  # Playwright 连续 down 带 repeat
        page.wait_for_timeout(33)
    page.keyboard.up('Space')
    assert page.locator('#typing-lock-progress').inner_text().startswith('0 /'), page.locator('#typing-lock-progress').inner_text()
    page.close()

    # 主线程繁忙、事件分发间隔被拉长：按事件自身时间戳判断，仍不会把长按算成连点。
    page = open_locked(browser, 'Space')
    cdp = page.context.new_cdp_session(page)
    def key_event(kind, ts):
        cdp.send('Input.dispatchKeyEvent', {'type': kind, 'key': ' ', 'code': 'Space', 'windowsVirtualKeyCode': 32, 'nativeVirtualKeyCode': 32, 'timestamp': ts})
    base = time.time()
    key_event('keyDown', base)
    for i in range(1, 16):
        # OBS 把一次自动重复拆成「松开+按下」；页面繁忙时两者到达间隔可达几十毫秒（V1.3.1 在此把每次重复都算成连点）。
        t = base + 0.3 + i * 0.033
        key_event('keyUp', t)
        page.evaluate('()=>{const end=performance.now()+30;while(performance.now()<end);}')
        key_event('keyDown', t + 0.0005)
    key_event('keyUp', base + 1)
    held = page.locator('#typing-lock-layers').inner_text()
    assert held == '×899', held
    page.close()
    browser.close()
print('PASS empty-code keys Space/F/J/Enter: taps count; OBS paired repeat (fast/slow), plain repeat, repeat flag, pre-held key, busy main thread all count once; IME ignored')
