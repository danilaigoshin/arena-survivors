import type { RunState } from '../state';
import { ARENA_H, ARENA_W } from '../config';
import { getWaveDef } from '../data/waves';
import { objectiveReward, objectiveTarget, objectiveTime, type WaveObjectiveKind, type WaveObjectiveState } from '../data/objectives';
import { hitsObstacle } from '../data/maps';
import { pick } from '../core/rng';
import { spawnBurst, spawnRing } from '../render/fx';
import { playSfx } from '../render/audio';

const KINDS: readonly WaveObjectiveKind[] = ['hunter', 'collector', 'hold'];

/** Optional objectives never stack with contracts or boss mechanics. */
export function createWaveObjective(state: RunState): WaveObjectiveState | null {
  if (state.wave < 2 || state.activeContract || getWaveDef(state.wave).boss || Math.random() > 0.55) return null;
  const kind = pick(KINDS);
  let x = ARENA_W / 2;
  let y = ARENA_H / 2;
  if (kind === 'hold') {
    for (let tries = 0; tries < 30; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 280 + Math.random() * 260;
      const candidateX = ARENA_W / 2 + Math.cos(angle) * distance;
      const candidateY = ARENA_H / 2 + Math.sin(angle) * distance;
      if (!hitsObstacle(state.obstacles, candidateX, candidateY, 140)) {
        x = candidateX;
        y = candidateY;
        break;
      }
    }
  }
  return {
    kind,
    target: objectiveTarget(kind, state.wave),
    progress: 0,
    timeLeft: objectiveTime(kind, state.wave),
    reward: objectiveReward(state.wave),
    completed: false,
    failed: false,
    startKills: state.kills,
    x,
    y,
    radius: 120,
  };
}

export function updateWaveObjective(state: RunState, dt: number): void {
  const objective = state.objective;
  if (!objective || objective.completed || objective.failed) return;
  objective.timeLeft = Math.max(0, objective.timeLeft - dt);
  if (objective.kind === 'hunter') {
    objective.progress = state.kills - objective.startKills;
  } else if (objective.kind === 'collector') {
    objective.progress = state.waveMaterials;
  } else {
    const dx = state.player.x - objective.x;
    const dy = state.player.y - objective.y;
    if (dx * dx + dy * dy <= objective.radius ** 2) objective.progress = Math.min(objective.target, objective.progress + dt);
  }

  if (objective.progress >= objective.target) {
    objective.completed = true;
    state.player.materials += objective.reward;
    spawnRing(objective.kind === 'hold' ? objective.x : state.player.x, objective.kind === 'hold' ? objective.y : state.player.y, '#8dff9a');
    spawnBurst(state.player.x, state.player.y, '#8dff9a', 12);
    playSfx('levelup');
  } else if (objective.timeLeft <= 0) {
    objective.failed = true;
  }
}

export function failWaveObjective(state: RunState): void {
  if (state.objective && !state.objective.completed) state.objective.failed = true;
}
