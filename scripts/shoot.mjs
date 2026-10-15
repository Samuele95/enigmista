// Screenshot every beat of every scene at the given viewport, for visual review.
//   node scripts/shoot.mjs <url> <outdir> <w>x<h> [scene ids…]
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:4173/enigmista/', out = 'shots', size = '1440x900', ...only] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
await page.goto(`${url}?debug`, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('[data-boot]') && window.__stage && window.__field?.world(), { timeout: 30000 });
const scenes = await page.evaluate(() => [...document.querySelectorAll('[data-scene]')].map((s) => [s.id, s.querySelectorAll('.scene__body > .beat').length]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(JSON.stringify(scenes));
for (const [i, [id, n]] of scenes.entries()) {
  if (only.length && !only.includes(id)) continue;
  for (let k = 0; k < n; k++) {
    await page.evaluate((i, k) => {
      const first = window.__stage.beats().findIndex((b) => b.scene === i);
      window.__stage.beat(first + k);
    }, i, k);
    await sleep(1800);
    await page.evaluate(() => window.__field.frames(40, 33));
    await page.screenshot({ path: `${out}/${w}-${String(i)}${id}-${k}.png` });
  }
}
await browser.close();
