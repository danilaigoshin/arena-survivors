import { describe, expect, it } from 'vitest';
import { GameplayEventJournal, GameplayEventReceiver } from '../src/multiplayer/events';
import { GuestPrediction } from '../src/multiplayer/prediction';
import type { Transport } from '../src/multiplayer/transport';
import { LatestSnapshotSender, snapshotPayloadBuffer } from '../src/multiplayer/transport';
import { Player } from '../src/entities/player';
import { RemoteInputProvider } from '../src/systems/playerMovement';
import { setPresentationEventSink } from '../src/multiplayer/presentationBus';
import { playSfx } from '../src/render/audio';

describe('network runtime helpers', () => {
  it('times out remote movement and rejects duplicate input sequences', () => {
    const remote = new RemoteInputProvider();
    expect(remote.accept({ seq: 1, moveX: 1, moveY: 0, abilityPressSeq: 1 }, 100)).toBe(true);
    expect(remote.accept({ seq: 1, moveX: -1, moveY: 0, abilityPressSeq: 2 }, 110)).toBe(false);
    expect(remote.read(349).moveX).toBe(1);
    expect(remote.read(351).moveX).toBe(0);
    expect(remote.read(351).abilityPressSeq).toBe(1);
  });

  it('replays only unacknowledged prediction samples', () => {
    const player = new Player(1);
    const prediction = new GuestPrediction();
    prediction.record({ seq: 1, moveX: 1, moveY: 0, abilityPressSeq: 0 }, 0.1);
    prediction.record({ seq: 2, moveX: 1, moveY: 0, abilityPressSeq: 0 }, 0.1);
    prediction.reconcile(player, [], { x: 100, y: 100 }, 1, 1000);
    expect(prediction.pendingInputCount).toBe(1);
    expect(player.x).toBeGreaterThan(100);
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

  it('does not evict an oversized current tick before it can be batched', () => {
    const journal = new GameplayEventJournal(2);
    for (let index = 0; index < 5; index++) {
      journal.publish(1, { type: 'sfx', sound: 'hit' });
    }
    expect(journal.batchAfter(0, 10)?.events.map((event) => event.eventId))
      .toEqual([1, 2, 3, 4, 5]);
    journal.publish(2, { type: 'sfx', sound: 'hit' });
    expect(journal.oldestEventId).toBe(5);
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
      sendSnapshot: async (_peerId, snapshot) => {
        sent.push(snapshot.byteLength);
        if (sent.length === 1) await new Promise<void>((resolve) => { release = resolve; });
      },
      onControl: () => () => {},
      onEvents: () => () => {},
      onSnapshot: () => () => {},
      onPeerState: () => () => {},
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
});
