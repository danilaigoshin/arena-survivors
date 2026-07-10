import type { Game, Scene } from '../game';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon, weaponIcon } from '../render/icons';
import { rollChestLoot, type ShopOffer } from '../systems/shop';
import { ITEMS, type ItemDef } from '../data/items';
import { MAX_TIER, TIER_NAMES } from '../data/weapons';
import { WeaponInstance } from '../entities/weapon';
import { STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { pick } from '../core/rng';
import { playSfx } from '../render/audio';
import { t as tt, tn } from '../core/i18n';
import { runScene } from './run';

export type EventKind = 'chest' | 'altar';

/**
 * Between-waves random event: a free chest or a blood altar.
 * After the choice a single "В БОЙ" button moves on to the next wave.
 */
class EventScene implements Scene {
  private kind: EventKind = 'chest';
  private loot: ShopOffer | null = null;
  private altarItem: ItemDef | null = null;
  private resolved = false;
  private resultText = '';
  private action: 'take' | 'scrap' | 'sacrifice' | 'refuse' | 'go' | null = null;

  enter(game: Game, kind: EventKind): void {
    this.kind = kind;
    this.resolved = false;
    this.resultText = '';
    this.action = null;
    if (kind === 'chest') {
      this.loot = rollChestLoot(game.state.wave, game.state.player);
    } else {
      const epics = ITEMS.filter((i) => i.rarity >= 3);
      this.altarItem = pick(epics);
    }
  }

  update(game: Game, _dt: number): void {
    const a = this.action;
    this.action = null;
    if (!a) return;
    const p = game.state.player;
    if (a === 'go') {
      game.state.wave++;
      runScene.enterWave(game);
      game.setScene(runScene);
      return;
    }
    if (this.resolved) return;
    if (a === 'take' && this.loot) {
      const r = this.loot;
      if (r.kind === 'weapon') {
        const owned = p.weapons.filter((w) => w.def.id === r.weapon.id && w.tier < MAX_TIER);
        if (owned.length > 0) {
          owned.sort((x, y) => x.tier - y.tier);
          owned[0].tier = (owned[0].tier + 1) as WeaponInstance['tier'];
          this.resultText = tt('ev.resUpgraded', tn('w', r.weapon.id, r.weapon.name), TIER_NAMES[owned[0].tier - 1]);
        } else if (p.canAddWeapon()) {
          p.weapons.push(new WeaponInstance(r.weapon, p.weapons.length));
          this.resultText = tt('ev.resAdded', tn('w', r.weapon.id, r.weapon.name));
        }
        p.recomputeStats();
      } else {
        p.addItem(r.item);
        this.resultText = tt('ev.resItem', tn('i', r.item.id, r.item.name));
      }
      playSfx('buy');
      this.resolved = true;
    } else if (a === 'scrap' && this.loot) {
      const r = this.loot;
      const v = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
      p.materials += v;
      this.resultText = tt('ev.resScrap', v);
      playSfx('buy');
      this.resolved = true;
    } else if (a === 'sacrifice' && this.altarItem) {
      const cost = Math.max(5, Math.round(p.stats.maxHp * 0.25));
      p.addUpgrade({ maxHp: -cost });
      p.hp = Math.min(p.hp, p.stats.maxHp);
      p.addItem(this.altarItem);
      this.resultText = tt('ev.resSacrifice', cost, tn('i', this.altarItem.id, this.altarItem.name));
      playSfx('hurt');
      this.resolved = true;
    } else if (a === 'refuse') {
      this.resultText = tt('ev.resRefuse');
      playSfx('click');
      this.resolved = true;
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 520, 460, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const isChest = this.kind === 'chest';
    sceneBackground(ctx, w, h, isChest ? '#221c14' : '#22141c', '#0a0a10');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const accent = isChest ? '#ffd23e' : '#ff5470';
    const pw = 440;
    const ph = 400;
    panel(ctx, w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, { radius: 20, glow: `${accent}44`, border: `${accent}66` });

    ctx.save();
    ctx.shadowColor = `${accent}88`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = accent;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(isChest ? tt('ev.chest') : tt('ev.altar'), w / 2, h / 2 - ph / 2 + 38);
    ctx.restore();

    if (isChest && this.loot) {
      const r = this.loot;
      const iconKey = r.kind === 'weapon' ? weaponIcon(r.weapon.id) : r.item.emoji;
      drawIcon(ctx, isChest ? 'chest' : iconKey, w / 2, h / 2 - 92, 44);
      drawIcon(ctx, iconKey, w / 2, h / 2 - 30, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(r.kind === 'weapon' ? tn('w', r.weapon.id, r.weapon.name) : tn('i', r.item.id, r.item.name), w / 2, h / 2 + 12);
      if (!this.resolved) {
        const p = game.state.player;
        const canTake = r.kind !== 'weapon' || p.canAddWeapon() || p.weapons.some((wi) => wi.def.id === r.weapon.id && wi.tier < MAX_TIER);
        const scrapV = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
        if (button(ctx, ui, w / 2 - 190, h / 2 + 44, 180, 46, tt('chest.take'), { primary: true, enabled: canTake })) this.action = 'take';
        if (button(ctx, ui, w / 2 + 10, h / 2 + 44, 180, 46, `+${scrapV}`, { icon: 'i_gem' })) this.action = 'scrap';
      }
    } else if (!isChest && this.altarItem) {
      drawIcon(ctx, this.altarItem.emoji, w / 2, h / 2 - 70, 46);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(tn('i', this.altarItem.id, this.altarItem.name), w / 2, h / 2 - 24);
      ctx.fillStyle = '#9fdca0';
      ctx.font = '13px system-ui, sans-serif';
      const mods = Object.entries(this.altarItem.modifiers)
        .map(([k, v]) => `${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, v as number)}`)
        .join(', ');
      ctx.fillText(mods, w / 2, h / 2);
      if (!this.resolved) {
        const cost = Math.max(5, Math.round(game.state.player.stats.maxHp * 0.25));
        ctx.fillStyle = '#e08a8a';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(tt('ev.price', cost), w / 2, h / 2 + 24);
        if (button(ctx, ui, w / 2 - 190, h / 2 + 48, 180, 46, tt('ev.sacrifice'), { primary: true })) this.action = 'sacrifice';
        if (button(ctx, ui, w / 2 + 10, h / 2 + 48, 180, 46, tt('ev.refuse'))) this.action = 'refuse';
      }
    }

    if (this.resolved) {
      ctx.fillStyle = '#9fdca0';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(this.resultText, w / 2, h / 2 + 70);
      if (button(ctx, ui, w / 2 - 130, h / 2 + 106, 260, 52, tt('shop.fight'), { primary: true })) this.action = 'go';
    }
  }
}

export const eventScene = new EventScene();
