// The 3D world: The Rotor — a cryptex of twelve glyph discs on one axle, the sampler made
// physical. Its discs spin and click into place left→right until the front reading row spells
// a toy candidate (teal when it lands on the toy held-out set). One continuous scene; the stage
// moves the camera between per-chapter poses and fades in each chapter's set piece:
//   hero → front view · structure → exploded discs · uses → three branches
//   objective → held-out ghosts · method → orbit around a six-node loop ring
//   sandbox/scope → recede · install → pull back, spelling "enigmista" again.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Points, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { glyphIndex } from './glyphs.js';
import { sample } from './sampler.js';
import { TOY_GRAMMAR, TOY_HELDOUT } from './toy/grammar.js';

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
const FOV = 30;
const BOOKEND = 'enigmista';

const C = {
  void: new Color(0x07080b), ink: new Color(0x10131a), rule: new Color(0x252b36), ash: new Color(0x8a8f99),
  bone: new Color(0xe9e4d8), ember: new Color(0xe8a33d), heldout: new Color(0x3cc6b4),
};

// Camera + set-piece poses per chapter (sx/sy: where the rotor sits on screen, as a fraction of
// the viewport from centre; dist 0 = fit the hero's rotor slot).
const POSES = {
  hero: { az: -0.22, el: 0.12, dist: 0, sx: 0, sy: 0, explode: 0, dim: 1, ghost: 0, branch: 0, loop: 0 },
  structure: { az: -0.9, el: 0.22, dist: 17, sx: 0.32, sy: 0, explode: 0.55, dim: 0.95, ghost: 0, branch: 0, loop: 0 },
  uses: { az: 0.45, el: 0.35, dist: 17, sx: 0.3, sy: -0.1, explode: 0, dim: 0.75, ghost: 0, branch: 1, loop: 0 },
  objective: { az: -0.25, el: 0.08, dist: 16, sx: 0.33, sy: 0, explode: 0, dim: 0.9, ghost: 1, branch: 0, loop: 0 },
  method: { az: 0.7, el: 0.32, dist: 19, sx: 0.32, sy: -0.24, explode: 0, dim: 0.8, ghost: 0.2, branch: 0, loop: 1 },
  sandbox: { az: 1.2, el: 0.3, dist: 24, sx: 0.38, sy: -0.3, explode: 0, dim: 0.3, ghost: 0, branch: 0, loop: 0 },
  scope: { az: 1.5, el: 0.2, dist: 24, sx: 0.38, sy: -0.3, explode: 0, dim: 0.2, ghost: 0, branch: 0, loop: 0 },
  install: { az: 0.15, el: 0.14, dist: 16, sx: 0.33, sy: -0.06, explode: 0, dim: 1, ghost: 0, branch: 0, loop: 0 },
};
const KEYS = Object.keys(POSES.hero);

const glsl = (x) => (Number.isInteger(x) ? `${x}.0` : `${x}`); // numbers as GLSL float literals
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const easeOutBack = (t, s = 0.9) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

/* ── Shaders ─────────────────────────────────────────────────────────── */

const glyphVert = /* glsl */ `
  attribute float aRing;
  attribute float aSlot;
  attribute float aGlyph;
  uniform float uRingAngle[${RINGS}];
  uniform float uRingVel[${RINGS}];
  uniform float uRingState[${RINGS}];
  uniform float uSpread;
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
    vec3 p = vec3((aRing - ${glsl((RINGS - 1) / 2)}) * ${glsl(PITCH)} * uSpread + position.x, 0.0, 0.0)
           + n * ${glsl(R + 0.004)} + t * position.y;
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
    float lit = smoothstep(-0.05, 0.6, vFacing) * mix(0.5, 1.35, vFront);
    // A soft halo around the reading row so it carries at any distance.
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
  uniform float uDim;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    vec3 c = mix(uBase, uEdge, pow(f, 1.6));
    c += uEdge * 0.22 * clamp(vN.y, 0.0, 1.0); // a soft top light
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
    vA = (0.35 * twinkle + aFlare);
    gl_PointSize = (2.2 + aFlare * 7.0) * uPixelRatio * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const ghostFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * vA * uOpacity);
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
  varying float vU;
  void main() {
    if (vU > uGrow) discard;
    float pulse = 0.55 + 0.45 * smoothstep(0.85, 1.0, sin(vU * 18.0 - uTime * 3.0));
    float tip = smoothstep(uGrow - 0.08, uGrow, vU);
    gl_FragColor = vec4(uColor, (pulse + tip) * min(uGrow * 3.0, 1.0));
  }
`;

/* ── Construction ────────────────────────────────────────────────────── */

export function createWorld({ atlas }) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  const rotor = new Group();
  scene.add(rotor);
  const narrow = () => window.innerWidth < 1000;

  const solid = (base, edge) =>
    new ShaderMaterial({
      vertexShader: solidVert,
      fragmentShader: solidFrag,
      uniforms: { uBase: { value: base }, uEdge: { value: edge }, uVoid: { value: C.void }, uDim: { value: 1 } },
    });
  const drumMat = solid(C.ink, new Color(0x3a4352));
  const ridgeMat = solid(new Color(0x161b24), new Color(0x6b7280));
  const capMat = solid(new Color(0x0b0d12), new Color(0x4a5160));
  const solids = [drumMat, ridgeMat, capMat];

  // Discs: a drum plus a ridge on its right edge, each disc its own group so it can explode out.
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
    const rim = new Mesh(rimGeo, rimMat); // one thin ember line on each outer face
    rim.position.x = (side * CAP_W) / 2;
    cap.add(rim);
    rotor.add(cap);
    return cap;
  });
  const axle = new Mesh(along(new CylinderGeometry(0.07, 0.07, 1, 24)), ridgeMat);
  rotor.add(axle);

  // Reading-row bars: the cryptex alignment window, framing the front row.
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
      uSpread: { value: 1 },
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

  // Objective: held-out "ghosts" — points the model never saw; they flare when a sample hits.
  const GHOSTS = narrow() ? 180 : 320;
  const ghostPos = new Float32Array(GHOSTS * 3);
  const ghostFlare = new Float32Array(GHOSTS);
  const ghostSeed = new Float32Array(GHOSTS);
  for (let i = 0; i < GHOSTS; i++) {
    const v = new Vector3().randomDirection().multiplyScalar(2.6 + Math.random() * 5);
    ghostPos.set([v.x * 1.4, v.y, v.z], i * 3);
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

  // Uses: three branches grow from the rotor — audit, decoy, synth.
  const branchMat = new ShaderMaterial({
    vertexShader: branchVert,
    fragmentShader: branchFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: C.ember }, uGrow: { value: 0 }, uTime: { value: 0 } },
  });
  const branchEnds = [
    [new Vector3(-0.9, R, 0.2), new Vector3(-1.7, 1.7, 0.3), new Vector3(-2.4, 2.4, -0.8)],
    [new Vector3(0, R, 0.3), new Vector3(0.2, 2.0, 0.4), new Vector3(0.2, 2.9, -1.2)],
    [new Vector3(0.9, R, 0.2), new Vector3(1.8, 1.6, 0.4), new Vector3(2.6, 2.2, -0.6)],
  ];
  const branches = new Group();
  for (const pts of branchEnds) {
    branches.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.012, 6), branchMat));
    const node = new Mesh(new SphereGeometry(0.06, 16, 12), new MeshBasicMaterial({ color: C.ember, transparent: true }));
    node.position.copy(pts[2]);
    branches.add(node);
  }
  scene.add(branches);

  // Method: a ring of six stations orbiting the axle — the loop, literally.
  const loop = new Group();
  const LOOP_R = R * 2.3;
  const loopRing = new Mesh(
    new TorusGeometry(LOOP_R, 0.006, 6, 240),
    new MeshBasicMaterial({ color: C.ash, transparent: true, opacity: 0 }),
  );
  loopRing.rotation.y = Math.PI / 2;
  loop.add(loopRing);
  const loopNodes = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * TAU;
    const node = new Mesh(new SphereGeometry(0.07, 16, 12), new MeshBasicMaterial({ color: C.ash, transparent: true, opacity: 0 }));
    node.position.set(0, Math.sin(a) * LOOP_R, Math.cos(a) * LOOP_R);
    loop.add(node);
    return node;
  });
  scene.add(loop);

  /* ── The sampler, made physical ────────────────────────────────────── */

  const rings = Array.from({ length: RINGS }, () => ({ angle: 0, from: 0, to: 0, t0: 0, dur: 1, prev: 0 }));
  let phase = 'spin';
  let holdUntil = 0;
  let hit = false;
  let current = '';
  let bookend = true; // open on the name, then start sampling

  const centred = (word) => {
    const chars = [...word.toLowerCase()].map((c) => (RING_SET.includes(c) ? c : ' ')).slice(0, RINGS);
    const pad = Math.floor((RINGS - chars.length) / 2);
    return Array.from({ length: RINGS }, (_, i) => chars[i - pad] ?? ' ');
  };

  const spinTo = (word, now) => {
    current = word;
    hit = TOY_HELDOUT.has(word);
    centred(word).forEach((ch, i) => {
      const ring = rings[i];
      const base = -(RING_SET.indexOf(ch) / SLOTS) * TAU;
      const turns = 1 + Math.floor(Math.random() * 2);
      const rest = (((ring.angle - base) % TAU) + TAU) % TAU;
      ring.from = ring.angle;
      ring.to = ring.angle - turns * TAU - rest;
      ring.t0 = now + i * 85 + Math.random() * 120; // lock order runs left → right
      ring.dur = 1250 + Math.random() * 450;
      ringState[i] = 0;
    });
    phase = 'spin';
  };

  let lastNow = 0;
  const step = (now) => {
    const dt = Math.max(1, now - lastNow);
    lastNow = now;
    let allLocked = true;
    rings.forEach((ring, i) => {
      const t = Math.min(1, Math.max(0, (now - ring.t0) / ring.dur));
      ring.prev = ring.angle;
      ring.angle = ring.from + (ring.to - ring.from) * easeOutBack(t);
      ringAngle[i] = ring.angle;
      ringVel[i] = ((ring.angle - ring.prev) / dt) * 1000; // rad/s, drives the blur
      if (t < 1) allLocked = false;
      else if (phase === 'spin') ringState[i] = 1;
    });
    if (phase === 'spin' && allLocked) {
      phase = 'hold';
      if (hit) {
        ringState.fill(2);
        flare(14);
      }
      holdUntil = now + (bookend ? 2600 : hit ? 2600 : 1700);
    }
    const wantBookend = pose.chapter >= INSTALL - 0.5; // install: spell the name again and rest there
    if (wantBookend && current !== BOOKEND) {
      bookend = true;
      spinTo(BOOKEND, now);
    } else if (phase === 'hold' && now > holdUntil && !wantBookend) {
      bookend = false;
      spinTo(sample(TOY_GRAMMAR, { tau: 1.4 }).pw, now);
    }
    for (let i = 0; i < GHOSTS; i++) ghostFlare[i] *= 0.965;
    ghostGeo.attributes.aFlare.needsUpdate = true;
  };

  /* ── Camera choreography ───────────────────────────────────────────── */

  const ids = [...document.querySelectorAll('[data-scene]')].map((el) => el.id);
  const METHOD = ids.indexOf('method');
  const INSTALL = ids.indexOf('install');
  const pose = { chapter: 0, local: 0 };
  const view = { w: 1, h: 1, heroDist: 9, heroSx: 0, heroSy: 0 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const length = RINGS * PITCH + 2 * CAP_W;
  const poseFor = (id) => {
    const p = { ...POSES[id] };
    if (id === 'hero') {
      p.dist = view.heroDist;
      p.sx = view.heroSx;
      p.sy = view.heroSy;
    } else if (narrow()) {
      p.sx = 0;
      p.sy = -0.3;
      p.dist *= 1.45;
      p.dim *= 0.45;
    }
    if (id === 'method') p.az += pose.local * TAU; // a full orbit as the stations scrub past
    return p;
  };

  const resize = (w, h) => {
    view.w = w;
    view.h = h;
    camera.aspect = w / h;
    ghostMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.5);
    // Fit the hero rotor into its slot between the wordmark and the lede.
    const slot = document.querySelector('[data-rotor-slot]')?.getBoundingClientRect();
    const tan = Math.tan((FOV * Math.PI) / 360);
    if (slot && slot.width && slot.height) {
      const fracW = (slot.width * 0.9) / w;
      const fracH = (slot.height * 0.92) / h;
      const distW = (length * 1.15) / (2 * tan * camera.aspect * fracW);
      const distH = (2 * CAP_R * 1.08) / (2 * tan * fracH);
      view.heroDist = Math.max(distW, distH, 5);
      view.heroSx = (slot.left + slot.width / 2 - w / 2) / w;
      view.heroSy = (slot.top + slot.height / 2 - h / 2) / h;
    }
  };

  const current3 = {};
  const update = (now) => {
    step(now);
    const i0 = Math.max(0, Math.min(ids.length - 1, Math.floor(pose.chapter)));
    const i1 = Math.min(ids.length - 1, i0 + 1);
    const f = smooth(Math.min(1, Math.max(0, pose.chapter - i0)));
    const a = poseFor(ids[i0]);
    const b = poseFor(ids[i1]);
    for (const k of KEYS) current3[k] = a[k] + (b[k] - a[k]) * f;
    current3.az = a.az + wrap(b.az - a.az) * f;

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    const az = current3.az + pointer.x * 0.12;
    const el = current3.el - pointer.y * 0.06;
    const d = current3.dist;
    camera.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(view.w, view.h, -current3.sx * view.w, -current3.sy * view.h, view.w, view.h);
    camera.updateProjectionMatrix();

    // Explode the discs along the axle.
    const spread = 1 + current3.explode * 1.5;
    discs.forEach((disc, i) => (disc.position.x = (i - (RINGS - 1) / 2) * PITCH * spread));
    const half = ((RINGS - 1) / 2) * PITCH * spread + DISC_W / 2;
    caps[0].position.x = -half - CAP_W / 2;
    caps[1].position.x = half + CAP_W / 2;
    axle.scale.x = 2 * half + 2 * CAP_W + 1.2;
    bars.forEach((bar) => (bar.scale.x = 2 * half));
    glyphMat.uniforms.uSpread.value = spread;
    rotor.position.y = Math.sin(now * 0.0006) * 0.04;

    const dim = current3.dim;
    glyphMat.uniforms.uDim.value = dim;
    solids.forEach((m) => (m.uniforms.uDim.value = 0.35 + 0.65 * dim));
    barMat.opacity = 0.75 * dim;
    rimMat.opacity = 0.9 * dim;

    ghostMat.uniforms.uOpacity.value = current3.ghost;
    ghostMat.uniforms.uTime.value = now / 1000;
    ghosts.visible = current3.ghost > 0.01;
    if (current3.ghost > 0.5 && Math.random() < 0.02) flare(1); // the odd held-out lights up

    branchMat.uniforms.uGrow.value = current3.branch;
    branchMat.uniforms.uTime.value = now / 1000;
    branches.visible = current3.branch > 0.01;
    branches.children.forEach((c) => c.material !== branchMat && (c.material.opacity = current3.branch));

    loop.visible = current3.loop > 0.01;
    loopRing.material.opacity = 0.5 * current3.loop;
    const station = Math.min(5, Math.floor(pose.local * 6));
    loopNodes.forEach((node, k) => {
      node.material.opacity = current3.loop;
      node.material.color.copy(k === station && Math.abs(pose.chapter - METHOD) < 0.5 ? C.ember : C.ash);
    });
  };

  spinTo(BOOKEND, performance.now() + 300);

  return {
    resize,
    update,
    render: (renderer) => renderer.render(scene, camera),
    /** chapter: float scene index (fractional in transit); local: 0..1 progress within the scene. */
    setChapter(chapter, local) {
      pose.chapter = chapter;
      pose.local = local;
    },
  };
}
