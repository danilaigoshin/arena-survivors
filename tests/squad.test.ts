import { describe, expect, it } from 'vitest';
import { StaticPlayerProfile } from '../src/core/playerProfile';
import { Player } from '../src/entities/player';
import { RunState } from '../src/state';
import { gainXp, updatePickups } from '../src/systems/levelup';
import { resetPlayersForWave, xpToNext } from '../src/systems/squad';
import { applyEnemyRunScaling } from '../src/systems/enemyScaling';

function squadState(): RunState {
  return new RunState([
    new Player(0, new StaticPlayerProfile()),
    new Player(1, new StaticPlayerProfile()),
  ]);
}

describe('squad model', () => {
  it('selects the nearest alive player and resolves ties by slot', () => {
    const state = squadState();
    state.players[0].x = 10;
    state.players[1].x = 30;
    state.players[0].y = state.players[1].y = 20;
    expect(state.nearestAlivePlayer(20, 20)?.slot).toBe(0);
    state.players[0].downed = true;
    expect(state.nearestAlivePlayer(20, 20)?.slot).toBe(1);
    state.players[1].downed = true;
    expect(state.nearestAlivePlayer(20, 20)).toBeNull();
  });

  it('creates a personal pending choice for every player on squad level-up', () => {
    const state = squadState();
    state.players[1].downed = true;
    gainXp(state, xpToNext(1));
    expect(state.squad.level).toBe(2);
    expect(state.pendingLevelUps).toEqual([1, 1]);
  });

  it('credits pickups to the collecting player and triggers the collector profile', () => {
    const state = squadState();
    state.players[0].x = 100;
    state.players[0].y = 100;
    state.players[1].x = 500;
    state.players[1].y = 500;
    const pickup = state.pickups.alloc()!;
    pickup.init(100, 100, 3);
    updatePickups(state, 1 / 60);
    expect(state.players[0].materials).toBe(3);
    expect(state.players[1].materials).toBe(0);
    expect(state.squad.xp).toBe(3);
    expect(state.pickups.count).toBe(0);
  });

  it('keeps stable pickup identity when the dense pool swaps entries', () => {
    const state = squadState();
    const first = state.pickups.alloc()!;
    first.init(0, 0, 1);
    const second = state.pickups.alloc()!;
    second.init(1, 1, 1);
    const secondUid = second.uid;
    state.pickups.free(0);
    expect(state.pickups.items[0].uid).toBe(secondUid);
  });

  it('keeps co-op enemy HP scaling active while a teammate is downed', () => {
    const solo = new RunState([new Player(0)]);
    const soloEnemy = solo.enemies.alloc()!;
    soloEnemy.init(0, 0, 0, 1);
    applyEnemyRunScaling(solo, soloEnemy);

    const coop = squadState();
    coop.players[1].downed = true;
    const coopEnemy = coop.enemies.alloc()!;
    coopEnemy.init(0, 0, 0, 1);
    applyEnemyRunScaling(coop, coopEnemy);

    expect(coopEnemy.maxHp).toBe(Math.round(soloEnemy.maxHp * 1.6));
  });

  it('revives and fully heals every player for the next wave', () => {
    const state = squadState();
    state.players[0].hp = 1;
    state.players[1].hp = 0;
    state.players[1].downed = true;
    resetPlayersForWave(state.players);
    expect(state.players.map((player) => ({
      downed: player.downed,
      hp: player.hp,
      maxHp: player.stats.maxHp,
    }))).toEqual([
      { downed: false, hp: state.players[0].stats.maxHp, maxHp: state.players[0].stats.maxHp },
      { downed: false, hp: state.players[1].stats.maxHp, maxHp: state.players[1].stats.maxHp },
    ]);
  });
});
