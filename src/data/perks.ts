import type { StatMod } from '../entities/stats';

export interface PerkDef {
  id: string;
  name: string;
  emoji: string;
  /** stat bonus granted per level */
  perLevel: StatMod;
  /** shard cost per level (length = max level) */
  costs: number[];
}

export const PERKS: readonly PerkDef[] = [
  { id: 'perk_hp', name: 'Закалка', emoji: '❤️', perLevel: { maxHp: 4 }, costs: [40, 80, 160] },
  { id: 'perk_dmg', name: 'Острые клинки', emoji: '⚔️', perLevel: { damagePct: 2 }, costs: [50, 100, 200] },
  { id: 'perk_pickup', name: 'Длинные руки', emoji: '🧲', perLevel: { pickupRange: 8 }, costs: [30, 60] },
];
