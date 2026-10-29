"""Corrupt legacy mirrors and refused profile saves cannot replace healthy live configuration."""
from pathlib import Path
import os,json,wave
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa/2026-10-15-V2.3.2-自测';TMP=QA/'runtime-tmp';TMP.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(TMP)
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
profiles={m:{'settings':{'mode':m,'theme':'fufu','motion':'off','decayRate':35,'decayDelay':.25},'rules':[{'name':'QA','kind':'lock','value':7,'target':100}]} for m in ['lock','cage','count']}
cfg={'version':23,'mode':'count','profiles':profiles}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        for broken in ['settings','state']:
            c=browser.new_context();c.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};localStorage.setItem("red-black-lock-v1:config-v23",'+json.dumps(json.dumps(cfg))+');localStorage.setItem('+json.dumps('red-black-lock-v1:'+broken)+',"{broken");')
            page=c.new_page();page.goto(URL);page.wait_for_function('typeof gift==="function"');page.evaluate('gift({giftName:"QA",count:1})')
            assert page.locator('#typing-lock-overlay').get_attribute('data-mode')=='count',broken+' mirror hid healthy configuration'
            assert page.locator('#lock-remaining-hits').inner_text()=='7'
            assert page.evaluate('JSON.parse(localStorage.getItem("red-black-lock-v1:config-v23")).mode')=='count';c.close()
        c=browser.new_context();c.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};localStorage.setItem("red-black-lock-v1:settings",JSON.stringify({motion:"off",decayRate:35,decayDelay:.25}));')
        page=c.new_page();page.goto(URL);page.wait_for_function('typeof gift==="function"');page.locator('#arena').dblclick(position={'x':90,'y':90})
        page.evaluate('''()=>{const real=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='red-black-lock-v1:config-v23')throw new Error('refuse config write');return real.call(this,key,value);};}''')
        page.locator('#decay-rate').fill('0');page.locator('#decay-rate').dispatch_event('change')
        assert page.locator('#decay-rate').input_value()=='35','Rejected decay remained in controls'
        page.locator('#settings-close').click();page.evaluate('gift({giftName:"小心心",count:1})')
        for _ in range(10):page.keyboard.press('Space');page.wait_for_timeout(65)
        page.wait_for_timeout(600)
        progress=float(page.locator('#typing-lock-progress').inner_text().split('/')[0])
        assert progress<8,'Rejected zero decay still controls live model'
        c.close()
        c=browser.new_context()
        c.add_init_script('''window.SonglanPlugin={onGift(cb){window.gift=cb}};
Object.defineProperty(window,'LockCustomArt',{configurable:true,set(api){delete window.LockCustomArt;window.LockCustomArt={...api,create(options){const art=api.create(options),run=art.importAssets;art.importAssets=async(...args)=>{if(window.holdImport){window.importPending=true;await new Promise(resolve=>window.releaseImport=resolve);window.holdImport=false;}return run(...args);};return art;}};}});''')
        page=c.new_page();page.goto(URL);page.wait_for_function('typeof gift==="function"');page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#menu-nav [data-menu-tab=backup]').click()
        backup=TMP/'race-import.json';backup.write_text(json.dumps({'app':'red-black-lock','format':1,'settings':profiles['count']['settings'],'rules':profiles['count']['rules'],'modes':cfg,'sounds':{},'customArt':{'version':1,'items':[]}}),encoding='utf-8')
        page.locator('#import-file').set_input_files(str(backup));page.locator('#import-preview').wait_for();page.evaluate('holdImport=true');page.locator('#import-confirm').click();page.wait_for_function('window.importPending')
        page.evaluate('gift({giftName:"小心心",count:1});releaseImport()');page.wait_for_function('!document.querySelector("#import-confirm").disabled')
        assert page.locator('#mode [data-value=lock]').get_attribute('aria-checked')=='true','Gift during import lost its active mode'
        page.locator('#settings-close').click();page.keyboard.press('Space');page.wait_for_timeout(80)
        assert page.evaluate('JSON.parse(localStorage.getItem("red-black-lock-v1:state")).lock.progress')>=1,'Gift during import became unreachable'
        c.close()
        c=browser.new_context();c.add_init_script('''window.SonglanPlugin={onGift(){}};
const originalDecode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(bytes){window.audioPending=true;await new Promise(r=>window.releaseAudio=r);return originalDecode.call(this,bytes);};''')
        page=c.new_page();page.goto(URL);page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#mode [data-value=count]').click();page.locator('#menu-nav [data-menu-tab=art]').click()
        wav=TMP/'mode-upload.wav'
        with wave.open(str(wav),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(22050);f.writeframes(b'\0\0'*2205)
        page.locator('#sounds .sound-row[data-sound=hit] input[type=file]').set_input_files(str(wav));page.wait_for_function('window.audioPending')
        page.locator('#menu-nav [data-menu-tab=play]').click();page.locator('#mode [data-value=lock]').click();page.evaluate('releaseAudio()')
        page.wait_for_function('document.querySelector("#sounds .sound-row[data-sound=hit] .sound-note").textContent.includes("mode-upload.wav")')
        profiles_after=page.evaluate('JSON.parse(localStorage.getItem("red-black-lock-v1:config-v23")).profiles')
        assert profiles_after['lock']['settings']['sound']['events']['hit']['mode']=='default','Late count-mode upload changed lock-mode sound option'
        assert profiles_after['count']['settings']['sound']['events']['hit']['mode']=='custom','Upload did not update its originating mode'
        c.close()
    finally:browser.close()
print('PASS V2.3 storage: healthy authoritative profiles survive corrupt mirrors; rejected decay preserves live behavior')
