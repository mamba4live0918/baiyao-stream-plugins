"""Actual delivered HTML: custom images, backup preview and persistence."""
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
import os,json
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.
ROOT=Path(__file__).resolve().parents[1]
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
SHOTS=Path(gettempdir())/'red-black-lock-v110';SHOTS.mkdir(exist_ok=True)
with TemporaryDirectory() as temp,sync_playwright() as p:
    temp=Path(temp)
    art=Image.new('RGBA',(400,120),(0,0,0,0));draw=ImageDraw.Draw(art)
    for x in range(20,390,60):draw.ellipse((x,35,x+65,85),outline='#efba54',width=10)
    chain=temp/'gold-chain.png';art.save(chain)
    art=Image.new('RGBA',(180,240),(0,0,0,0));draw=ImageDraw.Draw(art)
    draw.arc((35,10,145,155),180,360,fill='#d7c5eb',width=16)
    draw.rounded_rectangle((20,90,160,220),radius=25,fill='#775594',outline='#f5df93',width=8)
    draw.ellipse((78,136,102,160),fill='#fff0c3')
    lock=temp/'purple-lock.png';art.save(lock)
    browser=p.chromium.launch(headless=True)
    ctx=browser.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
    page=ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL);page.locator('#arena').dblclick(position={'x':200,'y':200})
    for kind,path in [('chain',chain),('lock',lock)]:
        page.locator(f'#custom-art [data-art-kind={kind}] input[type=file]').set_input_files(str(path))
        page.wait_for_function('(k)=>document.querySelector(`#custom-art [data-art-kind=${k}] .custom-art-name`).textContent.includes("自定义：")',arg=kind)
    row=page.locator('#rules .rule-row').first;ui_v2.set_range(row,'target',1,3);row.locator('.rule-test').click();page.locator('#settings-close').click()
    page.wait_for_timeout(1750)
    assert page.locator('#typing-lock-overlay').get_attribute('data-custom-chain')=='true'
    assert page.locator('#typing-lock-overlay').get_attribute('data-custom-lock')=='true'
    assert page.locator('.lock-shackle').evaluate('(el)=>getComputedStyle(el).backgroundImage').startswith('url("blob:')
    page.screenshot(path=str(SHOTS/'custom-lock-transparent.png'),omit_background=True)
    assert Image.open(SHOTS/'custom-lock-transparent.png').getpixel((640,130))[3]==0
    page.locator('#arena').dblclick(position={'x':200,'y':200})
    with page.expect_download() as download:page.locator('#export-settings').click()
    backup=temp/'backup.json';download.value.save_as(backup)
    data=json.loads(backup.read_text(encoding='utf-8'))
    assert len(data['customArt']['items'])==2 and data['rules'][0]['targetMin']==1 and data['rules'][0]['targetMax']==3
    page.locator('#theme button[data-value=cream]').click()
    assert page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') is None
    page.locator('#theme button[data-value=horror]').click()
    page.locator('#menu-nav [data-menu-tab=art]').click()
    page.locator('#custom-art [data-art-kind=chain]').get_by_role('button',name='恢复默认',exact=True).click()
    page.wait_for_function('!document.querySelector("#typing-lock-overlay").dataset.customChain')
    page.locator('#import-file').set_input_files(str(backup));page.locator('#import-preview').wait_for()
    assert '自定义素材 2 张' in page.locator('#import-summary').inner_text()
    page.locator('#import-cancel').click()
    assert page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') is None
    page.locator('#import-file').set_input_files(str(backup));page.locator('#import-preview').wait_for()
    page.locator('#import-confirm').click()
    page.wait_for_function('document.querySelector("#typing-lock-overlay").dataset.customChain==="true"')
    page.reload();page.wait_for_function('document.querySelector("#typing-lock-overlay").dataset.customLock==="true"')
    page.locator('#arena').dblclick(position={'x':200,'y':200})
    page.locator('#rules').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOTS/'blindbox-settings.png'),omit_background=True)
    assert not errors,errors
    browser.close()
print('PASS actual HTML: image uploads and rendering, transparency, theme isolation, backup preview/cancel/import/reload, blindbox simulation')
