import type { StatMod } from '../entities/stats';

export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  rarity: 1 | 2 | 3 | 4;
  basePrice: number;
  modifiers: StatMod;
  /** roll weight within its rarity (default 1); regen items are rarer */
  weight?: number;
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'apple', name: 'Яблоко', emoji: '🍎', rarity: 1, basePrice: 8, modifiers: { maxHp: 4 } },
  { id: 'boots', name: 'Ботинки', emoji: '👟', rarity: 1, basePrice: 9, modifiers: { moveSpeed: 8 } },
  { id: 'whetstone', name: 'Точило', emoji: '🪨', rarity: 1, basePrice: 10, modifiers: { damagePct: 4 } },
  { id: 'magnet', name: 'Магнит', emoji: '🧲', rarity: 1, basePrice: 8, modifiers: { pickupRange: 18 } },
  { id: 'coffee', name: 'Кофе', emoji: '☕', rarity: 2, basePrice: 16, modifiers: { attackSpeedPct: 4 } },
  { id: 'shield', name: 'Щит', emoji: '🛡️', rarity: 2, basePrice: 18, modifiers: { armor: 1, moveSpeed: -8 } },
  { id: 'bandage', name: 'Бинт', emoji: '🩹', rarity: 3, basePrice: 26, weight: 0.45, modifiers: { hpRegen: 1 } },
  { id: 'clover', name: 'Клевер', emoji: '🍀', rarity: 2, basePrice: 16, modifiers: { luck: 4 } },
  { id: 'scope', name: 'Прицел', emoji: '🔭', rarity: 2, basePrice: 20, modifiers: { critChance: 0.02 } },
  { id: 'steak', name: 'Стейк', emoji: '🥩', rarity: 3, basePrice: 30, modifiers: { maxHp: 9, moveSpeed: -6 } },
  { id: 'berserk', name: 'Ярость', emoji: '😡', rarity: 3, basePrice: 32, modifiers: { damagePct: 9, maxHp: -10 } },
  { id: 'battery', name: 'Батарея', emoji: '🔋', rarity: 3, basePrice: 34, modifiers: { attackSpeedPct: 8, armor: -2 } },
  { id: 'crown', name: 'Корона', emoji: '👑', rarity: 4, basePrice: 55, modifiers: { damagePct: 7, attackSpeedPct: 4, luck: 4 } },
  { id: 'heart', name: 'Сердце титана', emoji: '💖', rarity: 4, basePrice: 60, weight: 0.5, modifiers: { maxHp: 16, hpRegen: 2 } },
  { id: 'katana_oil', name: 'Масло убийцы', emoji: '🧪', rarity: 4, basePrice: 58, modifiers: { critChance: 0.04, damagePct: 4 } },
];
