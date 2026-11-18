import { sound } from '../audio/sound';
import { settings } from '../core/settings';
import { dbg, state } from '../core/state';
import { rr } from '../core/util';
import { setDebug } from '../debug/birdseye';
import { togglePerf } from '../debug/perf';
import { resize } from '../main';
import { interiorPass } from '../render/post';
import { setQuality } from '../render/renderer';
import { clearDrops } from '../weather/drops';

const $ = (id: string) => document.getElementById(id)!;
const optLabel = (id: string, v: string) => settings.def(id)!.options!.find(o => o.value === v)!.label;

/* ---- 既存の調整値を設定レジストリへ登録 ---- */
settings.define<string>({
  id: 'weather.mode', label: '天気', group: 'WEATHER', type: 'select', default: 'auto',
  options: [{ value: 'auto', label: '自動' }, { value: 'clear', label: '晴れ' }, { value: 'rain', label: '雨' }],
  apply: (v, prev) => {
    if (v === 'auto' && prev !== undefined && prev !== 'auto') state.weatherT = rr(60, 180);
    state.weatherMode = v; $('bWeather').textContent = '天気: ' + optLabel('weather.mode', v);
  },
});
settings.define<string>({
  id: 'view.mode', label: '視点', group: 'DRIVE', type: 'select', default: 'interior',
  options: [{ value: 'interior', label: '車内' }, { value: 'clean', label: 'ダッシュカム' }],
  apply: v => {
    state.view = v; interiorPass.enabled = v === 'interior' && !dbg.on;
    $('bView').textContent = '視点: ' + optLabel('view.mode', v);
    if (v !== 'interior') clearDrops();
  },
});
settings.define<string>({
  id: 'gfx.quality', label: '画質', group: 'VIEW', type: 'select', default: 'high',
  options: [{ value: 'high', label: '高' }, { value: 'low', label: '低' }],
  apply: v => { setQuality(v); $('bQual').textContent = '画質: ' + optLabel('gfx.quality', v); resize(); },
});
settings.define<number>({
  id: 'audio.master', label: '音量', group: 'SOUND', type: 'range', default: 0.8, min: 0, max: 1, step: 0.01,
  apply: v => { sound.setVolume(v); ($('vol') as HTMLInputElement).value = String(v); },
});

/** 保存せずに視点だけ切り替える（?clean などの一時指定用） */
export function setView(v: string) { settings.set('view.mode', v, false); }

$('go').addEventListener('click', () => {
  $('start').classList.add('gone');
  try { sound.start(); sound.setVolume(settings.get<number>('audio.master')); } catch (e) { /* 音が出せない環境でも走行は続ける */ }
});

export const panel = $('panel'); let idleT: any;
export function poke() {
  panel.classList.remove('idle'); document.body.classList.remove('hidecursor'); clearTimeout(idleT);
  idleT = setTimeout(() => { panel.classList.add('idle'); document.body.classList.add('hidecursor'); }, 2600);
}
addEventListener('mousemove', poke); addEventListener('touchstart', poke);

export function toggleFull() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* 非対応環境 */ } }

$('bWeather').onclick = () => settings.cycle('weather.mode');
$('bView').onclick = () => settings.cycle('view.mode');
$('bQual').onclick = () => settings.cycle('gfx.quality');
$('bFull').onclick = toggleFull;
$('bDebug').onclick = () => setDebug(!dbg.on);
$('vol').oninput = e => settings.set('audio.master', parseFloat((e.target as HTMLInputElement).value));
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFull();
  else if (k === 'r') settings.cycle('weather.mode');
  else if (k === 'v') settings.cycle('view.mode');
  else if (k === 'm') sound.toggleMute();
  else if (k === 'b') setDebug(!dbg.on);
  else if (k === 'p') togglePerf();
  else if (k === 'h') panel.classList.add('idle');
});
