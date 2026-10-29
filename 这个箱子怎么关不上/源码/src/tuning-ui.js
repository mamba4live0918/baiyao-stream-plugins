import {KIND_NAMES} from './layout.js';
const globals=[['C','箱内可容纳高度',130,320,1],['g_zip','拉链可通过缝宽',2,24,1],['S','拉链强度',20,200,1],['pressRise','按压力度上升时间',.05,1,.01],['helperWeight','帮手重量',.1,2,.05],['autoThreshold','自动拉完起点',.7,1,.01],['L','箱子长度',500,950,10]];
const local=[['min','最多压到',.1,1,.01],['rebound','回弹时间',.1,3,.05],['damping','阻尼',.3,1.5,.05],['bulge','鼓起上限',1,1.8,.01]];
export function buildTuningUI(root,api){
  function row(def,path){const [key,label,min,max,step]=def,wrap=document.createElement('label');wrap.className='range-row';const text=document.createElement('span');text.textContent=label;const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.dataset.path=path;const output=document.createElement('output');wrap.append(text,input,output);
    input.oninput=()=>{const value=Number(input.value);output.value=String(value);if(path.includes('.')){const [,kind]=path.split('.');api.set({kinds:{[kind]:{[key]:value}}});}else api.set({[key]:value});};return wrap;}
  root.replaceChildren();for(const d of globals)root.append(row(d,d[0]));
  for(const kind of Object.keys(KIND_NAMES)){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=KIND_NAMES[kind];details.append(summary);for(const d of local)details.append(row(d,'kinds.'+kind+'.'+d[0]));root.append(details);}
  const actions=document.createElement('div');actions.className='actions';const reset=document.createElement('button');reset.textContent='恢复默认';reset.onclick=()=>{api.reset();refresh();};const copy=document.createElement('button');copy.textContent='复制当前数值';copy.onclick=async()=>{const value=JSON.stringify(api.get(),null,2);try{await navigator.clipboard.writeText(value);copy.textContent='已复制';}catch{const t=document.createElement('textarea');t.value=value;root.append(t);t.select();document.execCommand('copy');t.remove();copy.textContent='已复制';}};actions.append(reset,copy);root.append(actions);
  function refresh(){const t=api.get();root.querySelectorAll('input').forEach(el=>{let v=t;for(const k of el.dataset.path.split('.'))v=v?.[k];if(v==null)return;el.value=v;el.nextElementSibling.value=v;});}
  refresh();return {refresh};
}
