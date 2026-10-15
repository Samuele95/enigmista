// CPU side of the background "sampling field": a grid of glyph cells where toy candidates
// scramble within their slot classes, lock left→right, hold, and dissolve. Toy held-out
// hits flash teal. Writes one RGBA texel per visible cell: glyph, state, intensity.
//
// Lanes and keep-out rects live in *document* rows, so the field scrolls with the page and
// never runs behind text. The texture is a window of `rows` rows starting at `topRow`.
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
    this.topRow = 0;
    this.lanes = [];
    this.keepOut = [];
    this.still = false;
    this.ambGlyph = new Uint8Array(cols * rows);
    this.ambLevel = new Float32Array(cols * rows);
    this.maxLanes = Math.max(8, Math.round((cols * rows) / 85));
    this.ambientPerTick = Math.max(3, Math.round((cols * rows) / 230));
  }

  /** Document-cell rects ({x0, y0, x1, y1}, inclusive) where text sits: no lanes, no ambient.
   *  Lanes already sitting under new text are dropped so it never reads over glyphs. */
  setKeepOut(rects) {
    this.keepOut = rects;
    this.lanes = this.lanes.filter((l) => !this.blocked(l.x, l.y, l.chars.length));
  }

  blocked(x, y, len = 1) {
    return this.keepOut.some((r) => y >= r.y0 && y <= r.y1 && x <= r.x1 && x + len - 1 >= r.x0);
  }

  /** Move the visible window; ambient glyphs travel with the document. */
  scrollTo(topRow) {
    const delta = topRow - this.topRow;
    if (!delta) return;
    this.topRow = topRow;
    const shift = delta * this.cols;
    if (Math.abs(delta) >= this.rows) {
      this.ambLevel.fill(0);
    } else if (delta > 0) {
      this.ambGlyph.copyWithin(0, shift);
      this.ambLevel.copyWithin(0, shift);
      this.ambLevel.fill(0, this.ambLevel.length - shift);
    } else {
      this.ambGlyph.copyWithin(-shift, 0, this.ambGlyph.length + shift);
      this.ambLevel.copyWithin(-shift, 0, this.ambLevel.length + shift);
      this.ambLevel.fill(0, 0, -shift);
    }
    const margin = this.rows;
    this.lanes = this.lanes.filter((l) => l.y >= topRow - margin && l.y < topRow + this.rows + margin);
  }

  /** True once a still field has fully settled — the caller can stop stepping. */
  get settled() {
    return this.still && this.lanes.every((l) => l.t >= l.holdStart) && this.ambLevel.every((v) => v < 0.015);
  }

  spawnLane() {
    const cand = sample(TOY_GRAMMAR, { tau: this.tau, rng: this.rng });
    const len = cand.chars.length;
    if (len >= this.cols) return;
    const y = this.topRow + Math.floor(this.rng() * this.rows);
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
    if (!this.still) {
      for (let k = 0; k < this.ambientPerTick; k++) {
        const i = Math.floor(rng() * this.ambLevel.length);
        if (this.blocked(i % this.cols, this.topRow + Math.floor(i / this.cols))) continue;
        this.ambGlyph[i] = glyphIndex(randomOf(AMBIENT_CLASSES[Math.floor(rng() * 4)], rng));
        this.ambLevel[i] = 0.08 + rng() * 0.1;
      }
      if (this.lanes.length < this.maxLanes && rng() < 0.6) this.spawnLane();
    }
    // Still: lanes finish locking, then hold where they are instead of dissolving.
    for (const lane of this.lanes) if (!this.still || lane.t < lane.holdStart) lane.t++;
    this.lanes = this.lanes.filter((l) => l.t < l.dissolveStart + LANE_TICKS.dissolve);
  }

  /** Fill an RGBA Uint8Array (cols*rows*4): R glyph, G state, B intensity. */
  write(out) {
    const { cols, rows, rng } = this;
    for (let i = 0; i < this.ambGlyph.length; i++) {
      const o = i * 4;
      out[o] = this.ambLevel[i] > 0.015 ? this.ambGlyph[i] : 0;
      out[o + 1] = STATE.AMBIENT;
      out[o + 2] = Math.round(this.ambLevel[i] * 255);
    }
    for (const lane of this.lanes) {
      const row = lane.y - this.topRow;
      if (row < 0 || row >= rows) continue;
      const { t } = lane;
      lane.chars.forEach(({ ch, cls }, j) => {
        const o = (row * cols + lane.x + j) * 4;
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
