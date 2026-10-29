const test=require('node:test');
const assert=require('node:assert/strict');
let nextStep;
try{({nextStep}=require('../src/campaign.js'));}catch{}
test('all six completed stages restart the journey even if stage five was won last',()=>{
  assert.equal(typeof nextStep,'function');
  assert.deepEqual(nextStep(5,new Set([6,1,2,3,4,5])),{action:'restart',level:1,allClear:true});
});
test('winning only the final stage returns to the first uncompleted challenge',()=>{
  assert.deepEqual(nextStep(6,new Set([6])),{action:'missing',level:1,allClear:false});
  assert.deepEqual(nextStep(6,new Set([1,2,6])),{action:'missing',level:3,allClear:false});
});
test('ordinary progress selects the next designed stage without claiming complete',()=>{
  assert.deepEqual(nextStep(2,new Set([1,2])),{action:'next',level:3,allClear:false});
});
test('duplicate and invalid completion records cannot unlock the complete campaign',()=>{
  assert.equal(nextStep(6,[1,1,1,1,1,1]).allClear,false);
  assert.equal(nextStep(6,[1,2,3,4,5,99]).allClear,false);
});
