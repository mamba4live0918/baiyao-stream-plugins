(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./levels.js'),require('./rigid-physics.js'),require('./tricks.js'));
  else root.GelatoEngine = factory(root.GelatoLevels,root.GelatoRigidPhysics,root.GelatoTricks);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LevelModel,RigidPhysics,Tricks) {
  'use strict';
  if (!LevelModel) throw new Error('levels.js must load before the arcade engine.');
  const DEFAULTS = LevelModel.DEFAULT_CONFIG, MODES = LevelModel.MODES, LEVELS = MODES;
  const modeById = new Map(MODES.map(mode => [mode.id, mode]));
  const STEP = 1 / 120, EPSILON = 0.00001;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  let nextBodyId = 1;

  // Falling rectangles resolve against horizontal surfaces. Successful catches
  // become fixed arcade tiles; this module runs no rigid-body simulation.
  class Game {
    constructor(options = {}) {
      this.width = 1000; this.worldHeight = 820; this.bowlY = 710; this.baseRadius = 28;
      this.reset(options);
    }
    get rowY() { return (Number.isFinite(this.spawnY) ? this.spawnY : 64) - this.cameraY; }
    get rowRadius() {
      const [left, right] = this._viewBounds();
      const factor = this.config.mode === 'giant' ? (this.dropped % 2 === 0 ? this.config.largeScale : this.config.smallScale) : 1;
      return Math.min(this.baseRadius * this.params.size * factor, (right - left - 36) / (this.params.count * 2.06));
    }
    get rowSpacing() { return this.rowRadius * 2.06; }
    get dropStatus() {
      if (this.status === 'won' || this.status === 'lost') return 'ended';
      if (this.status === 'paused') return 'paused';
      if (this._pendingBatch || !this._allResolved() || this._cooldown > 0) return 'settling';
      if (this.attemptsLeft <= 0) return this.status === 'ready' ? 'empty' : 'settling';
      if (this.status === 'ready' || this.nextSpawnIn > EPSILON || this.progressHeight + 1e-7 >= this.goal) return 'waiting';
      if (this.scoops.length + 1 > this.maxScoops) return 'capacity';
      return 'ready';
    }
    get canDrop() { return this.dropStatus === 'ready'; }
    get maxScoops() {
      const [left, right] = this._viewBounds();
      const smallestVariant = this.config.mode === 'giant' ? Math.min(1, this.config.smallScale, this.config.largeScale) : 1;
      const minRadius = Math.max(Number.EPSILON, Math.min(this.baseRadius * .6 * smallestVariant, (right - left - 36) / 2.06));
      // Single catches advance by their full geometric height. Leave room for
      // side-by-side catches as well as the smallest possible future scoop.
      const minRise = minRadius * 1.78;
      const required = Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(this.goal / minRise) * this.bowls.length * 10 + 80);
      // This is only an allowance: no bodies or arrays are preallocated. Keep
      // it through resizes so previously released small scoops do not deadlock.
      this._capacityBudget = Math.max(this._capacityBudget || 240, required);
      return this._capacityBudget;
    }

    reset(options = {}) {
      options = options && typeof options === 'object' ? options : {};
      if (typeof options.random === 'function') this._random = options.random;
      else if (!this._random) this._random = Math.random;
      options = { ...options }; delete options.random;
      if(this.physics)this.physics.destroy();this.physics=null;
      this.physicsMode=Object.prototype.hasOwnProperty.call(options,'physicsMode')?RigidPhysics.mode(options.physicsMode):(this.physicsMode||'arcade');
      this.adhesion=Object.prototype.hasOwnProperty.call(options,'adhesion')?RigidPhysics.strength(options.adhesion):(this.adhesion??.65);
      delete options.physicsMode;delete options.adhesion;
      if (Object.prototype.hasOwnProperty.call(options, 'levels')) {
        this.levels = LevelModel.normalizeList(options.levels); this._legacyBase = null;
      } else if (!this.levels || Object.keys(options).some(key => key !== 'level')) {
        this._legacyBase = Object.assign({}, this._legacyBase || {}, options); delete this._legacyBase.level;
        this.levels = LevelModel.migrateLegacy(this._legacyBase);
      }
      this.totalLevels = this.levels.length;
      this.level = clamp(Math.round(number(options.level, 1)), 1, this.totalLevels);
      this.config = { ...this.levels[this.level - 1] };
      const mode = modeById.get(this.config.mode);
      this.levelSpec = Object.freeze({ ...mode, ...this.config, mechanic: this.config.mode, goal: this.config.targetHeight, tagline: mode.description, hint: mode.description });
      this.params = { count: 1, move: this.config.move, fall: this.config.fall, size: this.config.size, timeRate: 1 };
      this.goal = this.config.targetHeight; this.timeLeft = this.config.duration; this.status = 'ready'; this.lossReason = null;
      this.scoops = []; this.events = []; this.particles = [];
      this.layers = 0; this.height = 0; this.cameraY = 0; this.rowX = 500; this.rowDirection = 1;
      this.dropped = 0; this.lost = 0; this.elapsed = 0; this._accumulator = 0; this._mechanicTime = 0;
      this._cooldown = 0; this._pendingBatch = null; this._winHold = 0; this._resumeStatus = 'ready';
      this._cameraHoldUntil = 0; this._cameraDownWait = 0;
      this.nextSpawnIn = 0; this._spawnWaiting = true;
      this.caught = 0; this.missed = 0; this.plateTargetX = 500; this.movementDirection = 0; this._movementInput = 'pointer';
      this._pointerRawX=500;this.melted=0;this.tricks=new Tricks.Controller(this);
      this._pointerEdge = 0; this._catchOrder = 0; this._lastViewBounds = this._viewBounds();
      this.wind = { direction: 0, strength: 0, nextIn: 0 };
      const centers = [500];
      this.bowls = centers.map((x, index) => ({ id: centers.length === 1 ? 'main' : index === 0 ? 'left' : 'right', x, y: this.bowlY, width: this.config.bowlWidth, velocityX: 0 }));
      this.bowlLayers = this.bowls.map(() => 0);
      this.bowlHeights = this.bowls.map(() => 0); this.progressHeight = 0;
      this.unlimitedAttempts = this.config.attemptMode === 'unlimited';
      this.attemptLimit = this.unlimitedAttempts ? Infinity : this.config.attempts; this.attemptsLeft = this.attemptLimit;
      this._capacityBudget = 240;
      if(this.physicsMode!=='arcade')this.physics=new RigidPhysics.World(this);
      return this;
    }

    drop() {
      if (!this.canDrop) return false;
      const [left, right] = this._spawnBounds(this.rowRadius);
      this.rowX = left + clamp(number(this._random(), .5), 0, 1) * Math.max(0, right - left);
      this._clampRow();
      const radius = this.rowRadius, spacing = radius * 2.06;
      // Camera easing can lag behind a newly caught large scoop. Every birth
      // gets the same full fall clearance as the camera framing, not just a
      // non-overlap margin, even at the shortest automatic spawn interval.
      this.cameraY = Math.max(this.cameraY, this._cameraTarget(radius));
      const batch = this.dropped++;
      if (!this.unlimitedAttempts) this.attemptsLeft--;
      this._pendingBatch = new Set();
      for (let index = 0; index < 1; index++) {
        const x = this.rowX + (index - (this.params.count - 1) / 2) * spacing;
        const body = { id: nextBodyId++, position: { x, y: this.rowY }, velocity: { x: 0, y: 0 }, angle: 0, bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } } };
        const scoop = { body, r: radius, halfHeight: radius * 0.89, flavor: (batch + index) % 6, born: this.elapsed, locked: false,
          hasLanded: false, opacity: 1, stableFor: 0, supportLayer: 0, supportByBowl: this.bowls.map(() => 0), supportIds: [],
          fallCorridor: [left, right], hardIce:this.tricks.icy, meltBaseRadius:radius };
        if(scoop.hardIce)scoop.halfHeight=scoop.r;this._updateBounds(scoop);if(this.physics)this.physics.addScoop(scoop);this.scoops.push(scoop);this._pendingBatch.add(scoop.body.id);
      }
      this._cooldown = 0.22; this._winHold = 0;
      this.nextSpawnIn = this._spawnInterval(); this._spawnWaiting = false;
      this.events.push({ type: 'drop', x: this.rowX, y: this.rowY, count: 1, bodyId: this.scoops[this.scoops.length - 1].body.id, batch });
      return true;
    }

    setPointerTarget(x) {
      if (!Number.isFinite(Number(x))) return false;
      const [left, right] = this._safeDropBounds(this._controlRadius()), [min, max] = this._plateBounds();
      this._pointerRawX=Number(x);const controlX=this.tricks.reversed?left+right-Number(x):Number(x);
      const fraction = right > left ? clamp((controlX - left) / (right - left), 0, 1) : .5;
      // A continuous mapping lets the pointer reach every legal plate position,
      // even when an offset tower needs the plate to extend past a screen edge.
      this.plateTargetX = min + (max - min) * fraction;
      this._pointerEdge = fraction <= EPSILON ? -1 : fraction >= 1 - EPSILON ? 1 : 0;
      this.movementDirection = 0; this._movementInput = 'pointer';
      return this.plateTargetX;
    }
    setMoveDirection(direction) {
      this.movementDirection = Math.sign(number(direction, 0)); this._movementInput = 'keyboard';
      this.plateTargetX = this.bowls[0].x;
      return this.movementDirection;
    }

    start() {
      if (this.status === 'ready' && !this.unlimitedAttempts && this.attemptsLeft <= 0) return false;
      if (this.status === 'ready') { this.status = 'playing'; this._mechanicTime=0; }
      return this.status;
    }

    pause() {
      if (this.status === 'paused') return this.resume();
      if (this.status === 'ready' || this.status === 'playing') { this._resumeStatus = this.status; this.status = 'paused'; }
      return this.status;
    }
    resume() { if (this.status === 'paused') this.status = this._resumeStatus; return this.status; }
    nextLevel() { if (this.status !== 'won' || this.level >= this.totalLevels) return false; this.reset({ level: this.level + 1 }); return true; }

    effect(action, value, options={}) {
      if(['won','lost'].includes(this.status))return action==='blast'?0:false;
      if(action!=='blast'&&Tricks.DEFINITIONS[action])return this.tricks.apply(action,value,options);
      const defaults = { count_add: 1, count_sub: 1, attempts_add: 1, attempts_sub: 1, blast: 100, eat: 2 };
      const amount = Math.abs(number(value, defaults[action] || 20)), p = this.params;
      switch (action) {
        case 'count_add': return this._changeAttempts(Math.round(amount));
        case 'count_sub': return this._changeAttempts(-Math.round(amount));
        case 'move_faster': p.move = clamp(p.move + this.config.move * amount / 100, 40, 5000); break;
        case 'move_slower': p.move = clamp(p.move - this.config.move * amount / 100, 40, 5000); break;
        case 'fall_faster': p.fall = clamp(p.fall + amount / 100, 0.3, 3); break;
        case 'fall_slower': p.fall = clamp(p.fall - amount / 100, 0.3, 3); break;
        case 'time_faster': p.timeRate = clamp(p.timeRate + amount / 100, 0.25, 3); break;
        case 'time_slower': p.timeRate = clamp(p.timeRate - amount / 100, 0.25, 3); break;
        case 'size_up': p.size = clamp(p.size + amount / 100, 0.6, 1.5); break;
        case 'size_down': p.size = clamp(p.size - amount / 100, 0.6, 1.5); break;
        case 'attempts_add': return this._changeAttempts(Math.round(amount));
        case 'attempts_sub': return this._changeAttempts(-Math.round(amount));
        case 'eat': return this._eat(Math.round(amount));
        case 'blast': return this._blast(amount);
        default: return false;
      }
      this._clampRow(); return true;
    }
    _updatePlateWidth(){
      let radius=this.rowRadius;for(const s of this.scoops)if(!s.blasted&&!s.missed)radius=Math.max(radius,s.r);
      const effect=this.tricks.effects.plate;
      const factor=effect?(effect.action==='plate_narrow'?1-effect.value/100:1+effect.value/100):1;
      const width=Math.max(radius*3,Math.min(1000,this.config.bowlWidth*factor));
      if(Math.abs(width-this.bowls[0].width)>1e-7){this.bowls[0].width=width;if(this.physics)this.physics.resizePlate(width);}
    }
    _meltScoops(rate,dt){
      const locked=this.scoops.filter(s=>s.locked&&!s.blasted&&!s.missed).sort((a,b)=>b.body.bounds.max.y-a.body.bounds.max.y);
      const removed=new Set();
      for(const s of this.scoops){
        if(s.blasted||s.missed)continue;
        if(!s.meltBaseRadius)s.meltBaseRadius=s.r;
        const next=Math.max(0,s.r-s.meltBaseRadius*rate*dt);
        if(next<=.5){removed.add(s);this.melted++;this.events.push({type:'melt',x:s.body.position.x,y:s.body.position.y,r:s.r,bodyId:s.body.id});if(this.physics)this.physics.removeScoop(s);}
        else if(this.physics)this.physics.resizeScoop(s,next);
        else{s.r=next;s.halfHeight=next*.89;this._updateBounds(s);}
      }
      this.scoops=this.scoops.filter(s=>!removed.has(s));
      if(this.physics){this.physics.wake();return;}
      // Stable arcade stacks compress as their scoops shrink. Only a lost
      // horizontal contact or a vanished parent releases a scoop to gravity.
      const surfaces=new Map(this._bowlSurfaces().map(x=>[x.id,x]));let released=false;
      for(const s of locked){
        if(removed.has(s))continue;
        const hits=s.supportIds.map(id=>surfaces.get(id)).filter(surface=>surface&&this._overlaps(s,surface));
        if(hits.length&&this._assignSupport(s,hits)){s.body.position.y=Math.min(...hits.map(x=>x.y))-s.halfHeight;this._updateBounds(s);surfaces.set(s.body.id,this._scoopSurface(s));}
        else{s.locked=false;s.stableFor=0;s.supportLayer=0;s.supportByBowl=[0];s.supportIds=[];s.body.velocity={x:0,y:0};released=true;}
      }
      this._refreshScore();
      if(released){this._spawnWaiting=false;this.nextSpawnIn=this._spawnInterval();}
    }
    _setIce(enabled){
      const alive=this.scoops.filter(s=>!s.blasted&&!s.missed);
      for(const s of alive)s.hardIce=enabled;
      if(enabled&&!this.physics){
        const oldPending=this._pendingBatch,remapped=new Set();
        this.physics=new RigidPhysics.World(this);
        for(const s of this.scoops){
          const id=s.body.id,velocity={...s.body.velocity};this.physics.addScoop(s);
          this.physics.setVelocity(s,velocity);if(oldPending?.has(id))remapped.add(s.body.id);
          s.locked=false;s.supportLayer=0;s.supportByBowl=[0];s.supportIds=[];
        }
        this._pendingBatch=oldPending?remapped:null;
      }else if(!enabled&&this.physicsMode==='arcade'&&this.physics){
        const oldPending=this._pendingBatch,remapped=new Set();
        const snapshots=this.scoops.map(s=>({s,id:s.body.id,x:s.body.position.x,y:s.body.position.y,vx:s.body.velocity.x*60,vy:s.body.velocity.y*60}));
        this.physics.destroy();this.physics=null;
        for(const {s,id,x,y,vx,vy} of snapshots){
          s.body={id:nextBodyId++,position:{x,y},velocity:{x:vx,y:vy},angle:0,bounds:{min:{},max:{}}};
          s.physical=false;s.hardIce=false;s.halfHeight=s.r*.89;s.locked=false;s.supportLayer=0;s.supportByBowl=[0];s.supportIds=[];
          this._updateBounds(s);if(oldPending?.has(id))remapped.add(s.body.id);
        }
        this._pendingBatch=oldPending?remapped:null;
      }else if(this.physics)for(const s of alive)this.physics.setMaterial(s);
      if(this.scoops.length)this._reconcileSupports();else this._refreshScore();this.events.push({type:'material',hardIce:enabled});
    }
    _changeAttempts(change) {
      if (this.unlimitedAttempts) return 0;
      const previous = this.attemptsLeft;
      this.attemptsLeft = clamp(previous + change, 0, 100000); this.attemptLimit = this.dropped + this.attemptsLeft;
      return Math.abs(this.attemptsLeft - previous);
    }

    step(dtSeconds) {
      const dt = clamp(number(dtSeconds, 0), 0, 0.25);
      if (!dt || this.status === 'paused') return;
      if(this.physics&&(this.status==='won'||this.status==='lost'))return;
      this.elapsed += dt; this._cooldown = Math.max(0, this._cooldown - dt);
      this._accumulator += dt;
      while (this._accumulator >= STEP - EPSILON) { this.tricks.step(STEP);this._updatePlateWidth();this._advanceMechanics(STEP); this._advanceFalling(STEP); this._accumulator -= STEP; }
      if (this._pendingBatch) {
        const pending = this.scoops.filter(scoop => this._pendingBatch.has(scoop.body.id));
        if (pending.every(scoop => this._resolved(scoop))) this._pendingBatch = null;
      }
      if (this.status === 'playing') {
        this.timeLeft = Math.max(0, this.timeLeft - dt * this.params.timeRate);
        this._winHold = this.progressHeight + 1e-7 >= this.goal ? this._winHold + dt : 0;
        if (this._winHold >= 0.35 && this.timeLeft > 0) {
          this.status = 'won'; this.events.push({ type: 'win', x: 500, y: this.bowlY - this.height, layers: this.layers, height: this.progressHeight, level: this.level });
        } else if (this.timeLeft <= EPSILON) this._lose('timeout');
        else if (!this.unlimitedAttempts && this.attemptsLeft <= 0 && !this._pendingBatch && this._cooldown <= 0
          && this.progressHeight + 1e-7 < this.goal && this.scoops.every(scoop => this._resolved(scoop))) this._lose('attempts');
      }
      this._advanceAutomatic(dt);
      this._updateCamera(dt);
    }
    _lose(reason) {
      if (reason === 'timeout') this.timeLeft = 0;
      this.status = 'lost'; this.lossReason = reason; this.events.push({ type: 'lose', reason, layers: this.layers });
    }
    _resolved(scoop) { return this.physics?this.physics.resolved(scoop):scoop.locked || scoop.blasted || scoop.missed || scoop.body.bounds.min.y > this.bowlY + 5; }
    _allResolved() { return this.scoops.every(scoop => this._resolved(scoop)); }
    _spawnInterval() { return clamp(number(this.config.spawnInterval, .65), .15, 5); }
    _advanceAutomatic(dt) {
      if (this.status !== 'playing' || this.progressHeight + 1e-7 >= this.goal) return;
      if (this._pendingBatch || !this._allResolved()) {
        this._spawnWaiting = false; this.nextSpawnIn = this._spawnInterval(); return;
      }
      if (!this._spawnWaiting) { this._spawnWaiting = true; this.nextSpawnIn = this._spawnInterval(); return; }
      this.nextSpawnIn = Math.max(0, this.nextSpawnIn - dt);
      if (this.nextSpawnIn <= EPSILON) this.drop();
    }

    _advanceMechanics(dt) {
      const active = this.status === 'ready' || this.status === 'playing';
      if (active) this._mechanicTime += dt;
      const bowl = this.bowls[0], [min, max] = this._plateBounds();
      const view = this._viewBounds();
      // Only an actual viewport resize remaps the assembly immediately. New
      // sizes and a changed tower tip must still obey the player's plate speed.
      if (view.some((value, index) => value !== this._lastViewBounds[index])) {
        this._translatePlate(clamp(bowl.x, min, max) - bowl.x, 0);
        this._lastViewBounds = view;
      }
      bowl.previousX = bowl.x;
      for (const scoop of this.scoops) if (scoop.locked) { scoop._stepPreviousX = scoop.body.position.x; scoop._stepLockedAt = 0; }
      let delta = 0;
      if (active&&!this.tricks.frozen) {
        const desired = this._movementInput === 'keyboard' ? bowl.x + this.movementDirection * (this.tricks.reversed?-1:1) * this.params.move * dt
          : this._pointerEdge < 0 ? min : this._pointerEdge > 0 ? max : this.plateTargetX;
        if(this.physics){
          const acceleration=this._plateAcceleration(),distance=clamp(desired,min,max)-bowl.x;
          const targetSpeed=this._movementInput==='keyboard'?this.movementDirection*this.params.move:Math.sign(distance)*Math.min(this.params.move,Math.sqrt(2*acceleration*Math.abs(distance)));
          const velocity=bowl.velocityX+clamp(targetSpeed-bowl.velocityX,-acceleration*dt,acceleration*dt);
          delta=clamp(velocity*dt,min-bowl.x,max-bowl.x);
          if(this._movementInput!=='keyboard'&&Math.sign(delta)===Math.sign(distance)&&Math.abs(delta)>Math.abs(distance))delta=distance;
        }else delta = clamp(clamp(desired, min, max) - bowl.x, -this.params.move * dt, this.params.move * dt);
      }
      this._translatePlate(delta, dt);
      bowl.stepDelta = bowl.x - bowl.previousX;
      if (this._movementInput === 'keyboard') this.plateTargetX = bowl.x;
      this.wind.direction=0;this.wind.strength=0;this.wind.force=0;
      if (this.config.mode === 'wind') {
        this.wind.force=this.config.windForce;
        const period = this.config.windPeriod, duration = this.config.gustDuration;
        const local = this._mechanicTime % period;
        const blowing = local < duration && this.config.windForce > 0;
        this.wind.direction = blowing ? (Math.floor(this._mechanicTime / period) % 2 === 0 ? 1 : -1) : 0;
        this.wind.strength = blowing ? Math.min(1,local/Math.min(.18,duration*.25),(duration-local)/Math.min(.3,duration*.35))*(.75+.25*Math.sin(local/duration*Math.PI)) : 0;
        this.wind.nextIn = blowing ? duration-local : period-local;
      }
      const gust=this.tricks.gust;if(gust){this.wind.direction=gust.action==='gust_left'?-1:1;this.wind.strength=1;this.wind.force=gust.value;this.wind.nextIn=gust.remaining;}
    }
    _controlRadius() {
      const falling = this.scoops.find(scoop => !scoop.locked && !scoop.blasted && !scoop.missed && !scoop.hasLanded);
      return falling ? falling.r : this.rowRadius;
    }
    _plateAcceleration(){return this.physicsMode==='sticky'?700+this.adhesion*1000:500;}
    _catchOffset() {
      if(this.physics)return 0;
      let tip = null;
      for (const scoop of this.scoops) if (scoop.locked && !scoop.blasted && scoop.supportByBowl[0] > 0) {
        const y = scoop.body.bounds.min.y;
        if (!tip || y < tip.body.bounds.min.y - EPSILON || Math.abs(y - tip.body.bounds.min.y) <= EPSILON
          && number(scoop.catchOrder, scoop.body.id) > number(tip.catchOrder, tip.body.id)) tip = scoop;
      }
      return tip ? tip.body.position.x - this.bowls[0].x : 0;
    }
    _safeDropBounds(radius) {
      const [left, right] = this._viewBounds(), margin = radius + 18;
      return right - left >= margin * 2 ? [left + margin, right - margin] : [(left + right) / 2, (left + right) / 2];
    }
    _plateBounds(radius = this._controlRadius()) {
      const [left, right] = this._viewBounds(), [safeLeft, safeRight] = this._safeDropBounds(radius), offset = this._catchOffset();
      const reachLeft = safeLeft - offset, reachRight = safeRight - offset;
      // The plate may be partly clipped. Keeping its entire rim (or a wide
      // lower branch) onscreen previously made the highest catch surface unable
      // to reach the random edge drops. Its actual collision width is unchanged.
      const min = Math.max(left, reachLeft), max = Math.min(right, reachRight);
      // A severe resize can leave an offset tip beyond the viewport altogether.
      // In that case preserve control of the visible tip, even if the plate's
      // center must temporarily sit beyond the edge.
      return min <= max ? [min, max] : [reachLeft, reachRight];
    }
    _spawnBounds(radius = this._controlRadius()) {
      const [safeLeft, safeRight] = this._safeDropBounds(radius), [min, max] = this._plateBounds(radius), offset = this._catchOffset();
      const left=Math.max(safeLeft,min+offset),right=Math.min(safeRight,max+offset);
      if(!this.physics)return [left,right];
      const tip=this.scoops.filter(s=>!s.blasted&&!s.missed&&(s._physicalDepth>0||s.locked)).sort((a,b)=>a.body.bounds.min.y-b.body.bounds.min.y)[0];
      const top=tip?tip.body.bounds.min.y:this.bowlY,center=clamp(tip?tip.body.position.x:this.bowls[0].x,left,right);
      const birth=(Number.isFinite(this.spawnY)?this.spawnY:64)-Math.max(this.cameraY,this._cameraTarget(radius));
      const flight=Math.sqrt(2*Math.max(100,top-birth-radius*.89)/(1000*this.params.fall)),available=Math.max(.15,flight-.15);
      // Include reaction and braking distance; physical stacks cannot teleport across the screen.
      const reach=Math.max(20,Math.min(180,this._plateAcceleration()*available*available*.21,this.params.move*available*.45));
      return [Math.max(left,center-reach),Math.min(right,center+reach)];
    }
    _fallXAt(scoop, windX, seconds) {
      const x = scoop.body.position.x;
      if (scoop.hasLanded || scoop.missed || !scoop.fallCorridor) return x + windX * seconds;
      const [screenLeft, screenRight] = this._safeDropBounds(scoop.r);
      // A birth's corridor is stable while the tower changes underneath it.
      // A resize may reduce its visible part, but never teleports a flying ball.
      const left = clamp(scoop.fallCorridor[0], screenLeft, screenRight), right = clamp(scoop.fallCorridor[1], screenLeft, screenRight);
      const recoverySpeed = Math.max(80, Math.abs(windX));
      if (x < left) return Math.min(left, x + recoverySpeed * seconds);
      if (x > right) return Math.max(right, x - recoverySpeed * seconds);
      return clamp(x + windX * seconds, left, right);
    }
    _translatePlate(delta, dt) {
      const bowl = this.bowls[0]; bowl.x += delta; bowl.velocityX = dt > 0 ? delta / dt : 0;
      if(this.physics){this.physics.movePlate(bowl,dt);return;}
      for (const scoop of this.scoops) if (scoop.locked && scoop.supportByBowl[0] > 0) {
        scoop.body.position.x += delta; scoop.body.velocity.x = bowl.velocityX; this._updateBounds(scoop);
      }
    }
    _bowlSurfaces() { return this.bowls.map((bowl, index) => ({ kind: 'bowl', id: 'bowl-' + index, ref: bowl, bowlIndex: index, y: bowl.y, previousX: number(bowl.previousX, bowl.x), startFraction: 0 })); }
    _scoopSurface(scoop) { return { kind: 'scoop', id: scoop.body.id, ref: scoop, y: scoop.body.position.y - scoop.halfHeight, previousX: number(scoop._stepPreviousX, scoop.body.position.x), startFraction: scoop._stepLockedAt || 0 }; }
    _overlaps(scoop, surface, x = scoop.body.position.x, surfaceX) {
      const center = Number.isFinite(surfaceX) ? surfaceX : surface.kind === 'bowl' ? surface.ref.x : surface.ref.body.position.x;
      const width = surface.kind === 'bowl' ? surface.ref.width : surface.ref.r * 2;
      const overlap = Math.min(x + scoop.r, center + width / 2) - Math.max(x - scoop.r, center - width / 2);
      return overlap + EPSILON >= Math.min(scoop.r * 2, width) * clamp(number(this.config.catchOverlap, 0.25), 0.1, 0.8);
    }
    _assignSupport(scoop, surfaces) {
      const depths = this.bowls.map(() => 0);
      for (const surface of surfaces) {
        if (surface.kind === 'bowl') depths[surface.bowlIndex] = Math.max(depths[surface.bowlIndex], 1);
        else if (surface.ref.locked) surface.ref.supportByBowl.forEach((depth, index) => { if (depth > 0) depths[index] = Math.max(depths[index], depth + 1); });
      }
      scoop.supportByBowl = depths; scoop.supportLayer = Math.max(...depths); scoop.supportIds = surfaces.map(surface => surface.id);
      return scoop.supportLayer > 0;
    }
    _surfaceIndex(surfaces, y) {
      let low = 0, high = surfaces.length;
      while (low < high) { const middle = (low + high) >>> 1; if (surfaces[middle].y < y) low = middle + 1; else high = middle; }
      return low;
    }

    _advanceFalling(dt) {
      if(this.physics){this.physics.step(dt);return;}
      const falling = this.scoops.filter(scoop => !scoop.locked);
      if (!falling.length) return;
      const surfaces = this._bowlSurfaces().concat(this.scoops.filter(scoop => scoop.locked && !scoop.blasted).map(scoop => this._scoopSurface(scoop)));
      surfaces.sort((a, b) => a.y - b.y); falling.sort((a, b) => b.body.bounds.max.y - a.body.bounds.max.y);
      let changed = false;
      for (const scoop of falling) {
        const body = scoop.body;
        if (scoop.blasted) {
          body.position.x += body.velocity.x * dt; body.position.y += body.velocity.y * dt + 200 * dt * dt; body.velocity.y += 400 * dt;
          scoop.opacity = Math.max(0, 1 - (this.elapsed - scoop.blastedAt) / 0.7);
        } else {
          const gravity = 1000 * this.params.fall, oldBottom = body.position.y + scoop.halfHeight;
          const windX = this.wind.direction * this.wind.strength * (this.wind.force||0) * 150;
          const nextX = this._fallXAt(scoop, windX, dt), nextY = body.position.y + body.velocity.y * dt + gravity * dt * dt / 2;
          const nextBottom = nextY + scoop.halfHeight, hits = [];
          let surfaceY = Infinity, contactFraction = 1;
          for (let index = this._surfaceIndex(surfaces, oldBottom - EPSILON); index < surfaces.length; index++) {
            const surface = surfaces[index];
            if (surface.y > nextBottom + EPSILON || surface.y > surfaceY + EPSILON) break;
            const distance = Math.max(0, surface.y - oldBottom);
            const hitTime = clamp((Math.sqrt(body.velocity.y * body.velocity.y + 2 * gravity * distance) - body.velocity.y) / gravity, 0, dt);
            const fraction = hitTime / dt;
            if (fraction + EPSILON < surface.startFraction) continue;
            const finalSurfaceX = surface.kind === 'bowl' ? surface.ref.x : surface.ref.body.position.x;
            const surfaceX = surface.previousX + (finalSurfaceX - surface.previousX) * fraction;
            const hitX = this._fallXAt(scoop, windX, hitTime);
            if (this._overlaps(scoop, surface, hitX, surfaceX)) { hits.push(surface); surfaceY = surface.y; contactFraction = fraction; }
          }
          if (hits.length && this._assignSupport(scoop, hits)) {
            const contactSpeed = Math.max(0, body.velocity.y + gravity * dt * contactFraction);
            const plateDelta = this.bowls[0].stepDelta || 0;
            body.position.x = this._fallXAt(scoop, windX, dt * contactFraction) + plateDelta * (1 - contactFraction);
            body.position.y = surfaceY - scoop.halfHeight; body.velocity.x = 0; body.velocity.y = 0;
            if (!scoop.hasLanded) this.caught++;
            scoop.locked = true; scoop.hasLanded = true; scoop.stableFor = 0; scoop.catchOrder = ++this._catchOrder;
            scoop._stepPreviousX = body.position.x - plateDelta; scoop._stepLockedAt = contactFraction;
            this._updateBounds(scoop);
            const surface = this._scoopSurface(scoop); surfaces.splice(this._surfaceIndex(surfaces, surface.y), 0, surface);
            this.events.push({ type: 'land', x: body.position.x, y: body.position.y, r: scoop.r, flavor: scoop.flavor, bodyId: body.id, speed: contactSpeed, contactSpeed }); changed = true;
          } else { body.velocity.x = (nextX - body.position.x) / dt; body.position.x = nextX; body.position.y = nextY; body.velocity.y += gravity * dt; }
        }
        this._updateBounds(scoop);
        if (!scoop.locked && !scoop.blasted && !scoop.missed && scoop.body.bounds.min.y > this.bowlY + 5) {
          scoop.missed = true;
          if (!scoop.hasLanded) this.missed++;
          this.events.push({ type: 'miss', bodyId: body.id, x: body.position.x, y: body.position.y, r: scoop.r, previouslyCaught: scoop.hasLanded });
        }
      }
      for (let index = this.scoops.length - 1; index >= 0; index--) {
        const scoop = this.scoops[index], p = scoop.body.position;
        // A carried fixed tile remains part of its tower even outside the view.
        // Only missed falling scoops and expired blast debris are disposable.
        if (!scoop.locked && ((scoop.blasted && scoop.opacity <= 0) || p.y > this.worldHeight + 220 || p.x < -220 || p.x > this.width + 220)) {
          this.scoops.splice(index, 1); this.lost++;
        }
      }
      if (changed) this._refreshScore();
    }
    _updateBounds(scoop) {
      if(this.physics&&scoop.body.vertices)return;
      const { x, y } = scoop.body.position, bounds = scoop.body.bounds;
      bounds.min.x = x - scoop.r; bounds.max.x = x + scoop.r;
      bounds.min.y = y - scoop.halfHeight; bounds.max.y = y + scoop.halfHeight; scoop.body.angle = 0;
    }
    _refreshScore() {
      this.bowlLayers = this.bowls.map(() => 0);
      this.bowlHeights = this.bowls.map(() => 0); this.progressHeight = 0;
      let top = this.bowlY;
      for (const scoop of this.scoops) if (scoop.locked && !scoop.blasted) {
        scoop.supportByBowl.forEach((depth, index) => {
          this.bowlLayers[index] = Math.max(this.bowlLayers[index], depth);
          if (depth > 0) this.bowlHeights[index] = Math.max(this.bowlHeights[index], this.bowls[index].y - scoop.body.bounds.min.y);
        });
        if (scoop.supportByBowl.some(depth => depth > 0)) top = Math.min(top, scoop.body.bounds.min.y);
      }
      this.layers = this.config.mode === 'twin' ? Math.min(...this.bowlLayers) : Math.max(...this.bowlLayers); this.height = Math.max(0, this.bowlY - top);
      this.progressHeight = this.config.mode === 'twin' ? Math.min(...this.bowlHeights) : Math.max(...this.bowlHeights);
    }

    _reconcileSupports() {
      if(this.physics){this.physics.reconcile();this._winHold=0;this._cameraHoldUntil=this.elapsed+.7;this._cameraDownWait=0;this._spawnWaiting=false;this.nextSpawnIn=this._spawnInterval();return;}
      const groups = new Map();
      const add = surface => { const key = Math.round(surface.y * 10); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(surface); };
      this._bowlSurfaces().forEach(add);
      const fixed = this.scoops.filter(scoop => scoop.locked && !scoop.blasted).sort((a, b) => b.body.bounds.max.y - a.body.bounds.max.y);
      for (const scoop of fixed) {
        const bottom = scoop.body.position.y + scoop.halfHeight, key = Math.round(bottom * 10);
        // Equivalent floating-point contact planes may straddle a rounding bin.
        const nearby = [-1, 0, 1].flatMap(offset => groups.get(key + offset) || []);
        const hits = nearby.filter(surface => Math.abs(surface.y - bottom) < EPSILON && this._overlaps(scoop, surface));
        if (hits.length && this._assignSupport(scoop, hits)) add(this._scoopSurface(scoop));
        else {
          scoop.locked = false; scoop.stableFor = 0; scoop.supportLayer = 0; scoop.supportByBowl = this.bowls.map(() => 0); scoop.supportIds = [];
          scoop.body.velocity.x = 0; scoop.body.velocity.y = 0;
        }
      }
      this._refreshScore(); this._winHold = 0; this._cameraHoldUntil = this.elapsed + 0.7; this._cameraDownWait = 0;
      this._spawnWaiting = false; this.nextSpawnIn = this._spawnInterval();
    }
    _eat(count) {
      const candidates = this.scoops.filter(scoop => !scoop.blasted), eaten = [], limit = Math.min(count, candidates.length);
      for (let index = 0; index < limit; index++) {
        const [scoop] = candidates.splice(Math.min(candidates.length - 1, Math.floor(clamp(number(this._random(), .5), 0, 1) * candidates.length)), 1); eaten.push(scoop);
        this.events.push({ type: 'eat', x: scoop.body.position.x, y: scoop.body.position.y, r: scoop.r, flavor: scoop.flavor });
      }
      if (eaten.length) { const ids = new Set(eaten.map(scoop => scoop.body.id)); this.scoops = this.scoops.filter(scoop => !ids.has(scoop.body.id)); this._reconcileSupports(); }
      return eaten.length;
    }
    _blast(radius = 100) {
      if (this.status === 'won' || this.status === 'lost' || number(radius, 100) <= 0) return 0;
      const candidates = this.scoops.filter(scoop => !scoop.blasted && !scoop.missed);
      if (!candidates.length) return 0;
      const [left, right] = this._viewBounds();
      const top = (Number.isFinite(this.viewTop) ? this.viewTop : 0) - this.cameraY;
      const bottom = (Number.isFinite(this.viewBottom) ? this.viewBottom : this.worldHeight) - this.cameraY;
      const visible = candidates.filter(scoop => {
        const { min, max } = scoop.body.bounds;
        return max.x >= left && min.x <= right && max.y >= top && min.y <= bottom;
      });
      const supported = visible.filter(scoop => scoop.locked && scoop.supportByBowl.some(depth => depth > 0));
      const fresh = visible.filter(scoop => !scoop.hasLanded);
      const pool = supported.length ? supported : fresh.length ? fresh : visible.length ? visible : candidates;
      const index = Math.min(pool.length - 1, Math.floor(clamp(number(this._random(), .5), 0, 1) * pool.length));
      const { x, y } = pool[index].body.position;
      return this.blastAt(x, y, radius);
    }
    blastAt(x, y, radius = 100) {
      if (this.status === 'won' || this.status === 'lost' || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
      radius = number(radius, 100);
      if (radius <= 0) return 0;
      radius = clamp(radius, 1, 1000);
      const candidates = this.scoops.filter(scoop => !scoop.blasted && !scoop.missed);
      if (!candidates.length) return 0;
      // Test the circle against each scoop's actual collision bounds. Large
      // scoops touching its edge count; neither depth nor screen position does.
      const selected = candidates.filter(scoop => {
        const { min, max } = scoop.body.bounds;
        const dx = x - clamp(x, min.x, max.x), dy = y - clamp(y, min.y, max.y);
        return dx * dx + dy * dy <= radius * radius + EPSILON;
      });
      for (const scoop of selected) {
        const dx = scoop.body.position.x - x, dy = scoop.body.position.y - y, distance = Math.hypot(dx, dy);
        const impact = 120 + 220 * (1 - clamp(distance / (radius + Math.max(scoop.r, scoop.halfHeight)), 0, 1));
        scoop.blasted = true; scoop.blastedAt = this.elapsed; scoop.locked = false; scoop.supportLayer = 0;
        scoop.supportByBowl = this.bowls.map(() => 0); scoop.supportIds = [];
        scoop.body.velocity.x = distance > EPSILON ? dx / distance * impact : 0;
        scoop.body.velocity.y = distance > EPSILON ? dy / distance * impact : -impact;
      }
      this.events.push({ type: 'blast', x, y, radius, count: selected.length, bodyIds: selected.map(scoop => scoop.body.id) });
      if (selected.length) this._reconcileSupports();
      return selected.length;
    }

    _viewBounds() {
      const left = Number.isFinite(this.viewLeft) ? clamp(this.viewLeft, 0, this.width) : 0, right = Number.isFinite(this.viewRight) ? clamp(this.viewRight, 0, this.width) : this.width;
      return right - left > 36 ? [left, right] : [0, this.width];
    }
    _clampRow() {
      const [left, right] = this._viewBounds(), half = (this.params.count - 1) * this.rowSpacing / 2 + this.rowRadius + 18;
      if (this.rowX > right - half) { this.rowX = right - half; this.rowDirection = -1; }
      if (this.rowX < left + half) { this.rowX = left + half; this.rowDirection = 1; }
    }
    _cameraTarget(radius = this.rowRadius) {
      const spawnY = Number.isFinite(this.spawnY) ? this.spawnY : 64;
      const available = Math.max(0, this.bowlY - 20 - spawnY - radius * .89);
      const clearance = Math.min(Math.max(0, number(this.fallClearance, 360)), available);
      return Math.max(0, spawnY + radius * .89 + clearance - this._framingTop());
    }
    _updateCamera(dt) {
      // Alternating sizes or a size gift must not move the camera back toward
      // an existing large falling scoop just because the following one is small.
      let radius = this.rowRadius;
      for (const scoop of this.scoops) if (!scoop.locked && !scoop.blasted && !scoop.missed && !scoop.hasLanded) radius = Math.max(radius, scoop.r);
      const target = this._cameraTarget(radius), down = target < this.cameraY - 0.02;
      const hold = down && this.elapsed < this._cameraHoldUntil;
      if (!hold) this.cameraY += (target - this.cameraY) * Math.min(1, dt * (target > this.cameraY ? 4 : 2));
      if (Math.abs(target - this.cameraY) < 0.02) this.cameraY = target;
    }
    _framingTop() {
      let top = this.bowlY - this.height;
      // Track the previous tower during a refill, without awarding it layers.
      // Brand-new falling rows and blast debris never pull the camera upward.
      for (const scoop of this.scoops) if (!scoop.blasted && scoop.hasLanded && !scoop.locked) top = Math.min(top, scoop.body.bounds.min.y);
      return top;
    }
  }
  return { Game, DEFAULTS, MODES, LEVELS };
});
