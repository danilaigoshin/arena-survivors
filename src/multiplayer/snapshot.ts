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
const HEADER_BYTES = 34;
const NULL_SLOT = 0xff;
const styleIds = ['', 'frost', ...WEAPONS.map((weapon) => weapon.id)];
const styleIndex = new Map(styleIds.map((id, index) => [id, index]));
const objectiveKinds: (WaveObjectiveKind | null)[] = [null, 'hunter', 'collector', 'hold'];

export interface SnapshotMetadata {
  snapshotSeq: number;
  simTick: number;
  ackInputSeq: number;
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
}

class BinaryWriter {
  private buffer = new ArrayBuffer(8192);
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
}

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

function checkCount(count: number, maximum: number, label: string): number {
  if (count > maximum) throw new Error(`oversized ${label} pool`);
  return count;
}

export function captureFrameSnapshot(state: RunState, metadata: SnapshotMetadata): FrameSnapshot {
  return {
    ...metadata,
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
    enemies: state.enemies.items.slice(0, state.enemies.count).map((enemy) => ({
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
    projectiles: state.projectiles.items.slice(0, state.projectiles.count).map((projectile) => ({
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
    pickups: state.pickups.items.slice(0, state.pickups.count).map((pickup) => ({
      uid: pickup.uid,
      x: pickup.x,
      y: pickup.y,
      value: pickup.value,
    })),
    areas: state.areaEffects.items.slice(0, state.areaEffects.count).map((area) => ({
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
    chests: state.chests.map((chest) => ({ ...chest })),
    explosions: state.explosions.map((explosion) => ({ ...explosion })),
    firePatches: state.firePatches.map((patch) => ({ ...patch })),
  };
}

export function encodeFrameSnapshot(snapshot: FrameSnapshot): ArrayBuffer {
  const writer = new BinaryWriter();
  writer.u32(SNAPSHOT_MAGIC);
  writer.u16(NETWORK_VERSION);
  writer.u32(snapshot.snapshotSeq);
  writer.u32(snapshot.simTick);
  writer.u32(snapshot.ackInputSeq);
  writer.u32(snapshot.buildRevision);
  writer.u32(snapshot.phaseRevision);
  writer.u32(snapshot.lastEventId);
  writer.u16(snapshot.wave);
  writer.f32(snapshot.waveTimer);
  writer.u32(snapshot.kills);
  writer.f32(snapshot.squadXp);
  writer.u16(snapshot.squadLevel);
  writer.u32(snapshot.squadMaterials);
  writer.f32(snapshot.resonance);
  writer.f32(snapshot.resonanceActiveT);
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
    writer.f32(snapshot.objective.timeLeft);
    writer.f32(snapshot.objective.reward);
    writer.u32(snapshot.objective.startKills);
    writer.f32(snapshot.objective.x);
    writer.f32(snapshot.objective.y);
    writer.f32(snapshot.objective.radius);
  }

  writer.u8(snapshot.players.length);
  for (const player of snapshot.players) {
    writer.u8(player.slot);
    writer.u8(flags(player.downed, player.moving));
    writer.f32(player.x);
    writer.f32(player.y);
    writer.f32(player.hp);
    writer.f32(player.maxHp);
    writer.f32(player.radius);
    writer.f32(player.aimAngle);
    writer.f32(player.iframes);
    writer.f32(player.slowT);
    writer.f32(player.abilityCd);
    writer.f32(player.abilityActiveT);
    writer.f32(player.abilityRecoveryT);
    writer.f32(player.abilityPulseT);
    writer.u16(player.abilityPulseCount);
    writer.f32(player.abilityX);
    writer.f32(player.abilityY);
    writer.f32(player.abilityPower);
    writer.u8(player.weapons.length);
    for (const weapon of player.weapons) {
      writer.u8(weapon.slot);
      writer.f32(weapon.cooldownTimer);
      writer.f32(weapon.recoil);
      writer.f32(weapon.fireAngle);
      writer.f32(weapon.orbitAngle);
      writer.f32(weapon.swipeTimer);
      writer.f32(weapon.swipeAngle);
      writer.f32(weapon.chainFxTimer);
      writer.u8(weapon.chainPoints.length);
      for (const point of weapon.chainPoints) {
        writer.f32(point.x);
        writer.f32(point.y);
      }
      writer.u8(weapon.summons.length);
      for (const summon of weapon.summons) {
        writer.f32(summon.x);
        writer.f32(summon.y);
        writer.f32(summon.hitCd);
        writer.f32(summon.flash);
      }
    }
  }

  writer.u16(snapshot.enemies.length);
  for (const enemy of snapshot.enemies) {
    writer.u32(enemy.uid);
    writer.u16(enemy.defIdx);
    writer.u8(flags(enemy.elite, enemy.isBoss));
    writer.u8(enemy.phase);
    writer.f32(enemy.x);
    writer.f32(enemy.y);
    writer.f32(enemy.hp);
    writer.f32(enemy.maxHp);
    writer.f32(enemy.radius);
    writer.f32(enemy.phaseTimer);
    writer.f32(enemy.hitFlash);
    writer.f32(enemy.spawnT);
    writer.f32(enemy.burnT);
    writer.f32(enemy.slowT);
    writer.f32(enemy.freezeT);
  }

  writer.u16(snapshot.projectiles.length);
  for (const projectile of snapshot.projectiles) {
    writer.u32(projectile.uid);
    writer.u8(encodeSlot(projectile.ownerPlayerSlot));
    writer.u8(flags(projectile.friendly, projectile.crit));
    writer.u16(projectile.styleIndex);
    writer.u8(projectile.variant);
    writer.f32(projectile.x);
    writer.f32(projectile.y);
    writer.f32(projectile.vx);
    writer.f32(projectile.vy);
    writer.f32(projectile.radius);
  }

  writer.u16(snapshot.pickups.length);
  for (const pickup of snapshot.pickups) {
    writer.u32(pickup.uid);
    writer.f32(pickup.x);
    writer.f32(pickup.y);
    writer.u16(pickup.value);
  }

  writer.u16(snapshot.areas.length);
  for (const area of snapshot.areas) {
    writer.u32(area.uid);
    writer.u8(encodeSlot(area.ownerPlayerSlot));
    writer.u8(area.kind);
    writer.u16(area.styleIndex);
    writer.f32(area.x);
    writer.f32(area.y);
    writer.f32(area.radius);
    writer.f32(area.impactRadius);
    writer.f32(area.prevRadius);
    writer.f32(area.maxRadius);
    writer.f32(area.delay);
    writer.f32(area.ttl);
  }

  writer.u16(snapshot.chests.length);
  for (const chest of snapshot.chests) {
    writer.u32(chest.uid);
    writer.f32(chest.x);
    writer.f32(chest.y);
  }

  writer.u16(snapshot.explosions.length);
  for (const explosion of snapshot.explosions) {
    writer.u32(explosion.uid);
    writer.f32(explosion.x);
    writer.f32(explosion.y);
    writer.f32(explosion.t);
    writer.f32(explosion.radius);
    writer.f32(explosion.damage);
  }

  writer.u16(snapshot.firePatches.length);
  for (const patch of snapshot.firePatches) {
    writer.u32(patch.uid);
    writer.f32(patch.x);
    writer.f32(patch.y);
    writer.f32(patch.ttl);
  }
  return writer.finish();
}

export function decodeFrameSnapshot(buffer: ArrayBuffer): FrameSnapshot {
  if (buffer.byteLength < HEADER_BYTES) throw new Error('truncated snapshot header');
  const reader = new BinaryReader(buffer);
  if (reader.u32() !== SNAPSHOT_MAGIC) throw new Error('invalid snapshot magic');
  if (reader.u16() !== NETWORK_VERSION) throw new Error('incompatible snapshot version');
  const snapshotSeq = reader.u32();
  const simTick = reader.u32();
  const ackInputSeq = reader.u32();
  const buildRevision = reader.u32();
  const phaseRevision = reader.u32();
  const lastEventId = reader.u32();
  const wave = reader.u16();
  if (wave < 1) throw new Error('invalid wave');
  const waveTimer = reader.f32();
  const kills = reader.u32();
  const squadXp = reader.f32();
  const squadLevel = reader.u16();
  if (squadLevel < 1) throw new Error('invalid squad level');
  const squadMaterials = reader.u32();
  const resonance = Math.max(0, Math.min(100, reader.f32()));
  const resonanceActiveT = Math.max(0, reader.f32());
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
      timeLeft: reader.f32(),
      reward: reader.f32(),
      startKills: reader.u32(),
      x: reader.f32(),
      y: reader.f32(),
      radius: reader.f32(),
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
      x: reader.f32(),
      y: reader.f32(),
      hp: reader.f32(),
      maxHp: reader.f32(),
      radius: reader.f32(),
      aimAngle: reader.f32(),
      iframes: reader.f32(),
      slowT: reader.f32(),
      abilityCd: reader.f32(),
      abilityActiveT: reader.f32(),
      abilityRecoveryT: reader.f32(),
      abilityPulseT: reader.f32(),
      abilityPulseCount: reader.u16(),
      abilityX: reader.f32(),
      abilityY: reader.f32(),
      abilityPower: reader.f32(),
      weapons: [],
    };
    for (let count = checkCount(reader.u8(), 6, 'player weapon'); count > 0; count--) {
      const weapon: WeaponFrame = {
        slot: reader.u8(),
        cooldownTimer: reader.f32(),
        recoil: reader.f32(),
        fireAngle: reader.f32(),
        orbitAngle: reader.f32(),
        swipeTimer: reader.f32(),
        swipeAngle: reader.f32(),
        chainFxTimer: reader.f32(),
        chainPoints: [],
        summons: [],
      };
      if (weapon.slot < 0 || weapon.slot >= 6) throw new Error('invalid weapon slot');
      for (let points = checkCount(reader.u8(), 7, 'chain point'); points > 0; points--) {
        weapon.chainPoints.push({ x: reader.f32(), y: reader.f32() });
      }
      for (let summons = checkCount(reader.u8(), 4, 'summon'); summons > 0; summons--) {
        weapon.summons.push({
          x: reader.f32(),
          y: reader.f32(),
          hitCd: reader.f32(),
          flash: reader.f32(),
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
      x: reader.f32(),
      y: reader.f32(),
      hp: reader.f32(),
      maxHp: reader.f32(),
      radius: reader.f32(),
      phaseTimer: reader.f32(),
      hitFlash: reader.f32(),
      spawnT: reader.f32(),
      burnT: reader.f32(),
      slowT: reader.f32(),
      freezeT: reader.f32(),
    });
  }

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
      x: reader.f32(),
      y: reader.f32(),
      vx: reader.f32(),
      vy: reader.f32(),
      radius: reader.f32(),
    });
  }

  const pickups: PickupFrame[] = [];
  for (let count = checkCount(reader.u16(), POOL_PICKUPS, 'pickup'); count > 0; count--) {
    pickups.push({ uid: reader.u32(), x: reader.f32(), y: reader.f32(), value: reader.u16() });
  }

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
      x: reader.f32(),
      y: reader.f32(),
      radius: reader.f32(),
      impactRadius: reader.f32(),
      prevRadius: reader.f32(),
      maxRadius: reader.f32(),
      delay: reader.f32(),
      ttl: reader.f32(),
    });
  }

  const chests: ChestFrame[] = [];
  for (let count = checkCount(reader.u16(), 32, 'chest'); count > 0; count--) {
    chests.push({ uid: reader.u32(), x: reader.f32(), y: reader.f32() });
  }
  const explosions: ExplosionFrame[] = [];
  for (let count = checkCount(reader.u16(), 160, 'explosion'); count > 0; count--) {
    explosions.push({
      uid: reader.u32(),
      x: reader.f32(),
      y: reader.f32(),
      t: reader.f32(),
      radius: reader.f32(),
      damage: reader.f32(),
    });
  }
  const firePatches: FirePatchFrame[] = [];
  for (let count = checkCount(reader.u16(), 160, 'fire patch'); count > 0; count--) {
    firePatches.push({ uid: reader.u32(), x: reader.f32(), y: reader.f32(), ttl: reader.f32() });
  }
  reader.assertDone();

  return {
    snapshotSeq,
    simTick,
    ackInputSeq,
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
  };
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
  state.objective = snapshot.objective ? { ...snapshot.objective } : null;
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

  state.enemies.clear();
  for (const frame of snapshot.enemies) {
    const enemy = state.enemies.alloc();
    if (!enemy) break;
    enemy.active = true;
    Object.assign(enemy, frame);
  }
  state.projectiles.clear();
  for (const frame of snapshot.projectiles) {
    const projectile = state.projectiles.alloc();
    if (!projectile) break;
    projectile.active = true;
    Object.assign(projectile, frame, { style: styleIds[frame.styleIndex] });
  }
  state.pickups.clear();
  for (const frame of snapshot.pickups) {
    const pickup = state.pickups.alloc();
    if (!pickup) break;
    pickup.active = true;
    Object.assign(pickup, frame);
  }
  state.areaEffects.clear();
  for (const frame of snapshot.areas) {
    const area = state.areaEffects.alloc();
    if (!area) break;
    area.active = true;
    Object.assign(area, frame, {
      kind: frame.kind === 0 ? 'zone' : 'shockwave',
      style: styleIds[frame.styleIndex],
    });
  }
  state.chests = snapshot.chests.map((chest) => ({ ...chest }));
  state.explosions = snapshot.explosions.map((explosion) => ({ ...explosion }));
  state.firePatches = snapshot.firePatches.map((patch) => ({ ...patch }));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateByUid<T extends { uid: number; x: number; y: number }>(
  older: T[],
  newer: T[],
  t: number,
): T[] {
  const oldByUid = new Map(older.map((entry) => [entry.uid, entry]));
  return newer.map((entry) => {
    const previous = oldByUid.get(entry.uid);
    return previous ? { ...entry, x: lerp(previous.x, entry.x, t), y: lerp(previous.y, entry.y, t) } : { ...entry };
  });
}

export class ShadowState {
  private snapshots: FrameSnapshot[] = [];
  private lastSnapshotSeq = 0;

  accept(snapshot: FrameSnapshot): boolean {
    if (snapshot.snapshotSeq <= this.lastSnapshotSeq) return false;
    this.lastSnapshotSeq = snapshot.snapshotSeq;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 6) this.snapshots.shift();
    return true;
  }

  sample(interpolationDelayTicks = 6): FrameSnapshot | null {
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return null;
    const targetTick = latest.simTick - interpolationDelayTicks;
    let newer = latest;
    let older = this.snapshots[Math.max(0, this.snapshots.length - 2)] ?? latest;
    for (let index = 1; index < this.snapshots.length; index++) {
      if (this.snapshots[index].simTick >= targetTick) {
        older = this.snapshots[index - 1];
        newer = this.snapshots[index];
        break;
      }
    }
    const span = Math.max(1, newer.simTick - older.simTick);
    const t = Math.max(0, Math.min(1, (targetTick - older.simTick) / span));
    const olderPlayers = new Map(older.players.map((player) => [player.slot, player]));
    return {
      ...newer,
      players: newer.players.map((player) => {
        const previous = olderPlayers.get(player.slot);
        return previous
          ? { ...player, x: lerp(previous.x, player.x, t), y: lerp(previous.y, player.y, t) }
          : { ...player };
      }),
      enemies: interpolateByUid(older.enemies, newer.enemies, t),
      projectiles: interpolateByUid(older.projectiles, newer.projectiles, t),
      pickups: interpolateByUid(older.pickups, newer.pickups, t),
      areas: interpolateByUid(older.areas, newer.areas, t),
      chests: interpolateByUid(older.chests, newer.chests, t),
      explosions: interpolateByUid(older.explosions, newer.explosions, t),
      firePatches: interpolateByUid(older.firePatches, newer.firePatches, t),
    };
  }

  clear(): void {
    this.snapshots = [];
  }
}
