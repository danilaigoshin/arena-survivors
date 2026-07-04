import type { RunState } from '../state';
import { norm, clamp } from '../utils/math';
import { ARENA_W, ARENA_H } from '../config';
import { pushOutOfObstacles } from '../data/maps';
import { ENEMY_INDEX } from '../data/enemies';

const dir = { x: 0, y: 0 };

function bossSummon(state: RunState, e: import('../entities/enemy').Enemy, count: number, elites: boolean): void {
  for (let i = 0; i < count; i++) {
    const m = state.enemies.alloc();
    if (!m) break;
    const a = (i / count) * Math.PI * 2;
    m.init(ENEMY_INDEX[i === 0 ? 'runner' : 'chaser'], e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, state.wave, elites && i === 0);
    m.maxHp = Math.round(m.maxHp * state.difficulty.hpMult);
    m.hp = m.maxHp;
  }
}

function bossFire(state: RunState, e: import('../entities/enemy').Enemy, angle: number): void {
  const sh = e.def.shoot!;
  state.spawnProjectile(
    e.x,
    e.y,
    Math.cos(angle) * sh.projSpeed,
    Math.sin(angle) * sh.projSpeed,
    Math.round(sh.damage * state.difficulty.dmgMult),
    0,
    4,
    false,
  );
}

/**
 * Bosses share one state machine: chase → pick an attack from def.attacks.
 * Stages by remaining HP make everything denser and faster.
 */
function bossUpdate(state: RunState, e: import('../entities/enemy').Enemy, dt: number): void {
  const p = state.player;
  const def = e.def;
  const frac = e.hp / e.maxHp;
  // brute stays flat; bigger bosses escalate through 3 stages
  const stage = (def.attacks?.length ?? 1) > 1 ? (frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2) : 0;
  const speedMult = 1 + stage * 0.18;
  e.phaseTimer -= dt;

  // burst attacks in progress (fan volleys / spiral stream)
  if (e.burstType) {
    e.burstT -= dt;
    if (e.burstT <= 0 && e.burstN > 0) {
      if (e.burstType === 'fan') {
        const aim = Math.atan2(p.y - e.y, p.x - e.x);
        const n = 7 + stage * 2;
        for (let i = 0; i < n; i++) {
          bossFire(state, e, aim + ((i / (n - 1)) - 0.5) * 1.0);
        }
        e.burstT = 0.45;
      } else if (e.burstType === 'spiral') {
        for (let s = 0; s < 2; s++) {
          bossFire(state, e, e.burstAngle + s * Math.PI);
        }
        e.burstAngle += 0.42;
        e.burstT = 0.05;
      }
      e.burstN--;
      if (e.burstN <= 0) e.burstType = '';
    }
  }

  // dash phase machine (also drives dash chains)
  if (e.phase === 1) {
    if (e.phaseTimer <= 0) {
      e.phase = 2;
      e.phaseTimer = 0.55;
    }
    return; // telegraph: stand still, renderer blinks
  }
  if (e.phase === 2) {
    e.x += e.dashVx * 520 * speedMult * dt;
    e.y += e.dashVy * 520 * speedMult * dt;
    // the Brute sets the ground on fire while charging (one patch every ~26u)
    if (def.fireTrail && state.firePatches.length < 160) {
      const last = state.firePatches[state.firePatches.length - 1];
      if (!last || (last.x - e.x) ** 2 + (last.y - e.y) ** 2 > 26 * 26) {
        state.firePatches.push({ x: e.x, y: e.y, ttl: 3.5 });
      }
    }
    if (e.phaseTimer <= 0) {
      if (e.burstType === 'dashchain' && e.burstN > 0) {
        e.burstN--;
        e.phase = 1;
        e.phaseTimer = 0.3;
        norm(p.x - e.x, p.y - e.y, dir);
        e.dashVx = dir.x;
        e.dashVy = dir.y;
      } else {
        if (e.burstType === 'dashchain') e.burstType = '';
        e.phase = 0;
        e.phaseTimer = stage >= 2 ? 2.2 : 3.5;
      }
    }
    return;
  }

  // chase
  const dist = norm(p.x - e.x, p.y - e.y, dir);
  e.x += dir.x * e.speed * speedMult * dt;
  e.y += dir.y * e.speed * speedMult * dt;

  // next attack
  e.shootCd -= dt;
  if (e.shootCd <= 0 && def.shoot && !e.burstType) {
    e.shootCd = def.shoot.cooldown * (1 - stage * 0.22);
    const attacks = def.attacks ?? ['radial'];
    const kind = attacks[Math.floor(Math.random() * attacks.length)];
    if (kind === 'radial') {
      const n = 12 + stage * 6;
      const off = stage >= 2 ? Math.random() * Math.PI : 0;
      for (let i = 0; i < n; i++) bossFire(state, e, off + (i / n) * Math.PI * 2);
    } else if (kind === 'fan') {
      e.burstType = 'fan';
      e.burstN = 2 + stage;
      e.burstT = 0;
    } else if (kind === 'spiral') {
      e.burstType = 'spiral';
      e.burstN = 26 + stage * 8;
      e.burstT = 0;
      e.burstAngle = Math.random() * Math.PI * 2;
    } else if (kind === 'summon') {
      bossSummon(state, e, 3 + stage, stage >= 2);
    } else if (kind === 'dashchain' && dist > 140) {
      e.burstType = 'dashchain';
      e.burstN = 1 + Math.min(stage, 1);
      e.phase = 1;
      e.phaseTimer = stage >= 2 ? 0.4 : 0.55;
      norm(p.x - e.x, p.y - e.y, dir);
      e.dashVx = dir.x;
      e.dashVy = dir.y;
    }
  }

  // plain dash for single-attack bosses (brute keeps his old rhythm)
  if ((def.attacks?.length ?? 1) <= 1 && e.phaseTimer <= 0 && dist > 150) {
    e.phase = 1;
    e.phaseTimer = 0.7;
    norm(p.x - e.x, p.y - e.y, dir);
    e.dashVx = dir.x;
    e.dashVy = dir.y;
  }
}

export function updateEnemies(state: RunState, dt: number): void {
  const p = state.player;
  for (let i = 0; i < state.enemies.count; i++) {
    const e = state.enemies.items[i];
    const def = e.def;

    if (def.ai === 'boss') {
      bossUpdate(state, e, dt);
    } else if (def.ai === 'chargeDash') {
      // sprinter: approach, telegraph briefly, then lunge at the player
      e.phaseTimer -= dt;
      if (e.phase === 0) {
        const dist = norm(p.x - e.x, p.y - e.y, dir);
        e.x += dir.x * e.speed * dt;
        e.y += dir.y * e.speed * dt;
        if (e.phaseTimer <= 0 && dist < 420 && dist > 60) {
          e.phase = 1; // telegraph (renderer blinks white)
          e.phaseTimer = 0.35;
          norm(p.x - e.x, p.y - e.y, dir);
          e.dashVx = dir.x;
          e.dashVy = dir.y;
        }
      } else if (e.phase === 1) {
        if (e.phaseTimer <= 0) {
          e.phase = 2;
          e.phaseTimer = 0.35;
        }
      } else {
        e.x += e.dashVx * 560 * dt;
        e.y += e.dashVy * 560 * dt;
        if (e.phaseTimer <= 0) {
          e.phase = 0;
          e.phaseTimer = 2.2;
        }
      }
    } else if (def.ai === 'hopper') {
      // frog: crouch, then leap toward the player in short bursts
      e.phaseTimer -= dt;
      if (e.phase === 0) {
        if (e.phaseTimer <= 0) {
          e.phase = 2;
          e.phaseTimer = 0.32;
          norm(p.x - e.x, p.y - e.y, dir);
          e.dashVx = dir.x;
          e.dashVy = dir.y;
        }
      } else {
        e.x += e.dashVx * 340 * dt;
        e.y += e.dashVy * 340 * dt;
        if (e.phaseTimer <= 0) {
          e.phase = 0;
          e.phaseTimer = 0.55;
        }
      }
    } else if (def.ai === 'summoner') {
      // keeps a respectful distance and keeps calling packs of runners
      const dist = norm(p.x - e.x, p.y - e.y, dir);
      if (dist > 380) {
        e.x += dir.x * e.speed * dt;
        e.y += dir.y * e.speed * dt;
      } else if (dist < 280) {
        e.x -= dir.x * e.speed * 0.8 * dt;
        e.y -= dir.y * e.speed * 0.8 * dt;
      }
      e.summonCd -= dt;
      if (e.summonCd <= 0) {
        e.summonCd = 6;
        for (let k = 0; k < 3; k++) {
          const m = state.enemies.alloc();
          if (!m) break;
          const a = (k / 3) * Math.PI * 2;
          m.init(ENEMY_INDEX['runner'], e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, state.wave);
          m.maxHp = Math.round(m.maxHp * state.difficulty.hpMult);
          m.hp = m.maxHp;
        }
      }
    } else if (def.ai === 'keepDistanceShoot' && def.shoot) {
      const dist = norm(p.x - e.x, p.y - e.y, dir);
      const desired = def.shoot.range * 0.8;
      if (dist > desired + 30) {
        e.x += dir.x * e.speed * dt;
        e.y += dir.y * e.speed * dt;
      } else if (dist < desired - 60) {
        e.x -= dir.x * e.speed * 0.7 * dt;
        e.y -= dir.y * e.speed * 0.7 * dt;
      }
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist <= def.shoot.range) {
        e.shootCd = def.shoot.cooldown;
        state.spawnProjectile(e.x, e.y, dir.x * def.shoot.projSpeed, dir.y * def.shoot.projSpeed, Math.round(def.shoot.damage * state.difficulty.dmgMult), 0, 3, false, false, def.slowShot ? 'frost' : '');
      }
    } else {
      norm(p.x - e.x, p.y - e.y, dir);
      e.x += dir.x * e.speed * dt;
      e.y += dir.y * e.speed * dt;
    }

    // knockback impulse decay
    e.x += e.knockX * dt;
    e.y += e.knockY * dt;
    const decay = Math.exp(-8 * dt);
    e.knockX *= decay;
    e.knockY *= decay;

    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.spawnT = Math.max(0, e.spawnT - dt);

    pushOutOfObstacles(state.obstacles, e);

    // soft-clamp to slightly beyond the arena so spawn-ring enemies can walk in
    e.x = clamp(e.x, -120, ARENA_W + 120);
    e.y = clamp(e.y, -120, ARENA_H + 120);
  }
}
