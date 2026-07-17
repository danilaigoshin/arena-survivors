import { describe, expect, it } from 'vitest';
import { Player } from '../src/entities/player';
import { RunState } from '../src/state';
import {
  applyWeaponStatus,
  damagePlayer,
  updateAreaEffects,
  updateEnemyStatuses,
  updateWeapons,
} from '../src/systems/combat';
import { enemyContactDamage, updateProjectiles } from '../src/systems/collision';
import { updateBomberExplosions, updateFirePatches } from '../src/systems/hazards';
import { WeaponInstance } from '../src/entities/weapon';
import { weaponById } from '../src/data/weapons';

function stateWithTwoPlayers(): RunState {
  const state = new RunState([new Player(0), new Player(1)]);
  state.players[0].x = 100;
  state.players[0].y = 100;
  state.players[1].x = 500;
  state.players[1].y = 500;
  return state;
}

describe('two-player combat targeting', () => {
  it('damages and downs only the selected player', () => {
    const state = stateWithTwoPlayers();
    const firstHp = state.players[0].hp;
    state.players[1].hp = 1;
    damagePlayer(state, state.players[1], 100);
    expect(state.players[0].hp).toBe(firstHp);
    expect(state.players[0].downed).toBe(false);
    expect(state.players[1].hp).toBe(0);
    expect(state.players[1].downed).toBe(true);
    expect(state.allPlayersDowned()).toBe(false);
    state.players[0].downed = true;
    expect(state.allPlayersDowned()).toBe(true);
  });

  it('applies contact damage to the colliding living player', () => {
    const state = stateWithTwoPlayers();
    const enemy = state.enemies.alloc()!;
    enemy.init(0, state.players[1].x, state.players[1].y, 1);
    enemy.spawnT = 0;
    state.grid.rebuild(
      state.enemies.count,
      (index) => state.enemies.items[index].x,
      (index) => state.enemies.items[index].y,
    );
    const firstHp = state.players[0].hp;
    const secondHp = state.players[1].hp;
    enemyContactDamage(state);
    expect(state.players[0].hp).toBe(firstHp);
    expect(state.players[1].hp).toBeLessThan(secondHp);
  });

  it('consumes a hostile projectile on the first valid player hit', () => {
    const state = stateWithTwoPlayers();
    const target = state.players[1];
    const firstHp = state.players[0].hp;
    const secondHp = target.hp;
    state.spawnProjectile(
      target.x,
      target.y,
      0,
      0,
      10,
      0,
      1,
      false,
      false,
      '',
      0,
      null,
    );
    updateProjectiles(state, 1 / 60);
    expect(state.projectiles.count).toBe(0);
    expect(state.players[0].hp).toBe(firstHp);
    expect(target.hp).toBeLessThan(secondHp);
  });

  it('applies bomber explosions to every living player in range', () => {
    const state = stateWithTwoPlayers();
    state.players[0].x = state.players[1].x = 200;
    state.players[0].y = state.players[1].y = 200;
    const firstHp = state.players[0].hp;
    const secondHp = state.players[1].hp;
    state.explosions.push(state.createExplosion(200, 200, 0, 95, 10));
    updateBomberExplosions(state, 1 / 60);
    expect(state.players[0].hp).toBeLessThan(firstHp);
    expect(state.players[1].hp).toBeLessThan(secondHp);
    expect(state.explosions).toHaveLength(0);
  });

  it('damages a living player in fire while ignoring a downed teammate', () => {
    const state = stateWithTwoPlayers();
    state.players[0].x = state.players[1].x = 200;
    state.players[0].y = state.players[1].y = 200;
    state.players[0].downed = true;
    const firstHp = state.players[0].hp;
    const secondHp = state.players[1].hp;
    state.firePatches.push(state.createFirePatch(200, 200, 1));
    updateFirePatches(state, 1 / 60);
    expect(state.players[0].hp).toBe(firstHp);
    expect(state.players[1].hp).toBeLessThan(secondHp);
  });

  it('preserves projectile ownership for personal damage talents', () => {
    const state = stateWithTwoPlayers();
    state.players[0].addTalent('executioner');
    const first = state.enemies.alloc()!;
    const second = state.enemies.alloc()!;
    first.init(0, 200, 200, 1);
    second.init(0, 400, 200, 1);
    first.maxHp = second.maxHp = 100;
    first.hp = second.hp = 20;
    state.grid.rebuild(
      state.enemies.count,
      (index) => state.enemies.items[index].x,
      (index) => state.enemies.items[index].y,
    );
    state.spawnProjectile(200, 200, 0, 0, 10, 0, 1, true, false, '', 0, 0);
    state.spawnProjectile(400, 200, 0, 0, 10, 0, 1, true, false, '', 0, 1);
    updateProjectiles(state, 0);
    expect(first.hp).toBe(8);
    expect(second.hp).toBe(10);
  });

  it('preserves area and burn ownership for personal damage talents', () => {
    const state = stateWithTwoPlayers();
    state.players[0].addTalent('executioner');
    const areaTarget = state.enemies.alloc()!;
    const burnTarget = state.enemies.alloc()!;
    areaTarget.init(0, 200, 200, 1);
    burnTarget.init(0, 400, 200, 1);
    areaTarget.maxHp = burnTarget.maxHp = 100;
    areaTarget.hp = burnTarget.hp = 20;
    state.grid.rebuild(
      state.enemies.count,
      (index) => state.enemies.items[index].x,
      (index) => state.enemies.items[index].y,
    );
    const area = state.areaEffects.alloc()!;
    area.initZone('', 0, 200, 200, 0, 1, 30, 30, 0.5, 10, 0, 0, 0);
    applyWeaponStatus(burnTarget, { burnDps: 40, burnDuration: 1 }, 1, 0);
    updateAreaEffects(state, 0.01);
    updateEnemyStatuses(state, 0.25);
    expect(areaTarget.hp).toBe(8);
    expect(burnTarget.hp).toBe(8);
  });

  it('uses the summoning player as the owner of summon damage', () => {
    const state = stateWithTwoPlayers();
    state.players[0].addTalent('executioner');
    for (const player of state.players) {
      player.stats.critChance = 0;
      player.weapons.push(new WeaponInstance(weaponById('soul_lantern'), 0));
    }
    const first = state.enemies.alloc()!;
    const second = state.enemies.alloc()!;
    first.init(0, state.players[0].x + 48, state.players[0].y, 1);
    second.init(0, state.players[1].x + 48, state.players[1].y, 1);
    first.maxHp = second.maxHp = 100;
    first.hp = second.hp = 20;
    state.grid.rebuild(
      state.enemies.count,
      (index) => state.enemies.items[index].x,
      (index) => state.enemies.items[index].y,
    );
    updateWeapons(state, 0);
    expect(first.hp).toBe(9);
    expect(second.hp).toBe(11);
  });
});
