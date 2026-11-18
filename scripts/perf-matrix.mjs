// 負荷の切り分け: 要素を1つずつ無効にしてFPSを比べる。
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => p && existsSync(p));
const q = opt('--q', 'seed=7'), sec = parseFloat(opt('--sec', '5'));
const RS = 'window.dispatchEvent(new Event("resize"))';
const VARIANTS = {
  baseline: ['', ''],
  bloomOff: ['d.post.bloom=false', 'd.post.bloom=true'],
  msaaOff: ['d.post.samples=0;' + RS, 'd.post.samples=4;' + RS],
  interiorOff: ['d.interiorPass.enabled=false', 'd.interiorPass.enabled=true'],
  mirrorOff: ['d.dbg.noMirror=true', 'd.dbg.noMirror=false'],
  skylineOff: ['d.world.skyline.visible=false', 'd.world.skyline.visible=true'],
  groundOff: ['d.world.ground.visible=false', 'd.world.ground.visible=true'],
  skyOff: ['d.world.sky.visible=false', 'd.world.sky.visible=true'],
  chunksOff: ['for(const c of d.chunks.values()) c.g.visible=false', 'for(const c of d.chunks.values()) c.g.visible=true'],
  nothing: ['d.scene.visible=false; d.post.bloom=false; d.dbg.noMirror=true; d.interiorPass.enabled=false', 'd.scene.visible=true; d.post.bloom=true; d.dbg.noMirror=false; d.interiorPass.enabled=true'],
};
const scale = parseFloat(opt('--scale', '1'));
const only = opt('--only', null);
const server = await preview({ preview: { port: 4721, strictPort: false } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1920,1080', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await page.goto(server.resolvedUrls.local[0] + '?' + q, { waitUntil: 'load' });
  await page.waitForFunction('!document.getElementById("go").disabled', { timeout: 120000 });
  await page.click('#go');
  await page.evaluate(sc => { const d = window.__dbg; d.autoscale.enabled = false; d.post.scale = sc; window.dispatchEvent(new Event('resize')); }, scale);
  await new Promise(r => setTimeout(r, 2500));
  for (const [name, [on, off]] of Object.entries(VARIANTS)) {
    if (only && !only.split(',').includes(name)) continue;
    await page.evaluate(c => { const d = window.__dbg; eval(c); window.__dbg.ego.v = 0.0001; }, on);
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => window.__perf.reset());
    await new Promise(r => setTimeout(r, sec * 1000));
    const s = await page.evaluate(() => window.__perf.stats());
    const g = await page.evaluate(() => window.__dbg.autoscale.gpuMs);
    console.log(`${name.padEnd(12)} ${s.avg.toFixed(1).padStart(6)} ms  ${s.fps.toFixed(1).padStart(5)} fps   cpu ${s.cpuAvg.toFixed(1).padStart(5)}  gpu ${g.toFixed(1).padStart(5)}`);
    await page.evaluate(c => { const d = window.__dbg; eval(c); }, off);
  }
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
