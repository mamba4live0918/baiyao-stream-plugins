(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
  else root.VisitorAccounts=factory(root.VisitorEngine);
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  'use strict';
  const POINT_FIELDS=['legacyPoints','chatPoints','giftPoints','fanBonusPoints','fanBoostPoints'];
  const COUNTERS=['chatCount','giftCount',...POINT_FIELDS];
  const PROFILE_KEYS=['id','avatar','recordingSince',...COUNTERS,'fan'];
  const FAN_KEYS=['active','level','source','verifiedAt','bonusClaimed'];
  const DEFAULTS=Object.freeze({giftRules:[],fanFirstBonus:20,fanPerLevelBonus:1});
  function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
  function integer(x,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(x)||x<min||x>max)throw Error('数值超出允许范围');return x;}
  function keys(x,list){if(!plain(x)||Object.keys(x).some(k=>!list.includes(k))||list.some(k=>!Object.hasOwn(x,k)))throw Error('观众档案结构不完整或含未知字段');}
  function sum(values){let total=0;for(const n of values){integer(n);total+=n;integer(total);}return total;}
  function giftKey(name){return typeof name==='string'?name.trim().normalize('NFKC').toLowerCase():'';}
  function validateScoring(raw={}){
    if(!plain(raw))throw Error('积分设置无效');
    const out={giftRules:[],fanFirstBonus:raw.fanFirstBonus??20,fanPerLevelBonus:raw.fanPerLevelBonus??1};
    integer(out.fanFirstBonus,0,1000000);integer(out.fanPerLevelBonus,0,1000);
    const rules=raw.giftRules??[];if(!Array.isArray(rules)||rules.length>100)throw Error('最多配置 100 种礼物');
    const names=new Set();
    for(const row of rules){keys(row,['name','points']);if(typeof row.name!=='string'||!row.name.trim()||row.name.trim().length>128)throw Error('礼物名须为 1–128 个字符');const key=giftKey(row.name);if(names.has(key))throw Error('礼物名称不能重复：'+row.name);names.add(key);out.giftRules.push({name:row.name.trim(),points:integer(row.points,0,1000000)});}
    return out;
  }
  function avatarFromId(id){try{if(id.startsWith('display:')){const tuple=JSON.parse(id.slice(8));return Array.isArray(tuple)&&typeof tuple[1]==='string'?tuple[1]:'';}}catch{}return '';}
  function makeProfile(visitor,now){
    return {id:visitor.id,avatar:avatarFromId(visitor.id),recordingSince:integer(now),chatCount:0,giftCount:0,legacyPoints:visitor.points,chatPoints:0,giftPoints:0,fanBonusPoints:0,fanBoostPoints:0,fan:{active:false,level:0,source:'unknown',verifiedAt:null,bonusClaimed:false}};
  }
  function migrateProfiles(state,now=Date.now()){return state.visitors.map(v=>makeProfile(v,now));}
  function validateProfiles(input,state){
    if(!Array.isArray(input)||input.length!==state.visitors.length||input.length>10000)throw Error('观众档案与名册人数不一致');
    const visitors=new Map(state.visitors.map(v=>[v.id,v])),seen=new Set();
    return input.map(raw=>{
      keys(raw,PROFILE_KEYS);if(typeof raw.id!=='string'||!visitors.has(raw.id)||seen.has(raw.id))throw Error('档案标识重复或与名册不符');seen.add(raw.id);
      if(typeof raw.avatar!=='string'||raw.avatar.length>2048)throw Error('头像标记无效');
      const p={id:raw.id,avatar:raw.avatar,recordingSince:integer(raw.recordingSince)};for(const k of COUNTERS)p[k]=integer(raw[k]);
      if(sum(POINT_FIELDS.map(k=>p[k]))!==visitors.get(p.id).points)throw Error('积分明细与总积分不一致');
      keys(raw.fan,FAN_KEYS);const f=raw.fan;
      if(typeof f.active!=='boolean'||typeof f.bonusClaimed!=='boolean'||!['unknown','manual'].includes(f.source))throw Error('灯牌资料无效');
      integer(f.level,0,100);if((f.active&&f.level===0)||(!f.active&&f.level!==0))throw Error('灯牌状态与等级不一致');
      if(f.verifiedAt!==null)integer(f.verifiedAt);
      if((f.source==='unknown'&&(f.active||f.level||f.verifiedAt!==null||f.bonusClaimed))||(f.source==='manual'&&f.verifiedAt===null))throw Error('灯牌资料来源不一致');
      if(!f.bonusClaimed&&p.fanBonusPoints!==0)throw Error('灯牌首次奖励记录不一致');
      p.fan={...f};return p;
    });
  }
  function processEvent(state,profiles,event,settings,now){
    try{
      const score=validateScoring(settings),uid=typeof event?.userId==='string'?event.userId.trim():'';
      const old=state.visitors.find(v=>v.id===uid),p=profiles.find(v=>v.id===uid);
      if(old&&!p)return {changed:false,effects:[],reason:'missing-profile'};
      const adjusted={...settings};
      if(event?.type==='gift'){const found=score.giftRules.find(r=>giftKey(r.name)===giftKey(event.text));if(found)adjusted.giftPoints=found.points;}
      const fanUnit=p?.fan.active?p.fan.level*score.fanPerLevelBonus:0;
      const count=event?.type==='gift'?(event.count??1):1;
      const before=old?.points??0,beforeLevel=E.getLevel(before,settings);
      if(old&&['chat','gift'].includes(event?.type)&&Number.isSafeInteger(count)&&count>0){
        const field=event.type==='chat'?'chatCount':'giftCount';if(!Number.isSafeInteger(p[field]+count))return {changed:false,effects:[],reason:'statistics-limit'};
        const base=event.type==='gift'?adjusted.giftPoints:adjusted.chatPoints;
        if(base>0&&!Number.isSafeInteger(before+(base+fanUnit)*count))return {changed:false,effects:[],reason:'points-overflow'};
      }
      const r=E.processEvent(state,event,adjusted,now);
      if(r.reason?.startsWith('invalid-')||['duplicate-event','unsupported-event','not-registered','capacity-reached'].includes(r.reason))return r;
      const visitor=state.visitors.find(v=>v.id===uid);if(!visitor)return r;
      let profile=p;if(!profile){profile=makeProfile(visitor,now);profiles.push(profile);}
      if(typeof event.avatar==='string'&&event.avatar.length<=2048&&event.avatar)profile.avatar=event.avatar;
      if(event.type==='chat')profile.chatCount++;else if(event.type==='gift')profile.giftCount+=count;else return r;
      r.changed=true;
      if(r.reason==='scored'){
        const baseEarned=visitor.points-before;
        profile[event.type==='gift'?'giftPoints':'chatPoints']+=baseEarned;
        const boost=baseEarned>0?fanUnit*count:0;visitor.points+=boost;profile.fanBoostPoints+=boost;
        const rank=E.getLevel(visitor.points,settings);r.effects=r.effects.filter(e=>e.type!=='levelup');
        if(rank.index>beforeLevel.index)r.effects.push({type:'levelup',nickname:visitor.nickname,level:rank});
      }
      return r;
    }catch{return {changed:false,effects:[],reason:'invalid-profile-or-scoring'};}
  }
  function setFanProfile(original,originalProfiles,id,input,settings,now){
    const state=E.validateState(original),profiles=validateProfiles(originalProfiles,state),score=validateScoring(settings);
    const visitor=state.visitors.find(v=>v.id===id),profile=profiles.find(p=>p.id===id);
    if(!visitor||!profile)throw Error('请先登记这位观众');
    if(!plain(input)||typeof input.active!=='boolean')throw Error('灯牌状态无效');integer(now);
    const level=input.active?integer(input.level,1,100):0;
    const before=E.getLevel(visitor.points,settings),award=input.active&&!profile.fan.bonusClaimed?score.fanFirstBonus:0;
    integer(visitor.points+award);visitor.points+=award;profile.fanBonusPoints+=award;
    profile.fan={active:input.active,level,source:'manual',verifiedAt:Math.max(now,profile.fan.verifiedAt??0),bonusClaimed:profile.fan.bonusClaimed||input.active};
    const rank=E.getLevel(visitor.points,settings);
    return {state,profiles:validateProfiles(profiles,state),awarded:award,effects:rank.index>before.index?[{type:'levelup',nickname:visitor.nickname,level:rank}]:[]};
  }
  function renameVisitor(original,originalProfiles,id,name,options){
    const profiles=validateProfiles(originalProfiles,original),source=profiles.find(p=>p.id===id);
    const state=E.renameVisitor(original,id,name,options);
    const targetId=id.startsWith('display:')?'display:'+JSON.stringify([name.trim(),avatarFromId(id)]):id;
    const duplicate=profiles.find(p=>p.id===targetId&&p!==source);
    if(duplicate){for(const k of COUNTERS)source[k]=sum([source[k],duplicate[k]]);source.recordingSince=Math.min(source.recordingSince,duplicate.recordingSince);const fan=(duplicate.fan.verifiedAt??-1)>(source.fan.verifiedAt??-1)?duplicate.fan:source.fan;source.fan={...fan,bonusClaimed:source.fan.bonusClaimed||duplicate.fan.bonusClaimed};}
    source.id=targetId;
    const out=profiles.filter(p=>p!==duplicate);
    return {state,profiles:validateProfiles(out,state)};
  }
  return Object.freeze({DEFAULTS,validateScoring,migrateProfiles,validateProfiles,processEvent,setFanProfile,renameVisitor});
});
