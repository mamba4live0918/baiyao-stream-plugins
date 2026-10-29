// The approved right counter caps are exact horizontal mirrors of the left PNGs.
// Share their encoded image in the HTML; keep every source/export file intact.
import eventMeta from '../assets/events-meta.mjs';
import shopMeta from '../assets/shops-meta.mjs';
export const TOOL_ASSET_IDS=Object.freeze([
 'noodle_box','stove','pot','pot_water','pot_noodles_1','pot_noodles_2','pot_noodles_3',
 'strainer','strainer_noodles','bowl_empty','bowl_noodles_1','bowl_noodles_2','bowl_noodles_3',
 'fish_box','cutting_board','salmon_block_1','salmon_block_2','salmon_block_3','salmon_slice','salmon_slice_broken','knife','plate'
]);
// V1.5 起画面上没有自带加班机，它的外框图不再打进 HTML（源图和 meta 还留着）
export const RENT_ASSET_IDS=Object.freeze(['landlady_stand','landlady_stamp','landlady_book','rent_sign']);
export const EVENT_ASSET_IDS=Object.freeze(Object.keys(eventMeta));
export const SHOP_ASSET_IDS=Object.freeze(Object.keys(shopMeta));
const other=new Set([...TOOL_ASSET_IDS,...RENT_ASSET_IDS,...EVENT_ASSET_IDS,...SHOP_ASSET_IDS,'extinguisher','thief_crowd_normal','thief_crowd_stunned','customer_steam','badge','bubble','coin_jar','coin_jar_top','coin','trash_can','stamp_frame_green','stamp_frame_red','stamp_frame_purple']);
export const isRuntimeAsset=id=>other.has(id)||/^customer_(?:0[1-9]|1[0-6])_(?:happy|neutral|impatient|angry)$/.test(id)||/^counter_(?:noodle|sushi|pancake|tea)_(?:left|mid|sign)$/.test(id);
export const assetReference=id=>/^counter_(?:noodle|sushi|pancake|tea)_right$/.test(id)?{sourceId:id.replace(/_right$/,'_left'),mirrorX:true}:{sourceId:id,mirrorX:false};
