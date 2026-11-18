// 区間の並びを調べる: 指定したシードで、どの距離にどの区間が出るかを表示する。
//   node scripts/sections.mjs [--seed 7] [--to 30000]
// 確認用シーンの skip= を決めるときに使う。dist/ をビルド済みとみなす。
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { existsSync } from 'node:fs';
const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
const server = await preview({ preview: { port: 4721, strictPort: false } }); const base = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}?seed=${opt('--seed', '7')}&frames=1&skip=${opt('--to', '30000')}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready===true', { timeout: 120000 });
  const secs = await page.evaluate(() => window.__dbg.sections.map(s => ({ type: s.type, start: s.start, len: s.len, mid: s.mid, wa: s.wa, wb: s.wb, lamp: s.lamp })));
  for (const s of secs) console.log(String(s.start).padStart(6), String(s.len).padStart(5), s.type.padEnd(10), s.lamp, s.mid !== undefined ? 'mid=' + (s.start + s.mid) : '', s.wa !== undefined ? `canal=${s.start + s.wa}..${s.start + s.wb}` : '');
  if (errors.length) console.log('ERRORS:', errors.join(' | '));
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
