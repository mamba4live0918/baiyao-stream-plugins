/* 菜单中的本地收件回放，不建立端口连接，不保存原始消息。 */
import { MESSAGE_TEST_PRESETS } from '../live-message-test.js';

const LABELS={order:'点单',fire:'放火',thief:'小偷',blackout:'停电',cat:'野猫',tour:'旅行团',boom:'爆锅糊脸',spice:'乱加料',helper:'帮手',guard:'保安'};
function el(tag,props={},...children){
 const n=document.createElement(tag);
 for(const[key,value]of Object.entries(props)){
  if(key==='text')n.textContent=value;
  else if(key.startsWith('on'))n[key]=value;
  else if(['open','selected'].includes(key))n[key]=value;
  else n.setAttribute(key,value);
 }
 n.append(...children.flat(Infinity).filter(v=>v!==null&&v!==undefined));return n;
}
const note=text=>el('p',{class:'ct-note',text});
const shown=value=>value===undefined||value===null||value===''?'未提供':String(value).slice(0,500);

export function createMessageTestPanel(live,getSettings){
 let source=MESSAGE_TEST_PRESETS[0].id;
 const panel=el('details',{class:'ct-message-test'}),result=el('div',{class:'ct-message-result',role:'status','aria-live':'polite'});
 const input=el('textarea',{rows:7,maxlength:65536,spellcheck:'false','aria-label':'模拟收到的消息 JSON',oninput:()=>{result.replaceChildren(note('消息已修改，请重新解析。'));}});
 const description=note('');
 const selected=()=>MESSAGE_TEST_PRESETS.find(p=>p.id===source)||MESSAGE_TEST_PRESETS[0];
 const example=()=>{
  const preset=selected();let raw=JSON.parse(preset.json);
  if(raw.type==='gift'){
   const rules=getSettings().rules||{},first=rules.order?.[0]||rules.mess?.[0]||rules.help?.[0];
   if(first?.name)raw.giftName=first.name;
  }
  input.value=JSON.stringify(raw,null,2);description.textContent=preset.description;
  result.replaceChildren(note('示例已填入。先点“只解析”查看识别结果。'));
 };
 const choice=el('select',{'aria-label':'模拟消息来源',onchange:e=>{source=e.target.value;description.textContent=selected().description;result.replaceChildren(note('来源已更换；可保留输入，或点“填入示例”。'));}},MESSAGE_TEST_PRESETS.map(p=>el('option',{value:p.id,selected:p.id===source,text:p.label})));
 const run=play=>{
  const r=live.testMessage(input.value,{play});
  const state={matched:'解析成功 · 已匹配规则',unmatched:'解析成功 · 未匹配规则',ignored:'已忽略这条消息',error:'解析失败'};
  const fields=[];
  const row=(label,value)=>fields.push(el('dt',{text:label}),el('dd',{text:shown(value)}));
  if(r.event){
   const event=r.event;row('消息类型',event.kind==='gift'?'礼物':'弹幕');row('观众',event.nick);row('观众 uid',event.uid);row('事件 id',event.id);
   if(event.gift){row('礼物名',event.gift.name);row('礼物份数',event.gift.count);}
   else row('点单判定',r.matches?.length?'命中点单口令':'未生成点单互动');
  }
  if(r.matches?.length)row('规则结果',r.matches.map(m=>(LABELS[m.kind]||m.kind)+' × '+m.count).join('；'));
  const final=play?(r.played?'本地试玩已触发，真实收件计数不变。':'没有触发本地试玩。'):'本次只解析，未触发游戏效果。';
  result.replaceChildren(...[el('strong',{text:state[r.status]||'解析结果'}),el('p',{text:r.reason||''}),fields.length?el('dl',{},fields):null,note(final)].filter(Boolean));
 };
 panel.append(el('summary',{text:'测试礼物消息（菘蓝 / 白曜）'}),
  note('本地模拟收到消息，不连接或发送到真实端口，也不能证明端口已连通。真实收件仍看上方状态；白曜请在 OBS 来源的“交互”窗口检查。'),
  el('div',{class:'ct-row'},choice,el('button',{type:'button',text:'填入示例',onclick:example})),description,
  note('也可以粘贴端口实际发来的 JSON。示例优先使用点单礼物表第一条；礼物表都空时，能解析但不会触发。'),input,
  el('div',{class:'ct-row'},el('button',{type:'button',class:'ct-main',text:'只解析',onclick:()=>run(false)}),el('button',{type:'button',text:'解析并试玩',onclick:()=>run(true)})),
  note('“解析并试玩”会按当前礼物表触发本地捣乱、帮忙或点单；不会计作真实礼物。'),result);
 example();return panel;
}
