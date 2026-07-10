import type { StatMod } from '../entities/stats';

export interface AbilityDef {
  id: 'magnet' | 'slam' | 'dash' | 'blink';
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
    ability: { id: 'magnet', name: 'Всепритяжение', icon: 'i_magnet', cooldown: 8, desc: 'Притянуть все кристаллы на арене' },
    mods: {},
  },
  {
    id: 'knight',
    name: 'Рыцарь',
    sprite: 'knight',
    desc: 'Танк ближнего боя: крепкий, но медленный.',
    weapon: 'sword',
    ability: { id: 'slam', name: 'Раскат', icon: 'i_armor', cooldown: 9, desc: 'Ударная волна: урон и отброс вокруг' },
    mods: { maxHp: 25, armor: 3, damagePct: 10, moveSpeed: -20 },
    unlockCost: 150,
  },
  {
    id: 'ranger',
    name: 'Стрелок',
    sprite: 'ranger',
    desc: 'Скорострельность и мобильность ценой живучести.',
    weapon: 'smg',
    ability: { id: 'dash', name: 'Рывок', icon: 'i_speed', cooldown: 5, desc: 'Рывок с неуязвимостью' },
    mods: { attackSpeedPct: 25, moveSpeed: 15, maxHp: -15 },
  },
  {
    id: 'mage',
    name: 'Маг',
    sprite: 'mage',
    desc: 'Цепная магия и криты, но очень хрупкий.',
    weapon: 'staff',
    ability: { id: 'blink', name: 'Телепорт', icon: 'i_orb', cooldown: 8, desc: 'Мгновенный прыжок сквозь толпу' },
    mods: { damagePct: 25, critChance: 0.07, maxHp: -20, luck: 5 },
    unlockCost: 250,
  },
];
