import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {WebGLRequiredError} from './graphics-required.js';
import {colorByHex} from './patterns.js';
import {normalizeToolSensitivity,followBlend} from './mouse-controls.js';
import {createToolMaterials,makeTweezers,makeBeadPen} from './tool-models.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import woodUrl from './assets/wood.png';

const BOARD = { x: 5, z: .3, width: 20 };
const BIN_ORDER = [31,8,32,7,33,9,10,11,35,36,37,38,13,14,39,23,24,15,40,41,16,42,17,27,5,6,30,43,44,3,45,4,29,26,20,1,46,25,19,18,28,22,21,47,48,2,12,34];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function ringGeometry(outer=.36, inner=.19, half=.21, segments=20) {
  const geometry = new THREE.LatheGeometry([
    new THREE.Vector2(inner,-half),new THREE.Vector2(outer-.025,-half),
    new THREE.Vector2(outer,-half+.035),new THREE.Vector2(outer,half-.035),
    new THREE.Vector2(outer-.025,half),new THREE.Vector2(inner,half),new THREE.Vector2(inner,-half)
  ], segments);
  const positions=geometry.attributes.position,colors=[];
  for(let i=0;i<positions.count;i++){const shade=Math.hypot(positions.getX(i),positions.getZ(i))<inner+.012?.43:1;colors.push(shade,shade,shade);}
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}

function roundedBox(width, depth, height, radius=.2) {
  const x=-width/2, y=-depth/2, s=new THREE.Shape();
  s.moveTo(x+radius,y);s.lineTo(x+width-radius,y);s.quadraticCurveTo(x+width,y,x+width,y+radius);
  s.lineTo(x+width,y+depth-radius);s.quadraticCurveTo(x+width,y+depth,x+width-radius,y+depth);
  s.lineTo(x+radius,y+depth);s.quadraticCurveTo(x,y+depth,x,y+depth-radius);
  s.lineTo(x,y+radius);s.quadraticCurveTo(x,y,x+radius,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,steps:1,curveSegments:5});
  g.rotateX(-Math.PI/2);return g;
}

function openBinGeometry() {
  const shape=new THREE.Shape(),w=2.04,d=2.14,r=.15,x=-w/2,z=-d/2;
  shape.moveTo(x+r,z);shape.lineTo(x+w-r,z);shape.quadraticCurveTo(x+w,z,x+w,z+r);shape.lineTo(x+w,z+d-r);shape.quadraticCurveTo(x+w,z+d,x+w-r,z+d);shape.lineTo(x+r,z+d);shape.quadraticCurveTo(x,z+d,x,z+d-r);shape.lineTo(x,z+r);shape.quadraticCurveTo(x,z,x+r,z);
  const hole=new THREE.Path(),ix=x+.09,iz=z+.09,iw=w-.18,id=d-.18,ir=.08;
  hole.moveTo(ix+ir,iz);hole.quadraticCurveTo(ix,iz,ix,iz+ir);hole.lineTo(ix,iz+id-ir);hole.quadraticCurveTo(ix,iz+id,ix+ir,iz+id);hole.lineTo(ix+iw-ir,iz+id);hole.quadraticCurveTo(ix+iw,iz+id,ix+iw,iz+id-ir);hole.lineTo(ix+iw,iz+ir);hole.quadraticCurveTo(ix+iw,iz,ix+iw-ir,iz);hole.closePath();shape.holes.push(hole);
  const walls=new THREE.ExtrudeGeometry(shape,{depth:1.04,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:5});walls.rotateX(-Math.PI/2);
  const floor=new THREE.BoxGeometry(2.02,.12,2.12).toNonIndexed();floor.translate(0,-.04,0);
  const geometry=mergeGeometries([walls,floor]);walls.dispose();floor.dispose();return geometry;
}

function textTexture(text,{width=256,height=80,size=36,color='#69715f',background=null}={}) {
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d');
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}
  ctx.fillStyle=color;ctx.font=`500 ${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

// 工作台画质：「高」与 V5.2 及以前相同；「标准」降低渲染像素与阴影精度，「超高」提高像素、阴影和豆子分段。
const WORKBENCH_QUALITY=Object.freeze({standard:{pixel:1,maxPixel:1.25,shadow:1024,radius:1,segments:16},high:{pixel:1,maxPixel:2,shadow:2048,radius:1,segments:20},ultra:{pixel:1.5,maxPixel:3,shadow:4096,radius:2,segments:32}});
export function createWorkbenchScene({container,size,pattern,palette,onCell,canStroke,onStroke,onPickColor,onPickFallen,onAction,onGraphicsError,desk=false,toolSensitivity=1,quality='high'}) {
  const detail=WORKBENCH_QUALITY[quality]||WORKBENCH_QUALITY.high;
  let renderer;
  try { renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'}); }
  catch(error) { throw new WebGLRequiredError(error); }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!disposed)onGraphicsError?.(new WebGLRequiredError(),true);});
  renderer.domElement.className='three-canvas';renderer.setPixelRatio(Math.min((devicePixelRatio||1)*detail.pixel,detail.maxPixel));
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;container.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-30,30,18,-18,.1,180);
  const pitch=BOARD.width/size, boardGroup=new THREE.Group(),boardHome=new THREE.Vector3(BOARD.x,0,BOARD.z);boardGroup.position.copy(boardHome);scene.add(boardGroup);
  const trayOrigin=new THREE.Vector3(-18.2,0,-1.3),trayGroup=new THREE.Group();trayGroup.position.copy(trayOrigin);scene.add(trayGroup);
  let trayColumns=8,trayRows=6;
  const light=new THREE.DirectionalLight(0xfff9ee,2.5);light.position.set(-25,45,-20);light.castShadow=true;
  light.shadow.mapSize.set(detail.shadow,detail.shadow);light.shadow.radius=detail.radius;Object.assign(light.shadow.camera,{left:-35,right:35,top:30,bottom:-30,near:1,far:100});light.shadow.bias=-.0005;scene.add(light);
  scene.add(new THREE.HemisphereLight(0xffffff,0xb1ad99,1.7));
  const wood=new THREE.TextureLoader().load(woodUrl);wood.colorSpace=THREE.SRGBColorSpace;
  const deskMaterial=new THREE.MeshStandardMaterial({map:wood,roughness:.9,color:0xf5eee2});
  const deskPlane=new THREE.Mesh(new THREE.PlaneGeometry(65,43),deskMaterial);deskPlane.rotation.x=-Math.PI/2;deskPlane.position.y=-.35;deskPlane.receiveShadow=true;scene.add(deskPlane);
  const catcher=new THREE.Mesh(new THREE.PlaneGeometry(65,43),new THREE.ShadowMaterial({opacity:.15}));catcher.rotation.x=-Math.PI/2;catcher.position.y=-.34;catcher.receiveShadow=true;scene.add(catcher);
  const boardMat=new THREE.MeshPhysicalMaterial({color:0xf5f4ec,roughness:.65,clearcoat:.15});
  const base=new THREE.Mesh(roundedBox(22.1,22.8,.22,.4),boardMat);base.position.set(0,-.24,.2);base.receiveShadow=true;base.castShadow=true;boardGroup.add(base);
  const inset=new THREE.Mesh(roundedBox(20.5,20.5,.035,.12),new THREE.MeshStandardMaterial({color:0xf2f2e9,roughness:.82}));inset.position.y=-.015;inset.receiveShadow=true;boardGroup.add(inset);
  const pegGeo=new THREE.CylinderGeometry(.09*pitch,.13*pitch,.5*pitch,10);
  const pegs=new THREE.InstancedMesh(pegGeo,new THREE.MeshStandardMaterial({color:0xe7e7df,roughness:.48}),size*size);
  const dummy=new THREE.Object3D();
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){dummy.position.set((c-(size-1)/2)*pitch,.25*pitch,(r-(size-1)/2)*pitch);dummy.updateMatrix();pegs.setMatrixAt(r*size+c,dummy.matrix);}
  pegs.castShadow=true;pegs.receiveShadow=true;boardGroup.add(pegs);
  const boardLabel=new THREE.Mesh(new THREE.PlaneGeometry(8,1.2),new THREE.MeshBasicMaterial({map:textTexture(`${size} × ${size}   ·   ${size*size} 孔位`,{width:512,height:80,size:32}),transparent:true,depthWrite:false}));
  boardLabel.rotation.x=-Math.PI/2;boardLabel.position.set(0,.018,11.1);boardGroup.add(boardLabel);
  for(const x of[-10.28,10.28])for(const z of[-10.28,10.28]){const dot=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.035,16),new THREE.MeshStandardMaterial({color:0xfefef8,roughness:.6}));dot.position.set(x,.02,z);boardGroup.add(dot);}

  const beadGeo=ringGeometry(.36,.19,.21,size>=56?Math.max(14,Math.round(detail.segments*.7)):detail.segments),materials=new Map(),beads=new Map();
  function beadMaterial(hex){if(!materials.has(hex))materials.set(hex,new THREE.MeshPhysicalMaterial({color:hex,vertexColors:true,roughness:.27,clearcoat:.65,clearcoatRoughness:.18}));return materials.get(hex);}
  const targets=new Map(),targetGroups=[];let hintVisible=true;
  const cellPlane=new THREE.PlaneGeometry(pitch*.87,pitch*.87);
  const fallenWhiteGeometry=new THREE.RingGeometry(pitch*.40,pitch*.53,32),fallenBlueGeometry=new THREE.RingGeometry(pitch*.42,pitch*.50,32);
  const fallenWhiteMaterial=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),fallenBlueMaterial=new THREE.MeshBasicMaterial({color:0x04caff,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  let fallenBorder,fallenRings,fallenCapacity=0;
  function ensureFallenCapacity(count){if(count<=fallenCapacity)return;fallenBorder?.removeFromParent();fallenRings?.removeFromParent();fallenBorder?.dispose();fallenRings?.dispose();fallenCapacity=Math.max(size*size,2**Math.ceil(Math.log2(Math.max(1,count))));fallenBorder=new THREE.InstancedMesh(fallenWhiteGeometry,fallenWhiteMaterial,fallenCapacity);fallenRings=new THREE.InstancedMesh(fallenBlueGeometry,fallenBlueMaterial,fallenCapacity);fallenBorder.count=fallenRings.count=0;fallenBorder.renderOrder=9;fallenRings.renderOrder=10;fallenBorder.frustumCulled=fallenRings.frustumCulled=false;boardGroup.add(fallenBorder,fallenRings);}
  function syncFallenHighlights(){fallenDirty=false;const loose=[];for(const b of beads.values())if(b.fallen)loose.push(b);ensureFallenCapacity(Math.max(1,loose.length));fallenBorder.count=fallenRings.count=loose.length;loose.forEach((b,index)=>{dummy.position.copy(b.position);dummy.quaternion.copy(camera.quaternion);dummy.scale.setScalar(1);dummy.updateMatrix();fallenBorder.setMatrixAt(index,dummy.matrix);fallenRings.setMatrixAt(index,dummy.matrix);});fallenBorder.instanceMatrix.needsUpdate=true;fallenRings.instanceMatrix.needsUpdate=true;}
  ensureFallenCapacity(1);
  const errorBorder=new THREE.InstancedMesh(new THREE.RingGeometry(pitch*.395,pitch*.50,32),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),size*size);
  const errorRings=new THREE.InstancedMesh(new THREE.RingGeometry(pitch*.415,pitch*.477,32),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),size*size);
  errorBorder.count=errorRings.count=0;errorBorder.renderOrder=7;errorRings.renderOrder=8;errorBorder.frustumCulled=errorRings.frustumCulled=false;boardGroup.add(errorBorder,errorRings);let errorKey='';
  function setErrors(errors){const key=errors.map(b=>`${b.id}:${b.row}:${b.col}:${b.type}`).join('|');if(key===errorKey)return;errorKey=key;errorBorder.count=errorRings.count=errors.length;
    errors.forEach((bead,index)=>{dummy.position.set((bead.col-(size-1)/2)*pitch,.55*pitch,(bead.row-(size-1)/2)*pitch);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();errorBorder.setMatrixAt(index,dummy.matrix);errorRings.setMatrixAt(index,dummy.matrix);errorRings.setColorAt(index,new THREE.Color(bead.type==='extra'?'#ef8700':'#ff2454'));});errorBorder.instanceMatrix.needsUpdate=true;errorRings.instanceMatrix.needsUpdate=true;if(errorRings.instanceColor)errorRings.instanceColor.needsUpdate=true;
  }
  function clearTargets(){for(const m of targetGroups){boardGroup.remove(m);m.dispose?.();if(m.geometry!==cellPlane)m.geometry.dispose();m.material.dispose();m.material.map?.dispose();}targetGroups.length=0;targets.clear();}
  function showPattern(next){
    clearTargets();const entries=next.cells.flatMap((hex,index)=>hex?[{hex,index}]:[]);if(!entries.length)return;
    const shades=[...new Set(entries.map(e=>e.hex))],columns=Math.ceil(Math.sqrt(shades.length)),rows=Math.ceil(shades.length/columns),tileW=96,tileH=64;
    const canvas=document.createElement('canvas');canvas.width=columns*tileW;canvas.height=rows*tileH;const ctx=canvas.getContext('2d'),shadeIndex=new Map(shades.map((hex,i)=>[hex,i]));
    shades.forEach((hex,i)=>{const code=colorByHex(hex)?.code||'?',x=(i%columns+.5)*tileW,y=(Math.floor(i/columns)+.5)*tileH;ctx.font=`bold ${code.length>4?20:code.length>3?32:41}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=5;ctx.strokeStyle='rgba(255,255,250,.92)';ctx.strokeText(code,x,y);ctx.fillStyle='#18251c';ctx.fillText(code,x,y);});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.InstancedMesh(cellPlane,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.30,depthWrite:false,side:THREE.DoubleSide}),entries.length);m.frustumCulled=false;
    const labelGeometry=new THREE.PlaneGeometry(pitch*.96,pitch*.64),offsets=new Float32Array(entries.length*2),labelMaterial=new THREE.MeshBasicMaterial({map:texture,toneMapped:false,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
    labelMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute vec2 labelOffset;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv=vMapUv*vec2(${1/columns},${1/rows})+labelOffset;\n#endif`);};labelMaterial.customProgramCacheKey=()=>`hint-atlas-${columns}-${rows}`;
    const labels=new THREE.InstancedMesh(labelGeometry,labelMaterial,entries.length);labels.renderOrder=6;labels.frustumCulled=false;
    entries.forEach(({hex,index},local)=>{const x=(index%size-(size-1)/2)*pitch,z=(Math.floor(index/size)-(size-1)/2)*pitch;dummy.position.set(x,.075,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();m.setMatrixAt(local,dummy.matrix);m.setColorAt(local,new THREE.Color(hex));const matrix=dummy.matrix.clone();dummy.position.set(x,.6*pitch,z);dummy.quaternion.copy(camera.quaternion);dummy.updateMatrix();labels.setMatrixAt(local,dummy.matrix);const at=shadeIndex.get(hex);offsets[local*2]=(at%columns)/columns;offsets[local*2+1]=(rows-1-Math.floor(at/columns))/rows;targets.set(index,{m,labels,local,matrix,labelMatrix:dummy.matrix.clone(),visible:true,hex});});
    labelGeometry.setAttribute('labelOffset',new THREE.InstancedBufferAttribute(offsets,2));boardGroup.add(m,labels);targetGroups.push(m,labels);setHintVisible(hintVisible);heldGlowDirty=true;
  }
  function setHintVisible(value){hintVisible=!!value;for(const m of targetGroups)m.visible=hintVisible;heldGlowDirty=true;}
  // 手里拿着某个颜色时，板上还空着、需要这个颜色的位置一闪一闪地亮起来（提示被遮住或关闭时不亮）。
  const heldGlowOuter=new THREE.InstancedMesh(new THREE.RingGeometry(pitch*.28,pitch*.49,28),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),Math.max(1,size*size));
  const heldGlowInner=new THREE.InstancedMesh(new THREE.RingGeometry(pitch*.32,pitch*.43,28),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),Math.max(1,size*size));
  heldGlowOuter.count=heldGlowInner.count=0;heldGlowOuter.renderOrder=9;heldGlowInner.renderOrder=10;heldGlowOuter.frustumCulled=heldGlowInner.frustumCulled=false;boardGroup.add(heldGlowOuter,heldGlowInner);
  let heldGlowDirty=true,heldGlowEnabled=true;
  function rebuildHeldGlow(){
    heldGlowDirty=false;let count=0;const hex=heldGlowEnabled&&hintVisible&&toolHeld?toolHeld.color:null;
    if(hex){heldGlowInner.material.color.set(hex);for(const [index,t] of targets){if(!t.visible||t.hex!==hex)continue;dummy.position.set((index%size-(size-1)/2)*pitch,.62*pitch,(Math.floor(index/size)-(size-1)/2)*pitch);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();heldGlowOuter.setMatrixAt(count,dummy.matrix);heldGlowInner.setMatrixAt(count,dummy.matrix);count++;}}
    heldGlowOuter.count=heldGlowInner.count=count;heldGlowOuter.instanceMatrix.needsUpdate=heldGlowInner.instanceMatrix.needsUpdate=true;
  }
  function setHeldGlow(value){heldGlowEnabled=!!value;heldGlowDirty=true;}
  function setTargetVisibility(r,c,value){const t=targets.get(r*size+c);if(!t||t.visible===value)return;t.visible=value;heldGlowDirty=true;const hidden=new THREE.Matrix4().makeScale(0,0,0);t.m.setMatrixAt(t.local,value?t.matrix:hidden);t.labels.setMatrixAt(t.local,value?t.labelMatrix:hidden);t.m.instanceMatrix.needsUpdate=true;t.labels.instanceMatrix.needsUpdate=true;}
  // 已套稳的豆合批成一个实例网格绘制（64 格板也只多一次绘制）。V5.6：正在落下、被摇松或掉落的豆也合批成另一个实例网格，摇掉几百颗也只多一次绘制。
  const seatedBeads=new Map(),seatedIds=[],seatColor=new THREE.Color();
  const seatedMaterial=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.27,clearcoat:.65,clearcoatRoughness:.18});
  const seatedMesh=new THREE.InstancedMesh(beadGeo,seatedMaterial,Math.max(1,size*size));seatedMesh.count=0;seatedMesh.castShadow=true;seatedMesh.receiveShadow=true;seatedMesh.frustumCulled=false;
  seatedMesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1,size*size)*3),3);boardGroup.add(seatedMesh);
  function writeSeat(entry){dummy.position.set((entry.col-(size-1)/2)*pitch,.21*pitch,(entry.row-(size-1)/2)*pitch);dummy.quaternion.identity();dummy.scale.setScalar(pitch);dummy.updateMatrix();seatedMesh.setMatrixAt(entry.slot,dummy.matrix);seatedMesh.setColorAt(entry.slot,seatColor.set(entry.color));seatedMesh.instanceMatrix.needsUpdate=true;seatedMesh.instanceColor.needsUpdate=true;}
  function seat(id,row,col,color){let entry=seatedBeads.get(id);if(!entry){entry={slot:seatedIds.length,row,col,color};seatedIds.push(id);seatedBeads.set(id,entry);seatedMesh.count=seatedIds.length;}Object.assign(entry,{row,col,color});writeSeat(entry);}
  function unseat(id){const entry=seatedBeads.get(id);if(!entry)return null;const last=seatedIds.pop();if(last!==id){const moved=seatedBeads.get(last);moved.slot=entry.slot;seatedIds[entry.slot]=last;writeSeat(moved);}seatedBeads.delete(id);seatedMesh.count=seatedIds.length;seatedMesh.instanceMatrix.needsUpdate=true;return entry;}
  let looseCapacity=0,looseMesh=null,looseDirty=false,fallenDirty=false;const looseIds=[];
  function ensureLooseCapacity(count){if(count<=looseCapacity)return;const next=Math.max(64,2**Math.ceil(Math.log2(count)));const mesh=new THREE.InstancedMesh(beadGeo,seatedMaterial,next);mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(next*3),3);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.count=0;if(looseMesh){looseMesh.removeFromParent();looseMesh.dispose();}looseMesh=mesh;looseCapacity=next;boardGroup.add(mesh);for(const b of beads.values())writeLoose(b);looseMesh.count=looseIds.length;}
  function writeLoose(b){dummy.position.copy(b.position);dummy.quaternion.copy(b.quaternion);dummy.scale.setScalar(pitch);dummy.updateMatrix();looseMesh.setMatrixAt(b.slot,dummy.matrix);looseMesh.setColorAt(b.slot,seatColor.set(b.color));looseDirty=true;}
  // 不在柱上的豆：轻量记录 + 实例网格里的一个位置（slot），不再为每颗豆建一个网格。
  function beadMesh(id,color){ensureLooseCapacity(looseIds.length+1);const b={beadId:id,color,row:0,col:0,fallen:false,slot:looseIds.length,position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};looseIds.push(id);beads.set(id,b);looseMesh.count=looseIds.length;writeLoose(b);return b;}
  function dropLoose(id){const b=beads.get(id);if(!b)return null;const last=looseIds.pop();if(last!==id){const moved=beads.get(last);moved.slot=b.slot;looseIds[b.slot]=last;writeLoose(moved);}beads.delete(id);looseMesh.count=looseIds.length;looseDirty=true;if(b.fallen)fallenDirty=true;return b;}
  function addBead(bead){if(beads.has(bead.id)||seatedBeads.has(bead.id))return;const b=beadMesh(bead.id,bead.color);b.row=bead.row;b.col=bead.col;b.position.set((bead.col-(size-1)/2)*pitch,.21*pitch,(bead.row-(size-1)/2)*pitch);if(!bead.pose)setTargetVisibility(bead.row,bead.col,false);else{b.fallen=true;b.position.set(bead.pose.x*pitch,bead.pose.y*pitch,bead.pose.z*pitch);b.quaternion.set(bead.pose.rotation.x,bead.pose.rotation.y,bead.pose.rotation.z,bead.pose.rotation.w);fallenDirty=true;}writeLoose(b);}
  function removeBead(id,r,c){dropLoose(id);unseat(id);fallenDirty=true;if(r!=null)setTargetVisibility(r,c,true);}
  function updateBeadColor(bead){const b=beads.get(bead.id);if(b){b.color=bead.color;writeLoose(b);}const entry=seatedBeads.get(bead.id);if(entry){entry.color=bead.color;writeSeat(entry);}}
  function updatePoses(poses){
    for(const p of poses){
      if(p.state==='seated'){
        const b=dropLoose(p.id);
        if(b)seat(p.id,p.row,p.col,b.color);
        continue;
      }
      let b=beads.get(p.id);
      if(!b){const entry=unseat(p.id);if(!entry)continue;b=beadMesh(p.id,entry.color);b.row=entry.row;b.col=entry.col;}
      b.position.set(p.x*pitch,p.y*pitch,p.z*pitch);b.quaternion.set(p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w);writeLoose(b);
      const fallen=p.state==='loose';if(fallen||b.fallen)fallenDirty=true;b.fallen=fallen;
    }
  }
  // 每帧最多同步一次（在渲染前），避免同一帧里多次上传实例数据。
  function flushLoose(){if(looseDirty&&looseMesh){looseMesh.instanceMatrix.needsUpdate=true;if(looseMesh.instanceColor)looseMesh.instanceColor.needsUpdate=true;looseDirty=false;}if(fallenDirty)syncFallenHighlights();}
  function clearBeads(){beads.clear();looseIds.length=0;if(looseMesh)looseMesh.count=0;seatedBeads.clear();seatedIds.length=0;seatedMesh.count=0;setErrors([]);syncFallenHighlights();for(const index of targets.keys())setTargetVisibility(Math.floor(index/size),index%size,true);}

  // Forty-eight open bins are live geometry, with loose-looking upright and
  // sideways hollow cylinders in the same lighting as the peg board.
  const bins=[],binPick=[],binBeanGeo=ringGeometry(.225,.105,.20,18),binWallMat=new THREE.MeshStandardMaterial({color:0xf4f0e5,roughness:.53});
  const binOutline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.09,.03,2.19)),new THREE.LineBasicMaterial({color:0x718d59}));binOutline.visible=false;trayGroup.add(binOutline);
  const tooltip=document.createElement('div');tooltip.className='workbench-tooltip';tooltip.style.cssText='position:absolute;z-index:5;pointer-events:none;display:none;padding:7px 10px;background:rgba(253,252,240,.95);border:1px solid #e0e2d3;border-radius:7px;font:11px Microsoft YaHei;color:#6c795d;white-space:nowrap';container.appendChild(tooltip);
  const binGeo=openBinGeometry();
  function setPalette(colors){
  for(const bin of bins){bin.group.removeFromParent();bin.beans.dispose?.();bin.label.material.map.dispose();bin.label.material.dispose();bin.label.geometry.dispose();}bins.length=0;binPick.length=0;
  colors.slice(0,48).forEach((shade,index)=>{
    const group=new THREE.Group(),home=new THREE.Vector3(-25.8+(index%8)*2.18,.03,-7.9+Math.floor(index/8)*2.64).sub(trayOrigin);group.position.copy(home);trayGroup.add(group);
    const body=new THREE.Mesh(binGeo,binWallMat);body.castShadow=true;body.receiveShadow=true;body.userData.bin=index;group.add(body);binPick.push(body);
    const beans=new THREE.InstancedMesh(binBeanGeo,beadMaterial(shade.hex),28);beans.castShadow=true;beans.receiveShadow=true;
    const slots=[];for(let i=0;i<28;i++){const a=i*2.3999;dummy.position.set(i<16?-.70+(i%4)*.46+Math.sin(a)*.055:Math.sin(a)*.65,i<16?.72:1.08,i<16?-.71+Math.floor(i/4)*.46+Math.cos(a)*.05:Math.cos(a)*.66);dummy.rotation.set(i%3===0?Math.PI/2:Math.sin(a)*.48,a,i%5===0?.85:Math.cos(a)*.24);dummy.scale.setScalar(1);dummy.updateMatrix();beans.setMatrixAt(i,dummy.matrix);slots.push(dummy.position.clone());}group.add(beans);beans.userData.bin=index;binPick.push(beans);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.47),new THREE.MeshBasicMaterial({map:textTexture(shade.code,{width:128,height:48,size:shade.code.length>4?23:38,color:'#354031',background:'#f4f0e5'}),transparent:true}));label.rotation.x=-Math.PI/2;label.position.set(0,1.08,1.06);group.add(label);
    bins.push({group,home,beans,shade,index,label,slots});
  });
  trayPaletteRebuilt();
  }
  const paletteTitle=new THREE.Mesh(new THREE.PlaneGeometry(10,1.4),new THREE.MeshBasicMaterial({map:textTexture(`拼豆色号`,{width:512,height:80,size:37}),transparent:true}));paletteTitle.rotation.x=-Math.PI/2;paletteTitle.position.set(0,.05,-8.75);trayGroup.add(paletteTitle);

  // A small succulent, the parked tweezers and iron establish the same table
  // scale as the reference instead of floating dashboard illustrations.
  const pot=new THREE.Group();pot.position.set(-.3,0,-11.8);trayGroup.add(pot);
  const potBody=new THREE.Mesh(new THREE.CylinderGeometry(1.05,.92,1.3,24),new THREE.MeshStandardMaterial({color:0xf6f5ee,roughness:.68}));potBody.position.y=.45;potBody.castShadow=true;pot.add(potBody);
  const soil=new THREE.Mesh(new THREE.CylinderGeometry(.94,.94,.1,24),new THREE.MeshStandardMaterial({color:0x858b65,roughness:1}));soil.position.y=1.08;pot.add(soil);
  const leafGeo=new THREE.SphereGeometry(1,12,8);for(let i=0;i<10;i++){const leaf=new THREE.Mesh(leafGeo,new THREE.MeshStandardMaterial({color:i%2?0xb8c99c:0xa8be8a,roughness:.75}));const angle=i*2.4;leaf.scale.set(.33,.15,.73);leaf.position.set(Math.sin(angle)*.39,1.24+(i>5?.12:0),Math.cos(angle)*.39);leaf.rotation.set(-.22,angle,.08);leaf.castShadow=true;pot.add(leaf);}

  const silver=new THREE.MeshStandardMaterial({color:0xd2d6ce,metalness:.63,roughness:.27});
  // V5.6：不锈钢精密弯头镊 + 拼豆笔模型（tool-models.js）。钢件单独用一张房间环境贴图，才有金属反光，不影响其它物体。
  const toolMaterials=createToolMaterials(),toolPmrem=new THREE.PMREMGenerator(renderer),toolEnv=toolPmrem.fromScene(new RoomEnvironment(),.04).texture;toolPmrem.dispose();
  for(const m of [toolMaterials.steel,toolMaterials.steelTip]){m.envMap=toolEnv;m.envMapIntensity=.85;}
  toolMaterials.silicone.envMap=toolEnv;toolMaterials.silicone.envMapIntensity=.25;
  const tweezersOrigin=new THREE.Vector3(19.1,0,-10.8),tweezersGroup=new THREE.Group();tweezersGroup.position.copy(tweezersOrigin);scene.add(tweezersGroup);
  const parkedTweezers=makeTweezers(toolMaterials);parkedTweezers.position.set(0,.18,0);parkedTweezers.rotation.y=-.9;tweezersGroup.add(parkedTweezers);
  const cursorTarget=new THREE.Vector3();
  const cursorTool=makeTweezers(toolMaterials);cursorTool.visible=false;scene.add(cursorTool);
  const heldMesh=new THREE.Mesh(beadGeo,beadMaterial('#ef4b5a'));heldMesh.scale.setScalar(.73);heldMesh.position.set(0,.13,-.04);heldMesh.castShadow=true;heldMesh.visible=false;cursorTool.add(heldMesh);
  const penModel=makeBeadPen(beadGeo,toolMaterials);penModel.visible=false;cursorTool.add(penModel);
  let toolHeld=null,tools={locked:false,pen:false},tweezersEditing=false;
  function setHeld(value){if(toolHeld?.color!==value?.color)heldGlowDirty=true;toolHeld=value;heldMesh.visible=!!value&&!tools.pen;if(value)heldMesh.material=beadMaterial(value.color);penModel.userData.setBeads(value?beadMaterial(value.color):null,value?.remaining||0);const bin=value&&bins.find(b=>b.shade.hex===value.color);binOutline.visible=!!bin;if(bin)binOutline.position.copy(bin.group.position).add(new THREE.Vector3(0,1.24,0));}
  function setPaletteFilter(mode,cells){const needed=new Set(cells.filter(Boolean)),visible=bins.filter(bin=>mode!=='needed'||needed.has(bin.shade.hex));trayColumns=mode==='needed'?Math.min(4,Math.max(1,Math.ceil(Math.sqrt(visible.length)))):8;trayRows=Math.max(1,Math.ceil(visible.length/trayColumns));for(const bin of bins)bin.group.visible=false;visible.forEach((bin,index)=>{bin.group.visible=true;bin.home.set((index%trayColumns-(trayColumns-1)/2)*2.18,.03,(Math.floor(index/trayColumns)-(trayRows-1)/2)*2.64);bin.group.position.copy(bin.home);});paletteTitle.material.map.dispose();paletteTitle.material.map=textTexture(`拼豆色号 · 本页 ${visible.length} 色`,{width:512,height:80,size:37});paletteTitle.position.z=-(trayRows-1)/2*2.64-2.0;pot.position.z=paletteTitle.position.z-3.0;binOutline.visible=false;}
  function updateToolVisibility(){const x=pointerClient.x,y=pointerClient.y,inside=part=>{const r=boundsFor(part);return r&&x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height;};const onParked=inside('tweezers')||inside('iron'),working=inside('board')||inside('tray');cursorTool.visible=pointerInside&&working&&!onParked&&!tweezersEditing&&(!tools.locked||tools.pen);parkedTweezers.visible=!tools.locked&&(!cursorTool.visible||tools.pen);}
  function setTools(next){tools=next;cursorTool.userData.body.visible=!next.pen;penModel.visible=!!next.pen;heldMesh.visible=!!toolHeld&&!next.pen;updateToolVisibility();}

  const ironOrigin=new THREE.Vector3(21.8,0,8.1),ironStation=new THREE.Group();ironStation.position.copy(ironOrigin);scene.add(ironStation);
  const iron=new THREE.Group();iron.position.set(0,.05,0);iron.rotation.y=-.2;ironStation.add(iron);
  const ironShape=new THREE.Shape();ironShape.moveTo(0,-2.0);ironShape.bezierCurveTo(1.55,-.5,1.28,1.7,.68,2.0);ironShape.lineTo(-.68,2.0);ironShape.bezierCurveTo(-1.28,1.7,-1.55,-.5,0,-2.0);
  const soleGeo=new THREE.ExtrudeGeometry(ironShape,{depth:.16,bevelEnabled:true,bevelSize:.06,bevelThickness:.04,bevelSegments:3,curveSegments:18});soleGeo.rotateX(-Math.PI/2);
  const sole=new THREE.Mesh(soleGeo,silver);sole.castShadow=true;iron.add(sole);
  const ironBody=new THREE.Mesh(soleGeo,new THREE.MeshStandardMaterial({color:0xfaf9f1,roughness:.36}));ironBody.scale.set(.93,2.5,.92);ironBody.position.y=.15;ironBody.castShadow=true;iron.add(ironBody);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.7,.17,8,24,Math.PI),new THREE.MeshStandardMaterial({color:0xf2f1e8,roughness:.43}));handle.rotation.set(Math.PI/2,0,Math.PI/2);handle.position.set(0,.7,.15);handle.scale.set(1.6,1,1);iron.add(handle);
  const mat=new THREE.Mesh(roundedBox(3.3,4.8,.1,.35),new THREE.MeshStandardMaterial({color:0xe1e6d2,roughness:.9}));mat.position.set(0,-.17,0);mat.rotation.y=-.2;mat.receiveShadow=true;ironStation.add(mat);
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(19.8,19.8),new THREE.MeshStandardMaterial({color:0xfffaf0,transparent:true,opacity:.58,side:THREE.DoubleSide,roughness:1}));paper.rotation.x=-Math.PI/2;paper.position.set(BOARD.x,.7,BOARD.z);paper.visible=false;scene.add(paper);
  let ironing=0,ironResolve=null;
  function animateIron(){if(ironResolve)return Promise.resolve();ironing=0.001;paper.visible=true;return new Promise(resolve=>ironResolve=resolve);}

  // 装豆盒打翻：豆盒从左上到右下依次被掀歪，每盒的豆沿抛物线倒到托盘前方的桌面上，落地弹一下再滚几下；
  // 每复原一段，这一段的豆排队飞回原来的盒子，盒子逐颗装满并慢慢摆正。全部是脚本动画，只作装饰，不影响豆板进度。
  const TRAY_BEADS=170,RETURN_GAP=.024;
  let trayWorld=null,trayDestroyed=false,trayState={spilled:false,stage:0},loose=[],spillClock=0,finishing=false,finishTimer=null;
  const trayVec=new THREE.Vector3(),trayQuat=new THREE.Quaternion(),trayEuler=new THREE.Euler(),spinAxis=new THREE.Vector3();
  function trayRandom(seed){let s=seed>>>0;return()=>{s=Math.imul(s^s>>>15,2246822507)+0x9e3779b9>>>0;s^=s>>>13;return(s>>>0)/4294967296;};}
  function clearLoose(){for(const item of loose)item.mesh.removeFromParent();loose=[];finishing=false;clearTimeout(finishTimer);}
  function slotWorld(bin,slot,target=new THREE.Vector3()){return bin.group.localToWorld(target.copy(bin.slots[slot%bin.slots.length]));}
  function restBin(bin){bin.tilt=0;bin.group.rotation.set(0,0,0);bin.group.position.copy(bin.home);bin.group.scale.set(1,1,1);bin.beans.count=28;bin.bump=0;bin.rest=undefined;}
  const easeOut=t=>1-(1-t)**3,easeInOut=t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2;
  function spawnTraySpill(animate,stage=0){
    clearLoose();spillClock=animate?0:10;trayGroup.updateMatrixWorld(true);
    const visible=bins.filter(bin=>bin.group.visible);if(!visible.length)return;
    const random=trayRandom(visible.length*7919+(Date.now()%100000)),s=trayGroup.scale.x;
    const xs=visible.map(b=>b.home.x),zs=visible.map(b=>b.home.z),minX=Math.min(...xs),minZ=Math.min(...zs);
    const box=new THREE.Box3();for(const bin of visible)box.expandByPoint(bin.group.localToWorld(trayVec.set(0,0,0)));
    for(const bin of visible){
      const col=Math.round((bin.home.x-minX)/2.18),row=Math.round((bin.home.z-minZ)/2.64);
      bin.delay=col*.03+row*.055+random()*.04;bin.peak=.75+random()*.25;bin.rest=.12+random()*.16;bin.yaw=(random()-.5)*.5;bin.shiftX=(random()-.5)*.45;bin.shiftZ=.15+random()*.35;
      bin.assigned=0;bin.returned=0;bin.poured=!animate;bin.tilt=animate?0:bin.rest*(1-stage/5);bin.bump=0;
    }
    const per=Math.max(3,Math.min(8,Math.floor(TRAY_BEADS/visible.length)));let order=0;
    for(let k=0;k<per;k++)for(const bin of visible){
      const itemStage=order%5+1;order++;
      const origin=bin.group.localToWorld(trayVec.set(0,0,0));
      // 落点：托盘前方的桌面，大体顺着盒子所在的列散开，越靠后的豆滚得越远。
      const land=new THREE.Vector3(
        THREE.MathUtils.clamp(origin.x+(random()+random()+random()-1.5)*2.4*s,box.min.x-1.6*s,box.max.x+2.6*s),
        .2*s,
        box.max.z+(1.3+Math.pow(random(),.75)*5.4)*s);
      const lying=random()<.62;trayEuler.set(lying?Math.PI/2:0,random()*Math.PI*2,lying?(random()-.5)*.3:0);
      const mesh=new THREE.Mesh(binBeanGeo,beadMaterial(bin.shade.hex));mesh.castShadow=true;mesh.scale.setScalar(s);mesh.visible=false;scene.add(mesh);
      const item={mesh,bin,slot:(k*5+3)%28,stage:itemStage,phase:'wait',launchAt:bin.delay+.1+k*.03+random()*.05,
        from:new THREE.Vector3(),land,slide:new THREE.Vector3((random()-.5)*.8*s,0,(.2+random()*.7)*s),finalQuat:new THREE.Quaternion().setFromEuler(trayEuler),
        fly:.55+random()*.35,height:(1.6+random()*1.8)*s,spin:new THREE.Vector3(random()-.5,random()-.5,random()-.5).normalize(),spinSpeed:8+random()*10,t:0,startQuat:new THREE.Quaternion(),returnDelay:0,returnT:0,duration:.6};
      bin.assigned++;loose.push(item);
      if(!animate){
        if(itemStage<=stage){item.phase='done';bin.returned++;continue;}
        // 刷新后直接摆成已经散落的样子。
        mesh.position.copy(land).add(item.slide);mesh.quaternion.copy(item.finalQuat);mesh.visible=true;item.phase='rest';
      }
    }
    for(const bin of visible)bin.beans.count=animate?28:Math.min(28,3+Math.round(25*bin.returned/Math.max(1,bin.assigned)));
  }
  function startReturn(item,index){
    if(item.phase==='return'||item.phase==='done')return;
    if(item.phase==='wait'){item.phase='done';item.bin.returned++;return;}
    item.phase='return';item.returnT=0;item.returnDelay=index*RETURN_GAP;item.duration=.5+Math.random()*.25;item.from.copy(item.mesh.position);item.startQuat.copy(item.mesh.quaternion);
  }
  function setTrayState(spilled,stage=0,{animate=false}={}){
    if(spilled&&!trayState.spilled)spawnTraySpill(animate,stage);
    else if(spilled&&stage<trayState.stage)spawnTraySpill(false,stage);
    if(stage>trayState.stage||(!spilled&&trayState.spilled)){
      let index=0;const upto=spilled?stage:5;
      for(const item of loose)if(item.stage<=upto)startReturn(item,index++);
    }
    if(!spilled&&trayState.spilled)finishing=true;
    if(!spilled&&!trayState.spilled&&!finishing){clearLoose();for(const bin of bins)if(bin.rest!==undefined)restBin(bin);}
    trayState={spilled,stage};
  }
  function updateTray(dt){
    if(!loose.length&&!trayState.spilled&&!finishing)return;
    spillClock+=dt;const s=trayGroup.scale.x,smooth=1-Math.exp(-dt*5);
    for(const bin of bins){
      if(!bin.group.visible||bin.rest===undefined)continue;
      const t=spillClock-bin.delay,recover=trayState.spilled?trayState.stage/5:1,resting=bin.rest*(1-recover),lean=1-recover;
      let tilt;
      if(t<0)tilt=bin.tilt;
      else if(t<.14){tilt=bin.peak*easeOut(t/.14);}
      else if(t<.95){const u=t-.14;tilt=resting+(bin.peak-resting)*Math.exp(-u*7)*Math.cos(u*15);}
      else tilt=bin.tilt+(resting-bin.tilt)*smooth;
      if(t>=.1&&!bin.poured){bin.poured=true;bin.beans.count=3;}
      bin.tilt=tilt;bin.bump=Math.max(0,(bin.bump||0)-dt*5);
      const shove=t<0?0:Math.min(1,t/.25);
      bin.group.rotation.set(tilt,bin.yaw*lean*shove,0);
      bin.group.position.set(bin.home.x+bin.shiftX*lean*shove,bin.home.y+Math.abs(Math.sin(tilt))*.3,bin.home.z+Math.sin(tilt)*.5+bin.shiftZ*lean*shove);
      bin.group.scale.set(1+bin.bump*.06,1-bin.bump*.1,1+bin.bump*.06);
    }
    let pending=0;
    for(const item of loose){
      if(item.phase==='done')continue;pending++;const mesh=item.mesh;
      if(item.phase==='wait'){
        if(spillClock<item.launchAt)continue;
        item.phase='fly';item.t=0;mesh.visible=true;slotWorld(item.bin,item.slot,item.from);item.from.y+=.3*s;mesh.position.copy(item.from);item.startQuat.copy(item.bin.group.quaternion);
      }
      if(item.phase==='fly'){
        item.t=Math.min(1,item.t+dt/item.fly);const t=item.t,e=easeOut(t);
        mesh.position.lerpVectors(item.from,item.land,e);mesh.position.y=item.from.y*(1-t)+item.land.y*t+Math.sin(Math.PI*t)*item.height;
        trayQuat.setFromAxisAngle(item.spin,item.spinSpeed*t);mesh.quaternion.slerpQuaternions(item.startQuat,item.finalQuat,e).multiply(trayQuat);
        if(t===1){item.phase='bounce';item.t=0;}
      }else if(item.phase==='bounce'){
        // 落地后弹起一小下，再顺势滚一点。
        item.t=Math.min(1,item.t+dt/.45);const t=item.t;
        mesh.position.copy(item.land).addScaledVector(item.slide,easeOut(t));mesh.position.y=item.land.y+Math.abs(Math.sin(Math.PI*t*2))*(1-t)*.45*s;
        trayQuat.setFromAxisAngle(item.spin,item.spinSpeed*.15*(1-t));mesh.quaternion.copy(item.finalQuat).multiply(trayQuat);
        if(t===1)item.phase='rest';
      }else if(item.phase==='return'){
        if(item.returnDelay>0){item.returnDelay-=dt;continue;}
        item.returnT=Math.min(1,item.returnT+dt/item.duration);const t=item.returnT,e=easeInOut(t);
        const end=slotWorld(item.bin,item.slot,trayVec);end.y+=.35*s;const lift=(1.2+item.from.distanceTo(end)*.3)*s;
        mesh.position.lerpVectors(item.from,end,e);mesh.position.y+=Math.sin(t*Math.PI)*lift;
        trayQuat.setFromAxisAngle(item.spin,item.spinSpeed*.6*t);mesh.quaternion.slerpQuaternions(item.startQuat,item.bin.group.quaternion,e).multiply(trayQuat);
        if(t===1){item.phase='done';mesh.visible=false;const bin=item.bin;bin.returned++;bin.bump=1;bin.beans.count=Math.min(28,3+Math.round(25*bin.returned/Math.max(1,bin.assigned)));}
      }
    }
    // 全部收回后豆盒装满、摆正，再清理临时豆。
    if(finishing&&!pending){finishing=false;for(const bin of bins)if(bin.rest!==undefined){bin.beans.count=28;bin.bump=1;}
      finishTimer=setTimeout(()=>{if(trayState.spilled||finishing)return;for(const item of loose)item.mesh.removeFromParent();loose=[];for(const bin of bins)if(bin.rest!==undefined)restBin(bin);},900);}
  }
  function trayPaletteRebuilt(){if(trayState.spilled)spawnTraySpill(false,trayState.stage);}

  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
  let zoom=1,tilt='top',pointerInside=false,shakeTime=0,shakeDuration=.8,lastTime=performance.now(),disposed=false,clickTimer=null;
  let pointerClient={x:0,y:0},magnifier={active:false,size:220,zoom:2.5};
  const lens=document.createElement('canvas');lens.className='local-magnifier';lens.style.cssText='position:fixed;display:none;pointer-events:none;z-index:40;border:3px solid rgba(244,248,240,.96);border-radius:50%;box-shadow:0 5px 25px #0005;background:rgba(26,32,29,.12)';document.body.appendChild(lens);const lensContext=lens.getContext('2d');
  const lensCamera=camera.clone();let lensTarget=null,lensPixels=null,lensImage=null;
  function rayAt(x,y){const r=renderer.domElement.getBoundingClientRect();ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);return ray;}
  function cellFromClient(x,y){rayAt(x,y);boardGroup.updateMatrixWorld();const boardPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-boardGroup.position.y-.4*pitch*boardGroup.scale.x);if(!ray.ray.intersectPlane(boardPlane,point))return null;const local=boardGroup.worldToLocal(point.clone());const col=Math.round(local.x/pitch+(size-1)/2),row=Math.round(local.z/pitch+(size-1)/2);return row>=0&&col>=0&&row<size&&col<size?{row,col}:null;}
  function projectPoint(p){const projected=p.clone().project(camera),r=renderer.domElement.getBoundingClientRect();return{x:r.left+(projected.x+1)*r.width/2,y:r.top+(1-projected.y)*r.height/2};}
  function palettePoint(code){const bin=bins.find(b=>b.shade.code===code);if(!bin||!bin.group.visible)return null;return projectPoint(bin.group.localToWorld(new THREE.Vector3(0,.8,0)));}
  function cellPoint(row,col){return projectPoint(boardGroup.localToWorld(new THREE.Vector3((col-(size-1)/2)*pitch,.4*pitch,(row-(size-1)/2)*pitch)));}
  function looseWorld(b){return boardGroup.localToWorld(b.position.clone());}
  function fallenAt(x,y){rayAt(x,y);const loose=[...beads.values()].filter(b=>b.fallen);if(looseMesh&&loose.length){const hits=ray.intersectObject(looseMesh,false);for(const hit of hits){const id=looseIds[hit.instanceId];if(beads.get(id)?.fallen)return id;}}let nearest=null,distance=Infinity;for(const b of loose){const center=looseWorld(b),p=projectPoint(center),edge=projectPoint(center.clone().add(new THREE.Vector3(pitch*boardGroup.scale.x*.48,0,0))),radius=Math.max(6,Math.hypot(edge.x-p.x,edge.y-p.y)+2),d=Math.hypot(x-p.x,y-p.y);if(d<=radius&&d<distance){nearest=b.beadId;distance=d;}}return nearest;}
  function fallenPoint(id){const b=beads.get(id);return b?projectPoint(looseWorld(b)):null;}
  function boundsFor(part){
    const groups={board:boardGroup,tray:trayGroup,tweezers:tweezersGroup,iron:ironStation},group=groups[part];if(!group||part==='iron'&&ironing>0)return null;
    const corners=part==='board'?[[-11.2,-11.2],[11.2,-11.2],[11.2,11.8],[-11.2,11.8]]:part==='tray'?[[-trayColumns*1.09-1,-trayRows*1.32-5],[trayColumns*1.09+1,-trayRows*1.32-5],[trayColumns*1.09+1,trayRows*1.32+1],[-trayColumns*1.09-1,trayRows*1.32+1]]:part==='tweezers'?[[-3.6,-.7],[.8,-.7],[.8,3.1],[-3.6,3.1]]:[[-2.3,-2.8],[2.3,-2.8],[2.3,2.8],[-2.3,2.8]];
    group.updateMatrixWorld();const points=corners.map(([x,z])=>projectPoint(group.localToWorld(new THREE.Vector3(x,.3,z)))),x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),w=Math.max(...points.map(p=>p.x))-x,h=Math.max(...points.map(p=>p.y))-y;return{x:x-Math.max(0,28-w)/2,y:y-Math.max(0,28-h)/2,width:Math.max(28,w),height:Math.max(28,h)};
  }
  function partAt(x,y){for(const part of ['tweezers','iron','board','tray']){if(part==='tweezers'&&!parkedTweezers.visible)continue;const r=boundsFor(part);if(r&&x>=r.x&&y>=r.y&&x<=r.x+r.width&&y<=r.y+r.height)return part;}return null;}
  function setPartTransform(part,value){const group={board:boardGroup,tray:trayGroup,tweezers:tweezersGroup,iron:ironStation}[part],origin={board:new THREE.Vector3(BOARD.x,0,BOARD.z),tray:trayOrigin,tweezers:tweezersOrigin,iron:ironOrigin}[part];if(!group)return;group.position.set(origin.x+(value.x||0),0,origin.z+(value.z||0));group.scale.setScalar(clamp(value.scale||1,.3,2.5));if(part==='board')boardHome.copy(group.position);if(part==='tweezers')tweezersEditing=value.locked===false;group.updateMatrixWorld(true);updateToolVisibility();}
  function screenDelta(dx,dy){rayAt(0,0);const a=ray.ray.intersectPlane(plane,new THREE.Vector3());rayAt(dx,dy);const b=ray.ray.intersectPlane(plane,new THREE.Vector3());return a&&b?{x:b.x-a.x,z:b.z-a.z}:{x:0,z:0};}
  function cancelClick(){clearTimeout(clickTimer);clickTimer=null;}
  function setMagnifier(active,options={}){magnifier={...magnifier,...options,active:!!active};lens.style.display=active?'block':'none';}
  function setPointer(x,y){pointerClient={x,y};}
  function setToolSensitivity(value){toolSensitivity=normalizeToolSensitivity(value);}
  function resize(){fallenDirty=true;const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight),aspect=w/h;renderer.setSize(w,h,false);const width=Math.max(58,36*aspect)/zoom;camera.left=-width/2;camera.right=width/2;camera.top=width/aspect/2;camera.bottom=-width/aspect/2;const focusX=(zoom-1)*4;camera.position.set(focusX,tilt==='top'?65:42,tilt==='top'?35:43);camera.lookAt(focusX,0,0);camera.updateProjectionMatrix();}
  function setZoom(value){zoom=clamp(value,.7,2.1);resize();}
  function setView(value){tilt=value;resize();}
  function setDesk(value){deskPlane.visible=!!value;catcher.visible=!value;}
  function shakeVisual(duration=.8){shakeDuration=Math.max(.2,Math.min(15,duration));shakeTime=shakeDuration;}
  renderer.domElement.addEventListener('pointermove',event=>{pointerInside=true;setPointer(event.clientX,event.clientY);rayAt(event.clientX,event.clientY);if(ray.ray.intersectPlane(plane,point)){cursorTarget.set(point.x,.5,point.z);if(!cursorTool.visible)cursorTool.position.copy(cursorTarget);cursorTool.rotation.y=-.55;}updateToolVisibility();const hits=ray.intersectObjects(binPick.filter(m=>bins[m.userData.bin].group.visible),false);if(hits.length){const bin=bins[hits[0].object.userData.bin],r=container.getBoundingClientRect();tooltip.textContent=`${bin.shade.code} ${bin.shade.name} · 点击夹取`;tooltip.style.display='block';tooltip.style.left=`${event.clientX-r.left+12}px`;tooltip.style.top=`${event.clientY-r.top-35}px`;}else tooltip.style.display='none';});
  // 升级拼豆笔的划动放豆：按下后移到另一格才算划动（原单击行为不变），中间跳过的格子按直线补齐。
  let stroke=null,suppressClickUntil=0;
  function cellKey(cell){return cell?`${cell.row}:${cell.col}`:'';}
  function strokeTo(cell){
    if(!stroke||stroke.stopped)return;
    if(!cell){if(stroke.active&&onStroke?.(null,'move')===false)stroke.stopped=true;stroke.lastCell=null;return;}
    if(cellKey(cell)===cellKey(stroke.lastCell))return;
    if(!stroke.active){stroke.active=true;cancelClick();if(onStroke?.(stroke.start,'start')===false){stroke.stopped=true;return;}stroke.lastCell=stroke.start;}
    const from=stroke.lastCell||cell,steps=Math.max(Math.abs(cell.row-from.row),Math.abs(cell.col-from.col));
    for(let i=1;i<=steps;i++){const next={row:Math.round(from.row+(cell.row-from.row)*i/steps),col:Math.round(from.col+(cell.col-from.col)*i/steps)};if(onStroke?.(next,'move')===false){stroke.stopped=true;break;}}
    stroke.lastCell=cell;
  }
  function endStroke(){if(!stroke)return;if(stroke.active){suppressClickUntil=performance.now()+400;onStroke?.(null,'end');}stroke=null;}
  renderer.domElement.addEventListener('pointerdown',event=>{if(event.button!==0||!canStroke?.())return;const cell=cellFromClient(event.clientX,event.clientY);if(!cell)return;stroke={start:cell,lastCell:cell,active:false,stopped:false};try{renderer.domElement.setPointerCapture(event.pointerId);}catch{}});
  renderer.domElement.addEventListener('pointermove',event=>{if(stroke&&(event.buttons&1))strokeTo(cellFromClient(event.clientX,event.clientY));});
  renderer.domElement.addEventListener('pointerup',endStroke);
  renderer.domElement.addEventListener('pointercancel',endStroke);
  renderer.domElement.addEventListener('pointerleave',()=>{pointerInside=false;updateToolVisibility();tooltip.style.display='none';});
  renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
  renderer.domElement.addEventListener('dblclick',cancelClick);
  renderer.domElement.addEventListener('mousedown',event=>{rayAt(event.clientX,event.clientY);if(ray.ray.intersectPlane(plane,point)){cursorTarget.set(point.x,.5,point.z);cursorTool.position.copy(cursorTarget);}if(event.detail>1)cancelClick();});
  renderer.domElement.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){cancelClick();return;}if(event.detail>1){cancelClick();return;}const x=event.clientX,y=event.clientY;cancelClick();clickTimer=setTimeout(()=>{const fallen=fallenAt(x,y);if(fallen){onPickFallen?.(fallen);return;}rayAt(x,y);const hits=ray.intersectObjects(binPick.filter(m=>bins[m.userData.bin].group.visible),false);if(hits.length){if(!trayState.spilled)onPickColor?.(bins[hits[0].object.userData.bin].shade);return;}if(ray.intersectObject(iron,true).length){onAction?.('iron');return;}if(partAt(x,y)==='tweezers')return;onCell?.(cellFromClient(x,y),event);},partAt(x,y)==='iron'?500:220);});
  renderer.domElement.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
  const observer=new ResizeObserver(resize);observer.observe(container);
  function render(){
    if(disposed)return;const now=performance.now(),dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
    if(cursorTool.visible)cursorTool.position.lerp(cursorTarget,followBlend(dt,toolSensitivity));
    if(shakeTime>0){shakeTime=Math.max(0,shakeTime-dt);boardGroup.position.x=boardHome.x+Math.sin(now*.06)*(shakeTime/shakeDuration)*.16;boardGroup.position.z=boardHome.z+Math.cos(now*.065)*(shakeTime/shakeDuration)*.12;}
    updateTray(dt);
    if(heldGlowDirty)rebuildHeldGlow();
    if(heldGlowOuter.count){const pulse=.5+.5*Math.sin(now*.0065);heldGlowOuter.material.opacity=.45+.45*pulse;heldGlowInner.material.opacity=.7+.3*pulse;}
    if(ironing>0){ironing+=dt;const t=Math.min(1,ironing/3.2);iron.position.copy(ironStation.worldToLocal(new THREE.Vector3(boardHome.x+Math.sin(t*Math.PI*4)*7*boardGroup.scale.x,1.1*boardGroup.scale.x,boardHome.z+(-8+t*16)*boardGroup.scale.x)));iron.scale.setScalar(boardGroup.scale.x/ironStation.scale.x);paper.position.set(boardHome.x,.7*boardGroup.scale.x,boardHome.z);paper.scale.setScalar(boardGroup.scale.x);iron.rotation.y=Math.sin(t*Math.PI*5)*.13;paper.material.opacity=.5+Math.sin(t*Math.PI)*.2;if(t===1){ironing=0;paper.visible=false;iron.position.set(0,.05,0);iron.scale.setScalar(1);iron.rotation.y=-.2;const resolve=ironResolve;ironResolve=null;resolve?.();}}
    flushLoose();
    renderer.render(scene,camera);
    if(magnifier.active){
      const size=magnifier.size||220,dpr=Math.min(devicePixelRatio||1,2),rect=renderer.domElement.getBoundingClientRect(),resolution=Math.round(size*dpr);
      if(!lensTarget||lens.width!==resolution){lensTarget?.dispose();lens.width=lens.height=resolution;lens.style.width=lens.style.height=`${size}px`;lensTarget=new THREE.WebGLRenderTarget(resolution,resolution,{samples:4});lensTarget.texture.colorSpace=THREE.SRGBColorSpace;lensPixels=new Uint8Array(resolution*resolution*4);lensImage=lensContext.createImageData(resolution,resolution);}
      const left=pointerClient.x+size+24>innerWidth?pointerClient.x-size-24:pointerClient.x+24,top=clamp(pointerClient.y-size/2,4,innerHeight-size-4);lens.style.left=`${clamp(left,4,innerWidth-size-4)}px`;lens.style.top=`${top}px`;
      const sourceSize=size/magnifier.zoom;lensCamera.copy(camera);lensCamera.setViewOffset(rect.width,rect.height,pointerClient.x-rect.left-sourceSize/2,pointerClient.y-rect.top-sourceSize/2,sourceSize,sourceSize);
      const cursorVisible=cursorTool.visible;cursorTool.visible=false;renderer.setRenderTarget(lensTarget);renderer.render(scene,lensCamera);renderer.readRenderTargetPixels(lensTarget,0,0,resolution,resolution,lensPixels);renderer.setRenderTarget(null);cursorTool.visible=cursorVisible;
      for(let row=0;row<resolution;row++)lensImage.data.set(lensPixels.subarray(row*resolution*4,(row+1)*resolution*4),(resolution-1-row)*resolution*4);
      lensContext.putImageData(lensImage,0,0);lensContext.strokeStyle='rgba(58,101,72,.8)';lensContext.lineWidth=dpr;lensContext.beginPath();lensContext.moveTo(lens.width/2-7*dpr,lens.height/2);lensContext.lineTo(lens.width/2+7*dpr,lens.height/2);lensContext.moveTo(lens.width/2,lens.height/2-7*dpr);lensContext.lineTo(lens.width/2,lens.height/2+7*dpr);lensContext.stroke();
    }
  }
  function destroy(){cancelClick();lens.remove();lensTarget?.dispose();disposed=true;trayDestroyed=true;observer.disconnect();clearLoose();trayWorld?.free();const geometries=new Set(),mats=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);if(m.map)textures.add(m.map);}});geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());toolMaterials.dispose();toolEnv.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();tooltip.remove();ironResolve?.();}
  resize();setPalette(palette);setPaletteFilter('all',pattern.cells);setDesk(desk);showPattern(pattern);
  return {isFallback:false,element:renderer.domElement,showPattern,addBead,removeBead,updateBeadColor,updatePoses,setErrors,setHintVisible,setTargetVisibility,cellFromClient,cellPoint,palettePoint,setZoom,getZoom:()=>zoom,setView,setDesk,setHeld,setTools,setTrayState,setPalette,setPaletteFilter,animateIron,shakeVisual,render,clearBeads,destroy,boundsFor,partAt,setPartTransform,screenDelta,cancelClick,fallenAt,fallenPoint,setMagnifier,setPointer,setToolSensitivity,setHeldGlow,stats:()=>({heldGlow:heldGlowOuter.count,seatedInstances:seatedIds.length,tool:{visible:cursorTool.visible,tweezers:cursorTool.userData.body.visible,pen:penModel.visible,penBeads:penModel.userData.beadCount(),parked:parkedTweezers.visible},beadMeshes:beads.size,looseDraw:looseMesh?looseMesh.count:0,tray:{spilled:trayState.spilled,stage:trayState.stage,finishing,loose:loose.length,phases:loose.reduce((m,i)=>(m[i.phase]=(m[i.phase]||0)+1,m),{})},quality:WORKBENCH_QUALITY[quality]?quality:'high',pixelRatio:renderer.getPixelRatio(),shadowMap:light.shadow.mapSize.x,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,toolSensitivity:normalizeToolSensitivity(toolSensitivity),toolPosition:projectPoint(cursorTool.position),toolTarget:projectPoint(cursorTarget),errorHighlights:errorRings.count,fallenHighlights:fallenRings.count,parkedTweezers:parkedTweezers.visible,cursorTool:cursorTool.visible,ironHome:ironing===0&&iron.position.x===0&&iron.position.z===0&&iron.scale.x===1})};
}
