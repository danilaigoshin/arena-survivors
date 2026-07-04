import { ARENA_W, ARENA_H, WORLD_ZOOM } from '../config';
import { clamp } from '../utils/math';

export class Camera {
  x = ARENA_W / 2;
  y = ARENA_H / 2;
  /** viewport size in WORLD units (canvas pixels / zoom) */
  viewW = 0;
  viewH = 0;

  resize(w: number, h: number): void {
    this.viewW = w / WORLD_ZOOM;
    this.viewH = h / WORLD_ZOOM;
  }

  follow(tx: number, ty: number): void {
    // If the arena is smaller than the viewport on an axis, center it.
    this.x = this.viewW >= ARENA_W ? ARENA_W / 2 : clamp(tx, this.viewW / 2, ARENA_W - this.viewW / 2);
    this.y = this.viewH >= ARENA_H ? ARENA_H / 2 : clamp(ty, this.viewH / 2, ARENA_H - this.viewH / 2);
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.scale(WORLD_ZOOM, WORLD_ZOOM);
    ctx.translate(Math.round(this.viewW / 2 - this.x), Math.round(this.viewH / 2 - this.y));
  }

  screenToWorldX(sx: number): number {
    return sx / WORLD_ZOOM - (this.viewW / 2 - this.x);
  }

  screenToWorldY(sy: number): number {
    return sy / WORLD_ZOOM - (this.viewH / 2 - this.y);
  }
}
