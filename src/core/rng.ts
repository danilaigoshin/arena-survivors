let state = 0;

export function seed(s: number): void {
  state = s >>> 0;
}

/** mulberry32 */
export function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(min: number, max: number): number {
  return min + rand() * (max - min);
}

export function irange(min: number, max: number): number {
  return Math.floor(range(min, max + 1));
}

export function chance(p: number): boolean {
  return rand() < p;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function pickWeighted<T extends { weight: number }>(arr: readonly T[]): T {
  let total = 0;
  for (const e of arr) total += e.weight;
  let r = rand() * total;
  for (const e of arr) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return arr[arr.length - 1];
}

seed(Date.now() >>> 0);
