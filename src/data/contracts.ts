import { pick } from '../core/rng';
import { getWaveDef } from './waves';
import { FINAL_WAVE } from '../config';

export type WaveContractId = 'horde' | 'frenzy' | 'elite_hunt';

export interface WaveContractDef {
  id: WaveContractId;
  name: string;
  icon: string;
  desc: string;
  reward: string;
  spawnRateMult: number;
  maxAliveMult: number;
  enemySpeedMult: number;
  enemyDamageMult: number;
  eliteChanceBonus: number;
  materialMult: number;
}

export const WAVE_CONTRACTS: readonly WaveContractDef[] = [
  {
    id: 'horde', name: 'Нашествие', icon: 'i_skull',
    desc: 'Враги появляются на 25% чаще, одновременно их может быть на 15% больше',
    reward: 'Материалы врагов +8%',
    spawnRateMult: 1.25, maxAliveMult: 1.15, enemySpeedMult: 1, enemyDamageMult: 1, eliteChanceBonus: 0, materialMult: 1.08,
  },
  {
    id: 'frenzy', name: 'Бешенство', icon: 'i_speed',
    desc: 'Враги двигаются на 14% быстрее и наносят на 10% больше урона',
    reward: 'Материалы врагов +22%',
    spawnRateMult: 1, maxAliveMult: 1, enemySpeedMult: 1.14, enemyDamageMult: 1.1, eliteChanceBonus: 0, materialMult: 1.22,
  },
  {
    id: 'elite_hunt', name: 'Охота на элиту', icon: 'i_trophy',
    desc: 'Шанс появления элиты увеличен на 12 процентных пунктов',
    reward: 'Материалы +8%; чаще элита с добычей ×4',
    spawnRateMult: 1, maxAliveMult: 1, enemySpeedMult: 1, enemyDamageMult: 1, eliteChanceBonus: 0.12, materialMult: 1.08,
  },
];

/** Five campaign offers, deliberately kept away from boss-reward transitions. */
export const CAMPAIGN_CONTRACT_WAVES = [3, 7, 9, 12, 18] as const;

export function shouldOfferContract(nextWave: number): boolean {
  if (nextWave < 1) return false;
  if (getWaveDef(nextWave).boss) return false;
  if (nextWave <= FINAL_WAVE) return CAMPAIGN_CONTRACT_WAVES.includes(nextWave as (typeof CAMPAIGN_CONTRACT_WAVES)[number]);
  return nextWave % 3 === 0;
}

export function rollContractChoices(count = 2): WaveContractDef[] {
  const pool = [...WAVE_CONTRACTS];
  const out: WaveContractDef[] = [];
  while (pool.length > 0 && out.length < count) {
    const chosen = pick(pool);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}
