import { CHARACTERS } from '../data/characters';
import { PERKS } from '../data/perks';
import { WEAPONS } from '../data/weapons';
import { ITEMS } from '../data/items';
import { UPGRADES } from '../data/upgrades';
import { TALENTS } from '../data/talents';
import { ABILITY_AUGMENTS } from '../data/abilityAugments';
import { WAVE_CONTRACTS } from '../data/contracts';
import { DIFFICULTIES } from '../data/difficulty';
import { COSMETICS } from '../data/challenges';
import { ROUTES } from '../data/routes';
import { BASE_STATS } from '../entities/stats';
import { normalizePlayerInput } from '../systems/playerMovement';
import {
  NETWORK_VERSION,
  type NetworkInput,
  type PlayerSlot,
  type SerializedPlayerProfile,
} from './types';
import type { BuildState, PhaseState, SerializedShopState } from './stateProtocol';
import { normalizeRunMetrics, type RunMetrics } from '../core/runMetrics';

export const NETWORK_APP_ID = `arena-survivors-v${NETWORK_VERSION}`;
export const ROOM_CODE_LENGTH = 6;
const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ROOM_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;
const MAX_CONTROL_ARRAY = 128;
const cosmeticIds = new Set<string>(COSMETICS.map((cosmetic) => cosmetic.id));
const routeIds = new Set(ROUTES.map((route) => route.id));

export interface HandshakeMessage {
  type: 'handshake';
  version: number;
  role: 'host' | 'guest';
  characterId: string;
  profile: SerializedPlayerProfile;
}

export interface HandshakeAcceptedMessage {
  type: 'handshake-accepted';
  version: number;
  slot: PlayerSlot;
}

export interface LobbyReadyMessage {
  type: 'lobby-ready';
  version: number;
  ready: boolean;
}

export interface LobbyStateMessage {
  type: 'lobby-state';
  version: number;
  hostCharacterId: string;
  guestCharacterId: string;
  hostReady: boolean;
  guestReady: boolean;
  difficultyId: string;
}

export interface InputMessage {
  type: 'input';
  version: number;
  input: NetworkInput;
}

export interface PhaseCommandMessage {
  type: 'phase-command';
  version: number;
  phaseRevision: number;
  command: string;
  ids: string[];
  value?: number | boolean;
}

export interface ResyncRequestMessage {
  type: 'resync-request';
  version: number;
  afterEventId: number;
}

export interface SnapshotResyncMessage {
  type: 'snapshot-resync';
  version: number;
  afterSnapshotSeq: number;
}

export interface PingMessage {
  type: 'ping' | 'pong';
  version: number;
  sentAt: number;
}

export interface StartMessage {
  type: 'start';
  version: number;
  sessionId: string;
  hostCharacterId: string;
  guestCharacterId: string;
  difficultyId: string;
}

export interface RoomFullMessage {
  type: 'room-full';
  version: number;
}

export interface VersionMismatchMessage {
  type: 'version-mismatch';
  version: number;
  expectedVersion: number;
}

export interface EndResult {
  sessionId: string;
  resultId: string;
  wave: number;
  kills: number;
  won: boolean;
  difficultyId: string;
  shardsEarned: number;
  level: number;
  characterIds: string[];
  weaponIds: string[];
  playerCount: number;
  metrics: RunMetrics;
}

export interface EndResultMessage {
  type: 'end-result';
  version: number;
  result: EndResult;
}

export interface EndReceiptMessage {
  type: 'end-receipt';
  version: number;
  resultId: string;
}

export interface ReturnMenuMessage {
  type: 'return-menu';
  version: number;
}

export interface BuildStateMessage {
  type: 'build-state';
  version: number;
  build: BuildState;
}

export interface PhaseStateMessage {
  type: 'phase-state';
  version: number;
  state: PhaseState;
}

export type ControlMessage =
  | HandshakeMessage
  | HandshakeAcceptedMessage
  | LobbyReadyMessage
  | LobbyStateMessage
  | InputMessage
  | PhaseCommandMessage
  | ResyncRequestMessage
  | SnapshotResyncMessage
  | PingMessage
  | StartMessage
  | RoomFullMessage
  | VersionMismatchMessage
  | EndResultMessage
  | EndReceiptMessage
  | ReturnMenuMessage
  | BuildStateMessage
  | PhaseStateMessage;

const characterIds = new Set(CHARACTERS.map((character) => character.id));
const perkById = new Map(PERKS.map((perk) => [perk.id, perk]));
const unlockableIds = new Set([
  ...CHARACTERS.filter((character) => character.unlockCost).map((character) => character.id),
  ...WEAPONS.filter((weapon) => weapon.unlockCost).map((weapon) => weapon.id),
]);
const weaponIds = new Set(WEAPONS.map((weapon) => weapon.id));
const itemIds = new Set(ITEMS.map((item) => item.id));
const altarItemIds = new Set(ITEMS.filter((item) => item.rarity >= 3).map((item) => item.id));
const levelChoiceIds = new Set([
  ...UPGRADES.map((choice) => choice.id),
  ...TALENTS.map((choice) => choice.id),
]);
const augmentIds = new Set<string>(ABILITY_AUGMENTS.map((choice) => choice.id));
const contractIds = new Set(['none', ...WAVE_CONTRACTS.map((choice) => choice.id)]);
const talentIds = new Set<string>(TALENTS.map((choice) => choice.id));
const branchIds = new Set(['force', 'tempo']);
const difficultyIds = new Set(DIFFICULTIES.map((difficulty) => difficulty.id));
const statKeys = new Set(Object.keys(BASE_STATS));

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function stringArray(value: unknown, max = MAX_CONTROL_ARRAY): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((entry) => typeof entry === 'string' && entry.length <= 80);
}

function booleanPair(value: unknown): value is [boolean, boolean] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'boolean'
    && typeof value[1] === 'boolean';
}

function stringArrayPair(value: unknown, maxEach = 8): value is [string[], string[]] {
  return Array.isArray(value)
    && value.length === 2
    && stringArray(value[0], maxEach)
    && stringArray(value[1], maxEach);
}

function validChestLootId(value: string): boolean {
  const [kind, id, extra] = value.split(':');
  return extra === undefined
    && ((kind === 'weapon' && weaponIds.has(id)) || (kind === 'item' && itemIds.has(id)));
}

function validPersonalEventId(value: string): boolean {
  const [kind, rewardKind, id, extra] = value.split(':');
  if (extra !== undefined || (kind !== 'chest' && kind !== 'altar')) return false;
  if (kind === 'altar') return rewardKind === 'item' && altarItemIds.has(id);
  return (rewardKind === 'weapon' && weaponIds.has(id))
    || (rewardKind === 'item' && itemIds.has(id));
}

function validSerializedShop(value: unknown): boolean {
  const shop = record(value);
  if (
    !shop
    || !Array.isArray(shop.offers)
    || shop.offers.length !== 4
    || !safeSequence(shop.rerollCost)
    || !safeSequence(shop.rerollCount)
  ) return false;
  return shop.offers.every((rawOffer) => {
    const offer = record(rawOffer);
    return !!offer
      && (offer.kind === 'weapon' || offer.kind === 'item')
      && typeof offer.definitionId === 'string'
      && safeSequence(offer.price)
      && typeof offer.sold === 'boolean'
      && (offer.kind === 'weapon'
        ? weaponIds.has(offer.definitionId)
        : itemIds.has(offer.definitionId));
  });
}

function validBuildState(value: unknown): value is BuildState {
  const build = record(value);
  if (
    !build
    || build.version !== 1
    || !safeSequence(build.buildRevision)
    || !safeSequence(build.squadMaterials)
    || !Array.isArray(build.players)
    || build.players.length < 1
    || build.players.length > 2
    || (build.routeIds !== undefined
      && (!stringArray(build.routeIds, 3) || !build.routeIds.every((id) => routeIds.has(id))))
  ) return false;
  const slots = new Set<number>();
  return build.players.every((rawPlayer) => {
    const player = record(rawPlayer);
    if (
      !player
      || (player.slot !== 0 && player.slot !== 1)
      || slots.has(player.slot)
      || typeof player.characterId !== 'string'
      || !characterIds.has(player.characterId)
      || !safeSequence(player.materials)
      || !record(player.stats)
      || Object.keys(player.stats as Record<string, unknown>).length !== statKeys.size
      || Object.keys(player.stats as Record<string, unknown>).some((key) => !statKeys.has(key))
      || Object.values(player.stats as Record<string, unknown>).some((entry) => !finite(entry))
      || !stringArray(player.items, 64)
      || !player.items.every((id) => itemIds.has(id))
      || !Array.isArray(player.upgradeMods)
      || player.upgradeMods.length > 128
      || !player.upgradeMods.every((modifier) => {
        const values = record(modifier);
        return !!values
          && Object.keys(values).every((key) => statKeys.has(key))
          && Object.values(values).every(finite);
      })
      || !stringArray(player.talents, TALENTS.length)
      || !player.talents.every((id) => talentIds.has(id))
      || !stringArray(player.abilityAugments, ABILITY_AUGMENTS.length)
      || !player.abilityAugments.every((id) => augmentIds.has(id))
      || !Array.isArray(player.weapons)
      || player.weapons.length > 6
    ) return false;
    slots.add(player.slot);
    const weaponSlots = new Set<number>();
    return player.weapons.every((rawWeapon) => {
      const weapon = record(rawWeapon);
      const valid = !!weapon
        && safeSequence(weapon.slot)
        && weapon.slot < 6
        && !weaponSlots.has(weapon.slot)
        && typeof weapon.id === 'string'
        && weaponIds.has(weapon.id)
        && Number.isInteger(weapon.tier)
        && (weapon.tier as number) >= 1
        && (weapon.tier as number) <= 4
        && (weapon.branch === null || (typeof weapon.branch === 'string' && branchIds.has(weapon.branch)))
        && typeof weapon.branchPending === 'boolean';
      if (valid) weaponSlots.add(weapon.slot as number);
      return valid;
    });
  });
}

function parsePhaseState(value: unknown): PhaseState | null {
  const state = record(value);
  if (
    !state
    || state.version !== 1
    || !safeSequence(state.phaseRevision)
    || typeof state.phase !== 'string'
  ) return null;
  const base = { version: 1 as const, phaseRevision: state.phaseRevision };
  switch (state.phase) {
    case 'run':
      return safeSequence(state.wave) && state.wave >= 1
        ? { ...base, phase: 'run', wave: state.wave }
        : null;
    case 'paused':
      return state.reason === 'host' || state.reason === 'hidden'
        ? { ...base, phase: 'paused', reason: state.reason }
        : null;
    case 'level-up':
      if (
        !stringArrayPair(state.choices, 4)
        || !state.choices.every((choices) => choices.every((id) => levelChoiceIds.has(id)))
        || !booleanPair(state.submitted)
      ) return null;
      return { ...base, phase: 'level-up', choices: state.choices, submitted: state.submitted };
    case 'chest':
      if (
        (state.ownerSlot !== 0 && state.ownerSlot !== 1)
        || !stringArray(state.choices, 1)
        || state.choices.length !== 1
        || !validChestLootId(state.choices[0])
        || typeof state.submitted !== 'boolean'
      ) return null;
      return {
        ...base,
        phase: 'chest',
        ownerSlot: state.ownerSlot,
        choices: state.choices,
        submitted: state.submitted,
      };
    case 'shop':
      if (
        !Array.isArray(state.shops)
        || state.shops.length !== 2
        || !state.shops.every(validSerializedShop)
        || !booleanPair(state.ready)
        || !finite(state.discount)
        || state.discount <= 0
        || state.discount > 1
      ) return null;
      return {
        ...base,
        phase: 'shop',
        shops: state.shops as [SerializedShopState, SerializedShopState],
        ready: state.ready,
        discount: state.discount,
      };
    case 'event':
      if (
        !Array.isArray(state.eventIds)
        || state.eventIds.length !== 2
        || !state.eventIds.every((id) => typeof id === 'string' && validPersonalEventId(id))
        || !booleanPair(state.submitted)
      ) return null;
      return {
        ...base,
        phase: 'event',
        eventIds: state.eventIds as [string, string],
        submitted: state.submitted,
      };
    case 'progression':
      if (
        (state.kind !== 'ability' && state.kind !== 'contract' && state.kind !== 'route')
        || !stringArrayPair(state.choiceIds, 8)
        || !booleanPair(state.submitted)
        || !state.choiceIds.every((choices) => choices.every(
          (id) => (state.kind === 'ability' ? augmentIds : state.kind === 'route' ? routeIds : contractIds).has(id),
        ))
      ) return null;
      return {
        ...base,
        phase: 'progression',
        kind: state.kind,
        choiceIds: state.choiceIds,
        submitted: state.submitted,
      };
    case 'end':
      return typeof state.won === 'boolean' ? { ...base, phase: 'end', won: state.won } : null;
    default:
      return null;
  }
}

export function normalizeSerializedProfile(value: unknown): SerializedPlayerProfile | null {
  const input = record(value);
  const levels = record(input?.perkLevels);
  const unlocked = input?.unlockedIds;
  if (
    !input
    || !levels
    || Object.keys(levels).length > perkById.size
    || !stringArray(unlocked, unlockableIds.size)
  ) return null;

  const perkLevels: Record<string, number> = {};
  for (const [id, rawLevel] of Object.entries(levels)) {
    const perk = perkById.get(id);
    if (!perk) continue;
    if (!finite(rawLevel)) return null;
    perkLevels[id] = Math.max(0, Math.min(perk.costs.length, Math.floor(rawLevel)));
  }
  const unlockedIds = [...new Set(unlocked.filter((id) => unlockableIds.has(id)))];
  const cosmeticId = typeof input.cosmeticId === 'string' && cosmeticIds.has(input.cosmeticId)
    ? input.cosmeticId
    : undefined;
  return cosmeticId ? { perkLevels, unlockedIds, cosmeticId } : { perkLevels, unlockedIds };
}

export function parseNetworkInput(value: unknown): NetworkInput | null {
  const input = record(value);
  if (
    !input
    || !safeSequence(input.seq)
    || !safeSequence(input.clientTick)
    || !safeSequence(input.snapshotSeq)
    || !safeSequence(input.abilityPressSeq)
    || !finite(input.moveX)
    || !finite(input.moveY)
  ) {
    return null;
  }
  const normalized = normalizePlayerInput({
    moveX: input.moveX,
    moveY: input.moveY,
    abilityPressSeq: input.abilityPressSeq,
  });
  return {
    ...normalized,
    seq: input.seq,
    clientTick: input.clientTick,
    snapshotSeq: input.snapshotSeq,
  };
}

export function parseControlMessage(value: unknown): ControlMessage | null {
  const message = record(value);
  if (!message || typeof message.type !== 'string' || !safeSequence(message.version)) return null;
  if (message.type !== 'version-mismatch' && message.version !== NETWORK_VERSION) return null;

  switch (message.type) {
    case 'handshake': {
      const profile = normalizeSerializedProfile(message.profile);
      const character = typeof message.characterId === 'string'
        ? CHARACTERS.find((entry) => entry.id === message.characterId)
        : null;
      if (
        (message.role !== 'host' && message.role !== 'guest')
        || typeof message.characterId !== 'string'
        || !characterIds.has(message.characterId)
        || !character
        || (!!character.unlockCost && !profile?.unlockedIds.includes(character.id))
        || !profile
      ) return null;
      return { type: 'handshake', version: NETWORK_VERSION, role: message.role, characterId: message.characterId, profile };
    }
    case 'handshake-accepted':
      if (message.slot !== 0 && message.slot !== 1) return null;
      return { type: 'handshake-accepted', version: NETWORK_VERSION, slot: message.slot };
    case 'lobby-ready':
      return typeof message.ready === 'boolean'
        ? { type: 'lobby-ready', version: NETWORK_VERSION, ready: message.ready }
        : null;
    case 'lobby-state':
      if (
        typeof message.hostCharacterId !== 'string'
        || typeof message.guestCharacterId !== 'string'
        || !characterIds.has(message.hostCharacterId)
        || !characterIds.has(message.guestCharacterId)
        || typeof message.hostReady !== 'boolean'
        || typeof message.guestReady !== 'boolean'
        || typeof message.difficultyId !== 'string'
        || !difficultyIds.has(message.difficultyId)
      ) return null;
      return {
        type: 'lobby-state',
        version: NETWORK_VERSION,
        hostCharacterId: message.hostCharacterId,
        guestCharacterId: message.guestCharacterId,
        hostReady: message.hostReady,
        guestReady: message.guestReady,
        difficultyId: message.difficultyId,
      };
    case 'input': {
      const input = parseNetworkInput(message.input);
      return input ? { type: 'input', version: NETWORK_VERSION, input } : null;
    }
    case 'phase-command':
      if (
        !safeSequence(message.phaseRevision)
        || typeof message.command !== 'string'
        || message.command.length > 48
        || !stringArray(message.ids, 16)
        || (message.value !== undefined && typeof message.value !== 'boolean' && !finite(message.value))
      ) return null;
      return {
        type: 'phase-command',
        version: NETWORK_VERSION,
        phaseRevision: message.phaseRevision,
        command: message.command,
        ids: message.ids,
        value: message.value as number | boolean | undefined,
      };
    case 'resync-request':
      return safeSequence(message.afterEventId)
        ? { type: 'resync-request', version: NETWORK_VERSION, afterEventId: message.afterEventId }
        : null;
    case 'snapshot-resync':
      return safeSequence(message.afterSnapshotSeq)
        ? {
          type: 'snapshot-resync',
          version: NETWORK_VERSION,
          afterSnapshotSeq: message.afterSnapshotSeq,
        }
        : null;
    case 'ping':
    case 'pong':
      return finite(message.sentAt)
        ? { type: message.type, version: NETWORK_VERSION, sentAt: message.sentAt }
        : null;
    case 'start':
      if (
        typeof message.sessionId !== 'string'
        || message.sessionId.length < 1
        || message.sessionId.length > 80
        || typeof message.hostCharacterId !== 'string'
        || typeof message.guestCharacterId !== 'string'
        || !characterIds.has(message.hostCharacterId)
        || !characterIds.has(message.guestCharacterId)
        || typeof message.difficultyId !== 'string'
        || !difficultyIds.has(message.difficultyId)
      ) return null;
      return {
        type: 'start',
        version: NETWORK_VERSION,
        sessionId: message.sessionId,
        hostCharacterId: message.hostCharacterId,
        guestCharacterId: message.guestCharacterId,
        difficultyId: message.difficultyId,
      };
    case 'room-full':
      return { type: 'room-full', version: NETWORK_VERSION };
    case 'version-mismatch':
      return safeSequence(message.expectedVersion)
        ? { type: 'version-mismatch', version: message.version, expectedVersion: message.expectedVersion }
        : null;
    case 'end-result': {
      const result = record(message.result);
      if (
        !result
        || typeof result.sessionId !== 'string'
        || result.sessionId.length < 1
        || result.sessionId.length > 80
        || typeof result.resultId !== 'string'
        || result.resultId.length < 1
        || result.resultId.length > 80
        || !safeSequence(result.wave)
        || !safeSequence(result.kills)
        || typeof result.won !== 'boolean'
        || typeof result.difficultyId !== 'string'
        || !difficultyIds.has(result.difficultyId)
        || !safeSequence(result.shardsEarned)
        || !safeSequence(result.level)
        || result.level < 1
        || !stringArray(result.characterIds, 2)
        || result.characterIds.length !== result.playerCount
        || !result.characterIds.every((id) => characterIds.has(id))
        || !stringArray(result.weaponIds, 64)
        || !result.weaponIds.every((id) => weaponIds.has(id))
        || (result.playerCount !== 1 && result.playerCount !== 2)
        || !record(result.metrics)
      ) return null;
      return {
        type: 'end-result',
        version: NETWORK_VERSION,
        result: {
          sessionId: result.sessionId,
          resultId: result.resultId,
          wave: result.wave,
          kills: result.kills,
          won: result.won,
          difficultyId: result.difficultyId,
          shardsEarned: result.shardsEarned,
          level: result.level,
          characterIds: [...result.characterIds],
          weaponIds: [...new Set(result.weaponIds)],
          playerCount: result.playerCount,
          metrics: normalizeRunMetrics(result.metrics),
        },
      };
    }
    case 'end-receipt':
      return typeof message.resultId === 'string' && message.resultId.length > 0 && message.resultId.length <= 80
        ? { type: 'end-receipt', version: NETWORK_VERSION, resultId: message.resultId }
        : null;
    case 'return-menu':
      return { type: 'return-menu', version: NETWORK_VERSION };
    case 'build-state': {
      return validBuildState(message.build)
        ? { type: 'build-state', version: NETWORK_VERSION, build: message.build }
        : null;
    }
    case 'phase-state': {
      const state = parsePhaseState(message.state);
      return state ? { type: 'phase-state', version: NETWORK_VERSION, state } : null;
    }
    default:
      return null;
  }
}

export function generateRoomCode(): string {
  const random = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(random);
  let code = '';
  for (const byte of random) code += ROOM_ALPHABET[byte & 31];
  return code;
}

export function normalizeRoomCode(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return ROOM_PATTERN.test(normalized) ? normalized : null;
}

export function createSessionId(): string {
  return crypto.randomUUID();
}
