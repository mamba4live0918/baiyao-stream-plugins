const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname,workspace=path.dirname(root),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const toolRoot=path.join(workspace,'tmp/typing-ui/scenes/protection-tools/node_modules/javascript-obfuscator');
const Obfuscator=require(toolRoot);
const options={compact:true,target:'browser-no-eval',seed:26090805,identifierNamesGenerator:'hexadecimal',renameGlobals:false,renameProperties:false,stringArray:true,stringArrayThreshold:1,stringArrayEncoding:['rc4'],stringArrayRotate:true,stringArrayShuffle:true,stringArrayIndexShift:true,stringArrayWrappersCount:1,stringArrayCallsTransform:false,controlFlowFlattening:false,deadCodeInjection:false,debugProtection:false,debugProtectionInterval:0,selfDefending:false,disableConsoleOutput:false,numbersToExpressions:false,splitStrings:false,simplify:true,sourceMap:false};
const assets={atlas:'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/cartoon-atlas.png')).toString('base64'),crops:JSON.parse(read('assets/crops.json')),extraAtlas:'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/extra-atlas.png')).toString('base64'),extraCrops:JSON.parse(read('assets/extra-crops.json'))};
const modules=['button-choices','levels','tricks','effect-hud','rigid-physics','engine','gifts','campaign','appearance','copy-profile'];
const names=['GelatoButtonChoices','GelatoLevels','GelatoTricks','GelatoEffectHud','GelatoRigidPhysics','GelatoEngine','GelatoGifts','GelatoCampaign','GelatoAppearance','GelatoCopyProfile'];
const scope='const prior='+JSON.stringify(names)+'.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);\n';
const bindings=names.map(name=>'const '+name+'=globalThis.'+name+';').join('\n');
const cleanup="for(const [name,descriptor] of prior){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}\n";
const code=";(function(module,exports,define,require){\nconst GELATO_ASSETS=JSON.parse(document.getElementById('gelato-assets').textContent);\n"+scope+modules.map(name=>read('src/'+name+'.js')).join('\n;\n')+'\n'+bindings+'\n'+cleanup+read('src/app.js')+'\n}).call(globalThis,void 0,void 0,void 0,void 0);';
new vm.Script(code);
const vendor=';(function(module,exports,define,require){\n'+read('vendor/matter.min.js')+'\n}).call(globalThis,void 0,void 0,void 0,void 0);';
const scaffold=read('src/page.html').replace('/* STYLE */',()=>read('src/style.css')).replace(/<script>[\s\S]*?<\/script>/g,'');
const licenses='<!-- Matter.js: '+read('vendor/Matter-LICENSE.txt').replace(/--/g,'- -')+' -->\n<!-- Obfuscator helpers: '+fs.readFileSync(path.join(toolRoot,'LICENSE.BSD'),'utf8').replace(/--/g,'- -')+' -->';
function asciiHtml(html){return html.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi).map(part=>/^<script\b/i.test(part)?part.replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')):/^<style\b/i.test(part)?part.replace(/[^\x00-\x7f]/gu,c=>'\\'+c.codePointAt(0).toString(16)+' '):part.replace(/[^\x00-\x7f]/gu,c=>'&#x'+c.codePointAt(0).toString(16)+';')).join('');}
function assemble(script){return asciiHtml(scaffold.replace('</body>',()=>licenses+'\n<script type="application/json" id="gelato-assets">'+JSON.stringify(assets)+'</script>\n<script data-vendor="matter">'+vendor+'</script>\n<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>\n</body>'));}
const dev=path.join(workspace,'tmp/gelato-physics');fs.mkdirSync(dev,{recursive:true});fs.writeFileSync(path.join(dev,'after-readable.html'),assemble(code));
const protectedCode=Obfuscator.obfuscate(code,options).getObfuscatedCode();new vm.Script(protectedCode);
const html=assemble(protectedCode);assert(!/[\u0080-\uffff]/.test(html));assert(!protectedCode.includes("'BYSL'")&&!protectedCode.includes('"BYSL"'));assert(!/sourceMappingURL|\bdebugger\s*;/.test(protectedCode));
for(const output of [path.join(root,'冰淇淋-接球版.html'),path.join(workspace,'冰淇淋-接球版.html')])fs.writeFileSync(output,html,'utf8');
fs.writeFileSync(path.join(dev,'build-info.json'),JSON.stringify({version:13,physics:['arcade','realistic','sticky'],watermark:'BYSL',obfuscator:'4.1.1',options,sourceScriptBytes:Buffer.byteLength(code),protectedScriptBytes:Buffer.byteLength(protectedCode)},null,2));
console.log('Built protected single-file ice cream v13 ('+Buffer.byteLength(html)+' bytes), with stable stacking and reachable physical drops.');
