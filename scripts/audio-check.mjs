// 音の数値検証: 各局と環境音を OfflineAudioContext で書き出し、音量・ピーク・帯域の偏り・無音区間を調べる。
//   node scripts/audio-check.mjs [--sec 40]
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
const sec = parseFloat(opt('--sec', '40'));
const server = await preview({ preview: { port: 4722, strictPort: false } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await page.goto(server.resolvedUrls.local[0] + '?seed=7&frames=1', { waitUntil: 'load' });
  await page.waitForFunction('window.__ready===true', { timeout: 60000 });
  const analyse = `
    function analyse(buf){
      const L=buf.getChannelData(0), R=buf.numberOfChannels>1?buf.getChannelData(1):L, n=L.length, sr=buf.sampleRate;
      let peak=0, sum=0, nan=0, diff=0; for(let i=0;i<n;i++){ const a=L[i], b=R[i]; if(!(a===a)||!(b===b)) nan++; const m=Math.max(Math.abs(a),Math.abs(b)); if(m>peak) peak=m; sum+=(a*a+b*b)/2; diff+=(a-b)*(a-b)/4; }
      const win=sr, silent=[]; for(let s=0;s+win<=n;s+=win){ let e=0; for(let i=s;i<s+win;i++) e+=L[i]*L[i]; if(10*Math.log10(e/win+1e-12)<-55) silent.push(Math.round(s/sr)); }
      // 帯域ごとのエネルギー（4096点FFTを間引いて平均）
      const N=4096, re=new Float32Array(N), im=new Float32Array(N), bands=[0,0,0,0]; let frames=0;
      for(let s=0;s+N<=n;s+=N*6){ for(let i=0;i<N;i++){ re[i]=(L[s+i]+R[s+i])*0.5*(0.5-0.5*Math.cos(2*Math.PI*i/N)); im[i]=0; }
        for(let i=1,j=0;i<N;i++){ let bit=N>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit; if(i<j){ const t=re[i]; re[i]=re[j]; re[j]=t; } }
        for(let len=2;len<=N;len<<=1){ const ang=-2*Math.PI/len; for(let i=0;i<N;i+=len){ for(let k=0;k<len/2;k++){ const wr=Math.cos(ang*k), wi=Math.sin(ang*k); const a=i+k,b=a+len/2; const xr=re[b]*wr-im[b]*wi, xi=re[b]*wi+im[b]*wr; re[b]=re[a]-xr; im[b]=im[a]-xi; re[a]+=xr; im[a]+=xi; } } }
        for(let k=1;k<N/2;k++){ const f=k*sr/N, p=re[k]*re[k]+im[k]*im[k]; bands[f<150?0:f<800?1:f<4000?2:3]+=p; } frames++; }
      const tot=bands.reduce((a,b)=>a+b,0)||1;
      return { rms: 10*Math.log10(sum/n+1e-12), peak: 20*Math.log10(peak+1e-9), nan, width: 10*Math.log10(diff/n+1e-12)-10*Math.log10(sum/n+1e-12), silent, bands: bands.map(b=>Math.round(b/tot*100)) };
    }`;
  const fmt = (name, r) => console.log(`${name.padEnd(22)} RMS ${r.rms.toFixed(1).padStart(6)} dB  peak ${r.peak.toFixed(1).padStart(6)} dB  帯域% 低${String(r.bands[0]).padStart(3)} 中低${String(r.bands[1]).padStart(3)} 中高${String(r.bands[2]).padStart(3)} 高${String(r.bands[3]).padStart(3)}  広がり ${r.width.toFixed(1)} dB  無音秒 [${r.silent.join(',')}]${r.nan ? '  NaN=' + r.nan : ''}`);
  for (const st of ['lofi', 'ambient', 'groove', 'jazz']) {
    const r = await page.evaluate(async (st, sec, analyse) => { eval(analyse);
      const d = window.__dbg, C = new OfflineAudioContext(2, 44100 * sec, 44100); Object.assign(d.radioParams, { station: st, volume: 0.5 });
      const radio = new d.Radio(C, C.destination); radio.start(); radio.schedule(sec + 1); const buf = await C.startRendering(); return Object.assign(analyse(buf), { title: radio.title }); }, st, sec, analyse);
    fmt('radio:' + st, r); 
  }
  for (const [name, st] of [['amb:晴れ70km/h', { v: 19.4, acc: 0, tunnel: 0, wet: 0, rain: 0, dt: 1 / 60 }], ['amb:雨', { v: 19.4, acc: 0, tunnel: 0, wet: 1, rain: 0.85, dt: 1 / 60 }], ['amb:トンネル', { v: 18.3, acc: 0, tunnel: 1, wet: 0, rain: 0, dt: 1 / 60 }], ['amb:EV', { v: 19.4, acc: 0.3, tunnel: 0, wet: 0, rain: 0, dt: 1 / 60, ev: true }]]) {
    const r = await page.evaluate(async (st, analyse) => { eval(analyse);
      const d = window.__dbg, C = new OfflineAudioContext(2, 44100 * 12, 44100); const s = new d.Sound(); s.start(C); if (st.ev) s.mix.engineType = 'ev';
      for (let i = 0; i < 300; i++) s.update(st); s.joint(st.v); const buf = await C.startRendering();
      const cut = C.createBuffer(2, 44100 * 6, 44100); for (let ch = 0; ch < 2; ch++) cut.getChannelData(ch).set(buf.getChannelData(ch).subarray(44100 * 6)); return analyse(cut); }, st, analyse);
    fmt(name, r);
  }
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
