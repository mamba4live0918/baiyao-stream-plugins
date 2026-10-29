"""Load actual V1.x/V2.1/V2.2 browser saves, retaining challenges and migrated rules."""
from pathlib import Path
import json,os,subprocess,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa/2026-10-15-V2.3.2-自测';TMP=QA/'runtime-tmp';TMP.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(TMP)
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
js="const M=require('./src/core.js');M.setDecay({rate:0,graceMs:1000});const now=Date.now(),s=M.create(2,{target:10,key:'Space',challengeMode:'count'},now);M.press(s,now);M.press(s,now+1);M.press(s,now+2);console.log(JSON.stringify(s));"
count=json.loads(subprocess.check_output(['node','-e',js],cwd=ROOT,text=True,encoding='utf-8'))
now=int(time.time()*1000)
legacy={'layers':2,'target':7,'key':'Space','progress':2,'updatedAt':now,'lastHitAt':now}
cases=[('V1.x',{'targets':{'normal':7},'motion':'off','decayRate':0},[{'name':'心','kind':'lock','value':2,'tier':'normal'}],legacy,'lock',None),
       ('V2.1',{'challengeMode':'count','sceneMode':'lock','motion':'off','decayRate':0},[{'name':'心','kind':'lock','valueMin':1,'valueMax':3,'targetMin':4,'targetMax':8,'multiplier':1}],count,'count',17),
       ('V2.2',{'challengeMode':'bar','sceneMode':'cage','motion':'off','displaySize':'large','decayRate':0},[{'name':'心','kind':'lock','value':1,'target':7}],legacy,'cage',None)]
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    try:
        for name,settings,rules,state,mode,remaining in cases:
            c=b.new_context(viewport={'width':1080,'height':1920});raw={'version':1,'lock':state,'waiting':[],'frozenUntil':0,'cleared':0}
            data={'settings':settings,'rules':rules,'state':raw}
            c.add_init_script('window.SonglanPlugin={onGift(cb){window.gift=cb}};'+''.join('localStorage.setItem('+json.dumps('red-black-lock-v1:'+k)+','+json.dumps(json.dumps(v))+');' for k,v in data.items()))
            page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL)
            page.wait_for_function('typeof gift==="function"')
            assert page.locator('#typing-lock-overlay').get_attribute('data-mode')==mode,name
            assert page.locator('#typing-lock-overlay').is_visible(),name
            if remaining is not None:
                assert page.locator('#lock-remaining-hits').inner_text()==str(remaining),name
                assert page.locator('#lock-total-hits').inner_text()=='3'
            page.locator('#arena').dblclick(position={'x':90,'y':90});page.locator('#menu-nav [data-menu-tab=backup]').click()
            with page.expect_download() as d:page.locator('#export-settings').click()
            payload=json.loads(Path(d.value.path()).read_text(encoding='utf-8'));profiles=payload['modes']['profiles']
            assert profiles['lock']['rules']==profiles['cage']['rules']
            expected={'V1.x':(14,14),'V2.1':(4,24),'V2.2':(7,7)}[name]
            rule=profiles['count']['rules'][0];assert (rule['valueMin'],rule['valueMax'])==expected,name
            assert not errors,errors;c.close()
    finally:b.close()
print('PASS browser migration: V1.x layer/key targets, V2.1 count remaining, V2.2 cage, three-profile rule conversion')
