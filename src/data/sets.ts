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
  railgun: 'gunner',
  stormgun: 'gunner',
  sword: 'blade',
  stormblade: 'blade',
  flail: 'blade',
  orbs: 'arcane',
  staff: 'arcane',
  thunderstaff: 'arcane',
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
      3: { attackSpeedPct: 9, damagePct: 4 },
      4: { attackSpeedPct: 14, damagePct: 8 },
      6: { attackSpeedPct: 22, damagePct: 14 },
    },
  },
  blade: {
    id: 'blade',
    name: 'Клинки',
    icon: 'w_sword',
    color: '#ffd23e',
    bonuses: {
      2: { damagePct: 8, moveSpeed: 6 },
      3: { damagePct: 15, moveSpeed: 10, maxHp: 5 },
    },
  },
  arcane: {
    id: 'arcane',
    name: 'Магия',
    icon: 'i_orb',
    color: '#b18cff',
    bonuses: {
      2: { damagePct: 6, luck: 5 },
      3: { damagePct: 12, luck: 9, pickupRange: 15 },
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
