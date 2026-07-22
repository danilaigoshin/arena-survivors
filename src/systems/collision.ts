import type { RunState } from '../state';
import { dist2, norm } from '../utils/math';
import { applyWeaponStatus, damageEnemy, damagePlayer, spawnTrailZone } from './combat';
import { hitsObstacle } from '../data/maps';
import { WEAPON_INDEX, type ProjectileDef, type WeaponDef } from '../data/weapons';
import type { Projectile } from '../entities/projectile';
import { spawnBurst, spawnRing } from '../render/fx';
import { playSfx } from '../render/audio';

const dir = { x: 0, y: 0 };

function projectileHasHit(pr: Projectile, uid: number): boolean {
  for (let i = 0; i < pr.hitCount; i++) if (pr.hitUids[i] === uid) return true;
  return false;
}

function rememberProjectileHit(pr: Projectile, uid: number): void {
  if (pr.hitCount < pr.hitUids.length) pr.hitUids[pr.hitCount++] = uid;
}

function clearProjectileLine(state: RunState, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 24));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (hitsObstacle(state.obstacles, x1 + dx * t, y1 + dy * t, 3)) return false;
  }
  return true;
}

function explodeProjectile(state: RunState, pr: Projectile, def: WeaponDef, projectile: ProjectileDef): void {
  const explosion = projectile.explosion!;
  const child = pr.variant === 1;
  const radius = child ? (explosion.clusterRadius ?? explosion.radius * 0.5) : explosion.radius;
  state.grid.queryCircle(pr.x, pr.y, radius + 40, (ei) => {
    const e = state.enemies.items[ei];
    if (!e.active || e.hp <= 0) return;
    const rr = radius + e.radius;
    if (dist2(e.x, e.y, pr.x, pr.y) > rr * rr) return;
    norm(e.x - pr.x, e.y - pr.y, dir);
    damageEnemy(
      state,
      e,
      pr.damage,
      pr.crit,
      dir.x * 220,
      dir.y * 220,
      '#ff9a45',
      pr.x,
      pr.y,
      0,
      { ownerPlayerSlot: pr.ownerPlayerSlot, x: pr.x, y: pr.y, weaponId: pr.style },
    );
    applyWeaponStatus(e, projectile.status, pr.damage / Math.max(1, def.damage), pr.ownerPlayerSlot);
  });
  if (!child && explosion.clusterCount && explosion.clusterDamageScale && explosion.clusterRadius) {
    for (let i = 0; i < explosion.clusterCount; i++) {
      const a = (i / explosion.clusterCount) * Math.PI * 2 + pr.x * 0.013;
      state.spawnProjectile(
        pr.x,
        pr.y,
        Math.cos(a) * 180,
        Math.sin(a) * 180,
        pr.damage * explosion.clusterDamageScale,
        0,
        explosion.clusterDelay ?? 0.25,
        true,
        pr.crit,
        pr.style,
        1,
        pr.ownerPlayerSlot,
      );
    }
  }
  spawnBurst(pr.x, pr.y, child ? '#ffd06a' : '#ff7030', child ? 8 : 18);
  spawnRing(pr.x, pr.y, child ? '#ffd06a' : '#ff7030');
  playSfx('explosion');
}

function steerHoming(state: RunState, pr: Projectile, turnRate: number, dt: number): void {
  const targetIdx = state.grid.nearest(pr.x, pr.y, 360);
  if (targetIdx < 0) return;
  const target = state.enemies.items[targetIdx];
  if (!target.active || target.hp <= 0) return;
  const speed = Math.max(1, Math.hypot(pr.vx, pr.vy));
  const current = Math.atan2(pr.vy, pr.vx);
  const desired = Math.atan2(target.y - pr.y, target.x - pr.x);
  const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const next = current + Math.max(-turnRate * dt, Math.min(turnRate * dt, delta));
  pr.vx = Math.cos(next) * speed;
  pr.vy = Math.sin(next) * speed;
}

function redirectRicochet(state: RunState, pr: Projectile, hitX: number, hitY: number, projectile: ProjectileDef): boolean {
  const ricochet = projectile.ricochet!;
  let first = -1;
  let second = -1;
  let firstD2 = ricochet.jumpRange * ricochet.jumpRange;
  let secondD2 = firstD2;
  state.grid.queryCircle(hitX, hitY, ricochet.jumpRange, (i) => {
    const e = state.enemies.items[i];
    if (!e.active || e.hp <= 0 || projectileHasHit(pr, e.uid) || !clearProjectileLine(state, hitX, hitY, e.x, e.y)) return;
    const d2 = dist2(hitX, hitY, e.x, e.y);
    if (d2 < firstD2) {
      second = first;
      secondD2 = firstD2;
      first = i;
      firstD2 = d2;
    } else if (d2 < secondD2) {
      second = i;
      secondD2 = d2;
    }
  });
  if (first < 0) return false;

  const speed = Math.max(1, Math.hypot(pr.vx, pr.vy));
  const next = state.enemies.items[first];
  norm(next.x - hitX, next.y - hitY, dir);
  pr.x = hitX + dir.x * 8;
  pr.y = hitY + dir.y * 8;
  pr.prevX = hitX;
  pr.prevY = hitY;
  pr.vx = dir.x * speed;
  pr.vy = dir.y * speed;
  pr.damage *= ricochet.falloff;
  pr.remainingBounces--;

  if ((ricochet.branches ?? 1) > 1 && pr.variant === 0 && second >= 0) {
    const other = state.enemies.items[second];
    norm(other.x - hitX, other.y - hitY, dir);
    const clone = state.spawnProjectile(
      hitX + dir.x * 8,
      hitY + dir.y * 8,
      dir.x * speed,
      dir.y * speed,
      pr.damage,
      0,
      2.5,
      true,
      pr.crit,
      pr.style,
      3,
      pr.ownerPlayerSlot,
    );
    clone.remainingBounces = pr.remainingBounces;
    for (let i = 0; i < pr.hitCount; i++) clone.hitUids[i] = pr.hitUids[i];
    clone.hitCount = pr.hitCount;
  }
  pr.variant = 3;
  return true;
}

export function updateProjectiles(state: RunState, dt: number): void {
  for (let i = state.projectiles.count - 1; i >= 0; i--) {
    const pr = state.projectiles.items[i];
    const owner = pr.ownerPlayerSlot === null ? null : state.playerBySlot(pr.ownerPlayerSlot);
    const def = pr.friendly ? WEAPON_INDEX[pr.style] : undefined;
    const projectile = def?.projectile;
    const boomerang = projectile?.boomerang;

    if (projectile?.homingTurn) steerHoming(state, pr, projectile.homingTurn, dt);
    if (boomerang?.trailBurnDps) {
      pr.trailTimer -= dt;
      if (pr.trailTimer <= 0) {
        pr.trailTimer = 0.08;
        spawnTrailZone(
          state,
          pr.style,
          pr.x,
          pr.y,
          boomerang.trailBurnDps * (pr.damage / Math.max(1, def!.damage)),
          boomerang.trailDuration ?? 2,
          pr.ownerPlayerSlot,
        );
      }
    }
    if (boomerang?.outboundRange && pr.returning) {
      const target = owner ?? state.players[0];
      norm(target.x - pr.x, target.y - pr.y, dir);
      pr.vx = dir.x * boomerang.returnSpeed;
      pr.vy = dir.y * boomerang.returnSpeed;
    }
    pr.prevX = pr.x;
    pr.prevY = pr.y;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.ttl -= dt;

    if (boomerang && !pr.returning && dist2(pr.originX, pr.originY, pr.x, pr.y) >= boomerang.outboundRange * boomerang.outboundRange) {
      pr.returning = true;
      pr.hitCount = 0;
      playSfx('return');
    }
    const returnTarget = owner ?? state.players[0];
    if (boomerang && pr.returning && dist2(returnTarget.x, returnTarget.y, pr.x, pr.y) <= (returnTarget.radius + 10) ** 2) {
      state.projectiles.free(i);
      continue;
    }
    const blocked = !boomerang?.outboundRange || !pr.returning ? hitsObstacle(state.obstacles, pr.x, pr.y, pr.radius) : false;
    if (blocked && boomerang && !pr.returning) {
      pr.x = pr.prevX;
      pr.y = pr.prevY;
      pr.returning = true;
      pr.hitCount = 0;
      playSfx('return');
      continue;
    }
    if (pr.ttl <= 0 || blocked) {
      if (def && projectile?.explosion) explodeProjectile(state, pr, def, projectile);
      state.projectiles.free(i);
      continue;
    }
    if (pr.friendly) {
      let dead = false;
      let handled = false;
      state.grid.queryCircle(pr.x, pr.y, pr.radius + 40, (ei) => {
        if (dead || handled) return;
        const e = state.enemies.items[ei];
        if (!e.active || e.hp <= 0) return;
        if ((boomerang || projectile?.ricochet) && projectileHasHit(pr, e.uid)) return;
        const rr = e.radius + pr.radius;
        if (dist2(e.x, e.y, pr.x, pr.y) > rr * rr) return;

        if (def && projectile?.explosion) {
          explodeProjectile(state, pr, def, projectile);
          dead = true;
          return;
        }
        norm(pr.vx, pr.vy, dir);
        damageEnemy(
          state,
          e,
          pr.damage,
          pr.crit,
          dir.x * 140,
          dir.y * 140,
          undefined,
          pr.prevX,
          pr.prevY,
          0,
          { ownerPlayerSlot: pr.ownerPlayerSlot, x: pr.prevX, y: pr.prevY, weaponId: pr.style },
        );
        if (def && projectile) applyWeaponStatus(e, projectile.status, pr.damage / Math.max(1, def.damage), pr.ownerPlayerSlot);
        if (boomerang) {
          rememberProjectileHit(pr, e.uid);
          return;
        }
        if (projectile?.ricochet) {
          rememberProjectileHit(pr, e.uid);
          if (pr.remainingBounces > 0 && redirectRicochet(state, pr, e.x, e.y, projectile)) handled = true;
          else dead = true;
          return;
        }
        if (pr.pierce > 0) pr.pierce--;
        else dead = true;
      });
      if (dead) state.projectiles.free(i);
    } else {
      for (const player of state.alivePlayers()) {
        const rr = player.radius + pr.radius;
        if (dist2(player.x, player.y, pr.x, pr.y) <= rr * rr) {
          damagePlayer(state, player, pr.damage, pr.style || 'projectile');
          if (pr.style === 'frost') player.slowT = 1.5;
          state.projectiles.free(i);
          break;
        }
      }
    }
  }
}

/** Soft push-apart of overlapping enemies using the grid (same + neighbor cells). */
export function separateEnemies(state: RunState): void {
  const enemies = state.enemies;
  for (let i = 0; i < enemies.count; i++) {
    const a = enemies.items[i];
    if (!a.active) continue;
    state.grid.queryCircle(a.x, a.y, a.radius + 32, (j) => {
      if (j <= i) return; // each pair once
      const b = enemies.items[j];
      if (!b.active) return;
      const rr = a.radius + b.radius;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 >= rr * rr || d2 < 1e-6) return;
      const d = Math.sqrt(d2);
      const overlap = (rr - d) * 0.5 * 0.6; // soft factor
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      // bosses don't get pushed
      if (!a.isBoss) {
        a.x -= nx * overlap;
        a.y -= ny * overlap;
      }
      if (!b.isBoss) {
        b.x += nx * overlap;
        b.y += ny * overlap;
      }
    });
  }
}

export function enemyContactDamage(state: RunState): void {
  for (const player of state.alivePlayers()) {
    if (player.iframes > 0) continue;
    state.grid.queryCircle(player.x, player.y, player.radius + 64, (i) => {
      if (player.iframes > 0) return;
      const e = state.enemies.items[i];
      if (!e.active || e.hp <= 0 || e.spawnT > 0) return;
      const rr = e.radius + player.radius;
      if (dist2(e.x, e.y, player.x, player.y) <= rr * rr) {
        damagePlayer(state, player, e.contactDamage, e.def.id);
      }
    });
  }
}
