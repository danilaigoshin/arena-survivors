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
  // ultra tier: evolve the evolutions once the endless grind begins
  { base: 'railgun', catalyst: 'battery', result: 'annihilator', minWave: 20 },
  { base: 'stormgun', catalyst: 'coffee', result: 'hurricane', minWave: 20 },
  { base: 'stormblade', catalyst: 'steak', result: 'cyclone', minWave: 20 },
  { base: 'singularity', catalyst: 'heart', result: 'blackhole', minWave: 20 },
];
