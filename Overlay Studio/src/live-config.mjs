const MAX_HTML=20*1024*1024;
function attributes(source){
 const result=Object.create(null);
 const pattern=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
 for(const match of source.matchAll(pattern))result[match[1].toLowerCase()]=match[2]??match[3]??match[4]??'';
 return result;
}
function* activeElements(html){
 const lower=html.toLowerCase(),raw=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript']);
 let offset=0,templates=0;
 const tagEnd=start=>{let quote='';for(let i=start;i<html.length;i++){const c=html[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')return i;}return -1;};
 while(offset<html.length){
  const start=html.indexOf('<',offset);if(start<0)return;
  if(lower.startsWith('<!--',start)){const end=html.indexOf('-->',start+4);if(end<0)return;offset=end+3;continue;}
  const nameMatch=/^<\/?([a-z][a-z0-9:-]*)\b/i.exec(html.slice(start,start+150));
  if(!nameMatch){offset=start+1;continue;}
  const name=nameMatch[1].toLowerCase(),closing=html[start+1]==='/';
  const end=tagEnd(start+nameMatch[0].length);if(end<0)return;
  const attrs=attributes(html.slice(start+nameMatch[0].length,end));offset=end+1;
  if(name==='template'){templates=Math.max(0,templates+(closing?-1:1));continue;}
  if(closing)continue;
  if(name==='plaintext')return;
  if(raw.has(name)){
   let close=lower.indexOf('</'+name,offset);
   while(close>=0&&!/[\s/>]/.test(lower[close+name.length+2]||''))close=lower.indexOf('</'+name,close+2);
   if(close<0){if(!templates&&name==='script'&&attrs.id==='overlay-studio-config')throw new Error('可视化参数 script 标签未闭合。');return;}
   const closeEnd=tagEnd(close+name.length+2);if(closeEnd<0)return;
   if(!templates)yield {name,attrs,start:offset,end:close,text:html.slice(offset,close)};
   offset=closeEnd+1;
  }else if(!templates)yield {name,attrs};
 }
}
function locate(html){
 if(typeof html!=='string'||html.length>MAX_HTML)throw new Error('源码须为不超过 20 MiB 的 HTML。');
 const found=[];
 for(const element of activeElements(html)){
  if(element.name!=='script')continue;
  const {attrs}=element;
  if(attrs.id==='overlay-studio-config'){
   if(attrs.type?.toLowerCase()!=='application/json')throw new Error('可视化参数必须声明为 application/json。');
   if(element.text.length>64000)throw new Error('可视化参数配置过大。');
   found.push({start:element.start,end:element.end,text:element.text});
  }
 }
 if(found.length>1)throw new Error('作品包含多份同名参数配置，无法确定应修改哪一份。');
 return found[0]||null;
}
function validateField(raw,keys){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('参数字段格式不正确。');
 const {key,label,type,value}=raw;
 if(typeof key!=='string'||!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)||['constructor','prototype','__proto__'].includes(key)||keys.has(key))throw new Error('参数名称无效或重复。');
 keys.add(key);
 if(typeof label!=='string'||!label.trim()||label.length>80)throw new Error('参数标签须为 1–80 个字符。');
 const out={key,label,type,value};
 if(type==='number'){
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e6)throw new Error('数值参数无效。');
  const min=raw.min??Math.min(0,value),max=raw.max??Math.max(100,value),step=raw.step??1;
  if(![min,max,step].every(v=>typeof v==='number'&&Number.isFinite(v))||min>=max||min< -1e6||max>1e6||step<=0||step>1e6||value<min||value>max)throw new Error('数值参数范围无效或值超出范围。');
  Object.assign(out,{min,max,step});
 }else if(type==='color'){
  if(typeof value!=='string'||!/^#[a-f0-9]{6}$/i.test(value))throw new Error('颜色参数须为 #RRGGBB 格式。');
 }else if(type==='boolean'){
  if(typeof value!=='boolean')throw new Error('开关参数须为 true 或 false。');
 }else if(type==='text'){
  if(typeof value!=='string'||value.length>200||value.includes('\0'))throw new Error('文本参数最多 200 个字符。');
 }else throw new Error('不支持的参数类型。');
 return out;
}
function readConfig(html){
 const block=locate(html);if(!block)return {fields:[],block:null};
 let json;try{json=JSON.parse(block.text);}catch{throw new Error('可视化参数 JSON 无法解析。');}
 if(!json||json.version!==1||!Array.isArray(json.fields)||json.fields.length>24)throw new Error('参数配置须使用版本 1，最多 24 个字段。');
 const keys=new Set();return {block,fields:json.fields.map(field=>validateField(field,keys))};
}
export function parseLiveConfig(html){try{return {fields:readConfig(html).fields};}catch(error){return {fields:[],error:error.message};}}
export function updateLiveConfig(html,key,value){
 const {fields,block}=readConfig(html);if(!block)throw new Error('该作品没有可视化参数配置。');
 if(!fields.some(field=>field.key===key))throw new Error('找不到指定参数。');
 const next=fields.map(field=>field.key===key?validateField({...field,value},new Set()):field);
 const json=JSON.stringify({version:1,fields:next},null,2).replace(/</g,'\\u003c');
 return html.slice(0,block.start)+'\n'+json+'\n'+html.slice(block.end);
}
export function auditSource(html){
 const findings=[];
 if(typeof html!=='string'||!/<html\b/i.test(html)||!/<\/html\s*>/i.test(html)){findings.push({severity:'error',title:'HTML 文档不完整',detail:'源码需要完整的 html 开始与结束标签，保存后才能作为独立插件使用。'});return findings;}
 let elements;try{elements=[...activeElements(html)];}catch{elements=[];}
 const meta=elements.filter(e=>e.name==='meta').map(e=>e.attrs);
 if(!meta.some(a=>a.name?.toLowerCase()==='viewport'))findings.push({severity:'warning',title:'缺少视口设置',detail:'建议添加 viewport meta，并在目标直播尺寸下检查布局。'});
 let external=0;
 for(const element of elements.filter(e=>['script','link','img','audio','video','source','iframe'].includes(e.name))){
  const attr=element.attrs;const url=element.name==='link'?attr.href:attr.src;
  if(url&&/^(?:https?:)?\/\//i.test(url))external++;
 }
 if(external)findings.push({severity:'warning',title:'发现外部资源引用',detail:`源码声明了 ${external} 处外部资源。隔离预览会阻止联网；离线交付需将资源内嵌。`});
 const config=parseLiveConfig(html);
 if(config.error)findings.push({severity:'error',title:'可视化参数配置有误',detail:config.error});
 else if(!config.fields.length)findings.push({severity:'info',title:'未提供可视化参数',detail:'可以编辑源码，或让模型添加可视化参数后再使用滑块和颜色选择。'});
 return findings;
}
