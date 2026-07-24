import type { Obstacle } from '../data/maps';
import type { Player } from '../entities/player';
import type { NetworkInput } from './types';
import { applyPlayerMovement } from '../systems/playerMovement';

export interface PredictedPose {
  x: number;
  y: number;
}

interface InputSample {
  input: NetworkInput;
  dt: number;
}

export class GuestPrediction {
  private readonly samples: InputSample[] = [];
  private correctionX = 0;
  private correctionY = 0;
  private correctionStartedAt = 0;
  lastCorrectionDistance = 0;

  record(input: NetworkInput, dt: number): void {
    if (dt <= 0 || !Number.isFinite(dt)) return;
    this.samples.push({ input, dt });
    if (this.samples.length > 180) this.samples.shift();
  }

  reconcile(
    player: Player,
    obstacles: readonly Obstacle[],
    authoritative: PredictedPose,
    ackInputTick: number,
    nowMs: number,
  ): void {
    const displayedX = player.x;
    const displayedY = player.y;
    let acknowledged = 0;
    while (
      acknowledged < this.samples.length
      && this.samples[acknowledged].input.clientTick <= ackInputTick
    ) acknowledged++;
    if (acknowledged > 0) this.samples.splice(0, acknowledged);

    player.x = authoritative.x;
    player.y = authoritative.y;
    for (const sample of this.samples) applyPlayerMovement(player, obstacles, sample.input, sample.dt);

    const errorX = displayedX - player.x;
    const errorY = displayedY - player.y;
    this.lastCorrectionDistance = Math.hypot(errorX, errorY);
    if (this.lastCorrectionDistance <= 120) {
      this.correctionX = errorX;
      this.correctionY = errorY;
      this.correctionStartedAt = nowMs;
    } else {
      this.correctionX = 0;
      this.correctionY = 0;
      this.correctionStartedAt = nowMs;
    }
  }

  renderPose(player: Player, nowMs: number): PredictedPose {
    const remaining = Math.max(0, 1 - (nowMs - this.correctionStartedAt) / 100);
    return {
      x: player.x + this.correctionX * remaining,
      y: player.y + this.correctionY * remaining,
    };
  }

  clear(): void {
    this.samples.length = 0;
    this.correctionX = 0;
    this.correctionY = 0;
    this.lastCorrectionDistance = 0;
  }

  get pendingInputCount(): number {
    return this.samples.length;
  }
}
