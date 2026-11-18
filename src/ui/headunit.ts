/* ============================================================
   ヘッドユニット（設定画面）
   センターコンソールのカーナビ／オーディオ画面として、設定レジストリの内容をそのまま並べる。
   Tab キーで開閉。開いている間も走行は続く。
   ============================================================ */
import { radio, sound } from '../audio/index';
import { ParamDef, Settings, settings } from '../core/settings';
import { actions } from './params';

const TABS: { id: string; jp: string }[] = [
  { id: 'DRIVE', jp: '走行' }, { id: 'VIEW', jp: '映像' }, { id: 'CITY', jp: '街' }, { id: 'WEATHER', jp: '天気' },
  { id: 'RADIO', jp: 'ラジオ' }, { id: 'SOUND', jp: '環境音' }, { id: 'TRIP', jp: '旅' }, { id: 'MEMORY', jp: '保存' },
];
let root: HTMLElement, body: HTMLElement, tab = 'RADIO', showAdvanced = false, open = false;
const bound = new Map<string, (v: any) => void>();     // 項目 id → 表示を更新する関数

const h = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
function fmt(d: ParamDef, v: any) {
  if (d.type !== 'range') return String(v);
  const dec = d.step! >= 1 ? 0 : d.step! >= 0.1 ? 1 : d.step! >= 0.01 ? 2 : d.step! >= 0.001 ? 3 : 4;
  return (d.unit === 'x' ? '×' : '') + Number(v).toFixed(dec);
}

function row(d: ParamDef) {
  const r = h('div', 'hu-row'); const lab = h('div', 'hu-lab', d.label); r.append(lab);
  const ctl = h('div', 'hu-ctl'); r.append(ctl);
  const reset = h('button', 'hu-reset', '↺') as HTMLButtonElement; reset.title = '既定値に戻す';
  reset.onclick = () => { settings.reset(d.id); sound.click(); };
  const mark = () => { reset.style.visibility = settings.isDefault(d.id) ? 'hidden' : 'visible'; };
  if (d.type === 'range') {
    const inp = h('input') as HTMLInputElement; inp.type = 'range'; inp.min = String(d.min); inp.max = String(d.max); inp.step = String(d.step);
    const val = h('div', 'hu-val');
    const paint = (v: number) => { inp.style.setProperty('--p', ((v - d.min!) / (d.max! - d.min!) * 100).toFixed(1) + '%'); };
    inp.oninput = () => settings.set(d.id, parseFloat(inp.value));
    inp.onchange = () => sound.click();
    ctl.append(inp, val);
    bound.set(d.id, v => { inp.value = String(v); val.textContent = fmt(d, v); paint(v); mark(); });
  } else if (d.type === 'toggle') {
    const b = h('button', 'hu-switch') as HTMLButtonElement; b.onclick = () => { settings.set(d.id, !settings.get<boolean>(d.id)); sound.click(true); };
    ctl.append(b); bound.set(d.id, v => { b.classList.toggle('on', !!v); b.textContent = v ? 'ON' : 'OFF'; mark(); });
  } else {
    const seg = h('div', 'hu-seg'); const btns = d.options!.map(o => { const b = h('button', '', o.label) as HTMLButtonElement; b.onclick = () => { settings.set(d.id, o.value); sound.click(true); }; seg.append(b); return b; });
    ctl.append(seg); bound.set(d.id, v => { d.options!.forEach((o, i) => btns[i].classList.toggle('on', o.value === v)); mark(); });
  }
  r.append(reset); bound.get(d.id)!(settings.get(d.id));
  return r;
}

function renderMemory() {
  const sec = (title: string) => { body.append(h('div', 'hu-sec', title)); const w = h('div', 'hu-chips'); body.append(w); return w; };
  const pre = sec('プリセット');
  for (const p of settings.presets()) {
    const c = h('button', 'hu-chip' + (p.builtin ? '' : ' user'), p.name) as HTMLButtonElement;
    c.onclick = () => { settings.applyPreset(p.values); sound.click(true); toast(`「${p.name}」を呼び出しました`); };
    if (!p.builtin) { const x = h('span', 'hu-x', '×'); x.title = '削除'; x.onclick = e => { e.stopPropagation(); settings.deletePreset(p.name); render(); }; c.append(x); }
    pre.append(c);
  }
  const save = sec('いまの設定を保存');
  const name = h('input', 'hu-name') as HTMLInputElement; name.placeholder = 'プリセット名'; name.maxLength = 16;
  name.onkeydown = e => e.stopPropagation();
  const sb = h('button', 'hu-chip', '保存') as HTMLButtonElement; sb.onclick = () => { const n = name.value.trim(); if (!n) { name.focus(); return; } settings.savePreset(n); sound.click(true); render(); toast(`「${n}」を保存しました`); };
  save.append(name, sb);
  const share = sec('共有とリセット');
  const ub = h('button', 'hu-chip', '設定入りのURLをコピー') as HTMLButtonElement;
  ub.onclick = async () => { const u = new URL(location.href); u.search = ''; const p = settings.shareParam(); if (p !== Settings.encode({})) u.searchParams.set('p', p);
    try { await navigator.clipboard.writeText(u.toString()); toast('URLをコピーしました'); } catch { prompt('このURLをコピーしてください', u.toString()); } };
  const rb = h('button', 'hu-chip warn', 'すべて既定値に戻す') as HTMLButtonElement; rb.onclick = () => { settings.resetAll(); sound.click(); toast('すべて既定値に戻しました'); };
  share.append(ub, rb);
  const n = Object.keys(settings.diff()).length;
  body.append(h('div', 'hu-note', n ? `既定値から ${n} 項目を変更中。設定はこのブラウザに自動で保存されます。` : 'すべて既定値です。設定はこのブラウザに自動で保存されます。'));
}

function render() {
  bound.clear(); body.innerHTML = '';
  root.querySelectorAll('.hu-tab').forEach(e => e.classList.toggle('on', (e as HTMLElement).dataset.tab === tab));
  (root.querySelector('.hu-title') as HTMLElement).textContent = TABS.find(t => t.id === tab)!.jp;
  const foot = root.querySelector('.hu-foot') as HTMLElement; foot.style.display = tab === 'MEMORY' ? 'none' : '';
  if (tab === 'MEMORY') { renderMemory(); return; }
  if (tab === 'RADIO') {
    const now = h('div', 'hu-now'); const t = h('div', 'hu-now-t'); const s = h('div', 'hu-now-s'); const nb = h('button', 'hu-chip', '次の曲 ▶▶') as HTMLButtonElement;
    nb.onclick = () => { actions.nextSong(); sound.click(true); };
    const upd = () => { const st = radio?.station(); t.textContent = st && st.id !== 'off' ? (radio!.title || '…') : 'RADIO OFF'; s.textContent = st ? `${st.freq}  ${st.name}` : ''; };
    upd(); nowTimer = upd; const txt = h('div'); txt.append(t, s); now.append(txt, nb); body.append(now);
  } else nowTimer = null;
  let hidden = 0;
  for (const [group, defs] of settings.groups()) {
    const [tb, sub] = group.split('/'); if (tb !== tab) continue;
    const vis = defs.filter(d => showAdvanced || !d.advanced); hidden += defs.length - vis.length; if (!vis.length) continue;
    if (sub) body.append(h('div', 'hu-sec', sub));
    for (const d of vis) body.append(row(d));
  }
  const adv = root.querySelector('.hu-adv') as HTMLElement; adv.style.display = hidden || showAdvanced ? '' : 'none'; adv.textContent = showAdvanced ? '詳細を隠す' : `詳細を表示（${hidden}）`;
}
let nowTimer: (() => void) | null = null, toastT: any;
function toast(msg: string) { const t = root.querySelector('.hu-toast') as HTMLElement; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

export function isHeadUnitOpen() { return open; }
export function toggleHeadUnit(on = !open) {
  open = on; root.classList.toggle('closed', !on); document.body.classList.toggle('hu-open', on);
  if (on) { render(); sound.click(true); } else sound.click();
}

export function makeHeadUnit() {
  root = h('div', 'closed'); root.id = 'hu';
  const rail = h('div', 'hu-rail');
  for (const t of TABS) { const b = h('button', 'hu-tab') as HTMLButtonElement; b.dataset.tab = t.id; b.append(h('span', 'en', t.id), h('span', 'jp', t.jp)); b.onclick = () => { tab = t.id; sound.click(true); render(); body.scrollTop = 0; }; rail.append(b); }
  const main = h('div', 'hu-main'); const head = h('div', 'hu-head');
  const clock = h('div', 'hu-clock'); const close = h('button', 'hu-close', '閉じる  Tab') as HTMLButtonElement; close.onclick = () => toggleHeadUnit(false);
  head.append(h('div', 'hu-brand', 'NIGHT EXPRESSWAY'), h('div', 'hu-title'), clock, close);
  body = h('div', 'hu-body');
  const foot = h('div', 'hu-foot');
  const rt = h('button', 'hu-chip', 'このタブを既定値に戻す') as HTMLButtonElement; rt.onclick = () => { settings.resetGroup(tab); sound.click(); toast('このタブを既定値に戻しました'); };
  const adv = h('button', 'hu-chip hu-adv') as HTMLButtonElement; adv.onclick = () => { showAdvanced = !showAdvanced; render(); };
  foot.append(rt, adv);
  main.append(head, body, foot, h('div', 'hu-toast'));
  root.append(rail, main); document.body.append(root);
  // 設定画面の上での操作は、走行画面側のキー操作やドラッグに渡さない
  for (const ev of ['pointerdown', 'wheel', 'mousemove']) root.addEventListener(ev, e => e.stopPropagation());
  settings.onChange((id, v) => { if (open) bound.get(id)?.(v); });
  setInterval(() => { if (!open) return; const d = new Date(); clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; nowTimer?.(); }, 500);
}
