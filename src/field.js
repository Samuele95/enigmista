import {
  CanvasTexture, DataTexture, LinearFilter, Mesh, NearestFilter, OrthographicCamera,
  PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Vector2, WebGLRenderer,
} from 'three';
import fragmentShader from './shaders/field.frag?raw';
import { CHARSET } from './glyphs.js';
import { SamplingSim } from './sampling-sim.js';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const MAX_PIXEL_RATIO = 1.5;
const TICK_MS = 1000 / 24; // film cadence for the sim; scroll offset still updates every frame
const ATLAS = { cols: 16, cellH: 72, font: '400 44px "Martian Mono"' };
const PREWARM_TICKS = 24; // ~1 s, so the field never opens empty

// Text the field never runs behind. Panels that hold their own content opt in with data-keepout.
// On the stage only the active scene and the HUD chrome count; in the document, all of main.
const TEXT = ':is(h1, h2, h3, p, li, pre, dt, dd, blockquote, figcaption, a, button)';
const KEEP_OUT = {
  stage: `.scene.is-active ${TEXT}, .scene.is-active [data-keepout], [data-hud] ${TEXT}`,
  doc: `main ${TEXT}, [data-keepout]`,
};

// Display cell height in CSS px; width follows the font's measured advance.
const cellHeightCss = () => (window.innerWidth < 700 ? 19 : 22);

async function buildAtlas() {
  await document.fonts.load(ATLAS.font);
  const rows = Math.ceil(CHARSET.length / ATLAS.cols);
  const canvas = document.createElement('canvas');
  canvas.height = rows * ATLAS.cellH;
  const ctx = canvas.getContext('2d');
  ctx.font = ATLAS.font;
  const cellW = Math.ceil(ctx.measureText('M').width * 1.08); // tracking of a real string
  canvas.width = ATLAS.cols * cellW;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = ATLAS.font; // resizing the canvas reset the context state
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...CHARSET].forEach((ch, i) => {
    const x = (i % ATLAS.cols) * cellW + cellW / 2;
    const y = Math.floor(i / ATLAS.cols) * ATLAS.cellH + ATLAS.cellH / 2;
    ctx.fillText(ch, x, y);
  });
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, grid: new Vector2(ATLAS.cols, rows), aspect: cellW / ATLAS.cellH };
}

// Keep-out rects in field (document) cell coordinates, padded by one cell.
function keepOutRects(selector, offset, cw, ch) {
  return [...document.querySelectorAll(selector)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height)
    .map((r) => ({
      x0: Math.floor(r.left / cw) - 1,
      y0: Math.floor((r.top + offset) / ch) - 1,
      x1: Math.ceil(r.right / cw),
      y1: Math.ceil((r.bottom + offset) / ch),
    }));
}

// Sections marked data-field="still" calm the field while they hold the viewport's centre;
// when one covers the whole viewport the field is hidden behind it and needn't render.
function stillness() {
  const mid = window.innerHeight / 2;
  let still = false;
  let covered = false;
  for (const el of document.querySelectorAll('[data-field="still"]')) {
    const r = el.getBoundingClientRect();
    if (r.top < mid && r.bottom > mid) still = true;
    if (r.top <= 0 && r.bottom >= window.innerHeight) covered = true;
  }
  return { still, covered };
}

/**
 * mode 'doc':   the field scrolls with the document and reads stillness from [data-field="still"].
 * mode 'stage': the stage drives it — setTravel(px, {still, covered}) moves the camera through the
 *               glyph world and says when to settle; refreshKeepOut() after a scene change.
 * Resolves once the first frame is drawn (the boot sequence waits on it).
 */
export async function startField(canvas, { reducedMotion, mode = 'doc' }) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  const pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);

  const atlas = await buildAtlas();
  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2() },
    uCells: { value: null },
    uGrid: { value: new Vector2() },
    uCellPx: { value: new Vector2() },
    uScrollPx: { value: 0 },
    uAtlas: { value: atlas.texture },
    uAtlasGrid: { value: atlas.grid },
  };
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader, fragmentShader, uniforms })));
  const camera = new OrthographicCamera();

  let sim;
  let cells;
  let cw;
  let ch;
  let travel = 0;
  let external = { still: false, covered: false };
  const offset = () => (mode === 'stage' ? travel : window.scrollY);
  const refreshKeepOut = () => sim && sim.setKeepOut(keepOutRects(KEEP_OUT[mode], offset(), cw, ch));

  const draw = () => {
    sim.write(cells.image.data);
    cells.needsUpdate = true;
    renderer.render(scene, camera);
  };

  // Returns true when the visible window moved.
  const syncScroll = () => {
    const y = offset();
    const top = Math.floor(y / ch);
    const frac = (y - top * ch) * pixelRatio;
    const moved = top !== sim.topRow || frac !== uniforms.uScrollPx.value;
    sim.scrollTo(top);
    uniforms.uScrollPx.value = frac;
    return moved;
  };

  const layout = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    ch = cellHeightCss();
    cw = ch * atlas.aspect;
    const cols = Math.ceil(window.innerWidth / cw);
    const rows = Math.ceil(window.innerHeight / ch) + 1; // +1 for the partial row while scrolling
    const fresh = !sim || sim.cols !== cols || sim.rows !== rows;
    if (fresh) {
      sim = new SamplingSim(cols, rows);
      cells?.dispose();
      cells = new DataTexture(new Uint8Array(cols * rows * 4), cols, rows, RGBAFormat);
      cells.magFilter = cells.minFilter = NearestFilter;
      uniforms.uCells.value = cells;
      uniforms.uGrid.value.set(cols, rows);
    }
    uniforms.uCellPx.value.set(cw * pixelRatio, ch * pixelRatio);
    refreshKeepOut();
    syncScroll();
    // Reduced motion gets a settled still; otherwise ~1 s of history so it never opens empty.
    if (fresh) for (let i = reducedMotion ? 90 : PREWARM_TICKS; i > 0; i--) sim.step();
    draw();
  };

  window.addEventListener('resize', layout);
  if (mode === 'doc') new ResizeObserver(refreshKeepOut).observe(document.body);
  layout();
  // ?debug exposes the sim for inspection in the console.
  if (new URLSearchParams(window.location.search).has('debug')) window.__field = { sim: () => sim, cw: () => cw, ch: () => ch, offset };
  const controller = {
    refreshKeepOut,
    setTravel(px, state) {
      travel = px;
      external = state;
    },
  };

  if (reducedMotion) {
    // No animation: the settled still only follows the page as it scrolls.
    window.addEventListener('scroll', () => syncScroll() && !stillness().covered && draw(), { passive: true });
    return controller;
  }

  let frame = 0;
  let last = 0;
  const loop = (ms) => {
    frame = requestAnimationFrame(loop);
    const { still, covered } = mode === 'stage' ? external : stillness();
    sim.still = still;
    let dirty = syncScroll();
    if (ms - last >= TICK_MS && !sim.settled) {
      last = ms;
      uniforms.uTime.value = ms / 1000;
      sim.step();
      dirty = true;
    }
    if (dirty && !covered) draw();
  };
  // The loop stops entirely while the tab is hidden.
  const sync = () => {
    cancelAnimationFrame(frame);
    if (document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', sync);
  sync();
  return controller;
}
