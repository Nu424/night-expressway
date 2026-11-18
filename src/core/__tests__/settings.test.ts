import { describe, expect, it } from 'vitest';
import { Settings } from '../settings';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
const setup = (store = mem(), url: string | null = null) => {
  const s = new Settings(store, url); const log: any[] = [];
  s.define<number>({ id: 'a.gain', label: 'gain', group: 'A', type: 'range', default: 0.5, min: 0, max: 1, apply: (v, p) => log.push(['gain', v, p]) });
  s.define<string>({ id: 'a.mode', label: 'mode', group: 'A/sub', type: 'select', default: 'x', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] });
  s.define<boolean>({ id: 'b.on', label: 'on', group: 'B', type: 'toggle', default: false });
  return { s, log, store };
};

describe('Settings', () => {
  it('applyAll の前は apply を呼ばず、後は即時に呼ぶ', () => {
    const { s, log } = setup();
    s.set('a.gain', 0.7); expect(log).toEqual([]);
    s.applyAll(); expect(log).toEqual([['gain', 0.7, undefined]]);
    s.set('a.gain', 0.2); expect(log.at(-1)).toEqual(['gain', 0.2, 0.7]);
  });
  it('範囲外・不正な値を丸める', () => {
    const { s } = setup();
    s.set('a.gain', 9); expect(s.get('a.gain')).toBe(1);
    s.set('a.gain', 'abc' as any); expect(s.get('a.gain')).toBe(0.5);
    s.set('a.mode', 'zzz'); expect(s.get('a.mode')).toBe('x');
  });
  it('差分だけを保存し、次回起動で復元する', () => {
    const { s, store } = setup();
    s.set('a.mode', 'y'); s.saveNow();
    expect(JSON.parse(store.m.get('ne.settings.v1')!)).toEqual({ v: 1, values: { 'a.mode': 'y' } });
    const again = setup(store).s; expect(again.get('a.mode')).toBe('y'); expect(again.get('a.gain')).toBe(0.5);
  });
  it('URL の値が保存値より優先される', () => {
    const { s, store } = setup(); s.set('a.gain', 0.9); s.saveNow();
    const url = Settings.encode({ 'a.gain': 0.1, 'b.on': true });
    const again = setup(store, url).s; expect(again.get('a.gain')).toBe(0.1); expect(again.get('b.on')).toBe(true);
  });
  it('プリセットは載っていない項目を既定値へ戻す', () => {
    const { s } = setup(); s.set('a.gain', 0.9); s.set('b.on', true);
    s.applyPreset({ 'a.mode': 'y' });
    expect(s.diff()).toEqual({ 'a.mode': 'y' });
  });
  it('グループ単位・全体のリセット', () => {
    const { s } = setup(); s.set('a.gain', 0.9); s.set('a.mode', 'y'); s.set('b.on', true);
    s.resetGroup('A'); expect(s.diff()).toEqual({ 'b.on': true });
    s.resetAll(); expect(s.diff()).toEqual({});
  });
  it('ユーザープリセットの保存・削除と、日本語を含む共有値の往復', () => {
    const { s } = setup(); s.set('a.gain', 0.3); s.savePreset('深夜2時');
    expect(s.presets().map(p => p.name)).toEqual(['深夜2時']);
    s.deletePreset('深夜2時'); expect(s.presets()).toEqual([]);
    expect(Settings.decode(Settings.encode({ 'k': '雨の湾岸' }))).toEqual({ k: '雨の湾岸' });
    expect(Settings.decode('@@broken')).toEqual({});
  });
});
