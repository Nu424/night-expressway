/* ============================================================
   自動解像度調整
   GPU時間（取れる環境）またはフレーム間隔から、内部解像度の倍率を上下させる。
   解像度の切替は描画先の作り直しを伴うので、頻繁には行わない。
   ============================================================ */
import { renderer } from './renderer';

const MIN_SCALE = 0.5, MAX_SCALE = 1.0, STEP = 0.1;
const WINDOW = 1.5;          // 判定に使う区間(秒)
const TARGET_MS = 16.7;      // 60Hz を上限の目標とする（高リフレッシュレートは追わない）

let ext: any = null, gl: WebGL2RenderingContext | null = null, query: WebGLQuery | null = null;
const pending: WebGLQuery[] = [];
let gpuSum = 0, gpuN = 0, frameSum = 0, frameN = 0, minFrame = 1e9, acc = 0;
let ceiling = MAX_SCALE, ceilingUntil = 0, stableFor = 0, lastRaise = -1e9, clock = 0;

export const autoscale = {
  enabled: true, scale: 1, gpuMs: 0, hasGpuTimer: false,
  /** 輪郭処理が「自動」のとき、MSAA を使ってよいか。重いと分かったら false にして FXAA へ落とす。 */
  aaAuto: true, msaaOK: true,
  onChange: (s: number) => {},
  onTier: () => {},
};
const HINT_KEY = 'ne.gfx.hint.v1';
/** 前回の結果を覚えておき、次回は最初から合った設定で始める */
export function loadHint() { try { const h = JSON.parse(localStorage.getItem(HINT_KEY) || 'null'); if (h) { autoscale.msaaOK = !!h.msaa; if (typeof h.scale === 'number') autoscale.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, h.scale)); } } catch { /* 無視 */ } }
function saveHint() { try { localStorage.setItem(HINT_KEY, JSON.stringify({ msaa: autoscale.msaaOK, scale: autoscale.scale })); } catch { /* 無視 */ } }

export function initAutoscale() {
  gl = renderer.getContext() as WebGL2RenderingContext;
  ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  autoscale.hasGpuTimer = !!ext;
}
export function gpuBegin() {
  if (!ext || !gl || query) return;
  query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query!);
}
export function gpuEnd() {
  if (!ext || !gl || !query) return;
  gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); query = null;
  while (pending.length) {
    const q = pending[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (pending.length > 8) { gl.deleteQuery(pending.shift()!); continue; } break; }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (!disjoint) { const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gpuSum += ms; gpuN++; }
    gl.deleteQuery(q); pending.shift();
  }
}

function setScale(s: number) {
  s = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)) * 20) / 20;
  if (s === autoscale.scale) return false;
  autoscale.scale = s; autoscale.onChange(s); if (autoscale.enabled) saveHint(); return true;
}
export function forceScale(s: number) { autoscale.scale = -1; setScale(s); stableFor = 0; }

/** 毎フレーム呼ぶ。dtMs は実際のフレーム間隔。 */
export function autoscaleTick(dtMs: number) {
  clock += dtMs / 1000;
  if (dtMs < 200) { frameSum += dtMs; frameN++; minFrame = Math.min(minFrame, dtMs); }
  acc += dtMs / 1000;
  if (acc < WINDOW) return;
  const frameAvg = frameN ? frameSum / frameN : 0, gpuAvg = gpuN ? gpuSum / gpuN : 0;
  autoscale.gpuMs = gpuAvg;
  acc = 0; frameSum = frameN = gpuSum = gpuN = 0;
  if (!autoscale.enabled || !frameAvg || document.hidden) return;
  if (clock > ceilingUntil) ceiling = MAX_SCALE;

  const s = autoscale.scale;
  // 遅い: フレーム間隔が目標を明確に超えている
  // GPU時間が取れる環境ではそれを主に見る（フレーム間隔だけでは、CPU律速や表示側の上限と区別できない）
  const slow = gpuAvg > 0 ? (gpuAvg > 13.5 && frameAvg > TARGET_MS * 1.1) : frameAvg > TARGET_MS * 1.18;
  if (slow) {
    stableFor = 0;
    // まず MSAA をやめる。内蔵GPUでは解像度を下げるより効く。
    if (autoscale.aaAuto && autoscale.msaaOK) { autoscale.msaaOK = false; saveHint(); autoscale.onTier(); return; }
    // 直前に上げた結果として遅くなったなら、その手前を当面の上限にする
    if (clock - lastRaise < 6) { ceiling = Math.max(MIN_SCALE, s - STEP); ceilingUntil = clock + 90; }
    // 画素数にほぼ比例すると見て、一度に必要な分だけ下げる（下げすぎないよう控えめに）
    const ratio = gpuAvg > 0 ? Math.sqrt(12 / gpuAvg) : Math.sqrt(TARGET_MS / frameAvg);
    setScale(Math.min(s - STEP, s * (0.35 + 0.65 * ratio)));
    return;
  }
  // 余裕がある: 一定時間安定していたら1段上げてみる
  stableFor += WINDOW;
  const headroom = gpuAvg > 0 ? gpuAvg < 9.5 : frameAvg < TARGET_MS * 1.06;
  if (headroom && stableFor >= 6 && s < ceiling) { if (setScale(Math.min(ceiling, s + STEP))) { lastRaise = clock; stableFor = 0; } }
}
