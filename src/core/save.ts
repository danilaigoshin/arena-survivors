export interface MetaStats {
  runs: number;
  wins: number;
  bestWave: number;
  bestKills: number;
}

export interface MetaSave {
  v: 2;
  shards: number;
  unlocked: string[]; // character/weapon ids bought in the meta screen
  perks: Record<string, number>; // perk id -> level
  stats: MetaStats;
}

const KEY = 'as_meta';

const DEFAULT_STATS: MetaStats = { runs: 0, wins: 0, bestWave: 0, bestKills: 0 };

let cached: MetaSave | null = null;

export function loadMeta(): MetaSave {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Omit<Partial<MetaSave>, 'v'> & { v?: number };
      // v1 → v2: additive migration, existing shards/unlocks survive
      if (parsed && (parsed.v === 1 || parsed.v === 2) && typeof parsed.shards === 'number') {
        cached = {
          v: 2,
          shards: parsed.shards,
          unlocked: parsed.unlocked ?? [],
          perks: parsed.perks ?? {},
          stats: { ...DEFAULT_STATS, ...(parsed.stats ?? {}) },
        };
        return cached;
      }
    }
  } catch {
    // corrupted save — start fresh
  }
  cached = { v: 2, shards: 0, unlocked: [], perks: {}, stats: { ...DEFAULT_STATS } };
  return cached;
}

/** Records a finished run and updates records. */
export function recordRun(wave: number, kills: number, won: boolean): void {
  const m = loadMeta();
  m.stats.runs++;
  if (won) m.stats.wins++;
  m.stats.bestWave = Math.max(m.stats.bestWave, wave);
  m.stats.bestKills = Math.max(m.stats.bestKills, kills);
  saveMeta();
}

export function saveMeta(): void {
  if (!cached) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // storage unavailable (private mode etc.) — meta just won't persist
  }
}

export function addShards(n: number): void {
  const m = loadMeta();
  m.shards += n;
  saveMeta();
}

export function isUnlocked(id: string): boolean {
  return loadMeta().unlocked.includes(id);
}

export function tryUnlock(id: string, cost: number): boolean {
  const m = loadMeta();
  if (m.unlocked.includes(id) || m.shards < cost) return false;
  m.shards -= cost;
  m.unlocked.push(id);
  saveMeta();
  return true;
}

export function perkLevel(id: string): number {
  return loadMeta().perks[id] ?? 0;
}

export function tryBuyPerk(id: string, cost: number, maxLevel: number): boolean {
  const m = loadMeta();
  const lvl = m.perks[id] ?? 0;
  if (lvl >= maxLevel || m.shards < cost) return false;
  m.shards -= cost;
  m.perks[id] = lvl + 1;
  saveMeta();
  return true;
}
