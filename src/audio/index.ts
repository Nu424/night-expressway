/* 音まわりの入口: 環境音（sound）と生成ラジオ（radio）をまとめて起動・更新する */
import { setUnitLines } from '../car/interior';
import { Radio, radioParams } from './radio';
import { sound } from './sound';

export let radio: Radio | null = null;
let roadName = '';
function showTitle() { if (!radio) return; const st = radio.station(); setUnitLines(st.id === 'off' ? roadName : (radio.title || '…'), st.id === 'off' ? 'RADIO OFF' : `${st.freq}  ${st.name}`); }
/** ヘッドユニットに出す道路名（区間が変わったときに呼ぶ） */
export function setRoadName(n: string) { roadName = n; showTitle(); }

export function startAudio() {
  if (radio) return;
  sound.start();
  radio = new Radio(sound.ctx, sound.musicIn); radio.onTitle = showTitle; radio.start();
  const pump = () => radio!.schedule(sound.ctx.currentTime + 0.6);
  pump(); setInterval(pump, 150);       // タブが裏に回って間隔が延びても、小節単位で先まで予約してあるので途切れにくい
  showTitle();
}
export function audioFrame(st: { v: number; acc: number; tunnel: number; wet: number; rain: number; dt: number }) {
  sound.update(st); if (radio) radio.setTunnel(st.tunnel);
}
export function refreshRadioDisplay() { showTitle(); }
export { radioParams, sound };
