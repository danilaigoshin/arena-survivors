import type { Game } from '../game';
import { StaticPlayerProfile } from '../core/playerProfile';
import { addShards, recordRun } from '../core/save';
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
  GameplayEventJournal,
  GameplayEventReceiver,
  type GameplayEvent,
  type GameplayEventBatch,
} from './events';
import { GuestPrediction } from './prediction';
import {
  ShadowState,
  applySnapshotToRunState,
  captureFrameSnapshot,
  decodeFrameSnapshot,
  encodeFrameSnapshot,
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
import { setPresentationEventSink } from './presentationBus';
import { replayGameplayEvent } from './eventReplay';

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
  snapshotBytes: number;
  snapshotSendMs: number;
  snapshotPending: boolean;
  interpolationAge: number;
  predictionCorrection: number;
  lastInputSeq: number;
  lastEventId: number;
  buildRevision: number;
  phaseRevision: number;
}

export interface LobbyMember {
  characterId: string;
  profile: SerializedPlayerProfile;
  ready: boolean;
}

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
  snapshotBytes: 0,
  snapshotSendMs: 0,
  snapshotPending: false,
  interpolationAge: 0,
  predictionCorrection: 0,
  lastInputSeq: 0,
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
    if (this.status !== 'connected' || !this.acceptedPeerId || nowMs - this.lastPingAt < 1000) return;
    this.lastPingAt = nowMs;
    this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
      type: 'ping',
      version: NETWORK_VERSION,
      sentAt: nowMs,
    }));
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
  private readonly pendingPhaseCommands: PhaseCommandMessage[] = [];
  pausedByVisibility = false;
  private readonly eventJournal = new GameplayEventJournal();
  private lastPublishedEventId = 0;
  private currentPhaseState: PhaseState | null = null;

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
        this.snapshotSender = new LatestSnapshotSender(this.transport, peerId);
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
      // Input is cumulative (sequence + ability edge counter), so only the
      // newest packet is useful before the next host simulation step.
      this.pendingInputs[0] = message.input;
      this.pendingInputs.length = 1;
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
    }
  }

  private readonly pendingInputs: NetworkInput[] = [];

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

  publishPhase(state: PhaseState): void {
    this.currentPhaseState = state;
    this.phaseRevision = state.phaseRevision;
    this.metrics.phaseRevision = state.phaseRevision;
    if (!this.acceptedPeerId) return;
    this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
      type: 'phase-state',
      version: NETWORK_VERSION,
      state,
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
    for (;;) {
      const batch = this.eventJournal.batchAfter(this.lastPublishedEventId);
      if (!batch) return;
      this.lastPublishedEventId = batch.lastEventId;
      this.metrics.lastEventId = batch.lastEventId;
      this.publishEvents(batch);
    }
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
    while (this.pendingInputs.length > 0) {
      const input = this.pendingInputs.shift()!;
      game.remoteInput.accept(input, now);
    }
    if (
      !this.running
      || !this.snapshotSender
      || this.status !== 'connected'
      || game.scene.wantsJoystick !== true
    ) return;
    this.simTick++;
    if (this.simTick % 3 !== 0) return;
    const frame = captureFrameSnapshot(game.state, {
      snapshotSeq: ++this.snapshotSeq,
      simTick: this.simTick,
      ackInputSeq: game.remoteInput.lastSequence,
      buildRevision: this.buildRevision,
      phaseRevision: this.phaseRevision,
      lastEventId: this.metrics.lastEventId,
    });
    this.snapshotSender.enqueue(encodeFrameSnapshot(frame));
    this.metrics.snapshotBytes = this.snapshotSender.metrics.bytes;
    this.metrics.snapshotSendMs = this.snapshotSender.metrics.sendDurationMs;
    this.metrics.snapshotPending = this.snapshotSender.metrics.pending;
    this.metrics.lastInputSeq = game.remoteInput.lastSequence;
  }
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
  private readonly eventReceiver = new GameplayEventReceiver();
  private resyncRequestedAfter: number | null = null;
  private readonly pendingGameplayEvents: GameplayEvent[] = [];
  private readonly pendingSnapshots: FrameSnapshot[] = [];
  private lastSnapshotReceivedAt = 0;
  private pendingBuild: BuildState | null = null;
  private lastAppliedBuildRevision = 0;
  private pendingStart: StartMessage | null = null;
  private inputSeq = 0;
  private lastInputSentAt = -Infinity;
  private lastInput: NetworkInput = { seq: 0, moveX: 0, moveY: 0, abilityPressSeq: 0 };
  private predictedBase: { x: number; y: number } | null = null;
  private timeout: number | null = null;
  private readonly appliedResults = new Set<string>();
  lastEndResult: EndResult | null = null;
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
      try {
        const snapshot = decodeFrameSnapshot(data);
        if (this.shadow.accept(snapshot)) {
          this.metrics.snapshotBytes = data.byteLength;
          this.lastSnapshotReceivedAt = performance.now();
          this.pendingSnapshots[0] = snapshot;
          this.pendingSnapshots.length = 1;
        }
      } catch {
        // Invalid binary input never reaches the shadow world.
      }
    }));
    this.cleanups.push(this.transport.onEvents((peerId, rawBatch) => {
      if (peerId !== this.acceptedPeerId || !rawBatch || typeof rawBatch !== 'object') return;
      const result = this.eventReceiver.accept(rawBatch as GameplayEventBatch);
      if (
        result.gapAfter !== null
        && this.resyncRequestedAfter !== result.gapAfter
      ) {
        this.resyncRequestedAfter = result.gapAfter;
        this.ignoreTransportFailure(this.transport.sendControl(peerId, {
          type: 'resync-request',
          version: NETWORK_VERSION,
          afterEventId: result.gapAfter,
        }));
      }
      if (result.events.length > 0) {
        this.resyncRequestedAfter = null;
        this.pendingGameplayEvents.push(...result.events);
        this.onGameplayEvents?.(result.events);
      }
    }));
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
      if (message.state.phaseRevision < this.metrics.phaseRevision) return;
      this.phaseState = message.state;
      this.metrics.phaseRevision = message.state.phaseRevision;
      this.changed();
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

  handleVisibility(_game: Game, hidden: boolean): void {
    if (!hidden || !this.acceptedPeerId || this.status !== 'connected') return;
    this.prediction.clear();
    this.predictedBase = null;
    this.lastInput = {
      seq: ++this.inputSeq,
      moveX: 0,
      moveY: 0,
      abilityPressSeq: this.lastInput.abilityPressSeq,
    };
    this.lastInputSentAt = performance.now();
    this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
      type: 'input',
      version: NETWORK_VERSION,
      input: this.lastInput,
    }));
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
    this.pendingSnapshots.length = 0;
    this.pendingGameplayEvents.length = 0;
    this.resyncRequestedAfter = null;
    this.lastSnapshotReceivedAt = 0;
    this.phaseState = null;
    this.lastEndResult = null;
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
    recordRun(result.wave, result.kills, result.won);
    addShards(result.shardsEarned);
  }

  private processSnapshot(game: Game, snapshot: FrameSnapshot, nowMs: number): void {
    const predictedX = game.localPlayer.x;
    const predictedY = game.localPlayer.y;
    const sampled = this.shadow.sample();
    if (sampled) applySnapshotToRunState(game.state, sampled);
    const authoritative = snapshot.players.find((player) => player.slot === 1);
    const phaseAllowsPrediction = !this.phaseState || this.phaseState.phase === 'run';
    if (authoritative && phaseAllowsPrediction && !authoritative.downed) {
      game.localPlayer.x = predictedX;
      game.localPlayer.y = predictedY;
      this.prediction.reconcile(
        game.localPlayer,
        game.state.obstacles,
        { x: authoritative.x, y: authoritative.y },
        snapshot.ackInputSeq,
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
    this.metrics.lastInputSeq = Math.max(this.metrics.lastInputSeq, snapshot.ackInputSeq);
    this.metrics.lastEventId = Math.max(this.metrics.lastEventId, snapshot.lastEventId);
    this.metrics.buildRevision = Math.max(this.metrics.buildRevision, snapshot.buildRevision);
    this.metrics.phaseRevision = Math.max(this.metrics.phaseRevision, snapshot.phaseRevision);
    this.metrics.predictionCorrection = this.prediction.lastCorrectionDistance;
  }

  update(game: Game, dt: number): void {
    const nowMs = performance.now();
    this.updatePing(nowMs);
    this.metrics.interpolationAge = this.lastSnapshotReceivedAt > 0
      ? 100 + Math.max(0, nowMs - this.lastSnapshotReceivedAt)
      : 0;
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
    if (this.pendingSnapshots.length > 0) {
      const latestSnapshot = this.pendingSnapshots[this.pendingSnapshots.length - 1];
      this.pendingSnapshots.length = 0;
      this.processSnapshot(game, latestSnapshot, nowMs);
    }
    while (this.pendingGameplayEvents.length > 0) {
      replayGameplayEvent(game, this.pendingGameplayEvents.shift()!);
    }
    if (!this.sessionId || game.sessionRole !== 'guest' || this.status !== 'connected') return;

    const phaseAllowsPrediction = !this.phaseState || this.phaseState.phase === 'run';
    const inputState = game.localPlayer.downed || !phaseAllowsPrediction
      ? { moveX: 0, moveY: 0, abilityPressSeq: this.lastInput.abilityPressSeq }
      : game.localInput.read(nowMs);
    const changed = inputState.moveX !== this.lastInput.moveX
      || inputState.moveY !== this.lastInput.moveY
      || inputState.abilityPressSeq !== this.lastInput.abilityPressSeq;
    if (changed || (phaseAllowsPrediction && nowMs - this.lastInputSentAt >= 1000 / 30)) {
      this.lastInput = { ...inputState, seq: ++this.inputSeq };
      this.lastInputSentAt = nowMs;
      if (this.acceptedPeerId) {
        this.ignoreTransportFailure(this.transport.sendControl(this.acceptedPeerId, {
          type: 'input',
          version: NETWORK_VERSION,
          input: this.lastInput,
        }));
      }
    }
    if (!phaseAllowsPrediction || game.localPlayer.downed) {
      this.prediction.clear();
      this.predictedBase = null;
      return;
    }
    if (this.predictedBase) {
      game.localPlayer.x = this.predictedBase.x;
      game.localPlayer.y = this.predictedBase.y;
    }
    applyPlayerMovement(game.localPlayer, game.state.obstacles, inputState, dt);
    this.predictedBase = { x: game.localPlayer.x, y: game.localPlayer.y };
    this.prediction.record(this.lastInput, dt);
    const rendered = this.prediction.renderPose(game.localPlayer, nowMs);
    game.localPlayer.x = rendered.x;
    game.localPlayer.y = rendered.y;
  }
}
