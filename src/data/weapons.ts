export type WeaponBehavior = 'projectile' | 'melee' | 'orbit' | 'chain' | 'pulse' | 'zone' | 'summon';

export interface WeaponStatusDef {
  burnDps?: number;
  burnDuration?: number;
  slowPct?: number;
  slowDuration?: number;
  freezeDuration?: number;
}

export interface ProjectileDef {
  speed: number;
  pierce: number;
  count: number;
  spreadRad: number;
  pattern?: 'random' | 'fan';
  homingTurn?: number;
  status?: WeaponStatusDef;
  explosion?: {
    radius: number;
    clusterCount?: number;
    clusterDamageScale?: number;
    clusterRadius?: number;
    clusterDelay?: number;
  };
  ricochet?: { bounces: number; jumpRange: number; falloff: number; branches?: number };
  boomerang?: { outboundRange: number; returnSpeed: number; hitCooldown: number; trailBurnDps?: number; trailDuration?: number };
}

export interface MeleeDef {
  arcRad: number;
  knockback: number;
  shape?: 'arc' | 'thrust' | 'slam';
  width?: number;
  strikes?: number;
  shockwave?: { maxRadius: number; damageScale: number; speed: number };
  phantom?: { count: number; damageScale: number; range: number; speed: number; spreadRad: number };
}

export interface PulseDef {
  radius: number;
  status?: WeaponStatusDef;
}

export interface ZoneDef {
  target: 'enemy' | 'cluster';
  radius: number;
  duration: number;
  tickRate: number;
  tickDamageScale: number;
  impactDamageScale: number;
  count?: number;
  delay?: number;
  spread?: number;
  persistentRadius?: number;
  pull?: number;
  status?: WeaponStatusDef;
}

export interface SummonDef {
  count: number;
  speed: number;
  hitCooldown: number;
  leashRange: number;
}

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
  projectile?: ProjectileDef;
  melee?: MeleeDef;
  orbit?: { orbCount: number; radius: number; angularSpeed: number; hitCooldown: number };
  chain?: { targets: number; jumpRange: number; falloff: number };
  pulse?: PulseDef;
  zone?: ZoneDef;
  summon?: SummonDef;
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
  {
    id: 'shotgun',
    name: 'Дробовик',
    emoji: '💥',
    behavior: 'projectile',
    damage: 4,
    cooldown: 1.05,
    range: 300,
    price: 22,
    projectile: { speed: 650, pierce: 0, count: 6, spreadRad: 0.49, pattern: 'fan' },
  },
  {
    id: 'ricochet_rifle',
    name: 'Рикошетная винтовка',
    emoji: '🎯',
    behavior: 'projectile',
    damage: 10,
    cooldown: 0.62,
    range: 480,
    price: 26,
    projectile: { speed: 850, pierce: 0, count: 1, spreadRad: 0.02, ricochet: { bounces: 2, jumpRange: 170, falloff: 0.82 } },
  },
  {
    id: 'daggers',
    name: 'Кинжалы',
    emoji: '🗡️',
    behavior: 'melee',
    damage: 5,
    cooldown: 0.42,
    range: 78,
    price: 16,
    melee: { arcRad: 0.61, knockback: 60, strikes: 2 },
  },
  {
    id: 'warhammer',
    name: 'Боевой молот',
    emoji: '🔨',
    behavior: 'melee',
    damage: 34,
    cooldown: 1.7,
    range: 120,
    price: 28,
    melee: { arcRad: Math.PI * 2, knockback: 600, shape: 'slam' },
  },
  {
    id: 'spear',
    name: 'Копьё',
    emoji: '🔱',
    behavior: 'melee',
    damage: 24,
    cooldown: 1.2,
    range: 210,
    price: 23,
    melee: { arcRad: 0, knockback: 220, shape: 'thrust', width: 30 },
  },
  {
    id: 'fire_wand',
    name: 'Огненный жезл',
    emoji: '🔥',
    behavior: 'projectile',
    damage: 12,
    cooldown: 0.9,
    range: 520,
    price: 22,
    projectile: { speed: 500, pierce: 0, count: 1, spreadRad: 0, homingTurn: 8, status: { burnDps: 4, burnDuration: 2.5 } },
  },
  {
    id: 'ice_tome',
    name: 'Ледяной фолиант',
    emoji: '❄️',
    behavior: 'pulse',
    damage: 10,
    cooldown: 1.45,
    range: 150,
    price: 25,
    pulse: { radius: 150, status: { slowPct: 45, slowDuration: 1.8 } },
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
  {
    id: 'grenade_launcher',
    name: 'Гранатомёт',
    emoji: '💣',
    behavior: 'projectile',
    damage: 22,
    cooldown: 1.55,
    range: 520,
    price: 30,
    unlockCost: 180,
    projectile: { speed: 520, pierce: 0, count: 1, spreadRad: 0.04, explosion: { radius: 80 } },
  },
  {
    id: 'chakram',
    name: 'Чакрам',
    emoji: '☀️',
    behavior: 'projectile',
    damage: 11,
    cooldown: 1.25,
    range: 420,
    price: 27,
    unlockCost: 200,
    projectile: { speed: 600, pierce: 99, count: 1, spreadRad: 0, boomerang: { outboundRange: 320, returnSpeed: 720, hitCooldown: 0 } },
  },
  {
    id: 'runestone',
    name: 'Рунный камень',
    emoji: '🔯',
    behavior: 'zone',
    damage: 7,
    cooldown: 2.2,
    range: 520,
    price: 29,
    unlockCost: 160,
    zone: { target: 'cluster', radius: 105, duration: 2.6, tickRate: 0.4, tickDamageScale: 1, impactDamageScale: 0, status: { slowPct: 20, slowDuration: 0.6 } },
  },
  {
    id: 'soul_lantern',
    name: 'Фонарь душ',
    emoji: '👻',
    behavior: 'summon',
    damage: 9,
    cooldown: 0,
    range: 600,
    price: 30,
    unlockCost: 240,
    summon: { count: 1, speed: 360, hitCooldown: 0.65, leashRange: 600 },
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
  {
    id: 'dragonbreath',
    name: 'Драконье дыхание',
    emoji: '🐉',
    behavior: 'projectile',
    damage: 10,
    cooldown: 0.7,
    range: 340,
    price: 0,
    evolved: true,
    projectile: { speed: 700, pierce: 0, count: 8, spreadRad: 0.56, pattern: 'fan', status: { burnDps: 6, burnDuration: 2.5 } },
  },
  {
    id: 'cluster_mortar',
    name: 'Кассетная мортира',
    emoji: '💣',
    behavior: 'projectile',
    damage: 65,
    cooldown: 1.05,
    range: 600,
    price: 0,
    evolved: true,
    projectile: { speed: 560, pierce: 0, count: 1, spreadRad: 0.02, explosion: { radius: 105, clusterCount: 5, clusterDamageScale: 0.35, clusterRadius: 50, clusterDelay: 0.25 } },
  },
  {
    id: 'prism_rifle',
    name: 'Призматическая винтовка',
    emoji: '💠',
    behavior: 'projectile',
    damage: 36,
    cooldown: 0.5,
    range: 600,
    price: 0,
    evolved: true,
    projectile: { speed: 1000, pierce: 0, count: 1, spreadRad: 0, ricochet: { bounces: 4, jumpRange: 230, falloff: 0.85, branches: 2 } },
  },
  {
    id: 'shadow_blades',
    name: 'Теневые клинки',
    emoji: '🌑',
    behavior: 'melee',
    damage: 14,
    cooldown: 0.38,
    range: 110,
    price: 0,
    evolved: true,
    melee: { arcRad: 0.96, knockback: 80, strikes: 3, phantom: { count: 3, damageScale: 0.5, range: 260, speed: 850, spreadRad: 0.42 } },
  },
  {
    id: 'titan_hammer',
    name: 'Молот титана',
    emoji: '⚒️',
    behavior: 'melee',
    damage: 110,
    cooldown: 1.15,
    range: 160,
    price: 0,
    evolved: true,
    melee: { arcRad: Math.PI * 2, knockback: 850, shape: 'slam', shockwave: { maxRadius: 280, damageScale: 0.7, speed: 420 } },
  },
  {
    id: 'gungnir',
    name: 'Гунгнир',
    emoji: '🔱',
    behavior: 'melee',
    damage: 80,
    cooldown: 0.85,
    range: 480,
    price: 0,
    evolved: true,
    melee: { arcRad: 0, knockback: 420, shape: 'thrust', width: 42 },
  },
  {
    id: 'solar_disc',
    name: 'Солнечный диск',
    emoji: '☀️',
    behavior: 'projectile',
    damage: 38,
    cooldown: 0.8,
    range: 520,
    price: 0,
    evolved: true,
    projectile: { speed: 720, pierce: 99, count: 2, spreadRad: 0.16, pattern: 'fan', boomerang: { outboundRange: 380, returnSpeed: 850, hitCooldown: 0, trailBurnDps: 8, trailDuration: 2 } },
  },
  {
    id: 'armageddon',
    name: 'Армагеддон',
    emoji: '☄️',
    behavior: 'zone',
    damage: 42,
    cooldown: 1.15,
    range: 650,
    price: 0,
    evolved: true,
    zone: { target: 'cluster', radius: 90, persistentRadius: 70, duration: 3, tickRate: 0.5, tickDamageScale: 0.12, impactDamageScale: 1, count: 3, delay: 0.55, spread: 80, status: { burnDps: 10, burnDuration: 1 } },
  },
  {
    id: 'absolute_zero',
    name: 'Абсолютный ноль',
    emoji: '❄️',
    behavior: 'pulse',
    damage: 48,
    cooldown: 1,
    range: 220,
    price: 0,
    evolved: true,
    pulse: { radius: 220, status: { freezeDuration: 1.1 } },
  },
  {
    id: 'void_seal',
    name: 'Печать бездны',
    emoji: '🕳️',
    behavior: 'zone',
    damage: 15,
    cooldown: 1.7,
    range: 620,
    price: 0,
    evolved: true,
    zone: { target: 'cluster', radius: 145, duration: 4, tickRate: 0.4, tickDamageScale: 1, impactDamageScale: 0, pull: 220, status: { slowPct: 35, slowDuration: 0.6 } },
  },
  {
    id: 'soul_legion',
    name: 'Легион душ',
    emoji: '👻',
    behavior: 'summon',
    damage: 24,
    cooldown: 0,
    range: 700,
    price: 0,
    evolved: true,
    summon: { count: 4, speed: 440, hitCooldown: 0.5, leashRange: 700 },
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

export const WEAPON_INDEX: Readonly<Record<string, WeaponDef>> = Object.fromEntries(WEAPONS.map((weapon) => [weapon.id, weapon]));

export function weaponById(id: string): WeaponDef {
  const w = WEAPON_INDEX[id];
  if (!w) throw new Error(`unknown weapon ${id}`);
  return w;
}
