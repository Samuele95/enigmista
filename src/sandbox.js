// The safe sandbox: an animated, in-browser run of the toy inducer (src/induce.js) on the bundled
// toy seed — segment → count templates → fill slots → enrich (scripted) → sample. No text inputs:
// only a temperature slider and two buttons. Every number shown is computed, not written in.
//
// It talks to the Rotor through window events: `sandbox:phase` (the step being run, which the drum
// spells), `sandbox:draws` (the sampled list, which the drum plays) and `rotor:locked` (the word
// the drum holds, whose row lights up). `sandbox:request` asks for the current state again.
import { dictOf, reachable, segment } from './induce.js';
import { sample } from './sampler.js';
import {
  SLOT_LABELS, TOY_ENRICHED_GRAMMAR, TOY_GRAMMAR, TOY_HELDOUT, TOY_INDUCED, TOY_TRAIN,
} from './toy/grammar.js';

const STEPS = ['segment', 'count', 'slots', 'enrich', 'sample'];
const DICTS = ['W', 'Y', 'D', 'DD', 'S'];
const DRAWS = 8;
const PACE = { chip: 150, count: 180, term: 70, enrich: 160, beat: 900 }; // ms — calm, readable

const tag = (slot) => SLOT_LABELS[slot] ?? slot;
const shape = (pattern) => pattern.map((s) => `⟨${tag(s)}⟩`).join('');
const pfmt = (p) => p.toFixed(2).replace(/^0/, '');
const el = (name, cls, text) => {
  const e = document.createElement(name);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// A password rendered as its slot segments (coloured, tagged) — used for chips and draws.
function segmented(pw) {
  const frag = document.createDocumentFragment();
  for (const s of segment(pw)) {
    const span = el('span', `seg seg--${dictOf(s.slot)}`, s.text);
    span.dataset.tag = s.slot; // the grammar's own slot code (W, Wc, Y, D, DD, S), as in the schema
    span.title = tag(s.slot);
    frag.append(span);
  }
  return frag;
}

export function mountSandbox(root, { instant = false } = {}) {
  const $ = (sel) => root.querySelector(sel);
  const status = $('[data-status]');
  const steps = [...root.querySelectorAll('[data-step]')];
  const tauInput = $('[data-tau]');
  const tauOut = $('[data-tau-out]');

  // ── Build the static pieces once ────────────────────────────────────
  const chips = TOY_TRAIN.map((pw) => {
    const li = el('li', 'chip');
    li.append(segmented(pw));
    li.dataset.template = segment(pw).map((s) => s.slot).join(' ');
    $('[data-train]').append(li);
    return li;
  });
  const held = [...TOY_HELDOUT].map((pw) => {
    const li = el('li', 'chip', pw);
    li.dataset.pw = pw;
    $('[data-heldout]').append(li);
    return li;
  });
  const rows = TOY_INDUCED.templates.map((t) => {
    const li = el('li', 'tpl');
    li.dataset.template = t.pattern.join(' ');
    const bar = el('span', 'bar');
    bar.append(el('i'));
    li.append(el('span', 'tpl__shape', shape(t.pattern)), bar, el('span', 'tpl__count'));
    $('[data-templates]').append(li);
    return { li, t, n: 0 };
  });
  const terms = [];
  for (const k of DICTS) {
    const rowsK = TOY_ENRICHED_GRAMMAR.slots[k];
    if (!rowsK) continue;
    const box = el('div', 'dict');
    box.append(el('p', 'label', `⟨${tag(k)}⟩`));
    const ul = el('ul');
    for (const r of rowsK) {
      const li = el('li', `term${r.enriched ? ' term--enriched' : ''}`);
      li.append(el('span', 'term__text', `${r.enriched ? '+' : ''}${r.term}`), el('span', 'term__p'), el('i', 'term__bar'));
      ul.append(li);
      const seed = TOY_INDUCED.slots[k].find((s) => s.term === r.term);
      terms.push({ li, k, seedP: seed?.p ?? 0, finalP: r.p, enriched: r.enriched });
    }
    box.append(ul);
    $('[data-dicts]').append(box);
  }
  const setP = (t, p) => {
    t.li.querySelector('.term__p').textContent = pfmt(p);
    t.li.style.setProperty('--p', p);
  };

  // ── State ──────────────────────────────────────────────────────────
  let token = 0;
  let phase = null;
  let lastDraws = null;
  const tally = { drawn: 0, hits: new Set(), novel: 0 };
  const sleep = (ms, my) =>
    new Promise((resolve, reject) => setTimeout(() => (my === token ? resolve() : reject(new Error('cancelled'))), ms));

  const setStep = (name, text) => {
    phase = name;
    steps.forEach((s) => {
      const i = STEPS.indexOf(s.dataset.step);
      s.classList.toggle('is-done', i < STEPS.indexOf(name));
      s.toggleAttribute('aria-current', s.dataset.step === name);
    });
    status.textContent = text;
    window.dispatchEvent(new CustomEvent('sandbox:phase', { detail: name }));
  };

  const showReach = (grammar, label) => {
    let n = 0;
    held.forEach((li) => {
      const ok = reachable(li.dataset.pw, grammar);
      li.classList.toggle('is-reachable', ok);
      n += ok;
    });
    $('[data-reach]').textContent = `· reachable ${n}/${held.length} ${label}`;
    return n;
  };

  const reset = () => {
    chips.forEach((c) => c.classList.remove('is-seg', 'is-counting'));
    rows.forEach((r) => {
      r.n = 0;
      r.li.classList.remove('is-in');
      r.li.style.setProperty('--w', 0);
      r.li.querySelector('.tpl__count').textContent = `0/${TOY_INDUCED.total}`;
    });
    terms.forEach((t) => {
      t.li.classList.remove('is-in');
      setP(t, 0);
    });
    held.forEach((li) => li.classList.remove('is-reachable'));
    $('[data-reach]').textContent = '';
    $('[data-enrich-note]').hidden = true;
    $('[data-candidates]').replaceChildren();
    root.classList.remove('is-enriched');
  };

  // ── Sampling ───────────────────────────────────────────────────────
  const draw = () => {
    const tau = Number(tauInput.value);
    const seen = new Set(TOY_TRAIN);
    const draws = Array.from({ length: DRAWS }, () => sample(TOY_GRAMMAR, { tau }).pw);
    $('[data-candidates]').replaceChildren(
      ...draws.map((pw) => {
        const hit = TOY_HELDOUT.has(pw);
        const kind = hit ? 'held-out hit' : seen.has(pw) ? 'in seed' : 'novel';
        const li = el('li', `cand${hit ? ' is-hit' : ''}`);
        li.dataset.pw = pw;
        const word = el('span', 'cand__pw');
        word.append(segmented(pw));
        li.append(word, el('span', 'cand__kind', kind));
        tally.drawn++;
        if (hit) tally.hits.add(pw);
        if (kind === 'novel') tally.novel++;
        return li;
      }),
    );
    $('[data-tally]').textContent =
      `${tally.drawn} drawn this visit · ${tally.novel} novel · held-out hit ${tally.hits.size}/${TOY_HELDOUT.size}.`;
    lastDraws = draws;
    window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: draws }));
  };

  // ── The run ────────────────────────────────────────────────────────
  const final = () => {
    token++;
    chips.forEach((c) => c.classList.add('is-seg'));
    rows.forEach((r) => {
      r.li.classList.add('is-in');
      r.li.style.setProperty('--w', r.t.p);
      r.li.querySelector('.tpl__count').textContent = `${r.t.count}/${TOY_INDUCED.total}`;
    });
    terms.forEach((t) => {
      t.li.classList.add('is-in');
      setP(t, t.finalP);
    });
    root.classList.add('is-enriched');
    $('[data-enrich-note]').hidden = false;
    const n = showReach(TOY_ENRICHED_GRAMMAR, 'after enrichment');
    setStep('sample', `Induced ${rows.length} templates from ${TOY_TRAIN.length} toy passwords; held-out reachable ${n}/${held.length}.`);
    draw();
  };

  const play = async () => {
    if (instant) return final();
    const my = ++token;
    reset();
    try {
      setStep('segment', `Splitting ${TOY_TRAIN.length} toy passwords into slots by character class…`);
      for (const c of chips) {
        c.classList.add('is-seg');
        await sleep(PACE.chip, my);
      }
      await sleep(PACE.beat, my);

      setStep('count', 'Counting how often each template appears…');
      for (const c of chips) {
        const r = rows.find((x) => x.t.pattern.join(' ') === c.dataset.template);
        c.classList.add('is-counting');
        r.n++;
        r.li.classList.add('is-in');
        r.li.style.setProperty('--w', r.n / TOY_INDUCED.total);
        r.li.querySelector('.tpl__count').textContent = `${r.n}/${TOY_INDUCED.total}`;
        await sleep(PACE.count, my);
        c.classList.remove('is-counting');
      }
      await sleep(PACE.beat, my);

      setStep('slots', 'Filling each slot’s dictionary with what the seed used…');
      for (const t of terms.filter((x) => !x.enriched)) {
        t.li.classList.add('is-in');
        setP(t, t.seedP);
        await sleep(PACE.term, my);
      }
      const before = showReach(TOY_INDUCED, 'from the seed alone');
      status.textContent = `Seed-only grammar: it can reach ${before} of ${held.length} held-out passwords.`;
      await sleep(PACE.beat * 2, my);

      setStep('enrich', 'Enrichment (scripted here): adding plausible terms the seed never showed…');
      root.classList.add('is-enriched');
      $('[data-enrich-note]').hidden = false;
      for (const t of terms) {
        setP(t, t.finalP);
        if (t.enriched) {
          t.li.classList.add('is-in');
          await sleep(PACE.enrich, my);
        }
      }
      const after = showReach(TOY_ENRICHED_GRAMMAR, 'after enrichment');
      status.textContent = `With enrichment it can reach ${after} of ${held.length} — reachable, not yet covered.`;
      await sleep(PACE.beat * 2, my);

      setStep('sample', `Sampling at τ ${tauInput.value} — candidates in the grammar’s distribution.`);
      draw();
    } catch {
      /* replaced by a newer run */
    }
  };

  // ── Controls ───────────────────────────────────────────────────────
  tauInput.addEventListener('input', () => {
    tauOut.textContent = Number(tauInput.value).toFixed(1);
    window.dispatchEvent(new CustomEvent('sandbox:tau', { detail: Number(tauInput.value) })); // reshapes the drum's spikes
  });
  tauInput.addEventListener('change', () => phase === 'sample' && draw());
  $('[data-resample]').addEventListener('click', () => (phase === 'sample' ? draw() : final()));
  $('[data-replay]').addEventListener('click', play);

  // The Rotor asks for the current state whenever the visitor arrives here.
  window.addEventListener('sandbox:request', () => {
    if (phase) window.dispatchEvent(new CustomEvent('sandbox:phase', { detail: phase }));
    if (phase === 'sample' && lastDraws) window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: lastDraws }));
  });
  // Light the row the Rotor is holding (first match only, in case a word repeats).
  window.addEventListener('rotor:locked', (e) => {
    let lit = false;
    root.querySelectorAll('[data-candidates] li').forEach((row) => {
      const on = !lit && row.dataset.pw === e.detail;
      row.classList.toggle('is-current', on);
      lit ||= on;
    });
  });

  reset();
  if (instant) final();
  return { play, final, played: () => phase !== null };
}
