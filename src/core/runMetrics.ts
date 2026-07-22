import type { PlayerSlot } from '../multiplayer/types';

export interface RunMetrics {
  duration: number;
  damageDealt: [number, number];
  damageTaken: [number, number];
  healing: [number, number];
  abilityUses: [number, number];
  materialsCollected: number;
  objectivesCompleted: number;
  bossesKilled: number;
  maxWeapons: [number, number];
  weaponDamage: [Record<string, number>, Record<string, number>];
  enemyKills: Record<string, number>;
  evolvedWeapons: string[];
  routeIds: string[];
  lastDamageSource: [string, string];
}

export interface RunSummary {
  wave: number;
  level: number;
  kills: number;
  won: boolean;
  difficultyId: string;
  characterIds: string[];
  weaponIds: string[];
  playerCount: number;
  metrics: RunMetrics;
}

export function createRunMetrics(): RunMetrics {
  return {
    duration: 0,
    damageDealt: [0, 0],
    damageTaken: [0, 0],
    healing: [0, 0],
    abilityUses: [0, 0],
    materialsCollected: 0,
    objectivesCompleted: 0,
    bossesKilled: 0,
    maxWeapons: [1, 1],
    weaponDamage: [{}, {}],
    enemyKills: {},
    evolvedWeapons: [],
    routeIds: [],
    lastDamageSource: ['', ''],
  };
}

/** Defensive normalizer shared by local checkpoints and network end reports. */
export function normalizeRunMetrics(value: unknown): RunMetrics {
  const fallback = createRunMetrics();
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<RunMetrics>;
  const pair = (entry: unknown, defaults: [number, number]): [number, number] => {
    if (!Array.isArray(entry) || entry.length !== 2) return [...defaults];
    return entry.map((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 ? item : 0) as [number, number];
  };
  const record = (entry: unknown): Record<string, number> => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {};
    return Object.fromEntries(Object.entries(entry).slice(0, 128).filter(([key, amount]) => (
      key.length > 0 && key.length < 100 && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
    )));
  };
  const strings = (entry: unknown): string[] => Array.isArray(entry)
    ? [...new Set(entry.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 100))].slice(0, 128)
    : [];
  return {
    duration: typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? Math.max(0, raw.duration) : 0,
    damageDealt: pair(raw.damageDealt, fallback.damageDealt),
    damageTaken: pair(raw.damageTaken, fallback.damageTaken),
    healing: pair(raw.healing, fallback.healing),
    abilityUses: pair(raw.abilityUses, fallback.abilityUses),
    materialsCollected: typeof raw.materialsCollected === 'number' && Number.isFinite(raw.materialsCollected)
      ? Math.max(0, raw.materialsCollected)
      : 0,
    objectivesCompleted: typeof raw.objectivesCompleted === 'number' && Number.isFinite(raw.objectivesCompleted)
      ? Math.max(0, Math.floor(raw.objectivesCompleted))
      : 0,
    bossesKilled: typeof raw.bossesKilled === 'number' && Number.isFinite(raw.bossesKilled)
      ? Math.max(0, Math.floor(raw.bossesKilled))
      : 0,
    maxWeapons: pair(raw.maxWeapons, fallback.maxWeapons),
    weaponDamage: Array.isArray(raw.weaponDamage) && raw.weaponDamage.length === 2
      ? [record(raw.weaponDamage[0]), record(raw.weaponDamage[1])]
      : fallback.weaponDamage,
    enemyKills: record(raw.enemyKills),
    evolvedWeapons: strings(raw.evolvedWeapons),
    routeIds: strings(raw.routeIds).slice(0, 3),
    lastDamageSource: Array.isArray(raw.lastDamageSource) && raw.lastDamageSource.length === 2
      ? raw.lastDamageSource.map((id) => typeof id === 'string' && id.length < 100 ? id : '') as [string, string]
      : ['', ''],
  };
}

export function recordDamage(
  metrics: RunMetrics,
  slot: PlayerSlot,
  damage: number,
  sourceId = 'ability',
): void {
  if (!Number.isFinite(damage) || damage <= 0) return;
  metrics.damageDealt[slot] += damage;
  metrics.weaponDamage[slot][sourceId] = (metrics.weaponDamage[slot][sourceId] ?? 0) + damage;
}

export function cloneRunMetrics(metrics: RunMetrics): RunMetrics {
  return {
    ...metrics,
    damageDealt: [...metrics.damageDealt],
    damageTaken: [...metrics.damageTaken],
    healing: [...metrics.healing],
    abilityUses: [...metrics.abilityUses],
    maxWeapons: [...metrics.maxWeapons],
    weaponDamage: [{ ...metrics.weaponDamage[0] }, { ...metrics.weaponDamage[1] }],
    enemyKills: { ...metrics.enemyKills },
    evolvedWeapons: [...metrics.evolvedWeapons],
    routeIds: [...metrics.routeIds],
    lastDamageSource: [...metrics.lastDamageSource],
  };
}
