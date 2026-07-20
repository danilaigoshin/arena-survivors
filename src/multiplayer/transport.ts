import type { Room } from 'trystero';
import type { GameplayEventBatch } from './events';
import { NETWORK_APP_ID } from './protocol';

export interface Transport {
  sendControl(peerId: string, message: unknown): Promise<void>;
  sendEvents(peerId: string, batch: GameplayEventBatch): Promise<void>;
  sendSnapshot(peerId: string, snapshot: ArrayBuffer): Promise<void>;
  onControl(cb: (peerId: string, message: unknown) => void): () => void;
  onEvents(cb: (peerId: string, message: unknown) => void): () => void;
  onSnapshot(cb: (peerId: string, data: ArrayBuffer) => void): () => void;
  onPeerState(cb: (peerId: string, state: 'joined' | 'left') => void): () => void;
  close(): Promise<void>;
}

type Callback<T extends unknown[]> = (...args: T) => void;

function subscribe<T extends unknown[]>(callbacks: Set<Callback<T>>, callback: Callback<T>): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

export function snapshotPayloadBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  // Trystero 0.25 reconstructs binary actions as Uint8Array views.
  if (!ArrayBuffer.isView(data)) return null;
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return bytes.buffer;
}

export class TrysteroTransport implements Transport {
  private readonly controlCallbacks = new Set<Callback<[string, unknown]>>();
  private readonly eventCallbacks = new Set<Callback<[string, unknown]>>();
  private readonly snapshotCallbacks = new Set<Callback<[string, ArrayBuffer]>>();
  private readonly peerCallbacks = new Set<Callback<[string, 'joined' | 'left']>>();
  private readonly control;
  private readonly events;
  private readonly snapshot;
  private closed = false;

  private constructor(private readonly room: Room) {
    this.control = room.makeAction('control');
    this.events = room.makeAction('events');
    this.snapshot = room.makeAction<ArrayBuffer | ArrayBufferView>('snapshot');
    this.control.onMessage = (message, { peerId }) => {
      for (const callback of this.controlCallbacks) callback(peerId, message);
    };
    this.events.onMessage = (message, { peerId }) => {
      for (const callback of this.eventCallbacks) callback(peerId, message);
    };
    this.snapshot.onMessage = (data, { peerId }) => {
      const buffer = snapshotPayloadBuffer(data);
      if (!buffer) return;
      for (const callback of this.snapshotCallbacks) callback(peerId, buffer);
    };
    room.onPeerJoin = (peerId) => {
      for (const callback of this.peerCallbacks) callback(peerId, 'joined');
    };
    room.onPeerLeave = (peerId) => {
      for (const callback of this.peerCallbacks) callback(peerId, 'left');
    };
  }

  static async join(roomCode: string): Promise<TrysteroTransport> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('webrtc-unsupported');
    const { joinRoom } = await import('trystero');
    const room = joinRoom({ appId: NETWORK_APP_ID }, roomCode);
    return new TrysteroTransport(room);
  }

  sendControl(peerId: string, message: unknown): Promise<void> {
    return this.control.send(message as never, { target: peerId });
  }

  sendEvents(peerId: string, batch: GameplayEventBatch): Promise<void> {
    return this.events.send(batch as never, { target: peerId });
  }

  sendSnapshot(peerId: string, snapshot: ArrayBuffer): Promise<void> {
    return this.snapshot.send(snapshot, { target: peerId });
  }

  onControl(cb: (peerId: string, message: unknown) => void): () => void {
    return subscribe(this.controlCallbacks, cb);
  }

  onEvents(cb: (peerId: string, message: unknown) => void): () => void {
    return subscribe(this.eventCallbacks, cb);
  }

  onSnapshot(cb: (peerId: string, data: ArrayBuffer) => void): () => void {
    return subscribe(this.snapshotCallbacks, cb);
  }

  onPeerState(cb: (peerId: string, state: 'joined' | 'left') => void): () => void {
    return subscribe(this.peerCallbacks, cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.control.onMessage = null;
    this.events.onMessage = null;
    this.snapshot.onMessage = null;
    this.room.onPeerJoin = null;
    this.room.onPeerLeave = null;
    this.controlCallbacks.clear();
    this.eventCallbacks.clear();
    this.snapshotCallbacks.clear();
    this.peerCallbacks.clear();
    await this.room.leave();
  }
}

export interface SnapshotSendMetrics {
  bytes: number;
  sendDurationMs: number;
  pending: boolean;
}

export class LatestSnapshotSender {
  private sending = false;
  private pending: ArrayBuffer | null = null;
  metrics: SnapshotSendMetrics = { bytes: 0, sendDurationMs: 0, pending: false };

  constructor(
    private readonly transport: Transport,
    private readonly peerId: string,
  ) {}

  enqueue(snapshot: ArrayBuffer): void {
    if (this.sending) {
      this.pending = snapshot;
      this.metrics.pending = true;
      return;
    }
    void this.flush(snapshot);
  }

  private async flush(snapshot: ArrayBuffer): Promise<void> {
    this.sending = true;
    const startedAt = performance.now();
    try {
      await this.transport.sendSnapshot(this.peerId, snapshot);
    } catch {
      // Peer departure is surfaced through onPeerState; a rejected send must
      // not create an unhandled promise while the terminal overlay is opening.
    } finally {
      this.metrics = {
        bytes: snapshot.byteLength,
        sendDurationMs: performance.now() - startedAt,
        pending: this.pending !== null,
      };
      const next = this.pending;
      this.pending = null;
      if (next) {
        await this.flush(next);
      } else {
        this.sending = false;
        this.metrics.pending = false;
      }
    }
  }
}
