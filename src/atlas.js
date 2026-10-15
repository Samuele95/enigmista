// Glyph atlas shared by the sampling field and the Rotor: every CHARSET glyph rendered once
// from the self-hosted Martian Mono into a canvas texture. Cell width follows the font's
// measured advance so strings keep real tracking.
import { CanvasTexture, LinearFilter, Vector2 } from 'three';
import { CHARSET } from './glyphs.js';

const ATLAS = { cols: 16, cellH: 72, font: '400 44px "Martian Mono"' };

export async function buildAtlas() {
  await document.fonts.load(ATLAS.font);
  const rows = Math.ceil(CHARSET.length / ATLAS.cols);
  const canvas = document.createElement('canvas');
  canvas.height = rows * ATLAS.cellH;
  const ctx = canvas.getContext('2d');
  ctx.font = ATLAS.font;
  const cellW = Math.ceil(ctx.measureText('M').width * 1.08);
  canvas.width = ATLAS.cols * cellW;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = ATLAS.font; // resizing the canvas reset the context state
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...CHARSET].forEach((ch, i) => {
    const x = (i % ATLAS.cols) * cellW + cellW / 2;
    const y = Math.floor(i / ATLAS.cols) * ATLAS.cellH + ATLAS.cellH / 2;
    ctx.fillText(ch, x, y);
  });
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, grid: new Vector2(ATLAS.cols, rows), aspect: cellW / ATLAS.cellH };
}
