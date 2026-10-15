import '@fontsource-variable/bodoni-moda';
import '@fontsource/martian-mono/400.css';
import './styles.css';

document.querySelector('[data-build]').textContent = `build ${__BUILD_ID__}`;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lazy-load Three so the first paint never waits on the 3D bundle.
import('./field.js')
  .then(({ startField }) => startField(document.querySelector('.field'), { reducedMotion }))
  .catch((err) => console.warn('WebGL field unavailable; continuing without it.', err));
