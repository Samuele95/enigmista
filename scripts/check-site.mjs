// End-to-end site check in real headless Chrome (CP8). Deterministic, so it can be re-run.
//   node scripts/check-site.mjs [url]      (default: the live Pages URL)
// 1. Stage sweep at 8 viewports: console errors, failed requests, horizontal overflow, and — per
//    scene — text overlapping the Rotor's anchor (wide layouts) or escaping the viewport.
// 2. Reduced motion (emulated prefers-reduced-motion): calm layout, no boot, no WebGL world, the
//    sandbox shown in its final state, and the page goes quiet (no animation-frame loop).
// 3. Demo contract at runtime: no text-entry control anywhere.
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] ?? 'https://samuele95.github.io/enigmista/';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const VIEWPORTS = [
  [320, 640], [375, 812], [414, 896], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080],
];
const problems = [];
const note = (msg) => problems.push(msg);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open(viewport, { reducedMotion = false, debug = true } = {}) {
  const page = await browser.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await page.setViewport({ width: viewport[0], height: viewport[1], deviceScaleFactor: 1 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // Count animation-frame callbacks, to prove the calm page goes quiet.
  await page.evaluateOnNewDocument(() => {
    window.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => (window.__raf++, cb(t)));
  });
  await page.goto(`${URL}${debug ? '?debug' : ''}`, { waitUntil: 'load' });
  return { page, errors, failed };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Stage sweep ──────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  const tag = `${vp[0]}×${vp[1]}`;
  const { page, errors, failed } = await open(vp);
  try {
    await page.waitForFunction(() => !document.querySelector('[data-boot]') && window.__stage && window.__field?.world(), {
      timeout: 20000,
    });
  } catch {
    note(`${tag}: stage never became ready (boot still present or world missing)`);
    await page.close();
    continue;
  }
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-scene]')].map((s) => s.id));
  for (let i = 0; i < ids.length; i++) {
    await page.evaluate((i) => window.__stage.jump(i), i);
    await sleep(350);
    const r = await page.evaluate(() => {
      window.__field.frames(4);
      const vw = document.documentElement.clientWidth;
      const scene = document.querySelector('.scene.is-active');
      const anchor = scene.querySelector(':scope > .rotor-anchor');
      const a = anchor && getComputedStyle(anchor).display !== 'none' ? anchor.getBoundingClientRect() : null;
      const wide = window.innerWidth >= 1000;
      const texts = [...scene.querySelectorAll('.scene__body :is(h1, h2, h3, p, li, dt, dd, pre, .btn)')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width && r.height && r.bottom > 0 && r.top < window.innerHeight);
      const overlap = a && wide
        ? texts.filter(({ r }) => Math.min(r.right, a.right) - Math.max(r.left, a.left) > 2 && Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top) > 2)
            .map(({ el }) => el.tagName + ':' + el.textContent.trim().slice(0, 30))
        : [];
      const escaping = texts
        .filter(({ el, r }) => (r.right > vw + 1 || r.left < -1) && !el.closest('.inspect, pre'))
        .map(({ el }) => el.tagName + ':' + el.textContent.trim().slice(0, 30));
      return { id: scene.id, overflow: document.documentElement.scrollWidth > vw, overlap, escaping };
    });
    if (r.id !== ids[i]) note(`${tag}: jump(${i}) landed on ${r.id}, expected ${ids[i]}`);
    if (r.overflow) note(`${tag} ${r.id}: horizontal page overflow`);
    if (r.overlap.length) note(`${tag} ${r.id}: text overlaps the Rotor anchor → ${r.overlap.slice(0, 3).join(' | ')}`);
    if (r.escaping.length) note(`${tag} ${r.id}: text escapes the viewport → ${r.escaping.slice(0, 3).join(' | ')}`);
  }
  const entry = await page.evaluate(() =>
    document.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable]').length,
  );
  if (entry) note(`${tag}: ${entry} text-entry control(s) present — demo contract`);
  if (errors.length) note(`${tag}: console/page errors → ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  if (failed.length) note(`${tag}: failed requests → ${failed.slice(0, 3).join(' | ')}`);
  console.log(`stage ${tag}: checked ${ids.length} scenes`);
  await page.close();
}

// ── 2. Reduced motion ───────────────────────────────────────────────────
for (const vp of [[375, 812], [1280, 800]]) {
  const tag = `reduced-motion ${vp[0]}×${vp[1]}`;
  const { page, errors, failed } = await open(vp, { reducedMotion: true, debug: false });
  await sleep(2500);
  const before = await page.evaluate(() => window.__raf);
  await sleep(1500);
  const r = await page.evaluate((before) => ({
    calm: document.documentElement.classList.contains('is-calm'),
    boot: !!document.querySelector('[data-boot]'),
    labels: !!document.querySelector('.world-labels'),
    hud: getComputedStyle(document.querySelector('.hud')).display,
    status: document.querySelector('[data-status]')?.textContent ?? '',
    cands: document.querySelectorAll('.cand').length,
    rafPerSec: (window.__raf - before) / 1.5,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    h1: document.querySelector('#hero h1')?.textContent.trim(),
  }), before);
  if (!r.calm) note(`${tag}: page is not in the calm layout`);
  if (r.boot) note(`${tag}: boot screen still present`);
  if (r.labels) note(`${tag}: 3D world was created`);
  if (r.hud !== 'none') note(`${tag}: stage HUD visible`);
  if (!r.status.startsWith('Induced')) note(`${tag}: sandbox not in its final state ("${r.status}")`);
  if (r.cands !== 8) note(`${tag}: expected 8 sampled candidates, saw ${r.cands}`);
  if (r.rafPerSec > 2) note(`${tag}: still animating (${r.rafPerSec.toFixed(1)} animation frames/s)`);
  if (r.overflow) note(`${tag}: horizontal page overflow`);
  if (r.h1 !== 'Enigmista.') note(`${tag}: hero heading reads "${r.h1}"`);
  if (errors.length) note(`${tag}: console/page errors → ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  if (failed.length) note(`${tag}: failed requests → ${failed.slice(0, 3).join(' | ')}`);
  console.log(`${tag}: calm=${r.calm} rAF/s=${r.rafPerSec.toFixed(1)} sandbox="${r.status.slice(0, 40)}…"`);
  await page.close();
}

await browser.close();
if (problems.length) {
  console.error(`\ncheck-site: FAIL (${problems.length})\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('\ncheck-site: OK');
