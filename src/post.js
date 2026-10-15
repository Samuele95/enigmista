// Post-processing for the stage: field → world → glow → a final "film" pass (glow composite,
// grain, vignette, edge chromatic aberration, and a cipher-glitch that rises with camera travel
// and scroll speed). Everything stays in raw display values — no colour-space conversion.
//
// The glow is purpose-built rather than UnrealBloom: three programs (threshold, one reusable
// separable blur, the film pass) and six small passes at ¼ and ⅛ resolution — a fraction of the
// shader compiles and per-frame work, which matters on phones and in start-up blocking time.
import { HalfFloatType, LinearFilter, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';

const GLOW = { threshold: 0.42, tight: 0.95, wide: 0.7 };

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const thresholdMaterial = new ShaderMaterial({
  vertexShader,
  uniforms: { tScene: { value: null }, uThreshold: { value: GLOW.threshold } },
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    uniform float uThreshold;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tScene, vUv).rgb;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.25, lum), 1.0);
    }
  `,
});

// 9-tap Gaussian, one direction per pass; reused for every blur pass.
const blurMaterial = new ShaderMaterial({
  vertexShader,
  uniforms: { tInput: { value: null }, uStep: { value: new Vector2() } },
  fragmentShader: /* glsl */ `
    uniform sampler2D tInput;
    uniform vec2 uStep;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tInput, vUv).rgb * 0.227027;
      c += (texture2D(tInput, vUv + uStep * 1.0).rgb + texture2D(tInput, vUv - uStep * 1.0).rgb) * 0.1945946;
      c += (texture2D(tInput, vUv + uStep * 2.0).rgb + texture2D(tInput, vUv - uStep * 2.0).rgb) * 0.1216216;
      c += (texture2D(tInput, vUv + uStep * 3.0).rgb + texture2D(tInput, vUv - uStep * 3.0).rgb) * 0.054054;
      c += (texture2D(tInput, vUv + uStep * 4.0).rgb + texture2D(tInput, vUv - uStep * 4.0).rgb) * 0.016216;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
});

const filmMaterial = new ShaderMaterial({
  vertexShader,
  uniforms: {
    tScene: { value: null },
    tGlowTight: { value: null },
    tGlowWide: { value: null },
    uTight: { value: GLOW.tight },
    uWide: { value: GLOW.wide },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
  },
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    uniform sampler2D tGlowTight;
    uniform sampler2D tGlowWide;
    uniform float uTight;
    uniform float uWide;
    uniform float uTime;
    uniform float uGlitch;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 lit(vec2 uv) {
      return texture2D(tScene, uv).rgb + texture2D(tGlowTight, uv).rgb * uTight + texture2D(tGlowWide, uv).rgb * uWide;
    }
    void main() {
      vec2 uv = vUv;
      // Cipher-glitch: a few horizontal bands slip sideways while the camera travels.
      float frame = floor(uTime * 24.0);
      float band = floor(uv.y * 54.0);
      float slip = step(1.0 - uGlitch * 0.35, hash(vec2(band, frame)));
      uv.x += (hash(vec2(band * 1.7, frame)) - 0.5) * 0.06 * uGlitch * slip;
      // Chromatic aberration: a hair at the edges, more while travelling.
      vec2 d = uv - 0.5;
      float ca = 0.0035 * dot(d, d) * 4.0 + uGlitch * 0.004;
      vec3 c = vec3(lit(uv + d * ca).r, lit(uv).g, lit(uv - d * ca).b);
      c *= smoothstep(1.25, 0.35, length(d * vec2(1.0, 0.85))); // vignette
      c += (hash(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.035; // film grain
      gl_FragColor = vec4(c, 1.0);
    }
  `,
});

class GlowFilmPass extends Pass {
  constructor() {
    super();
    const rt = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter });
    this.quarter = [rt(), rt()];
    this.eighth = [rt(), rt()];
    this.quad = new FullScreenQuad();
  }

  setSize(w, h) {
    this.quarter.forEach((t) => t.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)));
    this.eighth.forEach((t) => t.setSize(Math.max(1, w >> 3), Math.max(1, h >> 3)));
    filmMaterial.uniforms.uRes.value.set(w, h);
  }

  draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  blur(renderer, src, tmp, dst, spread) {
    blurMaterial.uniforms.tInput.value = src.texture;
    blurMaterial.uniforms.uStep.value.set(spread / src.width, 0);
    this.draw(renderer, blurMaterial, tmp);
    blurMaterial.uniforms.tInput.value = tmp.texture;
    blurMaterial.uniforms.uStep.value.set(0, spread / src.height);
    this.draw(renderer, blurMaterial, dst);
  }

  render(renderer, writeBuffer, readBuffer) {
    const [qa, qb] = this.quarter;
    const [ea, eb] = this.eighth;
    thresholdMaterial.uniforms.tScene.value = readBuffer.texture;
    this.draw(renderer, thresholdMaterial, qa);
    this.blur(renderer, qa, qb, qa, 1.2); // tight glow, ¼ res
    this.blur(renderer, qa, eb, ea, 2.2); // wide glow, ⅛ res
    filmMaterial.uniforms.tScene.value = readBuffer.texture;
    filmMaterial.uniforms.tGlowTight.value = qa.texture;
    filmMaterial.uniforms.tGlowWide.value = ea.texture;
    this.draw(renderer, filmMaterial, this.renderToScreen ? null : writeBuffer);
  }
}

export function createPost(renderer, fieldScene, fieldCamera) {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(fieldScene, fieldCamera));
  const worldPass = new RenderPass(null, null);
  worldPass.clear = false;
  worldPass.clearDepth = true;
  worldPass.enabled = false;
  composer.addPass(worldPass);
  const film = new GlowFilmPass();
  composer.addPass(film);

  let glitch = 0;
  // Precompile programs exactly as they will be used (same render target → same program keys),
  // via KHR_parallel_shader_compile where available, so first frames don't stall on compiles.
  const quad = new PlaneGeometry(2, 2);
  const holder = (materials) => {
    const scene = new Scene();
    materials.forEach((m) => scene.add(new Mesh(quad, m)));
    return scene;
  };
  const compileInto = async (rt, scene, camera) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    const pending = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(prev);
    await pending;
  };
  return {
    prepare: (scene, camera) => compileInto(target, scene, camera),
    async preparePasses(camera) {
      await compileInto(film.quarter[0], holder([thresholdMaterial, blurMaterial]), camera);
      await compileInto(null, holder([filmMaterial]), camera);
    },
    setWorld(world) {
      worldPass.scene = world.scene;
      worldPass.camera = world.camera;
      worldPass.enabled = true;
    },
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    },
    setGlitch(g) {
      glitch = g;
    },
    render(ms) {
      filmMaterial.uniforms.uTime.value = ms / 1000;
      filmMaterial.uniforms.uGlitch.value += (glitch - filmMaterial.uniforms.uGlitch.value) * 0.2;
      composer.render();
    },
  };
}
