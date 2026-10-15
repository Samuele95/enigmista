import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/bodoni-moda/wght-italic.css';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource/martian-mono/400.css';
import './styles.css';
import { scrambleIn } from './scramble-text.js';
import { mountSandbox } from './sandbox.js';

const html = document.documentElement;
const staged = html.classList.contains('is-stage'); // set before paint in index.html
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelector('[data-build]').textContent = `build ${__BUILD_ID__}`;

// Calm ⇄ immersive: remembered per browser; reload so the right layout paints from the start.
document.querySelectorAll('[data-mode-toggle]').forEach((b) =>
  b.addEventListener('click', () => {
    try {
      localStorage.setItem('enigmista:mode', staged ? 'calm' : 'immersive');
    } catch {
      /* storage unavailable: the toggle still works for this load */
    }
    html.classList.toggle('is-stage', !staged);
    html.classList.toggle('is-calm', staged);
    window.location.reload();
  }),
);

const sandboxReady = Promise.resolve().then(() => mountSandbox(document.querySelector('[data-sandbox]')));
const fontsReady = document.fonts.ready;
const fieldModule = import('./field.js');
const fieldReady = fieldModule.then(({ startField }) =>
  startField(document.querySelector('.field'), { reducedMotion: !staged, mode: staged ? 'stage' : 'doc' }),
);

if (staged) {
  const { runBoot } = await import('./boot.js');
  const stageModule = import('./stage.js');
  const worldReady = fieldReady.then(async (field) => {
    const { createWorld } = await import('./world.js');
    const world = createWorld({ atlas: field.atlas });
    field.attachWorld(world);
    return world;
  });
  await runBoot([
    { label: 'typefaces loaded', weight: 1, promise: fontsReady },
    { label: 'toy corpus parsed · 16 train / 7 held-out', weight: 1, promise: sandboxReady },
    { label: 'grammar renderer loaded', weight: 2, promise: fieldModule },
    { label: 'glyph atlas compiled · first frame', weight: 2, promise: fieldReady },
    { label: 'rotor assembled · 12 discs', weight: 2, promise: worldReady },
    { label: 'scene machine ready', weight: 1, promise: stageModule },
  ]);
  const field = await fieldReady.catch(() => null);
  const world = await worldReady.catch(() => null);
  (await stageModule).startStage({ field, world });
  world?.resize(window.innerWidth, window.innerHeight); // re-fit the hero slot in its final layout
} else {
  document.querySelector('[data-boot]')?.remove();
  // In the document layout "next" simply means the next section.
  document.querySelectorAll('main [data-next]').forEach((b) =>
    b.addEventListener('click', () => b.closest('.scene').nextElementSibling?.scrollIntoView()),
  );
  fieldReady.catch((err) => console.warn('WebGL field unavailable; continuing without it.', err));
  fontsReady.then(() => {
    document.querySelectorAll('.scene--hero [data-scramble]').forEach((el, i) =>
      scrambleIn(el, { delay: i * 120, duration: 650, reducedMotion }),
    );
  });
}
