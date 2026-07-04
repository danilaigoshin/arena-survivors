import type { RunState } from '../state';
import { UPGRADES, type UpgradeDef } from '../data/upgrades';
import { spawnDamageNumber, spawnRing, spawnBurst } from '../render/fx';
import { playSfx } from '../render/audio';
import { dist2, norm } from '../utils/math';
import { chance, pick } from '../core/rng';

const dir = { x: 0, y: 0 };

/** Magnet + collect. Materials grant XP and currency simultaneously. */
export function updatePickups(state: RunState, dt: number): void {
  const p = state.player;
  const magnetR2 = state.vacuum ? Infinity : p.stats.pickupRange * p.stats.pickupRange;
  for (let i = state.pickups.count - 1; i >= 0; i--) {
    const pk = state.pickups.items[i];
    const d2 = dist2(pk.x, pk.y, p.x, p.y);
    if (pk.magnet || d2 <= magnetR2) {
      pk.magnet = true;
      norm(p.x - pk.x, p.y - pk.y, dir);
      const speed = state.vacuum ? 900 : 500;
      pk.vx = dir.x * speed;
      pk.vy = dir.y * speed;
    } else {
      pk.vx *= Math.exp(-6 * dt);
      pk.vy *= Math.exp(-6 * dt);
    }
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;
    const collectR = p.radius + 10;
    if (d2 <= collectR * collectR) {
      p.materials += pk.value;
      gainXp(state, pk.value);
      spawnBurst(pk.x, pk.y, '#8be9fd', 3);
      playSfx('pickup');
      state.pickups.free(i);
    }
  }
}

export function gainXp(state: RunState, amount: number): void {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= p.xpToNext()) {
    p.xp -= p.xpToNext();
    p.level++;
    state.pendingLevelUps++;
    spawnRing(p.x, p.y, '#8dff9a');
    playSfx('levelup');
  }
}

/** hp per 5s → applied continuously */
export function updateRegen(state: RunState, dt: number): void {
  const p = state.player;
  if (p.stats.hpRegen <= 0 || p.hp >= p.stats.maxHp || p.hp <= 0) return;
  p.regenAcc += (p.stats.hpRegen / 5) * dt;
  if (p.regenAcc >= 1) {
    const heal = Math.floor(p.regenAcc);
    p.regenAcc -= heal;
    const applied = Math.min(heal, p.stats.maxHp - p.hp);
    if (applied > 0) {
      p.hp += applied;
      spawnDamageNumber(p.x, p.y - p.radius - 6, applied, false, true);
    }
  }
}

function rollRarity(luck: number): 1 | 2 | 3 {
  if (chance(0.06 + luck * 0.0015)) return 3;
  if (chance(0.22 + luck * 0.003)) return 2;
  return 1;
}

export function rollUpgradeChoices(luck = 0, count = 3): UpgradeDef[] {
  const pool = [...UPGRADES];
  const out: UpgradeDef[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const rarity = rollRarity(luck);
    // prefer the rolled rarity, fall back to anything left
    let candidates = pool.filter((u) => u.rarity === rarity);
    if (candidates.length === 0) candidates = pool;
    let chosen = pick(candidates);
    // regen is deliberately rare: 50% chance to reroll it into something else
    if (chosen.modifiers.hpRegen && chance(0.5)) {
      const nonRegen = candidates.filter((u) => !u.modifiers.hpRegen);
      if (nonRegen.length > 0) chosen = pick(nonRegen);
    }
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}
