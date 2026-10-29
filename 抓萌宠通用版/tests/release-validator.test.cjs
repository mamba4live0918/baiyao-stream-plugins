const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, '开发', 'V1', 'package.py');
const python = process.env.PYTHON || 'python';
const setup = `
import copy,json,pathlib,runpy,sys
m=runpy.run_path(sys.argv[1])
root=m['ROOT']
manifest=json.loads((root/'素材/manifest.json').read_text(encoding='utf-8'))
`;

function runPython(code) {
  const wrapped=setup+'try:\n'+code.split('\n').map(line=>' '+line).join('\n')+'\nexcept m["MissingDeliveryError"] as e:\n print("SKIP:"+str(e))\n';
  return execFileSync(python, ['-c', wrapped, script], { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim();
}

test('source validator preserves the complete V1.0.24 manifest for the V1.0.25 keyboard update', () => {
  const output = runPython(`
result=m['verified_manifest']()
print(json.dumps(result,sort_keys=True))
`);
  assert.deepEqual(JSON.parse(output), {
    dog: 12, cow: 12, cat: 12, slime: 12, sheep: 12, seal: 12,
    xiaoyao: 20, aquarium: 12, yajiji: 8,
  });
});

test('ordinary source I/O failures never become a historical-delivery skip', () => {
  assert.throws(()=>runPython("raise FileNotFoundError('source-art.png')"),/source-art\.png/);
});

test('original source validation rejects metadata replacement and any unapproved category edit', () => {
  assert.equal(runPython(`
m['verified_original_assets'](manifest)
for label,mutate in [
 ('old-name',lambda a:a['cows'][72].update(name='changed')),
 ('old-kind',lambda a:a['cows'][95].update(kind=95)),
 ('old-body-path',lambda a:a['cows'][79].update(src=a['cows'][94]['src'])),
 ('native-category',lambda a:a['categories'][0].update(name='changed')),
 ('group-alias',lambda a:a['categories'][6]['labels'].update({'cat-02':'changed'})),
 ('group-order',lambda a:a['categories'][6]['members'].reverse()),
 ('extra-group-field',lambda a:a['categories'][6].update(extra=True)),
 ('old-nest',lambda a:a['barns'][0].update(name='changed')),
 ('cloud-name',lambda a:a['cows'][110].update(name='changed')),
 ('bell-cat-kind',lambda a:a['cows'][111].update(kind=111)),
 ('bell-cat-cycle',lambda a:a['cows'][111].update(poseCycleMs=1)),
 ('new-manifest-field',lambda a:a.update(extra=True)),
]:
 changed=copy.deepcopy(manifest)
 mutate(changed)
 try:m['verified_original_assets'](changed)
 except AssertionError:pass
 else:raise AssertionError('Accepted unapproved source change: '+label)
print('approved-only')
`), 'approved-only');
});

test('current checkpoint verifies all 259 asset hashes including the main manifest and exact source groups', () => {
  assert.equal(runPython(`
from unittest.mock import patch
checkpoint=m['verified_current_source_assets']()
assert len(checkpoint['assets'])==259 and len(checkpoint['archives'])==61 and len(checkpoint['sources'])==47
assert manifest==checkpoint['manifest']
read_bytes=pathlib.Path.read_bytes
for filename in ['素材/manifest.json','素材/配饰/manifest.json',manifest['cows'][111]['src']]:
 target=root/filename if filename.startswith('素材/') else root/'素材'/filename
 def changed_read_bytes(source,target=target):
  data=read_bytes(source)
  return data+b'changed' if source==target else data
 with patch.object(pathlib.Path,'read_bytes',changed_read_bytes):
  try:m['verified_current_source_assets']()
  except AssertionError:pass
  else:raise AssertionError('Accepted changed source asset: '+filename)
read_text=pathlib.Path.read_text
for filename,key in [('manifest.json','sourceFriends'),('group.json','group'),('furry-group.json','furry')]:
 target=root/'素材/小曜自己人'/filename
 changed=copy.deepcopy(checkpoint[key])
 if isinstance(changed,list):changed[0]['name']='changed'
 else:changed['name']='changed'
 def changed_read_text(source,*args,target=target,changed=changed,**kwargs):
  return json.dumps(changed) if source==target else read_text(source,*args,**kwargs)
 with patch.object(pathlib.Path,'read_text',changed_read_text):
  try:m['verified_current_source_assets']()
  except AssertionError:pass
  else:raise AssertionError('Accepted changed source group: '+filename)
print('complete-checkpoint')
`), 'complete-checkpoint');
});

test('previous embedded assets retain old bodies and allow only nine approved additions and the approved groups', t => {
  const output=runPython(`
page=m['require_deliveries'](['抓萌宠通用版.html'])['抓萌宠通用版.html'].read_text(encoding='utf-8')
marker='const ASSETS='
assets,_=json.JSONDecoder().raw_decode(page,page.index(marker)+len(marker))
del page
m['verified_previous_assets'](assets)
for label,mutate in [
 ('old-name',lambda a:a['cows'][72].update(name='changed')),
 ('old-body',lambda a:a['cows'][79].update(src=a['cows'][94]['src'])),
 ('new-id',lambda a:a['cows'][103].update(id='unexpected-friend')),
 ('new-kind',lambda a:a['cows'][103].update(kind=103)),
 ('new-body',lambda a:a['cows'][103].update(src=a['cows'][104]['src'])),
 ('new-cycle',lambda a:a['cows'][103].update(poseCycleMs=50)),
 ('lynx-id',lambda a:a['cows'][107].update(id='wrong-lynx')),
 ('whale-facing',lambda a:a['cows'][108].update(sourceFacing=-1)),
 ('world-body',lambda a:a['cows'][109].update(src=a['cows'][107]['src'])),
 ('cloud-kind',lambda a:a['cows'][110].update(kind=110)),
 ('cat-motion',lambda a:a['cows'][111].update(motion='swim')),
 ('furry-dog',lambda a:a['categories'][7]['members'].remove('friend-dog')),
 ('extra-body',lambda a:a['cows'].append(a['cows'][-1])),
 ('missing-body',lambda a:a['cows'].pop()),
 ('native-category',lambda a:a['categories'][0].update(name='changed')),
 ('group-alias',lambda a:a['categories'][6]['labels'].update({'cat-02':'changed'})),
 ('audio',lambda a:a['audio'].clear()),
 ('blind-box',lambda a:a['blindBox'].update(closed='data:image/png;base64,wrong')),
 ('duration',lambda a:a['durations'].clear()),
 ('nest',lambda a:a['barns'][0].update(name='changed')),
 ('ball',lambda a:a['balls'][0].update(name='changed')),
 ('avatar',lambda a:a.update(demoAvatar='wrong')),
 ('extra-field',lambda a:a.update(otherAssets={})),
 ('missing-accessories',lambda a:a.pop('accessories')),
]:
 changed=copy.deepcopy(assets)
 mutate(changed)
 try:m['verified_previous_assets'](changed)
 except AssertionError:pass
 else:raise AssertionError('Accepted unapproved embedded change: '+label)
print('approved-only')
`);
  if(output.startsWith('SKIP:'))return t.skip(output.slice(5));
  assert.equal(output, 'approved-only');
});

test('embedded accessory validation rejects swapped PNG data or metadata without requiring distinct prop frames', t => {
  const output=runPython(`
page=m['require_deliveries'](['抓萌宠通用版.html'])['抓萌宠通用版.html'].read_text(encoding='utf-8')
marker='const ASSETS='
assets,_=json.JSONDecoder().raw_decode(page,page.index(marker)+len(marker))
del page
m['verified_accessories'](assets)
for label,mutate in [
 ('wrong-image',lambda a:a['accessories']['72'].update(src=a['accessories']['74']['src'])),
 ('wrong-preview',lambda a:a['accessories']['72'].update(preview=a['accessories']['74']['preview'])),
 ('wrong-kind',lambda a:a['accessories']['72'].update(kind=73)),
 ('missing-overlay',lambda a:a['accessories'].pop('94')),
 ('extra-overlay',lambda a:a['accessories'].update({'73':a['accessories']['72']})),
 ('extra-metadata',lambda a:a['accessories']['72'].update(other=True)),
]:
 changed=copy.deepcopy(assets)
 mutate(changed)
 try:m['verified_accessories'](changed)
 except AssertionError:pass
 else:raise AssertionError('Accepted malformed accessory: '+label)
print('verified')
`);
  if(output.startsWith('SKIP:'))return t.skip(output.slice(5));
  assert.equal(output, 'verified');
});

test('keyboard-removal checkpoint rejects any ASSETS change against the actual V1.0.24 share HTML', t => {
  const output=runPython(`
page=m['require_deliveries'](['抓萌宠通用版.html'])['抓萌宠通用版.html'].read_text(encoding='utf-8')
marker='const ASSETS='
assets,_=json.JSONDecoder().raw_decode(page,page.index(marker)+len(marker))
del page
m['verified_naming_checkpoint'](assets)
for label,mutate in [
 ('pet-name',lambda a:a['cows'][111].update(name='changed')),
 ('pet-body',lambda a:a['cows'][111].update(src=a['cows'][110]['src'])),
 ('group-label',lambda a:a['categories'][6]['labels'].update({'friend-cloud':'changed'})),
 ('group-order',lambda a:a['categories'][6]['members'].reverse()),
 ('category-field',lambda a:a['categories'][0].update(extra=True)),
 ('accessory',lambda a:a['accessories']['72'].update(name='changed')),
 ('audio',lambda a:a['audio'].clear()),
 ('duration',lambda a:a['durations'].clear()),
 ('missing-field',lambda a:a.pop('demoAvatar')),
 ('extra-field',lambda a:a.update(extraAssets={})),
]:
 changed=copy.deepcopy(assets)
 mutate(changed)
 try:m['verified_naming_checkpoint'](changed)
 except AssertionError:pass
 else:raise AssertionError('Accepted changed V1.0.24 ASSETS: '+label)
print('unchanged-assets')
`);
  if(output.startsWith('SKIP:'))return t.skip(output.slice(5));
  assert.equal(output, 'unchanged-assets');
});

test('new release validation verifies all 112 inline bodies and preserves all 61 old PDFs and ZIPs', t => {
  const output = runPython(`
data=m['verified_html']()
archives=m['verified_archives']()
checkpoint=m['current_preservation_baseline']()
archives.update({name:item['sha256'] for name,item in checkpoint['archives'].items()})
print(json.dumps({'creatures':len(manifest['cows']),'archives':len(archives),'version':b'V1.0.25' in data,'scripts':data.count(b'<script>')}))
`);
  if(output.startsWith('SKIP:'))return t.skip(output.slice(5));
  assert.deepEqual(JSON.parse(output), { creatures: 112, archives: 61, version: true, scripts: 27 });
});

test('archive writer refuses to overwrite an existing delivery', () => {
  assert.equal(runPython(`
import tempfile
with tempfile.TemporaryDirectory() as directory:
 target=pathlib.Path(directory)/'old.zip'
 source=pathlib.Path(directory)/'release.html'
 target.write_bytes(b'preserved old release')
 source.write_bytes(b'new release')
 try:m['create_zip'](target,[(source,'release.html')])
 except FileExistsError:pass
 else:raise AssertionError('Existing release overwritten')
 assert target.read_bytes()==b'preserved old release'
print('preserved')
`), 'preserved');
});

test('deprecated release producer exits with guidance before attempting any validation or archive write', () => {
  const output = runPython(`
def prohibit_legacy_producer():
 raise AssertionError('The deprecated archive producer was invoked')
m['main'].__globals__['verified_html']=prohibit_legacy_producer
try:m['main']()
except SystemExit as result:
 assert result.code==2
 print('exit=2')
else:raise AssertionError('Deprecated release producer did not refuse')
`);
  assert.match(output, /package-share\.py.*--tests-passed/);
  assert.match(output, /exit=2$/);
  const cli = spawnSync(python, [script], { encoding: 'utf8', cwd: root });
  assert.equal(cli.status, 2, cli.stderr);
  assert.match(cli.stdout, /package-share\.py.*--tests-passed/);
});
