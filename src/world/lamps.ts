/* 自車の近くにある照明の列挙。車内を流れる光やボンネットの映り込みに使う。 */
import { frameAt, secAt } from './path';

export interface Lamp { s: number; u: number; h: number; col: number[]; I: number; x: number; y: number; z: number; e: number }
const _fr: any = {};
const pool: Lamp[] = [];
let used = 0;
function take(): Lamp { if (used >= pool.length) pool.push({ s: 0, u: 0, h: 0, col: [1, 1, 1], I: 0, x: 0, y: 0, z: 0, e: 0 }); return pool[used++]; }

/**
 * 位置 s 付近の照明を、道路座標（s:進行方向, u:横, h:路面からの高さ）とワールド座標で返す。
 * 返り値の配列と要素は次回呼び出しで再利用される。
 */
export function lampsNear(s: number, behind = 40, ahead = 150): Lamp[] {
  used = 0; const out: Lamp[] = [];
  const push = (ls: number, u: number, h: number, col: number[], I: number) => {
    const f = frameAt(ls, _fr); const L = take();
    L.s = ls; L.u = u; L.h = h; L.col = col; L.I = I; L.x = f.x + f.rx * u; L.y = f.y + h; L.z = f.z + f.rz * u; L.e = 0; out.push(L);
  };
  // トンネル内: 4m 間隔・左右2列
  for (let k = Math.ceil((s - 10) / 4); k * 4 <= s + 56; k++) {
    const ls = k * 4; if (ls < 0) continue; const sec = secAt(ls), l = ls - sec.start;
    if (sec.type === 'tunnel' && l >= sec.encStart && l < sec.encEnd) { push(ls, -10.12, 5.55, sec.col, 0.3); push(ls, 0.12, 5.55, sec.col, 0.3); }
  }
  // 街灯: 区間ごとの配列（間隔・左右・高さ）に従う
  for (let k = Math.ceil((s - behind) / 10); k * 10 <= s + ahead; k++) {
    const ls = k * 10; if (ls < 0) continue; const sec = secAt(ls), l = ls - sec.start;
    if (sec.type === 'tunnel' && l >= sec.encStart - 20 && l < sec.encEnd + 20) continue;
    for (const f of sec.fam) { if ((((ls - f.off) % f.sp) + f.sp) % f.sp === 0) push(ls, f.u, f.h, sec.col, f.I); }
  }
  return out;
}
