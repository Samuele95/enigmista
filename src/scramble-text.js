// Decipher-in for headings and labels: each character cycles within its own class
// (letters stay letters, digits stay digits) and locks left→right. Never used on body prose.
// Screen readers get the final text via aria-label; the animated glyphs are aria-hidden.
// Safe to call again on the same element (e.g. each time a scene re-enters).
import { classOf, randomOf } from './glyphs.js';

const running = new WeakMap();

export function scrambleIn(el, { duration = 700, delay = 0, reducedMotion = false } = {}) {
  if (reducedMotion) return;
  let span = el.querySelector(':scope > [data-scramble-glyphs]');
  if (!span) {
    const text = el.textContent;
    if (!text.trim()) return;
    el.dataset.text = text;
    el.setAttribute('aria-label', text);
    span = document.createElement('span');
    span.dataset.scrambleGlyphs = '';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = text; // correct layout even before the first animation frame
    el.replaceChildren(span);
  } else if (el.textContent !== el.dataset.text && !running.has(el)) {
    // Text was replaced (e.g. the HUD chapter label): adopt it as the new target.
    el.dataset.text = el.textContent;
    el.setAttribute('aria-label', el.dataset.text);
  }
  const chars = [...el.dataset.text];

  cancelAnimationFrame(running.get(el));
  const start = performance.now() + delay;
  const frame = (now) => {
    const progress = Math.min(1, Math.max(0, (now - start) / duration));
    const locked = Math.floor(progress * chars.length);
    span.textContent = chars
      .map((ch, i) => {
        const cls = classOf(ch);
        return i < locked || !cls ? ch : randomOf(cls);
      })
      .join('');
    if (progress < 1) running.set(el, requestAnimationFrame(frame));
    else running.delete(el);
  };
  running.set(el, requestAnimationFrame(frame));
}
