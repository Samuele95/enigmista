// The 3D world: The Rotor — a cryptex of twelve glyph discs on one axle, the sampler made
// physical. Its discs spin and click into place left→right until the front reading row spells a
// toy candidate (teal when it lands on the toy held-out set).
//
// It is woven into the page, not parked beside it:
//  · framing — every caption beat has a shot (SHOTS): the drum fills the frame clear of the
//    caption zone; the camera eases between a chapter's shots and flies between chapters.
//  · motion   — a dolly-in reveal that locks E-N-I-G-M-I-S-T-A with the wordmark; discs scramble
//    while the camera travels between shots and click back on arrival; the drum rolls with scroll.
//  · content  — structure groups the discs by the live candidate's grammar slots (labelled);
//    uses grows ⟨audit⟩ ⟨decoy⟩ ⟨synth⟩ branches that light with their captions; objective dives
//    below the drum to the distribution itself (src/disc.js), where visitors throw darts and turn τ;
//    method performs each station; the sandbox plays its draws on the drum.
//  · frame    — every shot is fitted into the visual frame CSS reserves (.visual-frame), so the 3D
//    never runs under the caption column.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  Group, InstancedBufferAttribute, InstancedBufferGeometry, LinearSRGBColorSpace, Matrix4, Mesh,
  MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Points, Raycaster, Scene, ShaderMaterial, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector2, Vector3,
} from 'three';
import { DISC_R, createDisc } from './disc.js';
import { glyphIndex } from './glyphs.js';
import { sample } from './sampler.js';
import { SLOT_LABELS, TOY_GRAMMAR, TOY_HELDOUT } from './toy/grammar.js';

const TAU = Math.PI * 2;
const RINGS = 12;
const RING_SET = ' abcdefghijklmnopqrstuvwxyz0123456789!@#_.'; // what each disc carries
const SLOTS = RING_SET.length;
const R = 0.9; // glyph radius
const DISC_W = 0.2;
const RIDGE_W = 0.035;
const PITCH = DISC_W + RIDGE_W;
const CAP_W = 0.2;
const GLYPH_H = ((TAU * R) / SLOTS) * 0.97;
const CAP_R = R + 0.09;
const LOOP_R = R * 2.3;
const FOV = 30;
const BOOKEND = 'enigmista';
const STATIONS = ['corpus', 'induce', 'sample', 'score', 'refine', 'stop'];
const DISC_Y = -6; // the distribution lies below the drum; the camera dives to it

// Palette as raw display values: the whole pipeline stays in these numbers (no colour-space
// conversion), so a hex here is the hex on screen — same as the CSS tokens.
const raw = (hex) =>
  new Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, LinearSRGBColorSpace);
const C = {
  void: raw(0x07080b), ink: raw(0x10131a), rule: raw(0x252b36), ash: raw(0x8a8f99),
  bone: raw(0xe9e4d8), ember: raw(0xe8a33d), heldout: raw(0x3cc6b4),
};

// Shots: one per caption beat, eased between inside a chapter and flown between across chapters.
// box: where the subject sits inside the visual frame — [centre x, centre y, width, height] as
// fractions of the frame (nbox: the same on phones, where the frame is the top band).
// look/zoom: frame a point other than the drum (the Uses branch tips). disc: the distribution.
// Label groups: slots, uses, readout, station. breathe: τ animates on its own.
const BASE = {
  az: -0.25, el: 0.12, explode: 0, dim: 1, ghost: 0, branch: 0, loop: 0, aura: 0.8, disc: 0,
  slots: 0, uses: 0, readout: 0, station: 0, breathe: 0, lookX: 0, lookY: 0, lookZ: 0, zoom: 1,
  box: [0.5, 0.5, 1, 0.86], nbox: null,
};
const shot = (o = {}) => ({ ...BASE, ...o });
const station = (o) => shot({ az: -0.3, el: 0.16, loop: 1, ghost: 0.35, station: 1, box: [0.5, 0.5, 1, 0.92], ...o });
const discShot = (o) => shot({ az: -0.22, el: 0.9, dim: 0, aura: 0, disc: 1, lookY: DISC_Y + 0.35, box: [0.5, 0.5, 1, 0.94], ...o });
const SHOTS = {
  hero: [shot({ az: -0.22, el: 0.1, aura: 1, box: [0.5, 0.5, 1, 0.8] })],
  structure: [
    shot({ az: -0.55, el: 0.22, explode: 1, slots: 1 }),
    shot({ az: -0.9, el: 0.3, explode: 0.8, slots: 1, zoom: 0.9 }), // neural: the slots, named
    shot({ az: -0.15, el: 0.1 }), // symbolic: the sampler spins
  ],
  uses: [
    shot({ az: 0.4, el: 0.32, branch: 1, uses: 1, lookY: 1, box: [0.5, 0.52, 1, 0.92] }),
    shot({ az: -0.2, el: 0.3, branch: 1, uses: 1, lookX: -1.6, lookY: 1.9, lookZ: -0.5, zoom: 0.8 }),
    shot({ az: 0.15, el: 0.42, branch: 1, uses: 1, lookX: 0.15, lookY: 2.2, lookZ: -0.7, zoom: 0.8 }),
    shot({ az: 0.55, el: 0.3, branch: 1, uses: 1, lookX: 1.8, lookY: 1.7, lookZ: -0.4, zoom: 0.8 }),
  ],
  objective: [
    shot({ az: -0.3, el: 0.1, ghost: 1, readout: 1, box: [0.5, 0.5, 1, 0.94] }),
    discShot({}), // the kernel, in geometry
    discShot({ az: 0.35, el: 0.78, breathe: 1 }), // temperature
  ],
  method: [
    station({ station: 0 }),
    station({}), station({ explode: 0.65, az: -0.6 }), station({}),
    station({ ghost: 1 }), station({ az: -0.1 }), station({}),
  ],
  sandbox: [
    // The drum rides a band above the induction and dials each step's name.
    ...Array.from({ length: 5 }, () => shot({ az: -0.3, el: 0.06, aura: 0.5, box: [0.5, 0.085, 0.92, 0.15] })),
    shot({ az: -0.45, el: 0.12, aura: 0.9, box: [0.33, 0.5, 0.64, 0.7], nbox: [0.27, 0.45, 0.54, 0.8] }), // sample
  ],
  scope: Array.from({ length: 5 }, () => shot({ az: 1.4, dim: 0.2, aura: 0 })),
  install: [
    shot({ az: 0.15, el: 0.14, aura: 1 }),
    ...Array.from({ length: 3 }, () => shot({ az: 0.4, el: 0.18, dim: 0.85 })),
  ],
};
const NUM_KEYS = Object.keys(BASE).filter((k) => k !== 'box' && k !== 'nbox');

const glsl = (x) => (Number.isInteger(x) ? `${x}.0` : `${x}`); // numbers as GLSL float literals
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const easeOutBack = (t, s = 0.9) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/* ── Shaders ─────────────────────────────────────────────────────────── */

const glyphVert = /* glsl */ `
  attribute float aRing;
  attribute float aSlot;
  attribute float aGlyph;
  uniform float uRingAngle[${RINGS}];
  uniform float uRingVel[${RINGS}];
  uniform float uRingState[${RINGS}];
  uniform float uRingX[${RINGS}];
  varying vec2 vUv;
  varying float vGlyph;
  varying float vFacing;
  varying float vFront;
  varying float vVel;
  varying float vState;
  void main() {
    int r = int(aRing + 0.5);
    float a = aSlot / ${glsl(SLOTS)} * 6.2831853 + uRingAngle[r];
    vec3 n = vec3(0.0, sin(a), cos(a));
    vec3 t = vec3(0.0, cos(a), -sin(a));
    vec3 p = vec3(uRingX[r] + position.x, 0.0, 0.0) + n * ${glsl(R + 0.004)} + t * position.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFacing = dot(normalize(normalMatrix * n), normalize(-mv.xyz));
    float w = mod(a + 3.14159265, 6.2831853) - 3.14159265;
    vFront = 1.0 - smoothstep(0.5, 1.5, abs(w) / (6.2831853 / ${glsl(SLOTS)}));
    vUv = uv;
    vGlyph = aGlyph;
    vVel = uRingVel[r];
    vState = uRingState[r];
    gl_Position = projectionMatrix * mv;
  }
`;

const glyphFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uAtlasGrid;
  uniform vec3 uAsh;
  uniform vec3 uBone;
  uniform vec3 uEmber;
  uniform vec3 uHeld;
  uniform float uDim;
  varying vec2 vUv;
  varying float vGlyph;
  varying float vFacing;
  varying float vFront;
  varying float vVel;
  varying float vState;
  float glyphAt(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    vec2 g = vec2(mod(vGlyph, uAtlasGrid.x), floor(vGlyph / uAtlasGrid.x));
    vec2 auv = vec2((g.x + uv.x) / uAtlasGrid.x, (uAtlasGrid.y - g.y - 1.0 + uv.y) / uAtlasGrid.y);
    return texture2D(uAtlas, auv).r;
  }
  void main() {
    // Motion blur along the rim while a disc spins.
    float blur = clamp(abs(vVel) * 0.03, 0.0, 0.45);
    float ink = 0.0;
    for (int i = -2; i <= 2; i++) ink += glyphAt(vUv + vec2(0.0, float(i) * blur * 0.35));
    ink *= 0.2;
    vec3 locked = vState > 1.5 ? uHeld : uEmber;
    vec3 front = vState > 0.5 ? locked : uBone;
    vec3 col = mix(uAsh * 0.6, front, vFront);
    float lit = smoothstep(-0.05, 0.6, vFacing) * mix(0.5, 1.5, vFront);
    float halo = 0.0;
    if (vFront > 0.5) {
      halo += glyphAt(vUv + vec2(0.16, 0.0)) + glyphAt(vUv - vec2(0.16, 0.0));
      halo += glyphAt(vUv + vec2(0.0, 0.12)) + glyphAt(vUv - vec2(0.0, 0.12));
      halo *= 0.11 * vFront;
    }
    gl_FragColor = vec4(col, (ink * lit + halo) * uDim * (1.0 - blur));
  }
`;

const solidVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const solidFrag = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uEdge;
  uniform vec3 uVoid;
  uniform vec3 uKey;
  uniform float uDim;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    float f = 1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0);
    vec3 c = mix(uBase, uEdge, pow(f, 1.6));
    c += uEdge * 0.22 * clamp(n.y, 0.0, 1.0);          // soft top light
    c += uKey * 0.18 * pow(clamp(-n.x, 0.0, 1.0), 3.0); // warm ember rim from the left
    gl_FragColor = vec4(mix(uVoid, c, uDim), 1.0);
  }
`;

const ghostVert = /* glsl */ `
  attribute float aFlare;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.75 + 0.25 * sin(uTime * 1.3 + aSeed * 40.0);
    vA = (0.4 * twinkle + aFlare);
    gl_PointSize = (2.6 + aFlare * 9.0) * uPixelRatio * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const ghostFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA * uOpacity);
  }
`;

const branchVert = /* glsl */ `
  varying float vU;
  void main() {
    vU = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const branchFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGrow;
  uniform float uTime;
  uniform float uHi;
  varying float vU;
  void main() {
    if (vU > uGrow) discard;
    float pulse = 0.55 + 0.45 * smoothstep(0.85, 1.0, sin(vU * 18.0 - uTime * (3.0 + uHi * 4.0)));
    float tip = smoothstep(uGrow - 0.08, uGrow, vU);
    gl_FragColor = vec4(uColor * (1.0 + uHi * 1.4), (pulse + tip) * min(uGrow * 3.0, 1.0) * (0.75 + uHi));
  }
`;

const auraVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const auraFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - 0.5) * vec2(1.0, 1.6);
    gl_FragColor = vec4(uColor, exp(-dot(d, d) * 9.0) * uOpacity);
  }
`;

/* ── Construction ────────────────────────────────────────────────────── */

export function createWorld({ atlas }) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 120);
  const rotor = new Group();
  scene.add(rotor);
  const narrow = () => window.innerWidth < 1000;

  const solid = (base, edge) =>
    new ShaderMaterial({
      vertexShader: solidVert,
      fragmentShader: solidFrag,
      uniforms: {
        uBase: { value: base }, uEdge: { value: edge }, uVoid: { value: C.void }, uKey: { value: C.ember }, uDim: { value: 1 },
      },
    });
  const drumMat = solid(C.ink, raw(0x3a4352));
  const ridgeMat = solid(raw(0x161b24), raw(0x6b7280));
  const capMat = solid(raw(0x0b0d12), raw(0x4a5160));
  const solids = [drumMat, ridgeMat, capMat];

  const along = (geo) => geo.rotateZ(Math.PI / 2); // cylinders run along the axle (x)
  const drumGeo = along(new CylinderGeometry(R, R, DISC_W, 96, 1));
  const ridgeGeo = along(new CylinderGeometry(R + 0.035, R + 0.035, RIDGE_W, 96, 1));
  const discs = Array.from({ length: RINGS }, (_, i) => {
    const disc = new Group();
    disc.add(new Mesh(drumGeo, drumMat));
    const ridge = new Mesh(ridgeGeo, ridgeMat);
    ridge.position.x = (DISC_W + RIDGE_W) / 2;
    if (i < RINGS - 1) disc.add(ridge);
    rotor.add(disc);
    return disc;
  });
  const capGeo = along(new CylinderGeometry(CAP_R, CAP_R, CAP_W, 96, 1));
  const rimMat = new MeshBasicMaterial({ color: C.ember, transparent: true, opacity: 0.9 });
  const rimGeo = new TorusGeometry(CAP_R, 0.007, 8, 180).rotateY(Math.PI / 2);
  const caps = [-1, 1].map((side) => {
    const cap = new Mesh(capGeo, capMat);
    const rim = new Mesh(rimGeo, rimMat);
    rim.position.x = (side * CAP_W) / 2;
    cap.add(rim);
    rotor.add(cap);
    return cap;
  });
  const axle = new Mesh(along(new CylinderGeometry(0.07, 0.07, 1, 24)), ridgeMat);
  rotor.add(axle);

  const barMat = new MeshBasicMaterial({ color: C.ember, transparent: true, opacity: 0.75 });
  const bars = [-1, 1].map((s) => {
    const bar = new Mesh(new BoxGeometry(1, 0.008, 0.008), barMat);
    bar.position.set(0, s * GLYPH_H * 0.72, R + 0.05);
    rotor.add(bar);
    return bar;
  });

  // Glyphs: one instance per disc slot.
  const plane = new PlaneGeometry(GLYPH_H * atlas.aspect, GLYPH_H);
  const glyphGeo = new InstancedBufferGeometry();
  glyphGeo.index = plane.index;
  glyphGeo.setAttribute('position', plane.getAttribute('position'));
  glyphGeo.setAttribute('uv', plane.getAttribute('uv'));
  const n = RINGS * SLOTS;
  const aRing = new Float32Array(n);
  const aSlot = new Float32Array(n);
  const aGlyph = new Float32Array(n);
  for (let r = 0; r < RINGS; r++) {
    for (let k = 0; k < SLOTS; k++) {
      const i = r * SLOTS + k;
      aRing[i] = r;
      aSlot[i] = k;
      aGlyph[i] = glyphIndex(RING_SET[k]);
    }
  }
  glyphGeo.setAttribute('aRing', new InstancedBufferAttribute(aRing, 1));
  glyphGeo.setAttribute('aSlot', new InstancedBufferAttribute(aSlot, 1));
  glyphGeo.setAttribute('aGlyph', new InstancedBufferAttribute(aGlyph, 1));
  glyphGeo.instanceCount = n;
  const ringAngle = new Array(RINGS).fill(0);
  const ringVel = new Array(RINGS).fill(0);
  const ringState = new Array(RINGS).fill(0);
  const ringX = new Array(RINGS).fill(0);
  const glyphMat = new ShaderMaterial({
    vertexShader: glyphVert,
    fragmentShader: glyphFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uRingAngle: { value: ringAngle },
      uRingVel: { value: ringVel },
      uRingState: { value: ringState },
      uRingX: { value: ringX },
      uAtlas: { value: atlas.texture },
      uAtlasGrid: { value: atlas.grid },
      uAsh: { value: C.ash },
      uBone: { value: C.bone },
      uEmber: { value: C.ember },
      uHeld: { value: C.heldout },
      uDim: { value: 1 },
    },
  });
  const glyphs = new Mesh(glyphGeo, glyphMat);
  glyphs.frustumCulled = false;
  rotor.add(glyphs);

  // Aura: a soft ember light behind the drum (bloom carries it further).
  const auraMat = new ShaderMaterial({
    vertexShader: auraVert,
    fragmentShader: auraFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: C.ember }, uOpacity: { value: 0 } },
  });
  const aura = new Mesh(new PlaneGeometry(9, 9), auraMat);
  aura.renderOrder = -1;
  scene.add(aura);

  // Held-out "ghosts" — points the model never saw; they flare when a sample hits.
  const GHOSTS = narrow() ? 180 : 320;
  const ghostPos = new Float32Array(GHOSTS * 3);
  const ghostFlare = new Float32Array(GHOSTS);
  const ghostSeed = new Float32Array(GHOSTS);
  for (let i = 0; i < GHOSTS; i++) {
    const v = new Vector3().randomDirection().multiplyScalar(2.4 + Math.random() * 4.5);
    ghostPos.set([v.x * 1.5, v.y, v.z], i * 3);
    ghostSeed[i] = Math.random();
  }
  const ghostGeo = new BufferGeometry();
  ghostGeo.setAttribute('position', new BufferAttribute(ghostPos, 3));
  ghostGeo.setAttribute('aFlare', new BufferAttribute(ghostFlare, 1));
  ghostGeo.setAttribute('aSeed', new BufferAttribute(ghostSeed, 1));
  const ghostMat = new ShaderMaterial({
    vertexShader: ghostVert,
    fragmentShader: ghostFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: C.heldout }, uOpacity: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: 1 } },
  });
  const ghosts = new Points(ghostGeo, ghostMat);
  scene.add(ghosts);
  const flare = (count) => {
    for (let k = 0; k < count; k++) ghostFlare[Math.floor(Math.random() * GHOSTS)] = 1;
  };

  // Uses: three branches — audit, decoy, synth — each lit when its card is hovered.
  const branchTips = [new Vector3(-2.4, 2.4, -0.8), new Vector3(0.2, 2.9, -1.2), new Vector3(2.6, 2.2, -0.6)];
  const branchPaths = [
    [new Vector3(-0.9, R, 0.2), new Vector3(-1.7, 1.7, 0.3), branchTips[0]],
    [new Vector3(0, R, 0.3), new Vector3(0.2, 2.0, 0.4), branchTips[1]],
    [new Vector3(0.9, R, 0.2), new Vector3(1.8, 1.6, 0.4), branchTips[2]],
  ];
  const branches = new Group();
  const branchMats = branchPaths.map((pts) => {
    const mat = new ShaderMaterial({
      vertexShader: branchVert,
      fragmentShader: branchFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: C.ember }, uGrow: { value: 0 }, uTime: { value: 0 }, uHi: { value: 0 } },
    });
    branches.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.012, 6), mat));
    const node = new Mesh(new SphereGeometry(0.06, 16, 12), new MeshBasicMaterial({ color: C.ember, transparent: true }));
    node.position.copy(pts[2]);
    branches.add(node);
    return mat;
  });
  scene.add(branches);
  const useHi = [0, 0, 0];

  // Method: a ring of six stations orbiting the axle — the loop, literally.
  const loop = new Group();
  const loopRing = new Mesh(
    new TorusGeometry(LOOP_R, 0.006, 6, 240),
    new MeshBasicMaterial({ color: C.ash, transparent: true, opacity: 0 }),
  );
  loop.add(loopRing); // in the camera-facing plane: the ring turns to bring a station to the reading side
  const loopNodes = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * TAU;
    const node = new Mesh(new SphereGeometry(0.07, 16, 12), new MeshBasicMaterial({ color: C.ash, transparent: true, opacity: 0 }));
    node.position.set(Math.cos(a) * LOOP_R, Math.sin(a) * LOOP_R, 0);
    loop.add(node);
    return node;
  });
  scene.add(loop);

  /* ── Labels projected from 3D into the page ───────────────────────── */

  const view = { w: 1, h: 1 };
  const labelLayer = document.createElement('div');
  labelLayer.className = 'world-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  document.body.append(labelLayer);
  const makeLabel = (cls) => {
    const el = document.createElement('span');
    el.className = `world-label ${cls}`;
    labelLayer.append(el);
    return el;
  };
  const slotLabels = Array.from({ length: 6 }, () => makeLabel('world-label--slot'));
  const useLabels = ['audit', 'decoy', 'synth'].map((t) => {
    const el = makeLabel('world-label--use');
    el.textContent = `⟨${t}⟩`;
    return el;
  });
  const readoutLabel = makeLabel('world-label--readout');
  const templateLabels = TOY_GRAMMAR.templates.map(() => {
    const el = makeLabel('world-label--template');
    el.dataset.keepIn = '-';
    return el;
  });
  const wordLabels = Array.from({ length: 10 }, () => makeLabel('world-label--term'));
  const heldLabels = [...TOY_HELDOUT].map(() => makeLabel('world-label--held'));
  const dartLabel = makeLabel('world-label--dart');
  const hoverLabel = makeLabel('world-label--hover');
  dartLabel.dataset.keepIn = hoverLabel.dataset.keepIn = '-';
  const stationLabel = makeLabel('world-label--station');

  // The tether: a hairline from the current caption's readout to where its text comes from.
  const SVG = 'http://www.w3.org/2000/svg';
  const tether = document.createElementNS(SVG, 'svg');
  tether.setAttribute('class', 'tether');
  tether.setAttribute('aria-hidden', 'true');
  const tetherPath = document.createElementNS(SVG, 'path');
  const tetherDot = document.createElementNS(SVG, 'circle');
  tetherDot.setAttribute('r', '3');
  tether.append(tetherPath, tetherDot);
  document.body.append(tether);
  const tmp = new Vector3();
  const place = (el, point, opacity, inRotor = true) => {
    if (opacity < 0.02) {
      el.style.opacity = '0';
      return;
    }
    tmp.copy(point);
    if (inRotor) rotor.localToWorld(tmp);
    tmp.project(camera);
    let x = ((tmp.x + 1) / 2) * view.w;
    if (el.dataset.keepIn) {
      // Legend labels stay whole on screen, however wide the disc's rim runs.
      if (el.dataset.keepIn !== el.textContent) {
        el.dataset.keepIn = el.textContent;
        el.halfW = el.offsetWidth / 2;
      }
      x = Math.min(view.w - el.halfW - 8, Math.max(el.halfW + 8, x));
    }
    el.style.opacity = String(opacity);
    el.style.transform = `translate(${x}px, ${((1 - tmp.y) / 2) * view.h}px) translate(-50%, -50%)`;
  };

  /* ── The sampler, made physical ────────────────────────────────────── */

  const rings = Array.from({ length: RINGS }, () => ({
    angle: 0, from: 0, to: 0, t0: 0, dur: 1, prev: 0, off: 0, offVel: 0, slot: ' ',
  }));
  let phase = 'spin';
  let holdUntil = 0;
  let hit = false;
  let current = null; // the word on the drum (or being spun to)
  let queue = []; // sandbox draws waiting to be shown
  const tally = { drawn: 0, hits: new Set() };
  const intro = { active: false, t0: 0, dur: 4200 };

  const centred = (chars) => {
    const pad = Math.floor((RINGS - chars.length) / 2);
    return Array.from({ length: RINGS }, (_, i) => chars[i - pad] ?? { ch: ' ', slot: ' ' });
  };

  const spinTo = (word, now, { chars, fast = false, slow = false, medium = false } = {}) => {
    current = word;
    hit = TOY_HELDOUT.has(word);
    const cells = centred(chars ?? [...word].map((ch) => ({ ch, slot: 'name' })));
    cells.forEach(({ ch, slot }, i) => {
      const ring = rings[i];
      const c = RING_SET.includes(ch.toLowerCase()) ? ch.toLowerCase() : ' ';
      const base = -(RING_SET.indexOf(c) / SLOTS) * TAU;
      const turns = (fast ? 0 : 1) + Math.floor(Math.random() * 2);
      const rest = (((ring.angle - base) % TAU) + TAU) % TAU;
      ring.from = ring.angle;
      ring.to = ring.angle - turns * TAU - rest;
      ring.t0 = now + i * (fast ? 40 : slow ? 150 : medium ? 60 : 85) + Math.random() * (fast ? 50 : 120);
      ring.dur = fast ? 520 + Math.random() * 200 : slow ? 2100 + Math.random() * 500 : medium ? 820 + Math.random() * 300 : 1250 + Math.random() * 450;
      ring.slot = slot;
      ringState[i] = 0;
    });
    phase = 'spin';
  };

  const drawSample = (now, fast) => {
    const s = sample(TOY_GRAMMAR, { tau: kernel.tau });
    tally.drawn++;
    spinTo(s.pw, now, { chars: s.chars, fast });
  };

  /* ── The distribution, in geometry (below the drum) ──────────────── */
  const kernel = { tau: 1.4 }; // the drum's sampling τ: the sandbox slider's
  window.addEventListener('sandbox:tau', (e) => (kernel.tau = e.detail));
  const disc = createDisc({ C, grammar: TOY_GRAMMAR, heldout: TOY_HELDOUT });
  disc.group.position.y = DISC_Y;
  scene.add(disc.group);
  // The disc's own τ: breathes by itself on the temperature beat until the visitor takes the slider.
  const discTau = { value: 1, manual: false, lastBreath: 0 };
  const tauInputs = [...document.querySelectorAll('[data-disc-tau]')];
  const setDiscTau = (tau) => {
    discTau.value = tau;
    disc.setTau(tau);
    tauInputs.forEach((input) => (input.value = tau.toFixed(1)));
    document.querySelectorAll('[data-disc-tau-out]').forEach((o) => (o.textContent = tau.toFixed(1)));
  };
  tauInputs.forEach((input) =>
    input.addEventListener('input', () => {
      discTau.manual = true;
      setDiscTau(Number(input.value));
    }),
  );
  let lastThrow = -1e9;
  let userThrow = -1e9;
  const discReadouts = [...document.querySelectorAll('[data-disc-readout]')];
  const throwDart = (now, byUser) => {
    const leaf = disc.throwDart(now);
    lastThrow = now;
    // The drum dials what the dart drew: the caption's readout reads it off the discs.
    if (leaf) spinTo(leaf.pw, now, { chars: leaf.parts.flatMap((p) => [...p.text].map((ch) => ({ ch, slot: p.slot }))), fast: true });
    if (byUser) userThrow = now;
    if (leaf?.held) window.dispatchEvent(new CustomEvent('disc:hit', { detail: leaf.pw }));
  };
  document.querySelectorAll('[data-disc-throw]').forEach((b) => b.addEventListener('click', () => throwDart(performance.now(), true)));

  let batch = []; // the sandbox's current list: cycled on the drum while the visitor is there
  window.addEventListener('sandbox:phase', (e) => {
    if (e.detail !== 'sample') batch = [];
  });
  window.addEventListener('sandbox:draws', (e) => {
    batch = [...e.detail];
    queue = [...batch];
  });

  // What the drum should be doing right now, given where the visitor is.
  const ids = [...document.querySelectorAll('[data-scene]')].map((el) => el.id);
  const at = (id) => ids.indexOf(id);
  const pose = { chapter: 0, local: 0, transit: 0, velocity: 0 };
  let inSandbox = false;
  // Every caption beat names what the drum dials (data-word): a word, or a mode — ~sample (draw
  // from the toy grammar), ~queue (the sandbox's list), ~dart (whatever the disc's darts draw).
  // Each new beat re-dials, so its caption can wait for the lock and read itself off the discs.
  const beat = { el: null, word: null, hold: 0, redial: false, cells: [], from: null };
  window.addEventListener('stage:beat', (e) => {
    const el = document.getElementById(e.detail.scene)?.querySelectorAll('.scene__body > .beat')[e.detail.beat] ?? null;
    Object.assign(beat, {
      el,
      word: el?.dataset.word ?? null,
      hold: Number(el?.dataset.hold ?? 1700),
      redial: true,
      cells: el ? [...el.querySelectorAll('.readout__cell')] : [],
      from: el?.querySelector('[data-tether]') ?? el?.querySelector('.readout') ?? null,
    });
  });
  // The caption beat the visitor is on, within the current chapter.
  const beatIn = (id) => Math.round(pose.local * Math.max(0, SHOTS[id].length - 1));
  const here = (id) => Math.abs(pose.chapter - at(id)) < 0.5;
  const stationOf = () => (here('method') ? beatIn('method') - 1 : -1); // -1: the chapter's intro beat
  const mode = () => {
    const inBox = here('sandbox');
    if (inBox && !inSandbox) window.dispatchEvent(new CustomEvent('sandbox:request')); // replay its list
    inSandbox = inBox;
    if (intro.active) return { word: BOOKEND };
    const w = beat.word;
    if (!w) return { sample: true, hold: 1700 };
    if (w === '~sample') return { sample: true, fast: true, hold: beat.hold };
    if (w === '~dart') return { dart: true };
    if (w === '~queue') {
      if (!batch.length) return { sample: true, fast: true, hold: 900 };
      if (!queue.length) queue = [...batch];
      return { queue: true };
    }
    return { word: w, refine: w === 'refine' };
  };

  let lastNow = 0;
  let lastNudge = 0;
  const step = (now) => {
    const dt = Math.min(64, Math.max(1, now - lastNow));
    lastNow = now;
    const want = mode();

    // Transit scramble: while the camera travels, discs free-spin; on arrival they click back
    // to the nearest full turn, so the word they were holding returns intact.
    const scramble = pose.transit * pose.transit;
    let allLocked = true;
    rings.forEach((ring, i) => {
      const t = Math.min(1, Math.max(0, (now - ring.t0) / ring.dur));
      ring.offVel += scramble * (2.2 + (i % 5) * 0.6) * (dt / 16);
      const home = Math.round(ring.off / TAU) * TAU;
      ring.offVel += (home - ring.off) * 0.004 * dt * (1 - scramble);
      ring.offVel *= 0.9;
      ring.off += ring.offVel * (dt / 1000);
      ring.prev = ringAngle[i];
      ring.angle = ring.from + (ring.to - ring.from) * easeOutBack(t);
      ringAngle[i] = ring.angle + ring.off;
      ringVel[i] = ((ringAngle[i] - ring.prev) / dt) * 1000;
      if (t < 1) allLocked = false;
      else if (phase === 'spin') ringState[i] = 1;
    });

    if (phase === 'spin' && allLocked) {
      phase = 'hold';
      if (hit) {
        ringState.fill(2);
        flare(16);
        tally.hits.add(current);
      }
      window.dispatchEvent(new CustomEvent('rotor:locked', { detail: current }));
      holdUntil = now + (want.queue ? 650 : hit ? Math.max(2200, want.hold ?? 0) : want.hold ?? 1700);
    }

    const redial = beat.redial && !intro.active;
    beat.redial = false;
    if (want.word && (current !== want.word || redial)) {
      spinTo(want.word, now, { medium: true });
    } else if (want.dart && redial && now3.disc > 0.3) {
      throwDart(now, false);
    } else if (redial && (want.sample || want.queue)) {
      if (want.queue && queue.length) spinTo(queue.shift(), now, { fast: true });
      else drawSample(now, true);
    } else if (want.queue && phase === 'hold' && now > holdUntil) {
      spinTo(queue.shift(), now, { fast: true });
    } else if (want.sample && phase === 'hold' && now > holdUntil) {
      drawSample(now, want.fast);
    }
    if (want.refine && phase === 'hold' && now - lastNudge > 420) {
      lastNudge = now; // refine: one disc at a time reconsiders, then settles back
      rings[Math.floor(Math.random() * RINGS)].offVel += 9;
    }
    for (let i = 0; i < GHOSTS; i++) ghostFlare[i] *= 0.965;
    ghostGeo.attributes.aFlare.needsUpdate = true;
  };

  /* ── Pointer: hover nudges a disc, click draws a new sample ────────── */

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const inv = new Matrix4();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, ring: -1 };
  const ringUnder = (cx, cy) => {
    ndc.set((cx / view.w) * 2 - 1, -(cy / view.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    inv.copy(rotor.matrixWorld).invert();
    const o = raycaster.ray.origin.clone().applyMatrix4(inv);
    const d = raycaster.ray.direction.clone().transformDirection(inv);
    // Ray vs the drum's cylinder (axis = local x).
    const a = d.y * d.y + d.z * d.z;
    const b = 2 * (o.y * d.y + o.z * d.z);
    const c = o.y * o.y + o.z * o.z - CAP_R * CAP_R;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-6) return -1;
    const x = o.x + d.x * ((-b - Math.sqrt(disc)) / (2 * a));
    let best = -1;
    let bestD = PITCH;
    ringX.forEach((rx, i) => {
      if (Math.abs(rx - x) < bestD) {
        bestD = Math.abs(rx - x);
        best = i;
      }
    });
    return best;
  };
  const interactive = () => here('hero') || (here('objective') && beatIn('objective') === 0);
  const onDisc = () => now3.disc > 0.6 && here('objective');
  const discUnder = (cx, cy) => {
    ndc.set((cx / view.w) * 2 - 1, -(cy / view.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return disc.pick(raycaster.ray);
  };
  // Grab the drum and turn it: dragging rolls the discs; a decisive turn moves a chapter.
  const drag = { on: false, y0: 0, last: 0, moved: false };
  const usable = () => !intro.active && now3.dim > 0.3;
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a, button, input') || !usable()) return;
    if (ringUnder(e.clientX, e.clientY) < 0) return;
    Object.assign(drag, { on: true, y0: e.clientY, last: e.clientY, moved: false });
    document.documentElement.classList.add('is-dragging-rotor');
  });
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    if (drag.on) {
      rings.forEach((r) => (r.offVel -= (e.clientY - drag.last) * 0.9));
      drag.last = e.clientY;
      if (Math.abs(e.clientY - drag.y0) > 6) drag.moved = true;
      return;
    }
    const ring = usable() ? ringUnder(e.clientX, e.clientY) : -1;
    if (ring >= 0 && ring !== pointer.ring) rings[ring].offVel += 5.5;
    pointer.ring = ring;
    document.documentElement.classList.toggle('is-over-rotor', ring >= 0);
    const slice = onDisc() && !e.target.closest('a, button, input') ? discUnder(e.clientX, e.clientY) : null;
    disc.setHover(slice);
    pointer.slice = slice;
    document.documentElement.classList.toggle('is-over-disc', !!slice);
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag.on) return;
    drag.on = false;
    document.documentElement.classList.remove('is-dragging-rotor');
    const dy = e.clientY - drag.y0;
    if (Math.abs(dy) > 60) window.dispatchEvent(new CustomEvent('rotor:navigate', { detail: dy < 0 ? 1 : -1 }));
  });
  window.addEventListener('click', (e) => {
    if (drag.moved) return void (drag.moved = false);
    if (e.target.closest('a, button, input')) return;
    if (onDisc() && discUnder(e.clientX, e.clientY)) return throwDart(performance.now(), true);
    if (!interactive() || ringUnder(e.clientX, e.clientY) < 0) return;
    drawSample(lastNow, true);
  });

  /* ── Camera choreography ───────────────────────────────────────────── */

  const lengthAt = (explode) => RINGS * PITCH * (1 + explode * 1.2) + 2 * CAP_W;

  // What a shot must keep in view: the drum's bounding box (when it shows) and its set pieces.
  const subjectPoints = (p) => {
    const pts = [];
    const L = lengthAt(p.explode) / 2 + 0.35; // the axle's ends
    const top = CAP_R + (p.slots ? 0.9 : 0);
    const bottom = -CAP_R - (p.readout ? 1.25 : 0);
    if (p.dim > 0.02) {
      for (const x of [-L, L]) for (const y of [bottom, top]) for (const z of [-CAP_R, CAP_R]) pts.push(new Vector3(x, y, z));
    }
    for (let k = 0; p.loop && k < 16; k++) {
      const a = (k / 16) * TAU;
      pts.push(new Vector3(Math.cos(a) * LOOP_R * 1.06, Math.sin(a) * LOOP_R * 1.06 - (p.station ? 0.3 : 0), 0));
    }
    if (p.branch) branchTips.forEach((t) => pts.push(t.clone().add(new Vector3(0, 0.5, 0))));
    for (let k = 0; p.disc > 0.5 && k < 24; k++) {
      const a = (k / 24) * TAU;
      const r = DISC_R + 1.25; // the held-out names and template legend around the rim
      for (const y of [0, 1.3]) pts.push(new Vector3(Math.cos(a) * r, DISC_Y + y, Math.sin(a) * r));
    }
    return pts;
  };

  // Camera distance and screen offset that fit the subject into a box (px): for each point, the
  // distance at which it projects just inside the box, in the camera's own basis — exact under
  // perspective, so a near cap can't spill out of the frame.
  const fit = (box, p) => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    const tanX = tan * camera.aspect * Math.max(0.05, box.width / view.w);
    const tanY = tan * Math.max(0.05, box.height / view.h);
    const back = new Vector3(Math.sin(p.az) * Math.cos(p.el), Math.sin(p.el), Math.cos(p.az) * Math.cos(p.el));
    const right = new Vector3(0, 1, 0).cross(back).normalize();
    const up = back.clone().cross(right);
    const look = new Vector3(p.lookX, p.lookY, p.lookZ);
    let dist = 0;
    for (const q of subjectPoints(p)) {
      const v = q.sub(look);
      const depth = v.dot(back);
      dist = Math.max(dist, depth + Math.abs(v.dot(right)) / tanX, depth + Math.abs(v.dot(up)) / tanY);
    }
    return {
      dist: Math.max(dist ? dist * 1.08 : 12, 4.5) * p.zoom, // margin for pointer parallax
      sx: (box.left + box.width / 2 - view.w / 2) / view.w,
      sy: (box.top + box.height / 2 - view.h / 2) / view.h,
    };
  };

  const fits = {};
  const frameEl = document.querySelector('[data-visual-frame]');
  const resize = (w, h) => {
    view.w = w;
    view.h = h;
    camera.aspect = w / h;
    ghostMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.5);
    const narrow = w < 900 || w / h < 1.1;
    // Each chapter's own frame: CSS may split the screen differently per chapter (html[data-chapter]).
    const root = document.documentElement;
    const was = root.dataset.chapter;
    const frameOf = (id) => {
      root.dataset.chapter = id;
      const fr = frameEl?.getBoundingClientRect();
      return fr?.width > 40 && fr?.height > 40 ? fr : { left: 0, top: 0, width: w, height: h };
    };
    for (const [id, shots] of Object.entries(SHOTS)) {
      const frame = frameOf(id);
      fits[id] = shots.map((sh) => {
        const [cx, cy, bw, bh] = (narrow && sh.nbox) || sh.box;
        const box = {
          left: frame.left + (cx - bw / 2) * frame.width,
          top: frame.top + (cy - bh / 2) * frame.height,
          width: bw * frame.width,
          height: bh * frame.height,
        };
        return fit(box, sh);
      });
    }
    if (was === undefined) delete root.dataset.chapter;
    else root.dataset.chapter = was;
  };

  // The camera state within a chapter at progress `local` (0..1 across its beats).
  const poseAt = (id, local) => {
    const shots = SHOTS[id];
    const x = clamp01(local) * (shots.length - 1);
    const i = Math.min(shots.length - 1, Math.floor(x));
    const j = Math.min(shots.length - 1, i + 1);
    const f = smooth(x - i);
    const a = { ...shots[i], ...fits[id][i] };
    const b = { ...shots[j], ...fits[id][j] };
    const out = {};
    for (const k of [...NUM_KEYS, 'dist', 'sx', 'sy']) out[k] = a[k] + (b[k] - a[k]) * f;
    out.az = a.az + wrap(b.az - a.az) * f;
    return out;
  };

  // Disc labels: the templates on the inner ring, the widest words, the toy held-out towers, the
  // last dart's password, the slice under the pointer, and the live readout.
  const pct = (q) => (q >= 0.1 ? `${Math.round(q * 100)}%` : q >= 0.001 ? `${(q * 100).toFixed(1)}%` : '<0.1%');
  const shape = (pattern) => pattern.map((k) => SLOT_LABELS[k] ?? k).join(' + ');
  const dv = new Vector3();
  const atDisc = (node) => disc.group.localToWorld(disc.anchor(node, dv));
  const lift = (v, y) => ((v.y += y), v);
  const placeDiscLabels = () => {
    const o = clamp01((now3.disc - 0.6) / 0.4);
    disc.templates.forEach((t, i) => {
      templateLabels[i].textContent = `${shape(t.pattern)} · ${pct(t.q)}`;
      const a = (t.a[0] + t.a[1]) / 2;
      dv.set(Math.cos(a) * (DISC_R + 0.95), 0, Math.sin(a) * (DISC_R + 0.95));
      place(templateLabels[i], disc.group.localToWorld(dv), t.a[1] - t.a[0] > 0.3 ? o : 0, false);
    });
    const words = disc.templates.flatMap((t) => t.children).sort((x, y) => y.a[1] - y.a[0] - (x.a[1] - x.a[0]));
    wordLabels.forEach((el, k) => {
      const c = words[k];
      el.textContent = c ? c.term : '';
      place(el, c ? atDisc(c) : tmp, c && c.a[1] - c.a[0] > 0.3 ? o * 0.9 : 0, false);
    });
    const heldLeaves = disc.leaves.filter((c) => c.held);
    heldLabels.forEach((el, k) => {
      const c = heldLeaves[k];
      if (!c) return place(el, tmp, 0);
      el.textContent = c.pw;
      el.classList.toggle('is-hit', disc.dart.hits.has(c.pw));
      place(el, atDisc(c), o * 0.85, false);
    });
    const d = disc.dart.node;
    const t = (performance.now() - disc.dart.t0) / 1000;
    if (d) {
      dartLabel.textContent = `◎ ${d.pw} · ${pct(d.q)}`;
      dartLabel.classList.toggle('is-hit', d.held);
    }
    place(dartLabel, d ? lift(atDisc(d), 0.5) : tmp, d && t > 0.3 ? o * Math.max(0, Math.min(1, 3.2 - t)) : 0, false);
    const h = pointer.slice;
    if (h) {
      hoverLabel.textContent = h.ring === 0
        ? `template ${shape(h.pattern)} — ${pct(h.q)} of draws`
        : `${h.parts.map((x) => x.text).join(' + ')} — ${pct(h.q)}${h.leaf ? (h.held ? ' · toy held-out' : '') : ' of draws'}`;
    }
    place(hoverLabel, h ? lift(atDisc(h), 0.25) : tmp, h ? o : 0, false);
    const text = `${disc.dart.count} darts thrown · held-out hit ${disc.dart.hits.size}/${TOY_HELDOUT.size} · held-out mass at τ ${disc.stats.tau.toFixed(1)}: ${pct(disc.stats.heldMass)}`;
    discReadouts.forEach((r) => r.textContent !== text && (r.textContent = text));
  };

  // The current caption's readout mirrors the drum's front row, glyph for glyph: scrambling while a
  // disc spins, ember once it clicks into place, teal on a toy held-out hit.
  const readAndTether = () => {
    beat.cells.forEach((cell, i) => {
      if (i >= RINGS) return;
      const slot = (((Math.round((-ringAngle[i] / TAU) * SLOTS) % SLOTS) + SLOTS) % SLOTS);
      const ch = RING_SET[slot].trim();
      if (cell.textContent !== ch) cell.textContent = ch;
      const cls = Math.abs(ringVel[i]) > 1.5 ? 'readout__cell is-spin' : ringState[i] >= 2 ? 'readout__cell is-hit' : ringState[i] >= 1 ? 'readout__cell is-lock' : 'readout__cell';
      if (cell.className !== cls) cell.className = cls;
    });

    // Where the text comes from: the dart on the disc, a Uses branch tip, the Method station, or
    // the drum's reading row (its near end on wide screens, its underside on phones).
    let src = null;
    const narrowView = view.w < 900 || view.w / view.h < 1.1;
    if (now3.disc > 0.6) {
      if (disc.dart.node) src = atDisc(disc.dart.node);
    } else if (here('uses') && beatIn('uses') > 0) {
      src = tmp.copy(branchTips[beatIn('uses') - 1]);
    } else if (here('method') && stationOf() >= 0) {
      src = loopNodes[stationOf()].getWorldPosition(tmp);
    } else if (now3.dim > 0.3) {
      src = rotor.localToWorld(
        narrowView ? tmp.set(0, -CAP_R - 0.05, CAP_R * 0.5) : tmp.set(ringX[0] - PITCH * 0.7, 0, R + 0.06),
      );
    }
    const from = beat.from;
    const r = from && from.offsetParent ? from.getBoundingClientRect() : null;
    const shown = src && r && r.width && pose.transit < 0.15 && beat.el?.classList.contains('is-read');
    tether.classList.toggle('is-on', !!shown);
    if (!shown) return;
    src.project(camera);
    const ex = ((src.x + 1) / 2) * view.w;
    const ey = ((1 - src.y) / 2) * view.h;
    if (src.z > 1 || ex < -50 || ex > view.w + 50 || ey < -50 || ey > view.h + 50) {
      tether.classList.remove('is-on');
      return;
    }
    const sx = narrowView ? r.left + Math.min(r.width, 280) / 2 : r.right + 10;
    const sy = narrowView ? r.top - 8 : r.top + r.height / 2;
    const d = narrowView
      ? `M${sx},${sy} C${sx},${(sy + ey) / 2} ${ex},${(sy + ey) / 2} ${ex},${ey}`
      : `M${sx},${sy} C${(sx + ex) / 2},${sy} ${(sx + ex) / 2},${ey} ${ex},${ey}`;
    tetherPath.setAttribute('d', d);
    tetherDot.setAttribute('cx', ex.toFixed(1));
    tetherDot.setAttribute('cy', ey.toFixed(1));
    tether.classList.toggle('is-locked', phase === 'hold');
    tether.classList.toggle('is-hit', phase === 'hold' && hit);
  };

  const now3 = {};
  const update = (now) => {
    step(now);
    const i0 = Math.max(0, Math.min(ids.length - 1, Math.floor(pose.chapter)));
    const i1 = Math.min(ids.length - 1, i0 + 1);
    const f = smooth(clamp01(pose.chapter - i0));
    // At rest: the chapter's own shots. In flight: from the last shot of one chapter to the first of the next.
    const a = f > 0 ? poseAt(ids[i0], 1) : poseAt(ids[i0], pose.local);
    const b = f > 0 ? poseAt(ids[i1], 0) : a;
    for (const k of Object.keys(a)) now3[k] = a[k] + (b[k] - a[k]) * f;
    now3.az = a.az + wrap(b.az - a.az) * f;

    // Transit arc: the camera pulls out and lifts while it travels between shots.
    const arc = Math.sin(Math.PI * f);
    let dist = now3.dist * (1 + 0.35 * arc);
    let el = now3.el + 0.14 * arc;
    let az = now3.az;

    // Hero reveal: a dolly-in from far and high while the drum spells the name.
    let introGain = 1;
    if (intro.active) {
      const t = clamp01((now - intro.t0) / intro.dur);
      const e = easeOutExpo(t);
      dist *= 1 + 1.6 * (1 - e);
      el += 0.35 * (1 - e);
      az -= 0.7 * (1 - e);
      introGain = clamp01((now - intro.t0) / 1100);
      if (t >= 1) intro.active = false;
    }

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    az += pointer.x * 0.12;
    el -= pointer.y * 0.06;
    camera.position.set(
      now3.lookX + Math.sin(az) * Math.cos(el) * dist,
      now3.lookY + Math.sin(el) * dist,
      now3.lookZ + Math.cos(az) * Math.cos(el) * dist,
    );
    camera.lookAt(now3.lookX, now3.lookY, now3.lookZ);
    camera.setViewOffset(view.w, view.h, -now3.sx * view.w, -now3.sy * view.h, view.w, view.h);
    camera.updateProjectionMatrix();

    // The drum rolls a touch with scroll speed and springs back level.
    rotor.rotation.x += (-pose.velocity * 0.35 - rotor.rotation.x) * 0.08;
    rotor.position.y = Math.sin(now * 0.0006) * 0.04;
    rotor.updateMatrixWorld();

    // Disc layout: exploded views separate the grammar's slot groups more than their letters.
    const ex = now3.explode;
    let x = 0;
    const xs = rings.map((ring, i) => {
      if (i > 0) x += PITCH * (1 + ex * 0.35) + (ring.slot !== rings[i - 1].slot ? ex * 0.55 : 0);
      return x;
    });
    const mid = (xs[0] + xs[RINGS - 1]) / 2;
    discs.forEach((disc, i) => {
      ringX[i] = xs[i] - mid;
      disc.position.x = ringX[i];
    });
    const half = (xs[RINGS - 1] - xs[0]) / 2 + DISC_W / 2;
    caps[0].position.x = -half - CAP_W / 2 - ex * 0.3;
    caps[1].position.x = half + CAP_W / 2 + ex * 0.3;
    axle.scale.x = 2 * half + 2 * CAP_W + 1.2 + ex;
    bars.forEach((bar) => (bar.scale.x = 2 * half));

    const dim = now3.dim * introGain;
    glyphMat.uniforms.uDim.value = dim;
    solids.forEach((m) => (m.uniforms.uDim.value = (0.35 + 0.65 * now3.dim) * clamp01(now3.dim * 4) * introGain));
    barMat.opacity = 0.75 * dim;
    rimMat.opacity = 0.9 * dim;

    rotor.visible = now3.dim > 0.02;

    // The distribution: τ breathes on its own on the temperature beat until the visitor takes over;
    // darts fall by themselves now and then, more rarely once the visitor has thrown one.
    disc.update(now, { opacity: clamp01(now3.disc) });
    if (now3.disc > 0.6) {
      if (now3.breathe > 0.5 && !discTau.manual && now - discTau.lastBreath > 200) {
        discTau.lastBreath = now;
        setDiscTau(Math.round(Math.min(2.6, Math.max(0.5, 1.4 + 1.1 * Math.sin(now * 0.0007))) * 10) / 10);
      } else if (now3.breathe < 0.5 && !discTau.manual && discTau.value !== 1 && here('objective')) {
        setDiscTau(1);
      }
      if (now - lastThrow > 2300 && now - userThrow > 6000) throwDart(now, false);
    }

    const glowing = hit && phase === 'hold';
    aura.position.copy(rotor.position);
    aura.quaternion.copy(camera.quaternion);
    auraMat.uniforms.uOpacity.value = 0.16 * now3.aura * dim * (glowing ? 1.6 : 1);
    auraMat.uniforms.uColor.value = glowing ? C.heldout : C.ember;

    ghostMat.uniforms.uOpacity.value = now3.ghost;
    ghostMat.uniforms.uTime.value = now / 1000;
    ghosts.visible = now3.ghost > 0.01;
    if (now3.ghost > 0.5 && Math.random() < 0.02) flare(1);

    branches.visible = now3.branch > 0.01;
    const useTarget = here('uses') ? beatIn('uses') - 1 : -1; // each Uses beat lights its branch
    branchMats.forEach((m, i) => {
      useHi[i] += ((useTarget === i ? 1 : 0) - useHi[i]) * 0.12;
      m.uniforms.uGrow.value = now3.branch;
      m.uniforms.uTime.value = now / 1000;
      m.uniforms.uHi.value = useHi[i];
    });
    branches.children.forEach((c) => c.material.uniforms || (c.material.opacity = now3.branch));

    loop.visible = now3.loop > 0.01;
    loopRing.material.opacity = 0.5 * now3.loop;
    const station = Math.max(0, stationOf());
    const inMethod = here('method') && stationOf() >= 0;
    loop.position.copy(rotor.position);
    loop.rotation.z += wrap(Math.PI - (station / 6) * TAU - loop.rotation.z) * 0.06; // current station → reading side
    loopNodes.forEach((node, k) => {
      node.material.opacity = now3.loop;
      node.material.color.copy(k === station && inMethod ? C.ember : C.ash);
      node.scale.setScalar(k === station && inMethod ? 1.8 : 1);
    });

    // Labels: the grammar slots of the word on the drum, the uses, the toy readout, the station.
    const groups = [];
    rings.forEach((ring, i) => {
      if (ring.slot === ' ') return;
      const g = groups[groups.length - 1];
      if (g && g.slot === ring.slot && g.end === i - 1) g.end = i;
      else groups.push({ slot: ring.slot, start: i, end: i });
    });
    slotLabels.forEach((el, k) => {
      const g = groups[k];
      if (!g) return place(el, tmp, 0);
      el.textContent = g.slot === 'name' ? '⟨name⟩' : SLOT_LABELS[g.slot] ? `⟨${SLOT_LABELS[g.slot]}⟩` : `'${g.slot}'`;
      place(el, new Vector3((ringX[g.start] + ringX[g.end]) / 2, CAP_R + 0.42, 0), now3.slots * dim);
    });
    const usesOn = now3.uses * clamp01(now3.branch * 1.4 - 0.3);
    useLabels.forEach((el, i) => {
      place(el, new Vector3(0, 0.32, 0).add(branchTips[i]), usesOn, false);
      el.classList.toggle('is-hi', useHi[i] > 0.5);
    });
    placeDiscLabels();
    readoutLabel.textContent = `toy sampler · ${tally.drawn} drawn · held-out ${tally.hits.size}/${TOY_HELDOUT.size} hit`;
    place(readoutLabel, new Vector3(0, -CAP_R - 1.05, 0), now3.readout);
    readAndTether();
    stationLabel.textContent = `station ${String(station + 1).padStart(2, '0')} · ${STATIONS[station]}`;
    place(stationLabel, new Vector3(0, -LOOP_R - 0.45, 0), now3.station * (inMethod ? 1 : 0));
  };

  return {
    scene,
    camera,
    resize,
    update,
    debug: () => ({
      fits, now3: { ...now3 }, view: { ...view }, pose: { ...pose },
      loop: { rotZ: loop.rotation.z, station: stationOf() },
    }),
    /** chapter: float scene index (fractional in transit); local: 0..1 progress within the scene;
     *  transit: 0 at rest → 1 mid-travel; velocity: signed scroll speed (viewports/s, smoothed). */
    setChapter(chapter, local, { transit = 0, velocity = 0 } = {}) {
      pose.chapter = chapter;
      pose.local = local;
      pose.transit = transit;
      pose.velocity = velocity;
    },
    /** The hero reveal: dolly in from afar while the drum spells the name. */
    reveal() {
      intro.active = true;
      intro.t0 = performance.now();
      rings.forEach((r) => (r.offVel += 30)); // arrive spinning
      spinTo(BOOKEND, intro.t0 + 700, { slow: true });
    },
  };
}
