/* ============================================================
   工場夜景の区間
   建物の窓ではなく「暗い構造物 + 無数の小さな灯り」で作る。
   前半は左手が運河で、対岸のプラントが水面に映る。後半はプラントの中を抜ける。
   配置にはチャンクごとの乱数を使い、共有の乱数 R() は消費しない。
   ============================================================ */
import * as THREE from 'three';
import { SPC, U } from '../core/globals';
import { V3 } from '../core/util';
import { makeCrane } from './bay';
import { chunkRng, footprintClear } from './chunks';
import { GEO, inst, unitBox } from './geometry';
import { MAT } from './materials';
import { S } from './path';
import { makeHalos, makePoints } from './points';

const LW = [0.70, 0.95, 0.86], LC = [0.85, 0.92, 1.0], LS = [1.0, 0.55, 0.2], LR = [1.0, 0.1, 0.05];
const DARK = [0.030, 0.033, 0.038], STEEL = [0.055, 0.058, 0.064], LIT = [0.095, 0.074, 0.052], PALE = [0.082, 0.086, 0.092];
const RED = [0.15, 0.022, 0.015], WHT = [0.12, 0.12, 0.12];

/** 運河の範囲（区間内の位置）。この範囲の左手の近くには構造物を置かない。 */
export function inCanal(sec, ls) { return ls >= sec.wa && ls < sec.wb; }

let flameMat: THREE.ShaderMaterial | null = null, steamMat: THREE.ShaderMaterial | null = null;
function getFlameMat() {
  return flameMat ||= new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uProj: U.proj, uHaze: U.haze }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute float seed; uniform float uProj; uniform float uHaze; varying float vF; varying float vPh;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; float d=max(-mv.z,1.0);
        gl_PointSize=clamp(size*uProj/d,2.0,220.0); vF=exp(-pow(d*uHaze*0.7,2.0)); vPh=seed*40.0; }`,
    fragmentShader: `uniform float uTime; varying float vF; varying float vPh;
      void main(){ vec2 q=vec2(gl_PointCoord.x-0.5,1.0-gl_PointCoord.y);
        float t=uTime;
        float sway=sin(q.y*7.0-t*5.3+vPh)*0.07+sin(q.y*15.0-t*8.9+vPh*1.7)*0.035;
        float len=0.78+0.16*sin(t*3.1+vPh)+0.06*sin(t*7.7+vPh*2.3);
        float w=mix(0.17,0.015,clamp(q.y/len,0.0,1.0));
        float a=smoothstep(w,w*0.15,abs(q.x+sway*q.y*1.6))*smoothstep(len,len*0.45,q.y)*smoothstep(0.0,0.05,q.y);
        vec3 c=mix(vec3(1.0,0.30,0.05),vec3(1.0,0.82,0.45),a*a)*a*5.0;
        gl_FragColor=vec4(c*vF,1.0); }`,
  });
}
function getSteamMat() {
  return steamMat ||= new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uProj: U.proj, uHaze: U.haze, uDawn: U.dawn }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute float seed; uniform float uTime; uniform float uProj; uniform float uHaze; varying float vA;
      void main(){ float life=fract(uTime*0.03+seed);
        vec3 p=position+vec3(life*life*42.0,life*50.0,life*life*16.0);
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; float d=max(-mv.z,1.0);
        gl_PointSize=clamp(size*(0.3+life*1.2)*uProj/d,1.0,240.0);
        vA=smoothstep(0.0,0.07,life)*pow(1.0-life,1.6)*exp(-pow(d*uHaze*0.8,2.0)); }`,
    fragmentShader: `uniform float uDawn; varying float vA;
      void main(){ vec2 p=gl_PointCoord-0.5; float r=dot(p,p)*4.0; float a=exp(-r*3.2)*(1.0-smoothstep(0.55,1.0,r));
        gl_FragColor=vec4((vec3(0.075,0.058,0.044)+vec3(0.10,0.11,0.13)*uDawn)*a*vA,1.0); }`,
  });
}

/** チャンク1つ分の部品を溜めて、最後にまとめてメッシュにする */
class Kit {
  box: THREE.Matrix4[] = []; boxC: number[][] = []; cyl: THREE.Matrix4[] = []; cylC: number[][] = []; sph: THREE.Matrix4[] = []; sphC: number[][] = [];
  pt: number[] = []; pc: number[] = []; ps: number[] = []; bp: number[] = []; halo: number[] = []; haloC: number[] = []; big: number[] = []; bigC: number[] = [];
  flame: number[] = []; flameS: number[] = []; steam: number[] = []; steamS: number[] = []; seeds: number[] = []; fseeds: number[] = [];
  // 配置中のユニットの原点と向き
  ox = 0; oz = 0; c = 1; s = 0; q = new THREE.Quaternion();
  constructor(public rg: () => number) {}
  r(a: number, b: number) { return a + (b - a) * this.rg(); }
  at(x: number, z: number, yaw: number) { this.ox = x; this.oz = z; this.c = Math.cos(yaw); this.s = Math.sin(yaw); this.q.setFromEuler(new THREE.Euler(0, yaw, 0)); }
  wx(lx: number, lz: number) { return this.ox + lx * this.c + lz * this.s; }
  wz(lx: number, lz: number) { return this.oz - lx * this.s + lz * this.c; }
  tint(c: number[], k = 1) { const j = k * this.r(0.8, 1.2); return [c[0] * j, c[1] * j, c[2] * j]; }
  addBox(lx: number, y: number, lz: number, sx: number, sy: number, sz: number, col: number[]) {
    this.box.push(new THREE.Matrix4().compose(new V3(this.wx(lx, lz), y, this.wz(lx, lz)), this.q, new V3(sx, sy, sz))); this.boxC.push(col); }
  addCyl(lx: number, y: number, lz: number, r: number, h: number, col: number[]) {
    this.cyl.push(new THREE.Matrix4().compose(new V3(this.wx(lx, lz), y, this.wz(lx, lz)), this.q, new V3(r, h, r))); this.cylC.push(col); }
  addSph(lx: number, y: number, lz: number, r: number, col: number[]) {
    this.sph.push(new THREE.Matrix4().compose(new V3(this.wx(lx, lz), y, this.wz(lx, lz)), this.q, new V3(r, r, r))); this.sphC.push(col); }
  light(lx: number, y: number, lz: number, col: number[], size = 3.2, k = 1.0) { this.pt.push(this.wx(lx, lz), y, this.wz(lx, lz)); this.pc.push(col[0] * k, col[1] * k, col[2] * k); this.ps.push(size); }
  blink(lx: number, y: number, lz: number) { this.bp.push(this.wx(lx, lz), y, this.wz(lx, lz)); }
  glow(lx: number, y: number, lz: number, col: number[], k: number) { this.halo.push(this.wx(lx, lz), y, this.wz(lx, lz)); this.haloC.push(col[0] * k, col[1] * k, col[2] * k); }
  /** 作業灯の色。大半は水銀灯の白緑、ときどきナトリウムの橙 */
  work() { const r = this.rg(); return r < 0.62 ? LW : r < 0.82 ? LC : LS; }
  plume(lx: number, y: number, lz: number, size: number) { const s0 = this.rg(); for (let k = 0; k < 7; k++) { this.steam.push(this.wx(lx, lz), y, this.wz(lx, lz)); this.steamS.push(size); this.seeds.push(s0 + k / 7); } }

  /* ---- 蒸留塔の並ぶ架構 ---- */
  columns(scale = 1) {
    const n = 2 + ((this.rg() * 4) | 0), fw = 10 + n * 7, fh = this.r(16, 34) * scale, fd = this.r(10, 18);
    this.addBox(0, 0, 0, fw, fh, fd, this.tint(DARK));
    for (let y = 3.5; y < fh; y += 3.8) for (let x = -fw / 2 + 1; x <= fw / 2 - 1; x += 4.2) for (const z of [-1, 1]) if (this.rg() < 0.78) this.light(x, y, z * (fd / 2 + 0.4), this.work(), 3.0);
    for (let y = 4; y < fh; y += 4.6) for (const x of [-1, 1]) if (this.rg() < 0.6) this.light(x * (fw / 2 + 0.4), y, this.r(-fd / 2, fd / 2), this.work(), 2.8);
    for (let k = 0; k < n; k++) {
      const lx = (k - (n - 1) / 2) * 7 + this.r(-1, 1), lz = this.r(-fd * 0.3, fd * 0.3), r = this.r(1.4, 3.0), h = fh + this.r(10, 48) * scale;
      this.addCyl(lx, 0, lz, r, h, this.tint(STEEL));
      for (let y = fh + 6; y < h - 2; y += 13) this.addCyl(lx, y, lz, r + 1.0, 0.35, DARK);
      let side = k % 2 ? 1 : -1;
      for (let y = fh + 2.5; y < h; y += 3.6) { this.light(lx + side * (r + 0.5), y, lz + this.r(-0.6, 0.6), this.work(), 3.0); if (this.rg() < 0.5) this.light(lx - side * (r + 0.5), y + 1.5, lz, this.work(), 2.6); if (this.rg() < 0.35) side = -side; }
      if (h > 58) this.blink(lx, h + 1, lz); else this.light(lx, h + 0.8, lz, LC, 3.2);
    }
    if (this.rg() < 0.5) this.glow(this.r(-fw / 2, fw / 2), fh * 0.6, fd / 2 + 2, LS, 0.45);
    return Math.max(fw, fd) / 2 + 3;
  }
  /* ---- 円筒タンク群 ---- */
  tanks() {
    const cols = 2 + ((this.rg() * 3) | 0), rows = 1 + ((this.rg() * 2) | 0), r = this.r(8, 14), h = this.r(11, 19), sp = r * 2 + 7;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const lx = (i - (cols - 1) / 2) * sp, lz = (j - (rows - 1) / 2) * sp;
      this.addCyl(lx, 0, lz, r, h, this.tint(this.rg() < 0.5 ? LIT : PALE));
      for (let k = 0; k < 3; k++) { const a = this.rg() * 6.28; this.light(lx + Math.cos(a) * (r + 0.2), h + 0.9, lz + Math.sin(a) * (r + 0.2), this.work(), 2.6); }
    }
    const px = (cols % 2 ? sp / 2 : 0);
    this.addBox(px, 0, 0, 0.4, h + 6, 0.4, DARK); this.light(px, h + 6.2, 0, LS, 4.2, 1.0); this.glow(px, h + 6, 0, LS, 0.5);
    return Math.max(cols, rows) * sp / 2 + 2;
  }
  /* ---- 球形タンク ---- */
  spheres() {
    const n = 3 + ((this.rg() * 3) | 0), r = this.r(6.5, 9), sp = r * 2 + 5, cy = r + 5;
    for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * sp;
      this.addSph(lx, cy, 0, r, this.tint(PALE, 0.85));
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.addBox(lx + dx * r * 0.62, 0, dz * r * 0.62, 0.5, cy, 0.5, DARK);
      this.light(lx, cy + r + 1.0, 0, LW, 3.0); this.light(lx + r * 0.8, cy - r * 0.3, r * 0.7, this.work(), 2.6);
    }
    this.addBox(0, cy + r + 0.2, 0, (n - 1) * sp, 0.3, 1.2, DARK);
    this.glow(0, cy + r + 4, r + 4, LS, 0.4);
    return n * sp / 2 + 2;
  }
  /* ---- 紅白の煙突 ---- */
  chimney() {
    const h = this.r(95, 165), r = this.r(2.2, 3.4), segs = 7;
    for (let k = 0; k < segs; k++) this.addCyl(0, k * h / segs, 0, r * (1.25 - 0.25 * k / (segs - 1)), h / segs, (segs - k) % 2 ? RED : WHT);
    for (const a of [0, 2.1, 4.2]) { this.blink(Math.cos(a) * (r + 0.4), h + 0.5, Math.sin(a) * (r + 0.4)); this.blink(Math.cos(a) * (r + 0.8), h * 0.52, Math.sin(a) * (r + 0.8)); }
    const bw = this.r(22, 36), bh = this.r(12, 22), bd = this.r(16, 24);
    this.addBox(bw / 2 + 4, 0, 0, bw, bh, bd, this.tint(DARK, 1.2));
    for (let x = 6; x < bw + 2; x += 5.5) for (const y of [bh * 0.45, bh - 1]) if (this.rg() < 0.7) this.light(x, y, bd / 2 + 0.4, this.work(), 2.8);
    if (this.rg() < 0.6) this.plume(0, h, 0, 26);
    return bw + 6;
  }
  /* ---- フレアスタック（炎） ---- */
  flare() {
    const h = this.r(72, 112);
    this.addBox(0, 0, 0, 1.8, h, 1.8, STEEL); this.addBox(0, 0, 0, 5, h * 0.3, 5, DARK);
    for (let y = 14; y < h - 6; y += 14) this.light(1.2, y, 0, LR, 2.4, 0.7);
    const fs = this.r(15, 22);
    this.flame.push(this.wx(0, 0), h + fs * 0.45, this.wz(0, 0)); this.flameS.push(fs); this.fseeds.push(this.rg());
    this.big.push(this.wx(0, 0), h + fs * 0.3, this.wz(0, 0)); this.bigC.push(0.9, 0.38, 0.09);
    return 6;
  }
  /* ---- 加熱炉・ボイラー棟 ---- */
  furnace() {
    const w = this.r(26, 44), h = this.r(18, 30), d = this.r(18, 28);
    this.addBox(0, 0, 0, w, h, d, this.tint(DARK, 1.3));
    for (const y of [h * 0.35, h * 0.7, h + 1]) for (let x = -w / 2 + 2; x <= w / 2 - 2; x += 5.6) for (const z of [-1, 1]) if (this.rg() < 0.6) this.light(x, y, z * (d / 2 + 0.4), this.work(), 2.8);
    for (const sx of [-0.28, 0.28]) { const sh = h + this.r(12, 26); this.addCyl(sx * w, h, 0, 1.6, sh - h, STEEL); this.light(sx * w + 2, sh - 1, 0, LC, 2.8); if (this.rg() < 0.55) this.plume(sx * w, sh, 0, 20); }
    this.glow(0, h * 0.5, d / 2 + 3, LS, 0.45);
    return Math.max(w, d) / 2 + 2;
  }
  /* ---- 配管ラック ---- */
  rack(len: number) {
    for (const [y, wd] of [[9, 3.2], [12.5, 2.4], [16, 1.6]]) this.addBox(0, y, 0, len, 0.9, wd, this.tint(STEEL));
    for (let x = -len / 2; x <= len / 2; x += 12) { this.addBox(x, 0, -1.5, 0.45, 16.5, 0.45, DARK); this.addBox(x, 0, 1.5, 0.45, 16.5, 0.45, DARK); if (this.rg() < 0.75) this.light(x, 17.4, 0, this.rg() < 0.7 ? LS : LW, 2.8); }
    return 3;
  }
  unit(kind: string, scale = 1) {
    switch (kind) { case 'columns': return this.columns(scale); case 'tanks': return this.tanks(); case 'spheres': return this.spheres(); case 'chimney': return this.chimney(); case 'flare': return this.flare(); case 'furnace': return this.furnace(); default: return this.rack(this.r(50, 90)); }
  }
}

// 区域ごとの出やすさ。道路の近くは背の高いもの、遠くは塔と煙突を多めに
const NEAR = ['columns', 'columns', 'columns', 'furnace', 'rack', 'rack', 'spheres', 'tanks'];
const MID = ['columns', 'columns', 'furnace', 'tanks', 'tanks', 'spheres', 'chimney', 'rack', 'flare'];
const FAR = ['columns', 'columns', 'columns', 'chimney', 'chimney', 'furnace', 'tanks', 'flare'];

export function buildIndustrial(g: THREE.Group, own: any[], sec: any, ls0: number, i0: number, ci: number) {
  const rg = chunkRng(ci, 31), K = new Kit(rg);
  const edge = ls0 < 100 || ls0 >= sec.len - 100;          // 区間の端は街との境目なので控えめに
  const canal = ls0 >= sec.wa - 300 && ls0 < sec.wb + 300;   // 運河とその前後（水面の円が端で膨らむ分）
  // [側, 近い端, 遠い端, 個数, 候補, 大きさ]
  const plan: [number, number, number, number, string[], number][] = [];
  if (canal) plan.push([-1, 610, 700, 2, FAR, 1.2], [-1, 700, 820, 2, FAR, 1.35], [-1, 820, 1050, 2, FAR, 1.5]);
  else plan.push([-1, 30, 130, edge ? 1 : 2, NEAR, 1], [-1, 130, 340, 2, MID, 1], [-1, 340, 800, 3, FAR, 1.3]);
  plan.push([1, 30, 140, 1, NEAR, 1], [1, 140, 420, edge ? 1 : 2, MID, 1.1], [1, 420, 850, 2, FAR, 1.3]);
  for (const [side, ua, ub, n, kinds, scale] of plan) {
    for (let k = 0; k < n; k++) {
      const a = S(i0 + ((rg() * SPC) | 0)); const u = side * K.r(ua, ub); let kind = kinds[(rg() * kinds.length) | 0];
      if (kind === 'flare' && rg() < 0.6) kind = 'columns';   // 炎は遠くにときどき見える程度に
      const yaw = -a.h + (rg() < 0.5 ? 0 : Math.PI / 2) + K.r(-0.12, 0.12);
      const cx = a.x + a.rx * u, cz = a.z + a.rz * u;
      // 先に置けるか確かめる。大きさは種類ごとの上限で見積もる
      const reach = kind === 'flare' ? 6 : kind === 'rack' ? 46 : kind === 'chimney' ? 42 : 34;
      if (!footprintClear(cx, cz, reach, reach, yaw, a.s, 13)) continue;
      K.at(cx, cz, yaw); K.unit(kind, scale);
    }
  }
  // 運河沿いの岸壁: 荷役クレーンと係留灯
  if (ls0 === sec.wa + 300 || ls0 === sec.wb - 400) for (let k = 0; k < 2; k++) g.add(makeCrane(S(i0 + 10 + k * 22), -(640 + rg() * 60), -S(i0).h + Math.PI / 2 + K.r(-0.2, 0.2)));
  if (inCanal(sec, ls0)) {
    // 対岸の岸壁に並ぶ照明と、運河を行く船
    for (let j = 0; j < SPC; j += 6) { const a = S(i0 + j); K.at(a.x - a.rx * 575, a.z - a.rz * 575, -a.h); K.light(0, 9, 0, LS, 3.6, 1.0); if (j % 12 === 0) K.glow(0, 9, 0, LS, 0.35); }
    if (rg() < 0.35) { const a = S(i0 + 20), u = -K.r(150, 430), ang = -a.h + K.r(-0.25, 0.25); K.at(a.x + a.rx * u, a.z + a.rz * u, ang);
      const L = K.r(50, 110); for (let x = -L / 2; x <= L / 2; x += L / 6) K.light(K.r(-1, 1), K.r(4, 7), x, [1.0, 0.82, 0.55], 3.4); K.light(0, 15, -L * 0.3, [1, 1, 1], 3.6); K.light(2, 8, -L * 0.3, [0.1, 1, 0.3], 3); K.light(-2, 8, -L * 0.3, LR, 3); }
  }

  const add = (o: THREE.Object3D | null) => { if (o) { o.matrixAutoUpdate = false; g.add(o); } };
  add(inst(unitBox, MAT.plant, K.box, K.boxC)); add(inst(GEO.cyl, MAT.plant, K.cyl, K.cylC)); add(inst(GEO.sphere, MAT.plant, K.sph, K.sphC));
  if (K.pt.length) g.add(makePoints(K.pt, K.pc, K.ps));
  if (K.bp.length) g.add(makePoints(K.bp, K.bp.map((_, i) => LR[i % 3]), 5, true));
  if (K.halo.length) g.add(makeHalos(K.halo, K.haloC, 13));
  if (K.big.length) g.add(makeHalos(K.big, K.bigC, 75));
  const sprite = (pos: number[], size: number[], seed: number[], mat: THREE.Material) => {
    const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setAttribute('size', new THREE.Float32BufferAttribute(size, 1)); gm.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
    const p = new THREE.Points(gm, mat); p.frustumCulled = false; g.add(p); };
  if (K.flame.length) sprite(K.flame, K.flameS, K.fseeds, getFlameMat());
  if (K.steam.length) sprite(K.steam, K.steamS, K.seeds, getSteamMat());
}
