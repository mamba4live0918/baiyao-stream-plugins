"""Menu-open OBS repeat must remain held after five seconds and cannot close Escape capture."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT=Path(__file__).resolve().parents[1]
HTML=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve()


def check(condition,message):
    if not condition:
        raise AssertionError(message)


def click(page,selector):
    if selector == '#settings-open':
        page.locator('#arena').dblclick(position={'x':100,'y':100})
        return
    page.locator(selector).click()


def layers(page):
    return page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:state')||'{}').lock?.layers||0")


def prepare(browser):
    context=browser.new_context(viewport={'width':1100,'height':800})
    context.add_init_script("window.SonglanPlugin={onGift(cb){window.__gift=cb;}};")
    page=context.new_page();page.goto(HTML.as_uri());click(page,'#settings-open')
    click(page,'#motion button[data-value="off"]');click(page,'#decay-presets button[data-value="0"]')
    page.evaluate('''()=>{
      window.keyClockBase=performance.now();
      window.rawKey=(type,elapsed,key,keyCode)=>{
        const event=new KeyboardEvent(type,{bubbles:true,cancelable:true,code:'',key,keyCode,repeat:false});
        Object.defineProperty(event,'timeStamp',{value:keyClockBase+elapsed});
        // Some CEF hosts supply false throughout a hold. Keep that received value false
        // so the shim cannot hide whether the application tracks menu-open keydowns.
        Object.defineProperty(event,'repeat',{value:false,configurable:false});
        document.getElementById('arena').dispatchEvent(event);
        return {prevented:event.defaultPrevented,repeat:event.repeat};
      };
    }''')
    return context,page


def raw(page,type,elapsed,key,key_code):
    return page.evaluate('args=>rawKey(...args)',[type,elapsed,key,key_code])


with sync_playwright() as p:
    browser=p.chromium.launch(headless=True);failures=[]
    context,page=prepare(browser)
    try:
        # Establish an old Space batch, then clear it before testing a recorded A batch.
        page.locator('#simulate-layers').fill('2');page.locator('#simulate-target').fill('1');click(page,'#simulate-lock')
        click(page,'#record-lock-key');raw(page,'keydown',100,'a',65)
        check(page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')).key")=='KeyA','A was not recorded')
        check(layers(page)==2,'Recording A broke the existing Space batch')
        click(page,'#clear-locks');page.wait_for_timeout(410);click(page,'#clear-locks')
        check(layers(page)==0,'Could not clear old Space batch')
        page.locator('#simulate-layers').fill('10');click(page,'#simulate-lock')
        for i in range(1,19):
            raw(page,'keyup',100+i*300-1,'a',65);event=raw(page,'keydown',100+i*300,'a',65)
            check(event['repeat'] is False,'Test failed to preserve the incoming repeat:false condition')
        check(layers(page)==10,'Menu-open repeats broke A layers')
        click(page,'#settings-close')
        # The next repeated down still belongs to the key held during menu interaction.
        raw(page,'keydown',5800,'a',65)
        for i in range(1,5):
            raw(page,'keyup',5800+i*300-1,'a',65);raw(page,'keydown',5800+i*300,'a',65)
        check(layers(page)==10,'Held A after five seconds in settings broke a layer when the menu closed')
        raw(page,'keyup',7300,'a',65);raw(page,'keydown',7350,'a',65);raw(page,'keyup',7385,'a',65)
        check(layers(page)==9,'A real release and new press did not break exactly one layer')
    except AssertionError as error:
        failures.append('A hold: '+str(error))
    finally:
        context.close()

    context,page=prepare(browser)
    try:
        click(page,'#record-lock-key');raw(page,'keydown',100,'Escape',27)
        check(page.locator('#settings').is_visible(),'Recording Escape closed settings')
        check(page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')).key")=='Escape','Escape was not recorded')
        for i in range(1,19):
            raw(page,'keyup',100+i*300-1,'Escape',27);event=raw(page,'keydown',100+i*300,'Escape',27)
            check(event['repeat'] is False,'Escape test no longer supplies repeat:false')
            check(page.locator('#settings').is_visible(),'OBS paired repeats of recorded Escape closed the settings menu')
        raw(page,'keyup',5800,'Escape',27);raw(page,'keydown',5850,'Escape',27)
        check(page.locator('#settings').is_hidden(),'A separately pressed Escape no longer closes settings')
    except AssertionError as error:
        failures.append('Escape hold: '+str(error))
    finally:
        context.close()

    context,page=prepare(browser)
    try:
        click(page,'#record-lock-key')
        page.keyboard.down('Enter')
        check(page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')).key")=='Enter','Native Enter was not recorded')
        check(page.locator('#cancel-lock-key').is_hidden(),'First native Enter did not finish capture')
        page.wait_for_timeout(80);page.keyboard.down('Enter')
        check(page.locator('#cancel-lock-key').is_hidden(),'Held native Enter activated the focused recording button and started capture again')
        page.keyboard.up('Enter')
        check(page.locator('#settings').is_visible(),'Held native Enter closed settings')
    except AssertionError as error:
        failures.append('Native Enter hold: '+str(error))
    finally:
        context.close();browser.close()
    check(not failures,'; '.join(failures))
    print('PASS custom key hold: 5.4-second OBS holds; Escape stays open; native Enter repeats do not restart capture; genuine release/new press works')
