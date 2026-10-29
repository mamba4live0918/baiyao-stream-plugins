import test from 'node:test';
import assert from 'node:assert/strict';
import {createKitchen,reduceKitchen} from '../src/cooking/kitchen.js';
import {rollNewSpoilages} from '../src/cooking/spoilage.js';

test('one action can spoil both the remaining pot and a separate plated portion',()=>{
 let k=createKitchen('noodle');
 k=reduceKitchen(k,{type:'load'},0);k=reduceKitchen(k,{type:'load'},0);
 k=reduceKitchen(k,{type:'scoop'},4000);
 assert.equal(k.pot.amount,1);assert.equal(k.bowl,1);assert.equal(k.spoilSerial,0);
 const next=reduceKitchen(k,{type:'spice'},10000);
 assert.equal(next.spoilSerial-k.spoilSerial,2);
 const results=rollNewSpoilages(k,next,{spoilProbability:1,spoilFine:10});
 assert.equal(results.reduce((total,r)=>total+r.coins,0),-20);
 assert.equal(rollNewSpoilages(next,reduceKitchen(next,{type:'tick'},13000),{spoilProbability:1,spoilFine:10}).length,0);
});
