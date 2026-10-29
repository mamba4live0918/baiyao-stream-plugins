import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Code2, FileCode2, Loader2, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Sparkles, Square } from 'lucide-react';
import { studio } from './bridge';
import { parseLiveConfig, updateLiveConfig, auditSource } from './live-config.mjs';

const MAX_SOURCE = 20 * 1024 * 1024;
const severityLabels = { error: '错误', warning: '注意', info: '提示' };

function NumberParameter({ field, disabled, onChange }) {
  const [input, setInput] = useState(String(field.value));
  useEffect(() => setInput(String(field.value)), [field.value]);
  return <div className="live-number-control">{Number.isFinite(field.min) && Number.isFinite(field.max) && <input aria-label={`${field.label}滑块`} type="range" min={field.min} max={field.max} step={field.step || 1} value={field.value} disabled={disabled} onChange={event => onChange(Number(event.target.value))} />}<input id={`live-param-${field.key}`} type="number" aria-label={field.label} min={field.min} max={field.max} step={field.step || 'any'} value={input} disabled={disabled} onChange={event => { setInput(event.target.value); if (event.target.value !== '' && Number.isFinite(Number(event.target.value))) onChange(Number(event.target.value)); }} onBlur={() => setInput(String(field.value))} /></div>;
}

function Findings({ findings, onFix, disabled }) {
  return <div className="live-findings">{findings.map((finding, index) => <article key={`${index}-${finding.title}`} className={`live-finding ${finding.severity}`}><div><span className="finding-severity">{severityLabels[finding.severity] || '提示'}</span><strong>{finding.title}</strong>{finding.origin && <span className="finding-severity">{finding.origin === 'source' ? '源码检查' : '运行检查'}</span>}</div><p>{finding.detail}</p>{finding.suggestion && <p className="finding-suggestion">建议：{finding.suggestion}</p>}{onFix && finding.suggestion && <button className="text-button" disabled={disabled} onClick={() => onFix(finding)}><Sparkles size={12} />让模型处理这条</button>}</article>)}</div>;
}

export default function LiveEditor({ project, draft, active, locked, canGenerate, engineLabel, previewHtml, diagnostics, job, onChange, onPreview, onSave, onReview, onRequestParameters, onRequestFix, onGuided, onCancel }) {
  const [tab, setTab] = useState('parameters');
  const [automatic, setAutomatic] = useState(true);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [sourceHash, setSourceHash] = useState('');
  const html = draft?.html || '';
  const dirty = html !== (project?.html || '');
  const disabled = locked || working;
  const config = useMemo(() => parseLiveConfig(html), [html]);
  const sourceFindings = useMemo(() => html ? auditSource(html) : [], [html]);
  const bytes = useMemo(() => new TextEncoder().encode(html).byteLength, [html]);
  const previewMatches = previewHtml === html;
  const localFindings = [...sourceFindings.map(item => ({ ...item, origin: 'source' })), ...(previewMatches ? diagnostics.map(item => ({ ...item, origin: 'runtime' })) : [])].slice(0, 30);
  const invalidSource = bytes > MAX_SOURCE || sourceFindings.some(item => item.severity === 'error');
  const review = project?.review;
  const reviewStale = !!(review?.htmlHash && sourceHash && review.htmlHash !== sourceHash);

  useEffect(() => {
    if (!active || !automatic || !html || bytes > MAX_SOURCE) return;
    const timer = setTimeout(() => onPreview(project.id, html), 300);
    return () => clearTimeout(timer);
  }, [active, automatic, html, bytes, project?.id, onPreview]);

  useEffect(() => {
    let alive = true;
    if (!html || !globalThis.crypto?.subtle) { setSourceHash(''); return; }
    const timer = setTimeout(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(html)).then(buffer => { if (alive) setSourceHash(Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('')); }).catch(() => { if (alive) setSourceHash(''); }), 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [html]);

  const run = async operation => { setError(''); setWorking(true); try { await operation(); } catch (caught) { setError(caught.message || String(caught)); } finally { setWorking(false); } };
  const changeHtml = next => {
    if (new TextEncoder().encode(next).byteLength > MAX_SOURCE) { setError('HTML 源码不能超过 20 MiB，请缩小内嵌资源后重试。'); return; }
    setError(''); onChange({ ...draft, html: next });
  };
  const changeParameter = (key, value) => { try { changeHtml(updateLiveConfig(html, key, value)); } catch (caught) { setError(caught.message); } };

  if (!project?.hasHtml) return <section className="panel live-panel"><div className="live-empty"><FileCode2 size={32} /><h2>先准备一个可试玩的作品</h2><p>生成一个作品或导入 HTML，就可以在这里调整参数、编辑源码并检查效果。</p><button className="button primary" onClick={onGuided}>开始引导创作</button></div></section>;

  return <section className="panel live-panel" aria-label="实时编辑作品">
    <div className="live-editor-top"><div className="segmented" aria-label="实时编辑方式"><button className={tab === 'parameters' ? 'selected' : ''} aria-pressed={tab === 'parameters'} onClick={() => setTab('parameters')}><SlidersHorizontal size={14} />可视化参数</button><button className={tab === 'source' ? 'selected' : ''} aria-pressed={tab === 'source'} onClick={() => setTab('source')}><Code2 size={14} />HTML 源码</button></div><span className={`live-draft-badge ${dirty ? 'dirty' : ''}`}>{dirty ? '未保存' : '已保存'}</span></div>
    <div className="live-editor-body">
      {draft.conflict && <div className="inline-error" role="alert"><strong>已保存的作品发生了变化。</strong><p>当前修改仍保留。请先复制需要保留的源码，再载入最新版本重新修改。</p><button className="text-button" disabled={disabled} onClick={() => onChange({ projectId: project.id, html: project.html, baseHtml: project.html, baseRevision: project.revision, conflict: false })}>放弃本地修改，载入已保存版本</button></div>}
      {tab === 'parameters' ? <div className="live-parameters">{config.error ? <div className="live-parameter-empty"><AlertTriangle size={24} /><h3>参数格式需要修正</h3><p>{config.error}</p><button className="text-button" onClick={() => setTab('source')}>打开源码修正</button></div> : config.fields.length ? <><p className="live-help">这些参数由当前作品提供，调整后会重新加载试玩。</p>{config.fields.map(field => <div className="live-parameter" key={field.key}><label htmlFor={`live-param-${field.key}`}>{field.label}</label>{field.type === 'number' ? <NumberParameter field={field} disabled={disabled} onChange={value => changeParameter(field.key, value)} /> : field.type === 'boolean' ? <label className="live-toggle"><input id={`live-param-${field.key}`} type="checkbox" checked={field.value} disabled={disabled} onChange={event => changeParameter(field.key, event.target.checked)} /><span>{field.value ? '已开启' : '已关闭'}</span></label> : field.type === 'color' ? <div className="live-color-control"><input id={`live-param-${field.key}`} type="color" value={field.value} disabled={disabled} onChange={event => changeParameter(field.key, event.target.value)} /><code>{field.value.toUpperCase()}</code></div> : <input id={`live-param-${field.key}`} type="text" maxLength={200} value={field.value} disabled={disabled} onChange={event => changeParameter(field.key, event.target.value)} />}</div>)}</> : <div className="live-parameter-empty"><SlidersHorizontal size={26} /><h3>旧作品尚未提供可视化参数</h3><p>源码编辑仍然可用。也可以让当前模型为玩法加入真正生效的参数控件。</p><button className="button secondary" disabled={disabled || !canGenerate || dirty || draft.conflict} onClick={() => run(onRequestParameters)}><Sparkles size={15} />让模型添加参数</button>{dirty && <small>先保存当前源码修改，再添加参数。</small>}<button className="text-button" onClick={() => setTab('source')}>直接编辑 HTML 源码</button></div>}</div> : <div className="live-source"><div className="live-source-heading"><span><Code2 size={13} />当前作品 HTML</span><span>{(bytes / 1024).toFixed(1)} KiB / 20 MiB</span></div><textarea aria-label="作品 HTML 源码" value={html} onChange={event => changeHtml(event.target.value)} disabled={disabled} spellCheck={false} autoComplete="off" autoCapitalize="off" wrap="off" /><p className="live-help">源码仅在隔离预览中运行。保存前请检查画面和互动。</p></div>}
      <div className="live-refresh-row"><label className="live-toggle"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} disabled={disabled} /><span>自动刷新预览</span></label><button className="text-button" disabled={disabled || bytes > MAX_SOURCE} onClick={() => onPreview(project.id, html, true)}><RefreshCw size={13} />立即刷新</button></div>
      <p className="live-refresh-note">{automatic ? '修改后约 300 毫秒刷新。' : '自动刷新已暂停。'}刷新会重启当前试玩，不会自动保存作品。</p>
      {!previewMatches && <p className="live-pending" role="status">右侧预览尚未应用最新修改。</p>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <button className="button primary live-save" disabled={disabled || !dirty || invalidSource || draft.conflict} onClick={() => run(() => onSave(draft))}>{working ? <Loader2 size={16} className="spin" /> : <Save size={16} />}保存版本</button><p className="live-save-help">{dirty ? '修改保留在当前工作台，切换页面不会丢失；关闭前请保存。' : '保存会保留上一版本，可在右侧历史记录中恢复。'}</p>
    </div>
    <section className="live-review" aria-label="作品审查"><div className="live-section-heading"><h3><ShieldCheck size={16} />检查与审查</h3><span>{localFindings.filter(item => item.severity !== 'info').length} 项需留意</span></div><details className="local-checks" open={localFindings.some(item => item.severity === 'error')}><summary>本地源码与运行检查 <span>{localFindings.length} 项</span></summary>{localFindings.length ? <Findings findings={localFindings} /> : <p className="live-help">暂未发现这些基础检查覆盖的问题。仍需手动试玩验证玩法。</p>}{!previewMatches && <p className="live-help">刷新预览后，才会附上当前源码的运行检查结果。</p>}</details>
      <p className="live-help">AI 审查会提交当前源码与检查结果，使用当前模型额度。审查不会改写作品。</p>
      {studio.isDesktop && <label className="live-toggle live-screenshot"><input type="checkbox" checked={includeScreenshot} disabled={disabled} onChange={event => setIncludeScreenshot(event.target.checked)} /><span><Camera size={13} />附预览截图（需视觉模型）</span></label>}
      <button className="button secondary live-review-button" disabled={disabled || !canGenerate || invalidSource || (includeScreenshot && !previewMatches)} onClick={() => run(() => onReview({ html, diagnostics: localFindings, screenshot: includeScreenshot }))}><Sparkles size={15} />AI 审查</button>
      {includeScreenshot && !previewMatches && <p className="live-help">先刷新最新预览，再附截图审查。</p>}
      {!canGenerate && <p className="live-help">请先在设置中配置 {engineLabel}。</p>}
      {job?.kind === 'review' && job.state === 'running' && <button className="text-button danger" onClick={onCancel}><Square size={12} />停止本次审查</button>}
      {review && <div className="ai-review-result"><div className="live-section-heading"><h3><CheckCircle2 size={15} />AI 审查报告</h3><time>{new Date(review.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div><p className="review-scope">{review.withScreenshot ? '已提供预览截图、源码与检查结果；静态截图不能替代互动试玩。' : '未提供截图：本次仅审查源码与提供的检查结果，未进行视觉验收。'}</p>{reviewStale && <p className="live-pending">源码已更改，此报告对应之前提交的版本。</p>}<p className="review-summary">{review.summary}</p><Findings findings={review.findings || []} disabled={disabled || !canGenerate || dirty || draft.conflict || reviewStale} onFix={finding => run(() => onRequestFix(`请根据这条审查建议改进作品，并保留现有有效玩法与可视化参数：\n${finding.title}\n${finding.detail}\n建议：${finding.suggestion}`))} />{dirty && <p className="live-help">先保存当前修改，再让模型处理建议；不会自动应用修复。</p>}</div>}
    </section>
  </section>;
}
