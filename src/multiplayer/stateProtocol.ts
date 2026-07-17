import { ABILITY_AUGMENTS, type AbilityAugmentId } from '../data/abilityAugments';
import { CHARACTERS } from '../data/characters';
import { ITEMS } from '../data/items';
import { TALENTS, type TalentId } from '../data/talents';
import { WEAPON_BRANCHES } from '../data/weaponBranches';
import { WEAPONS, type Tier } from '../data/weapons';
import { WeaponInstance, type WeaponBranchId } from '../entities/weapon';
import { BASE_STATS, type StatMod, type Stats } from '../entities/stats';
import type { RunState } from '../state';
import type { PlayerSlot } from './types';

export interface WeaponBuildState {
  slot: number;
  id: string;
  tier: Tier;
  branch: WeaponBranchId | null;
  branchPending: boolean;
}

export interface PlayerBuildState {
  slot: PlayerSlot;
  characterId: string;
  stats: Stats;
  items: string[];
  upgradeMods: StatMod[];
  talents: TalentId[];
  abilityAugments: AbilityAugmentId[];
  weapons: WeaponBuildState[];
}

export interface BuildState {
  version: 1;
  buildRevision: number;
  players: PlayerBuildState[];
}

interface PhaseBase {
  version: 1;
  phaseRevision: number;
}

export interface RunPhase extends PhaseBase {
  phase: 'run';
  wave: number;
}

export interface PausedPhase extends PhaseBase {
  phase: 'paused';
  reason: 'host' | 'hidden';
}

export interface LevelUpPhase extends PhaseBase {
  phase: 'level-up';
  choices: [string[], string[]];
  submitted: [boolean, boolean];
}

export interface ChestPhase extends PhaseBase {
  phase: 'chest';
  ownerSlot: PlayerSlot;
  choices: string[];
  submitted: boolean;
}

export interface ShopPhase extends PhaseBase {
  phase: 'shop';
  shops: [SerializedShopState, SerializedShopState];
  ready: [boolean, boolean];
  discount: number;
}

export interface SerializedShopOffer {
  kind: 'weapon' | 'item';
  definitionId: string;
  price: number;
  sold: boolean;
}

export interface SerializedShopState {
  offers: SerializedShopOffer[];
  rerollCost: number;
  rerollCount: number;
}

export interface EventPhase extends PhaseBase {
  phase: 'event';
  eventIds: [string, string];
  submitted: [boolean, boolean];
}

export interface ProgressionPhase extends PhaseBase {
  phase: 'progression';
  kind: 'ability' | 'contract';
  choiceIds: [string[], string[]];
  submitted: [boolean, boolean];
}

export interface EndPhase extends PhaseBase {
  phase: 'end';
  won: boolean;
}

export type PhaseState =
  | RunPhase
  | PausedPhase
  | LevelUpPhase
  | ChestPhase
  | ShopPhase
  | EventPhase
  | ProgressionPhase
  | EndPhase;

const characterById = new Map(CHARACTERS.map((definition) => [definition.id, definition]));
const weaponById = new Map(WEAPONS.map((definition) => [definition.id, definition]));
const itemById = new Map(ITEMS.map((definition) => [definition.id, definition]));
const talentIds = new Set(TALENTS.map((definition) => definition.id));
const augmentIds = new Set(ABILITY_AUGMENTS.map((definition) => definition.id));
const branchIds = new Set(WEAPON_BRANCHES.map((definition) => definition.id));
const statKeys = new Set(Object.keys(BASE_STATS));

export function captureBuildState(state: RunState, buildRevision: number): BuildState {
  return {
    version: 1,
    buildRevision,
    players: state.players.map((player) => ({
      slot: player.slot,
      characterId: player.character.id,
      stats: { ...player.stats },
      items: player.items.map((item) => item.id),
      upgradeMods: player.upgradeMods.map((modifier) => ({ ...modifier })),
      talents: [...player.talents],
      abilityAugments: [...player.abilityAugments],
      weapons: player.weapons.map((weapon) => ({
        slot: weapon.slotIndex,
        id: weapon.def.id,
        tier: weapon.tier,
        branch: weapon.branch,
        branchPending: weapon.branchPending,
      })),
    })),
  };
}

export function applyBuildState(state: RunState, build: BuildState): boolean {
  if (
    !build
    || typeof build !== 'object'
    || build.version !== 1
    || !Number.isSafeInteger(build.buildRevision)
    || !Array.isArray(build.players)
    || build.players.length !== state.players.length
    || build.players.length > 2
  ) return false;

  const seenSlots = new Set<PlayerSlot>();
  for (const playerBuild of build.players) {
    if (
      !playerBuild
      || typeof playerBuild !== 'object'
      || (playerBuild.slot !== 0 && playerBuild.slot !== 1)
      || seenSlots.has(playerBuild.slot)
      || typeof playerBuild.characterId !== 'string'
      || !Array.isArray(playerBuild.items)
      || !Array.isArray(playerBuild.upgradeMods)
      || !Array.isArray(playerBuild.talents)
      || !Array.isArray(playerBuild.abilityAugments)
      || !Array.isArray(playerBuild.weapons)
      || playerBuild.items.length > 64
      || playerBuild.upgradeMods.length > 128
      || playerBuild.talents.length > TALENTS.length
      || playerBuild.abilityAugments.length > ABILITY_AUGMENTS.length
    ) return false;
    seenSlots.add(playerBuild.slot);
    const player = state.playerBySlot(playerBuild.slot);
    const character = characterById.get(playerBuild.characterId);
    if (!player || !character || playerBuild.items.length > 64 || playerBuild.weapons.length > 6) return false;
    if (
      playerBuild.upgradeMods.some(
        (modifier) => !modifier
          || typeof modifier !== 'object'
          || Object.keys(modifier).some((key) => !statKeys.has(key))
          || Object.values(modifier).some((value) => typeof value !== 'number' || !Number.isFinite(value)),
      )
      || playerBuild.talents.some((id) => typeof id !== 'string')
      || playerBuild.abilityAugments.some((id) => typeof id !== 'string')
      || playerBuild.items.some((id) => typeof id !== 'string')
    ) return false;
    const items = playerBuild.items.map((id) => itemById.get(id));
    if (items.some((item) => !item)) return false;
    if (
      playerBuild.talents.some((id) => !talentIds.has(id))
      || playerBuild.abilityAugments.some((id) => !augmentIds.has(id))
    ) return false;

    const previousWeapons = player.weapons;
    const weapons: WeaponInstance[] = [];
    for (const weaponBuild of playerBuild.weapons) {
      if (
        !weaponBuild
        || typeof weaponBuild !== 'object'
        || typeof weaponBuild.id !== 'string'
        || typeof weaponBuild.branchPending !== 'boolean'
      ) return false;
      const definition = weaponById.get(weaponBuild.id);
      if (
        !definition
        || !Number.isInteger(weaponBuild.slot)
        || weaponBuild.slot < 0
        || weaponBuild.slot >= 6
        || !Number.isInteger(weaponBuild.tier)
        || weaponBuild.tier < 1
        || weaponBuild.tier > 4
        || (weaponBuild.branch !== null && !branchIds.has(weaponBuild.branch))
      ) return false;
      const weapon = previousWeapons.find(
        (entry) => entry.slotIndex === weaponBuild.slot && entry.def.id === definition.id,
      ) ?? new WeaponInstance(definition, weaponBuild.slot);
      weapon.def = definition;
      weapon.slotIndex = weaponBuild.slot;
      weapon.tier = weaponBuild.tier;
      weapon.branch = weaponBuild.branch;
      weapon.branchPending = weaponBuild.branchPending;
      weapons.push(weapon);
    }

    // Character identity is fixed by StartMessage. Assigning it directly keeps
    // current HP intact; setCharacter() would fully heal on every build ack.
    player.character = character;
    player.items = items as typeof player.items;
    player.upgradeMods = playerBuild.upgradeMods.map((modifier) => ({ ...modifier }));
    player.talents = new Set(playerBuild.talents);
    player.abilityAugments = new Set(playerBuild.abilityAugments);
    player.weapons = weapons;
    player.recomputeStats();
  }
  return true;
}
