/**
 * Fonts. Press Start 2P (OFL) is bundled locally (latin + cyrillic subsets, ~7 KB)
 * and used ONLY for headings and numerals — body text and CJK stay on system-ui.
 * The game starts without waiting: the canvas redraws every frame, so the pixel
 * font swaps in as soon as FontFace loading resolves.
 */
const latinUrl = new URL('../assets/press-start-2p-latin.woff2', import.meta.url).href;
const cyrillicUrl = new URL('../assets/press-start-2p-cyrillic.woff2', import.meta.url).href;

export const DISPLAY = '"Press Start 2P", system-ui, sans-serif';
export const UI = 'system-ui, sans-serif';

/** Heading/numeral font. PS2P has a single weight — no bold. */
export function displayFont(px: number): string {
  return `${px}px ${DISPLAY}`;
}

export function uiFont(px: number, weight = ''): string {
  return `${weight ? `${weight} ` : ''}${px}px ${UI}`;
}

export function loadFonts(): void {
  if (typeof FontFace === 'undefined') return;
  const subsets: [string, string][] = [
    [latinUrl, 'U+0000-00FF, U+0131, U+0152-0153, U+2013-2014, U+2018-201A, U+201C-201E, U+2022, U+2026, U+2039-203A, U+2212'],
    [cyrillicUrl, 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'],
  ];
  for (const [url, unicodeRange] of subsets) {
    const face = new FontFace('Press Start 2P', `url(${url}) format('woff2')`, { unicodeRange });
    face
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => {}); // fall back to system-ui silently
  }
}
