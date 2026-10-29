(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GelatoTricks=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const DEFINITIONS=Object.freeze({
    reverse:{name:'左右反向',unit:'秒',value:5,max:600},
    freeze:{name:'冻结盘子',unit:'秒',value:3,max:600},
    plate_narrow:{name:'盘子变窄',unit:'%',value:25,max:99,duration:8},
    plate_wide:{name:'盘子变宽',unit:'%',value:25,max:200,duration:8},
    gust_left:{name:'突发左风',unit:'倍',value:2,max:5,duration:5},
    gust_right:{name:'突发右风',unit:'倍',value:2,max:5,duration:5},
    melt:{name:'全屏融化',unit:'%/秒',value:5,max:100,duration:10},
    blast:{name:'范围爆炸',unit:'半径',value:100,max:1000},
    ice:{name:'变成冰球',unit:'秒',value:10,max:600}
  });
  class Controller{
    constructor(game){this.game=game;this.effects={};}
    get reversed(){return !!this.effects.reverse;}
    get frozen(){return !!this.effects.freeze;}
    get icy(){return !!this.effects.ice;}
    get gust(){return this.effects.gust;}
    apply(action,value,options={}){
      const def=DEFINITIONS[action];if(!def||action==='blast')return false;
      const raw=value===undefined?def.value:Number(value);if(!Number.isFinite(raw)||raw<=0)return false;
      value=clamp(raw,0,def.max);
      const duration=def.duration?clamp(Number(options.duration)||def.duration,.1,600):value;
      const key=action.startsWith('plate_')?'plate':action.startsWith('gust_')?'gust':action;
      const previous=this.effects[key];
      const remaining=clamp((previous?.action===action?previous.remaining:0)+duration,0,600);
      this.effects[key]={action,value,remaining,total:remaining};
      if(action==='ice')this.game._setIce(true);
      if(action==='reverse'&&this.game._movementInput==='pointer')this.game.setPointerTarget(this.game._pointerRawX);
      if(key==='plate')this.game._updatePlateWidth();
      this.game.events.push({type:'effect',action,duration:this.effects[key].remaining,value});return true;
    }
    step(dt){
      if(this.game.status!=='playing')return;
      const melting=this.effects.melt;
      if(melting)this.game._meltScoops(melting.value/100,Math.min(dt,melting.remaining));
      for(const [key,effect] of Object.entries(this.effects)){
        effect.remaining=Math.max(0,effect.remaining-dt);
        if(effect.remaining<=1e-8){delete this.effects[key];if(key==='ice')this.game._setIce(false);if(key==='reverse'&&this.game._movementInput==='pointer')this.game.setPointerTarget(this.game._pointerRawX);}
      }
    }
    snapshot(){return Object.values(this.effects).map(e=>({...e,name:DEFINITIONS[e.action].name}));}
  }
  return {Controller,DEFINITIONS};
});
