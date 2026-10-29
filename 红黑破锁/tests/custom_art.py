"""Custom lock art: browser decode, per-theme persistence, atomic writes and stale uploads."""
from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import io
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
import ui_v2  # Navigate V2 pages and custom popups for legacy controls.

ROOT = Path(__file__).resolve().parents[1]


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def picture(width=100, height=60, color='#cc2233', blank=False, kind='PNG'):
    art = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    if not blank:
        pen = ImageDraw.Draw(art)
        pen.rectangle((20, 20, width - 21, height - 21), fill=color)
        pen.line((23, 23, width - 24, 23), fill='white', width=2)
    if kind == 'JPEG':
        art = art.convert('RGB')
    out = io.BytesIO(); art.save(out, format=kind)
    return base64.b64encode(out.getvalue()).decode()


def upload(page, kind, data, name='art.png', mime='image/png'):
    return page.evaluate('''async ({kind,data,name,mime}) => {
      const bytes=Uint8Array.from(atob(data),x=>x.charCodeAt(0));
      return window.art.upload(kind,new File([bytes],name,{type:mime}));
    }''', dict(kind=kind, data=data, name=name, mime=mime))


def exported(page):
    return page.evaluate('art.exportAssets()')


with TemporaryDirectory() as tmp, sync_playwright() as p:
    js = ROOT / 'src/custom-art.js'
    check(js.is_file(), 'Custom art module does not exist yet')
    css = ROOT / 'src/custom-art.css'
    html = Path(tmp) / 'custom-art-test.html'
    html.write_text('''<!doctype html><html data-theme="horror"><meta charset="utf-8">
      <style>''' + (ROOT / 'src/lock.css').read_text(encoding='utf-8')
      + (ROOT / 'src/arms.css').read_text(encoding='utf-8')
      + css.read_text(encoding='utf-8') + '''</style><body>
      <div id="holder"></div>''' + (ROOT / 'src/overlay.html').read_text(encoding='utf-8')
      + '<script>' + js.read_text(encoding='utf-8') + '''</script><script>
      window.messages=[];window.storageErrors=0;window.theme='horror';
      window.art=LockCustomArt.create({getTheme:()=>window.theme,
        overlay:document.getElementById('typing-lock-overlay'),holder:document.getElementById('holder'),
        notify:x=>messages.push(x),onStorageError:()=>storageErrors++});
      window.ready=art.load();window.changeTheme=t=>{window.theme=t;
        document.documentElement.dataset.theme=t;art.apply();art.render();};
      </script></body></html>''', encoding='utf-8')
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page(); errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(html.as_uri()); page.evaluate('ready')
    check(exported(page)['items'] == [], 'Fresh profile has custom art')
    chain = picture(); padlock = picture(80, 100, '#2277aa')
    check(upload(page, 'chain', chain), 'Valid PNG chain rejected')
    check(upload(page, 'lock', padlock, 'lock.webp', 'image/png'), 'Valid padlock rejected')
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') == 'true', 'Custom chain not applied')
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-lock') == 'true', 'Custom lock not applied')
    ratio = page.evaluate("Number(document.getElementById('typing-lock-overlay').style.getPropertyValue('--custom-chain-ratio'))")
    check(abs(ratio - 3) < .001, f'Alpha crop repeat ratio incorrect: {ratio}')
    chain_style = page.locator('.lock-chain').first.evaluate('(e)=>({size:getComputedStyle(e).backgroundSize,image:getComputedStyle(e).backgroundImage})')
    check('blob:' in chain_style['image'] and '100%' in chain_style['size'], 'Custom chain CSS not overriding the defaults')
    check(page.locator('.lock-body').evaluate('(e)=>getComputedStyle(e).display') == 'none', 'Complete custom padlock duplicated into bottom half')
    check(page.locator('.lock-shackle').evaluate('(e)=>getComputedStyle(e).clipPath') == 'none', 'Custom padlock still clipped to default upper half')
    check(page.locator('.lock-shackle').evaluate('(e)=>getComputedStyle(e).backgroundSize') == 'contain', 'Custom padlock stretched')
    original = exported(page)
    for data, name, mime in ((picture(blank=True), 'empty.png', 'image/png'),
                             (base64.b64encode(b'broken image').decode(), 'bad.png', 'image/png'),
                             (chain, 'fake.svg', 'image/svg+xml')):
        check(not upload(page, 'chain', data, name, mime), f'Invalid upload accepted: {name}')
        check(exported(page) == original, f'Invalid upload replaced saved art: {name}')
    check(not page.evaluate('''async()=>art.upload('chain',new File([new Uint8Array(5*1024*1024+1)],'huge.png',{type:'image/png'}))'''), 'Oversize file accepted')
    check(not upload(page, 'chain', picture(4097, 60)), 'Oversize dimensions accepted')
    solid = Image.new('RGBA', (20,20), 'white'); buf=io.BytesIO(); solid.save(buf,format='PNG')
    check(not upload(page, 'lock', base64.b64encode(buf.getvalue()).decode()), 'Blank opaque image accepted')

    # Each theme has separate art; reverting one never clears another.
    page.evaluate("changeTheme('cream')")
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') is None, 'Horror art leaked into cream')
    check(upload(page, 'chain', picture(color='#ffaa88'), 'cream.png'), 'Cream art upload failed')
    page.evaluate("changeTheme('horror')")
    check(next(x for x in exported(page)['items'] if x['theme']=='horror' and x['kind']=='chain')['data'] == original['items'][0]['data'], 'Theme switch changed horror record')
    page.reload(); page.evaluate('ready')
    check(len(exported(page)['items']) == 3, 'Assets not restored after reload')

    # Transaction abort must leave both memory and IndexedDB record unchanged.
    page.evaluate('''()=>{window.realPut=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(...a){const r=realPut.apply(this,a);
        if(this.transaction.db.name==='red-black-lock-art-v1')queueMicrotask(()=>{try{this.transaction.abort()}catch{}});return r;};}''')
    before = exported(page)
    check(not upload(page, 'chain', picture(color='#00cc66'), 'failed.png'), 'Aborted write reported success')
    check(exported(page) == before, 'Aborted write replaced visible art')
    check(page.evaluate('storageErrors') > 0, 'Storage failure not reported')
    page.evaluate('()=>{IDBObjectStore.prototype.put=realPut;}')
    page.evaluate('''()=>{window.realDelete=IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete=function(...a){const r=realDelete.apply(this,a);
        if(this.transaction.db.name==='red-black-lock-art-v1')queueMicrotask(()=>{try{this.transaction.abort()}catch{}});return r;};}''')
    check(not page.evaluate("art.reset('chain')"), 'Aborted default restore reported success')
    check(exported(page) == before, 'Failed restore deleted old art')
    page.evaluate('()=>{IDBObjectStore.prototype.delete=realDelete;}')

    # Decode that returns after a theme change cannot overwrite either theme.
    page.evaluate('''()=>{window.realBitmap=window.createImageBitmap;
      window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>{
        window.releaseBitmap=()=>realBitmap(...args).then(resolve,reject);});}''')
    page.evaluate('''({data})=>{const bytes=Uint8Array.from(atob(data),x=>x.charCodeAt(0));
      window.pending=art.upload('chain',new File([bytes],'late.png',{type:'image/png'}));}''', {'data': picture(color='#6633dd')})
    page.wait_for_function('typeof releaseBitmap === "function"')
    page.evaluate("()=>{changeTheme('cream');releaseBitmap();window.createImageBitmap=realBitmap;}")
    check(not page.evaluate('pending'), 'Late theme upload reported success')
    check(exported(page) == before, 'Late upload saved to a new theme')

    # If two uploads finish out of order, only the newest operation may commit.
    page.evaluate("changeTheme('horror')")
    page.evaluate('''()=>{window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>{
      window.releaseBitmap=()=>realBitmap(...args).then(resolve,reject);});}''')
    page.evaluate('''({data})=>{const bytes=Uint8Array.from(atob(data),x=>x.charCodeAt(0));
      window.pending=art.upload('chain',new File([bytes],'older.png',{type:'image/png'}));}''', {'data':picture(color='#997755')})
    page.wait_for_function('typeof releaseBitmap === "function"')
    page.evaluate('()=>{window.createImageBitmap=realBitmap;}')
    check(upload(page,'chain',picture(color='#22aaaa'),'newest.png'), 'Newest upload was rejected')
    page.evaluate('releaseBitmap()')
    check(not page.evaluate('pending'), 'Older upload superseded a newer upload')
    check(next(x for x in exported(page)['items'] if x['theme']=='horror' and x['kind']=='chain')['name']=='newest.png', 'Out-of-order decode changed the latest record')
    before=exported(page)

    for bad_import in ({'version':1,'items':[original['items'][0],original['items'][0]]},
                       {'version':1,'items':[{'theme':'wrong','kind':'chain','data':chain}]},
                       {'version':99,'items':[]}):
        check(not page.evaluate('(data)=>art.validateImport(data).then(()=>true,()=>false)',bad_import),'Invalid import accepted')
        check(exported(page)==before,'Invalid import changed saved art')

    # The exported bytes can restore every theme in one transaction.
    # Prepared objects include binary data and browser URLs; retain the original in JS.
    page.evaluate('(data)=>art.validateImport(data).then(x=>window.prepared=x)', original)
    warning_count=page.evaluate('storageErrors')
    page.evaluate('''()=>{IDBObjectStore.prototype.put=function(...a){const r=realPut.apply(this,a);
      if(this.transaction.db.name==='red-black-lock-art-v1')queueMicrotask(()=>art.discardImport(prepared));return r;};}''')
    check(not page.evaluate('art.importAssets(prepared).then(()=>true,()=>false)'), 'Cancelled pending import reported success')
    check(exported(page)==before,'Cancelled pending import changed visible art')
    check(page.evaluate('storageErrors')==warning_count,'User cancellation reported as storage failure')
    page.evaluate('()=>{IDBObjectStore.prototype.put=realPut;}')
    page.evaluate('(data)=>art.validateImport(data).then(x=>window.prepared=x)', original)
    page.evaluate('''()=>{IDBObjectStore.prototype.put=function(...a){const r=realPut.apply(this,a);
      if(this.transaction.db.name==='red-black-lock-art-v1')queueMicrotask(()=>{try{this.transaction.abort()}catch{}});return r;};}''')
    check(not page.evaluate('art.importAssets(prepared).then(()=>true,()=>false)'), 'Aborted asset import reported success')
    check(exported(page) == before, 'Aborted multi-record import changed visible records')
    page.evaluate('()=>{IDBObjectStore.prototype.put=realPut;}')
    page.reload(); page.evaluate('ready')
    check(exported(page) == before, 'Aborted multi-record import changed persisted records')
    page.evaluate('(data)=>art.validateImport(data).then(x=>window.prepared=x)', original)
    page.evaluate('art.importAssets(prepared)')
    check(exported(page) == original, 'Imported bytes or theme mapping differ')
    page.evaluate("changeTheme('horror')")
    check(page.evaluate("art.reset('chain')"), 'Default chain restore failed')
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') is None, 'Default chain restore kept override')
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-lock') == 'true', 'Chain restore removed custom lock')
    page.reload();page.evaluate('ready')
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') is None, 'Default restoration was not persisted')
    page.evaluate("changeTheme('cream')")
    check(upload(page,'chain',picture(kind='JPEG'),'photo.jpeg','image/jpeg'), 'JPEG rejected')
    check(upload(page,'lock',picture(80,100,kind='WEBP'),'lock.webp','image/webp'), 'WebP rejected')
    # Ninth theme has isolated uploads and participates in a full 18-image backup.
    page.evaluate("changeTheme('fufu')")
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-chain') is None, 'Old art leaked into fufu')
    check(upload(page,'chain',chain) and upload(page,'lock',padlock), 'Fufu upload rejected')
    page.reload();page.evaluate('ready');page.evaluate("changeTheme('fufu')")
    check(page.locator('#typing-lock-overlay').get_attribute('data-custom-lock')=='true','Fufu upload not persisted')
    all_art={'version':1,'items':[dict(original['items'][i],theme=theme) for theme in ['fufu','horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream'] for i in range(2)]}
    page.evaluate('(data)=>art.validateImport(data).then(x=>window.prepared=x)',all_art)
    page.evaluate('art.importAssets(prepared)')
    check(len(exported(page)['items'])==18,'Full nine-theme backup did not import')
    check(not errors, 'Browser errors: '+str(errors))
    browser.close()
    print('PASS custom art: decode, crop/contain, per-theme reload, validation, aborted persistence, stale upload and atomic import')
