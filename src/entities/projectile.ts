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
  /** 0 normal, 1 cluster child, 2 phantom blade, 3 ricochet branch. */
  variant = 0;
  originX = 0;
  originY = 0;
  returning = false;
  remainingBounces = 0;
  trailTimer = 0;
  hitCount = 0;
  readonly hitUids = new Int32Array(12);

  init(x: number, y: number, vx: number, vy: number, damage: number, pierce: number, ttl: number, friendly: boolean, crit: boolean, style = '', variant = 0): void {
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
    this.variant = variant;
    this.originX = x;
    this.originY = y;
    this.returning = false;
    this.remainingBounces = 0;
    this.trailTimer = 0;
    this.hitCount = 0;
    this.radius = friendly ? 5 : 7;
  }
}
