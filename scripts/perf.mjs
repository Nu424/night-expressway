// 実走行の計測: 実際のループを指定秒数まわし、フレーム時間とチャンク生成時間を出力する。
//   node scripts/perf.mjs [--sec 40] [--q "seed=7&rain=1"] [--legacy は非対応]
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
const sec = parseFloat(opt('--sec', '40')), q = opt('--q', 'seed=7');
const server = await preview({ preview: { port: 4720, strictPort: false } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--window-size=1920,1080', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + '?' + q, { waitUntil: 'load' });
  await page.waitForFunction('!document.getElementById("go").disabled', { timeout: 120000 });
  await page.click('#go');
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => window.__perf.reset());
  await new Promise(r => setTimeout(r, sec * 1000));
  const out = await page.evaluate(() => ({ perf: window.__perf.stats(), scale: window.__dbg.autoscale.scale, gpuMs: window.__dbg.autoscale.gpuMs, timer: window.__dbg.autoscale.hasGpuTimer, km: window.__dbg.ego.s / 1000,
    gpu: (() => { const gl = window.__dbg.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })(),
    calls: window.__dbg.renderer.info.render.calls, tris: window.__dbg.renderer.info.render.triangles }));
  const s = out.perf, f = v => v.toFixed(1);
  console.log(`GPU: ${out.gpu}`);
  console.log(`内部解像度 ${Math.round(out.scale * 100)}%  GPU時間 ${out.timer ? out.gpuMs.toFixed(1) + ' ms' : '計測不可'}`);
  console.log(`1920x1080 / ${sec}s / ${q} / 走行 ${out.km.toFixed(2)} km`);
  console.log(`FPS ${f(s.fps)}  フレーム間隔 avg ${f(s.avg)} p50 ${f(s.p50)} p99 ${f(s.p99)} max ${f(s.max)} ms（直近600フレーム）`);
  console.log(`処理時間 avg ${f(s.cpuAvg)} max ${f(s.cpuMax)} ms  33ms超 ${s.hitches}/${s.frames} フレーム`);
  console.log(`チャンク生成 max ${f(s.chunkMax)} ms (${s.chunkCount} 個)`);
  if (errors.length) console.log('ERRORS:', errors.join(' | '));
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
