/* ============================================================
   設定項目の定義
   ここに登録した値が、ヘッドユニット（設定画面）・保存・プリセット・リセット・URL共有の対象になる。
   group は「タブ/小見出し」。タブの並びは headunit.ts の TABS で決める。
   ============================================================ */
import { radio, radioParams, refreshRadioDisplay, sound } from '../audio/index';
import { STATIONS } from '../audio/radio';
import { cabin } from '../car/interior';
import { U } from '../core/globals';
import { settings } from '../core/settings';
import { state, tune } from '../core/state';
import { rebuildWorld } from '../main';
import { finalU, post } from '../render/post';
import { carLook } from '../traffic/carRender';
import { setLampOverride } from '../world/path';

const range = (id: string, label: string, group: string, def: number, min: number, max: number, step: number, apply: (v: number) => void, o: { unit?: string; advanced?: boolean } = {}) =>
  settings.define<number>({ id, label, group, type: 'range', default: def, min, max, step, apply, ...o });
const toggle = (id: string, label: string, group: string, def: boolean, apply: (v: boolean) => void, o: { advanced?: boolean } = {}) =>
  settings.define<boolean>({ id, label, group, type: 'toggle', default: def, apply, ...o });
const select = (id: string, label: string, group: string, def: string, options: [string, string][], apply: (v: string, prev?: string) => void) =>
  settings.define<string>({ id, label, group, type: 'select', default: def, options: options.map(([value, label]) => ({ value, label })), apply });

/* ---------------- DRIVE ---------------- */
range('drive.speed', '巡航速度', 'DRIVE/走り', 1, 0.7, 1.35, 0.01, v => { tune.speed = v; }, { unit: 'x' });
range('drive.traffic', '交通量', 'DRIVE/走り', 1, 0, 1.8, 0.05, v => { tune.traffic = v; }, { unit: 'x' });
toggle('drive.lanechange', '追い越し（自動車線変更）', 'DRIVE/走り', true, v => { tune.laneChange = v; });
range('drive.bob', '頭の揺れ', 'DRIVE/視点', 1, 0, 2.5, 0.05, v => { tune.bob = v; }, { unit: 'x' });
select('car.meter', 'メーターの色', 'DRIVE/車内', 'amber', [['amber', '琥珀'], ['ice', '白'], ['green', '緑']], v => { cabin.meterColor = v as any; document.documentElement.dataset.hu = v; refreshRadioDisplay(); });
range('car.meterGain', 'メーターの明るさ', 'DRIVE/車内', 1, 0.2, 1.8, 0.05, v => { cabin.meterGain = v; }, { unit: 'x' });
range('car.sweep', '車内を流れる街灯の光', 'DRIVE/車内', 1, 0, 2.5, 0.05, v => { cabin.sweep = v; }, { unit: 'x' });

/* ---------------- VIEW ---------------- */
range('post.exposure', '露出', 'VIEW/レンズ', 1, 0.55, 1.7, 0.01, v => { state.exposureBase = 1.05 * v; }, { unit: 'x' });
range('post.adapt', '明るさへの目の慣れ', 'VIEW/レンズ', 1, 0, 1, 0.05, v => { state.adapt = v; });
range('post.bloom', '光のにじみ', 'VIEW/レンズ', 1, 0, 2.5, 0.05, v => { finalU.uBloom.value = 0.09 * v; }, { unit: 'x' });
range('post.bloomSpread', 'にじみの広がり', 'VIEW/レンズ', 1.45, 1.0, 1.9, 0.01, v => { post.bloomLowGain = v; }, { advanced: true });
range('post.halo', '街灯の光芒', 'VIEW/レンズ', 1, 0, 2.5, 0.05, v => { U.haloGain.value = v; }, { unit: 'x' });
range('world.haze', '霞の濃さ', 'VIEW/空気', 1, 0.3, 2.6, 0.05, v => { tune.haze = v; }, { unit: 'x' });
range('post.grain', '粒状感', 'VIEW/フィルム', 0.028, 0, 0.09, 0.002, v => { finalU.uGrain.value = v; });
range('post.vignette', '周辺減光', 'VIEW/フィルム', 0.75, 0, 1.8, 0.05, v => { finalU.uVignette.value = v; });
range('post.warmth', '色温度（暖かさ）', 'VIEW/フィルム', 1, -3, 5, 0.1, v => { finalU.uWarmth.value = v; });
range('post.saturation', '彩度', 'VIEW/フィルム', 1, 0.4, 1.6, 0.01, v => { finalU.uSaturation.value = v; });
range('post.contrast', 'コントラスト', 'VIEW/フィルム', 1, 0.85, 1.25, 0.01, v => { finalU.uContrast.value = v; });
range('post.ca', '色ずれ', 'VIEW/フィルム', 0.0016, 0, 0.006, 0.0002, v => { finalU.uCA.value = v; }, { advanced: true });

/* ---------------- CITY ---------------- */
range('city.lit', '窓の点灯率', 'CITY/街', 1, 0.2, 2.2, 0.05, v => { U.cityLit.value = 0.6 * v; }, { unit: 'x' });
range('city.gain', '窓とネオンの明るさ', 'CITY/街', 1, 0.3, 2.2, 0.05, v => { U.cityGain.value = v; }, { unit: 'x' });
select('city.lamp', '街灯の色', 'CITY/道路', 'auto', [['auto', '区間ごと'], ['sodium', 'ナトリウム'], ['warm', '電球色'], ['white', '白']],
  (v, prev) => { setLampOverride(v); if (prev !== undefined) rebuildWorld(); });
range('traffic.glow', '路面への灯火の照り返し', 'CITY/道路', 1, 0, 2.5, 0.05, v => { carLook.glow = v; }, { unit: 'x' });
range('traffic.glare', '対向車のまぶしさ', 'CITY/道路', 1, 0.2, 2.5, 0.05, v => { carLook.glare = v; }, { unit: 'x' });

/* ---------------- WEATHER ---------------- */
range('weather.rainAmount', '雨量（「雨」のとき）', 'WEATHER/雨', 0.85, 0.15, 1, 0.01, v => { tune.rainAmount = v; });
range('weather.drops', 'ガラスの水滴', 'WEATHER/雨', 1, 0, 2.5, 0.05, v => { tune.drops = v; }, { unit: 'x' });
select('weather.wiper', 'ワイパー', 'WEATHER/雨', 'auto', [['auto', '自動'], ['slow', 'ゆっくり'], ['fast', '速く'], ['off', '止める']], v => { tune.wiper = v; });
range('weather.speed', '天気の移り変わる速さ', 'WEATHER/雨', 1, 0.3, 6, 0.1, v => { tune.weatherSpeed = v; }, { unit: 'x' });

/* ---------------- RADIO ---------------- */
select('radio.station', '局', 'RADIO/選局', 'lofi', STATIONS.map(s => [s.id, s.id === 'off' ? 'OFF' : s.name] as [string, string]), v => { radioParams.station = v as any; refreshRadioDisplay(); });
range('radio.volume', '音楽の音量', 'RADIO/選局', 0.5, 0, 1, 0.01, v => { radioParams.volume = v; });
range('radio.tempo', 'テンポ', 'RADIO/曲調', 1, 0.8, 1.2, 0.01, v => { radioParams.tempo = v; }, { unit: 'x' });
range('radio.bright', '音色の明るさ', 'RADIO/曲調', 0.5, 0, 1, 0.01, v => { radioParams.bright = v; });
range('radio.density', '音数', 'RADIO/曲調', 0.6, 0, 1, 0.01, v => { radioParams.density = v; });
toggle('radio.drums', 'ドラム', 'RADIO/曲調', true, v => { radioParams.drums = v; });
range('radio.texture', 'ノイズの質感（ヒス・パチ音）', 'RADIO/カーオーディオ', 0.5, 0, 1, 0.01, v => { radioParams.texture = v; });
range('radio.wow', 'テープの揺れ', 'RADIO/カーオーディオ', 0.5, 0, 1, 0.01, v => { radioParams.wow = v; });
range('radio.tunnel', 'トンネルで電波が弱まる', 'RADIO/カーオーディオ', 0.7, 0, 1, 0.01, v => { radioParams.tunnelFade = v; });
toggle('radio.sync', '継ぎ目の音に拍を合わせる（実験的）', 'RADIO/カーオーディオ', false, v => { radioParams.jointSync = v; });

/* ---------------- SOUND ---------------- */
const mix = (k: string) => (v: number | string) => { sound.mix[k] = v; };
range('sound.road', 'ロードノイズ', 'SOUND/走行音', 1, 0, 2, 0.05, mix('road'), { unit: 'x' });
range('sound.wind', '風切り音', 'SOUND/走行音', 1, 0, 2.5, 0.05, mix('wind'), { unit: 'x' });
range('sound.joints', '継ぎ目の音', 'SOUND/走行音', 1, 0, 2, 0.05, mix('joints'), { unit: 'x' });
range('sound.pass', 'すれ違い・追い越しの音', 'SOUND/走行音', 1, 0, 2.5, 0.05, mix('pass'), { unit: 'x' });
range('sound.rain', '雨音', 'SOUND/走行音', 1, 0, 2.5, 0.05, mix('rain'), { unit: 'x' });
range('sound.cabin', '車内のこもり', 'SOUND/走行音', 0.25, 0, 1, 0.01, mix('cabin'));
select('sound.engineType', '動力', 'SOUND/車', 'ice', [['ice', 'ガソリン'], ['hybrid', 'ハイブリッド'], ['ev', 'EV']], mix('engineType'));
range('sound.engine', 'エンジン・モーター音', 'SOUND/車', 1, 0, 2.5, 0.05, mix('engine'), { unit: 'x' });
range('sound.blinker', 'ウインカー音', 'SOUND/車', 1, 0, 2, 0.05, mix('blinker'), { unit: 'x' });
range('sound.wiper', 'ワイパー音', 'SOUND/車', 1, 0, 2, 0.05, mix('wiper'), { unit: 'x' });
range('sound.ui', '設定画面の操作音', 'SOUND/車', 1, 0, 2, 0.05, mix('ui'), { unit: 'x' });

/* ---------------- TRIP ---------------- */
select('trip.route', 'ルートの好み（この先から反映）', 'TRIP/道', 'auto', [['auto', 'おまかせ'], ['city', '都市多め'], ['tunnel', 'トンネル多め'], ['bay', '湾岸多め']], v => { tune.route = v; });
select('trip.time', '時間の流れ', 'TRIP/時間', 'night', [['night', '深夜のまま'], ['dawn60', '60分で夜明け'], ['dawn20', '20分で夜明け'], ['dawn', '薄明で固定']],
  (v, prev) => { state.dawnMode = v; if (prev !== undefined || v !== 'night') state.dawnStart = U.time.value; if (v === 'night') state.dawn = 0; });
select('trip.sleep', 'スリープタイマー', 'TRIP/時間', '0', [['0', 'オフ'], ['15', '15分'], ['30', '30分'], ['60', '60分'], ['90', '90分']],
  v => { const m = parseInt(v); state.sleepEnd = m > 0 ? performance.now() + m * 60000 : 0; state.sleepFade = 0; });

/* ---------------- 組み込みプリセット ---------------- */
settings.registerBuiltin({ name: '標準', values: {} });
settings.registerBuiltin({ name: '深夜2時', values: { 'drive.traffic': 0.45, 'city.lit': 0.55, 'radio.station': 'ambient', 'post.exposure': 0.92, 'weather.mode': 'clear', 'world.haze': 1.25 } });
settings.registerBuiltin({ name: '雨の湾岸', values: { 'weather.mode': 'rain', 'weather.rainAmount': 0.8, 'trip.route': 'bay', 'city.lamp': 'white', 'weather.drops': 1.4, 'radio.station': 'lofi', 'post.bloom': 1.3 } });
settings.registerBuiltin({ name: 'トンネル', values: { 'trip.route': 'tunnel', 'city.lamp': 'sodium', 'radio.station': 'lofi', 'radio.tunnel': 0.3, 'car.sweep': 1.4 } });
settings.registerBuiltin({ name: 'シネマ', values: { 'post.grain': 0.05, 'post.vignette': 1.25, 'post.bloom': 1.5, 'post.ca': 0.003, 'post.contrast': 1.08, 'post.saturation': 0.92, 'post.halo': 1.5, 'radio.station': 'groove' } });
settings.registerBuiltin({ name: '眠りへ', values: { 'drive.speed': 0.85, 'drive.traffic': 0.6, 'radio.station': 'ambient', 'radio.tempo': 0.9, 'radio.volume': 0.4, 'trip.sleep': '60', 'post.exposure': 0.85, 'sound.joints': 0.6, 'drive.bob': 0.5 } });
settings.registerBuiltin({ name: '軽量', values: { 'gfx.quality': 'low' } });

/** 「次の曲へ」など、値を持たない操作 */
export const actions = { nextSong: () => radio?.skip() };
