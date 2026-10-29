const fs=require('node:fs'),path=require('node:path');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const {BattleWorld:World}=require('../src/battle.js');
function rng(seed){let s=seed;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
(async()=>{const {data,info}=await sharp(path.join(__dirname,'../assets/cute-atlas.png')).raw().toBuffer({resolveWithObject:true}),masks=[];
 for(let k=0;k<6;k++){const a=new Uint8Array(65536);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const sx=Math.min(info.width-1,Math.floor((k%3+(x+.5)/256)*info.width/3)),sy=Math.min(info.height-1,Math.floor((Math.floor(k/3)+(y+.5)/256)*info.height/3));a[y*256+x]=data[(sy*info.width+sx)*info.channels+3]>55?1:0;}masks.push(a);}
 const mask=(x,y,l)=>{const dx=x-l.x,dy=y-l.y,c=l.cos??Math.cos(l.angle),s=l.sin??Math.sin(l.angle),u=(dx*c+dy*s)/l.size+.5,v=(-dx*s+dy*c)/l.size+.5;return u>=0&&u<1&&v>=0&&v<1&&!!masks[l.type][(v*256|0)*256+(u*256|0)];};
 const results=[];
 for(const count of [30000])for(const strategy of ['grid','random','assisted'])for(let seed=1;seed<=8;seed++){
  const r=rng(seed),w=new World(1440,900,r);let simNow=1000;w.mask=mask;w.clock=()=>simNow;w.reset(count,7200,72);w.start();w.deadline=Infinity;const points=w.targetPoints(),counts=new Uint32Array(points.length),blockers=new Map();
  for(const l of w.leaves){if(l.depth<=w.needle.depth||Math.abs(l.x-w.needle.x)>l.size+80||Math.abs(l.y-w.needle.y)>l.size+80)continue;const hit=[];points.forEach((p,i)=>{if(mask(p.x,p.y,l)){hit.push(i);counts[i]++;}});if(hit.length)blockers.set(l.id,hit);}
  const initialMin=Math.min(...counts),a=w.area(),grid=[];for(let y=a.top+20,row=0;y<a.bottom;y+=40,row++){const line=[];for(let x=a.left+20;x<a.right;x+=40)line.push({x,y});if(row%2)line.reverse();grid.push(...line);}let cursor=0,exposed=initialMin===0,attempts=0;
  while(!exposed&&w.leaves.length&&attempts<count*5){attempts++;simNow+=1000/3;let p;if(strategy==='assisted'&&simNow>=w.regionReady){w.giveHint('region');}if(strategy==='grid'||strategy==='assisted'){p=grid[cursor];if(!p){const l=w.leaves[Math.floor(r()*w.leaves.length)];p={x:l.x,y:l.y};}if(strategy==='assisted'&&w.regionLevel){const a=w.regionRect();if(p.x<a.x-100||p.x>a.x+a.w+100||p.y<a.y-100||p.y>a.y+a.h+100){cursor++;continue;}}if(!w.topLeaf(p.x,p.y)){cursor++;continue;}}else{const l=w.leaves[Math.floor(r()*w.leaves.length)];p={x:l.x,y:l.y};}
   const result=w.pick(p.x,p.y);if(result.kind==='win'){exposed=true;break;}if(result.kind==='leaf'){for(const i of blockers.get(result.leaf.id)||[]){counts[i]--;if(!counts[i])exposed=true;}}if(w.deltas.length>1000)w.deltas=[];
  }
  const result={count,strategy,seed,initialMin,picks:w.swept,found:exposed,minutesAt3ClicksPerSecond:+(w.swept/180).toFixed(1)};results.push(result);
 }
 for(const strategy of ['grid','random','assisted']){const rows=results.filter(r=>r.strategy===strategy),p=rows.map(r=>r.picks).sort((a,b)=>a-b);console.log(JSON.stringify({strategy,runs:rows.length,found:rows.filter(r=>r.found).length,minPicks:p[0],medianPicks:(p[3]+p[4])/2,maxPicks:p[p.length-1],minutesAt3ClicksPerSecond:p.map(n=>+(n/180).toFixed(1)),minimumInitialCover:Math.min(...rows.map(r=>r.initialMin))}));}
 fs.writeFileSync(path.join(__dirname,'balance-results.json'),JSON.stringify({note:'Simulated immediate noticing of any exposed needle fragment. Actual texture alpha, approximate source sampling. No audience effects. Not a human duration guarantee.',results},null,2));
})();
