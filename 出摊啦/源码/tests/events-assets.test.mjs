import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../assets');
const json=file=>JSON.parse(readFileSync(resolve(root,file),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('batch4 exports 45 separately generated event sprites with traceable alpha PNGs',()=>{
 const m=json('manifest.json'),list=m.assets.filter(a=>a.batch===4),records=[...json('prompts/events-actors-batch4.json'),...json('prompts/events-fx-batch4.json')].filter(r=>r.selected);
 assert.equal(list.length,45);assert.equal(records.length,45);assert.equal(new Set(records.map(r=>r.sourcePath)).size,45);
 for(const a of list){const r=records.find(r=>r.id===a.id);assert.ok(r&&r.prompt&&r.tool==='image_gen built-in',a.id);assert.equal(sha(readFileSync(resolve(root,a.rawSource))),sha(readFileSync(r.sourcePath)),a.id);const png=readFileSync(resolve(root,a.src));assert.equal(png.readUInt32BE(16),a.displaySize.width*2);assert.equal(png.readUInt32BE(20),a.displaySize.height*2);assert.ok(png[25]===6||png[25]===4);assert.equal(a.derivation.drawn,false);assert.equal(a.derivation.recolored,false);}
 assert.equal(json('prompts/generation-records.json').selectedCoverage,m.assets.length);
});
test('all 366 pre-batch4 raw and approved PNG/WebP bytes remain identical',()=>{
 const frozen=json('approved-through-batch3-hashes.json');assert.equal(frozen.entries.length,366);
 for(const e of frozen.entries){const b=readFileSync(resolve(root,e.path));assert.equal(b.length,e.bytes,e.path);assert.equal(sha(b),e.sha256,e.path);}
});
test('event animation families retain frames and source-pixel attachment metadata',async()=>{
 const m=json('manifest.json'),meta=(await import('../assets/events-meta.mjs')).default;
 const families=[['thief_walk_1','thief_walk_2'],['cat_sit','cat_eat','cat_held'],['bus','bus_door_open'],['helper_run_1','helper_run_2','helper_serve'],['guard_stand','guard_block'],['flame_1','flame_2','flame_3'],['foam_1','foam_2','foam_3']];
 for(const ids of families){const first=meta[ids[0]];assert.ok(first);for(const id of ids){assert.deepEqual(meta[id].sourceSize,first.sourceSize,id);assert.deepEqual(meta[id].anchor,first.anchor,id);}}
 for(const a of m.assets.filter(a=>a.batch===4)){assert.deepEqual(meta[a.id].sourceSize,a.sourceSize);assert.equal(meta[a.id].anchor.units,'source-px');}
 for(const id of ['thief_sack','big_hand','helper_run_1','guard_shield','wanted_poster','bus']){const r=meta[id].textRect;assert.ok(r&&r.units==='source-px',id);assert.ok(r.width>0&&r.height>0);}
 assert.ok(meta.bus.anchors.some(a=>a.name==='wheel-left'));assert.ok(meta.fuse_box.anchors.some(a=>a.name==='lever-pivot'));
});
test('full source bundle and preview retain all assets within the new 10MB budget',()=>{
 const m=json('manifest.json'),report=json('processing-report.json');assert.ok(m.assets.length>=165);assert.equal(m.inlineBudgetBytes,10000000);assert.equal(report.readyAssets,m.assets.length);
 const input=readFileSync(resolve(root,'inline-assets.mjs'),'utf8');const payload=JSON.parse(input.slice(input.indexOf('export default ')+15,input.lastIndexOf(';')));assert.equal(Object.keys(payload).length,m.assets.length);
 const html=readFileSync(resolve(root,'预览.html'),'utf8'),js=readFileSync(resolve(root,'preview.js'),'utf8');assert.match(html,/id="events-grid"/);assert.match(js,/eventState/);
});
