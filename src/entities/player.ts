import { computeStats, type Stats, type StatMod } from './stats';
import type { ItemDef } from '../data/items';
import type { CharacterDef } from '../data/characters';
import { CHARACTERS } from '../data/characters';
import { WeaponInstance } from './weapon';
import { PERKS } from '../data/perks';
import { perkLevel } from '../core/save';
import { activeSetBonuses } from '../data/sets';
import { WEAPON_CLASS } from '../data/sets';
import type { WeaponDef } from '../data/weapons';
import { MAX_WEAPON_SLOTS } from '../config';
import { ARENA_W, ARENA_H } from '../config';

export class Player {
  x = ARENA_W / 2;
  y = ARENA_H / 2;
  radius = 16;
  hp: number;
  stats: Stats;
  character: CharacterDef = CHARACTERS[0];
  weapons: WeaponInstance[] = [];
  items: ItemDef[] = [];
  upgradeMods: StatMod[] = [];
  xp = 0;
  level = 1;
  materials = 0;
  iframes = 0;
  regenAcc = 0;
  aimAngle = 0; // last direction a weapon fired, for visuals
  moving = false;
  /** active ability cooldown remaining */
  abilityCd = 0;
  /** frost slow remaining (movement ×0.6 while > 0) */
  slowT = 0;
  /** last movement direction (for dash/blink when standing still it falls back to aim) */
  lastDirX = 1;
  lastDirY = 0;

  constructor() {
    this.stats = computeStats([]);
    this.hp = this.stats.maxHp;
  }

  setCharacter(c: CharacterDef): void {
    this.character = c;
    this.recomputeStats();
    this.hp = this.stats.maxHp;
  }

  recomputeStats(): void {
    const prevMax = this.stats.maxHp;
    const metaMods: StatMod[] = PERKS.filter((p) => perkLevel(p.id) > 0).map((p) => {
      const lvl = perkLevel(p.id);
      const mod: StatMod = {};
      for (const k in p.perLevel) mod[k as keyof StatMod] = p.perLevel[k as keyof StatMod]! * lvl;
      return mod;
    });
    const setMods = activeSetBonuses(this.weapons.map((w) => w.def.id)).map((s) => s.mod);
    this.stats = computeStats([this.character.mods, ...metaMods, ...setMods, ...this.items.map((i) => i.modifiers), ...this.upgradeMods]);
    // Grow current hp with max hp increases; clamp on decreases.
    const diff = this.stats.maxHp - prevMax;
    if (diff > 0) this.hp += diff;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  addItem(item: ItemDef): void {
    this.items.push(item);
    this.recomputeStats();
  }

  addUpgrade(mod: StatMod): void {
    this.upgradeMods.push(mod);
    this.recomputeStats();
  }

  canAddWeapon(): boolean {
    return this.weapons.length < MAX_WEAPON_SLOTS;
  }

  canUseWeapon(weapon: WeaponDef): boolean {
    return this.character.weaponClass === 'all' || WEAPON_CLASS[weapon.id] === this.character.weaponClass;
  }

  xpToNext(): number {
    return Math.round(8 + (this.level - 1) * 5 + Math.pow(this.level - 1, 2) * 1.2);
  }
}

export { ARENA_W, ARENA_H };
