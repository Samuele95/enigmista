// A tiny, deterministic, transparent PCFG inducer for the sandbox — illustrative only.
// It does what the real loop's statistical baseline does (Weir-style): split each password into
// character-class runs, call each run a slot, count templates and terminals. The real Enigmista
// induction is done by a language model in the skill; this is the shape of the idea on toy data.

// Character-class runs → slots: letters are a word (capitalised → Wc), digits by shape, symbols S.
export function segment(pw) {
  return [...pw.matchAll(/[A-Za-z]+|[0-9]+|[^A-Za-z0-9]/g)].map(([text]) => {
    let slot = 'S';
    if (/^[A-Za-z]+$/.test(text)) slot = /^[A-Z][a-z]+$/.test(text) ? 'Wc' : 'W';
    else if (/^[0-9]+$/.test(text)) {
      slot = text.length === 4 && /^(19|20)/.test(text) ? 'Y' : text.length === 2 ? 'DD' : text.length === 1 ? 'D' : 'N';
    }
    return { text, slot, term: slot === 'W' || slot === 'Wc' ? text.toLowerCase() : text };
  });
}

// Wc shares the word dictionary with W (it is the same terminal, capitalised).
export const dictOf = (slot) => (slot === 'Wc' ? 'W' : slot);

/** Count templates and terminals over the training split. */
export function induce(train) {
  const templates = new Map();
  const slots = {};
  for (const pw of train) {
    const segs = segment(pw);
    const key = segs.map((s) => s.slot).join(' ');
    templates.set(key, (templates.get(key) ?? 0) + 1);
    for (const s of segs) {
      const d = (slots[dictOf(s.slot)] ??= {});
      d[s.term] = (d[s.term] ?? 0) + 1;
    }
  }
  return {
    total: train.length,
    templates: [...templates]
      .map(([key, count]) => ({ pattern: key.split(' '), count, p: count / train.length }))
      .sort((a, b) => b.count - a.count),
    slots: Object.fromEntries(
      Object.entries(slots).map(([k, terms]) => {
        const sum = Object.values(terms).reduce((a, b) => a + b, 0);
        const rows = Object.entries(terms)
          .map(([term, count]) => ({ term, count, p: count / sum, enriched: false }))
          .sort((a, b) => b.count - a.count);
        return [k, rows];
      }),
    ),
  };
}

/**
 * Add extra terminals to some dictionaries, giving them a share of the probability mass.
 * In the real loop a frontier model proposes these; in the sandbox they are a fixed, scripted
 * list — the point is to show *why* enrichment matters, not to pretend a model ran.
 */
export function enrich(induced, extras, mass) {
  const slots = {};
  for (const [k, rows] of Object.entries(induced.slots)) {
    const add = (extras[k] ?? []).filter((t) => !rows.some((r) => r.term === t));
    const m = add.length ? mass[k] ?? 0.25 : 0;
    slots[k] = [
      ...rows.map((r) => ({ ...r, p: r.p * (1 - m) })),
      ...add.map((term) => ({ term, count: 0, p: m / add.length, enriched: true })),
    ];
  }
  return { ...induced, slots };
}

/** The shape the sampler (and the Rotor, and the field) consumes. */
export function toSamplerGrammar(g, themes = []) {
  return {
    templates: g.templates.map((t, i) => ({ id: `T${i + 1}`, pattern: t.pattern, p: t.p })),
    slots: Object.fromEntries(Object.entries(g.slots).map(([k, rows]) => [k, Object.fromEntries(rows.map((r) => [r.term, r.p]))])),
    themes,
  };
}

/** Could this grammar produce `pw` at all? (Template exists and every terminal is in its dictionary.) */
export function reachable(pw, g) {
  const segs = segment(pw);
  const key = segs.map((s) => s.slot).join(' ');
  if (!g.templates.some((t) => t.pattern.join(' ') === key)) return false;
  return segs.every((s) => (g.slots[dictOf(s.slot)] ?? []).some((r) => r.term === s.term));
}
