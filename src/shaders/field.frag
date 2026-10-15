// CP1 placeholder field: a slow, faint ember/teal haze on void.
// Exists to prove GLSL bundling + WebGL on Pages; replaced in CP5.
precision highp float;

uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

const vec3 VOID = vec3(0.027, 0.031, 0.043);
const vec3 EMBER = vec3(0.910, 0.639, 0.239);
const vec3 HELDOUT = vec3(0.235, 0.776, 0.706);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * 0.04;
  float n = noise(p * 2.2 + t) * 0.6 + noise(p * 5.0 - t) * 0.4;
  float vignette = smoothstep(1.1, 0.2, length(p));
  vec3 col = VOID;
  col += EMBER * 0.07 * smoothstep(0.45, 0.9, n) * vignette;
  col += HELDOUT * 0.035 * smoothstep(0.55, 1.0, 1.0 - n) * vignette;
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012; // grain
  gl_FragColor = vec4(col, 1.0);
}
