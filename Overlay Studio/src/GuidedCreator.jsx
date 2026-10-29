import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Copy, FileText, ImagePlus, Layers, Lightbulb, Loader2, Paperclip, RefreshCw, Save, Sparkles, Square, UserRound, X } from 'lucide-react';
import { studio } from './bridge';
import { readReferenceFiles } from './reference-upload';
import { restorePromptDraft, serializeGuidedDraft, rebasePromptEdit } from './guided-draft.mjs';

const purposes = [['general', '综合参考'], ['style', '配色与风格'], ['layout', '界面布局'], ['character', '角色形象'], ['requirements', '功能需求']];
const draftKey = id => `overlay-studio:guided-draft:v1:${id || 'new'}`;
function readDraft(id) { try { return JSON.parse(localStorage.getItem(draftKey(id)) || '{}'); } catch { return {}; } }
export function storeGuidedDraft(id, value) { try { localStorage.setItem(draftKey(id), JSON.stringify(value)); } catch { /* A full browser store must not prevent editing. */ } }

function ReferenceCard({ item, projectId, locked, onChange }) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (item.kind !== 'image') return;
    let alive = true;
    studio.invoke('references.get', { projectId, referenceId: item.id }).then(detail => { if (alive) setSource(detail.dataUrl || ''); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [projectId, item.id, item.kind]);
  return <div className="reference-card">
    <div className="reference-thumb">{source ? <img src={source} alt={item.name} /> : item.kind === 'image' ? <ImagePlus size={22} /> : <FileText size={22} />}</div>
    <div className="reference-info"><strong title={item.name}>{item.name}</strong><span>{failed ? '缩略图读取失败' : `${item.kind === 'image' ? '图片' : '文本'} · ${Math.max(1, Math.round(item.size / 1024))} KB`}</span><select aria-label={`${item.name} 的参考用途`} value={item.usage || 'general'} disabled={locked} onChange={event => onChange('references.update', { referenceId: item.id, usage: event.target.value })}>{purposes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <button type="button" className="icon-button plain" disabled={locked} aria-label={`移除参考资料 ${item.name}`} title="移除参考资料" onClick={() => onChange('references.remove', { referenceId: item.id })}><X size={15} /></button>
  </div>;
}

export default function GuidedCreator({ project, locked: parentLocked, job, canGenerate, engineLabel, onAction, onEnsureDraft, onSend, onGenerate, onCancel, onSettings }) {
  const [persisted] = useState(() => readDraft(project?.id));
  const serverPrompt = project?.interview?.prompt || '';
  const [restoredPrompt] = useState(() => restorePromptDraft(persisted, serverPrompt));
  const [text, setText] = useState(() => persisted.text || '');
  const [promptEdit, setPromptEdit] = useState(restoredPrompt.edit);
  const [recoveredPrompt, setRecoveredPrompt] = useState(restoredPrompt.recoveredPrompt || '');
  const effectiveEdit = rebasePromptEdit(promptEdit, serverPrompt);
  const prompt = effectiveEdit.value;
  const [mode, setMode] = useState(project?.interview?.mode || persisted.mode || 'quick');
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const fileInput = useRef(null);
  const composer = useRef(null);
  const conversation = useRef(null);
  const failedDraftText = useRef('');
  const locked = parentLocked || localBusy;
  const interview = project?.interview || {};
  const references = project?.references || [];
  const messages = interview.messages || [];
  const interviewing = job?.kind === 'interview' && job.state === 'running';
  const failedInterview = job?.kind === 'interview' && ['failed', 'cancelled'].includes(job.state);
  const promptDirty = prompt !== (interview.prompt || '');
  const hasIdea = !!(text.trim() || project?.brief?.trim() || references.length || messages.length || prompt.trim());

  useEffect(() => {
    if (project) setMode(project.interview?.mode || 'quick');
  }, [project?.id, project?.interview?.mode]);
  useEffect(() => { setPromptEdit(previous => rebasePromptEdit(previous, serverPrompt)); }, [serverPrompt]);

  useEffect(() => { storeGuidedDraft(project?.id, serializeGuidedDraft({ text, mode, edit: effectiveEdit, recoveredPrompt })); }, [project?.id, text, prompt, mode, serverPrompt, recoveredPrompt]);
  useEffect(() => { if (persisted.text) { composer.current?.focus(); composer.current?.setSelectionRange(persisted.text.length, persisted.text.length); } }, []);
  useEffect(() => {
    if (job?.state !== 'running' || !text.trim()) return;
    const lastUser = [...messages].reverse().find(message => message.role === 'user')?.text || '';
    if (lastUser === text || (job.kind === 'generation' && lastUser === text.trim()) || lastUser.endsWith(`补充：${text}`)) setText('');
  }, [job?.id, job?.state, messages.length, interview.prompt]);
  useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, interviewing]);
  useEffect(() => {
    if (project || !text.trim() || locked || savingDraft || text === failedDraftText.current) return;
    const timer = setTimeout(() => {
      setSavingDraft(true);
      onEnsureDraft(text).catch(error => { failedDraftText.current = text; setLocalError(error.message); }).finally(() => setSavingDraft(false));
    }, 800);
    return () => clearTimeout(timer);
  }, [text, project, locked, savingDraft, onEnsureDraft]);

  const run = async fn => { setLocalError(''); setLocalBusy(true); try { return await fn(); } catch (error) { setLocalError(error.message || String(error)); } finally { setLocalBusy(false); } };
  const send = (action = 'answer', answer = text, retry = false) => run(async () => {
    const answerWithDraft = action === 'answer' && !retry && answer !== text && text.trim() ? `${answer}\n补充：${text}` : answer;
    await onSend({ text: answerWithDraft, action, retry, mode, prompt, promptDirty });
    if (!retry && action === 'answer') setText('');
  });
  const upload = fileList => run(async () => {
    const files = await readReferenceFiles(fileList);
    if (files.length) await onAction('references.add', { files }, text);
  });
  const changeMode = next => run(async () => { if (project) await onAction('interview.update', { mode: next }); setMode(next); });
  const savePrompt = () => run(() => onAction('interview.update', { prompt }, text));

  return <section className="panel guided-panel" aria-label="引导创作">
    <div className="guided-tools"><div className="segmented" aria-label="提问深度"><button type="button" aria-pressed={mode === 'quick'} className={mode === 'quick' ? 'selected' : ''} disabled={locked} onClick={() => changeMode('quick')}>快速</button><button type="button" aria-pressed={mode === 'deep'} className={mode === 'deep' ? 'selected' : ''} disabled={locked} onClick={() => changeMode('deep')}>深入</button></div><span>{mode === 'quick' ? '最多 3 轮，尽快开始试玩' : '逐步完善更多细节'}</span></div>
    <div className="guided-conversation" ref={conversation} role="log" aria-label="创作对话" aria-live="polite">
      {!messages.length && <div className="guided-welcome"><span className="guide-emblem"><Layers size={23} /></span><h2>从一个想法开始。</h2><p>说说你想做什么，或者上传一张参考图。<br />我会一次问一个问题，帮你整理成可制作的需求。</p>{project?.brief && <div className="existing-brief"><small>已保存的玩法描述</small><p>{project.brief}</p></div>}</div>}
      {messages.map(message => <article key={message.id} className={`chat-message ${message.role}`}><span className="chat-avatar" aria-label={message.role === 'user' ? '你' : '创作助手'}>{message.role === 'user' ? <UserRound size={17} /> : <Layers size={17} />}</span><div className="chat-bubble"><span className="chat-author">{message.role === 'user' ? '你' : '创作助手'}</span><p>{message.text}</p></div></article>)}
      {interview.question && <div className="guided-question"><small>接下来，只确认一件事</small><p>{interview.question.text}</p><div className="question-options">{(interview.question.options || []).slice(0, 3).map((option, index) => <button className="button secondary" key={`${index}-${option}`} disabled={locked || !canGenerate} onClick={() => send('answer', option)}>{option}</button>)}</div><div className="question-shortcuts"><button className="text-button" disabled={locked || !canGenerate} onClick={() => send('skip', '')}>跳过这题</button><button className="text-button" disabled={locked || !canGenerate} onClick={() => send('decide', '')}><Sparkles size={13} />你帮我决定</button></div></div>}
      {interviewing && <div className="interview-thinking" role="status"><Loader2 className="spin" size={15} />正在理解你的想法，准备下一个问题…</div>}
      {failedInterview && <div className="interview-retry"><p>{job.state === 'cancelled' ? '对话已停止，你的回答已保留。' : '这次对话未完成，你的回答已保留。'}</p><button className="text-button" disabled={locked || !canGenerate} onClick={() => send('answer', '', true)}><RefreshCw size={13} />重试这次回答</button></div>}
      <div className="guided-tip"><Lightbulb size={14} /><span>{interview.ready ? '需求已整理好，可以生成预览，也可以继续补充。' : '一次只问一个问题，随时可以生成预览。'}</span></div>
    </div>
    <details className="guided-requirements"><summary><FileText size={15} />需求与提示词 <span>{promptDirty ? '待保存' : interview.prompt ? '已整理' : '随对话整理'}</span></summary><div className="requirements-body">
      {interview.summary && <div><h3>AI 整理的需求</h3><p>{interview.summary}</p></div>}
      {!!interview.visualNotes?.length && <div><h3>AI 参考资料观察</h3><ul>{interview.visualNotes.map((note, i) => <li key={i}>{note}</li>)}</ul></div>}
      {!!interview.suggestions?.length && <div><h3>AI 建议 · 尚未确认</h3><ul>{interview.suggestions.map((suggestion, i) => <li key={i}>{suggestion}</li>)}</ul></div>}
      {recoveredPrompt && <details className="legacy-prompt-recovery"><summary>查看旧版本保存的提示词副本</summary><p>当前使用最新已保存的提示词。旧副本保留在这里，可检查是否包含尚未提交的修改。</p><p>{recoveredPrompt}</p><div className="prompt-actions"><button type="button" className="text-button" disabled={locked} onClick={() => { setPromptEdit({ value: recoveredPrompt, basePrompt: serverPrompt }); setRecoveredPrompt(''); }}>使用旧副本</button><button type="button" className="text-button" disabled={locked} onClick={() => setRecoveredPrompt('')}>丢弃旧副本</button></div></details>}
      <label className="field"><span>可复用的制作提示词</span><textarea value={prompt} maxLength={30000} disabled={locked} onChange={event => setPromptEdit({ value: event.target.value, basePrompt: serverPrompt })} placeholder="对话后会整理在这里。你也可以直接填写或修改，发送与生成时会采用你的修改。" /></label><div className="prompt-actions"><button type="button" className="text-button" disabled={locked || !promptDirty} onClick={savePrompt}><Save size={13} />保存修改</button><button type="button" className="text-button" disabled={!prompt.trim()} onClick={() => run(async () => { await studio.invoke('system.copyText', { text: prompt }); setCopied(true); setTimeout(() => setCopied(false), 2000); })}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制提示词'}</button></div>
    </div></details>
    <div className="guided-input-area"><div className="reference-heading"><h3>参考资料</h3><span>图片或现成提示词</span></div>
      <input ref={fileInput} className="sr-only" type="file" multiple accept=".png,.jpg,.jpeg,.txt,.md" aria-label="选择参考图片或文本" disabled={locked} onChange={event => { upload(event.target.files); event.target.value = ''; }} />
      {!!references.length && <div className="reference-list">{references.map(item => <ReferenceCard key={item.id} item={item} projectId={project.id} locked={locked} onChange={(action, payload) => run(() => onAction(action, payload))} />)}</div>}
      <button type="button" className={`reference-drop ${dragging ? 'dragging' : ''}`} disabled={locked} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!locked) upload(event.dataTransfer.files); }}><ImagePlus size={23} /><span><strong>{references.length ? '继续添加参考资料' : '拖入照片、界面截图或 TXT / MD'}</strong><small>最多 4 张图片（每张 4 MB）+ 4 个文本（每个 64 KB）</small></span></button>
      {!!references.length && <p className="reference-privacy">随发送或生成请求提交给当前模型；图片需要支持看图的模型</p>}
      <form className="guided-composer" onSubmit={event => { event.preventDefault(); send(); }}><label className="sr-only" htmlFor="guided-message">你的想法或回答</label><textarea ref={composer} id="guided-message" value={text} maxLength={6000} disabled={locked} onChange={event => setText(event.target.value)} placeholder={messages.length ? '选一个答案，或者用自己的话补充…' : '我想做一个…  不用写提示词，一句话就好。'} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !locked && canGenerate && hasIdea) { event.preventDefault(); send(); } }} /><div className="composer-actions"><button type="button" className="text-button" disabled={locked} onClick={() => fileInput.current?.click()}><Paperclip size={15} />添加参考</button><button className="button primary" type="submit" disabled={locked || !canGenerate || (!text.trim() && !references.length && !project?.brief)}><ArrowUp size={16} />发送</button></div></form>
      {localError && <p className="inline-error" role="alert">{localError}</p>}
      <button type="button" className="button primary generate-button guided-generate" disabled={locked || !canGenerate || !hasIdea} onClick={() => run(async () => { await onGenerate({ text, mode, prompt, promptDirty }); setText(''); })}><Sparkles size={19} />{project?.hasHtml ? '更新预览' : '生成预览'}</button>
      {job?.state === 'running' && <button type="button" className="text-button danger guided-cancel" onClick={onCancel}><Square size={12} />{interviewing ? '停止本次对话' : '取消制作'}</button>}
      {!canGenerate ? <button type="button" className="setup-hint" onClick={onSettings}>先在设置中准备好 {engineLabel}</button> : <p className="guided-save-note">{savingDraft ? '正在保存草稿…' : project ? '草稿保存在本机 · 修改后可继续生成' : '开始描述后会自动保存草稿'}</p>}
    </div>
  </section>;
}
