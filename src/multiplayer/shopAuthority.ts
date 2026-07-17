import { WeaponInstance } from '../entities/weapon';
import type { RunState } from '../state';
import { effectivePrice, reroll, type ShopState } from '../systems/shop';
import { spendSquadMaterials } from '../systems/squad';
import type { PlayerSlot } from './types';
import { WEAPON_BRANCHES } from '../data/weaponBranches';
import type { WeaponBranchId } from '../entities/weapon';
import { EVOLUTIONS } from '../data/evolutions';
import { weaponById } from '../data/weapons';

export type ShopCommand =
  | { type: 'buy'; phaseRevision: number; slot: PlayerSlot; offerIndex: number; branchId?: WeaponBranchId }
  | { type: 'reroll'; phaseRevision: number; slot: PlayerSlot }
  | { type: 'sell'; phaseRevision: number; slot: PlayerSlot; weaponSlot: number }
  | { type: 'branch'; phaseRevision: number; slot: PlayerSlot; weaponSlot: number; branchId: WeaponBranchId }
  | { type: 'evolve'; phaseRevision: number; slot: PlayerSlot; evolutionId: string }
  | { type: 'ready'; phaseRevision: number; slot: PlayerSlot; ready: boolean };

export interface AuthoritativeShopPhase {
  phaseRevision: number;
  shops: [ShopState, ShopState];
  ready: [boolean, boolean];
  discount: number;
}

export type ShopCommandResult =
  | { accepted: true; startNextWave: boolean }
  | { accepted: false; reason: 'stale' | 'invalid' | 'unaffordable' };

export function applyShopCommand(
  state: RunState,
  phase: AuthoritativeShopPhase,
  command: ShopCommand,
): ShopCommandResult {
  if (command.phaseRevision !== phase.phaseRevision) return { accepted: false, reason: 'stale' };
  const player = state.playerBySlot(command.slot);
  const shop = phase.shops[command.slot];
  if (!player || !shop) return { accepted: false, reason: 'invalid' };

  if (command.type === 'ready') {
    phase.ready[command.slot] = command.ready;
    return { accepted: true, startNextWave: phase.ready.every(Boolean) };
  }
  if (command.type === 'reroll') {
    const accepted = reroll(shop, state.wave, player, state.squad);
    if (!accepted) return { accepted: false, reason: 'unaffordable' };
    phase.ready[command.slot] = false;
    return { accepted: true, startNextWave: false };
  }
  if (command.type === 'sell') {
    const weaponIndex = player.weapons.findIndex((weapon) => weapon.slotIndex === command.weaponSlot);
    if (weaponIndex < 0 || player.weapons.length <= 1) return { accepted: false, reason: 'invalid' };
    const [weapon] = player.weapons.splice(weaponIndex, 1);
    state.squad.materials += Math.max(1, Math.round(weapon.def.price * weapon.tier * 0.6));
    player.weapons.forEach((entry, index) => { entry.slotIndex = index; });
    player.recomputeStats();
    phase.ready[command.slot] = false;
    return { accepted: true, startNextWave: false };
  }
  if (command.type === 'branch') {
    if (!WEAPON_BRANCHES.some((branch) => branch.id === command.branchId)) {
      return { accepted: false, reason: 'invalid' };
    }
    const weapon = player.weapons.find((entry) => entry.slotIndex === command.weaponSlot);
    if (!weapon || !player.chooseWeaponBranch(weapon, command.branchId)) {
      return { accepted: false, reason: 'invalid' };
    }
    phase.ready[command.slot] = false;
    return { accepted: true, startNextWave: false };
  }
  if (command.type === 'evolve') {
    const evolution = EVOLUTIONS.find((entry) => entry.result === command.evolutionId);
    if (!evolution || (evolution.minWave && state.wave < evolution.minWave)) {
      return { accepted: false, reason: 'invalid' };
    }
    const weapon = player.weapons.find(
      (entry) => entry.def.id === evolution.base && (entry.def.evolved || entry.tier >= 4),
    );
    const catalystIndex = player.items.findIndex((item) => item.id === evolution.catalyst);
    if (!weapon || catalystIndex < 0) return { accepted: false, reason: 'invalid' };
    weapon.def = weaponById(evolution.result);
    weapon.tier = 1;
    weapon.hitCooldowns.clear();
    weapon.cooldownTimer = 0;
    player.items.splice(catalystIndex, 1);
    player.recomputeStats();
    phase.ready[command.slot] = false;
    return { accepted: true, startNextWave: false };
  }

  const offer = shop.offers[command.offerIndex];
  if (!offer || offer.sold) return { accepted: false, reason: 'invalid' };
  const price = Math.max(1, Math.round(effectivePrice(offer, player) * phase.discount));
  let duplicate = null;
  if (offer.kind === 'weapon') {
    if (!player.canUseWeapon(offer.weapon)) return { accepted: false, reason: 'invalid' };
    duplicate = player.weapons
      .filter((weapon) => weapon.def.id === offer.weapon.id && weapon.tier < 4)
      .sort((a, b) => a.tier - b.tier)[0] ?? null;
    if (!duplicate && !player.canAddWeapon()) return { accepted: false, reason: 'invalid' };
    if (
      duplicate?.tier === 2
      && (!command.branchId || !WEAPON_BRANCHES.some((branch) => branch.id === command.branchId))
    ) return { accepted: false, reason: 'invalid' };
  }
  if (!spendSquadMaterials(state.squad, price)) return { accepted: false, reason: 'unaffordable' };
  if (offer.kind === 'item') {
    player.addItem(offer.item);
  } else {
    if (duplicate) {
      if (!player.upgradeWeapon(duplicate)) {
        state.squad.materials += price;
        return { accepted: false, reason: 'invalid' };
      }
      if (duplicate.tier === 3 && command.branchId && !player.chooseWeaponBranch(duplicate, command.branchId)) {
        duplicate.tier = 2;
        duplicate.branchPending = false;
        duplicate.branchPendingOrder = 0;
        state.squad.materials += price;
        return { accepted: false, reason: 'invalid' };
      }
    } else {
      player.weapons.push(new WeaponInstance(offer.weapon, player.weapons.length));
      player.recomputeStats();
    }
  }
  offer.sold = true;
  phase.ready[command.slot] = false;
  return { accepted: true, startNextWave: false };
}
