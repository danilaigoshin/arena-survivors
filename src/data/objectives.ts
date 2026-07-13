export type WaveObjectiveKind = 'hunter' | 'collector' | 'hold';

export interface WaveObjectiveDef {
  id: WaveObjectiveKind;
  name: string;
  icon: string;
}

export interface WaveObjectiveState {
  kind: WaveObjectiveKind;
  target: number;
  progress: number;
  timeLeft: number;
  reward: number;
  completed: boolean;
  failed: boolean;
  startKills: number;
  x: number;
  y: number;
  radius: number;
}

export const WAVE_OBJECTIVES: Record<WaveObjectiveKind, WaveObjectiveDef> = {
  hunter: { id: 'hunter', name: 'Зачистка', icon: 'i_skull' },
  collector: { id: 'collector', name: 'Сбор припасов', icon: 'i_gem' },
  hold: { id: 'hold', name: 'Удержание', icon: 'i_armor' },
};

export function objectiveTarget(kind: WaveObjectiveKind, wave: number): number {
  if (kind === 'hunter') return Math.min(54, 12 + wave * 2);
  if (kind === 'collector') return Math.min(30, 7 + wave);
  return 7;
}

export function objectiveTime(kind: WaveObjectiveKind, wave: number): number {
  if (kind === 'hunter') return Math.min(28, 19 + wave * 0.45);
  if (kind === 'collector') return Math.min(28, 20 + wave * 0.4);
  return 24;
}

export function objectiveReward(wave: number): number {
  return Math.round(5 + wave * 0.7);
}
