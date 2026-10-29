"""Do not replace the previous sound when a persistent write is interrupted."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os,wave,struct,math
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.
ROOT=Path(__file__).resolve().parents[1]
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
with TemporaryDirectory() as temp,sync_playwright() as p:
    temp=Path(temp)
    for name,hz in [('old.wav',440),('new.wav',880)]:
        with wave.open(str(temp/name),'wb') as out:
            out.setnchannels(1);out.setsampwidth(2);out.setframerate(22050)
            out.writeframes(b''.join(struct.pack('<h',int(5000*math.sin(i*2*math.pi*hz/22050))) for i in range(4400)))
    browser=p.chromium.launch(headless=True);page=browser.new_page()
    page.goto(URL);page.locator('#arena').dblclick(position={'x':200,'y':200})
    field='#sounds .sound-row[data-sound=hit] input[type=file]'
    note='#sounds .sound-row[data-sound=hit] .sound-note'
    page.locator(field).set_input_files(str(temp/'old.wav'))
    page.wait_for_function('(s)=>document.querySelector(s).textContent.includes("old.wav")',arg=note)
    page.evaluate('''()=>{const real=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=real.apply(this,args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;}}''')
    page.locator(field).set_input_files(str(temp/'new.wav'))
    page.wait_for_function('document.querySelector("#toast").textContent.includes("保存")')
    assert 'old.wav' in page.locator(note).inner_text(), 'failed audio write replaced old sound on this page'
    page.reload();page.locator('#arena').dblclick(position={'x':200,'y':200})
    page.wait_for_function('(s)=>document.querySelector(s).textContent.includes("old.wav")',arg=note)
    browser.close()
print('PASS interrupted audio save preserves old sound on page and after reload')
