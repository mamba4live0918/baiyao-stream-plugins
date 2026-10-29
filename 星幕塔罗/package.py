from pathlib import Path
import zipfile,hashlib,json,re
ROOT=Path(__file__).resolve().parent
out=ROOT.parent/'output'/'release'
out.mkdir(parents=True,exist_ok=True)
archive=out/'星幕塔罗-3-20260912.zip'
files=['星幕塔罗-3.html','星幕塔罗-3-使用说明.pdf']
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name in files:z.write(ROOT/name,name)
qa=Path('C:/Users/Mamba4live/.codex/tmp/tarot-v3-qa/package')
qa.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
    assert z.namelist()==files
    hashes={}
    for name in files:
        b=z.read(name)
        assert b==(ROOT/name).read_bytes()
        (qa/name).write_bytes(b)
        hashes[name]=hashlib.sha256(b).hexdigest()
    h=z.read(files[0]).decode('utf8')
    assert len(re.findall(r'data:image/jpeg;base64,',h))==78
    assert not re.search(r'<script[^>]+src=',h)
    assert not re.search(r'<link[^>]+(?:stylesheet|preload)',h)
    assert not re.search(r'(?:src=["\']|url\()["\']?(?:https?://|file:|[A-Z]:\\)',h)
print(json.dumps({'zip':str(archive),'bytes':archive.stat().st_size,'files':hashes,'embeddedCards':78},ensure_ascii=False))
