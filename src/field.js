import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from 'three';
import fragmentShader from './shaders/field.frag?raw';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const MAX_PIXEL_RATIO = 1.5;

export function startField(canvas, { reducedMotion }) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2() },
  };
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader, fragmentShader, uniforms })));
  const camera = new OrthographicCamera();

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    if (reducedMotion) renderer.render(scene, camera);
  };
  window.addEventListener('resize', resize);
  resize();

  if (reducedMotion) return;

  // Render only while the tab is visible; the loop stops entirely when hidden.
  let frame = 0;
  const tick = (ms) => {
    uniforms.uTime.value = ms / 1000;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame);
    if (document.visibilityState === 'visible') frame = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}
