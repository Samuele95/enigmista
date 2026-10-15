// The distribution, in geometry: the toy grammar as a disc of probability mass.
//
//   ring 0  templates            each ring subdivides its parent by the sampler's own tempered
//   ring 1  first slot's terms   conditional odds p^(1/τ) (renormalised), so the angle a slice
//   ring 2  second slot's terms  spans IS the chance a draw lands there; the outer slices are whole
//   ring 3  third slot's terms   passwords, standing as towers whose height grows with their share.
//
// A sample is a dart: a uniform angle, read outward through the rings (inverse-CDF sampling made
// literal). τ re-proportions every slice live — low τ piles the mass onto a few tall modes, high τ
// flattens the skyline and widens the tails, where the teal (toy held-out) towers stand.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, RingGeometry, ShaderMaterial, Vector3,
} from 'three';

const TAU = Math.PI * 2;
export const DISC_R = 3.3;
const RADII = [[0.62, 1.22], [1.28, 2.02], [2.08, 2.74], [2.8, DISC_R]];
const RING_H = [0.08, 0.16, 0.3, 0.7]; // tower height of the largest slice per ring (at τ = 1)
const U = 12; // angular subdivisions per slice
const GAP = 0.014; // world-units gap between neighbouring slices

const sharesAt = (weights, tau) => {
  const w = weights.map((p) => p ** (1 / tau));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
};

// One slice = a sector prism, written in (u, v, w) ∈ [0,1]³ and mapped to polar in the shader.
function prism() {
  const pos = [];
  const face = [];
  const quad = (a, b, c, d, f) => {
    pos.push(...a, ...c, ...b, ...a, ...d, ...c); // counter-clockwise seen from outside
    for (let i = 0; i < 6; i++) face.push(f);
  };
  for (let i = 0; i < U; i++) {
    const u0 = i / U;
    const u1 = (i + 1) / U;
    quad([u0, 0, 1], [u0, 1, 1], [u1, 1, 1], [u1, 0, 1], 0); // top
    quad([u0, 1, 0], [u1, 1, 0], [u1, 1, 1], [u0, 1, 1], 1); // outer wall
    quad([u1, 0, 0], [u0, 0, 0], [u0, 0, 1], [u1, 0, 1], 2); // inner wall
  }
  quad([0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], 3); // side at a0
  quad([1, 1, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], 4); // side at a1
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aFace', new BufferAttribute(new Float32Array(face), 1));
  return g;
}

const vert = /* glsl */ `
  attribute float aFace;
  attribute vec4 aShape;   // a0, a1, r0, r1
  attribute float aHeight;
  attribute vec3 aLook;    // mass (0..1, for tint), held-out flag, parity
  uniform float uLift;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLook;
  varying float vTop;
  varying float vW;
  varying vec2 vUV;
  void main() {
    float a = mix(aShape.x, aShape.y, position.x);
    float r = mix(aShape.z, aShape.w, position.y);
    float h = 0.02 + aHeight * uLift;
    vec3 p = vec3(cos(a) * r, position.z * h, sin(a) * r);
    vec3 radial = vec3(cos(a), 0.0, sin(a));
    vec3 tangent = vec3(-sin(a), 0.0, cos(a));
    vec3 n = aFace < 0.5 ? vec3(0.0, 1.0, 0.0)
      : aFace < 1.5 ? radial
      : aFace < 2.5 ? -radial
      : aFace < 3.5 ? -tangent : tangent;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * n);
    vV = normalize(-mv.xyz);
    vLook = aLook;
    vTop = aFace < 0.5 ? 1.0 : 0.0;
    vW = position.z;
    vUV = position.xy;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uEmber;
  uniform vec3 uBone;
  uniform vec3 uHeld;
  uniform vec3 uVoid;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLook;
  varying float vTop;
  varying float vW;
  varying vec2 vUV;
  void main() {
    float mass = vLook.x;
    float held = step(0.5, mod(vLook.y, 2.0)); // toy held-out password
    float lit = step(1.5, vLook.y);            // on the last dart's path, or hovered
    vec3 hue = held > 0.5 ? uHeld : uEmber;
    // Dark instrument faces that warm and brighten with their mass (the modes glow); toy held-out
    // towers always teal; a hairline outline on every slice's top keeps thin tails legible.
    float heat = max(mass, held * 0.8);
    vec3 top = mix(uInk * 1.5, hue * 0.78, 0.08 + 0.92 * heat);
    vec3 wall = uInk * (0.55 + 0.45 * vW) + hue * (0.1 + 0.4 * heat) * smoothstep(0.86, 1.0, vW);
    vec3 c = vTop > 0.5 ? top : wall;
    vec2 d = min(vUV, 1.0 - vUV) / max(fwidth(vUV), vec2(1e-5));
    float edge = vTop > 0.5 ? 1.0 - clamp(min(d.x, d.y) - 0.4, 0.0, 1.0) : 0.0;
    c = mix(c, mix(uInk, hue, 0.45 + 0.4 * heat), edge * 0.9);
    c = mix(c, uBone * 0.82, lit * 0.5);
    gl_FragColor = vec4(mix(uVoid, c, uOpacity), 1.0);
  }
`;

/** Build the disc for a sampler grammar. `C`: the world's raw palette; `heldout`: Set of strings. */
export function createDisc({ C, grammar, heldout }) {
  const group = new Group();

  // ── The tree: template → slot terms, one node per slice ──────────────
  const nodes = [];
  const add = (node) => {
    node.i = nodes.length;
    nodes.push(node);
    return node;
  };
  const templates = grammar.templates.map((t) => {
    const root = add({ ring: 0, p: t.p, label: t.pattern, template: t, pattern: t.pattern, depth: 0, parts: [], children: [] });
    const grow = (parent, depth) => {
      if (depth >= t.pattern.length) return;
      const slot = t.pattern[depth];
      const dict = grammar.slots[slot === 'Wc' ? 'W' : slot] ?? { [slot]: 1 };
      for (const [term, p] of Object.entries(dict)) {
        const text = slot === 'Wc' ? term[0].toUpperCase() + term.slice(1) : term;
        const child = add({
          ring: depth + 1, p, slot, term: text, parent, depth: depth + 1, parts: [...parent.parts, { slot, text }], children: [],
        });
        parent.children.push(child);
        grow(child, depth + 1);
      }
    };
    grow(root, 0);
    return root;
  });
  for (const node of nodes) {
    node.leaf = node.children.length === 0;
    node.pw = node.parts.map((s) => s.text).join('');
    node.held = node.leaf && heldout.has(node.pw);
    // Two-slot templates: their leaves reach out to the rim, like everyone else's.
    node.r = node.leaf ? [RADII[node.ring][0], DISC_R] : RADII[node.ring];
    node.a = [0, 0];
    node.to = [0, 0];
    node.h = 0;
    node.hTo = 0;
  }
  const leaves = nodes.filter((n) => n.leaf);
  const n = nodes.length;

  // Lay out every slice for τ: angles from tempered conditional shares, heights from absolute mass.
  const stats = { tau: 1, heldMass: 0 };
  let refMass = null;
  const layout = (tau, instant = false) => {
    stats.tau = tau;
    const place = (list, a0, a1, mass) => {
      const shares = sharesAt(list.map((c) => c.p), tau);
      let a = a0;
      list.forEach((c, k) => {
        const span = (a1 - a0) * shares[k];
        c.to = [a, a + span];
        c.q = mass * shares[k];
        a += span;
        place(c.children, c.to[0], c.to[1], c.q);
      });
    };
    place(templates, -Math.PI / 2, -Math.PI / 2 + TAU, 1);
    if (!refMass) {
      refMass = [0, 0, 0, 0];
      nodes.forEach((c) => (refMass[c.leaf ? 3 : c.ring] = Math.max(refMass[c.leaf ? 3 : c.ring], c.q)));
    }
    nodes.forEach((c) => {
      const ring = c.leaf ? 3 : c.ring;
      c.hTo = Math.min(2.4, RING_H[ring] * Math.sqrt(c.q / refMass[ring]));
      c.tint = Math.min(1, c.q / refMass[ring]);
      if (instant) {
        c.a = [...c.to];
        c.h = c.hTo;
      }
    });
    stats.heldMass = leaves.reduce((s, c) => s + (c.held ? c.q : 0), 0);
  };
  layout(1, true);

  // ── Mesh ──────────────────────────────────────────────────────────────
  const base = prism();
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('aFace', base.getAttribute('aFace'));
  const shape = new Float32Array(n * 4);
  const height = new Float32Array(n);
  const look = new Float32Array(n * 3);
  const shapeAttr = new InstancedBufferAttribute(shape, 4);
  const heightAttr = new InstancedBufferAttribute(height, 1);
  const lookAttr = new InstancedBufferAttribute(look, 3);
  geo.setAttribute('aShape', shapeAttr);
  geo.setAttribute('aHeight', heightAttr);
  geo.setAttribute('aLook', lookAttr);
  geo.instanceCount = n;
  const mat = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uInk: { value: C.ink }, uEmber: { value: C.ember }, uBone: { value: C.bone }, uHeld: { value: C.heldout },
      uVoid: { value: C.void }, uOpacity: { value: 0 }, uLift: { value: 0 },
    },
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  group.add(mesh);

  // A hairline rim and the hub: the disc reads as one object, an instrument.
  const rim = new Mesh(new RingGeometry(DISC_R + 0.06, DISC_R + 0.075, 256).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: C.ember, transparent: true, opacity: 0 }));
  group.add(rim);
  const hub = new Mesh(new CylinderGeometry(0.5, 0.5, 0.05, 64), new MeshBasicMaterial({ color: C.ink, transparent: true, opacity: 0 }));
  group.add(hub);

  // The dart: a beam that falls onto the slice it lands in, and a reading line from hub to rim.
  const beamMat = new MeshBasicMaterial({ color: C.bone, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const beam = new Mesh(new CylinderGeometry(0.012, 0.012, 1, 8).translate(0, 0.5, 0), beamMat);
  group.add(beam);
  const lineMat = new MeshBasicMaterial({ color: C.bone, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const line = new Mesh(new PlaneGeometry(1, 0.022).translate(0.5, 0, 0).rotateX(-Math.PI / 2), lineMat);
  group.add(line);
  const markMat = new MeshBasicMaterial({ color: C.bone, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const mark = new Mesh(new RingGeometry(0.05, 0.085, 32).rotateX(-Math.PI / 2), markMat);
  group.add(mark);

  const dart = { node: null, angle: 0, t0: -1e9, count: 0, hits: new Set() };
  let hover = null;
  const flags = () => {
    const path = new Set();
    for (let c = dart.node; c; c = c.parent) path.add(c);
    for (let c = hover; c; c = c.parent) path.add(c);
    nodes.forEach((c, i) => {
      look[i * 3] = c.tint;
      look[i * 3 + 1] = (path.has(c) ? 2 : 0) + (c.held ? 1 : 0);
      look[i * 3 + 2] = (c.i % 2) * 1;
    });
    lookAttr.needsUpdate = true;
  };
  flags();

  // Which slice is at disc-local polar (r, θ)?
  const nodeAt = (r, theta) => {
    let list = templates;
    let found = null;
    while (list.length) {
      const ring = list[0].ring;
      if (r < RADII[ring][0]) return found;
      const t = ((theta - list[0].a[0]) % TAU + TAU) % TAU + list[0].a[0];
      const c = list.find((x) => t >= x.a[0] && t < x.a[1]);
      if (!c) return found;
      if (r <= c.r[1]) return c;
      found = c;
      list = c.children;
    }
    return found;
  };

  // Ray → slice, testing from the tallest towers down so a tower's top wins over the floor behind.
  const plane = new Plane(new Vector3(0, 1, 0), 0);
  const hitPoint = new Vector3();
  const local = (ray) => {
    const inv = group.matrixWorld.clone().invert();
    return ray.clone().applyMatrix4(inv);
  };
  const pick = (ray) => {
    if (mat.uniforms.uOpacity.value < 0.5) return null;
    const r = local(ray);
    for (let y = 1.3; y >= 0; y -= 0.1) {
      plane.constant = -y * mat.uniforms.uLift.value;
      if (!r.intersectPlane(plane, hitPoint)) continue;
      const rad = Math.hypot(hitPoint.x, hitPoint.z);
      if (rad > DISC_R + 0.05) continue;
      const c = nodeAt(rad, Math.atan2(hitPoint.z, hitPoint.x));
      if (c && 0.02 + c.h * mat.uniforms.uLift.value >= y * mat.uniforms.uLift.value) return c;
    }
    return null;
  };

  const setHover = (c) => {
    if (c === hover) return;
    hover = c;
    flags();
  };

  /** Throw a dart: a uniform angle → the leaf whose slice contains it (inverse-CDF sampling). */
  const throwDart = (now) => {
    const angle = -Math.PI / 2 + Math.random() * TAU;
    const c = nodeAt(DISC_R - 0.01, angle);
    if (!c) return null;
    Object.assign(dart, { node: c, angle, t0: now });
    dart.count++;
    if (c.held) dart.hits.add(c.pw);
    flags();
    return c;
  };

  let lastFlags = 0;
  const update = (now, { opacity }) => {
    mat.uniforms.uOpacity.value = opacity;
    mat.uniforms.uLift.value += (opacity - mat.uniforms.uLift.value) * 0.06;
    rim.material.opacity = 0.7 * opacity;
    hub.material.opacity = opacity;
    group.visible = opacity > 0.01;
    if (!group.visible) return;
    let moving = false;
    nodes.forEach((c, i) => {
      for (let k = 0; k < 2; k++) {
        const d = c.to[k] - c.a[k];
        if (Math.abs(d) > 1e-5) moving = true;
        c.a[k] += d * 0.09;
      }
      c.h += (c.hTo - c.h) * 0.09;
      const span = c.a[1] - c.a[0];
      const gap = Math.min(GAP / c.r[1], span * 0.25);
      shape.set([c.a[0] + gap / 2, c.a[1] - gap / 2, c.r[0], c.r[1]], i * 4);
      height[i] = c.h;
    });
    shapeAttr.needsUpdate = true;
    heightAttr.needsUpdate = true;
    if (moving && now - lastFlags > 120) {
      lastFlags = now;
      flags(); // tints follow the new masses
    }
    // Dart animation: the beam falls (0–350ms), the reading line sweeps out, both fade by 1.8s.
    const t = (now - dart.t0) / 1000;
    const c = dart.node;
    if (c) {
      const a = (c.a[0] + c.a[1]) / 2;
      const r = (c.r[0] + c.r[1]) / 2;
      const top = 0.02 + c.h * mat.uniforms.uLift.value;
      // The shaft drops from above onto the tower top, then drains away.
      const fall = Math.min(1, t / 0.35);
      beam.position.set(Math.cos(a) * r, top + 3 * (1 - fall), Math.sin(a) * r);
      beam.scale.y = Math.max(0.001, 1.4 * (1 - Math.max(0, t - 0.35) / 1.3));
      beamMat.opacity = opacity * Math.min(1, t / 0.1) * (t < 1.65 ? 1 : 0);
      line.rotation.y = -a;
      line.position.y = 0.04;
      line.scale.x = DISC_R * Math.min(1, Math.max(0, (t - 0.25) / 0.5));
      lineMat.opacity = opacity * 0.5 * Math.max(0, 1 - Math.max(0, t - 1.4) / 0.6);
      mark.position.set(Math.cos(a) * r, top + 0.01, Math.sin(a) * r);
      markMat.opacity = opacity * (t > 0.3 ? 1 : 0);
      markMat.color.copy(c.held ? C.heldout : C.bone);
    }
  };

  return {
    group,
    stats,
    dart,
    templates,
    leaves,
    setTau: (tau) => layout(tau),
    pick,
    setHover,
    throwDart,
    update,
    /** Points (disc-local) for labels: a slice's mid-angle at its outer edge / top. */
    anchor: (c, out = new Vector3()) => {
      const a = (c.a[0] + c.a[1]) / 2;
      const r = c.leaf ? DISC_R + 0.35 : (c.r[0] + c.r[1]) / 2;
      return out.set(Math.cos(a) * r, 0.04 + c.h * mat.uniforms.uLift.value + (c.leaf ? 0.15 : 0.02), Math.sin(a) * r);
    },
  };
}
