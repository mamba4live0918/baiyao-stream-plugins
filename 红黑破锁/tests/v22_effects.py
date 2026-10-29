"""Fufu visual progress, whole-lock phases, bounded particles, sound modes and save migration."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json,os,wave,math,struct
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa/2026-10-15-V2.3.2-自测'
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
def tap(page):page.keyboard.down('Space');page.wait_for_timeout(35);page.keyboard.up('Space');page.wait_for_timeout(60)
def choose(page,box,value):
    parent=page.locator(box);parent.locator('.dom-dropdown-trigger').click();parent.locator('button[data-value="'+value+'"]').click()
def open_settings(page,tab='art'):
    page.locator('#arena').dblclick(position={'x':100,'y':100});page.locator('#menu-nav [data-menu-tab='+tab+']').click()
INIT='''window.SonglanPlugin={onGift(cb){window.__gift=cb}};window.tones=[];window.bufferPlays=0;window.hitAnimations=[];
const realAnimate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('lock-hit'))hitAnimations.push({frames,options});return realAnimate.call(this,frames,options)};
const realOsc=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const o=realOsc.call(this);const record={frequencies:[],stops:[]};tones.push(record);for(const name of ['setValueAtTime','exponentialRampToValueAtTime']){const real=o.frequency[name].bind(o.frequency);o.frequency[name]=(...args)=>{record.frequencies.push([name,...args]);return real(...args)}}const stop=o.stop.bind(o);o.stop=(...a)=>{record.stops.push(...a);return stop(...a)};return o};
const realBuffer=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){bufferPlays++;return realBuffer.apply(this,args)};
'''
with TemporaryDirectory() as temp,sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        ctx=browser.new_context(viewport={'width':1920,'height':1080},reduced_motion='reduce',accept_downloads=True)
        cfg={'theme':'fufu','displaySize':'large','motion':'on','challengeMode':'bar','sceneMode':'lock','decayRate':0}
        ctx.add_init_script(INIT+'localStorage.setItem("red-black-lock-v1:settings",'+json.dumps(json.dumps(cfg))+');localStorage.setItem("red-black-lock-v1:rules",JSON.stringify([{name:"小心心",kind:"lock",value:2,target:2}]));')
        page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL)
        page.wait_for_function('typeof __gift==="function"');page.evaluate('__gift({giftName:"小心心",count:1})')
        page.wait_for_function('document.getElementById("typing-lock-overlay").dataset.sceneStatus==="entering"')
        page.screenshot(path=str(QA/'fufu-entering.png'),omit_background=True)
        page.wait_for_function('document.getElementById("typing-lock-overlay").dataset.sceneStatus==="held"')
        assert page.locator('.lock-info').evaluate('e=>e.getBoundingClientRect().bottom-2+parseFloat(getComputedStyle(e,"::after").height)<=innerHeight'),'Count HUD lace clips at the canvas edge'
        page.evaluate('tones=[]');tap(page)
        assert page.locator('#typing-lock-overlay').evaluate('el=>Number(el.style.getPropertyValue("--lock-progress"))')==.5
        tones=page.evaluate('tones');assert len(tones)==1 and 1012<=tones[0]['frequencies'][0][1]<=1188,tones
        assert page.evaluate('hitAnimations.some(a=>a.options.duration===120&&a.frames.some(f=>f.transform))'),'Valid press did not start inner hit feedback'
        page.evaluate('tones=[]');tap(page)
        assert page.locator('#typing-lock-overlay').evaluate('el=>el.classList.contains("fufu-celebrate")')
        assert page.locator('#lock-fx .fufu-crumb').count()==5,'Celebrating cheese should drop five crumbs at the track end'
        crumb=page.locator('#lock-fx .fufu-crumb').first.bounding_box();cheese=page.locator('.fufu-race-bar .fufu-cheese').bounding_box()
        assert abs(crumb['x']-cheese['x']-cheese['width']/2)<55 and abs(crumb['y']-cheese['y']-cheese['height']/2)<70,'Crumbs appeared away from the cheese'
        assert page.locator('.lock-shackle').evaluate('el=>getComputedStyle(el).clipPath')=='none'
        assert len(page.evaluate('tones'))==4,'Layer should have two squeaks and a two-partial bell'
        assert page.locator('#lock-fx').evaluate('el=>el.childElementCount')<=90
        properties=page.locator('#lock-fx > *').evaluate_all('els=>els.flatMap(el=>el.getAnimations().flatMap(a=>a.effect.getKeyframes().flatMap(frame=>Object.keys(frame)))).filter(x=>!["offset","computedOffset","easing","composite","transform","opacity"].includes(x))')
        assert properties==[],properties
        page.screenshot(path=str(QA/'fufu-layer-midframe.png'),omit_background=True)
        page.wait_for_timeout(450);assert not page.locator('#typing-lock-overlay').evaluate('el=>el.classList.contains("fufu-celebrate")')
        assert page.locator('#typing-lock-overlay').evaluate('el=>Number(el.style.getPropertyValue("--lock-progress"))')==0
        tap(page);page.evaluate('tones=[]');tap(page)
        assert len(page.evaluate('tones'))==5,'Clear should have three squeaks plus bell'
        assert page.locator('#lock-fx .fufu-heart').count()>=20
        page.screenshot(path=str(QA/'fufu-exiting.png'),omit_background=True)
        page.locator('#typing-lock-overlay').wait_for(state='hidden')
        # Off means no new particles and no synthetic/default sound for the disabled event.
        open_settings(page,'play');choose(page,'#motion','off');page.locator('#menu-nav [data-menu-tab=art]').click()
        choose(page,'#sounds .sound-row[data-sound=hit] .choice-grid','off');page.locator('#settings-close').click()
        page.evaluate('__gift({giftName:"小心心",count:1});tones=[]');tap(page)
        assert page.evaluate('tones.length')==0
        assert page.locator('#lock-fx').evaluate('el=>el.childElementCount')==0
        # User custom audio still plays instead of the fufu synth.
        wav=Path(temp)/'custom.wav'
        with wave.open(str(wav),'wb') as out:
            out.setnchannels(1);out.setsampwidth(2);out.setframerate(22050);out.writeframes(b''.join(struct.pack('<h',int(math.sin(i*.15)*3000)) for i in range(2205)))
        open_settings(page,'art');page.locator('#sounds .sound-row[data-sound=hit] input[type=file]').set_input_files(str(wav))
        page.wait_for_function('document.querySelector("#sounds .sound-row[data-sound=hit] .sound-note").textContent.includes("custom.wav")')
        page.locator('#settings-close').click();page.evaluate('tones=[];bufferPlays=0');tap(page)
        assert page.evaluate('bufferPlays')==0 and page.evaluate('tones.length')==4,'Breaking a layer should retain the existing layer-event routing'
        page.evaluate('tones=[];bufferPlays=0');tap(page)
        assert page.evaluate('bufferPlays')==1 and page.evaluate('tones.length')==0,'A non-breaking custom hit must play its buffer instead of the fufu synth'
        open_settings(page,'play');choose(page,'#display-size','xlarge');page.locator('#menu-nav [data-menu-tab=backup]').click()
        with page.expect_download() as dl:page.locator('#export-settings').click()
        data=json.loads(Path(dl.value.path()).read_text(encoding='utf-8'));assert data['settings']['displaySize']=='xlarge' and data['settings']['theme']=='fufu'
        backup=Path(temp)/'settings.json';backup.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        ctx.close()
        ctx=browser.new_context(viewport={'width':1080,'height':1920});ctx.add_init_script(INIT);page=ctx.new_page();page.goto(URL)
        open_settings(page,'backup');page.locator('#import-file').set_input_files(str(backup));page.locator('#import-preview').wait_for();page.locator('#import-confirm').click();page.wait_for_function('JSON.parse(localStorage.getItem("red-black-lock-v1:settings"))?.displaySize==="xlarge"');page.reload()
        assert page.locator('html').get_attribute('data-theme')=='fufu';assert page.locator('#typing-lock-overlay').get_attribute('data-display-size')=='xlarge'
        assert not errors,errors;ctx.close()
    finally:browser.close()
print('PASS V2.2 effects/audio: real half progress, whole ears, celebration/reset, RGB particles/cap, off/custom/default, size backup/reload')
