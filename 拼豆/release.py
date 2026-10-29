from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import shutil

ROOT = Path(__file__).resolve().parent
DELIVERY = ROOT / '交付'
HTML_SOURCE = ROOT / '拼豆-1.html'
HTML_DELIVERY = DELIVERY / '拼豆-1.html'
PDF = DELIVERY / '使用说明.pdf'
VIDEO = DELIVERY / '拼豆演示.mp4'
ZIP = DELIVERY / '拼豆工坊-V5.6.1.zip'

if not HTML_SOURCE.is_file() or HTML_SOURCE.stat().st_size == 0:
    raise SystemExit('先运行 npm run build，生成拼豆-1.html')
for path in (PDF, VIDEO):
    if not path.is_file() or path.stat().st_size == 0:
        raise SystemExit(f'缺少交付文件：{path}')

DELIVERY.mkdir(parents=True, exist_ok=True)
shutil.copyfile(HTML_SOURCE, HTML_DELIVERY)
items = [HTML_DELIVERY, PDF, VIDEO]
with ZipFile(ZIP, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for path in items:
        archive.write(path, path.name)

with ZipFile(ZIP) as archive:
    if set(archive.namelist()) != {path.name for path in items}:
        raise SystemExit('ZIP 文件清单不符合交付约定')
    for path in items:
        expected = path.read_bytes()
        actual = archive.read(path.name)
        if actual != expected:
            raise SystemExit(f'ZIP 文件与交付文件不一致：{path.name}')
        print(f'{path.name}: {len(expected):,} bytes, SHA256 {hashlib.sha256(expected).hexdigest()}')

print(f'已核对 {ZIP.name}，恰好包含 HTML、PDF、MP4。')
