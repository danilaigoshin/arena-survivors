import type { GameplayEventDraft } from './events';

export type PresentationEventSink = (event: GameplayEventDraft) => void;

let activeSink: PresentationEventSink | null = null;

export function setPresentationEventSink(sink: PresentationEventSink | null): void {
  activeSink = sink;
}

export function emitPresentationEvent(event: GameplayEventDraft): void {
  activeSink?.(event);
}
