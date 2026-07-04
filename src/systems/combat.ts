import type { RunState } from '../state';
import type { Enemy } from '../entities/enemy';
import { TIER_DAMAGE, TIER_COOLDOWN } from '../data/weapons';
import { ENEMY_INDEX } from '../data/enemies';
import { weaponOrbCount } from '../entities/weapon';
import { chance, range } from '../core/rng';
import { norm, dist2 } from '../utils/math';
import { armorReduction } from '../entities/stats';
import { spawnDamageNumber, spawnGibs, spawnSparks, spawnRing, flashScreen, spawnDeathPop, stampGoo, addShake, addKick } from '../render/fx';
import { playSfx } from '../render/audio';
import { PLAYER_IFRAMES } from '../config';

const dir = { x: 0, y: 0 };

const GOO_COLORS: Record<string, string> = {
  chaser: '#4d7c42',
  splitter: '#3d7c30',
  slimelet: '#3d7c30',
  hopper: '#2e6a2c',
  frost: '#3a86ac',
  runner: '#6e48a0',
  tank: '#5a3a24',
  shooter: '#7c2030',
  boss: '#6a1018',
};

export function damageEnemy(state: RunState, e: Enemy, rawDmg: number, crit: boolean, kbX: number, kbY: number): void {
  if (!e.active || e.hp <= 0) return;
  let dmgMul = crit ? 2 : 1;
  // shieldbearer blocks most damage arriving from the front (he faces the player)
  if (e.def.frontBlock) {
    const fx = state.player.x - e.x;
    const fy = state.player.y - e.y;
    const fl = Math.max(1, Math.hypot(fx, fy));
    const kl = Math.max(1, Math.hypot(kbX, kbY));
    // knockback points away from the attacker; a frontal hit pushes him away from the player
    const dot = (kbX / kl) * (fx / fl) + (kbY / kl) * (fy / fl);
    if (dot < -0.35) dmgMul *= 1 - e.def.frontBlock;
  }
  const dmg = Math.max(1, Math.round(rawDmg * dmgMul));
  e.hp -= dmg;
  e.hitFlash = 0.1;
  if (!e.isBoss) {
    e.knockX += kbX;
    e.knockY += kbY;
  }
  spawnDamageNumber(e.x, e.y - e.radius, dmg, crit);
  const hitAngle = Math.atan2(kbY, kbX);
  spawnSparks(e.x, e.y, hitAngle, crit ? '#ffd23e' : '#ffe9a0', crit ? 4 : 2);
  playSfx('hit');
  if (e.hp <= 0) {
    e.active = false; // swept at end of step
    state.kills++;
    if (e.isBoss) state.bossDead = true;
    // gem economy: expected drop is materialDrop × 0.5, fractional part becomes a chance (0 is possible)
    const expected = e.def.materialDrop * (e.elite ? 4 : 1) * 0.5 * range(0.85, 1.15);
    const amount = Math.floor(expected) + (chance(expected - Math.floor(expected)) ? 1 : 0);
    if (amount > 0) state.dropMaterials(e.x, e.y, amount);
    // splitters burst into smaller slimes
    if (e.def.splits) {
      for (let i = 0; i < e.def.splits.count; i++) {
        const m = state.enemies.alloc();
        if (!m) break;
        const idx = ENEMY_INDEX[e.def.splits.id];
        m.init(idx, e.x + (i === 0 ? -18 : 18), e.y + (Math.random() - 0.5) * 16, state.wave);
        m.maxHp = Math.round(m.maxHp * state.difficulty.hpMult);
        m.hp = m.maxHp;
        m.spawnT = 0.2;
      }
    }
    // bombers leave a telegraphed explosion behind
    if (e.def.explodes) {
      state.explosions.push({ x: e.x, y: e.y, t: 0.8, radius: 95, damage: e.contactDamage * 2 });
    }
    // death juice: white pop + palette gibs scaled to the victim, permanent goo
    spawnDeathPop(e.def.id, e.x, e.y, e.radius * 2.3, state.player.x < e.x);
    if (e.isBoss) {
      spawnGibs(e.x, e.y, e.def.id, 26, hitAngle);
      spawnRing(e.x, e.y, '#ffffff');
      spawnRing(e.x, e.y, GOO_COLORS[e.def.id] ?? '#c44');
      addKick(Math.cos(hitAngle) * 8, Math.sin(hitAngle) * 8);
      state.hitStop = Math.max(state.hitStop, 0.3);
      addShake(12);
    } else if (e.radius >= 14 || e.elite) {
      spawnGibs(e.x, e.y, e.def.id, 10, hitAngle);
      spawnRing(e.x, e.y, GOO_COLORS[e.def.id] ?? '#c44');
    } else {
      spawnGibs(e.x, e.y, e.def.id, 6, hitAngle);
    }
    stampGoo(state.floorCanvas, e.x, e.y, GOO_COLORS[e.def.id] ?? '#333');
    playSfx('death');
  } else if (crit && state.hitStopCd <= 0) {
    state.hitStop = Math.max(state.hitStop, 0.04);
    state.hitStopCd = 0.5;
    addShake(3);
    addKick(Math.cos(hitAngle) * 3, Math.sin(hitAngle) * 3);
  }
}

export function damagePlayer(state: RunState, rawDmg: number): void {
  const p = state.player;
  if (p.iframes > 0 || p.hp <= 0) return;
  const dmg = armorReduction(rawDmg, p.stats.armor);
  p.hp -= dmg;
  p.iframes = PLAYER_IFRAMES;
  spawnDamageNumber(p.x, p.y - p.radius - 6, dmg);
  flashScreen();
  addShake(7);
  playSfx('hurt');
}

function critRoll(state: RunState): boolean {
  return chance(state.player.stats.critChance);
}

export function updateWeapons(state: RunState, dt: number): void {
  const p = state.player;
  const dmgMult = 1 + p.stats.damagePct / 100;
  const speedMult = 1 + p.stats.attackSpeedPct / 100;

  state.hitStopCd = Math.max(0, state.hitStopCd - dt);
  for (const w of p.weapons) {
    const def = w.def;
    const tierDmg = TIER_DAMAGE[w.tier - 1];
    const tierCd = TIER_COOLDOWN[w.tier - 1];
    w.recoil = Math.max(0, w.recoil - dt * 9);

    if (def.behavior === 'orbit' && def.orbit) {
      w.orbitAngle += def.orbit.angularSpeed * speedMult * dt;
      // tick down per-enemy hit cooldowns
      for (const [uid, t] of w.hitCooldowns) {
        if (t - dt <= 0) w.hitCooldowns.delete(uid);
        else w.hitCooldowns.set(uid, t - dt);
      }
      const orbR = 14;
      const orbs = weaponOrbCount(w);
      for (let o = 0; o < orbs; o++) {
        const a = w.orbitAngle + (o / orbs) * Math.PI * 2;
        const ox = p.x + Math.cos(a) * def.orbit.radius;
        const oy = p.y + Math.sin(a) * def.orbit.radius;
        state.grid.queryCircle(ox, oy, orbR + 32, (i) => {
          const e = state.enemies.items[i];
          if (!e.active || e.hp <= 0 || w.hitCooldowns.has(e.uid)) return;
          const rr = e.radius + orbR;
          if (dist2(e.x, e.y, ox, oy) > rr * rr) return;
          w.hitCooldowns.set(e.uid, def.orbit!.hitCooldown);
          norm(e.x - p.x, e.y - p.y, dir);
          damageEnemy(state, e, def.damage * dmgMult * tierDmg, critRoll(state), dir.x * 160, dir.y * 160);
        });
      }
      continue;
    }

    w.cooldownTimer -= dt;
    w.swipeTimer = Math.max(0, w.swipeTimer - dt);
    if (w.cooldownTimer > 0) continue;

    const targetIdx = state.grid.nearest(p.x, p.y, def.range);
    if (targetIdx < 0) continue;
    const target = state.enemies.items[targetIdx];
    if (!target.active || target.hp <= 0) continue;

    w.cooldownTimer = (def.cooldown * tierCd) / speedMult;
    w.recoil = 1;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    p.aimAngle = angle;
    w.fireAngle = angle;

    if (def.behavior === 'projectile' && def.projectile) {
      playSfx('shoot');
      for (let n = 0; n < def.projectile.count; n++) {
        const a = angle + range(-def.projectile.spreadRad, def.projectile.spreadRad);
        state.spawnProjectile(
          p.x,
          p.y,
          Math.cos(a) * def.projectile.speed,
          Math.sin(a) * def.projectile.speed,
          def.damage * dmgMult * tierDmg,
          def.projectile.pierce,
          def.range / def.projectile.speed + 0.1,
          true,
          critRoll(state),
          def.id,
        );
      }
    } else if (def.behavior === 'melee' && def.melee) {
      playSfx('shoot');
      w.swipeTimer = 0.18;
      w.swipeAngle = angle;
      const half = def.melee.arcRad / 2;
      state.grid.queryCircle(p.x, p.y, def.range + 40, (i) => {
        const e = state.enemies.items[i];
        if (!e.active || e.hp <= 0) return;
        const rr = def.range + e.radius;
        if (dist2(e.x, e.y, p.x, p.y) > rr * rr) return;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - angle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > half) return;
        norm(e.x - p.x, e.y - p.y, dir);
        damageEnemy(state, e, def.damage * dmgMult * tierDmg, critRoll(state), dir.x * def.melee!.knockback, dir.y * def.melee!.knockback);
      });
    }
  }
}
