import type { Game, Scene } from '../game';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon } from '../render/icons';
import { t as tt } from '../core/i18n';
import { menuScene } from './menu';
import { displayFont } from '../render/font';

/** [icon, stat key, desc key] resolved through t() at render time. */
const STAT_INFO: [string, string, string][] = [
  ['i_heart', 'st.maxHp', 'sd.maxHp'],
  ['i_regen', 'st.hpRegen', 'sd.hpRegen'],
  ['i_sword', 'st.damagePct', 'sd.damagePct'],
  ['i_aspd', 'st.attackSpeedPct', 'sd.attackSpeedPct'],
  ['i_speed', 'st.moveSpeed', 'sd.moveSpeed'],
  ['i_armor', 'st.armor', 'sd.armor'],
  ['i_crit', 'st.critChance', 'sd.critChance'],
  ['i_magnet', 'st.pickupRange', 'sd.pickupRange'],
  ['i_luck', 'st.luck', 'sd.luck'],
];

const EXTRA_INFO: [string, string, string][] = [
  ['i_gem', 'ex.gem', 'ex.gemD'],
  ['i_shard', 'ex.shard', 'ex.shardD'],
  ['w_sword', 'ex.tiers', 'ex.tiersD'],
  ['i_planet', 'ex.evo', 'ex.evoD'],
];

class InfoScene implements Scene {
  private back = false;

  update(game: Game, _dt: number): void {
    if (this.back) {
      this.back = false;
      game.setScene(menuScene);
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 1040, 620, (w, h, ui) => this.renderContent(ctx, w, h, ui));
  }

  private renderContent(ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    sceneBackground(ctx, w, h, '#1a1c28', '#0a0a10');
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.shadowColor = '#8be9fd44';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(21);
    ctx.textAlign = 'center';
    ctx.fillText(tt('info.title'), w / 2, 50);
    ctx.restore();

    const colW = 470;
    const rowH = 42;
    const startY = Math.max(100, h / 2 - ((STAT_INFO.length * rowH + 90) / 2));

    // левая колонка: характеристики
    const lx = w / 2 - colW - 20;
    panel(ctx, lx, startY - 16, colW, STAT_INFO.length * rowH + 46, { radius: 16 });
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tt('info.stats'), lx + 20, startY + 6);
    STAT_INFO.forEach(([icon, name, desc], i) => {
      const y = startY + 40 + i * rowH;
      drawIcon(ctx, icon, lx + 32, y, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(tt(name), lx + 52, y - 8);
      ctx.fillStyle = '#9a9ab4';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(tt(desc), lx + 52, y + 10);
    });

    // правая колонка: экономика и оружие
    const rx = w / 2 + 20;
    panel(ctx, rx, startY - 16, colW, EXTRA_INFO.length * rowH + 46, { radius: 16 });
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(tt('info.economy'), rx + 20, startY + 6);
    EXTRA_INFO.forEach(([icon, name, desc], i) => {
      const y = startY + 40 + i * rowH;
      drawIcon(ctx, icon, rx + 32, y, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(tt(name), rx + 52, y - 8);
      ctx.fillStyle = '#9a9ab4';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(tt(desc), rx + 52, y + 10);
    });

    // подсказки под правой колонкой
    const ty = startY - 16 + EXTRA_INFO.length * rowH + 66;
    panel(ctx, rx, ty, colW, 118, { radius: 16 });
    ctx.fillStyle = '#8dff9a';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(tt('info.tips'), rx + 20, ty + 24);
    ctx.fillStyle = '#9a9ab4';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(tt('info.tip1'), rx + 20, ty + 50);
    ctx.fillText(tt('info.tip2'), rx + 20, ty + 72);
    ctx.fillText(tt('info.tip3'), rx + 20, ty + 94);

    if (button(ctx, ui, 20, 20, 110, 42, tt('hero.back'))) this.back = true;
  }
}

export const infoScene = new InfoScene();
