import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageRect, viewOffsetArgs, screenToNdc, ndcToScreen, unproject, frustumPlanes, insidePlanes, coneHullPoints } from '../src/view-geom.js';
import { testCamera, project } from './helpers/cam.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const along = (cam, ndcX, ndcY, dist) => { const f = unproject(ndcX, ndcY, 1, cam.invPV), d = [f[0] - cam.eye[0], f[1] - cam.eye[1], f[2] - cam.eye[2]], l = Math.hypot(...d); return d.map((v, i) => cam.eye[i] + v / l * dist); };

test('stageRect converts percents to pixels', () => {
  assert.deepEqual(stageRect({ x: 0, y: 34, w: 100, h: 66 }, 1000, 500), { left: 0, top: 170, width: 1000, height: 330 });
  assert.deepEqual(stageRect({ x: -10, y: 50, w: 150, h: 10 }, 200, 100), { left: -20, top: 50, width: 300, height: 10 });
});

test('viewOffsetArgs extends the stage frustum to the window', () => {
  assert.deepEqual(viewOffsetArgs({ left: 0, top: 170, width: 1000, height: 330 }, 1000, 500), [1000, 330, -0, -170, 1000, 500]);
});

test('screen and ndc round trip', () => {
  const [x, y] = ndcToScreen(...screenToNdc(123, 456, 800, 600), 800, 600);
  assert.ok(near(x, 123) && near(y, 456));
  assert.deepEqual(screenToNdc(0, 0, 800, 600), [-1, 1]); assert.deepEqual(screenToNdc(800, 600, 800, 600), [1, -1]);
});

test('view offset keeps the stage framing: a stage-edge point maps to the stage edge in the window', () => {
  const W = 1000, H = 500, st = stageRect({ x: 0, y: 34, w: 100, h: 66 }, W, H);
  const [fw, fh, ox, oy, w, h] = viewOffsetArgs(st, W, H);
  const stageCam = testCamera({ aspect: st.width / st.height });
  const winCam = testCamera({ aspect: fw / fh, view: { fullWidth: fw, fullHeight: fh, offsetX: ox, offsetY: oy, width: w, height: h } });
  const p = along(stageCam, .7, 1, 25);                       // 原来在场景区域上沿的点
  const [nx, ny] = project(winCam.PV, p), [sx, sy] = ndcToScreen(nx, ny, W, H);
  assert.ok(Math.abs(sx - .85 * W) < .5, 'x ' + sx); assert.ok(Math.abs(sy - st.top) < .5, 'y ' + sy);
});

test('frustum planes: centre inside, points beyond the inset edges outside', () => {
  const cam = testCamera(), planes = frustumPlanes(cam.eye, cam.invPV, .02);
  assert.equal(planes.length, 4);
  assert.ok(insidePlanes(planes, along(cam, 0, 0, 20)));
  assert.ok(insidePlanes(planes, along(cam, -.97, .5, 20)));
  assert.ok(!insidePlanes(planes, along(cam, -.99, 0, 20)), 'left');
  assert.ok(!insidePlanes(planes, along(cam, .99, 0, 20)), 'right');
  assert.ok(!insidePlanes(planes, along(cam, 0, -.99, 20)), 'bottom');
  assert.ok(!insidePlanes(planes, along(cam, 0, .99, 20)), 'top');
  for (const pl of planes) assert.ok(near(Math.hypot(...pl.n), 1));
});

test('insidePlanes margin tolerates points slightly outside', () => {
  const cam = testCamera(), planes = frustumPlanes(cam.eye, cam.invPV, 0);
  const edge = along(cam, -1.0005, 0, 20);
  assert.ok(!insidePlanes(planes, edge)); assert.ok(insidePlanes(planes, edge, .05));
});

test('cone hull ring projects back onto the screen circle within 1 px', () => {
  const W = 1280, H = 720, cam = testCamera({ aspect: W / H }), circle = { cx: 640, cy: 200, r: 90 };
  const pts = coneHullPoints(cam.eye, cam.invPV, circle, W, H, 120, 32);
  assert.ok(pts instanceof Float32Array); assert.equal(pts.length, 33 * 3);
  assert.ok(near(pts[0], cam.eye[0], 1e-4) && near(pts[1], cam.eye[1], 1e-4) && near(pts[2], cam.eye[2], 1e-4));
  for (let i = 1; i <= 32; i++) {
    const p = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]], [nx, ny] = project(cam.PV, p), [sx, sy] = ndcToScreen(nx, ny, W, H);
    assert.ok(Math.abs(Math.hypot(sx - circle.cx, sy - circle.cy) - circle.r) < 1, `点 ${i}`);
    assert.ok(Math.abs(Math.hypot(p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]) - 120) < 1e-3);
  }
});
