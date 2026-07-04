export class Projectile {
  active = false;
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  damage = 0;
  pierce = 0;
  ttl = 0;
  radius = 5;
  friendly = true;
  crit = false;
  /** weapon id for per-weapon bullet visuals ('' = default) */
  style = '';

  init(x: number, y: number, vx: number, vy: number, damage: number, pierce: number, ttl: number, friendly: boolean, crit: boolean, style = ''): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.pierce = pierce;
    this.ttl = ttl;
    this.friendly = friendly;
    this.crit = crit;
    this.style = style;
    this.radius = friendly ? 5 : 7;
  }
}
