// 定点撮影: 同じシード・同じフレーム数で各シーンの静止画を出力する。
//   node scripts/shots.mjs [--legacy] [--out shots/name] [--url http://localhost:5183/]
// 既定では dist/ をビルド済みとみなして vite preview を内部で起動する。
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && existsSync(p));
if (!CHROME) { console.error('Chrome が見つかりません。CHROME_PATH を指定してください。'); process.exit(1); }

export const SCENES = [
  { name: 'city',    q: 'seed=7&frames=200' },
  { name: 'rain',    q: 'seed=7&frames=600&rain=1' },
  { name: 'tunnel',  q: 'seed=7&frames=60&skip=3300' },
  { name: 'bay',     q: 'seed=7&frames=60&skip=7500' },
  { name: 'dashcam', q: 'seed=7&frames=200&clean=1' },
  { name: 'debug',   q: 'seed=7&frames=60&debug=1' },
];

const only = opt('--only', null);
const outDir = resolve(opt('--out', flag('--legacy') ? 'shots/legacy' : 'shots/current'));
mkdirSync(outDir, { recursive: true });

let server = null, base = opt('--url', null);
if (flag('--legacy')) base = pathToFileURL(resolve('legacy/night-expressway-simulator.html')).href;
else if (!base) { server = await preview({ preview: { port: 4719, strictPort: false } }); base = server.resolvedUrls.local[0]; }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--window-size=1280,720', '--hide-scrollbars', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
try {
  for (const sc of SCENES) {
    if (only && !only.split(',').includes(sc.name)) continue;
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(base + (base.includes('?') ? '&' : '?') + sc.q, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready===true', { timeout: 120000 });
    const data = await page.evaluate(() => { window.__step(1); return document.getElementById('c').toDataURL('image/png'); });
    writeFileSync(resolve(outDir, sc.name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log(`${sc.name}: ${Date.now() - t0}ms` + (errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''));
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await new Promise(r => server.httpServer.close(r));
}
