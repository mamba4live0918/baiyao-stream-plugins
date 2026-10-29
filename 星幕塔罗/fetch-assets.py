"""Fetch the matching public-domain RWS card scans with source metadata."""
import json, pathlib, requests, concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parent
HEADERS={'User-Agent':'StarveilTarot/1.0 (offline desktop card-table asset collection)'}
API='https://commons.wikimedia.org/w/api.php'
def api(params):
    r=requests.get(API,params={'action':'query','format':'json',**params},headers=HEADERS,timeout=40)
    r.raise_for_status()
    return r.json()
files=api({'list':'categorymembers','cmtitle':'Category:Rider-Waite-Smith tarot deck (TaionWC)','cmtype':'file','cmlimit':100})['query']['categorymembers']
assert len(files)==78
records=[]
for start in range(0,78,30):
    pages=api({'titles':'|'.join(x['title'] for x in files[start:start+30]),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':330})['query']['pages']
    for page in pages.values():
        info=page['imageinfo'][0]
        license=info.get('extmetadata',{}).get('LicenseShortName',{}).get('value','')
        if 'Public domain' not in license: raise ValueError((page['title'],license))
        records.append({'title':page['title'],'url':info['thumburl'],'source':info['descriptionurl'],'license':license,'artist':'Pamela Colman Smith','file':page['title'][5:]+'.jpg'})
def get(item):
    path=ROOT/'assets'/item['file']
    if path.exists(): return item['title']+' cached'
    r=requests.get(item['url'],headers=HEADERS,timeout=50)
    r.raise_for_status()
    assert r.content[:2]==b'\xff\xd8',item['title']
    path.write_bytes(r.content)
    return item['title']
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for result in pool.map(get,records): print(result,flush=True)
(ROOT/'assets'/'sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
print('78 images and license metadata saved',flush=True)
