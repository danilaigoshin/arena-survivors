export interface DifficultyDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  /** enemy max-hp multiplier */
  hpMult: number;
  /** enemy damage multiplier */
  dmgMult: number;
  /** elite spawn chance multiplier */
  eliteMult: number;
  /** shard reward multiplier */
  shardMult: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'easy',
    name: 'Лёгкий',
    desc: 'Слабее враги, меньше осколков',
    color: '#8dff9a',
    hpMult: 0.75,
    dmgMult: 0.7,
    eliteMult: 0.5,
    shardMult: 0.75,
  },
  {
    id: 'normal',
    name: 'Нормальный',
    desc: 'Как задумано',
    color: '#8be9fd',
    hpMult: 1,
    dmgMult: 1,
    eliteMult: 1,
    shardMult: 1,
  },
  {
    id: 'nightmare',
    name: 'Кошмар',
    desc: 'Толще, злее, больше элит — и в 1.5 раза больше осколков',
    color: '#ff5470',
    hpMult: 1.4,
    dmgMult: 1.3,
    eliteMult: 1.6,
    shardMult: 1.5,
  },
];

const KEY = 'as_difficulty';

export function loadDifficulty(): DifficultyDef {
  const id = localStorage.getItem(KEY);
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
}

export function saveDifficulty(d: DifficultyDef): void {
  localStorage.setItem(KEY, d.id);
}
