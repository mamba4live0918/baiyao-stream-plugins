from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import os
import re
import subprocess
import sys
import shutil
import json

ROOT = Path(__file__).resolve().parents[1]
ZIP = Path(os.environ.get('LOCK_ZIP', ROOT / '红黑破锁-V2.3.2-20261015.zip')).resolve()
QA=ROOT/'qa/2026-10-15-V2.3.2-自测'
TMP=QA/'runtime-tmp';TMP.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(TMP)
with TemporaryDirectory(prefix='red-black-lock-release-',dir=TMP) as temporary:
    folder = Path(temporary)
    with ZipFile(ZIP) as archive:
        assert set(archive.namelist()) == {'红黑破锁-1.html', '使用说明.pdf'}
        archive.extractall(folder)
        for name in archive.namelist():
            assert archive.read(name) == (ROOT / name).read_bytes(), f'archive mismatch: {name}'
    html = (folder / '红黑破锁-1.html').read_text(encoding='utf-8')
    assert html.count('data:image/webp;base64,') == 143 and 'data:image/png' not in html, 'expected 26 lock/chain images and 117 original cage components'
    assert not re.search(r'<(?:script|link|img)[^>]+(?:src|href)\s*=\s*["\'](?!data:|#)', html, re.I)
    env = dict(os.environ, LOCK_HTML=str(folder / '红黑破锁-1.html'))
    suite=subprocess.run([sys.executable,'-X','utf8',str(ROOT/'qa/run_v232_suite.py'),'--html',str(folder/'红黑破锁-1.html')],env=env)
    node = shutil.which('node') or str(Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
    command=[node,'--test','--test-reporter=tap',*map(str,sorted((ROOT/'tests').glob('*.test.cjs')))]
    node_result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8')
    (QA/'node-tests.log').write_text(node_result.stdout+node_result.stderr,encoding='utf-8')
    counts={key:int(re.search(r'^# '+key+r' (\d+)$',node_result.stdout,re.M).group(1)) for key in ['tests','pass','fail','skipped']}
    report={'archive':str(ZIP),'package_checks':'passed','browser':json.loads((QA/'suite-results.json').read_text(encoding='utf-8'))['totals'],'node':counts,'extracted_html_verified':True}
    (QA/'package-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    if suite.returncode or node_result.returncode:raise SystemExit(1)
print('PASS release ZIP: exactly HTML + PDF, matching sources, inline assets, opened extracted HTML in browser')
