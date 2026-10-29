const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/customize.js'),'utf8');
function setup(withBlob=true){
 let creates=0;const context={atob,Blob,...(withBlob?{URL:{createObjectURL:()=>{creates++;return 'blob:walk-'+creates;}}}:{})};
 vm.runInNewContext(source+';globalThis.Type=CowCustomizer;',context);
 const custom=Object.create(context.Type.prototype);
 custom.assets={cows:[{walk:'data:image/png;base64,AQID',articulated:true},{walk:'data:image/png;base64,BAUG',articulated:true}]};custom.records=new Map();custom.cfg={customCows:[]};
 return{custom,count:()=>creates};
}
test('built-in animation URL is shared by repeated pets of the same breed',()=>{
 const {custom,count}=setup();assert.equal(custom.cowWalk(0),'blob:walk-1');assert.equal(custom.cowWalk(0),'blob:walk-1');assert.equal(count(),1);
 assert.equal(custom.cowWalk(1),'blob:walk-2');assert.equal(count(),2);
 custom.records.set('cow:0',{type:'image',data:'data:image/png;base64,AQID'});assert.equal(custom.cowWalk(0),null);
 custom.records.delete('cow:0');assert.equal(custom.cowWalk(0),'blob:walk-1');assert.equal(count(),2);
});
test('missing Blob URL support falls back to the embedded data URI',()=>{
 const {custom}=setup(false);assert.equal(custom.cowWalk(0),custom.assets.cows[0].walk);
});
