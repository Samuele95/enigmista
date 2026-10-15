// Decipher-in for headings and labels: each character cycles within its own class
// (letters stay letters, digits stay digits) and locks left→right. Never used on body prose.
// Screen readers get the final text via aria-label; the animated glyphs are aria-hidden.
import { classOf, randomOf } from './glyphs.js';

export function scrambleIn(el, { duration = 700, delay = 0, reducedMotion = false } = {}) {
  const text = el.textContent;
  if (reducedMotion || !text.trim()) return;

  el.setAttribute('aria-label', text);
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.textContent = text;
  el.replaceChildren(span);

  const chars = [...text];
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
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
