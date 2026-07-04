const cache = new Map<string, HTMLCanvasElement>();

/**
 * Pre-rendered emoji sprite. `size` is the glyph pixel size; the canvas has
 * padding for glyphs that overflow their em box. `white` renders a white
 * silhouette for hit-flash.
 */
export function glyph(emoji: string, size: number, white = false): HTMLCanvasElement {
  const key = `${emoji}|${size}|${white ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const pad = Math.ceil(size * 0.25);
  const dim = size + pad * 2;
  c = document.createElement('canvas');
  c.width = dim;
  c.height = dim;
  const ctx = c.getContext('2d')!;
  ctx.font = `${size}px system-ui, "Apple Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, dim / 2, dim / 2 + size * 0.05);
  if (white) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
  }
  cache.set(key, c);
  return c;
}

/** Draws a cached glyph centered at world (x,y). */
export function drawGlyph(ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number, white = false): void {
  const g = glyph(emoji, size, white);
  ctx.drawImage(g, x - g.width / 2, y - g.height / 2);
}
