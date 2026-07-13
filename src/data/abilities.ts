export type AbilityId = 'adaptation' | 'whirlwind' | 'overheat' | 'arcane_circle';

/** Shared tuning values for character abilities. */
export const ABILITY_BALANCE = {
  adaptation: {
    cooldown: 10,
    duration: 5,
    bonusPerClass: 0.1,
  },
  whirlwind: {
    cooldown: 9,
    duration: 1.5,
    hits: 3,
    hitInterval: 0.5,
    damageScale: 0.5,
    radius: 150,
    moveSpeedMult: 0.75,
  },
  overheat: {
    cooldown: 10,
    duration: 4,
    attackSpeedMult: 1.6,
    spreadMult: 0.6,
    recoveryDuration: 2,
    recoveryAttackSpeedMult: 0.75,
  },
  arcaneCircle: {
    cooldown: 10,
    duration: 4,
    radius: 170,
    attackSpeedMult: 1.35,
    slowPct: 20,
  },
} as const;

export function abilityActiveDuration(id: AbilityId): number {
  switch (id) {
    case 'adaptation': return ABILITY_BALANCE.adaptation.duration;
    case 'whirlwind': return ABILITY_BALANCE.whirlwind.duration;
    case 'overheat': return ABILITY_BALANCE.overheat.duration;
    case 'arcane_circle': return ABILITY_BALANCE.arcaneCircle.duration;
  }
}
