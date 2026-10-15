// Weighted sampling from a toy PCFG at temperature τ: p_i^(1/τ), renormalised.
// Low τ clusters on the modes; high τ reaches the tails.

function pick(weights, tau, rng) {
  const entries = Object.entries(weights);
  const scaled = entries.map(([, p]) => p ** (1 / tau));
  let r = rng() * scaled.reduce((a, b) => a + b, 0);
  for (let i = 0; i < entries.length; i++) {
    r -= scaled[i];
    if (r <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

// Character class of each slot drives what the scramble cycles through.
const SLOT_CLASS = { W: 'lower', Wc: 'lower', Y: 'digit', D: 'digit', DD: 'digit', S: 'symbol' };

/** Returns { pw, template, chars: [{ ch, cls, slot }] } — cls is the scramble class per character,
 *  slot the grammar slot it was drawn from (a literal separator's slot is the literal itself). */
export function sample(grammar, { tau = 1.4, rng = Math.random } = {}) {
  const templates = Object.fromEntries(grammar.templates.map((t) => [t.id, t.p]));
  const templateId = pick(templates, tau, rng);
  const template = grammar.templates.find((t) => t.id === templateId);
  const chars = [];
  for (const slot of template.pattern) {
    if (!(slot in SLOT_CLASS)) {
      chars.push({ ch: slot, cls: 'symbol', slot }); // literal separator
      continue;
    }
    let text = pick(grammar.slots[slot === 'Wc' ? 'W' : slot], tau, rng);
    if (slot === 'Wc') text = text[0].toUpperCase() + text.slice(1);
    [...text].forEach((ch, i) => {
      const cls = slot === 'Wc' && i === 0 ? 'upper' : SLOT_CLASS[slot];
      chars.push({ ch, cls, slot });
    });
  }
  return { pw: chars.map((c) => c.ch).join(''), template: template.id, chars };
}
