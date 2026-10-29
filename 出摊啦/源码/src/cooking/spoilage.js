/** A spoil event calls this once. A disabled probability never consumes RNG. */
export function rollSpoilage(config={},rng=Math.random){
 const probability=Number.isFinite(config.spoilProbability)?Math.max(0,Math.min(1,config.spoilProbability)):.5;
 const fine=Number.isFinite(config.spoilFine)?Math.max(0,config.spoilFine):10;
 if(probability===0)return{coins:0,charged:false,message:''};
 const charged=probability===1||rng()<probability,coins=charged&&fine>0?-fine:0;
 return{coins,charged,message:charged?`做坏了 −${fine}`:'这次没罚'};
}

export function rollNewSpoilages(previous,next,config={},rng=Math.random){
 const count=Math.max(0,(next.spoilSerial||0)-(previous.spoilSerial||0));
 return Array.from({length:count},()=>rollSpoilage(config,rng));
}
