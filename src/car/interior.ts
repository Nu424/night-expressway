/* ============================================================
   車内（別シーン・運転者の目を原点とする車体座標, -z が前, 単位 m）
   ダッシュボード、メーター、ハンドル、ピラー、ルームミラー、ヘッドユニット、ボンネット。
   ============================================================ */
import * as THREE from 'three';
import { U } from '../core/globals';
import { state } from '../core/state';
import { FONT, V3, clamp, lerp, sstep } from '../core/util';
import { camera, scene } from '../render/renderer';
import { ego } from '../traffic/traffic';
import { lightAt } from '../world/lighting';
import { lampsNear } from '../world/lamps';
import VERT from '../shaders/interior.vert?raw';
import FRAG from '../shaders/interior.frag?raw';

/** 車内の部品をまとめる親。カメラの子にして、車外と同じ描画パスで描く（描画を2回に分けると内蔵GPUで数ms余計にかかる）。 */
export const iscene = new THREE.Group();
export const icam = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.02, 10);
export let mirrorMesh: THREE.Mesh, mirrorRT: THREE.WebGLRenderTarget, rearCam: THREE.PerspectiveCamera;

const NL = 6;
const lampPos = Array.from({ length: NL }, () => new V3(0, 50, -50));
const lampCol = Array.from({ length: NL }, () => new V3());
const shared = { uLampPos: { value: lampPos }, uLampCol: { value: lampCol }, uAmb: { value: new V3(0.02, 0.02, 0.025) }, uGlow: { value: new V3() }, uWet: U.wet };

/** 車内の見た目の調整値（設定から変更する） */
export const cabin = { meterColor: 'amber' as 'amber' | 'ice' | 'green', meterGain: 1, sweep: 1, ambient: 1, unitLines: ['', ''] as string[] };
const METER: Record<string, { main: string; dim: string; glow: number[] }> = {
  amber: { main: '#ffb060', dim: '#7a4a1c', glow: [1.0, 0.55, 0.2] },
  ice: { main: '#cfe8ff', dim: '#4a5f78', glow: [0.6, 0.8, 1.0] },
  green: { main: '#9dffc8', dim: '#2f6b4e', glow: [0.4, 1.0, 0.7] },
};

function mat(base: number[], o: { spec?: number; gloss?: number; outside?: boolean; grain?: number; map?: THREE.Texture; emissive?: number } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: { ...shared, uBase: { value: new V3(...(base as [number, number, number])) }, uSpec: { value: o.spec ?? 0.02 }, uGloss: { value: o.gloss ?? 24 },
      uOutside: { value: o.outside ? 1 : 0 }, uGrain: { value: o.grain ?? 0.25 }, uMap: { value: o.map ?? null }, uUseMap: { value: o.map && !o.emissive ? 1 : 0 }, uEmissive: { value: o.emissive ?? 0 } },
  });
}
const add = (geo: THREE.BufferGeometry, m: THREE.Material, p?: number[], r?: number[]) => {
  const me = new THREE.Mesh(geo, m); if (p) me.position.set(p[0], p[1], p[2]); if (r) me.rotation.set(r[0], r[1], r[2]); iscene.add(me); return me;
};
/** 格子状の曲面を作る。fn(a,b) → [x,y,z]（a,b は 0..1） */
function surface(na: number, nb: number, fn: (a: number, b: number) => number[]) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) { const p = fn(i / na, j / nb); pos.push(p[0], p[1], p[2]); uv.push(i / na, j / nb); }
  for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) { const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function beam(b: number[], t: number[], w: number, d: number, m: THREE.Material) {
  const bv = new V3(...(b as [number, number, number])), tv = new V3(...(t as [number, number, number])); const dir = tv.clone().sub(bv);
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), m); me.position.copy(bv).add(tv).multiplyScalar(0.5); me.scale.y = dir.length(); me.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize()); iscene.add(me); return me;
}

let clusterCtx: CanvasRenderingContext2D, clusterTex: THREE.CanvasTexture, unitCtx: CanvasRenderingContext2D, unitTex: THREE.CanvasTexture;
let clusterMat: THREE.ShaderMaterial, unitMat: THREE.ShaderMaterial;
let clusterT = 0, shownSpeed = -1, shownMin = -1, shownBlink = -1, shownKey = '';

/** ダッシュボード上面の高さ */
function dashY(x: number, z: number) {
  const t = clamp((z + 1.25) / 0.75, 0, 1);                       // 0=フロントガラスの根元, 1=手前の縁
  let y = -0.36 + 0.018 * Math.sin(t * Math.PI * 0.6) - 0.05 * Math.pow(sstep(0.78, 1.0, t), 2);
  y += 0.07 * Math.exp(-Math.pow(x / 0.27, 2) - Math.pow((z + 0.94) / 0.065, 2));   // メーターフード
  return y;
}

export function makeInterior() {
  const dash = mat([0.02, 0.02, 0.023], { spec: 0.01, gloss: 10, grain: 0.35 });
  const trim = mat([0.016, 0.016, 0.019], { spec: 0.02, gloss: 18 });
  const leather = mat([0.018, 0.018, 0.02], { spec: 0.06, gloss: 30, grain: 0.15 });
  const piano = mat([0.012, 0.012, 0.014], { spec: 0.35, gloss: 90, grain: 0 });

  // ---- ダッシュボード（上面〜手前に落ちる面）
  add(surface(56, 22, (a, b) => {
    const x = lerp(-1.22, 0.64, a);
    if (b <= 0.8) { const z = lerp(-1.27, -0.5, b / 0.8); return [x, dashY(x, z), z]; }
    const k = (b - 0.8) / 0.2; return [x, dashY(x, -0.5) - 0.62 * k, -0.5 + 0.1 * k];
  }), dash);

  // ---- メーター
  const cc = document.createElement('canvas'); cc.width = 768; cc.height = 192; clusterCtx = cc.getContext('2d')!;
  clusterTex = new THREE.CanvasTexture(cc); clusterTex.colorSpace = THREE.SRGBColorSpace; clusterTex.anisotropy = 4;
  clusterMat = mat([0, 0, 0], { map: clusterTex, emissive: 1.25 });
  add(new THREE.PlaneGeometry(0.4, 0.1), clusterMat, [0, -0.303, -0.84], [-0.16, 0, 0]);
  add(new THREE.BoxGeometry(0.45, 0.01, 0.075), trim, [0, -0.236, -0.838], [0.06, 0, 0]);              // ひさし
  add(new THREE.BoxGeometry(0.45, 0.13, 0.02), trim, [0, -0.303, -0.858], [-0.16, 0, 0]);              // 背板

  // ---- ハンドル（上側の弧だけが見える）
  const wheel = new THREE.Group(); wheel.position.set(0, -0.445, -0.5); wheel.rotation.x = -0.4; iscene.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.017, 14, 72), leather));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 28).rotateX(Math.PI / 2), trim); hub.position.z = -0.03; wheel.add(hub);
  for (const a of [0.12, Math.PI - 0.12, Math.PI * 1.5]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.018), trim); sp.position.set(Math.cos(a) * 0.125, Math.sin(a) * 0.125, -0.015); sp.rotation.z = a; wheel.add(sp); }

  // ---- ピラーとガラスの縁
  beam([0.61, -0.37, -1.22], [0.52, 0.47, -0.41], 0.05, 0.055, trim);
  beam([-1.215, -0.37, -1.22], [-1.09, 0.47, -0.41], 0.075, 0.1, trim);
  add(new THREE.BoxGeometry(1.9, 0.06, 0.5), trim, [-0.38, 0.5, -0.25], [-0.1, 0, 0]);               // 天井の縁

  // ---- ヘッドユニット（ダッシュ上の画面）
  const uc = document.createElement('canvas'); uc.width = 512; uc.height = 288; unitCtx = uc.getContext('2d')!;
  unitTex = new THREE.CanvasTexture(uc); unitTex.colorSpace = THREE.SRGBColorSpace; unitTex.anisotropy = 4;
  unitMat = mat([0, 0, 0], { map: unitTex, emissive: 0.9 });
  const unit = new THREE.Group(); unit.position.set(-0.42, -0.283, -0.87); unit.rotation.set(-0.16, 0.32, 0); iscene.add(unit);
  unit.add(new THREE.Mesh(new THREE.PlaneGeometry(0.235, 0.132), unitMat));
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.152, 0.016), piano); bezel.position.z = -0.009; unit.add(bezel);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), trim); stand.position.set(0, -0.085, -0.02); unit.add(stand);

  // ---- ボンネット（ガラス越しに見える細い帯。街灯の映り込みが滑る）
  const paint = mat([0.012, 0.013, 0.016], { spec: 0.9, gloss: 420, outside: true, grain: 0 });
  add(surface(28, 10, (a, b) => {
    const x = lerp(-1.3, 0.7, a), z = lerp(-1.24, -2.75, b); const cx = (x + 0.3) / 1.0;
    return [x, -0.5 - 0.075 * b - 0.03 * b * b - 0.035 * cx * cx, z];
  }), paint);
  add(new THREE.BoxGeometry(1.9, 0.05, 0.1), mat([0.01, 0.01, 0.011], { outside: true }), [-0.375, -0.42, -1.27]);   // カウル（ワイパーの根元）

  // ---- ルームミラー
  mirrorRT = new THREE.WebGLRenderTarget(384, 112, { type: THREE.HalfFloatType });
  rearCam = new THREE.PerspectiveCamera(26, 384 / 112, 0.5, 3000); scene.add(rearCam);
  const mirMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: mirrorRT.texture } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D t; varying vec2 vUv; void main(){ vec2 u=vec2(1.0-vUv.x,vUv.y); vec3 c=texture2D(t,u).rgb*0.8; vec2 e=abs(vUv-0.5)*2.0; c*=1.0-pow(max(e.x,e.y),6.0)*0.6; gl_FragColor=vec4(c,1.0); }`,
  });
  const mw = 0.25, mh = 0.068, r = 0.028; const sh = new THREE.Shape();
  sh.moveTo(-mw / 2 + r, -mh / 2); sh.lineTo(mw / 2 - r, -mh / 2); sh.quadraticCurveTo(mw / 2, -mh / 2, mw / 2, -mh / 2 + r); sh.lineTo(mw / 2, mh / 2 - r); sh.quadraticCurveTo(mw / 2, mh / 2, mw / 2 - r, mh / 2);
  sh.lineTo(-mw / 2 + r, mh / 2); sh.quadraticCurveTo(-mw / 2, mh / 2, -mw / 2, mh / 2 - r); sh.lineTo(-mw / 2, -mh / 2 + r); sh.quadraticCurveTo(-mw / 2, -mh / 2, -mw / 2 + r, -mh / 2);
  const mg = new THREE.ShapeGeometry(sh); const uvA = mg.attributes.uv, pA = mg.attributes.position; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pA.getX(i) / mw + 0.5, pA.getY(i) / mh + 0.5);
  mirrorMesh = new THREE.Mesh(mg, mirMat); mirrorMesh.position.set(-0.40, 0.27, -0.78); mirrorMesh.rotation.set(0.05, 0.28, 0); iscene.add(mirrorMesh);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.018, mh + 0.018, 0.035), trim); housing.position.set(0, 0, -0.022); mirrorMesh.add(housing);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.018), trim); stem.position.set(0, 0.12, -0.04); mirrorMesh.add(stem);

  drawCluster(0, false, 0); drawUnit();
  // ミラーや反射用のカメラには映さない（レイヤー1は主カメラだけが見る）
  iscene.traverse(o => o.layers.set(1)); camera.layers.enable(1); camera.add(iscene);
}

/* ---------------- メーターの描画 ---------------- */
function drawCluster(kmh: number, blinkOn: boolean, blinkDir: number) {
  const x = clusterCtx, W = 768, H = 192, c = METER[cabin.meterColor];
  x.fillStyle = '#020203'; x.fillRect(0, 0, W, H);
  x.lineCap = 'round'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const dial = (cx: number, frac: number, label: string, max: number, stepN: number) => {
    const cy = 112, R = 96, a0 = Math.PI * 1.08, a1 = Math.PI * 1.92;
    x.strokeStyle = c.dim; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, R, a0, a1); x.stroke();
    for (let i = 0; i <= stepN; i++) { const a = lerp(a0, a1, i / stepN), big = i % 2 === 0; x.strokeStyle = big ? c.main : c.dim; x.lineWidth = big ? 3 : 2;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - (big ? 14 : 8)), cy + Math.sin(a) * (R - (big ? 14 : 8))); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke();
      if (big && max) { x.fillStyle = c.dim; x.font = `700 15px ${FONT}`; x.fillText(String(Math.round(max * i / stepN)), cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30)); } }
    const a = lerp(a0, a1, clamp(frac, 0, 1));
    x.shadowColor = c.main; x.shadowBlur = 14; x.strokeStyle = '#fff'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); x.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); x.stroke(); x.shadowBlur = 0;
    x.fillStyle = c.dim; x.font = `700 14px ${FONT}`; x.fillText(label, cx, cy + 34);
  };
  dial(150, kmh / 180, 'km/h', 180, 12);
  dial(618, 0.14 + kmh / 180 * 0.42 + Math.max(0, ego.acc) * 0.12, 'POWER', 0, 10);
  x.shadowColor = c.main; x.shadowBlur = 16; x.fillStyle = c.main; x.font = `700 62px ${FONT}`; x.fillText(String(Math.round(kmh)), 384, 72); x.shadowBlur = 0;
  x.fillStyle = c.dim; x.font = `700 16px ${FONT}`; x.fillText('km/h', 384, 112);
  const d = new Date(); x.fillStyle = c.main; x.font = `700 20px ${FONT}`;
  x.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, 310, 146);
  x.fillStyle = c.dim; x.fillText(`${(ego.s / 1000).toFixed(1)} km`, 458, 146);
  // ウインカー
  for (const dir of [-1, 1]) { const on = blinkOn && blinkDir === dir; x.fillStyle = on ? '#45ff8c' : '#0b1a12'; if (on) { x.shadowColor = '#45ff8c'; x.shadowBlur = 18; }
    const bx = 384 + dir * 92, by = 34; x.beginPath(); x.moveTo(bx + dir * 16, by); x.lineTo(bx, by - 13); x.lineTo(bx, by - 5); x.lineTo(bx - dir * 14, by - 5); x.lineTo(bx - dir * 14, by + 5); x.lineTo(bx, by + 5); x.lineTo(bx, by + 13); x.closePath(); x.fill(); x.shadowBlur = 0; }
  clusterTex.needsUpdate = true;
}
/** ヘッドユニットの簡易表示（設定画面を開いていないときの待受） */
function drawUnit() {
  const x = unitCtx, W = 512, H = 288, c = METER[cabin.meterColor];
  x.fillStyle = '#04060a'; x.fillRect(0, 0, W, H);
  x.strokeStyle = c.dim; x.lineWidth = 2; x.strokeRect(14, 14, W - 28, H - 28);
  x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = c.dim; x.font = `700 22px ${FONT}`; x.fillText('NIGHT EXPRESSWAY', 34, 46);
  const d = new Date(); x.textAlign = 'right'; x.fillStyle = c.main; x.font = `700 30px ${FONT}`;
  x.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, W - 34, 46);
  x.textAlign = 'left'; x.shadowColor = c.main; x.shadowBlur = 10; x.fillStyle = c.main; x.font = `700 40px ${FONT}`; x.fillText(cabin.unitLines[0] || '—', 34, 130, W - 68); x.shadowBlur = 0;
  x.fillStyle = c.dim; x.font = `400 26px ${FONT}`; x.fillText(cabin.unitLines[1] || '', 34, 186, W - 68);
  x.fillStyle = c.dim; x.fillRect(34, 232, W - 68, 3); x.fillStyle = c.main; x.fillRect(34, 232, (W - 68) * ((U.time.value / 240) % 1), 3);
  unitTex.needsUpdate = true;
}
export function setUnitLines(a: string, b: string) { cabin.unitLines = [a, b]; shownKey = ''; }

/* ---------------- 毎フレームの更新 ---------------- */
const _L = [0, 0, 0];
const cand: { e: number; x: number; y: number; z: number; c: number[] }[] = [];
/** f: 自車位置の道路フレーム, camY: カメラの高さ(ワールド) */
const _lp = new V3();
export function updateInterior(dt: number) {
  // 近くの照明を車体座標へ移し、照度の大きい順に NL 個を光源として渡す
  const lamps = lampsNear(ego.s); cand.length = 0;
  for (const L of lamps) {
    _lp.set(L.x, L.y, L.z).applyMatrix4(camera.matrixWorldInverse);       // カメラ座標 = 車体座標
    const e = Math.min(L.I * 1.25, L.I * L.h * L.h * L.h / Math.pow(_lp.lengthSq() + 1, 1.5));
    if (e > 0.004) cand.push({ e, x: _lp.x, y: _lp.y, z: _lp.z, c: L.col });
  }
  cand.sort((a, b) => b.e - a.e);
  const k = 1.5 * cabin.sweep;
  for (let i = 0; i < NL; i++) {
    const c = cand[i]; if (c) { lampPos[i].set(c.x, c.y, c.z); lampCol[i].set(c.c[0] * c.e * k, c.c[1] * c.e * k, c.c[2] * c.e * k); } else lampCol[i].set(0, 0, 0);
  }
  // 環境光: 光源で直接照らす分を別にしたので、ここは「回り込む光」だけを弱く入れる
  lightAt(ego.s + 1.0, ego.u + 0.4, 1.6, _L); const a = 0.16 * cabin.ambient;
  const dw = U.dawn.value * (1 - state.tunnel);
  shared.uAmb.value.set(0.035 + _L[0] * a + dw * 0.5, 0.035 + _L[1] * a + dw * 0.6, 0.042 + _L[2] * a + dw * 0.85);
  const g = METER[cabin.meterColor].glow, gg = 0.012 * cabin.meterGain; shared.uGlow.value.set(g[0] * gg, g[1] * gg, g[2] * gg);
  clusterMat.uniforms.uEmissive.value = 1.25 * cabin.meterGain; unitMat.uniforms.uEmissive.value = 0.8 * cabin.meterGain;

  // メーターは値が変わったときだけ描き直す
  clusterT -= dt;
  const kmh = Math.round(ego.v * 3.6), blinkOn = !!ego.blink && Math.floor(U.time.value * 2.8) % 2 === 0, bl = ego.blink ? (blinkOn ? 1 : 2) : 0, min = new Date().getMinutes();
  if (clusterT <= 0 && (kmh !== shownSpeed || bl !== shownBlink || min !== shownMin)) {
    const dir = ego.signal ? ego.signal : ego.lc >= 0 ? (ego.lane > ego.lcFrom ? 1 : -1) : 0;
    drawCluster(ego.v * 3.6, blinkOn, dir); shownSpeed = kmh; shownBlink = bl; shownMin = min; clusterT = 0.08;
  }
  const key = cabin.unitLines.join('|') + min + cabin.meterColor + Math.floor(U.time.value / 2);
  if (key !== shownKey) { drawUnit(); shownKey = key; }
}
