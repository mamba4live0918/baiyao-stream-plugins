"""Final delivered HTML: all real kits, integrated feedback, canvas bounds and guide evidence."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa/2026-10-15-V2.3.2-自测';TMP=QA/'runtime-tmp';TMP.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(TMP)
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
THEMES=['fufu','horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream'];guide={};measurements=[]
def tap(page,n=1):
    for _ in range(n):page.keyboard.press('Space');page.wait_for_timeout(65)
def fresh(browser,mode='lock',theme='fufu',size='large',motion='off',viewport=None):
    ctx=browser.new_context(viewport=viewport or {'width':1920,'height':1080})
    settings={'sceneMode':'cage' if mode=='cage' else 'lock','challengeMode':'count' if mode=='count' else 'bar','theme':theme,'displaySize':size,'motion':motion,'decayRate':0}
    ctx.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};localStorage.setItem("red-black-lock-v1:settings",'+json.dumps(json.dumps(settings))+');localStorage.setItem("red-black-lock-v1:rules",JSON.stringify([{name:"小心心",kind:"lock",value:1,target:20}]));')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL);page.wait_for_function('typeof gift==="function"');page.evaluate('gift({giftName:"小心心",count:1})');page.evaluate('document.fonts.ready');page.wait_for_timeout(600)
    return ctx,page,errors
def shot(page,name,selector=None):
    path=QA/(name+'.png')
    if selector:page.locator(selector).screenshot(path=str(path),omit_background=True)
    else:page.screenshot(path=str(path),omit_background=True)
    return str(path)
def bounds(page):
    return page.evaluate('''()=>{const r=document.querySelector('.lock-info').getBoundingClientRect(),a=document.querySelector('.lock-hit').getBoundingClientRect();const lace=parseFloat(getComputedStyle(document.querySelector('.lock-info'),'::after').height)||0;return {hud:[r.x,r.y,r.right,r.bottom+lace],hit:[a.x,a.y,a.right,a.bottom],w:innerWidth,h:innerHeight};}''')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        for mode in ['lock','cage','count']:
            for w,h in [(1920,1080),(1080,1920)]:
                ctx,page,errors=fresh(browser,mode,viewport={'width':w,'height':h});tap(page,4)
                assert page.locator('#typing-lock-overlay').get_attribute('data-mode')==mode
                b=bounds(page);assert b['hud'][0]>=0 and b['hud'][2]<=w+1 and b['hud'][3]<=h+1,b
                if mode=='cage':
                    lock=page.locator('.lock-emblem').bounding_box();assert abs(lock['x']+lock['width']/2-w/2)<=2
                    assert page.locator('.cage-door').count()==2
                    assert page.locator('.lock-art').get_attribute('data-bite-count')=='0'
                    assert '拍开门' in page.locator('.lock-heading').inner_text()
                if mode=='count':assert '层' not in page.locator('#typing-lock-overlay').inner_text() and '×' not in page.locator('#typing-lock-overlay').inner_text()
                path=shot(page,f'V2.3-{mode}-{w}x{h}');measurements.append({'mode':mode,'viewport':[w,h],**b})
                if w==1920 and mode=='lock':guide['overview']=path
                if w==1920 and mode=='cage':guide['cage']=path
                assert not errors,errors;ctx.close()
        for theme in THEMES:
            ctx,page,errors=fresh(browser,'cage',theme)
            lock=page.locator('.lock-emblem').bounding_box();assert abs(lock['y']+lock['height']/2-720)<=3,'Theme cage lock misses lower-third position: '+theme
            assert 'data:image/webp' in page.locator('.cage-rail-top .cage-part-mid').evaluate('e=>getComputedStyle(e).backgroundImage')
            arms=page.locator('.chain-arm[data-scene-active=true]').evaluate_all('els=>els.map(e=>({x:Number(e.dataset.endX),y:Number(e.dataset.endY),length:parseFloat(e.style.getPropertyValue("--scene-arm-length")),start:parseFloat(e.style.getPropertyValue("--scene-arm-x"))}))')
            assert len(arms)==2 and abs(arms[0]['length']-arms[1]['length'])<=3,arms
            assert abs(arms[0]['start']+arms[1]['start']-1920)<=2
            shot(page,'V2.3-牢笼-'+theme);assert not errors,errors;ctx.close()
        ctx,page,errors=fresh(browser)
        assert page.locator('.lock-art').get_attribute('data-bite-count')=='0';shot(page,'V2.3-牙印-0')
        tap(page,8);assert page.locator('.lock-art').get_attribute('data-bite-count')=='2';guide['bites']=shot(page,'V2.3-牙印-2')
        tap(page,11);assert page.locator('.lock-art').get_attribute('data-bite-count')=='5';shot(page,'V2.3-牙印-5')
        bitten=page.evaluate(r'''()=>{const art=document.querySelector('.lock-art'),r=document.querySelector('.lock-emblem').getBoundingClientRect(),holes=[...art.style.maskImage.matchAll(/circle at ([\d.]+)px ([\d.]+)px, transparent 0(?:px)?(?:, transparent)? ([\d.]+)px/g)].map(m=>m.slice(1).map(Number));if(holes.length!==5)throw new Error('Expected five parsed masks: '+art.style.maskImage);return [...document.querySelectorAll('.chain-arm[data-scene-active=true]')].some(a=>holes.some(([x,y,radius])=>Math.hypot(Number(a.dataset.endX)-r.x-x,Number(a.dataset.endY)-r.y-y)<radius-.5));}''')
        assert not bitten,'Chain endpoint remains inside a visible bite hole'
        page.evaluate('gift({giftName:"小心心",count:1})');tap(page)
        assert page.locator('.lock-art').get_attribute('data-bite-count')=='0','New layer retained bite mask';ctx.close()
        for mode,theme in [('lock','fufu'),('cage','fufu'),('cage','horror')]:
            ctx,page,errors=fresh(browser,mode,theme,size='xlarge',motion='on')
            page.wait_for_function('document.querySelector("#typing-lock-overlay").dataset.sceneStatus==="held"')
            before=page.locator('.chain-arm[data-scene-active=true]').evaluate_all('els=>els.map(e=>[e.dataset.endX,e.dataset.endY])')
            doors_before=page.locator('.cage-door').evaluate_all('els=>els.map(e=>e.getBoundingClientRect().width)') if mode=='cage' else []
            page.keyboard.press('Space')
            page.evaluate('''()=>{for(const el of document.querySelectorAll('.lock-hit,.cage-door'))for(const a of el.getAnimations()){a.pause();a.currentTime=45;}window.dispatchEvent(new Event('resize'));}''');page.wait_for_timeout(35)
            after=page.locator('.chain-arm[data-scene-active=true]').evaluate_all('els=>els.map(e=>[e.dataset.endX,e.dataset.endY])')
            assert before==after,'Integrated hit moved endpoint anchors'
            b=bounds(page);assert min(b['hit'][0],b['hit'][1])>=0 and b['hit'][2]<=1920 and b['hit'][3]<=1080,b
            if mode=='cage':
                assert page.locator('.door-impact-ripple').count()==1
                doors_after=page.locator('.cage-door').evaluate_all('els=>els.map(e=>e.getBoundingClientRect().width)')
                assert all(a>b+1 for a,b in zip(doors_after,doors_before)),'Slapped doors recede inward instead of bulging toward viewer'
            if mode=='cage' and theme=='fufu':assert page.locator('.door-impact-paw').count()==1
            shot(page,'V2.3-'+('拍门' if mode=='cage' else '受击')+'-'+theme+'-中间帧')
            page.evaluate('document.getAnimations().forEach(a=>a.cancel())');tap(page,12)
            assert page.locator('#lock-fx').evaluate('e=>e.childElementCount')<=90
            assert page.locator('.lock-hit').evaluate('e=>e.getAnimations().length')<=1
            assert not errors,errors;ctx.close()
        # Real menu images, without an active challenge so mode cards may switch.
        ctx=browser.new_context(viewport={'width':1440,'height':1100});ctx.add_init_script('window.SonglanPlugin={onGift(cb){}}')
        page=ctx.new_page();page.goto(URL);page.locator('#arena').dblclick(position={'x':100,'y':100})
        guide['modes']=shot(page,'V2.3-三模式菜单','#mode')
        page.locator('#menu-nav [data-menu-tab=gifts]').click();guide['layer_rules']=shot(page,'V2.3-分层规则','#rules .rule-row:first-child')
        page.locator('#menu-nav [data-menu-tab=play]').click();page.locator('#mode [data-value=count]').click();page.locator('#menu-nav [data-menu-tab=gifts]').click();guide['count_rules']=shot(page,'V2.3-次数规则','#rules .rule-row:first-child');ctx.close()
    finally:browser.close()
(QA/'guide-shots.json').write_text(json.dumps(guide,ensure_ascii=False,indent=2),encoding='utf-8')
(QA/'v23-visual.json').write_text(json.dumps({'cases':measurements,'nine_cages':THEMES,'errors':[]},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS V2.3 integrated visual: six mode/orientation views, nine distinct cages, 0/2/5 bites, centered static endpoints during hits, xlarge safety and rapid tapping')
