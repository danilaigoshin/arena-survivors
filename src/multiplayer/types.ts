export const NETWORK_VERSION = 1;
export const MAX_PLAYERS = 2;

export type PlayerSlot = 0 | 1;
export type SessionRole = 'solo' | 'host' | 'guest';

export interface SquadState {
  xp: number;
  level: number;
  materials: number;
}

export interface PlayerProfile {
  perkLevel(id: string): number;
  isUnlocked(id: string): boolean;
}

export interface SerializedPlayerProfile {
  perkLevels: Record<string, number>;
  unlockedIds: string[];
}

export interface PlayerInputState {
  moveX: number;
  moveY: number;
  abilityPressSeq: number;
}

export interface NetworkInput extends PlayerInputState {
  seq: number;
}

export const NEUTRAL_INPUT: Readonly<PlayerInputState> = Object.freeze({
  moveX: 0,
  moveY: 0,
  abilityPressSeq: 0,
});

export function isPlayerSlot(value: unknown): value is PlayerSlot {
  return value === 0 || value === 1;
}
