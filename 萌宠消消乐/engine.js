(function (root) {
  'use strict';
  const SIZE = 8, TYPES = 6;
  const DIFFICULTIES={standard:{base:60,cap:Infinity,reward:1000},hard:{base:40,cap:3,reward:600},hell:{base:30,cap:2,reward:400}};
  class MatchGame {
    constructor(random = Math.random,difficulty='hard') { this.random = random; this.serial = 0; this.difficulty=DIFFICULTIES[difficulty]?difficulty:'hard';this.reset(); }
    setDifficulty(value){if(!DIFFICULTIES[value])return false;this.difficulty=value;return true;}
    get profile(){return DIFFICULTIES[this.difficulty];}
    tile(type) { return { id: ++this.serial, type: type ?? Math.floor(this.random() * TYPES), special: '', ice: 0, chain:0, lockLife:0 }; }
    copy() { return this.board.map(t => t ? { ...t } : null); }
    reset() {
      this.score = 0; this.moves = 0; this.stage = 1; this.bestCombo = 0;
      this.collected = [0, 0, 0, 0, 0, 0]; this.baseline = [0, 0, 0, 0, 0, 0]; this.goalTypes = [2,5]; this.target = 18; this.status = 'playing';
      this.board = [];
      for (let i = 0; i < 64; i++) {
        let t;
        do { t = this.tile(); } while ((i % 8 > 1 && t.type === this.board[i - 1].type && t.type === this.board[i - 2].type) || (i >= 16 && t.type === this.board[i - 8].type && t.type === this.board[i - 16].type));
        this.board.push(t);
      }
      if (!this.possibleMoves().length) this.shuffle();
      return this.state();
    }
    state() { return { board: this.copy(), score: this.score, moves: this.moves, collected: [...this.collected], status: this.status, stage:this.stage, goalTypes:[...this.goalTypes], baseline:[...this.baseline], target:this.target, bestCombo:this.bestCombo,difficulty:this.difficulty,goalReward:this.profile.reward }; }
    adjacent(a, b) { return a >= 0 && b >= 0 && a < 64 && b < 64 && Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) === 1; }
    groups() {
      const groups = [];
      for (let axis = 0; axis < 2; axis++) for (let line = 0; line < SIZE; line++) {
        let run = [];
        const flush = () => { if (run.length >= 3) groups.push({ cells: [...run], axis }); run = []; };
        for (let v = 0; v <= SIZE; v++) {
          const i = axis === 0 ? line * 8 + v : v * 8 + line;
          const t = v < 8 ? this.board[i] : null;
          if (!t || t.special === 'rainbow' || (run.length && this.board[run[0]].type !== t.type)) flush();
          if (t && t.special !== 'rainbow') run.push(i);
        }
        flush();
      }
      return groups;
    }
    possibleMoves() {
      const result = [];
      for (let a = 0; a < 64; a++) for (const b of [a % 8 < 7 ? a + 1 : -1, a + 8 < 64 ? a + 8 : -1]) {
        if (b < 0 || this.board[a].ice || this.board[b].ice || this.board[a].chain || this.board[b].chain) continue;
        if (this.board[a].special === 'rainbow' || this.board[b].special === 'rainbow') { result.push([a, b]); continue; }
        [this.board[a], this.board[b]] = [this.board[b], this.board[a]];
        if (this.groups().length) result.push([a, b]);
        [this.board[a], this.board[b]] = [this.board[b], this.board[a]];
      }
      return result;
    }
    shuffle() {
      const items = this.board.map(t => ({ ...t }));
      for (let tries = 0; tries < 300; tries++) {
        for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
        this.board = items;
        if (!this.groups().length && this.possibleMoves().length) return;
      }
      // A fresh stable board is the bounded fallback for pathological shuffles.
      this.board = [];
      for (let i = 0; i < 64; i++) {
        let type = Math.floor(this.random() * 6);
        while ((i % 8 > 1 && this.board[i - 1].type === type && this.board[i - 2].type === type) || (i >= 16 && this.board[i - 8].type === type && this.board[i - 16].type === type)) type = (type + 1) % 6;
        this.board.push(this.tile(type));
      }
    }
    finish() {
      if (this.goalTypes.every(t=>this.collected[t]-this.baseline[t]>=this.target)) {
        this.stage++; this.score+=this.profile.reward; this.baseline=[...this.collected];
        this.goalTypes=[(this.stage+1)%6,(this.stage+4)%6]; this.target=Math.min(36,16+this.stage*2);
      }
    }
    resolve(frames, preferred = [], initial = null) {
      let combo = 0, forced = initial;
      for (let guard = 0; guard < 80; guard++) {
        const groups = this.groups();
        if (!forced && !groups.length) break;
        combo++;
        const clear = new Set(forced || groups.flatMap(g => g.cells));
        const create = new Map();
        if (!forced) for (const g of groups.filter(g => g.cells.length >= 4).sort((a,b) => b.cells.length - a.cells.length)) {
          const index = preferred.find(i => g.cells.includes(i)) ?? g.cells[Math.floor(g.cells.length / 2)];
          if (!create.has(index)) create.set(index, g.cells.length >= 5 ? 'rainbow' : g.axis === 0 ? 'row' : 'col');
        }
        forced = null;
        // Expand special effects once per token, including specials hit by another effect.
        const activated = new Set();
        for (let changed = true; changed;) {
          changed = false;
          for (const i of [...clear]) {
            const t = this.board[i];
            if (!t || !t.special || activated.has(i) || create.has(i)) continue;
            activated.add(i); changed = true;
            if (t.special === 'rainbow') {
              const type = Math.floor(this.random() * 6);
              this.board.forEach((x,j) => { if (x?.type === type) clear.add(j); });
            } else for (let n=0;n<8;n++) clear.add(t.special === 'row' ? Math.floor(i/8)*8+n : n*8+i%8);
          }
        }
        for (const i of create.keys()) clear.delete(i);
        const ids = [...clear].map(i => this.board[i]?.id).filter(Boolean);
        for (const i of clear) {
          const t = this.board[i]; if (!t) continue;
          this.collected[t.type]++; this.score += this.profile.base * Math.min(combo,this.profile.cap);
          for (const j of [i-1,i+1,i-8,i+8]) if (this.adjacent(i,j) && this.board[j]) {
            if(this.board[j].ice)this.board[j].ice=0;
            if(this.board[j].chain)this.board[j].chain--;
          }
        }
        frames.push({ kind: 'clear', ids, combo, state: this.state() });
        for (const [i, special] of create) this.board[i].special = special;
        for (const i of clear) this.board[i] = null;
        for (let c=0;c<8;c++) {
          const column = [];
          for (let r=7;r>=0;r--) if (this.board[r*8+c]) column.push(this.board[r*8+c]);
          for (let r=7;r>=0;r--) this.board[r*8+c] = column[7-r] || this.tile();
        }
        frames.push({ kind: 'drop', combo, state: this.state() });
        preferred = [];
      }
      // Extremely rare random cascades are settled into a stable playable state.
      if (this.groups().length) { this.shuffle(); frames.push({kind:'shuffle', state:this.state()}); }
      this.bestCombo=Math.max(this.bestCombo,combo);
      this.finish();
      if (this.status === 'playing' && !this.possibleMoves().length) {
        this.shuffle(); frames.push({ kind: 'shuffle', state: this.state() });
      }
      return combo;
    }
    swap(a, b) {
      const frames = [];
      if (this.status !== 'playing' || !this.adjacent(a,b) || this.board[a].ice || this.board[b].ice || this.board[a].chain || this.board[b].chain) return { valid: false, frames, reason:'frozen' };
      [this.board[a],this.board[b]] = [this.board[b],this.board[a]];
      frames.push({ kind:'swap', state:this.state() });
      const rainbow = [a,b].find(i => this.board[i].special === 'rainbow');
      if (rainbow === undefined && !this.groups().length) {
        [this.board[a],this.board[b]] = [this.board[b],this.board[a]];
        frames.push({ kind:'invalid', state:this.state() });
        return {valid:false, frames, reason:'no-match'};
      }
      this.moves++;
      let initial = null;
      if (rainbow !== undefined) {
        const other = rainbow === a ? b : a;
        initial = this.board.map((t,i) => t.type === this.board[other].type || i===rainbow ? i : -1).filter(i=>i>=0);
        this.board[rainbow].special='';
      }
      const combo = this.resolve(frames,[b,a],initial);
      this.board.forEach(t => { if(t.ice)t.ice--;if(t.lockLife&&!--t.lockLife)t.chain=0; });
      return { valid:true, frames, combo, state:this.state() };
    }
    effect(kind) {
      if (this.status !== 'playing') return null;
      const frames=[];
      if (kind==='ice') {
        const choices=this.board.map((t,i)=>!t.ice&&!t.chain ? i : -1).filter(i=>i>=0);
        for(let n=0;n<5 && choices.length;n++) {
          const [i]=choices.splice(Math.floor(this.random()*choices.length),1); this.board[i].ice=3;
        }
        // Frozen cells never leave the player without a move.
        this.ensureMove();
      } else if(kind==='chain') {
        const choices=this.board.filter(t=>!t.ice&&!t.chain);
        for(let n=0;n<6&&choices.length;n++){const[t]=choices.splice(Math.floor(this.random()*choices.length),1);t.chain=2;t.lockLife=6;}
        this.ensureMove();
      } else if(kind==='chaos') {
        this.shuffle();frames.push({kind:'scramble',state:this.state()});
      } else if(kind==='cleanse') {
        this.board.forEach(t=>{t.ice=0;t.chain=0;t.lockLife=0;});
      } else if(kind==='bomb') {
        const row=1+Math.floor(this.random()*6), col=1+Math.floor(this.random()*6), cells=[];
        for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) cells.push((row+dr)*8+col+dc);
        this.resolve(frames,[],cells);
      } else if(kind==='rainbow') {
        const candidates=this.board.filter(t=>!t.ice && !t.chain && !t.special);
        if(candidates.length) candidates[Math.floor(this.random()*candidates.length)].special='rainbow';
      }
      return {frames,state:this.state()};
    }
    ensureMove(){
      if(this.possibleMoves().length)return;
      for(const t of this.board){t.ice=0;t.chain=0;t.lockLife=0;if(this.possibleMoves().length)return;}
      this.shuffle();
    }
  }
  root.MatchGame=MatchGame;
  if(typeof module!=='undefined') module.exports={MatchGame};
})(typeof window!=='undefined'?window:globalThis);
