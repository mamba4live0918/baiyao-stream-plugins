"""Cage lower-third placement and editable examples round-trip through real UI/storage."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];Q=R/'qa/2026-10-15-V2.3.2-自测';T=Q/'runtime-tmp';T.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(T)
URL=Path(os.environ.get('LOCK_HTML',R/'红黑破锁-1.html')).resolve().as_uri()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 try:
  for w,h in [(1920,1080),(1080,1920)]:
   c=b.new_context(viewport={'width':w,'height':h},accept_downloads=True)
   c.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};if(!sessionStorage.seeded){sessionStorage.seeded=1;localStorage.setItem("red-black-lock-v1:settings",JSON.stringify({mode:"cage",theme:"fufu",motion:"off",decayRate:0}));}')
   page=c.new_page();page.goto(URL);page.wait_for_function('typeof gift==="function"');page.evaluate('gift({giftName:"小心心",count:1})');page.evaluate('document.fonts.ready');page.wait_for_timeout(300)
   for size in ['standard','large','xlarge']:
    page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#display-size .dom-dropdown-trigger').click();page.locator('#display-size [data-value='+size+']').click();page.locator('#settings-close').click();page.wait_for_timeout(200)
    rect=page.locator('.lock-emblem').bounding_box();assert abs(rect['x']+rect['width']/2-w/2)<=2
    assert abs(rect['y']+rect['height']/2-h*2/3)<=3,'Cage lock not at lower-third boundary'
    hud=page.locator('.lock-info').bounding_box();assert hud['y']>=rect['y']+rect['height'] and hud['y']+hud['height']<=h
    page.screenshot(path=str(Q/f'cage-lower-{w}-{size}.png'),omit_background=True)
   page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#menu-nav [data-menu-tab=art]').click()
   page.locator('#cage-custom-settings summary').first.click()
   for kind in ['chain','lock','cageBar','cageTop','cageBottom','cageDoor','cageLatch']:
    row=page.locator('.custom-art-row[data-art-kind='+kind+']');assert row.is_visible()
    row.locator('.art-example summary').click()
    with page.expect_download() as d:row.locator('[data-example-download]').click()
    path=T/(kind+'.png');d.value.save_as(path)
    assert path.stat().st_size>100 and path.stat().st_size<=5*1024*1024
    if kind=='lock':row.screenshot(path=str(Q/'menu-lock-example.png'))
    row.locator('input[type=file]').set_input_files(str(path));page.wait_for_function('(kind)=>document.querySelector(".custom-art-row[data-art-kind="+kind+"] .custom-art-name").textContent.includes("自定义：")',arg=kind)
   page.screenshot(path=str(Q/f'cage-custom-menu-{w}.png'),full_page=True)
   row=page.locator('.custom-art-row[data-art-kind=cageBar]');previous=row.locator('.custom-art-name').inner_text()
   row.locator('input[type=file]').set_input_files(str(T/'lock.png'));page.wait_for_function('document.querySelector("#toast").textContent.includes("竖长图片")')
   assert row.locator('.custom-art-name').inner_text()==previous,'Wrong-shape upload replaced healthy cage bar'
   page.locator('#settings-close').click();page.reload();page.wait_for_function('document.querySelector("#typing-lock-overlay").dataset.customCage==="true"')
   assert page.locator('.cage-part-mid').first.evaluate('e=>getComputedStyle(e).backgroundImage').startswith('url("blob:')
   page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#menu-nav [data-menu-tab=backup]').click()
   with page.expect_download() as d:page.locator('#export-settings').click()
   backup=T/('backup-'+str(w)+'.json');d.value.save_as(backup);data=json.loads(backup.read_text(encoding='utf-8'));assert len(data['customArt']['items'])==7
   c.close()
   c=b.new_context(accept_downloads=True);c.add_init_script('window.SonglanPlugin={onGift(){}}');page=c.new_page();page.goto(URL);page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#menu-nav [data-menu-tab=backup]').click();page.locator('#import-file').set_input_files(str(backup));page.locator('#import-preview').wait_for();page.locator('#import-confirm').click();page.wait_for_function('document.querySelector("#typing-lock-overlay").dataset.customCage==="true"')
   page.locator('#menu-nav [data-menu-tab=art]').click();page.locator('#cage-custom-settings summary').first.click();page.locator('.custom-art-row[data-art-kind=cageBar]').get_by_role('button',name='恢复默认').click();page.wait_for_function('document.querySelector("#typing-lock-overlay").style.getPropertyValue("--custom-cage-bar-mid")===""');assert page.locator('#typing-lock-overlay').get_attribute('data-custom-cage')=='true';c.close()
 finally:b.close()
print('PASS cage lower-third, seven PNG examples, upload/reload and backup import')
