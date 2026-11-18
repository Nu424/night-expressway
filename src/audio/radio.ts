/* ============================================================
   生成ラジオ
   作曲（調・進行・構成を乱数で決める）→ 演奏（小節単位で発音を予約）→ カーオーディオ処理。
   音源ファイルは使わず、すべて Web Audio の発振器とノイズで合成する。
   OfflineAudioContext でも動くので、書き出して音量や帯域を数値で検証できる。
   ============================================================ */
export type StationId = 'ambient' | 'lofi' | 'groove' | 'jazz' | 'off';
export interface StationDef { id: StationId; name: string; freq: string; bpm: [number, number]; swing: number }
export const STATIONS: StationDef[] = [
  { id: 'lofi', name: 'LO-FI LANE', freq: 'FM 84.1', bpm: [70, 82], swing: 0.58 },
  { id: 'ambient', name: '深夜便 AMBIENT', freq: 'FM 76.4', bpm: [48, 56], swing: 0.5 },
  { id: 'groove', name: 'NIGHT GROOVE', freq: 'FM 79.8', bpm: [94, 106], swing: 0.5 },
  { id: 'jazz', name: 'AFTER HOURS JAZZ', freq: 'FM 88.6', bpm: [96, 124], swing: 0.66 },
  { id: 'off', name: 'RADIO OFF', freq: '— —', bpm: [60, 60], swing: 0.5 },
];
/** 外から調整する値。次の小節から反映される。 */
export const radioParams = {
  station: 'lofi' as StationId, volume: 0.5, tempo: 1, bright: 0.5, density: 0.6, drums: true,
  texture: 0.5, tunnelFade: 0.7, jointSync: false, wow: 0.5,
};

const TITLES_A = ['湾岸', '深夜', '雨の', '午前二時の', '環状線', '橋の上の', 'トンネルの', '遠い', '眠らない', 'ガラス越しの', '最終の', '青い'];
const TITLES_B = ['ランプウェイ', 'ジャンクション', 'テールランプ', 'ハイウェイ', 'ネオン', 'ドライブ', 'パーキング', 'ミッドナイト', 'シティライト', 'ワイパー', '夜風', '航路'];
const TITLES_E = ['Midnight Junction', 'Sodium Lights', 'Bayside 2AM', 'Slow Lane', 'Last Exit', 'Night Carriageway', 'Rain on Glass', 'Loop Line', 'After the Tunnel', 'Harbor Drift', 'Quiet Overpass', 'Blue Hour'];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS: Record<string, number[]> = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], dom9: [0, 4, 7, 10, 14], sus: [0, 5, 7, 10, 14], six: [0, 4, 7, 9, 14] };
// 長調の音度 → [根音(半音), 和音の種類]
const DEG: Record<string, [number, string]> = { I: [0, 'maj7'], ii: [2, 'm7'], iii: [4, 'm7'], IV: [5, 'maj7'], V: [7, 'dom7'], vi: [9, 'm7'], Vs: [7, 'sus'], I6: [0, 'six'], bVII: [10, 'maj7'] };
const PROG_A = [['IV', 'V', 'iii', 'vi'], ['ii', 'V', 'I', 'vi'], ['I', 'vi', 'ii', 'V'], ['IV', 'iii', 'ii', 'I'], ['vi', 'IV', 'I', 'V'], ['IV', 'Vs', 'iii', 'vi'], ['I', 'iii', 'IV', 'Vs'], ['ii', 'iii', 'IV', 'V']];
const PROG_B = [['ii', 'V', 'iii', 'vi'], ['IV', 'V', 'I', 'I6'], ['vi', 'ii', 'V', 'I'], ['IV', 'iii', 'ii', 'Vs'], ['bVII', 'IV', 'I', 'V']];
const PROG_AMB = [['I', 'IV'], ['IV', 'I'], ['vi', 'IV'], ['I', 'iii'], ['IV', 'ii']];
const PENTA = [0, 2, 4, 7, 9];

interface Chord { root: number; type: string; tones: number[] }
interface Section { prog: Chord[]; bars: number; pad: boolean; ep: boolean; bass: boolean; drums: boolean; lead: boolean; fade?: number }
interface Song { key: number; bpm: number; swing: number; sections: Section[]; title: string; kick: number[]; bassPat: number[]; epHits: number[]; leadSeed: number; motif: number[] }

export class Radio {
  ctx: BaseAudioContext; rng: () => number;
  private mix!: GainNode; private outGain!: GainNode; private tone!: BiquadFilterNode; private recv!: BiquadFilterNode; private staticGain!: GainNode;
  private echoIn!: GainNode; private verbIn!: GainNode; private wowDelay!: DelayNode; private wowDepth!: GainNode; private hissGain!: GainNode;
  private noise!: AudioBuffer;
  private song: Song | null = null; private secI = 0; private barI = 0; private nextBar = 0; private started = false; private curStation: StationId = 'off';
  private tunnel = 0; private jointT = 0; private jointDt = 0;
  title = ''; onTitle: (title: string, st: StationDef) => void = () => {};

  constructor(ctx: BaseAudioContext, private dest: AudioNode, rng: () => number = Math.random) { this.ctx = ctx; this.rng = rng; }
  private r(a: number, b: number) { return a + (b - a) * this.rng(); }
  private pick<T>(a: T[]): T { return a[Math.floor(this.rng() * a.length) % a.length]; }

  start() {
    if (this.started) return; this.started = true; const C = this.ctx;
    const n = C.sampleRate * 2; this.noise = C.createBuffer(1, n, C.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // 楽器の合流 → テープの揺れ → 音色（小型スピーカー風の帯域制限と軽い飽和）→ 受信状態 → 出力
    this.mix = C.createGain(); this.mix.gain.value = 1.45;
    this.wowDelay = C.createDelay(0.05); this.wowDelay.delayTime.value = 0.012;
    const lfo1 = C.createOscillator(); lfo1.frequency.value = 0.37; const lfo2 = C.createOscillator(); lfo2.frequency.value = 5.3;
    this.wowDepth = C.createGain(); this.wowDepth.gain.value = 0; const g2 = C.createGain(); g2.gain.value = 0.06;
    lfo1.connect(this.wowDepth); lfo2.connect(g2); g2.connect(this.wowDepth); this.wowDepth.connect(this.wowDelay.delayTime); lfo1.start(); lfo2.start();
    const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 58; hp.Q.value = 0.7;
    const body = C.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 130; body.Q.value = 0.9; body.gain.value = 0.5;
    this.tone = C.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 9000; this.tone.Q.value = 0.5;
    const sat = C.createWaveShaper(); const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * 1.4) / Math.tanh(1.4); } sat.curve = cv;
    this.recv = C.createBiquadFilter(); this.recv.type = 'lowpass'; this.recv.frequency.value = 18000; this.recv.Q.value = 0.4;
    this.outGain = C.createGain(); this.outGain.gain.value = 0;
    this.mix.connect(this.wowDelay); this.wowDelay.connect(hp); hp.connect(body); body.connect(this.tone); this.tone.connect(sat); sat.connect(this.recv); this.recv.connect(this.outGain); this.outGain.connect(this.dest);
    // 残響（小さな部屋）と付点8分のエコー
    const verb = C.createConvolver(); const vn = Math.floor(C.sampleRate * 1.6), vb = C.createBuffer(2, vn, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const v = vb.getChannelData(ch); for (let i = 0; i < vn; i++) v[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / vn, 3.2); }
    verb.buffer = vb; this.verbIn = C.createGain(); this.verbIn.gain.value = 1; const vg = C.createGain(); vg.gain.value = 0.22; const vlp = C.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 3800;
    this.verbIn.connect(verb); verb.connect(vlp); vlp.connect(vg); vg.connect(this.mix);
    this.echoIn = C.createGain(); const dl = C.createDelay(1.5); dl.delayTime.value = 0.45; const fb = C.createGain(); fb.gain.value = 0.36; const elp = C.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2200;
    this.echoIn.connect(dl); dl.connect(elp); elp.connect(fb); fb.connect(dl); elp.connect(this.mix); (this as any).echoDelay = dl;
    // 受信の乱れ（トンネルで混じる雑音）とテープのヒス
    const mk = (f: number, type: BiquadFilterType, q: number) => { const s = C.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = C.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); s.start(); return g; };
    this.staticGain = mk(2400, 'bandpass', 0.4); this.staticGain.connect(this.outGain);
    this.hissGain = mk(5200, 'highpass', 0.5); this.hissGain.connect(this.mix);
    this.nextBar = C.currentTime + 0.25;
  }

  /* ---------------- 作曲 ---------------- */
  private chord(deg: string, key: number, ext: boolean): Chord {
    let [root, type] = DEG[deg]; if (ext && this.rng() < 0.45) type = type === 'maj7' ? 'maj9' : type === 'm7' ? 'm9' : type === 'dom7' ? 'dom9' : type;
    const base = key + root;
    // 上声部は中央のド付近（MIDI 55〜71）にまとめる
    const tones = CHORDS[type].slice(1).map(iv => { let m = base + iv; while (m < 55) m += 12; while (m > 71) m -= 12; return m; }).sort((a, b) => a - b);
    return { root: base, type, tones };
  }
  private newSong(st: StationDef): Song {
    const key = 36 + Math.floor(this.r(0, 12));
    const bpm = this.r(st.bpm[0], st.bpm[1]) * radioParams.tempo;
    const mk = (names: string[]) => names.map(nm => this.chord(nm, key, st.id !== 'jazz' || true));
    const sec = (prog: Chord[], bars: number, o: Partial<Section>): Section => ({ prog, bars, pad: true, ep: true, bass: true, drums: true, lead: false, ...o });
    let sections: Section[];
    if (st.id === 'ambient') {
      const a = mk(this.pick(PROG_AMB)), b = mk(this.pick(PROG_AMB));
      sections = [sec(a, 8, { drums: false, bass: false, ep: false }), sec(a, 16, { drums: false }), sec(b, 16, { drums: false, lead: true }), sec(a, 16, { drums: false, lead: true }), sec(a, 8, { drums: false, bass: false, fade: 1 })];
    } else {
      const a = mk(this.pick(PROG_A)), b = mk(this.pick(PROG_B));
      sections = [sec(a, 4, { drums: false, bass: false }), sec(a, 8, {}), sec(a, 8, { lead: true }), sec(b, 8, { lead: this.rng() < 0.6 }), sec(a, 8, { lead: true }),
        sec(b, 8, { pad: true, lead: false }), sec(a, 8, { lead: true }), sec(a, 4, { drums: false, lead: false, fade: 1 })];
    }
    const kicks = st.id === 'groove' ? [[0, 6, 8, 10], [0, 3, 8, 11], [0, 4, 8, 12], [0, 7, 8, 10]] : [[0, 10], [0, 7, 10], [0, 8, 11], [0, 6, 10]];
    const bassPats = st.id === 'groove' ? [[0, 3, 6, 8, 11, 14], [0, 2, 6, 8, 10, 14], [0, 3, 8, 10, 11, 14]] : [[0, 8], [0, 6, 8], [0, 10], [0, 8, 14]];
    const epHits = st.id === 'groove' ? this.pick([[0, 3, 10], [0, 6, 11], [2, 6, 10, 14]]) : this.pick([[0], [0, 6], [0, 10], [0, 7]]);
    const motif = Array.from({ length: 5 }, () => Math.floor(this.r(0, 7)));
    const title = this.rng() < 0.55 ? this.pick(TITLES_A) + this.pick(TITLES_B) : this.pick(TITLES_E);
    return { key, bpm, swing: st.swing, sections, title, kick: this.pick(kicks), bassPat: this.pick(bassPats), epHits, leadSeed: Math.floor(this.r(0, 1e6)), motif };
  }

  /* ---------------- 演奏: 1小節ぶんの発音を予約 ---------------- */
  /** 呼び出し時点の ctx 時刻から少し先までを予約する。0.2秒おき程度で呼ぶ。 */
  schedule(until: number) {
    if (!this.started) return;
    const C = this.ctx, p = radioParams, st = STATIONS.find(s => s.id === p.station)!;
    // 受信状態と音色は連続的に追従させる
    const t = C.currentTime, fade = this.tunnel * p.tunnelFade;
    this.outGain.gain.setTargetAtTime(p.station === 'off' ? 0 : p.volume * (1 - 0.45 * fade), t, 0.4);
    this.recv.frequency.setTargetAtTime(18000 * Math.pow(0.09, fade), t, 0.5);
    this.staticGain.gain.setTargetAtTime(p.station === 'off' ? 0 : 0.05 * fade, t, 0.5);
    this.tone.frequency.setTargetAtTime((st.id === 'lofi' ? 3200 : 5500) + p.bright * (st.id === 'lofi' ? 5000 : 9000), t, 0.6);
    this.wowDepth.gain.setTargetAtTime((st.id === 'lofi' ? 0.0011 : 0.0003) * p.wow * 2, t, 1);
    this.hissGain.gain.setTargetAtTime(st.id === 'lofi' ? 0.006 * p.texture : st.id === 'jazz' ? 0.002 * p.texture : 0, t, 1);
    if (p.station !== this.curStation) { this.curStation = p.station; this.song = null; this.nextBar = Math.max(this.nextBar, t + 0.3); }
    if (p.station === 'off') { this.nextBar = Math.max(this.nextBar, t + 0.2); return; }
    let guard = 0;
    while (this.nextBar < until && guard++ < 64) {
      if (!this.song) { this.song = this.newSong(st); this.secI = 0; this.barI = 0; this.title = this.song.title; this.onTitle(this.title, st); this.nextBar += 1.2; }
      this.bar(st);
    }
  }
  private bar(st: StationDef) {
    const S = this.song!, sec = S.sections[this.secI], p = radioParams;
    let bpm = S.bpm;
    // 継ぎ目同期: 継ぎ目の間隔の整数分の1を拍にし、拍の位置も少しずつ寄せる
    if (p.jointSync && this.jointDt > 0.6 && this.jointDt < 6 && this.ctx.currentTime - this.jointT < 8) {
      let best = bpm, bd = 1e9; for (let k = 1; k <= 6; k++) { const c = 60 / this.jointDt * k; const dd = Math.abs(Math.log(c / S.bpm)); if (dd < bd) { bd = dd; best = c; } }
      if (bd < 0.22) { bpm = best; const beat = 60 / bpm; let e = (this.nextBar - this.jointT) % beat; if (e > beat / 2) e -= beat; this.nextBar -= Math.max(-0.035, Math.min(0.035, e)); }
    }
    const beat = 60 / bpm, step = beat / 4, t0 = this.nextBar, amb = st.id === 'ambient';
    (this as any).echoDelay.delayTime.setTargetAtTime(beat * 0.75, t0, 0.2);
    // 16分の位置 i (0..16) → 時刻。8分の裏拍を swing の割合だけ後ろへずらす。
    const eighth = (e: number) => Math.floor(e / 2) * beat + (e % 2 ? S.swing * beat : 0);
    const at = (i: number) => { const e = Math.floor(i / 2), a = eighth(e); return t0 + (i % 2 ? (a + eighth(e + 1)) / 2 : a) + (amb ? 0 : this.r(-0.006, 0.006)); };
    const fadeK = sec.fade ? Math.max(0, 1 - (this.barI + 1) / sec.bars) : 1;
    const chordBars = amb ? 2 : 1;
    const ch = sec.prog[Math.floor(this.barI / chordBars) % sec.prog.length];
    const next = sec.prog[(Math.floor(this.barI / chordBars) + 1) % sec.prog.length];
    const newChord = this.barI % chordBars === 0, dens = p.density;

    if (sec.pad && newChord) this.pad(t0, ch.tones, beat * 4 * chordBars, (amb ? 0.3 : st.id === 'jazz' ? 0 : 0.1) * fadeK);
    if (amb) {
      if (sec.bass && newChord) this.bass(t0, ch.root, beat * 7.5, 0.13 * fadeK, true);
      if (sec.ep) { const n = 1 + Math.floor(this.r(0, 2 + dens * 3)); for (let i = 0; i < n; i++) { const m = this.pick(ch.tones) + (this.rng() < 0.4 ? 12 : 0); this.ep(t0 + this.r(0, beat * 4), m, 3.5, this.r(0.4, 0.75) * fadeK, true); } }
      if (sec.lead && this.rng() < 0.3 + dens * 0.3) this.bell(t0 + this.r(0, beat * 3), ch.tones[ch.tones.length - 1] + 12, this.r(0.16, 0.28) * fadeK);
    } else if (st.id === 'jazz') {
      // ウォーキングベース: 根音 → 和音の音 → 5度 → 次の根音への半音接近
      if (sec.bass) { const walk = [ch.root, ch.root + (ch.type.startsWith('m') ? 3 : 4), ch.root + 7, next.root + (this.rng() < 0.5 ? 1 : -1)];
        if (this.rng() < 0.35) walk[1] = ch.root + 2; for (let b = 0; b < 4; b++) this.bass(at(b * 4), walk[b] + (walk[b] < 40 ? 12 : 0), beat * 0.92, 0.19 * fadeK, false); }
      if (sec.ep) { const hits = this.rng() < 0.5 ? [2, 10] : this.rng() < 0.5 ? [6, 14] : [0, 6]; for (const h of hits) if (this.rng() < 0.55 + dens * 0.4) this.strum(at(h), ch.tones, beat * 0.9, this.r(0.34, 0.5) * fadeK, 0.012); }
      if (sec.drums && p.drums) { for (const s of [0, 4, 6, 8, 12, 14]) this.ride(at(s), (s % 4 === 0 ? 0.2 : 0.13) * fadeK); this.hat(at(4), 0.12 * fadeK, false); this.hat(at(12), 0.12 * fadeK, false);
        if (this.rng() < 0.5) this.snare(at(this.pick([6, 10, 14])), 0.1 * fadeK, true); if (this.barI % 4 === 0) this.kick(at(0), 0.14 * fadeK); }
      if (sec.lead && this.rng() < 0.45 + dens * 0.3) this.phrase(at, ch, S, beat, 0.3 * fadeK, 'vibe', 8);
    } else {
      const lofi = st.id === 'lofi';
      if (sec.ep) for (const h of S.epHits) { if (h > 0 && this.rng() > 0.35 + dens * 0.6) continue; this.strum(at(h), ch.tones, lofi ? beat * 2 : beat * 0.6, (h === 0 ? 0.46 : 0.32) * fadeK, lofi ? 0.022 : 0.006); }
      if (sec.bass) S.bassPat.forEach((s, i) => { const m = i === 0 ? ch.root : this.pick([ch.root, ch.root + 12, ch.root + 7, ch.root]); const nx = S.bassPat[i + 1] ?? 16;
        this.bass(at(s), i === S.bassPat.length - 1 && this.rng() < 0.4 ? next.root + (this.rng() < 0.5 ? -1 : 2) : m, Math.min(beat * 1.6, (nx - s) * step * (lofi ? 0.95 : 0.7)), (lofi ? 0.15 : 0.115) * fadeK, lofi); });
      if (sec.drums && p.drums) {
        for (const k of S.kick) if (k === 0 || this.rng() < 0.85) this.kick(at(k), (lofi ? 0.24 : 0.21) * fadeK);
        this.snare(at(4), (lofi ? 0.3 : 0.34) * fadeK, lofi); this.snare(at(12), (lofi ? 0.3 : 0.34) * fadeK, lofi);
        if (this.rng() < 0.2) this.snare(at(15), 0.1 * fadeK, true);
        const hs = lofi ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        for (const h of hs) { if (!lofi && h % 2 === 1 && this.rng() > 0.35 + dens * 0.6) continue; const open = !lofi && h % 4 === 2 && this.rng() < 0.3;
          this.hat(at(h), (h % 4 === 0 ? 0.15 : h % 2 === 0 ? 0.11 : 0.06) * (lofi ? 0.8 : 1) * fadeK, open); }
      }
      if (sec.lead && this.barI % 2 === 0 && this.rng() < 0.4 + dens * 0.45) this.phrase(at, ch, S, beat, (lofi ? 0.3 : 0.3) * fadeK, lofi ? 'vibe' : 'synth', lofi ? 4 : 7);
      if (lofi && p.texture > 0) { const n = Math.floor(this.r(0, 5 * p.texture)); for (let i = 0; i < n; i++) this.crackle(t0 + this.r(0, beat * 4), this.r(0.01, 0.035) * p.texture); }
    }
    this.nextBar = t0 + beat * 4; this.barI++;
    if (this.barI >= sec.bars) { this.barI = 0; this.secI++; if (this.secI >= S.sections.length) { this.song = null; this.nextBar += 1.6; } }
  }
  /** 旋律: 曲ごとの動機（五音音階上の形）を、その小節の和音に合わせて置く */
  private phrase(at: (i: number) => number, ch: Chord, S: Song, beat: number, vel: number, kind: 'vibe' | 'synth', maxN: number) {
    const n = 2 + Math.floor(this.r(0, maxN - 1)); let step = this.pick([0, 2, 4, 6]); let idx = this.pick(S.motif);
    for (let i = 0; i < n && step < 16; i++) {
      idx += this.pick([-2, -1, -1, 1, 1, 2]); idx = Math.max(-2, Math.min(9, idx));
      let m = S.key + 48 + 12 * Math.floor(idx / 5) + PENTA[((idx % 5) + 5) % 5];
      if (i === n - 1 || this.rng() < 0.35) { const tg = ch.tones.map(x => x + 12).reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a); m = tg; }   // 区切りは和音の音に着地
      const len = this.pick([1, 2, 2, 3, 4]); this.lead(at(step), m, len * beat / 4 * 0.95, vel * this.r(0.7, 1), kind); step += len;
    }
  }

  /* ---------------- 楽器 ---------------- */
  private env(g: AudioParam, t: number, a: number, peak: number, d: number, sustain = 0.0001) { g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d); }
  private pan(node: AudioNode, x: number, dest: AudioNode = this.mix) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); node.connect(p); p.connect(dest); return p; }
  private strum(t: number, tones: number[], dur: number, vel: number, gap: number) { tones.forEach((m, i) => this.ep(t + i * gap, m, dur, vel * (0.85 + 0.15 * this.rng()), false)); }
  /** エレクトリックピアノ: FM2オペレータ。打鍵直後だけ倍音が多く、すぐ丸くなる。 */
  private ep(t: number, midi: number, dur: number, vel: number, echo: boolean) {
    if (vel <= 0.001) return; const C = this.ctx, f = mtof(midi), end = t + dur + 1.6;
    const car = C.createOscillator(); car.frequency.value = f; const mod = C.createOscillator(); mod.frequency.value = f; const mg = C.createGain();
    mg.gain.setValueAtTime(f * (1.2 + vel * 2.6), t); mg.gain.exponentialRampToValueAtTime(f * 0.5, t + 0.7);
    const tine = C.createOscillator(); tine.frequency.value = f * 13.9; const tg = C.createGain(); tg.gain.setValueAtTime(f * 0.5 * vel, t); tg.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    mod.connect(mg); mg.connect(car.frequency); tine.connect(tg); tg.connect(car.frequency);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.006); g.gain.exponentialRampToValueAtTime(vel * 0.16, t + Math.min(dur, 0.9)); g.gain.exponentialRampToValueAtTime(0.0001, end);
    car.connect(g); const pn = this.pan(g, (midi - 63) / 14 + this.r(-0.25, 0.25)); pn.connect(this.verbIn); if (echo) pn.connect(this.echoIn);
    for (const o of [car, mod, tine]) { o.start(t); o.stop(end + 0.05); }
  }
  /** パッド: わずかにずらしたノコギリ波を重ね、ゆっくり開閉するフィルタに通す */
  private pad(t: number, tones: number[], dur: number, vel: number) {
    if (vel <= 0.001) return; const C = this.ctx, end = t + dur + 1.8, br = radioParams.bright;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.frequency.setValueAtTime(700 + br * 900, t); lp.frequency.linearRampToValueAtTime(1500 + br * 2600, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(800 + br * 900, end);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(1.4, dur * 0.4)); g.gain.setValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, end);
    lp.connect(g); g.connect(this.mix); g.connect(this.verbIn);
    for (const m of tones) for (const dt of [-7, 6]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt + this.r(-2, 2); const og = C.createGain(); og.gain.value = 0.25; o.connect(og); this.pan(og, dt < 0 ? -0.85 : 0.85, lp); o.start(t); o.stop(end + 0.05); }
  }
  private bass(t: number, midi: number, dur: number, vel: number, round: boolean) {
    if (vel <= 0.001) return; const C = this.ctx; while (midi > 50) midi -= 12; while (midi < 28) midi += 12; const f = mtof(midi), end = t + dur + 0.12;
    const o = C.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const o2 = C.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f; const g2 = C.createGain(); g2.gain.value = round ? 0.18 : 0.45;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = round ? 420 : 900; lp.Q.value = 0.7;
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.012); g.gain.exponentialRampToValueAtTime(vel * 0.6, t + Math.max(0.05, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.mix);
    for (const x of [o, o2]) { x.start(t); x.stop(end + 0.05); }
  }
  private lead(t: number, midi: number, dur: number, vel: number, kind: 'vibe' | 'synth') {
    if (vel <= 0.001) return; const C = this.ctx, f = mtof(midi), end = t + dur + (kind === 'vibe' ? 1.4 : 0.35);
    const g = C.createGain(); const o = C.createOscillator(); o.frequency.value = f; let srcs: OscillatorNode[] = [o];
    if (kind === 'vibe') {     // ヴィブラフォン風: 正弦波＋4倍音、ゆっくりしたトレモロ
      const h = C.createOscillator(); h.frequency.value = f * 4; const hg = C.createGain(); hg.gain.setValueAtTime(0.22, t); hg.gain.exponentialRampToValueAtTime(0.001, t + 0.35); h.connect(hg); hg.connect(g); srcs.push(h);
      const tr = C.createOscillator(); tr.frequency.value = 4.6; const tg = C.createGain(); tg.gain.value = vel * 0.1; tr.connect(tg); tg.connect(g.gain); srcs.push(tr);
      o.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.7, t + 0.004); g.gain.exponentialRampToValueAtTime(vel * 0.2, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {                   // シンセリード: 三角波＋遅れてかかるビブラート
      o.type = 'triangle'; const o2 = C.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 6; const o2g = C.createGain(); o2g.gain.value = 0.22; srcs.push(o2);
      const vib = C.createOscillator(); vib.frequency.value = 5.4; const vg = C.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(dur, 0.4)); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency); srcs.push(vib);
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + radioParams.bright * 2600; lp.Q.value = 1.2; o.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.02); g.gain.setValueAtTime(vel * 0.42, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    const pn = this.pan(g, this.r(-0.25, 0.25)); pn.connect(this.echoIn); pn.connect(this.verbIn);
    for (const s of srcs) { s.start(t); s.stop(end + 0.05); }
  }
  private bell(t: number, midi: number, vel: number) {
    const C = this.ctx, f = mtof(midi), end = t + 5; const car = C.createOscillator(); car.frequency.value = f; const mod = C.createOscillator(); mod.frequency.value = f * 3.51; const mg = C.createGain();
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5); mod.connect(mg); mg.connect(car.frequency);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, end); car.connect(g);
    const pn = this.pan(g, this.r(-0.6, 0.6)); pn.connect(this.echoIn); pn.connect(this.verbIn); for (const o of [car, mod]) { o.start(t); o.stop(end + 0.05); }
  }
  private nz(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.001) {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noise; const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur); s.connect(f); f.connect(g); s.start(t, this.rng() * 1.5, dur + attack + 0.05); return g;
  }
  private kick(t: number, vel: number) {
    const C = this.ctx, o = C.createOscillator(); o.frequency.setValueAtTime(118, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11); const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(this.mix); o.start(t); o.stop(t + 0.35);
    this.nz(t, 0.012, 'lowpass', 1800, 0.5, vel * 0.12).connect(this.mix);
  }
  private snare(t: number, vel: number, soft: boolean) {
    const C = this.ctx; const n = this.nz(t, soft ? 0.2 : 0.14, 'bandpass', soft ? 1300 : 1900, 0.6, vel * 1.5, soft ? 0.004 : 0.001); this.pan(n, 0.08); n.connect(this.verbIn);
    const o = C.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(205, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.07); const g = C.createGain(); g.gain.setValueAtTime(vel * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(g); g.connect(this.mix); o.start(t); o.stop(t + 0.12);
  }
  private hat(t: number, vel: number, open: boolean) { this.pan(this.nz(t, open ? 0.2 : 0.035, 'highpass', 7200, 0.7, vel), 0.4); }
  private ride(t: number, vel: number) { this.pan(this.nz(t, 0.42, 'bandpass', 5600, 1.1, vel), -0.3); this.pan(this.nz(t, 0.02, 'highpass', 9000, 0.7, vel * 0.8), -0.3); }
  private crackle(t: number, vel: number) { this.pan(this.nz(t, 0.004, 'bandpass', this.r(1800, 5200), 1.5, vel, 0.0005), this.r(-0.7, 0.7)); }

  /* ---------------- 走行状態との連携 ---------------- */
  setTunnel(x: number) { this.tunnel = x; }
  /** 継ぎ目を踏んだ時刻（継ぎ目同期用） */
  joint() { const t = this.ctx.currentTime; if (this.jointT > 0) this.jointDt = t - this.jointT; this.jointT = t; }
  /** 次の曲へ */
  skip() { this.song = null; this.nextBar = this.ctx.currentTime + 0.4; }
  station() { return STATIONS.find(s => s.id === radioParams.station)!; }
}
