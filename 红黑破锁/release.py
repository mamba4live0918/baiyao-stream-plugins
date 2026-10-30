from pathlib import Path
import hashlib
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
NAME = '红黑破锁-V2.4-BYSL-20261030'  # BYSL = 白曜 + 菘蓝 都能导入
FOLDER = ROOT / NAME
OUTPUT = ROOT / f'{NAME}.zip'
FILES = [ROOT / '红黑破锁-1.html', ROOT / '使用说明.pdf']

for path in FILES:
    if not path.is_file() or path.stat().st_size == 0:
        raise SystemExit(f'missing release file: {path}')
for target in (FOLDER, OUTPUT):
    if target.exists():
        raise SystemExit(f'already exists, move it away first: {target.name}')

FOLDER.mkdir()
for path in FILES:
    shutil.copy2(path, FOLDER / path.name)

with ZipFile(OUTPUT, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in FILES:
        archive.write(path, path.name)

expected = {path.name for path in FILES}
with ZipFile(OUTPUT) as archive:
    if set(archive.namelist()) != expected:
        raise SystemExit('archive contains unexpected files')
    if {path.name for path in FOLDER.iterdir()} != expected:
        raise SystemExit('folder contains unexpected files')
    for path in FILES:
        data = path.read_bytes()
        if archive.read(path.name) != data or (FOLDER / path.name).read_bytes() != data:
            raise SystemExit(f'package mismatch: {path.name}')
        print(f'{path.name}: {len(data):,} bytes, SHA256 {hashlib.sha256(data).hexdigest()}')

print(f'Packaged {NAME}: zip {OUTPUT.stat().st_size:,} bytes + folder; exactly HTML + PDF')
