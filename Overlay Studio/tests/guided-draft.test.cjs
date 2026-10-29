'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../src/guided-draft.mjs');

test('clean cached prompts do not mask an interview completed while the editor was closed', async () => {
  const { restorePromptDraft } = await load();
  assert.equal(restorePromptDraft({ prompt: '' }, 'new server prompt').edit.value, 'new server prompt');
  assert.equal(restorePromptDraft({}, 'new server prompt').edit.value, 'new server prompt');
});
test('clean drafts store text and mode without persisting an authoritative prompt', async () => {
  const { serializeGuidedDraft } = await load();
  assert.deepEqual(serializeGuidedDraft({ text: 'unsent answer', mode: 'deep', edit: { value: 'AI prompt', basePrompt: 'AI prompt' } }), { text: 'unsent answer', mode: 'deep' });
});
test('a real unsaved edit survives remount and a newer server prompt', async () => {
  const { serializeGuidedDraft, restorePromptDraft } = await load();
  const cached = serializeGuidedDraft({ text: 'unsent answer', mode: 'quick', edit: { value: 'my exact edit', basePrompt: 'old AI prompt' } });
  assert.equal(cached.promptDraft?.basePrompt, 'old AI prompt');
  assert.equal(restorePromptDraft(cached, 'new AI prompt').edit.value, 'my exact edit');
});
test('intentionally clearing a nonempty prompt is preserved as an unsaved user edit', async () => {
  const { serializeGuidedDraft, restorePromptDraft } = await load();
  const cached = serializeGuidedDraft({ text: '', mode: 'quick', edit: { value: '', basePrompt: 'old AI prompt' } });
  assert.equal(restorePromptDraft(cached, 'new AI prompt').edit.value, '');
});
test('live server updates advance clean prompt state without replacing unsaved edits', async () => {
  const { rebasePromptEdit } = await load();
  assert.deepEqual(rebasePromptEdit({ value: 'old AI', basePrompt: 'old AI' }, 'new AI'), { value: 'new AI', basePrompt: 'new AI' });
  assert.deepEqual(rebasePromptEdit({ value: 'manual edit', basePrompt: 'old AI' }, 'new AI'), { value: 'manual edit', basePrompt: 'new AI' });
});
test('saving a manual edit removes its pending prompt from subsequent cache snapshots', async () => {
  const { serializeGuidedDraft, rebasePromptEdit } = await load();
  const edit = rebasePromptEdit({ value: 'manual edit', basePrompt: 'old AI' }, 'manual edit');
  assert.equal(serializeGuidedDraft({ text: '', mode: 'quick', edit }).promptDraft, undefined);
});
test('ambiguous legacy cache stays recoverable but cannot silently override the server', async () => {
  const { restorePromptDraft, serializeGuidedDraft } = await load();
  const restored = restorePromptDraft({ prompt: 'possibly unsaved legacy text' }, 'current AI prompt');
  assert.equal(restored.edit.value, 'current AI prompt');
  assert.equal(restored.recoveredPrompt, 'possibly unsaved legacy text');
  const cached = serializeGuidedDraft({ text: '', mode: 'quick', ...restored });
  assert.equal(restorePromptDraft(cached, 'next AI prompt').recoveredPrompt, 'possibly unsaved legacy text');
});
