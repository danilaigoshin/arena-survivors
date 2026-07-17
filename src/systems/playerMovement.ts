import type { Obstacle } from '../data/maps';
import { pushOutOfObstacles } from '../data/maps';
import type { Player } from '../entities/player';
import type { NetworkInput, PlayerInputState } from '../multiplayer/types';
import { clamp } from '../utils/math';
import { consumeKeyPress, moveAxis } from '../core/input';

export interface InputProvider {
  read(nowMs: number): PlayerInputState;
}

export class LocalInputProvider implements InputProvider {
  private readonly axis = { x: 0, y: 0 };
  private abilityPressSeq = 0;

  read(_nowMs: number): PlayerInputState {
    moveAxis(this.axis);
    if (consumeKeyPress('Space')) this.abilityPressSeq++;
    return normalizePlayerInput({
      moveX: this.axis.x,
      moveY: this.axis.y,
      abilityPressSeq: this.abilityPressSeq,
    });
  }

  reset(): void {
    this.axis.x = 0;
    this.axis.y = 0;
    this.abilityPressSeq = 0;
  }
}

export function normalizePlayerInput(input: PlayerInputState): PlayerInputState {
  let moveX = Number.isFinite(input.moveX) ? clamp(input.moveX, -1, 1) : 0;
  let moveY = Number.isFinite(input.moveY) ? clamp(input.moveY, -1, 1) : 0;
  const length = Math.hypot(moveX, moveY);
  if (length > 1) {
    moveX /= length;
    moveY /= length;
  }
  return {
    moveX,
    moveY,
    abilityPressSeq: Number.isSafeInteger(input.abilityPressSeq) && input.abilityPressSeq >= 0
      ? input.abilityPressSeq
      : 0,
  };
}

export function applyPlayerMovement(
  player: Player,
  obstacles: readonly Obstacle[],
  input: PlayerInputState,
  dt: number,
): void {
  if (player.downed) {
    player.moving = false;
    return;
  }
  const normalized = normalizePlayerInput(input);
  player.moving = normalized.moveX !== 0 || normalized.moveY !== 0;
  const moveMult = (player.slowT > 0 ? 0.6 : 1)
    * player.abilityMoveSpeedMultiplier()
    * player.talentMoveSpeedMultiplier();
  player.x = clamp(
    player.x + normalized.moveX * player.stats.moveSpeed * moveMult * dt,
    player.radius,
    player.arenaWidth - player.radius,
  );
  player.y = clamp(
    player.y + normalized.moveY * player.stats.moveSpeed * moveMult * dt,
    player.radius,
    player.arenaHeight - player.radius,
  );
  pushOutOfObstacles(obstacles, player);
}

export class RemoteInputProvider implements InputProvider {
  private input: NetworkInput = { seq: 0, moveX: 0, moveY: 0, abilityPressSeq: 0 };
  private receivedAt = -Infinity;

  accept(input: NetworkInput, nowMs: number): boolean {
    if (!Number.isSafeInteger(input.seq) || input.seq <= this.input.seq) return false;
    const normalized = normalizePlayerInput(input);
    this.input = { ...normalized, seq: input.seq };
    this.receivedAt = nowMs;
    return true;
  }

  read(nowMs: number): PlayerInputState {
    if (nowMs - this.receivedAt > 250) {
      return { moveX: 0, moveY: 0, abilityPressSeq: this.input.abilityPressSeq };
    }
    return this.input;
  }

  get lastSequence(): number {
    return this.input.seq;
  }

  reset(): void {
    this.input = { seq: 0, moveX: 0, moveY: 0, abilityPressSeq: 0 };
    this.receivedAt = -Infinity;
  }
}
