import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const pickCode = source.slice(source.indexOf('function clickTarget('), source.indexOf('function inBinZone('));
const endCode = source.slice(source.indexOf('function endPtr('), source.indexOf("addEventListener('pointermove', e => { const c"));

test('visible buried, taped and blind items all remain draggable', () => {
  for (const item of [{ blind: 0, tape: 0 }, { blind: 0, tape: 3 }, { blind: 6, tape: 0 }]) {
    let actions = 0;
    const result = runInNewContext(pickCode + '\nclickTarget(1,2)', {
      pickAt: () => item, pickBinAt: () => null, pinned: () => true,
      hitBlind: () => actions++, tear: () => actions++, sfx: { blocked: () => actions++ },
    });
    assert.equal(result, item);
    assert.equal(actions, 0, 'pressing starts a grab; special click actions wait for pointerup');
  }
});
test('short click still unwraps/opens, dragging or cancellation does not', () => {
  for (const [dragged, type, blind, expected] of [[false,'pointerup',0,'tape'],[false,'pointerup',6,'blind'],[true,'pointerup',0,''],[true,'pointerup',6,''],[false,'pointercancel',6,'']]) {
    let action = '', released = 0;
    const context = { held: { b: { blind, tape: 3 }, dragged }, demo: { on: false }, ptr: { id: 1 },
      release: () => { released++; context.held = null; }, tear: () => action = 'tape', hitBlind: () => action = 'blind', event: { type, pointerId: 1 } };
    runInNewContext(endCode + '\nendPtr(event)', context);
    assert.equal(released, 1); assert.equal(action, expected); assert.equal(context.ptr.id, null);
  }
});
