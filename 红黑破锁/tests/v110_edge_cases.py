"""Malformed queues, rejected UI drafts and late backup reads preserve valid state."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os,json
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.
ROOT=Path(__file__).resolve().parents[1]
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
with TemporaryDirectory() as temp,sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for bad_rule in [{'name':'名'*81,'kind':'lock','value':1,'target':60},
                     {'name':'旧倍率礼物','kind':'lock','value':1,'target':60,'multiplierId':'missing'}]:
        ctx=browser.new_context()
        raw=json.dumps([bad_rule],ensure_ascii=False)
        ctx.add_init_script('localStorage.setItem("red-black-lock-v1:rules",'+json.dumps(raw)+')')
        page=ctx.new_page();page.goto(URL)
        assert page.evaluate('localStorage.getItem("red-black-lock-v1:rules")')==raw, 'invalid legacy rules were overwritten during restore'
        assert '规则' in page.locator('#toast').inner_text() and any(word in page.locator('#toast').inner_text() for word in ('无效','未能','失败')), 'invalid legacy name/reference silently became default rules'
        ctx.close()
    for bad in [{'layers':10000000,'target':60,'key':'Space','targetPool':[]},
                {'layers':1,'target':60,'key':'Space','rngState':4294967296}]:
        ctx=browser.new_context();ctx.add_init_script('localStorage.setItem("red-black-lock-v1:state",'+json.dumps(json.dumps({'version':1,'lock':None,'waiting':[bad,{'layers':1,'target':7,'key':'Space'}]}))+')')
        page=ctx.new_page();page.goto(URL)
        assert page.locator('#typing-lock-layers').inner_text()=='×1'
        assert page.locator('#typing-lock-progress').inner_text().endswith('/ 7'), 'bad waiting entry blocked healthy lock'
        ctx.close()
    ctx=browser.new_context();page=ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL);page.locator('#arena').dblclick(position={'x':200,'y':200})
    row=page.locator('#rules .rule-row').first
    old=page.evaluate('localStorage.getItem("red-black-lock-v1:rules")')
    row.locator('.rule-value-min').fill('0');row.locator('.rule-value-min').dispatch_event('change')
    assert page.evaluate('localStorage.getItem("red-black-lock-v1:rules")')==old, 'bad minimum changed saved rules'
    assert '未保存' in row.locator('.rule-save-status').inner_text()
    row.locator('.rule-value-max').fill('');row.locator('.rule-value-max').dispatch_event('change')
    assert page.evaluate('localStorage.getItem("red-black-lock-v1:rules")')==old, 'blank upper bound changed saved rules'
    # Malformed old weighted percentages are rejected through an actual legacy backup,
    # rather than a removed global pool editor.
    malformed={'app':'red-black-lock','format':1,'settings':{'targetPool':[{'id':'bad','name':'坏档','min':1,'max':2,'percent':''}]},'rules':[{'name':'旧盲盒','kind':'lock','value':1,'target':60,'targetMode':'blindbox'}],'sounds':{}}
    bad_pool=Path(temp)/'bad-pool.json';bad_pool.write_text(json.dumps(malformed),encoding='utf8')
    page.locator('#import-file').set_input_files(str(bad_pool));page.wait_for_timeout(80)
    assert page.locator('#import-preview').is_hidden(), 'invalid legacy pool accepted for import'
    assert page.evaluate('localStorage.getItem("red-black-lock-v1:rules")')==old, 'invalid legacy import changed saved rules'
    backup={'app':'red-black-lock','format':1,'settings':{'theme':'cream'},'rules':[],'sounds':{}}
    temp=Path(temp);slow=temp/'slow.json';fast=temp/'fast.json'
    slow.write_text(json.dumps({**backup,'settings':{'theme':'cyber'}}),encoding='utf-8');fast.write_text(json.dumps(backup),encoding='utf-8')
    page.evaluate('''()=>{const real=File.prototype.text;File.prototype.text=function(){if(this.name==='slow.json')return new Promise(resolve=>{window.releaseSlow=async()=>resolve(await real.call(this))});return real.call(this)}}''')
    page.locator('#import-file').set_input_files(str(slow))
    page.locator('#import-file').set_input_files(str(fast));page.locator('#import-preview').wait_for()
    page.evaluate('releaseSlow()');page.wait_for_timeout(100)
    assert '可爱奶油' in page.locator('#import-summary').inner_text() and '赛博' not in page.locator('#import-summary').inner_text()
    assert not errors,errors
    browser.close()
print('PASS invalid legacy rules warn without overwrite; healthy queued locks retained; invalid inline drafts and legacy percentages rejected; late backup read ignored')
