(function(root){
  'use strict';
  const KEY='match3-collection-settings-v1';
  const number=(v,min,max)=>(typeof v==='number'||typeof v==='string'&&/^\d+$/.test(v.trim()))&&Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
  class PointCollector{
    constructor(options={}){
      this.options=options;this.storage=options.storage;try{if(this.storage===undefined&&typeof document!=='undefined')this.storage=root.localStorage;}catch{}
      let saved={};try{saved=JSON.parse(this.storage?.getItem(KEY)||'{}')||{};}catch{}
      this.intervalSeconds=number(options.intervalSeconds??saved.intervalSeconds,10,3600)?Number(options.intervalSeconds??saved.intervalSeconds):60;
      this.amount=number(options.amount??saved.amount,1,1000000)?Number(options.amount??saved.amount):3000;
      this.difficulty=['standard','hard','hell'].includes(options.difficulty??saved.difficulty)?options.difficulty??saved.difficulty:'hard';
      this.elapsed=0;this.nextAt=this.intervalSeconds*1000;this.started=false;this.periods=0;this.insufficient=0;this.last=null;this.settling=false;
    }
    start(){if(this.started)return false;this.started=true;this.nextAt=this.elapsed+this.intervalSeconds*1000;return true;}
    configure(values){
      if(!values||typeof values!=='object')return false;
      if('intervalSeconds'in values&&!number(values.intervalSeconds,10,3600)||'amount'in values&&!number(values.amount,1,1000000)||'difficulty'in values&&!['standard','hard','hell'].includes(values.difficulty))return false;
      const oldInterval=this.intervalSeconds;
      if('intervalSeconds'in values)this.intervalSeconds=Number(values.intervalSeconds);
      if('amount'in values)this.amount=Number(values.amount);
      if('difficulty'in values)this.difficulty=values.difficulty;
      if(oldInterval!==this.intervalSeconds)this.nextAt=this.elapsed+this.intervalSeconds*1000;
      try{this.storage?.setItem(KEY,JSON.stringify({intervalSeconds:this.intervalSeconds,amount:this.amount,difficulty:this.difficulty}));}catch{}
      return true;
    }
    tick(delta,{paused=false,canSettle=true}={}){
      if(!this.started||paused||!Number.isFinite(delta)||delta<0)return;
      this.elapsed+=delta;
      if(!canSettle||this.settling)return;
      this.settling=true;
      try{
        for(let n=0;n<6&&this.elapsed>=this.nextAt;n++){
          const balance=Math.max(0,Math.floor(Number(this.options.getBalance?.())||0));
          const paid=Math.min(balance,this.amount),shortfall=this.amount-paid;
          const receipt={index:++this.periods,required:this.amount,paid,shortfall,balanceAfter:balance-paid};
          this.nextAt+=this.intervalSeconds*1000;if(shortfall)this.insufficient++;this.last=receipt;
          this.options.setBalance?.(receipt.balanceAfter);
          try{this.options.onCharge?.({...receipt});}catch{this.last.error='收分通知异常';}
        }
      }finally{this.settling=false;}
    }
    snapshot(){return{intervalSeconds:this.intervalSeconds,amount:this.amount,difficulty:this.difficulty,started:this.started,periods:this.periods,insufficient:this.insufficient,remainingMs:this.started?Math.max(0,this.nextAt-this.elapsed):this.intervalSeconds*1000,last:this.last?{...this.last}:null};}
  }
  root.PointCollector=PointCollector;if(typeof module!=='undefined')module.exports={PointCollector};
})(typeof window!=='undefined'?window:globalThis);
