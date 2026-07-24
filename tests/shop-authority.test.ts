import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { weaponById } from '../src/data/weapons';
import { WeaponInstance } from '../src/entities/weapon';
import {
  applyShopCommand,
  type AuthoritativeShopPhase,
} from '../src/multiplayer/shopAuthority';
import { Player } from '../src/entities/player';
import { RunState } from '../src/state';
import type { ShopState } from '../src/systems/shop';
import { availableShopWeapons } from '../src/systems/shop';
import { StaticPlayerProfile } from '../src/core/playerProfile';
import { CHARACTERS } from '../src/data/characters';
import { WEAPONS } from '../src/data/weapons';
import { applyBuildState, captureBuildState } from '../src/multiplayer/stateProtocol';

function shop(price: number): ShopState {
  return {
    offers: [{ kind: 'item', item: ITEMS[0], price, sold: false }],
    rerollCost: 3,
    rerollCount: 0,
  };
}

function setup(materials = 10): { state: RunState; phase: AuthoritativeShopPhase } {
  const players = [new Player(0), new Player(1)] as const;
  for (const player of players) {
    player.weapons.push(new WeaponInstance(weaponById('pistol'), 0));
    player.materials = materials;
    player.recomputeStats();
  }
  const state = new RunState([...players]);
  return {
    state,
    phase: {
      phaseRevision: 7,
      shops: [shop(8), shop(8)],
      ready: [false, false],
      discount: 1,
    },
  };
}

describe('authoritative co-op shop', () => {
  it('spends each player wallet independently', () => {
    const { state, phase } = setup(10);
    expect(applyShopCommand(state, phase, {
      type: 'buy',
      phaseRevision: 7,
      slot: 0,
      offerIndex: 0,
    })).toMatchObject({ accepted: true });
    expect(state.players[0].materials).toBe(2);
    expect(state.players[1].materials).toBe(10);
    expect(applyShopCommand(state, phase, {
      type: 'buy',
      phaseRevision: 7,
      slot: 1,
      offerIndex: 0,
    })).toMatchObject({ accepted: true });
    expect(state.players[0].materials).toBe(2);
    expect(state.players[1].materials).toBe(2);
    expect(state.players[0].items).toHaveLength(1);
    expect(state.players[1].items).toHaveLength(1);
  });

  it('keeps the guest purchase and balance after the host buys an item', () => {
    const { state: host, phase } = setup(10);
    const { state: guest } = setup(10);
    expect(applyShopCommand(host, phase, {
      type: 'buy',
      phaseRevision: 7,
      slot: 1,
      offerIndex: 0,
    })).toMatchObject({ accepted: true });

    expect(applyBuildState(guest, captureBuildState(host, 2))).toBe(true);
    expect(guest.players[0].materials).toBe(10);
    expect(guest.players[1].materials).toBe(2);
    expect(guest.players[1].items.map((item) => item.id))
      .toEqual([ITEMS[0].id]);

    expect(applyShopCommand(host, phase, {
      type: 'buy',
      phaseRevision: 7,
      slot: 0,
      offerIndex: 0,
    })).toMatchObject({ accepted: true });
    expect(applyBuildState(guest, captureBuildState(host, 3))).toBe(true);

    expect(guest.players[0].materials).toBe(2);
    expect(guest.players[1].materials).toBe(2);
    expect(guest.players[0].items.map((item) => item.id))
      .toEqual([ITEMS[0].id]);
    expect(guest.players[1].items.map((item) => item.id))
      .toEqual([ITEMS[0].id]);
  });

  it('rejects stale commands without mutation', () => {
    const { state, phase } = setup();
    expect(applyShopCommand(state, phase, {
      type: 'buy',
      phaseRevision: 6,
      slot: 0,
      offerIndex: 0,
    })).toEqual({ accepted: false, reason: 'stale' });
    expect(state.players[0].materials).toBe(10);
    expect(state.players[1].materials).toBe(10);
    expect(phase.shops[0].offers[0].sold).toBe(false);
  });

  it('starts only after both players are ready', () => {
    const { state, phase } = setup();
    expect(applyShopCommand(state, phase, {
      type: 'ready',
      phaseRevision: 7,
      slot: 0,
      ready: true,
    })).toEqual({ accepted: true, startNextWave: false });
    expect(applyShopCommand(state, phase, {
      type: 'ready',
      phaseRevision: 7,
      slot: 1,
      ready: true,
    })).toEqual({ accepted: true, startNextWave: true });
  });

  it('credits a personal weapon sale only to that player', () => {
    const { state, phase } = setup(0);
    state.players[1].weapons.push(new WeaponInstance(weaponById('smg'), 1));
    expect(applyShopCommand(state, phase, {
      type: 'sell',
      phaseRevision: 7,
      slot: 1,
      weaponSlot: 1,
    })).toMatchObject({ accepted: true });
    expect(state.players[1].weapons).toHaveLength(1);
    expect(state.players[0].materials).toBe(0);
    expect(state.players[1].materials).toBeGreaterThan(0);
  });

  it('filters shop weapons by the personal class and unlock profile', () => {
    const lockedWeapon = WEAPONS.find((weapon) => weapon.unlockCost && !weapon.evolved)!;
    const lockedProfilePlayer = new Player(0, new StaticPlayerProfile());
    expect(availableShopWeapons(lockedProfilePlayer).map((weapon) => weapon.id))
      .not.toContain(lockedWeapon.id);

    const unlockedProfilePlayer = new Player(0, new StaticPlayerProfile({
      perkLevels: {},
      unlockedIds: [lockedWeapon.id],
    }));
    expect(availableShopWeapons(unlockedProfilePlayer).map((weapon) => weapon.id))
      .toContain(lockedWeapon.id);

    const knight = new Player(0, new StaticPlayerProfile({
      perkLevels: {},
      unlockedIds: WEAPONS.map((weapon) => weapon.id),
    }));
    knight.setCharacter(CHARACTERS.find((character) => character.id === 'knight')!);
    expect(availableShopWeapons(knight).every((weapon) => knight.canUseWeapon(weapon))).toBe(true);
    expect(availableShopWeapons(knight).some((weapon) => weapon.id === 'smg')).toBe(false);
  });
});
