import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_PALETTE,BEAD_PALETTE,paletteForTier,rasterToPattern,recolorPattern} from '../src/patterns.js';
import {freePattern,normalizeCampaign,makeLevel,levelPattern} from '../src/play-modes.js';
import {PegGame} from '../src/game.js';
test('extended palettes are nested and retain original color codes',()=>{
 assert.equal(FULL_PALETTE.length,256);assert.equal(new Set(FULL_PALETTE.map(c=>c.hex)).size,256);
 assert.deepEqual(FULL_PALETTE.slice(0,48),BEAD_PALETTE);
 for(const n of [48,96,144,256])assert.equal(paletteForTier(n).length,n);
});
test('raw sampled colors survive reducing and restoring color precision',()=>{
 const data=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++)data.set([i,47,173,255],i*4);
 const original=rasterToPattern({width:16,height:16,data},16,{colorTier:'original'});
 const simple=recolorPattern(original,48),restored=recolorPattern(simple,'original');
 assert.equal(new Set(original.cells).size,256);assert.ok(new Set(simple.cells).size<48);assert.deepEqual(restored.cells,original.cells);
});
test('free mode finishes actual arbitrary colors and repeat gifts freeze that design',()=>{
 const pattern=freePattern(16),g=new PegGame({pattern});assert.equal(g.complete,false);
 g.place('#123456',1,1);g.place('#abcdef',1,2);assert.equal(g.complete,true);assert.deepEqual(g.help(30),[]);
 g.addRounds(1);const actual=g.pieceCells;assert.equal(g.completeRound(),'next');assert.equal(g.complete,false);assert.deepEqual(g.goalCells,actual);
 const loaded=PegGame.fromSnapshot(g.snapshot(),{pattern});assert.deepEqual(loaded.goalCells,actual);loaded.place('#123456',1,1);assert.equal(loaded.complete,false);loaded.place('#abcdef',1,2);assert.equal(loaded.complete,true);assert.equal(loaded.completeRound(),'final');
});
test('campaign levels keep their own board and color data without aliasing edits',()=>{
 const c=normalizeCampaign();const l=makeLevel(c.levels[0].pattern);const p=levelPattern(l);p.cells.fill(null);assert.ok(l.pattern.cells.some(Boolean));assert.ok(normalizeCampaign({levels:[{pattern:{}}]}).levels.length);
});
