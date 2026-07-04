export interface SpawnEntry {
  defId: string;
  weight: number;
}

export interface WaveDef {
  duration: number;
  spawnInterval: [start: number, end: number]; // lerps down over the wave
  table: SpawnEntry[];
  maxAlive: number;
  boss?: string; // wave ends on boss death, not timer
}

/**
 * Wave definition for any wave number.
 * 1-10 authored; 11-19 synthesized campaign; bosses at 15 (Жнец) and 20 (Владыка);
 * 21+ endless with a boss every 5th wave.
 */
export function getWaveDef(wave: number): WaveDef {
  if (wave <= WAVES.length) return WAVES[wave - 1];
  const k = wave - 10;
  // boss waves: 15 — Reaper, 20 — final Overlord, endless bosses alternate
  const bossId = wave === 15 ? 'reaper' : wave === 20 ? 'overlord' : wave > 20 && wave % 5 === 0 ? (wave % 10 === 5 ? 'reaper' : 'overlord') : null;
  if (bossId) {
    return {
      duration: 999,
      spawnInterval: [1.4, 0.9],
      table: [
        { defId: 'chaser', weight: 3 },
        { defId: 'runner', weight: 2 },
        { defId: 'sprinter', weight: 1 },
        { defId: 'tank', weight: 1 },
      ],
      maxAlive: 100,
      boss: bossId,
    };
  }
  return {
    duration: Math.min(60, 42 + k),
    spawnInterval: [Math.max(0.16, 0.26 - k * 0.01), Math.max(0.07, 0.11 - k * 0.004)],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 3 },
      { defId: 'sprinter', weight: 2.5 },
      { defId: 'bomber', weight: 1.6 },
      { defId: 'shieldbearer', weight: 1.6 },
      { defId: 'summoner', weight: 1.1 },
      { defId: 'splitter', weight: 1.6 },
      { defId: 'hopper', weight: 1.4 },
      { defId: 'frost', weight: 1.3 },
      { defId: 'shooter', weight: 2.5 },
      { defId: 'tank', weight: 2.5 },
    ],
    maxAlive: Math.min(320, 280 + k * 8),
  };
}

export const WAVES: readonly WaveDef[] = [
  // 1
  {
    duration: 20,
    spawnInterval: [0.7, 0.44],
    table: [{ defId: 'chaser', weight: 1 }],
    maxAlive: 94,
  },
  // 2
  {
    duration: 25,
    spawnInterval: [0.58, 0.35],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 1 },
    ],
    maxAlive: 125,
  },
  // 3
  {
    duration: 30,
    spawnInterval: [0.51, 0.29],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 2 },
      { defId: 'hopper', weight: 1.5 },
    ],
    maxAlive: 156,
  },
  // 4
  {
    duration: 30,
    spawnInterval: [0.48, 0.29],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 2 },
      { defId: 'hopper', weight: 1.5 },
      { defId: 'splitter', weight: 1.2 },
      { defId: 'shooter', weight: 1 },
    ],
    maxAlive: 172,
  },
  // 5 — mid-boss wave: the Brute leads the pack, wave ends on his death
  {
    duration: 999,
    spawnInterval: [0.64, 0.38],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 2 },
    ],
    maxAlive: 109,
    boss: 'brute',
  },
  // 6
  {
    duration: 40,
    spawnInterval: [0.4, 0.22],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 2.5 },
      { defId: 'sprinter', weight: 1 },
      { defId: 'hopper', weight: 1.2 },
      { defId: 'splitter', weight: 1.2 },
      { defId: 'frost', weight: 1 },
      { defId: 'shooter', weight: 1.5 },
      { defId: 'tank', weight: 1 },
    ],
    maxAlive: 234,
  },
  // 7
  {
    duration: 45,
    spawnInterval: [0.35, 0.2],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 3 },
      { defId: 'sprinter', weight: 1.5 },
      { defId: 'bomber', weight: 1.2 },
      { defId: 'shooter', weight: 2 },
      { defId: 'tank', weight: 1.5 },
    ],
    maxAlive: 281,
  },
  // 8
  {
    duration: 50,
    spawnInterval: [0.29, 0.14],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 3 },
      { defId: 'sprinter', weight: 2 },
      { defId: 'bomber', weight: 1.3 },
      { defId: 'shieldbearer', weight: 1.2 },
      { defId: 'splitter', weight: 1.3 },
      { defId: 'frost', weight: 1.1 },
      { defId: 'shooter', weight: 2 },
      { defId: 'tank', weight: 2 },
    ],
    maxAlive: 320,
  },
  // 9
  {
    duration: 55,
    spawnInterval: [0.26, 0.11],
    table: [
      { defId: 'chaser', weight: 4 },
      { defId: 'runner', weight: 3 },
      { defId: 'sprinter', weight: 2 },
      { defId: 'bomber', weight: 1.4 },
      { defId: 'shieldbearer', weight: 1.4 },
      { defId: 'summoner', weight: 0.9 },
      { defId: 'splitter', weight: 1.3 },
      { defId: 'frost', weight: 1.2 },
      { defId: 'shooter', weight: 2.5 },
      { defId: 'tank', weight: 2.5 },
    ],
    maxAlive: 320,
  },
  // 10 — boss wave
  {
    duration: 999,
    spawnInterval: [1.02, 0.64],
    table: [
      { defId: 'chaser', weight: 3 },
      { defId: 'runner', weight: 2 },
    ],
    maxAlive: 125,
    boss: 'boss',
  },
];
