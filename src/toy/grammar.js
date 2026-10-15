// ILLUSTRATIVE TOY DATA — invented, obviously-synthetic strings. Not a real password list.
// A tiny hand-written PCFG in the shape of Enigmista's grammar schema (references/method.md),
// used only to animate the idea of sampling. The real loop runs in the Enigmista skill.

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
};

// Toy "held-out" entries: what a hit on unseen-but-plausible data looks like.
export const TOY_HELDOUT = new Set([
  'summer2024', 'dragon!7', 'Falcon99', 'sunflower_3', 'comet2022', 'tiger#2023', 'Mango21',
]);
