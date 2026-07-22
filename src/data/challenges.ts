import type { RunSummary } from '../core/runMetrics';

export interface ProgressSnapshot {
  runs: number;
  wins: number;
  bestWave: number;
  totalKills: number;
  codexEvolutions: number;
}

export interface ChallengeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
  cosmetic?: string;
  completed(progress: ProgressSnapshot, run: RunSummary): boolean;
}

export const CHALLENGES: readonly ChallengeDef[] = [
  {
    id: 'first_steps', name: 'Первые шаги', desc: 'Заверши первый забег', icon: 'i_wave', reward: 25,
    completed: (progress) => progress.runs >= 1,
  },
  {
    id: 'slayer', name: 'Истребитель', desc: 'Уничтожь суммарно 1 000 врагов', icon: 'i_skull', reward: 75,
    cosmetic: 'ember_aura', completed: (progress) => progress.totalKills >= 1000,
  },
  {
    id: 'boss_hunter', name: 'Охотник на боссов', desc: 'Победи двух боссов за один забег', icon: 'i_trophy', reward: 60,
    completed: (_progress, run) => run.metrics.bossesKilled >= 2,
  },
  {
    id: 'evolution', name: 'Новая форма', desc: 'Впервые эволюционируй оружие', icon: 'i_planet', reward: 50,
    cosmetic: 'arcane_aura', completed: (progress) => progress.codexEvolutions >= 1,
  },
  {
    id: 'untouchable', name: 'Лёгкий шаг', desc: 'Дойди до волны 10, получив не больше 100 урона', icon: 'i_speed', reward: 90,
    cosmetic: 'frost_aura', completed: (_progress, run) => run.wave >= 10 && run.metrics.damageTaken.reduce((a, b) => a + b, 0) <= 100,
  },
  {
    id: 'ability_master', name: 'Без пауз', desc: 'Используй способности 30 раз за забег', icon: 'i_star', reward: 70,
    completed: (_progress, run) => run.metrics.abilityUses.reduce((a, b) => a + b, 0) >= 30,
  },
  {
    id: 'victory', name: 'Владыка повержен', desc: 'Победи в кампании', icon: 'i_trophy', reward: 150,
    cosmetic: 'victory_aura', completed: (progress) => progress.wins >= 1,
  },
  {
    id: 'duo_victory', name: 'Спина к спине', desc: 'Победи в кооперативе', icon: 'i_heart', reward: 120,
    completed: (_progress, run) => run.won && run.playerCount === 2,
  },
];

export const COSMETICS = [
  { id: 'none', name: 'Без ауры', color: '#00000000' },
  { id: 'ember_aura', name: 'Угольная искра', color: '#ff7848' },
  { id: 'arcane_aura', name: 'Мистический след', color: '#b18cff' },
  { id: 'frost_aura', name: 'Морозное сияние', color: '#8be9fd' },
  { id: 'victory_aura', name: 'Золотой триумф', color: '#ffd23e' },
] as const;
