const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function fixture(){
 const nodes=new Map(),node=()=>({style:{setProperty(k,v){this[k]=v;}},dataset:{},classList:{toggle(){}},offsetHeight:260,naturalWidth:512,naturalHeight:512,getAttribute(){return'';}}),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 const context={document:doc,innerWidth:320,innerHeight:180};vm.runInNewContext(read('src/customize.js')+';globalThis.Type=CowCustomizer;',context);
 const c=Object.create(context.Type.prototype);Object.assign(c,{cfg:{showWidth:800,showX:99,showY:99,penWidth:120,penX:80,penY:65},blindBox:{},core:require('../src/core.js'),barnSource:()=> 'nest.png',canShowChant:()=>true,placing:false});return{c,context,nodes};
}
test('the box stage is not a scrolling or clipping pane and budgets for its stable labels',()=>{
 const f=fixture();f.c.applyLayout(true);const show=f.nodes.get('show'),w=parseFloat(show.style.width),h=parseFloat(show.style.height);
 assert.equal(show.style.overflowX,'visible');assert.equal(show.style.overflowY,'visible');assert.equal(show.style.maxHeight,'none');assert(h<=164);assert(Math.abs(h-(w/1.15+86))<.00001);
 assert.equal(parseFloat(show.style.left),160);assert.equal(parseFloat(show.style.top),90);
});
test('display and custom layout allocate the same size, while rotated art can overflow without scrollbars',()=>{
 const f=fixture();f.c.applyLayout(true);const show=f.nodes.get('show'),Display=require('../src/box-display.js'),before=show.style.width;
 const d=new Display({size:()=>Math.min(800,320*.72,180*.5,Math.max(1,(180-102)*1.15)),show,art:{style:{}},animate:()=>true});d.render({boxFall:{x:160,y:90,angle:12,squash:.2}});
 assert.equal(show.style.width,before);assert.equal(show.style.overflowX,'visible');assert.equal(show.style.overflowY,'visible');assert.equal(parseFloat(show.style.height),parseFloat(before)/1.15+86);
 const css=read('src/blind-box.css');assert.match(css,/#show\{[^}]*overflow:visible/);assert.match(css,/#show \.call\{[^}]*white-space:normal/);
});
