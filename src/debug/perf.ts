/* フレーム時間の計測。引っかかり（単発の長いフレーム）を数値で捉える。 */
const N = 600;
const frameMs = new Float32Array(N);   // フレーム間隔（表示の滑らかさ）
const cpuMs = new Float32Array(N);     // update+render にかかった時間
let fi = 0, fn = 0, ci = 0, lastFrame = 0;

const marks: Record<string, number> = {}; let markT = 0;
export const perf = {
  /** 直前の mark からの経過を name に積む（指数移動平均）。フレーム内の内訳を見るためのもの。 */
  mark(name: string) { const n = performance.now(); if (name) marks[name] = (marks[name] ?? 0) * 0.97 + (n - markT) * 0.03; markT = n; },
  marks,
  chunkLast: 0, chunkMax: 0, chunkCount: 0, hitches: 0, frames: 0,
  frame(nowMs: number) {
    if (lastFrame) { const d = nowMs - lastFrame; frameMs[fi] = d; fi = (fi + 1) % N; fn = Math.min(N, fn + 1); this.frames++; if (d > 33.4) this.hitches++; }
    lastFrame = nowMs;
  },
  cpu(ms: number) { cpuMs[ci] = ms; ci = (ci + 1) % N; },
  chunk(ms: number) { this.chunkLast = ms; this.chunkMax = Math.max(this.chunkMax, ms); this.chunkCount++; },
  reset() { fi = fn = ci = 0; lastFrame = 0; frameMs.fill(0); cpuMs.fill(0); this.chunkLast = this.chunkMax = this.chunkCount = this.hitches = this.frames = 0; },
  stats() {
    const n = fn; if (!n) return { n: 0, fps: 0, avg: 0, p50: 0, p99: 0, max: 0, cpuAvg: 0, cpuMax: 0, chunkLast: 0, chunkMax: 0, chunkCount: 0, hitches: 0, frames: 0 };
    const a = Array.from(frameMs.subarray(0, n)).sort((x, y) => x - y);
    const c = Array.from(cpuMs.subarray(0, n));
    const avg = a.reduce((s, v) => s + v, 0) / n;
    return { n, fps: 1000 / avg, avg, p50: a[n >> 1], p99: a[Math.min(n - 1, Math.floor(n * 0.99))], max: a[n - 1],
      cpuAvg: c.reduce((s, v) => s + v, 0) / n, cpuMax: Math.max(...c),
      chunkLast: this.chunkLast, chunkMax: this.chunkMax, chunkCount: this.chunkCount, hitches: this.hitches, frames: this.frames };
  },
};

let el: HTMLElement | null = null, shown = false, tick = 0;
export function togglePerf(on = !shown) {
  shown = on; el = el || document.getElementById('perfInfo');
  if (el) el.style.display = on ? 'block' : 'none';
}
export function updatePerfHud(dt: number) {
  if (!shown || !el) return;
  tick -= dt; if (tick > 0) return; tick = 0.5;
  const s = perf.stats(); const f = (v: number) => v.toFixed(1).padStart(5);
  el.textContent =
`FPS ${s.fps.toFixed(0).padStart(3)}   フレーム間隔 平均${f(s.avg)} / p99${f(s.p99)} / 最大${f(s.max)} ms
処理時間 平均${f(s.cpuAvg)} / 最大${f(s.cpuMax)} ms   33ms超 ${s.hitches} 回 / ${s.frames} フレーム
チャンク生成 直近${f(s.chunkLast)} / 最大${f(s.chunkMax)} ms (${s.chunkCount} 個)`;
}
