'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../src/job-state.mjs');
const at = milliseconds => new Date(Date.UTC(2026, 9, 19, 10, 0, 0, milliseconds)).toISOString();
const log = (milliseconds, text) => ({ time: at(milliseconds), text, kind: 'info' });
const job = (id, milliseconds, state = 'running', logs = []) => ({ id, projectId: 'project', kind: 'interview', startedAt: at(milliseconds), state, logs });

test('a delayed interview.send response cannot overwrite a terminal SSE event', async () => {
  const { mergeJob } = await load();
  for (const state of ['completed', 'failed', 'cancelled']) {
    const started = job('rapid-interview', 1, 'running', [log(1, 'Started')]);
    const ended = { ...started, state, endedAt: at(2), logs: [...started.logs, log(2, 'Finished')] };
    const afterEvent = mergeJob(null, ended);
    assert.strictEqual(mergeJob(afterEvent, started), ended, `${state} must never return to running`);
  }
});

test('late bootstrap snapshots cannot replace a newer job or erase it with null', async () => {
  const { mergeJob } = await load();
  const current = job('new-interview', 50);
  assert.strictEqual(mergeJob(current, job('old-generation', 10, 'completed')), current);
  assert.strictEqual(mergeJob(current, job('old-generation', 10)), current);
  assert.strictEqual(mergeJob(current, null), current);
  assert.strictEqual(mergeJob(null, null), null);
});

test('a genuinely newer job is accepted even after the previous one completed', async () => {
  const { mergeJob } = await load();
  const previous = job('previous', 1, 'completed', [log(2, 'Done')]);
  const next = job('next', 3, 'running', [log(3, 'Started')]);
  assert.strictEqual(mergeJob(previous, next), next);
  assert.strictEqual(mergeJob(null, next), next);
});

test('out-of-order running snapshots do not rewind progress logs', async () => {
  const { mergeJob } = await load();
  const first = log(1, 'Started');
  const current = job('one', 1, 'running', [first, log(5, 'Working')]);
  const older = job('one', 1, 'running', [first]);
  assert.strictEqual(mergeJob(current, older), current);
  assert.deepEqual(mergeJob(older, current).logs, current.logs);
});

test('bounded log windows compare timestamps instead of just their length', async () => {
  const { mergeJob } = await load();
  const older = job('one', 1, 'running', [log(2, 'A'), log(3, 'B')]);
  const newer = job('one', 1, 'running', [log(3, 'B'), log(4, 'C')]);
  assert.strictEqual(mergeJob(newer, older), newer);
  assert.strictEqual(mergeJob(older, newer), newer);
});

test('logs emitted in the same millisecond cannot regress to a shorter snapshot', async () => {
  const { mergeJob } = await load();
  const older = job('one', 1, 'running', [log(2, 'A')]);
  const newer = job('one', 1, 'running', [...older.logs, log(2, 'B')]);
  assert.strictEqual(mergeJob(newer, older), newer);
});

test('terminal state advances without losing logs from a fuller running snapshot', async () => {
  const { mergeJob } = await load();
  const running = job('one', 1, 'running', [log(1, 'Started'), log(2, 'Working')]);
  const terminal = { ...job('one', 1, 'failed'), endedAt: at(3), error: 'Try again' };
  const merged = mergeJob(running, terminal);
  assert.equal(merged.state, 'failed');
  assert.equal(merged.error, 'Try again');
  assert.deepEqual(merged.logs, running.logs);
  assert.equal(running.state, 'running', 'merging must not mutate existing snapshots');
});
