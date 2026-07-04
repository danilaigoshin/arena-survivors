import { ARENA_W, ARENA_H, GRID_CELL } from '../config';
import { clamp } from '../utils/math';

// Entities can wander slightly outside the arena (spawn ring), pad the grid.
const PAD = 512;
const COLS = Math.ceil((ARENA_W + PAD * 2) / GRID_CELL);
const ROWS = Math.ceil((ARENA_H + PAD * 2) / GRID_CELL);

/**
 * Uniform grid over enemy indices, rebuilt every sim step.
 * Two-pass counting sort into flat arrays — zero allocation after construction.
 */
export class SpatialGrid {
  private cellCount = new Int32Array(COLS * ROWS);
  private cellStart = new Int32Array(COLS * ROWS + 1);
  private entries: Int32Array;
  private xs: Float32Array;
  private ys: Float32Array;
  private n = 0;

  constructor(capacity: number) {
    this.entries = new Int32Array(capacity);
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
  }

  private cellOf(x: number, y: number): number {
    const cx = clamp(Math.floor((x + PAD) / GRID_CELL), 0, COLS - 1);
    const cy = clamp(Math.floor((y + PAD) / GRID_CELL), 0, ROWS - 1);
    return cy * COLS + cx;
  }

  /** positions[i] = {x,y} for indices 0..count. */
  rebuild(count: number, getX: (i: number) => number, getY: (i: number) => number): void {
    this.n = Math.min(count, this.entries.length);
    this.cellCount.fill(0);
    for (let i = 0; i < this.n; i++) {
      this.xs[i] = getX(i);
      this.ys[i] = getY(i);
      this.cellCount[this.cellOf(this.xs[i], this.ys[i])]++;
    }
    let acc = 0;
    for (let c = 0; c < COLS * ROWS; c++) {
      this.cellStart[c] = acc;
      acc += this.cellCount[c];
    }
    this.cellStart[COLS * ROWS] = acc;
    // second pass: place indices (cellCount reused as write cursor)
    this.cellCount.fill(0);
    for (let i = 0; i < this.n; i++) {
      const c = this.cellOf(this.xs[i], this.ys[i]);
      this.entries[this.cellStart[c] + this.cellCount[c]++] = i;
    }
  }

  /** Calls cb(index) for every entity in cells overlapping the circle's AABB. */
  queryCircle(x: number, y: number, r: number, cb: (index: number) => void): void {
    const cx0 = clamp(Math.floor((x - r + PAD) / GRID_CELL), 0, COLS - 1);
    const cx1 = clamp(Math.floor((x + r + PAD) / GRID_CELL), 0, COLS - 1);
    const cy0 = clamp(Math.floor((y - r + PAD) / GRID_CELL), 0, ROWS - 1);
    const cy1 = clamp(Math.floor((y + r + PAD) / GRID_CELL), 0, ROWS - 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * COLS + cx;
        const end = this.cellStart[c + 1];
        for (let k = this.cellStart[c]; k < end; k++) cb(this.entries[k]);
      }
    }
  }

  /**
   * Nearest entity to (x,y) within maxDist, or -1.
   * Expanding ring search over cells with early-out.
   */
  nearest(x: number, y: number, maxDist: number): number {
    let best = -1;
    let bestD2 = maxDist * maxDist;
    const pcx = clamp(Math.floor((x + PAD) / GRID_CELL), 0, COLS - 1);
    const pcy = clamp(Math.floor((y + PAD) / GRID_CELL), 0, ROWS - 1);
    const maxRing = Math.ceil(maxDist / GRID_CELL) + 1;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Once we have a hit, finish one extra ring then stop (neighbors may be closer).
      if (best !== -1 && ring * GRID_CELL > Math.sqrt(bestD2) + GRID_CELL) break;
      const cx0 = Math.max(0, pcx - ring);
      const cx1 = Math.min(COLS - 1, pcx + ring);
      const cy0 = Math.max(0, pcy - ring);
      const cy1 = Math.min(ROWS - 1, pcy + ring);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          // ring perimeter only
          if (ring > 0 && cx !== cx0 && cx !== cx1 && cy !== cy0 && cy !== cy1) continue;
          const c = cy * COLS + cx;
          const end = this.cellStart[c + 1];
          for (let k = this.cellStart[c]; k < end; k++) {
            const i = this.entries[k];
            const dx = this.xs[i] - x;
            const dy = this.ys[i] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = i;
            }
          }
        }
      }
    }
    return best;
  }
}
