from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];Q=R/'qa/2026-10-15-V2.3.2-自测';os.environ['TEMP']=os.environ['TMP']=str(Q/'runtime-tmp')
URL=Path(os.environ.get('LOCK_HTML',R/'红黑破锁-1.html')).resolve().as_uri()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 try:
  for w,h in [(1280,720),(960,540),(375,740)]:
   c=b.new_context(viewport={'width':w,'height':h});c.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};localStorage.setItem("red-black-lock-v1:settings",JSON.stringify({mode:"cage",theme:"fufu",motion:"off",displaySize:"standard"}));')
   page=c.new_page();page.goto(URL);page.wait_for_function('typeof gift==="function"');page.evaluate('gift({giftName:"小心心",count:1})');page.evaluate('document.fonts.ready');page.wait_for_timeout(300)
   box=page.locator('.lock-info').bounding_box();lace=page.locator('.lock-info').evaluate('e=>parseFloat(getComputedStyle(e,"::after").height)||0')
   assert box['y']+box['height']+lace<=h+1,{'size':[w,h],'box':box,'lace':lace}
   lock=page.locator('.lock-emblem').bounding_box();assert abs(lock['y']+lock['height']/2-h*2/3)<=3
   c.close()
 finally:b.close()
print('PASS standard cage: lower-third position and complete HUD at 720p, 540p and narrow portrait')
