const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pile,above,HCELL,rng}=require('../src/pile.js');
const {Camera}=require('../src/camera.js');
const {discs,discMask}=require('./helpers.cjs');
const cam=new Camera({elevation:60});
const rayTo=(x,y,z)=>{const s=cam.project([x,y,z]);return cam.ray(s.x,s.y);};

test('pick returns the topmost leaf along the view ray',()=>{
  const pile=new Pile({masks:discs(),count:0});
  pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});const b=pile.addLeaf({x:5,y:0,yaw:0,size:100,type:0});
  assert.equal(b.z,8);assert.equal(pile.pick(rayTo(2,0,8)),b);
});
test('pick sees through transparent parts of an upper leaf',()=>{
  const pile=new Pile({masks:discs(0.3),count:0});
  const a=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0}),b=pile.addLeaf({x:20,y:0,yaw:0,size:100,type:0});
  assert.equal(b.z,8);assert.equal(pile.pick(rayTo(-10,20,4)),a);
});
test('at equal height the later overlapping leaf is on top',()=>{
  const pile=new Pile({masks:discs(),count:0});
  const a=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0}),c=pile.addLeaf({x:80,y:0,yaw:0,size:100,type:0});
  assert.equal(c.z,a.z);assert.ok(above(c,a));assert.equal(pile.pick(rayTo(40,0,4)),c);
});
test('pick returns null when the ray misses every leaf',()=>{
  const pile=new Pile({masks:discs(),count:0});pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.equal(pile.pick(rayTo(400,0,0)),null);
});
test('remove takes the leaf out and lowers the surface',()=>{
  const pile=new Pile({masks:discs(),count:0});
  const a=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0}),b=pile.addLeaf({x:5,y:0,yaw:0,size:100,type:0});
  const res=pile.remove(b);
  assert.equal(res.leaf,b);assert.equal(pile.leaves.length,1);assert.equal(pile.heightAt(0,0),4);
  assert.equal(pile.pick(rayTo(2,0,4)),a);assert.equal(pile.remove(b),null);
});
test('digging leaves the other leaves in place and keeps the height grid exact',()=>{
  const pile=new Pile({masks:discs(),seed:5,count:400}).generate();
  const before=new Map(pile.leaves.map(l=>[l.id,l.z]));
  for(let i=0;i<60;i++){const l=pile.pick(rayTo(0,0,pile.heightAt(0,0)));if(!l)break;pile.remove(l);}
  assert.ok(pile.leaves.length<400);
  for(const l of pile.leaves)assert.equal(l.z,before.get(l.id));
  const mid=Math.floor(pile.hrows/2);
  for(let r=mid-3;r<=mid+3;r++)for(let c=0;c<pile.hcols;c++){
    const x=pile.x0+(c+0.5)*HCELL,y=pile.y0+(r+0.5)*HCELL;let h=0;
    for(const l of pile.leaves)if(l.z>h&&pile.maskAt(l,x,y))h=l.z;
    assert.equal(pile.heightAt(x,y),h);
  }
});
test('pick agrees with an exhaustive (z,id) search at 45/60/75°, before and after random removals',()=>{
  const full={size:4,data:new Uint8Array(16).fill(1)},R=rng(42);
  const brute=(p,{origin:O,dir:D})=>{let best=null;for(const l of p.leaves){const t=(l.z-O[2])/D[2];if(p.maskAt(l,O[0]+D[0]*t,O[1]+D[1]*t)&&(!best||above(l,best)))best=l;}return best;};
  const edge=()=>R()<0.5?(R()<0.5?-0.49:0.49):R()-0.5;
  for(const elevation of [45,60,75]){
    const c=new Camera({elevation}),p=new Pile({masks:[full,discMask(32,0.3)],seed:elevation,count:600,thickness:8}).generate();
    const check=()=>{let hits=0;
      for(let k=0;k<400;k++){
        let ray;
        if(k%2)ray=c.ray(R()*1440,R()*810);
        else{const l=p.leaves[Math.floor(R()*p.leaves.length)],u=edge(),v=edge(),s=c.project([l.x+(u*l.cos-v*l.sin)*l.size,l.y+(u*l.sin+v*l.cos)*l.size,l.z]);ray=c.ray(s.x,s.y);}
        const got=p.pick(ray);assert.equal(got,brute(p,ray));if(got)hits++;
      }
      assert.ok(hits>150,'only '+hits+' hits');
    };
    check();
    for(let k=0;k<80;k++)p.remove(p.leaves[Math.floor(R()*p.leaves.length)]);
    check();
  }
});
test('removing a buried leaf lowers only the ground it alone covered and updates the bookkeeping',()=>{
  const pile=new Pile({masks:discs(),count:0});
  const a=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0}),b=pile.addLeaf({x:30,y:0,yaw:0,size:100,type:0}),top=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.deepEqual([a.z,b.z,top.z],[4,8,12]);assert.equal(pile.heightAt(68,0),8);assert.equal(pile.pick(rayTo(68,0,8)),b);
  const v=pile.version;assert.deepEqual(pile.remove(b),{leaf:b});
  assert.ok(pile.version>v);assert.ok(pile.cells.every(cell=>!cell.includes(b)));
  assert.deepEqual(pile.leaves,[a,top]);assert.deepEqual([a.z,top.z],[4,12]);
  assert.equal(pile.maxZ,12);assert.equal(pile.heightAt(0,0),12);assert.equal(pile.heightAt(68,0),0);
  assert.equal(pile.pick(rayTo(0,0,12)),top);assert.equal(pile.pick(rayTo(68,0,8)),null);
  pile.remove(top);assert.equal(pile.maxZ,4);assert.equal(pile.heightAt(0,0),4);assert.equal(pile.pick(rayTo(0,0,12)),a);
});
test('pick is null on an empty pile, for rays that do not go down, and returns quickly for near-horizontal rays',()=>{
  const pile=new Pile({masks:discs(),count:0});assert.equal(pile.pick(cam.ray(720,500)),null);
  pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.equal(pile.pick({origin:[0,-100,50],dir:[0,1,0]}),null);assert.equal(pile.pick({origin:[0,-100,50],dir:[0,0.6,0.8]}),null);
  const t0=Date.now();assert.equal(pile.pick({origin:[0,-1000,1000],dir:[0,1,-1e-9]}),null);assert.ok(Date.now()-t0<200,'near-horizontal ray took too long');
});
