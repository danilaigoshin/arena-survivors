import type { PlayerSlot } from '../multiplayer/types';

let nextPickupUid = 1;

export class Pickup {
  active = false;
  uid = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  value = 1;
  magnet = false;
  targetPlayerSlot: PlayerSlot | null = null;

  init(x: number, y: number, value: number): void {
    this.uid = nextPickupUid++;
    this.x = x;
    this.y = y;
    // small scatter impulse
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 80;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.value = value;
    this.magnet = false;
    this.targetPlayerSlot = null;
  }
}
