from pathlib import Path
import hashlib
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / '红黑破锁-V2.3.3-20261016.zip'
FILES = [ROOT / '红黑破锁-1.html', ROOT / '使用说明.pdf']

for path in FILES:
    if not path.is_file() or path.stat().st_size == 0:
        raise SystemExit(f'missing release file: {path}')

with ZipFile(OUTPUT, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in FILES:
        archive.write(path, path.name)

with ZipFile(OUTPUT) as archive:
    expected = {path.name for path in FILES}
    if set(archive.namelist()) != expected:
        raise SystemExit('archive contains unexpected files')
    for path in FILES:
        if archive.read(path.name) != path.read_bytes():
            raise SystemExit(f'archive mismatch: {path.name}')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        print(f'{path.name}: {path.stat().st_size:,} bytes, SHA256 {digest}')

print(f'Packaged {OUTPUT.name}: {OUTPUT.stat().st_size:,} bytes; exactly HTML + PDF')
