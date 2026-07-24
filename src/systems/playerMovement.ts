import type { Obstacle } from '../data/maps';
import { pushOutOfObstacles } from '../data/maps';
import type { Player } from '../entities/player';
import type { NetworkInput, PlayerInputState } from '../multiplayer/types';
import { clamp } from '../utils/math';
import { consumeActionPress, moveAxis } from '../core/input';

export interface InputProvider {
  read(nowMs: number): PlayerInputState;
}

export class LocalInputProvider implements InputProvider {
  private readonly axis = { x: 0, y: 0 };
  private abilityPressSeq = 0;

  read(_nowMs: number): PlayerInputState {
    moveAxis(this.axis);
    if (consumeActionPress('ability')) this.abilityPressSeq++;
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
  private input: NetworkInput = {
    seq: 0,
    clientTick: 0,
    snapshotSeq: 0,
    moveX: 0,
    moveY: 0,
    abilityPressSeq: 0,
  };
  private readonly queued = new Map<number, NetworkInput>();
  private receivedAt = -Infinity;
  private appliedClientTick = 0;
  private highestSequence = 0;
  private latestSnapshotSeq = 0;

  accept(input: NetworkInput, nowMs: number): boolean {
    const timedOut = nowMs - this.receivedAt > 250;
    if (
      !Number.isSafeInteger(input.seq)
      || !Number.isSafeInteger(input.clientTick)
      || input.clientTick <= this.appliedClientTick
      || (!timedOut && input.clientTick > this.appliedClientTick + 180)
    ) return false;
    if (timedOut && input.clientTick > this.appliedClientTick + 1) {
      this.queued.clear();
      this.appliedClientTick = input.clientTick - 1;
    }
    const normalized = normalizePlayerInput(input);
    const command = {
      ...normalized,
      seq: input.seq,
      clientTick: input.clientTick,
      snapshotSeq: input.snapshotSeq,
    };
    const existing = this.queued.get(command.clientTick);
    if (existing && existing.seq >= command.seq) return false;
    this.queued.set(command.clientTick, command);
    this.highestSequence = Math.max(this.highestSequence, command.seq);
    this.latestSnapshotSeq = Math.max(this.latestSnapshotSeq, command.snapshotSeq);
    this.receivedAt = nowMs;
    return true;
  }

  read(nowMs: number): PlayerInputState {
    if (nowMs - this.receivedAt > 250) {
      return { moveX: 0, moveY: 0, abilityPressSeq: this.input.abilityPressSeq };
    }
    let nextTick = this.appliedClientTick + 1;
    let next = this.queued.get(nextTick);
    if (!next && this.appliedClientTick === 0 && this.queued.size > 0) {
      let firstTick = Infinity;
      for (const tick of this.queued.keys()) firstTick = Math.min(firstTick, tick);
      if (firstTick > 3 && Number.isFinite(firstTick)) {
        this.appliedClientTick = firstTick - 1;
        nextTick = firstTick;
        next = this.queued.get(nextTick);
      }
    }
    if (next) {
      this.queued.delete(nextTick);
      this.input = next;
    } else if (this.input.clientTick > 0) {
      // Inputs are state commands. A missing unreliable packet can be
      // reconstructed from the previous axes and cumulative ability counter.
      this.input.clientTick = nextTick;
    } else {
      return { moveX: 0, moveY: 0, abilityPressSeq: 0 };
    }
    this.appliedClientTick = nextTick;
    return this.input;
  }

  get lastSequence(): number {
    return this.highestSequence;
  }

  get lastAppliedClientTick(): number {
    return this.appliedClientTick;
  }

  get lastSnapshotSequence(): number {
    return this.latestSnapshotSeq;
  }

  reset(): void {
    this.input = {
      seq: 0,
      clientTick: 0,
      snapshotSeq: 0,
      moveX: 0,
      moveY: 0,
      abilityPressSeq: 0,
    };
    this.queued.clear();
    this.receivedAt = -Infinity;
    this.appliedClientTick = 0;
    this.highestSequence = 0;
    this.latestSnapshotSeq = 0;
  }
}
