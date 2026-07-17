import { loadMeta } from './save';
import type { PlayerProfile, SerializedPlayerProfile } from '../multiplayer/types';

export class StaticPlayerProfile implements PlayerProfile {
  private readonly perkLevels: Readonly<Record<string, number>>;
  private readonly unlockedIds: ReadonlySet<string>;

  constructor(serialized: SerializedPlayerProfile = { perkLevels: {}, unlockedIds: [] }) {
    this.perkLevels = { ...serialized.perkLevels };
    this.unlockedIds = new Set(serialized.unlockedIds);
  }

  perkLevel(id: string): number {
    return this.perkLevels[id] ?? 0;
  }

  isUnlocked(id: string): boolean {
    return this.unlockedIds.has(id);
  }

  serialize(): SerializedPlayerProfile {
    return {
      perkLevels: { ...this.perkLevels },
      unlockedIds: [...this.unlockedIds],
    };
  }
}

export function serializeLocalPlayerProfile(): SerializedPlayerProfile {
  const meta = loadMeta();
  return {
    perkLevels: { ...meta.perks },
    unlockedIds: [...meta.unlocked],
  };
}

export function localPlayerProfile(): StaticPlayerProfile {
  return new StaticPlayerProfile(serializeLocalPlayerProfile());
}

export const EMPTY_PLAYER_PROFILE = new StaticPlayerProfile();
