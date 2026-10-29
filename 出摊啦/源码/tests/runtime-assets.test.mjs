import test from 'node:test';
import assert from 'node:assert/strict';
import { isRuntimeAsset, assetReference, TOOL_ASSET_IDS, EVENT_ASSET_IDS, SHOP_ASSET_IDS } from '../src/runtime-assets.js';

test('runtime packs all 22 kitchen tools and the current stage assets without future props',()=>{
 assert.equal(TOOL_ASSET_IDS.length,22);assert.equal(new Set(TOOL_ASSET_IDS).size,22);
 for(const id of [...TOOL_ASSET_IDS,'customer_01_happy','customer_16_angry','customer_steam','badge','bubble','coin_jar','coin_jar_top','coin','trash_can','stamp_frame_green','stamp_frame_red','stamp_frame_purple'])assert.equal(isRuntimeAsset(id),true,id);
 for(const id of ['thief_crowd','bowl_noodles_4','unknown','customer_99_happy','customer_01_unused'])assert.equal(isRuntimeAsset(id),false,id);
 assert.equal(EVENT_ASSET_IDS.length,45);
 assert.equal(SHOP_ASSET_IDS.length,20);
 for(const id of SHOP_ASSET_IDS)assert.equal(isRuntimeAsset(id),true,id);
 for(const id of [...EVENT_ASSET_IDS,'extinguisher','thief_crowd_normal','thief_crowd_stunned'])assert.equal(isRuntimeAsset(id),true,id);
});
test('approved mirrored counter ends share one encoded left image while preserving all four shops',()=>{
 for(const shop of ['noodle','sushi','pancake','tea']){
  for(const part of ['left','mid','sign']){const id=`counter_${shop}_${part}`;assert.equal(isRuntimeAsset(id),true);assert.deepEqual(assetReference(id),{sourceId:id,mirrorX:false});}
  const id=`counter_${shop}_right`;assert.equal(isRuntimeAsset(id),false);assert.deepEqual(assetReference(id),{sourceId:`counter_${shop}_left`,mirrorX:true});
 }
});
