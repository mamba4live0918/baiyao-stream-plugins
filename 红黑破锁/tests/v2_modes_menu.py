"""V2 standalone browser acceptance through real menu and popup controls.

Browser plugin not available in this session; the existing bundled Playwright
workflow opens the actual local HTML directly, with a fresh browser profile.
This file intentionally does not use the legacy ui_v2 navigation adapter.
"""
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
import json
import os
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
HTML=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve()
SHOTS=Path(gettempdir())/'red-black-lock-v2-qa'
SHOTS.mkdir(exist_ok=True)
SDK="window.SonglanPlugin={onGift(cb){window.__gift=cb;}};"


def check(condition,message):
    if not condition:
        raise AssertionError(message)


def settings(page):
    return page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')||'{}')")


def saved(page):
    return page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:state')||'{}')")


def open_settings(page):
    page.locator('#arena').dblclick(position={'x':100,'y':100})
    page.locator('#settings').wait_for()


def nav(page,tab):
    page.locator(f'#menu-nav [data-menu-tab="{tab}"]').click()
    check(page.locator('#settings').get_attribute('data-page')==tab,f'{tab} navigation did not select its page')
    check(page.evaluate("tab=>[...document.querySelectorAll('#settings [data-menu-page]')].every(el=>el.hidden===(el.dataset.menuPage!==tab))",tab),f'{tab} navigation has mixed page visibility')


def choose(box,value):
    if box.get_attribute('id') in ['theme','mode']:
        box.locator(f'button[data-value="{value}"]').click();return
    box.locator('.dom-dropdown-trigger').click()
    box.locator('.dom-dropdown-list').wait_for(state='visible')
    box.locator(f'button[data-value="{value}"]').click()


def edit(field,value):
    field.fill(str(value));field.dispatch_event('change')


def set_range(row,kind,low,high=None):
    high=low if high is None else high
    lo=row.locator(f'.rule-{kind}-min');hi=row.locator(f'.rule-{kind}-max')
    if low>float(hi.input_value()):edit(hi,high);edit(lo,low)
    else:edit(lo,low);edit(hi,high)


def tap(page,times=1):
    for _ in range(times):
        page.keyboard.down('Space');page.wait_for_timeout(35);page.keyboard.up('Space');page.wait_for_timeout(50)


def gift(page,name,count,identity):
    page.evaluate("event=>__gift(event)",{'giftName':name,'count':count,'eventId':identity})


def context_page(browser,viewport):
    context=browser.new_context(viewport=viewport,accept_downloads=True)
    context.add_init_script(SDK)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(HTML.as_uri())
    check(page.title()=='红黑破锁 · 独立直播互动插件','Wrong plugin page')
    check(page.evaluate('typeof window.LockMenu')=='object','V2 menu API is missing')
    check(page.locator('#arena').count()==1,'Plugin first screen is blank')
    page.wait_for_function('typeof window.__gift==="function"')
    return context,page,errors


with TemporaryDirectory() as temporary,sync_playwright() as p:
    temporary=Path(temporary);browser=p.chromium.launch(headless=True)
    for viewport in ({'width':1280,'height':900},{'width':390,'height':844}):
        context,page,errors=context_page(browser,viewport)
        open_settings(page)
        for tab in ('art','gifts','demo','backup','play'):
            nav(page,tab)
        check(page.locator('#settings select').count()==0,'Menu contains a native popup select')
        readable=page.locator('#settings .dom-dropdown-trigger').first.evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')
        check(readable>=16,f'Menu selector font is too small: {readable}')
        nav(page,'play');theme=page.locator('#theme')
        choose(theme,'cream');check(settings(page)['theme']=='cream','Real theme dropdown selection was not saved')
        theme.locator('button[data-value="cream"]').press('Home')
        check(settings(page)['theme']=='fufu','Theme cards Home did not select first card')
        theme.locator('button[data-value="fufu"]').press('ArrowRight')
        check(settings(page)['theme']=='horror','Theme card arrow did not select next theme')
        # Other settings keep their DOM dropdown and keyboard behavior.
        popup=page.locator('#motion');popup.locator('.dom-dropdown-trigger').click()
        page.keyboard.press('Home');page.keyboard.press('Enter')
        check(settings(page)['motion']=='on','Home/Enter did not choose a dropdown option')
        popup.locator('.dom-dropdown-trigger').click();page.keyboard.press('Escape')
        check(popup.locator('.dom-dropdown-list').is_hidden() and page.locator('#settings').is_visible(),'Escape did not close only dropdown')
        popup.locator('.dom-dropdown-trigger').click();page.keyboard.press('Tab')
        check(popup.locator('.dom-dropdown-list').is_hidden(),'Tab left popup open')
        check(popup.locator('.dom-dropdown-trigger').evaluate('el=>el!==document.activeElement'),'Tab trapped focus')
        popup.locator('.dom-dropdown-trigger').click();page.locator('#settings .settings-head h2').click()
        check(popup.locator('.dom-dropdown-list').is_hidden(),'Outside click left popup open')
        popup.locator('.dom-dropdown-trigger').click();box=popup.locator('.dom-dropdown-list').bounding_box()
        check(box['x']>=0 and box['y']>=0 and box['x']+box['width']<=viewport['width']+1 and box['y']+box['height']<=viewport['height']+1,'Popup outside viewport')
        page.screenshot(path=str(SHOTS/f"menu-{viewport['width']}.png"),omit_background=True)
        page.set_viewport_size({'width':viewport['width']-10,'height':viewport['height']});popup.locator('.dom-dropdown-list').wait_for(state='hidden',timeout=1500)
        page.locator('#settings-close').click();check(page.locator('#settings').is_hidden(),'Settings close button failed')
        check(not errors,f'Menu page errors: {errors}');context.close()

    context,page,errors=context_page(browser,{'width':1280,'height':900})
    open_settings(page);nav(page,'play')
    choose(page.locator('#display-size'),'standard') # Preserve V2.1 geometry for this legacy transparency assertion.
    choose(page.locator('#mode'),'cage');choose(page.locator('#motion'),'off');choose(page.locator('#decay-presets'),'0')
    nav(page,'gifts')
    check(page.locator('#multiplier-levels,#target-pool').count()==0,'Removed central profiles are still shown')
    lock=page.locator('#rules .rule-row').first
    set_range(lock,'target',3);set_range(lock,'value',2);set_range(lock,'factor',2)
    set_range(page.locator('#rules .rule-row').nth(3),'value',1)
    page.locator('#add-rule').click();reinforce=page.locator('#rules .rule-row').last
    edit(reinforce.locator('.gift-name'),'加固')
    choose(reinforce.locator('.rule-main .choice-grid'),'multiply')
    set_range(reinforce,'value',1);set_range(reinforce,'factor',2)
    page.locator('#settings-close').click();gift(page,'小心心',1,'lock')
    lock_state=saved(page)['lock']
    check(lock_state['target']==6 and lock_state['challengeMode']=='bar','Count gift did not use the multiplier snapshot')
    check(page.locator('#typing-lock-overlay').get_attribute('data-scene')=='cage','Cage scene was not selected')
    check(page.locator('#lock-counter').is_hidden() and page.locator('#typing-lock-meter').is_visible(),'Count scene still uses the progress meter')
    tap(page,2);check(saved(page)['lock']['totalHits']==2,'Actual presses did not increment the cumulative count')
    page.wait_for_timeout(1100);check(saved(page)['lock']['progress']==2,'Count mode decayed after stopping')
    check('2 / 6' in page.locator('#typing-lock-progress').inner_text(),'Layer progress HUD disagrees with actual taps')
    gift(page,'破锁钥匙',1,'relief');check(saved(page)['lock']['totalHits']==2,'Relief forged cumulative key presses')
    page.keyboard.down('Space');page.wait_for_timeout(40)
    page.evaluate("document.getElementById('arena').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',keyCode:32,repeat:true,bubbles:true}))")
    page.keyboard.up('Space');page.wait_for_timeout(55)
    check(saved(page)['lock']['totalHits']==3,'Repeat keydown was counted as another tap')
    gift(page,'加固',1,'multiply');lock_state=saved(page)['lock']
    check([lock_state['target'],lock_state['progress'],lock_state['relief'],lock_state['totalHits']]==[8,3,1,3],'Reinforce reset existing work or scaled completed points')
    page.reload();check([saved(page)['lock'][field] for field in ('target','progress','relief','totalHits')]==[8,3,1,3],'Refresh changed count or reinforced work')
    page.screenshot(path=str(SHOTS/'cage-count.png'),omit_background=True)
    cage_image=Image.open(SHOTS/'cage-count.png').convert('RGBA')
    clear_fraction=sum(cage_image.getchannel('A').histogram()[:5])/(cage_image.width*cage_image.height)
    check(cage_image.getpixel((5,5))[3]==0 and clear_fraction>.35,'Cage gaps or page background are opaque')
    open_settings(page);nav(page,'gifts')
    set_range(page.locator('#rules .rule-row').first,'factor',3)
    check(saved(page)['lock']['target']==8 and saved(page)['lock']['multiplier']==4,'Editing the row factor rewrote queued difficulty')
    page.locator('#settings-close').click();gift(page,'小心心',1,'later-count')
    gift(page,'破锁钥匙',4,'finish-current');check(saved(page)['lock']['target']==12,'Reinforced later layer did not keep its full target')
    check(saved(page)['lock']['totalHits']==3,'Layer completion erased cumulative taps')
    open_settings(page);nav(page,'play');choose(page.locator('#mode'),'count')
    check(page.locator('#mode [data-value=cage]').get_attribute('aria-checked')=='true','Active cage allowed mode replacement')
    page.locator('#settings-close').click()
    check(saved(page)['lock']['challengeMode']=='bar','Rejected mode switch rewrote active challenge')
    gift(page,'小心心',1,'later-bar');gift(page,'破锁钥匙',12,'next-batch')
    check(saved(page)['lock']['target']==9,'Later layer lost multiplier snapshot')
    gift(page,'破锁钥匙',18,'bar-batch')
    check(page.locator('#typing-lock-meter').is_visible() and page.locator('#lock-counter').is_hidden(),'Layer mode uses wrong HUD')
    gift(page,'破锁钥匙',100,'escape');page.locator('#typing-lock-overlay').wait_for(state='hidden')
    check(saved(page)['lock'] is None,'Escape left unfinished state')
    open_settings(page);nav(page,'backup')
    with page.expect_download() as download:
        page.locator('#export-settings').click()
    backup=temporary/'v2-settings.json';download.value.save_as(backup)
    payload=json.loads(backup.read_text(encoding='utf8'))
    check(payload['settings']['sceneMode']=='cage' and payload['rules'][0]['multiplierMin']==payload['rules'][0]['multiplierMax']==3,'Backup omitted the V2 scene or per-rule factor')
    check(any(rule['kind']=='multiply' for rule in payload['rules']),'Backup omitted multiply gift rules')
    check(not errors,f'Count/cage browser errors: {errors}');context.close()

    context,page,errors=context_page(browser,{'width':1100,'height':850})
    open_settings(page);nav(page,'backup');page.locator('#import-file').set_input_files(str(backup))
    page.locator('#import-preview').wait_for(state='visible');page.locator('#import-cancel').click()
    check(saved(page).get('lock') is None and settings(page).get('sceneMode','lock')=='lock','Cancelled V2 import changed gameplay settings')
    page.locator('#import-file').set_input_files(str(backup));page.locator('#import-preview').wait_for(state='visible')
    page.locator('#import-confirm').click();page.wait_for_function("JSON.parse(localStorage.getItem('red-black-lock-v1:rules')||'[]')[0]?.multiplierMin===3")
    page.reload();check(settings(page)['sceneMode']=='cage' and page.evaluate("JSON.parse(localStorage.getItem('red-black-lock-v1:rules'))[0].multiplierMax")==3,'Imported V2 settings did not survive refresh')
    check(not errors,f'V2 import browser errors: {errors}');context.close()

    # Verify the delivered HTML's scene animation, not only the source harness.
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    context.add_init_script(SDK);page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)));page.goto(HTML.as_uri())
    open_settings(page);nav(page,'play')
    choose(page.locator('#mode'),'cage');choose(page.locator('#motion'),'on');choose(page.locator('#decay-presets'),'0')
    nav(page,'demo');page.locator('#simulate-target').fill('1');page.locator('#simulate-layers').fill('1');page.locator('#simulate-lock').click()
    page.locator('#settings-close').click();overlay=page.locator('#typing-lock-overlay')
    check(overlay.get_attribute('data-cage-phase')=='frame','Delivered cage animation skipped its frame phase')
    check(page.locator('.cage-door').first.evaluate('el=>getComputedStyle(el).animationName')!='none','Explicit cage animation was suppressed by system reduced motion')
    for phase in ('bars','door','bolt','closed'):
        page.wait_for_function('phase=>document.getElementById("typing-lock-overlay").dataset.cagePhase===phase',arg=phase,timeout=1600)
    phone_hud=page.locator('.lock-info').bounding_box()
    check(phone_hud['x']>=0 and phone_hud['x']+phone_hud['width']<=390,'Delivered mobile cage HUD is clipped')
    check(page.evaluate("[document.documentElement,document.body,document.querySelector('.scene-cage'),document.querySelector('.cage-door')].every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)')"),'Delivered cage paints an opaque scene or page background')
    page.screenshot(path=str(SHOTS/'cage-count-mobile.png'),omit_background=True)
    tap(page)
    check(page.locator('#lock-remaining-hits').inner_text()=='0' and page.locator('#lock-total-hits').inner_text()=='1','Successful exit still displays remaining work or loses the final tap')
    overlay.wait_for(state='hidden',timeout=2000)
    check(overlay.get_attribute('data-cage-phase')=='open','Delivered cage did not open after the final genuine tap')
    check(saved(page)['lock'] is None,'Delivered animated cage did not save completion')

    # Aid completion also retains real taps throughout the visible exit animation.
    open_settings(page);nav(page,'demo');page.locator('#simulate-target').fill('10');page.locator('#simulate-lock').click();page.locator('#settings-close').click()
    tap(page,5);check(saved(page)['lock']['totalHits']==5,'Second round did not start its own actual tap count')
    page.reload();open_settings(page);nav(page,'demo');page.locator('#simulate-points').fill('5');page.locator('#simulate-relief').click();page.locator('#settings-close').click()
    check(saved(page)['lock'] is None,'Aid did not finish the remaining five presses')
    check(page.locator('#lock-total-hits').inner_text()=='5' and page.locator('#lock-remaining-hits').inner_text()=='0','Aid after refresh erased cumulative taps or retained remaining work during exit')
    check('5' in page.locator('.scene-captivity').inner_text(),'Cage exit caption disagrees with preserved real taps')
    overlay.wait_for(state='hidden',timeout=2000)
    check(not errors,f'Delivered cage animation browser errors: {errors}');context.close();browser.close()
print(f'PASS V2: real menu tabs/popups/keyboard/mobile; count + relief + reinforce + snapshots + refresh; cage transparency/escape; per-rule factors and backup. Screenshots: {SHOTS}')
