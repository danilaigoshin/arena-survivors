import { ITEMS, type ItemDef } from '../data/items';
import { WEAPONS, MAX_TIER, type WeaponDef } from '../data/weapons';
import { chance, pick, pickWeighted, rand } from '../core/rng';
import type { Player } from '../entities/player';

export type ShopOffer =
  | { kind: 'weapon'; weapon: WeaponDef; price: number; sold: boolean }
  | { kind: 'item'; item: ItemDef; price: number; sold: boolean };

export interface ShopState {
  offers: ShopOffer[];
  rerollCost: number;
  rerollCount: number;
}

function rarityRoll(wave: number, luck: number): 1 | 2 | 3 | 4 {
  // higher waves and luck shift the distribution up
  const bonus = wave * 0.018 + luck * 0.004;
  const r = rand();
  if (r < 0.04 + bonus * 0.8) return 4;
  if (r < 0.15 + bonus * 1.5) return 3;
  if (r < 0.45 + bonus) return 2;
  return 1;
}

function priceScale(wave: number): number {
  return 1 + (wave - 1) * 0.12;
}

/** Weapons available in the shop: not evolved, not meta-locked. */
export function availableShopWeapons(player: Player): WeaponDef[] {
  return WEAPONS.filter((w) => !w.evolved && player.canUseWeapon(w) && (!w.unlockCost || player.profile.isUnlocked(w.id)));
}

/** A duplicate purchase merges into a higher tier — price scales with the target tier. */
export function effectivePrice(offer: ShopOffer, player: Player): number {
  if (offer.kind !== 'weapon') return offer.price;
  const owned = player.weapons.filter((w) => w.def.id === offer.weapon.id && w.tier < MAX_TIER);
  if (owned.length === 0) return offer.price;
  const target = Math.min(...owned.map((w) => w.tier)) + 1;
  return offer.price * target;
}

/** Target tier when buying this weapon offer, or 1 for a fresh slot. */
export function mergeTarget(offer: ShopOffer, player: Player): number {
  if (offer.kind !== 'weapon') return 0;
  const owned = player.weapons.filter((w) => w.def.id === offer.weapon.id && w.tier < MAX_TIER);
  return owned.length === 0 ? 1 : Math.min(...owned.map((w) => w.tier)) + 1;
}

function rollOffer(wave: number, player: Player): ShopOffer {
  // only weapons the player can actually take: a free slot, or a mergeable duplicate
  const takeable = availableShopWeapons(player).filter(
    (w) => player.canAddWeapon() || player.weapons.some((o) => o.def.id === w.id && o.tier < MAX_TIER),
  );
  const wantWeapon = takeable.length > 0 && chance(0.45);
  if (wantWeapon) {
    let candidates = takeable;
    if (player.character.weaponClass === 'all') {
      const mergeable = takeable.filter((w) => player.weapons.some((o) => o.def.id === w.id && o.tier < MAX_TIER));
      const fresh = takeable.filter((w) => !player.weapons.some((o) => o.def.id === w.id));
      if (mergeable.length > 0 && fresh.length > 0) candidates = chance(0.6) ? mergeable : fresh;
      else if (mergeable.length > 0) candidates = mergeable;
      else if (fresh.length > 0) candidates = fresh;
    }
    const weapon = pick(candidates);
    return { kind: 'weapon', weapon, price: Math.round(weapon.price * priceScale(wave)), sold: false };
  }
  const rarity = rarityRoll(wave, player.stats.luck);
  let candidates = ITEMS.filter((i) => i.rarity === rarity);
  if (candidates.length === 0) candidates = [...ITEMS];
  const item = pickWeighted(candidates.map((i) => ({ ...i, weight: i.weight ?? 1 })));
  return { kind: 'item', item, price: Math.round(item.basePrice * priceScale(wave)), sold: false };
}

/** Battlefield chest loot: same pool as the shop, slight weapon bias. */
export function rollChestLoot(wave: number, player: Player): ShopOffer {
  return rollOffer(wave, player);
}

export function rollShop(wave: number, player: Player, prev?: ShopState): ShopState {
  return {
    offers: Array.from({ length: 4 }, () => rollOffer(wave, player)),
    rerollCost: prev ? prev.rerollCost : Math.max(2, Math.round(2 + wave * 0.8)),
    rerollCount: prev ? prev.rerollCount : 0,
  };
}

export function reroll(shop: ShopState, wave: number, player: Player): boolean {
  if (player.materials < shop.rerollCost) return false;
  player.materials -= shop.rerollCost;
  shop.rerollCount++;
  const next = rollShop(wave, player);
  shop.offers = next.offers;
  shop.rerollCost = Math.max(2, Math.round((2 + wave * 0.8) * (1 + shop.rerollCount * 0.5)));
  return true;
}
