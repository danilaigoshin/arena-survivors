import type { PlayerSlot } from '../multiplayer/types';

let nextAreaUid = 1;

export class AreaEffect {
  active = false;
  uid = 0;
  kind: 'zone' | 'shockwave' = 'zone';
  style = '';
  weaponSlot = 0;
  ownerPlayerSlot: PlayerSlot | null = null;
  x = 0;
  y = 0;
  delay = 0;
  ttl = 0;
  duration = 0;
  radius = 0;
  impactRadius = 0;
  prevRadius = 0;
  maxRadius = 0;
  speed = 0;
  tickRate = 0;
  tickTimer = 0;
  damage = 0;
  impactDamage = 0;
  pull = 0;
  burnDps = 0;
  burnDuration = 0;
  slowPct = 0;
  slowDuration = 0;
  freezeDuration = 0;
  impacted = false;

  initZone(
    style: string,
    weaponSlot: number,
    x: number,
    y: number,
    delay: number,
    duration: number,
    radius: number,
    impactRadius: number,
    tickRate: number,
    damage: number,
    impactDamage: number,
    pull: number,
    ownerPlayerSlot: PlayerSlot | null = null,
  ): void {
    this.active = true;
    this.uid = nextAreaUid++;
    this.kind = 'zone';
    this.style = style;
    this.weaponSlot = weaponSlot;
    this.ownerPlayerSlot = ownerPlayerSlot;
    this.x = x;
    this.y = y;
    this.delay = delay;
    this.ttl = duration;
    this.duration = duration;
    this.radius = radius;
    this.impactRadius = impactRadius;
    this.prevRadius = 0;
    this.maxRadius = 0;
    this.speed = 0;
    this.tickRate = tickRate;
    this.tickTimer = 0;
    this.damage = damage;
    this.impactDamage = impactDamage;
    this.pull = pull;
    this.burnDps = 0;
    this.burnDuration = 0;
    this.slowPct = 0;
    this.slowDuration = 0;
    this.freezeDuration = 0;
    this.impacted = false;
  }

  initShockwave(
    style: string,
    x: number,
    y: number,
    startRadius: number,
    maxRadius: number,
    speed: number,
    damage: number,
    ownerPlayerSlot: PlayerSlot | null = null,
  ): void {
    this.active = true;
    this.uid = nextAreaUid++;
    this.kind = 'shockwave';
    this.style = style;
    this.weaponSlot = 0;
    this.ownerPlayerSlot = ownerPlayerSlot;
    this.x = x;
    this.y = y;
    this.delay = 0;
    this.ttl = (maxRadius - startRadius) / speed + 0.1;
    this.duration = this.ttl;
    this.radius = startRadius;
    this.impactRadius = 0;
    this.prevRadius = startRadius;
    this.maxRadius = maxRadius;
    this.speed = speed;
    this.tickRate = 0;
    this.tickTimer = 0;
    this.damage = damage;
    this.impactDamage = 0;
    this.pull = 0;
    this.burnDps = 0;
    this.burnDuration = 0;
    this.slowPct = 0;
    this.slowDuration = 0;
    this.freezeDuration = 0;
    this.impacted = true;
  }
}
