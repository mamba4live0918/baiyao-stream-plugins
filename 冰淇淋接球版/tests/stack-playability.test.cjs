const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../src/engine.js');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function play(mode,scenario,seed=42){
  const random=rng(seed);let g;
  const landingRandom=scenario==='small-offset'?()=>{const [left,right]=g._spawnBounds(g.rowRadius);return (500+(random()-.5)*16-left)/(right-left);}:random;
  g=new Game({physicsMode:mode,adhesion:.65,random:landingRandom});g.start();let peak=0;
  for(let i=0;i<75*120&&g.status==='playing';i++){
    if(scenario==='moving'&&i%12===0){const falling=g.scoops.find(s=>!s.hasLanded&&!s.missed&&!s.blasted),tip=g.scoops.filter(s=>s.hasLanded&&!s.missed&&!s.blasted&&(s._physicalDepth>0||s.locked)).sort((a,b)=>a.body.position.y-b.body.position.y)[0];if(falling)g.setPointerTarget(falling.body.position.x-(tip?tip.body.position.x-g.bowls[0].x:0));}
    g.step(1/120);peak=Math.max(peak,g.progressHeight);
  }
  return {g,peak};
}
test('small landing offsets can build the default target in both physical modes',()=>{
  for(const mode of ['realistic','sticky']){const {g,peak}=play(mode,'small-offset');assert.equal(g.status,'won',mode+' peak '+peak+' cannot reach default '+g.goal);assert(g.layers>=10);}
});
test('sticky default level can be completed by following random drops with the plate',()=>{
  for(const seed of [42,71,2026]){const {g,peak}=play('sticky','moving',seed);assert.equal(g.status,'won','seed '+seed+' peak '+peak+' cannot reach '+g.goal);}
});
test('sleeping physical supports keep their real stack height',()=>{
  const g=new Game({physicsMode:'realistic',random:()=>.5});g.start();for(let i=0;i<30*120&&g.status==='playing';i++)g.step(1/120);assert.equal(g.status,'won','sleeping contacts must still count as support');
});
