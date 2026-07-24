import type { PlayerSlot } from './types';

export interface GameplayEventBase {
  eventId: number;
  simTick: number;
}

export type GameplayEvent =
  | (GameplayEventBase & { type: 'damage'; target: 'enemy' | 'player'; targetUid?: number; targetSlot?: PlayerSlot; x: number; y: number; damage: number; crit: boolean; heal?: boolean })
  | (GameplayEventBase & { type: 'death'; enemyId: string; x: number; y: number; radius: number; hitAngle: number; flip: boolean; boss: boolean; color: string })
  | (GameplayEventBase & { type: 'fx'; effect: 'burst' | 'ring' | 'sparks'; x: number; y: number; color: string; count?: number; angle?: number })
  | (GameplayEventBase & { type: 'sfx'; sound: string })
  | (GameplayEventBase & {
    type: 'ability';
    playerSlot: PlayerSlot;
    abilityId: string;
    abilityPressSeq: number;
  })
  | (GameplayEventBase & { type: 'wave'; wave: number; action: 'start' | 'end' })
  | (GameplayEventBase & { type: 'phase'; phase: string; revision: number });

export interface GameplayEventBatch {
  version: 1;
  firstEventId: number;
  lastEventId: number;
  events: GameplayEvent[];
}

export type GameplayEventDraft = GameplayEvent extends infer Event
  ? Event extends GameplayEvent
    ? Omit<Event, 'eventId' | 'simTick'>
    : never
  : never;

function criticalPresentationEvent(event: GameplayEvent): boolean {
  return event.type === 'ability'
    || event.type === 'death'
    || event.type === 'wave'
    || event.type === 'phase';
}

export class GameplayEventJournal {
  private readonly events: GameplayEvent[] = [];
  private nextEventId = 1;
  private readonly capacity: number;

  constructor(capacity = 2048) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  publish(simTick: number, draft: GameplayEventDraft): GameplayEvent {
    const event = { ...draft, eventId: this.nextEventId++, simTick } as GameplayEvent;
    this.events.push(event);
    while (this.events.length > this.capacity) {
      const disposable = this.events.findIndex((candidate) => (
        !criticalPresentationEvent(candidate)
      ));
      this.events.splice(disposable >= 0 ? disposable : 0, 1);
    }
    return event;
  }

  batchAfter(afterEventId: number, maxEvents = 256): GameplayEventBatch | null {
    const start = this.events.findIndex((event) => event.eventId > afterEventId);
    if (start < 0) return null;
    const events = this.events.slice(start, start + maxEvents);
    if (events.length === 0) return null;
    return {
      version: 1,
      firstEventId: events[0].eventId,
      lastEventId: events[events.length - 1].eventId,
      events,
    };
  }

  get latestEventId(): number {
    return this.nextEventId - 1;
  }

  get oldestEventId(): number {
    return this.events[0]?.eventId ?? this.nextEventId;
  }
}

export class GameplayEventReceiver {
  private lastEventId = 0;

  constructor(private readonly allowGaps = false) {}

  accept(batch: unknown): { events: GameplayEvent[]; gapAfter: number | null } {
    if (!batch || typeof batch !== 'object' || Array.isArray(batch)) {
      return { events: [], gapAfter: null };
    }
    const candidate = batch as Partial<GameplayEventBatch>;
    if (
      candidate.version !== 1
      || !Number.isSafeInteger(candidate.firstEventId)
      || !Number.isSafeInteger(candidate.lastEventId)
      || !Array.isArray(candidate.events)
      || candidate.events.length === 0
      || candidate.events.length > 512
      || !candidate.events.every(validGameplayEvent)
    ) {
      return { events: [], gapAfter: null };
    }
    const events = candidate.events as GameplayEvent[];
    if (
      candidate.firstEventId !== events[0].eventId
      || candidate.lastEventId !== events[events.length - 1].eventId
      || events.some((event, index) => (
        index > 0
        && event.eventId <= events[index - 1].eventId
      ))
      || (
        !this.allowGaps
        && events.some((event, index) => event.eventId !== candidate.firstEventId! + index)
      )
    ) return { events: [], gapAfter: null };
    if (candidate.firstEventId! > this.lastEventId + 1) {
      // Do not advance over a hole: the resync response must still be able to
      // replay the missing critical events before this batch is accepted.
      if (!this.allowGaps) return { events: [], gapAfter: this.lastEventId };
    }
    const accepted = events.filter((event) => event.eventId > this.lastEventId);
    for (const event of accepted) this.lastEventId = Math.max(this.lastEventId, event.eventId);
    return { events: accepted, gapAfter: null };
  }

  reset(lastEventId = 0): void {
    this.lastEventId = lastEventId;
  }
}

export function compactGameplayEvents(
  events: readonly GameplayEvent[],
  maximum = 128,
): GameplayEvent[] {
  const result: GameplayEvent[] = [];
  const damageByTarget = new Map<string, GameplayEvent & { type: 'damage' }>();
  const sounds = new Set<string>();
  let sparkCount = 0;
  for (const event of events) {
    if (event.type === 'damage') {
      const key = event.target === 'enemy'
        ? `e:${event.targetUid ?? 0}:${event.heal ? 1 : 0}`
        : `p:${event.targetSlot ?? 0}:${event.heal ? 1 : 0}`;
      const existing = damageByTarget.get(key);
      if (existing && existing.simTick === event.simTick) {
        existing.damage += event.damage;
        existing.crit ||= event.crit;
        existing.x = event.x;
        existing.y = event.y;
        existing.eventId = event.eventId;
      } else {
        const copy = { ...event };
        damageByTarget.set(key, copy);
        result.push(copy);
      }
      continue;
    }
    if (event.type === 'sfx') {
      const soundKey = `${event.simTick}:${event.sound}`;
      if (sounds.has(soundKey)) continue;
      sounds.add(soundKey);
    }
    if (event.type === 'fx' && event.effect === 'sparks') {
      if (sparkCount >= 24) continue;
      sparkCount++;
    }
    result.push(event);
  }
  result.sort((a, b) => a.eventId - b.eventId);
  if (result.length <= maximum) return result;
  const critical = result.filter(criticalPresentationEvent);
  const criticalIds = new Set(critical.map((event) => event.eventId));
  const remaining = result
    .filter((event) => !criticalIds.has(event.eventId))
    .slice(-(maximum - Math.min(maximum, critical.length)));
  return [...critical.slice(-maximum), ...remaining]
    .sort((a, b) => a.eventId - b.eventId)
    .slice(-maximum);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validGameplayEvent(value: unknown): value is GameplayEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (!sequence(event.eventId) || !sequence(event.simTick) || typeof event.type !== 'string') return false;
  if (event.type === 'sfx') return typeof event.sound === 'string' && event.sound.length <= 32;
  if (event.type === 'wave') {
    return sequence(event.wave) && (event.action === 'start' || event.action === 'end');
  }
  if (event.type === 'phase') {
    return typeof event.phase === 'string' && event.phase.length <= 32 && sequence(event.revision);
  }
  if (event.type === 'ability') {
    return (event.playerSlot === 0 || event.playerSlot === 1)
      && typeof event.abilityId === 'string'
      && event.abilityId.length <= 64
      && sequence(event.abilityPressSeq);
  }
  if (event.type === 'fx') {
    return (event.effect === 'burst' || event.effect === 'ring' || event.effect === 'sparks')
      && finite(event.x)
      && finite(event.y)
      && typeof event.color === 'string'
      && event.color.length <= 32
      && (event.count === undefined || (sequence(event.count) && event.count <= 64))
      && (event.angle === undefined || finite(event.angle));
  }
  if (event.type === 'damage') {
    return (event.target === 'enemy' || event.target === 'player')
      && finite(event.x)
      && finite(event.y)
      && finite(event.damage)
      && event.damage >= 0
      && typeof event.crit === 'boolean'
      && (event.heal === undefined || typeof event.heal === 'boolean')
      && (event.targetUid === undefined || sequence(event.targetUid))
      && (event.targetSlot === undefined || event.targetSlot === 0 || event.targetSlot === 1);
  }
  if (event.type === 'death') {
    return typeof event.enemyId === 'string'
      && event.enemyId.length <= 64
      && finite(event.x)
      && finite(event.y)
      && finite(event.radius)
      && finite(event.hitAngle)
      && typeof event.flip === 'boolean'
      && typeof event.boss === 'boolean'
      && typeof event.color === 'string'
      && event.color.length <= 32;
  }
  return false;
}
