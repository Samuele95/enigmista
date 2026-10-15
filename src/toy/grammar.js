// ILLUSTRATIVE TOY DATA — invented, obviously-synthetic strings. Not a real password list.
// The toy grammar is *induced* from TOY_TRAIN in the browser (src/induce.js) plus a scripted
// enrichment step, so the sandbox, the Rotor, and the background field all sample the same thing.
// The real loop runs in the Enigmista skill.
import { enrich, induce, toSamplerGrammar } from '../induce.js';

// The bundled toy "seed" (train split).
export const TOY_TRAIN = [
  'summer2021', 'summer2022', 'summer2023', 'dragon2022', 'dragon!4', 'dragon!9',
  'tiger!1', 'falcon!3', 'summer!7', 'Falcon99', 'Falcon07', 'Tiger12',
  'sunflower_1', 'sunflower_2', 'sunflower_5', 'tiger@2021',
];

// Toy held-out split: never shown to the inducer; a hit here is what coverage means.
// Disjoint from TOY_TRAIN. Most are only reachable once the enrichment step has run.
export const TOY_HELDOUT = new Set([
  'summer2024', 'dragon!7', 'Falcon21', 'sunflower_3', 'autumn2022', 'tiger#2023', 'Mango21',
]);

// Scripted stand-in for the frontier model's enrichment pass: plausible unseen terminals.
export const TOY_ENRICHMENT = {
  W: ['autumn', 'mango', 'comet', 'pebble', 'lantern'],
  Y: ['2019', '2020', '2024'],
  DD: ['21', '22', '00', '11'],
  S: ['#', '.'],
};
const ENRICH_MASS = { W: 0.3, Y: 0.25, DD: 0.3, S: 0.15 };

export const TOY_INDUCED = induce(TOY_TRAIN);
export const TOY_ENRICHED_GRAMMAR = enrich(TOY_INDUCED, TOY_ENRICHMENT, ENRICH_MASS);
export const TOY_GRAMMAR = toSamplerGrammar(TOY_ENRICHED_GRAMMAR, ['seasons', 'animals', 'garden', 'small objects']);

// Slot names as the page displays them.
export const SLOT_LABELS = { W: 'word', Wc: 'Word', Y: 'year', D: 'digit', DD: 'two digits', S: 'symbol' };
