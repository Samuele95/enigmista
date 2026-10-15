// The scene machine: a fixed stage whose shots are driven by (smoothed, native) window scroll.
//
// The page scrolls a tall, empty track. Scroll position p (in viewport heights) is mapped onto a
// timeline of scenes; each scene owns [start, end] and is visible by `vis` ∈ [0,1]: it enters over
// the first ENTER of its window, holds, then exits over the last ENTER. Between two scenes there is
// a moment with no text at all — the camera-travel beat, carried by the sampling field rushing past.
// When scrolling stops inside a transit, the stage snaps to the nearest resting shot.
import Lenis from 'lenis';
import { scrambleIn } from './scramble-text.js';

const ENTER = 0.42; // viewport heights spent entering / exiting a scene
const SNAP_IDLE_MS = 160;
const TRAVEL = 0.55; // field px per scroll px: how fast the glyph world rushes past
const ease = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const pad2 = (n) => String(n).padStart(2, '0');

export function startStage({ field } = {}) {
  const scenes = [...document.querySelectorAll('[data-scene]')].map((el) => {
    // Each shot's content sits in a window bounded by the HUD bars; tall content scrolls inside it.
    const body = el.querySelector('.scene__body');
    const win = document.createElement('div');
    win.className = 'scene__window';
    body.replaceWith(win);
    win.append(body);
    return { el, body, win, ...meta(el) };
  });
  function meta(el) {
    return {
    title: el.dataset.title,
    length: Number(el.dataset.length),
    still: el.dataset.field === 'still',
    shown: false,
    };
  }

  // Timeline in viewport heights. The first scene starts already entered; the last never exits.
  let cursor = -ENTER;
  for (const s of scenes) {
    s.start = cursor;
    s.end = cursor + s.length;
    cursor = s.end;
  }
  const pMax = cursor - ENTER;
  const rest = (s) => [Math.max(0, s.start + ENTER), Math.min(pMax, s.end - ENTER)];

  const track = document.querySelector('[data-track]');
  const vh = () => window.innerHeight;
  const sizeTrack = () => {
    track.style.height = `${pMax * vh() + vh()}px`;
  };
  sizeTrack();

  // HUD
  const rail = document.querySelector('[data-rail]');
  rail.append(
    ...scenes.map((s, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${s.el.id}`;
      a.textContent = `${pad2(i + 1)} ${s.title}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        goTo(i);
      });
      li.append(a);
      return li;
    }),
  );
  const hudChapter = document.querySelector('[data-hud-chapter]');
  const count = document.querySelector('[data-count]');
  const bar = document.querySelector('[data-bar]');
  const station = document.querySelector('[data-station]');
  const inspectTrack = document.querySelector('[data-inspect-track]');

  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.85 });

  let active = -1;
  let remeasure = 0;
  const goTo = (i) => {
    const target = scenes[Math.max(0, Math.min(scenes.length - 1, i))];
    lenis.scrollTo(rest(target)[0] * vh(), { duration: 1.6, easing: (t) => 1 - (1 - t) ** 4 });
  };
  document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => goTo(active + 1)));
  document.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => goTo(active - 1)));
  document.querySelector('[data-goto="0"]').addEventListener('click', (e) => {
    e.preventDefault();
    goTo(0);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('button, a')) return;
    if (e.key === 'ArrowRight') goTo(active + 1);
    if (e.key === 'ArrowLeft') goTo(active - 1);
  });

  const setActive = (i) => {
    if (i === active) return;
    active = i;
    scenes.forEach((s, j) => {
      s.el.classList.toggle('is-active', j === i);
      s.el.inert = j !== i;
    });
    rail.querySelectorAll('a').forEach((a, j) => a.toggleAttribute('aria-current', j === i));
    hudChapter.textContent = `§${pad2(i + 1)} · ${scenes[i].title}`;
    scrambleIn(hudChapter, { duration: 500 });
    count.textContent = `${pad2(i + 1)} / ${pad2(scenes.length)}`;
    document.documentElement.dataset.tone = scenes[i].still ? 'paper' : 'dark';
    field?.refreshKeepOut();
    // Re-measure once the headline has finished deciphering (scrambled glyph widths vary).
    clearTimeout(remeasure);
    remeasure = setTimeout(() => field?.refreshKeepOut(), 1300);
  };

  const render = () => {
    const p = window.scrollY / vh();
    let best = 0;
    let bestVis = -1;
    scenes.forEach((s, i) => {
      const vis = clamp01(Math.min((p - s.start) / ENTER, (s.end - p) / ENTER));
      const entering = p < (s.start + s.end) / 2;
      const e = ease(vis);
      s.el.style.opacity = e;
      s.el.style.visibility = vis > 0 ? 'visible' : 'hidden';
      s.el.style.setProperty('--shift', `${(1 - e) * (entering ? 7 : -7)}vh`);
      if (s.still) s.el.style.setProperty('--paper', e);
      // Long scenes scroll their own body while holding.
      const [r0, r1] = rest(s);
      const t = r1 > r0 ? clamp01((p - r0) / (r1 - r0)) : 0;
      s.local = t;
      const overflow = Math.max(0, s.body.offsetHeight - s.win.clientHeight);
      s.body.style.transform = overflow ? `translateY(${-t * overflow}px)` : '';
      // Headlines decipher each time a scene arrives.
      if (vis > 0.55 && !s.shown) {
        s.shown = true;
        s.el.querySelectorAll('[data-scramble]').forEach((el, k) =>
          scrambleIn(el, { delay: k * 90, duration: el.matches('h1 *') ? 1100 : 650 }),
        );
      } else if (vis === 0) {
        s.shown = false;
      }
      if (vis > bestVis) {
        bestVis = vis;
        best = i;
      }
    });
    setActive(best);

    // Method: horizontal "scroll to inspect" through the stations while the scene holds.
    const method = scenes.find((s) => s.el.id === 'method');
    if (inspectTrack && method) {
      const max = Math.max(0, inspectTrack.scrollWidth - inspectTrack.parentElement.clientWidth);
      inspectTrack.style.transform = `translateX(${-method.local * max}px)`;
      const n = inspectTrack.children.length;
      station.textContent = `Station ${pad2(Math.min(n, 1 + Math.floor(method.local * n)))} / ${pad2(n)}`;
    }

    bar.style.transform = `scaleX(${clamp01(p / pMax)})`;
    const scope = scenes.find((s) => s.still);
    const scopeVis = scope ? clamp01(Math.min((p - scope.start) / ENTER, (scope.end - p) / ENTER)) : 0;
    field?.setTravel(window.scrollY * TRAVEL, { still: scenes[best].still, covered: scopeVis >= 1 });
  };

  // Snap: when scrolling settles inside a transit, glide to the nearest resting shot.
  let idle = 0;
  const snap = () => {
    field?.refreshKeepOut();
    const p = window.scrollY / vh();
    if (scenes.some((s) => {
      const [a, b] = rest(s);
      return p >= a - 0.01 && p <= b + 0.01;
    })) return;
    const targets = scenes.flatMap(rest);
    const nearest = targets.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));
    lenis.scrollTo(nearest * vh(), { duration: 0.9, easing: (t) => 1 - (1 - t) ** 3 });
  };
  lenis.on('scroll', () => {
    render();
    clearTimeout(idle);
    idle = setTimeout(snap, SNAP_IDLE_MS);
  });

  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  window.addEventListener('resize', () => {
    sizeTrack();
    render();
  });

  // Deep links (#method) land on that scene's resting shot.
  const fromHash = scenes.findIndex((s) => `#${s.el.id}` === window.location.hash);
  if (fromHash > 0) lenis.scrollTo(rest(scenes[fromHash])[0] * vh(), { immediate: true });
  render();
  return { goTo };
}
