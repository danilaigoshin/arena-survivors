import type { Game, Scene } from '../game';
import { button, dimBackground, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon } from '../render/icons';
import { drawSprite } from '../render/sprites';
import { displayFont } from '../render/font';
import { playSfx } from '../render/audio';
import { t as tt, tn } from '../core/i18n';
import { ABILITY_AUGMENTS, rollAbilityAugmentChoices, type AbilityAugmentDef } from '../data/abilityAugments';
import { rollContractChoices, shouldOfferContract, type WaveContractDef } from '../data/contracts';
import { WAVE_CONTRACTS } from '../data/contracts';
import { runScene } from './run';
import { GuestSession, HostSession } from '../multiplayer/session';
import type { PlayerSlot } from '../multiplayer/types';
import type { ProgressionPhase } from '../multiplayer/stateProtocol';
import { menuScene } from './menu';
import { consumeKeyPress } from '../core/input';
import { ROUTES, routeById, routesAfterWave, type RouteDef } from '../data/routes';
import { claimDisconnectedRun, disconnectedRunReward } from '../core/disconnectRecovery';

type ProgressionStep =
  | { kind: 'ability'; choices: AbilityAugmentDef[] }
  | { kind: 'contract'; choices: (WaveContractDef | null)[] }
  | { kind: 'route'; choices: RouteDef[] };
const augmentById = new Map<string, AbilityAugmentDef>(ABILITY_AUGMENTS.map((choice) => [choice.id, choice]));
const contractById = new Map<string, WaveContractDef>(WAVE_CONTRACTS.map((choice) => [choice.id, choice]));
const routeIds = new Set(ROUTES.map((route) => route.id));

function shouldOfferAbilityReward(completedWave: number): boolean {
  return completedWave === 5 || completedWave === 10 || completedWave === 15;
}

function applyRoute(game: Game, route: RouteDef): void {
  const state = game.state;
  state.routeIds[route.chapter - 1] = route.id;
  state.metrics.routeIds = [...state.routeIds];
  if (route.reward.materials) state.squad.materials += route.reward.materials;
  if (route.reward.maxHp) {
    for (const player of state.players) {
      if (player.downed) continue;
      player.addUpgrade({ maxHp: route.reward.maxHp });
      player.hp = player.stats.maxHp;
    }
  }
}

class ProgressionScene implements Scene {
  /** Boss transitions can contain a personal reward followed by a shared route. */
  private step: ProgressionStep | null = null;
  private queuedSteps: ProgressionStep[] = [];
  private action: number | null = null;
  private finishing = false;
  private networkRevision = 0;
  private networkSteps: [ProgressionStep | null, ProgressionStep | null] = [null, null];
  private networkSubmitted: [boolean, boolean] = [false, false];
  private guestSubmittedRevision = 0;
  private waitingForPeer = false;
  private connectionExit = false;
  private networkRoutePending = false;

  enter(game: Game): void {
    const state = game.state;
    const player = game.localPlayer;
    this.step = null;
    this.queuedSteps = [];
    this.action = null;
    this.finishing = false;
    this.networkRevision = 0;
    this.networkSteps = [null, null];
    this.networkSubmitted = [false, false];
    this.guestSubmittedRevision = 0;
    this.waitingForPeer = false;
    this.networkRoutePending = false;
    // A contract is always scoped to exactly one wave.
    state.activeContract = null;

    const session = game.networkSession;
    if (session instanceof HostSession && state.players.length === 2) {
      this.enterNetworkHost(game, session);
      return;
    }

    const steps: ProgressionStep[] = [];
    if (shouldOfferAbilityReward(state.wave)) {
      const choices = rollAbilityAugmentChoices(player.character.ability.id, player.abilityAugments, 3);
      if (choices.length > 0) steps.push({ kind: 'ability', choices });
    }
    const routeChoices = routesAfterWave(state.wave);
    if (routeChoices.length > 0) steps.push({ kind: 'route', choices: [...routeChoices] });

    if (steps.length === 0 && shouldOfferContract(state.wave + 1)) {
      steps.push({ kind: 'contract', choices: [null, ...rollContractChoices(2)] });
    }
    this.step = steps.shift() ?? null;
    this.queuedSteps = steps;
  }

  enterRemote(game: Game, phase: ProgressionPhase): void {
    game.state.activeContract = null;
    this.finishing = false;
    this.networkRevision = phase.phaseRevision;
    this.networkSubmitted = [...phase.submitted];
    this.guestSubmittedRevision = 0;
    const slot = game.localPlayerSlot;
    this.step = this.stepFromIds(phase.kind, phase.choiceIds[slot]);
    this.waitingForPeer = phase.submitted[slot] || !this.step;
    this.action = null;
  }

  update(game: Game, _dt: number): void {
    if (this.finishing) return;
    if (this.step) {
      for (let i = 0; i < this.step.choices.length; i++) {
        if (consumeKeyPress(`Digit${i + 1}`) || consumeKeyPress(`Numpad${i + 1}`)) this.action = i;
      }
    }
    const session = game.networkSession;
    if (session?.status === 'connection-lost') {
      if (this.connectionExit) {
        this.connectionExit = false;
        claimDisconnectedRun(game);
        game.networkSession = null;
        game.sessionRole = 'solo';
        void session.close();
        game.setScene(menuScene, true);
      }
      return;
    }
    if (session instanceof HostSession && game.state.players.length === 2) {
      this.updateNetworkHost(game, session);
      return;
    }
    if (session instanceof GuestSession) {
      this.updateNetworkGuest(game, session);
      return;
    }
    const step = this.step;
    if (!step) {
      this.finishing = true;
      game.state.wave++;
      runScene.enterWave(game);
      game.setScene(runScene);
      return;
    }
    const choice = this.action;
    this.action = null;
    if (choice === null) return;

    if (step.kind === 'ability') {
      const augment = step.choices[choice];
      if (!augment) return;
      game.localPlayer.addAbilityAugment(augment.id);
    } else if (step.kind === 'contract') {
      const contract = step.choices[choice];
      if (contract === undefined) return;
      game.state.activeContract = contract;
    } else {
      const route = step.choices[choice];
      if (!route) return;
      applyRoute(game, route);
    }
    this.step = this.queuedSteps.shift() ?? null;
    playSfx('click');
  }

  private enterNetworkHost(game: Game, session: HostSession): void {
    const state = game.state;
    const routeChoices = routesAfterWave(state.wave);
    this.networkRoutePending = routeChoices.length > 0;
    if (shouldOfferAbilityReward(state.wave)) {
      this.networkSteps = [0, 1].map((rawSlot) => {
        const slot = rawSlot as PlayerSlot;
        const player = state.playerBySlot(slot)!;
        const choices = rollAbilityAugmentChoices(
          player.character.ability.id,
          player.abilityAugments,
          3,
        );
        return choices.length > 0 ? { kind: 'ability' as const, choices } : null;
      }) as [ProgressionStep | null, ProgressionStep | null];
      if (this.networkSteps.every((step) => step === null) && this.networkRoutePending) {
        this.beginNetworkRoute(session, routeChoices);
        return;
      }
    } else if (this.networkRoutePending) {
      this.beginNetworkRoute(session, routeChoices);
      return;
    } else if (shouldOfferContract(state.wave + 1)) {
      this.networkSteps = [
        { kind: 'contract', choices: [null, ...rollContractChoices(2)] },
        null,
      ];
    }
    this.networkRevision = session.nextPhaseRevision();
    this.networkSubmitted = [
      this.networkSteps[0] === null,
      this.networkSteps[1] === null,
    ];
    this.step = this.networkSteps[0];
    this.waitingForPeer = this.networkSubmitted[0];
    this.publishNetworkPhase(session);
  }

  private beginNetworkRoute(session: HostSession, choices: readonly RouteDef[]): void {
    this.networkRoutePending = false;
    this.networkRevision = session.nextPhaseRevision();
    this.networkSteps = [{ kind: 'route', choices: [...choices] }, null];
    this.networkSubmitted = [false, true];
    this.step = this.networkSteps[0];
    this.waitingForPeer = false;
    this.publishNetworkPhase(session);
  }

  private stepFromIds(kind: 'ability' | 'contract' | 'route', ids: string[]): ProgressionStep | null {
    if (ids.length === 0) return null;
    if (kind === 'ability') {
      const choices = ids.map((id) => augmentById.get(id)).filter((choice): choice is AbilityAugmentDef => !!choice);
      return choices.length === ids.length ? { kind, choices } : null;
    }
    if (kind === 'contract') {
      const choices = ids.map((id) => id === 'none' ? null : contractById.get(id))
        .filter((choice): choice is WaveContractDef | null => choice !== undefined);
      return choices.length === ids.length ? { kind, choices } : null;
    }
    const choices = ids.map((id) => routeById(id)).filter((choice): choice is RouteDef => !!choice);
    return choices.length === ids.length ? { kind, choices } : null;
  }

  private choiceId(step: ProgressionStep, index: number): string | null {
    const choice = step.choices[index];
    if (choice === undefined) return null;
    return choice === null ? 'none' : choice.id;
  }

  private publishNetworkPhase(session: HostSession): void {
    const kind = this.networkSteps[0]?.kind ?? this.networkSteps[1]?.kind ?? 'contract';
    session.publishPhase({
      version: 1,
      phase: 'progression',
      phaseRevision: this.networkRevision,
      kind,
      choiceIds: this.networkSteps.map((step) => step
        ? step.choices.map((choice) => choice === null ? 'none' : choice.id)
        : []) as [string[], string[]],
      submitted: [...this.networkSubmitted],
    });
  }

  private submitNetworkChoice(
    game: Game,
    session: HostSession,
    slot: PlayerSlot,
    choiceId: string,
    revision: number,
  ): boolean {
    const step = this.networkSteps[slot];
    if (revision !== this.networkRevision || this.networkSubmitted[slot] || !step) return false;
    const index = step.choices.findIndex((choice) => (choice === null ? 'none' : choice.id) === choiceId);
    if (index < 0) return false;
    const player = game.state.playerBySlot(slot);
    if (!player) return false;
    if (step.kind === 'ability') {
      const augment = step.choices[index];
      if (!augment || player.abilityAugments.has(augment.id)) return false;
      player.addAbilityAugment(augment.id);
    } else if (step.kind === 'contract') {
      game.state.activeContract = step.choices[index] ?? null;
    } else {
      const route = step.choices[index];
      if (!route || !routeIds.has(route.id) || slot !== 0) return false;
      applyRoute(game, route);
    }
    this.networkSubmitted[slot] = true;
    this.networkSteps[slot] = null;
    if (slot === game.localPlayerSlot) this.step = null;
    this.waitingForPeer = true;
    session.publishBuild(game);
    this.publishNetworkPhase(session);
    playSfx('click');
    return true;
  }

  private finishNetworkProgression(game: Game, session: HostSession): void {
    if (this.finishing) return;
    this.finishing = true;
    game.state.wave++;
    runScene.enterWave(game);
    session.publishBuild(game);
    session.publishRunPhase(game.state.wave);
    game.setScene(runScene, true);
  }

  private updateNetworkHost(game: Game, session: HostSession): void {
    for (const message of session.drainPhaseCommands()) {
      if (
        message.command !== 'progression-choice'
        || message.ids.length !== 1
        || !this.submitNetworkChoice(game, session, 1, message.ids[0], message.phaseRevision)
      ) session.resendPhase();
    }
    if (!this.networkSubmitted[0] && this.step) {
      const action = this.action;
      this.action = null;
      if (action !== null) {
        const id = this.choiceId(this.step, action);
        if (id) this.submitNetworkChoice(game, session, 0, id, this.networkRevision);
      }
    } else {
      this.action = null;
      this.step = null;
      this.waitingForPeer = true;
    }
    if (this.networkSubmitted.every(Boolean)) {
      if (this.networkRoutePending) {
        this.beginNetworkRoute(session, routesAfterWave(game.state.wave));
        return;
      }
      this.finishNetworkProgression(game, session);
    }
  }

  private updateNetworkGuest(game: Game, session: GuestSession): void {
    const phase = session.phaseState;
    if (phase?.phase === 'progression' && phase.phaseRevision > this.networkRevision) {
      this.enterRemote(game, phase);
      return;
    }
    if (phase?.phase === 'run' && phase.phaseRevision > this.networkRevision) {
      game.state.wave = phase.wave;
      runScene.enterWave(game);
      game.setScene(runScene, true);
      return;
    }
    if (phase?.phase !== 'progression' || phase.phaseRevision !== this.networkRevision) return;
    this.networkSubmitted = [...phase.submitted];
    const slot = game.localPlayerSlot;
    const locallySubmitted = phase.submitted[slot] || this.guestSubmittedRevision === phase.phaseRevision;
    this.step = locallySubmitted ? null : this.stepFromIds(phase.kind, phase.choiceIds[slot]);
    this.waitingForPeer = locallySubmitted || !this.step;
    const action = this.action;
    this.action = null;
    if (action === null || !this.step) return;
    const id = this.choiceId(this.step, action);
    if (!id) return;
    session.sendPhaseCommand(phase.phaseRevision, 'progression-choice', [id]);
    this.guestSubmittedRevision = phase.phaseRevision;
    this.step = null;
    this.waitingForPeer = true;
    playSfx('click');
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 820, 500, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
    if (game.networkSession?.status === 'connection-lost') {
      const w = game.width;
      const h = game.height;
      dimBackground(ctx, w, h);
      panel(ctx, w / 2 - 220, h / 2 - 100, 440, 200, { radius: 18, border: '#ff547066' });
      ctx.fillStyle = '#ff7080';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.fillText(tt('coop.connectionLost'), w / 2, h / 2 - 42);
      const recoveryReward = disconnectedRunReward(game);
      if (button(ctx, game.ui, w / 2 - 150, h / 2 + 20, 300, 50, recoveryReward > 0 ? tt('coop.claimLeave', recoveryReward) : tt('coop.leave'))) {
        this.connectionExit = true;
      }
    }
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const step = this.step;
    sceneBackground(ctx, w, h, '#1c1a2a', '#0a0a10');
    ctx.textBaseline = 'middle';
    if (!step) {
      if (this.waitingForPeer) {
        ctx.fillStyle = '#8be9fd';
        ctx.font = displayFont(19);
        ctx.textAlign = 'center';
        ctx.fillText(tt('coop.waitDecision'), w / 2, h / 2);
      }
      return;
    }

    const accent = step.kind === 'ability' ? '#b18cff' : step.kind === 'route' ? '#8be9fd' : '#ffd23e';
    ctx.save();
    ctx.shadowColor = `${accent}66`;
    ctx.shadowBlur = 24;
    ctx.fillStyle = accent;
    ctx.font = displayFont(22);
    ctx.textAlign = 'center';
    const title = step.kind === 'ability'
      ? tt('prog.abilityTitle')
      : step.kind === 'route'
        ? tt('prog.routeTitle')
        : tt('prog.contractTitle');
    ctx.fillText(title, w / 2, 46);
    ctx.restore();

    ctx.fillStyle = '#a8a8ba';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const subtitle = step.kind === 'ability'
      ? tt('prog.abilitySub', game.state.wave)
      : step.kind === 'route'
        ? tt('prog.routeSub', game.state.wave + 1, game.state.wave + 5)
        : tt('prog.contractSub', game.state.wave + 1);
    ctx.fillText(subtitle, w / 2, 78, w - 40);

    if (step.kind === 'ability') drawSprite(ctx, game.localPlayer.character.sprite, w / 2, 116, 46);
    else drawIcon(ctx, step.kind === 'route' ? 'i_speed' : 'i_wave', w / 2, 116, 42);

    const choices = step.choices;
    const count = choices.length;
    const cardW = count === 2 ? 270 : 230;
    const cardH = 270;
    const gap = 18;
    const total = count * cardW + (count - 1) * gap;
    const startX = w / 2 - total / 2;
    for (let i = 0; i < count; i++) {
      const choice = choices[i];
      const x = startX + i * (cardW + gap);
      const y = 150;
      const hover = ui.mx >= x && ui.mx <= x + cardW && ui.my >= y && ui.my <= y + cardH;
      panel(ctx, x, y, cardW, cardH, {
        radius: 15,
        fill: hover ? ['#2b2b40', '#1d1d2c'] : ['#222234', '#171722'],
        border: hover ? accent : `${accent}66`,
        glow: hover ? `${accent}55` : undefined,
      });

      let icon = 'i_star';
      let name = '';
      let desc = '';
      let note = '';
      if (step.kind === 'ability') {
        const augment = choice as AbilityAugmentDef;
        icon = augment.icon;
        name = tn('aug', augment.id, augment.name);
        desc = tn('augd', augment.id, augment.desc);
        note = tt('prog.permanent');
      } else if (step.kind === 'route') {
        const route = choice as RouteDef;
        icon = route.icon;
        name = tn('route', route.id, route.name);
        desc = tn('routed', route.id, route.desc);
        note = tn('router', route.id, route.rewardText);
      } else if (choice === null) {
        icon = 'i_armor';
        name = tt('contract.none');
        desc = tt('contract.noneDesc');
        note = tt('contract.noneReward');
      } else {
        const contract = choice as WaveContractDef;
        icon = contract.icon;
        name = tn('con', contract.id, contract.name);
        desc = tn('cond', contract.id, contract.desc);
        note = tn('conr', contract.id, contract.reward);
      }

      drawIcon(ctx, icon, x + cardW / 2, y + 48, 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, x + cardW / 2, y + 92, cardW - 24);
      ctx.fillStyle = '#b8b8ca';
      ctx.font = '13px system-ui, sans-serif';
      drawWrappedCentered(ctx, desc, x + cardW / 2, y + 126, cardW - 30, 18, 4);
      ctx.fillStyle = (step.kind === 'contract' && choice !== null) || step.kind === 'route' ? '#9fdca0' : '#77778c';
      ctx.font = 'bold 12px system-ui, sans-serif';
      drawWrappedCentered(ctx, note, x + cardW / 2, y + 202, cardW - 28, 16, 2);
      if (button(ctx, ui, x + 22, y + cardH - 50, cardW - 44, 36, tt('prog.choose'), { primary: hover })) this.action = i;
    }
  }
}

function drawWrappedCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.includes(' ') ? text.split(' ') : Array.from(text);
  const separator = text.includes(' ') ? ' ' : '';
  let line = '';
  let lineIndex = 0;
  for (const word of words) {
    const probe = line ? `${line}${separator}${word}` : word;
    if (line && ctx.measureText(probe).width > maxWidth) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex++;
      if (lineIndex >= maxLines) return;
    } else {
      line = probe;
    }
  }
  if (line && lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
}

export const progressionScene = new ProgressionScene();

export function continueToNextWave(game: Game): void {
  progressionScene.enter(game);
  game.setScene(progressionScene);
}
