/* ============================================================
   設定レジストリ
   調整可能な値を1か所に登録し、UI・保存・プリセット・リセット・
   URL共有を同じ定義から扱う。
   ============================================================ */
export type ParamValue = number | boolean | string;
export interface ParamDef<T extends ParamValue = ParamValue> {
  id: string;                 // 'post.bloom.strength' のようなドット区切り
  label: string;              // 画面に出す名前
  group: string;              // 'VIEW/レンズ' のような「タブ/小見出し」
  type: 'range' | 'toggle' | 'select';
  default: T;
  min?: number; max?: number; step?: number; unit?: string;
  options?: { value: string; label: string }[];
  advanced?: boolean;         // 「詳細」に畳む項目
  order?: number;             // 同じ小見出しの中での並び（小さいほど上。既定 0）
  apply?: (v: T, prev: T | undefined) => void;
}
export interface Preset { name: string; values: Record<string, ParamValue>; builtin?: boolean }
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const SETTINGS_KEY = 'ne.settings.v1';
const PRESETS_KEY = 'ne.presets.v1';

export class Settings {
  private defs = new Map<string, ParamDef<any>>();
  private values = new Map<string, ParamValue>();
  private applied = new Map<string, ParamValue>();
  private pending: Record<string, ParamValue> = {};   // 保存・URL由来の、まだ定義されていない項目の値
  private listeners = new Set<(id: string, v: ParamValue) => void>();
  private builtins: Preset[] = [];
  private saveTimer: any = null;
  private ready = false;

  constructor(private store: KV | null = null, urlParam: string | null = null) {
    if (store) {
      try { const raw = JSON.parse(store.getItem(SETTINGS_KEY) || 'null'); if (raw && raw.v === 1) Object.assign(this.pending, raw.values); } catch { /* 壊れた保存は無視 */ }
    }
    if (urlParam) Object.assign(this.pending, Settings.decode(urlParam));
  }

  define<T extends ParamValue>(def: ParamDef<T>) {
    if (this.defs.has(def.id)) throw new Error('duplicate param: ' + def.id);
    this.defs.set(def.id, def);
    const pre = this.pending[def.id];
    this.values.set(def.id, pre !== undefined ? this.sanitize(def, pre) : def.default);
    if (this.ready) this.applyOne(def.id);
    return { get: () => this.get<T>(def.id), set: (v: T) => this.set(def.id, v) };
  }

  private sanitize(def: ParamDef<any>, v: any): ParamValue {
    if (def.type === 'range') {
      let n = Number(v); if (!Number.isFinite(n)) return def.default;
      if (def.min !== undefined) n = Math.max(def.min, n);
      if (def.max !== undefined) n = Math.min(def.max, n);
      return n;
    }
    if (def.type === 'toggle') return v === true || v === 'true' || v === 1;
    return def.options && def.options.some(o => o.value === v) ? v : def.default;
  }

  get<T extends ParamValue = ParamValue>(id: string): T {
    if (!this.defs.has(id)) throw new Error('unknown param: ' + id);
    return this.values.get(id) as T;
  }
  def(id: string) { return this.defs.get(id); }
  list() { return [...this.defs.values()]; }
  groups() { const m = new Map<string, ParamDef[]>(); for (const d of this.defs.values()) { if (!m.has(d.group)) m.set(d.group, []); m.get(d.group)!.push(d); }
    for (const a of m.values()) a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)); return m; }

  set(id: string, v: ParamValue, save = true) {
    const def = this.defs.get(id); if (!def) throw new Error('unknown param: ' + id);
    const nv = this.sanitize(def, v);
    if (this.values.get(id) === nv) return;
    this.values.set(id, nv);
    if (this.ready) this.applyOne(id);
    for (const fn of this.listeners) fn(id, nv);
    if (save) this.scheduleSave();
  }
  /** select 型を次の選択肢へ進める */
  cycle(id: string) {
    const def = this.defs.get(id)!; const o = def.options!; const i = o.findIndex(q => q.value === this.values.get(id));
    this.set(id, o[(i + 1) % o.length].value);
  }

  private applyOne(id: string) {
    const def = this.defs.get(id)!; const v = this.values.get(id)!;
    if (def.apply) def.apply(v, this.applied.get(id));
    this.applied.set(id, v);
  }
  /** 起動時、対象オブジェクトが揃ってから一度だけ呼ぶ */
  applyAll() { this.ready = true; for (const id of this.defs.keys()) this.applyOne(id); }
  onChange(fn: (id: string, v: ParamValue) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /* ---- リセット ---- */
  reset(id: string) { this.set(id, this.defs.get(id)!.default); }
  resetGroup(prefix: string) { for (const d of this.defs.values()) if (d.group === prefix || d.group.startsWith(prefix + '/')) this.set(d.id, d.default); }
  resetAll() { for (const d of this.defs.values()) this.set(d.id, d.default); }
  isDefault(id: string) { return this.values.get(id) === this.defs.get(id)!.default; }

  /* ---- 差分・プリセット ---- */
  /** 既定値と異なる項目だけを取り出す */
  diff(): Record<string, ParamValue> { const o: Record<string, ParamValue> = {}; for (const d of this.defs.values()) { const v = this.values.get(d.id)!; if (v !== d.default) o[d.id] = v; } return o; }
  /** プリセットは「既定値からの差分」。載っていない項目は既定値へ戻す。 */
  applyPreset(values: Record<string, ParamValue>) { for (const d of this.defs.values()) this.set(d.id, d.id in values ? values[d.id] : d.default); }
  registerBuiltin(p: Preset) { this.builtins.push({ ...p, builtin: true }); }
  userPresets(): Preset[] { try { return JSON.parse(this.store?.getItem(PRESETS_KEY) || '[]'); } catch { return []; } }
  presets(): Preset[] { return [...this.builtins, ...this.userPresets()]; }
  savePreset(name: string) { const list = this.userPresets().filter(p => p.name !== name); list.push({ name, values: this.diff() }); this.store?.setItem(PRESETS_KEY, JSON.stringify(list)); }
  deletePreset(name: string) { this.store?.setItem(PRESETS_KEY, JSON.stringify(this.userPresets().filter(p => p.name !== name))); }

  /* ---- 保存・URL ---- */
  private scheduleSave() { if (!this.store) return; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveNow(), 300); }
  saveNow() { if (!this.store) return; try { this.store.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, values: this.diff() })); } catch { /* 容量超過などは無視 */ } }
  static encode(values: Record<string, ParamValue>) { return btoa(unescape(encodeURIComponent(JSON.stringify(values)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  static decode(s: string): Record<string, ParamValue> {
    try { const b = s.replace(/-/g, '+').replace(/_/g, '/'); const o = JSON.parse(decodeURIComponent(escape(atob(b)))); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
  }
  /** 現在の設定を載せた共有用のクエリ値 */
  shareParam() { return Settings.encode(this.diff()); }
}

/* アプリ全体で使う実体。検証用の ?frames 実行では保存値を読まず、常に既定値で動かす。 */
function makeDefault() {
  if (typeof location === 'undefined') return new Settings();
  const q = new URLSearchParams(location.search);
  let store: KV | null = null;
  if (!q.has('frames')) { try { store = window.localStorage; store.getItem(SETTINGS_KEY); } catch { store = null; } }
  return new Settings(store, q.get('p'));
}
export const settings = makeDefault();
