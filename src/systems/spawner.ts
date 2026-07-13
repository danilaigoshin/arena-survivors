import type { RunState } from '../state';
import type { Camera } from '../core/camera';
import { getWaveDef } from '../data/waves';
import { ENEMY_INDEX } from '../data/enemies';
import { ARENA_W, ARENA_H } from '../config';
import { clamp, lerp } from '../utils/math';
import { pickWeighted, range, chance } from '../core/rng';
import { hitsObstacle } from '../data/maps';
import { getEndlessWaveScaling } from '../data/endless';

/** Point just outside the viewport but inside (or near) the arena. */
function spawnPoint(cam: Camera, out: { x: number; y: number }): void {
  const margin = 60;
  const halfW = cam.viewW / 2 + margin;
  const halfH = cam.viewH / 2 + margin;
  const side = Math.floor(range(0, 4));
  let x: number, y: number;
  if (side === 0) {
    x = cam.x + range(-halfW, halfW);
    y = cam.y - halfH;
  } else if (side === 1) {
    x = cam.x + range(-halfW, halfW);
    y = cam.y + halfH;
  } else if (side === 2) {
    x = cam.x - halfW;
    y = cam.y + range(-halfH, halfH);
  } else {
    x = cam.x + halfW;
    y = cam.y + range(-halfH, halfH);
  }
  out.x = clamp(x, -100, ARENA_W + 100);
  out.y = clamp(y, -100, ARENA_H + 100);
}

function spawnPointClear(state: RunState, cam: Camera, out: { x: number; y: number }, radius: number): void {
  for (let i = 0; i < 5; i++) {
    spawnPoint(cam, out);
    if (!hitsObstacle(state.obstacles, out.x, out.y, radius)) return;
  }
}

const pt = { x: 0, y: 0 };

/** Difficulty multipliers are applied after init so enemy.init stays state-free. */
function applyDifficulty(state: RunState, e: import('../entities/enemy').Enemy): void {
  const d = state.difficulty;
  e.maxHp = Math.round(e.maxHp * d.hpMult);
  e.hp = e.maxHp;
  e.contactDamage = Math.round(e.contactDamage * d.dmgMult);
}

export function spawnBossNow(state: RunState, cam: Camera): void {
  const waveDef = getWaveDef(state.wave);
  if (!waveDef.boss) return;
  const e = state.enemies.alloc();
  if (!e) return;
  spawnPointClear(state, cam, pt, 48);
  e.init(ENEMY_INDEX[waveDef.boss], pt.x, pt.y, state.wave);
  applyDifficulty(state, e);
  state.bossUid = e.uid;
}

export function updateSpawner(state: RunState, cam: Camera, dt: number): void {
  const waveDef = getWaveDef(state.wave);
  const endless = getEndlessWaveScaling(state.wave);
  const elapsed = waveDef.duration - state.waveTimer;
  const t = clamp(elapsed / waveDef.duration, 0, 1);
  const interval = lerp(waveDef.spawnInterval[0], waveDef.spawnInterval[1], t);

  // boss spawns 2s into its wave
  if (waveDef.boss && state.bossUid === 0 && !state.bossDead && elapsed >= 2) {
    spawnBossNow(state, cam);
  }

  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    state.spawnTimer += interval;
    if (state.enemies.count >= waveDef.maxAlive) break;
    const e = state.enemies.alloc();
    if (!e) break;
    spawnPointClear(state, cam, pt, 26);
    const entry = pickWeighted(waveDef.table);
    // Endless waves add a little more elite pressure on every step.
    const baseEliteChance = Math.min(0.18, 0.03 + state.wave * 0.01) + endless.eliteChanceBonus;
    const eliteChance = Math.min(0.8, baseEliteChance * state.difficulty.eliteMult);
    const elite = state.wave >= 5 && chance(eliteChance);
    e.init(ENEMY_INDEX[entry.defId], pt.x, pt.y, state.wave, elite);
    applyDifficulty(state, e);
  }
}

export { ARENA_W, ARENA_H };
