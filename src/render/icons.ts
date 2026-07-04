import { SPRITES, drawSprite } from './sprites';
import { drawGlyph } from './glyphCache';

/** Standard emoji → custom pixel-art icon sprite. */
const EMOJI_TO_SPRITE: Record<string, string> = {
  '💎': 'i_gem',
  '💠': 'i_shard',
  '💀': 'i_skull',
  '❤️': 'i_heart',
  '💖': 'i_heartbig',
  '💚': 'i_regen',
  '🩹': 'i_bandage',
  '⚔️': 'i_sword',
  '🗡️': 'i_sword',
  '⚡': 'i_aspd',
  '🌩️': 'i_aspd',
  '💨': 'i_speed',
  '👟': 'i_speed',
  '🛡️': 'i_armor',
  '🦀': 'i_armor',
  '🏰': 'i_armor',
  '🎯': 'i_crit',
  '👁️': 'i_crit',
  '🔭': 'i_scope',
  '🧲': 'i_magnet',
  '🍀': 'i_luck',
  '🎰': 'i_luck',
  '🔮': 'i_orb',
  '🪐': 'i_planet',
  '⛓️': 'i_flail',
  '🍎': 'i_apple',
  '🪨': 'i_stone',
  '☕': 'i_coffee',
  '🥩': 'i_steak',
  '😡': 'i_rage',
  '😤': 'i_rage',
  '🔥': 'i_rage',
  '💥': 'i_rage',
  '💪': 'i_heart',
  '🧬': 'i_regen',
  '🩸': 'i_regen',
  '🔋': 'i_battery',
  '👑': 'i_crown',
  '🧪': 'i_potion',
  '⭐': 'i_star',
  '🏆': 'i_trophy',
  '🔒': 'i_lock',
  '🌊': 'i_wave',
  '🎲': 'i_dice',
};

/** Held/card icon for a weapon by its def id. */
const WEAPON_ICONS: Record<string, string> = {
  pistol: 'w_pistol',
  smg: 'w_smg',
  sword: 'w_sword',
  crossbow: 'w_crossbow',
  railgun: 'w_railgun',
  stormgun: 'w_stormgun',
  stormblade: 'w_stormblade',
  orbs: 'i_orb',
  flail: 'i_flail',
  singularity: 'i_planet',
  deathsting: 'w_deathsting',
  doomflail: 'i_flail',
  annihilator: 'w_annihilator',
  hurricane: 'w_hurricane',
  cyclone: 'w_stormblade',
  blackhole: 'i_planet',
};

export function weaponIcon(defId: string): string {
  return WEAPON_ICONS[defId] ?? 'i_sword';
}

/**
 * Draws a pixel icon for the given key (emoji, sprite name, or weapon id).
 * Falls back to the emoji glyph if there is no custom asset.
 */
export function drawIcon(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, size: number): void {
  const sprite = SPRITES[key] ? key : (WEAPON_ICONS[key] ?? EMOJI_TO_SPRITE[key]);
  if (sprite) {
    // fit the LONGEST side into `size` (wide sprites like swords would overflow otherwise)
    const grid = SPRITES[sprite].frames[0];
    const rows = grid.length;
    const cols = Math.max(...grid.map((r) => r.length));
    const targetH = cols > rows ? Math.max(4, Math.round((size * rows) / cols)) : size;
    drawSprite(ctx, sprite, x, y, targetH);
  } else {
    drawGlyph(ctx, key, x, y, size);
  }
}
