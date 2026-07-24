import { describe, expect, it } from 'vitest';
import { Player } from '../src/entities/player';
import { WeaponInstance } from '../src/entities/weapon';
import { weaponById } from '../src/data/weapons';
import { RunState } from '../src/state';
import {
  applyBuildState,
  captureBuildState,
} from '../src/multiplayer/stateProtocol';

describe('reliable build state', () => {
  it('updates the build without healing or resetting transient weapon state', () => {
    const host = new RunState([new Player(0)]);
    const hostWeapon = new WeaponInstance(weaponById('pistol'), 0);
    host.players[0].weapons.push(hostWeapon);
    host.players[0].recomputeStats();
    host.players[0].materials = 2;

    const guest = new RunState([new Player(0)]);
    const guestWeapon = new WeaponInstance(weaponById('pistol'), 0);
    guestWeapon.cooldownTimer = 0.7;
    guestWeapon.recoil = 0.4;
    guest.players[0].weapons.push(guestWeapon);
    guest.players[0].recomputeStats();
    guest.players[0].hp = 23;
    guest.players[0].materials = 10;

    expect(applyBuildState(guest, captureBuildState(host, 2))).toBe(true);
    expect(guest.players[0].materials).toBe(2);
    expect(guest.players[0].hp).toBe(23);
    expect(guest.players[0].weapons[0]).toBe(guestWeapon);
    expect(guest.players[0].weapons[0].cooldownTimer).toBe(0.7);
    expect(guest.players[0].weapons[0].recoil).toBe(0.4);
  });
});
