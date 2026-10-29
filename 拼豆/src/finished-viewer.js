import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// More heat makes a thinner piece, pushes plastic into the gaps and closes
// each surface opening. All three profiles keep a real hole through the part.
export const IRON_STYLES = Object.freeze([
  {id:'matte',name:'澡巾烫',detail:'连续熔面 · 浅细颗粒 · 哑光'},
  {id:'crinkle',name:'褶皱烘焙纸烫',detail:'不规则纸折痕 · 局部凹凸反光'},
  {id:'soft',name:'毛巾烫',detail:'较深圈绒压纹 · 柔散射表面'},
  {id:'double',name:'双面保孔烫',detail:'双面开孔 · 保留像素颗粒'},
  {id:'flat',name:'单面无孔烫',detail:'正面封孔亮面 · 背面保孔'},
]);
const PROFILES = Object.freeze({
  matte: {half:.16,holeFace:0,holeBottom:.12,holeMiddle:.13,faceRadius:.48,bulgeRadius:.5,fused:true,square:true,roughness:.94,normal:.64},
  crinkle: {half:.17,holeFace:0,holeBottom:.13,holeMiddle:.15,faceRadius:.49,bulgeRadius:.5,fused:true,square:true,roughness:.52,normal:.8,relief:.045},
  soft: {half:.19,holeFace:0,holeBottom:.15,holeMiddle:.16,faceRadius:.43,bulgeRadius:.5,fused:true,roughness:.91,normal:.95,sheen:.16,relief:.012},
  double: {half:.22,holeFace:.17,holeBottom:.17,holeMiddle:.19,faceRadius:.41,bulgeRadius:.5,fused:true,roughness:.52,clearcoat:.16},
  flat: {half:.145,holeFace:0,holeBottom:.18,holeMiddle:.17,faceRadius:.5,bulgeRadius:.5,fused:true,square:true,roughness:.24,clearcoat:.6},
  light: { half: 0.23, holeFace: 0.19, holeMiddle: 0.19, faceRadius: 0.37, bulgeRadius: 0.40, fused: false, roughness: 0.38 },
  standard: { half: 0.18, holeFace: 0.12, holeMiddle: 0.16, faceRadius: 0.43, bulgeRadius: 0.50, fused: true, roughness: 0.32 },
  fusion: { half: 0.13, holeFace: 0.045, holeMiddle: 0.09, faceRadius: 0.50, bulgeRadius: 0.50, fused: true, roughness: 0.28 },
});
export const isKnownIronStyle = style => Object.hasOwn(PROFILES, style);

// 成品画质：「标准」保持 V5.2 及以前的网格与贴图精度；「高」（默认）和「超高」按豆数分配网格预算，
// 提高孔洞与边缘分段、表面贴图分辨率、各向异性过滤和渲染像素。下载的 GLB 使用同一网格。
export const FINISH_QUALITIES = Object.freeze([
  {id:'standard',name:'标准',detail:'旧版精度，电脑较弱时使用'},
  {id:'high',name:'高',detail:'孔和边更圆，表面纹理约 2K'},
  {id:'ultra',name:'超高',detail:'最细分段，最高 4K 纹理，1.5 倍超采样'},
]);
export const normalizeFinishQuality = quality => FINISH_QUALITIES.some(item => item.id === quality) ? quality : 'high';
const QUALITY = Object.freeze({
  standard: {budget:0,texPerBead:22,texMin:1024,texMax:1024,aniso:4,pixel:1},
  high: {budget:460000,segments:[20,32],sub:[7,12],under:32,texPerBead:48,texMin:1536,texMax:3072,aniso:8,pixel:1},
  ultra: {budget:900000,segments:[24,48],sub:[9,16],under:48,texPerBead:80,texMin:2048,texMax:4096,aniso:16,pixel:1.5},
});
export function finishDetail(quality, size, beads) {
  const id = normalizeFinishQuality(quality), q = QUALITY[id];
  if (!q.budget) return { quality:id, segments:size<=24?24:16, sub:size<=24?8:6, under:24, texSide:1024, aniso:q.aniso, pixel:q.pixel };
  const n = Math.max(1, beads);
  const segments = Math.max(q.segments[0], Math.min(q.segments[1], Math.floor(q.budget / (7 * n) / 4) * 4));
  const perBead = q.budget / n - (3 * q.under + 1);
  const sub = Math.max(q.sub[0], Math.min(q.sub[1], Math.floor(Math.sqrt(Math.max(1, perBead)) - 1)));
  const texSide = Math.max(q.texMin, Math.min(q.texMax, Math.round(size * q.texPerBead / 256) * 256));
  return { quality:id, segments, sub, under:q.under, texSide, aniso:q.aniso, pixel:q.pixel };
}

function noise(x,z,seed) {
  return Math.sin(x*3.71+z*2.18+seed*.001)*.45 + Math.sin(x*8.27-z*5.63+seed*.0007)*.25 + Math.sin(x*17.1+z*13.2+seed*.00013)*.12;
}

function seededRandom(seed) {
  let state=seed>>>0;return()=>{state+=0x6d2b79f5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}

const foldCache=new Map();
function foldsFor(seed){if(!foldCache.has(seed)){const random=seededRandom(seed);foldCache.set(seed,Array.from({length:46},()=>({a:random()*Math.PI*2,cx:random(),cz:random(),len:.06+random()*.26,w:.002+random()*.006,s:random()>.5?1:-1,amp:.014+random()*.025})));if(foldCache.size>32)foldCache.delete(foldCache.keys().next().value);}return foldCache.get(seed);}
export function surfaceHeight(style,x,z,size,seed=1){
 const u=(x+size/2)/size,v=(z+size/2)/size;
 if(style==='crinkle'){let h=noise(x*.16,z*.16,seed)*.018;for(const f of foldsFor(seed)){const dx=u-f.cx,dz=v-f.cz,d=dx*Math.cos(f.a)+dz*Math.sin(f.a);if(d>6*f.w||d<-6*f.w)continue;const along=-dx*Math.sin(f.a)+dz*Math.cos(f.a);if(along>1.8*f.len||along<-1.8*f.len)continue;h+=Math.exp(-d*d/(f.w*f.w)-Math.pow(along/f.len,4))*f.s*f.amp;}return h;}
 if(style==='soft')return (Math.sin(x*21+Math.sin(z*8))*Math.cos(z*27)+noise(x*3,z*3,seed))*.005;
 if(style==='matte')return noise(x*7,z*7,seed)*.0018;
 return 0;
}
// 世界坐标下的平滑随机颗粒：提高贴图分辨率只会让表面更清晰，颗粒大小与起伏不变。
function lattice(a,b,seed){let t=Math.imul(a,374761393)+Math.imul(b,668265263)+Math.imul(seed|0,1442695041);t=Math.imul(t^t>>>13,1274126177);return((t^t>>>16)>>>0)/4294967296-.5;}
function grain(x,z,freq,seed){
 const fx=x*freq,fz=z*freq,ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,sx=tx*tx*(3-2*tx),sz=tz*tz*(3-2*tz);
 const a=lattice(ix,iz,seed),b=lattice(ix+1,iz,seed),c=lattice(ix,iz+1,seed),d=lattice(ix+1,iz+1,seed);
 return a+(b-a)*sx+(c-a)*sz+(a-b-c+d)*sx*sz;
}
// 豆与豆之间残留的浅缝：熔合后仍能看出每一颗豆的轮廓。
const SEAM_DEPTH={matte:.011,crinkle:.008,soft:.013,flat:.004};
// 澡巾、毛巾烫仍保留每颗豆轻微的圆鼓感。
const DOME={matte:.0025,soft:.004};
function seam(x,z,size){
 const fx=((x+size/2)%1+1)%1,fz=((z+size/2)%1+1)%1,d=Math.min(fx,1-fx,fz,1-fz);
 return Math.exp(-((d/.045)**2));
}
function dome(x,z,size){
 const fx=((x+size/2)%1+1)%1-.5,fz=((z+size/2)%1+1)%1-.5;
 return Math.max(0,1-(fx*fx+fz*fz)*4);
}
/** 表面高度场（贴图用），side×side，覆盖整个 size×size 板面。 */
export function surfaceField(style,seed,size,side){
 const field=new Float32Array(side*side),depth=SEAM_DEPTH[style]||0;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const wx=((x+.5)/side-.5)*size,wz=((y+.5)/side-.5)*size;
  // 褶皱纸的折痕稍后按每条折痕的包围盒叠加，避免每个像素都遍历全部折痕。
  let value=(style==='crinkle'?noise(wx*.16,wz*.16,seed)*.018:surfaceHeight(style,wx,wz,size,seed))-depth*seam(wx,wz,size)+(DOME[style]||0)*dome(wx,wz,size);
  if(style==='matte')value+=grain(wx,wz,14,seed)*.0035+grain(wx,wz,31,seed+7)*.0016;
  if(style==='soft'){const tx=wx*4,ty=wz*4,ix=Math.floor(tx),iy=Math.floor(ty),dx=(tx-ix-.5)*1.4,dy=(ty-iy-.5)*.9;const ring=Math.hypot(dx,dy);value+=Math.exp(-(((ring-.31)/.065)**2))*.016+grain(wx,wz,22,seed)*.0016;}
  field[y*side+x]=value;
 }
 if(style==='crinkle')for(const f of foldsFor(seed)){
  const c=Math.cos(f.a),s=Math.sin(f.a),across=6*f.w,along=1.8*f.len;
  const hu=Math.abs(c)*across+Math.abs(s)*along,hv=Math.abs(s)*across+Math.abs(c)*along;
  const x0=Math.max(0,Math.floor((f.cx-hu)*side)),x1=Math.min(side-1,Math.ceil((f.cx+hu)*side)),y0=Math.max(0,Math.floor((f.cz-hv)*side)),y1=Math.min(side-1,Math.ceil((f.cz+hv)*side));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const dx=(x+.5)/side-f.cx,dz=(y+.5)/side-f.cz,d=dx*c+dz*s;if(d>across||d<-across)continue;
   const a=-dx*s+dz*c;if(a>along||a<-along)continue;
   field[y*side+x]+=Math.exp(-d*d/(f.w*f.w)-Math.pow(a/f.len,4))*f.s*f.amp;
  }
 }
 return field;
}
/**
 * 表面贴图的像素数据（可在后台线程计算，不依赖 DOM）。
 * normal：法线 RGBA；surface：R=环境光遮蔽、G=粗糙度（three.js 的 aoMap 读 R、roughnessMap 读 G，一张图两用）。
 * 行序按 CanvasTexture 的上下翻转预先倒好，和旧版画布贴图位置完全一致。
 */
export function surfaceMapData(style,seed,size,side=1024) {
 if(!['matte','crinkle','soft','flat'].includes(style))return null;
 const field=surfaceField(style,seed,size,side),random=seededRandom(seed),strength=side/size;
 const normal=new Uint8ClampedArray(side*side*4),surface=new Uint8ClampedArray(side*side*4);
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const dx=field[y*side+Math.min(side-1,x+1)]-field[y*side+Math.max(0,x-1)],dy=field[Math.min(side-1,y+1)*side+x]-field[Math.max(0,y-1)*side+x];
  const nx=-dx*strength,ny=-dy*strength,length=Math.hypot(nx,ny,1),i=((side-1-y)*side+x)*4;
  normal[i]=(nx/length*.5+.5)*255;normal[i+1]=(ny/length*.5+.5)*255;normal[i+2]=255/length;normal[i+3]=255;
  const r=style==='crinkle'?Math.max(105,220-Math.abs(field[y*side+x])*1900):style==='matte'?235+random()*20:style==='flat'?255:220+random()*30;
  // 豆缝处的环境光遮蔽：缝里略暗，豆的轮廓更清楚。
  const wx=((x+.5)/side-.5)*size,wz=((y+.5)/side-.5)*size;
  surface[i]=255*(1-.38*seam(wx,wz,size));surface[i+1]=r;surface[i+2]=0;surface[i+3]=255;
 }
 return{side,normal,surface};
}
function dataTexture(pixels,side){const texture=new THREE.DataTexture(pixels,side,side,THREE.RGBAFormat,THREE.UnsignedByteType);texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;return texture;}
function texturesFromData(maps){if(!maps)return null;const surface=dataTexture(maps.surface,maps.side);return{normal:dataTexture(maps.normal,maps.side),roughness:surface,ao:surface};}

/** 成品网格与贴图的原始数组。可在后台线程生成后整体转交（transfer），主线程只负责创建显存对象。 */
export function buildFinishedData({ cells, size, style = 'double', seed = 1, quality = 'high' }) {
  const geometry = createFinishedGeometry({ cells, size, style, seed, quality });
  const detail = finishDetail(quality, size, geometry.userData.filledBeads);
  const attribute = name => geometry.getAttribute(name).array;
  const index = geometry.index.array;
  const data = {
    detail,
    geometry: { position: attribute('position'), color: attribute('color'), uv: attribute('uv'), normal: attribute('normal'), index: index instanceof Uint32Array ? index : Uint32Array.from(index), userData: { ...geometry.userData } },
    maps: surfaceMapData(style, seed, size, detail.texSide),
  };
  geometry.dispose();
  return data;
}
export function transferablesOf(data) {
  const g = data.geometry, list = [g.position.buffer, g.color.buffer, g.uv.buffer, g.normal.buffer, g.index.buffer];
  if (data.maps) list.push(data.maps.normal.buffer, data.maps.surface.buffer);
  return list;
}
function geometryFromData(g) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(g.color, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
  geometry.setIndex(new THREE.BufferAttribute(g.index, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { ...g.userData };
  return geometry;
}
function createMeltedGeometry({cells,size,style,seed,detail}){
 const p=PROFILES[style],positions=[],colors=[],uvs=[],indices=[],topVertices=[],sub=style==='flat'?2:detail.sub;
 const vertex=(x,y,z,color,shade=1)=>{positions.push(x,y,z);colors.push(color.r*shade,color.g*shade,color.b*shade);uvs.push((x+size/2)/size,(z+size/2)/size);return positions.length/3-1;};
 const tri=(a,b,c)=>indices.push(a,b,c),quad=(a,b,c,d)=>indices.push(a,b,c,c,b,d);
 for(let row=0;row<size;row++)for(let col=0;col<size;col++){
  if(!cells[row*size+col])continue;const color=new THREE.Color(cellColor(cells[row*size+col])),cx=col-(size-1)/2,cz=row-(size-1)/2,base=positions.length/3;
  for(let z=0;z<=sub;z++)for(let x=0;x<=sub;x++){const wx=cx+x/sub-.5,wz=cz+z/sub-.5;const index=vertex(wx,p.half+surfaceHeight(style,wx,wz,size,seed),wz,color);topVertices.push({index,x:wx,z:wz});}
  for(let z=0;z<sub;z++)for(let x=0;x<sub;x++){const a=base+z*(sub+1)+x;quad(a,a+sub+1,a+1,a+sub+2);}
  // A recessed underside remains visibly different from the fused front.
  // 背面凹孔深处略暗（预烘焙环境光遮蔽），让孔的深度更清楚。
  const ringBase=positions.length/3,segments=detail.under;
  for(let ring=0;ring<3;ring++)for(let i=0;i<segments;i++){const angle=i/segments*Math.PI*2,[dx,dz]=contour(angle,ring===0?.5:p.holeBottom||.15,ring===0);vertex(cx+dx,ring===2?p.half*.42:-p.half,cz+dz,color,ring===2?.62:1);}
  const cap=vertex(cx,p.half*.42,cz,color,.55);
  for(let i=0;i<segments;i++){const n=(i+1)%segments,a=ringBase+i,b=ringBase+n;quad(a,b,a+segments,b+segments);quad(a+segments,b+segments,a+2*segments,b+2*segments);tri(cap,b+2*segments,a+2*segments);}
  for(const[dr,dc]of [[0,-1],[0,1],[-1,0],[1,0]]){
   const nr=row+dr,nc=col+dc;if(nr>=0&&nc>=0&&nr<size&&nc<size&&cells[nr*size+nc])continue;
   for(let i=0;i<sub;i++){const ax=cx+(dc?dc*.5:i/sub-.5),az=cz+(dr?dr*.5:i/sub-.5),bx=cx+(dc?dc*.5:(i+1)/sub-.5),bz=cz+(dr?dr*.5:(i+1)/sub-.5),a=vertex(ax,p.half+surfaceHeight(style,ax,az,size,seed),az,color),b=vertex(bx,p.half+surfaceHeight(style,bx,bz,size,seed),bz,color),c=vertex(ax,-p.half,az,color),d=vertex(bx,-p.half,bz,color);quad(a,b,c,d);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();for(const v of topVertices){const e=.01,dx=(surfaceHeight(style,v.x+e,v.z,size,seed)-surfaceHeight(style,v.x-e,v.z,size,seed))/(2*e),dz=(surfaceHeight(style,v.x,v.z+e,size,seed)-surfaceHeight(style,v.x,v.z-e,size,seed))/(2*e),n=new THREE.Vector3(-dx,1,-dz).normalize();geometry.attributes.normal.setXYZ(v.index,n.x,n.y,n.z);}geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={ironingStyle:style,filledBeads:cells.filter(Boolean).length,textureSeed:seed,quality:detail.quality};return geometry;
}

function validateInput({ cells, size, style }) {
  if (!Number.isInteger(size) || size < 1 || size > 64) throw new RangeError('Finished piece size must be 1–64');
  if (!Array.isArray(cells) || cells.length !== size * size) throw new RangeError('Finished piece cells must match size × size');
  if (!Object.hasOwn(PROFILES, style)) throw new RangeError('Unknown ironing style');
  return PROFILES[style];
}

function cellColor(cell) {
  const raw = typeof cell === 'string' ? cell : cell?.color;
  if (raw == null || raw === '') return null;
  if (!/^#[0-9a-f]{6}$/i.test(raw)) throw new TypeError('Finished piece contains an invalid bead color');
  return raw;
}

function contour(angle, radius, square) {
  const x = Math.cos(angle);
  const z = Math.sin(angle);
  const scale = square ? radius / Math.max(Math.abs(x), Math.abs(z)) : radius;
  return [x * scale, z * scale];
}

function neighborFor(angle, row, col) {
  const x = Math.cos(angle);
  const z = Math.sin(angle);
  return Math.abs(x) > Math.abs(z)
    ? [row, col + Math.sign(x)]
    : [row + Math.sign(z), col];
}

/** A single indexed, vertex-colored 3D mesh; no one-mesh-per-bead draw calls. */
export function createFinishedGeometry({ cells, size, style = 'double', seed = 1, quality = 'high' }) {
  const profile = validateInput({ cells, size, style });
  const detail = finishDetail(quality, size, cells.filter(Boolean).length);
  if(['matte','crinkle','soft','flat'].includes(style))return createMeltedGeometry({cells,size,style,seed,detail});
  const colors = cells.map(cellColor);
  const segments = detail.segments;
  const positions = [];
  const vertexColors = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const hex = colors[row * size + col];
      if (!hex) continue;
      const color = new THREE.Color(hex);
      const cx = col - (size - 1) / 2;
      const cz = row - (size - 1) / 2;
      const base = positions.length / 3;
      const half = profile.half;
      const rings = [
        { y: half, radius: profile.holeFace, square: false },
        { y: half, radius: profile.faceRadius, square: style === 'fusion' || profile.square },
        { y: Math.min(0.055, half * 0.36), radius: profile.bulgeRadius, square: profile.fused },
        { y: -Math.min(0.055, half * 0.36), radius: profile.bulgeRadius, square: profile.fused },
        { y: -half, radius: profile.faceRadius, square: style === 'fusion' || profile.square },
        { y: -half, radius: profile.holeBottom ?? profile.holeFace, square: false },
        { y: 0, radius: profile.holeMiddle, square: false },
      ];
      for (const [ringIndex, ring] of rings.entries()) {
        // 孔壁中段略暗（预烘焙环境光遮蔽），孔看起来更深、更立体。
        const shade = ringIndex === 6 ? .58 : 1;
        for (let i = 0; i < segments; i++) {
          const angle = 2 * Math.PI * i / segments;
          const [dx, dz] = contour(angle, ring.radius, ring.square);
          const relief=profile.relief && ring.y>0 ? noise(cx+dx,cz+dz,seed)*profile.relief*(ring.y/half) : 0;
          positions.push(cx + dx, ring.y + relief, cz + dz);
          vertexColors.push(color.r * shade, color.g * shade, color.b * shade);
          uvs.push((cx+dx+size/2)/size,(cz+dz+size/2)/size);
        }
      }
      const at = (ring, i) => base + ring * segments + (i % segments);
      const quad = (a, b, c, d) => indices.push(a, b, c, c, b, d);
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        // Top and bottom annular faces.
        quad(at(0, i), at(0, next), at(1, i), at(1, next));
        quad(at(5, i), at(4, i), at(5, next), at(4, next));
        // Outer contour. A fused neighbor removes only the hidden seam;
        // rounded upper and lower shoulders remain visible for standard.
        const [nr, nc] = neighborFor(2 * Math.PI * (i + 0.5) / segments, row, col);
        const neighbor = nr >= 0 && nr < size && nc >= 0 && nc < size && !!colors[nr * size + nc];
        for (let ring = 1; ring <= 3; ring++) {
          if (neighbor && (style === 'fusion' || profile.square || (profile.fused && ring === 2))) continue;
          quad(at(ring, i), at(ring, next), at(ring + 1, i), at(ring + 1, next));
        }
        // Inward-facing walls taper inward at each melted face.
        quad(at(0, i), at(6, i), at(0, next), at(6, next));
        quad(at(6, i), at(5, i), at(6, next), at(5, next));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (style === 'flat') {
    const position=geometry.attributes.position,normal=geometry.attributes.normal;
    for(let i=0;i<position.count;i++) {
      if(position.getY(i)>=profile.half-.00001) normal.setXYZ(i,0,1,0);
      else if(position.getY(i)<=-profile.half+.00001) normal.setXYZ(i,0,-1,0);
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.ironingStyle = style;
  geometry.userData.filledBeads = colors.filter(Boolean).length;
  geometry.userData.textureSeed = seed;
  geometry.userData.quality = detail.quality;
  return geometry;
}

/** Export the actual 3D mesh, with geometry and bead colors, as binary glTF. */
export async function exportFinishedGlb(object) {
  const bytes = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
  if (!(bytes instanceof ArrayBuffer)) throw new Error('GLB exporter did not return binary data');
  return new Blob([bytes], { type: 'model/gltf-binary' });
}

/**
 * Transparent, interactive 3D finished-piece viewer. It runs its own slow
 * animation loop; render() also allows the host to force an immediate frame.
 */
export function createFinishedViewer({ container, cells, size, style = 'double', seed = 1, quality = 'high', prepared = null }) {
  if (!container || typeof container.appendChild !== 'function') throw new TypeError('A viewer container is required');
  // prepared：后台线程算好的网格与贴图数据；没有时在当前线程现算（与旧版相同）。
  const data = prepared || buildFinishedData({ cells, size, style, seed, quality });
  const geometry = geometryFromData(data.geometry);
  const detail = data.detail;
  const profile = PROFILES[style];
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: profile.roughness,
    metalness: 0,
    clearcoat: profile.clearcoat || 0,
    clearcoatRoughness: 0.27,
    sheen: profile.sheen || 0,
    sheenColor: new THREE.Color(0xdedccd),
    sheenRoughness: 1,
  });
  const maps=texturesFromData(data.maps);if(maps){material.normalMap=maps.normal;material.roughnessMap=maps.roughness;material.aoMap=maps.ao;material.aoMapIntensity=1;material.normalScale.setScalar(profile.normal||.35);}
  const piece = new THREE.Mesh(geometry, material);
  piece.name = `Finished bead piece (${style})`;
  const scene = new THREE.Scene();
  scene.add(piece);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x96938c, .75);
  scene.add(ambient);
  const front = new THREE.DirectionalLight(0xffffff, 2.2);
  front.position.set(-size * 0.9, size * .35, size * 0.6);
  scene.add(front);
  const back = new THREE.DirectionalLight(0xf5f5ff, .65);
  back.position.set(size * 0.7, -size, -size * 0.9);
  scene.add(back);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.01, Math.max(100, size * 12));
  const distance = Math.max(2.3, geometry.boundingSphere.radius * 2.4);
  const focus = geometry.boundingBox.getCenter(new THREE.Vector3());
  const initialPosition = focus.clone().add(new THREE.Vector3(distance * 0.32, distance * 1.05, distance * 0.48));
  camera.position.copy(initialPosition);
  camera.lookAt(focus);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min((globalThis.devicePixelRatio || 1) * detail.pixel, detail.pixel > 1 ? 3 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 中性色调映射：保留豆子的原色，不像 ACES 那样把粉色、浅色压灰偏黄。
  renderer.toneMapping = THREE.NeutralToneMapping;
  if (maps) for (const map of new Set([maps.normal, maps.roughness, maps.ao])) { map.anisotropy = Math.min(detail.aniso, renderer.capabilities.getMaxAnisotropy()); map.needsUpdate = true; }
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environmentScene, .04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .55;
  environmentScene.dispose();
  pmrem.dispose();
  renderer.domElement.className = 'finished-3d-canvas';
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;background:transparent;touch-action:none';
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.32;
  controls.enablePan = false;
  controls.minDistance = Math.max(0.8, geometry.boundingSphere.radius * .5);
  controls.maxDistance = Math.max(6, size * 5);
  controls.minPolarAngle = 0.015;
  controls.maxPolarAngle = Math.PI - 0.015;
  controls.update();
  controls.saveState();

  let disposed = false;
  let lastFrame = 0;
  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth || 1);
    const height = Math.max(1, container.clientHeight || 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  if (!observer && typeof window !== 'undefined') window.addEventListener('resize', resize);
  resize();

  function render() {
    if (disposed) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60;
    lastFrame = now;
    controls.update(delta);
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(render);

  function resetView() {
    if (disposed) return;
    camera.position.copy(initialPosition);
    controls.target.copy(focus);
    controls.update();
    lastFrame = 0;
    render();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    observer?.disconnect();
    if (!observer && typeof window !== 'undefined') window.removeEventListener('resize', resize);
    controls.dispose();
    geometry.dispose();
    material.dispose();
    maps?.normal.dispose();maps?.roughness.dispose();
    environmentTarget.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return Object.freeze({ stats: () => ({ quality: detail.quality, vertices: geometry.attributes.position.count, triangles: geometry.index.count / 3, textureSide: maps ? detail.texSide : 0, pixelRatio: renderer.getPixelRatio() }), render, dispose, resetView, exportGlb: () => exportFinishedGlb(piece), capturePng: () => { render(); return renderer.domElement.toDataURL('image/png'); } });
}
