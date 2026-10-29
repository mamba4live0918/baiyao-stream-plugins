import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,sanitizeSettings,saveSettings,loadSettings} from '../src/settings.js';
test('sabotage defaults match durations, theft fraction and uncapped queues',()=>{
 assert.deepEqual(defaultSettings().sabotage,{fireSeconds:8,thiefSeconds:6,stealFraction:.3,blackoutSeconds:20,catSeconds:4,tourSize:10,helperInterval:.9,bannerSeconds:2.4,shake:true,wanted:true});
 assert.equal(defaultSettings().limits.queue,0);
});
test('old settings gain event defaults while valid custom values survive storage',()=>{
 let value;const storage={getItem:()=>value,setItem:(k,v)=>value=v};
 const custom={fireSeconds:12,thiefSeconds:8,stealFraction:.5,blackoutSeconds:15,catSeconds:3,tourSize:50000,helperInterval:.4,bannerSeconds:1,shake:false,wanted:false};
 saveSettings(storage,{sabotage:custom,shop:'sushi'});assert.deepEqual(loadSettings(storage).settings.sabotage,custom);assert.equal(loadSettings(storage).settings.shop,'sushi');
 assert.deepEqual(sanitizeSettings({cooking:{baseCoins:25}}).sabotage,defaultSettings().sabotage);
});
test('malformed event settings cannot create zero-duration busy loops',()=>{
 const result=sanitizeSettings({sabotage:{fireSeconds:0,smokeSeconds:-1,thiefSeconds:NaN,stealFraction:2,blackoutSeconds:Infinity,catSeconds:0,tourSize:0,helperInterval:-2,bannerSeconds:0,shake:'no',wanted:false}}).sabotage;
 assert.deepEqual(result,{...defaultSettings().sabotage,stealFraction:1,wanted:false});
});
