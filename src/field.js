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
const TICK_MS = 1000 / 24; // film cadence: the sim and the render both run at 24 fps
const ATLAS = { cols: 16, cellH: 72, font: '400 44px "Martian Mono"' };
const PREWARM_TICKS = 24; // ~1 s, so the field never opens empty

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
  ctx.font = ATLAS.font;
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

// Text the field must never run behind: every [data-keepout] element, padded by one cell.
function keepOutRects(cw, ch) {
  return [...document.querySelectorAll('[data-keepout]')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      x0: Math.floor(r.left / cw) - 1,
      y0: Math.floor(r.top / ch) - 1,
      x1: Math.ceil(r.right / cw),
      y1: Math.ceil(r.bottom / ch),
    };
  });
}

export async function startField(canvas, { reducedMotion }) {
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
    uAtlas: { value: atlas.texture },
    uAtlasGrid: { value: atlas.grid },
  };
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader, fragmentShader, uniforms })));
  const camera = new OrthographicCamera();

  let sim;
  let cells;
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    const ch = cellHeightCss();
    const cw = ch * atlas.aspect;
    const cols = Math.ceil(window.innerWidth / cw);
    const rows = Math.ceil(window.innerHeight / ch);
    if (!sim || sim.cols !== cols || sim.rows !== rows) {
      sim = new SamplingSim(cols, rows);
      cells?.dispose();
      cells = new DataTexture(new Uint8Array(cols * rows * 4), cols, rows, RGBAFormat);
      cells.magFilter = cells.minFilter = NearestFilter;
      uniforms.uCells.value = cells;
      uniforms.uGrid.value.set(cols, rows);
    }
    sim.setKeepOut(keepOutRects(cw, ch));
    // Reduced motion gets a settled still; otherwise ~1 s of history so it never opens empty.
    for (let i = sim.lanes.length ? 0 : reducedMotion ? 90 : PREWARM_TICKS; i > 0; i--) sim.step();
    uniforms.uCellPx.value.set(cw * pixelRatio, ch * pixelRatio);
    draw();
  };
  const draw = () => {
    sim.write(cells.image.data);
    cells.needsUpdate = true;
    renderer.render(scene, camera);
  };
  window.addEventListener('resize', resize);
  resize();

  if (reducedMotion) return;

  // 24 fps loop that stops entirely while the tab is hidden.
  let frame = 0;
  let last = 0;
  const tick = (ms) => {
    frame = requestAnimationFrame(tick);
    if (ms - last < TICK_MS) return;
    last = ms;
    uniforms.uTime.value = ms / 1000;
    sim.step();
    draw();
  };
  const sync = () => {
    cancelAnimationFrame(frame);
    if (document.visibilityState === 'visible') frame = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}
