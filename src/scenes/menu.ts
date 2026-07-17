import type { Game, Scene } from '../game';
import { button, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawSprite, drawShadow } from '../render/sprites';
import { CHARACTERS } from '../data/characters';
import { ensureAudio, toggleMute, toggleMusic, isMuted, isMusicOn } from '../render/audio';
import { isTouchDevice } from '../core/input';
import { t as tt, tn, getLang, setLang, LANGS } from '../core/i18n';
import { displayFont } from '../render/font';
import { charSelectScene } from './charSelect';
import { metaScene } from './metaScene';
import { infoScene } from './infoScene';
import { loadMeta } from '../core/save';
import { lobbyScene } from './lobbyScene';

const WALKERS = ['chaser', 'runner', 'tank', 'shooter'];

/** Red "off" slash over a toggle button. */
function drawSlash(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = '#e64553';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 12, y + h - 11);
  ctx.lineTo(x + w - 12, y + 11);
  ctx.stroke();
  ctx.restore();
}

class MenuScene implements Scene {
  private goCharSelect = false;
  private goMeta = false;
  private goInfo = false;
  private goCoop = false;
  private toggles: { mute?: boolean; music?: boolean } = {};
  private langOpen = false;

  update(game: Game, _dt: number): void {
    if (game.ui.clicked) ensureAudio();
    if (this.goCharSelect) {
      this.goCharSelect = false;
      game.setScene(charSelectScene);
      return;
    }
    if (this.goMeta) {
      this.goMeta = false;
      game.setScene(metaScene);
      return;
    }
    if (this.goInfo) {
      this.goInfo = false;
      game.setScene(infoScene);
      return;
    }
    if (this.goCoop) {
      this.goCoop = false;
      game.setScene(lobbyScene);
      return;
    }
    if (this.toggles.mute) {
      this.toggles.mute = false;
      toggleMute();
    }
    if (this.toggles.music) {
      this.toggles.music = false;
      toggleMusic();
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 1000, 560, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const t = performance.now() / 1000;
    sceneBackground(ctx, w, h, '#1c1a28', '#0a0a10');

    // parallax silhouette layers: distant hills drifting slowly
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer === 0 ? 3 : 7;
      const base = h * (layer === 0 ? 0.8 : 0.88);
      const amp = layer === 0 ? 46 : 30;
      const drift = (t * speed) % (w + 400);
      ctx.fillStyle = layer === 0 ? '#141322' : '#1b1a2e';
      ctx.beginPath();
      ctx.moveTo(-10, h);
      for (let x = -10; x <= w + 10; x += 40) {
        const u = (x + drift) * 0.008;
        ctx.lineTo(x, base - (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + layer * 5) * 0.4) * amp);
      }
      ctx.lineTo(w + 10, h);
      ctx.closePath();
      ctx.fill();
    }

    // drifting golden embers
    for (let i = 0; i < 42; i++) {
      const seedX = ((i * 733) % 997) / 997;
      const speed = 14 + ((i * 271) % 23);
      const ex = seedX * w + Math.sin(t * 0.7 + i * 1.9) * 26;
      const ey = h - (((t * speed + i * 431) % (h + 60)) - 30);
      const pulse = 0.25 + 0.2 * Math.sin(t * 2 + i * 2.4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = i % 3 === 0 ? '#ffd23e' : '#8be9fd';
      const s = 2 + (i % 3);
      ctx.fillRect(ex, ey, s, s);
    }
    ctx.globalAlpha = 1;

    // parade of enemies walking along the very bottom edge
    for (let i = 0; i < WALKERS.length * 2; i++) {
      const name = WALKERS[i % WALKERS.length];
      const speed = 40 + (i % 3) * 14;
      const x = ((t * speed + i * 260) % (w + 200)) - 100;
      const y = h - 48 - (i % 2) * 14;
      const squash = Math.sin(t * 9 + i) * 0.05;
      drawShadow(ctx, x, y + 20, 40);
      drawSprite(ctx, name, x, y, 42, { squash });
    }

    // logo: bobbing potato above the title
    const titleY = h * 0.24;
    drawShadow(ctx, w / 2, titleY - 64, 52);
    drawSprite(ctx, 'potato', w / 2, titleY - 92 + Math.sin(t * 2) * 5, 64, { squash: Math.sin(t * 2) * 0.04 });

    // title with layered glow
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = '#ffd23e';
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#ffd23e';
    ctx.font = displayFont(36);
    ctx.fillText('ARENA SURVIVORS', w / 2, titleY + Math.sin(t * 1.5) * 3);
    ctx.shadowBlur = 0;
    const grad = ctx.createLinearGradient(0, titleY - 30, 0, titleY + 30);
    grad.addColorStop(0, '#ffe9a0');
    grad.addColorStop(1, '#f0a03c');
    ctx.fillStyle = grad;
    ctx.fillText('ARENA SURVIVORS', w / 2, titleY + Math.sin(t * 1.5) * 3);
    ctx.restore();

    // thin divider under the title
    ctx.strokeStyle = '#ffd23e44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 280, titleY + 48);
    ctx.lineTo(w / 2 + 280, titleY + 48);
    ctx.stroke();
    ctx.fillStyle = '#8a8aa6';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(tt('menu.tagline'), w / 2, titleY + 70);

    // button stack
    const by = h * 0.45;
    if (button(ctx, ui, w / 2 - 140, by, 280, 62, tt('menu.play'), { primary: true, fontSize: 21 })) {
      this.goCharSelect = true;
    }
    const shards = loadMeta().shards;
    if (button(ctx, ui, w / 2 - 140, by + 74, 280, 48, tt('menu.coop'))) {
      this.goCoop = true;
    }
    if (button(ctx, ui, w / 2 - 140, by + 134, 280, 48, tt('menu.workshop', shards), { icon: 'i_shard' })) {
      this.goMeta = true;
    }

    // controls hint
    ctx.fillStyle = '#667';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isTouchDevice() ? tt('menu.hintTouch') : tt('menu.hint'), w / 2, by + 198);

    // records line
    const st = loadMeta().stats;
    if (st.runs > 0) {
      ctx.fillStyle = '#8a8aa6';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(tt('menu.records', st.runs, st.wins, st.bestWave, st.bestKills), w / 2, by + 220);
    }

    // version
    ctx.fillStyle = '#444455';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('v1.0', 14, h - 16);
    ctx.textAlign = 'center';

    // heroes on a podium row, safely below the hint
    const heroes = CHARACTERS;
    const hy = Math.max(by + 252, h * 0.79);
    heroes.forEach((c, i) => {
      const x = w * 0.5 + (i - (heroes.length - 1) / 2) * 96;
      drawShadow(ctx, x, hy + 30, 44);
      drawSprite(ctx, c.sprite, x, hy, 58, { squash: Math.sin(t * 3 + i * 1.4) * 0.03, flip: i > 1 });
      ctx.fillStyle = '#9a9ab4';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(tn('c', c.id, c.name), x, hy + 50);
    });

    // sound toggles + info: pixel icons, red slash when off
    if (button(ctx, ui, w - 174, 16, 48, 40, '?', { fontSize: 19 })) this.goInfo = true;
    if (button(ctx, ui, w - 118, 16, 48, 40, '', { icon: 'i_sound' })) this.toggles.mute = true;
    if (isMuted()) drawSlash(ctx, w - 118, 16, 48, 40);
    if (button(ctx, ui, w - 62, 16, 48, 40, '', { icon: 'i_music' })) this.toggles.music = true;
    if (!isMusicOn()) drawSlash(ctx, w - 62, 16, 48, 40);

    // language dropdown (drawn last so the open list sits on top)
    const lx = w - 244;
    if (button(ctx, ui, lx, 16, 62, 40, getLang().toUpperCase(), { fontSize: 13, icon: 'i_lang' })) {
      this.langOpen = !this.langOpen;
    }
    if (this.langOpen) {
      LANGS.forEach((l, i) => {
        const y = 62 + i * 44;
        const active = l.code === getLang();
        if (button(ctx, ui, lx - 40, y, 102, 40, l.native, { fontSize: 14, primary: active })) {
          setLang(l.code);
          this.langOpen = false;
        }
      });
    }
  }
}

export const menuScene = new MenuScene();
