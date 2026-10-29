"""V2.3 standalone cage acceptance: real alpha kit, double-door symmetry, static geometry."""
from pathlib import Path
import base64,json,os
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/2026-10-15-V2.3.2-自测'
QA.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(QA)
THEMES=('fufu','horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream')
def data(path):return 'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
css='\n'.join((ROOT/'src'/x).read_text(encoding='utf-8') for x in ('lock.css','arms.css','scenes.css'))
assets=ROOT/'src/cage-assets.css'
if assets.exists():css+=assets.read_text(encoding='utf-8')
html='<!doctype html><html data-theme="fufu"><meta charset="utf-8"><style>'+css+'html,body{margin:0;background:transparent}#typing-lock-overlay{--typing-lock-padlock:url("'+data(ROOT/'assets/themes/fufu-padlock.png')+'");--typing-lock-chain:url("'+data(ROOT/'assets/themes/fufu-chain.png')+'");--lock-art-split:100%;--lock-art-bottom:0%}</style><body>'+(ROOT/'src/overlay.html').read_text(encoding='utf-8')+'<script>'+(ROOT/'src/scenes.js').read_text(encoding='utf-8')+'''</script><script>
settings={mode:'cage',sceneMode:'cage',theme:'fufu',motion:'off'};
overlay=document.getElementById('typing-lock-overlay');overlay.hidden=false;
scenes=LockScenes.create({overlay,getSettings:()=>settings});
scenes.render({layers:3},{totalLayers:3,motion:false});
</script></body></html>'''
harness=QA/'cage-standalone.html';harness.write_text(html,encoding='utf-8')
passed=0
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        page=browser.new_page(viewport={'width':1920,'height':1080});page.goto(harness.as_uri());page.evaluate('scenes.position()')
        for width,height in ((1920,1080),(1080,1920),(375,740)):
            page.set_viewport_size({'width':width,'height':height});page.evaluate('scenes.position()')
            g=page.evaluate('scenes.geometry()')
            box=page.locator('.lock-emblem').bounding_box()
            assert abs(box['x']+box['width']/2-width/2)<=2, 'Cage lock is off center'
            assert page.locator('.cage-door').count()==2,'Cage requires two independent doors'
            assert len(g['arms'])==2 and all(a['alpha']>18 for a in g['arms']),'Chain ends must land on painted alpha'
            assert abs(sum(a['start']['x'] for a in g['arms'])-width)<=2,'Short chain anchor pair is not symmetric'
            assert abs(g['arms'][0]['start']['y']-g['arms'][1]['start']['y'])<=.5
            assert abs(g['arms'][0]['length']-g['arms'][1]['length'])<=3,'Short chains are visibly unbalanced'
            assert max(a['length'] for a in g['arms'])<width*.22,'Cage short chain spans too much screen'
            hud=page.locator('.lock-info').bounding_box();assert abs(hud['x']+hud['width']/2-width/2)<=2
            assert page.locator('.lock-emblem').evaluate('e=>getComputedStyle(e).transform')=='none'
            before=g['arms'];page.evaluate("document.querySelector('.lock-art').animate([{transform:'translate(25px,10px) rotate(4deg)'},{transform:'translate(25px,10px) rotate(4deg)'}],{duration:10000})")
            page.evaluate('scenes.position()');assert page.evaluate('scenes.geometry().arms')==before,'Geometry followed animated inner artwork'
            page.evaluate("document.querySelector('.lock-art').getAnimations().forEach(a=>a.cancel())")
            page.screenshot(path=str(QA/f'cage-centered-{width}x{height}.png'),omit_background=True);passed+=1
        for theme in THEMES:
            image=Image.open(ROOT/f'assets/cage/{theme}-atlas.png');alpha=image.getchannel('A')
            assert alpha.getextrema()[0]==0 and sum(alpha.histogram()[:19])/(image.width*image.height)>.5
            source=ROOT/'assets/themes' if theme=='fufu' else ROOT.parent/'开发资料/typing-ui/scenes/typing-lock/assets'
            page.evaluate("v=>{settings.theme=v.theme;document.documentElement.dataset.theme=v.theme;overlay.style.setProperty('--typing-lock-padlock','url(\"'+v.lock+'\")');overlay.style.setProperty('--typing-lock-chain','url(\"'+v.chain+'\")');}",{'theme':theme,'lock':data(source/f'{theme}-padlock.png'),'chain':data(source/f'{theme}-chain.png')})
            page.set_viewport_size({'width':1920,'height':1080});page.evaluate('scenes.render({layers:3},{totalLayers:3,motion:false});scenes.position()')
            g=page.evaluate('scenes.geometry()');assert all(a['alpha']>18 for a in g['arms']),(theme,'painted shackle connection missing')
            assert abs(g['arms'][0]['length']-g['arms'][1]['length'])<=3,(theme,'short chains unbalanced')
            for kind in ('bar','top','bottom','door'):
                mid=Image.open(ROOT/f'assets/cage/{theme}-{kind}-mid.png')
                first=mid.crop((0,0,mid.width,1) if kind=='bar' else (0,0,1,mid.height))
                last=mid.crop((0,mid.height-1,mid.width,mid.height) if kind=='bar' else (mid.width-1,0,mid.width,mid.height))
                assert first.tobytes()==last.tobytes(),(theme,kind,'repeat RGBA seam mismatch')
            assert 'data:image/' in page.locator('.cage-bar .cage-part-mid').first.evaluate('e=>getComputedStyle(e).backgroundImage'),'Kit bitmap is missing'
            page.screenshot(path=str(QA/f'cage-kit-{theme}.png'),omit_background=True);passed+=1
        page.evaluate("settings.mode='count';scenes.render({},{});");assert page.evaluate('overlay.dataset.scene')=='lock';passed+=1
        page.evaluate("delete settings.mode;settings.sceneMode='cage';scenes.render({},{});");assert page.evaluate('overlay.dataset.scene')=='cage';passed+=1
        page.evaluate('scenes.destroy()')
    finally:browser.close()
print(f'PASS cage_v23: {passed} cases, 0 skipped, 0 failed')
