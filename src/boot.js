// Boot / preloader: nine rotor columns decipher E-N-I-G-M-I-S-T-A as real loading tasks finish.
// Honest by construction: the % only ever shows completed work (eased toward it, never ahead of
// it), the log names the actual steps, an "Enter" appears after 3 s, and a hard ceiling resolves
// it regardless — it can never trap anyone.
import { CLASSES } from './glyphs.js';

const WORD = 'ENIGMISTA';
const SKIP_AFTER_MS = 3000;
const CEILING_MS = 8000;
const LOCK_STAGGER_MS = 70;

export function runBoot(tasks) {
  const root = document.querySelector('[data-boot]');
  // The rotors, cells and first log line ship as static HTML, so the boot screen paints with the
  // first frame (it is the page's largest early paint) instead of waiting on this script.
  const rotors = [...root.querySelectorAll('[data-rotors] .rotor')];
  const cells = [...root.querySelectorAll('[data-cells] i')];
  const pct = root.querySelector('[data-pct]');
  const log = root.querySelector('[data-log]');
  const skip = root.querySelector('[data-skip]');

  const total = tasks.reduce((a, t) => a + t.weight, 0);
  let done = 0;
  let shown = 0;
  let finished = false;

  const line = (text) => {
    const li = document.createElement('li');
    li.textContent = `› ${text}`;
    log.append(li);
  };

  return new Promise((resolve) => {
    const finish = () => {
      if (finished) return;
      finished = true;
      done = total;
      skip.hidden = true;
      // Let the last rotors lock, then hand over to the stage.
      setTimeout(() => {
        root.classList.add('is-done');
        root.setAttribute('aria-label', 'Loaded');
        setTimeout(() => root.remove(), 900);
        resolve();
      }, WORD.length * LOCK_STAGGER_MS + 450);
    };

    tasks.forEach((task) =>
      task.promise
        .catch(() => line(`${task.label} — unavailable, continuing`))
        .then(() => {
          done += task.weight;
          line(task.label);
          if (done >= total) finish();
        }),
    );
    setTimeout(() => {
      if (!finished) skip.hidden = false;
    }, SKIP_AFTER_MS);
    setTimeout(finish, CEILING_MS);
    skip.addEventListener('click', finish);
    window.addEventListener('keydown', (e) => e.key === 'Enter' && !skip.hidden && finish());

    // Rotors: each column cycles uppercase glyphs until progress passes its slot, then locks.
    const upper = CLASSES.upper;
    let last = performance.now();
    const tick = (now) => {
      // Time-based easing toward completed work, so slow frames don't stall the meter.
      shown += (done / total - shown) * (1 - Math.exp(-(now - last) / 150));
      last = now;
      if (done >= total && shown > 0.995) shown = 1;
      pct.textContent = `${String(Math.floor(shown * 100)).padStart(3, '0')}%`;
      rotors.forEach((el, i) => {
        const locked = shown >= (i + 1) / WORD.length - 1e-6;
        el.textContent = locked ? WORD[i] : upper[Math.floor(Math.random() * upper.length)];
        el.classList.toggle('is-locked', locked);
        cells[i].classList.toggle('is-on', locked);
      });
      if (!root.classList.contains('is-done')) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
