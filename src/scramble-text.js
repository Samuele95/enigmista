// Decipher-in for headings and labels: each character cycles within its own class
// (letters stay letters, digits stay digits) and locks left→right. Never used on body prose.
// Screen readers get the real text from a visually-hidden span (valid on any element, unlike
// aria-label on a <p>); the animated glyphs are aria-hidden, drawn over an invisible layout copy.
// Safe to call again on the same element.
import { classOf, randomOf } from './glyphs.js';

const running = new WeakMap();

export function scrambleIn(el, { duration = 700, delay = 0, reducedMotion = false } = {}) {
  if (reducedMotion) return;
  let span = el.querySelector(':scope > [data-scramble-glyphs]');
  if (!span) {
    // First run, or the text was replaced (e.g. the HUD chapter label): adopt it as the target.
    const text = el.textContent;
    if (!text.trim()) return;
    el.dataset.text = text;
    const real = document.createElement('span');
    real.className = 'sr-only';
    real.textContent = text;
    // Layout comes from an invisible copy of the real text; the glyphs draw on an overlay, so a
    // wide random glyph ("W" for "i") can never reflow the line or resize the box mid-decipher.
    const layout = document.createElement('span');
    layout.className = 'scramble-layout';
    layout.setAttribute('aria-hidden', 'true');
    layout.textContent = text;
    span = document.createElement('span');
    span.dataset.scrambleGlyphs = '';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = text;
    el.dataset.scrambleHost = '';
    el.replaceChildren(real, layout, span);
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
