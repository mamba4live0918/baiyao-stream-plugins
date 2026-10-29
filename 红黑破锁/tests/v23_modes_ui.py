"""Three real modes, independent configuration and an endless additive count round."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];QA=Path(os.environ.get('LOCK_QA',ROOT/'qa/2026-10-16-V2.3.3-自测'));TMP=QA/'runtime-tmp';TMP.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(TMP)
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        context=browser.new_context(viewport={'width':1920,'height':1080},accept_downloads=True)
        context.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};')
        page=context.new_page();page.goto(URL);page.wait_for_function('typeof gift==="function"')
        page.locator('#arena').dblclick(position={'x':100,'y':100})
        assert page.locator('#mode button').count()==3,'Three mode cards missing'
        assert page.locator('.theme-new').count()==0,'New badge retained'
        assert page.locator('#scene-mode,#challenge-mode').count()==0,'Legacy paired mode selectors retained'
        page.locator('#mode [data-value=count]').click()
        assert page.locator('#decay-settings').is_hidden(),'Count mode exposes decay'
        page.locator('#menu-nav [data-menu-tab=gifts]').click()
        row=page.locator('#rules .rule-row').first
        assert row.locator('.rule-target-range').is_hidden()
        assert '层' not in row.inner_text(),'Count rules expose layers'
        # Set an explicit three presses per gift through the actual input controls.
        for side in ['max','min']:
            field=row.locator('.rule-value-'+side);field.fill('3');field.dispatch_event('change')
        page.locator('#settings-close').click();page.evaluate('gift({giftName:"小心心",count:2})')
        page.wait_for_function('document.querySelector("#lock-remaining-hits").textContent==="6"')
        overlay=page.locator('#typing-lock-overlay');assert '层' not in overlay.inner_text() and '×' not in overlay.inner_text()
        page.keyboard.press('Space');page.wait_for_timeout(80)
        assert page.locator('#lock-remaining-hits').inner_text()=='5'
        page.locator('#arena').dblclick(position={'x':100,'y':100});page.locator('#menu-nav [data-menu-tab=demo]').click()
        page.locator('#simulate-factor').fill('2');page.locator('#simulate-multiply').click()
        assert page.locator('#lock-remaining-hits').inner_text()=='10'
        page.locator('#simulate-points').fill('3');page.locator('#simulate-relief').click()
        assert page.locator('#lock-remaining-hits').inner_text()=='7'
        page.locator('#simulate-seconds').fill('1');page.locator('#simulate-freeze').click();page.locator('#settings-close').click()
        page.keyboard.press('Space');page.wait_for_timeout(80)
        assert page.locator('#lock-remaining-hits').inner_text()=='7','Frozen key reduced count'
        page.wait_for_timeout(1050);page.keyboard.press('Space');page.wait_for_timeout(80)
        assert page.locator('#lock-remaining-hits').inner_text()=='6'
        assert abs(overlay.evaluate('e=>Number(e.style.getPropertyValue("--lock-progress"))')-.25)<.001
        page.locator('#arena').dblclick(position={'x':100,'y':100});page.locator('#menu-nav [data-menu-tab=play]').click()
        page.locator('#mode [data-value=cage]').click()
        assert page.locator('#mode [data-value=count]').get_attribute('aria-checked')=='true'
        assert '当前还有挑战' in page.locator('#toast').inner_text()
        page.locator('#settings-close').click();page.evaluate('gift({giftName:"破锁钥匙",count:1})')
        # A new gift during exit must start another round, surviving the old exit timer.
        page.evaluate('gift({giftName:"小心心",count:1})');page.wait_for_timeout(1200)
        assert overlay.is_visible() and page.locator('#lock-remaining-hits').inner_text()=='3'
        assert page.locator('#lock-total-hits').inner_text()=='0'
        page.evaluate('gift({giftName:"破锁钥匙",count:1})');page.wait_for_timeout(1100)
        page.locator('#arena').dblclick(position={'x':100,'y':100});page.locator('#mode [data-value=lock]').click()
        page.locator('#menu-nav [data-menu-tab=gifts]').click()
        assert page.locator('#rules .rule-row').first.locator('.rule-value-min').input_value()=='1','Count edit leaked to lock rules'
        page.locator('#menu-nav [data-menu-tab=play]').click();page.locator('#mode [data-value=count]').click()
        page.locator('#menu-nav [data-menu-tab=gifts]').click()
        assert page.locator('#rules .rule-row').first.locator('.rule-value-min').input_value()=='3'
        page.reload();page.locator('#arena').dblclick(position={'x':100,'y':100})
        assert page.locator('#mode [data-value=count]').get_attribute('aria-checked')=='true'
        page.locator('#menu-nav [data-menu-tab=backup]').click()
        with page.expect_download() as d:page.locator('#export-settings').click()
        payload=json.loads(Path(d.value.path()).read_text(encoding='utf-8'))
        assert set(payload['modes']['profiles'])=={'lock','cage','count'}
        context.close()
    finally:browser.close()
print('PASS V2.3 mode UI: cards, isolation, count arithmetic, active guard, exit restart, refresh and backup')
