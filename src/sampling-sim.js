// CPU side of the background "sampling field": a grid of glyph cells where toy candidates
// scramble within their slot classes, lock left→right, hold, and dissolve. Toy held-out
// hits flash teal. Writes one RGBA texel per cell: glyph, state, intensity.
import { sample } from './sampler.js';
import { TOY_GRAMMAR, TOY_HELDOUT } from './toy/grammar.js';
import { CLASSES, glyphIndex, randomOf } from './glyphs.js';

export const STATE = { AMBIENT: 0, LOCKED: 1, HIT: 2 };

const AMBIENT_CLASSES = Object.keys(CLASSES);
const LANE_TICKS = { scramble: [8, 22], lockEvery: 2, hold: [26, 60], dissolve: 12 };
const between = ([a, b], rng) => a + Math.floor(rng() * (b - a + 1));

export class SamplingSim {
  constructor(cols, rows, { tau = 1.4, rng = Math.random } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.tau = tau;
    this.rng = rng;
    this.lanes = [];
    this.ambGlyph = new Uint8Array(cols * rows);
    this.ambLevel = new Float32Array(cols * rows);
    this.maxLanes = Math.max(6, Math.round((cols * rows) / 110));
    this.ambientPerTick = Math.max(2, Math.round((cols * rows) / 300));
    this.keepOut = [];
  }

  /** Cell-space rects ({x0, y0, x1, y1}, inclusive) where content sits: no lanes, no ambient. */
  setKeepOut(rects) {
    this.keepOut = rects;
  }

  blocked(x, y, len = 1) {
    return this.keepOut.some((r) => y >= r.y0 && y <= r.y1 && x <= r.x1 && x + len - 1 >= r.x0);
  }

  spawnLane() {
    const cand = sample(TOY_GRAMMAR, { tau: this.tau, rng: this.rng });
    const len = cand.chars.length;
    if (len >= this.cols) return;
    const y = Math.floor(this.rng() * this.rows);
    const x = Math.floor(this.rng() * (this.cols - len));
    const clashes = this.lanes.some((l) => l.y === y && x < l.x + l.chars.length + 2 && l.x < x + len + 2);
    if (clashes || this.blocked(x, y, len)) return;
    const scramble = between(LANE_TICKS.scramble, this.rng);
    this.lanes.push({
      x, y, t: 0,
      chars: cand.chars,
      hit: TOY_HELDOUT.has(cand.pw),
      lockStart: scramble,
      holdStart: scramble + len * LANE_TICKS.lockEvery,
      dissolveStart: scramble + len * LANE_TICKS.lockEvery + between(LANE_TICKS.hold, this.rng),
    });
  }

  step() {
    const { rng } = this;
    for (let i = 0; i < this.ambLevel.length; i++) this.ambLevel[i] *= 0.86;
    for (let k = 0; k < this.ambientPerTick; k++) {
      const i = Math.floor(rng() * this.ambLevel.length);
      if (this.blocked(i % this.cols, Math.floor(i / this.cols))) continue;
      this.ambGlyph[i] =glyphIndex(randomOf(AMBIENT_CLASSES[Math.floor(rng() * 4)], rng));
      this.ambLevel[i] = 0.08 + rng() * 0.1;
    }
    if (this.lanes.length < this.maxLanes && rng() < 0.6) this.spawnLane();
    for (const lane of this.lanes) lane.t++;
    this.lanes = this.lanes.filter((l) => l.t < l.dissolveStart + LANE_TICKS.dissolve);
  }

  /** Fill an RGBA Uint8Array (cols*rows*4): R glyph, G state, B intensity. */
  write(out) {
    const { cols, rng } = this;
    for (let i = 0; i < this.ambGlyph.length; i++) {
      const o = i * 4;
      out[o] = this.ambLevel[i] > 0.015 ? this.ambGlyph[i] : 0;
      out[o + 1] = STATE.AMBIENT;
      out[o + 2] = Math.round(this.ambLevel[i] * 255);
    }
    for (const lane of this.lanes) {
      const { t } = lane;
      lane.chars.forEach(({ ch, cls }, j) => {
        const o = (lane.y * cols + lane.x + j) * 4;
        const locked = t >= lane.lockStart + j * LANE_TICKS.lockEvery;
        let glyph = locked ? ch : randomOf(cls, rng);
        let state = locked ? STATE.LOCKED : STATE.AMBIENT;
        let level = locked ? 0.62 : Math.min(0.38, 0.1 + t * 0.03);
        if (t >= lane.holdStart && lane.hit) {
          state = STATE.HIT;
          level = 0.6 + 0.4 * Math.exp(-(t - lane.holdStart) / 10);
        }
        if (t >= lane.dissolveStart) {
          const d = (t - lane.dissolveStart) / LANE_TICKS.dissolve;
          if (rng() < d) glyph = randomOf(cls, rng);
          state = STATE.AMBIENT;
          level *= 1 - d;
        }
        out[o] = glyphIndex(glyph);
        out[o + 1] = state;
        out[o + 2] = Math.round(level * 255);
      });
    }
  }
}
