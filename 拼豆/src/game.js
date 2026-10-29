const MAX_EFFECT_COUNT = 2304;
const MAX_ROUNDS = 20;
const MAX_TIMED_MS = 3600 * 1000;

function slot(size, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= size || col >= size) return -1;
  return row * size + col;
}

function amount(value, maximum = MAX_EFFECT_COUNT) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : 0;
}

function cleanColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export class PegGame {
  constructor({ pattern, random = Math.random, now = Date.now } = {}) {
    if (!pattern || !Number.isInteger(pattern.size) || pattern.size < 1 || !Array.isArray(pattern.cells) || pattern.cells.length !== pattern.size ** 2) {
      throw new Error('无效拼豆图案');
    }
    this.pattern = pattern;
    this.size = pattern.size;
    this.random = random;
    this.now = now;
    this.placed = Array(this.size ** 2).fill(null);
    this.fallen = [];
    this.traySpilled = false;
    this.trayRestoreStage = 0;
    this.restoreProgress = 0;
    this.trayPresses = 4;
    this.trayDecay = 7;
    this.nextId = 1;
    this.hintHiddenUntil = 0;
    this.tweezersLockedUntil = 0;
    this.penUntil = 0;
    this.penCapacity = 5;
    this.requiredRounds = 1;
    this.completedRounds = 0;
    this.replayCells = null;
  }

  get isFree(){return this.pattern.mode==='free'||this.pattern.id==='free';}
  get goalCells(){return this.isFree ? this.replayCells||this.pattern.cells : this.pattern.cells;}
  get pieceCells(){return this.placed.map(bead=>bead?.color||null);}
  get errors(){
    if(this.isFree&&!this.replayCells)return [];
    return this.placed.flatMap((bead,index)=>bead&&bead.color!==this.goalCells[index]?[{id:bead.id,row:bead.row,col:bead.col,type:this.goalCells[index]?'wrong':'extra'}]:[]);
  }

  get complete() {
    if (this.traySpilled || this.fallen.length) return false;
    if(this.isFree&&!this.replayCells)return this.placed.some(Boolean);
    for (let i = 0; i < this.placed.length; i++) {
      const goal = cleanColor(this.goalCells[i]);
      const actual = this.placed[i]?.color ?? null;
      if (goal !== actual) return false;
    }
    return true;
  }

  get correctCount() {
    if(this.isFree&&!this.replayCells)return this.placed.filter(Boolean).length;
    let count = 0;
    for (let i = 0; i < this.placed.length; i++) {
      if (this.placed[i] && this.placed[i].color === cleanColor(this.goalCells[i])) count++;
    }
    return count;
  }

  get targetCount() { return this.goalCells.filter(Boolean).length; }
  get hintVisible() { return this.now() >= this.hintHiddenUntil; }
  get tweezersAvailable() { return this.now() >= this.tweezersLockedUntil; }
  get penAvailable() { return this.now() < this.penUntil; }

  place(color, row, col) {
    const index = slot(this.size, row, col);
    const hex = cleanColor(color);
    if (index < 0 || !hex || this.placed[index] || this.traySpilled) return null;
    const bead = { id: `b${this.nextId++}`, row, col, color: hex };
    this.placed[index] = bead;
    return bead;
  }

  remove(row, col) {
    const index = slot(this.size, row, col);
    if (index < 0 || !this.placed[index]) return null;
    const bead = this.placed[index];
    this.placed[index] = null;
    return bead;
  }

  fall(id, pose) {
    const index=this.placed.findIndex(bead=>bead?.id===id);
    if(index<0)return null;
    const bead=this.placed[index];this.placed[index]=null;
    const fallen={...bead,pose:validPose(pose)?structuredClone(pose):{x:bead.col-(this.size-1)/2,y:.21,z:bead.row-(this.size-1)/2,rotation:{x:0,y:0,z:0,w:1}}};
    this.fallen.push(fallen);return fallen;
  }

  pickupFallen(id) {
    const index=this.fallen.findIndex(bead=>bead.id===id);if(index<0)return null;
    return this.fallen.splice(index,1)[0];
  }

  updateFallenPose(id,pose) {
    const bead=this.fallen.find(item=>item.id===id);if(bead&&validPose(pose))bead.pose={x:pose.x,y:pose.y,z:pose.z,rotation:{...pose.rotation}};
  }

  help(count) {
    if(this.isFree)return [];
    const changes = [];
    const limit = amount(count);
    // 随机挑选缺失或错色的位置，避免总是从左上角按行往下补。
    const candidates = [];
    for (let i = 0; i < this.placed.length; i++) {
      const color = cleanColor(this.pattern.cells[i]);
      if (color && this.placed[i]?.color !== color) candidates.push(i);
    }
    while (candidates.length && changes.length < limit) {
      const pick = Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length));
      const i = candidates.splice(pick, 1)[0];
      const color = cleanColor(this.pattern.cells[i]);
      const old = this.placed[i];
      const bead = { id: `b${this.nextId++}`, row: Math.floor(i / this.size), col: i % this.size, color };
      this.placed[i] = bead;
      changes.push({ ...bead, oldId: old?.id ?? null });
    }
    return changes;
  }

  removeRandom(count) {
    const changes = [];
    for (let n = 0, limit = amount(count); n < limit; n++) {
      const indices = this.placed.flatMap((bead, index) => bead ? [index] : []);
      if (!indices.length) break;
      const index = indices[Math.min(indices.length - 1, Math.floor(this.random() * indices.length))];
      changes.push(this.placed[index]);
      this.placed[index] = null;
    }
    return changes;
  }

  swapRandom(count, colors) {
    const palette = Array.isArray(colors) ? colors.map(cleanColor).filter(Boolean) : [];
    const changes = [];
    if (palette.length < 2) return changes;
    const available = this.placed.flatMap((bead, index) => bead ? [index] : []);
    for (let n = 0, limit = amount(count); n < limit && available.length; n++) {
      const selected = Math.min(available.length - 1, Math.floor(this.random() * available.length));
      const index = available.splice(selected, 1)[0];
      const bead = this.placed[index];
      const alternatives = palette.filter(hex => hex !== bead.color);
      if (!alternatives.length) break;
      bead.color = alternatives[Math.min(alternatives.length - 1, Math.floor(this.random() * alternatives.length))];
      changes.push({ ...bead });
    }
    return changes;
  }

  // 计时效果按礼物逐个累加：在剩余时间之后继续延长，单项剩余时间最多 1 小时。
  extendUntil(until, seconds) {
    const now = this.now();
    return Math.min(now + MAX_TIMED_MS, Math.max(until, now) + amount(seconds, 3600) * 1000);
  }
  hideHint(seconds) { this.hintHiddenUntil = this.extendUntil(this.hintHiddenUntil, seconds); }
  confiscate(seconds) { this.tweezersLockedUntil = this.extendUntil(this.tweezersLockedUntil, seconds); }
  grantPen(seconds,capacity=5) {
    const next=Math.max(2,Math.min(20,amount(capacity,20)||5));
    // 升级笔仍生效时再送，容量取较大一档，不会被低档礼物降级。
    this.penCapacity=this.penAvailable?Math.max(this.penCapacity,next):next;
    this.penUntil = this.extendUntil(this.penUntil, seconds);
  }
  addRounds(count) {
    const next = Math.min(MAX_ROUNDS, this.requiredRounds + amount(count, MAX_ROUNDS));
    if (next === this.requiredRounds) return false;
    const wasFinished = this.completedRounds >= this.requiredRounds;
    this.requiredRounds = next;
    if (wasFinished) this.placed = Array(this.size ** 2).fill(null);
    return wasFinished;
  }

  spill({presses=4,decay=7}={}) {
    if (this.traySpilled) return false;
    this.traySpilled = true;
    this.trayRestoreStage = 0;
    this.restoreProgress = 0;
    this.trayPresses=Number.isInteger(presses)?Math.max(2,Math.min(50,presses)):4;
    this.trayDecay=Number.isFinite(decay)?Math.max(0,Math.min(50,decay)):7;
    return true;
  }

  pressRestore({ repeat = false } = {}) {
    if (repeat || !this.traySpilled) return 0;
    this.restoreProgress += 100/this.trayPresses;
    if (this.restoreProgress < 100-1e-8) return 0;
    this.restoreProgress = 0;
    this.trayRestoreStage++;
    if (this.trayRestoreStage >= 5) this.traySpilled = false;
    return this.trayRestoreStage;
  }

  tick(seconds) {
    if (!this.traySpilled) return;
    const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 1)) : 0;
    this.restoreProgress = Math.max(0, this.restoreProgress - this.trayDecay * dt);
  }

  completeRound() {
    if (!this.complete || this.completedRounds >= this.requiredRounds) return false;
    if(this.isFree&&!this.replayCells)this.replayCells=this.pieceCells;
    this.completedRounds++;
    if (this.completedRounds < this.requiredRounds) {
      this.placed = Array(this.size ** 2).fill(null);
      return 'next';
    }
    return 'final';
  }

  snapshot() {
    return {
      version: 3, patternId: this.pattern.id, size: this.size,
      replayCells:this.replayCells,
      placed: this.placed.map(bead => bead ? { ...bead } : null),
      fallen: this.fallen.map(bead=>({...bead,pose:structuredClone(bead.pose)})),
      traySpilled: this.traySpilled, trayRestoreStage: this.trayRestoreStage,
      restoreProgress: this.restoreProgress, nextId: this.nextId,
      trayPresses:this.trayPresses,trayDecay:this.trayDecay,penCapacity:this.penCapacity,
      hintHiddenUntil: this.hintHiddenUntil, tweezersLockedUntil: this.tweezersLockedUntil,
      penUntil: this.penUntil, requiredRounds: this.requiredRounds, completedRounds: this.completedRounds
    };
  }

  static fromSnapshot(saved, options) {
    const game = new PegGame(options);
    if (!saved || ![1, 2, 3].includes(saved.version) || saved.size !== game.size || saved.patternId !== game.pattern.id || !Array.isArray(saved.placed) || saved.placed.length !== game.placed.length) return game;
    const valid = saved.placed.every((bead, index) => !bead ||
      (typeof bead.id === 'string' && cleanColor(bead.color) && bead.row === Math.floor(index / game.size) && bead.col === index % game.size));
    if (!valid) return game;
    if(game.isFree&&Array.isArray(saved.replayCells)&&saved.replayCells.length===game.size**2&&saved.replayCells.every(c=>c===null||cleanColor(c)))game.replayCells=[...saved.replayCells];
    game.placed = saved.placed.map(bead => bead ? { ...bead, color: cleanColor(bead.color) } : null);
    const ids=new Set(game.placed.filter(Boolean).map(bead=>bead.id));
    for(const bead of Array.isArray(saved.fallen)?saved.fallen.slice(0,2304):[]){if(!bead||typeof bead.id!=='string'||ids.has(bead.id)||!cleanColor(bead.color)||slot(game.size,bead.row,bead.col)<0||!validPose(bead.pose))continue;ids.add(bead.id);game.fallen.push({...bead,pose:structuredClone(bead.pose)});}
    game.traySpilled = saved.version >= 2 ? saved.traySpilled === true : Array.isArray(saved.spilledIds) && saved.spilledIds.length > 0;
    game.trayRestoreStage = Number.isSafeInteger(saved.trayRestoreStage) ? Math.max(0, Math.min(game.traySpilled?4:5, saved.trayRestoreStage)) : 0;
    game.restoreProgress = Number.isFinite(saved.restoreProgress) ? Math.max(0, Math.min(99.999999, saved.restoreProgress)) : 0;
    game.nextId = Number.isSafeInteger(saved.nextId) ? Math.max(1, saved.nextId) : 1;
    game.trayPresses=Number.isInteger(saved.trayPresses)?Math.max(2,Math.min(50,saved.trayPresses)):4;
    game.trayDecay=Number.isFinite(saved.trayDecay)?Math.max(0,Math.min(50,saved.trayDecay)):7;
    game.penCapacity=Number.isInteger(saved.penCapacity)?Math.max(2,Math.min(20,saved.penCapacity)):5;
    for (const key of ['hintHiddenUntil', 'tweezersLockedUntil', 'penUntil']) {
      game[key] = Number.isFinite(saved[key]) ? Math.max(0, saved[key]) : 0;
    }
    game.requiredRounds = Number.isSafeInteger(saved.requiredRounds) ? Math.max(1, Math.min(MAX_ROUNDS, saved.requiredRounds)) : 1;
    game.completedRounds = Number.isSafeInteger(saved.completedRounds) ? Math.max(0, Math.min(game.requiredRounds, saved.completedRounds)) : 0;
    return game;
  }
}

function validPose(pose) {
  return pose&&['x','y','z'].every(key=>Number.isFinite(pose[key])&&Math.abs(pose[key])<1000)&&pose.rotation&&['x','y','z','w'].every(key=>Number.isFinite(pose.rotation[key])&&Math.abs(pose.rotation[key])<=1.001);
}
