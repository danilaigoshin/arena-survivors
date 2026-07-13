import { pick } from '../core/rng';

export type TalentId = 'executioner' | 'momentum' | 'barrier' | 'synchronization' | 'last_stand' | 'magnetic_pulse';

export interface TalentDef {
  kind: 'talent';
  id: TalentId;
  name: string;
  icon: string;
  desc: string;
  rarity: 3;
}

export const TALENTS: readonly TalentDef[] = [
  { kind: 'talent', id: 'executioner', name: 'Палач', icon: 'i_skull', rarity: 3, desc: '+20% урона врагам ниже 25% здоровья; против боссов +8%' },
  { kind: 'talent', id: 'momentum', name: 'Накат', icon: 'i_aspd', rarity: 3, desc: 'После 1,5 с непрерывного движения +12% скорости атаки; остановка или урон сбрасывают эффект' },
  { kind: 'talent', id: 'barrier', name: 'Барьер', icon: 'i_armor', rarity: 3, desc: 'Полностью блокирует один удар каждые 18 с' },
  { kind: 'talent', id: 'synchronization', name: 'Синхронизация', icon: 'i_star', rarity: 3, desc: 'Способность сокращает текущую перезарядку оружия на 30%' },
  { kind: 'talent', id: 'last_stand', name: 'На грани', icon: 'i_sword', rarity: 3, desc: 'Ниже 35% здоровья: +12% урона и +10% скорости движения' },
  { kind: 'talent', id: 'magnetic_pulse', name: 'Магнитный импульс', icon: 'i_magnet', rarity: 3, desc: 'Каждые 60 собранных материалов отталкивают ближайших врагов' },
];

export function rollTalentChoices(owned: ReadonlySet<string>, count = 3): TalentDef[] {
  const pool = TALENTS.filter((talent) => !owned.has(talent.id));
  const out: TalentDef[] = [];
  while (pool.length > 0 && out.length < count) {
    const chosen = pick(pool);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}
