import { describe, expect, it } from 'vitest';
import { Player } from '../src/entities/player';
import { RunState } from '../src/state';
import {
  ShadowState,
  captureFrameSnapshot,
  decodeFrameSnapshot,
  encodeFrameSnapshot,
} from '../src/multiplayer/snapshot';
import { WeaponInstance } from '../src/entities/weapon';
import { weaponById } from '../src/data/weapons';
import { WAVE_CONTRACTS } from '../src/data/contracts';
import { POOL_ENEMIES } from '../src/config';

function makeState(): RunState {
  const state = new RunState([new Player(0), new Player(1)]);
  state.players[0].x = 100;
  state.players[1].x = 200;
  const weapon = new WeaponInstance(weaponById('pistol'), 0);
  weapon.cooldownTimer = Math.fround(0.4);
  weapon.recoil = Math.fround(0.7);
  weapon.chainFxPointCount = 2;
  weapon.chainFxX[0] = 10;
  weapon.chainFxY[0] = 20;
  weapon.chainFxX[1] = 30;
  weapon.chainFxY[1] = 40;
  state.players[0].weapons.push(weapon);
  state.squad = { xp: 4, level: 2, materials: 11 };
  state.waveMaterials = 5;
  state.activeContract = WAVE_CONTRACTS[0];
  state.objective = {
    kind: 'hold',
    target: 7,
    progress: 2,
    timeLeft: 12,
    reward: 4,
    completed: false,
    failed: false,
    startKills: 1,
    x: 330,
    y: 440,
    radius: 120,
  };
  const enemy = state.enemies.alloc()!;
  enemy.init(0, 300, 400, 1);
  const projectile = state.spawnProjectile(10, 20, 30, 40, 5, 0, 1, true, true, 'pistol', 0, 1);
  projectile.radius = 6;
  state.spawnProjectile(15, 25, 20, 30, 4, 0, 1, false, false, 'frost');
  const pickup = state.pickups.alloc()!;
  pickup.init(50, 60, 2);
  const area = state.areaEffects.alloc()!;
  area.initZone('runestone', 0, 65, 75, 0.5, 2, 80, 105, 0.4, 7, 0, 0, 0);
  state.chests.push(state.createChest(70, 80));
  state.explosions.push(state.createExplosion(90, 100, 0.5, 95, 10));
  state.firePatches.push(state.createFirePatch(110, 120, 2));
  return state;
}

describe('binary frame snapshots', () => {
  it('round-trips render state', () => {
    const frame = captureFrameSnapshot(makeState(), {
      snapshotSeq: 4,
      simTick: 30,
      ackInputSeq: 8,
      buildRevision: 2,
      phaseRevision: 3,
      lastEventId: 7,
    });
    const encoded = encodeFrameSnapshot(frame);
    const decoded = decodeFrameSnapshot(encoded);
    expect(decoded.snapshotSeq).toBe(frame.snapshotSeq);
    expect(decoded.players).toEqual(frame.players);
    expect(decoded.players[0].weapons[0].chainPoints).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(decoded.objective).toEqual(frame.objective);
    expect(decoded.contractIndex).toBe(0);
    expect(decoded.projectiles).toEqual(frame.projectiles);
    expect(decoded.projectiles[1].styleIndex).toBeGreaterThan(0);
    expect(decoded.areas).toEqual(frame.areas);
    expect(decoded.areas[0].impactRadius).toBe(105);
    expect(decoded.enemies[0]).toMatchObject({
      uid: frame.enemies[0].uid,
      defIdx: frame.enemies[0].defIdx,
      x: frame.enemies[0].x,
      y: frame.enemies[0].y,
      hp: frame.enemies[0].hp,
    });
    expect(decoded.enemies[0].spawnT).toBeCloseTo(frame.enemies[0].spawnT);
    expect(decoded.chests).toEqual(frame.chests);
    expect(decoded.explosions[0].uid).toBe(frame.explosions[0].uid);
    expect(decoded.firePatches[0].uid).toBe(frame.firePatches[0].uid);
    expect(encoded.byteLength).toBeLessThan(64 * 1024);
  });

  it('rejects truncated payloads', () => {
    const frame = captureFrameSnapshot(makeState(), {
      snapshotSeq: 1,
      simTick: 1,
      ackInputSeq: 0,
      buildRevision: 0,
      phaseRevision: 0,
      lastEventId: 0,
    });
    const encoded = encodeFrameSnapshot(frame);
    expect(() => decodeFrameSnapshot(encoded.slice(0, encoded.byteLength - 1))).toThrow(/truncated/);
  });

  it('rejects pool counts above the configured capacity', () => {
    const frame = captureFrameSnapshot(makeState(), {
      snapshotSeq: 1,
      simTick: 1,
      ackInputSeq: 0,
      buildRevision: 0,
      phaseRevision: 0,
      lastEventId: 0,
    });
    frame.enemies = Array.from({ length: POOL_ENEMIES + 1 }, () => ({ ...frame.enemies[0] }));
    expect(() => decodeFrameSnapshot(encodeFrameSnapshot(frame))).toThrow(/oversized enemy pool/);
  });

  it('keeps a worst-case combat snapshot below the channel budget', () => {
    const state = new RunState([new Player(0), new Player(1)]);
    for (let index = 0; index < 390; index++) {
      const enemy = state.enemies.alloc()!;
      enemy.init(index % 4, index * 3, index * 2, 20);
    }
    for (let index = 0; index < 512; index++) {
      state.spawnProjectile(index, index, 1, 0, 5, 0, 1, true, false, 'pistol', 0, 1);
    }
    const encoded = encodeFrameSnapshot(captureFrameSnapshot(state, {
      snapshotSeq: 1,
      simTick: 1,
      ackInputSeq: 0,
      buildRevision: 1,
      phaseRevision: 1,
      lastEventId: 0,
    }));
    expect(encoded.byteLength).toBeLessThanOrEqual(64 * 1024);
  });

  it('ignores duplicate snapshots and interpolates by uid', () => {
    const state = makeState();
    const older = captureFrameSnapshot(state, {
      snapshotSeq: 1,
      simTick: 10,
      ackInputSeq: 0,
      buildRevision: 0,
      phaseRevision: 0,
      lastEventId: 0,
    });
    state.enemies.items[0].x += 90;
    const newer = captureFrameSnapshot(state, {
      snapshotSeq: 2,
      simTick: 13,
      ackInputSeq: 0,
      buildRevision: 0,
      phaseRevision: 0,
      lastEventId: 0,
    });
    const shadow = new ShadowState();
    expect(shadow.accept(older)).toBe(true);
    expect(shadow.accept(older)).toBe(false);
    expect(shadow.accept(newer)).toBe(true);
    expect(shadow.accept(older)).toBe(false);
    const sampled = shadow.sample(1)!;
    expect(sampled.enemies[0].uid).toBe(older.enemies[0].uid);
    expect(sampled.enemies[0].x).toBeGreaterThan(older.enemies[0].x);
    expect(sampled.enemies[0].x).toBeLessThan(newer.enemies[0].x);
  });

  it('spawns and despawns shadow entities by uid', () => {
    const state = makeState();
    const older = captureFrameSnapshot(state, {
      snapshotSeq: 1,
      simTick: 10,
      ackInputSeq: 0,
      buildRevision: 0,
      phaseRevision: 0,
      lastEventId: 0,
    });
    const removedUid = older.enemies[0].uid;
    state.enemies.clear();
    const replacement = state.enemies.alloc()!;
    replacement.init(1, 700, 500, 1);
    const newer = captureFrameSnapshot(state, {
      snapshotSeq: 2,
      simTick: 13,
      ackInputSeq: 0,
      buildRevision: 0,
      phaseRevision: 0,
      lastEventId: 0,
    });
    const shadow = new ShadowState();
    shadow.accept(older);
    shadow.accept(newer);
    const sampled = shadow.sample(1)!;
    expect(sampled.enemies.map((enemy) => enemy.uid)).toEqual([replacement.uid]);
    expect(sampled.enemies.some((enemy) => enemy.uid === removedUid)).toBe(false);
    expect(sampled.enemies[0].x).toBe(700);
  });

  it('keeps the snapshot sequence floor when a retry clears shadow frames', () => {
    const state = makeState();
    const first = captureFrameSnapshot(state, {
      snapshotSeq: 12,
      simTick: 50,
      ackInputSeq: 0,
      buildRevision: 1,
      phaseRevision: 1,
      lastEventId: 0,
    });
    const stale = { ...first, snapshotSeq: 11 };
    const nextRun = { ...first, snapshotSeq: 13, simTick: 51 };
    const shadow = new ShadowState();
    expect(shadow.accept(first)).toBe(true);
    shadow.clear();
    expect(shadow.accept(stale)).toBe(false);
    expect(shadow.accept(nextRun)).toBe(true);
  });
});
