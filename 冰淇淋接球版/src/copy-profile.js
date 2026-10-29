(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GelatoCopyProfile=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const MARKER='gelato.catch.profileReady';
  const SOURCE_PREFIXES=['gelato.lite.','gelato.sticky.','gelato.'];
  const SHARED_KEYS=['v2.appearance','v4.display'];
  function copyOnce(storage){
    let copied=0;
    try{
      const target=storage===undefined?root.localStorage:storage;
      if(!target||typeof target.getItem!=='function'||typeof target.setItem!=='function')throw new Error('storage unavailable');
      if(target.getItem(MARKER)==='1')return {copied:0,warning:''};
      for(const key of SHARED_KEYS){
        const destination='gelato.catch.'+key;
        if(target.getItem(destination)!==null)continue;
        for(const prefix of SOURCE_PREFIXES){
          const value=target.getItem(prefix+key);
          if(value!==null){target.setItem(destination,value);copied++;break;}
        }
      }
      target.setItem(MARKER,'1');
      return {copied,warning:''};
    }catch(_){return {copied,warning:'无法完整复制来源版本设置，请检查浏览器存储空间，或使用配置导入功能。来源版本设置未修改。'};}
  }
  return {copyOnce};
});
