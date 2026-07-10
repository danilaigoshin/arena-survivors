export interface EvolutionDef {
  base: string; // weapon id (at MAX_TIER, unless the base is already evolved)
  catalyst: string; // item id consumed by the evolution
  result: string; // evolved weapon id
  /** available only from this wave (ultra evolutions are endless-only) */
  minWave?: number;
}

export const EVOLUTIONS: readonly EvolutionDef[] = [
  { base: 'pistol', catalyst: 'scope', result: 'railgun' },
  { base: 'smg', catalyst: 'battery', result: 'stormgun' },
  { base: 'sword', catalyst: 'whetstone', result: 'stormblade' },
  { base: 'orbs', catalyst: 'crown', result: 'singularity' },
  { base: 'crossbow', catalyst: 'katana_oil', result: 'deathsting' },
  { base: 'flail', catalyst: 'shield', result: 'doomflail' },
  { base: 'staff', catalyst: 'grimoire', result: 'thunderstaff' },
  { base: 'shotgun', catalyst: 'berserk', result: 'dragonbreath' },
  { base: 'grenade_launcher', catalyst: 'battery', result: 'cluster_mortar' },
  { base: 'ricochet_rifle', catalyst: 'clover', result: 'prism_rifle' },
  { base: 'daggers', catalyst: 'katana_oil', result: 'shadow_blades' },
  { base: 'warhammer', catalyst: 'steak', result: 'titan_hammer' },
  { base: 'spear', catalyst: 'whetstone', result: 'gungnir' },
  { base: 'chakram', catalyst: 'crown', result: 'solar_disc' },
  { base: 'fire_wand', catalyst: 'grimoire', result: 'armageddon' },
  { base: 'ice_tome', catalyst: 'shield', result: 'absolute_zero' },
  { base: 'runestone', catalyst: 'magnet', result: 'void_seal' },
  { base: 'soul_lantern', catalyst: 'heart', result: 'soul_legion' },
  // ultra tier: evolve the evolutions once the endless grind begins
  { base: 'railgun', catalyst: 'battery', result: 'annihilator', minWave: 20 },
  { base: 'stormgun', catalyst: 'coffee', result: 'hurricane', minWave: 20 },
  { base: 'stormblade', catalyst: 'steak', result: 'cyclone', minWave: 20 },
  { base: 'singularity', catalyst: 'heart', result: 'blackhole', minWave: 20 },
];
