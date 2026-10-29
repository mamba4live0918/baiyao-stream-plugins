"""V2.1 actual-HTML acceptance for gift-local fixed/ranged numbers and legacy migration.

No legacy navigation adapter: real menu tabs and in-page dropdown triggers are exercised.
"""
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
import json
import os
import re
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve()
SHOTS=Path(gettempdir())/'red-black-lock-v21';SHOTS.mkdir(exist_ok=True)
SDK="window.SonglanPlugin={onGift(cb){window.__gift=cb;}};"


def check(condition,message):
    if not condition:raise AssertionError(message)


def stored(page,key):
    return page.evaluate("key=>JSON.parse(localStorage.getItem('red-black-lock-v1:'+key)||'null')",key)


def state(page):
    return stored(page,'state') or {}


def snapshot(page):
    return page.evaluate("()=>{const x=JSON.parse(localStorage.getItem('red-black-lock-v1:state')||'{}');if(x.lock)delete x.lock.updatedAt;return x;}")


def nav(page,tab):
    page.locator(f'#menu-nav [data-menu-tab="{tab}"]').click()
    check(page.locator('#settings').get_attribute('data-page')==tab,'Menu navigation did not select '+tab)


def choose(box,value):
    box.locator('.dom-dropdown-trigger').click()
    box.locator('.dom-dropdown-list').wait_for(state='visible')
    box.locator(f'button[data-value="{value}"]').click()


def edit(field,value):
    field.fill(str(value));field.dispatch_event('change')


def set_range(row,kind,low,high):
    lo=row.locator(f'.rule-{kind}-min');hi=row.locator(f'.rule-{kind}-max')
    # Keep every intermediate committed range valid during normal focus changes.
    if low>int(hi.input_value()):edit(hi,high);edit(lo,low)
    else:edit(lo,low);edit(hi,high)


def kind_box(row):
    return row.locator('.choice-grid:has(button[data-value="lock"])').first


def gift(page,name,count=1,identity='test'):
    page.evaluate('event=>__gift(event)',{'giftName':name,'count':count,'eventId':identity})


def open_settings(page):
    page.locator('#arena').dblclick(position={'x':100,'y':100});page.locator('#settings').wait_for()


def tap(page):
    page.keyboard.down('Space');page.wait_for_timeout(35);page.keyboard.up('Space');page.wait_for_timeout(45)


def fresh(browser,viewport={'width':1280,'height':900},seed=None):
    context=browser.new_context(viewport=viewport,accept_downloads=True)
    context.add_init_script(SDK)
    if seed:
        context.add_init_script("if(!localStorage.getItem('__inlineRulesSeeded')){const data="+json.dumps(seed,ensure_ascii=False)+";for(const [key,value] of Object.entries(data))localStorage.setItem('red-black-lock-v1:'+key,JSON.stringify(value));localStorage.setItem('__inlineRulesSeeded','1');}")
    page=context.new_page();page.set_default_timeout(5000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(HTML.as_uri());page.wait_for_function('typeof __gift==="function"');return context,page,errors


def assert_no_separate_levels(page):
    for selector in ('#multiplier-levels','#target-pool','#save-multipliers','#save-target-pool','#add-multiplier','#add-target-tier','#normalize-target-pool'):
        check(page.locator(selector).count()==0 or page.locator(selector).is_hidden(),'Separate tier/pool UI remains visible: '+selector)
    check('先新增档位' not in page.locator('#rules').inner_text(),'Rows still require separately creating a tier')


with TemporaryDirectory() as temporary,sync_playwright() as p:
    temporary=Path(temporary);browser=p.chromium.launch(headless=True)
    context,page,errors=fresh(browser)
    open_settings(page);page.locator('#mode [data-value=cage]').click();nav(page,'gifts');assert_no_separate_levels(page)
    rows=page.locator('#rules .rule-row');row=rows.nth(0)
    for cls in ('gift-name','rule-value-min','rule-value-max','rule-target-min','rule-target-max','rule-factor-min','rule-factor-max','rule-test'):
        check(row.locator('.'+cls).count()==1,'Gift-local control missing: '+cls)
    check(row.locator('.legacy-pool-editor').count()==0 or row.locator('.legacy-pool-editor').is_hidden(),'Fresh rule starts with a visible legacy pool')
    name='同行固定QA';edit(row.locator('.gift-name'),name)
    set_range(row,'value',2,2);set_range(row,'target',4,4);set_range(row,'factor',3,3)
    rule=stored(page,'rules')[0]
    check(all(rule.get(k)==v for k,v in {'name':name,'valueMin':2,'valueMax':2,'targetMin':4,'targetMax':4,'multiplierMin':3,'multiplierMax':3}.items()),'Same-endpoint fields were not saved as an immediate fixed rule: '+str(rule))
    check(row.locator('.range-unit').all_text_contents()==['道','次','倍'],'Cage rule must explain seal count, door slaps and multiplier units')
    nav(page,'play');page.locator('#mode [data-value=cage]').click();choose(page.locator('#motion'),'off');choose(page.locator('#decay-presets'),'0')
    nav(page,'gifts');row.locator('.rule-test').click()
    lock=state(page)['lock'];check(lock['layers']==2 and lock['target']==12 and lock['multiplier']==3,'Rule Test does not apply one fixed gift through the live route')
    gift(page,name,1,'fixed-live');lock=state(page)['lock']
    check(lock['layers']==4 and all(x['target']==12 for x in lock['queue']),'Live gift disagrees with row Test')

    # The add path creates a fixed row immediately; the confirmed large 删除 control is real.
    count=rows.count();page.locator('#add-rule').click();added=rows.nth(count)
    check(added.locator('.gift-name').is_visible(),'Added row has no gift-name input')
    added_rule=stored(page,'rules')[-1]
    check(added_rule['valueMin']==added_rule['valueMax'] and added_rule['targetMin']==added_rule['targetMax'] and added_rule['multiplierMin']==added_rule['multiplierMax'],'Add rule forced a separate tier or random defaults')
    check(added.locator('.legacy-pool-editor').count()==0 or added.locator('.legacy-pool-editor').is_hidden(),'Added rule unexpectedly opens a legacy pool')
    delete=added.get_by_role('button',name=re.compile('删除')).first
    check(delete.inner_text().strip()=='删除','Delete control does not use the confirmed clear label')
    delete.click();check(rows.count()==count,'Delete did not remove the gift row')
    page.locator('#add-rule').click();page.locator('#add-rule').click()
    rows.nth(count).get_by_role('button',name=re.compile('删除')).first.dblclick()
    check(rows.count()==count+1,'Double-click deleted two adjacent gift rows')
    rows.last.get_by_role('button',name=re.compile('删除')).first.click()
    check(rows.count()==count,'Could not remove the remaining added row')
    before_rules=stored(page,'rules')
    page.evaluate("()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='red-black-lock-v1:rules')throw new DOMException('test quota','QuotaExceededError');return realSetItem.call(this,key,value);};}")
    page.locator('#add-rule').click();check(rows.count()==count and stored(page,'rules')==before_rules,'Failed add save created a phantom live rule')
    rows.nth(1).get_by_role('button',name=re.compile('删除')).first.click()
    check(rows.count()==count and stored(page,'rules')==before_rules,'Failed delete save removed a live rule')
    page.evaluate('()=>{Storage.prototype.setItem=realSetItem;}')

    # Keep an explicit clear rule for independent scenarios, selected through the new row dropdown.
    page.locator('#add-rule').click();clear_row=rows.last;edit(clear_row.locator('.gift-name'),'QA清空')
    choose(kind_box(clear_row),'clear');gift(page,'QA清空',1,'reset-fixed');check(state(page).get('lock') is None,'Clear row is not usable without tiers')
    row=rows.nth(0);set_range(row,'value',2,4);set_range(row,'target',10,10);set_range(row,'factor',2,4)
    page.evaluate('()=>{window.realRandom=Math.random;window.rangeDraws=0;Math.random=()=>{rangeDraws++;return .5;};}')
    gift(page,name,2,'range-combo');draws=page.evaluate('rangeDraws');page.evaluate('()=>{Math.random=realRandom;}')
    lock=state(page)['lock']
    check(lock['layers']==6 and lock['multiplier']==3 and lock['target']==30,'Gift count did not multiply the once-drawn value, or factor was redrawn per unit')
    check(draws==2,'Value/factor must each draw once per combination gift, not per gift unit: '+str(draws))
    gift(page,'QA清空',1,'reset-combo')

    # The simple target range gets a fresh independent value as each layer becomes current.
    set_range(row,'value',4,4);set_range(row,'target',1,3);set_range(row,'factor',1,1)
    page.evaluate('()=>{window.realRandom=Math.random;Math.random=()=>12345/4294967296;}')
    row.locator('.rule-test').click();page.evaluate('()=>{Math.random=realRandom;}')
    check(state(page)['lock']['layers']==4,'Target-range Test did not create four layers')
    page.locator('#settings-close').click();targets=[]
    for left in range(4,0,-1):
        lock=state(page)['lock'];targets.append(lock['target']);check(1<=lock['target']<=3,'Target escaped its row range')
        for _ in range(lock['target']):tap(page)
        check((state(page).get('lock') or {}).get('layers',0)==left-1,'Real taps did not finish exactly one independently drawn layer')
    check(len(set(targets))>1,'All layers reused a single target instead of drawing independently')
    open_settings(page);nav(page,'gifts')

    # The same controls cover relief, freeze and repeated reinforcement without another panel.
    choose(kind_box(row),'relief');set_range(row,'value',5,5);row.locator('.rule-test').click()
    check(row.locator('.rule-target-min').is_hidden() and row.locator('.rule-factor-min').is_hidden(),'Relief keeps irrelevant lock/factor inputs visible')
    choose(kind_box(row),'freeze');set_range(row,'value',2,2);row.locator('.rule-test').click()
    check((state(page).get('frozenUntil') or 0)>0,'Freeze Test does not use seconds from this gift row')
    gift(page,'QA清空',1,'reset-freeze')
    choose(kind_box(row),'lock');set_range(row,'value',1,1);set_range(row,'target',10,10);set_range(row,'factor',1,1);row.locator('.rule-test').click()
    choose(kind_box(row),'multiply');set_range(row,'value',2,2);set_range(row,'factor',2,2);row.locator('.rule-test').click()
    check(state(page)['lock']['target']==40,'Gift-local two ×2 reinforcements were not applied without a separate multiplier tier')
    gift(page,'QA清空',1,'reset-multiply')
    choose(kind_box(row),'lock');set_range(row,'value',1,1);set_range(row,'target',6,6);set_range(row,'factor',1,1)
    healthy=stored(page,'rules')[0];edit(row.locator('.rule-target-max'),5)
    check(stored(page,'rules')[0]==healthy,'Invalid reversed range silently changed the live rule')
    before_test=state(page);row.locator('.rule-test').click()
    check(state(page)==before_test,'An unsaved invalid range was tested against hidden old values')
    edit(row.locator('.rule-target-max'),6)

    # Narrow layout remains readable and all range controls stay inside the window.
    page.set_viewport_size({'width':390,'height':844});row.locator('.gift-name').scroll_into_view_if_needed()
    check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Gift editor causes body overflow at 390px')
    check(row.bounding_box()['height']<844*.85,'One gift setup no longer fits in one narrow-window flow')
    for selector in ('.gift-name','.rule-value-min','.rule-value-max','.rule-target-min','.rule-target-max','.rule-factor-min','.rule-factor-max','.rule-test'):
        field=row.locator(selector);box=field.bounding_box()
        check(box and box['x']>=-1 and box['x']+box['width']<=391,'Narrow row control overflows: '+selector)
        minimum=15 if selector=='.rule-test' else 16
        check(field.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=minimum,'Narrow rule text is too small: '+selector)
    for unit in row.locator('.range-unit').all():
        check(unit.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=16,'Range units are too small at 390px')
    page.evaluate("()=>{const scroll=document.querySelector('#settings .settings-scroll'),row=document.querySelector('#rules .rule-row');scroll.scrollTop+=row.getBoundingClientRect().top-scroll.getBoundingClientRect().top-8;}")
    page.wait_for_function("!document.getElementById('toast').classList.contains('show')")
    page.screenshot(path=str(SHOTS/'simple-rules.png'),omit_background=True)
    # Existing counter/cage/custom key and the newly inserted row popup still work.
    nav(page,'play');page.locator('#record-lock-key').click();page.keyboard.press('a')
    check(stored(page,'settings')['key']=='KeyA' and stored(page,'settings')['sceneMode']=='cage' and stored(page,'settings')['challengeMode']=='bar','Simplified gift UI reset key or scene/count settings')
    check(not errors,'New range page errors: '+str(errors));context.close()

    pool=[{'id':'oldlow','name':'旧轻锁','min':1,'max':1,'percent':75,'enabled':True,'look':'normal'},
          {'id':'oldhigh','name':'旧重锁','min':10,'max':10,'percent':25,'enabled':True,'look':'legendary'}]
    old_settings={'theme':'horror','key':'KeyA','motion':'off','sceneMode':'cage','challengeMode':'bar','materialId':'forged-steel',
                  'multipliers':[{'id':'oldboost','name':'旧七倍','factor':7}],'targetPool':pool}
    old_rules=[{'name':'旧固定礼物','kind':'lock','value':2,'target':3,'multiplierId':'oldboost'},
               {'name':'旧加权礼物','kind':'lock','value':4,'target':60,'targetMode':'blindbox','multiplierId':'oldboost'}]
    context,page,errors=fresh(browser,seed={'settings':old_settings,'rules':old_rules})
    page.evaluate('''pool=>{const now=Date.now(),lock=TypingLockModel.create(5,{target:60,key:'KeyA',challengeMode:'count',multiplier:7,targetPool:pool,seed:12345,source:'旧当前'},now);
      TypingLockModel.press(lock,now+1);TypingLockModel.add(lock,3,now+2,{target:60,key:'Space',challengeMode:'bar',multiplier:5,targetPool:pool,seed:3333,source:'旧排队'});
      localStorage.setItem('red-black-lock-v1:state',JSON.stringify({version:1,lock,waiting:[],frozenUntil:0,cleared:0}));}''',pool)
    page.reload();baseline=snapshot(page);open_settings(page);nav(page,'gifts');assert_no_separate_levels(page)
    legacy=page.locator('#rules .rule-row');fixed=legacy.nth(0);weighted=legacy.nth(1)
    check(fixed.locator('.rule-factor-min').input_value()=='7' and fixed.locator('.rule-factor-max').input_value()=='7','Old multiplierId did not become an equal-ended inline factor')
    check(weighted.locator('.legacy-pool-editor').count()==1,'Old weighted pool is not attached to its own row')
    details=weighted.locator('.legacy-pool-editor')
    if details.evaluate('e=>e.tagName')=='DETAILS':check(details.get_attribute('open') is None,'Legacy pool opens as a separate mandatory setup panel')
    edit(fixed.locator('.gift-name'),'旧固定礼物已迁移')
    migrated=stored(page,'rules')
    check('multiplierId' not in migrated[0] and migrated[0]['multiplierMin']==migrated[0]['multiplierMax']==7,'Legacy multiplier reference was not embedded before saving')
    check(migrated[1].get('targetMode')=='blindbox' and migrated[1].get('targetPool')==pool,'Old weighted pool became uniform or lost its own percentages')
    check(snapshot(page)==baseline,'Editing migrated gift settings changed the old current/queued lock work')
    page.reload();check(snapshot(page)==baseline,'Reload redrew an old weighted current layer or changed queued state')
    open_settings(page);nav(page,'backup')
    old_backup=temporary/'old-v2-backup.json'
    next_settings={**old_settings,'key':'F8','sceneMode':'cage'}
    old_backup.write_text(json.dumps({'app':'red-black-lock','format':1,'settings':next_settings,'rules':old_rules,'sounds':{},'customArt':{'version':1,'items':[]}},ensure_ascii=False),encoding='utf-8')
    page.locator('#import-file').set_input_files(old_backup);page.locator('#import-preview').wait_for()
    check(snapshot(page)==baseline,'Old backup preview changed active locks')
    page.locator('#import-cancel').click();check(stored(page,'settings')['key']=='KeyA' and snapshot(page)==baseline,'Cancelling old backup changed settings or active locks')
    page.locator('#import-file').set_input_files(old_backup);page.locator('#import-preview').wait_for();page.locator('#import-confirm').click()
    page.wait_for_function("JSON.parse(localStorage.getItem('red-black-lock-v1:settings')).key==='F8'")
    imported=stored(page,'rules')
    check(imported[0]['multiplierMin']==imported[0]['multiplierMax']==7 and imported[1].get('targetPool')==pool,'Old backup confirmation did not preserve factor/weighted percentages')
    check(snapshot(page)==baseline,'Import confirmation reapplied or redrew old current/queued effects')
    page.reload();check(snapshot(page)==baseline,'Post-import refresh changed old work, RNG or applied status')
    check(not errors,'Legacy range page errors: '+str(errors));context.close();browser.close()
    print('PASS inline gift rules: fixed/ranges, one draw per combo, per-layer targets, row Test, add/delete, effects, 390px, old factor/pool/state and preview/cancel/import')
