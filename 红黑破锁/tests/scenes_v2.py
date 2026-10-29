"""V2 planar scenes: visible-edge chain geometry, cage stages, transparency and resizing."""
from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import io
import os
import shutil
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT=Path(__file__).resolve().parents[1]


def check(condition,message):
    if not condition:raise AssertionError(message)


def fixture(wide=False):
    image=Image.new('RGBA',(360,200) if wide else (200,300))
    pen=ImageDraw.Draw(image)
    if wide:
        pen.rounded_rectangle((40,35,310,165),radius=30,fill='#bb7958',outline='#fff2ce',width=5)
    else:
        pen.rounded_rectangle((60,125,145,260),radius=15,fill='#bc7753',outline='#ffdca0',width=5)
        pen.arc((75,30,133,170),180,360,fill='#ffe9b9',width=18)
        pen.line((76,97,76,145),fill='#ffe9b9',width=18);pen.line((133,97,133,145),fill='#ffe9b9',width=18)
    out=io.BytesIO();image.save(out,format='PNG');return 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()


def transparent_fraction(path):
    image=Image.open(path).convert('RGBA');alpha=image.getchannel('A')
    return sum(alpha.histogram()[:5])/(image.width*image.height)


with TemporaryDirectory() as tmp,sync_playwright() as p:
    source=ROOT/'src/scenes.js';check(source.is_file(),'V2 scenes module does not exist yet')
    css=(ROOT/'src/lock.css').read_text(encoding='utf-8')+(ROOT/'src/arms.css').read_text(encoding='utf-8')+(ROOT/'src/scenes.css').read_text(encoding='utf-8')+(ROOT/'src/cage-assets.css').read_text(encoding='utf-8')
    html=Path(tmp)/'scenes.html'
    html.write_text('<!doctype html><html data-theme="horror"><meta charset="utf-8"><style>'+css+
      'html,body{margin:0;background:transparent!important}#typing-lock-overlay{--typing-lock-padlock:url("'+fixture()+'");--typing-lock-chain:linear-gradient(90deg,#aa714d,#f2ce99,#865a40);--lock-thickness:42px}'+
      '@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}</style><body>'+
      (ROOT/'src/overlay.html').read_text(encoding='utf-8')+'<script>'+source.read_text(encoding='utf-8')+'</script><script>'+'''
      window.settings={sceneMode:'lock',challengeMode:'bar',motion:'on'};
      window.scenes=LockScenes.create({overlay:document.getElementById('typing-lock-overlay'),getSettings:()=>settings});
      document.getElementById('typing-lock-overlay').hidden=false;
      window.state={layers:10,target:50,progress:10,totalHits:123};
      window.draw=(motion=true)=>scenes.render(state,{totalLayers:10,remaining:40,totalHits:123,motion});
      draw(false);</script></body></html>''',encoding='utf-8')
    browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1280,'height':800});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.goto(html.as_uri());page.evaluate('scenes.position()')
    geometry=page.evaluate('scenes.geometry()')
    check(geometry['mode']=='lock' and len(geometry['arms'])==4,'Lock scene does not have four separate arms')
    for arm in geometry['arms']:
        check(arm['alpha']>8,'Chain endpoint missed the painted lock edge')
        box=geometry['lockBounds'];cx=(box['left']+box['right'])/2;cy=(box['top']+box['bottom'])/2
        check(abs(arm['end']['x']-cx)>box['width']*.2 or abs(arm['end']['y']-cy)>box['height']*.2,'Chain passes through lock center')
    before=page.locator('.lock-emblem').bounding_box()
    page.evaluate("document.querySelector('.lock-emblem').animate([{transform:'translate(30px,20px)'},{transform:'translate(-30px,-20px)'}],{duration:1000,iterations:Infinity})")
    page.wait_for_timeout(60);after=page.locator('.lock-emblem').bounding_box()
    check(abs(before['x']-after['x'])<.5 and abs(before['y']-after['y'])<.5,'Locked artwork floats away from chain endpoints')
    check(page.locator('.lock-center').evaluate('(e)=>getComputedStyle(e).animationName')=='none','Old lockWeight still makes lock float')
    page.screenshot(path=str(Path(tmp)/'lock.png'),omit_background=True)
    check(transparent_fraction(Path(tmp)/'lock.png')>.50,'Lock scene paints the transparent stream canvas')
    check(page.locator('.lock-emblem').evaluate("e=>getComputedStyle(e,'::after').content")=='none','Legacy emblem ring remains behind actual lock artwork')
    chain_asset='data:image/png;base64,'+base64.b64encode((ROOT/'assets/materials-v2/forged-steel-chain.png').read_bytes()).decode()
    page.evaluate("url=>{let e=document.getElementById('typing-lock-overlay');e.dataset.material='forged-steel';e.style.setProperty('--typing-lock-chain','url(\"'+url+'\")');return scenes.applyStyle();}",chain_asset)
    texture=page.evaluate(r'''async()=>{const value=getComputedStyle(document.getElementById('typing-lock-overlay')).getPropertyValue('--scene-chain-image').trim();
      if(!value)return null;const url=value.match(/^url\(["']?(.*?)["']?\)$/)[1],image=new Image();image.src=url;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);
      const p=x.getImageData(0,0,c.width,c.height).data;let shared=0;
      for(let y=0;y<c.height;y++)if(p[y*c.width*4+3]>18&&p[(y*c.width+c.width-1)*4+3]>18)shared++;
      return {width:c.width,height:c.height,shared};}''')
    check(texture and texture['width']<2172 and texture['shared']>texture['height']*.08,'Builtin chain tile does not join through matching visible links')
    for material in ('antique-brass','arcane-anime','candy-toon'):
        data='data:image/png;base64,'+base64.b64encode((ROOT/f'assets/materials-v2/{material}-chain.png').read_bytes()).decode()
        page.evaluate("args=>{let e=document.getElementById('typing-lock-overlay');e.dataset.material=args.material;e.style.setProperty('--typing-lock-chain','url(\"'+args.url+'\")');return scenes.applyStyle();}",{'material':material,'url':data})
        edges=page.evaluate(r'''async()=>{const value=getComputedStyle(document.getElementById('typing-lock-overlay')).getPropertyValue('--scene-chain-image').trim();if(!value)return null;
          const image=new Image();image.src=value.match(/^url\(["']?(.*?)["']?\)$/)[1];await image.decode();
          const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const p=x.getImageData(0,0,c.width,c.height).data;let shared=0;
          for(let y=0;y<c.height;y++)if(p[y*c.width*4+3]>18&&p[(y*c.width+c.width-1)*4+3]>18)shared++;return{height:c.height,shared};}''')
        check(edges and edges['shared']>edges['height']*.08,material+' chain tile has no physically shared alpha seam')

    # Different art proportions recompute all four endpoints against the visible silhouette.
    page.evaluate('(url)=>scenes.applyStyle({padlock:url,wholeLock:true})',fixture(True));page.evaluate('scenes.position()')
    wide=page.evaluate('scenes.geometry()')
    check(wide['lockBounds']['width']>wide['lockBounds']['height'],'Wide lock did not use its alpha/contain aspect')
    check(all(x['alpha']>8 for x in wide['arms']),'New style left stale chain endpoints')
    page.set_viewport_size({'width':375,'height':740});page.evaluate('scenes.position()')
    small=page.evaluate('scenes.geometry()');check(small['lockBounds']['right']<375,'Mobile lock overflows')
    check(all(x['alpha']>8 for x in small['arms']),'Mobile chain endpoints detached')

    # The planar cage closes in four distinct stages and its gaps remain transparent.
    # Mirror the app's first-gift order: refresh motion, entrance, then render.
    page.evaluate("window.cagePhases=[];new MutationObserver(()=>cagePhases.push(document.getElementById('typing-lock-overlay').dataset.cagePhase)).observe(document.getElementById('typing-lock-overlay'),{attributes:true,attributeFilter:['data-cage-phase']});settings.sceneMode='cage';document.getElementById('typing-lock-overlay').dataset.motion='on';scenes.entrance();draw(true)")
    page.evaluate('scenes.position()')
    check(page.locator('#typing-lock-overlay').get_attribute('data-cage-phase')=='frame','Cage entrance skips frame stage')
    check(page.locator('.scene-captivity').is_visible() and '123' in page.locator('.scene-captivity').inner_text(),'Cage captive/cumulative HUD missing')
    page.wait_for_function("document.getElementById('typing-lock-overlay').dataset.cagePhase==='closed'",timeout=5000)
    check(page.evaluate("['frame','bars','door','bolt','closed'].every((phase,i,all)=>cagePhases.indexOf(phase)>=0&&(i===0||cagePhases.indexOf(phase)>cagePhases.indexOf(all[i-1])))"),'Cage phase sequence skipped or reordered')
    cage=page.evaluate('scenes.geometry()');check(cage['mode']=='cage' and len(cage['arms'])==2,'Cage tethers still cross the lock')
    check(all(x['alpha']>8 for x in cage['arms']),'Door chain missed visible padlock edge')
    hud=page.locator('.lock-info').bounding_box();check(hud['x']>=0 and hud['x']+hud['width']<=375,'Mobile cage HUD overflows')
    page.screenshot(path=str(Path(tmp)/'cage.png'),omit_background=True)
    if os.environ.get('SCENES_CAGE_SCREENSHOT'):shutil.copyfile(Path(tmp)/'cage.png',os.environ['SCENES_CAGE_SCREENSHOT'])
    check(transparent_fraction(Path(tmp)/'cage.png')>.50,'Cage fills its gaps with an opaque background: '+str(transparent_fraction(Path(tmp)/'cage.png')))
    page.set_viewport_size({'width':1440,'height':810});page.evaluate('scenes.position()')
    resized=page.evaluate('scenes.geometry()');check(resized['cage']['width']>1200,'Cage frame did not resize with canvas')

    # Removing the scene entrance class cannot restart the older wrap animation.
    page.evaluate("settings.sceneMode='lock';draw(true);document.getElementById('typing-lock-overlay').classList.add('lock-wrapping');scenes.entrance()")
    page.wait_for_timeout(1550)
    check(page.locator('.lock-chain').first.evaluate('(e)=>getComputedStyle(e).animationName')=='none','Old cornerChainReach restarted after the V2 entrance')
    page.evaluate("settings.sceneMode='cage';draw(true)")

    # Explicit on overrides reduced motion; off reaches closed state immediately.
    page.emulate_media(reduced_motion='reduce');page.evaluate('draw(true);scenes.entrance()')
    check(page.locator('.cage-door').first.evaluate('(e)=>getComputedStyle(e).animationName')!='none','Explicit motion on silently obeys CSS reduced-motion')
    page.evaluate('draw(false);scenes.entrance()')
    check(page.locator('#typing-lock-overlay').get_attribute('data-cage-phase')=='closed','Motion off does not settle cage immediately')
    page.evaluate('draw(true);scenes.exit({totalHits:124});scenes.render(null,{totalLayers:0,totalHits:0,motion:true})')
    check('逃离成功' in page.locator('.scene-captivity').inner_text() and '124' in page.locator('.scene-captivity').inner_text(),'Last hit or null-state render lost the escape cumulative caption')
    check(page.locator('#typing-lock-overlay').get_attribute('data-cage-phase')=='opening','Null-state render interrupted escape animation')
    page.wait_for_timeout(1000)
    check(page.locator('#typing-lock-overlay').get_attribute('data-cage-phase')=='open','Successful escape did not open the cage')
    check(page.locator('.scene-cage').evaluate('(e)=>getComputedStyle(e).opacity')=='0','Opened cage bars remain on stream canvas')
    check(not errors,'Browser errors: '+str(errors));browser.close()
    print('PASS V2 scenes: silhouette endpoints, fixed lock, alpha/contain, desktop/mobile transparency, cage stages, HUD, resize, reduced motion and exit')
