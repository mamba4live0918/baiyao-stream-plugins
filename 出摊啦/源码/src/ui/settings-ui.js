/* 出摊啦 · 一页设置。连接测试只检查hash，不改变外部时间。 */
import { defaultSettings, normalizeGiftName, fillExampleGifts } from '../settings.js';
import { ZONE_PRESETS, presetPts, defaultZone } from '../zone.js';
import { createDoubleConfirmation } from './confirm.js';
import { createMessageTestPanel } from './message-test.js';

const SHOPS = [['noodle','🍜 面馆'],['pancake','🫓 煎饼摊'],['tea','🧋 奶茶店'],['sushi','🍣 日料店']];
const QUANTITIES = {noodle:['面馆','两'],pancake:['煎饼','个蛋'],tea:['奶茶','勺珍珠'],sushi:['日料','片']};
const MESS = [['fire','🔥','放火'],['thief','🥷','小偷'],['blackout','💡','停电'],['cat','🐱','野猫'],['tour','🚌','旅行团'],['boom','💥','爆锅糊脸'],['spice','🌶','乱加料']];
const clone = x => JSON.parse(JSON.stringify(x));

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key,value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node[key] = value;
    else if (['checked','disabled','selected','open','hidden'].includes(key)) node[key] = value;
    else node.setAttribute(key,value);
  }
  node.append(...children.flat(Infinity).filter(v => v !== undefined && v !== null && v !== false));
  return node;
}
const choose = (value, options, onChange, label, name) => el('select', { 'aria-label':label, ...(name ? {name} : {}), onchange:e=>onChange(e.target.value) }, options.map(([v,t])=>el('option',{value:v,selected:v===value,text:t})));
const note = text => el('p',{class:'ct-note',text});
const section = (title,...content) => el('section',{class:'ct-sec'},el('h3',{text:title}),...content);

const CSS = `
#ct-settings{position:fixed;right:20px;top:20px;bottom:20px;width:min(680px,calc(100vw - 40px));overflow:auto;z-index:1000;box-sizing:border-box;padding:24px;color:#44362d;background:#fff9ec;border:3px solid #48372d;border-radius:20px;box-shadow:5px 7px 0 rgba(58,41,29,.22);font:14px/1.5 'Microsoft YaHei',system-ui,sans-serif;text-align:left}
#ct-settings[hidden]{display:none!important}#ct-settings *{box-sizing:border-box}#ct-settings h2{margin:0;padding-right:30px;font-size:25px;letter-spacing:1px}#ct-settings h3{margin:0 0 12px;font-size:17px}#ct-settings h4{margin:18px 0 8px;font-size:14px}#ct-settings .ct-lead{margin:4px 0 18px;color:#8c7868}#ct-settings .ct-close{position:absolute;right:18px;top:18px;width:32px;height:32px;padding:0;font-size:23px;line-height:1}
#ct-settings .ct-sec{padding:18px 0;border-top:1px dashed #d8c8af}#ct-settings .ct-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}#ct-settings .ct-note{font-size:12px;color:#8b7765;margin:9px 0 0;line-height:1.6}#ct-settings .ct-later{background:#f3ead7;padding:9px 12px;border-radius:9px;color:#8b7765;font-size:12px;margin:10px 0 0}
#ct-settings button,#ct-settings input,#ct-settings select,#ct-settings textarea{font:inherit;color:inherit}#ct-settings button{border:1.5px solid #826750;border-radius:8px;background:#fffaf0;padding:7px 11px;cursor:pointer;white-space:nowrap}#ct-settings button:hover{background:#ffedbd}#ct-settings button:focus-visible,#ct-settings input:focus-visible,#ct-settings select:focus-visible,#ct-settings textarea:focus-visible{outline:3px solid #dc8536;outline-offset:2px}#ct-settings button:disabled{cursor:default;opacity:.5}#ct-settings .ct-main{background:#f9ba5a;border:2px solid #674c33;font-weight:bold}#ct-settings .ct-add{margin-top:10px;color:#99652d;border-style:dashed}
#ct-settings input:not([type=checkbox]):not([type=range]),#ct-settings select,#ct-settings textarea{border:1px solid #c9b69b;border-radius:7px;background:#fffef8;padding:7px 8px;min-width:0;max-width:100%}#ct-settings textarea{width:100%;resize:vertical;line-height:1.6}#ct-settings input[type=number]{width:82px}#ct-settings input[type=checkbox]{width:17px;height:17px;accent-color:#c78234;flex-shrink:0}#ct-settings input[type=range]{width:160px;accent-color:#c78234}
#ct-settings .ct-field{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0}#ct-settings .ct-field>span:first-child{min-width:110px}#ct-settings .ct-field em{font-style:normal;color:#927c66;font-size:12px}#ct-settings .ct-switch{display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:10px 0}#ct-settings .ct-switch input{margin-top:3px}#ct-settings .ct-switch b{display:block;font-size:14px}#ct-settings .ct-switch em{display:block;font-size:12px;color:#927c66;font-style:normal;margin-top:3px}
#ct-settings .ct-pool{display:flex;flex-wrap:wrap;gap:8px}#ct-settings .ct-chip{display:flex;align-items:center;gap:5px;border:1px solid #d3bea1;border-radius:9px;padding:7px 9px;background:#fffef8;cursor:pointer}#ct-settings .ct-chip.on{background:#fff0c9;border-color:#bb8b4f}#ct-settings .ct-chip input{width:14px;height:14px;margin:0}
#ct-settings .ct-shops{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#ct-settings .ct-shop{min-height:64px;padding:13px 9px;font-size:18px;font-weight:bold;border:2px solid #c4ad8e;background:#fffef8;white-space:normal}#ct-settings .ct-shop[aria-pressed="true"]{background:#ffdf9b;border-color:#80572f;box-shadow:0 3px 0 #80572f}#ct-settings .ct-shop:hover{background:#ffedbd}
#ct-settings .ct-gift{display:grid;grid-template-columns:minmax(105px,1fr) minmax(160px,1.2fr) 40px 36px;gap:7px;align-items:center;margin-top:8px}#ct-settings .ct-gift-help{grid-template-columns:minmax(100px,1fr) 78px minmax(155px,1.2fr) 40px 36px}#ct-settings .ct-gift-head{font-size:11px;color:#967e62}#ct-settings .ct-range{display:flex;align-items:center;gap:4px;font-size:12px;min-width:0}#ct-settings .ct-range input[type=number]{width:59px;padding:7px 4px}#ct-settings .ct-range i{font-style:normal}#ct-settings .ct-try,#ct-settings .ct-del{padding:7px 0}#ct-settings .ct-try{color:#729150}#ct-settings .ct-del{color:#b88272}#ct-settings .ct-empty{padding:13px;background:#f5ecdd;border-radius:8px;font-size:12px;color:#97816a}
#ct-settings .ct-ot-face{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:8px 0;padding:10px 13px;border:2px solid #48372d;border-radius:12px;background:#fff4d9}#ct-settings .ct-ot-face b{font-size:26px;font-variant-numeric:tabular-nums}#ct-settings .ct-ot-face small{color:#8b7765}
#ct-settings .ct-ot-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}#ct-settings .ct-ot-row input[type=text]{width:120px}#ct-settings .ct-ot-row input[type=number]{width:66px}#ct-settings .ct-ot-inline{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}#ct-settings .ct-ot-inline input{width:84px}
#ct-settings .ct-advanced{border-top:1px dashed #d8c8af;padding-top:16px}#ct-settings summary{cursor:pointer;font-weight:bold}#ct-settings .ct-tools{padding-top:16px;margin-top:12px;border-top:1px dashed #d8c8af}
#ct-settings .ct-lab-warning{color:#a52f2f;background:#ffeded;border:2px solid #b94c45;border-radius:8px;padding:10px 12px;font-weight:bold}#ct-settings .ct-lab-status{overflow-wrap:anywhere}
#ct-settings .ct-message-test{margin:14px 0 0;padding:12px;border:1px solid #c9b69b;border-radius:10px;background:#fffdf5}#ct-settings .ct-message-test summary{font-size:14px}#ct-settings .ct-message-test .ct-row{margin:10px 0}#ct-settings .ct-message-test textarea{font:12px/1.5 Consolas,'Microsoft YaHei',monospace;overflow-wrap:anywhere}#ct-settings .ct-message-test select{max-width:100%;flex:1;min-width:130px}#ct-settings .ct-message-result{padding:12px;border:1px solid #d9cbb5;border-radius:8px;background:#fff9e8;overflow-wrap:anywhere}#ct-settings .ct-message-result>p{margin:8px 0}#ct-settings .ct-message-result dl{display:grid;grid-template-columns:90px minmax(0,1fr);gap:5px 10px;margin:10px 0}#ct-settings .ct-message-result dt{color:#8b7765}#ct-settings .ct-message-result dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:600px){#ct-settings{right:8px;top:8px;bottom:8px;width:calc(100vw - 16px);padding:18px 13px;border-radius:15px}#ct-settings h2{font-size:22px}#ct-settings .ct-gift,#ct-settings .ct-gift-help{grid-template-columns:minmax(80px,1fr) minmax(120px,1.4fr) 32px 30px;gap:5px}#ct-settings .ct-gift-help>select{grid-column:1;grid-row:auto}#ct-settings .ct-gift-help>input{grid-column:1/-1}#ct-settings .ct-gift-help .ct-range{grid-column:2}#ct-settings .ct-gift-help.ct-gift-head{display:none}#ct-settings .ct-range input[type=number]{width:48px}#ct-settings .ct-range{font-size:11px;gap:3px}#ct-settings .ct-chip{padding:6px;font-size:12px}}
`;

export class SettingsUI {
  constructor(app) {
    this.app = app;
    this.advOpen = false;
    this.focusNewGift = null;
    this.confirmations = new Set();
    this.root = el('section',{id:'ct-settings',class:'ct-settings',hidden:true,role:'dialog','aria-label':'出摊啦设置','aria-modal':'false'});
    this.style = el('style',{text:CSS});
    document.head.append(this.style);
    document.body.append(this.root);
    addEventListener('keydown',e=>{
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
    document.addEventListener('pointerdown',e=>{
      if (this.isOpen && !this.root.contains(e.target) && !e.target.closest('#settings-button,#ct-gear,#ct-settings-button,#ct-zone,[data-settings-toggle]')) this.close();
    });
  }
  get isOpen(){return !this.root.hidden;}
  open(){this.root.hidden=false;this.render();}
  close(){for(const confirmation of this.confirmations)confirmation.reset();this.root.hidden=true;}
  toggle(){this.isOpen?this.close():this.open();}
  edit(mutate,rerender=true){
    const draft=clone(this.app.settings);
    this.app.applySettings(mutate(draft) || draft);
    if(rerender)this.render();
  }
  field(label,control,hint){return el('label',{class:'ct-field'},el('span',{text:label}),control,hint?el('em',{text:hint}):null);}
  switchRow(label,value,apply,hint,rerender=false){return el('label',{class:'ct-switch'},el('input',{type:'checkbox',checked:value,onchange:e=>this.edit(x=>apply(x,e.target.checked),rerender)}),el('span',{},el('b',{text:label}),hint?el('em',{text:hint}):null));}
  number(label,value,min,step,apply,unit='',max){
    const input=el('input',{type:'number',value,min,step,...(Number.isFinite(max)?{max}:{}),'aria-label':label,onchange:e=>{
      const v=Number(e.target.value);
      if(e.target.value.trim()==='' || !Number.isFinite(v) || v<min){e.target.value=value;return;}
      this.edit(s=>apply(s,v));
    }});
    return this.field(label,input,unit);
  }
  confirmButton(label,confirmationLabel,action){
    const button=el('button',{type:'button',text:label});
    const confirmation=createDoubleConfirmation({onConfirm:action,onChange:armed=>{button.textContent=armed?confirmationLabel:label;}});
    this.confirmations.add(confirmation);button.onclick=()=>confirmation.click();return button;
  }
  quantityRange(){
    const shop=this.app.settings.shop,[name,unit]=QUANTITIES[shop],pair=this.app.settings.cooking.quantities[shop];
    const set=(index,event)=>{
      const value=Number(event.target.value);
      if(event.target.value.trim()===''||!Number.isFinite(value)||value<1){this.render();return;}
      this.edit(s=>{
        const range=s.cooking.quantities[shop];
        range[index]=Math.floor(value);
        if(index===0&&range[1]<range[0])range[1]=range[0];
        if(index===1&&range[0]>range[1])range[0]=range[1];
      });
    };
    return el('div',{class:'ct-field'},el('span',{text:'顾客要几份'}),
      el('span',{class:'ct-range',role:'group','aria-label':name+'每单数量'},
        el('input',{type:'number',min:1,step:1,value:pair[0],'aria-label':name+'每单最少',onchange:e=>set(0,e)}),
        el('i',{text:'～'}),
        el('input',{type:'number',min:1,step:1,value:pair[1],'aria-label':name+'每单最多',onchange:e=>set(1,e)}),
        el('span',{text:unit})));
  }
  render(){
    for(const confirmation of this.confirmations)confirmation.dispose();this.confirmations.clear();
    const scroll=this.root.scrollTop;
    this.root.replaceChildren(
      el('button',{type:'button',class:'ct-close','aria-label':'关闭设置',text:'×',onclick:()=>this.close()}),
      el('h2',{text:'出摊啦 V1.6 · 设置'}),el('p',{class:'ct-lead',text:'改了马上保存，下次打开还在。'}),
      this.shopSection(),this.orderSection(),this.rentSection(),this.poolSection(),this.giftSection('mess'),this.giftSection('help'),this.faceSection(),this.soundSection(),this.advancedSection(),
      el('div',{class:'ct-row ct-tools'},el('button',{text:'恢复默认设置',onclick:()=>{this.app.applySettings(defaultSettings());this.render();this.app.notify('已恢复默认设置');}}))
    );
    this.root.scrollTop=scroll;
    if(this.focusNewGift){
      const inputs=this.root.querySelectorAll(`[data-gift-list="${this.focusNewGift}"] input[data-gift-name]`);
      this.focusNewGift=null;
      const input=inputs[inputs.length-1];input?.focus();input?.select();
    }
  }
  shopSection(){
    const shop=this.app.settings.shop,heat=this.app.settings.cooking.heat[shop];
    return section('① 今天开哪家店',
      el('div',{class:'ct-shops',role:'group','aria-label':'店铺'},SHOPS.map(([id,name])=>el('button',{
        type:'button',class:'ct-shop',name:'shop',value:id,'data-shop':id,'aria-pressed':id===this.app.settings.shop,text:name,
        onclick:()=>{this.edit(s=>{s.shop=id;});this.root.querySelector(`[data-shop="${id}"]`)?.focus({preventScroll:true});}
      }))),
      this.quantityRange(),note('最少和最多填成一样就是固定数量；修改范围从下一位顾客生效，换店时为现有顾客重抽。'),
      heat?[
        el('h4',{text:'火候 · '+QUANTITIES[shop][0]}),
        this.number('煮多久',heat.cookSeconds,.1,.1,(s,v)=>{s.cooking.heat[shop].cookSeconds=v;},'秒'+(shop==='pancake'?'，从最后一个蛋起计时':'')),
        this.number('熟了能放多久',heat.readySeconds,.1,.1,(s,v)=>{s.cooking.heat[shop].readySeconds=v;},'秒'),
        this.number('冒烟多久着火',heat.smokeSeconds,.1,.1,(s,v)=>{s.cooking.heat[shop].smokeSeconds=v;},'秒')
      ]:null,
      note('四家店都可营业；选择店铺后，按柜台工具完成四步，再把成品拖给顾客。'),
      el('p',{id:'ct-live-status',class:'ct-note',role:'status',text:this.app.live.status()}),
      this.switchRow('接收直播间互动',this.app.settings.live.receive,(s,v)=>{s.live.receive=v;},'宿主网址使用SDK；普通本地页会尝试菘蓝/白曜默认礼物端口。关闭时仍可使用试玩按钮。'),
      note('收到礼物但未触发时，检查②点单礼物、⑤⑥捣乱/帮忙礼物表和④捣乱池；表外礼物不会触发。重新导入新版HTML后，使用宿主新给的网址。'),
      !this.app.settings.rules.mess.length&&!this.app.settings.rules.help.length?[
        note(this.app.settings.rules.order?.length?'捣乱和帮忙礼物表还是空的，这些礼物不会触发。可先填入示例，再按自己的礼物修改。':'礼物表还是空的，收到礼物也不会触发。可先填入示例，再按自己的礼物修改。'),
        el('button',{type:'button',text:'一键填入示例礼物',onclick:()=>this.edit(s=>{s.rules=fillExampleGifts(s.rules);})}),
        note('示例只填空着的表：小心心来1位顾客、人气票捣乱1次、玫瑰派1名帮手；名字已经用过就换一个。')
      ]:null,
      this.messageTester||(this.messageTester=createMessageTestPanel(this.app.live,()=>this.app.settings)));
  }
  refreshLive(){const node=this.root.querySelector('#ct-live-status');if(node){const text=this.app.live.status();if(node.textContent!==text)node.textContent=text;}}
  orderSection(){
    const s=this.app.settings,a=s.order.abandon;
    const keywords=el('textarea',{rows:2,'aria-label':'点单口令',placeholder:'用空格、逗号或换行隔开',onchange:e=>this.edit(x=>{x.order.keywords=e.target.value.split(/[\s,，、；;]+/).filter(Boolean);})});
    keywords.value=s.order.keywords.join('、');
    return section('② 点单',
      el('h4',{text:'送礼物点单'}),
      note('送表里的礼物就来顾客：一个礼物来 N～M 位，送几个按几份算，不受下面「每人同时几单」限制。'),
      this.giftList('order'),
      note('在白曜规则里已经把礼物连到出摊啦「点单」动作的，这里别再填同一个礼物，不然一份礼物来两位顾客。'),
      el('h4',{text:'弹幕点单'}),
      this.switchRow('弹幕点单',s.order.enabled,(x,v)=>{x.order.enabled=v;}),
      this.field('点单口令',keywords),
      this.number('每人同时几单',s.order.perPerson,0,1,(x,v)=>{x.order.perPerson=v;},'0 = 不限'),
      note('只限制弹幕点单：这位观众店里已有顾客（含送礼物来的）时，再发口令会催单。弹幕原文不上屏。'),
      this.switchRow('顾客等急了会走',a.enabled,(x,v)=>{x.order.abandon.enabled=v;},'默认关闭；打开后，生气的顾客等久了会离开，门外顾客也算。',true),
      a.enabled?[
        this.number('生气后再等',a.angryWaitSeconds,.1,.1,(x,v)=>{x.order.abandon.angryWaitSeconds=v;},'秒，每位顾客略有不同'),
        this.field('走一个',choose(a.penalty,[['coins','扣钱'],['rent','涨租']],v=>this.edit(x=>{x.order.abandon.penalty=v;}),'跑单惩罚')),
        this.number('跑单金额',a.amount,0,1,(x,v)=>{x.order.abandon.amount=v;},a.penalty==='rent'?'铜板 / 位，累计到下次交租':'铜板 / 位'),
        note('离开的顾客计入跑单；涨租只加到下一次交租，交完即清零。')
      ]:null);
  }
  rentSection(){
    const r=this.app.settings.rent;
    return section('③ 交租和加班',
      this.switchRow('交租',r.enabled,(s,v)=>{s.rent.enabled=v;}),
      this.number('每隔多久交租',r.minutes,0.1,0.1,(s,v)=>{s.rent.minutes=v;},'分钟'),
      this.number('每次交租',r.coins,0,1,(s,v)=>{s.rent.coins=v;},'铜板'),
      this.number('每差多少铜板',r.perCoins,0.1,0.1,(s,v)=>{s.rent.perCoins=v;},'铜板'),
      this.number('对应加班多久',r.addMinutes,0.1,0.1,(s,v)=>{s.rent.addMinutes=v;},'分钟'),
      this.confirmButton('开新的一场','确定开新的一场？',()=>this.app.newSession()),
      note('交租交不上的差额加班，记到下面的「加班机」：插件自带的（交租牌下面显示「距离下播」），或者白曜重工的加班机。'),
      note('首客开始；空店满一个交租周期自动打烊。打烊或离线满1小时结束本场，进度清零，铜板保留；还没送到白曜的加班也一起清掉。电脑睡眠不补收租。'),
      note('开新场会清理旧顾客、厨房和本场记录，需3秒内点两下确认；改交租间隔从下一周期生效。'),
      this.overtimeBlock(),
      el('h4',{text:'牌子位置和大小'}),
      note('交租牌、「门外还有 N 人」、通缉令，还有试玩页的统计牌，都能在画面上按住拖动换位置，鼠标移上去拖右下角的小圆点改大小，会自动记住。'),
      el('div',{class:'ct-row'},el('button',{type:'button',text:'所有牌子恢复默认位置和大小',onclick:()=>{this.app.resetPanel();this.render();}})));
  }
  /* V1.6 加班机：加班记到哪（自动 / 插件自带 / 白曜）；自带的在这里配（预设时长、开始暂停重置、手动加减、礼物加减时间）；
   * 白曜的：在白曜里不用设，不在白曜里填连接码。测试连接不改时间。 */
  overtimeBlock(){
    const o=this.app.overtime,route=o.route();
    const parts=[el('h4',{text:'加班机'}),
      this.field('加班记到',choose(o.target(),[['auto','自动（推荐）'],['local','插件自带的加班机'],['baiyao','白曜加班机']],v=>{o.setTarget(v);this.otDraft=null;this.render();},'加班记到')),
      el('p',{id:'ct-overtime-route',class:'ct-note',text:this.routeText()})];
    if(route==='local')parts.push(...this.localOvertimeBlock(o.local));
    parts.push(...this.baiyaoBlock(o,route));
    return parts;
  }
  routeText(){
    const o=this.app.overtime,route=o.route(),target=o.target();
    if(route==='local')return target==='auto'?'现在记到：插件自带的加班机（没在白曜里、也没填连接码，所以自动用这个）。':'现在记到：插件自带的加班机。';
    return o.snapshot().mode==='baiyao'?'现在记到：白曜加班机（在白曜里自动接上）。礼物加减时间在白曜「加班机 → 加班设置」里配。':'现在记到：白曜加班机。在下面填连接码再点「连接」；礼物加减时间在白曜里配。';
  }
  localOvertimeBlock(local){
    const L=globalThis.LocalOvertime,s=local.snapshot(),msg=el('p',{class:'ct-note',role:'status'});
    const face=el('div',{class:'ct-ot-face'},el('small',{id:'ct-ot-label',text:'距离下播'}),el('b',{id:'ct-ot-time',text:s.clockText}),el('small',{id:'ct-ot-net',text:s.netText}));
    const start=el('button',{type:'button',id:'ct-ot-start',text:s.running?'暂停':s.fresh?'开始':'继续',onclick:()=>{if(local.snapshot().running)local.pause();else local.start();this.refreshOvertimeClock();}});
    const preset=el('input',{type:'number',min:'1',max:'99999',step:'1',value:String(s.presetMinutes),'aria-label':'预设时长（分钟）',onchange:e=>{if(!local.setPreset(e.target.value)){msg.textContent='预设时长请填 1～99999 的整数分钟。';e.target.value=String(local.snapshot().presetMinutes);}this.refreshOvertimeClock();}});
    const manual=el('input',{type:'number',min:'1',max:'99999',step:'1',value:'10','aria-label':'手动加减（分钟）'});
    const shiftBy=sign=>{const n=Number(manual.value);if(!Number.isInteger(n)||n<1||n>99999){msg.textContent='手动加减请填 1～99999 的整数分钟。';return;}local.shift(sign*n*60,'手动');};
    if(!this.otDraft)this.otDraft=s.gifts.map(g=>({...g}));
    const rows=el('div',{id:'ct-ot-gifts'});
    const save=()=>{const named=this.otDraft.filter(r=>String(r.name||'').trim());const res=local.setGifts(named.map(r=>({name:r.name,mode:r.mode,min:Number(r.min),max:Number(r.max)})));msg.textContent=res.ok?(named.length<this.otDraft.length?'没填礼物名的行不会生效。':'已保存，马上生效。'):res.error;};
    const draw=()=>rows.replaceChildren(...(this.otDraft.length?this.otDraft.map((r,i)=>{
      const sync=()=>{this.otDraft[i]={name:name.value,mode:mode.value,min:min.value,max:max.value};save();};
      const name=el('input',{type:'text',maxlength:'20',placeholder:'礼物名',value:r.name,'aria-label':`第 ${i+1} 行礼物名`,onchange:()=>sync()});
      const mode=choose(r.mode,[['add','加时'],['sub','减时']],()=>sync(),`第 ${i+1} 行加时还是减时`);
      const min=el('input',{type:'number',min:'0',max:'99999',step:'1',value:String(r.min),'aria-label':`第 ${i+1} 行最少分钟`,onchange:()=>sync()});
      const max=el('input',{type:'number',min:'0',max:'99999',step:'1',value:String(r.max),'aria-label':`第 ${i+1} 行最多分钟`,onchange:()=>sync()});
      return el('div',{class:'ct-ot-row'},name,mode,min,el('span',{text:'～'}),max,el('span',{text:'分钟'}),
        el('button',{type:'button',text:'▶',title:'试一下：真的加减一次','aria-label':`试一下第 ${i+1} 行`,onclick:()=>{sync();const t=local.applyGift({name:name.value,count:1});msg.textContent=t?`试了一下：${t>0?'+':'−'}${L.spokenDuration(t)}`:'先填好礼物名再试';}}),
        el('button',{type:'button',text:'删除','aria-label':`删除第 ${i+1} 行`,onclick:()=>{this.otDraft.splice(i,1);save();draw();}}));
    }):[note('还没有礼物。点「＋ 添加礼物」，比如：玫瑰 → 加时 5 分钟。')]));
    draw();
    return [face,el('div',{class:'ct-row'},start,this.confirmButton('重置','再点一次重置',()=>{local.reset();this.render();})),
      this.field('预设时长',preset,'分钟'),
      this.field('手动加减',el('span',{class:'ct-ot-inline'},manual,el('span',{text:'分钟'}),el('button',{type:'button',text:'加',onclick:()=>shiftBy(1)}),el('button',{type:'button',text:'减',onclick:()=>shiftBy(-1)}))),
      el('label',{class:'ct-switch'},el('input',{type:'checkbox',checked:s.show,onchange:e=>local.setShow(e.target.checked)}),el('span',{},el('b',{text:'画面上显示倒计时'}),el('em',{text:'交租牌下面多一条「距离下播」'}))),
      el('h4',{text:'礼物加减时间'}),rows,
      el('div',{class:'ct-row'},el('button',{type:'button',text:'＋ 添加礼物',id:'ct-ot-gift-add',onclick:()=>{this.otDraft.push({name:'',mode:'add',min:1,max:1});draw();rows.querySelector('.ct-ot-row:last-child input')?.focus();}})),
      msg,
      note('礼物名要和直播间里的一模一样。两个分钟数一样就是固定加减，不一样就在这个范围里随机；送几个算几次。▶ 会真的加减一次，试完可以点「重置」。'),
      note('交租差额、白曜规则动作「overtime」也记到这里。每次开播前点两下「重置」；「开新的一场」也会把自带加班机重置。')];
  }
  /* 白曜加班机：在白曜里不用设；不在白曜里（菘蓝、直接放进 OBS）填白曜给的连接码。测试连接不改时间。 */
  baiyaoBlock(o,route){
    const status=el('p',{id:'ct-overtime-status',class:'ct-note',role:'status',text:this.overtimeText()});
    if(o.snapshot().mode==='baiyao')return route==='baiyao'?[status]:[];
    if(o.target()==='local')return [];
    const key=el('input',{value:o.snapshot().key,maxlength:12,placeholder:'ABCD-2345',autocomplete:'off',spellcheck:'false','aria-label':'白曜加班机连接码'});
    const result=el('p',{class:'ct-note',role:'status'});
    const useKey=()=>{if(o.setKey(key.value)){key.value=o.snapshot().key;return true;}result.textContent='连接码是 8 位，比如 ABCD-2345，在白曜「加班机 → 加班设置 → 插件连接」里。';return false;};
    const test=async e=>{
      // 只拿输入框里的码试一下：不保存、不碰正在用的连接，攒着的加班不会被送出去；点「连接」才用上
      const now=o.snapshot(),typed=key.value;e.target.disabled=true;result.textContent='正在测试连接，不改加班时间…';
      const t=await o.test(typed);
      result.textContent=!t.ok?'测试失败：'+t.error:!t.trusted?'连上白曜了，但'+t.error+'，现在只能看时间。':o.normalizeKey(typed)===now.key&&now.state==='ready'?'连接正常，连接码也对；测试没有加时间。':'连接码对，测试没有加时间；点「连接」才开始加。';e.target.disabled=false;
    };
    return [el('h4',{text:'白曜加班机（不在白曜里用：填连接码）'}),status,this.field('连接码',key),
      el('div',{class:'ct-row'},el('button',{type:'button',text:'连接',onclick:()=>{if(useKey()){o.connect();this.render();}}}),el('button',{type:'button',text:'测试连接',onclick:test})),
      result,note('在白曜里用（白曜的插件窗口、白曜给的 OBS 网址）不用填。菘蓝里、直接把出摊啦放进 OBS 时，填白曜「加班机 → 加班设置 → 插件连接」里的连接码，再点「连接」；「加班记到」是「自动」时，填了连接码就改记到白曜加班机。测试连接只试不存，不改时间。')];
  }
  /* 每秒刷新：自带加班机的倒计时文字（只在面板开着、文字变了时动 DOM） */
  refreshOvertimeClock(){
    const local=this.app.overtime.local.snapshot(),set=(id,text)=>{const n=this.root?.querySelector('#'+id);if(n&&n.textContent!==text)n.textContent=text;};
    set('ct-ot-time',local.clockText);set('ct-ot-net',local.netText);set('ct-ot-label',local.finished&&!local.fresh?'下播时间到':'距离下播');
    set('ct-ot-start',local.running?'暂停':local.fresh?'开始':'继续');set('ct-overtime-route',this.routeText());
  }
  overtimeText(){const o=this.app.overtime,pending=o.pendingCount();return o.describe()+(pending?` · 还有 ${pending} 笔加班没送到，连上后自动补`:'');}
  refreshOvertime(){const node=this.root.querySelector('#ct-overtime-status');if(node){const text=this.overtimeText();if(node.textContent!==text)node.textContent=text;}}
  poolSection(){
    const pool=this.app.settings.rules.pool;
    return section('④ 捣乱池',
      el('div',{class:'ct-pool'},MESS.map(([id,icon,name])=>el('label',{class:'ct-chip'+(pool.includes(id)?' on':'')},
        el('input',{type:'checkbox',checked:pool.includes(id),'aria-label':name,onchange:e=>this.edit(s=>{s.rules.pool=e.target.checked?[...s.rules.pool,id]:s.rules.pool.filter(v=>v!==id);})}),el('span',{text:icon}),name))),
      note('从勾上的几种里随机挑。全部取消时，随机捣乱不触发。多次捣乱排队执行，不吞数量。'));
  }
  range(row,list,index){
    const set=(key,value)=>{
      if(!Number.isFinite(value)||value<1){this.render();return;}
      this.edit(s=>{const r=s.rules[list][index];r[key]=Math.floor(value);if(key==='min'&&r.max<r.min)r.max=r.min;if(key==='max'&&r.min>r.max)r.min=r.max;});
    };
    return el('span',{class:'ct-range'},
      el('input',{type:'number',min:1,step:1,value:row.min,'aria-label':row.name+' 最少',onchange:e=>set('min',Number(e.target.value))}),el('i',{text:'～'}),
      el('input',{type:'number',min:1,step:1,value:row.max,'aria-label':row.name+' 最多',onchange:e=>set('max',Number(e.target.value))}),el('span',{text:{mess:'下',order:'位'}[list]||'件'}));
  }
  /* 点单、捣乱、帮忙三张表共用：一个礼物名只能在其中一张。 */
  giftList(list){
    const help=list==='help',rows=this.app.settings.rules[list];
    const allRows=rules=>[...(rules.order||[]),...(rules.mess||[]),...(rules.help||[])];
    const rowEl=(row,index)=>{
      const name=el('input',{value:row.name,'data-gift-name':'','aria-label':'礼物名',placeholder:'礼物名',onchange:e=>{
        const value=e.target.value.trim(),key=normalizeGiftName(value);
        const duplicate=allRows(this.app.settings.rules).some(r=>r!==row&&normalizeGiftName(r.name)===key);
        if(!key||duplicate){e.target.value=row.name;this.app.notify(duplicate?'这个礼物已经在表里了':'礼物名不能空着');return;}
        this.edit(s=>{s.rules[list][index].name=value;});
      }});
      return el('div',{class:'ct-gift'+(help?' ct-gift-help':'')},name,
        help?choose(row.action,[['helper','帮手'],['guard','保安']],v=>this.edit(s=>{s.rules.help[index].action=v;}),row.name+' 派谁'):null,
        this.range(row,list,index),
        el('button',{class:'ct-try',text:'▶','aria-label':'试一下 '+row.name,title:'试一下：模拟一个礼物',onclick:()=>this.app.live.simGift(row.name,1,'试玩观众')}),
        el('button',{class:'ct-del',text:'×','aria-label':'删除 '+row.name,title:'删除这一行',onclick:()=>this.edit(s=>{s.rules[list].splice(index,1);})}));
    };
    const empty=list==='order'?'还没有点单礼物，送礼物不会来顾客。点击下面的按钮添加。':'还没有配置礼物。点击下面的按钮添加。';
    return [
      el('div',{'data-gift-list':list},rows.length?rows.map(rowEl):el('p',{class:'ct-empty',text:empty})),
      el('button',{class:'ct-add',text:{order:'＋ 添加一个点单礼物',mess:'＋ 添加一个捣乱礼物',help:'＋ 添加一个帮忙礼物'}[list],onclick:()=>{
        this.focusNewGift=list;
        this.edit(s=>{
          const keys=allRows(s.rules).map(r=>normalizeGiftName(r.name));
          let i=1;while(keys.includes(normalizeGiftName('新礼物 '+i)))i++;
          s.rules[list].push({name:'新礼物 '+i,...(help?{action:'helper'}:{}),min:1,max:1});
        });
      }})
    ];
  }
  giftSection(list){
    const help=list==='help';
    return section(help?'⑥ 帮忙礼物':'⑤ 捣乱礼物',
      note(help?'选择派谁，再填随机范围。帮手处理几件事；保安挡几次捣乱。':'一个礼物随机来 N～M 下。多份按份数执行，范围两头都可以改。'),
      this.giftList(list),
      note('点单、捣乱、帮忙三张表里都没有的礼物不触发。▶ 直接模拟这条规则，可以试点单、捣乱或帮忙。'));
  }
  faceSection(){
    return section('⑦ 你的脸',note('拖圆点改形状，拖框整体移动。脸框按画面百分比保存。'),
      el('div',{class:'ct-row'},el('button',{class:'ct-main',text:'在画面上框住我的脸',onclick:()=>{this.close();this.app.editZone();}}),
        ZONE_PRESETS.map(([name,kind])=>el('button',{text:name,onclick:()=>this.edit(s=>{
          const z=s.display.zone.auto?defaultZone(innerWidth/innerHeight):s.display.zone;
          s.display.zone={...z,enabled:true,auto:false,pts:presetPts(kind,z.pts,innerWidth/innerHeight)};
        })})),el('button',{text:'自动适应画面',onclick:()=>this.edit(s=>{s.display.zone=defaultZone(innerWidth/innerHeight);})})));
  }
  soundSection(){
    const a=this.app.settings.audio;
    const range=el('input',{type:'range',min:0,max:100,value:Math.round(a.volume*100),'aria-label':'音量',oninput:e=>this.edit(s=>{s.audio.volume=Number(e.target.value)/100;},false)});
    return section('⑧ 声音',this.switchRow('音效',a.enabled,(s,v)=>{s.audio.enabled=v;}),this.field('音量',range),note('先在画面里点一下解锁短音效。关闭音效不会影响玩法。'));
  }
  advancedSection(){
    const s=this.app.settings,c=s.cooking,z=s.sabotage,stats=this.app.stats||{};
    const percent=(label,value,apply)=>this.number(label,Number((value*100).toFixed(10)),0,.1,(x,v)=>apply(x,v/100),'%',100);
    return el('details',{class:'ct-advanced',open:this.advOpen,ontoggle:e=>{this.advOpen=e.target.open;}},
      el('summary',{text:'高级设置（不懂就别动）'}),
      el('h4',{text:'画面与名字'}),this.switchRow('显示观众名字',s.display.names,(x,v)=>{x.display.names=v;}),
      this.switchRow('启用露脸区',s.display.zone.enabled,(x,v)=>{x.display.zone.enabled=v;}),
      this.number('脸框边缘羽化',s.display.zone.feather,0,1,(x,v)=>{x.display.zone.feather=v;},'像素（按 1080p）'),
      el('h4',{text:'顾客与心情'}),
      this.switchRow('站满后挤一挤',s.crowd.compress,(x,v)=>{x.crowd.compress=v;},'站满后缩小到 85%，放不下的顾客继续在门外排队。'),
      this.number('变为平淡',s.crowd.moodSeconds[0],0,1,(x,v)=>{x.crowd.moodSeconds[0]=v;},'秒，默认 30'),
      this.number('变为不耐烦',s.crowd.moodSeconds[1],s.crowd.moodSeconds[0]+1,1,(x,v)=>{x.crowd.moodSeconds[1]=v;},'秒，默认 60'),
      this.number('变为生气',s.crowd.moodSeconds[2],s.crowd.moodSeconds[1]+1,1,(x,v)=>{x.crowd.moodSeconds[2]=v;},'秒，默认 120'),
      note('从进店开始累计等待，三个秒数依次递增；0 秒表示立即变化。顾客默认不会自行离开。'),
      el('h4',{text:'算钱'}),
      this.number('每单底价',c.baseCoins,0,1,(x,v)=>{x.cooking.baseCoins=v;},'铜板'),
      this.number('多给少给每份差额',c.differenceCoins,0,1,(x,v)=>{x.cooking.differenceCoins=v;},'铜板'),
      this.number('烧焦或加料收入',c.ruinedCoins,0,1,(x,v)=>{x.cooking.ruinedCoins=v;},'铜板'),
      this.number('差评罚款',c.fine,0,1,(x,v)=>{x.cooking.fine=v;},'铜板'),
      percent('做坏扣钱概率',c.spoilProbability,(x,v)=>{x.cooking.spoilProbability=v;}),
      this.number('做坏罚款',c.spoilFine,0,1,(x,v)=>{x.cooking.spoilFine=v;},'铜板'),
      note('菜变坏时只掷一次；冒烟后再着火不会重复扣。概率填 0 就关闭。'),
      percent('少1份被发现',c.shortProbabilities[0],(x,v)=>{x.cooking.shortProbabilities[0]=v;}),
      percent('少2份被发现',c.shortProbabilities[1],(x,v)=>{x.cooking.shortProbabilities[1]=v;}),
      percent('少3份以上被发现',c.shortProbabilities[2],(x,v)=>{x.cooking.shortProbabilities[2]=v;}),
      percent('不耐烦收入比例',c.discounts.impatient,(x,v)=>{x.cooking.discounts.impatient=v;}),
      percent('生气收入比例',c.discounts.angry,(x,v)=>{x.cooking.discounts.angry=v;}),
      note('心情只折算底价，多给少给的差额和差评罚款照常计算。'),
      el('h4',{text:'出餐'}),
      this.number('一锅最多几两',c.capacity,0,1,(x,v)=>{x.cooking.capacity=v;},'0 = 不限'),
      this.number('一块鱼切几片',c.fishPieces,1,1,(x,v)=>{x.cooking.fishPieces=v;},'片'),
      el('h4',{text:'捣乱与帮忙'}),
      this.number('着火多久烧坏',z.fireSeconds,.1,.1,(x,v)=>{x.sabotage.fireSeconds=v;},'秒'),
      this.number('小偷多久摸到钱罐',z.thiefSeconds,.1,.1,(x,v)=>{x.sabotage.thiefSeconds=v;},'秒'),
      percent('小偷偷走比例',z.stealFraction,(x,v)=>{x.sabotage.stealFraction=v;}),
      this.number('停电多久恢复',z.blackoutSeconds,.1,.1,(x,v)=>{x.sabotage.blackoutSeconds=v;},'秒'),
      this.number('猫隔多久偷一份',z.catSeconds,.1,.1,(x,v)=>{x.sabotage.catSeconds=v;},'秒'),
      this.number('旅行团每下几个人',z.tourSize,1,1,(x,v)=>{x.sabotage.tourSize=v;},'人'),
      this.number('帮手每件事间隔',z.helperInterval,.1,.1,(x,v)=>{x.sabotage.helperInterval=v;},'秒'),
      this.number('横幅显示多久',z.bannerSeconds,.1,.1,(x,v)=>{x.sabotage.bannerSeconds=v;},'秒'),
      this.switchRow('短暂画面抖动',z.shake,(x,v)=>{x.sabotage.shake=v;}),
      this.switchRow('显示通缉令',z.wanted,(x,v)=>{x.sabotage.wanted=v;}),
      el('h4',{text:'上限（0 = 不限）'}),this.number('最多排队数量',s.limits.queue,0,1,(x,v)=>{x.limits.queue=v;},'默认 0'),
      note('放不下的顾客在门外排队。'),
      el('h4',{text:'铜板和统计'}),
      note(`铜板 ${stats.coins??0} · 已出 ${stats.served??0} 单 · 差评 ${stats.badReviews??0} · 跑单 ${stats.abandoned??0}`),
      this.confirmButton('清零铜板和出餐统计','确定清零铜板和出餐统计？',()=>{this.app.resetStats();this.render();}),
      note('需3秒内点两下确认。清铜板、已出单、差评和跑单；交租进度、跑单涨租和已加班保留。'));
  }
}
