(function(root,factory){
 const PetTestToolbar=factory();
 if(typeof module==='object'&&module.exports)module.exports=PetTestToolbar;
 else root.PetTestToolbar=PetTestToolbar;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class PetTestToolbar{
  constructor({toolbar,body=toolbar?.ownerDocument?.body}={}){
   if(!toolbar||typeof toolbar.setAttribute!=='function'||!body?.dataset)throw new TypeError('Test toolbar requires a toolbar and body element');
   this.toolbar=toolbar;this.body=body;this.menuOpen=false;this.visible=false;this.apply();
  }
  setMenuOpen(open){
   if(typeof open!=='boolean')throw new TypeError('Menu state must be a boolean');
   this.menuOpen=open;this.visible=open;this.apply();return this.isVisible();
  }
  hide(){this.visible=false;this.apply();return false;}
  toggle(){this.visible=this.menuOpen&&!this.visible;this.apply();return this.isVisible();}
  isVisible(){return this.menuOpen&&this.visible;}
  apply(){
   const visible=this.isVisible(),active=this.toolbar.ownerDocument?.activeElement;
   if(!visible&&active&&this.toolbar.contains?.(active))active.blur?.();
   this.toolbar.hidden=!visible;this.toolbar.setAttribute('aria-hidden',String(!visible));this.body.dataset.testMenuOpen=String(this.menuOpen);this.body.dataset.testToolbarVisible=String(visible);
  }
 }
 return PetTestToolbar;
});
