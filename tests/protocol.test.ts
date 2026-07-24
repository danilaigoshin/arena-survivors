import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  normalizeSerializedProfile,
  parseControlMessage,
  parseNetworkInput,
} from '../src/multiplayer/protocol';
import { NETWORK_VERSION } from '../src/multiplayer/types';

describe('network protocol validation', () => {
  it('normalizes movement and rejects non-finite packets', () => {
    const input = parseNetworkInput({
      seq: 1,
      clientTick: 3,
      snapshotSeq: 2,
      moveX: 1,
      moveY: 1,
      abilityPressSeq: 2,
    })!;
    expect(input.seq).toBe(1);
    expect(input.abilityPressSeq).toBe(2);
    expect(input.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(input.moveY).toBeCloseTo(Math.SQRT1_2);
    expect(parseNetworkInput({
      seq: 2,
      clientTick: 4,
      snapshotSeq: 2,
      moveX: Number.NaN,
      moveY: 0,
      abilityPressSeq: 0,
    })).toBeNull();
    expect(parseNetworkInput({
      seq: 2,
      clientTick: 4,
      snapshotSeq: 2,
      moveX: Infinity,
      moveY: 0,
      abilityPressSeq: 0,
    })).toBeNull();
  });

  it('filters unknown unlocks and clamps perk levels', () => {
    expect(normalizeSerializedProfile({
      perkLevels: { perk_hp: 999, unknown: 4 },
      unlockedIds: ['knight', 'not-real'],
    })).toEqual({
      perkLevels: { perk_hp: 3 },
      unlockedIds: ['knight'],
    });
    expect(normalizeSerializedProfile({
      perkLevels: { perk_hp: Number.POSITIVE_INFINITY },
      unlockedIds: [],
    })).toBeNull();
  });

  it('rejects incompatible control messages', () => {
    expect(parseControlMessage({
      type: 'input',
      version: NETWORK_VERSION + 1,
      input: {
        seq: 1,
        clientTick: 1,
        snapshotSeq: 0,
        moveX: 0,
        moveY: 0,
        abilityPressSeq: 0,
      },
    })).toBeNull();
    expect(parseControlMessage({
      type: 'phase-command',
      version: NETWORK_VERSION,
      phaseRevision: 1,
      command: 'buy',
      ids: Array.from({ length: 17 }, () => 'x'),
    })).toBeNull();
    expect(parseControlMessage({
      type: 'return-menu',
      version: NETWORK_VERSION,
    })?.type).toBe('return-menu');
  });

  it('deep-validates phase payloads before they reach a scene', () => {
    expect(parseControlMessage({
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: {
        version: 1,
        phaseRevision: 3,
        stateRevision: 1,
        buildRevision: 1,
        phase: 'level-up',
        choices: [['not-a-choice'], []],
        submitted: [false, true],
      },
    })).toBeNull();
    expect(parseControlMessage({
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: {
        version: 1,
        phaseRevision: 4,
        stateRevision: 2,
        buildRevision: 1,
        phase: 'shop',
        shops: [null, null],
        ready: [false, false],
        discount: Number.POSITIVE_INFINITY,
      },
    })).toBeNull();
    expect(parseControlMessage({
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: {
        version: 1,
        phaseRevision: 5,
        stateRevision: 3,
        buildRevision: 1,
        phase: 'paused',
        reason: 'hidden',
      },
    })?.type).toBe('phase-state');
  });

  it('rejects malformed and unknown build definitions', () => {
    expect(parseControlMessage({
      type: 'build-state',
      version: NETWORK_VERSION,
      build: {
        version: 1,
        buildRevision: 2,
        squadMaterials: 0,
        players: [null],
      },
    })).toBeNull();
    expect(parseControlMessage({
      type: 'build-state',
      version: NETWORK_VERSION,
      build: {
        version: 1,
        buildRevision: 2,
        squadMaterials: 0,
        players: [{
          slot: 0,
          characterId: 'potato',
          materials: 0,
          stats: { maxHp: 100 },
          items: [],
          upgradeMods: [],
          talents: [],
          abilityAugments: [],
          weapons: [{
            slot: 0,
            id: 'not-a-weapon',
            tier: 1,
            branch: null,
            branchPending: false,
          }],
        }],
      },
    })).toBeNull();
  });

  it('generates and normalizes six-character Crockford codes', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(normalizeRoomCode(` ${code.slice(0, 3)}-${code.slice(3).toLowerCase()} `)).toBe(code);
    expect(normalizeRoomCode('short')).toBeNull();
  });
});
