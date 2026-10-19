// README + social-preview images, rendered from the real site in headless Chrome.
//   node scripts/readme-assets.mjs [url]     (default: the local preview, http://localhost:4173/enigmista/)
// 1. Screenshots of the key shots (desktop + a phone strip) → .github/readme/shots/
// 2. "Plates": the 3D alone (UI hidden), cropped to the visual frame, at 2× → used by the cards
// 3. banner.png (README header) and social-preview.png (GitHub social card + the site's og:image),
//    composed in HTML with the site's own self-hosted fonts and palette.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] ?? 'http://localhost:4173/enigmista/';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.github/readme');
const SHOTS = join(OUT, 'shots');
const TMP = mkdtempSync(join(tmpdir(), 'enigmista-readme-'));
mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  protocolTimeout: 600000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const magick = (...args) => execFileSync('convert', args);

async function openSite(width, height, scale = 1) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(`${URL}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-revealed') && window.__stage, { timeout: 60000 });
  return page;
}

// Go to a global beat index and wait for its caption to read itself off the drum.
async function beat(page, k, settle = 1600) {
  await page.evaluate((k) => window.__stage.beat(k), k);
  await page
    .waitForFunction(() => document.querySelector('.scene.is-active .beat.is-current.is-read'), { timeout: 8000 })
    .catch(() => console.warn(`beat ${k}: caption not revealed in time`));
  await sleep(settle);
  await page.evaluate(() => window.__field.frames(40, 33));
}

// ── 1. Screenshots ──────────────────────────────────────────────────────
// Global beat indices: hero 0 · structure 1–3 · uses 4–7 · objective 8–10 · method 11–17 ·
// sandbox 18–23 · scope 24–28 · install 29–32.
// CARDS_ONLY=1 skips the screenshots and only re-renders the plates and cards.
const DESKTOP = process.env.CARDS_ONLY ? [] : [
  ['01-hero', 0],
  ['02-structure', 2],
  ['03-uses', 6],
  ['04-distribution', 10],
  ['05-method', 12],
  ['06-sandbox', 20],
  ['07-scope', 24],
  ['08-install', 30],
];
{
  const page = DESKTOP.length ? await openSite(1440, 900) : null;
  for (const [name, k] of DESKTOP) {
    await beat(page, k);
    const png = join(TMP, `${name}.png`);
    await page.screenshot({ path: png });
    magick(png, '-strip', '-quality', '86', join(SHOTS, `${name}.jpg`));
    console.log(`shot ${name}`);
  }
  await page?.close();
}
if (!process.env.CARDS_ONLY) {
  const page = await openSite(390, 844, 2);
  const phones = [];
  for (const [name, k] of [['hero', 0], ['distribution', 9], ['sandbox', 20]]) {
    await beat(page, k);
    const png = join(TMP, `phone-${name}.png`);
    await page.screenshot({ path: png });
    phones.push(png);
  }
  // Three phones side by side on the void, with a gutter.
  magick(
    '-background', '#07080B',
    ...phones.flatMap((p) => ['(', p, '-resize', '390x844', '-bordercolor', '#252B36', '-border', '1', ')']),
    '-splice', '24x0', '+append', '-gravity', 'east', '-splice', '24x0', '-gravity', 'center',
    '-bordercolor', '#07080B', '-border', '0x24', '-strip', '-quality', '86', join(SHOTS, '09-phone.jpg'),
  );
  console.log('shot 09-phone');
  await page.close();
}

// ── 2. Plates: the 3D alone, cropped to the visual frame ───────────────
const HIDE_UI = `.hud, .stage, .world-labels, .tether, .vis-hint, .masthead { opacity: 0 !important; }`;
async function plate(k, name) {
  const page = await openSite(1440, 900, 2);
  await beat(page, k, 2400);
  await page.addStyleTag({ content: HIDE_UI });
  await page.evaluate(() => window.__field.frames(40, 33));
  const r = await page.evaluate(() => {
    const b = document.querySelector('[data-visual-frame]').getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height };
  });
  const file = join(TMP, `plate-${name}.png`);
  await page.screenshot({ path: file, clip: r });
  await page.close();
  console.log(`plate ${name}`);
  return file;
}
const rotorPlate = await plate(0, 'rotor');
const discPlate = await plate(10, 'disc');

// ── 3. Cards ────────────────────────────────────────────────────────────
const font = (pkg, file) => pathToFileURL(join(ROOT, 'node_modules', pkg, 'files', file)).href;
const FONTS = `
  @font-face { font-family: 'Bodoni Moda'; src: url(${font('@fontsource-variable/bodoni-moda', 'bodoni-moda-latin-wght-normal.woff2')}) format('woff2'); font-weight: 400 900; }
  @font-face { font-family: 'Newsreader'; src: url(${font('@fontsource-variable/newsreader', 'newsreader-latin-standard-normal.woff2')}) format('woff2'); font-weight: 200 800; }
  @font-face { font-family: 'Newsreader'; font-style: italic; src: url(${font('@fontsource-variable/newsreader', 'newsreader-latin-standard-italic.woff2')}) format('woff2'); font-weight: 200 800; }
  @font-face { font-family: 'Martian Mono'; src: url(${font('@fontsource/martian-mono', 'martian-mono-latin-400-normal.woff2')}) format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Martian Mono'; src: url(${font('@fontsource/martian-mono', 'martian-mono-latin-500-normal.woff2')}) format('woff2'); font-weight: 500; }`;

// The site's tokens, the HUD's chamfered frame, film grain, and the readout cells (the caption
// component that mirrors the drum's reading row) spelling the name.
const cardCss = (w, h) => `${FONTS}
  :root { --void: #07080b; --ink: #10131a; --rule: #252b36; --ash: #8a8f99; --bone: #e9e4d8; --ember: #e8a33d; --held: #3cc6b4; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}px; height: ${h}px; background: var(--void); overflow: hidden; }
  body { position: relative; color: var(--bone); font-family: 'Newsreader', serif; }
  .plate { position: absolute; top: 0; right: 0; height: 100%; object-fit: cover;
    -webkit-mask-image: linear-gradient(to right, transparent 0%, transparent 8%, #000 42%), linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%);
    -webkit-mask-composite: source-in; mask-composite: intersect; }
  .glow { position: absolute; inset: 0; background: radial-gradient(ellipse 45% 70% at 70% 52%, rgb(232 163 61 / 0.09), transparent 70%); }
  .grain { position: absolute; inset: 0; opacity: 0.09; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgb(0 0 0 / 0.55)); }
  .frame { position: absolute; inset: 14px; border: 1px solid var(--rule);
    clip-path: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px); }
  .corner { position: absolute; font: 500 10px/1 'Martian Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ash); }
  .corner b { color: var(--ember); font-weight: 500; }
  .copy { position: absolute; display: grid; gap: 14px; justify-items: start; }
  .readout { display: flex; gap: 2px; padding: 5px 0; border-block: 1px solid rgb(232 163 61 / 0.55); }
  .readout span { display: grid; place-items: center; width: 26px; height: 32px; background: rgb(16 19 26 / 0.9);
    font: 500 15px/1 'Martian Mono', monospace; color: var(--ember); }
  .readout span:empty { color: transparent; }
  .eyebrow { font: 500 11px/1.4 'Martian Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ember); }
  .wordmark { font-family: 'Bodoni Moda', serif; font-weight: 400; line-height: 0.92; letter-spacing: -0.01em; }
  .wordmark i { font-style: normal; color: var(--ember); }
  .lede { color: rgb(233 228 216 / 0.86); }
  .lede em { color: var(--bone); }
  .tag { font: 500 10px/1.5 'Martian Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: var(--held); }`;
const readout = (word) =>
  `<div class="readout">${Array.from({ length: 12 }, (_, i) => {
    const pad = Math.floor((12 - word.length) / 2);
    return `<span>${word[i - pad] ?? ''}</span>`;
  }).join('')}</div>`;

async function card(file, w, h, body, css) {
  const html = join(TMP, `${file}.html`);
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${cardCss(w, h)}${css}</style></head><body>${body}</body></html>`);
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = join(TMP, `${file}@2x.png`);
  await page.screenshot({ path: png });
  await page.close();
  return png;
}

const img = (p) => pathToFileURL(p).href;
const banner = await card('banner', 1280, 420, `
  <img class="plate" src="${img(rotorPlate)}" style="width: 60%; right: -36px">
  <div class="glow"></div><div class="vignette"></div><div class="grain"></div><div class="frame"></div>
  <p class="corner" style="top: 30px; left: 40px">Enigmista<b>.</b></p>
  <p class="corner" style="top: 30px; right: 40px">§01 · Authorised research</p>
  <p class="corner" style="bottom: 30px; left: 40px">v1.0.0 · <b>samuele95.github.io/enigmista</b></p>
  <p class="corner" style="bottom: 30px; right: 40px">01 / 08 ▸</p>
  <div class="copy" style="left: 64px; top: 92px; width: 600px">
    ${readout('enigmista')}
    <p class="eyebrow">A grammar machine for authorised research</p>
    <h1 class="wordmark" style="font-size: 92px">Enigmista<i>.</i></h1>
    <p class="lede" style="font-size: 19px; line-height: 1.45; max-width: 470px">Models the structure of an <em>authorised</em> password corpus and generates new candidates that fit its distribution — for policy audits, honeyword decoys and synthetic data.</p>
  </div>`, '');

const social = await card('social-preview', 1280, 640, `
  <img class="plate" src="${img(rotorPlate)}" style="width: 58%; right: -60px">
  <div class="glow"></div><div class="vignette"></div><div class="grain"></div><div class="frame"></div>
  <p class="corner" style="top: 32px; left: 44px">Enigmista<b>.</b></p>
  <p class="corner" style="top: 32px; right: 44px">§01 · A grammar machine</p>
  <p class="corner" style="bottom: 32px; right: 44px">01 / 08 ▸</p>
  <div class="copy" style="left: 72px; top: 128px; width: 620px; gap: 18px">
    ${readout('enigmista')}
    <p class="eyebrow" style="font-size: 13px">A grammar machine for authorised research</p>
    <h1 class="wordmark" style="font-size: 116px">Enigmista<i>.</i></h1>
    <p class="lede" style="font-size: 24px; line-height: 1.4; max-width: 540px">Models the structure of an <em>authorised</em> password corpus — for policy audits, honeyword decoys and synthetic data.</p>
    <p class="tag" style="font-size: 11px; letter-spacing: 0.1em; white-space: nowrap; margin-top: 6px">Defensive research · authorised corpora only · never a person</p>
  </div>
  <p class="corner" style="bottom: 32px; left: 44px; color: var(--bone)">samuele95.github.io/<b>enigmista</b></p>`, '');

// README header at 2× for sharp text on high-density screens; social card at 1× (GitHub wants
// 1280×640, under 1 MB) — also served as the site's og:image.
magick(banner, '-strip', '-define', 'png:compression-level=9', join(OUT, 'banner.png'));
magick(social, '-resize', '1280x640', '-strip', '-quality', '90', join(OUT, 'social-preview.jpg'));
magick(social, '-resize', '1280x640', '-strip', '-define', 'png:compression-level=9', join(OUT, 'social-preview.png'));
copyFileSync(join(OUT, 'social-preview.jpg'), join(ROOT, 'public/og.jpg'));

// A wide strip of the distribution, used as a section image.
magick(discPlate, '-resize', '1600x', '-strip', '-quality', '86', join(SHOTS, 'distribution-plate.jpg'));
console.log(`written to ${OUT} and public/og.jpg`);
await browser.close();
