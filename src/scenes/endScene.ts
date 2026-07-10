import type { Game, Scene } from '../game';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon } from '../render/icons';
import { drawSprite, drawShadow } from '../render/sprites';
import { playSfx } from '../render/audio';
import { addShards, recordRun } from '../core/save';
import { FINAL_WAVE } from '../config';
import type { CharacterDef } from '../data/characters';
import { t as tt } from '../core/i18n';
import { displayFont } from '../render/font';
import { menuScene } from './menu';
import { runScene } from './run';

class EndScene implements Scene {
  won = false;
  private wave = 1;
  private level = 1;
  private kills = 0;
  private character: CharacterDef | null = null;
  private shardsEarned = 0;
  private canContinue = false;
  private action: 'menu' | 'retry' | 'endless' | null = null;

  enter(game: Game, won: boolean): void {
    this.won = won;
    this.wave = game.state.wave;
    this.level = game.state.player.level;
    this.kills = game.state.kills;
    this.character = game.state.player.character;
    this.canContinue = won && game.state.wave === FINAL_WAVE;
    this.shardsEarned = Math.round((this.wave * 3 + Math.floor(this.kills / 10) + (won ? 50 : 0)) * game.state.difficulty.shardMult);
    addShards(this.shardsEarned);
    recordRun(this.wave, this.kills, won);
    playSfx(won ? 'win' : 'lose');
  }

  update(game: Game, _dt: number): void {
    if (!this.action) return;
    const a = this.action;
    this.action = null;
    if (a === 'endless') {
      // keep the whole run state, just move on to wave 11
      game.state.wave++;
      runScene.enterWave(game);
      game.setScene(runScene);
    } else if (a === 'retry' && this.character) {
      game.newRun(this.character);
      runScene.enterWave(game);
      game.setScene(runScene);
    } else {
      game.setScene(menuScene);
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 520, 480, (w, h, ui) => this.renderContent(ctx, w, h, ui));
  }

  private renderContent(ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const t = performance.now() / 1000;
    sceneBackground(ctx, w, h, this.won ? '#14241a' : '#241418', '#0a0a10');

    // celebration: falling confetti on win, drifting ash on defeat (deterministic, zero-alloc)
    if (this.won) {
      const COLORS = ['#ffd23e', '#8be9fd', '#8dff9a', '#f070a8', '#b18cff'];
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 733) % 997) / 997;
        const speed = 60 + ((i * 271) % 70);
        const x = sx * w + Math.sin(t * 1.4 + i * 1.7) * 40;
        const y = ((sx * 1000 + t * speed + i * 137) % (h + 40)) - 20;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(x, y);
        ctx.rotate(t * (2 + (i % 4)) + i);
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.restore();
      }
    } else {
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 733) % 997) / 997;
        const speed = 18 + ((i * 271) % 20);
        const x = sx * w + Math.sin(t * 0.6 + i * 2.1) * 30;
        const y = h - (((t * speed + i * 431) % (h + 60)) - 30);
        ctx.globalAlpha = 0.2 + 0.15 * Math.sin(t * 2 + i);
        ctx.fillStyle = i % 4 === 0 ? '#b06a4a' : '#5a5a66';
        ctx.fillRect(x, y, 2 + (i % 2), 2 + (i % 2));
      }
      ctx.globalAlpha = 1;
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const cx = w / 2;
    panel(ctx, cx - 220, h / 2 - 210, 440, 420, { radius: 20, glow: this.won ? '#8dff9a33' : '#ff547033' });

    drawIcon(ctx, this.won ? 'i_trophy' : 'i_skull', cx, h / 2 - 140, 70);
    ctx.save();
    ctx.shadowColor = this.won ? '#8dff9a88' : '#ff547088';
    ctx.shadowBlur = 24;
    ctx.fillStyle = this.won ? '#8dff9a' : '#ff6b6b';
    ctx.font = displayFont(26);
    ctx.fillText(this.won ? tt('end.win') : tt('end.lose'), cx, h / 2 - 68);
    ctx.restore();

    // run stats
    if (this.character) {
      drawShadow(ctx, cx - 130, h / 2 + 18, 40);
      drawSprite(ctx, this.character.sprite, cx - 130, h / 2 - 2, 52, { squash: Math.sin(t * 3) * 0.03 });
    }
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const lines: [string, string][] = [
      ['🌊', tt('end.wave', this.wave, FINAL_WAVE)],
      ['⭐', tt('end.level', this.level)],
      ['💀', tt('end.kills', this.kills)],
      ['💠', tt('end.shards', this.shardsEarned)],
    ];
    lines.forEach(([icon, text], i) => {
      const y = h / 2 - 28 + i * 30;
      drawIcon(ctx, icon, cx - 70, y, 18);
      ctx.fillStyle = '#ccccdd';
      ctx.fillText(text, cx - 46, y + 1);
    });

    ctx.textAlign = 'center';
    if (this.canContinue) {
      if (button(ctx, ui, cx - 180, h / 2 + 76, 360, 52, tt('end.endless'), { primary: true })) {
        this.action = 'endless';
      }
      if (button(ctx, ui, cx - 180, h / 2 + 138, 170, 44, tt('end.retry'))) this.action = 'retry';
      if (button(ctx, ui, cx + 10, h / 2 + 138, 170, 44, tt('end.menu'))) this.action = 'menu';
    } else {
      if (button(ctx, ui, cx - 180, h / 2 + 80, 170, 52, tt('end.retry'), { primary: true })) this.action = 'retry';
      if (button(ctx, ui, cx + 10, h / 2 + 80, 170, 52, tt('end.menu'))) this.action = 'menu';
    }

    ctx.fillStyle = '#667';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      this.won ? tt('end.winFlavor') : tt('end.loseFlavor'),
      cx,
      h / 2 + (this.canContinue ? 198 : 168),
    );
  }
}

export const endScene = new EndScene();
