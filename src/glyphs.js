// Shared glyph set: index 0 is blank; the rest map 1:1 onto atlas cells.
export const CLASSES = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%&*_-+=?.',
};
export const CHARSET = ' ' + CLASSES.lower + CLASSES.upper + CLASSES.digit + CLASSES.symbol;

export const glyphIndex = (ch) => Math.max(0, CHARSET.indexOf(ch));

export function classOf(ch) {
  for (const [cls, set] of Object.entries(CLASSES)) if (set.includes(ch)) return cls;
  return null;
}

export const randomOf = (cls, rng = Math.random) => {
  const set = CLASSES[cls];
  return set[Math.floor(rng() * set.length)];
};
