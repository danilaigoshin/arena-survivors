import type { StatMod } from '../entities/stats';

export interface UpgradeDef {
  id: string;
  name: string;
  emoji: string;
  rarity: 1 | 2 | 3; // common / rare / epic
  modifiers: StatMod;
}

export const UPGRADES: readonly UpgradeDef[] = [
  // ── common ────────────────────────────────────────────────
  { id: 'up_hp', name: 'Живучесть', emoji: '❤️', rarity: 1, modifiers: { maxHp: 4 } },
  { id: 'up_regen', name: 'Регенерация', emoji: '💚', rarity: 3, modifiers: { hpRegen: 1 } },
  { id: 'up_dmg', name: 'Сила', emoji: '⚔️', rarity: 1, modifiers: { damagePct: 4 } },
  { id: 'up_aspd', name: 'Ловкость', emoji: '⚡', rarity: 1, modifiers: { attackSpeedPct: 4 } },
  { id: 'up_speed', name: 'Скорость', emoji: '💨', rarity: 1, modifiers: { moveSpeed: 7 } },
  { id: 'up_armor', name: 'Защита', emoji: '🛡️', rarity: 1, modifiers: { armor: 1 } },
  { id: 'up_pickup', name: 'Притяжение', emoji: '🧲', rarity: 1, modifiers: { pickupRange: 15 } },
  { id: 'up_luck', name: 'Фортуна', emoji: '🍀', rarity: 1, modifiers: { luck: 4 } },
  { id: 'up_crit', name: 'Меткость', emoji: '🎯', rarity: 1, modifiers: { critChance: 0.02 } },
  // ── rare (~×1.8) ──────────────────────────────────────────
  { id: 'up_hp2', name: 'Стальное тело', emoji: '💪', rarity: 2, modifiers: { maxHp: 8 } },
  { id: 'up_regen2', name: 'Троллья кровь', emoji: '🧬', rarity: 3, modifiers: { hpRegen: 2 } },
  { id: 'up_dmg2', name: 'Свирепость', emoji: '🔥', rarity: 2, modifiers: { damagePct: 8 } },
  { id: 'up_aspd2', name: 'Азарт', emoji: '🌩️', rarity: 2, modifiers: { attackSpeedPct: 7 } },
  { id: 'up_armor2', name: 'Панцирь', emoji: '🦀', rarity: 2, modifiers: { armor: 2 } },
  { id: 'up_crit2', name: 'Хищный глаз', emoji: '👁️', rarity: 2, modifiers: { critChance: 0.035 } },
  // ── epic: combos & tradeoffs ──────────────────────────────
  { id: 'up_warrior', name: 'Путь воина', emoji: '🗡️', rarity: 3, modifiers: { damagePct: 7, attackSpeedPct: 4 } },
  { id: 'up_tank', name: 'Бастион', emoji: '🏰', rarity: 3, modifiers: { maxHp: 14, armor: 2, moveSpeed: -12 } },
  { id: 'up_glass', name: 'Стеклянная пушка', emoji: '💥', rarity: 3, modifiers: { damagePct: 12, maxHp: -10 } },
  { id: 'up_vampire', name: 'Жажда жизни', emoji: '🩸', rarity: 3, modifiers: { hpRegen: 2, maxHp: 7, damagePct: -8 } },
  { id: 'up_gambler', name: 'Игрок', emoji: '🎰', rarity: 3, modifiers: { luck: 7, critChance: 0.03 } },
  { id: 'up_berserk2', name: 'Берсерк', emoji: '😤', rarity: 3, modifiers: { damagePct: 9, attackSpeedPct: 6, armor: -3 } },
];
