/* OBS 浏览器源下拉兼容：OBS 离屏渲染不会绘制 <select> 的原生弹出层，点开后看不见也选不了。
   这里拦截原生弹出，改用页面内绘制的选项列表；原 <select> 保留原样（样式、value、change 事件不变），
   之后动态生成的下拉同样生效。普通浏览器里表现一致。 */
(function(){'use strict';if(window.__obsSelect)return;window.__obsSelect=1;
var menu=null,cur=null,items=[],active=-1,typed='',typedAt=0,styled=false;
var CSS='.obs-select-menu{position:fixed;z-index:2147483000;box-sizing:border-box;margin:0;padding:5px;overflow-y:auto;overscroll-behavior:contain;background:#fffdfb;border:1px solid #ead5df;border-radius:12px;box-shadow:0 12px 30px #6b3f5a33,0 2px 6px #6b3f5a1f;color:#7d5667;text-align:left;user-select:none;scrollbar-width:thin;scrollbar-color:#e6c3d3 transparent}'+
'.obs-select-option{position:relative;padding:7px 30px 7px 10px;border-radius:8px;line-height:1.35;white-space:nowrap;cursor:pointer}'+
'.obs-select-option[data-active]{background:#fbe8f0}'+
'.obs-select-option[aria-selected=true]{color:#b4557f;font-weight:700}'+
'.obs-select-option[aria-selected=true]::after{content:"\\2713";position:absolute;right:10px;top:50%;transform:translateY(-50%)}'+
'.obs-select-option[aria-disabled=true]{opacity:.45;cursor:default}'+
'.obs-select-group{padding:6px 10px 3px;font-size:.85em;opacity:.7;font-weight:700}'+
'select[data-obs-open]{border-color:#d996b0!important;box-shadow:0 0 0 3px #faedf3}select[data-obs-mouse]:focus-visible{outline:none!important}';
function addStyle(){if(styled)return;styled=true;var st=document.createElement('style');st.id='obs-select-style';st.textContent=CSS;(document.head||document.documentElement).appendChild(st);}
function mouseFocus(s){s.setAttribute('data-obs-mouse','');try{s.focus({preventScroll:true,focusVisible:false});}catch(_){}}
document.addEventListener('focusout',function(e){if(e.target&&e.target.removeAttribute&&e.target.tagName==='SELECT')e.target.removeAttribute('data-obs-mouse');},true);
function keyOf(e){var k=e.key;if(k&&k!=='Unidentified')return k==='Spacebar'?' ':k;var c=e.keyCode||e.which||0;return {13:'Enter',27:'Escape',32:' ',9:'Tab',38:'ArrowUp',40:'ArrowDown',33:'PageUp',34:'PageDown',35:'End',36:'Home',115:'F4'}[c]||'';}
function eligible(s){return s&&s.tagName==='SELECT'&&!s.multiple&&!(s.size>1)&&!s.disabled&&!s.closest('fieldset[disabled]');}
function setActive(i,scroll){if(i<0||i>=items.length)return;if(items[active])items[active].el.removeAttribute('data-active');active=i;var el=items[i].el;el.setAttribute('data-active','');menu.setAttribute('aria-activedescendant',el.id);if(scroll!==false){var top=el.offsetTop,bottom=top+el.offsetHeight;if(top<menu.scrollTop)menu.scrollTop=top-5;else if(bottom>menu.scrollTop+menu.clientHeight)menu.scrollTop=bottom-menu.clientHeight+5;}}
function move(from,step){for(var i=from+step;i>=0&&i<items.length;i+=step)if(!items[i].opt.disabled)return i;return from;}
function close(refocus){if(!menu)return;var s=cur;menu.remove();menu=null;cur=null;items=[];active=-1;if(s){s.removeAttribute('data-obs-open');s.setAttribute('aria-expanded','false');if(refocus&&s.isConnected)try{s.focus({preventScroll:true});}catch(_){}}}
function commit(i){var s=cur,it=items[i];if(!s||!it||it.opt.disabled)return;var changed=s.selectedIndex!==it.idx;s.selectedIndex=it.idx;close(true);if(changed){s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}}
function place(s){var keep=menu.scrollTop,r=s.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight,gap=4,edge=8;menu.style.minWidth=Math.max(120,r.width)+'px';menu.style.maxWidth=Math.max(160,vw-edge*2)+'px';menu.style.maxHeight='none';var h=menu.scrollHeight+2,below=vh-r.bottom-gap-edge,above=r.top-gap-edge,up=h>below&&above>below,room=Math.max(80,up?above:below);menu.style.maxHeight=Math.min(room,420)+'px';var mh=Math.min(h,room,420);menu.style.top=(up?Math.max(edge,r.top-gap-mh):Math.min(r.bottom+gap,vh-edge-mh))+'px';var w=menu.offsetWidth,left=Math.min(r.left,vw-edge-w);menu.style.left=Math.max(edge,left)+'px';menu.scrollTop=keep;}
function open(s){close(false);addStyle();cur=s;menu=document.createElement('div');menu.className='obs-select-menu';menu.setAttribute('role','listbox');menu.tabIndex=-1;var label=s.getAttribute('aria-label')||(s.closest('label')&&s.closest('label').textContent.replace(/\s+/g,' ').trim().slice(0,40))||'';if(label)menu.setAttribute('aria-label',label);var cs=getComputedStyle(s);menu.style.fontFamily=cs.fontFamily;menu.style.fontSize=Math.max(12,parseFloat(cs.fontSize)||13)+'px';var uid=Date.now().toString(36),lastGroup=null;
 for(var i=0;i<s.options.length;i++){var o=s.options[i];if(o.hidden)continue;var g=o.parentElement&&o.parentElement.tagName==='OPTGROUP'?o.parentElement:null;if(g&&g!==lastGroup){var gh=document.createElement('div');gh.className='obs-select-group';gh.textContent=g.label;menu.appendChild(gh);}lastGroup=g;var el=document.createElement('div');el.className='obs-select-option';el.id='obs-opt-'+uid+'-'+i;el.setAttribute('role','option');el.setAttribute('aria-selected',String(i===s.selectedIndex));if(o.disabled||(g&&g.disabled))el.setAttribute('aria-disabled','true');el.textContent=o.label||o.text;el.dataset.index=String(items.length);menu.appendChild(el);items.push({el:el,opt:o,idx:i});}
 menu.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();});
 menu.addEventListener('pointerdown',function(e){e.stopPropagation();});
 menu.addEventListener('mousemove',function(e){var el=e.target.closest&&e.target.closest('.obs-select-option');if(el&&el.getAttribute('aria-disabled')!=='true')setActive(+el.dataset.index,false);});
 menu.addEventListener('click',function(e){e.stopPropagation();var el=e.target.closest&&e.target.closest('.obs-select-option');if(el)commit(+el.dataset.index);});
 menu.addEventListener('dblclick',function(e){e.stopPropagation();});
 menu.addEventListener('wheel',function(e){e.stopPropagation();},{passive:true});
 document.body.appendChild(menu);s.setAttribute('data-obs-open','');s.setAttribute('aria-expanded','true');place(s);
 var sel=-1;for(var j=0;j<items.length;j++)if(items[j].idx===s.selectedIndex)sel=j;setActive(sel>=0?sel:move(-1,1),true);}
function typeahead(ch){var now=Date.now();typed=now-typedAt>800?ch:typed+ch;typedAt=now;var q=typed.toLowerCase(),start=typed.length>1?active:active+1;for(var n=0;n<items.length;n++){var i=(Math.max(0,start)+n)%items.length,it=items[i];if(!it.opt.disabled&&(it.opt.label||it.opt.text).toLowerCase().indexOf(q)===0)return i;}return -1;}
// 拦截原生弹出：Chromium 在 mousedown 时打开 <select> 弹层，阻止默认即可不弹
document.addEventListener('mousedown',function(e){if(e.button!==0)return;var t=e.target,s=t&&t.closest?t.closest('select'):null;if(menu&&menu.contains(t))return;if(menu){var was=cur;close(false);if(s&&s===was){e.preventDefault();mouseFocus(s);return;}}if(!eligible(s))return;e.preventDefault();mouseFocus(s);open(s);},true);
window.addEventListener('keydown',function(e){var k=keyOf(e);if(k==='Tab'&&document.activeElement&&document.activeElement.removeAttribute)document.activeElement.removeAttribute('data-obs-mouse');
 if(menu){if(!cur||!cur.isConnected){close(false);return;}var handled=true;
  if(k==='ArrowDown')setActive(move(active,1));else if(k==='ArrowUp')setActive(move(active,-1));else if(k==='Home')setActive(move(-1,1));else if(k==='End')setActive(move(items.length,-1));
  else if(k==='PageDown'){var d=active;for(var n=0;n<8;n++)d=move(d,1);setActive(d);}else if(k==='PageUp'){var u=active;for(var m=0;m<8;m++)u=move(u,-1);setActive(u);}
  else if(k==='Enter'||k===' '||(k==='ArrowUp'&&e.altKey)||(k==='ArrowDown'&&e.altKey))commit(active);else if(k==='Escape'||k==='F4')close(true);else if(k==='Tab'){commit(active);handled=false;}
  else if(k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){var hit=typeahead(k);if(hit>=0)setActive(hit);}else handled=false;
  if(handled){e.preventDefault();e.stopImmediatePropagation();}return;}
 var s=e.target;if(!eligible(s)||e.isComposing)return;
 if(k===' '||k==='Enter'||k==='F4'||k==='ArrowDown'||k==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();open(s);}},true);
// 设置面板滚动时列表跟随下拉框；下拉框被滚出可见区域才收起
var follow=0;function visible(s){var r=s.getBoundingClientRect();if(!r.width&&!r.height)return false;for(var p=s.parentElement;p&&p!==document.body;p=p.parentElement){var cs=getComputedStyle(p);if(/(auto|scroll|hidden|clip)/.test(cs.overflowY+cs.overflowX)){var b=p.getBoundingClientRect();if(r.bottom<b.top||r.top>b.bottom)return false;}}return r.bottom>0&&r.top<window.innerHeight;}
function onScroll(e){if(!menu||(e.target&&e.target.nodeType===1&&menu.contains(e.target))||follow)return;follow=requestAnimationFrame(function(){follow=0;if(!menu||!cur)return;if(!cur.isConnected||!visible(cur))close(false);else place(cur);});}
document.addEventListener('scroll',onScroll,true);window.addEventListener('resize',function(){close(false);});window.addEventListener('blur',function(){close(false);});
document.addEventListener('focusin',function(e){if(menu&&e.target!==cur&&!menu.contains(e.target))close(false);});
})();
