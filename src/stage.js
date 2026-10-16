// The scene machine, in movie mode: like the references, the page does not scroll. A virtual
// playhead p (in viewport heights) moves along a timeline of shots, and every input plays a
// *beat* — a timed, eased move to the next resting position — rather than scrubbing.
//
//  · A gesture (one wheel/trackpad flick, one swipe, one key press) = one beat. Inertia trails are
//    swallowed until the gesture ends, so a flick never skips chapters.
//  · Between chapters a beat is a cut: text out, a camera flight through the glyph world (the
//    Rotor's discs scramble in transit), text in. Inside a long chapter, beats step through it
//    (Method's stations, the sandbox's panels, the scope's text).
//  · PREV/NEXT, the rail, ←/→ and dragging the Rotor move by chapter.
//
// Each shot owns [start, end] on the timeline and is visible by `vis` ∈ [0,1]: it enters over the
// first ENTER, holds, exits over the last ENTER; between shots there is a text-free transit.
import { scrambleIn } from './scramble-text.js';

const READOUT_CELLS = 12; // one per disc on the Rotor
const ENTER = 0.42; // viewport heights spent entering / exiting a shot
const TRAVEL = 0.55; // field px per playhead px: how fast the glyph world rushes past
const CUT_MS = 2600; // chapter-to-chapter flight
const BEAT_MS = 1150; // a step inside a chapter
const GESTURE_GAP_MS = 220; // wheel silence that ends one gesture
const WHEEL_STEP = 30; // accumulated delta that commits a beat
const SWIPE_PX = 40;
const ease = (t) => 1 - (1 - t) ** 3;
const inOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const pad2 = (n) => String(n).padStart(2, '0');

// Terminal lines type themselves out; screen readers get the full text at once.
function typeOut(el) {
  const text = el.dataset.full ?? (el.dataset.full = el.textContent);
  let shown = el.querySelector('[data-typed]');
  if (!shown) {
    const real = document.createElement('span');
    real.className = 'sr-only';
    real.textContent = text;
    shown = document.createElement('span');
    shown.dataset.typed = '';
    shown.setAttribute('aria-hidden', 'true');
    el.replaceChildren(real, shown);
  }
  const start = performance.now() + 400;
  const tick = (now) => {
    const n = Math.max(0, Math.floor((now - start) / 14));
    shown.textContent = text.slice(0, n) + (n < text.length ? '▌' : '');
    if (n < text.length) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function startStage({ field, world } = {}) {
  const scenes = [...document.querySelectorAll('[data-scene]')].map((el) => {
    // Each shot's content sits in a window bounded by the HUD bars; tall content steps inside it.
    const body = el.querySelector('.scene__body');
    const win = document.createElement('div');
    win.className = 'scene__window';
    body.replaceWith(win);
    win.append(body);
    const beatEls = [...body.querySelectorAll(':scope > .beat')];
    // Beats the Rotor dials get a readout: twelve cells mirroring the drum's front row. Their
    // caption waits for the discs to lock, then reads itself off them.
    beatEls.forEach((b) => {
      if (!b.dataset.word || b.querySelector('[data-tether]')) return;
      const readout = document.createElement('div');
      readout.className = 'readout';
      readout.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < READOUT_CELLS; i++) {
        const cell = document.createElement('span');
        cell.className = 'readout__cell';
        readout.append(cell);
      }
      b.prepend(readout);
      b.classList.add('is-gated');
    });
    return {
      el, body, win, beatEls,
      title: el.dataset.title,
      designed: Math.max(1.3, beatEls.length * 0.9 + 0.4), // timeline length grows with the beats
      still: el.dataset.field === 'still',
      current: -1,
    };
  });

  // ── Timeline and beats ──────────────────────────────────────────────
  const vh = () => window.innerHeight;
  let pMax = 0;
  let beats = []; // [{ p, scene }]
  const rest = (s) => [Math.max(0, s.start + ENTER), Math.min(pMax, s.end - ENTER)];
  const layoutTimeline = () => {
    let cursor = -ENTER;
    for (const s of scenes) {
      s.length = s.designed;
      s.start = cursor;
      s.end = cursor + s.length;
      cursor = s.end;
    }
    pMax = cursor - ENTER;
    // One beat per caption block, spread evenly over the chapter's resting range.
    beats = scenes.flatMap((s, i) => {
      const [a, b] = rest(s);
      const n = Math.max(0, s.beatEls.length - 1);
      return Array.from({ length: n + 1 }, (_, k) => ({ p: n ? a + ((b - a) * k) / n : a, scene: i }));
    });
  };
  layoutTimeline();
  // Re-time when content changes size (the sandbox fills in as it runs) or the window resizes,
  // keeping the visitor on the same beat of the same chapter.
  const retime = () => {
    const at = beats[beat];
    const ordinal = beat - beats.findIndex((b) => b.scene === at.scene);
    layoutTimeline();
    const first = beats.findIndex((b) => b.scene === at.scene);
    const count = beats.filter((b) => b.scene === at.scene).length;
    beat = first + Math.min(ordinal, count - 1);
    if (playhead.moving) playhead.to = beats[beat].p;
    else playhead.p = beats[beat].p;
    render();
  };
  let relayout = 0;
  const content = new ResizeObserver(() => {
    clearTimeout(relayout);
    relayout = setTimeout(retime, 200);
  });
  scenes.forEach((s) => content.observe(s.body));

  // ── HUD ─────────────────────────────────────────────────────────────
  const rail = document.querySelector('[data-rail]');
  const hint = document.querySelector('[data-vis-hint]');
  rail.append(
    ...scenes.map((s, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${s.el.id}`;
      a.setAttribute('aria-label', `${pad2(i + 1)} ${s.title}`);
      const num = document.createElement('span');
      num.textContent = pad2(i + 1);
      const title = document.createElement('span');
      title.className = 'hud__rail-title';
      title.textContent = s.title;
      a.append(num, title);
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

  // ── Playhead: beats are timed, eased moves ──────────────────────────
  const playhead = { p: 0, from: 0, to: 0, t0: 0, dur: 0, moving: false };
  let beat = 0;
  const moveTo = (index) => {
    const next = Math.max(0, Math.min(beats.length - 1, index));
    if (next === beat && !playhead.moving) return;
    const hops = Math.abs(beats[next].scene - beats[beat].scene);
    playhead.from = playhead.p;
    playhead.to = beats[next].p;
    playhead.t0 = performance.now();
    playhead.dur = hops ? CUT_MS + Math.min(3, hops - 1) * 450 : BEAT_MS;
    playhead.moving = true;
    beat = next;
  };
  const step = (dir) => !playhead.moving && moveTo(beat + dir);
  const goTo = (i) => {
    const target = Math.max(0, Math.min(scenes.length - 1, i));
    moveTo(beats.findIndex((b) => b.scene === target));
  };
  const sceneOfBeat = () => beats[beat].scene;

  document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => goTo(sceneOfBeat() + 1)));
  document.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => goTo(sceneOfBeat() - 1)));
  document.querySelector('[data-goto="0"]').addEventListener('click', (e) => {
    e.preventDefault();
    goTo(0);
  });
  window.addEventListener('rotor:navigate', (e) => goTo(sceneOfBeat() + e.detail));

  // Wheel / trackpad: one gesture, one beat.
  const wheel = { acc: 0, last: 0, armed: true };
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return; // pinch-zoom
      e.preventDefault();
      const now = performance.now();
      const gap = now - wheel.last;
      wheel.last = now;
      if (gap > GESTURE_GAP_MS) {
        wheel.acc = 0;
        wheel.armed = true;
      }
      if (playhead.moving || !wheel.armed) return;
      wheel.acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (Math.abs(wheel.acc) >= WHEEL_STEP) {
        wheel.armed = false;
        step(Math.sign(wheel.acc));
      }
    },
    { passive: false },
  );

  // Touch: one swipe, one beat (sliders keep their own drag).
  const touch = { y: 0, x: 0, on: false };
  window.addEventListener('touchstart', (e) => {
    touch.on = !e.target.closest('input');
    touch.y = e.touches[0].clientY;
    touch.x = e.touches[0].clientX;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => touch.on && e.preventDefault(), { passive: false });
  window.addEventListener('touchend', (e) => {
    if (!touch.on) return;
    const dy = touch.y - e.changedTouches[0].clientY;
    const dx = touch.x - e.changedTouches[0].clientX;
    if (Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) step(Math.sign(dy));
  });

  // Keys.
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    const onControl = e.target.closest('button, a');
    const k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey && !onControl)) step(1);
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey && !onControl)) step(-1);
    else if (k === 'ArrowRight') goTo(sceneOfBeat() + 1);
    else if (k === 'ArrowLeft') goTo(sceneOfBeat() - 1);
    else if (k === 'Home') goTo(0);
    else if (k === 'End') goTo(scenes.length - 1);
    else return;
    e.preventDefault();
  });

  // ── Shots ───────────────────────────────────────────────────────────
  let active = -1;
  let remeasure = 0;
  // Hero reveal: the HUD draws in and the hero's lines rise once the Rotor has started its dolly.
  const reveal = { t0: performance.now(), lead: 1300, dur: 2600 };
  const revealT = () => clamp01((performance.now() - reveal.t0 - reveal.lead) / reveal.dur);
  document.documentElement.classList.add('is-revealing');
  setTimeout(() => document.documentElement.classList.replace('is-revealing', 'is-revealed'), reveal.lead + reveal.dur + 900);
  world?.reveal();
  const motion = { p: 0, t: performance.now(), velocity: 0, transit: 0 };

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
    window.dispatchEvent(new CustomEvent('stage:scene', { detail: scenes[i].el.id }));
    document.documentElement.dataset.tone = scenes[i].still ? 'paper' : 'dark';
    document.documentElement.dataset.chapter = scenes[i].el.id; // some layouts re-split the frame per chapter
    field?.refreshKeepOut();
    clearTimeout(remeasure);
    remeasure = setTimeout(() => field?.refreshKeepOut(), 1300); // after the headline deciphers
  };

  // A beat becomes current: the Rotor dials its word; once the discs lock, the caption reads
  // itself off them — headline deciphers, prose rises, terminals type. Beats without a readout
  // (hero, the paper statements) reveal at once.
  let unwait = null;
  const read = (el) => {
    el.classList.add('is-read');
    el.querySelectorAll('[data-scramble]').forEach((t, n) =>
      scrambleIn(t, { delay: 120 + n * 120, duration: t.matches('h1 *') ? 1900 : 900 }),
    );
    el.querySelectorAll('[data-type]').forEach((t) => typeOut(t));
  };
  const showBeat = (s, k) => {
    if (s.current === k) return;
    s.current = k;
    s.beatEls.forEach((el, j) => {
      el.classList.toggle('is-current', j === k);
      if (j !== k) el.classList.remove('is-read');
    });
    const el = s.beatEls[k];
    if (!el) return;
    unwait?.();
    if (el.classList.contains('is-gated')) {
      const word = el.dataset.word;
      const done = () => {
        unwait?.();
        if (s.current === k) read(el);
      };
      const onLock = (e) => (word.startsWith('~') || e.detail === word) && done();
      const timer = setTimeout(done, 4200); // never strand a caption if the drum is busy
      window.addEventListener('rotor:locked', onLock);
      unwait = () => {
        clearTimeout(timer);
        window.removeEventListener('rotor:locked', onLock);
        unwait = null;
      };
    } else {
      read(el);
    }
    // What the visual responds to on this beat, spelled out under it.
    if (hint) {
      hint.classList.toggle('is-on', !!el.dataset.hint);
      if (el.dataset.hint) {
        hint.textContent = el.dataset.hint;
        scrambleIn(hint, { delay: 900, duration: 700 });
      }
    }
    window.dispatchEvent(new CustomEvent('stage:beat', { detail: { scene: s.el.id, beat: k } }));
  };

  const render = () => {
    const p = playhead.p;
    let best = 0;
    let bestVis = -1;
    scenes.forEach((s, i) => {
      let vis = clamp01(Math.min((p - s.start) / ENTER, (s.end - p) / ENTER));
      if (i === 0) vis = Math.min(vis, revealT());
      if (vis === 0 && s.hidden) {
        s.local = 0;
        return; // already hidden: no style writes for shots that aren't on screen
      }
      s.hidden = vis === 0;
      if (vis > bestVis) {
        bestVis = vis;
        best = i;
      }
      const entering = p < (s.start + s.end) / 2;
      const e = ease(vis);
      s.el.style.opacity = vis > 0 ? e : 0;
      s.el.style.visibility = vis > 0 ? 'visible' : 'hidden';
      s.el.style.setProperty('--shift', `${(1 - e) * (entering ? 3 : -3)}vh`);
      if (s.still) s.el.style.setProperty('--paper', e);
      const [r0, r1] = rest(s);
      s.local = r1 > r0 ? clamp01((p - r0) / (r1 - r0)) : 0;
      // The caption on screen: the nearest beat while resting, none mid-flight between chapters.
      if (vis > 0.6) showBeat(s, Math.round(s.local * Math.max(0, s.beatEls.length - 1)));
      else if (vis === 0) showBeat(s, -1);
    });
    setActive(best);


    // The world's camera: whole numbers at rest on a shot, fractions while travelling between.
    let chapter = scenes.length - 1;
    let local = scenes[chapter].local;
    for (let i = 0; i < scenes.length; i++) {
      const [a, b] = rest(scenes[i]);
      if (p > b && i < scenes.length - 1) continue;
      if (p >= a || i === 0) {
        chapter = i;
        local = scenes[i].local;
      } else {
        const prevEnd = rest(scenes[i - 1])[1];
        chapter = i - 1 + clamp01((p - prevEnd) / (a - prevEnd));
        local = scenes[i - 1].local;
      }
      break;
    }
    motion.transit = Math.sin(Math.PI * (chapter % 1));
    motion.beats = scenes.map((s) => s.beatEls.length);
    world?.setChapter(chapter, local, motion);

    bar.style.transform = `scaleX(${clamp01(p / pMax)})`;
    const scope = scenes.find((s) => s.still);
    const scopeVis = scope ? clamp01(Math.min((p - scope.start) / ENTER, (scope.end - p) / ENTER)) : 0;
    field?.setTravel(p * vh() * TRAVEL, {
      still: scenes[best].still,
      covered: scopeVis >= 1,
      glitch: Math.min(1, motion.transit * 0.55 + Math.abs(motion.velocity) * 0.12),
    });
  };

  const raf = (time) => {
    if (playhead.moving) {
      const t = clamp01((time - playhead.t0) / playhead.dur);
      playhead.p = playhead.from + (playhead.to - playhead.from) * inOut(t);
      if (t >= 1) {
        playhead.moving = false;
        field?.refreshKeepOut();
        window.dispatchEvent(new CustomEvent('stage:moved'));
      }
    }
    // Playhead velocity (viewports/s), smoothed — drives the glitch and the drum's roll.
    const dt = Math.max(1, time - motion.t) / 1000;
    motion.velocity += ((playhead.p - motion.p) / dt - motion.velocity) * 0.15;
    motion.p = playhead.p;
    motion.t = time;
    const revealing = revealT() < 1 || !motion.revealed;
    if (revealT() >= 1) motion.revealed = true;
    if (revealing || playhead.moving || Math.abs(motion.velocity) > 0.01) render();
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  window.addEventListener('resize', retime);

  // Deep links (#method) open on that chapter.
  const fromHash = scenes.findIndex((s) => `#${s.el.id}` === window.location.hash);
  const jump = (index) => {
    beat = Math.max(0, Math.min(beats.length - 1, index));
    playhead.moving = false;
    playhead.p = beats[beat].p;
    render();
    window.dispatchEvent(new CustomEvent('stage:moved'));
  };
  if (fromHash > 0) jump(beats.findIndex((b) => b.scene === fromHash));
  render();
  // ?debug: deterministic jumps to a chapter or a beat.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__stage = {
      goTo,
      step,
      rest: (i) => rest(scenes[i]),
      beats: () => beats.map((b) => ({ ...b })),
      beat: (k) => jump(k),
      jump: (i) => jump(beats.findIndex((b) => b.scene === i)),
      playhead,
    };
  }
  return { goTo };
}
