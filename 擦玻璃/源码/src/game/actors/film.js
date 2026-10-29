/* 保护膜（帮忙/对抗）：一层膜从左往右"唰"地贴满整块玻璃（四边能看到膜的细边、右下角翘起一个角）。
   膜有耐久：能挡几下（礼物设置里定，再有人送就加耐久）。贴着的时候，观众砸上来的东西都落在膜上，每挡一下耐久少一点，
   膜上的裂纹从几个点往外一点点长；顶上显示「@B 的保护膜 · 还能挡 N 下」。耐久用完：膜"咔"地碎开，连同上面的脏东西一起掉下去。
   主播也可以自己撕：拖住右下角往左拉，撕开的线扫到哪里，那里的脏东西就跟着膜一起被揭走；拉够三成松手自动撕完，不够就弹回去。 */
import * as THREE from 'three';
import { LAYER, ZONE_GLSL, canvasTexture } from '../../glass/stage.js';
import { createSprite } from '../../glass/sprites.js';
import { drawFilmCorner } from '../../art/helpers-art.js';
import { drawFilmCracks } from '../../art/film-cracks.js';
import { clamp, easeInOut } from '../../util.js';

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uEdge;
uniform float uLift;
uniform float uFlash;
uniform float uDrop;
uniform float uAlpha;
uniform float uDamage;
uniform sampler2D uCrack;
${ZONE_GLSL}
void over(inout vec3 acc, inout float A, vec3 c, float a) {
  acc = acc * (1.0 - a) + c * a;
  A = A + a * (1.0 - A);
}
/* 裂纹：红色通道 <= 砸坏了几成的那些线露出来 */
float crack(vec2 f) {
  vec4 k = texture2D(uCrack, f / uRes);
  return k.a * step(k.r, uDamage);
}
void main() {
  /* 碎了往下掉：画面往下挪 uDrop（设备像素） */
  vec2 f = gl_FragCoord.xy + vec2(0.0, uDrop);
  /* 尺寸按短边（横屏竖屏一样粗） */
  float H = min(uRes.x, uRes.y);
  /* uEdge：膜的右边界（设备像素）。撕的时候从右往左退；掉下去时顶边以上没有膜 */
  float inside = (1.0 - smoothstep(uEdge - 1.5, uEdge + 1.5, f.x)) * (1.0 - smoothstep(uRes.y - 1.5, uRes.y + 1.5, f.y));
  if (inside <= 0.0 && abs(f.x - uEdge) > 0.02 * H) discard;
  vec2 p = f / H;
  float aspect = uRes.x / H;
  vec3 acc = vec3(0.0);
  float A = 0.0;
  /* 膜面：很淡的一层亮 + 两道斜光 */
  float glint = smoothstep(0.03, 0.0, abs(p.x * 0.8 + p.y - 0.62 * aspect)) * 0.6 + smoothstep(0.012, 0.0, abs(p.x * 0.8 + p.y - 0.7 * aspect)) * 0.5;
  over(acc, A, vec3(0.92, 0.97, 1.0), (0.045 + glint * 0.06 + uFlash * 0.12) * inside);
  /* 膜的四条细边（离屏幕边 7 像素） */
  float inset = 0.0065 * H;
  float e = min(min(f.x - inset, uEdge - inset - f.x), min(f.y - inset, uRes.y - inset - f.y));
  float edgeLine = 1.0 - smoothstep(0.0, 0.0022 * H, abs(e));
  over(acc, A, vec3(1.0), edgeLine * 0.55 * inside);
  over(acc, A, vec3(0.45, 0.66, 0.8), (1.0 - smoothstep(0.0022 * H, 0.0045 * H, abs(e))) * 0.25 * inside);
  /* 裂纹：先一道淡淡的暗影，再一道白线 */
  if (uDamage > 0.0) {
    float sh = crack(f + vec2(1.4, -1.4));
    over(acc, A, vec3(0.16, 0.24, 0.32), sh * 0.4 * inside);
    over(acc, A, vec3(0.96, 0.99, 1.0), crack(f) * 0.9 * inside);
  }
  /* 正在撕：撕开的那条线亮一些、有一点点卷起的阴影 */
  float lip = exp(-pow((f.x - uEdge) / (0.008 * H), 2.0)) * uLift;
  over(acc, A, vec3(1.0), lip * 0.8);
  float z = zoneMask(gl_FragCoord.xy);
  float a = min(A * z, 0.9) * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(acc / max(A, 1e-4), a);
}
`;

/* 膜上最多留多少块（再多最早的先掉） */
const HOLD_MAX = 150;
/* 碎开：裂纹长满、闪一下（秒），然后往下掉多久（秒） */
const SHATTER = 0.3;
const FALL = 0.7;
/* 贴上 / 挨砸以后右下角那个角跳几秒（提醒主播可以撕），之后不动（省得一直重画） */
const PULSE = 4;

export function createFilm(game, { owner, hits }) {
  const { stage, audio, hud, labels, particles, stats } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const crackTex = canvasTexture(drawFilmCracks(stage.W, stage.H, u));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: stage.shared.uRes,
      uEdge: { value: 0 },
      uLift: { value: 0 },
      uFlash: { value: 0 },
      uDrop: { value: 0 },
      uAlpha: { value: 1 },
      uDamage: { value: 0 },
      uCrack: { value: crackTex },
      uZoneTex: stage.shared.uZoneTex,
      uZoneP: stage.shared.uZoneP
    },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = LAYER.FILM;
  stage.scene.add(mesh);
  const cornerArt = drawFilmCorner(96 * u, u, res);
  const corner = createSprite(stage, cornerArt.canvas, cornerArt.w, cornerArt.h, LAYER.OVERHEAD - 5);
  const badge = labels.add('', 'film');
  let held = [];
  /* hp 还能挡几下；blocked 已经挡了几下 */
  let hp = Math.max(1, Math.round(hits));
  let blocked = 0;
  let state = 'apply';
  let t = 0;
  let st = 0;
  let pulseT = 0;
  let edge = 0;
  let grab = null;
  let pullEdge = stage.W;
  let flash = 0;
  let drop = 0;
  audio.sweep();

  /* 膜贴着期间，新出现的脏东西都"落在膜上"；带名字牌的那块（一下砸过来的主块：一个鸡蛋、一团泥、一只猫的第一个脚印……）算挡了一下 */
  const hook = (s, o) => {
    if (!(state === 'apply' || state === 'on' || state === 'peel') || !s.owner || s.owner.help || s.kind === 'dust' || (o && o.noFilm)) return;
    /* 正撕着：撕开那一截已经没膜了，砸在那里的落在玻璃上 */
    if (state === 'peel' && s.x > pullEdge) return;
    held.push(s);
    s.onFilm = true;
    if (s.tagged) {
      blocked++;
      hp = Math.max(0, hp - 1);
      flash = 1;
      pulseT = 0;
      if (hp <= 0 && state !== 'peel') shatter();
    }
  };
  game.stainHooks.push(hook);

  function unhook() {
    const i = game.stainHooks.indexOf(hook);
    if (i >= 0) game.stainHooks.splice(i, 1);
  }

  function liftUpTo(px) {
    /* 撕开线右边、贴在膜上的脏东西被揭走 */
    for (const s of held) {
      if (s.state === 'live' && s.x > px) {
        game.takeAway(s);
        if (Math.random() < 0.5) particles.sparkle(s.x, s.y, 3, 30);
      }
    }
  }

  /* 耐久用完：咔的一声碎开，裂纹长满，然后连同上面的脏东西一起往下掉 */
  function shatter() {
    if (state === 'shatter' || state === 'fall' || state === 'done') return;
    state = 'shatter';
    st = 0;
    flash = 1;
    unhook();
    audio.crack();
    game.impact(stage.W * 0.5, stage.H * 0.5, 0.6);
  }

  function finish(text) {
    if (state === 'done') return;
    state = 'done';
    unhook();
    liftUpTo(-1);
    if (text) hud.toast(text, 'block');
    stats.helped(owner, blocked);
  }

  return {
    kind: 'film',
    owner,
    get at() {
      return { x: stage.W - 40 * u, y: stage.H - 40 * u };
    },
    /* 还贴着（没碎、没被撕完）才能加耐久 */
    get alive() {
      return state === 'apply' || state === 'on' || state === 'peel';
    },
    get hp() {
      return hp;
    },
    /* 验收脚本看的：还能挡几下、挡了几下、现在在干嘛 */
    get debug() {
      return { hp, blocked, state };
    },
    /* 又有人送保护膜：加耐久，裂纹按比例退回去一些 */
    addHits(n) {
      hp += Math.max(1, Math.round(n));
      flash = 1;
      pulseT = 0;
    },
    hit(px, py) {
      if (state !== 'on') return null;
      const cx = Math.min(edge, stage.W) - 48 * u;
      const cy = stage.H - 48 * u;
      if (Math.hypot(px - cx, py - cy) > 90 * u) return null;
      return {
        grab(gx) {
          grab = { x0: gx };
          state = 'peel';
          audio.peel(0.5);
        },
        move(mx) {
          if (state !== 'peel') return;
          pullEdge = clamp(stage.W - (grab.x0 - mx), 0, stage.W);
          liftUpTo(pullEdge);
          audio.peel(1 - pullEdge / stage.W);
        },
        release() {
          if (state !== 'peel') return;
          if (pullEdge < stage.W * 0.7) {
            state = 'peel-auto';
            st = 0;
            unhook();
            audio.tear();
          } else if (hp <= 0) shatter();
          else state = 'on';
        }
      };
    },
    update(dt) {
      t += dt;
      st += dt;
      pulseT += dt;
      flash = Math.max(0, flash - dt * 2);
      /* 已经擦掉/拿走的不再记着（膜可以贴很久） */
      if (held.length > 24) held = held.filter(s => s.state === 'live');
      /* 膜上积得太多（礼物刷屏）：最早的先跟着膜"掉"了，免得内存一直涨 */
      if (held.length > HOLD_MAX) {
        const live = held.filter(s => s.state === 'live');
        for (let i = 0; i < live.length - HOLD_MAX; i++) game.takeAway(live[i]);
        held = live.slice(Math.max(0, live.length - HOLD_MAX));
      }
      let alpha = 1;
      if (state === 'apply') {
        const k = easeInOut(clamp(st / 0.75, 0, 1));
        edge = k * stage.W;
        if (k >= 1) {
          state = 'on';
          st = 0;
        }
      } else if (state === 'on') {
        edge += (stage.W - edge) * Math.min(1, dt * 12);
        if (Math.abs(stage.W - edge) < 0.05) edge = stage.W;
      } else if (state === 'peel') {
        edge = pullEdge;
      } else if (state === 'peel-auto') {
        edge = Math.max(0, edge - stage.W * dt * 1.6);
        liftUpTo(edge);
        if (edge <= 0) {
          finish('');
          game.credit('保护膜', owner, stage.W * 0.5, stage.H * 0.5, blocked ? `@${owner.name} 的保护膜替白曜挡下了 ${blocked} 下` : `@${owner.name} 的保护膜撕掉了`);
          return false;
        }
      } else if (state === 'shatter') {
        if (st >= SHATTER) {
          state = 'fall';
          st = 0;
          /* 碎片：沿着几个点闪一下；膜上脏东西的名字牌先收掉（东西跟着膜往下掉，牌子别留在原地） */
          for (let i = 0; i < 6; i++) particles.sparkle(stage.W * (0.15 + 0.7 * Math.random()), stage.H * (0.2 + 0.6 * Math.random()), 5, 90);
          for (const s of held) if (s.state === 'live') game.ctx.names.detach(s);
        }
      } else if (state === 'fall') {
        const k = clamp(st / FALL, 0, 1);
        drop = 0.5 * 2600 * u * st * st;
        alpha = 1 - k * k;
        /* 膜上的脏东西跟着一起往下掉、一起淡掉（画面上挪，位置不变；掉完再拿走） */
        for (const s of held) {
          if (s.state !== 'live') continue;
          stage.place(s.mesh, s.x, s.y + drop);
          s.extFade = alpha;
        }
        if (k >= 1) {
          for (const s of held) {
            if (s.state !== 'live') continue;
            s.extFade = 1;
            stage.place(s.mesh, s.x, s.y);
            game.takeAway(s);
            s.fade = 0;
          }
          finish(`@${owner.name} 的保护膜被砸坏了，掉下去了（挡下 ${blocked} 下）`);
          return false;
        }
      } else if (state === 'done') return false;
      const total = blocked + hp;
      const damage = state === 'shatter' || state === 'fall' ? 1 : total > 0 ? clamp(blocked / total, 0, 1) : 0;
      material.uniforms.uEdge.value = edge * stage.dpr;
      material.uniforms.uLift.value = state === 'peel' || state === 'peel-auto' ? 1 : state === 'apply' ? 0.6 : 0;
      material.uniforms.uFlash.value = flash;
      material.uniforms.uDrop.value = drop * stage.dpr;
      material.uniforms.uAlpha.value = alpha;
      material.uniforms.uDamage.value = damage;
      const show = state === 'on' || state === 'peel';
      const pulse = pulseT < PULSE ? 0.06 * Math.sin(t * 4) * (1 - pulseT / PULSE) : 0;
      corner.set(Math.min(edge, stage.W) - cornerArt.w / 2, stage.H - cornerArt.h / 2, 0, 1 + pulse, show ? 1 : 0);
      badge.text(state === 'shatter' || state === 'fall' ? `@${owner.name} 的保护膜碎了！` : `@${owner.name} 的保护膜 · 还能挡 ${hp} 下`);
      badge.set(stage.W / 2, 34 * u, state === 'apply' ? clamp(st * 3, 0, 1) : state === 'fall' ? alpha : 1);
      return true;
    },
    dispose() {
      unhook();
      for (const s of held) {
        if (s.state === 'live' && s.extFade !== 1) {
          s.extFade = 1;
          stage.place(s.mesh, s.x, s.y);
        }
      }
      stage.scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      crackTex.dispose();
      corner.dispose();
      badge.remove();
    }
  };
}
