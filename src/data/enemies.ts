export type EnemyAI = 'chase' | 'keepDistanceShoot' | 'chargeDash' | 'summoner' | 'hopper' | 'boss';

export interface EnemyDef {
  id: string;
  emoji: string;
  radius: number;
  hp: number;
  speed: number;
  contactDamage: number;
  materialDrop: number; // avg materials dropped
  ai: EnemyAI;
  hpScale: number; // hp *= 1 + hpScale*(wave-1)
  dmgScale: number;
  shoot?: { range: number; cooldown: number; projSpeed: number; damage: number };
  /** boss attack patterns: 'radial' | 'fan' | 'spiral' | 'dashchain' | 'summon' */
  attacks?: string[];
  /** explodes on death (telegraphed AoE) */
  explodes?: boolean;
  /** frontal damage reduction (shieldbearer) */
  frontBlock?: number;
  /** leaves burning ground while dashing */
  fireTrail?: boolean;
  /** splits into N of this enemy id on death */
  splits?: { id: string; count: number };
  /** the projectiles slow the player on hit */
  slowShot?: boolean;
}

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'chaser',
    emoji: '🧟',
    radius: 16,
    hp: 12,
    speed: 105,
    contactDamage: 6,
    materialDrop: 1,
    ai: 'chase',
    hpScale: 0.45,
    dmgScale: 0.15,
  },
  {
    id: 'runner',
    emoji: '🦇',
    radius: 12,
    hp: 6,
    speed: 195,
    contactDamage: 4,
    materialDrop: 1,
    ai: 'chase',
    hpScale: 0.35,
    dmgScale: 0.12,
  },
  {
    id: 'tank',
    emoji: '🐗',
    radius: 26,
    hp: 55,
    speed: 66,
    contactDamage: 12,
    materialDrop: 3,
    ai: 'chase',
    hpScale: 0.6,
    dmgScale: 0.18,
  },
  {
    id: 'shooter',
    emoji: '🧙',
    radius: 15,
    hp: 14,
    speed: 86,
    contactDamage: 5,
    materialDrop: 2,
    ai: 'keepDistanceShoot',
    hpScale: 0.4,
    dmgScale: 0.15,
    shoot: { range: 320, cooldown: 2.2, projSpeed: 260, damage: 8 },
  },
  {
    id: 'bomber',
    emoji: '💣',
    radius: 15,
    hp: 16,
    speed: 94,
    contactDamage: 4,
    materialDrop: 2,
    ai: 'chase',
    hpScale: 0.4,
    dmgScale: 0.1,
    explodes: true,
  },
  {
    id: 'shieldbearer',
    emoji: '🛡️',
    radius: 18,
    hp: 30,
    speed: 76,
    contactDamage: 9,
    materialDrop: 3,
    ai: 'chase',
    hpScale: 0.5,
    dmgScale: 0.14,
    frontBlock: 0.7,
  },
  {
    id: 'summoner',
    emoji: '🧿',
    radius: 16,
    hp: 24,
    speed: 70,
    contactDamage: 6,
    materialDrop: 4,
    ai: 'summoner',
    hpScale: 0.45,
    dmgScale: 0.12,
  },
  {
    id: 'splitter',
    emoji: '🟢',
    radius: 21,
    hp: 34,
    speed: 72,
    contactDamage: 9,
    materialDrop: 3,
    ai: 'chase',
    hpScale: 0.5,
    dmgScale: 0.13,
    splits: { id: 'slimelet', count: 2 },
  },
  {
    id: 'slimelet',
    emoji: '🟩',
    radius: 10,
    hp: 6,
    speed: 125,
    contactDamage: 3,
    materialDrop: 1,
    ai: 'chase',
    hpScale: 0.3,
    dmgScale: 0.1,
  },
  {
    id: 'hopper',
    emoji: '🐸',
    radius: 15,
    hp: 14,
    speed: 90,
    contactDamage: 7,
    materialDrop: 2,
    ai: 'hopper',
    hpScale: 0.42,
    dmgScale: 0.12,
  },
  {
    id: 'frost',
    emoji: '❄️',
    radius: 15,
    hp: 18,
    speed: 78,
    contactDamage: 5,
    materialDrop: 3,
    ai: 'keepDistanceShoot',
    hpScale: 0.42,
    dmgScale: 0.13,
    shoot: { range: 340, cooldown: 2.8, projSpeed: 240, damage: 6 },
    slowShot: true,
  },
  {
    id: 'sprinter',
    emoji: '🐆',
    radius: 14,
    hp: 10,
    speed: 150,
    contactDamage: 8,
    materialDrop: 2,
    ai: 'chargeDash',
    hpScale: 0.4,
    dmgScale: 0.12,
  },
  {
    id: 'brute',
    emoji: '🐗',
    radius: 34,
    hp: 1100,
    speed: 72,
    contactDamage: 22,
    materialDrop: 25,
    ai: 'boss',
    hpScale: 0,
    dmgScale: 0,
    shoot: { range: 9999, cooldown: 3.6, projSpeed: 240, damage: 13 },
    attacks: ['dashchain'],
    fireTrail: true,
  },
  {
    id: 'boss',
    emoji: '👹',
    radius: 48,
    hp: 26000,
    speed: 85,
    contactDamage: 33,
    materialDrop: 60,
    ai: 'boss',
    hpScale: 0,
    dmgScale: 0,
    shoot: { range: 9999, cooldown: 3.0, projSpeed: 300, damage: 18 },
    attacks: ['radial', 'summon'],
  },
  {
    id: 'reaper',
    emoji: '💀',
    radius: 42,
    hp: 60000,
    speed: 95,
    contactDamage: 39,
    materialDrop: 90,
    ai: 'boss',
    hpScale: 0,
    dmgScale: 0,
    shoot: { range: 9999, cooldown: 2.6, projSpeed: 340, damage: 21 },
    attacks: ['fan', 'dashchain', 'summon'],
  },
  {
    id: 'overlord',
    emoji: '👑',
    radius: 54,
    hp: 240000,
    speed: 86,
    contactDamage: 58,
    materialDrop: 140,
    ai: 'boss',
    hpScale: 0,
    dmgScale: 0,
    shoot: { range: 9999, cooldown: 2.2, projSpeed: 340, damage: 30 },
    attacks: ['radial', 'fan', 'spiral', 'dashchain', 'summon'],
  },
];

export const ENEMY_INDEX: Record<string, number> = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));
