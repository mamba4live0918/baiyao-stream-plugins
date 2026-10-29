export class WebGLRequiredError extends Error {
  constructor(cause){super('当前环境无法启用 WebGL 2，请先完成图形设置。',{cause});this.code='WEBGL_REQUIRED';}
}
export function showGraphicsRequired({lost=false,onRetry=()=>location.reload()}={}) {
  document.body.classList.add('graphics-required');
  if(document.getElementById('graphics-required'))return;
  const style=document.createElement('style');style.textContent=`
  .graphics-required #app,.graphics-required .overlay,.graphics-required .layout-edit-box,.graphics-required .local-magnifier{display:none!important}
  #graphics-required{position:fixed;inset:0;z-index:1000;overflow:auto;background:#eeeede;color:#334238;padding:24px;display:grid;place-items:center;font:14px/1.65 "Microsoft YaHei",Arial,sans-serif}
  .graphics-card{width:min(680px,100%);box-sizing:border-box;padding:30px;border:1px solid #d3d9c9;border-radius:18px;background:#fffef6;box-shadow:0 12px 40px #30432b12}
  .graphics-card small{color:#748266}.graphics-card h1{font-size:25px;margin:8px 0 12px}.graphics-card p{margin:10px 0}.graphics-note{font-size:12px;color:#697760}.graphics-card ol{padding-left:23px;margin:20px 0}.graphics-card li{padding:0 0 13px 5px}.graphics-card li b,.graphics-card li span{display:block}.graphics-card li span{color:#586551;font-size:13px;margin-top:4px}.graphics-actions button{padding:12px 22px;border:0;border-radius:9px;background:#667c53;color:white;font-weight:700;cursor:pointer}.graphics-links{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:18px}.graphics-links a{color:#476949;text-decoration:underline}
  @media(max-width:600px){#graphics-required{padding:12px}.graphics-card{padding:20px}.graphics-card h1{font-size:21px}}
  `;document.head.append(style);
  const panel=document.createElement('section');panel.id='graphics-required';panel.setAttribute('role','alert');
  panel.innerHTML=`<div class="graphics-card"><small>拼豆工坊 · 运行环境检查</small><h1>${lost?'3D 图形连接已中断':'需要启用 WebGL 才能开始'}</h1><p>本插件需要 WebGL 2。请按下面步骤检查，再重新打开插件。</p><p class="graphics-note">WebGL 是浏览器自带的功能，不需要单独安装“WebGL 插件”。</p><ol><li><b>浏览器打开</b><span>使用新版 Chrome 或 Edge。在浏览器设置中搜索“图形加速”或“硬件加速”，开启“可用时使用图形加速”，然后重启浏览器。</span></li><li><b>OBS 浏览器来源</b><span>更新 OBS。在设置中检查浏览器来源的硬件加速选项（若该版本提供），调整后重启 OBS。Chrome 的设置不会自动改变 OBS。</span></li><li><b>仍无法运行</b><span>从电脑或显卡厂商官网下载并更新显卡驱动，然后重启电脑。远程桌面或虚拟机可能限制图形功能，可在本机桌面重试。</span></li></ol><div class="graphics-actions"><button id="graphics-retry" type="button">已设置好，重新检测</button></div><div class="graphics-links"><span>官方下载安装（需要联网）：</span></div><p class="graphics-note">已有存档不会因此清空。环境满足后，拼豆本身仍可离线使用。</p></div>`;
  for(const [label,url]of [['Chrome','https://www.google.com/chrome/'],['Edge','https://www.microsoft.com/edge/download'],['OBS','https://obsproject.com/download']]){const a=document.createElement('a');a.textContent=label+' 官网';a.setAttribute('href',url);a.target='_blank';a.rel='noopener noreferrer';panel.querySelector('.graphics-links').append(a);}
  panel.querySelector('#graphics-retry').addEventListener('click',onRetry);document.body.append(panel);
}
