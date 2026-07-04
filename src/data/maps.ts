import { ARENA_W, ARENA_H } from '../config';

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  sprite: string;
}

export type MapPattern = 'scatter' | 'grid' | 'lines' | 'corners';

export type AmbientKind = 'fireflies' | 'snow' | 'embers' | 'dust' | 'motes';

/** Purely visual floor decoration; sprite names or procedural kinds handled in render/floor.ts */
export interface DecorEntry {
  kind: string;
  count: number;
}

export interface MapTheme {
  name: string;
  floorInner: string;
  floorOuter: string;
  borderColor: string;
  /** extra ground tones for soft patches and speckles */
  groundTones: string[];
  /** stone-slab seams instead of bare ground (Ruins/Fortress) */
  tileSize?: number;
  decor: DecorEntry[];
  ambient: AmbientKind;
  /** strength of the darkness vignette focusing light on the player (0..0.4) */
  darkness: number;
  /** winding dirt path baked into the floor */
  path?: { color: string; width: number };
  /** live ambient particle count (default 26) */
  ambientDensity?: number;
  /** full-screen color grade tint, drawn at ~6% alpha (plain source-over) */
  grade?: string;
  obstacleSprites: string[];
  pattern: MapPattern;
  /** target obstacle count for scatter/lines */
  density: number;
}

/** One theme per wave — the arena looks and plays differently every level. */
export const THEMES: readonly MapTheme[] = [
  {
    name: 'Луга', floorInner: '#1b241b', floorOuter: '#111811', borderColor: '#4a6a4a',
    groundTones: ['#243424', '#2c3e28', '#161f16'],
    decor: [{ kind: 'grass', count: 46 }, { kind: 'flower', count: 18 }, { kind: 'pebbles', count: 20 }, { kind: 'lightpatch', count: 8 }],
    path: { color: '#3a3226', width: 58 },
    ambient: 'fireflies', darkness: 0.14, obstacleSprites: ['tree', 'rock'], pattern: 'scatter', density: 10,
  },
  {
    name: 'Кладбище', floorInner: '#201d28', floorOuter: '#14121a', borderColor: '#5a5272',
    groundTones: ['#2a2636', '#232030', '#161320'],
    decor: [{ kind: 'bone', count: 14 }, { kind: 'skull_d', count: 8 }, { kind: 'mound', count: 12 }, { kind: 'mist', count: 10 }],
    path: { color: '#1c1926', width: 52 },
    ambient: 'motes', darkness: 0.3, obstacleSprites: ['tombstone', 'tombstone', 'tree'], pattern: 'lines', density: 14,
  },
  {
    name: 'Тёмный лес', floorInner: '#16211a', floorOuter: '#0d1410', borderColor: '#3a5a44',
    groundTones: ['#1e2c20', '#25341f', '#101a12'],
    decor: [{ kind: 'grass', count: 34 }, { kind: 'mushroom', count: 14 }, { kind: 'stump', count: 8 }, { kind: 'leafpatch', count: 14 }],
    ambient: 'fireflies', darkness: 0.32, obstacleSprites: ['tree'], pattern: 'scatter', density: 16,
  },
  {
    name: 'Пустошь', floorInner: '#262016', floorOuter: '#17130d', borderColor: '#7a6640',
    groundTones: ['#322a1c', '#3a3020', '#1e180f'],
    decor: [{ kind: 'ripple', count: 26 }, { kind: 'bone', count: 10 }, { kind: 'crack', count: 10 }, { kind: 'pebbles', count: 24 }],
    path: { color: '#42351e', width: 64 }, grade: '#c8963c', ambientDensity: 18,
    ambient: 'dust', darkness: 0.16, obstacleSprites: ['rock', 'crate'], pattern: 'corners', density: 12,
  },
  {
    name: 'Ледник', floorInner: '#1a222e', floorOuter: '#0f141c', borderColor: '#4a6a8c',
    groundTones: ['#223044', '#2a3a52', '#131a26'],
    decor: [{ kind: 'iceshard', count: 16 }, { kind: 'icecrack', count: 14 }, { kind: 'snowdrift', count: 20 }, { kind: 'glints', count: 26 }],
    grade: '#4a90d8', ambientDensity: 36,
    ambient: 'snow', darkness: 0.2, obstacleSprites: ['crystal', 'rock'], pattern: 'scatter', density: 13,
  },
  {
    name: 'Пепелище', floorInner: '#281816', floorOuter: '#170e0d', borderColor: '#8c4a42',
    groundTones: ['#33201c', '#3c2620', '#1a0f0d'],
    decor: [{ kind: 'lavacrack', count: 18 }, { kind: 'emberdots', count: 30 }, { kind: 'scorch', count: 14 }],
    grade: '#ff6030', ambientDensity: 36,
    ambient: 'embers', darkness: 0.28, obstacleSprites: ['rock'], pattern: 'grid', density: 12,
  },
  {
    name: 'Руины', floorInner: '#22222a', floorOuter: '#141419', borderColor: '#6a6a80',
    groundTones: ['#2b2b36', '#32323e', '#191920'],
    tileSize: 150,
    decor: [{ kind: 'moss', count: 12 }, { kind: 'debris', count: 10 }, { kind: 'skull_d', count: 4 }, { kind: 'crack', count: 8 }],
    ambient: 'motes', darkness: 0.26, obstacleSprites: ['pillar', 'rock'], pattern: 'grid', density: 12,
  },
  {
    name: 'Болото', floorInner: '#1c2418', floorOuter: '#11160e', borderColor: '#5a6a3a',
    groundTones: ['#26301e', '#1e2a22', '#131a10'],
    decor: [{ kind: 'puddle', count: 16 }, { kind: 'reed', count: 26 }, { kind: 'moss', count: 14 }, { kind: 'grass', count: 20 }],
    path: { color: '#141c10', width: 56 }, grade: '#6a9a30',
    ambient: 'fireflies', darkness: 0.28, obstacleSprites: ['tree', 'rock', 'tombstone'], pattern: 'scatter', density: 18,
  },
  {
    name: 'Крепость', floorInner: '#20202a', floorOuter: '#121218', borderColor: '#7a5a3a',
    groundTones: ['#2a2a36', '#30303e', '#18181f'],
    tileSize: 190,
    decor: [{ kind: 'torchlight', count: 8 }, { kind: 'debris', count: 8 }, { kind: 'crack', count: 8 }, { kind: 'pebbles', count: 14 }],
    ambientDensity: 18,
    ambient: 'dust', darkness: 0.3, obstacleSprites: ['crate', 'crate', 'pillar'], pattern: 'lines', density: 16,
  },
  {
    name: 'Логово демона', floorInner: '#2a1418', floorOuter: '#160b0d', borderColor: '#a03a44',
    groundTones: ['#38181e', '#421c22', '#1c0c0f'],
    decor: [{ kind: 'pentagram', count: 1 }, { kind: 'lavacrack', count: 16 }, { kind: 'bone', count: 12 }, { kind: 'skull_d', count: 8 }],
    grade: '#ff3040', ambientDensity: 34,
    ambient: 'embers', darkness: 0.34, obstacleSprites: ['pillar'], pattern: 'corners', density: 4,
  },
];

const SPRITE_RADIUS: Record<string, number> = {
  tree: 30,
  rock: 26,
  pillar: 22,
  crystal: 24,
  tombstone: 20,
  crate: 22,
};

// local seeded rng — independent from the gameplay RNG
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTER_CLEAR = 240; // spawn area stays free
const EDGE_MARGIN = 90;

function fits(obstacles: Obstacle[], x: number, y: number, r: number): boolean {
  const cx = ARENA_W / 2;
  const cy = ARENA_H / 2;
  if ((x - cx) ** 2 + (y - cy) ** 2 < (CENTER_CLEAR + r) ** 2) return false;
  if (x < EDGE_MARGIN + r || x > ARENA_W - EDGE_MARGIN - r || y < EDGE_MARGIN + r || y > ARENA_H - EDGE_MARGIN - r) return false;
  for (const ob of obstacles) {
    const min = ob.radius + r + 40;
    if ((x - ob.x) ** 2 + (y - ob.y) ** 2 < min * min) return false;
  }
  return true;
}

export function generateMap(wave: number): { theme: MapTheme; obstacles: Obstacle[] } {
  const theme = THEMES[(wave - 1) % THEMES.length];
  const rng = makeRng(wave * 7919 + 1337);
  const obstacles: Obstacle[] = [];
  const pick = (): string => theme.obstacleSprites[Math.floor(rng() * theme.obstacleSprites.length)];
  const tryAdd = (x: number, y: number): void => {
    const sprite = pick();
    const r = SPRITE_RADIUS[sprite];
    if (fits(obstacles, x, y, r)) obstacles.push({ x, y, radius: r, sprite });
  };

  switch (theme.pattern) {
    case 'scatter': {
      let attempts = 0;
      while (obstacles.length < theme.density && attempts++ < 200) {
        tryAdd(EDGE_MARGIN + rng() * (ARENA_W - EDGE_MARGIN * 2), EDGE_MARGIN + rng() * (ARENA_H - EDGE_MARGIN * 2));
      }
      break;
    }
    case 'grid': {
      const step = 340;
      for (let gx = step; gx < ARENA_W - EDGE_MARGIN; gx += step) {
        for (let gy = step * 0.75; gy < ARENA_H - EDGE_MARGIN; gy += step * 0.85) {
          if (rng() < 0.25) continue; // gaps
          tryAdd(gx + (rng() - 0.5) * 90, gy + (rng() - 0.5) * 90);
        }
      }
      break;
    }
    case 'lines': {
      const ys = [ARENA_H * 0.28, ARENA_H * 0.5, ARENA_H * 0.72];
      for (const y of ys) {
        for (let x = EDGE_MARGIN + 60; x < ARENA_W - EDGE_MARGIN; x += 170) {
          if (rng() < 0.35) continue; // gaps to walk through
          tryAdd(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 50);
        }
      }
      break;
    }
    case 'corners': {
      const pts: [number, number][] = [
        [ARENA_W * 0.25, ARENA_H * 0.25],
        [ARENA_W * 0.75, ARENA_H * 0.25],
        [ARENA_W * 0.25, ARENA_H * 0.75],
        [ARENA_W * 0.75, ARENA_H * 0.75],
      ];
      const perCluster = Math.max(1, Math.round(theme.density / 4));
      for (const [px, py] of pts) {
        for (let i = 0; i < perCluster; i++) {
          tryAdd(px + (rng() - 0.5) * 260, py + (rng() - 0.5) * 220);
        }
      }
      break;
    }
  }
  return { theme, obstacles };
}

/** Pushes a circular entity out of all overlapping obstacles (mutates ent). */
export function pushOutOfObstacles(obstacles: readonly Obstacle[], ent: { x: number; y: number; radius: number }): void {
  for (const ob of obstacles) {
    const rr = ob.radius + ent.radius;
    const dx = ent.x - ob.x;
    const dy = ent.y - ob.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    if (d2 < 1e-6) {
      ent.x = ob.x + rr;
      continue;
    }
    const d = Math.sqrt(d2);
    ent.x = ob.x + (dx / d) * rr;
    ent.y = ob.y + (dy / d) * rr;
  }
}

/** True if a point circle overlaps any obstacle. */
export function hitsObstacle(obstacles: readonly Obstacle[], x: number, y: number, r: number): boolean {
  for (const ob of obstacles) {
    const rr = ob.radius + r;
    if ((x - ob.x) ** 2 + (y - ob.y) ** 2 < rr * rr) return true;
  }
  return false;
}
