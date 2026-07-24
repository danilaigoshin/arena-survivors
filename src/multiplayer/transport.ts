import type { Room } from 'trystero';
import type { GameplayEventBatch } from './events';
import { NETWORK_APP_ID } from './protocol';

const SNAPSHOT_CHANNEL_ID = 101;
const INPUT_CHANNEL_ID = 102;
const EVENT_CHANNEL_ID = 103;
const SNAPSHOT_BUFFER_LIMIT = 64 * 1024;
const INPUT_BUFFER_LIMIT = 8 * 1024;
const EVENT_BUFFER_LIMIT = 32 * 1024;

export interface SnapshotSendResult {
  sent: boolean;
  realtime: boolean;
  bufferedAmount: number;
}

export interface TransportDiagnostics {
  iceRttMs: number;
  availableOutgoingBitrate: number;
  bufferedAmount: number;
  localCandidateType: string;
  remoteCandidateType: string;
  realtimeReady: boolean;
  droppedSnapshots: number;
  droppedEvents: number;
}

export interface Transport {
  sendControl(peerId: string, message: unknown): Promise<void>;
  sendEvents(peerId: string, batch: GameplayEventBatch): Promise<void>;
  sendSnapshot(peerId: string, snapshot: ArrayBuffer): Promise<SnapshotSendResult>;
  sendInput(peerId: string, packet: ArrayBuffer): Promise<void>;
  onControl(cb: (peerId: string, message: unknown) => void): () => void;
  onEvents(cb: (peerId: string, message: unknown) => void): () => void;
  onSnapshot(cb: (peerId: string, data: ArrayBuffer) => void): () => void;
  onInput(cb: (peerId: string, data: ArrayBuffer) => void): () => void;
  onPeerState(cb: (peerId: string, state: 'joined' | 'left') => void): () => void;
  getDiagnostics(peerId: string): Promise<TransportDiagnostics>;
  close(): Promise<void>;
}

type Callback<T extends unknown[]> = (...args: T) => void;

interface RealtimeChannels {
  snapshot: RTCDataChannel | null;
  input: RTCDataChannel | null;
  events: RTCDataChannel | null;
  droppedSnapshots: number;
  droppedEvents: number;
}

interface LatestFallbackState<T> {
  sending: boolean;
  pending: T | null;
}

function emptyDiagnostics(): TransportDiagnostics {
  return {
    iceRttMs: 0,
    availableOutgoingBitrate: 0,
    bufferedAmount: 0,
    localCandidateType: '',
    remoteCandidateType: '',
    realtimeReady: false,
    droppedSnapshots: 0,
    droppedEvents: 0,
  };
}

function roomConfig(): { appId: string; turnConfig?: RTCIceServer[] } {
  const urls = (import.meta.env.VITE_TURN_URLS as string | undefined)
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!urls?.length) return { appId: NETWORK_APP_ID };
  const username = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim();
  const credential = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim();
  return {
    appId: NETWORK_APP_ID,
    turnConfig: [{
      urls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    }],
  };
}

function subscribe<T extends unknown[]>(callbacks: Set<Callback<T>>, callback: Callback<T>): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

export function snapshotPayloadBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  // Reliable Trystero fallback reconstructs binary actions as Uint8Array views.
  if (!ArrayBuffer.isView(data)) return null;
  const source = data.buffer;
  if (
    source instanceof ArrayBuffer
    && data.byteOffset === 0
    && data.byteLength === source.byteLength
  ) return source;
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(new Uint8Array(source, data.byteOffset, data.byteLength));
  return bytes.buffer;
}

function channelOpen(channel: RTCDataChannel | null): channel is RTCDataChannel {
  return channel?.readyState === 'open';
}

function channelBufferedAmount(channels: RealtimeChannels): number {
  return (channels.snapshot?.bufferedAmount ?? 0)
    + (channels.input?.bufferedAmount ?? 0)
    + (channels.events?.bufferedAmount ?? 0);
}

export class TrysteroTransport implements Transport {
  private readonly controlCallbacks = new Set<Callback<[string, unknown]>>();
  private readonly eventCallbacks = new Set<Callback<[string, unknown]>>();
  private readonly snapshotCallbacks = new Set<Callback<[string, ArrayBuffer]>>();
  private readonly inputCallbacks = new Set<Callback<[string, ArrayBuffer]>>();
  private readonly peerCallbacks = new Set<Callback<[string, 'joined' | 'left']>>();
  private readonly realtime = new Map<string, RealtimeChannels>();
  private readonly fallbackEvents = new Map<string, LatestFallbackState<GameplayEventBatch>>();
  private readonly fallbackInputs = new Map<string, LatestFallbackState<ArrayBuffer>>();
  private readonly control;
  private readonly events;
  private readonly snapshot;
  private readonly input;
  private closed = false;

  private constructor(private readonly room: Room) {
    this.control = room.makeAction('control');
    this.events = room.makeAction('events');
    this.snapshot = room.makeAction<ArrayBuffer | ArrayBufferView>('snapshot');
    this.input = room.makeAction<ArrayBuffer | ArrayBufferView>('input');
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
    this.input.onMessage = (data, { peerId }) => {
      const buffer = snapshotPayloadBuffer(data);
      if (!buffer) return;
      for (const callback of this.inputCallbacks) callback(peerId, buffer);
    };
    room.onPeerJoin = (peerId) => {
      this.installRealtimeChannels(peerId);
      for (const callback of this.peerCallbacks) callback(peerId, 'joined');
    };
    room.onPeerLeave = (peerId) => {
      this.closeRealtimeChannels(peerId);
      for (const callback of this.peerCallbacks) callback(peerId, 'left');
    };
  }

  static async join(roomCode: string): Promise<TrysteroTransport> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('webrtc-unsupported');
    const { joinRoom } = await import('trystero');
    const room = joinRoom(roomConfig(), roomCode);
    return new TrysteroTransport(room);
  }

  private createRealtimeChannel(
    connection: RTCPeerConnection,
    label: string,
    id: number,
  ): RTCDataChannel {
    const channel = connection.createDataChannel(label, {
      negotiated: true,
      id,
      ordered: false,
      maxRetransmits: 0,
    });
    channel.binaryType = 'arraybuffer';
    return channel;
  }

  private installRealtimeChannels(peerId: string): void {
    if (this.realtime.has(peerId)) return;
    const connection = this.room.getPeers()[peerId];
    const channels: RealtimeChannels = {
      snapshot: null,
      input: null,
      events: null,
      droppedSnapshots: 0,
      droppedEvents: 0,
    };
    this.realtime.set(peerId, channels);
    if (!connection) return;
    try {
      channels.snapshot = this.createRealtimeChannel(
        connection,
        'arena-snapshot',
        SNAPSHOT_CHANNEL_ID,
      );
      channels.input = this.createRealtimeChannel(connection, 'arena-input', INPUT_CHANNEL_ID);
      channels.events = this.createRealtimeChannel(connection, 'arena-events', EVENT_CHANNEL_ID);
      channels.snapshot.onmessage = ({ data }) => {
        const buffer = snapshotPayloadBuffer(data);
        if (!buffer) return;
        for (const callback of this.snapshotCallbacks) callback(peerId, buffer);
      };
      channels.input.onmessage = ({ data }) => {
        const buffer = snapshotPayloadBuffer(data);
        if (!buffer) return;
        for (const callback of this.inputCallbacks) callback(peerId, buffer);
      };
      channels.events.onmessage = ({ data }) => {
        if (typeof data !== 'string' || data.length > 256 * 1024) return;
        try {
          const batch = JSON.parse(data) as unknown;
          for (const callback of this.eventCallbacks) callback(peerId, batch);
        } catch {
          // Invalid realtime presentation data is intentionally disposable.
        }
      };
    } catch {
      this.closeRealtimeChannels(peerId);
      this.realtime.set(peerId, channels);
    }
  }

  private closeRealtimeChannels(peerId: string): void {
    const channels = this.realtime.get(peerId);
    if (!channels) return;
    for (const channel of [channels.snapshot, channels.input, channels.events]) {
      if (!channel) continue;
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Closing a peer-owned channel is idempotent for session teardown.
      }
    }
    this.realtime.delete(peerId);
    this.fallbackEvents.delete(peerId);
    this.fallbackInputs.delete(peerId);
  }

  private async sendLatestFallback<T>(
    states: Map<string, LatestFallbackState<T>>,
    peerId: string,
    payload: T,
    send: (current: T) => Promise<void>,
  ): Promise<void> {
    let state = states.get(peerId);
    if (!state) {
      state = { sending: false, pending: null };
      states.set(peerId, state);
    }
    if (state.sending) {
      state.pending = payload;
      return;
    }
    state.sending = true;
    let current: T | null = payload;
    try {
      while (
        current !== null
        && !this.closed
        && states.get(peerId) === state
      ) {
        await send(current);
        current = state.pending;
        state.pending = null;
      }
    } finally {
      state.sending = false;
      state.pending = null;
    }
  }

  sendControl(peerId: string, message: unknown): Promise<void> {
    return this.control.send(message as never, { target: peerId });
  }

  async sendEvents(peerId: string, batch: GameplayEventBatch): Promise<void> {
    const channels = this.realtime.get(peerId);
    const channel = channels?.events ?? null;
    if (channels && channelOpen(channel)) {
      this.fallbackEvents.delete(peerId);
      const encoded = JSON.stringify(batch);
      if (channel.bufferedAmount + encoded.length <= EVENT_BUFFER_LIMIT) {
        channel.send(encoded);
      } else {
        channels.droppedEvents++;
      }
      return;
    }
    await this.sendLatestFallback(
      this.fallbackEvents,
      peerId,
      batch,
      (current) => this.events.send(current as never, { target: peerId }),
    );
  }

  async sendSnapshot(peerId: string, snapshot: ArrayBuffer): Promise<SnapshotSendResult> {
    const channels = this.realtime.get(peerId);
    const channel = channels?.snapshot ?? null;
    if (channels && channelOpen(channel)) {
      const bufferedAmount = channel.bufferedAmount;
      if (bufferedAmount + snapshot.byteLength > SNAPSHOT_BUFFER_LIMIT) {
        channels.droppedSnapshots++;
        return { sent: false, realtime: true, bufferedAmount };
      }
      channel.send(snapshot);
      return {
        sent: true,
        realtime: true,
        bufferedAmount: channel.bufferedAmount,
      };
    }
    await this.snapshot.send(snapshot, { target: peerId });
    return { sent: true, realtime: false, bufferedAmount: 0 };
  }

  async sendInput(peerId: string, packet: ArrayBuffer): Promise<void> {
    const channels = this.realtime.get(peerId);
    const channel = channels?.input ?? null;
    if (channelOpen(channel)) {
      this.fallbackInputs.delete(peerId);
      if (channel.bufferedAmount + packet.byteLength <= INPUT_BUFFER_LIMIT) channel.send(packet);
      return;
    }
    await this.sendLatestFallback(
      this.fallbackInputs,
      peerId,
      packet,
      (current) => this.input.send(current, { target: peerId }),
    );
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

  onInput(cb: (peerId: string, data: ArrayBuffer) => void): () => void {
    return subscribe(this.inputCallbacks, cb);
  }

  onPeerState(cb: (peerId: string, state: 'joined' | 'left') => void): () => void {
    return subscribe(this.peerCallbacks, cb);
  }

  async getDiagnostics(peerId: string): Promise<TransportDiagnostics> {
    const diagnostics = emptyDiagnostics();
    const channels = this.realtime.get(peerId);
    if (channels) {
      diagnostics.bufferedAmount = channelBufferedAmount(channels);
      diagnostics.realtimeReady = channelOpen(channels.snapshot)
        && channelOpen(channels.input)
        && channelOpen(channels.events);
      diagnostics.droppedSnapshots = channels.droppedSnapshots;
      diagnostics.droppedEvents = channels.droppedEvents;
    }
    const connection = this.room.getPeers()[peerId];
    if (!connection) return diagnostics;
    try {
      const stats = await connection.getStats();
      let selectedPair: RTCStats | null = null;
      stats.forEach((report) => {
        const candidate = report as RTCStats & {
          type: string;
          state?: string;
          nominated?: boolean;
          selected?: boolean;
        };
        if (
          candidate.type === 'candidate-pair'
          && candidate.state === 'succeeded'
          && (candidate.nominated || candidate.selected)
        ) selectedPair = candidate;
      });
      if (selectedPair) {
        const pair = selectedPair as RTCStats & {
          currentRoundTripTime?: number;
          availableOutgoingBitrate?: number;
          localCandidateId?: string;
          remoteCandidateId?: string;
        };
        diagnostics.iceRttMs = Math.max(0, (pair.currentRoundTripTime ?? 0) * 1000);
        diagnostics.availableOutgoingBitrate = Math.max(0, pair.availableOutgoingBitrate ?? 0);
        const local = pair.localCandidateId ? stats.get(pair.localCandidateId) : null;
        const remote = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null;
        diagnostics.localCandidateType = (local as { candidateType?: string } | undefined)
          ?.candidateType ?? '';
        diagnostics.remoteCandidateType = (remote as { candidateType?: string } | undefined)
          ?.candidateType ?? '';
      }
    } catch {
      // Browser stats availability varies; gameplay does not depend on it.
    }
    return diagnostics;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.control.onMessage = null;
    this.events.onMessage = null;
    this.snapshot.onMessage = null;
    this.input.onMessage = null;
    this.room.onPeerJoin = null;
    this.room.onPeerLeave = null;
    for (const peerId of [...this.realtime.keys()]) this.closeRealtimeChannels(peerId);
    this.controlCallbacks.clear();
    this.eventCallbacks.clear();
    this.snapshotCallbacks.clear();
    this.inputCallbacks.clear();
    this.peerCallbacks.clear();
    this.fallbackEvents.clear();
    this.fallbackInputs.clear();
    await this.room.leave();
  }
}

export interface SnapshotSendMetrics {
  bytes: number;
  sendDurationMs: number;
  pending: boolean;
  dropped: number;
  bufferedAmount: number;
  realtime: boolean;
}

export class LatestSnapshotSender {
  private sending = false;
  private pending: ArrayBuffer | null = null;
  metrics: SnapshotSendMetrics = {
    bytes: 0,
    sendDurationMs: 0,
    pending: false,
    dropped: 0,
    bufferedAmount: 0,
    realtime: false,
  };

  constructor(
    private readonly transport: Transport,
    private readonly peerId: string,
    private readonly onDrop: (() => void) | null = null,
  ) {}

  enqueue(snapshot: ArrayBuffer): void {
    if (this.sending) {
      this.pending = snapshot;
      this.metrics.pending = true;
      return;
    }
    void this.flush(snapshot);
  }

  get hasPendingSnapshot(): boolean {
    return this.pending !== null;
  }

  private async flush(snapshot: ArrayBuffer): Promise<void> {
    this.sending = true;
    const startedAt = performance.now();
    let result: SnapshotSendResult = {
      sent: false,
      realtime: false,
      bufferedAmount: 0,
    };
    try {
      result = await this.transport.sendSnapshot(this.peerId, snapshot) ?? {
        sent: true,
        realtime: false,
        bufferedAmount: 0,
      };
    } catch {
      // Peer departure is surfaced through onPeerState; a rejected send must
      // not create an unhandled promise while the terminal overlay is opening.
    } finally {
      if (!result.sent) this.onDrop?.();
      this.metrics = {
        bytes: snapshot.byteLength,
        sendDurationMs: performance.now() - startedAt,
        pending: this.pending !== null,
        dropped: this.metrics.dropped + (result.sent ? 0 : 1),
        bufferedAmount: result.bufferedAmount,
        realtime: result.realtime,
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
