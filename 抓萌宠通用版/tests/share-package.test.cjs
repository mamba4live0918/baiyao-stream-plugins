const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, '开发', 'V1', 'package-share.py');
const python = process.env.PYTHON || 'python';

function runPython(code, args = []) {
  assert.ok(fs.existsSync(script), 'Latest share packaging entry point is missing');
  return execFileSync(python, ['-c', code, script, ...args], { encoding: 'utf8' });
}

test('latest share package contains only the release and corrected tutorial', () => {
  const output = runPython("import json,runpy,sys; m=runpy.run_path(sys.argv[1]); print(json.dumps([name for _,name in m['share_files']()],ensure_ascii=True))");
  assert.deepEqual(JSON.parse(output), [
    '抓萌宠通用版.html',
    '抓萌宠通用版-图文说明书-V1.0.25.pdf',
    '使用说明.txt',
    '演示视频/抓萌宠通用版-V1.0.18-使用教程-隐私修正版.mp4',
    '演示视频/抓萌宠通用版-V1.0.18-使用教程-隐私修正版.srt',
  ]);
});

test('new share output preserves the old archives and reports under its own version', () => {
  const output = runPython("import json,runpy,sys; m=runpy.run_path(sys.argv[1]); print(json.dumps([m['SHARE'].name,m['REPORT'].name],ensure_ascii=True))");
  assert.deepEqual(JSON.parse(output), [
    '抓萌宠通用版-V1.0.25-最新版分享包.zip',
    'V1.0.25-最新版分享包校验.json',
  ]);
});

test('share packaging verifies the corrected video and rejects other bytes', () => {
  const good = runPython("import pathlib,runpy,sys; m=runpy.run_path(sys.argv[1]); m['verify_tutorial'](m['share_files']()[3][0]); print('verified')");
  assert.equal(good.trim(), 'verified');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-share-test-'));
  const wrong = path.join(directory, 'wrong.mp4');
  try {
    fs.writeFileSync(wrong, 'not the corrected tutorial');
    const result = runPython("import pathlib,runpy,sys; m=runpy.run_path(sys.argv[1]);\ntry: m['verify_tutorial'](pathlib.Path(sys.argv[2]))\nexcept AssertionError: print('rejected')\nelse: raise AssertionError('Unverified video accepted')", [wrong]);
    assert.equal(result.trim(), 'rejected');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
