// End-to-end site check in real headless Chrome (CP8). Deterministic, so it can be re-run.
//   node scripts/check-site.mjs [url]      (default: the live Pages URL)
// 1. Stage sweep at 8 viewports, every caption beat: console errors, failed requests, horizontal
//    overflow, exactly one caption visible, captions inside the area between the HUD bars and
//    clear of the visual frame (the 3D and the sandbox's induction live only there).
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
    // Ready = booted and the hero reveal (dolly-in, captions arriving) has finished.
    await page.waitForFunction(() => document.documentElement.classList.contains('is-revealed') && window.__stage && window.__field?.world(), {
      timeout: 30000,
    });
  } catch {
    note(`${tag}: stage never became ready (boot still present or world missing)`);
    await page.close();
    continue;
  }
  const beats = await page.evaluate(() => window.__stage.beats().map((b) => b.scene));
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-scene]')].map((s) => s.id));
  for (let k = 0; k < beats.length; k++) {
    await page.evaluate((k) => window.__stage.beat(k), k);
    // The caption waits for the Rotor to dial its word, then reads itself off the discs.
    const read = await page
      .waitForFunction(() => document.querySelector('.scene.is-active .beat.is-current.is-read'), { timeout: 6000 })
      .then(() => true, () => false);
    if (!read) note(`${tag} beat ${k}: caption never revealed`);
    await sleep(300);
    const r = await page.evaluate(() => {
      window.__field.frames(4);
      document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).forEach((a) => a.finish()); // settle caption fades
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const scene = document.querySelector('.scene.is-active');
      const current = [...scene.querySelectorAll('.beat')].filter((b) => getComputedStyle(b).visibility === 'visible' && +getComputedStyle(b).opacity > 0.5);
      const box = (el) => el.getBoundingClientRect();
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const texts = current
        .flatMap((b) => [...b.querySelectorAll('h1, h2, p, pre, .btn, .tau')])
        .filter((el) => el.offsetParent && box(el).width && box(el).height);
      const top = box(document.querySelector('.hud__top')).bottom;
      const bottom = box(document.querySelector('.hud__bottom')).top;
      const frame = box(document.querySelector('[data-visual-frame]'));
      const paper = scene.classList.contains('scene--paper');
      const label = (el) => el.tagName + ':' + el.textContent.trim().slice(0, 30);
      return {
        id: scene.id,
        shown: current.length,
        overflow: document.documentElement.scrollWidth > vw,
        escaping: texts.filter((el) => box(el).right > vw + 1 || box(el).left < -1 || box(el).top < top - 1 || box(el).bottom > bottom + 1).map(label),
        // Text never runs under the visual: captions keep to their column, visuals to their frame.
        onVisual: paper ? [] : texts.filter((el) => hit(box(el), frame)).map(label),
      };
    });
    const where = `${tag} ${r.id} beat ${k}`;
    if (r.id !== ids[beats[k]]) note(`${where}: landed on ${r.id}, expected ${ids[beats[k]]}`);
    if (r.shown !== 1) note(`${where}: ${r.shown} caption beats visible (expected 1)`);
    if (r.overflow) note(`${where}: horizontal page overflow`);
    if (r.escaping.length) note(`${where}: text outside the caption area → ${r.escaping.slice(0, 3).join(' | ')}`);
    if (r.onVisual.length) note(`${where}: text over the visual frame → ${r.onVisual.slice(0, 3).join(' | ')}`);
  }
  // Movie mode: no native scroll, and one trackpad flick (a burst of wheel events) = one beat.
  const movie = await page.evaluate(async () => {
    window.__stage.jump(0);
    const before = window.__stage.beats().findIndex((b) => b.p === window.__stage.playhead.p);
    for (let k = 0; k < 25; k++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, cancelable: true }));
      await new Promise((r) => setTimeout(r, 16));
    }
    for (let t = 0; t < 80 && window.__stage.playhead.moving; t++) await new Promise((r) => setTimeout(r, 100));
    const p = window.__stage.playhead.p;
    const beats = window.__stage.beats();
    const after = beats.reduce((best, b, i) => (Math.abs(b.p - p) < Math.abs(beats[best].p - p) ? i : best), 0);
    return { before, after, scrollable: document.documentElement.scrollHeight > window.innerHeight + 1 && getComputedStyle(document.documentElement).overflow !== 'hidden' };
  });
  if (movie.after - movie.before !== 1) note(`${tag}: one wheel flick moved ${movie.after - movie.before} beats (expected 1)`);
  if (movie.scrollable) note(`${tag}: the stage still scrolls natively`);
  const entry = await page.evaluate(() =>
    document.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable]').length,
  );
  if (entry) note(`${tag}: ${entry} text-entry control(s) present — demo contract`);
  if (errors.length) note(`${tag}: console/page errors → ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  if (failed.length) note(`${tag}: failed requests → ${failed.slice(0, 3).join(' | ')}`);
  console.log(`stage ${tag}: checked ${beats.length} beats`);
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
