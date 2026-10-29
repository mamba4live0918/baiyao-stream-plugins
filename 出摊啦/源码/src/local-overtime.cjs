(function(root){
  'use strict';
  /* 插件自带的加班机（俄罗斯方块和萌宠消消乐用同一份）：不连白曜加班机也能用。
   * 「距离下播」倒计时：预设时长 + 加的 − 减的 − 已经走的；输了 / 积分不够、礼物、主播手动都能加减。
   * 开着的时候存的是到点时刻（endsAt），刷新页面接着走；暂停时存剩余毫秒。
   * 礼物加减表：礼物名 → 加时 / 减时 → 最少～最多分钟（一样就是固定）；送几个算几次。 */
  const MAX_MINUTES=99999,MAX_ROWS=50,NAME_MAX=20;
  const text=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
  const giftKey=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}\p{Cf}]/gu,'');
  const wholeMinutes=(v,min=0)=>{const n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=MAX_MINUTES?n:null;};
  function cleanGift(raw){
    if(!raw||typeof raw!=='object')return null;
    const name=text(raw.name,NAME_MAX);if(!giftKey(name))return null;
    const a=wholeMinutes(raw.min)??1,b=wholeMinutes(raw.max)??a;
    return{name,mode:raw.mode==='sub'?'sub':'add',min:Math.min(a,b),max:Math.max(a,b)};
  }
  /* 分钟 → 「1 小时 5 分钟」「10 分钟」「30 秒」 */
  function spoken(seconds){
    const s=Math.round(Math.abs(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
    if(!s)return'0 分钟';
    return[h?`${h} 小时`:'',m?`${m} 分钟`:'',r?`${r} 秒`:''].filter(Boolean).join(' ');
  }
  /* 倒计时：1:59:30 / 9:05 */
  function clock(seconds){
    const s=Math.max(0,Math.ceil(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
    return h?`${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${m}:${String(r).padStart(2,'0')}`;
  }
  function createLocalOvertime(options={}){
    const key=options.key||'local-overtime-v1',now=options.now||(()=>Date.now()),random=options.random||Math.random;
    let storage=options.storage;try{if(storage===undefined)storage=root.localStorage;}catch{storage=null;}
    let saved={};try{saved=JSON.parse(storage?.getItem(key)||'{}')||{};}catch{saved={};}
    const preset=wholeMinutes(saved.presetMinutes,1)??120;
    const state={
      presetMinutes:preset,
      running:saved.running===true&&Number.isFinite(saved.endsAt),
      endsAt:Number.isFinite(saved.endsAt)?saved.endsAt:null,
      remainingMs:Number.isFinite(saved.remainingMs)&&saved.remainingMs>=0?saved.remainingMs:preset*60000,
      netSeconds:Number.isFinite(saved.netSeconds)?Math.round(saved.netSeconds):0,
      fresh:saved.fresh!==false,
      show:saved.show!==false,
      gifts:(Array.isArray(saved.gifts)?saved.gifts:[]).map(cleanGift).filter(Boolean).slice(0,MAX_ROWS),
    };
    const listeners=new Set();
    const persist=()=>{try{storage?.setItem(key,JSON.stringify(state));}catch{}};
    const remainingMs=()=>state.running?Math.max(0,state.endsAt-now()):state.remainingMs;
    function snapshot(){
      const ms=remainingMs();
      return{presetMinutes:state.presetMinutes,running:state.running,fresh:state.fresh,show:state.show,remainingSeconds:Math.ceil(ms/1000),
        clockText:clock(ms/1000),netSeconds:state.netSeconds,netText:state.netSeconds?(state.netSeconds<0?'已减班 −':'已加班 +')+spoken(state.netSeconds):'还没加班',
        finished:ms<=0,gifts:state.gifts.map(g=>({...g}))};
    }
    const publish=event=>{const s=snapshot();for(const fn of listeners)try{fn(s,event||null);}catch{}};
    function start(){if(state.running)return false;state.endsAt=now()+state.remainingMs;state.running=true;state.fresh=false;persist();publish();return true;}
    function pause(){if(!state.running)return false;state.remainingMs=remainingMs();state.running=false;state.endsAt=null;persist();publish();return true;}
    function reset(){state.running=false;state.endsAt=null;state.remainingMs=state.presetMinutes*60000;state.netSeconds=0;state.fresh=true;persist();publish();}
    /* 游戏开始时自动开始计时：只在重置后还没开始过时才开（主播手动暂停的不会被打开） */
    function autoStart(){return state.fresh&&!state.running?start():false;}
    function setPreset(value){
      const minutes=wholeMinutes(value,1);if(minutes===null)return false;
      state.presetMinutes=minutes;if(state.fresh&&!state.running){state.remainingMs=minutes*60000;state.netSeconds=0;}
      persist();publish();return true;
    }
    function setShow(value){state.show=value===true;persist();publish();}
    /* 加减秒数（负数是减）；到点以后加的从现在算起，减到 0 为止 */
    function shift(seconds,label=''){
      const delta=Math.round(Number(seconds));if(!Number.isFinite(delta)||!delta)return 0;
      const before=remainingMs(),after=Math.max(0,before+delta*1000),applied=Math.round((after-before)/1000);
      if(state.running)state.endsAt=now()+after;else state.remainingMs=after;
      state.netSeconds+=delta;persist();publish({seconds:delta,applied,label:text(label,20)});return delta;
    }
    function setGifts(list){
      if(!Array.isArray(list))return{ok:false,error:'礼物表格式不对'};
      const rows=list.map(cleanGift);
      if(rows.some(r=>!r))return{ok:false,error:'每一行都要填礼物名'};
      if(rows.length>MAX_ROWS)return{ok:false,error:`最多 ${MAX_ROWS} 行`};
      state.gifts=rows;persist();publish();return{ok:true};
    }
    /* 一份礼物（已去重、已算好本次新增的个数）→ 按表加减。返回加减的总秒数（没匹配是 0） */
    function minutesFor(row,count){
      if(row.min===row.max)return row.min*count;
      if(count>1000)return Math.round((row.min+row.max)/2*count);
      let sum=0;for(let i=0;i<count;i++)sum+=row.min+Math.floor(random()*(row.max-row.min+1));return sum;
    }
    function applyGift({name,count=1}={}){
      const k=giftKey(name),n=Math.max(1,Math.floor(Number(count)||1));if(!k)return 0;
      let total=0;
      for(const row of state.gifts){
        if(giftKey(row.name)!==k)continue;
        const seconds=minutesFor(row,n)*60*(row.mode==='sub'?-1:1);
        if(seconds){shift(seconds,row.name);total+=seconds;}
      }
      return total;
    }
    function hasGift(name){const k=giftKey(name);return!!k&&state.gifts.some(r=>giftKey(r.name)===k);}
    function subscribe(fn){listeners.add(fn);fn(snapshot(),null);return()=>listeners.delete(fn);}
    return{snapshot,subscribe,start,pause,reset,autoStart,setPreset,setShow,shift,setGifts,applyGift,hasGift};
  }
  const api={createLocalOvertime,spokenDuration:spoken,clockText:clock,giftKey};
  root.LocalOvertime=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
