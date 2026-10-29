(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PetRoster=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const FIRST_CUSTOM_KIND=100,FIRST_NATIVE_EXTENSION=2000000,MAX_NATIVE_KIND=2099999;
 const catalogs=new WeakMap();
 function kindOf(asset,index){
  if(!asset||typeof asset!=='object'||Array.isArray(asset)||!Number.isSafeInteger(index)||index<0)throw new TypeError('Invalid native asset or index');
  const explicit=Object.prototype.hasOwnProperty.call(asset,'kind'),kind=explicit?asset.kind:index;
  if(!Number.isSafeInteger(kind)||!(kind>=FIRST_NATIVE_EXTENSION&&kind<=MAX_NATIVE_KIND||kind>=0&&kind<FIRST_CUSTOM_KIND&&kind===index))throw new RangeError('Native kind collides with a reserved ID range');
  if(!explicit&&index>=FIRST_CUSTOM_KIND)throw new RangeError('Native extensions require an explicit kind');
  return kind;
 }
 function catalog(cows){
  if(!Array.isArray(cows))throw new TypeError('Expected a native asset array');
  const cached=catalogs.get(cows),kinds=[];let unchanged=!!cached&&cached.assets.length===cows.length;
  for(let index=0;index<cows.length;index++){
   const kind=kindOf(cows[index],index);kinds.push(kind);
   if(unchanged&&(cached.assets[index]!==cows[index]||cached.value.kinds[index]!==kind))unchanged=false;
  }
  if(unchanged)return cached.value;
  const assets=cows.slice(),indices=new Map();
  for(let index=0;index<kinds.length;index++){
   if(indices.has(kinds[index]))throw new RangeError('Duplicate native kind');
   indices.set(kinds[index],index);
  }
  const value=Object.freeze({
   kinds:Object.freeze(kinds),
   index:kind=>indices.get(kind)??-1,
   get:kind=>{const index=indices.get(kind);return index===undefined?undefined:assets[index];},
   has:kind=>indices.has(kind)
  });
  catalogs.set(cows,{assets,value});return value;
 }
 return{kindOf,catalog};
});
