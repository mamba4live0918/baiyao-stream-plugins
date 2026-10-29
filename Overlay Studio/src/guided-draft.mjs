export function restorePromptDraft(cached, serverPrompt) {
  const saved = cached?.promptDraft;
  const valid = saved && typeof saved.value === 'string' && typeof saved.basePrompt === 'string';
  const edit = valid ? rebasePromptEdit(saved, serverPrompt) : { value: serverPrompt, basePrompt: serverPrompt };
  // Older caches did not distinguish user edits from AI text. Keep a recoverable
  // copy instead of silently treating that ambiguous text as an explicit edit.
  const legacy = typeof cached?.prompt === 'string' && cached.prompt && cached.prompt !== serverPrompt ? cached.prompt : undefined;
  const recoveredPrompt = typeof cached?.recoveredPrompt === 'string' ? cached.recoveredPrompt : legacy;
  return { edit, ...(recoveredPrompt ? { recoveredPrompt } : {}) };
}
export function serializeGuidedDraft({ text, mode, edit, recoveredPrompt }) {
  return { text, mode, ...(edit.value !== edit.basePrompt ? { promptDraft: { value: edit.value, basePrompt: edit.basePrompt } } : {}), ...(recoveredPrompt ? { recoveredPrompt } : {}) };
}
export function rebasePromptEdit(edit, serverPrompt) {
  return { value: edit.value === edit.basePrompt ? serverPrompt : edit.value, basePrompt: serverPrompt };
}
