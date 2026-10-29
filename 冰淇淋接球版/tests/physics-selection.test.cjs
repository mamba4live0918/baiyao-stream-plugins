const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Rigid=require('../src/rigid-physics.js'),{Game}=require('../src/engine.js');
// Exercise the shipped UI handler with unavailable host storage, using the real game reset.
function select({stored=true,initial='arcade',chosen='sticky',draft=true}={}){
 const app=fs.readFileSync(require.resolve('../src/app.js'),'utf8');
 const line=app.split('\n').find(l=>l.trimStart().startsWith('function changePhysics('));
 const game=new Game({physicsMode:initial});let resets=0,message='';
 const nodes={'physics-mode':{value:chosen},adhesion:{value:'65'},'physics-status':{textContent:'',classList:{toggle(){}}}};
 const scope={game,GelatoRigidPhysics:Rigid,physicsProfile:{mode:initial,adhesion:.65},$:id=>nodes[id],saveDraft:()=>draft,saveV4:()=>stored,refreshPhysicsControls(){},toast:s=>message=s,PHYSICS_NAMES:{arcade:'稳定接球',realistic:'真实物理',sticky:'粘性物理'}};
 scope.resetRound=()=>{resets++;game.reset({physicsMode:scope.physicsProfile.mode,adhesion:scope.physicsProfile.adhesion});};
 vm.createContext(scope);vm.runInContext(line+'\nchangePhysics('+JSON.stringify(chosen)+');',scope);
 return {game,resets,message,status:nodes['physics-status'].textContent};
}
test('host storage failure does not prevent selecting a physical mode for the current session',()=>{const r=select({stored:false});assert.equal(r.game.physicsMode,'sticky');assert.ok(r.game.physics);assert.match(r.status+r.message,/未.*保存|无法保存/);});
test('clicking the already active mode does not clear the current round',()=>{const r=select({initial:'sticky'});assert.equal(r.resets,0);});
test('each selection applies the real game mode and reports success',()=>{for(const chosen of ['realistic','sticky','arcade']){const r=select({initial:chosen==='arcade'?'sticky':'arcade',chosen});assert.equal(r.game.physicsMode,chosen);assert.equal(r.resets,1);}});
test('invalid level drafts block a switch and provide visible feedback',()=>{const r=select({draft:false});assert.equal(r.game.physicsMode,'arcade');assert.equal(r.resets,0);assert.match(r.status+r.message,/关卡|参数/);});
