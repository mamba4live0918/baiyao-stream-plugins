"""Single-key recording in the real standalone HTML, including OBS fallback events."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
import time
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]
HTML = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve()
PREFIX = 'red-black-lock-v1:'


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def click(page, selector):
    if selector == '#settings-open':
        page.locator('#arena').dblclick(position={'x':100,'y':100})
        return
    page.locator(selector).click()


def settings(page):
    return page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')||'{}')")


def layers(page):
    return page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:state')||'{}').lock?.layers||0")


def start_record(page):
    click(page, '#record-lock-key')
    check(page.locator('#cancel-lock-key').is_visible(), 'Recording has no available cancel button')
    check(any(word in page.locator('#lock-key-status').inner_text() for word in ('等待', '按下', '录入')), 'Recording status is not explained')


def record_native(page, key, code):
    start_record(page); before=layers(page)
    page.keyboard.press(key)
    check(settings(page).get('key') == code, f'Native recording {key} did not immediately persist {code}: {settings(page)}')
    check(layers(page)==before, f'Recording {key} broke a layer')
    check(bool(page.locator('#lock-key-current').inner_text().strip()), f'Current-key display empty for {code}')
    check(page.locator('#settings').is_visible(), f'Recording {key} closed settings')
    page.wait_for_timeout(55)  # The next physical tap is outside the existing 45 ms anti-repeat guard.


def record_obs(page, event, code):
    start_record(page); before=layers(page)
    page.evaluate('''e=>{for(const type of ['keydown','keyup'])document.getElementById('record-lock-key').dispatchEvent(new KeyboardEvent(type,{bubbles:true,cancelable:true,code:'',...e}));}''', event)
    check(settings(page).get('key')==code, f'OBS recording {event} did not persist {code}: {settings(page)}')
    check(layers(page)==before, 'OBS recording broke a layer')
    page.wait_for_timeout(55)


def simulate(page, count=3):
    page.locator('#simulate-layers').fill(str(count));page.locator('#simulate-target').fill('1')
    click(page,'#simulate-lock')


def tap(page, key):
    page.keyboard.down(key);page.wait_for_timeout(35);page.keyboard.up(key);page.wait_for_timeout(45)


def obs_tap(page,event):
    page.evaluate('''async e=>{const arena=document.getElementById('arena');
      arena.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code:'',...e}));
      await new Promise(r=>setTimeout(r,35));
      arena.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,code:'',...e}));
      await new Promise(r=>setTimeout(r,45));}''',event)


with TemporaryDirectory() as tmp,sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
    context.add_init_script("window.SonglanPlugin={onGift(cb){window.__gift=cb;}};window.addEventListener('keydown',e=>{window.__lastKeyEvent=e;},true);")
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(HTML.as_uri())
    check(page.locator('#record-lock-key').count()==1,'Custom-key recording entry is missing from actual HTML')
    click(page,'#settings-open')
    check(page.locator('#lock-key button[data-value]').count()==4,'Original four key presets changed')
    click(page,'#lock-key button[data-value="Space"]')
    click(page,'#motion button[data-value="off"]');click(page,'#decay-presets button[data-value="0"]')

    # Capturing while locked cannot count as gameplay, and existing batches keep their key.
    simulate(page,2);check(layers(page)==2,'Could not create old Space batch')
    record_native(page,'a','KeyA');simulate(page,2)
    check(layers(page)==4,'Could not append new A batch')
    click(page,'#settings-close')
    tap(page,'a');check(layers(page)==4,'New key altered the existing Space batch')
    tap(page,'Space');check(layers(page)==3,'Old batch no longer accepts Space')
    tap(page,'Space');check(layers(page)==2,'Old batch did not advance to new batch')
    tap(page,'Space');check(layers(page)==2,'Old key broke the new custom-key batch')
    tap(page,'a');tap(page,'a');check(layers(page)==0,'New batch does not accept recorded key')

    loop_started=time.monotonic()
    native_cases=[('a','KeyA'),('7','Digit7'),('ArrowUp','ArrowUp'),(';','Semicolon'),
                  ('F8','F8'),('Numpad3','Numpad3'),('Escape','Escape'),('Tab','Tab')]
    for key,code in native_cases:
        click(page,'#settings-open');record_native(page,key,code);simulate(page,3)
        click(page,'#settings-close');tap(page,key)
        check(layers(page)==2,f'Recorded {code} does not break a layer')
        if code=='Tab':
            check(page.evaluate('window.__lastKeyEvent.defaultPrevented'),'Tab gameplay moved browser focus instead of preventing its default')
        tap(page,'z');check(layers(page)==2,f'Wrong key broke {code} lock')
        page.keyboard.down(key)
        for _ in range(3):page.keyboard.down(key)
        page.keyboard.up(key);page.wait_for_timeout(45)
        check(layers(page)==1,f'Long press/repeat counted more than once for {code}')
        tap(page,key);check(layers(page)==0,f'Separate taps do not finish {code} lock')

    obs_cases=[({'key':'Unidentified','keyCode':65},'KeyA'),
               ({'key':';','keyCode':0},'Semicolon'),
               ({'key':'Unidentified','keyCode':119},'F8'),
               ({'key':'F8','keyCode':0},'F8'),
               ({'key':'Unidentified','keyCode':99,'location':3},'Numpad3'),
               ({'key':'3','keyCode':0,'location':3},'Numpad3')]
    for event,code in obs_cases:
        click(page,'#settings-open');record_obs(page,event,code);simulate(page,1)
        click(page,'#settings-close');page.wait_for_timeout(25);obs_tap(page,event)
        check(layers(page)==0,f'OBS fallback recorded {code} but cannot break it: {event}')
    check(time.monotonic()-loop_started<15,'Key-case loop exceeded 15 seconds')

    # Invalid combinations, modifiers and IME leave the current key and waiting state intact.
    click(page,'#settings-open');record_native(page,'a','KeyA');start_record(page)
    for rejected in ('Shift','Control','Alt','Meta','Control+b','Alt+b','Meta+b'):
        page.keyboard.press(rejected)
        check(settings(page)['key']=='KeyA',f'Modifier or combination accepted: {rejected}')
        check(page.locator('#cancel-lock-key').is_visible(),f'Rejected {rejected} stopped capture')
    for event in ({'code':'KeyB','key':'b','isComposing':True},
                  {'code':'','key':'Process','keyCode':229},
                  {'code':'KeyB','key':'b','keyCode':229}):
        page.evaluate("e=>document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,...e}))",event)
        check(settings(page)['key']=='KeyA',f'IME input was recorded: {event}')
    click(page,'#cancel-lock-key');page.keyboard.press('b')
    check(settings(page)['key']=='KeyA','Cancelled recording captured a later key')
    start_record(page);click(page,'#settings-close');page.keyboard.press('c')
    check(settings(page)['key']=='KeyA','Closing settings did not cancel recording')
    click(page,'#settings-open');start_record(page)
    page.evaluate("window.dispatchEvent(new Event('blur'))");page.keyboard.press('d')
    check(settings(page)['key']=='KeyA','Window blur did not cancel recording')

    # A failed persistence operation must keep the previous live key and display.
    old_label=page.locator('#lock-key-current').inner_text()
    page.evaluate('''()=>{window.realSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key==='red-black-lock-v1:settings')throw new DOMException('test quota','QuotaExceededError');return realSetItem.call(this,key,value);};}''')
    start_record(page);page.keyboard.press('b')
    check(settings(page)['key']=='KeyA','Failed save replaced persisted key')
    check(page.locator('#lock-key-current').inner_text()==old_label,'Failed save replaced current-key display')
    page.evaluate('()=>{Storage.prototype.setItem=realSetItem;}')
    click(page,'#settings-close');click(page,'#settings-open');simulate(page,1);click(page,'#settings-close')
    tap(page,'b');check(layers(page)==1,'Failed key save replaced live key')
    tap(page,'a');check(layers(page)==0,'Old live key lost after storage failure')

    # Unrelated controls, refresh and file backup/import keep a custom key.
    click(page,'#settings-open');record_native(page,'F8','F8')
    click(page,'#theme button[data-value="cream"]');click(page,'#motion button[data-value="auto"]')
    check(settings(page)['key']=='F8','Theme or motion save reset custom key')
    with page.expect_download() as info:click(page,'#export-settings')
    backup=Path(tmp)/'custom-key-backup.json';info.value.save_as(backup)
    check(json.loads(backup.read_text(encoding='utf-8'))['settings']['key']=='F8','Export lost custom key')
    click(page,'#lock-key button[data-value="Space"]')
    page.locator('#import-file').set_input_files(backup)
    page.locator('#import-preview').wait_for();click(page,'#import-confirm')
    page.wait_for_function("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')).key==='F8'")
    page.reload();click(page,'#settings-open')
    check(settings(page)['key']=='F8' and 'F8' in page.locator('#lock-key-current').inner_text(),'Refresh or backup import lost F8')
    click(page,'#motion button[data-value="off"]');simulate(page,1);click(page,'#settings-close')
    tap(page,'F8');check(layers(page)==0,'Restored F8 is displayed but cannot break a new lock')

    page.set_viewport_size({'width':375,'height':760});click(page,'#settings-open')
    page.locator('#record-lock-key').scroll_into_view_if_needed()
    for selector in ('#record-lock-key','#lock-key-current','#lock-key-status'):
        box=page.locator(selector).bounding_box()
        check(box and box['x']>=-1 and box['x']+box['width']<=376,f'Narrow-window key control overflows: {selector}: {box}')
    screenshot=Path(os.environ.get('LOCK_KEY_SCREENSHOT',str(Path(tmp)/'custom-key-narrow.png')))
    page.screenshot(path=str(screenshot))
    check(not errors,'Browser errors: '+str(errors))
    browser.close()
    print('PASS custom-key UI: native/OBS keys, single-tap/repeat, batch snapshots, cancellation/IME, storage failure, theme/motion, backup/reload and narrow layout')
