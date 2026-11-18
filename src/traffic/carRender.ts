/* ============================================================
   車両の描画
   車種ごとの車体形状（側面の輪郭を幅方向に押し出したもの）をインスタンス描画し、
   灯火の面・遠方用の光点・路面への照り返しを重ねる。
   ============================================================ */
import * as THREE from 'three';
import { U } from '../core/globals';
import { V3, sstep } from '../core/util';
import { camera, scene } from '../render/renderer';
import { _e } from '../world/geometry';
import { lightAt } from '../world/lighting';
import { frameAt } from '../world/path';
import { pointsMat } from '../world/points';
import { MAXCARS, cars, ego } from './traffic';

/* ---------------- 車体形状 ---------------- */
// part: 0=塗装 1=ガラス 2=黒い樹脂・タイヤ 3=室内灯のついた窓 4=塗装(第2色)
interface Poly { pts: number[][]; w0: number; w1: number; part: number; top?: number }
function hull(polys: Poly[], wheels: { z: number; r: number; rz: number }[], boxes: { min: number[]; max: number[]; part: number }[] = []) {
  const pos: number[] = [], nor: number[] = [], part: number[] = [];
  const tri = (a: number[], b: number[], c: number[], pt: number) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); part.push(pt); }
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], pt: number) => { tri(a, b, c, pt); tri(a, c, d, pt); };
  for (const P of polys) {
    const ys = P.pts.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const hw = (y: number) => (P.w0 + (P.w1 - P.w0) * (y1 > y0 ? (y - y0) / (y1 - y0) : 0)) * 0.5;
    const n = P.pts.length;
    for (let i = 1; i < n - 1; i++) for (const sx of [1, -1]) {      // 側面（扇形に分割）
      const A = P.pts[0], B = P.pts[i], C = P.pts[i + 1];
      const a = [sx * hw(A[1]), A[1], A[0]], b = [sx * hw(B[1]), B[1], B[0]], c = [sx * hw(C[1]), C[1], C[0]];
      if (sx > 0) tri(a, c, b, P.part); else tri(a, b, c, P.part);
    }
    for (let i = 0; i < n; i++) {                                    // 輪郭に沿った帯（ボンネット・屋根・前後の面）
      const A = P.pts[i], B = P.pts[(i + 1) % n];
      const up = Math.abs(B[0] - A[0]) > 1e-6 && Math.abs((B[1] - A[1]) / (B[0] - A[0])) < 0.35 && (A[1] + B[1]) / 2 > (y0 + y1) / 2;
      quad([-hw(A[1]), A[1], A[0]], [hw(A[1]), A[1], A[0]], [hw(B[1]), B[1], B[0]], [-hw(B[1]), B[1], B[0]], up && P.top !== undefined ? P.top : P.part);
    }
  }
  const box = (mn: number[], mx: number[], pt: number) => {
    const [x0, y0, z0] = mn, [x1, y1, z1] = mx;
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], pt); quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], pt);
    quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], pt); quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], pt);
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], pt);
  };
  for (const b of boxes) box(b.min, b.max, b.part);
  for (const w of wheels) for (const sx of [1, -1]) {                // タイヤ（八角柱）
    const x0 = sx * 0.50, x1 = sx * 0.36; const ring: number[][] = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ring.push([Math.cos(a) * w.rz + w.z, Math.sin(a) * w.r + w.r]); }
    for (let k = 0; k < 8; k++) { const A = ring[k], B = ring[(k + 1) % 8]; quad([x0, A[1], A[0]], [x1, A[1], A[0]], [x1, B[1], B[0]], [x0, B[1], B[0]], 2); if (k > 0 && k < 7) tri([x0, ring[0][1], ring[0][0]], [x0, A[1], A[0]], [x0, B[1], B[0]], 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  return g;
}
// 側面の輪郭は [z, y]。z は -0.5(前)〜0.5(後)、y は 0(路面)〜1(全高)。
const SHAPES: Record<string, () => THREE.BufferGeometry> = {
  sedan: () => hull([
    { pts: [[-0.5, 0.17], [-0.5, 0.42], [-0.47, 0.51], [-0.17, 0.60], [0.38, 0.62], [0.5, 0.57], [0.5, 0.17]], w0: 1, w1: 1, part: 0 },
    { pts: [[-0.17, 0.60], [-0.03, 0.97], [0.20, 1.0], [0.38, 0.62]], w0: 0.94, w1: 0.72, part: 1, top: 0 },
  ], [{ z: -0.31, r: 0.215, rz: 0.068 }, { z: 0.30, r: 0.215, rz: 0.068 }]),
  hatch: () => hull([
    { pts: [[-0.5, 0.15], [-0.5, 0.40], [-0.46, 0.50], [-0.22, 0.57], [0.5, 0.59], [0.5, 0.15]], w0: 1, w1: 1, part: 0 },
    { pts: [[-0.22, 0.57], [-0.06, 0.97], [0.36, 1.0], [0.49, 0.59]], w0: 0.94, w1: 0.76, part: 1, top: 0 },
  ], [{ z: -0.32, r: 0.185, rz: 0.085 }, { z: 0.32, r: 0.185, rz: 0.085 }]),
  van: () => hull([
    { pts: [[-0.5, 0.13], [-0.5, 0.38], [-0.44, 0.48], [-0.30, 0.53], [0.5, 0.55], [0.5, 0.13]], w0: 1, w1: 1, part: 0 },
    { pts: [[-0.30, 0.53], [-0.17, 0.97], [0.47, 1.0], [0.5, 0.55]], w0: 0.95, w1: 0.82, part: 1, top: 0 },
  ], [{ z: -0.31, r: 0.165, rz: 0.068 }, { z: 0.31, r: 0.165, rz: 0.068 }]),
  truck: () => hull([
    { pts: [[-0.5, 0.14], [-0.5, 0.50], [-0.27, 0.50], [-0.27, 0.14]], w0: 0.96, w1: 0.96, part: 4 },
    { pts: [[-0.5, 0.50], [-0.485, 0.80], [-0.27, 0.80], [-0.27, 0.50]], w0: 0.94, w1: 0.88, part: 1, top: 4 },
  ], [{ z: -0.37, r: 0.15, rz: 0.052 }, { z: 0.26, r: 0.15, rz: 0.052 }, { z: 0.37, r: 0.15, rz: 0.052 }],
  [{ min: [-0.5, 0.26, -0.255], max: [0.5, 1.0, 0.5], part: 0 }, { min: [-0.3, 0.14, -0.27], max: [0.3, 0.26, 0.48], part: 2 }]),
  bus: () => hull([], [{ z: -0.33, r: 0.155, rz: 0.045 }, { z: 0.30, r: 0.155, rz: 0.045 }], [
    { min: [-0.5, 0.11, -0.5], max: [0.5, 0.46, 0.5], part: 0 }, { min: [-0.492, 0.46, -0.495], max: [0.492, 0.80, 0.495], part: 3 }, { min: [-0.5, 0.80, -0.5], max: [0.5, 1.0, 0.5], part: 0 }]),
};
const SHAPE_OF: Record<string, string> = { sedan: 'sedan', taxi: 'sedan', compact: 'hatch', minivan: 'van', van: 'van', truck: 'truck', bus: 'bus' };

const CAR_VS = `attribute float part; attribute vec3 iPaint; attribute vec3 iPaint2;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vPaint; varying float vPart; varying vec3 vObj;
void main(){
  vec3 sc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0); vW=wp.xyz; vObj=position*sc;
  vN=normalize(mat3(instanceMatrix)*(normal/(sc*sc)));
  vL=instanceColor; vPart=part; vPaint= part>3.5? iPaint2 : iPaint;
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const CAR_FS = `uniform vec3 uHazeCol; uniform float uHaze; uniform float uWet; uniform float uDawn;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vPaint; varying float vPart; varying vec3 vObj;
void main(){
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 V=cameraPosition-vW; float d=length(V); V/=d;
  float up=N.y; float nv=max(dot(N,V),0.0); float fr=pow(1.0-nv,3.0);
  float shade= up<0.0 ? 0.18 : 0.34+0.66*up;
  vec3 col;
  if(vPart<0.5||vPart>3.5){            // 塗装: 上面は街灯を映して明るく、縁は空を映す
    col=vPaint*(vL+vec3(0.5,0.6,0.8)*uDawn)*shade + vL*(pow(max(up,0.0),5.0)*0.07*(1.0+uWet)) + uHazeCol*fr*0.35;
  } else if(vPart<1.5){               // ガラス
    col=vec3(0.010,0.012,0.016)*vL + uHazeCol*fr*0.9 + vL*pow(max(up,0.0),3.0)*0.02;
  } else if(vPart<2.5){ col=vec3(0.006)*vL; }
  else {                               // バスの窓: 室内灯と窓柱
    float m=smoothstep(0.42,0.5,abs(fract(vObj.z/1.45)-0.5));
    col=mix(vec3(0.95,0.8,0.58)*0.42,vec3(0.02),m)*step(abs(N.y),0.5)+vec3(0.01)*vL;
  }
  float fog=1.0-exp(-pow(d*uHaze,2.0));
  gl_FragColor=vec4(mix(col,uHazeCol,fog),1.0);
}`;
const GLOW_VS = `varying vec2 vUv; varying vec3 vC; void main(){ vUv=uv; vC=instanceColor; gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0); }`;
const GLOW_FS = `uniform float uWet; varying vec2 vUv; varying vec3 vC; void main(){ vec2 p=vUv-0.5; float a=exp(-dot(p,p)*15.0); a*=a>0.02?1.0:0.0; gl_FragColor=vec4(vC*a*(1.0+uWet*1.4),1.0); }`;

let hulls: Record<string, THREE.InstancedMesh> = {}, tail: THREE.InstancedMesh, head: THREE.InstancedMesh, extra: THREE.InstancedMesh, glow: THREE.InstancedMesh, pts: THREE.Points;
const count: Record<string, number> = {};
/** 交通の見た目の調整値 */
export const carLook = { glow: 1, glare: 1 };

export function makeTraffic() {
  const carMat = new THREE.ShaderMaterial({ vertexShader: CAR_VS, fragmentShader: CAR_FS, side: THREE.DoubleSide, uniforms: { uHazeCol: U.hazeCol, uHaze: U.haze, uWet: U.wet, uDawn: U.dawn } });
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, n: number) => {
    const im = new THREE.InstancedMesh(g, m, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.frustumCulled = false; im.setColorAt(0, new THREE.Color()); scene.add(im); return im;
  };
  for (const k in SHAPES) {
    const g = SHAPES[k]();
    g.setAttribute('iPaint', new THREE.InstancedBufferAttribute(new Float32Array(MAXCARS * 3), 3)); g.setAttribute('iPaint2', new THREE.InstancedBufferAttribute(new Float32Array(MAXCARS * 3), 3));
    hulls[k] = mk(g, carMat, MAXCARS);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  tail = mk(new THREE.PlaneGeometry(1, 1), lightMat, MAXCARS * 4);
  head = mk(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI), lightMat, MAXCARS * 2);
  extra = mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lightMat, MAXCARS);
  glow = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: { uWet: U.wet },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAXCARS * 2);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXCARS * 12 * 3), 3));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAXCARS * 12 * 3), 3));
  pg.setAttribute('size', new THREE.Float32BufferAttribute(new Float32Array(MAXCARS * 12), 1));
  pts = new THREE.Points(pg, pointsMat(false)); pts.frustumCulled = false; scene.add(pts);
}

const _mc = new THREE.Matrix4(), _ml = new THREE.Matrix4(), _qc = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _col = new THREE.Color(), _pc = new V3(), _a = new V3(), _b = new V3(), _fr: any = {};
export function renderTraffic() {
  for (const k in hulls) count[k] = 0;
  let nt = 0, nh = 0, nx = 0, ng = 0, np = 0;
  const ppos = pts.geometry.attributes.position.array as Float32Array, pcol = pts.geometry.attributes.color.array as Float32Array, psz = pts.geometry.attributes.size.array as Float32Array;
  const camP = camera.position;
  const put = (mesh: THREE.InstancedMesh, n: number, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, r: number, g: number, b: number) => {
    _ml.compose(_a.set(ox, oy, oz), _qi, _b.set(sx, sy, sz)); _ml.premultiply(_mc); mesh.setMatrixAt(n, _ml); mesh.setColorAt(n, _col.setRGB(r, g, b));
  };
  const addPt = (lx: number, ly: number, lz: number, r: number, g: number, b: number, sz: number) => {
    _a.set(lx, ly, lz).applyMatrix4(_mc); ppos[np * 3] = _a.x; ppos[np * 3 + 1] = _a.y; ppos[np * 3 + 2] = _a.z; pcol[np * 3] = r; pcol[np * 3 + 1] = g; pcol[np * 3 + 2] = b; psz[np] = sz; np++;
  };
  for (const c of cars) {
    if (Math.abs(c.s - ego.s) > 1500) continue;
    const f = frameAt(c.s, _fr);
    const x = f.x + f.rx * c.u, z = f.z + f.rz * c.u, y = f.y;
    const yaw = -f.h + (c.dir < 0 ? Math.PI : 0), pitch = Math.atan(f.slope) * c.dir;
    _qc.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
    _mc.compose(_pc.set(x, y, z), _qc, _b.set(1, 1, 1));
    const L = lightAt(c.s, c.u, 1.4);
    const t = c.type, w = t.w, h = t.h, l = t.l, p = c.paint, big = t.k === 'truck' || t.k === 'bus';
    const lr = Math.min(1.6, L[0] * 0.6 + 0.12), lg = Math.min(1.6, L[1] * 0.6 + 0.12), lb = Math.min(1.6, L[2] * 0.6 + 0.13);
    // 車体
    const key = SHAPE_OF[t.k], hm = hulls[key], n = count[key]++;
    put(hm, n, 0, 0, 0, w, h, l, lr, lg, lb);
    (hm.geometry.attributes.iPaint as THREE.BufferAttribute).setXYZ(n, p[0], p[1], p[2]);
    (hm.geometry.attributes.iPaint2 as THREE.BufferAttribute).setXYZ(n, c.cab[0], c.cab[1], c.cab[2]);
    if (t.k === 'taxi') put(extra, nx++, 0, h, 0.1, 0.45, 0.16, 0.2, 2.4, 1.6, 0.7);           // 行灯
    // 灯火
    const bk = c.brake > 0.5 ? 1 : 0;
    const tr = bk ? 9 : 3.4, tg = bk ? 0.28 : 0.09, tb = bk ? 0.12 : 0.045;
    const tailY = big ? 0.95 : h * 0.47, hy = big ? 0.8 : h * 0.4;
    const dx = camP.x - x, dy = camP.y - y, dz = camP.z - z;
    const front = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) > 0;
    if (key === 'sedan') { put(tail, nt++, -w * 0.33, tailY, l / 2 + 0.02, w * 0.26, 0.09, 1, tr, tg, tb); put(tail, nt++, w * 0.33, tailY, l / 2 + 0.02, w * 0.26, 0.09, 1, tr, tg, tb); }
    else if (key === 'truck') { put(tail, nt++, -w * 0.36, tailY, l / 2 + 0.02, w * 0.2, 0.16, 1, tr, tg, tb); put(tail, nt++, w * 0.36, tailY, l / 2 + 0.02, w * 0.2, 0.16, 1, tr, tg, tb); }
    else { put(tail, nt++, -w * 0.43, tailY + 0.12, l / 2 + 0.02, w * 0.1, 0.42, 1, tr, tg, tb); put(tail, nt++, w * 0.43, tailY + 0.12, l / 2 + 0.02, w * 0.1, 0.42, 1, tr, tg, tb); }
    if (!big) put(tail, nt++, 0, h * 0.93, l / 2 - (key === 'sedan' ? l * 0.2 : 0.02), w * 0.3, 0.03, 1, bk ? 7 : 0.25, bk ? 0.2 : 0.01, bk ? 0.1 : 0.005);   // ハイマウント
    put(tail, nt++, 0, big ? 0.7 : h * 0.3, l / 2 + 0.025, 0.36, 0.1, 1, 0.2, 0.19, 0.17);                                                              // ナンバー灯
    put(head, nh++, -w * 0.34, hy, -l / 2 - 0.02, w * 0.22, 0.11, 1, 6, 6, 5.6); put(head, nh++, w * 0.34, hy, -l / 2 - 0.02, w * 0.22, 0.11, 1, 6, 6, 5.6);
    // 遠方でも見える光点
    const dist = Math.hypot(dx, dy, dz), near = sstep(15, 50, dist);
    if (front) { const k = (c.dir < 0 ? 1 : 0.25) * carLook.glare, sz = c.dir < 0 ? 7 : 4; addPt(-w * 0.34, hy, -l / 2 - 0.3, 2.2 * k, 2.2 * k, 2.0 * k, sz); addPt(w * 0.34, hy, -l / 2 - 0.3, 2.2 * k, 2.2 * k, 2.0 * k, sz); }
    else { const k = near * (bk ? 2.2 : 1); addPt(-w * 0.36, tailY, l / 2 + 0.2, 1.0 * k, 0.05 * k, 0.02 * k, 3.2); addPt(w * 0.36, tailY, l / 2 + 0.2, 1.0 * k, 0.05 * k, 0.02 * k, 3.2); }
    if (t.k === 'truck') { for (let k = 0; k < 4; k++) { const zz = -l / 2 + 2.5 + k * (l - 3) / 3; for (const sx of [-1, 1]) addPt(sx * w * 0.51, 0.5, zz, 0.9, 0.42, 0.05, 1.8); } addPt(-w * 0.45, h, l / 2, 0.9, 0.4, 0.05, 2); addPt(w * 0.45, h, l / 2, 0.9, 0.4, 0.05, 2); }
    // 路面への照り返し（後ろは赤、前はヘッドライトの光だまり）
    const gk = carLook.glow;
    put(glow, ng++, 0, 0.04, l / 2 + 1.5, w * 2.6, 1, 4.2, (bk ? 0.34 : 0.12) * gk, 0.008 * gk, 0.004 * gk);
    put(glow, ng++, 0, 0.04, -l / 2 - 7.5, 5.2, 1, 17, 0.085 * gk, 0.08 * gk, 0.066 * gk);
  }
  _qi.identity();
  for (const k in hulls) { const m = hulls[k]; m.count = count[k]; m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; m.geometry.attributes.iPaint.needsUpdate = true; m.geometry.attributes.iPaint2.needsUpdate = true; }
  for (const [m, n] of [[tail, nt], [head, nh], [extra, nx], [glow, ng]] as [THREE.InstancedMesh, number][]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  for (let i = np; i < MAXCARS * 12; i++) psz[i] = 0;
  pts.geometry.setDrawRange(0, np);
  pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true; pts.geometry.attributes.size.needsUpdate = true;
}
