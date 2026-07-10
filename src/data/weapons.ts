export type WeaponBehavior = 'projectile' | 'melee' | 'orbit' | 'chain';

export interface WeaponDef {
  id: string;
  name: string;
  emoji: string;
  behavior: WeaponBehavior;
  damage: number;
  cooldown: number; // seconds
  range: number;
  price: number;
  /** evolved weapons never appear in the shop pool */
  evolved?: boolean;
  /** locked until bought in the meta screen for this many shards */
  unlockCost?: number;
  projectile?: { speed: number; pierce: number; count: number; spreadRad: number };
  melee?: { arcRad: number; knockback: number };
  orbit?: { orbCount: number; radius: number; angularSpeed: number; hitCooldown: number };
  chain?: { targets: number; jumpRange: number; falloff: number };
}

export type Tier = 1 | 2 | 3 | 4;
export const MAX_TIER = 4;
export const TIER_DAMAGE = [1, 1.7, 2.8, 4.5];
export const TIER_COOLDOWN = [1, 0.92, 0.85, 0.78];
export const TIER_NAMES = ['I', 'II', 'III', 'IV'];
export const TIER_COLORS = ['#9a9aa8', '#4f9cf0', '#b13be0', '#f0a03c'];

/** Orbit weapons gain an extra orb at tiers III and IV. */
export function tierOrbBonus(tier: Tier): number {
  return tier >= 4 ? 2 : tier >= 3 ? 1 : 0;
}

/** Chain weapons gain one extra target at tier III and another at tier IV. */
export function tierChainBonus(tier: Tier): number {
  return tier >= 4 ? 2 : tier >= 3 ? 1 : 0;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'pistol',
    name: 'Пистолет',
    emoji: '🔫',
    behavior: 'projectile',
    damage: 12,
    cooldown: 0.85,
    range: 450,
    price: 12,
    projectile: { speed: 700, pierce: 0, count: 1, spreadRad: 0.04 },
  },
  {
    id: 'smg',
    name: 'ПП',
    emoji: '💥',
    behavior: 'projectile',
    damage: 4,
    cooldown: 0.16,
    range: 380,
    price: 25,
    projectile: { speed: 800, pierce: 0, count: 1, spreadRad: 0.22 },
  },
  {
    id: 'sword',
    name: 'Меч',
    emoji: '🗡️',
    behavior: 'melee',
    damage: 18,
    cooldown: 1.0,
    range: 120,
    price: 18,
    melee: { arcRad: Math.PI * 0.9, knockback: 260 },
  },
  {
    id: 'orbs',
    name: 'Сферы',
    emoji: '🔮',
    behavior: 'orbit',
    damage: 10,
    cooldown: 0, // continuous
    range: 0,
    price: 30,
    orbit: { orbCount: 2, radius: 85, angularSpeed: 2.6, hitCooldown: 0.5 },
  },
  {
    id: 'staff',
    name: 'Посох',
    emoji: '🪄',
    behavior: 'chain',
    damage: 15,
    cooldown: 1.2,
    range: 500,
    price: 24,
    chain: { targets: 3, jumpRange: 150, falloff: 0.7 },
  },

  // ── unlockable via meta progression ───────────────────────
  {
    id: 'crossbow',
    name: 'Арбалет',
    emoji: '🏹',
    behavior: 'projectile',
    damage: 22,
    cooldown: 1.4,
    range: 520,
    price: 22,
    unlockCost: 80,
    projectile: { speed: 900, pierce: 2, count: 1, spreadRad: 0.02 },
  },
  {
    id: 'flail',
    name: 'Кистень',
    emoji: '⛓️',
    behavior: 'orbit',
    damage: 24,
    cooldown: 0,
    range: 0,
    price: 32,
    unlockCost: 120,
    orbit: { orbCount: 1, radius: 110, angularSpeed: 3.4, hitCooldown: 0.6 },
  },

  // ── evolutions (never in the shop pool) ───────────────────
  {
    id: 'deathsting',
    name: 'Жало смерти',
    emoji: '🏹',
    behavior: 'projectile',
    damage: 95,
    cooldown: 0.85,
    range: 640,
    price: 0,
    evolved: true,
    projectile: { speed: 1200, pierce: 3, count: 1, spreadRad: 0 },
  },
  {
    id: 'doomflail',
    name: 'Маятник хаоса',
    emoji: '⛓️',
    behavior: 'orbit',
    damage: 60,
    cooldown: 0,
    range: 0,
    price: 0,
    evolved: true,
    orbit: { orbCount: 2, radius: 145, angularSpeed: 4.0, hitCooldown: 0.4 },
  },
  {
    id: 'thunderstaff',
    name: 'Грозовой посох',
    emoji: '🌩️',
    behavior: 'chain',
    damage: 55,
    cooldown: 0.72,
    range: 620,
    price: 0,
    evolved: true,
    chain: { targets: 6, jumpRange: 210, falloff: 0.82 },
  },
  // ── ultra evolutions (endless only, wave 20+) ─────────────
  {
    id: 'annihilator',
    name: 'Аннигилятор',
    emoji: '⚡',
    behavior: 'projectile',
    damage: 340,
    cooldown: 1.25,
    range: 800,
    price: 0,
    evolved: true,
    projectile: { speed: 1700, pierce: 99, count: 1, spreadRad: 0 },
  },
  {
    id: 'hurricane',
    name: 'Ураган',
    emoji: '🌪️',
    behavior: 'projectile',
    damage: 15,
    cooldown: 0.06,
    range: 460,
    price: 0,
    evolved: true,
    projectile: { speed: 900, pierce: 0, count: 4, spreadRad: 0.5 },
  },
  {
    id: 'cyclone',
    name: 'Циклон',
    emoji: '🌀',
    behavior: 'melee',
    damage: 115,
    cooldown: 0.7,
    range: 175,
    price: 0,
    evolved: true,
    melee: { arcRad: Math.PI * 2, knockback: 750 },
  },
  {
    id: 'blackhole',
    name: 'Чёрная дыра',
    emoji: '🪐',
    behavior: 'orbit',
    damage: 62,
    cooldown: 0,
    range: 0,
    price: 0,
    evolved: true,
    orbit: { orbCount: 7, radius: 155, angularSpeed: 3.6, hitCooldown: 0.25 },
  },
  {
    id: 'railgun',
    name: 'Рельсотрон',
    emoji: '⚡',
    behavior: 'projectile',
    damage: 160,
    cooldown: 1.5,
    range: 700,
    price: 0,
    evolved: true,
    projectile: { speed: 1400, pierce: 99, count: 1, spreadRad: 0 },
  },
  {
    id: 'stormgun',
    name: 'Шквал',
    emoji: '🌪️',
    behavior: 'projectile',
    damage: 8,
    cooldown: 0.09,
    range: 420,
    price: 0,
    evolved: true,
    projectile: { speed: 850, pierce: 0, count: 3, spreadRad: 0.35 },
  },
  {
    id: 'stormblade',
    name: 'Клинок бури',
    emoji: '🌀',
    behavior: 'melee',
    damage: 55,
    cooldown: 0.9,
    range: 150,
    price: 0,
    evolved: true,
    melee: { arcRad: Math.PI * 2, knockback: 520 },
  },
  {
    id: 'singularity',
    name: 'Сингулярность',
    emoji: '🪐',
    behavior: 'orbit',
    damage: 30,
    cooldown: 0,
    range: 0,
    price: 0,
    evolved: true,
    orbit: { orbCount: 5, radius: 130, angularSpeed: 3.2, hitCooldown: 0.35 },
  },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((w) => w.id === id);
  if (!w) throw new Error(`unknown weapon ${id}`);
  return w;
}
