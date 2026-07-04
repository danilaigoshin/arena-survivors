import { t } from '../core/i18n';

export const RARITY_COLORS = ['#9a9aa8', '#4f9cf0', '#b13be0', '#f0a03c'];
export function rarityName(rarity: number): string {
  return t(`rarity.${rarity}`);
}
