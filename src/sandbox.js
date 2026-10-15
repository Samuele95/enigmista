// The safe sandbox: renders the bundled toy corpus, the toy grammar, and a handful of sampled
// candidates. No inputs — only a "sample again" button. On the stage, each new batch of draws is
// played on the Rotor one by one; the row the drum is showing lights up as it locks.
import { sample } from './sampler.js';
import { SLOT_LABELS, TOY_ENRICHED, TOY_GRAMMAR, TOY_HELDOUT, TOY_TRAIN } from './toy/grammar.js';

const SAMPLES = 8;
const TAU = 1.4;

const li = (text, className) => {
  const el = document.createElement('li');
  el.textContent = text;
  if (className) el.className = className;
  return el;
};

function renderTemplates(list) {
  for (const { pattern, p } of TOY_GRAMMAR.templates) {
    const shape = pattern.map((s) => (SLOT_LABELS[s] ? `⟨${SLOT_LABELS[s]}⟩` : s)).join('');
    list.append(li(`${shape}  ${p.toFixed(2)}`));
  }
  const words = Object.keys(TOY_GRAMMAR.slots.W).map((w) => (TOY_ENRICHED.has(w) ? `${w}+` : w));
  list.append(li(`⟨word⟩ ∈ ${words.join(' · ')}`, 'templates__terminals'));
}

function renderSamples(root) {
  const list = root.querySelector('[data-candidates]');
  const seen = new Set(TOY_TRAIN);
  const draws = Array.from({ length: SAMPLES }, () => sample(TOY_GRAMMAR, { tau: TAU }).pw);
  list.replaceChildren(
    ...draws.map((pw) => {
      const hit = TOY_HELDOUT.has(pw);
      const tag = hit ? 'held-out hit' : seen.has(pw) ? 'in seed' : 'novel';
      const row = li(`${pw} — ${tag}`, hit ? 'is-hit' : '');
      row.dataset.pw = pw;
      return row;
    }),
  );
  const hits = draws.filter((pw) => TOY_HELDOUT.has(pw)).length;
  root.querySelector('[data-tally]').textContent = `${hits} of ${SAMPLES} draws landed on the toy held-out set.`;
  root.dataset.draws = JSON.stringify(draws);
  window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: draws }));
}

export function mountSandbox(root) {
  root.querySelector('[data-train]').append(...TOY_TRAIN.map((pw) => li(pw)));
  root.querySelector('[data-heldout]').append(...[...TOY_HELDOUT].map((pw) => li(pw)));
  renderTemplates(root.querySelector('[data-templates]'));
  root.querySelector('[data-themes]').textContent = TOY_GRAMMAR.themes.join(', ');
  renderSamples(root);
  root.querySelector('[data-resample]').addEventListener('click', () => renderSamples(root));
  // The Rotor asks for the current batch whenever the visitor arrives at the sandbox.
  window.addEventListener('sandbox:request', () =>
    window.dispatchEvent(new CustomEvent('sandbox:draws', { detail: JSON.parse(root.dataset.draws) })),
  );
  // Light the row the Rotor is holding (first match only, in case a word repeats).
  window.addEventListener('rotor:locked', (e) => {
    let lit = false;
    root.querySelectorAll('[data-candidates] li').forEach((row) => {
      const on = !lit && row.dataset.pw === e.detail;
      row.classList.toggle('is-current', on);
      lit ||= on;
    });
  });
}
