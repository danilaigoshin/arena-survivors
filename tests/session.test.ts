import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMeta } from '../src/core/save';
import type { GameplayEventBatch } from '../src/multiplayer/events';
import { NETWORK_VERSION } from '../src/multiplayer/types';
import { GuestSession, HostSession } from '../src/multiplayer/session';
import type { Transport } from '../src/multiplayer/transport';

type ControlCallback = (peerId: string, message: unknown) => void;
type EventCallback = (peerId: string, message: unknown) => void;
type SnapshotCallback = (peerId: string, data: ArrayBuffer) => void;
type PeerCallback = (peerId: string, state: 'joined' | 'left') => void;

class MemoryTransport implements Transport {
  readonly sentControl: { peerId: string; message: unknown }[] = [];
  private readonly controlCallbacks = new Set<ControlCallback>();
  private readonly eventCallbacks = new Set<EventCallback>();
  private readonly snapshotCallbacks = new Set<SnapshotCallback>();
  private readonly peerCallbacks = new Set<PeerCallback>();

  async sendControl(peerId: string, message: unknown): Promise<void> {
    this.sentControl.push({ peerId, message });
  }

  async sendEvents(_peerId: string, _batch: GameplayEventBatch): Promise<void> {}

  async sendSnapshot(_peerId: string, _snapshot: ArrayBuffer): Promise<void> {}

  onControl(callback: ControlCallback): () => void {
    this.controlCallbacks.add(callback);
    return () => this.controlCallbacks.delete(callback);
  }

  onEvents(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  onSnapshot(callback: SnapshotCallback): () => void {
    this.snapshotCallbacks.add(callback);
    return () => this.snapshotCallbacks.delete(callback);
  }

  onPeerState(callback: PeerCallback): () => void {
    this.peerCallbacks.add(callback);
    return () => this.peerCallbacks.delete(callback);
  }

  async close(): Promise<void> {
    this.controlCallbacks.clear();
    this.eventCallbacks.clear();
    this.snapshotCallbacks.clear();
    this.peerCallbacks.clear();
  }

  peer(peerId: string, state: 'joined' | 'left'): void {
    for (const callback of this.peerCallbacks) callback(peerId, state);
  }

  control(peerId: string, message: unknown): void {
    for (const callback of this.controlCallbacks) callback(peerId, message);
  }
}

const emptyProfile = { perkLevels: {}, unlockedIds: [] };

function createHost(transport: MemoryTransport): HostSession {
  return Reflect.construct(HostSession, [
    transport,
    'ABC123',
    'potato',
    emptyProfile,
    'normal',
  ]) as HostSession;
}

function createGuest(transport: MemoryTransport): GuestSession {
  return Reflect.construct(GuestSession, [
    transport,
    'ABC123',
    'potato',
    emptyProfile,
  ]) as GuestSession;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('network session lifecycle', () => {
  it('accepts the first valid guest and rejects gameplay from a third peer', async () => {
    const transport = new MemoryTransport();
    const session = createHost(transport);
    transport.peer('guest-1', 'joined');
    transport.control('guest-1', {
      type: 'handshake',
      version: NETWORK_VERSION,
      role: 'guest',
      characterId: 'potato',
      profile: emptyProfile,
    });
    transport.peer('guest-2', 'joined');
    transport.control('guest-2', {
      type: 'handshake',
      version: NETWORK_VERSION,
      role: 'guest',
      characterId: 'potato',
      profile: emptyProfile,
    });

    session.publishPhase({
      version: 1,
      phase: 'run',
      phaseRevision: 1,
      wave: 1,
    });
    transport.control('guest-2', {
      type: 'phase-command',
      version: NETWORK_VERSION,
      phaseRevision: 1,
      command: 'forbidden',
      ids: [],
    });
    expect(session.drainPhaseCommands()).toEqual([]);

    transport.control('guest-1', {
      type: 'phase-command',
      version: NETWORK_VERSION,
      phaseRevision: 1,
      command: 'allowed',
      ids: [],
    });
    expect(session.drainPhaseCommands()).toHaveLength(1);
    expect(transport.sentControl.some(({ peerId, message }) => (
      peerId === 'guest-2'
      && (message as { type?: string }).type === 'room-full'
    ))).toBe(true);
    await session.requestReturnToMenu();
    expect(transport.sentControl.some(({ peerId, message }) => (
      peerId === 'guest-1'
      && (message as { type?: string }).type === 'return-menu'
    ))).toBe(true);
    await session.close();
  });

  it('applies a repeated EndResult to local meta exactly once', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    });
    vi.stubGlobal('window', {
      setTimeout: () => 1,
      clearTimeout: () => {},
    });

    const transport = new MemoryTransport();
    const session = createGuest(transport);
    transport.peer('host', 'joined');
    transport.control('host', {
      type: 'handshake',
      version: NETWORK_VERSION,
      role: 'host',
      characterId: 'potato',
      profile: emptyProfile,
    });
    transport.control('host', {
      type: 'handshake-accepted',
      version: NETWORK_VERSION,
      slot: 1,
    });
    transport.control('host', {
      type: 'start',
      version: NETWORK_VERSION,
      sessionId: 'run-1',
      hostCharacterId: 'potato',
      guestCharacterId: 'potato',
      difficultyId: 'normal',
    });
    const message = {
      type: 'end-result',
      version: NETWORK_VERSION,
      result: {
        sessionId: 'run-1',
        resultId: 'result-1',
        wave: 5,
        kills: 42,
        won: true,
        difficultyId: 'normal',
        shardsEarned: 17,
        level: 4,
        characterIds: ['potato', 'potato'],
        weaponIds: ['pistol'],
        playerCount: 2,
        metrics: {
          duration: 90,
          damageDealt: [120, 80],
          damageTaken: [20, 15],
          healing: [0, 0],
          abilityUses: [2, 3],
          materialsCollected: 22,
          objectivesCompleted: 1,
          bossesKilled: 1,
          maxWeapons: [2, 2],
          weaponDamage: [{ pistol: 120 }, { pistol: 80 }],
          enemyKills: { chaser: 42 },
          evolvedWeapons: [],
          routeIds: [],
          lastDamageSource: ['', ''],
        },
      },
    };
    transport.control('host', message);
    transport.control('host', message);

    expect(loadMeta()).toMatchObject({
      shards: 312,
      stats: {
        runs: 1,
        wins: 1,
        bestWave: 5,
        bestKills: 42,
      },
    });
    expect(transport.sentControl.filter(({ message: sent }) => (
      (sent as { type?: string }).type === 'end-receipt'
    ))).toHaveLength(2);
    transport.control('host', {
      type: 'return-menu',
      version: NETWORK_VERSION,
    });
    expect(session.returnToMenuRequested).toBe(true);
    await session.close();
  });
});
