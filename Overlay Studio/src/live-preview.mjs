export function readPreviewMessage(event, frameWindow, token) {
  if (!frameWindow || event.source !== frameWindow || event.data?.type !== 'overlay-studio-preview' || event.data.token !== token || !Array.isArray(event.data.findings)) return null;
  return event.data.findings.slice(0, 60).filter(item => item && ['error', 'warning', 'info'].includes(item.severity) && typeof item.title === 'string' && typeof item.detail === 'string').slice(0, 30).map(({ severity, title, detail }) => ({ severity, title: title.slice(0, 120), detail: detail.slice(0, 2000) }));
}

export function instrumentPreviewDocument(html, token) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) throw new Error('Invalid preview channel');
  // This script lives only inside the opaque preview. Its only outward operation
  // is a bounded diagnostic message, never an app/native RPC request.
  const script = `(function(){
    var token=${JSON.stringify(token)},seen=new Set(),count=0;
    function report(severity,title,detail){
      title=String(title).slice(0,120);detail=String(detail).slice(0,2000);
      var key=severity+title+detail;if(count>=30||seen.has(key))return;
      seen.add(key);count++;window.parent.postMessage({type:'overlay-studio-preview',token:token,findings:[{severity:severity,title:title,detail:detail}]},'*');
    }
    window.addEventListener('error',function(event){
      if(event.target&&event.target!==window){report('warning','资源加载失败',String(event.target.tagName||'资源')+' 未能加载；隔离预览会阻止外部资源。');return;}
      report('error','脚本运行错误',String(event.message||'未知错误')+'（行 '+(event.lineno||'?')+'，列 '+(event.colno||'?')+'）');
    },true);
    window.addEventListener('unhandledrejection',function(event){report('error','未处理的异步错误',event.reason&&event.reason.message||String(event.reason||'未知原因'));});
    document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){
      try{
        var root=document.documentElement,body=document.body;
        function opaque(node){if(!node)return false;var style=getComputedStyle(node),color=style.backgroundColor;return style.backgroundImage!=='none'||(color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'&&!/rgba\\([^)]*,\\s*0\\s*\\)/.test(color));}
        if(opaque(root)||opaque(body))report('warning','页面背景可能不透明','检测到 html/body 的背景色或背景图，请检查叠加到直播画面时是否遮挡内容。');
        if(root&&root.scrollWidth>root.clientWidth+2)report('warning','画面可能横向溢出','页面内容宽度超过当前画布宽度，请检查边缘元素与布局。');
        report('info','预览基础检查已运行','已检查脚本错误、页面背景和横向溢出；仍需手动试玩交互，不代表完整质量验证。');
      }catch(error){report('info','基础检查未完成',error.message||'请手动检查预览');}
    },0);},{once:true});
  })();`;
  return `<script>${script}</script>${html}`;
}

export function createLiveDraft(project) {
  return { projectId: project?.id || null, html: project?.html || '', baseHtml: project?.html || '', baseRevision: project?.revision || 0, conflict: false };
}
export function reconcileLiveDraft(project, draft) {
  if (!draft || draft.projectId !== project?.id || draft.html === draft.baseHtml || draft.html === project?.html) return createLiveDraft(project);
  if (draft.baseHtml === project.html) return { ...draft, baseRevision: project.revision || 0, conflict: false };
  return { ...draft, conflict: true };
}
