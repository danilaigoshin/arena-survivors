import type { RunState } from '../state';
import { dist2, norm } from '../utils/math';
import { damageEnemy, damagePlayer } from './combat';
import { hitsObstacle } from '../data/maps';

const dir = { x: 0, y: 0 };

export function updateProjectiles(state: RunState, dt: number): void {
  const p = state.player;
  for (let i = state.projectiles.count - 1; i >= 0; i--) {
    const pr = state.projectiles.items[i];
    pr.prevX = pr.x;
    pr.prevY = pr.y;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.ttl -= dt;
    if (pr.ttl <= 0 || hitsObstacle(state.obstacles, pr.x, pr.y, pr.radius)) {
      state.projectiles.free(i);
      continue;
    }
    if (pr.friendly) {
      let dead = false;
      state.grid.queryCircle(pr.x, pr.y, pr.radius + 40, (ei) => {
        if (dead) return;
        const e = state.enemies.items[ei];
        if (!e.active || e.hp <= 0) return;
        const rr = e.radius + pr.radius;
        if (dist2(e.x, e.y, pr.x, pr.y) > rr * rr) return;
        norm(pr.vx, pr.vy, dir);
        damageEnemy(state, e, pr.damage, pr.crit, dir.x * 140, dir.y * 140);
        if (pr.pierce > 0) pr.pierce--;
        else dead = true;
      });
      if (dead) state.projectiles.free(i);
    } else {
      const rr = p.radius + pr.radius;
      if (dist2(p.x, p.y, pr.x, pr.y) <= rr * rr) {
        damagePlayer(state, pr.damage);
        if (pr.style === 'frost') p.slowT = 1.5;
        state.projectiles.free(i);
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
  const p = state.player;
  if (p.iframes > 0) return;
  state.grid.queryCircle(p.x, p.y, p.radius + 64, (i) => {
    if (p.iframes > 0) return;
    const e = state.enemies.items[i];
    if (!e.active || e.hp <= 0 || e.spawnT > 0) return;
    const rr = e.radius + p.radius;
    if (dist2(e.x, e.y, p.x, p.y) <= rr * rr) {
      damagePlayer(state, e.contactDamage);
    }
  });
}
