// ILLUSTRATIVE TOY DATA — invented, obviously-synthetic strings. Not a real password list.
// A tiny PCFG in the shape of Enigmista's grammar schema (references/method.md), used only
// to animate the idea of induce → sample. The real loop runs in the Enigmista skill.

// The bundled toy "seed" (train split). Every entry is derivable from TOY_GRAMMAR.
export const TOY_TRAIN = [
  'summer2021', 'summer2022', 'summer2023', 'dragon2022', 'dragon!4', 'dragon!9',
  'tiger!1', 'falcon!3', 'summer!7', 'Falcon99', 'Falcon07', 'Tiger12',
  'sunflower_1', 'sunflower_2', 'sunflower_5', 'tiger@2021',
];

// Toy held-out split: never shown to the "model"; a hit here is what coverage means.
// Disjoint from TOY_TRAIN. autumn2022 and Mango21 are only reachable via enriched terminals.
export const TOY_HELDOUT = new Set([
  'summer2024', 'dragon!7', 'Falcon21', 'sunflower_3', 'autumn2022', 'tiger#2023', 'Mango21',
]);

export const TOY_GRAMMAR = {
  templates: [
    { id: 'T1', pattern: ['W', 'Y'], p: 0.34 },
    { id: 'T2', pattern: ['W', '!', 'D'], p: 0.22 },
    { id: 'T3', pattern: ['Wc', 'DD'], p: 0.18 },
    { id: 'T4', pattern: ['W', '_', 'D'], p: 0.14 },
    { id: 'T5', pattern: ['W', 'S', 'Y'], p: 0.12 },
  ],
  slots: {
    W: {
      summer: 0.16, dragon: 0.14, sunflower: 0.12, falcon: 0.1, tiger: 0.09,
      comet: 0.08, mango: 0.08, autumn: 0.08, pebble: 0.08, lantern: 0.07,
    },
    Y: { 2019: 0.1, 2020: 0.12, 2021: 0.16, 2022: 0.18, 2023: 0.2, 2024: 0.24 },
    D: { 1: 0.16, 2: 0.12, 3: 0.1, 7: 0.16, 9: 0.12, 0: 0.08, 4: 0.08, 5: 0.06, 6: 0.06, 8: 0.06 },
    DD: { 99: 0.2, '07': 0.14, 11: 0.12, 12: 0.1, 21: 0.12, 22: 0.12, 23: 0.1, '00': 0.1 },
    S: { '!': 0.5, '@': 0.2, '#': 0.15, '.': 0.15 },
  },
  themes: ['seasons', 'animals', 'garden', 'small objects'],
};

// Terminals absent from TOY_TRAIN: the "enrichment" a frontier model adds at induction.
export const TOY_ENRICHED = new Set(['comet', 'mango', 'autumn', 'pebble', 'lantern']);

// Slot names as the page displays them.
export const SLOT_LABELS = { W: 'word', Wc: 'Word', Y: 'year', D: 'digit', DD: 'two digits', S: 'symbol' };
