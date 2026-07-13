import { computeStats, type Stats, type StatMod } from './stats';
import type { ItemDef } from '../data/items';
import type { CharacterDef } from '../data/characters';
import { CHARACTERS } from '../data/characters';
import { WeaponInstance, type WeaponBranchId } from './weapon';
import { PERKS } from '../data/perks';
import { perkLevel } from '../core/save';
import { activeSetBonuses, classCounts } from '../data/sets';
import { WEAPON_CLASS } from '../data/sets';
import { ABILITY_BALANCE } from '../data/abilities';
import { MAX_TIER, type Tier, type WeaponDef } from '../data/weapons';
import type { TalentId } from '../data/talents';
import type { AbilityAugmentId } from '../data/abilityAugments';
import { weaponBranchById } from '../data/weaponBranches';
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
  talents = new Set<TalentId>();
  abilityAugments = new Set<AbilityAugmentId>();
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
  /** Runtime meters for unique mechanical talents. */
  momentumT = 0;
  barrierCd = 0;
  magneticPulseProgress = 0;
  private branchQueueCounter = 0;

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

  addTalent(id: TalentId): void {
    this.talents.add(id);
    if (id === 'barrier') this.barrierCd = 0;
  }

  hasTalent(id: TalentId): boolean {
    return this.talents.has(id);
  }

  addAbilityAugment(id: AbilityAugmentId): void {
    if (this.abilityAugments.has(id)) return;
    this.abilityAugments.add(id);
    if (id === 'adaptation_cycle') this.abilityCd *= 0.9;
  }

  hasAbilityAugment(id: AbilityAugmentId): boolean {
    return this.abilityAugments.has(id);
  }

  /** Raises a weapon tier and queues its one-time specialization at tier III. */
  upgradeWeapon(w: WeaponInstance): boolean {
    if (w.tier >= MAX_TIER) return false;
    w.tier = (w.tier + 1) as Tier;
    if (w.tier === 3 && !w.branch) {
      w.branchPending = true;
      w.branchPendingOrder = ++this.branchQueueCounter;
    }
    return true;
  }

  pendingWeaponBranches(): WeaponInstance[] {
    return this.weapons
      .filter((weapon) => weapon.branchPending && !weapon.branch)
      .sort((a, b) => (a.branchPendingOrder || Infinity) - (b.branchPendingOrder || Infinity));
  }

  /** Applies a queued tier-III specialization while preserving cooldown progress. */
  chooseWeaponBranch(w: WeaponInstance, id: WeaponBranchId): boolean {
    const branch = weaponBranchById(id);
    if (!branch || !this.weapons.includes(w) || w.branch || !w.branchPending) return false;
    w.branch = id;
    w.branchPending = false;
    w.branchPendingOrder = 0;
    // A speed specialization changes the total cooldown. Rescale every active
    // timer so the already-completed fraction remains exactly the same.
    w.cooldownTimer /= branch.attackSpeedMult;
    for (const [uid, cooldown] of w.hitCooldowns) {
      w.hitCooldowns.set(uid, cooldown / branch.attackSpeedMult);
    }
    for (let i = 0; i < w.summonCount; i++) {
      w.summonHitCd[i] /= branch.attackSpeedMult;
    }
    return true;
  }

  resetWaveMechanics(): void {
    this.clearAbilityEffects();
    this.momentumT = 0;
    this.barrierCd = 0;
  }

  updateTalentTimers(dt: number): void {
    this.barrierCd = Math.max(0, this.barrierCd - dt);
    if (!this.hasTalent('momentum')) return;
    this.momentumT = this.moving ? Math.min(1.5, this.momentumT + dt) : 0;
  }

  /** Returns how many magnetic pulses were earned by this pickup. */
  collectForMagneticPulse(amount: number): number {
    if (!this.hasTalent('magnetic_pulse')) return 0;
    this.magneticPulseProgress += amount;
    let pulses = 0;
    while (this.magneticPulseProgress >= 60) {
      this.magneticPulseProgress -= 60;
      pulses++;
    }
    return pulses;
  }

  talentDamageMultiplier(enemyHpFraction: number, isBoss: boolean): number {
    let mult = 1;
    if (this.hasTalent('executioner') && enemyHpFraction <= 0.25) mult *= isBoss ? 1.08 : 1.2;
    if (this.hasTalent('last_stand') && this.hp / this.stats.maxHp <= 0.35) mult *= 1.12;
    return mult;
  }

  talentAttackSpeedMultiplier(): number {
    return this.hasTalent('momentum') && this.momentumT >= 1.5 ? 1.12 : 1;
  }

  talentMoveSpeedMultiplier(): number {
    return this.hasTalent('last_stand') && this.hp / this.stats.maxHp <= 0.35 ? 1.1 : 1;
  }

  tryBlockWithBarrier(): boolean {
    if (!this.hasTalent('barrier') || this.barrierCd > 0) return false;
    this.barrierCd = 18;
    return true;
  }

  abilityCooldown(): number {
    return this.character.ability.cooldown * (this.hasAbilityAugment('adaptation_cycle') ? 0.9 : 1);
  }

  abilityDuration(): number {
    switch (this.character.ability.id) {
      case 'adaptation': return ABILITY_BALANCE.adaptation.duration + (this.hasAbilityAugment('adaptation_duration') ? 0.5 : 0);
      case 'whirlwind': return ABILITY_BALANCE.whirlwind.duration;
      case 'overheat': return ABILITY_BALANCE.overheat.duration + (this.hasAbilityAugment('overheat_duration') ? 0.5 : 0);
      case 'arcane_circle': return ABILITY_BALANCE.arcaneCircle.duration + (this.hasAbilityAugment('circle_duration') ? 0.6 : 0);
    }
  }

  adaptationBonusPerClass(): number {
    return ABILITY_BALANCE.adaptation.bonusPerClass + (this.hasAbilityAugment('adaptation_power') ? 0.01 : 0);
  }

  whirlwindHits(): number {
    return ABILITY_BALANCE.whirlwind.hits + (this.hasAbilityAugment('whirlwind_hits') ? 1 : 0);
  }

  whirlwindDamageScale(): number {
    return this.hasAbilityAugment('whirlwind_hits') ? 0.4 : ABILITY_BALANCE.whirlwind.damageScale;
  }

  whirlwindRadius(): number {
    return ABILITY_BALANCE.whirlwind.radius * (this.hasAbilityAugment('whirlwind_radius') ? 1.2 : 1);
  }

  whirlwindHitInterval(): number {
    return this.abilityDuration() / this.whirlwindHits();
  }

  overheatAttackSpeedMultiplier(): number {
    return this.hasAbilityAugment('overheat_speed') ? 1.65 : ABILITY_BALANCE.overheat.attackSpeedMult;
  }

  overheatRecoveryDuration(): number {
    return this.hasAbilityAugment('overheat_recovery') ? 1.5 : ABILITY_BALANCE.overheat.recoveryDuration;
  }

  overheatRecoveryAttackSpeedMultiplier(): number {
    return this.hasAbilityAugment('overheat_recovery') ? 0.85 : ABILITY_BALANCE.overheat.recoveryAttackSpeedMult;
  }

  arcaneCircleRadius(): number {
    let radius = ABILITY_BALANCE.arcaneCircle.radius;
    if (this.hasAbilityAugment('circle_radius')) radius *= 1.15;
    if (this.hasAbilityAugment('circle_mobile')) radius *= 0.8;
    return radius;
  }

  arcaneCircleAttackSpeedMultiplier(): number {
    return this.hasAbilityAugment('circle_power') ? 1.42 : ABILITY_BALANCE.arcaneCircle.attackSpeedMult;
  }

  activateAbility(): void {
    this.clearAbilityEffects();
    switch (this.character.ability.id) {
      case 'adaptation':
        this.abilityActiveT = this.abilityDuration();
        this.abilityPower = classCounts(this.weapons.map((w) => w.def.id)).size * this.adaptationBonusPerClass();
        if (this.hasAbilityAugment('adaptation_heal')) {
          const classCount = classCounts(this.weapons.map((w) => w.def.id)).size;
          this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * classCount * 0.02);
        }
        break;
      case 'whirlwind':
        this.abilityActiveT = this.abilityDuration();
        this.abilityPulseT = 0;
        break;
      case 'overheat':
        this.abilityActiveT = this.abilityDuration();
        break;
      case 'arcane_circle':
        this.abilityActiveT = this.abilityDuration();
        this.abilityX = this.x;
        this.abilityY = this.y;
        break;
    }
  }

  updateAbilityTimers(dt: number): void {
    this.abilityRecoveryT = Math.max(0, this.abilityRecoveryT - dt);
    if (this.abilityActiveT <= 0) return;
    if (this.character.ability.id === 'arcane_circle' && this.hasAbilityAugment('circle_mobile')) {
      this.abilityX = this.x;
      this.abilityY = this.y;
    }
    this.abilityActiveT = Math.max(0, this.abilityActiveT - dt);
    if (this.abilityActiveT === 0 && this.character.ability.id === 'overheat') {
      this.abilityRecoveryT = this.overheatRecoveryDuration();
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
      if (this.abilityActiveT > 0) return this.overheatAttackSpeedMultiplier();
      if (this.abilityRecoveryT > 0) return this.overheatRecoveryAttackSpeedMultiplier();
    }
    if (this.character.ability.id === 'arcane_circle' && cls === 'arcane' && this.isInsideArcaneCircle()) {
      return this.arcaneCircleAttackSpeedMultiplier();
    }
    return 1;
  }

  abilitySpreadMultiplier(weaponId: string): number {
    return this.character.ability.id === 'overheat' && this.abilityActiveT > 0 && WEAPON_CLASS[weaponId] === 'gunner'
      ? ABILITY_BALANCE.overheat.spreadMult * (this.hasAbilityAugment('overheat_focus') ? 0.6 : 1)
      : 1;
  }

  abilityMoveSpeedMultiplier(): number {
    return this.character.ability.id === 'whirlwind' && this.abilityActiveT > 0
      ? this.hasAbilityAugment('whirlwind_stride') ? 0.9 : ABILITY_BALANCE.whirlwind.moveSpeedMult
      : 1;
  }

  isInsideArcaneCircle(): boolean {
    if (this.character.ability.id !== 'arcane_circle' || this.abilityActiveT <= 0) return false;
    const dx = this.x - this.abilityX;
    const dy = this.y - this.abilityY;
    return dx * dx + dy * dy <= this.arcaneCircleRadius() ** 2;
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
