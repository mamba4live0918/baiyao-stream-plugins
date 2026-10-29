(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../vendor/matter.min.js'));
  else root.GelatoRigidPhysics=factory(root.Matter);
})(typeof globalThis!=='undefined'?globalThis:this,function(Matter){
  'use strict';
  const {Engine,Bodies,Body,Composite,Events,Sleeping}=Matter;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MODES=Object.freeze(['arcade','realistic','sticky']);
  function mode(value){return MODES.includes(value)?value:'arcade';}
  function strength(value){const n=Number(value);return Number.isFinite(n)?clamp(n,0,1):.65;}
  function compression(age,impact,supported){return (supported?.065:0)+clamp(impact||0,0,1)*.31*Math.exp(-Math.max(0,age)*7);}
  class World{
    constructor(game){
      this.game=game;this.scoopBodies=new Map();this.bonds=new Map();this.contacts=new Map();this.detachedUntil=new Map();
      this.engine=Engine.create({enableSleeping:true,positionIterations:8,velocityIterations:8,constraintIterations:4});
      this.engine.gravity.scale=.001;this.engine.gravity.y=1;
      const bowl=game.bowls[0];
      this.plate=Bodies.rectangle(bowl.x,bowl.y+9,bowl.width,18,{isStatic:true,friction:.9,frictionStatic:1.2,restitution:0,collisionFilter:{category:2},label:'plate'});
      Composite.add(this.engine.world,this.plate);
      this._onCollision=event=>{for(const pair of event.pairs){const a=pair.bodyA.parent||pair.bodyA,b=pair.bodyB.parent||pair.bodyB;this._contact(a,b,pair.collision);}};
      Events.on(this.engine,'collisionStart',this._onCollision);
    }
    addScoop(scoop){
      const {x,y}=scoop.body.position,sticky=this.game.physicsMode==='sticky'&&this.game.adhesion>0&&!scoop.hardIce;
      // A pressed scoop rests on a small flat patch instead of balancing on one round point.
      const outline=[[-.46,-.89],[.46,-.89],[.76,-.7],[.96,-.36],[1,0],[.96,.36],[.76,.7],[.46,.89],[-.46,.89],[-.76,.7],[-.96,.36],[-1,0],[-.96,-.36],[-.76,-.7]].map(([x,y])=>({x:x*scoop.r,y:y*scoop.r}));
      scoop.body=scoop.hardIce?Bodies.circle(x,y,scoop.r,{density:.0025,restitution:.55,friction:.03,frictionStatic:.05,frictionAir:.002,slop:.02,sleepThreshold:90}):Bodies.fromVertices(x,y,[outline],{density:.0015,restitution:0,friction:sticky?.65:.45,frictionStatic:sticky?1:.75,frictionAir:sticky?.008:.004,slop:.03,sleepThreshold:90});
      scoop.halfHeight=scoop.r*(scoop.hardIce?1:.89);
      scoop.physical=true;scoop.contactAge=0;
      this.scoopBodies.set(scoop.body.id,scoop);Composite.add(this.engine.world,scoop.body);
    }
    setVelocity(s,velocity){Body.setVelocity(s.body,{x:velocity.x/60,y:velocity.y/60});if(s.blasted){s._physicalBlast=true;s.body.collisionFilter.mask=0;}if(s.missed)s.body.collisionFilter.mask=0;}
    resizePlate(width){
      const old=this.plate.bounds.max.x-this.plate.bounds.min.x;
      if(old>0)Body.scale(this.plate,width/old,1);this.wake();
    }
    resizeScoop(s,radius){
      const ratio=radius/s.r;Body.scale(s.body,ratio,ratio);s.r=radius;s.halfHeight=radius*(s.hardIce?1:.89);Sleeping.set(s.body,false);
    }
    removeScoop(s){
      Composite.remove(this.engine.world,s.body);this.scoopBodies.delete(s.body.id);
      for(const [key,bond] of this.bonds)if(bond.a===s.body||bond.b===s.body)this._removeBond(key);
    }
    setMaterial(s){
      for(const [key,bond] of this.bonds)if(bond.a===s.body||bond.b===s.body)this._removeBond(key);
      const body=s.body,{x,y}=body.position,r=s.r;
      const outline=[[-.46,-.89],[.46,-.89],[.76,-.7],[.96,-.36],[1,0],[.96,.36],[.76,.7],[.46,.89],[-.46,.89],[-.76,.7],[-.96,.36],[-1,0],[-.96,-.36],[-.76,-.7]].map(([dx,dy])=>({x:dx*r,y:dy*r}));
      const shape=s.hardIce?Bodies.circle(x,y,r):Bodies.fromVertices(x,y,[outline]);Body.setAngle(shape,body.angle);
      Body.setVertices(body,shape.vertices.map(v=>({x:v.x,y:v.y})));body.circleRadius=s.hardIce?r:0;
      const sticky=this.game.physicsMode==='sticky'&&this.game.adhesion>0;
      body.restitution=s.hardIce?.55:0;body.friction=s.hardIce?.03:sticky?.65:.45;body.frictionStatic=s.hardIce?.05:sticky?1:.75;body.frictionAir=s.hardIce?.002:sticky?.008:.004;
      Body.setDensity(body,s.hardIce?.0025:.0015);s.halfHeight=r*(s.hardIce?1:.89);Sleeping.set(body,false);
    }
    _hard(body){return !!this.scoopBodies.get(body.id)?.hardIce;}
    movePlate(bowl,dt){
      const changed=Math.abs(this.plate.position.x-bowl.x)>.00001;
      // Static bodies skip Body.update: normalize their inferred velocity to our actual step.
      if(dt>0){this.plate.deltaTime=dt*1000;Body.setPosition(this.plate,{x:bowl.x,y:bowl.y+9},true);Body.updateVelocities(this.plate);}
      else{Body.setPosition(this.plate,{x:bowl.x,y:bowl.y+9});Body.setVelocity(this.plate,{x:0,y:0});}
      if(changed)for(const scoop of this.scoopBodies.values())if(scoop.body.isSleeping)Sleeping.set(scoop.body,false);
    }
    _valid(body){const scoop=this.scoopBodies.get(body.id);return body===this.plate||scoop&&!scoop.blasted&&!scoop.missed;}
    _contact(a,b,collision){
      if(!this._valid(a)||!this._valid(b))return;
      for(const body of [a,b]){const s=this.scoopBodies.get(body.id);if(s&&!s.contacted){s.contacted=true;s.contactAge=0;s.contactSpeed=Math.abs(body.velocity.y)*60;}}
    }
    _adhere(dt){
      const next=new Map();
      if(this.game.physicsMode!=='sticky'||this.game.adhesion<=0){this.contacts=next;return;}
      for(const pair of this.engine.pairs.list){
        if(!pair.isActive)continue;const a=pair.bodyA.parent||pair.bodyA,b=pair.bodyB.parent||pair.bodyB;
        if(!this._valid(a)||!this._valid(b)||this._hard(a)||this._hard(b))continue;
        const key=[a.id,b.id].sort((x,y)=>x-y).join(':');
        if(this.bonds.has(key)||(this.detachedUntil.get(key)||0)>this.game.elapsed)continue;
        const n=pair.collision.normal,relativeNormal=Math.abs((b.velocity.x-a.velocity.x)*n.x+(b.velocity.y-a.velocity.y)*n.y)*60;
        if(relativeNormal>120)continue;
        const age=(this.contacts.get(key)||0)+dt;next.set(key,age);
        if(age>=.075)this._makeBond(a,b,key);
      }
      this.contacts=next;
      for(const [key,until] of this.detachedUntil)if(until<=this.game.elapsed)this.detachedUntil.delete(key);
    }
    _makeBond(a,b,key){
      if(this._hard(a)||this._hard(b))return;
      const neighbors=id=>[...this.bonds.values()].filter(c=>c.a.id===id||c.b.id===id).length;
      if(a!==this.plate&&neighbors(a.id)>=3||b!==this.plate&&neighbors(b.id)>=3)return;
      const ra=this.scoopBodies.get(a.id)?.r||Infinity,rb=this.scoopBodies.get(b.id)?.r||Infinity,r=Math.min(ra,rb);
      const plateBody=a===this.plate?b:b===this.plate?a:null;
      if(plateBody&&plateBody.position.y>this.game.bowlY-r*.35)return;
      // A contact patch has no spring, rest position or stored extension energy.
      this.bonds.set(key,{a,b,plateBody,maxGap:.75+.75*this.game.adhesion});
    }
    _surface(bond){
      const {a,b}=bond;let gap=-Infinity,normal={x:0,y:1};
      for(const axis of [...a.axes,...b.axes]){
        let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
        for(const v of a.vertices){const d=v.x*axis.x+v.y*axis.y;amin=Math.min(amin,d);amax=Math.max(amax,d);}
        for(const v of b.vertices){const d=v.x*axis.x+v.y*axis.y;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
        if(bmin-amax>gap){gap=bmin-amax;normal={x:axis.x,y:axis.y};}
        if(amin-bmax>gap){gap=amin-bmax;normal={x:-axis.x,y:-axis.y};}
      }
      return {gap,normal};
    }
    _removeBond(key){this.bonds.delete(key);this.contacts.delete(key);this.detachedUntil.set(key,this.game.elapsed+.4);}
    _cohesion(dt){
      const adhesion=this.game.adhesion,blend=1-Math.exp(-(12+adhesion*26)*dt),limit=(600+adhesion*2600)*dt/60;
      for(const [key,bond] of this.bonds){
        const {a,b}=bond,{normal:n}=this._surface(bond),vx=b.velocity.x-a.velocity.x,vy=b.velocity.y-a.velocity.y;
        const separating=vx*n.x+vy*n.y;
        if(separating*60>110+adhesion*180){this._removeBond(key);continue;}
        // Dissipate slip/separation only at touching surfaces. Never restore an old position.
        const normalChange=Math.max(0,separating),tangent=vx*-n.y+vy*n.x;
        const grip=Math.abs(tangent)*60<8+adhesion*32?1:blend;
        let dx=normalChange*n.x*blend-tangent*n.y*grip,dy=normalChange*n.y*blend+tangent*n.x*grip;
        const magnitude=Math.hypot(dx,dy);if(magnitude>limit){dx*=limit/magnitude;dy*=limit/magnitude;}
        const mass=a.inverseMass+b.inverseMass;if(!mass)continue;
        for(const [body,sign] of [[a,1],[b,-1]])if(!body.isStatic){
          if(Math.hypot(dx,dy)>.00001)Sleeping.set(body,false);
          const share=body.inverseMass/mass;Body.setVelocity(body,{x:body.velocity.x+sign*dx*share,y:body.velocity.y+sign*dy*share});
        }
      }
    }
    _contactDrag(dt){
      const touching=new Set();
      for(const pair of this.engine.pairs.list)if(pair.isActive){const a=pair.bodyA.parent||pair.bodyA,b=pair.bodyB.parent||pair.bodyB;if(this._valid(a)&&this._valid(b)){touching.add(a);touching.add(b);}}
      for(const body of touching)if(!body.isStatic&&!body.isSleeping&&!this._hard(body)){
        const sticky=this.game.physicsMode==='sticky'&&this.game.adhesion>0,grip=sticky?.06+.06*this.game.adhesion:.06;
        // A yielding contact patch resists small torques instead of rolling like a marble.
        Body.setAngularVelocity(body,Math.abs(body.angularVelocity)<=grip?0:body.angularVelocity*Math.exp(-dt*(sticky?28:18)));
      }
    }
    _holdPatches(){
      const adhesion=this.game.adhesion,speed=this.plate.velocity.x*60;
      if(this.game.physicsMode!=='sticky'||adhesion<=0||Math.abs(speed)>220+adhesion*500)return;
      const connected=new Set([this.plate.id]);let changed=true;
      while(changed){changed=false;for(const {a,b} of this.bonds.values())if(connected.has(a.id)!==connected.has(b.id)){connected.add(a.id);connected.add(b.id);changed=true;}}
      // Static adhesion carries a settled stack during ordinary movement. This matches velocity
      // only: positions are never pulled back, and a separated patch is pruned before this step.
      for(const s of this.scoopBodies.values())if(connected.has(s.body.id)&&Math.abs(s.body.velocity.x*60-speed)<60+adhesion*80){
        if(Math.abs(s.body.velocity.x-this.plate.velocity.x)>.00001)Sleeping.set(s.body,false);
        Body.setVelocity(s.body,{x:this.plate.velocity.x,y:s.body.velocity.y});
      }
    }
    _prune(){
      const alive=new Set(this.game.scoops.map(s=>s.body.id));
      for(const [id,s] of this.scoopBodies)if(!alive.has(id)){Composite.remove(this.engine.world,s.body);this.scoopBodies.delete(id);}
      for(const [key,bond] of this.bonds){
        const broken=!this._valid(bond.a)||!this._valid(bond.b)||this._hard(bond.a)||this._hard(bond.b)||bond.plateBody&&bond.plateBody.position.y>this.game.bowlY-this.scoopBodies.get(bond.plateBody.id).r*.1||this._surface(bond).gap>bond.maxGap;
        if(broken)this._removeBond(key);
      }
      for(const s of this.scoopBodies.values())if(s.blasted&&!s._physicalBlast){
        s._physicalBlast=true;this.wake();s.body.collisionFilter.mask=0;
        Body.setVelocity(s.body,{x:s.body.velocity.x/60,y:s.body.velocity.y/60});Body.setAngularVelocity(s.body,.07);
      }
    }
    wake(){for(const s of this.scoopBodies.values())Sleeping.set(s.body,false);}
    resolved(scoop){
      if(scoop.blasted||scoop.missed||scoop.locked||scoop.body.bounds.min.y>this.game.bowlY+5)return true;
      // The final finite throw must finish settling before a loss can be decided.
      if(!this.game.unlimitedAttempts&&this.game.attemptsLeft<=0)return false;
      return !!(scoop.contacted&&scoop.contactAge>=.24);
    }
    _score(dt){
      const g=this.game,adjacent=new Map();
      const connect=(a,b)=>{if(!this._valid(a)||!this._valid(b))return;if(!adjacent.has(a.id))adjacent.set(a.id,new Set());if(!adjacent.has(b.id))adjacent.set(b.id,new Set());adjacent.get(a.id).add(b.id);adjacent.get(b.id).add(a.id);};
      for(const pair of this.engine.pairs.list){
        const a=pair.bodyA.parent||pair.bodyA,b=pair.bodyB.parent||pair.bodyB;
        // Matter keeps sleeping pairs but marks them inactive; their support still exists.
        if(pair.isActive||(a.isSleeping||a.isStatic)&&(b.isSleeping||b.isStatic)&&this._valid(a)&&this._valid(b)&&this._surface({a,b}).gap<=.2)connect(a,b);
      }
      for(const bond of this.bonds.values())connect(bond.a,bond.b);
      const ordered=[...this.scoopBodies.values()].sort((a,b)=>b.body.position.y-a.body.position.y);
      for(const s of ordered){s._physicalDepth=0;s.supportLayer=0;s.supportByBowl=[0];s.supportIds=[];s.locked=false;}
      for(const s of ordered){
        if(s.blasted||s.missed){s.stableFor=0;continue;}
        const supports=adjacent.get(s.body.id)||new Set();let depth=0,stableDepth=0;
        if(supports.has(this.plate.id)&&s.body.position.y<g.bowlY){depth=1;stableDepth=1;s.supportIds.push('bowl-0');}
        for(const id of supports){const lower=this.scoopBodies.get(id);if(!lower||lower.body.position.y-s.body.position.y<Math.min(s.r,lower.r)*.35)continue;if(lower._physicalDepth){depth=Math.max(depth,lower._physicalDepth+1);s.supportIds.push(id);}if(lower.supportByBowl[0]>0)stableDepth=Math.max(stableDepth,lower.supportByBowl[0]+1);}
        s._physicalDepth=depth;
        const moving=Math.abs(s.body.velocity.y)*60>30||Math.abs(s.body.velocity.x*60-g.bowls[0].velocityX)>60||Math.abs(s.body.angularVelocity)>.1;
        s.stableFor=depth&&!moving?s.stableFor+dt:0;
        if(depth&&!s.hasLanded){s.hasLanded=true;g.caught++;s.catchOrder=++g._catchOrder;g.events.push({type:'land',x:s.body.position.x,y:s.body.position.y,r:s.r,flavor:s.flavor,bodyId:s.body.id,speed:s.contactSpeed||180,contactSpeed:s.contactSpeed||180});}
        if(stableDepth&&s.stableFor>=.16){s.locked=true;s.supportLayer=stableDepth;s.supportByBowl=[stableDepth];}
      }
      g._refreshScore();
    }
    step(dt){
      const g=this.game;this._prune();this.engine.gravity.y=g.params.fall;
      for(const s of this.scoopBodies.values()){
        if(s.contacted)s.contactAge+=dt;
        // A missed rim cannot scoop the fallen ball back upward when the plate reverses.
        if(s.body.bounds.max.y>g.bowlY+2&&(s.body.position.x<this.plate.bounds.min.x||s.body.position.x>this.plate.bounds.max.x)){
          s.body.collisionFilter.mask&=~2;
          for(const [key,bond] of this.bonds)if(bond.plateBody===s.body)this._removeBond(key);
        }
        if(g.wind.direction&&!s.blasted&&!s.missed){const force=g.wind.direction*g.wind.strength*(g.wind.force??g.config.windForce)*.00045;if(force){Sleeping.set(s.body,false);Body.applyForce(s.body,s.body.position,{x:s.body.mass*force,y:0});}}
        if(Math.abs(s.body.velocity.x)>28||s.body.velocity.y>28)Body.setVelocity(s.body,{x:clamp(s.body.velocity.x,-28,28),y:Math.min(28,s.body.velocity.y)});
      }
      this._cohesion(dt);this._holdPatches();Engine.update(this.engine,dt*1000);this._prune();this._adhere(dt);this._contactDrag(dt);
      for(const s of this.scoopBodies.values()){
        if(s.blasted)s.opacity=Math.max(0,1-(g.elapsed-s.blastedAt)/.7);
        if(!s.blasted&&!s.missed&&s.body.bounds.min.y>g.bowlY+5){s.missed=true;if(!s.hasLanded)g.missed++;g.events.push({type:'miss',bodyId:s.body.id,x:s.body.position.x,y:s.body.position.y,r:s.r,previouslyCaught:s.hasLanded});s.body.collisionFilter.mask=0;}
      }
      g.scoops=g.scoops.filter(s=>{const p=s.body.position,remove=s.blasted&&s.opacity<=0||p.y>g.worldHeight+220||p.x<-220||p.x>g.width+220;if(remove)g.lost++;return !remove;});
      this._prune();this._score(dt);
    }
    reconcile(){this._prune();this.wake();this._score(0);}
    destroy(){Events.off(this.engine,'collisionStart',this._onCollision);Composite.clear(this.engine.world,false);Engine.clear(this.engine);this.scoopBodies.clear();this.bonds.clear();this.contacts.clear();this.detachedUntil.clear();}
  }
  return Object.freeze({World,MODES,mode,strength,compression});
});
