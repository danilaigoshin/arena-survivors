import type { RunState } from '../state';
import type { Camera } from '../core/camera';
import { getWaveDef } from '../data/waves';
import { ENEMY_INDEX } from '../data/enemies';
import {
  ARENA_W,
  ARENA_H,
  COOP_ENEMY_MAX_ALIVE_MULT,
  ENEMY_MAX_ALIVE_MULT,
  ENEMY_SPAWN_INTERVAL_MULT,
  POOL_ENEMIES,
} from '../config';
import { clamp, lerp } from '../utils/math';
import { pickWeighted, range, chance } from '../core/rng';
import { hitsObstacle } from '../data/maps';
import { getEndlessWaveScaling } from '../data/endless';
import { applyEnemyRunScaling } from './enemyScaling';

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
  for (let i = 0; i < 20; i++) {
    spawnPoint(cam, out);
    const clearOfPlayers = state.alivePlayers().every(
      (player) => (player.x - out.x) ** 2 + (player.y - out.y) ** 2 >= (radius + player.radius + 140) ** 2,
    );
    if (clearOfPlayers && !hitsObstacle(state.obstacles, out.x, out.y, radius)) return;
  }
}

const pt = { x: 0, y: 0 };

export function spawnBossNow(state: RunState, cam: Camera): void {
  const waveDef = getWaveDef(state.wave);
  if (!waveDef.boss) return;
  const e = state.enemies.alloc();
  if (!e) return;
  spawnPointClear(state, cam, pt, 48);
  e.init(ENEMY_INDEX[waveDef.boss], pt.x, pt.y, state.wave);
  applyEnemyRunScaling(state, e);
  state.bossUid = e.uid;
}

export function updateSpawner(state: RunState, cam: Camera, dt: number): void {
  const waveDef = getWaveDef(state.wave);
  const endless = getEndlessWaveScaling(state.wave);
  const elapsed = waveDef.duration - state.waveTimer;
  const t = clamp(elapsed / waveDef.duration, 0, 1);
  const interval = (lerp(waveDef.spawnInterval[0], waveDef.spawnInterval[1], t) * ENEMY_SPAWN_INTERVAL_MULT) / (state.activeContract?.spawnRateMult ?? 1);

  // boss spawns 2s into its wave
  if (waveDef.boss && state.bossUid === 0 && !state.bossDead && elapsed >= 2) {
    spawnBossNow(state, cam);
  }

  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    state.spawnTimer += interval;
    const maxAlive = Math.min(
      POOL_ENEMIES,
      Math.round(
        waveDef.maxAlive
          * ENEMY_MAX_ALIVE_MULT
          * (state.players.length > 1 ? COOP_ENEMY_MAX_ALIVE_MULT : 1)
          * (state.activeContract?.maxAliveMult ?? 1),
      ),
    );
    if (state.enemies.count >= maxAlive) break;
    const e = state.enemies.alloc();
    if (!e) break;
    spawnPointClear(state, cam, pt, 26);
    const entry = pickWeighted(waveDef.table);
    // Endless waves add a little more elite pressure on every step.
    const baseEliteChance = Math.min(0.18, 0.03 + state.wave * 0.01) + endless.eliteChanceBonus;
    const eliteChance = Math.min(0.8, baseEliteChance * state.difficulty.eliteMult + (state.activeContract?.eliteChanceBonus ?? 0));
    const elite = state.wave >= 5 && chance(eliteChance);
    e.init(ENEMY_INDEX[entry.defId], pt.x, pt.y, state.wave, elite);
    applyEnemyRunScaling(state, e);
  }
}

export { ARENA_W, ARENA_H };
