import { describe, expect, it } from 'vitest';
import {
  compactGameplayEvents,
  GameplayEventJournal,
  GameplayEventReceiver,
} from '../src/multiplayer/events';
import { GuestPrediction } from '../src/multiplayer/prediction';
import type { Transport } from '../src/multiplayer/transport';
import {
  LatestSnapshotSender,
  TrysteroTransport,
  snapshotPayloadBuffer,
} from '../src/multiplayer/transport';
import { Player } from '../src/entities/player';
import { RemoteInputProvider } from '../src/systems/playerMovement';
import { setPresentationEventSink } from '../src/multiplayer/presentationBus';
import { playSfx } from '../src/render/audio';
import { decodeInputPacket, encodeInputPacket } from '../src/multiplayer/realtime';

describe('network runtime helpers', () => {
  it('times out remote movement and rejects duplicate input sequences', () => {
    const remote = new RemoteInputProvider();
    expect(remote.accept({
      seq: 1,
      clientTick: 1,
      snapshotSeq: 0,
      moveX: 1,
      moveY: 0,
      abilityPressSeq: 1,
    }, 100)).toBe(true);
    expect(remote.accept({
      seq: 1,
      clientTick: 1,
      snapshotSeq: 0,
      moveX: -1,
      moveY: 0,
      abilityPressSeq: 2,
    }, 110)).toBe(false);
    expect(remote.read(349).moveX).toBe(1);
    expect(remote.read(351).moveX).toBe(0);
    expect(remote.read(351).abilityPressSeq).toBe(1);
  });

  it('reconstructs a missing unreliable command from the previous state', () => {
    const remote = new RemoteInputProvider();
    remote.accept({
      seq: 1,
      clientTick: 1,
      snapshotSeq: 0,
      moveX: 1,
      moveY: 0,
      abilityPressSeq: 0,
    }, 100);
    remote.accept({
      seq: 3,
      clientTick: 3,
      snapshotSeq: 1,
      moveX: 0,
      moveY: 1,
      abilityPressSeq: 0,
    }, 110);
    expect(remote.read(120).moveX).toBe(1);
    expect(remote.read(130).moveX).toBe(1);
    expect(remote.read(140).moveY).toBe(1);
    expect(remote.lastAppliedClientTick).toBe(3);
  });

  it('replays only unacknowledged prediction samples', () => {
    const player = new Player(1);
    const prediction = new GuestPrediction();
    prediction.record({
      seq: 1,
      clientTick: 1,
      snapshotSeq: 0,
      moveX: 1,
      moveY: 0,
      abilityPressSeq: 0,
    }, 0.1);
    prediction.record({
      seq: 2,
      clientTick: 2,
      snapshotSeq: 0,
      moveX: 1,
      moveY: 0,
      abilityPressSeq: 0,
    }, 0.1);
    prediction.reconcile(player, [], { x: 100, y: 100 }, 1, 1000);
    expect(prediction.pendingInputCount).toBe(1);
    expect(player.x).toBeGreaterThan(100);
  });

  it('round-trips redundant tick inputs through the realtime binary packet', () => {
    const inputs = [1, 2, 3].map((clientTick) => ({
      seq: clientTick,
      clientTick,
      snapshotSeq: 7,
      moveX: Math.SQRT1_2,
      moveY: -Math.SQRT1_2,
      abilityPressSeq: 2,
    }));
    const decoded = decodeInputPacket(encodeInputPacket(inputs));
    expect(decoded.map((input) => input.clientTick)).toEqual([1, 2, 3]);
    expect(decoded[2].snapshotSeq).toBe(7);
    expect(decoded[2].moveX).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('rejects truncated and oversized realtime input packets', () => {
    const encoded = encodeInputPacket([{
      seq: 1,
      clientTick: 1,
      snapshotSeq: 0,
      moveX: 0,
      moveY: 0,
      abilityPressSeq: 0,
    }]);
    expect(() => decodeInputPacket(encoded.slice(0, encoded.byteLength - 1)))
      .toThrow(/unexpected input bytes/);
    const oversized = encoded.slice(0);
    new DataView(oversized).setUint8(3, 4);
    expect(() => decodeInputPacket(oversized)).toThrow(/invalid input count/);
  });

  it('deduplicates event batches and reports gaps', () => {
    const journal = new GameplayEventJournal();
    journal.publish(1, { type: 'sfx', sound: 'hit' });
    journal.publish(2, { type: 'wave', wave: 2, action: 'start' });
    const batch = journal.batchAfter(0)!;
    const receiver = new GameplayEventReceiver();
    expect(receiver.accept(batch).events).toHaveLength(2);
    expect(receiver.accept(batch).events).toHaveLength(0);
    journal.publish(3, { type: 'sfx', sound: 'hit' });
    const gapReceiver = new GameplayEventReceiver();
    const afterGap = journal.batchAfter(1)!;
    expect(gapReceiver.accept(afterGap)).toEqual({ events: [], gapAfter: 0 });
    const recovered = gapReceiver.accept(journal.batchAfter(0)!);
    expect(recovered.events.map((event) => event.eventId)).toEqual([1, 2, 3]);
    expect(gapReceiver.accept(afterGap).events).toHaveLength(0);
  });

  it('compacts repeated presentation noise while preserving critical events', () => {
    const events = [
      { eventId: 1, simTick: 1, type: 'sfx' as const, sound: 'hit' },
      { eventId: 2, simTick: 1, type: 'sfx' as const, sound: 'hit' },
      {
        eventId: 3,
        simTick: 1,
        type: 'damage' as const,
        target: 'enemy' as const,
        targetUid: 9,
        x: 10,
        y: 20,
        damage: 3,
        crit: false,
      },
      {
        eventId: 4,
        simTick: 1,
        type: 'damage' as const,
        target: 'enemy' as const,
        targetUid: 9,
        x: 10,
        y: 20,
        damage: 4,
        crit: true,
      },
      {
        eventId: 5,
        simTick: 1,
        type: 'ability' as const,
        playerSlot: 1 as const,
        abilityId: 'whirlwind',
        abilityPressSeq: 2,
      },
    ];
    const compacted = compactGameplayEvents(events);
    expect(compacted.filter((event) => event.type === 'sfx')).toHaveLength(1);
    expect(compacted.find((event) => event.type === 'damage')).toMatchObject({
      damage: 7,
      crit: true,
    });
    expect(compacted.some((event) => event.type === 'ability')).toBe(true);
  });

  it('rejects non-contiguous event IDs inside a batch', () => {
    const receiver = new GameplayEventReceiver();
    expect(receiver.accept({
      version: 1,
      firstEventId: 1,
      lastEventId: 3,
      events: [
        { eventId: 1, simTick: 1, type: 'sfx', sound: 'hit' },
        { eventId: 3, simTick: 1, type: 'sfx', sound: 'hit' },
      ],
    }).events).toEqual([]);
  });

  it('hard-caps an oversized current tick while keeping critical events', () => {
    const journal = new GameplayEventJournal(2);
    journal.publish(1, {
      type: 'ability',
      playerSlot: 1,
      abilityId: 'whirlwind',
      abilityPressSeq: 1,
    });
    for (let index = 0; index < 4; index++) {
      journal.publish(1, { type: 'sfx', sound: 'hit' });
    }
    expect(journal.batchAfter(0, 10)?.events.map((event) => event.eventId))
      .toEqual([1, 5]);
    expect(journal.oldestEventId).toBe(1);
  });

  it('keeps UI click sounds local while capturing gameplay sounds', () => {
    const sounds: string[] = [];
    setPresentationEventSink((event) => {
      if (event.type === 'sfx') sounds.push(event.sound);
    });
    try {
      playSfx('click');
      playSfx('hit');
    } finally {
      setPresentationEventSink(null);
    }
    expect(sounds).toEqual(['hit']);
  });

  it('rejects malformed event batches without throwing', () => {
    const receiver = new GameplayEventReceiver();
    expect(receiver.accept({ version: 1, firstEventId: 1, lastEventId: 1 }).events).toEqual([]);
    expect(receiver.accept({
      version: 1,
      firstEventId: 1,
      lastEventId: 1,
      events: [{
        eventId: 1,
        simTick: 1,
        type: 'fx',
        effect: 'burst',
        x: Number.NaN,
        y: 0,
        color: '#fff',
      }],
    }).events).toEqual([]);
  });

  it('normalizes Trystero typed-array snapshot payloads', () => {
    const direct = new ArrayBuffer(2);
    expect(snapshotPayloadBuffer(direct)).toBe(direct);

    const packet = new Uint8Array([99, 1, 2, 3, 99]);
    const normalized = snapshotPayloadBuffer(packet.subarray(1, 4));
    expect(normalized).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(normalized!)]).toEqual([1, 2, 3]);
    expect(snapshotPayloadBuffer({ byteLength: 3 })).toBeNull();
  });

  it('keeps only the latest pending snapshot while a send is active', async () => {
    const sent: number[] = [];
    let release: (() => void) | null = null;
    const transport: Transport = {
      sendControl: async () => {},
      sendEvents: async () => {},
      sendInput: async () => {},
      sendSnapshot: async (_peerId, snapshot) => {
        sent.push(snapshot.byteLength);
        if (sent.length === 1) await new Promise<void>((resolve) => { release = resolve; });
        return { sent: true, realtime: true, bufferedAmount: 0 };
      },
      onControl: () => () => {},
      onEvents: () => () => {},
      onSnapshot: () => () => {},
      onInput: () => () => {},
      onPeerState: () => () => {},
      getDiagnostics: async () => ({
        iceRttMs: 0,
        availableOutgoingBitrate: 0,
        bufferedAmount: 0,
        localCandidateType: '',
        remoteCandidateType: '',
        realtimeReady: true,
        droppedSnapshots: 0,
        droppedEvents: 0,
      }),
      close: async () => {},
    };
    const sender = new LatestSnapshotSender(transport, 'peer');
    sender.enqueue(new ArrayBuffer(1));
    sender.enqueue(new ArrayBuffer(2));
    sender.enqueue(new ArrayBuffer(3));
    await Promise.resolve();
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([1, 3]);
  });

  it('keeps only the latest reliable fallback input while a send is active', async () => {
    const sent: number[] = [];
    let release: (() => void) | null = null;
    const actions = new Map<string, {
      onMessage: unknown;
      send: (payload: ArrayBuffer) => Promise<void>;
    }>();
    const room = {
      makeAction(name: string) {
        const action = {
          onMessage: null,
          send: async (payload: ArrayBuffer) => {
            if (name !== 'input') return;
            sent.push(payload.byteLength);
            if (sent.length === 1) {
              await new Promise<void>((resolve) => { release = resolve; });
            }
          },
        };
        actions.set(name, action);
        return action;
      },
      getPeers: () => ({}),
      onPeerJoin: null,
      onPeerLeave: null,
      leave: async () => {},
    };
    const TransportConstructor = TrysteroTransport as unknown as {
      new (value: unknown): TrysteroTransport;
    };
    const transport = new TransportConstructor(room);
    const first = transport.sendInput('peer', new ArrayBuffer(1));
    await transport.sendInput('peer', new ArrayBuffer(2));
    await transport.sendInput('peer', new ArrayBuffer(3));
    release!();
    await first;
    expect(sent).toEqual([1, 3]);
    expect(actions.has('input')).toBe(true);
  });
});
