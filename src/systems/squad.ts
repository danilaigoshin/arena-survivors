import type { PlayerSlot, SquadState } from '../multiplayer/types';
import type { Player } from '../entities/player';

export function xpToNext(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(8 + (safeLevel - 1) * 5 + Math.pow(safeLevel - 1, 2) * 1.2);
}

export function spendSquadMaterials(squad: SquadState, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0 || squad.materials < amount) return false;
  squad.materials -= amount;
  return true;
}

export function createPendingChoices(): [number, number] {
  return [0, 0];
}

export function incrementPendingChoice(pending: [number, number], slot: PlayerSlot): void {
  pending[slot]++;
}

export function resetPlayersForWave(players: readonly Player[]): void {
  for (const player of players) {
    player.downed = false;
    player.hp = player.stats.maxHp;
    player.resetWaveMechanics();
  }
}
