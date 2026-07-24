import type { Game } from '../game';
import { CHARACTERS } from '../data/characters';
import { DIFFICULTIES } from '../data/difficulty';
import { applyBuildState, captureBuildState, type BuildState } from '../multiplayer/stateProtocol';
import { cloneRunMetrics, normalizeRunMetrics, type RunMetrics } from './runMetrics';
import { WAVE_CONTRACTS } from '../data/contracts';
import { ROUTES } from '../data/routes';

export interface RunCheckpoint {
  v: 1;
  savedAt: number;
  wave: number;
  kills: number;
  difficultyId: string;
  squad: { xp: number; level: number; materials: number };
  build: BuildState;
  metrics: RunMetrics;
  routeIds: string[];
  activeContractId?: string;
}

const KEY = 'as_checkpoint';

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizeCheckpoint(value: unknown): RunCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RunCheckpoint>;
  if (
    raw.v !== 1
    || !Number.isInteger(raw.wave)
    || raw.wave! < 1
    || raw.wave! > 999
    || typeof raw.kills !== 'number'
    || !raw.squad
    || typeof raw.squad !== 'object'
    || !raw.build
    || typeof raw.difficultyId !== 'string'
    || !DIFFICULTIES.some((entry) => entry.id === raw.difficultyId)
  ) return null;
  const squad = raw.squad;
  if (
    !Number.isFinite(squad.xp)
    || !Number.isInteger(squad.level)
    || squad.level < 1
    || !Number.isFinite(squad.materials)
    || squad.xp < 0
    || squad.materials < 0
  ) return null;
  return {
    v: 1,
    savedAt: typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now(),
    wave: raw.wave!,
    kills: Math.max(0, Math.floor(raw.kills)),
    difficultyId: raw.difficultyId,
    squad: { xp: squad.xp, level: squad.level, materials: squad.materials },
    build: raw.build,
    metrics: normalizeRunMetrics(raw.metrics),
    routeIds: Array.isArray(raw.routeIds)
      ? raw.routeIds.filter((id): id is string => typeof id === 'string' && ROUTES.some((route) => route.id === id)).slice(0, 3)
      : [],
    activeContractId: typeof raw.activeContractId === 'string'
      && WAVE_CONTRACTS.some((contract) => contract.id === raw.activeContractId)
      ? raw.activeContractId
      : undefined,
  };
}

export function loadCheckpoint(): RunCheckpoint | null {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? normalizeCheckpoint(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveCheckpoint(game: Game): boolean {
  if (game.sessionRole !== 'solo' || game.state.players.length !== 1) return false;
  const checkpoint: RunCheckpoint = {
    v: 1,
    savedAt: Date.now(),
    wave: game.state.wave,
    kills: game.state.kills,
    difficultyId: game.state.difficulty.id,
    squad: {
      xp: game.state.squad.xp,
      level: game.state.squad.level,
      materials: game.localPlayer.materials,
    },
    build: captureBuildState(game.state, 0),
    metrics: cloneRunMetrics(game.state.metrics),
    routeIds: [...game.state.routeIds],
    activeContractId: game.state.activeContract?.id,
  };
  try {
    storage()?.setItem(KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

export function restoreCheckpoint(game: Game): boolean {
  const checkpoint = loadCheckpoint();
  if (!checkpoint || checkpoint.build.players.length !== 1) return false;
  const character = CHARACTERS.find((entry) => entry.id === checkpoint.build.players[0].characterId);
  const difficulty = DIFFICULTIES.find((entry) => entry.id === checkpoint.difficultyId);
  if (!character || !difficulty) return false;
  game.newRun(character);
  if (!applyBuildState(game.state, checkpoint.build)) return false;
  game.state.wave = checkpoint.wave;
  game.state.kills = checkpoint.kills;
  game.state.difficulty = difficulty;
  game.state.squad = { ...checkpoint.squad };
  game.localPlayer.materials = checkpoint.squad.materials;
  game.state.metrics = cloneRunMetrics(checkpoint.metrics);
  game.state.routeIds = [...checkpoint.routeIds];
  game.state.activeContract = checkpoint.activeContractId
    ? WAVE_CONTRACTS.find((contract) => contract.id === checkpoint.activeContractId) ?? null
    : null;
  for (const player of game.state.players) player.hp = player.stats.maxHp;
  return true;
}

export function clearCheckpoint(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing else is required if storage is unavailable.
  }
}

export function exportCheckpoint(): RunCheckpoint | null {
  const checkpoint = loadCheckpoint();
  return checkpoint ? structuredClone(checkpoint) : null;
}

export function importCheckpoint(value: unknown): boolean {
  if (value === null) {
    clearCheckpoint();
    return true;
  }
  const checkpoint = normalizeCheckpoint(value);
  if (!checkpoint) return false;
  try {
    storage()?.setItem(KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}
