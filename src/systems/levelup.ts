import type { RunState } from '../state';
import { UPGRADES, type UpgradeDef } from '../data/upgrades';
import { spawnDamageNumber, spawnRing, spawnBurst } from '../render/fx';
import { emitPresentationEvent } from '../multiplayer/presentationBus';
import { playSfx } from '../render/audio';
import { dist2, norm } from '../utils/math';
import { chance, pick } from '../core/rng';
import { xpToNext } from './squad';

const dir = { x: 0, y: 0 };

/** Magnet + collect. Materials grant XP and currency simultaneously. */
export function updatePickups(state: RunState, dt: number): void {
  for (let i = state.pickups.count - 1; i >= 0; i--) {
    const pk = state.pickups.items[i];
    let collector = null;
    let collectorDistance = Infinity;
    for (const player of state.alivePlayers()) {
      const distance = dist2(pk.x, pk.y, player.x, player.y);
      const withinRange = state.vacuum || pk.magnet || distance <= player.stats.pickupRange ** 2;
      if (
        withinRange
        && (distance < collectorDistance || (distance === collectorDistance && collector !== null && player.slot < collector.slot))
      ) {
        collector = player;
        collectorDistance = distance;
      }
    }
    if (collector) {
      pk.magnet = true;
      pk.targetPlayerSlot = collector.slot;
      norm(collector.x - pk.x, collector.y - pk.y, dir);
      const speed = state.vacuum ? 900 : 500;
      pk.vx = dir.x * speed;
      pk.vy = dir.y * speed;
    } else {
      pk.vx *= Math.exp(-6 * dt);
      pk.vy *= Math.exp(-6 * dt);
    }
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;
    if (!collector) continue;
    const collectR = collector.radius + 10;
    if (dist2(pk.x, pk.y, collector.x, collector.y) <= collectR * collectR) {
      state.squad.materials += pk.value;
      state.waveMaterials += pk.value;
      gainXp(state, pk.value);
      const pulses = collector.collectForMagneticPulse(pk.value);
      for (let pulse = 0; pulse < pulses; pulse++) {
        state.grid.queryCircle(collector.x, collector.y, 210, (i) => {
          const e = state.enemies.items[i];
          if (!e.active || e.hp <= 0 || e.isBoss) return;
          const dx = e.x - collector.x;
          const dy = e.y - collector.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          e.knockX += (dx / len) * 620;
          e.knockY += (dy / len) * 620;
        });
        spawnRing(collector.x, collector.y, '#8be9fd');
      }
      spawnBurst(pk.x, pk.y, '#8be9fd', 3);
      playSfx('pickup');
      state.pickups.free(i);
    }
  }
}

export function gainXp(state: RunState, amount: number): void {
  state.squad.xp += amount;
  while (state.squad.xp >= xpToNext(state.squad.level)) {
    state.squad.xp -= xpToNext(state.squad.level);
    state.squad.level++;
    for (const player of state.players) {
      state.pendingLevelUps[player.slot]++;
      if (state.squad.level % 4 === 0) state.pendingTalentLevelUps[player.slot]++;
      spawnRing(player.x, player.y, '#8dff9a');
    }
    playSfx('levelup');
  }
}

/** hp per 5s → applied continuously */
export function updateRegen(state: RunState, dt: number): void {
  for (const player of state.alivePlayers()) {
    if (player.stats.hpRegen <= 0 || player.hp >= player.stats.maxHp) continue;
    player.regenAcc += (player.stats.hpRegen / 5) * dt;
    if (player.regenAcc >= 1) {
      const heal = Math.floor(player.regenAcc);
      player.regenAcc -= heal;
      const applied = Math.min(heal, player.stats.maxHp - player.hp);
      if (applied > 0) {
        player.hp += applied;
        spawnDamageNumber(player.x, player.y - player.radius - 6, applied, false, true);
        emitPresentationEvent({
          type: 'damage',
          target: 'player',
          targetSlot: player.slot,
          x: player.x,
          y: player.y - player.radius - 6,
          damage: applied,
          crit: false,
          heal: true,
        });
      }
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
