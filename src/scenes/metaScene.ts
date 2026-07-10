import type { Game, Scene } from '../game';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon, weaponIcon } from '../render/icons';
import { PERKS } from '../data/perks';
import { WEAPONS } from '../data/weapons';
import { STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { loadMeta, perkLevel, tryBuyPerk, isUnlocked, tryUnlock } from '../core/save';
import { playSfx } from '../render/audio';
import { t as tt, tn } from '../core/i18n';
import { menuScene } from './menu';
import { displayFont } from '../render/font';
import { CLASS_DEFS, WEAPON_CLASS, type WeaponClassId } from '../data/sets';

const CARD_W = 240;
const CARD_H = 190;
const GAP = 20;

class MetaScene implements Scene {
  private pending: (() => void) | null = null;
  private back = false;
  private unlockClass: WeaponClassId = 'gunner';

  update(game: Game, _dt: number): void {
    if (this.back) {
      this.back = false;
      game.setScene(menuScene);
      return;
    }
    if (this.pending) {
      const act = this.pending;
      this.pending = null;
      act();
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 1100, 680, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    sceneBackground(ctx, w, h, '#221c28', '#0d0a10');
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.shadowColor = '#b18cff55';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(21);
    ctx.textAlign = 'center';
    ctx.fillText(tt('meta.title'), w / 2, 52);
    ctx.restore();

    // shard balance
    const meta = loadMeta();
    panel(ctx, w / 2 - 80, 76, 160, 36, { radius: 18 });
    drawIcon(ctx, 'i_shard', w / 2 - 52, 94, 18);
    ctx.fillStyle = '#b18cff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${meta.shards}`, w / 2 - 34, 95);
    ctx.fillStyle = '#9a9ab4';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tt('meta.sub'), w / 2, 132);

    // ── perks row ──
    const perkTotal = PERKS.length * CARD_W + (PERKS.length - 1) * GAP;
    const py = 170;
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tt('meta.perks'), w / 2 - perkTotal / 2, py - 12);
    PERKS.forEach((perk, i) => {
      const x = w / 2 - perkTotal / 2 + i * (CARD_W + GAP);
      const lvl = perkLevel(perk.id);
      const maxLvl = perk.costs.length;
      const maxed = lvl >= maxLvl;
      panel(ctx, x, py, CARD_W, CARD_H, { radius: 14, border: maxed ? '#ffd23e' : '#ffffff22' });
      drawIcon(ctx, perk.emoji, x + CARD_W / 2, py + 40, 34);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tn('p', perk.id, perk.name), x + CARD_W / 2, py + 76);
      // level pips
      for (let l = 0; l < maxLvl; l++) {
        ctx.fillStyle = l < lvl ? '#ffd23e' : '#ffffff22';
        ctx.beginPath();
        ctx.arc(x + CARD_W / 2 + (l - (maxLvl - 1) / 2) * 18, py + 98, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#9fdca0';
      const mods = Object.entries(perk.perLevel)
        .map(([k, v]) => `${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, v as number)}${tt('meta.perLevel')}`)
        .join(', ');
      ctx.fillText(mods, x + CARD_W / 2, py + 118);
      const label = maxed ? tt('meta.maxed') : `${perk.costs[lvl]}`;
      if (
        button(ctx, ui, x + 24, py + CARD_H - 48, CARD_W - 48, 34, label, {
          enabled: !maxed && meta.shards >= perk.costs[lvl],
          icon: maxed ? undefined : 'i_shard',
        })
      ) {
        this.pending = () => {
          if (tryBuyPerk(perk.id, perk.costs[lvl], maxLvl)) playSfx('buy');
        };
      }
    });

    // ── unlockable weapons row ──
    const unlockables = WEAPONS.filter((wd) => wd.unlockCost && WEAPON_CLASS[wd.id] === this.unlockClass);
    const uy = py + CARD_H + 44;
    const uTotal = unlockables.length * CARD_W + (unlockables.length - 1) * GAP;
    ctx.fillStyle = '#f0a03c';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tt('meta.unlocks'), w / 2 - uTotal / 2, uy - 12);
    const classIds: WeaponClassId[] = ['gunner', 'blade', 'arcane'];
    const tabW = 156;
    const tabGap = 10;
    const tabsW = classIds.length * tabW + (classIds.length - 1) * tabGap;
    classIds.forEach((id, i) => {
      const cls = CLASS_DEFS[id];
      if (button(ctx, ui, w / 2 - tabsW / 2 + i * (tabW + tabGap), uy + 2, tabW, 32, tn('s', cls.id, cls.name), { primary: id === this.unlockClass, fontSize: 12 })) {
        this.unlockClass = id;
      }
    });
    const cardsY = uy + 44;
    unlockables.forEach((wd, i) => {
      const x = w / 2 - uTotal / 2 + i * (CARD_W + GAP);
      const owned = isUnlocked(wd.id);
      panel(ctx, x, cardsY, CARD_W, CARD_H - 30, { radius: 14, border: owned ? '#8dff9a' : '#ffffff22' });
      drawIcon(ctx, weaponIcon(wd.id), x + CARD_W / 2, cardsY + 40, 34);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tn('w', wd.id, wd.name), x + CARD_W / 2, cardsY + 76);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#ccccdd';
      const desc = wd.behavior === 'orbit'
        ? tt('shop.dmgTick', wd.damage)
        : wd.behavior === 'zone' && wd.zone
          ? tt('shop.dmgTick', Math.round(wd.damage * wd.zone.tickDamageScale))
          : wd.behavior === 'summon' && wd.summon
            ? tt('shop.dmgCd', wd.damage, wd.summon.hitCooldown)
            : tt('shop.dmgCd', wd.damage, wd.cooldown);
      ctx.fillText(desc, x + CARD_W / 2, cardsY + 98);
      const label = owned ? tt('meta.opened') : `${wd.unlockCost}`;
      if (
        button(ctx, ui, x + 24, cardsY + CARD_H - 30 - 48, CARD_W - 48, 34, label, {
          enabled: !owned && meta.shards >= wd.unlockCost!,
          icon: owned ? undefined : 'i_shard',
        })
      ) {
        this.pending = () => {
          if (tryUnlock(wd.id, wd.unlockCost!)) playSfx('buy');
        };
      }
    });

    ctx.fillStyle = '#667';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tt('meta.heroes'), w / 2, cardsY + CARD_H - 30 + 26);

    if (button(ctx, ui, 20, 20, 110, 42, tt('hero.back'))) this.back = true;
  }
}

export const metaScene = new MetaScene();
