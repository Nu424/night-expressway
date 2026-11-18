import { sound, startAudio } from '../audio/index';
import { settings } from '../core/settings';
import { dbg, state } from '../core/state';
import { rr } from '../core/util';
import { setDebug } from '../debug/birdseye';
import { togglePerf } from '../debug/perf';
import { resize } from '../main';
import { autoscale, forceScale } from '../render/autoscale';
import { interiorPass, post } from '../render/post';
import { setQuality } from '../render/renderer';
import { clearDrops } from '../weather/drops';
import { isHeadUnitOpen, makeHeadUnit, toggleHeadUnit } from './headunit';
import { actions } from './params';

const $ = (id: string) => document.getElementById(id)!;
/** 撮影用の ?frames 実行では解像度を固定し、結果を再現可能にする */
const FIXED = new URLSearchParams(location.search).has('frames');
const optLabel = (id: string, v: string) => settings.def(id)!.options!.find(o => o.value === v)!.label;

/* ---- 既存の調整値を設定レジストリへ登録 ---- */
settings.define<string>({
  id: 'weather.mode', label: '天気', group: 'WEATHER/雨', type: 'select', default: 'auto', order: -1,
  options: [{ value: 'auto', label: '自動' }, { value: 'clear', label: '晴れ' }, { value: 'rain', label: '雨' }],
  apply: (v, prev) => {
    if (v === 'auto' && prev !== undefined && prev !== 'auto') state.weatherT = rr(60, 180);
    state.weatherMode = v; $('bWeather').textContent = '天気: ' + optLabel('weather.mode', v);
  },
});
settings.define<string>({
  id: 'view.mode', label: '視点', group: 'DRIVE/視点', type: 'select', default: 'interior', order: -1,
  options: [{ value: 'interior', label: '車内' }, { value: 'clean', label: 'ダッシュカム' }],
  apply: v => {
    state.view = v; interiorPass.enabled = v === 'interior' && !dbg.on;
    $('bView').textContent = '視点: ' + optLabel('view.mode', v);
    if (v !== 'interior') clearDrops();
  },
});
settings.define<string>({
  id: 'gfx.quality', label: '画質', group: 'VIEW/画質', type: 'select', default: 'auto',
  options: [{ value: 'auto', label: '自動' }, { value: 'high', label: '高' }, { value: 'low', label: '軽量' }],
  apply: v => {
    setQuality(v); $('bQual').textContent = '画質: ' + optLabel('gfx.quality', v);
    autoscale.enabled = v === 'auto' && !FIXED;
    if (autoscale.enabled) forceScale(autoscale.scale); else forceScale(v === 'low' ? 0.6 : 1);
    applyAA();
  },
});
settings.define<string>({
  id: 'gfx.aa', label: '輪郭のなめらかさ', group: 'VIEW/画質', type: 'select', default: 'auto',
  options: [{ value: 'auto', label: '自動' }, { value: 'fxaa', label: '軽い(FXAA)' }, { value: '2', label: 'MSAA 2x' }, { value: '4', label: 'MSAA 4x' }, { value: '0', label: 'なし' }],
  apply: () => applyAA(),
});
/** 輪郭処理の方式を決める。「自動」は MSAA 4x から始め、重ければ FXAA に切り替える。 */
export function applyAA() {
  const q = settings.get<string>('gfx.quality'); let aa = settings.get<string>('gfx.aa');
  autoscale.aaAuto = aa === 'auto' && q === 'auto' && !FIXED;
  if (aa === 'auto') aa = q === 'low' || FIXED ? 'fxaa' : q === 'high' ? '4' : (autoscale.msaaOK ? '4' : 'fxaa');
  post.fxaa = aa === 'fxaa'; post.samples = aa === 'fxaa' ? 0 : parseInt(aa);
  resize();
}
settings.define<boolean>({ id: 'gfx.reflect', label: '路面・水面の反射', group: 'VIEW/画質', type: 'toggle', default: true });
settings.define<boolean>({ id: 'gfx.mirror', label: 'ルームミラー', group: 'VIEW/画質', type: 'toggle', default: true });
settings.define<number>({
  id: 'audio.master', label: '全体の音量', group: 'SOUND/全体', type: 'range', default: 0.8, min: 0, max: 1, step: 0.01,
  apply: v => { sound.setVolume(v); ($('vol') as HTMLInputElement).value = String(v); },
});

/** 保存せずに視点だけ切り替える（?clean などの一時指定用） */
export function setView(v: string) { settings.set('view.mode', v, false); }

$('go').addEventListener('click', () => {
  $('start').classList.add('gone');
  try { startAudio(); sound.setVolume(settings.get<number>('audio.master')); } catch (e) { console.warn('audio unavailable', e); }
});

export const panel = $('panel'); let idleT: any;
export function poke() {
  panel.classList.remove('idle'); document.body.classList.remove('hidecursor'); clearTimeout(idleT);
  idleT = setTimeout(() => { panel.classList.add('idle'); if (!isHeadUnitOpen()) document.body.classList.add('hidecursor'); }, 2600);
}
addEventListener('mousemove', poke); addEventListener('touchstart', poke);

export function toggleFull() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* 非対応環境 */ } }

makeHeadUnit();
$('bMenu').onclick = () => toggleHeadUnit();
$('bWeather').onclick = () => settings.cycle('weather.mode');
$('bView').onclick = () => settings.cycle('view.mode');
$('bQual').onclick = () => settings.cycle('gfx.quality');
$('bFull').onclick = toggleFull;
$('bDebug').onclick = () => setDebug(!dbg.on);
$('vol').oninput = e => settings.set('audio.master', parseFloat((e.target as HTMLInputElement).value));
addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); toggleHeadUnit(); return; }
  if (e.key === 'Escape' && isHeadUnitOpen()) { toggleHeadUnit(false); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFull();
  else if (k === 'r') settings.cycle('weather.mode');
  else if (k === 'v') settings.cycle('view.mode');
  else if (k === 'm') sound.toggleMute();
  else if (k === 'b') setDebug(!dbg.on);
  else if (k === 'p') togglePerf();
  else if (k === 'n') actions.nextSong();
  else if (k === 'h') panel.classList.add('idle');
});

// スリープで暗転したあとは、画面を押すかキーを押すと再開する
const wake = () => { if (settings.get<string>('trip.sleep') !== '0' && (document.getElementById('sleepVeil') as HTMLElement).style.pointerEvents === 'auto') settings.set('trip.sleep', '0'); };
document.getElementById('sleepVeil')!.addEventListener('pointerdown', wake); addEventListener('keydown', wake);
