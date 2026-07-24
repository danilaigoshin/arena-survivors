import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMeta } from '../src/core/save';
import { ITEMS } from '../src/data/items';
import { Player } from '../src/entities/player';
import type { GameplayEventBatch } from '../src/multiplayer/events';
import { captureFrameSnapshot, type FrameSnapshot } from '../src/multiplayer/snapshot';
import { captureBuildState } from '../src/multiplayer/stateProtocol';
import { NETWORK_VERSION } from '../src/multiplayer/types';
import { GuestSession, HostSession } from '../src/multiplayer/session';
import type { Transport } from '../src/multiplayer/transport';
import { RunState } from '../src/state';
import type { Game } from '../src/game';

type ControlCallback = (peerId: string, message: unknown) => void;
type EventCallback = (peerId: string, message: unknown) => void;
type SnapshotCallback = (peerId: string, data: ArrayBuffer) => void;
type InputCallback = (peerId: string, data: ArrayBuffer) => void;
type PeerCallback = (peerId: string, state: 'joined' | 'left') => void;

class MemoryTransport implements Transport {
  readonly sentControl: { peerId: string; message: unknown }[] = [];
  private readonly controlCallbacks = new Set<ControlCallback>();
  private readonly eventCallbacks = new Set<EventCallback>();
  private readonly snapshotCallbacks = new Set<SnapshotCallback>();
  private readonly inputCallbacks = new Set<InputCallback>();
  private readonly peerCallbacks = new Set<PeerCallback>();

  async sendControl(peerId: string, message: unknown): Promise<void> {
    this.sentControl.push({ peerId, message });
  }

  async sendEvents(_peerId: string, _batch: GameplayEventBatch): Promise<void> {}

  async sendSnapshot(_peerId: string, _snapshot: ArrayBuffer) {
    return { sent: true, realtime: true, bufferedAmount: 0 };
  }

  async sendInput(_peerId: string, _packet: ArrayBuffer): Promise<void> {}

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

  onInput(callback: InputCallback): () => void {
    this.inputCallbacks.add(callback);
    return () => this.inputCallbacks.delete(callback);
  }

  onPeerState(callback: PeerCallback): () => void {
    this.peerCallbacks.add(callback);
    return () => this.peerCallbacks.delete(callback);
  }

  async getDiagnostics() {
    return {
      iceRttMs: 0,
      availableOutgoingBitrate: 0,
      bufferedAmount: 0,
      localCandidateType: '',
      remoteCandidateType: '',
      realtimeReady: true,
      droppedSnapshots: 0,
      droppedEvents: 0,
    };
  }

  async close(): Promise<void> {
    this.controlCallbacks.clear();
    this.eventCallbacks.clear();
    this.snapshotCallbacks.clear();
    this.inputCallbacks.clear();
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

  it('keeps the latest shop build through a host purchase and the next wave', async () => {
    vi.stubGlobal('window', {
      setTimeout: () => 1,
      clearTimeout: () => {},
    });
    const transport = new MemoryTransport();
    const session = createGuest(transport);
    const beforeShop = new RunState([new Player(0), new Player(1)]);
    beforeShop.players[1].materials = 10;
    const afterGuestPurchase = new RunState([new Player(0), new Player(1)]);
    afterGuestPurchase.players[0].materials = 10;
    afterGuestPurchase.players[1].materials = 2;
    afterGuestPurchase.players[1].addItem(ITEMS[0]);
    const afterHostPurchase = new RunState([new Player(0), new Player(1)]);
    afterHostPurchase.players[0].materials = 2;
    afterHostPurchase.players[1].materials = 2;
    afterHostPurchase.players[0].addItem(ITEMS[0]);
    afterHostPurchase.players[1].addItem(ITEMS[0]);
    const guestState = new RunState([new Player(0), new Player(1)]);
    guestState.players[1].materials = 10;
    const internals = session as unknown as {
      acceptedPeerId: string;
      sessionId: string;
      shadow: { accept(snapshot: FrameSnapshot, receivedAtMs: number): boolean };
    };
    internals.acceptedPeerId = 'host';
    internals.sessionId = 'run-1';
    internals.shadow.accept(captureFrameSnapshot(beforeShop, {
      snapshotSeq: 1,
      simTick: 10,
      ackInputTick: 0,
      buildRevision: 1,
      phaseRevision: 1,
      lastEventId: 0,
    }), performance.now());
    const offers = Array.from({ length: 4 }, (_, index) => ({
      kind: 'item' as const,
      definitionId: ITEMS[0].id,
      price: 8,
      sold: index === 0,
    }));
    const shopPhase = {
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: {
        version: 1,
        phase: 'shop',
        phaseRevision: 2,
        stateRevision: 1,
        buildRevision: 2,
        shops: [
          { offers: offers.map((offer) => ({ ...offer, sold: false })), rerollCost: 3, rerollCount: 0 },
          { offers, rerollCost: 3, rerollCount: 0 },
        ],
        ready: [false, false],
        discount: 1,
      },
    };
    transport.control('host', shopPhase);
    expect(session.phaseState).toBeNull();
    transport.control('host', {
      type: 'build-state',
      version: NETWORK_VERSION,
      build: captureBuildState(afterGuestPurchase, 2),
    });
    const game = {
      state: guestState,
      localPlayer: guestState.players[1],
      localPlayerSlot: 1,
      sessionRole: 'guest',
      scene: { wantsJoystick: false },
    } as unknown as Game;

    session.update(game, 1 / 60);

    expect(guestState.players[1].materials).toBe(2);
    expect(guestState.players[1].items.map((item) => item.id)).toEqual([ITEMS[0].id]);
    expect(session.phaseState?.phase).toBe('shop');

    transport.control('host', {
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: {
        version: 1,
        phase: 'run',
        phaseRevision: 3,
        stateRevision: 2,
        buildRevision: 3,
        wave: 2,
      },
    });
    expect(session.phaseState?.phase).toBe('shop');
    // A delayed update from the same shop phase must not replace the newer
    // run transition that is waiting for its final build.
    transport.control('host', shopPhase);
    transport.control('host', {
      type: 'build-state',
      version: NETWORK_VERSION,
      build: captureBuildState(afterHostPurchase, 3),
    });
    session.update(game, 1 / 60);
    expect(session.phaseState?.phase).toBe('run');
    expect(guestState.players[0].items.map((item) => item.id)).toEqual([ITEMS[0].id]);
    expect(guestState.players[1].items.map((item) => item.id)).toEqual([ITEMS[0].id]);

    game.scene = { wantsJoystick: true };
    session.update(game, 1 / 60);
    expect(guestState.players[1].materials).toBe(2);
    expect(guestState.players[1].items.map((item) => item.id)).toEqual([ITEMS[0].id]);
    await session.close();
  });
});
