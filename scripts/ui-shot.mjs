// 設定画面の確認: 実走行中にヘッドユニットを開き、各タブを撮影する。プリセット適用も試す。
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
const tabs = (process.argv[2] || 'RADIO,VIEW,MEMORY').split(',');
mkdirSync('shots/ui', { recursive: true });
const server = await preview({ preview: { port: 4723, strictPort: false } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1280,720', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + '?seed=7', { waitUntil: 'load' });
  await page.waitForFunction('!document.getElementById("go").disabled', { timeout: 60000 });
  await page.click('#go'); await new Promise(r => setTimeout(r, 2500));
  await page.keyboard.press('Tab'); await new Promise(r => setTimeout(r, 700));
  for (const t of tabs) { await page.click(`.hu-tab[data-tab=${t}]`); await new Promise(r => setTimeout(r, 400)); await page.screenshot({ path: `shots/ui/${t}.png` }); }
  // プリセットを順に適用し、例外が出ないことと値が変わることを確かめる
  const res = await page.evaluate(async () => { const s = window.__dbg.settings, out = [];
    for (const p of s.presets()) { s.applyPreset(p.values); await new Promise(r => setTimeout(r, 250)); out.push(p.name + ':' + Object.keys(s.diff()).length); }
    s.resetAll(); return out.join('  '); });
  console.log('presets →', res);
  await new Promise(r => setTimeout(r, 1500));
  console.log('radio →', await page.evaluate(() => { const d = window.__dbg; return d.radioNow ? d.radioNow() : ''; }));
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
