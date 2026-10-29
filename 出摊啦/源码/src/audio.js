// Short WebAudio voices only. Construction waits for a real mouse gesture;
// incoming SDK events cannot create a blocked AudioContext or a looping sound.
export function createAudio(getSettings,env=globalThis){
 let context=null;const voices=new Set();let last=-Infinity;
 function stop(){for(const voice of voices)try{voice.stop();}catch{}voices.clear();}
 return{
  unlock(){
   if(!getSettings().enabled)return;
   try{if(!context){const AC=env.AudioContext||env.webkitAudioContext;if(!AC)return;context=new AC();}if(context.state==='suspended')context.resume().catch(()=>{});}catch{context=null;}
  },
  play(kind){
   const config=getSettings();if(!config.enabled||!context||context.state!=='running'||voices.size>=8||context.currentTime-last<.06)return false;
   const tones={fire:[160,80],thief:[600,280],blackout:[300,180],cat:[500,900],tour:[440,660],boom:[120,35],spice:[800,240],helper:[660,990],guard:[520,780],extinguish:[250,90],bonk:[400,160],restorePower:[440,880],removeCat:[750,420],wipe:[300,700],block:[330,660],refund:[880,1320],serve:[880,1760]};
   const [from,to]=tones[kind]||[600,800],now=context.currentTime,duration=kind==='boom'?.28:.18;last=now;
   try{
    const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type=['boom','fire'].includes(kind)?'triangle':'sine';
    oscillator.frequency.setValueAtTime(from,now);oscillator.frequency.exponentialRampToValueAtTime(to,now+duration);
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.13*Math.max(0,Math.min(1,config.volume)),now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(gain).connect(context.destination);voices.add(oscillator);oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(now);oscillator.stop(now+duration+.02);return true;
   }catch{return false;}
  },stop,
  snapshot:()=>({state:context?.state||'uninitialized',voices:voices.size})
 };
}
