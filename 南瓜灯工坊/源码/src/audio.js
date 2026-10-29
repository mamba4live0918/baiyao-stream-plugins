// Tiny, finite WebAudio gestures. Only unlock(), called by the real mouse
// handler, may construct a context; SDK events can only ask an unlocked one to play.
export function createAudio(getSettings,env=globalThis){
 let context=null,output=null,noiseBuffer=null,settingsTimer=null,outputLevel=-1,scoopStep=0;
 const voices=new Set(),lastStarts=new Map();
 const later=(fn,ms)=>(env.setTimeout||globalThis.setTimeout).call(env,fn,ms);
 const cancel=id=>(env.clearTimeout||globalThis.clearTimeout).call(env,id);
 const cooldown={open:.14,scoop:.19,carve:.1,light:.35,land:.12,roll:.55,collapse:.5,break:.1,rain:.4,rat:.2,nibble:.16,cat:.3,witch:.6,miss:.4,ghost:.14,wind:.5,goo:.4,wipe:.12,sprite:.2,jar:.25,glass:.14,'glass-break':.25,candy:.05};

 function settings(){
  const config=getSettings()||{},volume=Number(config.volume);
  return {enabled:!!config.enabled,volume:Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):0};
 }
 function syncOutput(){
  const config=settings(),level=config.enabled?config.volume:0;
  if(output&&level!==outputLevel){
   output.gain.cancelScheduledValues(context.currentTime);
   output.gain.setTargetAtTime(level,context.currentTime,.012);
   outputLevel=level;
  }
  return level;
 }
 function watchSettings(){
  if(settingsTimer!==null||!voices.size)return;
  settingsTimer=later(()=>{
   settingsTimer=null;syncOutput();watchSettings();
  },32);
 }
 function disconnect(voice){
  for(const node of voice.nodes)try{node.disconnect();}catch{}
  voice.nodes.clear();voices.delete(voice);
  if(!voices.size&&settingsTimer!==null){cancel(settingsTimer);settingsTimer=null;}
 }
 function halt(voice){
  for(const part of voice.parts){part.source.onended=null;try{part.source.stop();}catch{}}
  disconnect(voice);
 }
 function stop(){
  for(const voice of [...voices])halt(voice);
  lastStarts.clear();
 }
 function noise(){
  if(!noiseBuffer){
   noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.65),context.sampleRate);
   const samples=noiseBuffer.getChannelData(0);let smooth=0;
   for(let i=0;i<samples.length;i++){smooth=.84*smooth+.16*(Math.random()*2-1);samples[i]=smooth;}
  }
  return noiseBuffer;
 }
 function synthesize(kind,now){
  const voice={kind,nodes:new Set(),parts:[],remaining:0};
  function envelope(source,delay,duration,level,attack=.018,filter=null){
   const at=now+delay,gain=context.createGain();
   voice.nodes.add(source);voice.nodes.add(gain);if(filter)voice.nodes.add(filter);
   gain.gain.setValueAtTime(.0001,at);
   gain.gain.linearRampToValueAtTime(level,at+Math.min(attack,duration/3));
   gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   if(filter)source.connect(filter).connect(gain);else source.connect(gain);
   gain.connect(output);voice.parts.push({source,at,end:at+duration+.012});
  }
  function tone(delay,duration,level,notes,type='sine',attack=.018){
   const source=context.createOscillator();voice.nodes.add(source);source.type=type;
   source.frequency.setValueAtTime(notes[0][1],now+delay);
   for(const [offset,pitch] of notes.slice(1))source.frequency.exponentialRampToValueAtTime(pitch,now+delay+offset);
   envelope(source,delay,duration,level,attack);
  }
  function puff(delay,duration,level,cutoff){
   const source=context.createBufferSource(),filter=context.createBiquadFilter();
   voice.nodes.add(source);voice.nodes.add(filter);
   source.buffer=noise();filter.type='lowpass';
   filter.frequency.setValueAtTime(cutoff,now+delay);filter.Q.setValueAtTime(.45,now+delay);
   envelope(source,delay,duration,level,.024,filter);
  }
  try{
   switch(kind){
    case 'scoop':{
     // A low, rounded double gurgle, with a tiny variation between accepted stirs.
     const n=[0,9,-7][scoopStep++%3];
     tone(0,.22,.052,[[0,175+n],[.065,255+n],[.22,120+n]]);
     tone(.055,.18,.026,[[0,112+n],[.06,155+n],[.18,86+n]]);
     puff(.015,.19,.028,650);break;
    }
    case 'carve':
     tone(0,.12,.056,[[0,410],[.025,300],[.12,175]],'triangle',.012);
     puff(0,.1,.025,850);break;
    case 'light':
     // Three mellow rising notes, rather than one piercing frequency sweep.
     tone(0,.36,.047,[[0,349],[.36,353]],'sine',.026);
     tone(.13,.36,.043,[[0,440],[.36,444]],'sine',.026);
     tone(.26,.4,.04,[[0,587],[.4,592]],'sine',.03);
     puff(0,.15,.022,480);break;
    case 'land':
     tone(0,.2,.065,[[0,126],[.07,90],[.2,66]],'sine',.022);
     tone(.025,.14,.025,[[0,220],[.14,125]],'triangle',.018);
     puff(0,.12,.018,400);break;
    case 'collapse':
     for(let i=0;i<6;i++)tone(i*.065,.17,.035-i*.003,[[0,180+i*28],[.17,75+i*7]],'triangle',.014);
     puff(0,.44,.032,700);break;
    case 'break':
     tone(0,.13,.045,[[0,620],[.13,240]],'triangle',.01);tone(.025,.16,.024,[[0,930],[.16,510]],'sine',.014);puff(0,.12,.021,1250);break;
    case 'rain':
     for(let i=0;i<5;i++)tone(i*.07,.15,.027,[[0,165+i*16],[.15,95+i*8]],'sine',.02);break;
    case 'rat':
     tone(0,.15,.025,[[0,340],[.07,430],[.15,310]],'sine',.018);break;
    case 'nibble':
     tone(0,.07,.028,[[0,360],[.07,190]],'triangle',.014);puff(.05,.09,.013,850);break;
    case 'cat':
     tone(0,.32,.032,[[0,260],[.09,420],[.32,225]],'sine',.035);break;
    case 'witch':
     tone(0,.45,.027,[[0,240],[.2,520],[.45,330]],'sine',.05);puff(0,.5,.023,750);break;
    case 'miss':
     tone(0,.36,.036,[[0,600],[.15,330],[.36,145]],'triangle',.03);break;
    case 'ghost':
     tone(0,.18,.026,[[0,420],[.06,560],[.18,380]],'sine',.025);break;
    case 'wind':
     puff(0,.75,.045,950);tone(0,.55,.018,[[0,125],[.3,180],[.55,90]],'sine',.08);break;
    case 'goo':
     tone(0,.26,.046,[[0,230],[.1,165],[.26,80]],'sine',.02);puff(0,.27,.028,600);break;
    case 'wipe':
     puff(0,.16,.027,650);tone(0,.14,.016,[[0,190],[.14,260]],'sine',.025);break;
    case 'sprite':
     for(const [i,pitch]of [392,494,587].entries())tone(i*.12,.27,.027,[[0,pitch],[.27,pitch*1.01]],'sine',.035);break;
    case 'candy':
     // 糖果掉进南瓜：很短的一声「嗒」，音高随机一点，一串听起来像哗啦啦
     tone(0,.07,.03,[[0,900+Math.random()*500],[.07,520]],'triangle',.006);break;
    case 'jar':case 'glass':
     tone(0,.28,.023,[[0,660],[.28,665]],'sine',.02);tone(.09,.25,.016,[[0,880],[.25,885]],'sine',.025);break;
    case 'glass-break':
     for(let i=0;i<4;i++)tone(i*.045,.16,.018,[[0,880-i*95],[.16,500-i*50]],'sine',.018);puff(0,.17,.012,1100);break;
    case 'roll':
     for(let i=0;i<4;i++)tone(i*.115,.19,.043-i*.004,[[0,94+i*5],[.19,64+i*3]],'sine',.025);
     puff(0,.52,.032,360);break;
    default:
     // Soft lid pop; unknown legacy event names retain a quiet finite fallback.
     tone(0,.17,.072,[[0,320],[.035,365],[.17,155]],'sine',.016);
     tone(.026,.13,.025,[[0,240],[.13,120]],'sine',.02);
   }
   return voice;
  }catch(error){halt(voice);throw error;}
 }
 return {
  unlock(){
   if(!settings().enabled)return;
   try{
    if(!context){
     const AC=env.AudioContext||env.webkitAudioContext;if(!AC)return;
     context=new AC();output=context.createGain();output.gain.setValueAtTime(0,context.currentTime);
     output.connect(context.destination);outputLevel=-1;
    }
    syncOutput();noise();
    if(context.state==='suspended')context.resume()?.catch?.(()=>{});
   }catch{
    try{output?.disconnect();context?.close?.()?.catch?.(()=>{});}catch{}
    context=null;output=null;noiseBuffer=null;outputLevel=-1;
   }
  },
  play(kind){
   if(!context||context.state!=='running'||!syncOutput())return false;
   kind=kind==='serve'?'roll':kind;
   const now=context.currentTime;
   if(voices.size>=4||now-(lastStarts.get(kind)??-Infinity)<(cooldown[kind]??.14))return false;
   if((kind==='scoop'||kind==='roll')&&[...voices].some(v=>v.kind===kind))return false;
   let voice;
   try{
    voice=synthesize(kind,now);voice.remaining=voice.parts.length;voices.add(voice);
    for(const part of voice.parts){
     part.source.onended=()=>{if(--voice.remaining===0)disconnect(voice);};
     part.source.start(part.at);part.source.stop(part.end);
    }
    lastStarts.set(kind,now);watchSettings();return true;
   }catch{if(voice)halt(voice);return false;}
  },stop,
  snapshot:()=>({state:context?.state||'uninitialized',voices:voices.size})
 };
}
