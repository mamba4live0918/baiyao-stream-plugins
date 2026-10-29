import {PRESETS,createPresetPattern,recolorPattern,validColorTier,colorByHex} from './patterns.js';
export const MODES=['pattern','campaign','free'];
export function freePattern(size=30,name='自由作品'){return{id:'free',mode:'free',name,category:'custom',size,cells:Array(size*size).fill(null),preview:{width:size,height:size,cells:Array(size*size).fill(null)}};}
export function validPattern(p){return p&&Number.isInteger(p.size)&&p.size>=16&&p.size<=64&&Array.isArray(p.cells)&&p.cells.length===p.size*p.size&&p.cells.every(h=>h===null||!!colorByHex(h));}
export function copyPattern(p){if(!validPattern(p))throw new Error('关卡图案无效');return structuredClone(p);}
export function normalizeCampaign(saved){
 const levels=Array.isArray(saved?.levels)?saved.levels.filter(l=>l&&validPattern(l.pattern)&&l.pattern.cells.some(Boolean)).slice(0,100).map((l,i)=>({id:typeof l.id==='string'?l.id:`level-${i}`,name:String(l.name||l.pattern.name).slice(0,60),pattern:copyPattern(l.pattern)})):[];
 if(!levels.length)for(const {id} of PRESETS.slice(0,3)){const pattern=createPresetPattern(id,30);levels.push({id:`level-${id}`,name:pattern.name,pattern});}
 return{levels,index:Math.min(levels.length-1,Math.max(0,Number.isInteger(saved?.index)?saved.index:0)),done:saved?.done===true};
}
export function levelPattern(level){return{...copyPattern(level.pattern),name:level.name,mode:'campaign'};}
export function makeLevel(pattern){if(!validPattern(pattern)||!pattern.cells.some(Boolean))throw new Error('关卡必须包含图案');return{id:`level-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:pattern.name,pattern:{...copyPattern(pattern),mode:'pattern'}};}
export function convertLevel(level,tier){if(!validColorTier(tier))throw new Error('颜色档位无效');return{...level,pattern:recolorPattern(level.pattern,tier)};}
