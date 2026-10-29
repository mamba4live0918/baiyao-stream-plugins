import { useState } from 'react';
import { CheckCircle2, Info, KeyRound, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { studio } from './bridge';
import { providerFormErrors, modelTokenDefault, TOKEN_LIMIT } from './provider-form.mjs';

function origin(value) {
  try { return new URL(value).origin; } catch { return null; }
}

function ProviderProfile({ provider, locked, perform, onSettingsSaved, onActivate }) {
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || '');
  const [model, setModel] = useState(provider.model || '');
  const [maxTokens, setMaxTokens] = useState(String(provider.maxTokens || 8192));
  const [apiKey, setApiKey] = useState('');
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [search, setSearch] = useState('');
  const models = catalog?.models || [];
  const modelInfo = models.find(item => item.id === model.trim());
  const errors = providerFormErrors({baseUrl, model, maxTokens, modelInfo});
  const unsaved = baseUrl.trim() !== provider.baseUrl || model.trim() !== provider.model || Number(maxTokens) !== provider.maxTokens || !!apiKey.trim();
  const changedOrigin = provider.hasKey && origin(baseUrl.trim()) !== origin(provider.baseUrl);
  const needsNewKey = changedOrigin && !apiKey.trim();
  const valid = Object.keys(errors).length === 0;
  const update = (setter, value) => { setter(value); setTest(null); setMessage(''); };
  const changeConnection = (setter, value) => { update(setter, value); setCatalog(null); setSearch(''); setSyncError(''); };
  const chooseModel = value => {
    update(setModel, value);
    const info = models.find(item => item.id === value);
    setMaxTokens(String(modelTokenDefault(info)));
  };
  const syncModels = () => perform(async () => {
    setSyncing(true); setSyncError(''); setMessage('');
    try {
      const result = await studio.invoke('providers.models', {id:provider.id, baseUrl:baseUrl.trim(), ...(apiKey.trim()?{apiKey:apiKey.trim()}:{})});
      setCatalog(result); setSearch(''); setTest(null);
      const current = result.models.find(item => item.id === model.trim());
      if(current) setMaxTokens(String(modelTokenDefault(current)));
      else if(result.models.length===1 && !model.trim()) {setModel(result.models[0].id);setMaxTokens(String(modelTokenDefault(result.models[0])));}
    } catch(error) {setCatalog(null);setSyncError(error.message || '同步失败，请重试或手动填写模型 ID。');}
    finally {setSyncing(false);}
  });

  const save = () => perform(async () => {
    const settings = await studio.invoke('providers.save', { id: provider.id, baseUrl: baseUrl.trim(), model: model.trim(), maxTokens: Number(maxTokens), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
    setApiKey('');
    const saved = settings.providers.find(item => item.id === provider.id);
    setBaseUrl(saved.baseUrl); setModel(saved.model); setMaxTokens(String(saved.maxTokens)); setTest(null);
    await onSettingsSaved(settings);
    setMessage('配置已保存。填写完整后可启用此提供商；连接状态需手动测试。');
  });

  const testSaved = () => perform(async () => {
    setTesting(true); setTest(null); setMessage('');
    try {
      const result = await studio.invoke('providers.test', { id: provider.id });
      if (!result?.ok) throw new Error('连接测试未成功，请检查已保存的配置。');
      setTest(result);
    } finally { setTesting(false); }
  });

  const clearKey = () => perform(async () => {
    const settings = await studio.invoke('providers.save', { id: provider.id, clearKey: true });
    setApiKey(''); setTest(null);
    await onSettingsSaved(settings);
    setMessage('此提供商的密钥已清除。');
  });

  return <div className="provider-profile">
    <div className="provider-protocol"><span className="subtle-tag">{provider.protocol === 'anthropic' ? 'Anthropic 原生协议' : 'OpenAI 兼容协议'}</span><span>每个提供商单独保存密钥</span></div>
    <label className="field"><span>Base URL</span><input type="url" value={baseUrl} onChange={event => changeConnection(setBaseUrl, event.target.value)} disabled={locked} placeholder="https://你的服务地址/v1" spellCheck={false} autoComplete="off" aria-invalid={!!errors.baseUrl} /></label>
    <p className="provider-field-help">填写 API 基础地址，不包含 /chat/completions 或 /messages。</p>
    {errors.baseUrl && <p className="inline-error">{errors.baseUrl}</p>}
    <label className="field"><span>API Key</span><input type="password" value={apiKey} onChange={event => changeConnection(setApiKey, event.target.value)} disabled={locked} placeholder={provider.hasKey ? '已保存，留空保留；输入新密钥可替换' : '输入此提供商的 API Key'} autoComplete="new-password" spellCheck={false} aria-describedby={`key-status-${provider.id}`} /></label>
    <div className={`provider-key-status ${provider.hasKey ? 'saved' : ''}`} id={`key-status-${provider.id}`}><KeyRound size={14} /><span>{!provider.hasKey ? '尚未保存密钥' : provider.keyStorage === 'encrypted' ? '密钥已加密保存在本机' : '密钥仅保存在本次会话，退出后需重新输入'}</span></div>
    <div className="model-discovery">
      <div className="model-discovery-heading"><strong>从服务商选择模型</strong><button className="button secondary small" disabled={locked || !!errors.baseUrl || needsNewKey || !(apiKey.trim() || provider.hasKey)} onClick={syncModels}>{syncing?<Loader2 size={14} className="spin"/>:<RefreshCw size={14}/>}同步模型列表</button></div>
      <p className="helper">填写地址和密钥后即可同步，无需先保存。只读取模型目录，不发送作品内容。</p>
      {syncError && <p className="inline-error" role="alert">{syncError}</p>}
      {catalog && <>
        <p className="model-sync-status" role="status">已同步 {models.length} 个模型 · {new Date(catalog.syncedAt).toLocaleTimeString('zh-CN')} · 选择后自动填写输出上限</p>
        <input aria-label="搜索模型" placeholder="搜索模型名称或 ID" value={search} onChange={event=>setSearch(event.target.value)} disabled={locked}/>
        <select aria-label="可用模型" value={models.some(item=>item.id===model)?model:''} disabled={locked} onChange={event=>chooseModel(event.target.value)}>
          <option value="" disabled>请选择一个模型</option>
          {models.filter(item=>item.id===model||`${item.id} ${item.name}`.toLowerCase().includes(search.toLowerCase())).map(item=><option key={item.id} value={item.id}>{item.name===item.id?item.id:`${item.name} · ${item.id}`}{item.vision===true?' · 支持图片':''}</option>)}
        </select>
        {!models.some(item=>`${item.id} ${item.name}`.toLowerCase().includes(search.toLowerCase())) && <p className="helper">没有匹配的模型，换个关键词或手动填写。</p>}
        {modelInfo && <div className="model-capabilities"><span>{modelInfo.vision===true?'支持图片输入':modelInfo.vision===false?'目录标注仅文本输入':'图片能力未提供'}</span>{modelInfo.contextWindow && <span>上下文 / 输入：{modelInfo.contextWindow.toLocaleString()}</span>}{modelInfo.maxOutputTokens && <span>最大输出：{modelInfo.maxOutputTokens.toLocaleString()}</span>}</div>}
      </>}
    </div>
    <div className="provider-model-row">
      <label className="field"><span>模型 ID <small>同步选择，也可手动填写</small></span><input value={model} onChange={event => chooseModel(event.target.value)} disabled={locked} placeholder="同步选择或输入模型 ID" spellCheck={false} autoComplete="off" aria-invalid={!!errors.model} /></label>
      <label className="field"><span>最大输出 tokens</span><input type="number" min="256" max={modelInfo?.maxOutputTokens ? Math.min(TOKEN_LIMIT, modelInfo.maxOutputTokens) : TOKEN_LIMIT} step="1" value={maxTokens} onChange={event => update(setMaxTokens, event.target.value)} disabled={locked} aria-invalid={!!errors.tokens} aria-describedby="output-token-help" /></label>
    </div>
    <p className="provider-field-help" id="output-token-help">{modelInfo?.maxOutputTokens ? `来源：服务商模型目录。${Number(maxTokens)===modelTokenDefault(modelInfo)?'已自动填写':'当前为手动调整值'}。${modelInfo.maxOutputTokens>TOKEN_LIMIT?'受工作台上限限制为 2,097,152。':''}` : catalog ? '当前模型的输出上限未知，默认 8,192，可手动修改。' : '同步并选择模型后自动填写最大输出；未知时默认 8,192。这不是上下文长度。'} <button className="text-button" disabled={locked} onClick={()=>update(setMaxTokens,String(modelTokenDefault(modelInfo)))}>{modelInfo?.maxOutputTokens?'按模型重新填写':'恢复默认 8,192'}</button></p>
    {errors.model && <p className="provider-field-help">{errors.model}</p>}
    {errors.tokens && <p className="inline-error" role="alert">{errors.tokens}</p>}
    {provider.keyError && <p className="inline-error" role="alert">{provider.keyError}</p>}
    {needsNewKey && <p className="inline-error" role="alert">目标主机已改变。请输入该主机的新密钥，或先清除已保存的密钥，再保存地址。</p>}
    <div className="provider-actions">
      <button className="button primary" disabled={locked || !valid || needsNewKey} onClick={save}><Save size={15} />保存配置</button>
      <button className="button secondary" disabled={locked || unsaved || !provider.hasKey || !valid} onClick={testSaved}>{testing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}测试已保存配置</button>
      <button className="text-button danger" disabled={locked || !provider.hasKey} onClick={clearKey}><Trash2 size={14} />清除密钥</button>
    </div>
    <p className="helper provider-test-help">测试会发送一条简短请求，可能产生少量 API 用量，不包含项目内容。{unsaved ? '请先保存更改再测试。' : ''}</p>
    {test && <div className="provider-result" role="status"><CheckCircle2 size={16} /><span>连接测试成功 · {test.model} · {Math.round(test.latencyMs)} ms</span></div>}
    {message && <p className="provider-message" role="status">{message}</p>}
    <button className="button secondary provider-activate" disabled={locked || unsaved || !valid || !provider.hasKey} onClick={() => onActivate(provider.id)}>启用 {provider.name} 制作</button>
  </div>;
}

export default function ProviderSettings({ settings, status, locked, perform, onSettingsSaved, refreshStatus }) {
  const [engine, setEngine] = useState(settings?.engine || 'codex');
  const [providerId, setProviderId] = useState(settings?.activeProvider || settings?.providers?.[0]?.id || 'deepseek');
  const providers = settings?.providers || [];
  const provider = providers.find(item => item.id === providerId);
  const activeProvider = providers.find(item => item.id === settings?.activeProvider);
  const selectionChanged = engine !== settings?.engine || (engine === 'api' && providerId !== settings?.activeProvider);
  const saveSelection = (nextEngine = engine, nextProvider = providerId) => perform(async () => {
    const saved = await studio.invoke('settings.save', { engine: nextEngine, activeProvider: nextProvider });
    setEngine(saved.engine); setProviderId(saved.activeProvider);
    await onSettingsSaved(saved);
  });

  return <section className="panel settings-panel provider-settings">
    <div className="panel-heading"><h2>制作引擎</h2><button className="button secondary small" disabled={locked} onClick={() => perform(refreshStatus)}><RefreshCw size={14} />重新检查</button></div>
    <div className="engine-options" aria-label="制作引擎选择">
      <button type="button" aria-pressed={engine === 'codex'} disabled={locked} className={engine === 'codex' ? 'selected' : ''} onClick={() => setEngine('codex')}><strong>本地 Codex</strong><span>使用本机登录与工具能力</span></button>
      <button type="button" aria-pressed={engine === 'api'} disabled={locked || !providers.length} className={engine === 'api' ? 'selected' : ''} onClick={() => setEngine('api')}><strong>模型 API</strong><span>使用自己的提供商密钥</span></button>
    </div>
    <div className="engine-current"><span className={`status-dot ${status?.ready ? 'good' : ''}`} /><span>当前：{settings?.engine === 'api' ? (activeProvider?.name || '模型 API') : '本地 Codex'} · {status?.ready ? (status?.engine === 'api' ? '已配置' : '已就绪') : '待配置'}</span></div>
    <p className="helper">API 模式直接生成 HTML，可在工作台预览和导出；不会像本地 Codex 一样自主调用工具、打开浏览器或运行测试。</p>
    <button className="button secondary" disabled={locked || !selectionChanged} onClick={() => saveSelection()}><Save size={15} />保存引擎选择</button>
    {selectionChanged && <span className="engine-pending">选择尚未应用</span>}
    <div className="settings-divider" />
    <div className="panel-heading"><h2>API 提供商</h2><Info size={17} /></div>
    {!providers.length ? <p className="helper">未能读取提供商配置，请重新打开工作台。</p> : <>
      <label className="field"><span>配置档案</span><select value={providerId} disabled={locked} onChange={event => setProviderId(event.target.value)}>{providers.map(item => <option key={item.id} value={item.id}>{item.name}{settings?.engine === 'api' && settings.activeProvider === item.id ? ' · 当前使用' : ''}</option>)}</select></label>
      <p className="provider-field-help">切换档案用于编辑配置；保存引擎选择或点击下方启用按钮后，才会切换制作引擎。</p>
      {!settings.keyStorageAvailable && <p className="provider-storage-note"><Info size={14} />当前环境不支持系统加密存储，密钥仅在本次会话有效。</p>}
      {provider && <ProviderProfile key={provider.id} provider={provider} locked={locked} perform={perform} onSettingsSaved={onSettingsSaved} onActivate={id => saveSelection('api', id)} />}
    </>}
  </section>;
}
