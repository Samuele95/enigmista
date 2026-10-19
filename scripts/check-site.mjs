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
  protocolTimeout: 900000, // the paging walk runs for several minutes in one evaluate
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
// ONLY_PAGING=1 skips this sweep (and reduced motion) to run just the paging walk.
for (const vp of process.env.ONLY_PAGING ? [] : VIEWPORTS) {
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

// ── 1b. Paging: walk the whole film with real input, one beat at a time, and back ──────
// At every stop: the playhead rests on the expected beat (none skipped, none doubled), exactly
// one caption shows and it is that beat, the HUD counter names its chapter, and a gated beat's
// readout has dialled its word before the text appears (except `refine`, whose discs keep
// reconsidering by design).
for (const vp of [[1440, 900], [375, 812]]) {
  const tag = `paging ${vp[0]}×${vp[1]}`;
  const { page, errors } = await open(vp);
  await page.waitForFunction(() => document.documentElement.classList.contains('is-revealed') && window.__stage, { timeout: 30000 });
  const report = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const st = window.__stage;
    const beats = st.beats();
    const scenes = [...document.querySelectorAll('[data-scene]')];
    const nearest = () => beats.reduce((best, b, i) => (Math.abs(b.p - st.playhead.p) < Math.abs(beats[best].p - st.playhead.p) ? i : best), 0);
    const settle = async () => {
      for (let t = 0; t < 100 && st.playhead.moving; t++) await wait(80);
      for (let t = 0; t < 80 && !document.querySelector('.scene.is-active .beat.is-current.is-read'); t++) await wait(80);
      await wait(150);
    };
    const flick = async (dir) => {
      for (let i = 0; i < 12; i++) {
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 * dir, cancelable: true }));
        await wait(16);
      }
      await wait(320); // the gesture ends
    };
    const key = (k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const look = (k) => {
      const b = beats[k];
      const scene = scenes[b.scene];
      const local = k - beats.findIndex((x) => x.scene === b.scene);
      const els = [...scene.querySelectorAll('.scene__body > .beat')];
      const shown = [...document.querySelectorAll('.scene .beat')].filter((e) => getComputedStyle(e).visibility === 'visible' && e.classList.contains('is-current'));
      const word = els[local]?.dataset.word;
      const cells = [...(els[local]?.querySelectorAll('.readout__cell') ?? [])].map((c) => c.textContent || ' ').join('').trim();
      const problems = [];
      if (!scene.classList.contains('is-active')) problems.push(`scene ${scene.id} not active`);
      if (shown.length !== 1 || shown[0] !== els[local]) problems.push(`showing ${shown.length} captions, not beat ${local} of ${scene.id}`);
      const count = document.querySelector('[data-count]').textContent.trim();
      if (!count.startsWith(String(b.scene + 1).padStart(2, '0'))) problems.push(`counter reads ${count}`);
      if (word && !word.startsWith('~') && word !== 'refine' && cells && cells !== word) problems.push(`readout "${cells}" ≠ "${word}"`);
      return { k, at: `${scene.id}#${local}`, text: (els[local]?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 48), problems };
    };
    const log = [];
    const walk = async (dir, n, how) => {
      for (let i = 0; i < n; i++) {
        const before = nearest();
        if (how === 'wheel') await flick(dir);
        else key(dir > 0 ? 'ArrowDown' : 'ArrowUp');
        await settle();
        const after = nearest();
        const r = look(after);
        if (after - before !== dir) r.problems.push(`${how} ${dir > 0 ? 'forward' : 'back'} moved ${after - before} beats (from ${before})`);
        log.push({ how, ...r });
      }
    };
    st.jump(0);
    await settle();
    log.push({ how: 'start', ...look(nearest()) });
    await walk(1, beats.length - 1, 'wheel');
    await walk(-1, beats.length - 1, 'wheel');
    await walk(1, 6, 'key');
    await walk(-1, 6, 'key');
    // PREV / NEXT move by whole chapters.
    for (const [sel, want] of [['[data-next]', 1], ['[data-next]', 2], ['[data-prev]', 1]]) {
      document.querySelector(`.hud ${sel}`).click();
      await settle();
      const r = look(nearest());
      const sceneNow = beats[nearest()].scene;
      if (sceneNow !== want || beats.findIndex((x) => x.scene === want) !== nearest()) r.problems.push(`${sel} landed on ${r.at}, expected chapter ${want} beat 0`);
      log.push({ how: sel, ...r });
    }
    return { total: beats.length, log };
  });
  const bad = report.log.filter((r) => r.problems.length);
  bad.forEach((r) => note(`${tag} ${r.how} → ${r.at}: ${r.problems.join('; ')}`));
  if (errors.length) note(`${tag}: console/page errors → ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  const seq = report.log.filter((r) => r.how === 'wheel').slice(0, report.total - 1).map((r) => r.at);
  console.log(`${tag}: ${report.log.length} stops, ${bad.length} with problems; forward order ${seq.join(' ')}`);
  await page.close();
}

// ── 2. Reduced motion ───────────────────────────────────────────────────
for (const vp of process.env.ONLY_PAGING ? [] : [[375, 812], [1280, 800]]) {
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
