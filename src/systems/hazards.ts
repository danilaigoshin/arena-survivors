import type { RunState } from '../state';
import { playSfx } from '../render/audio';
import { addShake, spawnBurst } from '../render/fx';
import { damageEnemy, damagePlayer } from './combat';

export function updateBomberExplosions(state: RunState, dt: number): void {
  for (let index = state.explosions.length - 1; index >= 0; index--) {
    const explosion = state.explosions[index];
    explosion.t -= dt;
    if (explosion.t > 0) continue;

    for (const player of state.alivePlayers()) {
      const radius = explosion.radius + player.radius;
      if ((explosion.x - player.x) ** 2 + (explosion.y - player.y) ** 2 <= radius * radius) {
        damagePlayer(state, player, explosion.damage);
      }
    }

    // Enemy bombs also damage nearby enemies, matching the existing friendly
    // fire rule while retaining a null player owner.
    state.grid.queryCircle(explosion.x, explosion.y, explosion.radius + 40, (enemyIndex) => {
      const enemy = state.enemies.items[enemyIndex];
      if (!enemy.active || enemy.hp <= 0) return;
      const radius = explosion.radius + enemy.radius;
      if ((explosion.x - enemy.x) ** 2 + (explosion.y - enemy.y) ** 2 > radius * radius) return;
      damageEnemy(
        state,
        enemy,
        25,
        false,
        0,
        0,
        undefined,
        explosion.x,
        explosion.y,
        0,
        { ownerPlayerSlot: null, x: explosion.x, y: explosion.y },
      );
    });

    spawnBurst(explosion.x, explosion.y, '#ff7030', 18);
    addShake(5);
    playSfx('death');
    state.explosions.splice(index, 1);
  }
}

export function updateFirePatches(state: RunState, dt: number): void {
  for (let index = state.firePatches.length - 1; index >= 0; index--) {
    const patch = state.firePatches[index];
    patch.ttl -= dt;
    if (patch.ttl <= 0) {
      state.firePatches.splice(index, 1);
      continue;
    }
    for (const player of state.alivePlayers()) {
      const radius = 26 + player.radius;
      if ((patch.x - player.x) ** 2 + (patch.y - player.y) ** 2 <= radius * radius) {
        damagePlayer(state, player, 6);
      }
    }
  }
}
