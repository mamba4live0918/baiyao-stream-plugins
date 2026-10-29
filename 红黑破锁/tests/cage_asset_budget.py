"""Exercise real concurrent IndexedDB writes with a scaled-down total limit."""
from pathlib import Path
import base64,io,os
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];Q=R/'qa/2026-10-15-V2.3.2-自测';os.environ['TEMP']=os.environ['TMP']=str(Q/'runtime-tmp')
image=Image.new('RGBA',(40,100));ImageDraw.Draw(image).rectangle((12,4,28,95),fill='red');out=io.BytesIO();image.save(out,format='PNG');data=base64.b64encode(out.getvalue().ljust(4096,b'\0')).decode()
source=(R/'src/custom-art.js').read_text(encoding='utf-8');assert 'MAX_TOTAL_BYTES=90*1024*1024' in source
# Same production write queue and decoder, with 6 KB representing the 90 MB limit.
source=source.replace('MAX_TOTAL_BYTES=90*1024*1024','MAX_TOTAL_BYTES=6000')
path=Q/'budget-harness.html';path.write_text('<meta charset="utf-8"><div id="overlay"></div><div id="holder"></div><script>'+source+'</script><script>art=LockCustomArt.create({getTheme:()=>"fufu",getMode:()=>"cage",overlay:document.getElementById("overlay"),holder:document.getElementById("holder")});</script>',encoding='utf-8')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 try:
  page=b.new_page();page.goto(path.as_uri())
  result=page.evaluate('''async data=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const results=await Promise.all([art.upload('chain',new File([bytes],'chain.png',{type:'image/png'})),art.upload('cageBar',new File([bytes],'bar.png',{type:'image/png'}))]);return {results,items:art.exportAssets().items.length};}''',data)
  assert result['results'].count(True)==1 and result['items']==1,result
 finally:b.close()
print('PASS concurrent image budget: serialized commit rejects second over-budget write')
