// The sandbox on the stage: a full-frame animation of the toy induction, drawn in the same glyph
// language as the background field. Driven by the sandbox's caption beats (`stage:beat`):
//   0 the sixteen toy passwords decipher in place      3 they recede; slot dictionaries rise as bars,
//   1 each splits into slot-coloured, tagged segments      the held-out strings show what's reachable
//   2 they fly into stacks — one per template: a bar   4 scripted enrichment pours in; reachable 2 → 7
//     chart made of the passwords themselves           5 the Rotor takes the frame and draws samples
// Every number is computed by the real inducer (src/induce.js). No text inputs: a τ slider and a button.
import { dictOf, reachable, segment } from './induce.js';
import { sample } from './sampler.js';
import { classOf, randomOf } from './glyphs.js';
import {
  SLOT_LABELS, TOY_ENRICHED_GRAMMAR, TOY_GRAMMAR, TOY_HELDOUT, TOY_INDUCED, TOY_TRAIN,
} from './toy/grammar.js';

const STEPS = [null, 'segment', 'count', 'slots', 'enrich', 'sample'];
const DICTS = ['W', 'Y', 'D', 'DD', 'S'];
const DRAWS = 8;
const tag = (slot) => SLOT_LABELS[slot] ?? slot;
const shape = (pattern) => pattern.map((s) => `⟨${tag(s)}⟩`).join('');
const pfmt = (p) => p.toFixed(2).replace(/^0/, '');
const el = (name, cls, text) => {
  const e = document.createElement(name);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const jitter = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 0.5; // deterministic, -0.5..0.5

function segmented(pw) {
  const wrap = el('span', 'vtok__pw');
  for (const s of segment(pw)) {
    const span = el('span', `seg seg--${dictOf(s.slot)}`, s.text);
    span.dataset.tag = s.slot;
    span.dataset.text = s.text;
    wrap.append(span);
  }
  return wrap;
}

// Glyph-stream decipher on a token's segments: each character cycles within its class, then locks.
function decipher(token, delay) {
  const spans = [...token.querySelectorAll('.seg')];
  const start = performance.now() + delay;
  const tick = (now) => {
    const t = Math.max(0, now - start);
    let done = true;
    spans.forEach((s, si) => {
      const text = s.dataset.text;
      s.textContent = [...text]
        .map((ch, ci) => {
          const lockAt = 120 + (si * 4 + ci) * 45;
          if (t >= lockAt) return ch;
          done = false;
          return randomOf(classOf(ch) ?? 'symbol');
        })
        .join('');
    });
    if (!done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function mountInduceViz(root, scene) {
  const box = el('div', 'viz-frame');
  root.append(box);

  // Seed tokens.
  const tokens = TOY_TRAIN.map((pw, i) => {
    const t = el('div', 'vtok');
    t.append(segmented(pw));
    t.dataset.template = segment(pw).map((s) => s.slot).join(' ');
    t.style.transitionDelay = `${i * 35}ms`;
    box.append(t);
    return t;
  });

  // Template axis labels (under the stacks).
  const heads = TOY_INDUCED.templates.map((t) => {
    const h = el('div', 'vhead');
    h.append(el('span', 'vhead__shape', shape(t.pattern)), el('span', 'vhead__n', `${t.count}/${TOY_INDUCED.total} · ${pfmt(t.p)}`));
    box.append(h);
    return { h, key: t.pattern.join(' ') };
  });

  // Slot dictionaries as probability bars.
  const dicts = el('div', 'vdicts');
  const terms = [];
  for (const k of DICTS) {
    const rows = TOY_ENRICHED_GRAMMAR.slots[k];
    if (!rows) continue;
    const col = el('div', 'vdict');
    col.dataset.dict = k; // phones show word · year · two digits only (styles.css)
    col.append(el('p', 'label', `⟨${tag(k)}⟩`));
    for (const r of rows) {
      const row = el('div', `vterm${r.enriched ? ' vterm--enriched' : ''}`);
      // One line per term — text and odds side by side, the bar as an underline beneath them.
      row.append(el('span', 'vterm__text', `${r.enriched ? '+' : ''}${r.term}`), el('span', 'vterm__p'), el('i', 'vterm__bar'));
      col.append(row);
      const seed = TOY_INDUCED.slots[k].find((s) => s.term === r.term);
      terms.push({ row, seedP: seed?.p ?? 0, finalP: r.p, enriched: r.enriched });
    }
    dicts.append(col);
  }
  box.append(dicts);

  // Held-out strings: what the grammar can reach.
  const held = el('div', 'vheld');
  const heldLabel = el('p', 'label vheld__label');
  held.append(heldLabel);
  const heldItems = [...TOY_HELDOUT].map((pw) => {
    const s = el('span', 'vheld__pw', pw);
    s.dataset.pw = pw;
    held.append(s);
    return s;
  });
  box.append(held);
  const reachSeed = heldItems.filter((s) => reachable(s.dataset.pw, TOY_INDUCED)).length;
  const reachAll = heldItems.filter((s) => reachable(s.dataset.pw, TOY_ENRICHED_GRAMMAR)).length;
  scene.querySelectorAll('[data-reach-seed]').forEach((n) => (n.textContent = `${reachSeed} of ${heldItems.length}`));
  scene.querySelectorAll('[data-reach-all]').forEach((n) => (n.textContent = `${reachAll} of ${heldItems.length}`));

  // Sampled candidates (beat 5), lit as the Rotor locks each one.
  const cands = el('ol', 'vcands');
  box.append(cands);
  const tauInput = scene.querySelector('[data-viz-tau]');
  const tauOut = scene.querySelector('[data-viz-tau-out]');
  const tallyEl = scene.querySelector('[data-viz-tally]');
  const tally = { drawn: 0, novel: 0, hits: new Set() };
  let lastDraws = null;
  const draw = () => {
    const tau = Number(tauInput?.value ?? 1.4);
    const seen = new Set(TOY_TRAIN);
    const draws = Array.from({ length: DRAWS }, () => sample(TOY_GRAMMAR, { tau }).pw);
    cands.replaceChildren(
      ...draws.map((pw, i) => {
        const hit = TOY_HELDOUT.has(pw);
        const kind = hit ? 'held-out hit' : seen.has(pw) ? 'in seed' : 'novel';
        const li = el('li', `vcand${hit ? ' is-hit' : ''}`);
        li.dataset.pw = pw;
        li.style.transitionDelay = `${i * 60}ms`;
        li.append(segmented(pw), el('span', 'vcand__kind', kind));
        tally.drawn++;
        if (hit) tally.hits.add(pw);
        if (kind === 'novel') tally.novel++;
        return li;
      }),
    );
    if (tallyEl) {
      tallyEl.textContent = `${tally.drawn} drawn this visit · ${tally.novel} novel · held-out hit ${tally.hits.size}/${TOY_HELDOUT.size} — reachable is not covered.`;
    }
    lastDraws = draws;
    window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: draws }));
  };
  tauInput?.addEventListener('input', () => {
    tauOut.textContent = Number(tauInput.value).toFixed(1);
    window.dispatchEvent(new CustomEvent('sandbox:tau', { detail: Number(tauInput.value) }));
  });
  tauInput?.addEventListener('change', () => step === 5 && draw());
  scene.querySelector('[data-viz-resample]')?.addEventListener('click', () => step === 5 && draw());
  window.addEventListener('rotor:locked', (e) => {
    let lit = false;
    cands.querySelectorAll('li').forEach((li) => {
      const on = !lit && li.dataset.pw === e.detail;
      li.classList.toggle('is-current', on);
      lit ||= on;
    });
  });

  // ── Layout: positions for each state, from the frame's size ─────────
  let W = 0;
  let H = 0;
  const widths = new Map();
  const measure = () => {
    W = box.clientWidth;
    H = box.clientHeight;
    tokens.forEach((t) => widths.set(t, t.offsetWidth));
  };
  const place = (t, x, y, s = 1, o = 1) => {
    t.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    t.style.opacity = o;
  };

  let step = -1;
  const layout = () => {
    const k = Math.max(0, step);
    box.dataset.step = String(k);
    if (k <= 1) {
      // Scatter: a loose grid with deterministic jitter.
      const cols = W > 640 ? 4 : 2;
      const rows = Math.ceil(tokens.length / cols);
      const cw = W / cols;
      const ch = Math.min((H * 0.86) / rows, 78);
      const oy = (H - rows * ch) / 2;
      tokens.forEach((t, i) => {
        const w = widths.get(t);
        const x = (i % cols) * cw + cw / 2 - w / 2 + jitter(i, 1) * cw * 0.22;
        const y = oy + Math.floor(i / cols) * ch + jitter(i, 2) * ch * 0.25;
        place(t, x, y);
      });
    } else {
      // Stacks: one column per template, growing up from a baseline — the template odds, made of words.
      const n = heads.length;
      const cw = W / n;
      const base = H * 0.78;
      const rowH = Math.min((base * 0.92) / 8, 34);
      const filled = new Map();
      tokens.forEach((t) => {
        const col = heads.findIndex((h) => h.key === t.dataset.template);
        const sIdx = filled.get(col) ?? 0;
        filled.set(col, sIdx + 1);
        const w = widths.get(t);
        const s = Math.min(1, (cw * 0.9) / w);
        place(t, col * cw + cw / 2 - (w * s) / 2, base - (sIdx + 1) * rowH, s, k >= 3 ? 0.1 : 1);
      });
      heads.forEach(({ h }, i) => {
        h.style.transform = `translate(${i * cw}px, ${base + 10}px)`;
        h.style.width = `${cw}px`;
      });
    }
    terms.forEach((t) => {
      const p = k >= 4 ? t.finalP : t.seedP;
      t.row.style.setProperty('--p', p);
      t.row.querySelector('.vterm__p').textContent = p ? pfmt(p) : '';
    });
    heldItems.forEach((s) => {
      const ok = reachable(s.dataset.pw, k >= 4 ? TOY_ENRICHED_GRAMMAR : TOY_INDUCED);
      s.classList.toggle('is-reach', ok);
    });
    heldLabel.textContent = `Toy held-out · never shown · reachable ${k >= 4 ? reachAll : reachSeed}/${heldItems.length}`;
  };

  const apply = (k) => {
    if (k === step) return;
    const prev = step;
    step = k;
    if (k === 0 && prev !== 0) tokens.forEach((t, i) => decipher(t, i * 70));
    layout();
    window.dispatchEvent(new CustomEvent('sandbox:phase', { detail: STEPS[k] ?? null }));
    if (k === 5 && !lastDraws) draw();
    else if (k === 5) window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: lastDraws }));
  };

  window.addEventListener('stage:beat', (e) => e.detail.scene === 'sandbox' && apply(e.detail.beat));
  window.addEventListener('sandbox:request', () => {
    if (step >= 1) window.dispatchEvent(new CustomEvent('sandbox:phase', { detail: STEPS[step] }));
    if (step === 5 && lastDraws) window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: lastDraws }));
  });
  // The dictionaries scale down to whatever room the frame leaves above the held-out row, so on
  // a short or narrow frame they shrink instead of running into it (or out of the frame).
  const fitDicts = () => {
    dicts.style.setProperty('--fit', '1');
    const room = held.offsetTop - 10;
    const fit = Math.min(1, room / Math.max(1, dicts.offsetHeight), box.clientWidth / Math.max(1, dicts.scrollWidth));
    dicts.style.setProperty('--fit', fit.toFixed(3));
  };
  const relayout = () => {
    measure();
    layout();
    fitDicts();
  };
  new ResizeObserver(relayout).observe(box);
  document.fonts.ready.then(relayout);
  measure();
  step = 0;
  layout();
  return { apply };
}

