import { tierChainBonus, tierOrbBonus, type WeaponDef, type Tier } from '../data/weapons';

export class WeaponInstance {
  def: WeaponDef;
  tier: Tier = 1;
  cooldownTimer = 0;
  /** 1 right after firing, decays; drives held-weapon kickback + muzzle flash */
  recoil = 0;
  /** angle of the last shot/swing — each hand aims at its own target */
  fireAngle = 0;
  orbitAngle = 0;
  /** enemy uid -> time until this orb weapon can hit it again */
  hitCooldowns = new Map<number, number>();
  // melee swipe visual
  swipeTimer = 0;
  swipeAngle = 0;
  /** Short-lived chain-lightning path: player origin + up to six targets. */
  chainFxTimer = 0;
  chainFxPointCount = 0;
  readonly chainFxX = new Float32Array(7);
  readonly chainFxY = new Float32Array(7);
  slotIndex = 0;

  constructor(def: WeaponDef, slotIndex: number) {
    this.def = def;
    this.slotIndex = slotIndex;
    this.orbitAngle = slotIndex * 1.1;
  }
}

/** Orbit weapons gain extra orbs at higher tiers. */
export function weaponOrbCount(w: WeaponInstance): number {
  return (w.def.orbit?.orbCount ?? 0) + tierOrbBonus(w.tier);
}

export function weaponChainTargetCount(w: WeaponInstance): number {
  return (w.def.chain?.targets ?? 0) + tierChainBonus(w.tier);
}
