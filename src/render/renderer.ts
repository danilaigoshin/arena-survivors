import type { RunState } from '../state';
import type { Camera } from '../core/camera';
import { ARENA_W, ARENA_H } from '../config';
import { drawSprite, drawShadow, bakeSprite, frameCount, walkFrames } from './sprites';
import { weaponOrbCount, type WeaponInstance } from '../entities/weapon';
import { weaponIcon } from './icons';
import { shakeOffsetX, shakeOffsetY, kickOffsetX, kickOffsetY } from './fx';
import { drawFx } from './fx';
import { drawLiveDecor } from './floor';

const CHAIN_FX_DUR = 0.14;

function traceLightningPath(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  time: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(3, Math.min(8, Math.ceil(len / 32)));
  const flicker = Math.floor(time * 90);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const envelope = Math.sin(t * Math.PI);
    const jitter = Math.sin(seed * 13.7 + i * 8.3 + flicker * 2.1) * 7 * envelope;
    ctx.lineTo(x1 + dx * t + nx * jitter, y1 + dy * t + ny * jitter);
  }
  ctx.lineTo(x2, y2);
}

function drawChainLightning(ctx: CanvasRenderingContext2D, w: WeaponInstance, time: number): void {
  if (w.chainFxTimer <= 0 || w.chainFxPointCount < 2) return;
  const evolved = w.def.id === 'thunderstaff';
  const outer = evolved ? '#6ec8e8' : '#b18cff';
  const inner = evolved ? '#ffffff' : '#efe5ff';
  const alpha = Math.min(1, w.chainFxTimer / CHAIN_FX_DUR);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = alpha * (pass === 0 ? 0.72 : 1);
    ctx.strokeStyle = pass === 0 ? outer : inner;
    ctx.lineWidth = pass === 0 ? (evolved ? 6 : 5) : 1.7;
    ctx.shadowColor = outer;
    ctx.shadowBlur = pass === 0 ? 14 : 5;
    for (let i = 1; i < w.chainFxPointCount; i++) {
      traceLightningPath(ctx, w.chainFxX[i - 1], w.chainFxY[i - 1], w.chainFxX[i], w.chainFxY[i], i + w.slotIndex * 7, time);
      ctx.stroke();
    }
  }
  ctx.fillStyle = inner;
  ctx.globalAlpha = alpha;
  for (let i = 1; i < w.chainFxPointCount; i++) {
    ctx.beginPath();
    ctx.arc(w.chainFxX[i], w.chainFxY[i], evolved ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloor(ctx: CanvasRenderingContext2D, state: RunState): void {
  const theme = state.theme;
  if (state.floorCanvas) {
    ctx.drawImage(state.floorCanvas, 0, 0);
  } else {
    ctx.fillStyle = theme.floorOuter;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }

  // arena border with themed glow (live — cheap, and glows outside the bake)
  ctx.save();
  ctx.shadowColor = `${theme.borderColor}88`;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = theme.borderColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
  ctx.restore();
}

/** Live atmosphere particles over the baked floor — deterministic from time, zero allocation. */
function drawAmbient(ctx: CanvasRenderingContext2D, state: RunState, cam: Camera, time: number): void {
  const kind = state.theme.ambient;
  const x0 = cam.x - cam.viewW / 2;
  const y0 = cam.y - cam.viewH / 2;
  const n = state.theme.ambientDensity ?? 26;
  for (let i = 0; i < n; i++) {
    const sx = ((i * 733) % 997) / 997;
    const sy = ((i * 271) % 883) / 883;
    let x: number;
    let y: number;
    let alpha: number;
    let size = 2;
    let color: string;
    if (kind === 'snow') {
      x = x0 + ((sx * cam.viewW + Math.sin(time * 0.8 + i) * 30 + time * 12) % cam.viewW);
      y = y0 + ((sy * cam.viewH + time * (28 + (i % 4) * 9)) % cam.viewH);
      alpha = 0.5;
      color = '#e8f4ff';
      size = 2 + (i % 2);
    } else if (kind === 'embers') {
      x = x0 + ((sx * cam.viewW + Math.sin(time * 1.2 + i * 2) * 22) % cam.viewW);
      y = y0 + cam.viewH - ((sy * cam.viewH + time * (24 + (i % 5) * 8)) % cam.viewH);
      alpha = 0.35 + 0.3 * Math.sin(time * 3 + i);
      color = i % 3 === 0 ? '#ffb050' : '#ff6030';
    } else if (kind === 'fireflies') {
      x = x0 + sx * cam.viewW + Math.sin(time * 0.6 + i * 1.7) * 46;
      y = y0 + sy * cam.viewH + Math.cos(time * 0.5 + i * 2.3) * 34;
      alpha = Math.max(0, 0.55 * Math.sin(time * 1.6 + i * 2.9));
      color = '#c8ff70';
    } else if (kind === 'dust') {
      x = x0 + ((sx * cam.viewW + time * (16 + (i % 4) * 6)) % cam.viewW);
      y = y0 + sy * cam.viewH + Math.sin(time + i) * 12;
      alpha = 0.22;
      color = '#c8b890';
    } else {
      // motes: slow drifting pale specks
      x = x0 + sx * cam.viewW + Math.sin(time * 0.4 + i * 1.3) * 24;
      y = y0 + ((sy * cam.viewH - time * 7 + 10000) % cam.viewH);
      alpha = 0.16 + 0.12 * Math.sin(time * 1.1 + i);
      color = '#b0b0d0';
    }
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

export function renderWorld(ctx: CanvasRenderingContext2D, state: RunState, cam: Camera, time: number, viewW: number, viewH: number): void {
  ctx.save();
  cam.applyTransform(ctx);
  ctx.translate(shakeOffsetX(time) + kickOffsetX(), shakeOffsetY(time) + kickOffsetY());

  drawFloor(ctx, state);
  drawLiveDecor(ctx, state.theme, state.wave, time, cam);
  drawAmbient(ctx, state, cam, time);

  // obstacles (under everything that moves)
  for (const ob of state.obstacles) {
    drawShadow(ctx, ob.x, ob.y + ob.radius * 0.8, ob.radius * 2);
    drawSprite(ctx, ob.sprite, ob.x, ob.y, ob.radius * 2.4);
  }

  // pickups (bobbing gems)
  for (let i = 0; i < state.pickups.count; i++) {
    const pk = state.pickups.items[i];
    const size = pk.value >= 5 ? 20 : 13;
    const bobY = Math.sin(time * 4 + pk.x * 0.05) * 2.5;
    drawSprite(ctx, 'i_gem', pk.x, pk.y + bobY, size);
  }

  // burning ground from the Brute's charges
  for (const f of state.firePatches) {
    const flicker = 0.5 + 0.3 * Math.sin(time * 12 + f.x * 0.1);
    const alpha = Math.min(1, f.ttl / 0.6);
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.shadowColor = '#ff6020';
    ctx.shadowBlur = 12;
    const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 26);
    g.addColorStop(0, `rgba(255, 200, 80, ${flicker})`);
    g.addColorStop(0.6, 'rgba(255, 96, 32, 0.55)');
    g.addColorStop(1, 'rgba(120, 30, 10, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // bomber explosion telegraphs: red circle filling up before the boom
  for (const ex of state.explosions) {
    const k = 1 - ex.t / 0.8;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ff5030';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.22 + k * 0.25;
    ctx.fillStyle = '#ff5030';
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // battlefield chests: bobbing with a golden pulse
  for (const c of state.chests) {
    const bobY = Math.sin(time * 3 + c.x * 0.01) * 2;
    drawShadow(ctx, c.x, c.y + 16, 34);
    ctx.save();
    ctx.shadowColor = '#ffd23e';
    ctx.shadowBlur = 10 + Math.sin(time * 4) * 5;
    drawSprite(ctx, 'chest', c.x, c.y + bobY, 30);
    ctx.restore();
  }

  const p = state.player;

  // shadows first (under everything that walks)
  for (let i = 0; i < state.enemies.count; i++) {
    const e = state.enemies.items[i];
    if (e.active) drawShadow(ctx, e.x, e.y + e.radius * 0.9, e.radius * 1.7);
  }
  drawShadow(ctx, p.x, p.y + p.radius * 0.95, p.radius * 1.8);

  // enemies
  for (let i = 0; i < state.enemies.count; i++) {
    const e = state.enemies.items[i];
    if (!e.active) continue;
    const size = e.radius * 2.3;
    const telegraph = (e.isBoss || e.def.ai === 'chargeDash') && e.phase === 1;
    const white = e.hitFlash > 0 || (telegraph && Math.floor(e.phaseTimer * 12) % 2 === 0);
    const squash = Math.sin(time * 9 + e.uid * 1.7) * 0.04;
    // walk cycle: alternate frames at ~8fps, offset per enemy; the telegraph pose
    // (reserved LAST frame on bosses) replaces the cycle while winding up
    const hasPose = walkFrames(e.def.id) < frameCount(e.def.id);
    const frame = telegraph && hasPose ? frameCount(e.def.id) - 1 : Math.floor(time * 8 + e.uid) % walkFrames(e.def.id);
    // spawn-in: scale from 0 with fade
    const spawnK = e.spawnT > 0 ? 1 - e.spawnT / 0.3 : 1;
    const enraged = e.isBoss && (e.def.attacks?.length ?? 0) > 1 && e.hp / e.maxHp <= 0.33;
    if (enraged) {
      ctx.save();
      ctx.shadowColor = '#ff3040';
      ctx.shadowBlur = 22;
    } else if (e.elite) {
      // gold ground ring instead of per-draw shadowBlur (cheap: one stroked arc)
      const pulse = 1 + Math.sin(time * 5 + e.uid) * 0.12;
      ctx.strokeStyle = '#ffd23e88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.9, e.radius * 1.1 * pulse, e.radius * 0.45 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawSprite(ctx, e.def.id, e.x, e.y, size, {
      white,
      squash,
      flip: p.x < e.x,
      frame,
      scale: 0.2 + spawnK * 0.8,
      alpha: e.spawnT > 0 ? spawnK : undefined,
      tint: e.elite && !enraged ? '#ffd23e' : undefined,
      tintAlpha: 0.35,
    });
    if (enraged) ctx.restore();
    if (!e.isBoss && e.hp < e.maxHp) {
      const w = e.radius * 1.8;
      const bx = e.x - w / 2;
      const by = e.y - e.radius - 11;
      const frac = e.hp / e.maxHp;
      ctx.fillStyle = '#1a1220';
      ctx.fillRect(bx - 1, by - 1, w + 2, 6);
      ctx.fillStyle = HP_COLORS[frac > 0.6 ? 0 : frac > 0.3 ? 1 : 2];
      ctx.fillRect(bx, by, w * frac, 4);
      ctx.fillStyle = '#ffffff30';
      ctx.fillRect(bx, by, w * frac, 1);
    }
  }

  drawHolsteredWeapons(ctx, state, time);

  // player (blink while invulnerable)
  const playerFlip = Math.abs(p.aimAngle) > Math.PI / 2;
  if (p.iframes <= 0 || Math.floor(p.iframes * 20) % 2 === 0) {
    const squash = p.moving ? Math.sin(time * 12) * 0.05 : Math.sin(time * 3) * 0.03;
    const frame = p.moving ? 1 + (Math.floor(time * 10) % Math.max(1, frameCount(p.character.sprite) - 1)) : 0;
    drawSprite(ctx, p.character.sprite, p.x, p.y, p.radius * 2.6, { squash, flip: playerFlip, frame });
  }

  drawSecondHand(ctx, state, time);
  drawHeldWeapon(ctx, state, time);

  // weapon visuals: chain lightning, melee swipes + orbit orbs
  for (const w of p.weapons) {
    drawChainLightning(ctx, w, time);
    if (w.def.behavior === 'melee' && w.swipeTimer > 0 && w.def.melee) {
      const t = 1 - w.swipeTimer / 0.18;
      const half = w.def.melee.arcRad / 2;
      const sweep = -half + w.def.melee.arcRad * t;
      // slash fill
      ctx.globalAlpha = 0.5 * (1 - t);
      const grad = ctx.createRadialGradient(p.x, p.y, w.def.range * 0.2, p.x, p.y, w.def.range);
      grad.addColorStop(0, '#ffffff00');
      grad.addColorStop(0.7, '#cfe3ff88');
      grad.addColorStop(1, '#8be9fdcc');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, w.def.range, w.swipeAngle - half, w.swipeAngle + sweep);
      ctx.closePath();
      ctx.fill();
      // crescent edge: bright tapering arc right at the blade tip
      ctx.save();
      ctx.shadowColor = '#8be9fd';
      ctx.shadowBlur = 12;
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = (1 - t) * (0.9 - k * 0.28);
        ctx.strokeStyle = k === 0 ? '#ffffff' : '#aee6ff';
        ctx.lineWidth = 6 - k * 1.6;
        ctx.beginPath();
        const edge = w.swipeAngle + sweep - k * 0.22;
        ctx.arc(p.x, p.y, w.def.range * (0.94 - k * 0.05), edge - 0.5, edge);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (w.def.behavior === 'orbit' && w.def.orbit) {
      const orbs = weaponOrbCount(w);
      for (let o = 0; o < orbs; o++) {
        const a = w.orbitAngle + (o / orbs) * Math.PI * 2;
        const ox = p.x + Math.cos(a) * w.def.orbit.radius;
        const oy = p.y + Math.sin(a) * w.def.orbit.radius;
        ctx.save();
        ctx.shadowColor = '#b18cff';
        ctx.shadowBlur = 12;
        drawSprite(ctx, weaponIcon(w.def.id), ox, oy, 24, { rotate: w.def.id === 'flail' ? a : undefined });
        ctx.restore();
      }
    }
  }

  // projectiles: friendly = per-weapon styled tracer, enemy = pulsing orb
  for (let i = 0; i < state.projectiles.count; i++) {
    const pr = state.projectiles.items[i];
    if (pr.friendly) {
      const st = BULLET_STYLES[pr.style] ?? BULLET_STYLES.default;
      const ang = Math.atan2(pr.vy, pr.vx);
      // trail
      ctx.strokeStyle = st.glow;
      ctx.globalAlpha = st.trailAlpha;
      ctx.lineWidth = st.w * 0.6;
      ctx.beginPath();
      ctx.moveTo(pr.x - pr.vx * st.trail, pr.y - pr.vy * st.trail);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // capsule body + a wide low-alpha halo capsule instead of shadowBlur (much cheaper)
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = st.glow;
      ctx.beginPath();
      ctx.roundRect(-st.len / 2 - 2, -st.w / 2 - 2.5, st.len + 4, st.w + 5, (st.w + 5) / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = st.body;
      ctx.beginPath();
      ctx.roundRect(-st.len / 2, -st.w / 2, st.len, st.w, st.w / 2);
      ctx.fill();
      if (st.tip) {
        ctx.fillStyle = st.tip;
        ctx.beginPath();
        ctx.roundRect(st.len / 2 - st.w, -st.w / 2, st.w, st.w, st.w / 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      const pulse = 1 + Math.sin(time * 14 + i) * 0.18;
      const img = enemyOrb(pr.style === 'frost');
      const d = pr.radius * 2.6 * pulse;
      ctx.drawImage(img, pr.x - d / 2, pr.y - d / 2, d, d);
    }
  }

  drawFx(ctx);

  ctx.restore();

  // subtle full-screen color grade (plain source-over — no comp ops)
  if (state.theme.grade) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = state.theme.grade;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
}

const HP_COLORS = ['#e64553', '#e6a045', '#ffd23e'];

// pre-baked enemy orb sprites (radial gradients are expensive per-projectile)
const orbCache: (HTMLCanvasElement | null)[] = [null, null];
function enemyOrb(frost: boolean): HTMLCanvasElement {
  const idx = frost ? 1 : 0;
  let c = orbCache[idx];
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d')!;
    const rg = g.createRadialGradient(24, 24, 2, 24, 24, 24);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.28, frost ? '#e8faff' : '#ffd8e0');
    rg.addColorStop(0.55, frost ? '#a8e4ff' : '#ff7590');
    rg.addColorStop(0.8, frost ? '#6ec8e844' : '#ff547044');
    rg.addColorStop(1, '#00000000');
    g.fillStyle = rg;
    g.fillRect(0, 0, 48, 48);
    orbCache[idx] = c;
  }
  return c;
}

interface BulletStyle {
  len: number;
  w: number;
  body: string;
  glow: string;
  blur: number;
  trail: number; // seconds of velocity for the trail tail
  trailAlpha: number;
  tip?: string;
}

const BULLET_STYLES: Record<string, BulletStyle> = {
  default: { len: 14, w: 4.8, body: '#ffe9a0', glow: '#ffd23e', blur: 7, trail: 0.035, trailAlpha: 0.3 },
  // пистолет: увесистая золотая пуля
  pistol: { len: 15, w: 5.4, body: '#ffe9a0', glow: '#ffd23e', blur: 8, trail: 0.03, trailAlpha: 0.35 },
  // ПП: короткие бело-голубые трассеры
  smg: { len: 9, w: 3, body: '#e8faff', glow: '#8be9fd', blur: 5, trail: 0.05, trailAlpha: 0.45 },
  // арбалет: длинный болт с светлым наконечником
  crossbow: { len: 18, w: 3.4, body: '#a87c4a', glow: '#c89c66', blur: 4, trail: 0.02, trailAlpha: 0.25, tip: '#e8e0d0' },
  // рельсотрон: длинный синий луч
  railgun: { len: 26, w: 3.6, body: '#c8ecff', glow: '#4f9cf0', blur: 12, trail: 0.06, trailAlpha: 0.5 },
  // шквал: мелкая циановая дробь
  stormgun: { len: 8, w: 3, body: '#d8fbff', glow: '#6ec8e8', blur: 6, trail: 0.045, trailAlpha: 0.4 },
  staff: { len: 10, w: 4, body: '#efe5ff', glow: '#b18cff', blur: 10, trail: 0, trailAlpha: 0 },
  thunderstaff: { len: 12, w: 4.5, body: '#ffffff', glow: '#6ec8e8', blur: 14, trail: 0, trailAlpha: 0 },
};

const HELD_SPRITES: Record<string, string> = {
  pistol: 'w_pistol',
  smg: 'w_smg',
  sword: 'w_sword',
  crossbow: 'w_crossbow',
  railgun: 'w_railgun',
  stormgun: 'w_stormgun',
  stormblade: 'w_stormblade',
  staff: 'w_staff',
  thunderstaff: 'w_thunderstaff',
  deathsting: 'w_deathsting',
  annihilator: 'w_annihilator',
  hurricane: 'w_hurricane',
};

/** Player's weapons that have a held sprite, in slot order. */
function heldWeapons(p: RunState['player']): WeaponInstance[] {
  return p.weapons.filter((wi) => HELD_SPRITES[wi.def.id]);
}

/** Muzzle/cast flash in the weapon's local (translated+rotated) space. */
function drawMuzzleFlash(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, w: WeaponInstance, time: number): void {
  if (w.recoil <= 0.6 || (w.def.behavior !== 'projectile' && w.def.behavior !== 'chain')) return;
  const flash = (w.recoil - 0.6) / 0.4;
  const st = BULLET_STYLES[w.def.id] ?? BULLET_STYLES.default;
  ctx.translate(img.width * 0.78, 0);
  if (flash > 0.6) {
    const rg = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
    rg.addColorStop(0, st.glow);
    rg.addColorStop(1, '#00000000');
    ctx.globalAlpha = (flash - 0.6) * 1.4;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.rotate(time * 25);
  ctx.globalAlpha = flash;
  ctx.fillStyle = st.glow;
  const s = 6 + flash * 7;
  ctx.fillRect(-s / 2, -s / 6, s, s / 3);
  ctx.fillRect(-s / 6, -s / 2, s / 3, s);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s / 4, -s / 4, s / 2, s / 2);
  ctx.globalAlpha = 1;
}

/** 3rd and 4th held-sprite weapons ride holstered on the hips, behind the body. */
function drawHolsteredWeapons(ctx: CanvasRenderingContext2D, state: RunState, time: number): void {
  const p = state.player;
  const held = heldWeapons(p);
  for (let i = 2; i < Math.min(4, held.length); i++) {
    const side = i === 2 ? -1 : 1;
    const bob = p.moving ? Math.sin(time * 12 + i) * 1.2 : 0;
    const img = bakeSprite(HELD_SPRITES[held[i].def.id], 11, { flip: side < 0 });
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(p.x + side * 9, p.y + 6 + bob);
    ctx.rotate(side * 0.5);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

/** Second hand: fully alive — aims at ITS OWN last target, with recoil and muzzle flash. */
function drawSecondHand(ctx: CanvasRenderingContext2D, state: RunState, time: number): void {
  const p = state.player;
  const held = heldWeapons(p);
  const w = held[1];
  if (!w) return;
  const mainAngle = held[0].fireAngle || p.aimAngle;
  const angle = w.fireAngle || p.aimAngle;
  // shifted to the far side of the body, perpendicular to the main hand
  const ox = p.x - Math.sin(mainAngle) * 6;
  const oy = p.y + Math.cos(mainAngle) * 6 + 2;
  const dist = 16 - w.recoil * 6;
  const wx = ox + Math.cos(angle) * dist;
  const wy = oy + Math.sin(angle) * dist;
  const img = bakeSprite(HELD_SPRITES[w.def.id], 14);
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.translate(wx, wy);
  ctx.rotate(angle);
  if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > Math.PI / 2) ctx.scale(1, -1);
  ctx.drawImage(img, -img.width * 0.3, -img.height / 2);
  drawMuzzleFlash(ctx, img, w, time);
  ctx.restore();
}

/** Draws the player's held weapon aimed at the current target, with recoil kick and muzzle flash. */
function drawHeldWeapon(ctx: CanvasRenderingContext2D, state: RunState, time: number): void {
  const p = state.player;
  const w = heldWeapons(p)[0];
  if (!w) return;
  const sprite = HELD_SPRITES[w.def.id];

  let angle = w.fireAngle || p.aimAngle;
  const swiping = w.def.behavior === 'melee' && w.def.melee && w.swipeTimer > 0;
  if (swiping) {
    const t = 1 - w.swipeTimer / 0.18;
    angle = w.swipeAngle - w.def.melee!.arcRad / 2 + w.def.melee!.arcRad * t;
    // motion-blur ghosts trailing the blade
    const ghostImg = bakeSprite(sprite, 16);
    for (let g = 1; g <= 2; g++) {
      const ga = angle - g * 0.38;
      const gx = p.x + Math.cos(ga) * 19;
      const gy = p.y + Math.sin(ga) * 19 + 3;
      ctx.save();
      ctx.globalAlpha = 0.3 - g * 0.1;
      ctx.translate(gx, gy);
      ctx.rotate(ga);
      if (Math.abs(ga) > Math.PI / 2) ctx.scale(1, -1);
      ctx.drawImage(ghostImg, -ghostImg.width * 0.3, -ghostImg.height / 2);
      ctx.restore();
    }
  }

  const dist = 19 - w.recoil * 7;
  const wx = p.x + Math.cos(angle) * dist;
  const wy = p.y + Math.sin(angle) * dist + 3;
  const img = bakeSprite(sprite, 16);

  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(angle);
  if (Math.abs(angle) > Math.PI / 2) ctx.scale(1, -1);
  ctx.drawImage(img, -img.width * 0.3, -img.height / 2);

  // muzzle flash right after firing, tinted by the weapon's tracer color
  drawMuzzleFlash(ctx, img, w, time);
  ctx.restore();
}
