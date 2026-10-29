"""离线自包含检查：拦截一切外部网络请求，只凭这一个 HTML 打开；八个主题的链条和锁头图片都必须能真正解码。
（本地礼物通道 ws://localhost:10030 连不上属于正常，不算外部素材。）"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = Path(os.environ.get('LOCK_HTML', ROOT / '红黑破锁-1.html')).resolve().as_uri()
THEMES = ['fufu', 'horror', 'cyber', 'typewriter', 'notebook', 'pixel', 'chalk', 'terminal', 'cream']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720}, offline=True)
    external = []
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('file:', 'data:')) else (external.append(route.request.url), route.abort()))
    page = context.new_page()
    page.goto(URL)
    sizes = page.evaluate('''async (themes)=>{
      const out={};const overlay=document.getElementById('typing-lock-overlay');
      for(const theme of themes){
        document.documentElement.dataset.theme=theme;
        for(const kind of ['chain','padlock']){
          const raw=getComputedStyle(overlay).getPropertyValue('--typing-lock-'+kind).trim();
          const src=raw.replace(/^url\\(["']?/,'').replace(/["']?\\)$/,'');
          const img=new Image();img.src=src;
          try{await img.decode();out[theme+'-'+kind]=[img.naturalWidth,img.naturalHeight];}catch(e){out[theme+'-'+kind]=[0,0];}
        }
      }
      return out;}''', THEMES)
    bank_sizes=page.evaluate('''async()=>{
      const out={};
      for(const id of ['forged-steel','antique-brass','arcane-anime','candy-toon']){
        const entry=window.LockMaterialBank?.[id];
        for(const kind of ['chain','padlock']){
          const img=new Image();img.src=entry?.[kind]||'';
          try{await img.decode();out[id+'-'+kind]=[img.naturalWidth,img.naturalHeight];}catch{out[id+'-'+kind]=[0,0];}
        }
      }
      return out;}''')
    sizes.update(bank_sizes)
    bad = {k: v for k, v in sizes.items() if v[0] < 100 or v[1] < 100}
    assert len(sizes) == 26 and not bad, f'embedded art failed to decode offline: {bad}'
    cage=page.evaluate('''async themes=>{const out={};for(const theme of themes){document.documentElement.dataset.theme=theme;const s=getComputedStyle(document.querySelector('#typing-lock-overlay'));for(const name of [...s].filter(n=>n.startsWith('--cage-'))){const raw=s.getPropertyValue(name).trim();if(!raw.startsWith('url('))continue;const im=new Image();im.src=raw.slice(4,-1).replace(/^['"]|['"]$/g,'');await im.decode();out[theme+name]=[im.width,im.height];}}return out;}''',THEMES)
    assert len(cage)==117 and all(w>0 and h>0 for w,h in cage.values()),'Nine cage kits failed offline decoding'
    assert not external, f'page requested external resources: {external}'
    browser.close()
print('PASS offline: single HTML only, 26 lock/chain images plus 117 cage pieces decode with network blocked')
