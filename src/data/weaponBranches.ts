import type { WeaponBranchId } from '../entities/weapon';

export interface WeaponBranchDef {
  id: WeaponBranchId;
  name: string;
  icon: string;
  desc: string;
  shortDesc: string;
  damageMult: number;
  attackSpeedMult: number;
}

/** Both branches preserve sustained power (≈1.003× DPS) but favor different rhythms. */
export const WEAPON_BRANCHES: readonly WeaponBranchDef[] = [
  {
    id: 'force', name: 'Тяжёлый модуль', icon: 'i_sword',
    desc: '+18% урона, но оружие атакует на 15% медленнее',
    shortDesc: 'Урон +18% · скорость −15%',
    damageMult: 1.18, attackSpeedMult: 0.85,
  },
  {
    id: 'tempo', name: 'Скоростной модуль', icon: 'i_aspd',
    desc: '+18% скорости атаки, но −15% урона',
    shortDesc: 'Скорость +18% · урон −15%',
    damageMult: 0.85, attackSpeedMult: 1.18,
  },
];

export function weaponBranchById(id: WeaponBranchId | null): WeaponBranchDef | null {
  return id ? WEAPON_BRANCHES.find((branch) => branch.id === id) ?? null : null;
}

export function branchDamageMultiplier(id: WeaponBranchId | null): number {
  return weaponBranchById(id)?.damageMult ?? 1;
}

export function branchAttackSpeedMultiplier(id: WeaponBranchId | null): number {
  return weaponBranchById(id)?.attackSpeedMult ?? 1;
}
