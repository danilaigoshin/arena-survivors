import type { Game } from '../game';
import { StaticPlayerProfile } from '../core/playerProfile';
import { addShards, recordRun, type ProgressionGain } from '../core/save';
import { CHARACTERS } from '../data/characters';
import { DIFFICULTIES } from '../data/difficulty';
import { applyPlayerMovement } from '../systems/playerMovement';
import {
  createSessionId,
  generateRoomCode,
  parseControlMessage,
  type ControlMessage,
  type EndResult,
  type HandshakeMessage,
  type LobbyStateMessage,
  type PhaseCommandMessage,
  type StartMessage,
} from './protocol';
import {
  compactGameplayEvents,
  GameplayEventJournal,
  GameplayEventReceiver,
  type GameplayEvent,
  type GameplayEventBatch,
} from './events';
import { GuestPrediction } from './prediction';
import {
  ShadowState,
  applyShadowSampleToRunState,
  buildDeltaSnapshot,
  captureFrameSnapshot,
  decodeFrameSnapshot,
  encodeFrameSnapshot,
  materializeSnapshot,
  type FrameSnapshot,
} from './snapshot';
import { applyBuildState, captureBuildState, type BuildState, type PhaseState } from './stateProtocol';
import { LatestSnapshotSender, TrysteroTransport, type Transport } from './transport';
import {
  NETWORK_VERSION,
  type NetworkInput,
  type SerializedPlayerProfile,
  type SessionRole,
} from './types';
import { setPresentationEventSink, withoutPresentationCapture } from './presentationBus';
import { replayGameplayEvent } from './eventReplay';
import { decodeInputPacket, encodeInputPacket, INPUT_REDUNDANCY } from './realtime';
import { playAbilityPresentation } from '../render/abilityPresentation';

export type SessionStatus =
  | 'loading'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'room-full'
  | 'version-mismatch'
  | 'timeout'
  | 'connection-lost'
  | 'closed'
  | 'webrtc-unsupported'
  | 'error';

export interface NetworkMetrics {
  rtt: number;
  iceRtt: number;
  availableOutgoingBitrate: number;
  bufferedAmount: number;
  realtimeReady: boolean;
  candidateRoute: string;
  snapshotBytes: number;
  snapshotBytesPerSecond: number;
  snapshotRate: number;
  snapshotJitter: number;
  snapshotDecodeMs: number;
  snapshotApplyMs: number;
  snapshotSendMs: number;
  snapshotPending: boolean;
  droppedSnapshots: number;
  droppedEvents: number;
  interpolationAge: number;
  predictionCorrection: number;
  lastInputSeq: number;
  lastInputTick: number;
  lastEventId: number;
  buildRevision: number;
  phaseRevision: number;
}

export interface LobbyMember {
  characterId: string;
  profile: SerializedPlayerProfile;
  ready: boolean;
}

type WithoutCausalRevisions<T> = T extends PhaseState
  ? Omit<T, 'stateRevision' | 'buildRevision'>
  : never;
type PublishablePhaseState = WithoutCausalRevisions<PhaseState>;

export interface NetworkSession {
  readonly role: Exclude<SessionRole, 'solo'>;
  status: SessionStatus;
  readonly metrics: NetworkMetrics;
  update(game: Game, dt: number): void;
  handleVisibility(game: Game, hidden: boolean): void;
  beginPresentationCapture(enabled: boolean): void;
  endPresentationCapture(): void;
  close(): Promise<void>;
  onChange(callback: () => void): () => void;
}

const emptyMetrics = (): NetworkMetrics => ({
  rtt: 0,
  iceRtt: 0,
  availableOutgoingBitrate: 0,
  bufferedAmount: 0,
  realtimeReady: false,
  candidateRoute: '',
  snapshotBytes: 0,
  snapshotBytesPerSecond: 0,
  snapshotRate: 0,
  snapshotJitter: 0,
  snapshotDecodeMs: 0,
  snapshotApplyMs: 0,
  snapshotSendMs: 0,
  snapshotPending: false,
  droppedSnapshots: 0,
  droppedEvents: 0,
  interpolationAge: 0,
  predictionCorrection: 0,
  lastInputSeq: 0,
  lastInputTick: 0,
  lastEventId: 0,
  buildRevision: 0,
  phaseRevision: 0,
});

abstract class BaseSession implements NetworkSession {
  abstract readonly role: 'host' | 'guest';
  status: SessionStatus = 'loading';
  metrics = emptyMetrics();
  protected acceptedPeerId: string | null = null;
  protected readonly listeners = new Set<() => void>();
  protected readonly cleanups: (() => void)[] = [];
  protected closed = false;
  private lastPingAt = 0;
  private lastTransportStatsAt = 0;
  private transportStatsPending = false;

  constructor(protected readonly transport: Transport) {}

  abstract update(game: Game, dt: number): void;
  abstract handleVisibility(game: Game, hidden: boolean): void;

  beginPresentationCapture(_enabled: boolean): void {}

  endPresentationCapture(): void {}

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  protected changed(): void {
    for (const listener of this.listeners) listener();
  }

  protected setStatus(status: SessionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.changed();
  }

  protected ignoreTransportFailure(operation: Promise<unknown>): void {
    void operation.catch(() => {
      // Peer departure is reported by onPeerState; fire-and-forget sends must
      // not surface as unhandled promise rejections while scenes are closing.
    });
  }

  protected installCommonControl(handler: (peerId: string, message: ControlMessage) => void): void {
    this.cleanups.push(this.transport.onControl((peerId, rawMessage) => {
      const rawRecord = rawMessage !== null && typeof rawMessage === 'object'
        ? rawMessage as { type?: unknown; version?: unknown }
        : null;
      const rawVersion = rawRecord?.version;
      if (typeof rawVersion === 'number' && rawVersion !== NETWORK_VERSION) {
        if (rawRecord?.type === 'version-mismatch') {
          const mismatch = parseControlMessage(rawMessage);
          if (mismatch) handler(peerId, mismatch);
          return;
        }
        this.ignoreTransportFailure(this.transport.sendControl(peerId, {
          type: 'version-mismatch',
          version: NETWORK_VERSION,
          expectedVersion: NETWORK_VERSION,
        }));
        return;
      }
      const message = parseControlMessage(rawMessage);
      if (message) handler(peerId, message);
    }));
  }

  protected updatePing(nowMs: number): void {
    if (this.status !== 'connected' || !this.acceptedPeerId) return;
    if (nowMs - this.lastPingAt >= 1000) {
      this.lastPingAt = nowMs;
      this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
        type: 'ping',
        version: NETWORK_VERSION,
        sentAt: nowMs,
      }));
    }
    if (
      !this.transportStatsPending
      && nowMs - this.lastTransportStatsAt >= 1000
    ) {
      this.lastTransportStatsAt = nowMs;
      this.transportStatsPending = true;
      void this.transport.getDiagnostics(this.acceptedPeerId)
        .then((diagnostics) => {
          if (this.closed) return;
          this.metrics.iceRtt = diagnostics.iceRttMs;
          this.metrics.availableOutgoingBitrate = diagnostics.availableOutgoingBitrate;
          this.metrics.bufferedAmount = diagnostics.bufferedAmount;
          this.metrics.realtimeReady = diagnostics.realtimeReady;
          this.metrics.candidateRoute = [
            diagnostics.localCandidateType,
            diagnostics.remoteCandidateType,
          ].filter(Boolean).join('→');
          this.metrics.droppedSnapshots = Math.max(
            this.metrics.droppedSnapshots,
            diagnostics.droppedSnapshots,
          );
          this.metrics.droppedEvents = Math.max(
            this.metrics.droppedEvents,
            diagnostics.droppedEvents,
          );
        })
        .catch(() => {})
        .finally(() => {
          this.transportStatsPending = false;
        });
    }
  }

  protected handlePing(peerId: string, message: ControlMessage): boolean {
    if (peerId !== this.acceptedPeerId) return true;
    if (message.type === 'ping') {
      this.ignoreTransportFailure(this.transport.sendControl(peerId, { ...message, type: 'pong' }));
      return true;
    }
    if (message.type === 'pong') {
      this.metrics.rtt = Math.max(0, performance.now() - message.sentAt);
      return true;
    }
    return false;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    setPresentationEventSink(null);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    try {
      await this.transport.close();
    } catch {
      // Closing an already-departed WebRTC peer is still a completed teardown.
    }
    this.setStatus('closed');
  }
}

export class HostSession extends BaseSession {
  readonly role = 'host' as const;
  readonly roomCode: string;
  host: LobbyMember;
  guest: LobbyMember | null = null;
  difficultyId: string;
  sessionId: string | null = null;
  private snapshotSender: LatestSnapshotSender | null = null;
  private simTick = 0;
  private snapshotSeq = 0;
  private running = false;
  private buildRevision = 1;
  private phaseRevision = 0;
  private phaseStateRevision = 0;
  private readonly pendingPhaseCommands: PhaseCommandMessage[] = [];
  pausedByVisibility = false;
  private readonly eventJournal = new GameplayEventJournal();
  private lastPublishedEventId = 0;
  private currentPhaseState: PhaseState | null = null;
  private snapshotWindowStartedAt = 0;
  private snapshotWindowBytes = 0;
  private snapshotWindowCount = 0;
  private previousSnapshot: FrameSnapshot | null = null;
  private forceKeyframe = true;
  private snapshotIntervalTicks = 3;
  private lastSnapshotAtTick = 0;

  private constructor(
    transport: Transport,
    roomCode: string,
    characterId: string,
    profile: SerializedPlayerProfile,
    difficultyId: string,
  ) {
    super(transport);
    this.roomCode = roomCode;
    this.host = { characterId, profile, ready: false };
    this.difficultyId = difficultyId;
    this.setStatus('waiting');
    this.install();
  }

  static async create(
    characterId: string,
    profile: SerializedPlayerProfile,
    difficultyId: string,
  ): Promise<HostSession> {
    const roomCode = generateRoomCode();
    const transport = await TrysteroTransport.join(roomCode);
    return new HostSession(transport, roomCode, characterId, profile, difficultyId);
  }

  private install(): void {
    this.cleanups.push(this.transport.onPeerState((peerId, state) => {
      if (state === 'joined') {
        if (this.acceptedPeerId && peerId !== this.acceptedPeerId) {
          this.ignoreTransportFailure(
            this.transport.sendControl(peerId, { type: 'room-full', version: NETWORK_VERSION }),
          );
          return;
        }
        this.setStatus('connecting');
        this.ignoreTransportFailure(this.sendHandshake(peerId));
      } else if (peerId === this.acceptedPeerId) {
        this.setStatus('connection-lost');
      }
    }));
    this.installCommonControl((peerId, message) => this.onControl(peerId, message));
    this.cleanups.push(this.transport.onInput((peerId, data) => {
      if (peerId !== this.acceptedPeerId) return;
      try {
        this.queueInputs(decodeInputPacket(data));
      } catch {
        // Malformed realtime inputs never reach the authoritative provider.
      }
    }));
  }

  private sendHandshake(peerId: string): Promise<void> {
    return this.transport.sendControl(peerId, {
      type: 'handshake',
      version: NETWORK_VERSION,
      role: 'host',
      characterId: this.host.characterId,
      profile: this.host.profile,
    } satisfies HandshakeMessage);
  }

  private onControl(peerId: string, message: ControlMessage): void {
    if (message.type === 'version-mismatch') {
      if (!this.acceptedPeerId || peerId === this.acceptedPeerId) this.setStatus('version-mismatch');
      return;
    }
    if (message.type === 'handshake') {
      if (message.role !== 'guest') return;
      if (this.acceptedPeerId && peerId !== this.acceptedPeerId) {
        this.ignoreTransportFailure(
          this.transport.sendControl(peerId, { type: 'room-full', version: NETWORK_VERSION }),
        );
        return;
      }
      if (!this.acceptedPeerId) {
        this.acceptedPeerId = peerId;
        this.snapshotSender = new LatestSnapshotSender(
          this.transport,
          peerId,
          () => { this.forceKeyframe = true; },
        );
      }
      this.guest = { characterId: message.characterId, profile: message.profile, ready: false };
      this.setStatus('connected');
      this.ignoreTransportFailure(this.transport.sendControl(peerId, {
        type: 'handshake-accepted',
        version: NETWORK_VERSION,
        slot: 1,
      }));
      this.ignoreTransportFailure(this.broadcastLobbyState());
      return;
    }
    if (peerId !== this.acceptedPeerId) return;
    if (this.handlePing(peerId, message)) return;
    if (message.type === 'lobby-ready' && this.guest) {
      this.guest.ready = message.ready;
      this.ignoreTransportFailure(this.broadcastLobbyState());
      this.changed();
    } else if (message.type === 'input') {
      // Compatibility fallback for browsers that could not open the
      // negotiated realtime input channel.
      this.queueInputs([message.input]);
    } else if (message.type === 'phase-command') {
      if (
        !this.currentPhaseState
        || message.phaseRevision !== this.currentPhaseState.phaseRevision
      ) {
        this.resendPhase();
        return;
      }
      if (this.pendingPhaseCommands.length < 64) this.pendingPhaseCommands.push(message);
      else this.resendPhase();
    } else if (message.type === 'resync-request') {
      let afterEventId = message.afterEventId;
      for (;;) {
        const batch = this.eventJournal.batchAfter(afterEventId, 512);
        if (!batch) break;
        this.publishEvents(batch);
        afterEventId = batch.lastEventId;
      }
    } else if (message.type === 'snapshot-resync') {
      this.forceKeyframe = true;
    }
  }

  private readonly pendingInputs: NetworkInput[] = [];

  private queueInputs(inputs: readonly NetworkInput[]): void {
    this.pendingInputs.push(...inputs);
    if (this.pendingInputs.length > 180) {
      this.pendingInputs.splice(0, this.pendingInputs.length - 180);
    }
  }

  private lobbyState(): LobbyStateMessage | null {
    if (!this.guest) return null;
    return {
      type: 'lobby-state',
      version: NETWORK_VERSION,
      hostCharacterId: this.host.characterId,
      guestCharacterId: this.guest.characterId,
      hostReady: this.host.ready,
      guestReady: this.guest.ready,
      difficultyId: this.difficultyId,
    };
  }

  private async broadcastLobbyState(): Promise<void> {
    const state = this.lobbyState();
    if (state && this.acceptedPeerId) await this.transport.sendControl(this.acceptedPeerId, state);
  }

  setHostSelection(characterId: string, difficultyId = this.difficultyId): void {
    this.host.characterId = characterId;
    this.host.ready = false;
    this.difficultyId = difficultyId;
    this.ignoreTransportFailure(this.broadcastLobbyState());
    this.changed();
  }

  setReady(ready: boolean): void {
    this.host.ready = ready;
    this.ignoreTransportFailure(this.broadcastLobbyState());
    this.changed();
  }

  canStart(): boolean {
    return !!this.guest && this.host.ready && this.guest.ready && this.status === 'connected';
  }

  async startRun(game: Game): Promise<boolean> {
    if (!this.canStart() || !this.guest || !this.acceptedPeerId) return false;
    const hostCharacter = CHARACTERS.find((character) => character.id === this.host.characterId);
    const guestCharacter = CHARACTERS.find((character) => character.id === this.guest!.characterId);
    const difficulty = DIFFICULTIES.find((entry) => entry.id === this.difficultyId);
    if (!hostCharacter || !guestCharacter || !difficulty) return false;
    game.sessionRole = 'host';
    game.localPlayerSlot = 0;
    game.newRunSquad(
      [hostCharacter, guestCharacter],
      [new StaticPlayerProfile(this.host.profile), new StaticPlayerProfile(this.guest.profile)],
    );
    game.state.difficulty = difficulty;
    game.remoteInput.reset();
    this.pendingInputs.length = 0;
    this.pendingPhaseCommands.length = 0;
    this.previousSnapshot = null;
    this.forceKeyframe = true;
    this.snapshotIntervalTicks = 3;
    this.lastSnapshotAtTick = 0;
    this.running = true;
    this.sessionId = createSessionId();
    const start: StartMessage = {
      type: 'start',
      version: NETWORK_VERSION,
      sessionId: this.sessionId,
      hostCharacterId: hostCharacter.id,
      guestCharacterId: guestCharacter.id,
      difficultyId: difficulty.id,
    };
    await this.transport.sendControl(this.acceptedPeerId, start);
    await this.transport.sendControl(this.acceptedPeerId, {
      type: 'build-state',
      version: NETWORK_VERSION,
      build: captureBuildState(game.state, this.buildRevision),
    });
    this.metrics.buildRevision = this.buildRevision;
    this.publishPhase({
      version: 1,
      phase: 'run',
      phaseRevision: this.nextPhaseRevision(),
      wave: game.state.wave,
    });
    return true;
  }

  async restartRun(game: Game): Promise<boolean> {
    if (!this.guest || !this.acceptedPeerId || this.status !== 'connected') return false;
    const hostCharacter = CHARACTERS.find((character) => character.id === this.host.characterId);
    const guestCharacter = CHARACTERS.find((character) => character.id === this.guest!.characterId);
    const difficulty = DIFFICULTIES.find((entry) => entry.id === this.difficultyId);
    if (!hostCharacter || !guestCharacter || !difficulty) return false;
    game.sessionRole = 'host';
    game.localPlayerSlot = 0;
    game.newRunSquad(
      [hostCharacter, guestCharacter],
      [new StaticPlayerProfile(this.host.profile), new StaticPlayerProfile(this.guest.profile)],
    );
    game.state.difficulty = difficulty;
    game.remoteInput.reset();
    this.pendingInputs.length = 0;
    this.pendingPhaseCommands.length = 0;
    this.previousSnapshot = null;
    this.forceKeyframe = true;
    this.snapshotIntervalTicks = 3;
    this.lastSnapshotAtTick = 0;
    this.running = true;
    this.buildRevision++;
    this.sessionId = createSessionId();
    await this.transport.sendControl(this.acceptedPeerId, {
      type: 'start',
      version: NETWORK_VERSION,
      sessionId: this.sessionId,
      hostCharacterId: hostCharacter.id,
      guestCharacterId: guestCharacter.id,
      difficultyId: difficulty.id,
    });
    await this.transport.sendControl(this.acceptedPeerId, {
      type: 'build-state',
      version: NETWORK_VERSION,
      build: captureBuildState(game.state, this.buildRevision),
    });
    this.metrics.buildRevision = this.buildRevision;
    this.publishRunPhase(game.state.wave);
    return true;
  }

  nextPhaseRevision(): number {
    return ++this.phaseRevision;
  }

  drainPhaseCommands(): PhaseCommandMessage[] {
    return this.pendingPhaseCommands.splice(0);
  }

  publishBuild(game: Game): void {
    if (!this.acceptedPeerId) return;
    this.buildRevision++;
    this.metrics.buildRevision = this.buildRevision;
    this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
      type: 'build-state',
      version: NETWORK_VERSION,
      build: captureBuildState(game.state, this.buildRevision),
    }));
  }

  publishPhase(state: PublishablePhaseState): void {
    const phaseChanged = !this.currentPhaseState
      || this.currentPhaseState.phase !== state.phase
      || this.currentPhaseState.phaseRevision !== state.phaseRevision;
    if (phaseChanged) {
      // A snapshot from the previous interactive phase must never become the
      // first authoritative frame after a menu/choice transition.
      this.previousSnapshot = null;
      this.forceKeyframe = true;
    }
    const published = {
      ...state,
      stateRevision: ++this.phaseStateRevision,
      buildRevision: this.buildRevision,
    } as PhaseState;
    this.currentPhaseState = published;
    this.phaseRevision = published.phaseRevision;
    this.metrics.phaseRevision = published.phaseRevision;
    if (!this.acceptedPeerId) return;
    this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: published,
    }));
  }

  resendPhase(): void {
    if (this.currentPhaseState) this.publishPhase(this.currentPhaseState);
  }

  publishEvents(batch: GameplayEventBatch): void {
    if (this.acceptedPeerId) {
      this.ignoreTransportFailure(this.transport.sendEvents(this.acceptedPeerId, batch));
    }
  }

  override beginPresentationCapture(enabled: boolean): void {
    setPresentationEventSink(enabled
      ? (event) => {
        this.eventJournal.publish(this.simTick, event);
      }
      : null);
  }

  override endPresentationCapture(): void {
    setPresentationEventSink(null);
  }

  handleVisibility(game: Game, hidden: boolean): void {
    if (
      !hidden
      || !this.running
      || this.status !== 'connected'
      || game.scene.wantsJoystick !== true
    ) return;
    this.pausedByVisibility = true;
    this.publishPhase({
      version: 1,
      phase: 'paused',
      phaseRevision: this.nextPhaseRevision(),
      reason: 'hidden',
    });
    game.remoteInput.reset();
  }

  publishRunPhase(wave: number): void {
    this.running = true;
    this.pausedByVisibility = false;
    this.publishPhase({
      version: 1,
      phase: 'run',
      phaseRevision: this.nextPhaseRevision(),
      wave,
    });
  }

  async publishEnd(result: EndResult): Promise<void> {
    this.running = false;
    if (this.acceptedPeerId) {
      await this.transport.sendControl(this.acceptedPeerId, {
        type: 'end-result',
        version: NETWORK_VERSION,
        result,
      });
    }
  }

  async requestReturnToMenu(): Promise<void> {
    this.running = false;
    if (!this.acceptedPeerId) return;
    await this.transport.sendControl(this.acceptedPeerId, {
      type: 'return-menu',
      version: NETWORK_VERSION,
    });
  }

  update(game: Game, _dt: number): void {
    const now = performance.now();
    this.updatePing(now);
    for (let index = 0; index < this.pendingInputs.length; index++) {
      game.remoteInput.accept(this.pendingInputs[index], now);
    }
    this.pendingInputs.length = 0;
    if (
      !this.running
      || !this.snapshotSender
      || this.status !== 'connected'
      || game.scene.wantsJoystick !== true
    ) return;
    this.simTick++;
    const bitrateConstrained = this.metrics.availableOutgoingBitrate > 0
      && this.metrics.snapshotBytesPerSecond * 8
        > this.metrics.availableOutgoingBitrate * 0.65;
    const congested = bitrateConstrained
      || this.snapshotSender.metrics.pending
      || this.snapshotSender.metrics.bufferedAmount > 32 * 1024;
    if (congested) this.snapshotIntervalTicks = Math.min(6, this.snapshotIntervalTicks + 1);
    else if (this.snapshotSender.metrics.bufferedAmount < 8 * 1024) {
      this.snapshotIntervalTicks = Math.max(3, this.snapshotIntervalTicks - 1);
    }
    if (this.simTick - this.lastSnapshotAtTick < this.snapshotIntervalTicks) return;
    this.lastSnapshotAtTick = this.simTick;
    const rawBatch = this.eventJournal.batchAfter(this.lastPublishedEventId, 512);
    if (rawBatch) {
      this.lastPublishedEventId = rawBatch.lastEventId;
      this.metrics.lastEventId = rawBatch.lastEventId;
      const events = compactGameplayEvents(rawBatch.events);
      if (events.length > 0) {
        this.publishEvents({
          version: 1,
          firstEventId: events[0].eventId,
          lastEventId: events[events.length - 1].eventId,
          events,
        });
      }
    }
    const guestPlayer = game.state.playerBySlot(1);
    const frame = captureFrameSnapshot(game.state, {
      snapshotSeq: ++this.snapshotSeq,
      simTick: this.simTick,
      ackInputTick: game.remoteInput.lastAppliedClientTick,
      buildRevision: this.buildRevision,
      phaseRevision: this.phaseRevision,
      lastEventId: this.metrics.lastEventId,
    }, guestPlayer ? { focusX: guestPlayer.x, focusY: guestPlayer.y } : undefined);
    const mustKeyframe = this.forceKeyframe
      || !this.previousSnapshot
      || this.snapshotSeq % 10 === 1
      || this.snapshotSender.hasPendingSnapshot;
    const packet = mustKeyframe || !this.previousSnapshot
      ? frame
      : buildDeltaSnapshot(this.previousSnapshot, frame);
    this.forceKeyframe = false;
    this.previousSnapshot = frame;
    const encoded = encodeFrameSnapshot(packet);
    this.snapshotSender.enqueue(encoded);
    if (this.snapshotWindowStartedAt === 0) this.snapshotWindowStartedAt = now;
    this.snapshotWindowBytes += encoded.byteLength;
    this.snapshotWindowCount++;
    const windowDuration = now - this.snapshotWindowStartedAt;
    if (windowDuration >= 1000) {
      this.metrics.snapshotBytesPerSecond = this.snapshotWindowBytes * 1000 / windowDuration;
      this.metrics.snapshotRate = this.snapshotWindowCount * 1000 / windowDuration;
      this.snapshotWindowStartedAt = now;
      this.snapshotWindowBytes = 0;
      this.snapshotWindowCount = 0;
    }
    this.metrics.snapshotBytes = this.snapshotSender.metrics.bytes;
    this.metrics.snapshotSendMs = this.snapshotSender.metrics.sendDurationMs;
    this.metrics.snapshotPending = this.snapshotSender.metrics.pending;
    this.metrics.droppedSnapshots = Math.max(
      this.metrics.droppedSnapshots,
      this.snapshotSender.metrics.dropped,
    );
    this.metrics.bufferedAmount = Math.max(
      this.metrics.bufferedAmount,
      this.snapshotSender.metrics.bufferedAmount,
    );
    this.metrics.lastInputSeq = game.remoteInput.lastSequence;
    this.metrics.lastInputTick = game.remoteInput.lastAppliedClientTick;
  }
}

interface PredictedAbilityState {
  inputTick: number;
  abilityPressSeq: number;
  startedAtMs: number;
  duration: number;
  cooldown: number;
  abilityX: number;
  abilityY: number;
  abilityPower: number;
}

export class GuestSession extends BaseSession {
  readonly role = 'guest' as const;
  readonly roomCode: string;
  guest: LobbyMember;
  host: LobbyMember | null = null;
  lobbyState: LobbyStateMessage | null = null;
  phaseState: PhaseState | null = null;
  private readonly shadow = new ShadowState();
  private readonly prediction = new GuestPrediction();
  private readonly eventReceiver = new GameplayEventReceiver(true);
  private readonly pendingGameplayEvents: GameplayEvent[] = [];
  private readonly pendingSnapshots: FrameSnapshot[] = [];
  private wireSnapshot: FrameSnapshot | null = null;
  private lastSnapshotResyncAt = -Infinity;
  private lastSnapshotReceivedAt = 0;
  private snapshotWindowStartedAt = 0;
  private snapshotWindowBytes = 0;
  private snapshotWindowCount = 0;
  private pendingBuild: BuildState | null = null;
  private lastAppliedBuildRevision = 0;
  private pendingPhaseState: PhaseState | null = null;
  private lastReceivedPhaseStateRevision = 0;
  private snapshotPhaseFloor = 0;
  private pendingStart: StartMessage | null = null;
  private inputSeq = 0;
  private clientTick = 0;
  private lastInput: NetworkInput = {
    seq: 0,
    clientTick: 0,
    snapshotSeq: 0,
    moveX: 0,
    moveY: 0,
    abilityPressSeq: 0,
  };
  private readonly inputHistory: NetworkInput[] = [];
  private predictedBase: { x: number; y: number } | null = null;
  private predictedAbility: PredictedAbilityState | null = null;
  private lastAbilityAttemptSeq = 0;
  private predictedAbilityPressSeq = 0;
  private timeout: number | null = null;
  private readonly appliedResults = new Set<string>();
  lastEndResult: EndResult | null = null;
  lastProgressionGain: ProgressionGain | null = null;
  private sessionId: string | null = null;
  returnToMenuRequested = false;
  onStarted: (() => void) | null = null;
  onGameplayEvents: ((events: GameplayEvent[]) => void) | null = null;

  private constructor(
    transport: Transport,
    roomCode: string,
    characterId: string,
    profile: SerializedPlayerProfile,
  ) {
    super(transport);
    this.roomCode = roomCode;
    this.guest = { characterId, profile, ready: false };
    this.setStatus('waiting');
    this.install();
  }

  static async join(
    roomCode: string,
    characterId: string,
    profile: SerializedPlayerProfile,
  ): Promise<GuestSession> {
    const transport = await TrysteroTransport.join(roomCode);
    return new GuestSession(transport, roomCode, characterId, profile);
  }

  private install(): void {
    this.timeout = window.setTimeout(() => {
      if (!this.acceptedPeerId) this.setStatus('timeout');
    }, 30_000);
    this.cleanups.push(() => {
      if (this.timeout !== null) window.clearTimeout(this.timeout);
    });
    this.cleanups.push(this.transport.onPeerState((peerId, state) => {
      if (state === 'joined') {
        if (this.acceptedPeerId && peerId !== this.acceptedPeerId) return;
        this.setStatus('connecting');
        this.ignoreTransportFailure(this.transport.sendControl(peerId, {
          type: 'handshake',
          version: NETWORK_VERSION,
          role: 'guest',
          characterId: this.guest.characterId,
          profile: this.guest.profile,
        } satisfies HandshakeMessage));
      } else if (peerId === this.acceptedPeerId) {
        this.setStatus('connection-lost');
        this.prediction.clear();
        this.predictedBase = null;
      }
    }));
    this.installCommonControl((peerId, message) => this.onControl(peerId, message));
    this.cleanups.push(this.transport.onSnapshot((peerId, data) => {
      if (peerId !== this.acceptedPeerId) return;
      const decodeStartedAt = performance.now();
      try {
        const packet = decodeFrameSnapshot(data);
        const receivedAt = performance.now();
        if (packet.phaseRevision <= this.snapshotPhaseFloor) return;
        if (
          this.wireSnapshot
          && packet.snapshotSeq <= this.wireSnapshot.snapshotSeq
        ) return;
        const snapshot = materializeSnapshot(packet, this.wireSnapshot);
        if (!snapshot) {
          if (
            this.acceptedPeerId
            && receivedAt - this.lastSnapshotResyncAt >= 250
          ) {
            this.lastSnapshotResyncAt = receivedAt;
            this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
              type: 'snapshot-resync',
              version: NETWORK_VERSION,
              afterSnapshotSeq: this.wireSnapshot?.snapshotSeq ?? 0,
            }));
          }
          return;
        }
        if (this.shadow.accept(snapshot, receivedAt)) {
          this.wireSnapshot = snapshot;
          this.metrics.snapshotBytes = data.byteLength;
          const decodeMs = receivedAt - decodeStartedAt;
          this.metrics.snapshotDecodeMs += (decodeMs - this.metrics.snapshotDecodeMs) * 0.2;
          this.metrics.snapshotJitter = this.shadow.arrivalJitterMs;
          this.lastSnapshotReceivedAt = receivedAt;
          this.pendingSnapshots[0] = snapshot;
          this.pendingSnapshots.length = 1;
          if (this.snapshotWindowStartedAt === 0) this.snapshotWindowStartedAt = receivedAt;
          this.snapshotWindowBytes += data.byteLength;
          this.snapshotWindowCount++;
          const windowDuration = receivedAt - this.snapshotWindowStartedAt;
          if (windowDuration >= 1000) {
            this.metrics.snapshotBytesPerSecond = this.snapshotWindowBytes * 1000 / windowDuration;
            this.metrics.snapshotRate = this.snapshotWindowCount * 1000 / windowDuration;
            this.snapshotWindowStartedAt = receivedAt;
            this.snapshotWindowBytes = 0;
            this.snapshotWindowCount = 0;
          }
        }
      } catch {
        // Invalid binary input never reaches the shadow world.
      }
    }));
    this.cleanups.push(this.transport.onEvents((peerId, rawBatch) => {
      if (peerId !== this.acceptedPeerId || !rawBatch || typeof rawBatch !== 'object') return;
      const result = this.eventReceiver.accept(rawBatch as GameplayEventBatch);
      if (result.events.length > 0) {
        this.pendingGameplayEvents.push(...result.events);
        if (this.pendingGameplayEvents.length > 512) {
          this.pendingGameplayEvents.splice(0, this.pendingGameplayEvents.length - 512);
        }
      }
    }));
  }

  private activatePhaseState(state: PhaseState): void {
    this.pendingPhaseState = null;
    this.phaseState = state;
    this.metrics.phaseRevision = state.phaseRevision;
    this.changed();
  }

  private activatePendingPhaseState(): void {
    const state = this.pendingPhaseState;
    if (!state || state.buildRevision > this.lastAppliedBuildRevision) return;
    this.activatePhaseState(state);
  }

  private suspendCombatSnapshots(phaseRevision: number): void {
    if (phaseRevision <= this.snapshotPhaseFloor) return;
    this.snapshotPhaseFloor = phaseRevision;
    this.shadow.clear();
    this.pendingSnapshots.length = 0;
    this.wireSnapshot = null;
    this.lastSnapshotReceivedAt = 0;
  }

  private onControl(peerId: string, message: ControlMessage): void {
    if (message.type === 'room-full') {
      this.setStatus('room-full');
      return;
    }
    if (message.type === 'version-mismatch') {
      this.setStatus('version-mismatch');
      return;
    }
    if (message.type === 'handshake' && message.role === 'host') {
      this.host = { characterId: message.characterId, profile: message.profile, ready: false };
      return;
    }
    if (message.type === 'handshake-accepted') {
      if (message.slot !== 1 || (this.acceptedPeerId && this.acceptedPeerId !== peerId)) return;
      this.acceptedPeerId = peerId;
      if (this.timeout !== null) window.clearTimeout(this.timeout);
      this.setStatus('connected');
      this.changed();
      return;
    }
    if (peerId !== this.acceptedPeerId) return;
    if (this.handlePing(peerId, message)) return;
    if (message.type === 'lobby-state') {
      this.lobbyState = message;
      if (this.host) this.host.ready = message.hostReady;
      this.guest.ready = message.guestReady;
      this.changed();
    } else if (message.type === 'start') {
      this.sessionId = message.sessionId;
      this.pendingStart = message;
      this.phaseState = null;
      this.pendingPhaseState = null;
      this.changed();
    } else if (message.type === 'build-state') {
      const newestBuildRevision = Math.max(
        this.lastAppliedBuildRevision,
        this.pendingBuild?.buildRevision ?? 0,
      );
      if (message.build.buildRevision > newestBuildRevision) {
        this.pendingBuild = message.build;
      }
    } else if (message.type === 'phase-state') {
      if (message.state.stateRevision <= this.lastReceivedPhaseStateRevision) return;
      this.lastReceivedPhaseStateRevision = message.state.stateRevision;
      if (message.state.phase !== 'run') {
        this.suspendCombatSnapshots(message.state.phaseRevision);
      }
      if (message.state.buildRevision > this.lastAppliedBuildRevision) {
        this.pendingPhaseState = message.state;
      } else {
        this.activatePhaseState(message.state);
      }
    } else if (message.type === 'end-result') {
      if (message.result.sessionId !== this.sessionId) return;
      this.applyEndResult(message.result);
      this.ignoreTransportFailure(this.transport.sendControl(peerId, {
        type: 'end-receipt',
        version: NETWORK_VERSION,
        resultId: message.result.resultId,
      }));
    } else if (message.type === 'return-menu') {
      this.returnToMenuRequested = true;
      this.changed();
    }
  }

  setGuestSelection(characterId: string): void {
    this.guest.characterId = characterId;
    this.guest.ready = false;
    if (this.acceptedPeerId) {
      this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
        type: 'handshake',
        version: NETWORK_VERSION,
        role: 'guest',
        characterId,
        profile: this.guest.profile,
      } satisfies HandshakeMessage));
      this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
        type: 'lobby-ready',
        version: NETWORK_VERSION,
        ready: false,
      }));
    }
    this.changed();
  }

  setReady(ready: boolean): void {
    this.guest.ready = ready;
    if (this.acceptedPeerId) {
      this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
        type: 'lobby-ready',
        version: NETWORK_VERSION,
        ready,
      }));
    }
    this.changed();
  }

  sendPhaseCommand(
    phaseRevision: number,
    command: string,
    ids: string[] = [],
    value?: number | boolean,
  ): void {
    if (!this.acceptedPeerId) return;
    this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
      type: 'phase-command',
      version: NETWORK_VERSION,
      phaseRevision,
      command,
      ids,
      value,
    }));
  }

  private transmitInput(inputState: {
    moveX: number;
    moveY: number;
    abilityPressSeq: number;
  }): NetworkInput {
    this.lastInput = {
      ...inputState,
      seq: ++this.inputSeq,
      clientTick: ++this.clientTick,
      snapshotSeq: this.shadow.latestSequence,
    };
    if (this.inputHistory.length < INPUT_REDUNDANCY) {
      this.inputHistory.push(this.lastInput);
    } else {
      this.inputHistory[0] = this.inputHistory[1];
      this.inputHistory[1] = this.inputHistory[2];
      this.inputHistory[2] = this.lastInput;
    }
    if (this.acceptedPeerId) {
      this.ignoreTransportFailure(
        this.transport.sendInput(this.acceptedPeerId, encodeInputPacket(this.inputHistory)),
      );
    }
    return this.lastInput;
  }

  handleVisibility(_game: Game, hidden: boolean): void {
    if (!hidden || !this.acceptedPeerId || this.status !== 'connected') return;
    this.prediction.clear();
    this.predictedBase = null;
    this.transmitInput({
      moveX: 0,
      moveY: 0,
      abilityPressSeq: this.lastInput.abilityPressSeq,
    });
  }

  private prepareRun(game: Game, start: StartMessage): boolean {
    if (!this.host) return false;
    const hostCharacter = CHARACTERS.find((character) => character.id === start.hostCharacterId);
    const guestCharacter = CHARACTERS.find((character) => character.id === start.guestCharacterId);
    const difficulty = DIFFICULTIES.find((entry) => entry.id === start.difficultyId);
    if (!hostCharacter || !guestCharacter || !difficulty) return false;
    this.shadow.clear();
    this.prediction.clear();
    this.predictedBase = null;
    this.predictedAbility = null;
    this.lastAbilityAttemptSeq = 0;
    this.predictedAbilityPressSeq = 0;
    this.pendingSnapshots.length = 0;
    this.wireSnapshot = null;
    this.lastSnapshotResyncAt = -Infinity;
    this.pendingGameplayEvents.length = 0;
    this.lastSnapshotReceivedAt = 0;
    this.snapshotWindowStartedAt = 0;
    this.snapshotWindowBytes = 0;
    this.snapshotWindowCount = 0;
    this.inputHistory.length = 0;
    this.inputSeq = 0;
    this.clientTick = 0;
    this.lastInput = {
      seq: 0,
      clientTick: 0,
      snapshotSeq: 0,
      moveX: 0,
      moveY: 0,
      abilityPressSeq: 0,
    };
    this.phaseState = null;
    this.lastEndResult = null;
    this.lastProgressionGain = null;
    this.returnToMenuRequested = false;
    this.metrics.phaseRevision = 0;
    game.sessionRole = 'guest';
    game.localPlayerSlot = 1;
    game.newRunSquad(
      [hostCharacter, guestCharacter],
      [new StaticPlayerProfile(this.host.profile), new StaticPlayerProfile(this.guest.profile)],
    );
    game.state.difficulty = difficulty;
    if (this.pendingBuild && applyBuildState(game.state, this.pendingBuild)) {
      this.metrics.buildRevision = this.pendingBuild.buildRevision;
      this.lastAppliedBuildRevision = this.pendingBuild.buildRevision;
      this.pendingBuild = null;
    }
    this.onStarted?.();
    return true;
  }

  private applyEndResult(result: EndResult): void {
    if (this.appliedResults.has(result.resultId)) return;
    this.appliedResults.add(result.resultId);
    this.lastEndResult = result;
    this.lastProgressionGain = recordRun(result.wave, result.kills, result.won, {
      wave: result.wave,
      level: result.level,
      kills: result.kills,
      won: result.won,
      difficultyId: result.difficultyId,
      characterIds: result.characterIds,
      weaponIds: result.weaponIds,
      playerCount: result.playerCount,
      metrics: result.metrics,
    });
    addShards(result.shardsEarned);
  }

  private processSnapshot(
    game: Game,
    snapshot: FrameSnapshot,
    nowMs: number,
    displayed: { x: number; y: number },
  ): void {
    const authoritative = snapshot.players.find((player) => player.slot === 1);
    const phaseAllowsPrediction = !this.phaseState || this.phaseState.phase === 'run';
    if (authoritative && phaseAllowsPrediction && !authoritative.downed) {
      game.localPlayer.x = displayed.x;
      game.localPlayer.y = displayed.y;
      this.prediction.reconcile(
        game.localPlayer,
        game.state.obstacles,
        { x: authoritative.x, y: authoritative.y },
        snapshot.ackInputTick,
        nowMs,
      );
      this.predictedBase = { x: game.localPlayer.x, y: game.localPlayer.y };
      const rendered = this.prediction.renderPose(game.localPlayer, nowMs);
      game.localPlayer.x = rendered.x;
      game.localPlayer.y = rendered.y;
    } else {
      this.prediction.clear();
      this.predictedBase = null;
    }
    if (
      this.predictedAbility
      && snapshot.ackInputTick >= this.predictedAbility.inputTick
      && authoritative
      && authoritative.abilityCd <= 0
      && authoritative.abilityActiveT <= 0
    ) {
      this.predictedAbility = null;
    }
    this.metrics.lastInputTick = Math.max(this.metrics.lastInputTick, snapshot.ackInputTick);
    this.metrics.lastEventId = Math.max(this.metrics.lastEventId, snapshot.lastEventId);
    this.metrics.buildRevision = Math.max(this.metrics.buildRevision, snapshot.buildRevision);
    this.metrics.phaseRevision = Math.max(this.metrics.phaseRevision, snapshot.phaseRevision);
    this.metrics.predictionCorrection = this.prediction.lastCorrectionDistance;
  }

  private beginPredictedAbility(game: Game, command: NetworkInput, nowMs: number): void {
    const player = game.localPlayer;
    if (command.abilityPressSeq <= this.lastAbilityAttemptSeq) return;
    this.lastAbilityAttemptSeq = command.abilityPressSeq;
    if (player.downed || player.abilityCd > 0) return;
    this.predictedAbilityPressSeq = command.abilityPressSeq;
    player.abilityCd = player.abilityCooldown();
    player.activateAbilityPresentation();
    this.predictedAbility = {
      inputTick: command.clientTick,
      abilityPressSeq: command.abilityPressSeq,
      startedAtMs: nowMs,
      duration: player.abilityDuration(),
      cooldown: player.abilityCooldown(),
      abilityX: player.abilityX,
      abilityY: player.abilityY,
      abilityPower: player.abilityPower,
    };
    withoutPresentationCapture(() => playAbilityPresentation(player));
  }

  private applyPredictedAbility(game: Game, nowMs: number): void {
    const predicted = this.predictedAbility;
    if (!predicted) return;
    const player = game.localPlayer;
    const elapsed = Math.max(0, (nowMs - predicted.startedAtMs) / 1000);
    player.abilityCd = Math.max(0, predicted.cooldown - elapsed);
    const active = Math.max(0, predicted.duration - elapsed);
    if (active > 0) {
      player.abilityActiveT = active;
      player.abilityX = predicted.abilityX;
      player.abilityY = predicted.abilityY;
      player.abilityPower = predicted.abilityPower;
    } else if (player.character.ability.id === 'overheat') {
      player.abilityActiveT = 0;
      player.abilityRecoveryT = Math.max(
        0,
        player.overheatRecoveryDuration() - (elapsed - predicted.duration),
      );
    }
    if (player.abilityCd <= 0 && active <= 0) this.predictedAbility = null;
  }

  private replayReadyEvents(game: Game): void {
    const presentationTick = this.shadow.presentationTick;
    if (presentationTick <= 0) return;
    const replayed: GameplayEvent[] = [];
    let readyCount = 0;
    while (
      readyCount < this.pendingGameplayEvents.length
      && this.pendingGameplayEvents[readyCount].simTick <= presentationTick + 0.5
    ) {
      const event = this.pendingGameplayEvents[readyCount++];
      if (
        event.type === 'ability'
        && event.playerSlot === game.localPlayerSlot
        && event.abilityPressSeq <= this.predictedAbilityPressSeq
      ) continue;
      replayGameplayEvent(game, event);
      replayed.push(event);
    }
    if (readyCount > 0) this.pendingGameplayEvents.splice(0, readyCount);
    if (replayed.length > 0) this.onGameplayEvents?.(replayed);
  }

  update(game: Game, dt: number): void {
    const nowMs = performance.now();
    this.updatePing(nowMs);
    if (this.pendingStart) {
      const start = this.pendingStart;
      this.pendingStart = null;
      this.prepareRun(game, start);
    }
    if (this.pendingBuild) {
      if (applyBuildState(game.state, this.pendingBuild)) {
        this.metrics.buildRevision = this.pendingBuild.buildRevision;
        this.lastAppliedBuildRevision = this.pendingBuild.buildRevision;
        this.pendingBuild = null;
      }
    }
    this.activatePendingPhaseState();

    const displayed = { x: game.localPlayer.x, y: game.localPlayer.y };
    const sample = this.shadow.sample(nowMs);
    if (
      sample
      && this.sessionId
      && game.sessionRole === 'guest'
      && game.scene.wantsJoystick === true
    ) {
      const applyStartedAt = performance.now();
      applyShadowSampleToRunState(game.state, sample);
      const applyMs = performance.now() - applyStartedAt;
      this.metrics.snapshotApplyMs += (applyMs - this.metrics.snapshotApplyMs) * 0.2;
      this.metrics.interpolationAge = sample.interpolationDelayMs;
      this.metrics.snapshotJitter = this.shadow.arrivalJitterMs;
    } else if (this.lastSnapshotReceivedAt > 0) {
      this.metrics.interpolationAge = this.shadow.interpolationDelayMs
        + Math.max(0, nowMs - this.lastSnapshotReceivedAt - 100);
    }

    if (this.pendingSnapshots.length > 0) {
      const latestSnapshot = this.pendingSnapshots[this.pendingSnapshots.length - 1];
      this.pendingSnapshots.length = 0;
      this.processSnapshot(game, latestSnapshot, nowMs, displayed);
    }
    this.replayReadyEvents(game);
    if (!this.sessionId || game.sessionRole !== 'guest' || this.status !== 'connected') return;

    const phaseAllowsPrediction = (!this.phaseState || this.phaseState.phase === 'run')
      && game.scene.wantsJoystick === true;
    const inputState = game.localPlayer.downed || !phaseAllowsPrediction
      ? { moveX: 0, moveY: 0, abilityPressSeq: this.lastInput.abilityPressSeq }
      : game.localInput.read(nowMs);
    if (!phaseAllowsPrediction || game.localPlayer.downed) {
      this.prediction.clear();
      this.predictedBase = null;
      this.applyPredictedAbility(game, nowMs);
      return;
    }

    const command = this.transmitInput(inputState);
    this.metrics.lastInputSeq = command.seq;
    this.beginPredictedAbility(game, command, nowMs);
    if (this.predictedBase) {
      game.localPlayer.x = this.predictedBase.x;
      game.localPlayer.y = this.predictedBase.y;
    }
    applyPlayerMovement(game.localPlayer, game.state.obstacles, inputState, dt);
    this.predictedBase = { x: game.localPlayer.x, y: game.localPlayer.y };
    this.prediction.record(command, dt);
    const rendered = this.prediction.renderPose(game.localPlayer, nowMs);
    game.localPlayer.x = rendered.x;
    game.localPlayer.y = rendered.y;
    this.applyPredictedAbility(game, nowMs);
  }
}
