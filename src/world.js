// The 3D world: The Rotor — a cryptex of twelve glyph discs on one axle, the sampler made
// physical. Its discs spin and click into place left→right until the front reading row spells a
// toy candidate (teal when it lands on the toy held-out set).
//
// It is woven into the page, not parked beside it:
//  · position — every scene carries a [data-rotor-anchor] (the hero a [data-rotor-slot]); CSS
//    places it per breakpoint and the camera fits the rotor into it.
//  · motion   — a dolly-in reveal that locks E-N-I-G-M-I-S-T-A with the wordmark; discs scramble
//    while the camera travels between shots and click back on arrival; the drum rolls with scroll.
//  · content  — structure groups the discs by the live candidate's grammar slots (labelled);
//    uses grows ⟨audit⟩ ⟨decoy⟩ ⟨synth⟩ branches that light with their cards; objective keeps a
//    live toy readout; method performs each station; the sandbox plays its draws on the drum.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  Group, InstancedBufferAttribute, InstancedBufferGeometry, LinearSRGBColorSpace, Matrix4, Mesh,
  MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Points, Raycaster, Scene, ShaderMaterial, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector2, Vector3,
} from 'three';
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
const CHAPTER_WORD = { hero: BOOKEND, structure: 'structure', uses: 'uses', objective: 'objective', method: 'method', sandbox: 'sandbox', install: BOOKEND };
const SPIKE_MAX = 0.9; // world units of spike length at p = 1 (scaled by √p so small odds stay visible)
const KERNEL_SAMPLES = 3000;

// Palette as raw display values: the whole pipeline stays in these numbers (no colour-space
// conversion), so a hex here is the hex on screen — same as the CSS tokens.
const raw = (hex) =>
  new Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, LinearSRGBColorSpace);
const C = {
  void: raw(0x07080b), ink: raw(0x10131a), rule: raw(0x252b36), ash: raw(0x8a8f99),
  bone: raw(0xe9e4d8), ember: raw(0xe8a33d), heldout: raw(0x3cc6b4),
};

// Per-chapter poses. Placement (sx/sy/dist) comes from the scene's anchor; these say how the
// rotor is seen and which set piece is up. slots/uses/readout/station: label groups.
const POSES = {
  hero: { az: -0.22, el: 0.12, explode: 0, dim: 1, ghost: 0, branch: 0, loop: 0, aura: 1, lookY: 0, slots: 0, uses: 0, readout: 0, station: 0, kernel: 0.55 },
  structure: { az: -0.55, el: 0.2, explode: 1, dim: 1, ghost: 0, branch: 0, loop: 0, aura: 0.6, lookY: 0.2, slots: 1, uses: 0, readout: 0, station: 0, kernel: 0.35 },
  uses: { az: 0.4, el: 0.32, explode: 0, dim: 0.9, ghost: 0, branch: 1, loop: 0, aura: 0.5, lookY: 1.0, slots: 0, uses: 1, readout: 0, station: 0, kernel: 0.2 },
  objective: { az: -0.6, el: 0.12, explode: 0, dim: 1, ghost: 1, branch: 0, loop: 0, aura: 0.7, lookY: -0.15, slots: 0, uses: 0, readout: 1, station: 0, kernel: 1 },
  method: { az: -0.3, el: 0.16, explode: 0, dim: 0.95, ghost: 0.35, branch: 0, loop: 1, aura: 0.5, lookY: 0, slots: 0, uses: 0, readout: 0, station: 1, kernel: 0.8 },
  sandbox: { az: -0.45, el: 0.12, explode: 0, dim: 0.95, ghost: 0, branch: 0, loop: 0, aura: 0.6, lookY: 0, slots: 0, uses: 0, readout: 0, station: 0, kernel: 1 },
  scope: { az: 1.4, el: 0.2, explode: 0, dim: 0.2, ghost: 0, branch: 0, loop: 0, aura: 0, lookY: 0, slots: 0, uses: 0, readout: 0, station: 0, kernel: 0 },
  install: { az: 0.15, el: 0.14, explode: 0, dim: 1, ghost: 0, branch: 0, loop: 0, aura: 1, lookY: 0, slots: 0, uses: 0, readout: 0, station: 0, kernel: 0.55 },
};
const KEYS = [...Object.keys(POSES.hero), 'dist', 'sx', 'sy'];

const glsl = (x) => (Number.isInteger(x) ? `${x}.0` : `${x}`); // numbers as GLSL float literals
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const easeOutBack = (t, s = 0.9) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const wrapUnit = (x) => ((((x + 0.5) % 1) + 1) % 1) - 0.5;

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

// Kernel spikes: one per disc slot, radial, length ∝ √p(glyph | position); turn with their disc.
const spikeVert = /* glsl */ `
  attribute float aRing;
  attribute float aSlot;
  attribute float aP;
  uniform float uRingAngle[${RINGS}];
  uniform float uRingX[${RINGS}];
  uniform float uKernel;
  varying float vP;
  varying float vFront;
  varying float vFacing;
  void main() {
    int r = int(aRing + 0.5);
    float a = aSlot / ${glsl(SLOTS)} * 6.2831853 + uRingAngle[r];
    vec3 n = vec3(0.0, sin(a), cos(a));
    vec3 t = vec3(0.0, cos(a), -sin(a));
    float len = sqrt(aP) * ${glsl(SPIKE_MAX)} * uKernel;
    vec3 p = vec3(uRingX[r] + position.x, 0.0, 0.0) + n * (${glsl(CAP_R + 0.03)} + position.y * len) + t * position.z;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFacing = dot(normalize(normalMatrix * n), normalize(-mv.xyz));
    float w = mod(a + 3.14159265, 6.2831853) - 3.14159265;
    vFront = 1.0 - smoothstep(0.5, 1.5, abs(w) / (6.2831853 / ${glsl(SLOTS)}));
    vP = aP;
    gl_Position = projectionMatrix * (aP > 0.0005 ? mv : vec4(0.0, 0.0, -2.0, 1.0));
  }
`;

const spikeFrag = /* glsl */ `
  uniform vec3 uEmber;
  uniform vec3 uBone;
  uniform float uKernel;
  uniform float uDim;
  varying float vP;
  varying float vFront;
  varying float vFacing;
  void main() {
    float glow = 0.35 + 1.6 * sqrt(vP);
    vec3 col = mix(uEmber, uBone, vFront * 0.6);
    gl_FragColor = vec4(col * glow, uKernel * uDim * smoothstep(-0.2, 0.4, vFacing) * (0.5 + vFront * 0.8));
  }
`;

// Template wheel on the left cap: sectors ∝ p(template)^(1/τ), a needle on the template just drawn.
const wheelFrag = /* glsl */ `
  uniform float uEdges[5];
  uniform float uActive;
  uniform float uNeedle;
  uniform float uOpacity;
  uniform vec3 uEmber;
  uniform vec3 uAsh;
  varying vec2 vUv;
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = fract(atan(d.x, d.y) / 6.2831853 + 1.0); // 0 at the top, clockwise
    float idx = 0.0;
    float edge = 1.0;
    for (int i = 1; i < 5; i++) {
      if (a >= uEdges[i]) idx = float(i);
      edge = min(edge, abs(a - uEdges[i]) * r * 6.2831853);
    }
    edge = min(edge, a * r * 6.2831853);
    float band = smoothstep(0.4, 0.43, r) * (1.0 - smoothstep(0.95, 0.98, r));
    float divider = smoothstep(0.006, 0.02, edge);
    float on = idx == uActive ? 1.0 : 0.0;
    vec3 col = mix(uAsh * 0.55, uEmber, mod(idx, 2.0) * 0.35 + 0.45 + on * 0.5);
    float needleA = fract(uNeedle);
    float da = abs(a - needleA);
    da = min(da, 1.0 - da) * r * 6.2831853;
    float needle = (1.0 - smoothstep(0.004, 0.016, da)) * step(r, 0.97);
    float rim = smoothstep(0.97, 0.985, r) * (1.0 - smoothstep(0.99, 1.0, r));
    gl_FragColor = vec4(col * band * divider + uEmber * (needle * 1.4 + rim * 0.6), (band * divider * 0.85 + needle + rim) * uOpacity);
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
  let useTarget = -1;
  document.querySelectorAll('.uses > li').forEach((li, i) => {
    li.addEventListener('pointerenter', () => (useTarget = i));
    li.addEventListener('pointerleave', () => (useTarget = -1));
    li.addEventListener('focusin', () => (useTarget = i));
    li.addEventListener('focusout', () => (useTarget = -1));
  });

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
  const wheelLabel = makeLabel('world-label--kernel');
  const spikeLabel = makeLabel('world-label--kernel');
  spikeLabel.textContent = 'spike length · p(glyph | position)';
  const stationLabel = makeLabel('world-label--station');
  const tmp = new Vector3();
  const place = (el, point, opacity, inRotor = true) => {
    if (opacity < 0.02) {
      el.style.opacity = '0';
      return;
    }
    tmp.copy(point);
    if (inRotor) rotor.localToWorld(tmp);
    tmp.project(camera);
    el.style.opacity = String(opacity);
    el.style.transform = `translate(${((tmp.x + 1) / 2) * view.w}px, ${((1 - tmp.y) / 2) * view.h}px) translate(-50%, -50%)`;
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

  const spinTo = (word, now, { chars, fast = false, slow = false } = {}) => {
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
      ring.t0 = now + i * (fast ? 40 : slow ? 150 : 85) + Math.random() * (fast ? 50 : 120);
      ring.dur = fast ? 520 + Math.random() * 200 : slow ? 2100 + Math.random() * 500 : 1250 + Math.random() * 450;
      ring.slot = slot;
      ringState[i] = 0;
    });
    phase = 'spin';
  };

  const drawSample = (now, fast) => {
    const s = sample(TOY_GRAMMAR, { tau: kernel.tau });
    tally.drawn++;
    wheel.active = TOY_GRAMMAR.templates.findIndex((t) => t.id === s.template);
    spinTo(s.pw, now, { chars: s.chars, fast });
  };

  /* ── The kernel, in geometry ───────────────────────────────────────── */
  // Spikes: p(glyph | disc) estimated by sampling the induced grammar at τ, with words centred on
  // the drum exactly as the sampler places them. Wheel: template odds p^(1/τ), renormalised.
  const kernel = { tau: 1.4 };
  const spikeGeo = new InstancedBufferGeometry();
  const spikeBox = new BoxGeometry(0.05, 1, 0.028).translate(0, 0.5, 0);
  spikeGeo.index = spikeBox.index;
  spikeGeo.setAttribute('position', spikeBox.getAttribute('position'));
  spikeGeo.setAttribute('aRing', new InstancedBufferAttribute(aRing, 1));
  spikeGeo.setAttribute('aSlot', new InstancedBufferAttribute(aSlot, 1));
  const aP = new Float32Array(n);
  const aPAttr = new InstancedBufferAttribute(aP, 1);
  spikeGeo.setAttribute('aP', aPAttr);
  spikeGeo.instanceCount = n;
  const spikeMat = new ShaderMaterial({
    vertexShader: spikeVert,
    fragmentShader: spikeFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uRingAngle: { value: ringAngle }, uRingX: { value: ringX }, uKernel: { value: 0 }, uDim: { value: 1 },
      uEmber: { value: C.ember }, uBone: { value: C.bone },
    },
  });
  const spikes = new Mesh(spikeGeo, spikeMat);
  spikes.frustumCulled = false;
  rotor.add(spikes);

  const wheel = { active: -1, needle: 0, target: 0 };
  const wheelMat = new ShaderMaterial({
    vertexShader: auraVert,
    fragmentShader: wheelFrag,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uEdges: { value: [0, 0, 0, 0, 0] }, uActive: { value: -1 }, uNeedle: { value: 0 }, uOpacity: { value: 0 },
      uEmber: { value: C.ember }, uAsh: { value: C.ash },
    },
  });
  const wheelMesh = new Mesh(new PlaneGeometry(CAP_R * 1.9, CAP_R * 1.9), wheelMat);
  wheelMesh.rotation.y = -Math.PI / 2; // faces out of the left cap (−x)
  wheelMesh.position.x = -CAP_W / 2 - 0.004;
  caps[0].add(wheelMesh);

  const computeKernel = () => {
    const counts = new Float32Array(n);
    for (let k = 0; k < KERNEL_SAMPLES; k++) {
      centred(sample(TOY_GRAMMAR, { tau: kernel.tau }).chars).forEach(({ ch }, r) => {
        const c = RING_SET.indexOf(ch.toLowerCase());
        if (c > 0) counts[r * SLOTS + c]++; // slot 0 is the blank: no glyph at this position
      });
    }
    for (let i = 0; i < n; i++) aP[i] = counts[i] / KERNEL_SAMPLES;
    aPAttr.needsUpdate = true;
    const w = TOY_GRAMMAR.templates.map((t) => t.p ** (1 / kernel.tau));
    const sum = w.reduce((a, b) => a + b, 0);
    kernel.templates = TOY_GRAMMAR.templates.map((t, i) => ({ ...t, q: w[i] / sum }));
    let acc = 0;
    const edges = wheelMat.uniforms.uEdges.value;
    kernel.templates.forEach((t, i) => {
      edges[i] = acc;
      acc += t.q;
    });
    edges[4] = 1;
  };
  computeKernel();
  let tauTimer = 0;
  window.addEventListener('sandbox:tau', (e) => {
    kernel.tau = e.detail;
    clearTimeout(tauTimer);
    tauTimer = setTimeout(computeKernel, 90);
  });

  let batch = []; // the sandbox's current list: cycled on the drum while the visitor is there
  let sandboxPhase = null; // the induction step running in the sandbox, spelled on the drum
  window.addEventListener('sandbox:phase', (e) => {
    sandboxPhase = e.detail;
    if (sandboxPhase !== 'sample') batch = [];
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
  let arrival = null; // on reaching a chapter, the drum spells its name
  window.addEventListener('stage:scene', (e) => {
    const word = CHAPTER_WORD[e.detail];
    arrival = word ? { word, t: performance.now() } : null;
  });
  const stationOf = () => Math.max(0, Math.min(5, Math.round(pose.local * 5)));
  const mode = () => {
    const c = pose.chapter;
    const here = Math.abs(c - at('sandbox')) < 0.5;
    if (here && !inSandbox) window.dispatchEvent(new CustomEvent('sandbox:request')); // replay its list
    inSandbox = here;
    if (intro.active) return { word: BOOKEND };
    if (arrival && performance.now() - arrival.t < 3400) return { word: arrival.word };
    if (c >= at('scope') + 0.5) return { word: BOOKEND };
    if (here && sandboxPhase && sandboxPhase !== 'sample') return { word: sandboxPhase };
    if (here && batch.length) {
      if (!queue.length) queue = [...batch];
      return { queue: true };
    }
    if (Math.abs(c - at('method')) < 0.5) {
      const s = stationOf();
      if (s === 2) return { sample: true, fast: true, hold: 350 };
      if (s === 3) return { sample: true, fast: true, hold: 700 };
      return { word: STATIONS[s], refine: s === 4 };
    }
    return { sample: true, hold: 1700 };
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

    if (want.word && current !== want.word) {
      spinTo(want.word, now, { fast: !intro.active });
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
  const interactive = () => pose.chapter < 0.5 || Math.abs(pose.chapter - at('objective')) < 0.5;
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
    if (e.target.closest('a, button') || !interactive() || ringUnder(e.clientX, e.clientY) < 0) return;
    drawSample(lastNow, true);
  });

  /* ── Camera choreography ───────────────────────────────────────────── */

  const fits = {};
  const lengthAt = (explode) => RINGS * PITCH * (1 + explode * 1.2) + 2 * CAP_W;

  // Transform-free layout box of an anchor (offset chain ignores the stage's shot transforms).
  const boxOf = (el) => {
    let x = 0;
    let y = 0;
    for (let node = el; node; node = node.offsetParent) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
  };

  const fit = (box, p) => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    const L = lengthAt(p.explode);
    const D = 2 * CAP_R;
    let W = L * Math.abs(Math.cos(p.az)) + D * Math.abs(Math.sin(p.az));
    let H = D * Math.cos(p.el) + L * Math.abs(Math.sin(p.az) * Math.sin(p.el));
    if (p.loop) {
      W = Math.max(W, 2 * LOOP_R * 1.1);
      H = Math.max(H, 2 * LOOP_R * 1.1);
    }
    if (p.branch) {
      W = Math.max(W, 5.6);
      H += 2.4;
    }
    if (p.slots) H += 0.9; // room for the slot labels above the discs
    const fracW = Math.max(0.05, box.width / view.w);
    const fracH = Math.max(0.05, box.height / view.h);
    return {
      dist: Math.max(W / (2 * tan * camera.aspect * fracW), H / (2 * tan * fracH), 4.5),
      sx: (box.left + box.width / 2 - view.w / 2) / view.w,
      sy: (box.top + box.height / 2 - view.h / 2) / view.h,
    };
  };

  // Text bound to the drum (wide screens): the real DOM text of Uses and Method rides 3D points.
  const useItems = [...document.querySelectorAll('#uses .uses > li')];
  const stationItems = [...document.querySelectorAll('#method [data-inspect-track] > li')];
  const sizes = new Map();
  const toScreen = (v) => {
    tmp.copy(v).project(camera);
    return { x: ((tmp.x + 1) / 2) * view.w, y: ((1 - tmp.y) / 2) * view.h };
  };
  // In bound mode the Uses list and the Method stations are lifted out of the shot's content
  // window (which clips and fades its edges) into the shot itself; they go back on narrow screens.
  const lifted = ['#uses .uses', '#method .inspect']
    .map((sel) => document.querySelector(sel))
    .filter(Boolean)
    .map((el) => {
      const marker = document.createComment('bound-text');
      el.before(marker);
      return { el, marker, scene: el.closest('[data-scene]') };
    });
  const setLifted = (bound) =>
    lifted.forEach(({ el, marker, scene }) => {
      if (bound && el.parentElement !== scene) scene.append(el);
      if (!bound && el.parentElement === scene) marker.after(el);
    });
  const overlaps = (a, b) => a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top;
  // side: where the block sits relative to its point — 'left' | 'right' | 'above'. It is clamped to
  // the frame and pushed clear of `avoid` (the shot's headline and blocks already placed).
  const bind = (el, point, side, opacity, avoid) => {
    const { w, h } = sizes.get(el) ?? { w: 0, h: 0 };
    const at = toScreen(point);
    const r = { w, h, x: side === 'left' ? at.x - w - 18 : side === 'right' ? at.x + 18 : at.x - w / 2 };
    r.y = side === 'above' ? at.y - h - 18 : at.y - h / 2;
    const clampX = (x) => Math.min(view.w - w - 24, Math.max(24, x));
    const clampY = (y) => Math.min(view.h - h - 84, Math.max(84, y));
    const clear = (c) => !avoid.some((o) => overlaps(c, o));
    r.x = clampX(r.x);
    r.y = clampY(r.y);
    if (!clear(r)) {
      // Search beside each obstacle (below, above, right, left); keep the first clear spot, else
      // the original. Candidates are clamped to the frame, so a "fix" can't drift off-screen.
      const candidates = avoid.flatMap((o) => [
        { x: r.x, y: o.bottom + 14 }, { x: r.x, y: o.top - h - 14 },
        { x: o.right + 14, y: r.y }, { x: o.left - w - 14, y: r.y },
      ]).map((c) => ({ w, h, x: clampX(c.x), y: clampY(c.y) }));
      const spot = candidates.find(clear);
      if (spot) Object.assign(r, spot);
    }
    avoid.push({ left: r.x, right: r.x + w, top: r.y, bottom: r.y + h });
    const box = el.parentElement.getBoundingClientRect();
    el.style.transform = `translate(${r.x - box.left}px, ${r.y - box.top}px)`;
    el.style.opacity = String(opacity);
  };
  const headlineRects = (id) =>
    [...document.querySelectorAll(`#${id} .scene__body > :is(.eyebrow, h2, .lede, .eyebrow-row)`)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width);
  const nodeWorld = new Vector3();

  const resize = (w, h) => {
    view.w = w;
    view.h = h;
    const bound = w >= 1180 && h >= 680; // room for text beside the drum; smaller screens keep the column layout
    document.documentElement.classList.toggle('is-bound', bound);
    setLifted(bound);
    [...useItems, ...stationItems].forEach((el) => {
      if (!bound) el.style.transform = el.style.opacity = '';
      sizes.set(el, { w: el.offsetWidth, h: el.offsetHeight });
    });
    camera.aspect = w / h;
    ghostMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.5);
    for (const id of ids) {
      const anchor = document.getElementById(id).querySelector('[data-rotor-slot], [data-rotor-anchor]');
      const box = anchor && anchor.offsetWidth ? boxOf(anchor) : null;
      fits[id] = box ? fit(box, POSES[id]) : { dist: 26, sx: narrow() ? 0 : 0.36, sy: -0.3 };
    }
  };

  // Live anchors move with their shot's content (the sandbox's slot scrolls with its panels),
  // so they are re-measured on screen every frame while that shot is near.
  const live = Object.fromEntries(
    ids.map((id) => [id, document.getElementById(id).querySelector('[data-rotor-live]')]).filter(([, a]) => a),
  );
  const followLive = () => {
    for (const [id, anchor] of Object.entries(live)) {
      if (Math.abs(pose.chapter - at(id)) >= 1) continue;
      const r = anchor.getBoundingClientRect();
      if (r.width && r.height) fits[id] = fit(r, POSES[id]);
    }
  };

  const poseFor = (id) => {
    const p = { ...POSES[id], ...fits[id] };
    if (id === 'method' && stationOf() === 1) p.explode = 0.65; // induce: the grammar, exploded into its slots
    return p;
  };

  const now3 = {};
  const update = (now) => {
    step(now);
    followLive();
    const i0 = Math.max(0, Math.min(ids.length - 1, Math.floor(pose.chapter)));
    const i1 = Math.min(ids.length - 1, i0 + 1);
    const f = smooth(clamp01(pose.chapter - i0));
    const a = poseFor(ids[i0]);
    const b = poseFor(ids[i1]);
    for (const k of KEYS) now3[k] = a[k] + (b[k] - a[k]) * f;
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
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist + now3.lookY, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, now3.lookY, 0);
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
    solids.forEach((m) => (m.uniforms.uDim.value = (0.35 + 0.65 * now3.dim) * introGain));
    barMat.opacity = 0.75 * dim;
    rimMat.opacity = 0.9 * dim;

    // The kernel: spikes on every disc, the template wheel on the left cap.
    spikeMat.uniforms.uKernel.value = now3.kernel * introGain;
    spikeMat.uniforms.uDim.value = dim;
    spikes.visible = now3.kernel > 0.01;
    wheelMat.uniforms.uOpacity.value = now3.kernel * dim;
    wheelMat.uniforms.uActive.value = phase === 'hold' ? wheel.active : -1;
    if (wheel.active >= 0) {
      const e = wheelMat.uniforms.uEdges.value;
      wheel.target = (e[wheel.active] + e[wheel.active + 1]) / 2;
    }
    wheel.needle += wrapUnit(wheel.target - wheel.needle) * 0.08;
    wheelMat.uniforms.uNeedle.value = wheel.needle;

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
    branchMats.forEach((m, i) => {
      useHi[i] += ((useTarget === i ? 1 : 0) - useHi[i]) * 0.12;
      m.uniforms.uGrow.value = now3.branch;
      m.uniforms.uTime.value = now / 1000;
      m.uniforms.uHi.value = useHi[i];
    });
    branches.children.forEach((c) => c.material.uniforms || (c.material.opacity = now3.branch));

    loop.visible = now3.loop > 0.01;
    loopRing.material.opacity = 0.5 * now3.loop;
    const station = stationOf();
    const inMethod = Math.abs(pose.chapter - at('method')) < 0.5;
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
    const bound = document.documentElement.classList.contains('is-bound');
    const usesOn = now3.uses * clamp01(now3.branch * 1.4 - 0.3);
    useLabels.forEach((el, i) => {
      place(el, new Vector3(0, 0.32, 0).add(branchTips[i]), bound ? 0 : usesOn, false);
      el.classList.toggle('is-hi', useHi[i] > 0.5);
    });
    if (bound && usesOn > 0.01) {
      const avoid = headlineRects('uses');
      useItems.forEach((el, i) => bind(el, branchTips[i], ['left', 'above', 'right'][i], usesOn, avoid));
    }
    if (bound && inMethod) {
      loopNodes[station].getWorldPosition(nodeWorld);
      const avoid = headlineRects('method');
      stationItems.forEach((el, k) => {
        el.classList.toggle('is-current', k === station);
        if (k === station) bind(el, nodeWorld, 'left', 1, avoid);
      });
    }
    wheelLabel.textContent = `templates · τ ${kernel.tau.toFixed(1)}`;
    place(wheelLabel, new Vector3(caps[0].position.x - 0.3, -CAP_R - 0.4, 0), now3.kernel > 0.9 ? now3.kernel * dim : 0);
    place(spikeLabel, new Vector3(0, CAP_R + SPIKE_MAX + 0.35, 0), now3.kernel > 0.9 && !now3.slots ? now3.kernel * dim * 0.85 : 0);
    readoutLabel.textContent = `toy sampler · ${tally.drawn} drawn · held-out ${tally.hits.size}/${TOY_HELDOUT.size} hit`;
    place(readoutLabel, new Vector3(0, -CAP_R - 1.05, 0), now3.readout);
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
      loop: { rotZ: loop.rotation.z, station: stationOf(), nodes: loopNodes.map((nd) => toScreen(nd.getWorldPosition(new Vector3()))) },
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
