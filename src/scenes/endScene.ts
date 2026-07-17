import type { Game, Scene } from '../game';
import { button, dimBackground, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
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
import { continueToNextWave, progressionScene } from './progressionScene';
import { GuestSession, HostSession } from '../multiplayer/session';

class EndScene implements Scene {
  won = false;
  private wave = 1;
  private level = 1;
  private kills = 0;
  private character: CharacterDef | null = null;
  private shardsEarned = 0;
  private canContinue = false;
  private action: 'menu' | 'retry' | 'endless' | null = null;
  private transitioning = false;
  private connectionExit = false;

  enter(game: Game, won: boolean): void {
    this.won = won;
    this.wave = game.state.wave;
    this.level = game.state.squad.level;
    this.kills = game.state.kills;
    this.character = game.localPlayer.character;
    this.canContinue = won && game.state.wave === FINAL_WAVE;
    this.action = null;
    this.transitioning = false;
    this.connectionExit = false;
    this.shardsEarned = Math.round((this.wave * 3 + Math.floor(this.kills / 10) + (won ? 50 : 0)) * game.state.difficulty.shardMult);
    addShards(this.shardsEarned);
    recordRun(this.wave, this.kills, won);
    const session = game.networkSession;
    if (session instanceof HostSession && session.sessionId) {
      const phaseRevision = session.nextPhaseRevision();
      void session.publishEnd({
        sessionId: session.sessionId,
        resultId: crypto.randomUUID(),
        wave: this.wave,
        kills: this.kills,
        won,
        difficultyId: game.state.difficulty.id,
        shardsEarned: this.shardsEarned,
      }).then(() => {
        session.publishPhase({
          version: 1,
          phase: 'end',
          phaseRevision,
          won,
        });
      }).catch(() => {
        // The session reports transport failures through its connection state.
      });
    }
    playSfx(won ? 'win' : 'lose');
  }

  enterRemote(game: Game, won: boolean): void {
    const result = game.networkSession instanceof GuestSession
      ? game.networkSession.lastEndResult
      : null;
    this.won = result?.won ?? won;
    this.wave = result?.wave ?? game.state.wave;
    this.level = game.state.squad.level;
    this.kills = result?.kills ?? game.state.kills;
    this.character = game.localPlayer.character;
    this.shardsEarned = result?.shardsEarned ?? 0;
    this.canContinue = false;
    this.action = null;
    this.transitioning = false;
    this.connectionExit = false;
  }

  update(game: Game, _dt: number): void {
    const networkSession = game.networkSession;
    if (networkSession instanceof GuestSession && networkSession.returnToMenuRequested) {
      game.networkSession = null;
      game.sessionRole = 'solo';
      void networkSession.close();
      game.setScene(menuScene, true);
      return;
    }
    if (networkSession?.status === 'connection-lost') {
      if (this.connectionExit) {
        this.connectionExit = false;
        game.networkSession = null;
        game.sessionRole = 'solo';
        void networkSession.close();
        game.setScene(menuScene, true);
      }
      return;
    }
    if (networkSession instanceof GuestSession) {
      const phase = networkSession.phaseState;
      if (phase?.phase === 'progression') {
        progressionScene.enterRemote(game, phase);
        game.setScene(progressionScene, true);
        return;
      }
      if (phase?.phase === 'run') {
        game.state.wave = phase.wave;
        runScene.enterWave(game);
        game.setScene(runScene, true);
        return;
      }
    }
    if (this.transitioning) return;
    if (!this.action) return;
    const a = this.action;
    this.action = null;
    if (a === 'endless') {
      // Keep the run state and pass through the next-wave progression first.
      continueToNextWave(game);
    } else if (a === 'retry' && networkSession instanceof HostSession) {
      this.transitioning = true;
      void networkSession.restartRun(game).then((started) => {
        if (started) {
          runScene.enterWave(game);
          game.setScene(runScene, true);
        }
      }).catch(() => {
        // Peer loss is rendered from the session connection state.
      }).finally(() => {
        this.transitioning = false;
      });
    } else if (a === 'retry' && this.character) {
      game.newRun(this.character);
      runScene.enterWave(game);
      game.setScene(runScene);
    } else if (a === 'menu' && networkSession instanceof HostSession) {
      this.transitioning = true;
      game.networkSession = null;
      game.sessionRole = 'solo';
      void networkSession.requestReturnToMenu().catch(() => {
        // A failed graceful close falls back to the normal peer-leave path.
      }).finally(() => {
        void networkSession.close();
        game.setScene(menuScene, true);
        this.transitioning = false;
      });
    } else {
      const session = game.networkSession;
      game.networkSession = null;
      game.sessionRole = 'solo';
      if (session) void session.close();
      game.setScene(menuScene);
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 520, 480, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
    if (game.networkSession?.status === 'connection-lost') {
      const w = game.width;
      const h = game.height;
      dimBackground(ctx, w, h);
      panel(ctx, w / 2 - 220, h / 2 - 100, 440, 200, { radius: 18, border: '#ff547066' });
      ctx.fillStyle = '#ff7080';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tt('coop.connectionLost'), w / 2, h / 2 - 42);
      if (button(ctx, game.ui, w / 2 - 120, h / 2 + 20, 240, 50, tt('coop.leave'))) {
        this.connectionExit = true;
      }
    }
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
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
    if (game.sessionRole === 'guest') {
      if (button(ctx, ui, cx - 180, h / 2 + 80, 360, 52, tt('end.menu'), { primary: true })) this.action = 'menu';
    } else if (this.canContinue) {
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
