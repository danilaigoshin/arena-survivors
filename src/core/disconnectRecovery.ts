import type { Game } from '../game';
import type { RunState } from '../state';
import { addShards, recordRun } from './save';
import { cloneRunMetrics, type RunSummary } from './runMetrics';

const claimedStates = new WeakSet<RunState>();

export function disconnectedRunReward(game: Game): number {
  const settled = game.networkSession as ({ lastEndResult?: unknown } | null);
  if (settled?.lastEndResult) return 0;
  const state = game.state;
  return Math.max(1, Math.round(
    (state.wave * 3 + Math.floor(state.kills / 10)) * state.difficulty.shardMult,
  ));
}

/** Converts the latest locally known co-op state into a normal partial run. */
export function claimDisconnectedRun(game: Game): number {
  const state = game.state;
  if (claimedStates.has(state)) return 0;
  claimedStates.add(state);
  const reward = disconnectedRunReward(game);
  if (reward <= 0) return 0;
  const weaponIds = [...new Set(state.players.flatMap((player) => player.weapons.map((weapon) => weapon.def.id)))];
  const summary: RunSummary = {
    wave: state.wave,
    level: state.squad.level,
    kills: state.kills,
    won: false,
    difficultyId: state.difficulty.id,
    characterIds: state.players.map((player) => player.character.id),
    weaponIds,
    playerCount: state.players.length,
    metrics: cloneRunMetrics(state.metrics),
  };
  addShards(reward);
  recordRun(state.wave, state.kills, false, summary);
  return reward;
}
