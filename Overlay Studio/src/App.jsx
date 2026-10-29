import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, CircleDot, Clock3, Code2, Download, FilePlus2, FileText, Folder, FolderOpen, History, Info, Layers, Link2, Loader2, Maximize, Monitor, MoreHorizontal, Play, RefreshCw, Save, Search, Settings, ShieldCheck, Sparkles, Square, Upload, X, AlertCircle, Coins } from 'lucide-react';
import { studio } from './bridge';
import { sandboxDocument } from './preview';
import ProviderSettings from './ProviderSettings';
import GuidedCreator, { storeGuidedDraft } from './GuidedCreator';
import { mergeJob } from './job-state.mjs';
import LiveEditor from './LiveEditor';
import { instrumentPreviewDocument, readPreviewMessage, reconcileLiveDraft } from './live-preview.mjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const emptyForm = { name: '', brief: '', width: 1920, height: 1080, style: '清新简洁' };
const navItems = [{ id: 'editor', text: '工作台', icon: Layers }, { id: 'projects', text: '我的项目', icon: Folder }, { id: 'rules', text: '制作规范', icon: BookOpen }, { id: 'settings', text: '设置', icon: Settings }];
const jobNames = { running: '正在制作', completed: '制作完成', cancelled: '已取消制作', failed: '制作未完成' };
const presets = [{ name: '接金币', brief: '做一个接金币小游戏。玩家用鼠标或方向键控制篮子，接住掉落的金币计分。提供可手动测试的加速掉落和冻结玩家按钮，以及礼物事件接入函数。界面透明，动效轻快，适合直播叠加。', icon: Coins, color: 'gold', caption: '填写玩法' }, { name: '倒计时互动', brief: '做一个直播互动倒计时插件。可设置初始时长，开始、暂停和重置；点击测试按钮模拟礼物增加或减少倒计时。时间结束时显示庆祝动画，使用透明背景，不遮挡主播。', icon: Clock3, color: 'rose', caption: '填写玩法' }];

function prettyDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
function StatusDot({ status }) { const good = status?.ready; return <><span className={`status-dot ${good ? 'good' : ''}`} />{!status ? '正在检查制作引擎' : status.engine === 'api' ? `${status.providerName || '模型 API'} ${good ? '已配置' : '待配置'}` : !status.available ? '未找到 Codex' : !status.loggedIn ? 'Codex 尚未登录' : 'Codex 已登录'}</>; }
function FixedOption({ title, children }) { return <div className="fixed-option" title={children}><span className="fixed-check"><Check size={13} /></span><strong>{title}</strong></div>; }
function SkillDocument({content}) { return <div className="markdown-document"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href})=><span className="document-link" title={href}>{children}</span>}}>{content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'')}</ReactMarkdown></div>; }
function EmptyPreviewArt() { return <svg className="empty-preview-art" viewBox="0 0 120 112" fill="none" aria-hidden="true"><rect x="16" y="17" width="76" height="64" rx="5" stroke="currentColor" opacity=".32"/><rect x="25" y="27" width="76" height="64" rx="5" stroke="currentColor" opacity=".6"/><rect x="34" y="37" width="76" height="64" rx="5" stroke="currentColor"/><path d="M35 51H109" stroke="currentColor"/><circle cx="42" cy="44" r="1.4" fill="currentColor"/><circle cx="48" cy="44" r="1.4" fill="currentColor"/><circle cx="54" cy="44" r="1.4" fill="currentColor"/><path d="M88 76L91 105L98 98L105 110L111 106L104 94L114 92L88 76Z" fill="#121515" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>; }

function DiscardDialog({ resolve }) {
  const ref = useRef(null);
  const cancel = useRef(null);
  useEffect(() => { ref.current?.showModal(); cancel.current?.focus(); }, []);
  return <dialog ref={ref} className="discard-dialog" aria-labelledby="discard-title" onCancel={event => { event.preventDefault(); resolve(false); }}><h2 id="discard-title">保留这次修改吗？</h2><p>当前作品描述尚未保存。返回后点击「保存草稿」，即可保留你的更改。</p><div><button className="button secondary" onClick={() => resolve(true)}>放弃更改并继续</button><button ref={cancel} className="button primary" onClick={() => resolve(false)}>返回继续编辑</button></div></dialog>;
}

function Preview({ project, background, setBackground, reload, setReload, width, height, overrideHtml, previewStageRef, onDiagnostics }) {
  const ownFrame = useRef(null);
  const frame = previewStageRef || ownFrame;
  const iframe = useRef(null);
  const [size, setSize] = useState({ width: 600, height: 360 });
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const sourceHtml = overrideHtml ?? project?.html ?? '';
  const channel = useMemo(() => crypto.randomUUID(), [sourceHtml, reload, project?.id]);
  const html = useMemo(() => sourceHtml ? sandboxDocument(instrumentPreviewDocument(sourceHtml, channel)) : '', [sourceHtml, channel]);
  useEffect(() => {
    onDiagnostics?.({ channel, html: sourceHtml, findings: [] }, true);
    const receive = event => { const findings = readPreviewMessage(event, iframe.current?.contentWindow, channel); if (findings?.length) onDiagnostics?.({ channel, html: sourceHtml, findings }); };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [channel, sourceHtml, onDiagnostics]);
  const scale = Math.min(size.width / width, size.height / height);
  return <section className="panel preview-panel" aria-label="作品预览">
    <div className="panel-heading"><h2>实时预览</h2><div className="preview-actions"><div className="segmented" aria-label="预览背景">{[['transparent', '透明'], ['light', '浅色'], ['dark', '深色']].map(([id, text]) => <button type="button" key={id} aria-pressed={background === id} className={background === id ? 'selected' : ''} onClick={() => setBackground(id)}>{text}</button>)}</div><button className="text-button preview-play" type="button" disabled={!html} title="将键盘焦点交给游戏；点击左侧可返回编辑" onClick={() => iframe.current?.focus()}><Play size={14} />进入试玩</button><button className="icon-button" type="button" disabled={!html} title="重新开始试玩（重载页面）" aria-label="重新开始试玩" onClick={() => setReload(x => x + 1)}><RefreshCw size={18} /></button></div></div>
    <div className={`preview-stage ${background}`} ref={frame}>
      {html ? <iframe ref={iframe} tabIndex={0} key={`${project.id}-${channel}`} title={`${project.name}的互动预览`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }} /> : <div className="preview-empty"><EmptyPreviewArt /><h3>为你的直播，创造一点不同。</h3><p>生成后，在这里试玩你的作品</p></div>}
    </div>
    <div className="preview-footer"><span>{width} × {height}</span><span><Maximize size={15} /> 适应窗口</span></div>
    {html && <p className="preview-note"><ShieldCheck size={13} />可直接点击、拖动和使用键盘；先点画面或“进入试玩”。隔离预览会阻止外部资源。</p>}
    {sourceHtml.includes('F2') && <p className="preview-note">试玩提示：点击预览画面，再按 F2 打开测试面板。</p>}
  </section>;
}

function Progress({ job, running, cancel, busy }) {
  const interview = job?.kind === 'interview';
  const review = job?.kind === 'review';
  const names = review ? { running: '正在审查', completed: '审查完成', cancelled: '审查已停止', failed: '审查未完成' } : interview ? { running: '正在理解 / 提问', completed: '对话已更新', cancelled: '对话已停止', failed: '对话未完成' } : jobNames;
  return <section className="panel progress-panel"><div className="panel-heading"><h2>{review ? '审查进度' : interview ? '对话进度' : '制作进度'}</h2>{running && <button className="text-button danger" onClick={cancel} disabled={busy}><Square size={12} />{review ? '停止审查' : interview ? '停止对话' : '取消制作'}</button>}{job && <span className={`job-state ${job.state}`}>{names[job.state]}</span>}</div>
    {!job ? <div className="progress-empty"><span className="idle-icon"><MoreHorizontal size={25} /></span><div><div className="idle-heading"><strong>等待开始</strong><span aria-hidden="true" /></div><p>开始对话或生成预览后，在这里查看进度</p></div></div> : <><div className="progress-status">{running ? <Loader2 className="spin" size={18} /> : job.state === 'completed' ? <CheckCircle2 size={18} /> : <Info size={18} />}<span>{review ? (running ? '正在审查提交的源码与检查结果，不会改写作品。' : job.state === 'completed' ? '审查报告已保存，当前作品与未保存修改保持不变。' : job.state === 'cancelled' ? '审查已停止，原作品与之前报告仍然保留。' : (job.error || '审查未完成，请检查设置后重试。')) : interview ? (running ? '正在理解你的想法与参考资料，整理需求和下一个问题。' : job.state === 'completed' ? '对话与需求已保存。你可以继续回答，或生成可试玩的预览。' : job.state === 'cancelled' ? '对话已停止，你的回答和之前的作品已保留。' : (job.error || '未能完成对话，你的回答已保留，可以重试。')) : running ? (job.engineLabel ? job.engineLabel + ' 正在根据你的描述创建作品，通常需要几分钟。' : '正在根据你的描述创建作品，通常需要几分钟。') : job.state === 'completed' ? '作品已保存，可以在上方试玩并导出。' : job.state === 'cancelled' ? '制作已停止，之前的作品仍然保留。' : (job.error || '请查看记录，调整描述或检查设置后重试。')}</span></div><div className="job-log" role="log" aria-label={review ? '审查记录' : interview ? '对话记录' : '制作记录'}>{(job.logs || []).slice(-30).map((log, i) => <div className={`log-line ${log.kind}`} key={`${log.time}-${i}`}><time>{new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{log.text}</span></div>)}</div></>}
  </section>;
}

export default function App() {
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get('view') === 'settings' ? 'settings' : 'editor');
  const [editorMode, setEditorMode] = useState('guided');
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [job, setJob] = useState(null);
  const receiveJob = snapshot => setJob(current => mergeJob(current, snapshot));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [background, setBackground] = useState('transparent');
  const [reload, setReload] = useState(0);
  const [liveDrafts, setLiveDrafts] = useState({});
  const [livePreview, setLivePreview] = useState(null);
  const [runtimeChecks, setRuntimeChecks] = useState({ channel: '', html: '', findings: [] });
  const previewStageRef = useRef(null);
  const [rules, setRules] = useState(null);
  const [codexPath, setCodexPath] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmResolve = useRef(null);
  const projectRef = useRef(null);
  const creatingDraft = useRef(null);
  const guidedBusy = useRef(false);
  const mounted = useRef(false);
  const running = job?.state === 'running';
  const locked = busy || running || loading;
  const canGenerate = !!status?.ready;
  const engineLabel = status?.engine === 'api' ? (status.providerName || '模型 API') : 'Codex';
  const dirty = Object.keys(emptyForm).some(key => form[key] !== (project?.[key] ?? emptyForm[key]));
  const liveDraft = useMemo(() => reconcileLiveDraft(project, liveDrafts[project?.id]), [project, liveDrafts]);
  const visibleLiveHtml = livePreview && project && livePreview.projectId === project.id ? livePreview.html : project?.html || '';
  const changeLiveDraft = useCallback(next => setLiveDrafts(previous => ({ ...previous, [next.projectId]: next })), []);
  const applyLivePreview = useCallback((projectId, html, force = false) => { setLivePreview({ projectId, html }); if (force) setReload(value => value + 1); }, []);
  const receiveDiagnostics = useCallback((incoming, reset = false) => {
    setRuntimeChecks(previous => {
      if (reset) return incoming;
      if (previous.channel !== incoming.channel) return previous;
      const unique = new Map(previous.findings.map(item => [JSON.stringify(item), item]));
      for (const item of incoming.findings) unique.set(JSON.stringify(item), item);
      return { ...previous, findings: [...unique.values()].slice(0, 30) };
    });
  }, []);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const showProject = detail => { const previous = projectRef.current; if (detail.hasHtml && (!previous?.hasHtml || previous.id !== detail.id)) setEditorMode('live'); else if (previous?.id !== detail.id && !detail.hasHtml) setEditorMode('guided'); projectRef.current = detail; setProject(detail); setForm(Object.fromEntries(Object.keys(emptyForm).map(key => [key, detail[key] ?? emptyForm[key]]))); setRevision(''); setPage('editor'); };
  const refreshProjects = async () => { const data = await studio.invoke('projects.list'); if (mounted.current) setProjects(data); };
  const perform = async (fn) => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (err) { setError(err.message || String(err)); } finally { if (mounted.current) setBusy(false); } };
  const refreshStatus = async () => { const next = await studio.invoke('status'); if (mounted.current) setStatus(next); };
  const settingsSaved = async next => { if (mounted.current) setSettings(next); await refreshStatus(); };

  useEffect(() => {
    mounted.current = true;
    const off = studio.subscribe(event => {
      if (!mounted.current) return;
      if (event.type === 'projects') refreshProjects().catch(err => setError(err.message));
      if (event.type === 'job') {
        receiveJob(event.job);
        if (event.job.state !== 'running') {
          refreshProjects().catch(err => setError(err.message));
          if (projectRef.current?.id === event.job.projectId) studio.invoke('projects.get', { id: event.job.projectId }).then(detail => { if (mounted.current && projectRef.current?.id === detail.id) showProject(detail); }).catch(err => setError(err.message));
        }
      }
    });
    studio.invoke('bootstrap').then(data => { if (!mounted.current) return; setProjects(data.projects); setStatus(data.status); setSettings(data.settings); receiveJob(data.job); setCodexPath(data.settings?.codexPath || ''); }).catch(err => { if (mounted.current) setError(err.message); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; off?.(); };
  }, []);

  useEffect(() => { if (page === 'rules' && !rules) studio.invoke('rules.read').then(setRules).catch(err => setError(err.message)); }, [page, rules]);
  useEffect(() => { if (!loading) { const id=requestAnimationFrame(()=>studio.ready?.()); return ()=>cancelAnimationFrame(id); } }, [loading]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!project?.id) return;
    setLiveDrafts(previous => previous[project.id] ? { ...previous, [project.id]: reconcileLiveDraft(project, previous[project.id]) } : previous);
  }, [project?.id, project?.html, project?.revision]);

  const confirmReplace = async () => { if (!dirty) return true; return new Promise(resolve => { confirmResolve.current = resolve; setConfirmOpen(true); }); };
  const resolveConfirmation = value => { setConfirmOpen(false); confirmResolve.current?.(value); confirmResolve.current = null; };
  const newProject = async () => { if (!await confirmReplace()) return false; projectRef.current = null; setProject(null); setForm({ ...emptyForm }); setPage('editor'); setRevision(''); setError(''); setNotice(''); return true; };
  const save = async () => {
    if (!form.name.trim()) throw new Error('请先给作品起一个名字。');
    const data = await studio.invoke(project ? 'projects.save' : 'projects.create', { ...(project ? { id: project.id } : {}), ...form, name: form.name.trim() });
    showProject(data); await refreshProjects(); return data;
  };
  const guidedRun = async fn => {
    if (guidedBusy.current || running) throw new Error('请等待当前操作完成，或先停止任务。');
    guidedBusy.current = true; setBusy(true); setError(''); setNotice('');
    try { return await fn(); } finally { guidedBusy.current = false; if (mounted.current) setBusy(false); }
  };
  const ensureGuidedDraft = async (idea = '') => {
    if (projectRef.current) return projectRef.current;
    if (creatingDraft.current) return creatingDraft.current;
    creatingDraft.current = (async () => {
      const shortName = idea.trim().split(/[。！？\n]/)[0].slice(0, 22) || '参考资料创作';
      let detail = await studio.invoke('projects.create', { ...emptyForm, name: shortName, brief: idea.trim().slice(0, 5000) });
      let draft = {}; try { draft = JSON.parse(localStorage.getItem('overlay-studio:guided-draft:v1:new') || '{}'); } catch { /* Restore a readable draft only. */ }
      if (draft.mode === 'deep') detail = await studio.invoke('interview.update', { projectId: detail.id, mode: 'deep' });
      storeGuidedDraft(detail.id, { ...draft, text: draft.text || idea }); storeGuidedDraft(null, {});
      showProject(detail); await refreshProjects(); return detail;
    })();
    try { return await creatingDraft.current; } finally { creatingDraft.current = null; }
  };
  const guidedAction = (action, payload, idea = '') => guidedRun(async () => {
    const detail = await ensureGuidedDraft(idea);
    const next = await studio.invoke(action, { projectId: detail.id, ...payload });
    showProject(next); await refreshProjects(); return next;
  });
  const saveGuidedOptions = async (detail, options) => {
    if (options.mode !== (detail.interview?.mode || 'quick') || options.promptDirty) {
      detail = await studio.invoke('interview.update', { projectId: detail.id, mode: options.mode, ...(options.promptDirty ? { prompt: options.prompt } : {}) });
      showProject(detail);
    }
    return detail;
  };
  const sendGuided = options => guidedRun(async () => {
    let detail = await ensureGuidedDraft(options.text);
    detail = await saveGuidedOptions(detail, options);
    const next = await studio.invoke('interview.send', { projectId: detail.id, text: options.text, action: options.action, retry: options.retry });
    receiveJob(next);
    // The service persists the explicit user turn before starting the model call.
    const updated = await studio.invoke('projects.get', { id: detail.id });
    if (projectRef.current?.id === detail.id) showProject(updated);
  });
  const generateGuided = options => guidedRun(async () => {
    let detail = await ensureGuidedDraft(options.text);
    detail = await saveGuidedOptions(detail, options);
    const next = await studio.invoke('jobs.start', { projectId: detail.id, instruction: options.text.trim() });
    receiveJob(next);
    const updated = await studio.invoke('projects.get', { id: detail.id });
    if (projectRef.current?.id === detail.id) showProject(updated);
  });
  const saveLive = draft => guidedRun(async () => {
    const updated = await studio.invoke('projects.commit', { id: draft.projectId, html: draft.html, expectedRevision: draft.baseRevision });
    showProject(updated); await refreshProjects(); setNotice('实时修改已保存为版本，可从历史记录恢复。');
  });
  const reviewLive = options => guidedRun(async () => {
    let screenshot;
    if (options.screenshot) {
      if (!studio.isDesktop) throw new Error('附预览截图需要桌面版；仍可进行源码审查。');
      if (visibleLiveHtml !== options.html) throw new Error('请先刷新最新预览，再附截图审查。');
      const bounds = previewStageRef.current?.getBoundingClientRect();
      if (!bounds) throw new Error('当前预览不可见，请回到实时编辑后重试。');
      const x = Math.max(0, Math.floor(bounds.left)), y = Math.max(0, Math.floor(bounds.top));
      const width = Math.floor(Math.min(bounds.right, window.innerWidth) - x), height = Math.floor(Math.min(bounds.bottom, window.innerHeight) - y);
      if (width <= 0 || height <= 0) throw new Error('请先滚动到预览画面，再附截图审查。');
      screenshot = (await studio.invoke('system.capturePreview', { x, y, width, height })).dataUrl;
      if (!screenshot) throw new Error('未能取得预览截图；请重试，或取消附截图后进行源码审查。');
    }
    receiveJob(await studio.invoke('review.start', { projectId: project.id, html: options.html, diagnostics: options.diagnostics, ...(screenshot ? { screenshot } : {}) }));
  });
  const requestLiveGeneration = instruction => guidedRun(async () => {
    receiveJob(await studio.invoke('jobs.start', { projectId: project.id, instruction }));
    const updated = await studio.invoke('projects.get', { id: project.id });
    if (projectRef.current?.id === updated.id) showProject(updated);
  });
  const requestParameters = () => requestLiveGeneration('为当前作品添加真正生效的可视化参数，并保留现有玩法。按工作台规范提供 <script id="overlay-studio-config" type="application/json">，JSON 为 {version:1,fields:[{key,label,type,value,min?,max?,step?}]}。type 仅 number/color/boolean/text；最多24项；key为字母开头的字母数字下划线且不超过40字符。运行时必须读取并实际使用这些参数。按本作品选择速度、大小、颜色、回合时长等有用参数，不添加虚假通用控件。');
  const generate = () => perform(async () => { if (!form.brief.trim()) throw new Error('请先描述你想制作的玩法。'); const data = await save(); const next = await studio.invoke('jobs.start', { projectId: data.id }); receiveJob(next); });
  const load = async id => { if (!await confirmReplace()) return; return perform(async () => showProject(await studio.invoke('projects.get', { id }))); };
  const importHtml = async () => { if (!await confirmReplace()) return; return perform(async () => { const data = await studio.invoke('files.import'); if (data) { showProject(data); await refreshProjects(); setNotice('HTML 已复制到本地项目库。'); } }); };
  const exportHtml = () => perform(async () => { const result = await studio.invoke('files.export', { id: project.id }); if (!result?.cancelled) setNotice(result?.path ? `已导出到 ${result.path}` : '已导出 HTML 文件。'); });
  const seed = async () => { if (!await confirmReplace()) return; return perform(async () => { showProject(await studio.invoke('projects.seed', { template: 'starter' })); await refreshProjects(); setNotice('已载入可试玩的落球演示。'); }); };
  const preset = async item => { if (!await newProject()) return; setEditorMode('direct'); setForm({ ...emptyForm, name: item.name, brief: item.brief }); setNotice('玩法描述已填写，点击制作即可生成你的版本。'); };
  const currentJob = job && (!project || job.projectId === project.id) ? job : null;
  const visibleProjects = projects.filter(item => `${item.name} ${item.brief}`.toLowerCase().includes(search.toLowerCase()));
  const title = page === 'editor' ? (editorMode === 'guided' ? '说个想法，我们一起把它做出来。' : editorMode === 'live' ? '边改边试玩，把细节调到喜欢。' : project ? '继续打磨你的作品' : '开始一个新作品') : page === 'projects' ? '你的灵感，都在这里。' : page === 'rules' ? '让每个作品，都适合直播。' : '准备好你的制作工作台。';
  const subtitle = page === 'editor' ? (editorMode === 'guided' ? '不用写提示词，回答几个问题就能开始。' : editorMode === 'live' ? '先调参数，再改源码；确认效果后保存版本。' : '描述玩法，让灵感成为直播里的互动。') : page === 'projects' ? '继续打磨已有作品，或导入一个 HTML，开始新的创作。' : page === 'rules' ? '制作时自动遵循的技能与规范，也可以随时在这里查阅。' : '选择本地 Codex 或自己的模型 API。项目编辑、预览和导出都在本地完成。';

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Layers size={30} strokeWidth={1.7} /></div><div className="brand-copy"><strong>Overlay Studio</strong><span>直播小游戏工作台</span></div></div><nav aria-label="主导航">{navItems.map(({ id, text, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon size={21} />{id === 'editor' && project ? '编辑作品' : text}</button>)}</nav><div className="sidebar-bottom"><button className="sidebar-status" onClick={() => setPage('settings')}><StatusDot status={status} /></button><span className="local-account"><Monitor size={16} />{status?.engine === 'api' ? '使用提供商 API' : '使用本机登录'}</span></div></aside>
    <main className="main-area">
      <header className="toolbar"><div className="breadcrumb"><button className="icon-button plain" aria-label="返回我的项目" onClick={() => setPage('projects')}><ArrowLeft size={17} /></button><button onClick={() => setPage('projects')}>创作空间</button><span>/</span><strong>{page === 'editor' ? (project?.name || '新作品') : navItems.find(item => item.id === page)?.text}</strong></div><div className="toolbar-actions"><button className="button secondary" onClick={importHtml} disabled={locked}><Upload size={17} />导入 HTML</button><button className="button primary" onClick={exportHtml} title={editorMode === 'live' && liveDraft.html !== project?.html ? '请先保存当前修改，再导出插件' : '导出已保存的 HTML 插件'} disabled={locked || !project?.hasHtml || (editorMode === 'live' && liveDraft.html !== project?.html)}><Download size={17} />导出插件</button></div></header>
      <div className="page-content"><div className="page-intro"><h1>{title}</h1><p>{subtitle}</p></div>
      {error && <div className="alert error" role="alert"><AlertCircle size={18} /><span>{error}</span><button className="icon-button plain" onClick={() => setError('')} aria-label="关闭错误"><X size={15} /></button></div>}
      {notice && <div className="alert success" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button className="icon-button plain" onClick={() => setNotice('')} aria-label="关闭提示"><X size={15} /></button></div>}
      {loading ? <div className="loading-state"><Loader2 className="spin" />正在打开工作台…</div> : page === 'editor' ? <div className={`editor-grid ${editorMode !== 'direct' ? 'guided-editor-grid' : ''}`}>
        <div className="brief-column"><div className="editor-mode-heading"><h2>{editorMode === 'guided' ? '创作对话' : editorMode === 'live' ? '实时编辑' : '创作简报'}</h2><div className="segmented" aria-label="创作方式"><button type="button" className={editorMode === 'guided' ? 'selected' : ''} aria-pressed={editorMode === 'guided'} disabled={busy} onClick={() => { if (dirty) perform(async () => { await save(); setEditorMode('guided'); }); else setEditorMode('guided'); }}>引导创作</button><button type="button" className={editorMode === 'live' ? 'selected' : ''} aria-pressed={editorMode === 'live'} disabled={busy} onClick={() => { if (dirty) perform(async () => { await save(); setEditorMode('live'); }); else setEditorMode('live'); }}>实时编辑</button><button type="button" className={editorMode === 'direct' ? 'selected' : ''} aria-pressed={editorMode === 'direct'} disabled={busy} onClick={() => setEditorMode('direct')}>直接编辑</button></div></div><div hidden={editorMode !== 'guided'}><GuidedCreator key={project?.id || 'new'} project={project} locked={locked} job={currentJob} canGenerate={canGenerate} engineLabel={engineLabel} onAction={guidedAction} onEnsureDraft={ensureGuidedDraft} onSend={sendGuided} onGenerate={generateGuided} onCancel={() => perform(async () => receiveJob(await studio.invoke('jobs.cancel')))} onSettings={() => setPage('settings')} /></div><div hidden={editorMode !== 'live'}><LiveEditor key={project?.id || 'new-live'} project={project} draft={liveDraft} active={editorMode === 'live'} locked={locked} canGenerate={canGenerate} engineLabel={engineLabel} previewHtml={visibleLiveHtml} diagnostics={runtimeChecks.html === liveDraft.html ? runtimeChecks.findings : []} job={currentJob} onChange={changeLiveDraft} onPreview={applyLivePreview} onSave={saveLive} onReview={reviewLive} onRequestParameters={requestParameters} onRequestFix={requestLiveGeneration} onGuided={() => setEditorMode('guided')} onCancel={() => perform(async () => receiveJob(await studio.invoke('jobs.cancel')))} /></div><div hidden={editorMode !== 'direct'}><section className="panel brief-panel"><div className="panel-heading"><h2>作品信息</h2>{project && <span className="subtle-tag">{project.hasHtml ? '已有作品' : '草稿'}</span>}</div>
          <form onSubmit={event => { event.preventDefault(); generate(); }}>
            <label className="field"><span>作品名称</span><input maxLength={80} value={form.name} onChange={event => update('name', event.target.value)} placeholder="给你的作品起个名字" disabled={locked} /></label>
            <label className="field brief-field"><span>玩法与互动</span><textarea value={form.brief} onChange={event => update('brief', event.target.value)} maxLength={5000} placeholder={"做一个接金币小游戏，观众可以加速掉落，也能冻结玩家。"} disabled={locked} /><span className="char-count">{form.brief.length} / 5000</span></label>
            <div className="field-row"><label className="field"><span>画布尺寸</span><select value={`${form.width}x${form.height}`} onChange={event => { const [width, height] = event.target.value.split('x').map(Number); setForm(prev => ({ ...prev, width, height })); }} disabled={locked}>{!['1920x1080','1080x1920','1280x720','1080x1080'].includes(`${form.width}x${form.height}`) && <option value={`${form.width}x${form.height}`}>{form.width} × {form.height}</option>}<option value="1920x1080">1920 × 1080</option><option value="1080x1920">1080 × 1920 · 竖屏</option><option value="1280x720">1280 × 720</option><option value="1080x1080">1080 × 1080 · 方形</option></select></label><label className="field"><span>视觉风格</span><select value={form.style} onChange={event => update('style', event.target.value)} disabled={locked}>{!['清新简洁','可爱治愈','像素复古','霓虹科技'].includes(form.style) && <option>{form.style}</option>}<option>清新简洁</option><option>可爱治愈</option><option>像素复古</option><option>霓虹科技</option></select></label></div>
            <div className="fixed-options"><FixedOption title="透明背景">直接叠加到直播画面</FixedOption><FixedOption title="离线单文件">资源包含在一个 HTML 文件中</FixedOption></div>
            <button className="button primary generate-button" type="submit" disabled={locked || !canGenerate || !form.name.trim() || !form.brief.trim()}>{running ? <Loader2 className="spin" size={19} /> : <Sparkles size={19} />} {running ? '正在制作中…' : project?.hasHtml ? '交给 ' + engineLabel + ' 改进' : '交给 ' + engineLabel + ' 制作'}{!running && <ArrowRight size={18} />}</button>
            {!canGenerate && <button type="button" className="setup-hint" onClick={() => setPage('settings')}><Info size={14} />{status?.engine === 'api' ? '先在设置中完善模型 API 配置' : status?.available ? '先在设置中检查 Codex 登录状态' : '先在设置中配置本地 Codex'}<ChevronRight size={14} /></button>}
            <div className="draft-row"><span>{dirty ? '描述有未保存更改' : project ? '已保存到本机' : '制作时自动保存项目'}</span><button type="button" className="text-button" onClick={() => perform(async () => { await save(); setNotice('草稿已保存。'); })} disabled={locked || !form.name.trim() || (!dirty && !!project)}><Save size={13} />保存草稿</button></div>
          </form></section>
          <section className="panel templates"><h3>从一个灵感开始</h3><button className="template-item" onClick={seed} disabled={locked}><span className="template-icon blue"><CircleDot size={21} /></span><span><strong>落球演示 <small>可直接试玩</small></strong><p>可直接试玩</p></span><ChevronRight size={16} /></button>{presets.map(item => <button key={item.name} className="template-item" onClick={() => preset(item)} disabled={locked}><span className={`template-icon ${item.color}`}><item.icon size={21} /></span><span><strong>{item.name}</strong><p>{item.caption}</p></span><ChevronRight size={16} /></button>)}</section></div></div>
        <div className="preview-column"><Preview project={project} overrideHtml={editorMode === 'live' ? visibleLiveHtml : undefined} previewStageRef={previewStageRef} onDiagnostics={receiveDiagnostics} background={background} setBackground={setBackground} reload={reload} setReload={setReload} width={project?.hasHtml ? project.width : form.width} height={project?.hasHtml ? project.height : form.height} /><Progress job={currentJob} running={running} busy={busy} cancel={() => perform(async () => receiveJob(await studio.invoke('jobs.cancel')))} />{project?.history?.length > 0 && <section className="panel history-panel"><div><History size={16} /><h2>历史版本</h2></div><select aria-label="选择历史版本" value={revision} onChange={event => setRevision(event.target.value)} disabled={locked}><option value="">选择可恢复的版本</option>{project.history.map(item => <option key={item.id} value={item.id}>{prettyDate(item.createdAt)} · {item.label || '历史作品'}</option>)}</select><button className="button secondary small" disabled={locked || !revision} onClick={async () => { if (!await confirmReplace()) return; perform(async () => { showProject(await studio.invoke('projects.restore', { id: project.id, versionId: revision })); await refreshProjects(); setNotice('已恢复所选版本，原作品已保留在历史记录中。'); }); }}>恢复版本</button></section>}</div>
      </div> : page === 'projects' ? <section className="library"><div className="section-toolbar"><div className="search-field"><Search size={17} /><input aria-label="搜索项目" placeholder="搜索作品名称或描述" value={search} onChange={event => setSearch(event.target.value)} /></div><button className="button primary" disabled={locked} onClick={newProject}><FilePlus2 size={17} />新建作品</button></div>{visibleProjects.length ? <div className="project-grid">{visibleProjects.map(item => <button className="project-card" key={item.id} onClick={() => load(item.id)} disabled={locked}><div className={`project-art ${item.hasHtml ? 'ready' : ''}`}><Code2 size={37} strokeWidth={1.3} /><span>{item.width} × {item.height}</span><span className="project-badge">{item.hasHtml ? '可预览' : '草稿'}</span></div><div className="project-card-body"><h2>{item.name}<ArrowRight size={17} /></h2><p>{item.brief || '还没有玩法描述，打开后继续完善。'}</p><div><span>{prettyDate(item.updatedAt)} 更新</span><span>{item.versions || 0} 个历史版本</span></div></div></button>)}</div> : <div className="library-empty panel"><FolderOpen size={39} strokeWidth={1.3} /><h2>{search ? '没有找到匹配的作品' : '给第一个灵感留个位置'}</h2><p>{search ? '换个关键词试试。' : '新建一个作品，或载入落球演示，体验完整的制作流程。'}</p>{!search && <button className="button secondary" onClick={seed} disabled={locked}><Play size={16} />打开落球演示</button>}</div>}</section> : page === 'rules' ? <div className="rules-page"><section className="panel rule-summary"><ShieldCheck size={27} /><div><h2>透明 · 自包含 · 可本地运行</h2><p>下列规范随工作台打包，制作时会传给当前制作引擎。礼物和弹幕互动需要在实际直播工具中完成接入。</p></div></section>{!rules ? <div className="loading-state"><Loader2 className="spin" />正在读取制作规范…</div> : <><details className="panel rule-document" open><summary><BookOpen size={18} />{rules.title || '直播小游戏制作技能'}</summary><SkillDocument content={rules.content} /></details>{rules.sections?.map((section, i) => <details className="panel rule-document" key={`${section.name}-${i}`}><summary><FileText size={17} />{section.name}</summary><SkillDocument content={section.content} /></details>)}</>}</div> : <div className="settings-page"><ProviderSettings settings={settings} status={status} locked={locked} perform={perform} onSettingsSaved={settingsSaved} refreshStatus={refreshStatus} /><div className="settings-local-column"><section className="panel settings-panel"><div className="panel-heading"><h2>本地 Codex</h2><Monitor size={19} /></div>{status?.engine !== 'api' && <><div className="connection-status"><StatusDot status={status} /></div><dl className="status-list"><div><dt>版本</dt><dd>{status?.version || '未检测到'}</dd></div><div><dt>登录状态</dt><dd>{status?.authLabel || (status?.loggedIn ? '已登录' : '未登录')}</dd></div><div><dt>检测到的位置</dt><dd>{status?.path || '尚未找到可执行文件'}</dd></div></dl>{status?.error && <div className="inline-error">{status.error}</div>}</>}<div className="settings-divider" /><label className="field"><span>Codex 可执行文件路径 <small>留空时自动查找</small></span><div className="path-field"><input value={codexPath} onChange={event => setCodexPath(event.target.value)} disabled={locked} placeholder="自动使用本机已安装的 Codex" /><button className="button secondary" disabled={locked} onClick={() => perform(async () => { const result = await studio.invoke('system.chooseCodex'); if (result?.path) setCodexPath(result.path); })}>选择文件</button></div></label><p className="helper">使用与本机终端相同的登录状态。若尚未登录，请在终端运行 <code>codex login</code>，完成后选择本地 Codex 并点击重新检查。</p><button className="button primary" disabled={locked} onClick={() => perform(async () => { await settingsSaved(await studio.invoke('settings.save', { codexPath: codexPath.trim() })); setNotice('Codex 设置已保存。'); })}><Save size={16} />保存设置</button></section><section className="panel settings-panel"><div className="panel-heading"><h2>项目与本地存储</h2><Monitor size={19} /></div><p className="helper">作品、草稿和历史版本保存在这台电脑。导入时创建副本，导出为单个 HTML 文件。</p><div className="data-path">{status?.dataDir || '正在获取存储位置'}</div><button className="button secondary" onClick={() => perform(async () => { await studio.invoke('system.openData'); })} disabled={busy || !status?.dataDir}><FolderOpen size={16} />打开项目文件夹</button><div className="local-info"><Info size={16} /><p>制作需要当前引擎连接其服务。预览与导出无需网络；直播工具的事件接入需在导出后单独配置。</p></div></section></div></div>}
      <footer className="app-footer"><Monitor size={14} />项目保存在本机</footer></div>
    </main>
    {confirmOpen && <DiscardDialog resolve={resolveConfirmation} />}
  </div>;
}
