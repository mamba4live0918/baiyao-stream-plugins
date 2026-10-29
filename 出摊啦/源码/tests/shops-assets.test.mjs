import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../assets');
const json=f=>JSON.parse(readFileSync(resolve(root,f),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('batch5 exports twenty independently generated transparent shop sprites',()=>{
 const m=json('manifest.json'),list=m.assets.filter(a=>a.batch===5),records=json('prompts/shops-batch5.json');
 assert.equal(list.length,20);assert.equal(records.filter(r=>r.selected).length,20);assert.equal(new Set(records.map(r=>r.sourcePath)).size,20);
 for(const a of list){const r=records.find(r=>r.id===a.id);assert.ok(r?.prompt&&r.tool==='image_gen built-in',a.id);assert.equal(sha(readFileSync(resolve(root,a.rawSource))),sha(readFileSync(r.sourcePath)),a.id);const p=readFileSync(resolve(root,a.src));assert.equal(p.readUInt32BE(16),a.sourceSize.width);assert.equal(p.readUInt32BE(20),a.sourceSize.height);assert.ok(p[25]===6||p[25]===4);assert.equal(a.derivation.drawn,false);}
 assert.equal(m.assets.length,185);assert.equal(json('prompts/generation-records.json').selectedCoverage,185);
});
test('all 501 existing raw PNG and WebP files remain byte-identical',()=>{
 const frozen=json('approved-through-batch4-hashes.json');assert.equal(frozen.entries.length,501);
 for(const e of frozen.entries){const b=readFileSync(resolve(root,e.path));assert.equal(b.length,e.bytes,e.path);assert.equal(sha(b),e.sha256,e.path);}
});
test('cup layers share canonical canvas and batter overlays have explicit registration',async()=>{
 const meta=(await import('../assets/shops-meta.mjs')).default;
 for(const id of ['cup_back','cup_front','cup_tea','cup_pearls_1','cup_pearls_2','cup_pearls_3','cup_lid']){assert.deepEqual(meta[id].sourceSize,{width:220,height:340});assert.equal(meta[id].anchor.units,'source-px');assert.ok(meta[id].layerRect,id);}
 for(const id of ['batter_disk_1','batter_disk_2','batter_disk_3']){assert.deepEqual(meta[id].sourceSize,{width:560,height:440});assert.equal(meta[id].anchor.name,'batter-center');assert.equal(meta[id].layerRect.units,'source-px');}
 assert.equal(meta.griddle.anchor.name,'cooking-center');assert.equal(meta.spatula.anchor.name,'grip');assert.ok(meta.shaker.anchors.some(a=>a.name==='mouth-center'));
 const js=readFileSync(resolve(root,'preview.js'),'utf8'),html=readFileSync(resolve(root,'预览.html'),'utf8');assert.match(html,/id="shops-grid"/);assert.match(js,/shopState/);
});
