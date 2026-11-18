/* ============================================================
   JCT（ジャンクション）の区間
   本線は直進する。左右に減速・加速車線とランプが付き、頭上を交差道路と2本のフライオーバーが渡る。

   形は「本線座標」で決める: t = 区間中央からの進行方向の距離(m)、u = 横(m, 左が負)、y = 本線路面からの高さ(m)。
   本線は区間の中央 ±1000m で直線なので、この座標は歪まない。
   各デッキ（ランプ・交差道路）は点列で持ち、チャンクごとに自分の範囲の分だけ形状にする。
   ============================================================ */
import * as THREE from 'three';
import { CH, LAMP_COLORS, U } from '../core/globals';
import { lerp, sstep } from '../core/util';
import { GEO, inst, propM, unitBox } from './geometry';
import { lightAt } from './lighting';
import { MAT } from './materials';
import { ensurePath, frameAt } from './path';
import { makeHalos } from './points';

export const JCT_H = 10.5, JCT_H2 = 22;     // 交差道路とフライオーバーの高さ
const RAMP_HW = 2.8, X_HW = 9.5, LAMP_SP = 34, LAMP_H = 9, PAR = 0.35, DEPTH = 1.8;
/** 交差道路の桁下照明の横位置と、路面からの高さ */
export const UNDER_U = [-6.2, -2.6, 2.6, 6.2], UNDER_H = JCT_H - 1.8 - 0.2;
/** 減速・加速車線が付く範囲（区間中央からの距離）。この範囲では本線の外側の高欄を外す。 */
export function jctAux(sec, ls0) { const t = ls0 - sec.mid; return (t >= -900 && t < -600) || (t >= 600 && t < 900); }

interface Pt { t: number; u: number; y: number; hw: number }
interface Fr { x: number; y: number; z: number; rx: number; rz: number; h: number; a: number; hw: number; t: number; u: number; yr: number; s: number }
interface Deck { kind: 'aux' | 'ramp' | 'cross'; fr: Fr[]; parL: boolean; parR: boolean; lampSide: number[]; lamps: { a: number; u: number }[]; col: number[]; lampKey: string; marks: boolean }

function bezier(p0: number[], p1: number[], p2: number[], p3: number[], n: number, y0: number, y1: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const p = i / n, q = 1 - p; const b0 = q * q * q, b1 = 3 * q * q * p, b2 = 3 * q * p * p, b3 = p * p * p;
    out.push({ t: p0[0] * b0 + p1[0] * b1 + p2[0] * b2 + p3[0] * b3, u: p0[1] * b0 + p1[1] * b1 + p2[1] * b2 + p3[1] * b3, y: lerp(y0, y1, p * p * (3 - 2 * p)), hw: RAMP_HW }); }
  return out;
}
/** 通過点をなめらかにつなぐ（Catmull-Rom）。高さと幅も同じ補間で求める。 */
function spline(w: Pt[], per = 10): Pt[] {
  const out: Pt[] = []; const g = (i: number) => w[Math.max(0, Math.min(w.length - 1, i))];
  for (let i = 0; i < w.length - 1; i++) { const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2);
    const n = Math.max(2, Math.round(Math.hypot(c.t - b.t, c.u - b.u) / per));
    for (let k = 0; k < n; k++) { const p = k / n, p2 = p * p, p3 = p2 * p;
      const cr = (q0: number, q1: number, q2: number, q3: number) => 0.5 * (2 * q1 + (q2 - q0) * p + (2 * q0 - 5 * q1 + 4 * q2 - q3) * p2 + (-q0 + 3 * q1 - 3 * q2 + q3) * p3);
      out.push({ t: cr(a.t, b.t, c.t, d.t), u: cr(a.u, b.u, c.u, d.u), y: cr(a.y, b.y, c.y, d.y), hw: lerp(b.hw, c.hw, p) }); } }
  out.push(w[w.length - 1]); return out;
}

/** 区間のデッキ一式を作って覚えておく。本線の座標が要るので、先に区間の中心部まで道路を生成する。 */
export function jctPlan(sec) {
  if (sec.jct) return sec.jct;
  ensurePath(sec.start + sec.mid + 1150);
  const psi = (sec.phase / 6.2832 - 0.5) * 0.3;                    // 交差道路の斜めの度合い
  const c = [Math.sin(psi), Math.cos(psi)], n = [Math.cos(psi), -Math.sin(psi)];   // 交差道路の向きと、その法線（+t 側）
  const X = (d: number, o: number) => [c[0] * d + n[0] * o, c[1] * d + n[1] * o];
  const xKey = ['sodium', 'warm', 'white'][Math.floor(sec.phase * 7) % 3];
  const list: { kind: Deck['kind']; pts: Pt[]; parL: boolean; parR: boolean; lampSide: number[]; lampKey: string }[] = [];

  // 交差道路
  { const pts: Pt[] = []; for (let d = -1000; d <= 1000; d += 20) { const p = X(d, 0); pts.push({ t: p[0], u: p[1], y: JCT_H, hw: X_HW }); }
    list.push({ kind: 'cross', pts, parL: true, parR: true, lampSide: [-1, 1], lampKey: xKey }); }
  // 四隅のランプ: 本線の外側から分かれ、交差道路の縁に沿って合流する
  for (const sT of [-1, 1]) for (const sU of [-1, 1]) {
    const p3 = X(sU * 300, sT * 12.3), p2 = X(sU * 130, sT * 12.3);
    const pts = bezier([sT * 600, sU * 12.4], [sT * 270, sU * 12.4], p2, p3, 56, 0, JCT_H);
    for (let d = 320; d <= 420; d += 20) { const hw = lerp(RAMP_HW, 0.4, (d - 300) / 120); const p = X(sU * d, sT * (X_HW + hw)); pts.push({ t: p[0], u: p[1], y: JCT_H, hw }); }
    if (sT * sU < 0) pts.reverse();      // 進行方向（左側通行）にそろえる: 左手前と右奥は本線→交差、ほかは交差→本線
    list.push({ kind: 'ramp', pts, parL: true, parR: true, lampSide: [sT * sU > 0 ? -1 : 1], lampKey: sec.lamp });
  }
  // フライオーバー: 本線の脇を登り、本線と交差道路の上を斜めに渡って反対側へ降りる（点対称に2本）
  for (const m of [1, -1]) {
    const far = (d: number, o: number, y: number, hw = RAMP_HW): Pt => { const p = X(d, o); return { t: p[0], u: p[1], y, hw }; };
    const w: Pt[] = [
      { t: -470, u: -13.3, y: 0.5, hw: 0.4 }, { t: -410, u: -13.3, y: 2.6, hw: RAMP_HW }, { t: -300, u: -13.3, y: 11.5, hw: RAMP_HW }, { t: -160, u: -13.3, y: 21, hw: RAMP_HW },
      { t: -80, u: -4, y: JCT_H2, hw: RAMP_HW }, { t: -25, u: 22, y: JCT_H2, hw: RAMP_HW }, { t: 8, u: 70, y: JCT_H2, hw: RAMP_HW },
      far(140, 18.5, 21), far(300, 18.5, 13.5), far(440, 18.5, JCT_H), far(560, X_HW + RAMP_HW, JCT_H), far(700, X_HW + 0.4, JCT_H, 0.4),
    ];
    const pts = spline(w).map(p => ({ t: p.t * m, u: p.u * m, y: p.y, hw: p.hw }));
    list.push({ kind: 'ramp', pts, parL: true, parR: true, lampSide: [-1], lampKey: sec.lamp });
  }
  // 減速・加速車線: 本線の外側に付く。端の100mで幅を絞る
  for (const sT of [-1, 1]) for (const sU of [-1, 1]) {
    const pts: Pt[] = [];
    for (let t = -900; t <= -600; t += 10) { const e = lerp(9.95, 15.2, sstep(-900, -800, t)); pts.push({ t, u: sU * (9.6 + e) / 2, y: 0, hw: (e - 9.6) / 2 }); }
    // sT<0: 手前側（t=-900→-600）、sT>0: 奥側（t=600→900）。奥側は並びを逆にして進行方向へ
    const q = sT < 0 ? pts : pts.map(p => ({ ...p, t: -p.t })).reverse();
    list.push({ kind: 'aux', pts: q, parL: sU < 0, parR: sU > 0, lampSide: [], lampKey: sec.lamp });
  }

  const s0 = sec.start + sec.mid, f: any = {};
  const decks: Deck[] = list.map(d => {
    const fr: Fr[] = d.pts.map(p => { frameAt(s0 + p.t, f); return { x: f.x + f.rx * p.u, y: f.y + p.y, z: f.z + f.rz * p.u, rx: 1, rz: 0, h: 0, a: 0, hw: p.hw, t: p.t, u: p.u, yr: p.y, s: s0 + p.t }; });
    for (let i = 0; i < fr.length; i++) { const a = fr[Math.max(0, i - 1)], b = fr[Math.min(fr.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      fr[i].rx = -dz / L; fr[i].rz = dx / L; fr[i].h = Math.atan2(dx, -dz); if (i) fr[i].a = fr[i - 1].a + Math.hypot(fr[i].x - fr[i - 1].x, fr[i].z - fr[i - 1].z); }
    // 街灯: 一定の道のりごとに、指定の側の縁へ
    const lamps: { a: number; u: number }[] = []; const len = fr[fr.length - 1].a;
    if (d.kind === 'cross') { for (let a = 10; a < len; a += 20) { if (Math.abs(Math.abs(a - len / 2) - 60) < 42) continue; lamps.push({ a, u: (Math.round(a / 20) % 2 ? 1 : -1) * (X_HW - 2.6) }); } }
    else for (const side of d.lampSide) for (let a = LAMP_SP * 0.6; a < len - 8; a += LAMP_SP) lamps.push({ a, u: side * 0.2 });
    return { kind: d.kind, fr, parL: d.parL, parR: d.parR, lampSide: d.lampSide, lamps, col: LAMP_COLORS[d.lampKey], lampKey: d.lampKey, marks: d.kind !== 'cross' };
  });
  // 建物を避けさせるための線分（40m 程度に間引く）
  const obst: number[][] = [];
  for (const d of decks) { if (d.kind === 'aux') continue; const st = Math.max(1, Math.round(40 / ((d.fr[d.fr.length - 1].a / (d.fr.length - 1)) || 1)));
    for (let i = 0; i < d.fr.length - 1; i += st) { const a = d.fr[i], b = d.fr[Math.min(d.fr.length - 1, i + st)]; obst.push([a.x, a.z, b.x, b.z, Math.max(a.hw, b.hw) + 9]); } }
  // 橋脚: 下に本線やほかのデッキがある所には立てない
  const piers: { d: Deck; i: number }[] = [];
  for (const d of decks) { if (d.kind === 'aux') continue; const sp = d.kind === 'cross' ? 40 : 36; let next = sp * 0.5;
    for (let i = 1; i < d.fr.length - 1; i++) { const p = d.fr[i]; if (p.a < next) continue; next += sp;
      if (p.yr < 3.2 || p.hw < 2 || Math.abs(p.u) < 12.5 + (d.kind === 'cross' ? 2 : 0)) continue;
      let ok = true;
      for (const o of decks) { if (o === d || !ok) continue; for (const q of o.fr) { if (q.yr < p.yr - 1 && Math.hypot(q.t - p.t, q.u - p.u) < q.hw + 2.2) { ok = false; break; } } }
      if (ok) piers.push({ d, i }); } }
  return (sec.jct = { decks, obst, piers, psi, xKey });
}

/** デッキの一部（点 k0..k1）を掃引して、路面・高欄・裏面の形状を作る */
function deckGeo(d: Deck, k0: number, k1: number, sec, strips: number[][], bake: number) {
  const ns = k1 - k0 + 1, nv = strips.length * ns * 2;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), bk = new Float32Array(nv * 3), idx: number[] = []; let v = 0; const L = [0, 0, 0];
  for (const st of strips) {
    const base = v;
    for (let j = 0; j < ns; j++) { const a = d.fr[k0 + j];
      // 帯の両端: u = 係数 × 半幅 + ずらし。高欄のない側では路面を縁まで延ばす
      const ue = (cf: number, o: number) => { let u = cf * a.hw + o; if (cf > 0 && o < 0) u = Math.max(u, -a.hw); if (cf < 0 && o > 0) u = Math.min(u, a.hw); return u; };
      const u1 = ue(st[0], st[1]), y1 = st[2], u2 = ue(st[3], st[4]), y2 = st[5]; const du = u2 - u1, dy = y2 - y1, Ln = Math.hypot(du, dy) || 1; const nu = -dy / Ln, ny = du / Ln;
      for (let e = 0; e < 2; e++) { const u = e ? u2 : u1, y = e ? y2 : y1;
        pos[v * 3] = a.x + a.rx * u; pos[v * 3 + 1] = a.y + y; pos[v * 3 + 2] = a.z + a.rz * u;
        nor[v * 3] = a.rx * nu; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = a.rz * nu;
        uv[v * 2] = (e ? Ln : 0) * 0.25; uv[v * 2 + 1] = a.a * 0.25;
        if (bake > 0) { deckLight(d, a, u + nu * 0.3, y + ny * 0.3, sec, L); bk[v * 3] = L[0] * bake; bk[v * 3 + 1] = L[1] * bake; bk[v * 3 + 2] = L[2] * bake; }
        v++; } }
    for (let j = 0; j < ns - 1; j++) { const A = base + j * 2, B = A + 1, C = A + 2, D = A + 3; idx.push(A, B, C, B, D, C); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('bake', new THREE.BufferAttribute(bk, 3));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}
const _l = [0, 0, 0];
/** デッキ上の点が受ける光: 自分の街灯 + 近くにある本線の街灯 */
function deckLight(d: Deck, a: Fr, u: number, y: number, sec, out: number[]) {
  out[0] = out[1] = out[2] = 0.018; let e = 0;
  for (const lp of d.lamps) { const ds = a.a - lp.a; if (ds > 60 || ds < -60) continue; const du = u - lp.u, dy = y - LAMP_H; e += Math.min(2.0, 1.6 * LAMP_H * LAMP_H * LAMP_H / Math.pow(ds * ds + du * du + dy * dy + 1, 1.5)); }
  out[0] += d.col[0] * e; out[1] += d.col[1] * e; out[2] += d.col[2] * e;
  const um = a.u + u * Math.cos(a.h - frameH(a)), near = Math.abs(a.u) < 45 && (a.yr + y < 9.5 || y < 0);   // 本線に近く、本線の街灯より低い所だけ
  if (d.kind === 'cross' && y < 0 && Math.abs(a.u) < 14) { const k = 0.9 * sstep(14, 8, Math.abs(a.u)); out[0] += sec.col[0] * k; out[1] += sec.col[1] * k; out[2] += sec.col[2] * k; }
  if (near) { lightAt(a.s, um, a.yr + y, _l); const k = d.kind === 'aux' ? 1 : sstep(45, 20, Math.abs(a.u)); out[0] += _l[0] * k; out[1] += _l[1] * k; out[2] += _l[2] * k; }
  return out;
}
const _fh: any = {};
function frameH(a: Fr) { return frameAt(a.s, _fh).h; }

/** チャンク ci に入る分の JCT を作る */
export function buildJct(g: THREE.Group, own: any[], sec, ci: number, mesh: (geo: THREE.BufferGeometry, mat: THREE.Material) => void) {
  const plan = jctPlan(sec); const inCh = (s: number) => Math.floor(s / CH) === ci;
  const posts: THREE.Matrix4[] = [], heads = new Map<string, THREE.Matrix4[]>(), hp: number[] = [], hc: number[] = [];
  for (const d of plan.decks as Deck[]) {
    // このチャンクに入る区間を、連続した範囲ごとに取り出す
    let k0 = -1;
    for (let k = 0; k <= d.fr.length - 1; k++) {
      const inside = k < d.fr.length - 1 && inCh((d.fr[k].s + d.fr[k + 1].s) / 2);
      if (inside && k0 < 0) k0 = k;
      if (!inside && k0 >= 0) { run(d, k0, k); k0 = -1; }
    }
    for (const lp of d.lamps) { const fr = at(d, lp.a); if (!inCh(fr.s)) continue;
      const side = d.kind === 'cross' ? Math.sign(lp.u) : (d.lampSide[0] || 1);
      const edge = side * (fr.hw - 0.17);
      posts.push(propM(fr, edge, 0, 1, 1, 1, side < 0 ? 0 : Math.PI).clone());
      const hu = edge - side * 2.5; if (!heads.has(d.lampKey)) heads.set(d.lampKey, []);
      heads.get(d.lampKey)!.push(propM(fr, hu, LAMP_H - 0.1, 1, 1, 1).clone());
      hp.push(fr.x + fr.rx * hu, fr.y + LAMP_H - 0.25, fr.z + fr.rz * hu); hc.push(d.col[0] * 0.5, d.col[1] * 0.5, d.col[2] * 0.5); }
  }
  function run(d: Deck, k0: number, k1: number) {
    const pl = d.parL ? PAR : 0, pr = d.parR ? PAR : 0;
    mesh(deckGeo(d, k0, k1, sec, [[-1, pl, 0, 1, -pr, 0]], 1), MAT.roadPlain);
    const conc: number[][] = [];
    if (d.parR) conc.push([1, -PAR, 0, 1, -PAR, 1.0], [1, -PAR, 1.0, 1, 0, 1.0], [1, 0, 1.0, 1, 0, -DEPTH]);
    if (d.parL) conc.push([-1, PAR, 1.0, -1, PAR, 0], [-1, 0, 1.0, -1, PAR, 1.0], [-1, 0, -DEPTH, -1, 0, 1.0]);
    if (conc.length) mesh(deckGeo(d, k0, k1, sec, conc, 1), MAT.concrete);
    if (d.marks) { const mk: number[][] = []; if (d.parR) mk.push([1, -1.0, 0.02, 1, -0.84, 0.02]); if (d.parL) mk.push([-1, 0.84, 0.02, -1, 1.0, 0.02]); if (mk.length) mesh(deckGeo(d, k0, k1, sec, mk, 1), MAT.mark); }
    if (d.kind !== 'aux') mesh(deckGeo(d, k0, k1, sec, [[1, 0, -DEPTH, -1, 0, -DEPTH]], 0.55), MAT.under);
  }
  if (posts.length) { const m = inst(GEO.lampPost, MAT.metal, posts); m.matrixAutoUpdate = false; g.add(m); }
  for (const [k, list] of heads) { const m = inst(GEO.lampHead, MAT.lampHead[k], list); m.matrixAutoUpdate = false; g.add(m); }
  if (hp.length) g.add(makeHalos(hp, hc, 3.4));
  // 橋脚
  const cols: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
  for (const p of plan.piers) { const fr = p.d.fr[p.i]; if (!inCh(fr.s)) continue; const top = fr.y - DEPTH;
    if (p.d.kind === 'cross') { cols.push(propM(fr, 0, 0, 2.6, top - 1.6, 2.6, 0, true).clone()); caps.push(propM(fr, 0, top - 1.6, 17, 1.6, 2.4, 0, true).clone()); }
    else cols.push(propM(fr, 0, 0, 1.9, top, 1.9, 0, true).clone()); }
  for (const list of [cols, caps]) { const m = inst(unitBox, MAT.darkConcrete, list); if (m) { m.matrixAutoUpdate = false; g.add(m); } }
  // 交差道路の裏面に付く照明（真下は街灯を立てられないので、桁下から照らす）
  if (inCh(sec.start + sec.mid)) { const fx: THREE.Matrix4[] = []; const f: any = frameAt(sec.start + sec.mid, {});
    for (const u of UNDER_U) for (const dz of [-5, 5]) fx.push(propM(f, u, JCT_H - DEPTH - 0.16, 0.5, 0.14, 1.4).clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, dz / 1.4)));
    const m = inst(GEO.dot, MAT.tunnelLamp[sec.lamp], fx); m.matrixAutoUpdate = false; g.add(m); }
  // 交差道路を行き交う車の灯り
  if (inCh(sec.start + sec.mid)) { const p = crossTraffic(plan.decks[0], sec); own.push(p.material); g.add(p); }
}
/** 道のり a の位置の枠（点の間を補間） */
function at(d: Deck, a: number): Fr {
  const fr = d.fr; let i = 0; while (i < fr.length - 2 && fr[i + 1].a < a) i++;
  const p = fr[i], q = fr[i + 1], k = Math.max(0, Math.min(1, (a - p.a) / ((q.a - p.a) || 1)));
  return { ...p, x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), z: lerp(p.z, q.z, k), hw: lerp(p.hw, q.hw, k), s: lerp(p.s, q.s, k), a };
}

let carMat: THREE.ShaderMaterial | null = null;
/** 交差道路の車列。位置は頂点シェーダで動かし、見る向きで前照灯と尾灯を出し分ける。 */
function crossTraffic(d: Deck, sec) {
  const a = d.fr[20], b = d.fr[d.fr.length - 21]; const L = Math.hypot(b.x - a.x, b.z - a.z); const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
  const pos: number[] = [], dir: number[] = [], ph: number[] = []; let seed = (sec.id * 7919 + 13) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const way of [1, -1]) for (const lane of [2.6, 6.1]) for (let k = 0; k < 9; k++) {
    const o = -way * lane, st = way > 0 ? a : b;      // 左側通行: 進む向きの左が外側
    const phv = k * L / 9 + rnd() * 60;
    for (const side of [-0.7, 0.7]) { pos.push(st.x + a.rx * (o + side), a.y + 1.3, st.z + a.rz * (o + side)); dir.push(dx * way, dz * way, 17 + lane * 0.6 + (k % 3)); ph.push(phv); }
  }
  const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setAttribute('dir', new THREE.Float32BufferAttribute(dir, 3)); gm.setAttribute('ph', new THREE.Float32BufferAttribute(ph, 1));
  carMat ||= new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uPR: U.pr, uHaze: U.haze, uLen: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 dir; attribute float ph; uniform float uTime; uniform float uPR; uniform float uHaze; uniform float uLen; varying vec3 vC;
      void main(){ float m=mod(ph+uTime*dir.z,uLen); vec3 p=position+vec3(dir.x,0.0,dir.y)*m;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; float d=max(-mv.z,1.0);
        vec3 toCam=normalize(cameraPosition-(modelMatrix*vec4(p,1.0)).xyz); float f=dot(toCam.xz,dir.xy);
        float s=3.2*uPR*clamp(260.0/d,0.6,3.0); gl_PointSize=max(s,1.5*uPR);
        float edge=smoothstep(0.0,60.0,m)*smoothstep(uLen,uLen-60.0,m);
        vC=mix(vec3(1.0,0.08,0.04)*0.8,vec3(1.0,0.93,0.8)*1.5,smoothstep(-0.1,0.1,f))*(0.25+0.75*abs(f))*edge*exp(-pow(d*uHaze*0.7,2.0)); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 p=gl_PointCoord-0.5; float r=dot(p,p)*4.0; gl_FragColor=vec4(vC*exp(-r*3.5)*3.0,1.0); }`,
  });
  const mat = carMat.clone(); mat.uniforms.uTime = U.time; mat.uniforms.uPR = U.pr; mat.uniforms.uHaze = U.haze; mat.uniforms.uLen = { value: L };
  const p = new THREE.Points(gm, mat); p.frustumCulled = false; p.userData.ownMat = mat; return p;
}
