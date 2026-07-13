import { Pool } from './core/pool';
import { SpatialGrid } from './core/spatialGrid';
import { Player } from './entities/player';
import { Enemy } from './entities/enemy';
import { Projectile } from './entities/projectile';
import { Pickup } from './entities/pickup';
import { AreaEffect } from './entities/areaEffect';
import { POOL_AREA_EFFECTS, POOL_ENEMIES, POOL_PROJECTILES, POOL_PICKUPS, PICKUP_MERGE_CAP } from './config';
import { dist2 } from './utils/math';
import { THEMES, type MapTheme, type Obstacle } from './data/maps';
import { DIFFICULTIES, type DifficultyDef } from './data/difficulty';
import type { WaveContractDef } from './data/contracts';
import type { WaveObjectiveState } from './data/objectives';

export class RunState {
  difficulty: DifficultyDef = DIFFICULTIES[1];
  theme: MapTheme = THEMES[0];
  obstacles: Obstacle[] = [];
  floorCanvas: HTMLCanvasElement | null = null;
  /** battlefield chests waiting to be opened */
  chests: { x: number; y: number }[] = [];
  /** bomber death explosions: telegraph, then boom at t<=0 */
  explosions: { x: number; y: number; t: number; radius: number; damage: number }[] = [];
  /** burning ground left by the Brute's charges */
  firePatches: { x: number; y: number; ttl: number }[] = [];
  player = new Player();
  enemies = new Pool(POOL_ENEMIES, () => new Enemy());
  projectiles = new Pool(POOL_PROJECTILES, () => new Projectile());
  areaEffects = new Pool(POOL_AREA_EFFECTS, () => new AreaEffect());
  pickups = new Pool(POOL_PICKUPS, () => new Pickup());
  grid = new SpatialGrid(POOL_ENEMIES);

  wave = 1;
  kills = 0;
  waveTimer = 0;
  spawnTimer = 0;
  bossUid = 0; // 0 = no boss alive
  bossDead = false;
  pendingLevelUps = 0;
  /** How many pending level rewards must use the one-time mechanical talent pool. */
  pendingTalentLevelUps = 0;
  /** Optional risk modifier selected for this wave only. */
  activeContract: WaveContractDef | null = null;
  /** Optional timed arena objective and materials collected during this wave. */
  objective: WaveObjectiveState | null = null;
  waveMaterials = 0;
  /** sim freeze remaining (crit/boss-kill juice) */
  hitStop = 0;
  hitStopCd = 0;
  /** end-of-wave vacuum: all pickups fly to the player */
  vacuum = false;

  spawnProjectile(x: number, y: number, vx: number, vy: number, damage: number, pierce: number, ttl: number, friendly: boolean, crit = false, style = '', variant = 0): Projectile {
    let p = this.projectiles.alloc();
    if (!p) {
      // recycle oldest slot
      p = this.projectiles.items[0];
    }
    p.active = true;
    p.init(x, y, vx, vy, damage, pierce, ttl, friendly, crit, style, variant);
    return p;
  }

  dropMaterials(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    // merge into an existing nearby pickup when over the cap
    if (this.pickups.count >= PICKUP_MERGE_CAP) {
      let bestI = -1;
      let bestD = Infinity;
      for (let i = 0; i < this.pickups.count; i++) {
        const pk = this.pickups.items[i];
        const d = dist2(pk.x, pk.y, x, y);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      if (bestI >= 0) {
        this.pickups.items[bestI].value += amount;
        return;
      }
    }
    const pk = this.pickups.alloc();
    if (pk) pk.init(x, y, amount);
    else if (this.pickups.count > 0) this.pickups.items[0].value += amount;
  }
}
