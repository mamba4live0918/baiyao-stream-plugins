/* SDK wins; standalone connections identify themselves and retry with a bounded backoff. */
(()=>{'use strict';
  function create({getSdk=()=>globalThis.SonglanPlugin,onGift=()=>{},onStatus=()=>{},WebSocketCtor=globalThis.WebSocket,setTimer=setTimeout,clearTimer=clearTimeout}={}){
    const endpoints=['ws://127.0.0.1:9910','ws://localhost:10030'];
    let active=false,socket=null,retry=null,poll=null,watchdog=null,delay=3000,epoch=0,boundSdk=null,unbind=null,sdkToken=0,usingSdk=false;
    const cancelRetry=()=>{if(retry!==null)clearTimer(retry);retry=null;if(watchdog!==null)clearTimer(watchdog);watchdog=null;};
    function dropSocket(){epoch++;if(watchdog!==null)clearTimer(watchdog);watchdog=null;if(socket){const previous=socket;socket=null;previous.onopen=previous.onmessage=previous.onclose=previous.onerror=null;try{previous.close();}catch{}}}
    function trySdk(){
      const sdk=getSdk();if(!sdk||typeof sdk.onGift!=='function')return false;
      if(sdk!==boundSdk){if(typeof unbind==='function')try{unbind();}catch{}const token=++sdkToken;boundSdk=sdk;try{unbind=sdk.onGift(data=>{if(active&&usingSdk&&boundSdk===sdk&&sdkToken===token)onGift({...data,type:'gift'});});}catch{boundSdk=null;return false;}}
      if(!usingSdk){usingSdk=true;cancelRetry();dropSocket();onStatus('菘蓝 SDK');}return true;
    }
    function scheduleRetry(){if(!active||usingSdk||retry!==null)return;onStatus('未连接');const wait=delay;delay=Math.min(30000,delay*2);retry=setTimer(()=>{retry=null;connect(0);},wait);}
    function connect(index){
      if(!active||trySdk())return;dropSocket();const token=epoch;let settled=false,opened=false,current;
      const fail=()=>{if(settled||!active||token!==epoch||usingSdk)return;settled=true;dropSocket();onStatus('未连接');if(!opened&&index===0)connect(1);else scheduleRetry();};
      try{current=new WebSocketCtor(endpoints[index]);socket=current;}catch{fail();return;}
      watchdog=setTimer(fail,8000);
      current.onopen=()=>{if(!active||token!==epoch||usingSdk)return;opened=true;if(watchdog!==null)clearTimer(watchdog);watchdog=null;delay=3000;try{current.send(JSON.stringify({action:'identify',module:'自定义插件'}));}catch{fail();return;}onStatus(index===0?'本机 9910':'本机 10030');};
      current.onmessage=event=>{if(!active||token!==epoch||usingSdk)return;try{const data=JSON.parse(event.data);onGift(data);}catch{}};
      current.onerror=fail;current.onclose=fail;
    }
    function pollSdk(){if(!active)return;trySdk();poll=setTimer(pollSdk,1500);}
    function start(){if(active)return;active=true;usingSdk=false;delay=3000;onStatus('未连接');if(!trySdk())connect(0);poll=setTimer(pollSdk,1500);}
    function stop(){active=false;usingSdk=false;cancelRetry();if(poll!==null)clearTimer(poll);poll=null;dropSocket();if(typeof unbind==='function'){try{unbind();}catch{}unbind=null;boundSdk=null;sdkToken++;}}
    return Object.freeze({start,stop});
  }
  const api=Object.freeze({create});if(typeof module==='object'&&module.exports)module.exports=api;else globalThis.LockGiftChannel=api;
})();
