import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutCrowd, rectIntersectsZone } from '../src/crowd/layout.js';
import { defaultZone } from '../src/zone.js';

const viewports = [[1920, 1080], [1080, 1920], [2560, 1080], [720, 1280], [480, 854]];
const disabled = { enabled: false, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] };
const boxZone = { enabled: true, pts: [[40, 30], [60, 30], [60, 60], [40, 60]] };

test('rectangle/face geometry detects containment, crossing edges, contact, and padding', () => {
  const cases = [
    [{ x: 45, y: 35, width: 5, height: 5 }, 0, true],
    [{ x: 0, y: 0, width: 100, height: 100 }, 0, true],
    [{ x: 0, y: 42, width: 100, height: 2 }, 0, true],
    [{ x: 35, y: 40, width: 5, height: 5 }, 0, true],
    [{ x: 30, y: 40, width: 5, height: 5 }, 0, false],
    [{ x: 30, y: 40, width: 5, height: 5 }, 5, true],
    [{ x: 61, y: 61, width: 5, height: 5 }, 0, false]
  ];
  for (const [rect, pad, expected] of cases) assert.equal(rectIntersectsZone(rect, boxZone, 100, 100, pad), expected);
  assert.equal(rectIntersectsZone({ x: 0, y: 0, width: 100, height: 100 }, disabled, 100, 100), false);
});

test('concave face uses its actual outline instead of only bounds or sampled corners', () => {
  const concave = { enabled: true, pts: [[20, 20], [80, 20], [80, 35], [35, 35], [35, 65], [80, 65], [80, 80], [20, 80]] };
  assert.equal(rectIntersectsZone({ x: 45, y: 45, width: 15, height: 10 }, concave, 100, 100), false);
  assert.equal(rectIntersectsZone({ x: 30, y: 30, width: 20, height: 20 }, concave, 100, 100), true);
  assert.equal(rectIntersectsZone({ x: 0, y: 48, width: 100, height: 4 }, concave, 100, 100), true);
  assert.equal(rectIntersectsZone({ x: 36, y: 36, width: 15, height: 15 }, concave, 100, 100, 1), true);
});

for (const [width, height] of viewports) {
  test(`${width}x${height}: the real-counter 500-person crowd reaches the top and far perspective`, () => {
    const unit = Math.min(width, height) / 1080;
    const result = layoutCrowd({ width, height, zone: defaultZone(width / height), count: 500, counterTop: height - 210 * unit });
    assert.equal(result.slots.length, 500);
    assert.equal(result.outside, 0);
    assert.ok(Math.min(...result.slots.map(slot => slot.y)) <= 30 * unit, '500 people must occupy the top rows');
    const farScale = Math.min(...result.slots.map(slot => slot.scale)), squeeze = result.compressed ? .85 : 1;
    assert.ok(farScale >= .5 * squeeze - 1e-7 && farScale <= .5 * squeeze + .025, '500 people must reach the far half-size perspective');
  });
  test(`${width}x${height}: all queued customers remain visible or counted outside, and never cover the face`, () => {
    const unit = Math.min(width, height) / 1080, counterTop = height - 172 * unit;
    const zone = defaultZone(width / height);
    for (const count of [50, 200, 500, 10000]) {
      const result = layoutCrowd({ width, height, zone, count, counterTop });
      assert.equal(result.slots.length + result.outside, count);
      assert.equal(result.slots.length, Math.min(count, result.capacity));
      assert.ok(result.slots.length > 0);
      if (count === 500) assert.equal(result.slots.length, 500, 'five target viewports should fit the 500-person acceptance crowd');
      for (const slot of result.slots) {
        assert.ok(slot.x >= -1e-7 && slot.y >= -1e-7);
        assert.ok(slot.x + slot.width <= width + 1e-7 && slot.y + slot.height <= height + 1e-7);
        assert.ok(slot.y + slot.height <= counterTop + 12 * unit + 1e-7);
        assert.ok(Math.abs(slot.width - 110 * unit * slot.scale) < 1e-7);
        assert.ok(Math.abs(slot.height - 130 * unit * slot.scale) < 1e-7);
        const reserve = 20 * unit * slot.scale;
        assert.equal(rectIntersectsZone({ ...slot, y: slot.y - reserve, height: slot.height + reserve }, zone, width, height, 4 * unit), false);
      }
    }
  });
}

test('rows fill viewport width, overlap, stagger, and get smaller toward the fully visible top', () => {
  const result = layoutCrowd({ width: 2560, height: 1080, zone: disabled, count: 10000, counterTop: 908, compress: false });
  assert.equal(result.compressed, false);
  assert.equal(result.slots[0].scale, 1);
  const rows = Map.groupBy(result.slots, slot => slot.row);
  assert.ok(rows.size >= 10);
  let previousScale = Infinity, previousY = Infinity, previousRow = -1;
  for (const [row, slots] of rows) {
    assert.ok(row > previousRow && slots[0].scale < previousScale && slots[0].y < previousY);
    assert.equal(slots[0].front, row === 0);
    assert.ok(slots.every(slot => slot.front === (row === 0)));
    assert.equal(Math.min(...slots.map(slot => slot.x)), 0);
    assert.ok(Math.abs(Math.max(...slots.map(slot => slot.x + slot.width)) - 2560) < 1e-7);
    const interior = [...slots].sort((a,b)=>a.x-b.x).slice(2, -2);
    for (let i = 1; i < interior.length; i++) assert.ok(Math.abs(interior[i].x - interior[i - 1].x - slots[0].width * .7) < 1e-7);
    previousScale = slots[0].scale; previousY = slots[0].y; previousRow = row;
  }
  assert.ok(result.slots.at(-1).scale >= .5 && result.slots.at(-1).scale <= .53);
  assert.ok(result.slots.at(-1).y - 20 * result.slots.at(-1).scale >= 6 - 1e-7);
  const first = rows.get(0), second = rows.get(1);
  const firstByX=[...first].sort((a,b)=>a.x-b.x),secondByX=[...second].sort((a,b)=>a.x-b.x);
  assert.notEqual(firstByX[2].x / firstByX[2].width, secondByX[2].x / secondByX[2].width);
  const rowGap = first[0].y - second[0].y;
  assert.ok(rowGap > 0 && rowGap < first[0].height, 'adjacent rows must overlap while retaining visible depth');
});

test('a partial row selects center positions while final order follows physical left-to-right positions',()=>{
  const args={width:1920,height:1080,zone:disabled,counterTop:870,compress:false};
  const all=layoutCrowd({...args,count:10000});
  for(const slots of Map.groupBy(all.slots,slot=>slot.row).values()){
    for(let index=1;index<slots.length;index++)assert.ok(slots[index].x>slots[index-1].x,'final queue positions must follow physical left-to-right order');
  }
  const frontCount=all.slots.filter(slot=>slot.row===0).length;
  const short=layoutCrowd({...args,count:frontCount+5}).slots.filter(slot=>slot.row===1);
  assert.equal(short.length,5);
  const expected=[...all.slots.filter(slot=>slot.row===1)].sort((a,b)=>Math.abs(a.x+a.width/2-960)-Math.abs(b.x+b.width/2-960)||a.x-b.x).slice(0,5).sort((a,b)=>a.x-b.x);
  assert.deepEqual(short.map(slot=>slot.x),expected.map(slot=>slot.x),'select the five nearest center positions before sorting their physical order');
  const center=short.reduce((sum,slot)=>sum+slot.x+slot.width/2,0)/short.length;
  assert.ok(Math.abs(center-960)<=short[0].width*.7/2,'a partial row must not collect at one edge');
  assert.ok(short.some(slot=>slot.x+slot.width/2<960)&&short.some(slot=>slot.x+slot.width/2>960));
});

test('serving a non-head order moves same-row survivors only into a neighboring vacancy',()=>{
  const args={width:1920,height:1080,zone:disabled,counterTop:870,compress:false};
  const before=layoutCrowd({...args,count:100}).slots;
  const frontCount=before.filter(slot=>slot.row===0).length,served=Math.floor(frontCount/2);
  const survivors=Array.from({length:100},(_,index)=>index).filter(index=>index!==served);
  const after=layoutCrowd({...args,count:99}).slots;
  let checked=0;
  for(let index=0;index<survivors.length;index++){
    const previous=before[survivors[index]],next=after[index];
    if(previous.row!==next.row)continue;
    checked++;
    assert.ok(Math.abs(next.x-previous.x)<=previous.width*.70+1e-7,'same-row refill must move at most one horizontal interval, not cross the whole row');
  }
  assert.ok(checked>=50);
});

test('normal capacity is exhausted before exactly 85 percent squeeze is selected', () => {
  const args = { width: 1920, height: 1080, zone: boxZone, counterTop: 908 };
  const normal = layoutCrowd({ ...args, count: 0, compress: false });
  const atCapacity = layoutCrowd({ ...args, count: normal.capacity });
  assert.equal(atCapacity.compressed, false);
  assert.equal(atCapacity.outside, 0);
  const squeezed = layoutCrowd({ ...args, count: normal.capacity + 1 });
  assert.equal(squeezed.compressed, true);
  assert.equal(squeezed.slots[0].scale, .85);
  assert.ok(squeezed.capacity > normal.capacity);
  assert.equal(squeezed.outside, 0);
  const unsqueezed = layoutCrowd({ ...args, count: normal.capacity + 1, compress: false });
  assert.equal(unsqueezed.compressed, false);
  assert.equal(unsqueezed.outside, 1);
});

test('concave zones and viewport-edge face regions reserve the entire sprite plus jump room', () => {
  const zones = [
    { enabled: true, pts: [[20, 20], [80, 20], [80, 35], [35, 35], [35, 65], [80, 65], [80, 80], [20, 80]] },
    { enabled: true, pts: [[0, 0], [35, 0], [35, 100], [0, 100]] },
    { enabled: true, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] }
  ];
  for (const zone of zones) {
    const result = layoutCrowd({ width: 1920, height: 1080, zone, count: 10000, counterTop: 908 });
    assert.equal(result.slots.length + result.outside, 10000);
    for (const slot of result.slots) {
      const reserve = 20 * slot.scale;
      assert.equal(rectIntersectsZone({ ...slot, y: slot.y - reserve, height: slot.height + reserve }, zone, 1920, 1080, 4), false);
    }
  }
  assert.equal(layoutCrowd({ width: 1920, height: 1080, zone: zones[2], count: 10000 }).outside, 10000);
});

test('layout is deterministic, does not mutate the input, and preserves empty and invalid-view queues', () => {
  const zone = Object.freeze({ enabled: true, pts: Object.freeze(boxZone.pts.map(point => Object.freeze([...point]))) });
  const input = Object.freeze({ width: 720, height: 1280, zone, count: 10000, counterTop: 1200 });
  assert.deepEqual(layoutCrowd(input), layoutCrowd(input));
  const empty = layoutCrowd({ width: 720, height: 1280, zone, count: 0 });
  assert.equal(empty.slots.length, 0);
  assert.equal(empty.outside, 0);
  assert.equal(empty.compressed, false);
  assert.ok(empty.capacity > 0);
  const invalid = layoutCrowd({ width: 0, height: 0, zone, count: 10000 });
  assert.deepEqual(invalid, { slots: [], outside: 10000, compressed: false, capacity: 0 });
});
