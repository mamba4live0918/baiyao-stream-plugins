"""Headless acceptance of fufu, real sizes, cards, visual-only progress and baseline pixels."""
from pathlib import Path
import os,json,hashlib
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/2026-10-15-V2.3.2-自测';QA.mkdir(exist_ok=True)
HTML=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve()
OLD=ROOT/'qa/2026-10-15-V2.3-自测/before-v22/红黑破锁-1.html'
THEMES=['horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream']
SDK='window.SonglanPlugin={onGift(cb){window.__gift=cb}};'
results=[]
def check(condition,message):
    if not condition:raise AssertionError(message)
def fresh(browser,settings,viewport,html=HTML,reduced='no-preference'):
    ctx=browser.new_context(viewport=viewport,reduced_motion=reduced)
    ctx.add_init_script(SDK+'localStorage.setItem("red-black-lock-v1:settings",'+json.dumps(json.dumps(settings))+');')
    page=ctx.new_page();page.goto(html.as_uri());page.wait_for_function('typeof window.__gift==="function"');page.evaluate('__gift({giftName:"小心心",count:2})')
    page.wait_for_function('document.querySelectorAll(".chain-arm[data-end-x]").length>=2')
    page.evaluate('document.fonts.ready');page.wait_for_timeout(500)
    return ctx,page
def select(page,box,value):
    parent=page.locator('#'+box)
    if box!='theme':parent.locator('.dom-dropdown-trigger').click()
    parent.locator('button[data-value="'+value+'"]').click()
def contrast(a,b):
    def lum(color):
        vals=[int(color[i:i+2],16)/255 for i in (1,3,5)]
        vals=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals]
        return sum(v*k for v,k in zip(vals,[.2126,.7152,.0722]))
    hi,lo=sorted([lum(a),lum(b)],reverse=True);return (hi+.05)/(lo+.05)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        # Defaults and old settings intentionally migrate to large.
        ctx,page=fresh(browser,{'motion':'off','decayRate':0},{'width':1080,'height':1920})
        check(page.locator('#typing-lock-overlay').get_attribute('data-display-size')=='large','Old settings did not default to large');ctx.close()
        font=json.loads((ROOT/'assets/fonts/fufu-font.json').read_text(encoding='utf-8'));check(font['subset_bytes']<=150*1024,'Font too big')
        check(contrast('#6A4B3C','#FFF8EA')>=4.5 and contrast('#8C3F58','#FFF8EA')>=4.5,'Fufu text contrast failed')
        measurements=[]
        for viewport in [{'width':1920,'height':1080},{'width':1080,'height':1920}]:
            for scene in ['lock','cage']:
                for size in ['standard','large','xlarge']:
                    cfg={'theme':'fufu','motion':'off','decayRate':0,'sceneMode':scene,'challengeMode':'bar','displaySize':size}
                    ctx,page=fresh(browser,cfg,viewport)
                    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.evaluate('document.fonts.ready');page.wait_for_timeout(100)
                    data=page.evaluate('''()=>{const o=document.getElementById('typing-lock-overlay'),q=s=>document.querySelector(s),r=q('.lock-info').getBoundingClientRect();return {size:o.dataset.displaySize,scale:o.style.getPropertyValue('--display-scale'),progress:parseFloat(getComputedStyle(q('#typing-lock-progress')).fontSize),title:parseFloat(getComputedStyle(q('.lock-heading strong')).fontSize),layers:parseFloat(getComputedStyle(q('#typing-lock-layers')).fontSize),rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},whole:o.dataset.sceneWholeLock,clipped:getComputedStyle(q('.lock-shackle')).clipPath}}''')
                    check(data['whole']=='true' and data['clipped']=='none','Fufu ears split/clipped')
                    check(data['rect']['x']>=0 and data['rect']['right']<=viewport['width']+1 and data['rect']['y']>=0 and data['rect']['bottom']<=viewport['height']+1,f'HUD outside canvas: {viewport} {scene} {data}')
                    lace=page.locator('.lock-info').evaluate('e=>e.getBoundingClientRect().bottom-2+parseFloat(getComputedStyle(e,"::after").height)')
                    check(lace<=viewport['height'],'Decorative lace outside canvas')
                    if viewport['height']==1920 and size!='standard':
                        minimum=[26,26,40] if size=='large' else [36,36,56]
                        check(all(data[k]>=v for k,v in zip(['progress','title','layers'],minimum)),f'Font threshold failed: {data}')
                    arms=page.locator('.chain-arm[data-scene-active=true]')
                    check(arms.count()==(4 if scene=='lock' else 2),'Incorrect number of connected chains')
                    for arm in arms.all():
                        x=float(arm.get_attribute('data-end-x'));y=float(arm.get_attribute('data-end-y'))
                        check(0<=x<=viewport['width'] and 0<=y<=viewport['height'],'Chain endpoint outside canvas')
                        start=arm.evaluate('e=>[parseFloat(e.style.getPropertyValue("--scene-arm-x")),parseFloat(e.style.getPropertyValue("--scene-arm-y"))]')
                        r=data['rect'];check(not(r['x']<=start[0]<=r['right'] and r['y']<=start[1]<=r['bottom']),'HUD covers chain origin')
                    # Independently sample the rendered image at each chain endpoint.
                    alphas=page.evaluate(r'''async()=>{const art=document.querySelector('.lock-shackle'),r=art.getBoundingClientRect(),url=getComputedStyle(art).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)[1],im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const scale=Math.min(r.width/im.width,r.height/im.height),left=r.x+(r.width-im.width*scale)/2,top=r.y+(r.height-im.height*scale)/2;return [...document.querySelectorAll('.chain-arm[data-scene-active=true]')].map(a=>{const px=Math.floor((Number(a.dataset.endX)-left)/scale),py=Math.floor((Number(a.dataset.endY)-top)/scale);const d=x.getImageData(px-4,py-4,9,9).data;return Math.max(...Array.from(d).filter((_,i)=>i%4===3));});}''')
                    check(all(a>18 for a in alphas),'Fufu chain missed visible padlock silhouette')
                    check(('拍开门' if scene=='cage' else '啃开锁') in page.locator('.lock-heading').inner_text(),'Mode-specific Fufu title missing')
                    if scene=='cage':check('鼠鼠被关进笼子啦' in page.locator('.scene-captivity').inner_text(),'Cage fufu wording absent')
                    page.screenshot(path=str(QA/f'fufu-{scene}-{viewport["width"]}x{viewport["height"]}-{size}.png'),omit_background=True)
                    measurements.append({'viewport':viewport,'scene':scene,**data});check(not errors,errors);ctx.close()
        (QA/'sizes.json').write_text(json.dumps(measurements,ensure_ascii=False,indent=2),encoding='utf-8');results.append('12 theme/size/viewport combinations')
        # Three exact CSS progress positions, in both challenge modes, with no animation.
        for mode in ['bar','count']:
            ctx,page=fresh(browser,{'theme':'fufu','motion':'off','displaySize':'large','challengeMode':mode,'decayRate':0},{'width':1080,'height':1920})
            positions=[]
            for value in [0,.5,1]:
                position=page.evaluate('''({value,mode})=>{const o=document.getElementById('typing-lock-overlay');o.style.setProperty('--lock-progress',value);const mouse=o.querySelector('.fufu-race-'+mode+' .fufu-mouse');return {x:mouse.getBoundingClientRect().x,visible:mouse.getBoundingClientRect().height,animations:mouse.getAnimations({subtree:true}).length}}''',{'value':value,'mode':mode});positions.append(position['x']);check(position['visible']>0 and position['animations']==0,'Static mouse clipped or bouncing')
            check(positions[0]<positions[1]<positions[2] and abs((positions[0]+positions[2])/2-positions[1])<1,'Mouse progress mapping incorrect')
            ctx.close()
        results.append('bar/count mouse positions 0, 0.5, 1')
        # Preview cards use real controls and native keyboard navigation.
        for viewport,columns in [({'width':1280,'height':900},3),({'width':390,'height':844},2)]:
            ctx,page=fresh(browser,{'theme':'horror','motion':'off','displaySize':'standard' },viewport)
            page.locator('#arena').dblclick(position={'x':90,'y':90})
            cards=page.locator('#theme button');check(cards.count()==9,'Expected nine cards')
            check(cards.first.get_attribute('data-value')=='fufu' and page.locator('.theme-new').count()==0,'Fufu must remain first with no new badge')
            check(page.locator('#theme').evaluate('el=>getComputedStyle(el).gridTemplateColumns.split(" ").length')==columns,'Wrong card columns')
            cards.first.click();check(page.locator('html').get_attribute('data-theme')=='fufu','Card did not select fufu')
            cards.first.press('ArrowRight');check(page.locator('html').get_attribute('data-theme')=='horror','Keyboard did not select next card')
            check('啃开锁' not in page.locator('.lock-heading').inner_text() and '鼠鼠' not in page.locator('.scene-captivity').inner_text(),'Fufu copy leaked to old theme')
            page.locator('#theme [data-value=horror]').press('Home');check(page.locator('html').get_attribute('data-theme')=='fufu','Home did not select fufu')
            page.screenshot(path=str(QA/f'theme-cards-{viewport["width"]}.png'),omit_background=True);ctx.close()
        results.append('9 preview cards, 3/2 columns, click and keyboard')
        # Standard comparison uses the immutable pre-edit V2.2 HTML.
        baseline=[]
        for theme in THEMES:
            cfg={'theme':theme,'motion':'off','decayRate':0,'sceneMode':'lock','challengeMode':'bar','displaySize':'standard'}
            for viewport in [{'width':1920,'height':1080},{'width':1080,'height':1920}]:
                images=[]
                for html,tag in [(OLD,'old'),(HTML,'new')]:
                    ctx,page=fresh(browser,cfg,viewport,html);filename=QA/f'baseline-{theme}-{viewport["width"]}-{tag}.png';page.screenshot(path=str(filename),omit_background=True);images.append(Image.open(filename).convert('RGBA'));ctx.close()
                diff=ImageChops.difference(*images);bbox=diff.convert('RGB').getbbox();alpha_diff=diff.getchannel('A').getbbox();check(bbox is None and alpha_diff is None,f'Standard old theme changed: {theme} {viewport} {bbox} {alpha_diff}');baseline.append({'theme':theme,'viewport':viewport,'different_pixels':0})
        (QA/'standard-comparison.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8');results.append('16 standard visual comparisons match V2.2 exactly')
    finally:browser.close()
(QA/'presentation-result.json').write_text(json.dumps({'passed':len(results),'skipped':0,'failed':0,'checks':results},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS V2.2 presentation: sizes, fufu, mouse progress, cards, contrast/font, standard baselines')
