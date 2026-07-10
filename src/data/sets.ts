import type { StatMod } from '../entities/stats';

export type WeaponClassId = 'gunner' | 'blade' | 'arcane';

export interface WeaponClassDef {
  id: WeaponClassId;
  name: string;
  icon: string; // sprite key for drawIcon
  color: string;
  /** cumulative set bonuses: the highest threshold ≤ count applies */
  bonuses: Record<number, StatMod>;
}

export const WEAPON_CLASS: Record<string, WeaponClassId> = {
  pistol: 'gunner',
  smg: 'gunner',
  crossbow: 'gunner',
  shotgun: 'gunner',
  grenade_launcher: 'gunner',
  ricochet_rifle: 'gunner',
  railgun: 'gunner',
  stormgun: 'gunner',
  dragonbreath: 'gunner',
  cluster_mortar: 'gunner',
  prism_rifle: 'gunner',
  sword: 'blade',
  stormblade: 'blade',
  flail: 'blade',
  daggers: 'blade',
  warhammer: 'blade',
  spear: 'blade',
  chakram: 'blade',
  shadow_blades: 'blade',
  titan_hammer: 'blade',
  gungnir: 'blade',
  solar_disc: 'blade',
  orbs: 'arcane',
  staff: 'arcane',
  fire_wand: 'arcane',
  ice_tome: 'arcane',
  runestone: 'arcane',
  soul_lantern: 'arcane',
  thunderstaff: 'arcane',
  armageddon: 'arcane',
  absolute_zero: 'arcane',
  void_seal: 'arcane',
  soul_legion: 'arcane',
  singularity: 'arcane',
  deathsting: 'gunner',
  annihilator: 'gunner',
  hurricane: 'gunner',
  doomflail: 'blade',
  cyclone: 'blade',
  blackhole: 'arcane',
};

export const CLASS_DEFS: Record<WeaponClassId, WeaponClassDef> = {
  gunner: {
    id: 'gunner',
    name: 'Стрелковое',
    icon: 'w_pistol',
    color: '#8be9fd',
    bonuses: {
      2: { attackSpeedPct: 5 },
      4: { attackSpeedPct: 13, damagePct: 7 },
      6: { attackSpeedPct: 22, damagePct: 14 },
    },
  },
  blade: {
    id: 'blade',
    name: 'Воинское',
    icon: 'w_sword',
    color: '#ffd23e',
    bonuses: {
      2: { damagePct: 6, moveSpeed: 4 },
      4: { damagePct: 14, moveSpeed: 8, maxHp: 5 },
      6: { damagePct: 22, moveSpeed: 12, maxHp: 10 },
    },
  },
  arcane: {
    id: 'arcane',
    name: 'Магия',
    icon: 'i_orb',
    color: '#b18cff',
    bonuses: {
      2: { damagePct: 5, luck: 3 },
      4: { damagePct: 11, luck: 6, pickupRange: 15 },
      6: { damagePct: 18, luck: 10, pickupRange: 30 },
    },
  },
};

/** Class counts for a list of weapon def ids. */
export function classCounts(weaponIds: readonly string[]): Map<WeaponClassId, number> {
  const counts = new Map<WeaponClassId, number>();
  for (const id of weaponIds) {
    const cls = WEAPON_CLASS[id];
    if (cls) counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  return counts;
}

/** Active set bonuses (the best reached threshold per class). */
export function activeSetBonuses(weaponIds: readonly string[]): { cls: WeaponClassDef; count: number; threshold: number; mod: StatMod }[] {
  const out: { cls: WeaponClassDef; count: number; threshold: number; mod: StatMod }[] = [];
  for (const [clsId, count] of classCounts(weaponIds)) {
    const cls = CLASS_DEFS[clsId];
    let best = 0;
    for (const t of Object.keys(cls.bonuses).map(Number)) {
      if (count >= t && t > best) best = t;
    }
    if (best > 0) out.push({ cls, count, threshold: best, mod: cls.bonuses[best] });
  }
  return out;
}
