import type { StatMod } from '../entities/stats';
import type { WeaponClassId } from './sets';
import { ABILITY_BALANCE, type AbilityId } from './abilities';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  icon: string;
  cooldown: number;
  desc: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  sprite: string; // key into SPRITES
  desc: string;
  weapon: string; // starting weapon id
  /** Specialists can only acquire this weapon class; Potato is universal. */
  weaponClass: WeaponClassId | 'all';
  mods: StatMod;
  ability: AbilityDef;
  /** shard cost to unlock; free characters omit it */
  unlockCost?: number;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'potato',
    name: 'Картофель',
    sprite: 'potato',
    desc: 'Сбалансированный боец без слабостей.',
    weapon: 'pistol',
    weaponClass: 'all',
    ability: { id: 'adaptation', name: 'Адаптация', icon: 'i_star', cooldown: ABILITY_BALANCE.adaptation.cooldown, desc: '5 с: +10% урона и скорости атаки за каждый класс' },
    mods: {},
  },
  {
    id: 'knight',
    name: 'Рыцарь',
    sprite: 'knight',
    desc: 'Танк ближнего боя: крепкий, но медленный.',
    weapon: 'sword',
    weaponClass: 'blade',
    ability: { id: 'whirlwind', name: 'Вихрь клинков', icon: 'w_stormblade', cooldown: ABILITY_BALANCE.whirlwind.cooldown, desc: '3 удара по 50%; скорость движения −25% на 1,5 с' },
    mods: { maxHp: 25, armor: 3, damagePct: 10, moveSpeed: -20 },
    unlockCost: 150,
  },
  {
    id: 'ranger',
    name: 'Стрелок',
    sprite: 'ranger',
    desc: 'Скорострельность и мобильность ценой живучести.',
    weapon: 'smg',
    weaponClass: 'gunner',
    ability: { id: 'overheat', name: 'Перегрев', icon: 'i_aspd', cooldown: ABILITY_BALANCE.overheat.cooldown, desc: '4 с: +60% скорости, меньше разброс; затем −25% на 2 с' },
    mods: { attackSpeedPct: 15, moveSpeed: 10, maxHp: -20 },
  },
  {
    id: 'mage',
    name: 'Маг',
    sprite: 'mage',
    desc: 'Цепная магия и криты, но очень хрупкий.',
    weapon: 'staff',
    weaponClass: 'arcane',
    ability: { id: 'arcane_circle', name: 'Магический круг', icon: 'i_orb', cooldown: ABILITY_BALANCE.arcaneCircle.cooldown, desc: '4 с: внутри магия +35%, враги замедлены на 20%' },
    mods: { damagePct: 25, critChance: 0.07, maxHp: -20, luck: 5 },
    unlockCost: 250,
  },
];
