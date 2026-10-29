"""Mode-specific gift forms: visible semantics, saved previews and isolated edits."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
QA=Path(os.environ.get('LOCK_QA',ROOT/'qa/2026-10-16-V2.3.3-自测')); QA.mkdir(exist_ok=True)
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        page=browser.new_page(viewport={'width':1280,'height':1000})
        errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
        page.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}}')
        page.goto(URL);page.locator('#arena').dblclick(position={'x':100,'y':100})
        for mode,nav,value,target,example in [
            ('lock','进度礼物','每份礼物加几条进度','每条进度按几次','增加 1 条进度'),
            ('cage','关笼礼物','每份礼物加几道封锁','每道封锁拍门几次','增加 1 道封锁'),
            ('count','次数礼物','每份礼物增加多少次',None,'增加 60 次')]:
            page.locator('#menu-nav [data-menu-tab=play]').click()
            page.locator('#mode [data-value='+mode+']').click()
            tab=page.locator('#menu-nav [data-menu-tab=gifts]')
            assert tab.inner_text()==nav
            assert page.locator('#mode [data-value='+mode+'] strong').inner_text()=={'lock':'多条进度','cage':'牢笼拍门','count':'累计次数'}[mode]
            tab.click();row=page.locator('#rules .rule-row').first
            assert value in row.locator('.rule-value-range').inner_text()
            assert row.locator('.rule-value-min').get_attribute('aria-label')==value+'下限'
            assert example in row.locator('.rule-outcome').inner_text()
            assert '只修改' in page.locator('#rules-scope').inner_text()
            if target:assert target in row.locator('.rule-target-range').inner_text()
            else:
                assert row.locator('.rule-target-range').is_hidden()
                assert '层' not in row.inner_text() and '封锁' not in row.inner_text()
            page.screenshot(path=str(QA/('after-'+mode+'.png')))
        row.locator('.rule-value-min').fill('7');row.locator('.rule-value-min').dispatch_event('change')
        row.locator('.rule-value-max').fill('7');row.locator('.rule-value-max').dispatch_event('change')
        assert '增加 7 次' in row.locator('.rule-outcome').inner_text()
        page.locator('#menu-nav [data-menu-tab=play]').click();page.locator('#mode [data-value=cage]').click()
        page.locator('#menu-nav [data-menu-tab=gifts]').click();row=page.locator('#rules .rule-row').first
        assert row.locator('.rule-value-min').input_value()=='1'
        row.locator('.rule-value-max').fill('3');row.locator('.rule-value-max').dispatch_event('change')
        assert '随机 1～3 道封锁' in row.locator('.rule-outcome').inner_text()
        row.locator('.rule-choice .dom-dropdown-trigger').click();row.locator('[data-value=relief]').click()
        assert '抵扣拍门次数' in row.locator('.rule-choice .dom-dropdown-trigger').inner_text()
        assert '抵扣 60 次拍门' in row.locator('.rule-outcome').inner_text()
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(QA/'after-mobile.png'))
        assert page.locator('#settings').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        assert row.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        page.reload();page.locator('#arena').dblclick(position={'x':70,'y':70})
        page.locator('#mode [data-value=count]').click();page.locator('#menu-nav [data-menu-tab=gifts]').click()
        assert '增加 7 次' in page.locator('.rule-outcome').first.inner_text()
        assert not errors,errors
    finally:browser.close()
print('PASS mode gift menu: three distinct forms, truthful previews, range, assistance, isolation, reload, mobile, no page errors')
