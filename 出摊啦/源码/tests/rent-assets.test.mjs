import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../assets');
const json=name=>JSON.parse(readFileSync(resolve(root,name),'utf8').replace(/^\uFEFF/,''));
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const expected=['landlady_stand','landlady_stamp','landlady_book','rent_sign','overtime_clock'];

test('third batch has five generated transparent sprites with traceable unmodified originals',()=>{
 const manifest=json('manifest.json'),assets=manifest.assets.filter(a=>a.batch===3);
 assert.deepEqual(assets.map(a=>a.id).sort(),[...expected].sort());
 const records=json('prompts/rent-batch3.json').filter(r=>r.selected);
 assert.equal(records.length,5);
 assert.equal(new Set(records.map(r=>r.sourcePath)).size,5);
 const provenance=json('prompts/generation-records.json');
 assert.equal(provenance.selectedCoverage,manifest.assets.length);
 const covered=new Set(provenance.records.filter(r=>r.selected).flatMap(r=>r.assetIds));
 for(const asset of assets){
  assert.ok(covered.has(asset.id));
  const record=records.find(r=>r.id===asset.id);
  assert.ok(record.prompt&&record.tool==='image_gen built-in');
  assert.equal(sha(readFileSync(resolve(root,asset.rawSource))),sha(readFileSync(record.sourcePath)),asset.id);
  const png=readFileSync(resolve(root,asset.src));
  assert.equal(png.readUInt32BE(16),asset.displaySize.width*2,asset.id);
  assert.equal(png.readUInt32BE(20),asset.displaySize.height*2,asset.id);
  assert.ok(png[25]===6||png[25]===4,asset.id+' has alpha');
  assert.equal(asset.derivation.drawn,false);
  assert.equal(asset.derivation.recolored,false);
 }
});

test('landlady pose swap keeps the same frame, feet, and independent book attachment',async()=>{
 const manifest=json('manifest.json'),byId=new Map(manifest.assets.map(a=>[a.id,a]));
 const stand=byId.get('landlady_stand'),stamp=byId.get('landlady_stamp');
 assert.ok(stand&&stamp,'both poses are required');
 assert.equal(stand.displaySize.height,260);
 assert.deepEqual(stamp.sourceSize,stand.sourceSize);
 assert.deepEqual(stamp.anchor,stand.anchor);
 assert.equal(stand.anchor.name,'feet-center');
 assert.deepEqual(stamp.anchors.find(a=>a.name==='book-grip'),stand.anchors.find(a=>a.name==='book-grip'));
 assert.deepEqual(manifest.sequences.find(s=>s.id==='landlady_pose').frames,['landlady_stand','landlady_stamp']);
 const meta=(await import('../assets/rent-meta.mjs')).default;
 for(const id of expected){
  const asset=byId.get(id);
  assert.deepEqual(meta[id].sourceSize,asset.sourceSize);
  assert.deepEqual(meta[id].anchor,asset.anchor);
 }
 for(const [id,key]of [['rent_sign','textRect'],['overtime_clock','screenRect'],['landlady_book','stampRect']]){
  const asset=byId.get(id),rect=asset[key];
  assert.ok(rect&&rect.width>0&&rect.height>0,id);
  assert.equal(rect.units,'source-px');
  assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=asset.sourceSize.width&&rect.y+rect.height<=asset.sourceSize.height,id);
  assert.deepEqual(meta[id][key],rect);
 }
});

test('all 351 pre-third-batch raw, PNG and WebP files remain byte-identical',()=>{
 const baseline=json('approved-through-batch2-hashes.json');
 assert.equal(baseline.entries.length,351);
 for(const entry of baseline.entries){
  const buffer=readFileSync(resolve(root,entry.path));
  assert.equal(buffer.length,entry.bytes,entry.path);
  assert.equal(sha(buffer),entry.sha256,entry.path);
 }
});

test('all third-batch inputs are exported without dropping earlier assets',()=>{
 const manifest=json('manifest.json'),report=json('processing-report.json');
 assert.ok(manifest.assets.length>=120);
 assert.equal(report.readyAssets,manifest.assets.length);
 const source=readFileSync(resolve(root,'inline-assets.mjs'),'utf8');
 const payload=JSON.parse(source.slice(source.indexOf('export default ')+15,source.lastIndexOf(';')));
 assert.equal(Object.keys(payload).length,manifest.assets.length);
 for(const id of expected)assert.match(payload[id],/^data:image\/webp;base64,/);
});
