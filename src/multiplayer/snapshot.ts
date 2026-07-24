import {
  POOL_AREA_EFFECTS,
  POOL_ENEMIES,
  POOL_PICKUPS,
  POOL_PROJECTILES,
} from '../config';
import { WEAPONS } from '../data/weapons';
import { WAVE_CONTRACTS } from '../data/contracts';
import type { WaveObjectiveKind, WaveObjectiveState } from '../data/objectives';
import { ENEMIES } from '../data/enemies';
import type { RunState } from '../state';
import { NETWORK_VERSION, type PlayerSlot } from './types';

const SNAPSHOT_MAGIC = 0x504e5341; // "ASNP" in little endian
const HEADER_BYTES = 32;
const NULL_SLOT = 0xff;
const COORD_OFFSET = 2048;
const COORD_SCALE = 8;
const VELOCITY_SCALE = 4;
const TIMER_SCALE = 256;
const RADIUS_SCALE = 4;
const ANGLE_SCALE = 0xffff / (Math.PI * 2);
const styleIds = ['', 'frost', ...WEAPONS.map((weapon) => weapon.id)];
const styleIndex = new Map(styleIds.map((id, index) => [id, index]));
const objectiveKinds: (WaveObjectiveKind | null)[] = [null, 'hunter', 'collector', 'hold'];

export interface SnapshotMetadata {
  snapshotSeq: number;
  simTick: number;
  ackInputTick: number;
  buildRevision: number;
  phaseRevision: number;
  lastEventId: number;
}

export interface PlayerFrame {
  slot: PlayerSlot;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  downed: boolean;
  moving: boolean;
  aimAngle: number;
  iframes: number;
  slowT: number;
  abilityCd: number;
  abilityActiveT: number;
  abilityRecoveryT: number;
  abilityPulseT: number;
  abilityPulseCount: number;
  abilityX: number;
  abilityY: number;
  abilityPower: number;
  weapons: WeaponFrame[];
}

export interface WeaponFrame {
  slot: number;
  cooldownTimer: number;
  recoil: number;
  fireAngle: number;
  orbitAngle: number;
  swipeTimer: number;
  swipeAngle: number;
  chainFxTimer: number;
  chainPoints: { x: number; y: number }[];
  summons: { x: number; y: number; hitCd: number; flash: number }[];
}

export interface EnemyFrame {
  uid: number;
  defIdx: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  elite: boolean;
  isBoss: boolean;
  phase: number;
  phaseTimer: number;
  hitFlash: number;
  spawnT: number;
  burnT: number;
  slowT: number;
  freezeT: number;
}

export interface ProjectileFrame {
  uid: number;
  ownerPlayerSlot: PlayerSlot | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  friendly: boolean;
  crit: boolean;
  styleIndex: number;
  variant: number;
}

export interface PickupFrame {
  uid: number;
  x: number;
  y: number;
  value: number;
}

export interface AreaFrame {
  uid: number;
  ownerPlayerSlot: PlayerSlot | null;
  kind: 0 | 1;
  styleIndex: number;
  x: number;
  y: number;
  radius: number;
  impactRadius: number;
  prevRadius: number;
  maxRadius: number;
  delay: number;
  ttl: number;
}

export interface ChestFrame {
  uid: number;
  x: number;
  y: number;
}

export interface ExplosionFrame extends ChestFrame {
  t: number;
  radius: number;
  damage: number;
}

export interface FirePatchFrame extends ChestFrame {
  ttl: number;
}

export interface FrameSnapshot extends SnapshotMetadata {
  kind: 'keyframe' | 'delta';
  baseSnapshotSeq: number;
  wave: number;
  waveTimer: number;
  kills: number;
  squadXp: number;
  squadLevel: number;
  squadMaterials: number;
  resonance: number;
  resonanceActiveT: number;
  bossUid: number;
  bossDead: boolean;
  vacuum: boolean;
  waveMaterials: number;
  contractIndex: number;
  objective: WaveObjectiveState | null;
  players: PlayerFrame[];
  enemies: EnemyFrame[];
  projectiles: ProjectileFrame[];
  pickups: PickupFrame[];
  areas: AreaFrame[];
  chests: ChestFrame[];
  explosions: ExplosionFrame[];
  firePatches: FirePatchFrame[];
  removedEnemies: number[];
  removedProjectiles: number[];
  removedPickups: number[];
  removedAreas: number[];
  removedChests: number[];
  removedExplosions: number[];
  removedFirePatches: number[];
}

export interface SnapshotCaptureOptions {
  focusX: number;
  focusY: number;
  interestRadius?: number;
}

export const SNAPSHOT_INTEREST_RADIUS = 1150;

class BinaryWriter {
  private buffer = new ArrayBuffer(32 * 1024);
  private view = new DataView(this.buffer);
  offset = 0;

  private reserve(bytes: number): void {
    if (this.offset + bytes <= this.buffer.byteLength) return;
    let size = this.buffer.byteLength;
    while (size < this.offset + bytes) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buffer, 0, this.offset));
    this.buffer = next;
    this.view = new DataView(next);
  }

  u8(value: number): void {
    this.reserve(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  u16(value: number): void {
    this.reserve(2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  i16(value: number): void {
    this.reserve(2);
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  u32(value: number): void {
    this.reserve(4);
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  f32(value: number): void {
    this.reserve(4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }

  finish(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  reset(): void {
    this.offset = 0;
  }
}

const frameWriter = new BinaryWriter();

class BinaryReader {
  private readonly view: DataView;
  offset = 0;

  constructor(private readonly buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  private require(bytes: number): void {
    if (this.offset + bytes > this.buffer.byteLength) throw new Error('truncated snapshot');
  }

  u8(): number {
    this.require(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    this.require(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  i16(): number {
    this.require(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    this.require(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32(): number {
    this.require(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    if (!Number.isFinite(value)) throw new Error('non-finite snapshot number');
    return value;
  }

  assertDone(): void {
    if (this.offset !== this.buffer.byteLength) throw new Error('unexpected snapshot bytes');
  }
}

function encodeSlot(slot: PlayerSlot | null): number {
  return slot === null ? NULL_SLOT : slot;
}

function decodeSlot(value: number): PlayerSlot | null {
  if (value === NULL_SLOT) return null;
  if (value === 0 || value === 1) return value;
  throw new Error('invalid player slot');
}

function flags(...values: boolean[]): number {
  let result = 0;
  for (let index = 0; index < values.length; index++) if (values[index]) result |= 1 << index;
  return result;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function writeCoord(writer: BinaryWriter, value: number): void {
  writer.u16(clampInt((value + COORD_OFFSET) * COORD_SCALE, 0, 0xffff));
}

function readCoord(reader: BinaryReader): number {
  return reader.u16() / COORD_SCALE - COORD_OFFSET;
}

function writeVelocity(writer: BinaryWriter, value: number): void {
  writer.i16(clampInt(value * VELOCITY_SCALE, -0x8000, 0x7fff));
}

function readVelocity(reader: BinaryReader): number {
  return reader.i16() / VELOCITY_SCALE;
}

function writeTimer(writer: BinaryWriter, value: number): void {
  writer.u16(clampInt(value * TIMER_SCALE, 0, 0xffff));
}

function readTimer(reader: BinaryReader): number {
  return reader.u16() / TIMER_SCALE;
}

function writeRadius(writer: BinaryWriter, value: number): void {
  writer.u16(clampInt(value * RADIUS_SCALE, 0, 0xffff));
}

function readRadius(reader: BinaryReader): number {
  return reader.u16() / RADIUS_SCALE;
}

function writeAngle(writer: BinaryWriter, value: number): void {
  const wrapped = ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  writer.u16(clampInt(wrapped * ANGLE_SCALE, 0, 0xffff));
}

function readAngle(reader: BinaryReader): number {
  return reader.u16() / ANGLE_SCALE;
}

function writeUnit(writer: BinaryWriter, value: number): void {
  writer.u8(clampInt(value * 255, 0, 255));
}

function readUnit(reader: BinaryReader): number {
  return reader.u8() / 255;
}

function checkCount(count: number, maximum: number, label: string): number {
  if (count > maximum) throw new Error(`oversized ${label} pool`);
  return count;
}

function writeRemovedUids(writer: BinaryWriter, uids: readonly number[]): void {
  writer.u16(uids.length);
  for (const uid of uids) writer.u32(uid);
}

function readRemovedUids(reader: BinaryReader, maximum: number, label: string): number[] {
  const count = checkCount(reader.u16(), maximum, label);
  const uids: number[] = [];
  for (let index = 0; index < count; index++) uids.push(reader.u32());
  return uids;
}

export function captureFrameSnapshot(
  state: RunState,
  metadata: SnapshotMetadata,
  options?: SnapshotCaptureOptions,
): FrameSnapshot {
  const interestRadius = options?.interestRadius ?? SNAPSHOT_INTEREST_RADIUS;
  const interested = (x: number, y: number, margin = 0): boolean => {
    if (!options) return true;
    const radius = interestRadius + margin;
    return (x - options.focusX) ** 2 + (y - options.focusY) ** 2 <= radius * radius;
  };
  return {
    ...metadata,
    kind: 'keyframe',
    baseSnapshotSeq: 0,
    wave: state.wave,
    waveTimer: state.waveTimer,
    kills: state.kills,
    squadXp: state.squad.xp,
    squadLevel: state.squad.level,
    squadMaterials: state.squad.materials,
    resonance: state.resonance,
    resonanceActiveT: state.resonanceActiveT,
    bossUid: state.bossUid,
    bossDead: state.bossDead,
    vacuum: state.vacuum,
    waveMaterials: state.waveMaterials,
    contractIndex: state.activeContract
      ? WAVE_CONTRACTS.findIndex((contract) => contract.id === state.activeContract!.id)
      : -1,
    objective: state.objective ? { ...state.objective } : null,
    players: state.players.map((player) => ({
      slot: player.slot,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.stats.maxHp,
      radius: player.radius,
      downed: player.downed,
      moving: player.moving,
      aimAngle: player.aimAngle,
      iframes: player.iframes,
      slowT: player.slowT,
      abilityCd: player.abilityCd,
      abilityActiveT: player.abilityActiveT,
      abilityRecoveryT: player.abilityRecoveryT,
      abilityPulseT: player.abilityPulseT,
      abilityPulseCount: player.abilityPulseCount,
      abilityX: player.abilityX,
      abilityY: player.abilityY,
      abilityPower: player.abilityPower,
      weapons: player.weapons.map((weapon) => ({
        slot: weapon.slotIndex,
        cooldownTimer: weapon.cooldownTimer,
        recoil: weapon.recoil,
        fireAngle: weapon.fireAngle,
        orbitAngle: weapon.orbitAngle,
        swipeTimer: weapon.swipeTimer,
        swipeAngle: weapon.swipeAngle,
        chainFxTimer: weapon.chainFxTimer,
        chainPoints: Array.from({ length: weapon.chainFxPointCount }, (_, index) => ({
          x: weapon.chainFxX[index],
          y: weapon.chainFxY[index],
        })),
        summons: Array.from({ length: weapon.summonCount }, (_, index) => ({
          x: weapon.summonX[index],
          y: weapon.summonY[index],
          hitCd: weapon.summonHitCd[index],
          flash: weapon.summonFlash[index],
        })),
      })),
    })),
    enemies: state.enemies.items.slice(0, state.enemies.count)
      .filter((enemy) => enemy.isBoss || interested(enemy.x, enemy.y, 180))
      .map((enemy) => ({
      uid: enemy.uid,
      defIdx: enemy.defIdx,
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      radius: enemy.radius,
      elite: enemy.elite,
      isBoss: enemy.isBoss,
      phase: enemy.phase,
      phaseTimer: enemy.phaseTimer,
      hitFlash: enemy.hitFlash,
      spawnT: enemy.spawnT,
      burnT: enemy.burnT,
      slowT: enemy.slowT,
      freezeT: enemy.freezeT,
      })),
    projectiles: state.projectiles.items.slice(0, state.projectiles.count)
      .filter((projectile) => interested(projectile.x, projectile.y, 220))
      .map((projectile) => ({
      uid: projectile.uid,
      ownerPlayerSlot: projectile.ownerPlayerSlot,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      radius: projectile.radius,
      friendly: projectile.friendly,
      crit: projectile.crit,
      styleIndex: styleIndex.get(projectile.style) ?? 0,
      variant: projectile.variant,
      })),
    pickups: state.pickups.items.slice(0, state.pickups.count)
      .filter((pickup) => interested(pickup.x, pickup.y, 120))
      .map((pickup) => ({
      uid: pickup.uid,
      x: pickup.x,
      y: pickup.y,
      value: pickup.value,
      })),
    areas: state.areaEffects.items.slice(0, state.areaEffects.count)
      .filter((area) => interested(area.x, area.y, Math.max(180, area.maxRadius)))
      .map((area) => ({
      uid: area.uid,
      ownerPlayerSlot: area.ownerPlayerSlot,
      kind: area.kind === 'zone' ? 0 : 1,
      styleIndex: styleIndex.get(area.style) ?? 0,
      x: area.x,
      y: area.y,
      radius: area.radius,
      impactRadius: area.impactRadius,
      prevRadius: area.prevRadius,
      maxRadius: area.maxRadius,
      delay: area.delay,
      ttl: area.ttl,
      })),
    chests: state.chests
      .filter((chest) => interested(chest.x, chest.y, 160))
      .map((chest) => ({ ...chest })),
    explosions: state.explosions
      .filter((explosion) => interested(explosion.x, explosion.y, explosion.radius + 160))
      .map((explosion) => ({ ...explosion })),
    firePatches: state.firePatches
      .filter((patch) => interested(patch.x, patch.y, 240))
      .map((patch) => ({ ...patch })),
    removedEnemies: [],
    removedProjectiles: [],
    removedPickups: [],
    removedAreas: [],
    removedChests: [],
    removedExplosions: [],
    removedFirePatches: [],
  };
}

function deltaCollection<T extends { uid: number }>(
  previous: readonly T[],
  current: readonly T[],
  include: (frame: T, isNew: boolean) => boolean,
): { updates: T[]; removed: number[] } {
  const previousByUid = new Map(previous.map((frame) => [frame.uid, frame]));
  const currentUids = new Set(current.map((frame) => frame.uid));
  return {
    updates: current.filter((frame) => include(frame, !previousByUid.has(frame.uid))),
    removed: previous
      .filter((frame) => !currentUids.has(frame.uid))
      .map((frame) => frame.uid),
  };
}

export function buildDeltaSnapshot(
  previous: FrameSnapshot,
  current: FrameSnapshot,
): FrameSnapshot {
  const focus = current.players.find((player) => player.slot === 1) ?? current.players[0];
  const distance2 = (x: number, y: number): number => (
    focus ? (x - focus.x) ** 2 + (y - focus.y) ** 2 : 0
  );
  const enemies = deltaCollection(previous.enemies, current.enemies, (frame, isNew) => (
    isNew
    || frame.isBoss
    || distance2(frame.x, frame.y) <= 760 ** 2
    || (frame.uid + current.snapshotSeq) % 2 === 0
  ));
  const projectiles = deltaCollection(
    previous.projectiles,
    current.projectiles,
    (frame, isNew) => (
      isNew
      || distance2(frame.x, frame.y) <= 880 ** 2
      || (frame.uid + current.snapshotSeq) % 2 === 0
    ),
  );
  const pickups = deltaCollection(previous.pickups, current.pickups, (frame, isNew) => (
    isNew
    || (
      distance2(frame.x, frame.y) <= 720 ** 2
        ? current.snapshotSeq % 2 === 0
        : (frame.uid + current.snapshotSeq) % 4 === 0
    )
  ));
  const areas = deltaCollection(previous.areas, current.areas, (frame, isNew) => (
    isNew
    || distance2(frame.x, frame.y) <= 900 ** 2
    || (frame.uid + current.snapshotSeq) % 2 === 0
  ));
  const chests = deltaCollection(previous.chests, current.chests, (_frame, isNew) => isNew);
  const explosions = deltaCollection(
    previous.explosions,
    current.explosions,
    (frame, isNew) => (
      isNew
      || distance2(frame.x, frame.y) <= 900 ** 2
      || current.snapshotSeq % 2 === 0
    ),
  );
  const firePatches = deltaCollection(
    previous.firePatches,
    current.firePatches,
    (frame, isNew) => (
      isNew
      || distance2(frame.x, frame.y) <= 900 ** 2
      || current.snapshotSeq % 2 === 0
    ),
  );
  return {
    ...current,
    kind: 'delta',
    baseSnapshotSeq: previous.snapshotSeq,
    enemies: enemies.updates,
    projectiles: projectiles.updates,
    pickups: pickups.updates,
    areas: areas.updates,
    chests: chests.updates,
    explosions: explosions.updates,
    firePatches: firePatches.updates,
    removedEnemies: enemies.removed,
    removedProjectiles: projectiles.removed,
    removedPickups: pickups.removed,
    removedAreas: areas.removed,
    removedChests: chests.removed,
    removedExplosions: explosions.removed,
    removedFirePatches: firePatches.removed,
  };
}

function mergeCollection<T extends { uid: number }>(
  previous: readonly T[],
  updates: readonly T[],
  removed: readonly number[],
): T[] {
  const removedUids = new Set(removed);
  const byUid = new Map(
    previous
      .filter((frame) => !removedUids.has(frame.uid))
      .map((frame) => [frame.uid, frame] as const),
  );
  for (const update of updates) byUid.set(update.uid, update);
  return [...byUid.values()];
}

export function materializeSnapshot(
  packet: FrameSnapshot,
  previous: FrameSnapshot | null,
): FrameSnapshot | null {
  if (packet.kind === 'keyframe') return packet;
  if (!previous || packet.baseSnapshotSeq !== previous.snapshotSeq) return null;
  return {
    ...packet,
    kind: 'keyframe',
    baseSnapshotSeq: 0,
    enemies: mergeCollection(previous.enemies, packet.enemies, packet.removedEnemies),
    projectiles: mergeCollection(
      previous.projectiles,
      packet.projectiles,
      packet.removedProjectiles,
    ),
    pickups: mergeCollection(previous.pickups, packet.pickups, packet.removedPickups),
    areas: mergeCollection(previous.areas, packet.areas, packet.removedAreas),
    chests: mergeCollection(previous.chests, packet.chests, packet.removedChests),
    explosions: mergeCollection(
      previous.explosions,
      packet.explosions,
      packet.removedExplosions,
    ),
    firePatches: mergeCollection(
      previous.firePatches,
      packet.firePatches,
      packet.removedFirePatches,
    ),
    removedEnemies: [],
    removedProjectiles: [],
    removedPickups: [],
    removedAreas: [],
    removedChests: [],
    removedExplosions: [],
    removedFirePatches: [],
  };
}

export function encodeFrameSnapshot(snapshot: FrameSnapshot): ArrayBuffer {
  const writer = frameWriter;
  writer.reset();
  writer.u32(SNAPSHOT_MAGIC);
  writer.u16(NETWORK_VERSION);
  writer.u32(snapshot.snapshotSeq);
  writer.u32(snapshot.simTick);
  writer.u32(snapshot.ackInputTick);
  writer.u32(snapshot.buildRevision);
  writer.u32(snapshot.phaseRevision);
  writer.u32(snapshot.lastEventId);
  writer.u8(snapshot.kind === 'keyframe' ? 1 : 0);
  if (snapshot.kind === 'delta') writer.u32(snapshot.baseSnapshotSeq);
  writer.u16(snapshot.wave);
  // Boss waves use a 999 second sentinel, so this timer cannot use the
  // compact 16-bit timer representation (which tops out at ~256 seconds).
  writer.f32(snapshot.waveTimer);
  writer.u32(snapshot.kills);
  writer.f32(snapshot.squadXp);
  writer.u16(snapshot.squadLevel);
  writer.u32(snapshot.squadMaterials);
  writer.f32(snapshot.resonance);
  writeTimer(writer, snapshot.resonanceActiveT);
  writer.u32(snapshot.bossUid);
  writer.u8(flags(snapshot.bossDead, snapshot.vacuum));
  writer.u32(snapshot.waveMaterials);
  writer.u8(snapshot.contractIndex < 0 ? 0xff : snapshot.contractIndex);
  const objectiveKindIndex = snapshot.objective
    ? objectiveKinds.indexOf(snapshot.objective.kind)
    : 0;
  writer.u8(objectiveKindIndex);
  if (snapshot.objective) {
    writer.u8(flags(snapshot.objective.completed, snapshot.objective.failed));
    writer.f32(snapshot.objective.target);
    writer.f32(snapshot.objective.progress);
    writeTimer(writer, snapshot.objective.timeLeft);
    writer.f32(snapshot.objective.reward);
    writer.u32(snapshot.objective.startKills);
    writeCoord(writer, snapshot.objective.x);
    writeCoord(writer, snapshot.objective.y);
    writeRadius(writer, snapshot.objective.radius);
  }

  writer.u8(snapshot.players.length);
  for (const player of snapshot.players) {
    writer.u8(player.slot);
    writer.u8(flags(player.downed, player.moving));
    writeCoord(writer, player.x);
    writeCoord(writer, player.y);
    writer.f32(player.hp);
    writer.f32(player.maxHp);
    writeRadius(writer, player.radius);
    writeAngle(writer, player.aimAngle);
    writeTimer(writer, player.iframes);
    writeTimer(writer, player.slowT);
    writeTimer(writer, player.abilityCd);
    writeTimer(writer, player.abilityActiveT);
    writeTimer(writer, player.abilityRecoveryT);
    writeTimer(writer, player.abilityPulseT);
    writer.u16(player.abilityPulseCount);
    writeCoord(writer, player.abilityX);
    writeCoord(writer, player.abilityY);
    writer.f32(player.abilityPower);
    writer.u8(player.weapons.length);
    for (const weapon of player.weapons) {
      writer.u8(weapon.slot);
      writeTimer(writer, weapon.cooldownTimer);
      writeUnit(writer, weapon.recoil);
      writeAngle(writer, weapon.fireAngle);
      writeAngle(writer, weapon.orbitAngle);
      writeTimer(writer, weapon.swipeTimer);
      writeAngle(writer, weapon.swipeAngle);
      writeTimer(writer, weapon.chainFxTimer);
      writer.u8(weapon.chainPoints.length);
      for (const point of weapon.chainPoints) {
        writeCoord(writer, point.x);
        writeCoord(writer, point.y);
      }
      writer.u8(weapon.summons.length);
      for (const summon of weapon.summons) {
        writeCoord(writer, summon.x);
        writeCoord(writer, summon.y);
        writeTimer(writer, summon.hitCd);
        writeUnit(writer, summon.flash);
      }
    }
  }

  writer.u16(snapshot.enemies.length);
  for (const enemy of snapshot.enemies) {
    writer.u32(enemy.uid);
    writer.u16(enemy.defIdx);
    writer.u8(flags(enemy.elite, enemy.isBoss));
    writer.u8(enemy.phase);
    writeCoord(writer, enemy.x);
    writeCoord(writer, enemy.y);
    writer.f32(enemy.hp);
    writer.f32(enemy.maxHp);
    writeRadius(writer, enemy.radius);
    writeTimer(writer, enemy.phaseTimer);
    writeUnit(writer, enemy.hitFlash);
    writeTimer(writer, enemy.spawnT);
    writeTimer(writer, enemy.burnT);
    writeTimer(writer, enemy.slowT);
    writeTimer(writer, enemy.freezeT);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedEnemies);

  writer.u16(snapshot.projectiles.length);
  for (const projectile of snapshot.projectiles) {
    writer.u32(projectile.uid);
    writer.u8(encodeSlot(projectile.ownerPlayerSlot));
    writer.u8(flags(projectile.friendly, projectile.crit));
    writer.u16(projectile.styleIndex);
    writer.u8(projectile.variant);
    writeCoord(writer, projectile.x);
    writeCoord(writer, projectile.y);
    writeVelocity(writer, projectile.vx);
    writeVelocity(writer, projectile.vy);
    writeRadius(writer, projectile.radius);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedProjectiles);

  writer.u16(snapshot.pickups.length);
  for (const pickup of snapshot.pickups) {
    writer.u32(pickup.uid);
    writeCoord(writer, pickup.x);
    writeCoord(writer, pickup.y);
    writer.u16(pickup.value);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedPickups);

  writer.u16(snapshot.areas.length);
  for (const area of snapshot.areas) {
    writer.u32(area.uid);
    writer.u8(encodeSlot(area.ownerPlayerSlot));
    writer.u8(area.kind);
    writer.u16(area.styleIndex);
    writeCoord(writer, area.x);
    writeCoord(writer, area.y);
    writeRadius(writer, area.radius);
    writeRadius(writer, area.impactRadius);
    writeRadius(writer, area.prevRadius);
    writeRadius(writer, area.maxRadius);
    writeTimer(writer, area.delay);
    writeTimer(writer, area.ttl);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedAreas);

  writer.u16(snapshot.chests.length);
  for (const chest of snapshot.chests) {
    writer.u32(chest.uid);
    writeCoord(writer, chest.x);
    writeCoord(writer, chest.y);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedChests);

  writer.u16(snapshot.explosions.length);
  for (const explosion of snapshot.explosions) {
    writer.u32(explosion.uid);
    writeCoord(writer, explosion.x);
    writeCoord(writer, explosion.y);
    writeTimer(writer, explosion.t);
    writeRadius(writer, explosion.radius);
    writer.f32(explosion.damage);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedExplosions);

  writer.u16(snapshot.firePatches.length);
  for (const patch of snapshot.firePatches) {
    writer.u32(patch.uid);
    writeCoord(writer, patch.x);
    writeCoord(writer, patch.y);
    writeTimer(writer, patch.ttl);
  }
  if (snapshot.kind === 'delta') writeRemovedUids(writer, snapshot.removedFirePatches);
  return writer.finish();
}

export function decodeFrameSnapshot(buffer: ArrayBuffer): FrameSnapshot {
  if (buffer.byteLength < HEADER_BYTES) throw new Error('truncated snapshot header');
  const reader = new BinaryReader(buffer);
  if (reader.u32() !== SNAPSHOT_MAGIC) throw new Error('invalid snapshot magic');
  if (reader.u16() !== NETWORK_VERSION) throw new Error('incompatible snapshot version');
  const snapshotSeq = reader.u32();
  const simTick = reader.u32();
  const ackInputTick = reader.u32();
  const buildRevision = reader.u32();
  const phaseRevision = reader.u32();
  const lastEventId = reader.u32();
  const keyframeFlag = reader.u8();
  if (keyframeFlag !== 0 && keyframeFlag !== 1) throw new Error('invalid snapshot kind');
  const kind = keyframeFlag === 1 ? 'keyframe' : 'delta';
  const baseSnapshotSeq = kind === 'delta' ? reader.u32() : 0;
  const wave = reader.u16();
  if (wave < 1) throw new Error('invalid wave');
  const waveTimer = Math.max(0, reader.f32());
  const kills = reader.u32();
  const squadXp = reader.f32();
  const squadLevel = reader.u16();
  if (squadLevel < 1) throw new Error('invalid squad level');
  const squadMaterials = reader.u32();
  const resonance = Math.max(0, Math.min(100, reader.f32()));
  const resonanceActiveT = readTimer(reader);
  const bossUid = reader.u32();
  const runFlags = reader.u8();
  const waveMaterials = reader.u32();
  const rawContractIndex = reader.u8();
  if (rawContractIndex !== 0xff && rawContractIndex >= WAVE_CONTRACTS.length) {
    throw new Error('unknown contract');
  }
  const contractIndex = rawContractIndex === 0xff ? -1 : rawContractIndex;
  const objectiveKindIndex = reader.u8();
  if (objectiveKindIndex >= objectiveKinds.length) throw new Error('unknown objective');
  let objective: WaveObjectiveState | null = null;
  if (objectiveKindIndex > 0) {
    const objectiveFlags = reader.u8();
    objective = {
      kind: objectiveKinds[objectiveKindIndex]!,
      completed: (objectiveFlags & 1) !== 0,
      failed: (objectiveFlags & 2) !== 0,
      target: reader.f32(),
      progress: reader.f32(),
      timeLeft: readTimer(reader),
      reward: reader.f32(),
      startKills: reader.u32(),
      x: readCoord(reader),
      y: readCoord(reader),
      radius: readRadius(reader),
    };
  }

  const playerCount = checkCount(reader.u8(), 2, 'player');
  if (playerCount < 1) throw new Error('snapshot has no players');
  const players: PlayerFrame[] = [];
  const playerSlots = new Set<PlayerSlot>();
  for (let index = 0; index < playerCount; index++) {
    const slot = decodeSlot(reader.u8());
    if (slot === null) throw new Error('null player slot');
    if (playerSlots.has(slot)) throw new Error('duplicate player slot');
    playerSlots.add(slot);
    const playerFlags = reader.u8();
    const player: PlayerFrame = {
      slot,
      downed: (playerFlags & 1) !== 0,
      moving: (playerFlags & 2) !== 0,
      x: readCoord(reader),
      y: readCoord(reader),
      hp: reader.f32(),
      maxHp: reader.f32(),
      radius: readRadius(reader),
      aimAngle: readAngle(reader),
      iframes: readTimer(reader),
      slowT: readTimer(reader),
      abilityCd: readTimer(reader),
      abilityActiveT: readTimer(reader),
      abilityRecoveryT: readTimer(reader),
      abilityPulseT: readTimer(reader),
      abilityPulseCount: reader.u16(),
      abilityX: readCoord(reader),
      abilityY: readCoord(reader),
      abilityPower: reader.f32(),
      weapons: [],
    };
    for (let count = checkCount(reader.u8(), 6, 'player weapon'); count > 0; count--) {
      const weapon: WeaponFrame = {
        slot: reader.u8(),
        cooldownTimer: readTimer(reader),
        recoil: readUnit(reader),
        fireAngle: readAngle(reader),
        orbitAngle: readAngle(reader),
        swipeTimer: readTimer(reader),
        swipeAngle: readAngle(reader),
        chainFxTimer: readTimer(reader),
        chainPoints: [],
        summons: [],
      };
      if (weapon.slot < 0 || weapon.slot >= 6) throw new Error('invalid weapon slot');
      for (let points = checkCount(reader.u8(), 7, 'chain point'); points > 0; points--) {
        weapon.chainPoints.push({ x: readCoord(reader), y: readCoord(reader) });
      }
      for (let summons = checkCount(reader.u8(), 4, 'summon'); summons > 0; summons--) {
        weapon.summons.push({
          x: readCoord(reader),
          y: readCoord(reader),
          hitCd: readTimer(reader),
          flash: readUnit(reader),
        });
      }
      player.weapons.push(weapon);
    }
    players.push(player);
  }

  const enemies: EnemyFrame[] = [];
  for (let count = checkCount(reader.u16(), POOL_ENEMIES, 'enemy'); count > 0; count--) {
    const uid = reader.u32();
    const defIdx = reader.u16();
    if (defIdx >= ENEMIES.length) throw new Error('unknown enemy definition');
    const enemyFlags = reader.u8();
    const phase = reader.u8();
    enemies.push({
      uid,
      defIdx,
      elite: (enemyFlags & 1) !== 0,
      isBoss: (enemyFlags & 2) !== 0,
      phase,
      x: readCoord(reader),
      y: readCoord(reader),
      hp: reader.f32(),
      maxHp: reader.f32(),
      radius: readRadius(reader),
      phaseTimer: readTimer(reader),
      hitFlash: readUnit(reader),
      spawnT: readTimer(reader),
      burnT: readTimer(reader),
      slowT: readTimer(reader),
      freezeT: readTimer(reader),
    });
  }
  const removedEnemies = kind === 'delta'
    ? readRemovedUids(reader, POOL_ENEMIES, 'removed enemy')
    : [];

  const projectiles: ProjectileFrame[] = [];
  for (let count = checkCount(reader.u16(), POOL_PROJECTILES, 'projectile'); count > 0; count--) {
    const uid = reader.u32();
    const ownerPlayerSlot = decodeSlot(reader.u8());
    const projectileFlags = reader.u8();
    const projectileStyleIndex = reader.u16();
    if (projectileStyleIndex >= styleIds.length) throw new Error('unknown projectile style');
    projectiles.push({
      uid,
      ownerPlayerSlot,
      friendly: (projectileFlags & 1) !== 0,
      crit: (projectileFlags & 2) !== 0,
      styleIndex: projectileStyleIndex,
      variant: reader.u8(),
      x: readCoord(reader),
      y: readCoord(reader),
      vx: readVelocity(reader),
      vy: readVelocity(reader),
      radius: readRadius(reader),
    });
  }
  const removedProjectiles = kind === 'delta'
    ? readRemovedUids(reader, POOL_PROJECTILES, 'removed projectile')
    : [];

  const pickups: PickupFrame[] = [];
  for (let count = checkCount(reader.u16(), POOL_PICKUPS, 'pickup'); count > 0; count--) {
    pickups.push({
      uid: reader.u32(),
      x: readCoord(reader),
      y: readCoord(reader),
      value: reader.u16(),
    });
  }
  const removedPickups = kind === 'delta'
    ? readRemovedUids(reader, POOL_PICKUPS, 'removed pickup')
    : [];

  const areas: AreaFrame[] = [];
  for (let count = checkCount(reader.u16(), POOL_AREA_EFFECTS, 'area'); count > 0; count--) {
    const uid = reader.u32();
    const ownerPlayerSlot = decodeSlot(reader.u8());
    const kind = reader.u8();
    if (kind !== 0 && kind !== 1) throw new Error('unknown area kind');
    const areaStyleIndex = reader.u16();
    if (areaStyleIndex >= styleIds.length) throw new Error('unknown area style');
    areas.push({
      uid,
      ownerPlayerSlot,
      kind,
      styleIndex: areaStyleIndex,
      x: readCoord(reader),
      y: readCoord(reader),
      radius: readRadius(reader),
      impactRadius: readRadius(reader),
      prevRadius: readRadius(reader),
      maxRadius: readRadius(reader),
      delay: readTimer(reader),
      ttl: readTimer(reader),
    });
  }
  const removedAreas = kind === 'delta'
    ? readRemovedUids(reader, POOL_AREA_EFFECTS, 'removed area')
    : [];

  const chests: ChestFrame[] = [];
  for (let count = checkCount(reader.u16(), 32, 'chest'); count > 0; count--) {
    chests.push({ uid: reader.u32(), x: readCoord(reader), y: readCoord(reader) });
  }
  const removedChests = kind === 'delta'
    ? readRemovedUids(reader, 32, 'removed chest')
    : [];
  const explosions: ExplosionFrame[] = [];
  for (let count = checkCount(reader.u16(), 160, 'explosion'); count > 0; count--) {
    explosions.push({
      uid: reader.u32(),
      x: readCoord(reader),
      y: readCoord(reader),
      t: readTimer(reader),
      radius: readRadius(reader),
      damage: reader.f32(),
    });
  }
  const removedExplosions = kind === 'delta'
    ? readRemovedUids(reader, 160, 'removed explosion')
    : [];
  const firePatches: FirePatchFrame[] = [];
  for (let count = checkCount(reader.u16(), 160, 'fire patch'); count > 0; count--) {
    firePatches.push({
      uid: reader.u32(),
      x: readCoord(reader),
      y: readCoord(reader),
      ttl: readTimer(reader),
    });
  }
  const removedFirePatches = kind === 'delta'
    ? readRemovedUids(reader, 160, 'removed fire patch')
    : [];
  reader.assertDone();

  return {
    kind,
    baseSnapshotSeq,
    snapshotSeq,
    simTick,
    ackInputTick,
    buildRevision,
    phaseRevision,
    lastEventId,
    wave,
    waveTimer,
    kills,
    squadXp,
    squadLevel,
    squadMaterials,
    resonance,
    resonanceActiveT,
    bossUid,
    bossDead: (runFlags & 1) !== 0,
    vacuum: (runFlags & 2) !== 0,
    waveMaterials,
    contractIndex,
    objective,
    players,
    enemies,
    projectiles,
    pickups,
    areas,
    chests,
    explosions,
    firePatches,
    removedEnemies,
    removedProjectiles,
    removedPickups,
    removedAreas,
    removedChests,
    removedExplosions,
    removedFirePatches,
  };
}

type EnemyEntity = RunState['enemies']['items'][number];
type ProjectileEntity = RunState['projectiles']['items'][number];
type PickupEntity = RunState['pickups']['items'][number];
type AreaEntity = RunState['areaEffects']['items'][number];

interface PoolLike<T extends { active: boolean; uid: number }> {
  items: T[];
  count: number;
  alloc(): T | null;
  sweep(): void;
}

interface UidCache<T extends { uid: number }> {
  byUid: Map<number, T>;
  incoming: Set<number>;
}

type PoolApplyCache<T extends { active: boolean; uid: number }> = UidCache<T>;

interface SnapshotApplyCache {
  enemies: PoolApplyCache<EnemyEntity>;
  projectiles: PoolApplyCache<ProjectileEntity>;
  pickups: PoolApplyCache<PickupEntity>;
  areas: PoolApplyCache<AreaEntity>;
  chests: UidCache<RunState['chests'][number]>;
  explosions: UidCache<RunState['explosions'][number]>;
  firePatches: UidCache<RunState['firePatches'][number]>;
}

const applyCaches = new WeakMap<RunState, SnapshotApplyCache>();

function poolCache<T extends { uid: number }>(): UidCache<T> {
  return { byUid: new Map(), incoming: new Set() };
}

function applyCache(state: RunState): SnapshotApplyCache {
  let cache = applyCaches.get(state);
  if (!cache) {
    cache = {
      enemies: poolCache(),
      projectiles: poolCache(),
      pickups: poolCache(),
      areas: poolCache(),
      chests: poolCache(),
      explosions: poolCache(),
      firePatches: poolCache(),
    };
    applyCaches.set(state, cache);
  }
  return cache;
}

function syncPool<T extends { active: boolean; uid: number }, F extends { uid: number }>(
  pool: PoolLike<T>,
  frames: readonly F[],
  cache: PoolApplyCache<T>,
  apply: (target: T, frame: F) => void,
): void {
  if (cache.byUid.size === 0 && pool.count > 0) {
    for (let index = 0; index < pool.count; index++) {
      const item = pool.items[index];
      cache.byUid.set(item.uid, item);
    }
  }
  cache.incoming.clear();
  for (const frame of frames) cache.incoming.add(frame.uid);
  for (const [uid, item] of cache.byUid) {
    if (cache.incoming.has(uid)) continue;
    item.active = false;
    cache.byUid.delete(uid);
  }
  pool.sweep();
  for (const frame of frames) {
    let target = cache.byUid.get(frame.uid);
    if (!target) {
      target = pool.alloc() ?? undefined;
      if (!target) break;
      cache.byUid.set(frame.uid, target);
    }
    target.active = true;
    apply(target, frame);
  }
}

function syncArray<T extends { uid: number }>(
  target: T[],
  frames: readonly T[],
  cache: { byUid: Map<number, T>; incoming: Set<number> },
): void {
  if (cache.byUid.size === 0 && target.length > 0) {
    for (const entry of target) cache.byUid.set(entry.uid, entry);
  }
  cache.incoming.clear();
  for (const frame of frames) cache.incoming.add(frame.uid);
  for (let index = target.length - 1; index >= 0; index--) {
    const uid = target[index].uid;
    if (!cache.incoming.has(uid)) {
      target.splice(index, 1);
      cache.byUid.delete(uid);
    }
  }
  for (const frame of frames) {
    const existing = cache.byUid.get(frame.uid);
    if (existing) Object.assign(existing, frame);
    else {
      const added = { ...frame };
      target.push(added);
      cache.byUid.set(added.uid, added);
    }
  }
}

export function applySnapshotToRunState(state: RunState, snapshot: FrameSnapshot): void {
  state.wave = snapshot.wave;
  state.waveTimer = snapshot.waveTimer;
  state.kills = snapshot.kills;
  state.squad.xp = snapshot.squadXp;
  state.squad.level = snapshot.squadLevel;
  state.squad.materials = snapshot.squadMaterials;
  state.resonance = snapshot.resonance;
  state.resonanceActiveT = snapshot.resonanceActiveT;
  state.bossUid = snapshot.bossUid;
  state.bossDead = snapshot.bossDead;
  state.vacuum = snapshot.vacuum;
  state.waveMaterials = snapshot.waveMaterials;
  state.activeContract = snapshot.contractIndex < 0
    ? null
    : WAVE_CONTRACTS[snapshot.contractIndex] ?? null;
  if (!snapshot.objective) {
    state.objective = null;
  } else if (state.objective?.kind === snapshot.objective.kind) {
    Object.assign(state.objective, snapshot.objective);
  } else {
    state.objective = { ...snapshot.objective };
  }
  for (const frame of snapshot.players) {
    const player = state.playerBySlot(frame.slot);
    if (!player) continue;
    player.x = frame.x;
    player.y = frame.y;
    player.hp = frame.hp;
    player.radius = frame.radius;
    player.downed = frame.downed;
    player.moving = frame.moving;
    player.aimAngle = frame.aimAngle;
    player.iframes = frame.iframes;
    player.slowT = frame.slowT;
    player.abilityCd = frame.abilityCd;
    player.abilityActiveT = frame.abilityActiveT;
    player.abilityRecoveryT = frame.abilityRecoveryT;
    player.abilityPulseT = frame.abilityPulseT;
    player.abilityPulseCount = frame.abilityPulseCount;
    player.abilityX = frame.abilityX;
    player.abilityY = frame.abilityY;
    player.abilityPower = frame.abilityPower;
    for (const weaponFrame of frame.weapons) {
      const weapon = player.weapons.find((entry) => entry.slotIndex === weaponFrame.slot);
      if (!weapon) continue;
      weapon.cooldownTimer = weaponFrame.cooldownTimer;
      weapon.recoil = weaponFrame.recoil;
      weapon.fireAngle = weaponFrame.fireAngle;
      weapon.orbitAngle = weaponFrame.orbitAngle;
      weapon.swipeTimer = weaponFrame.swipeTimer;
      weapon.swipeAngle = weaponFrame.swipeAngle;
      weapon.chainFxTimer = weaponFrame.chainFxTimer;
      weapon.chainFxPointCount = weaponFrame.chainPoints.length;
      for (let index = 0; index < weaponFrame.chainPoints.length; index++) {
        weapon.chainFxX[index] = weaponFrame.chainPoints[index].x;
        weapon.chainFxY[index] = weaponFrame.chainPoints[index].y;
      }
      weapon.summonCount = weaponFrame.summons.length;
      for (let index = 0; index < weaponFrame.summons.length; index++) {
        weapon.summonX[index] = weaponFrame.summons[index].x;
        weapon.summonY[index] = weaponFrame.summons[index].y;
        weapon.summonHitCd[index] = weaponFrame.summons[index].hitCd;
        weapon.summonFlash[index] = weaponFrame.summons[index].flash;
      }
    }
  }

  const cache = applyCache(state);
  syncPool(state.enemies, snapshot.enemies, cache.enemies, (enemy, frame) => {
    Object.assign(enemy, frame);
  });
  syncPool(state.projectiles, snapshot.projectiles, cache.projectiles, (projectile, frame) => {
    Object.assign(projectile, frame, { style: styleIds[frame.styleIndex] });
  });
  syncPool(state.pickups, snapshot.pickups, cache.pickups, (pickup, frame) => {
    Object.assign(pickup, frame);
  });
  syncPool(state.areaEffects, snapshot.areas, cache.areas, (area, frame) => {
    Object.assign(area, frame, {
      kind: frame.kind === 0 ? 'zone' : 'shockwave',
      style: styleIds[frame.styleIndex],
    });
  });
  syncArray(state.chests, snapshot.chests, cache.chests);
  syncArray(state.explosions, snapshot.explosions, cache.explosions);
  syncArray(state.firePatches, snapshot.firePatches, cache.firePatches);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + delta * t;
}

export interface SnapshotIndex {
  players: ReadonlyMap<PlayerSlot, PlayerFrame>;
  enemies: ReadonlyMap<number, EnemyFrame>;
  projectiles: ReadonlyMap<number, ProjectileFrame>;
  pickups: ReadonlyMap<number, PickupFrame>;
  areas: ReadonlyMap<number, AreaFrame>;
  chests: ReadonlyMap<number, ChestFrame>;
  explosions: ReadonlyMap<number, ExplosionFrame>;
  firePatches: ReadonlyMap<number, FirePatchFrame>;
}

interface BufferedSnapshot {
  frame: FrameSnapshot;
  receivedAtMs: number;
  index: SnapshotIndex;
}

export interface ShadowSample {
  older: FrameSnapshot;
  newer: FrameSnapshot;
  olderIndex: SnapshotIndex;
  t: number;
  targetTick: number;
  latestTick: number;
  interpolationDelayMs: number;
}

function indexSnapshot(frame: FrameSnapshot): SnapshotIndex {
  return {
    players: new Map(frame.players.map((entry) => [entry.slot, entry])),
    enemies: new Map(frame.enemies.map((entry) => [entry.uid, entry])),
    projectiles: new Map(frame.projectiles.map((entry) => [entry.uid, entry])),
    pickups: new Map(frame.pickups.map((entry) => [entry.uid, entry])),
    areas: new Map(frame.areas.map((entry) => [entry.uid, entry])),
    chests: new Map(frame.chests.map((entry) => [entry.uid, entry])),
    explosions: new Map(frame.explosions.map((entry) => [entry.uid, entry])),
    firePatches: new Map(frame.firePatches.map((entry) => [entry.uid, entry])),
  };
}

function interpolatePoolPositions<T extends { uid: number; x: number; y: number }>(
  frames: readonly T[],
  previous: ReadonlyMap<number, T>,
  targetByUid: ReadonlyMap<number, { x: number; y: number }>,
  t: number,
): void {
  for (const frame of frames) {
    const target = targetByUid.get(frame.uid);
    if (!target) continue;
    const older = previous.get(frame.uid);
    if (!older) {
      target.x = frame.x;
      target.y = frame.y;
      continue;
    }
    target.x = lerp(older.x, frame.x, t);
    target.y = lerp(older.y, frame.y, t);
  }
}

export function applyShadowSampleToRunState(state: RunState, sample: ShadowSample): void {
  applySnapshotToRunState(state, sample.newer);
  const cache = applyCache(state);
  for (const frame of sample.newer.players) {
    const player = state.playerBySlot(frame.slot);
    if (!player) continue;
    const older = sample.olderIndex.players.get(frame.slot);
    if (!older) continue;
    player.x = lerp(older.x, frame.x, sample.t);
    player.y = lerp(older.y, frame.y, sample.t);
    player.aimAngle = lerpAngle(older.aimAngle, frame.aimAngle, sample.t);
  }
  interpolatePoolPositions(
    sample.newer.enemies,
    sample.olderIndex.enemies,
    cache.enemies.byUid,
    sample.t,
  );
  interpolatePoolPositions(
    sample.newer.projectiles,
    sample.olderIndex.projectiles,
    cache.projectiles.byUid,
    sample.t,
  );
  interpolatePoolPositions(
    sample.newer.pickups,
    sample.olderIndex.pickups,
    cache.pickups.byUid,
    sample.t,
  );
  interpolatePoolPositions(
    sample.newer.areas,
    sample.olderIndex.areas,
    cache.areas.byUid,
    sample.t,
  );
  interpolatePoolPositions(
    sample.newer.chests,
    sample.olderIndex.chests,
    cache.chests.byUid,
    sample.t,
  );
  interpolatePoolPositions(
    sample.newer.explosions,
    sample.olderIndex.explosions,
    cache.explosions.byUid,
    sample.t,
  );
  interpolatePoolPositions(
    sample.newer.firePatches,
    sample.olderIndex.firePatches,
    cache.firePatches.byUid,
    sample.t,
  );
}

export class ShadowState {
  private snapshots: BufferedSnapshot[] = [];
  private lastSnapshotSeq = 0;
  private lastReceivedAtMs = 0;
  private arrivalJitter = 0;
  private adaptiveDelayMs = 50;
  private sampledTick = 0;

  accept(snapshot: FrameSnapshot, receivedAtMs = performance.now()): boolean {
    if (snapshot.kind !== 'keyframe') return false;
    if (snapshot.snapshotSeq <= this.lastSnapshotSeq) return false;
    const previous = this.snapshots[this.snapshots.length - 1];
    if (previous) {
      const actualInterval = Math.max(0, receivedAtMs - previous.receivedAtMs);
      const expectedInterval = Math.max(
        1000 / 60,
        (snapshot.simTick - previous.frame.simTick) * (1000 / 60),
      );
      const deviation = Math.abs(actualInterval - expectedInterval);
      this.arrivalJitter += (deviation - this.arrivalJitter) * 0.15;
      this.adaptiveDelayMs = Math.max(
        40,
        Math.min(100, expectedInterval + this.arrivalJitter * 2),
      );
    }
    this.lastSnapshotSeq = snapshot.snapshotSeq;
    this.lastReceivedAtMs = receivedAtMs;
    this.snapshots.push({
      frame: snapshot,
      receivedAtMs,
      index: indexSnapshot(snapshot),
    });
    if (this.snapshots.length > 8) this.snapshots.shift();
    return true;
  }

  sample(nowMs = performance.now(), delayMs = this.adaptiveDelayMs): ShadowSample | null {
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return null;
    const elapsedTicks = Math.max(0, nowMs - latest.receivedAtMs) / (1000 / 60);
    const latestTick = latest.frame.simTick + elapsedTicks;
    const targetTick = Math.max(
      this.sampledTick,
      latestTick - delayMs / (1000 / 60),
    );
    let newer = latest;
    let older = this.snapshots[Math.max(0, this.snapshots.length - 2)] ?? latest;
    if (targetTick <= this.snapshots[0].frame.simTick) {
      older = this.snapshots[0];
      newer = older;
    }
    for (let index = 1; index < this.snapshots.length; index++) {
      if (this.snapshots[index].frame.simTick >= targetTick) {
        older = this.snapshots[index - 1];
        newer = this.snapshots[index];
        break;
      }
    }
    const span = Math.max(1, newer.frame.simTick - older.frame.simTick);
    const maxT = newer === latest ? 1 + 6 / span : 1;
    const t = Math.max(
      0,
      Math.min(maxT, (targetTick - older.frame.simTick) / span),
    );
    // Track the tick that was actually presented, not the unconstrained
    // target. During a long outage extrapolation is capped at six ticks;
    // retaining a much larger target here would freeze presentation after
    // packets resume.
    this.sampledTick = Math.max(
      this.sampledTick,
      older.frame.simTick + span * t,
    );
    return {
      older: older.frame,
      newer: newer.frame,
      olderIndex: older.index,
      t,
      targetTick: this.sampledTick,
      latestTick,
      interpolationDelayMs: delayMs,
    };
  }

  clear(): void {
    this.snapshots = [];
    this.lastReceivedAtMs = 0;
    this.arrivalJitter = 0;
    this.adaptiveDelayMs = 50;
    this.sampledTick = 0;
  }

  get latestSequence(): number {
    return this.lastSnapshotSeq;
  }

  get presentationTick(): number {
    return this.sampledTick;
  }

  get interpolationDelayMs(): number {
    return this.adaptiveDelayMs;
  }

  get arrivalJitterMs(): number {
    return this.arrivalJitter;
  }

  get lastSnapshotReceivedAt(): number {
    return this.lastReceivedAtMs;
  }
}
