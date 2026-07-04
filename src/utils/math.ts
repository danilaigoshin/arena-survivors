export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Normalizes (dx,dy) into out.x/out.y; leaves (0,0) as-is. Returns length. */
export function norm(dx: number, dy: number, out: { x: number; y: number }): number {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 1e-6) {
    out.x = dx / len;
    out.y = dy / len;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return len;
}
