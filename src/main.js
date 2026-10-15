import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/bodoni-moda/wght-italic.css';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource/martian-mono/400.css';
import './styles.css';
import { scrambleIn } from './scramble-text.js';
import { mountSandbox } from './sandbox.js';

document.querySelector('[data-build]').textContent = `build ${__BUILD_ID__}`;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

mountSandbox(document.querySelector('[data-sandbox]'));

document.fonts.ready.then(() => {
  document.querySelectorAll('[data-scramble]').forEach((el, i) => {
    scrambleIn(el, { delay: i * 120, duration: el.matches('h1 *') ? 1100 : 650, reducedMotion });
  });
});

// Lazy-load Three so the first paint never waits on the 3D bundle.
import('./field.js')
  .then(({ startField }) => startField(document.querySelector('.field'), { reducedMotion }))
  .catch((err) => console.warn('WebGL field unavailable; continuing without it.', err));
