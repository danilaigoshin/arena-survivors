import type { RunState } from '../state';
import type { Enemy } from '../entities/enemy';
import { TIER_DAMAGE, TIER_COOLDOWN, type WeaponDef, type WeaponStatusDef } from '../data/weapons';
import { ENEMY_INDEX } from '../data/enemies';
import { weaponChainTargetCount, weaponOrbCount, type WeaponInstance } from '../entities/weapon';
import { chance, range } from '../core/rng';
import { norm, dist2 } from '../utils/math';
import { armorReduction } from '../entities/stats';
import { spawnBurst, spawnDamageNumber, spawnGibs, spawnSparks, spawnRing, flashScreen, spawnDeathPop, stampGoo, addShake, addKick } from '../render/fx';
import { playSfx } from '../render/audio';
import { ENEMY_DAMAGE_MULT, ENEMY_MATERIAL_DROP_MULT, PLAYER_IFRAMES } from '../config';
import { hitsObstacle } from '../data/maps';
import type { AreaEffect } from '../entities/areaEffect';
import { branchAttackSpeedMultiplier, branchDamageMultiplier } from '../data/weaponBranches';

const dir = { x: 0, y: 0 };
const chainHitIndices = new Int32Array(8);
const clusterCandidates = new Int32Array(32);
const DAMAGE_IGNORE_BLOCK = 1;
const DAMAGE_QUIET = 2;

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

export function damageEnemy(
  state: RunState,
  e: Enemy,
  rawDmg: number,
  crit: boolean,
  kbX: number,
  kbY: number,
  sparkColor = '#ffe9a0',
  attackerX = state.player.x,
  attackerY = state.player.y,
  flags = 0,
): void {
  if (!e.active || e.hp <= 0) return;
  rawDmg *= state.player.talentDamageMultiplier(e.hp / Math.max(1, e.maxHp), e.isBoss);
  let dmgMul = crit ? 2 : 1;
  // shieldbearer blocks most damage arriving from the front (he faces the player)
  if (e.def.frontBlock && (flags & DAMAGE_IGNORE_BLOCK) === 0) {
    const fx = attackerX - e.x;
    const fy = attackerY - e.y;
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
  if ((flags & DAMAGE_QUIET) === 0) {
    spawnSparks(e.x, e.y, hitAngle, crit ? '#ffd23e' : sparkColor, crit ? 4 : 2);
    playSfx('hit');
  }
  if (e.hp <= 0) {
    e.active = false; // swept at end of step
    state.kills++;
    if (e.isBoss) state.bossDead = true;
    // Fractional expected drops become a chance, so weak enemies are no longer
    // guaranteed to pay out while elites and bosses still feel rewarding.
    const expected = e.def.materialDrop * (e.elite ? 4 : 1) * ENEMY_MATERIAL_DROP_MULT * (state.activeContract?.materialMult ?? 1) * range(0.85, 1.15);
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
  } else if (crit && (flags & DAMAGE_QUIET) === 0 && state.hitStopCd <= 0) {
    state.hitStop = Math.max(state.hitStop, 0.04);
    state.hitStopCd = 0.5;
    addShake(3);
    addKick(Math.cos(hitAngle) * 3, Math.sin(hitAngle) * 3);
  }
}

export function applyWeaponStatus(e: Enemy, status: WeaponStatusDef | undefined, damageScale = 1): void {
  if (!status || !e.active || e.hp <= 0) return;
  if (status.burnDps && status.burnDuration) {
    const dps = status.burnDps * damageScale;
    if (dps >= e.burnDps || e.burnT <= 0) e.burnDps = dps;
    e.burnT = Math.max(e.burnT, status.burnDuration);
    if (e.burnTick <= 0) e.burnTick = 0.25;
  }
  if (status.slowPct && status.slowDuration) {
    e.slowPct = Math.max(e.slowPct, status.slowPct);
    e.slowT = Math.max(e.slowT, status.slowDuration);
  }
  if (status.freezeDuration) e.freezeT = Math.max(e.freezeT, status.freezeDuration);
}

export function enemyMoveMultiplier(e: Enemy): number {
  if (e.freezeT > 0) return e.isBoss ? 0.5 : 0;
  if (e.slowT <= 0) return 1;
  const capped = e.isBoss ? Math.min(50, e.slowPct) : e.slowPct;
  return Math.max(0.1, 1 - capped / 100);
}

export function updateEnemyStatuses(state: RunState, dt: number): void {
  for (let i = 0; i < state.enemies.count; i++) {
    const e = state.enemies.items[i];
    if (!e.active || e.hp <= 0) continue;
    e.slowT = Math.max(0, e.slowT - dt);
    if (e.slowT <= 0) e.slowPct = 0;
    e.freezeT = Math.max(0, e.freezeT - dt);
    if (e.burnT <= 0) continue;
    e.burnT = Math.max(0, e.burnT - dt);
    e.burnTick -= dt;
    if (e.burnTick <= 0) {
      e.burnTick += 0.25;
      damageEnemy(state, e, e.burnDps * 0.25, false, 0, 0, '#ff9a45', e.x, e.y, DAMAGE_IGNORE_BLOCK | DAMAGE_QUIET);
    }
    if (e.burnT <= 0) e.burnDps = 0;
  }
}

export function damagePlayer(state: RunState, rawDmg: number): void {
  const p = state.player;
  if (p.iframes > 0 || p.hp <= 0) return;
  if (p.tryBlockWithBarrier()) {
    p.iframes = 0.2;
    spawnRing(p.x, p.y, '#8be9fd');
    spawnBurst(p.x, p.y, '#8be9fd', 8);
    playSfx('magic');
    return;
  }
  // Apply difficulty at impact time so contact hits, projectiles, summons and
  // environmental enemy hazards all use exactly the same damage scaling.
  const dmg = armorReduction(
    rawDmg * state.difficulty.dmgMult * ENEMY_DAMAGE_MULT * (state.activeContract?.enemyDamageMult ?? 1),
    p.stats.armor,
  );
  p.hp -= dmg;
  p.momentumT = 0;
  p.iframes = PLAYER_IFRAMES;
  spawnDamageNumber(p.x, p.y - p.radius - 6, dmg);
  flashScreen();
  addShake(7);
  playSfx('hurt');
}

function critRoll(state: RunState): boolean {
  return chance(state.player.stats.critChance);
}

function wasHitByChain(index: number, count: number): boolean {
  for (let i = 0; i < count; i++) {
    if (chainHitIndices[i] === index) return true;
  }
  return false;
}

function castChainLightning(state: RunState, w: WeaponInstance, firstTargetIdx: number, rawDamage: number): void {
  const def = w.def;
  const chain = def.chain!;
  const maxTargets = Math.min(weaponChainTargetCount(w), chainHitIndices.length, w.chainFxX.length - 1);
  const sparkColor = def.id === 'thunderstaff' ? '#8be9fd' : '#b18cff';
  let sourceX = state.player.x + Math.cos(w.fireAngle) * 28;
  let sourceY = state.player.y + Math.sin(w.fireAngle) * 28 + 3;
  let targetIdx = firstTargetIdx;
  let hitCount = 0;

  w.chainFxX[0] = sourceX;
  w.chainFxY[0] = sourceY;

  while (hitCount < maxTargets && targetIdx >= 0) {
    const e = state.enemies.items[targetIdx];
    if (!e.active || e.hp <= 0) break;

    chainHitIndices[hitCount] = targetIdx;
    w.chainFxX[hitCount + 1] = e.x;
    w.chainFxY[hitCount + 1] = e.y;

    norm(e.x - sourceX, e.y - sourceY, dir);
    const damage = rawDamage * Math.pow(chain.falloff, hitCount);
    damageEnemy(state, e, damage, critRoll(state), dir.x * 80, dir.y * 80, sparkColor, sourceX, sourceY);
    sourceX = e.x;
    sourceY = e.y;
    hitCount++;

    if (hitCount >= maxTargets) break;
    let nextIdx = -1;
    let nextD2 = chain.jumpRange * chain.jumpRange;
    state.grid.queryCircle(sourceX, sourceY, chain.jumpRange, (i) => {
      const next = state.enemies.items[i];
      if (!next.active || next.hp <= 0 || wasHitByChain(i, hitCount)) return;
      const d2 = dist2(sourceX, sourceY, next.x, next.y);
      if (d2 < nextD2) {
        nextD2 = d2;
        nextIdx = i;
      }
    });
    targetIdx = nextIdx;
  }

  w.chainFxPointCount = hitCount + 1;
  w.chainFxTimer = 0.14;
}

function allocArea(state: RunState): AreaEffect {
  return state.areaEffects.alloc() ?? state.areaEffects.items[0];
}

function setAreaStatus(area: AreaEffect, status: WeaponStatusDef | undefined, damageScale: number): void {
  area.burnDps = (status?.burnDps ?? 0) * damageScale;
  area.burnDuration = status?.burnDuration ?? 0;
  area.slowPct = status?.slowPct ?? 0;
  area.slowDuration = status?.slowDuration ?? 0;
  area.freezeDuration = status?.freezeDuration ?? 0;
}

function applyAreaStatus(e: Enemy, area: AreaEffect): void {
  if (area.burnDps > 0 && area.burnDuration > 0) {
    if (area.burnDps >= e.burnDps || e.burnT <= 0) e.burnDps = area.burnDps;
    e.burnT = Math.max(e.burnT, area.burnDuration);
    if (e.burnTick <= 0) e.burnTick = 0.25;
  }
  if (area.slowPct > 0 && area.slowDuration > 0) {
    e.slowPct = Math.max(e.slowPct, area.slowPct);
    e.slowT = Math.max(e.slowT, area.slowDuration);
  }
  if (area.freezeDuration > 0) e.freezeT = Math.max(e.freezeT, area.freezeDuration);
}

function findClusterTarget(state: RunState, def: WeaponDef, fallbackIdx: number): number {
  const radius = def.zone?.radius ?? 100;
  let count = 0;
  state.grid.queryCircle(state.player.x, state.player.y, def.range, (i) => {
    if (count >= clusterCandidates.length) return;
    const e = state.enemies.items[i];
    if (e.active && e.hp > 0) clusterCandidates[count++] = i;
  });
  let bestIdx = fallbackIdx;
  let bestCount = -1;
  for (let c = 0; c < count; c++) {
    const candidate = state.enemies.items[clusterCandidates[c]];
    let nearby = 0;
    state.grid.queryCircle(candidate.x, candidate.y, radius * 1.25, (i) => {
      const e = state.enemies.items[i];
      if (e.active && e.hp > 0 && dist2(candidate.x, candidate.y, e.x, e.y) <= radius * radius * 1.5625) nearby++;
    });
    if (nearby > bestCount) {
      bestCount = nearby;
      bestIdx = clusterCandidates[c];
    }
  }
  return bestIdx;
}

function spawnWeaponZones(state: RunState, w: WeaponInstance, targetIdx: number, rawDamage: number, statusScale: number): void {
  const def = w.def;
  const zone = def.zone!;
  const chosenIdx = zone.target === 'cluster' ? findClusterTarget(state, def, targetIdx) : targetIdx;
  const target = state.enemies.items[chosenIdx];
  const count = zone.count ?? 1;
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? 0 : (i / count) * Math.PI * 2 + w.slotIndex * 0.73;
    const spread = zone.spread ?? 0;
    const x = target.x + Math.cos(a) * spread;
    const y = target.y + Math.sin(a) * spread;
    const area = allocArea(state);
    area.initZone(
      def.id,
      w.slotIndex,
      x,
      y,
      zone.delay ?? 0,
      zone.duration,
      zone.persistentRadius ?? zone.radius,
      zone.radius,
      zone.tickRate,
      rawDamage * zone.tickDamageScale,
      rawDamage * zone.impactDamageScale,
      zone.pull ?? 0,
    );
    setAreaStatus(area, zone.status, statusScale);
  }
}

function spawnShockwave(state: RunState, def: WeaponDef, rawDamage: number): void {
  const shock = def.melee!.shockwave!;
  const area = allocArea(state);
  area.initShockwave(def.id, state.player.x, state.player.y, def.range, shock.maxRadius, shock.speed, rawDamage * shock.damageScale);
}

export function spawnTrailZone(state: RunState, style: string, x: number, y: number, burnDps: number, duration: number): void {
  const area = allocArea(state);
  area.initZone(style, -1, x, y, 0, duration, 26, 26, 0.5, 0, 0, 0);
  area.burnDps = burnDps;
  area.burnDuration = 0.75;
}

function hitAreaEnemies(state: RunState, area: AreaEffect, radius: number, rawDamage: number, quiet: boolean): void {
  state.grid.queryCircle(area.x, area.y, radius + 40, (i) => {
    const e = state.enemies.items[i];
    if (!e.active || e.hp <= 0) return;
    const rr = radius + e.radius;
    if (dist2(area.x, area.y, e.x, e.y) > rr * rr) return;
    norm(e.x - area.x, e.y - area.y, dir);
    if (rawDamage > 0) damageEnemy(state, e, rawDamage, false, dir.x * 80, dir.y * 80, area.style === 'absolute_zero' ? '#8be9fd' : '#b18cff', area.x, area.y, quiet ? DAMAGE_QUIET | DAMAGE_IGNORE_BLOCK : 0);
    applyAreaStatus(e, area);
  });
}

export function updateAreaEffects(state: RunState, dt: number): void {
  for (let i = state.areaEffects.count - 1; i >= 0; i--) {
    const area = state.areaEffects.items[i];
    if (area.kind === 'shockwave') {
      area.ttl -= dt;
      area.prevRadius = area.radius;
      area.radius = Math.min(area.maxRadius, area.radius + area.speed * dt);
      state.grid.queryCircle(area.x, area.y, area.radius + 40, (ei) => {
        const e = state.enemies.items[ei];
        if (!e.active || e.hp <= 0 || e.lastShockwaveUid === area.uid) return;
        const d = Math.sqrt(dist2(area.x, area.y, e.x, e.y));
        if (d + e.radius < area.prevRadius || d - e.radius > area.radius) return;
        e.lastShockwaveUid = area.uid;
        norm(e.x - area.x, e.y - area.y, dir);
        damageEnemy(state, e, area.damage, critRoll(state), dir.x * 520, dir.y * 520, '#ffd23e', area.x, area.y);
      });
      if (area.ttl <= 0 || area.radius >= area.maxRadius) state.areaEffects.free(i);
      continue;
    }

    if (area.delay > 0) {
      area.delay -= dt;
      if (area.delay > 0) continue;
    }
    if (!area.impacted) {
      area.impacted = true;
      if (area.impactDamage > 0) hitAreaEnemies(state, area, area.impactRadius, area.impactDamage, false);
      spawnBurst(area.x, area.y, area.style === 'armageddon' ? '#ff7030' : '#b18cff', area.impactDamage > 0 ? 14 : 6);
      spawnRing(area.x, area.y, area.style === 'armageddon' ? '#ff9a45' : '#b18cff');
    }
    area.ttl -= dt;
    if (area.pull > 0) {
      state.grid.queryCircle(area.x, area.y, area.radius + 40, (ei) => {
        const e = state.enemies.items[ei];
        if (!e.active || e.hp <= 0 || e.isBoss) return;
        const rr = area.radius + e.radius;
        if (dist2(area.x, area.y, e.x, e.y) > rr * rr) return;
        norm(area.x - e.x, area.y - e.y, dir);
        const pull = area.pull * (e.elite ? 0.5 : 1);
        e.x += dir.x * pull * dt;
        e.y += dir.y * pull * dt;
      });
    }
    area.tickTimer -= dt;
    if (area.tickTimer <= 0) {
      area.tickTimer += Math.max(0.05, area.tickRate);
      hitAreaEnemies(state, area, area.radius, area.damage, true);
    }
    if (area.ttl <= 0) state.areaEffects.free(i);
  }
}

function updateSummons(state: RunState, w: WeaponInstance, dt: number, rawDamage: number, baseSpeedMult: number, abilitySpeedMult: number): void {
  const summon = w.def.summon!;
  const count = Math.min(summon.count, w.summonX.length);
  let spawned = false;
  while (w.summonCount < count) {
    const i = w.summonCount++;
    const a = (i / count) * Math.PI * 2;
    w.summonX[i] = state.player.x + Math.cos(a) * 48;
    w.summonY[i] = state.player.y + Math.sin(a) * 48;
    w.summonHitCd[i] = i * 0.08;
    spawned = true;
  }
  if (spawned) playSfx('summon');
  w.summonCount = count;
  for (let i = 0; i < count; i++) {
    w.summonHitCd[i] = Math.max(0, w.summonHitCd[i] - dt * abilitySpeedMult);
    w.summonFlash[i] = Math.max(0, w.summonFlash[i] - dt);
    const targetIdx = state.grid.nearest(w.summonX[i], w.summonY[i], summon.leashRange);
    const target = targetIdx >= 0 ? state.enemies.items[targetIdx] : null;
    let tx = state.player.x + Math.cos(w.orbitAngle + i * Math.PI * 0.5) * (46 + i * 4);
    let ty = state.player.y + Math.sin(w.orbitAngle + i * Math.PI * 0.5) * (46 + i * 4);
    if (target?.active && target.hp > 0) {
      tx = target.x;
      ty = target.y;
    }
    norm(tx - w.summonX[i], ty - w.summonY[i], dir);
    const distToPlayer = Math.sqrt(dist2(w.summonX[i], w.summonY[i], state.player.x, state.player.y));
    const moveSpeed = summon.speed * (distToPlayer > summon.leashRange ? 2 : 1);
    w.summonX[i] += dir.x * moveSpeed * dt;
    w.summonY[i] += dir.y * moveSpeed * dt;
    if (target?.active && target.hp > 0 && w.summonHitCd[i] <= 0) {
      const rr = target.radius + 12;
      if (dist2(w.summonX[i], w.summonY[i], target.x, target.y) <= rr * rr) {
        norm(target.x - w.summonX[i], target.y - w.summonY[i], dir);
        damageEnemy(state, target, rawDamage, critRoll(state), dir.x * 100, dir.y * 100, '#b18cff', w.summonX[i], w.summonY[i]);
        w.summonHitCd[i] = summon.hitCooldown / baseSpeedMult;
        w.summonFlash[i] = 0.12;
      }
    }
  }
}

export function updateWeapons(state: RunState, dt: number): void {
  const p = state.player;
  const baseDmgMult = 1 + p.stats.damagePct / 100;
  const baseSpeedMult = 1 + p.stats.attackSpeedPct / 100;
  const talentSpeedMult = p.talentAttackSpeedMultiplier();

  state.hitStopCd = Math.max(0, state.hitStopCd - dt);
  for (const w of p.weapons) {
    const def = w.def;
    const dmgMult = baseDmgMult * p.abilityDamageMultiplier(def.id) * branchDamageMultiplier(w.branch);
    const permanentSpeedMult = baseSpeedMult * branchAttackSpeedMultiplier(w.branch);
    const temporarySpeedMult = p.abilityAttackSpeedMultiplier(def.id) * talentSpeedMult;
    const speedMult = permanentSpeedMult * temporarySpeedMult;
    const tierDmg = TIER_DAMAGE[w.tier - 1];
    const tierCd = TIER_COOLDOWN[w.tier - 1];
    w.recoil = Math.max(0, w.recoil - dt * 9);
    w.chainFxTimer = Math.max(0, w.chainFxTimer - dt);

    if (def.behavior === 'summon' && def.summon) {
      w.orbitAngle += dt * 1.8;
      updateSummons(state, w, dt, def.damage * dmgMult * tierDmg, permanentSpeedMult, temporarySpeedMult);
      continue;
    }

    if (def.behavior === 'orbit' && def.orbit) {
      w.orbitAngle += def.orbit.angularSpeed * speedMult * dt;
      // tick down per-enemy hit cooldowns
      for (const [uid, t] of w.hitCooldowns) {
        if (t - dt * temporarySpeedMult <= 0) w.hitCooldowns.delete(uid);
        else w.hitCooldowns.set(uid, t - dt * temporarySpeedMult);
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
          w.hitCooldowns.set(e.uid, def.orbit!.hitCooldown / branchAttackSpeedMultiplier(w.branch));
          norm(e.x - p.x, e.y - p.y, dir);
          damageEnemy(state, e, def.damage * dmgMult * tierDmg, critRoll(state), dir.x * 160, dir.y * 160);
        });
      }
      continue;
    }

    // Temporary ability buffs accelerate the remaining cooldown immediately;
    // permanent attack speed stays baked into the cooldown's base duration.
    w.cooldownTimer -= dt * temporarySpeedMult;
    w.swipeTimer = Math.max(0, w.swipeTimer - dt);
    if (w.cooldownTimer > 0) continue;

    const targetIdx = state.grid.nearest(p.x, p.y, def.range);
    if (targetIdx < 0) continue;
    const target = state.enemies.items[targetIdx];
    if (!target.active || target.hp <= 0) continue;

    w.cooldownTimer = (def.cooldown * tierCd) / permanentSpeedMult;
    w.recoil = 1;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    p.aimAngle = angle;
    w.fireAngle = angle;

    if (def.behavior === 'projectile' && def.projectile) {
      if (def.id === 'fire_wand' || def.id === 'dragonbreath') playSfx('fire');
      else if (def.projectile.explosion) playSfx('heavy');
      else playSfx('shoot');
      for (let n = 0; n < def.projectile.count; n++) {
        const spread = def.projectile.spreadRad * p.abilitySpreadMultiplier(def.id);
        const offset = def.projectile.pattern === 'fan' && def.projectile.count > 1
          ? ((n / (def.projectile.count - 1)) - 0.5) * spread * 2
          : range(-spread, spread);
        const a = angle + offset;
        const projectile = state.spawnProjectile(
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
        projectile.remainingBounces = def.projectile.ricochet?.bounces ?? 0;
        if (def.projectile.ricochet) {
          const ric = def.projectile.ricochet;
          projectile.ttl = def.range / def.projectile.speed + (ric.bounces * ric.jumpRange) / def.projectile.speed + 0.3;
        }
        if (def.projectile.boomerang) {
          const boom = def.projectile.boomerang;
          projectile.ttl = boom.outboundRange / def.projectile.speed + boom.outboundRange / boom.returnSpeed + 0.6;
        }
      }
    } else if (def.behavior === 'chain' && def.chain) {
      playSfx('magic');
      castChainLightning(state, w, targetIdx, def.damage * dmgMult * tierDmg);
    } else if (def.behavior === 'pulse' && def.pulse) {
      playSfx('ice');
      spawnRing(p.x, p.y, def.id === 'absolute_zero' ? '#8be9fd' : '#bfe8ff');
      state.grid.queryCircle(p.x, p.y, def.pulse.radius + 40, (i) => {
        const e = state.enemies.items[i];
        if (!e.active || e.hp <= 0) return;
        const rr = def.pulse!.radius + e.radius;
        if (dist2(p.x, p.y, e.x, e.y) > rr * rr) return;
        norm(e.x - p.x, e.y - p.y, dir);
        damageEnemy(state, e, def.damage * dmgMult * tierDmg, critRoll(state), dir.x * 120, dir.y * 120, '#8be9fd');
        applyWeaponStatus(e, def.pulse!.status, dmgMult * tierDmg);
      });
    } else if (def.behavior === 'zone' && def.zone) {
      playSfx(def.id === 'armageddon' ? 'fire' : 'magic');
      spawnWeaponZones(state, w, targetIdx, def.damage * dmgMult * tierDmg, dmgMult * tierDmg);
    } else if (def.behavior === 'melee' && def.melee) {
      playSfx(def.melee.shape === 'slam' ? 'heavy' : 'shoot');
      w.swipeTimer = 0.18;
      w.swipeAngle = angle;
      const melee = def.melee;
      let effectiveRange = def.range;
      if (melee.shape === 'thrust') {
        for (let d = 16; d <= def.range; d += 16) {
          if (hitsObstacle(state.obstacles, p.x + Math.cos(angle) * d, p.y + Math.sin(angle) * d, (melee.width ?? 24) * 0.25)) {
            effectiveRange = Math.max(0, d - 16);
            break;
          }
        }
      }
      state.grid.queryCircle(p.x, p.y, effectiveRange + 40, (i) => {
        const e = state.enemies.items[i];
        if (!e.active || e.hp <= 0) return;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (melee.shape === 'thrust') {
          const along = dx * Math.cos(angle) + dy * Math.sin(angle);
          const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
          if (along < -e.radius || along > effectiveRange + e.radius || across > (melee.width ?? 24) / 2 + e.radius) return;
        } else {
          const rr = effectiveRange + e.radius;
          if (dx * dx + dy * dy > rr * rr) return;
          if (melee.shape !== 'slam') {
            let da = Math.atan2(dy, dx) - angle;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            if (Math.abs(da) > melee.arcRad / 2) return;
          }
        }
        norm(e.x - p.x, e.y - p.y, dir);
        const strikes = melee.strikes ?? 1;
        for (let strike = 0; strike < strikes; strike++) {
          damageEnemy(state, e, def.damage * dmgMult * tierDmg, critRoll(state), dir.x * melee.knockback, dir.y * melee.knockback);
        }
      });
      if (melee.shockwave) spawnShockwave(state, def, def.damage * dmgMult * tierDmg);
      if (melee.phantom) {
        const ph = melee.phantom;
        for (let n = 0; n < ph.count; n++) {
          const a = angle + ((n / Math.max(1, ph.count - 1)) - 0.5) * ph.spreadRad * 2;
          state.spawnProjectile(p.x, p.y, Math.cos(a) * ph.speed, Math.sin(a) * ph.speed, def.damage * dmgMult * tierDmg * ph.damageScale, 0, ph.range / ph.speed + 0.1, true, critRoll(state), def.id, 2);
        }
      }
    }
  }
}
