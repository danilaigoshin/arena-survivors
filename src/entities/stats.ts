import { t } from '../core/i18n';

export interface Stats {
  maxHp: number;
  hpRegen: number; // hp per 5 seconds
  damagePct: number; // +% damage
  attackSpeedPct: number; // +% attack speed
  moveSpeed: number; // units/sec
  armor: number; // reduction: dmg * 15/(15+armor)
  pickupRange: number;
  luck: number; // shop rarity + crit weighting
  critChance: number; // 0..1, crits deal x2
}

export const BASE_STATS: Stats = {
  maxHp: 60,
  hpRegen: 0,
  damagePct: 0,
  attackSpeedPct: 0,
  moveSpeed: 220,
  armor: 0,
  pickupRange: 90,
  luck: 0,
  critChance: 0.03,
};

export type StatMod = Partial<Stats>;

export function computeStats(mods: readonly StatMod[]): Stats {
  const s: Stats = { ...BASE_STATS };
  for (const m of mods) {
    for (const k in m) {
      const key = k as keyof Stats;
      s[key] += m[key]!;
    }
  }
  s.maxHp = Math.max(1, s.maxHp);
  s.moveSpeed = Math.max(60, s.moveSpeed);
  s.critChance = Math.min(0.8, Math.max(0, s.critChance));
  s.pickupRange = Math.max(30, s.pickupRange);
  return s;
}

export function armorReduction(dmg: number, armor: number): number {
  return Math.max(1, Math.round(dmg * (15 / (15 + Math.max(0, armor)))));
}

// Getters so labels follow the current language at read time.
export const STAT_LABELS: Record<keyof Stats, string> = {
  get maxHp() { return t('st.maxHp'); },
  get hpRegen() { return t('st.hpRegen'); },
  get damagePct() { return t('st.damagePct'); },
  get attackSpeedPct() { return t('st.attackSpeedPct'); },
  get moveSpeed() { return t('st.moveSpeed'); },
  get armor() { return t('st.armor'); },
  get pickupRange() { return t('st.pickupRange'); },
  get luck() { return t('st.luck'); },
  get critChance() { return t('st.critChance'); },
};

export function formatStatValue(key: keyof Stats, v: number): string {
  const sign = v > 0 ? '+' : '';
  if (key === 'critChance') return `${sign}${Math.round(v * 100)}%`;
  if (key === 'damagePct' || key === 'attackSpeedPct') return `${sign}${Math.round(v)}%`;
  if (key === 'hpRegen') return `${sign}${Number(v.toFixed(1))}`;
  return `${sign}${Math.round(v)}`;
}
