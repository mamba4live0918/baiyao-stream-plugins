const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'../src/test-toolbar.js');
const Controller=fs.existsSync(file)?require(file):null;
function fixture(){
 assert.equal(typeof Controller,'function','test toolbar controller exists');
 const body={dataset:{testMenuOpen:'true'},classList:new Set(['hidden-controls'])},attrs={},doc={activeElement:null,body};
 const button={blur(){doc.activeElement=null;}},toolbar={hidden:false,ownerDocument:doc,setAttribute:(key,value)=>attrs[key]=String(value),contains:element=>element===button};
 const controller=new Controller({toolbar,body});
 return{controller,body,toolbar,attrs,doc,button};
}
test('startup hides the toolbar without restoring old menu or controls settings',()=>{
 const f=fixture();assert.equal(f.controller.isVisible(),false);assert.equal(f.toolbar.hidden,true);assert.equal(f.attrs['aria-hidden'],'true');assert.equal(f.body.dataset.testMenuOpen,'false');
 f.controller.setMenuOpen(true);assert.equal(f.controller.isVisible(),true);assert.equal(f.toolbar.hidden,false);assert.equal(f.body.classList.has('hidden-controls'),true);
});
test('opening shows the toolbar and closing removes it from interaction and focus',()=>{
 const f=fixture();f.controller.setMenuOpen(true);assert.equal(f.toolbar.hidden,false);assert.equal(f.attrs['aria-hidden'],'false');assert.equal(f.body.dataset.testMenuOpen,'true');
 f.doc.activeElement=f.button;f.controller.setMenuOpen(false);
 assert.equal(f.toolbar.hidden,true);assert.equal(f.doc.activeElement,null);assert.equal(f.controller.isVisible(),false);assert.equal(f.body.dataset.testMenuOpen,'false');
});
test('hide affects only this menu visit; the next opening always shows the toolbar',()=>{
 const f=fixture();f.controller.setMenuOpen(true);f.controller.hide();assert.equal(f.toolbar.hidden,true);assert.equal(f.body.dataset.testMenuOpen,'true');
 f.controller.setMenuOpen(false);f.controller.setMenuOpen(true);assert.equal(f.controller.isVisible(),true);
 f.controller.hide();f.controller.setMenuOpen(true);assert.equal(f.controller.isVisible(),true);
});
test('keyboard toggle cannot reveal the toolbar while the menu is closed',()=>{
 const f=fixture();assert.equal(f.controller.toggle(),false);assert.equal(f.toolbar.hidden,true);
 f.controller.setMenuOpen(true);assert.equal(f.controller.toggle(),false);assert.equal(f.controller.toggle(),true);
 f.controller.setMenuOpen(false);assert.equal(f.controller.toggle(),false);assert.equal(f.toolbar.hidden,true);
});
test('invalid menu states do not open the toolbar and hiding does not steal external focus',()=>{
 const f=fixture();for(const value of [1,'true',null,undefined])assert.throws(()=>f.controller.setMenuOpen(value));assert.equal(f.controller.isVisible(),false);
 const outside={};f.doc.activeElement=outside;f.controller.setMenuOpen(true);f.controller.hide();assert.equal(f.doc.activeElement,outside);
});
test('browser export works with unavailable storage and never reads or writes persisted settings',()=>{
 assert.equal(typeof Controller,'function');const sandbox={};Object.defineProperty(sandbox,'localStorage',{get(){assert.fail('toolbar must not access storage');}});
 vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);const f=fixture(),controller=new sandbox.PetTestToolbar({toolbar:f.toolbar,body:f.body});
 controller.setMenuOpen(true);controller.hide();controller.setMenuOpen(false);controller.setMenuOpen(true);assert.equal(controller.isVisible(),true);
});
test('menu clearance follows actual toolbar visibility including hide and keyboard toggle',()=>{
 const f=fixture();assert.equal(f.body.dataset.testToolbarVisible,'false');
 f.controller.setMenuOpen(true);assert.equal(f.body.dataset.testToolbarVisible,'true');
 f.controller.hide();assert.equal(f.body.dataset.testMenuOpen,'true');assert.equal(f.body.dataset.testToolbarVisible,'false');
 f.controller.toggle();assert.equal(f.body.dataset.testToolbarVisible,'true');
 f.controller.setMenuOpen(false);assert.equal(f.body.dataset.testToolbarVisible,'false');
});
