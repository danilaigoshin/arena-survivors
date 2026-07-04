export class Pickup {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  value = 1;
  magnet = false;

  init(x: number, y: number, value: number): void {
    this.x = x;
    this.y = y;
    // small scatter impulse
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 80;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.value = value;
    this.magnet = false;
  }
}
