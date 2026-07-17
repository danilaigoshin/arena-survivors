import { COOP_ENEMY_HP_MULT } from '../config';
import type { Enemy } from '../entities/enemy';
import type { RunState } from '../state';

export function applyEnemyRunScaling(state: RunState, enemy: Enemy): void {
  enemy.maxHp = Math.round(
    enemy.maxHp
      * state.difficulty.hpMult
      * (state.players.length > 1 ? COOP_ENEMY_HP_MULT : 1),
  );
  enemy.hp = enemy.maxHp;
}
