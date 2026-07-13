import { computeStats, type Stats, type StatMod } from './stats';
import type { ItemDef } from '../data/items';
import type { CharacterDef } from '../data/characters';
import { CHARACTERS } from '../data/characters';
import { WeaponInstance } from './weapon';
import { PERKS } from '../data/perks';
import { perkLevel } from '../core/save';
import { activeSetBonuses, classCounts } from '../data/sets';
import { WEAPON_CLASS } from '../data/sets';
import { ABILITY_BALANCE } from '../data/abilities';
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
  /** active phase and post-effect recovery timers */
  abilityActiveT = 0;
  abilityRecoveryT = 0;
  /** reusable state for pulsing and placed abilities */
  abilityPulseT = 0;
  abilityPulseCount = 0;
  abilityX = 0;
  abilityY = 0;
  abilityPower = 0;
  /** frost slow remaining (movement ×0.6 while > 0) */
  slowT = 0;

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

  activateAbility(): void {
    this.clearAbilityEffects();
    switch (this.character.ability.id) {
      case 'adaptation':
        this.abilityActiveT = ABILITY_BALANCE.adaptation.duration;
        this.abilityPower = classCounts(this.weapons.map((w) => w.def.id)).size * ABILITY_BALANCE.adaptation.bonusPerClass;
        break;
      case 'whirlwind':
        this.abilityActiveT = ABILITY_BALANCE.whirlwind.duration;
        this.abilityPulseT = 0;
        break;
      case 'overheat':
        this.abilityActiveT = ABILITY_BALANCE.overheat.duration;
        break;
      case 'arcane_circle':
        this.abilityActiveT = ABILITY_BALANCE.arcaneCircle.duration;
        this.abilityX = this.x;
        this.abilityY = this.y;
        break;
    }
  }

  updateAbilityTimers(dt: number): void {
    this.abilityRecoveryT = Math.max(0, this.abilityRecoveryT - dt);
    if (this.abilityActiveT <= 0) return;
    this.abilityActiveT = Math.max(0, this.abilityActiveT - dt);
    if (this.abilityActiveT === 0 && this.character.ability.id === 'overheat') {
      this.abilityRecoveryT = ABILITY_BALANCE.overheat.recoveryDuration;
    }
  }

  clearAbilityEffects(): void {
    this.abilityActiveT = 0;
    this.abilityRecoveryT = 0;
    this.abilityPulseT = 0;
    this.abilityPulseCount = 0;
    this.abilityX = 0;
    this.abilityY = 0;
    this.abilityPower = 0;
  }

  abilityDamageMultiplier(_weaponId: string): number {
    if (this.character.ability.id === 'adaptation' && this.abilityActiveT > 0) return 1 + this.abilityPower;
    return 1;
  }

  abilityAttackSpeedMultiplier(weaponId: string): number {
    const cls = WEAPON_CLASS[weaponId];
    if (this.character.ability.id === 'adaptation' && this.abilityActiveT > 0) return 1 + this.abilityPower;
    if (this.character.ability.id === 'overheat' && cls === 'gunner') {
      if (this.abilityActiveT > 0) return ABILITY_BALANCE.overheat.attackSpeedMult;
      if (this.abilityRecoveryT > 0) return ABILITY_BALANCE.overheat.recoveryAttackSpeedMult;
    }
    if (this.character.ability.id === 'arcane_circle' && cls === 'arcane' && this.isInsideArcaneCircle()) {
      return ABILITY_BALANCE.arcaneCircle.attackSpeedMult;
    }
    return 1;
  }

  abilitySpreadMultiplier(weaponId: string): number {
    return this.character.ability.id === 'overheat' && this.abilityActiveT > 0 && WEAPON_CLASS[weaponId] === 'gunner'
      ? ABILITY_BALANCE.overheat.spreadMult
      : 1;
  }

  abilityMoveSpeedMultiplier(): number {
    return this.character.ability.id === 'whirlwind' && this.abilityActiveT > 0
      ? ABILITY_BALANCE.whirlwind.moveSpeedMult
      : 1;
  }

  isInsideArcaneCircle(): boolean {
    if (this.character.ability.id !== 'arcane_circle' || this.abilityActiveT <= 0) return false;
    const dx = this.x - this.abilityX;
    const dy = this.y - this.abilityY;
    return dx * dx + dy * dy <= ABILITY_BALANCE.arcaneCircle.radius ** 2;
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
