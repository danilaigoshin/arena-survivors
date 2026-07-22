import type { Game, Scene } from '../game';
import { button, dimBackground, drawWrappedCentered, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon } from '../render/icons';
import { drawSprite, drawShadow } from '../render/sprites';
import { playSfx } from '../render/audio';
import { addShards, recordRun, type ProgressionGain } from '../core/save';
import { clearCheckpoint } from '../core/checkpoint';
import { cloneRunMetrics, type RunMetrics, type RunSummary } from '../core/runMetrics';
import { CHALLENGES } from '../data/challenges';
import { weaponById } from '../data/weapons';
import { FINAL_WAVE } from '../config';
import type { CharacterDef } from '../data/characters';
import { t as tt, tn } from '../core/i18n';
import { displayFont } from '../render/font';
import { menuScene } from './menu';
import { runScene } from './run';
import { continueToNextWave, progressionScene } from './progressionScene';
import { GuestSession, HostSession } from '../multiplayer/session';
import { routeById } from '../data/routes';

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

class EndScene implements Scene {
  won = false;
  private wave = 1;
  private level = 1;
  private kills = 0;
  private character: CharacterDef | null = null;
  private shardsEarned = 0;
  private challengeBonus = 0;
  private canContinue = false;
  private action: 'menu' | 'retry' | 'endless' | 'share' | null = null;
  private transitioning = false;
  private connectionExit = false;
  private metrics: RunMetrics | null = null;
  private progression: ProgressionGain | null = null;
  private shareStatus = '';

  enter(game: Game, won: boolean): void {
    clearCheckpoint();
    this.won = won;
    this.wave = game.state.wave;
    this.level = game.state.squad.level;
    this.kills = game.state.kills;
    this.character = game.localPlayer.character;
    this.canContinue = won && game.state.wave === FINAL_WAVE;
    this.action = null;
    this.transitioning = false;
    this.connectionExit = false;
    this.shareStatus = '';
    this.metrics = cloneRunMetrics(game.state.metrics);
    const weaponIds = [...new Set(game.state.players.flatMap((player) => player.weapons.map((weapon) => weapon.def.id)))];
    const summary: RunSummary = {
      wave: this.wave,
      level: this.level,
      kills: this.kills,
      won,
      difficultyId: game.state.difficulty.id,
      characterIds: game.state.players.map((player) => player.character.id),
      weaponIds,
      playerCount: game.state.players.length,
      metrics: this.metrics,
    };
    this.shardsEarned = Math.round((this.wave * 3 + Math.floor(this.kills / 10) + (won ? 50 : 0)) * game.state.difficulty.shardMult);
    addShards(this.shardsEarned);
    this.progression = recordRun(this.wave, this.kills, won, summary);
    this.challengeBonus = this.progression.challengeShards;

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
        level: this.level,
        characterIds: summary.characterIds,
        weaponIds: summary.weaponIds,
        playerCount: summary.playerCount,
        metrics: this.metrics,
      }).then(() => {
        session.publishPhase({ version: 1, phase: 'end', phaseRevision, won });
      }).catch(() => {
        // Connection state provides the visible failure path.
      });
    }
    playSfx(won ? 'win' : 'lose');
  }

  enterRemote(game: Game, won: boolean): void {
    const result = game.networkSession instanceof GuestSession ? game.networkSession.lastEndResult : null;
    this.won = result?.won ?? won;
    this.wave = result?.wave ?? game.state.wave;
    this.level = result?.level ?? game.state.squad.level;
    this.kills = result?.kills ?? game.state.kills;
    this.character = game.localPlayer.character;
    this.shardsEarned = result?.shardsEarned ?? 0;
    this.challengeBonus = game.networkSession instanceof GuestSession
      ? game.networkSession.lastProgressionGain?.challengeShards ?? 0
      : 0;
    this.canContinue = false;
    this.action = null;
    this.transitioning = false;
    this.connectionExit = false;
    this.metrics = cloneRunMetrics(result?.metrics ?? game.state.metrics);
    this.progression = game.networkSession instanceof GuestSession
      ? game.networkSession.lastProgressionGain
      : null;
    this.shareStatus = '';
  }

  update(game: Game): void {
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
    if (this.transitioning || !this.action) return;
    const action = this.action;
    this.action = null;
    if (action === 'share') {
      const damage = Math.round(this.metrics?.damageDealt.reduce((a, b) => a + b, 0) ?? 0);
      const result = `${this.won ? '🏆' : '💀'} Arena Survivors · ${tt('end.wave', this.wave, FINAL_WAVE)} · ${tt('end.kills', this.kills)} · ${damage} DMG`;
      void navigator.clipboard?.writeText(result).then(() => {
        this.shareStatus = tt('end.copied');
      }).catch(() => {
        this.shareStatus = result;
      });
    } else if (action === 'endless') {
      continueToNextWave(game);
    } else if (action === 'retry' && networkSession instanceof HostSession) {
      this.transitioning = true;
      void networkSession.restartRun(game).then((started) => {
        if (started) {
          runScene.enterWave(game);
          game.setScene(runScene, true);
        }
      }).catch(() => {}).finally(() => { this.transitioning = false; });
    } else if (action === 'retry' && this.character) {
      game.newRun(this.character);
      runScene.enterWave(game);
      game.setScene(runScene);
    } else if (action === 'menu' && networkSession instanceof HostSession) {
      this.transitioning = true;
      game.networkSession = null;
      game.sessionRole = 'solo';
      void networkSession.requestReturnToMenu().catch(() => {}).finally(() => {
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
    responsiveScene(ctx, game.ui, game.viewport, 860, 620, (w, h, ui) => this.renderContent(ctx, w, h, ui));
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
      if (button(ctx, game.ui, w / 2 - 120, h / 2 + 20, 240, 50, tt('coop.leave'))) this.connectionExit = true;
    }
  }

  private weaponName(id: string): string {
    if (id.startsWith('ability:')) return tt('end.abilityDamage');
    try {
      const weapon = weaponById(id);
      return tn('w', weapon.id, weapon.name);
    } catch {
      return id;
    }
  }

  private renderContent(ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const time = performance.now() / 1000;
    sceneBackground(ctx, w, h, this.won ? '#14241a' : '#241418', '#0a0a10');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const cx = w / 2;

    drawIcon(ctx, this.won ? 'i_trophy' : 'i_skull', cx - 180, 48, 54);
    ctx.fillStyle = this.won ? '#8dff9a' : '#ff7080';
    ctx.font = displayFont(24);
    ctx.fillText(this.won ? tt('end.win') : tt('end.lose'), cx, 46);
    if (button(ctx, ui, cx + 260, 22, 130, 42, tt('end.share'), { icon: 'i_star', fontSize: 12 })) this.action = 'share';

    const panelX = cx - 390;
    const panelY = 82;
    const panelW = 780;
    const panelH = h - 190;
    panel(ctx, panelX, panelY, panelW, panelH, { radius: 20, glow: this.won ? '#8dff9a22' : '#ff547022' });
    ctx.strokeStyle = '#ffffff18';
    ctx.beginPath();
    ctx.moveTo(cx, panelY + 18);
    ctx.lineTo(cx, panelY + panelH - 18);
    ctx.stroke();

    const leftX = panelX + 30;
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tt('end.summary'), leftX, panelY + 28);
    if (this.character) {
      drawShadow(ctx, leftX + 42, panelY + 92, 48);
      drawSprite(ctx, this.character.sprite, leftX + 42, panelY + 70 + Math.sin(time * 3) * 2, 58);
    }
    const metrics = this.metrics;
    const totalDamage = Math.round(metrics?.damageDealt.reduce((a, b) => a + b, 0) ?? 0);
    const totalTaken = Math.round(metrics?.damageTaken.reduce((a, b) => a + b, 0) ?? 0);
    const rows: [string, string][] = [
      ['i_wave', tt('end.wave', this.wave, FINAL_WAVE)],
      ['i_star', tt('end.level', this.level)],
      ['i_skull', tt('end.kills', this.kills)],
      ['i_aspd', tt('end.time', formatTime(metrics?.duration ?? 0))],
      ['i_sword', tt('end.damage', totalDamage)],
      ['i_heart', tt('end.taken', totalTaken)],
      ['i_gem', tt('end.materials', Math.round(metrics?.materialsCollected ?? 0))],
      ['i_trophy', tt('end.objectives', metrics?.objectivesCompleted ?? 0)],
    ];
    rows.forEach(([icon, label], index) => {
      const y = panelY + 64 + index * 35;
      drawIcon(ctx, icon, leftX + 112, y, 17);
      ctx.fillStyle = '#c8c8dc';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(label, leftX + 128, y + 1, 220);
    });
    if (!this.won && metrics?.lastDamageSource[0]) {
      ctx.fillStyle = '#ff8a98';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(tt('end.lastHit', metrics.lastDamageSource[0]), leftX, panelY + panelH - 56, 330);
    }
    ctx.fillStyle = '#b18cff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(tt('end.shardsTotal', this.shardsEarned, this.challengeBonus), leftX, panelY + panelH - 28, 330);

    const rightX = cx + 28;
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(tt('end.buildReport'), rightX, panelY + 28);
    const weaponDamage = new Map<string, number>();
    for (const byWeapon of metrics?.weaponDamage ?? []) {
      for (const [id, value] of Object.entries(byWeapon)) weaponDamage.set(id, (weaponDamage.get(id) ?? 0) + value);
    }
    const topWeapons = [...weaponDamage].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const maxDamage = Math.max(1, topWeapons[0]?.[1] ?? 1);
    topWeapons.forEach(([id, value], index) => {
      const y = panelY + 60 + index * 52;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(this.weaponName(id), rightX, y, 220);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8be9fd';
      ctx.fillText(`${Math.round(value)}`, panelX + panelW - 28, y);
      ctx.fillStyle = '#151520';
      ctx.fillRect(rightX, y + 14, 330, 8);
      ctx.fillStyle = index === 0 ? '#ffd23e' : '#8be9fd';
      ctx.fillRect(rightX, y + 14, 330 * (value / maxDamage), 8);
    });
    if (topWeapons.length === 0) {
      ctx.fillStyle = '#77778c';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(tt('end.noDamageData'), rightX, panelY + 66);
    }

    const unlockY = panelY + 286;
    ctx.fillStyle = '#8dff9a';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tt('end.progress'), rightX, unlockY);
    const notices: string[] = [];
    const routeNames = (metrics?.routeIds ?? []).map((id) => {
      const route = routeById(id);
      return route ? tn('route', route.id, route.name) : id;
    });
    if (routeNames.length > 0) notices.push(tt('end.route', routeNames.join(' → ')));
    for (const id of this.progression?.challengeIds ?? []) {
      const challenge = CHALLENGES.find((entry) => entry.id === id);
      if (challenge) notices.push(`✓ ${tn('challenge', challenge.id, challenge.name)}  +${challenge.reward}`);
    }
    for (const entry of this.progression?.masteryLevels ?? []) notices.push(`↑ ${entry.id}: ${entry.before} → ${entry.after}`);
    if ((this.progression?.newCodexEntries.length ?? 0) > 0) notices.push(tt('end.codexNew', this.progression!.newCodexEntries.length));
    if (notices.length === 0) notices.push(tt('end.progressHint'));
    notices.slice(0, 4).forEach((notice, index) => {
      ctx.fillStyle = index === 0 ? '#ffffff' : '#b8b8ca';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(notice, rightX, unlockY + 28 + index * 24, 330);
    });

    if (this.shareStatus) {
      ctx.fillStyle = '#8be9fd';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      drawWrappedCentered(ctx, this.shareStatus, cx, h - 118, w - 80, 16, 2);
    }

    const buttonY = h - 72;
    if (this.canContinue) {
      if (button(ctx, ui, cx - 270, buttonY, 250, 50, tt('end.endless'), { primary: true })) this.action = 'endless';
      if (button(ctx, ui, cx - 5, buttonY, 130, 50, tt('end.retry'))) this.action = 'retry';
      if (button(ctx, ui, cx + 140, buttonY, 130, 50, tt('end.menu'))) this.action = 'menu';
    } else {
      if (button(ctx, ui, cx - 190, buttonY, 180, 50, tt('end.retry'), { primary: true })) this.action = 'retry';
      if (button(ctx, ui, cx + 10, buttonY, 180, 50, tt('end.menu'))) this.action = 'menu';
    }
  }
}

export const endScene = new EndScene();
