import { CHALLENGES, COSMETICS } from '../data/challenges';
import { ENEMIES } from '../data/enemies';
import { EVOLUTIONS } from '../data/evolutions';
import { WEAPONS } from '../data/weapons';
import type { RunSummary } from './runMetrics';

export interface MetaStats {
  runs: number;
  wins: number;
  bestWave: number;
  bestKills: number;
  totalKills: number;
  totalPlaySeconds: number;
  bestDamage: number;
}

export interface MetaSave {
  v: 3;
  shards: number;
  unlocked: string[];
  perks: Record<string, number>;
  stats: MetaStats;
  mastery: {
    heroes: Record<string, number>;
    weapons: Record<string, number>;
  };
  challenges: string[];
  codex: {
    enemies: string[];
    weapons: string[];
    evolutions: string[];
  };
  cosmetics: {
    unlocked: string[];
    selected: string;
  };
  tutorial: string[];
}

export interface ProgressionGain {
  challengeIds: string[];
  challengeShards: number;
  masteryLevels: { id: string; before: number; after: number }[];
  newCodexEntries: string[];
}

const KEY = 'as_meta';
const challengeIds = new Set(CHALLENGES.map((challenge) => challenge.id));
const cosmeticIds = new Set<string>(COSMETICS.map((cosmetic) => cosmetic.id));
const enemyIds = new Set(ENEMIES.map((enemy) => enemy.id));
const weaponIds = new Set(WEAPONS.map((weapon) => weapon.id));
const evolutionIds = new Set(EVOLUTIONS.map((evolution) => evolution.result));
const tutorialIds = new Set(['movement', 'ability', 'objective', 'boss', 'shop', 'merge', 'evolution']);

const DEFAULT_STATS: MetaStats = {
  runs: 0,
  wins: 0,
  bestWave: 0,
  bestKills: 0,
  totalKills: 0,
  totalPlaySeconds: 0,
  bestDamage: 0,
};

let cached: MetaSave | null = null;

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length < 80))]
    : [];
}

function numbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value)) {
    if (key.length < 80 && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) result[key] = amount;
  }
  return result;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeMeta(value: unknown): MetaSave | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Omit<MetaSave, 'v'>> & { v?: number };
  if (raw.v !== 1 && raw.v !== 2 && raw.v !== 3) return null;
  if (typeof raw.shards !== 'number' || !Number.isFinite(raw.shards) || raw.shards < 0) return null;
  const stats = raw.stats as Partial<MetaStats> | undefined;
  const mastery = raw.mastery as MetaSave['mastery'] | undefined;
  const codex = raw.codex as MetaSave['codex'] | undefined;
  const cosmetics = raw.cosmetics as MetaSave['cosmetics'] | undefined;
  const cosmeticUnlocks = strings(cosmetics?.unlocked).filter((id) => cosmeticIds.has(id));
  if (!cosmeticUnlocks.includes('none')) cosmeticUnlocks.unshift('none');
  const selected = typeof cosmetics?.selected === 'string' && cosmeticUnlocks.includes(cosmetics.selected)
    ? cosmetics.selected
    : 'none';
  return {
    v: 3,
    shards: Math.floor(raw.shards),
    unlocked: strings(raw.unlocked),
    perks: numbers(raw.perks),
    stats: {
      runs: Math.floor(safeNumber(stats?.runs)),
      wins: Math.floor(safeNumber(stats?.wins)),
      bestWave: Math.floor(safeNumber(stats?.bestWave)),
      bestKills: Math.floor(safeNumber(stats?.bestKills)),
      totalKills: Math.floor(safeNumber(stats?.totalKills)),
      totalPlaySeconds: safeNumber(stats?.totalPlaySeconds),
      bestDamage: Math.floor(safeNumber(stats?.bestDamage)),
    },
    mastery: {
      heroes: numbers(mastery?.heroes),
      weapons: numbers(mastery?.weapons),
    },
    challenges: strings(raw.challenges).filter((id) => challengeIds.has(id)),
    codex: {
      enemies: strings(codex?.enemies).filter((id) => enemyIds.has(id)),
      weapons: strings(codex?.weapons).filter((id) => weaponIds.has(id)),
      evolutions: strings(codex?.evolutions).filter((id) => evolutionIds.has(id)),
    },
    cosmetics: { unlocked: cosmeticUnlocks, selected },
    tutorial: strings(raw.tutorial).filter((id) => tutorialIds.has(id)),
  };
}

function defaultMeta(): MetaSave {
  return {
    v: 3,
    shards: 0,
    unlocked: [],
    perks: {},
    stats: { ...DEFAULT_STATS },
    mastery: { heroes: {}, weapons: {} },
    challenges: [],
    codex: { enemies: [], weapons: [], evolutions: [] },
    cosmetics: { unlocked: ['none'], selected: 'none' },
    tutorial: [],
  };
}

export function loadMeta(): MetaSave {
  if (cached) return cached;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const parsed = normalizeMeta(JSON.parse(raw));
      if (parsed) return (cached = parsed);
    }
  } catch {
    // Corruption is recoverable through an imported backup.
  }
  cached = defaultMeta();
  return cached;
}

export function saveMeta(): void {
  if (!cached) return;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // The current session remains playable without persistent storage.
  }
}

export function exportMeta(): MetaSave {
  return structuredClone(loadMeta());
}

export function importMeta(value: unknown): boolean {
  const parsed = normalizeMeta(value);
  if (!parsed) return false;
  cached = parsed;
  saveMeta();
  return true;
}

export function resetMeta(): MetaSave {
  cached = defaultMeta();
  saveMeta();
  return cached;
}

export function masteryLevel(points: number): number {
  return Math.floor(Math.sqrt(Math.max(0, points) / 25));
}

function addUnique(target: string[], values: readonly string[], gained: string[]): void {
  for (const value of values) {
    if (target.includes(value)) continue;
    target.push(value);
    gained.push(value);
  }
}

/** Records a finished run and returns newly unlocked progression. */
export function recordRun(wave: number, kills: number, won: boolean, run?: RunSummary): ProgressionGain {
  const meta = loadMeta();
  const gain: ProgressionGain = { challengeIds: [], challengeShards: 0, masteryLevels: [], newCodexEntries: [] };
  meta.stats.runs++;
  if (won) meta.stats.wins++;
  meta.stats.bestWave = Math.max(meta.stats.bestWave, wave);
  meta.stats.bestKills = Math.max(meta.stats.bestKills, kills);
  meta.stats.totalKills += Math.max(0, kills);

  if (run) {
    const totalDamage = run.metrics.damageDealt.reduce((sum, value) => sum + value, 0);
    meta.stats.totalPlaySeconds += Math.max(0, run.metrics.duration);
    meta.stats.bestDamage = Math.max(meta.stats.bestDamage, Math.round(totalDamage));
    addUnique(meta.codex.enemies, Object.keys(run.metrics.enemyKills), gain.newCodexEntries);
    addUnique(meta.codex.weapons, run.weaponIds, gain.newCodexEntries);
    addUnique(meta.codex.evolutions, run.metrics.evolvedWeapons, gain.newCodexEntries);

    for (const id of run.characterIds) {
      const beforePoints = meta.mastery.heroes[id] ?? 0;
      const before = masteryLevel(beforePoints);
      meta.mastery.heroes[id] = beforePoints + wave * 2 + (won ? 30 : 0);
      const after = masteryLevel(meta.mastery.heroes[id]);
      if (after > before) gain.masteryLevels.push({ id, before, after });
    }
    for (const id of run.weaponIds) {
      const beforePoints = meta.mastery.weapons[id] ?? 0;
      const before = masteryLevel(beforePoints);
      const weaponDamage = run.metrics.weaponDamage.reduce((sum, byWeapon) => sum + (byWeapon[id] ?? 0), 0);
      meta.mastery.weapons[id] = beforePoints + wave + Math.floor(weaponDamage / 1000) + (won ? 10 : 0);
      const after = masteryLevel(meta.mastery.weapons[id]);
      if (after > before) gain.masteryLevels.push({ id, before, after });
    }

    const progress = {
      runs: meta.stats.runs,
      wins: meta.stats.wins,
      bestWave: meta.stats.bestWave,
      totalKills: meta.stats.totalKills,
      codexEvolutions: meta.codex.evolutions.length,
    };
    for (const challenge of CHALLENGES) {
      if (meta.challenges.includes(challenge.id) || !challenge.completed(progress, run)) continue;
      meta.challenges.push(challenge.id);
      meta.shards += challenge.reward;
      gain.challengeIds.push(challenge.id);
      gain.challengeShards += challenge.reward;
      if (challenge.cosmetic && !meta.cosmetics.unlocked.includes(challenge.cosmetic)) {
        meta.cosmetics.unlocked.push(challenge.cosmetic);
      }
    }
  }
  saveMeta();
  return gain;
}

export function addShards(n: number): void {
  const meta = loadMeta();
  meta.shards = Math.max(0, meta.shards + Math.floor(n));
  saveMeta();
}

export function isUnlocked(id: string): boolean {
  return loadMeta().unlocked.includes(id);
}

export function tryUnlock(id: string, cost: number): boolean {
  const meta = loadMeta();
  if (meta.unlocked.includes(id) || meta.shards < cost) return false;
  meta.shards -= cost;
  meta.unlocked.push(id);
  saveMeta();
  return true;
}

export function perkLevel(id: string): number {
  return loadMeta().perks[id] ?? 0;
}

export function tryBuyPerk(id: string, cost: number, maxLevel: number): boolean {
  const meta = loadMeta();
  const level = meta.perks[id] ?? 0;
  if (level >= maxLevel || meta.shards < cost) return false;
  meta.shards -= cost;
  meta.perks[id] = level + 1;
  saveMeta();
  return true;
}

export function tutorialSeen(id: string): boolean {
  return loadMeta().tutorial.includes(id);
}

export function markTutorial(id: string): void {
  const meta = loadMeta();
  if (!meta.tutorial.includes(id)) meta.tutorial.push(id);
  saveMeta();
}

export function resetTutorial(): void {
  loadMeta().tutorial = [];
  saveMeta();
}

export function selectCosmetic(id: string): boolean {
  const meta = loadMeta();
  if (!meta.cosmetics.unlocked.includes(id)) return false;
  meta.cosmetics.selected = id;
  saveMeta();
  return true;
}
