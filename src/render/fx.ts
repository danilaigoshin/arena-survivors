import { Pool } from '../core/pool';
import { POOL_DMG_NUMBERS, POOL_PARTICLES } from '../config';
import { drawSprite, SPRITES } from './sprites';
import { displayFont } from './font';
import { emitPresentationEvent } from '../multiplayer/presentationBus';

class DamageNumber {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  value = 0;
  life = 0;
  maxLife = 0.6;
  crit = false;
  heal = false;
}

class Particle {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 0;
  color = '#fff';
  size = 3;
  gravity = 0;
  /** draw as a streak along velocity instead of a square */
  stretch = false;
}

class DeathPop {
  active = false;
  sprite = '';
  x = 0;
  y = 0;
  size = 30;
  flip = false;
  t = 0;
}

class Ring {
  active = false;
  x = 0;
  y = 0;
  t = 0;
  color = '#8dff9a';
}

const dmgNumbers = new Pool(POOL_DMG_NUMBERS, () => new DamageNumber());
const particles = new Pool(POOL_PARTICLES, () => new Particle());
const deathPops = new Pool(64, () => new DeathPop());
const rings = new Pool(8, () => new Ring());

const DEATH_POP_DUR = 0.18;
const RING_DUR = 0.45;

// camera shake, consumed by the renderer
let shakePower = 0;

export function addShake(power: number): void {
  shakePower = Math.min(14, Math.max(shakePower, power));
}

// directional camera kick (crits, boss deaths) — decays fast, adds to shake
let kickX = 0;
let kickY = 0;

export function addKick(dx: number, dy: number): void {
  kickX += dx;
  kickY += dy;
  const len = Math.hypot(kickX, kickY);
  if (len > 14) {
    kickX = (kickX / len) * 14;
    kickY = (kickY / len) * 14;
  }
}

export function kickOffsetX(): number {
  return kickX;
}

export function kickOffsetY(): number {
  return kickY;
}

export function shakeOffsetX(time: number): number {
  return Math.sin(time * 71.3) * shakePower;
}

export function shakeOffsetY(time: number): number {
  return Math.cos(time * 63.7) * shakePower;
}

/** Red vignette strength when the player takes a hit. */
export let screenFlash = 0;

export function spawnDamageNumber(x: number, y: number, value: number, crit = false, heal = false): void {
  const d = dmgNumbers.alloc();
  if (!d) return;
  d.x = x + (Math.random() - 0.5) * 14;
  d.y = y - 10;
  d.vx = (Math.random() - 0.5) * 60;
  d.vy = crit ? -120 : -90;
  d.value = value;
  d.maxLife = d.life = crit ? 0.75 : 0.6;
  d.crit = crit;
  d.heal = heal;
}

export function spawnBurst(x: number, y: number, color: string, count: number): void {
  emitPresentationEvent({ type: 'fx', effect: 'burst', x, y, color, count });
  for (let i = 0; i < count; i++) {
    const p = particles.alloc();
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 160;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.maxLife = p.life = 0.25 + Math.random() * 0.3;
    p.color = color;
    p.size = 2 + Math.random() * 3;
    p.gravity = 0;
    p.stretch = false;
  }
}

// gib colors per sprite, sampled lazily from the sprite's own palette (outline excluded)
const gibColors = new Map<string, string[]>();

function paletteColors(spriteId: string): string[] {
  let colors = gibColors.get(spriteId);
  if (!colors) {
    const pal = SPRITES[spriteId]?.palette ?? {};
    colors = Object.values(pal).filter((c) => c !== '#1a1220');
    if (colors.length === 0) colors = ['#c04040'];
    gibColors.set(spriteId, colors);
  }
  return colors;
}

/** Chunks of the dying enemy: palette-colored, gravity, spray away from the killing blow. */
export function spawnGibs(x: number, y: number, spriteId: string, count: number, dirAngle?: number): void {
  const colors = paletteColors(spriteId);
  for (let i = 0; i < count; i++) {
    const p = particles.alloc();
    if (!p) return;
    const a = dirAngle !== undefined ? dirAngle + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 180;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s - 60;
    p.maxLife = p.life = 0.4 + Math.random() * 0.3;
    p.color = colors[(Math.random() * colors.length) | 0];
    p.size = 2 + Math.random() * 3.5;
    p.gravity = 500;
    p.stretch = false;
  }
}

/** Impact sparks along the hit direction. */
export function spawnSparks(x: number, y: number, dirAngle: number, color: string, count: number): void {
  emitPresentationEvent({ type: 'fx', effect: 'sparks', x, y, color, count, angle: dirAngle });
  for (let i = 0; i < count; i++) {
    const p = particles.alloc();
    if (!p) return;
    const a = dirAngle + (Math.random() - 0.5) * 0.9;
    const s = 140 + Math.random() * 220;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.maxLife = p.life = 0.12 + Math.random() * 0.14;
    p.color = color;
    p.size = 2;
    p.gravity = 0;
    p.stretch = true;
  }
}

export function flashScreen(): void {
  screenFlash = 0.35;
}

export function spawnDeathPop(sprite: string, x: number, y: number, size: number, flip: boolean): void {
  const d = deathPops.alloc();
  if (!d) return;
  d.sprite = sprite;
  d.x = x;
  d.y = y;
  d.size = size;
  d.flip = flip;
  d.t = 0;
}

export function spawnRing(x: number, y: number, color: string): void {
  emitPresentationEvent({ type: 'fx', effect: 'ring', x, y, color });
  const r = rings.alloc();
  if (!r) return;
  r.x = x;
  r.y = y;
  r.t = 0;
  r.color = color;
}

/** Permanently stamps a goo splat into the baked floor — battle scars for free. */
export function stampGoo(floor: HTMLCanvasElement | null, x: number, y: number, color: string): void {
  if (!floor) return;
  const ctx = floor.getContext('2d')!;
  const r = 12 + Math.random() * 10;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, '#00000000');
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // a few droplets
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + (Math.random() - 0.5) * r * 2.4, y + (Math.random() - 0.5) * r * 1.6, 1.5 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function updateFx(dt: number): void {
  screenFlash = Math.max(0, screenFlash - dt * 1.6);
  shakePower = Math.max(0, shakePower - dt * 34);
  const kickDecay = Math.max(0, 1 - dt * 12);
  kickX *= kickDecay;
  kickY *= kickDecay;
  for (let i = deathPops.count - 1; i >= 0; i--) {
    const d = deathPops.items[i];
    d.t += dt;
    if (d.t >= DEATH_POP_DUR) deathPops.free(i);
  }
  for (let i = rings.count - 1; i >= 0; i--) {
    const r = rings.items[i];
    r.t += dt;
    if (r.t >= RING_DUR) rings.free(i);
  }
  for (let i = dmgNumbers.count - 1; i >= 0; i--) {
    const d = dmgNumbers.items[i];
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 240 * dt; // rises, then settles
    d.vx *= 0.95;
    if (d.life <= 0) dmgNumbers.free(i);
  }
  for (let i = particles.count - 1; i >= 0; i--) {
    const p = particles.items[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity > 0) {
      p.vy += p.gravity * dt;
    } else {
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    if (p.life <= 0) particles.free(i);
  }
}

export function clearFx(): void {
  dmgNumbers.clear();
  particles.clear();
  deathPops.clear();
  rings.clear();
  screenFlash = 0;
  shakePower = 0;
}

/** World-space pass. */
export function drawFx(ctx: CanvasRenderingContext2D): void {
  // death pops: quick inflate then collapse
  for (let i = 0; i < deathPops.count; i++) {
    const d = deathPops.items[i];
    const k = d.t / DEATH_POP_DUR;
    const scale = k < 0.35 ? 1 + k * 1.1 : Math.max(0, 1.38 * (1 - (k - 0.35) / 0.65));
    drawSprite(ctx, d.sprite, d.x, d.y, d.size, { white: true, flip: d.flip, scale, alpha: 1 - k * 0.6 });
  }

  // expanding rings (level-up etc.)
  for (let i = 0; i < rings.count; i++) {
    const r = rings.items[i];
    const k = r.t / RING_DUR;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 14 + k * 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    if (p.stretch) {
      // streak along velocity (sparks)
      const k = 0.03;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * k, p.y - p.vy * k);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.stroke();
    } else {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  drawDamageNumbers(ctx);
}

/** Pixel-font numbers with dark outline and a spawn pop; batched by style to limit font churn. */
function drawDamageNumbers(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a1220';
  ctx.lineWidth = 3;
  for (let pass = 0; pass < 2; pass++) {
    const wantCrit = pass === 1;
    let fontSize = -1;
    for (let i = 0; i < dmgNumbers.count; i++) {
      const d = dmgNumbers.items[i];
      if (d.crit !== wantCrit) continue;
      const age = d.maxLife - d.life;
      const pop = 1 + 0.5 * Math.max(0, 1 - age / 0.12);
      const base = d.crit ? 13 : 8;
      const size = Math.round(base * pop);
      if (size !== fontSize) {
        fontSize = size;
        ctx.font = displayFont(size);
      }
      ctx.globalAlpha = Math.min(1, d.life / 0.3);
      const text = String(d.value);
      ctx.strokeText(text, d.x, d.y);
      ctx.fillStyle = age < 0.06 ? '#ffffff' : d.heal ? '#6dff8a' : d.crit ? '#ffd23e' : '#ffffff';
      ctx.fillText(text, d.x, d.y);
    }
  }
  ctx.globalAlpha = 1;
}
