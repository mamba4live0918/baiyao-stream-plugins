const zoneNames=LeafBattle.names;
const failed={cooldown:'冷却中，稍后再来',limit:'本局三次搬针已用完',state:'继续寻找后再使用',empty:'当前没有可作用的目标'};
let battleUIAt=0,battleLog='',battleVoters=0,battleDrops=[];
function battleEffect(type,multiplier,meta={}){
 const zone=world.validZone(meta.zone)?meta.zone:world.selectedZone,actor=String(meta.actor||'试玩观众').slice(0,24);let r,message;
 switch(type){
  case 'add':r=world.addToZone(config.add*clamp(Number(multiplier)||1,1,120000),zone);message=r.count?'向'+zoneNames[zone]+'加叶 '+r.count+' 片'+(r.redirected?'，护区生效，转落'+zoneNames[r.zone]:''):'叶量达到上限或该区无可用位置';break;
  case 'refill':r=world.refillToZone(config.refill,zone);message=r.count?'向'+zoneNames[zone]+'倒回 '+r.count+' 片'+(r.redirected?'，护区生效，转落'+zoneNames[r.zone]:''):'篮中没有可回填的叶子（已封存 '+world.sealedCount+' 片）';break;
  case 'shield':r=world.shield(zone);message=r.ok?'护住'+zoneNames[zone]+' 45秒，加叶和回填将转到旁边':failed[r.reason];break;
  case 'seal':r=world.seal(300);message=r.ok?'扎紧篮口，永久封存 '+r.count+' 片':failed[r.reason];break;
  case 'track':r=world.track();message=r.ok?r.text+' · 45秒保护':failed[r.reason];break;
  case 'move':r=world.requestMove();lastTargetRevision=world.targetRevision;message=r.ok?(r.queued?'搬针已排队，线索保护结束后执行':'针已搬往其他区域 · 本局剩余 '+(3-world.movesUsed)+' 次'):failed[r.reason];break;
  case 'region':r=world.giveHint('region');message=r?'区域线索 '+world.regionLevel+' 级 · 45秒保护':world.hintReason||'继续寻找后再使用';break;
  case 'depth':r=world.giveHint('depth');message=r?'深浅线索已出现 · 45秒保护':world.hintReason||'继续寻找后再使用';break;
  default:return false;
 }
 world.event(message,actor);toast(actor+'：'+message);if(type==='add'||type==='refill'){rustle(.6);if(r.count){const b=world.bucket;for(const l of world.leaves.slice(-Math.min(24,r.count)))battleDrops.push({leaf:{...l},x:type==='refill'?b.x:l.x,y:type==='refill'?b.y:l.size*Math.SQRT1_2+8,at:performance.now(),duration:reduced.matches?180:750});battleDrops=battleDrops.slice(-48);}}return true;
}
for(const button of document.querySelectorAll('[data-zone]'))button.onclick=()=>{world.selectedZone=Number(button.dataset.zone);toast('主播标记：怀疑'+zoneNames[world.selectedZone]);};
$('vote-send').onclick=()=>{const name=$('vote-name').value.trim();if(!name){toast('先填写模拟观众名字，同名只计一票');return;}if(world.vote(name,Number($('vote-zone').value)))toast(name+' 猜测：'+zoneNames[Number($('vote-zone').value)]);else toast('当前不能投票');};
function receiveMessage(message){let m=message;try{if(typeof m==='string')m=JSON.parse(m);if(!m||typeof m!=='object')return false;if(typeof m.data==='string')m={...m,...JSON.parse(m.data)};else if(m.data&&typeof m.data==='object')m={...m,...m.data};}catch{return false;}
 const comment=['comment','chat','danmu','弹幕','评论'].includes(String(m.type).toLowerCase());if(!comment)return receiveGift(m);const content=String(m.content||m.text||m.message||'').trim(),zone=zoneNames.indexOf(content.replace(/^(猜|投票|#)\s*/,'')),id=String(m.userId||m.uid||m.user?.id||m.nickname||m.userName||'').slice(0,100);return world.vote(id,zone);
}
function outsideHeadGuide(){ctx.beginPath();ctx.rect(0,0,world.w,world.h);if(world.head.enabled)ctx.arc(world.head.x*world.w,world.head.y*world.h,world.head.r*world.unit+2,0,Math.PI*2);ctx.clip('evenodd');}
function drawBattle(time){if(!ready)return;battleDrops=battleDrops.filter(d=>time-d.at<d.duration);for(const d of battleDrops){const t=clamp((time-d.at)/d.duration,0,1),e=1-(1-t)**2,p={...d.leaf,x:d.x+(d.leaf.x-d.x)*e,y:d.y+(d.leaf.y-d.y)*e,angle:d.leaf.angle+(1-t)*.5};world.projectOutsideHead(p,true);ctx.save();ctx.globalAlpha=1-t*.3;ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.drawImage(sprites[p.type],-p.size/2,-p.size/2,p.size,p.size);ctx.restore();}ctx.save();outsideHeadGuide();for(let z=0;z<4;z++){const r=world.zoneRect(z),shield=world.isShielded(z);if((!controlsHidden&&z===world.selectedZone)||shield){ctx.save();ctx.lineWidth=shield?3:1.5;ctx.strokeStyle=shield?'#c3f4ad':'#fff1bd88';ctx.setLineDash(shield?[4,5]:[12,10]);ctx.strokeRect(r.x+3,r.y+3,r.w-6,r.h-6);ctx.restore();}}ctx.restore();
 if(world.sealedCount){const b=world.bucket;ctx.save();ctx.strokeStyle='#d3e8a1';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(b.x-b.size*.35,b.y-3);ctx.lineTo(b.x+b.size*.35,b.y-3);ctx.stroke();ctx.font='bold 12px Microsoft YaHei';ctx.textAlign='center';ctx.fillStyle='#fff4ce';ctx.strokeStyle='#574432';ctx.lineWidth=3;const label='已封存 '+world.sealedCount;ctx.strokeText(label,b.x,b.y+b.size*.48);ctx.fillText(label,b.x,b.y+b.size*.48);ctx.restore();}
 if(time-battleUIAt<200)return;battleUIAt=time;const votes=world.voteCounts();for(let z=0;z<4;z++){const button=document.querySelector('[data-zone="'+z+'"]');button.classList.toggle('selected',z===world.selectedZone);button.setAttribute('aria-pressed',String(z===world.selectedZone));text('zone-picks-'+z,'已捡 '+world.zonePicks[z]+' · 猜测 '+votes[z]+'票');text('zone-shield-'+z,world.isShielded(z)?'保护 '+Math.ceil((world.shields[z]-world.battleNow)/1000)+'秒':'');}
 const next=Math.min(3,(world.regionLevel||0)+1),need=[0,0,4500,9000][next],wait=Math.max(0,Math.ceil((world.regionReady-world.battleNow)/1000));text('battle-progress','累计拾取 '+world.searchPicks+' 次 · '+(wait?'线索冷却 '+wait+'秒':world.searchPicks<need?'下级线索还需 '+(need-world.searchPicks)+' 次':'可请求区域线索'));
 text('battle-limits','搬针剩余 '+(3-world.movesUsed)+' 次'+(world.pendingMove?' · 已排队':world.moveReady>world.battleNow?' · 冷却 '+Math.ceil((world.moveReady-world.battleNow)/1000)+'秒':'')+' · 封存 '+world.sealedCount+' 片');
 text('battle-trace',world.traceUntil>world.battleNow&&world.trace?('追踪：'+(world.trace.axis==='x'?(world.trace.side?'右半场':'左半场'):(world.trace.side?'下半场':'上半场'))+' · '+Math.ceil((world.traceUntil-world.battleNow)/1000)+'秒'):'');
 const content=JSON.stringify(world.events);if(content!==battleLog){battleLog=content;$('battle-log').replaceChildren(...world.events.slice(0,3).map(e=>{const li=document.createElement('li');li.textContent=e.actor+'：'+e.message;return li;}));}
}
