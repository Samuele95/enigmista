// Background field: faint ember/teal haze + the sampling-glyph grid.
// One fullscreen pass; each screen cell looks up its glyph/state/intensity in uCells.
precision highp float;

uniform float uTime;
uniform vec2 uResolution;   // drawing-buffer px
uniform sampler2D uCells;   // cols x rows, RGBA8: glyph, state, intensity
uniform vec2 uGrid;         // cols, rows
uniform vec2 uCellPx;       // cell size in drawing-buffer px
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;    // atlas cols, rows

varying vec2 vUv;

const vec3 VOID = vec3(0.027, 0.031, 0.043);
const vec3 ASH = vec3(0.541, 0.561, 0.600);
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
  col += EMBER * 0.06 * smoothstep(0.45, 0.9, n) * vignette;
  col += HELDOUT * 0.03 * smoothstep(0.55, 1.0, 1.0 - n) * vignette;

  // Glyph grid, top-left origin to match the CPU sim.
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCellPx);
  vec2 local = fract(frag / uCellPx);
  vec4 data = texture2D(uCells, (cell + 0.5) / uGrid);
  float glyph = floor(data.r * 255.0 + 0.5);
  float state = floor(data.g * 255.0 + 0.5);
  float level = data.b;

  vec2 g = vec2(mod(glyph, uAtlasGrid.x), floor(glyph / uAtlasGrid.x));
  vec2 auv = vec2((g.x + local.x) / uAtlasGrid.x, 1.0 - (g.y + local.y) / uAtlasGrid.y);
  float ink = texture2D(uAtlas, auv).r * step(0.5, glyph);

  vec3 tint = state > 1.5 ? HELDOUT : state > 0.5 ? EMBER : ASH;
  float flicker = 0.85 + 0.15 * hash(cell + floor(uTime * 12.0));
  col += tint * ink * level * flicker;

  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012; // grain
  gl_FragColor = vec4(col, 1.0);
}
