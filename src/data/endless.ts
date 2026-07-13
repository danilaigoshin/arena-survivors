import { FINAL_WAVE } from '../config';

export interface EndlessWaveScaling {
  /** Number of completed difficulty steps after the campaign finale. */
  steps: number;
  hpMult: number;
  damageMult: number;
  speedMult: number;
  attackRateMult: number;
  spawnRateMult: number;
  eliteChanceBonus: number;
}

/**
 * Endless mode gets a distinct difficulty step on every wave.
 * HP and damage remain uncapped so a run cannot outscale the mode forever;
 * speed and population pressure are capped to keep combat readable and stable.
 */
export function getEndlessWaveScaling(wave: number): EndlessWaveScaling {
  const steps = Math.max(0, Math.floor(wave) - FINAL_WAVE);
  return {
    steps,
    hpMult: Math.pow(1.1, steps),
    damageMult: Math.pow(1.06, steps),
    speedMult: 1 + Math.min(0.35, steps * 0.01),
    attackRateMult: 1 + Math.min(0.6, steps * 0.02),
    spawnRateMult: 1 + Math.min(1, steps * 0.03),
    eliteChanceBonus: Math.min(0.27, steps * 0.0075),
  };
}
