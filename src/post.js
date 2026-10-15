// Post-processing for the stage: field → world → bloom → a final "film" pass (grain, vignette,
// edge chromatic aberration, and a cipher-glitch that rises with camera travel and scroll speed).
// Everything stays in raw display values — no colour-space conversion anywhere in the chain.
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGlitch;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
      vec3 c = vec3(
        texture2D(tDiffuse, uv + d * ca).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - d * ca).b
      );
      // Vignette.
      c *= smoothstep(1.25, 0.35, length(d * vec2(1.0, 0.85)));
      // Film grain (animated, ~3%).
      c += (hash(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.035;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function createPost(renderer, fieldScene, fieldCamera) {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(fieldScene, fieldCamera));
  const worldPass = new RenderPass(null, null);
  worldPass.clear = false;
  worldPass.clearDepth = true;
  worldPass.enabled = false;
  composer.addPass(worldPass);
  // Strength, radius, threshold: only the bright things bloom — the reading row, rims, hits.
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.85, 0.55, 0.42);
  composer.addPass(bloom);
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);

  let glitch = 0;
  return {
    setWorld(world) {
      worldPass.scene = world.scene;
      worldPass.camera = world.camera;
      worldPass.enabled = true;
    },
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      bloom.setSize((w * pixelRatio) / 2, (h * pixelRatio) / 2); // half-res bloom: plenty, and cheap
      film.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
    },
    setGlitch(g) {
      glitch = g;
    },
    render(ms) {
      film.uniforms.uTime.value = ms / 1000;
      film.uniforms.uGlitch.value += (glitch - film.uniforms.uGlitch.value) * 0.2;
      composer.render();
    },
  };
}
