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

type ProgressionStep =
  | { kind: 'ability'; choices: AbilityAugmentDef[] }
  | { kind: 'contract'; choices: (WaveContractDef | null)[] };
const augmentById = new Map<string, AbilityAugmentDef>(ABILITY_AUGMENTS.map((choice) => [choice.id, choice]));
const contractById = new Map<string, WaveContractDef>(WAVE_CONTRACTS.map((choice) => [choice.id, choice]));

class ProgressionScene implements Scene {
  /** A transition may contain exactly one forced decision. */
  private step: ProgressionStep | null = null;
  private action: number | null = null;
  private finishing = false;
  private networkRevision = 0;
  private networkSteps: [ProgressionStep | null, ProgressionStep | null] = [null, null];
  private networkSubmitted: [boolean, boolean] = [false, false];
  private guestSubmittedRevision = 0;
  private waitingForPeer = false;
  private connectionExit = false;

  enter(game: Game): void {
    const state = game.state;
    const player = game.localPlayer;
    this.step = null;
    this.action = null;
    this.finishing = false;
    this.networkRevision = 0;
    this.networkSteps = [null, null];
    this.networkSubmitted = [false, false];
    this.guestSubmittedRevision = 0;
    this.waitingForPeer = false;
    // A contract is always scoped to exactly one wave.
    state.activeContract = null;

    const session = game.networkSession;
    if (session instanceof HostSession && state.players.length === 2) {
      this.enterNetworkHost(game, session);
      return;
    }

    if (state.wave === 5 || state.wave === 10 || state.wave === 15) {
      const choices = rollAbilityAugmentChoices(player.character.ability.id, player.abilityAugments, 3);
      if (choices.length > 0) this.step = { kind: 'ability', choices };
    }

    // Campaign contract waves are scheduled away from boss rewards, so a
    // transition never opens a second forced decision.
    if (!this.step && shouldOfferContract(state.wave + 1)) {
      this.step = { kind: 'contract', choices: [null, ...rollContractChoices(2)] };
    }
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
    const session = game.networkSession;
    if (session?.status === 'connection-lost') {
      if (this.connectionExit) {
        this.connectionExit = false;
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
    } else {
      const contract = step.choices[choice];
      if (contract === undefined) return;
      game.state.activeContract = contract;
    }
    this.step = null;
    playSfx('click');
  }

  private enterNetworkHost(game: Game, session: HostSession): void {
    const state = game.state;
    if (state.wave === 5 || state.wave === 10 || state.wave === 15) {
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

  private stepFromIds(kind: 'ability' | 'contract', ids: string[]): ProgressionStep | null {
    if (ids.length === 0) return null;
    if (kind === 'ability') {
      const choices = ids.map((id) => augmentById.get(id)).filter((choice): choice is AbilityAugmentDef => !!choice);
      return choices.length === ids.length ? { kind, choices } : null;
    }
    const choices = ids.map((id) => id === 'none' ? null : contractById.get(id))
      .filter((choice): choice is WaveContractDef | null => choice !== undefined);
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
    } else {
      game.state.activeContract = step.choices[index] ?? null;
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
    if (this.networkSubmitted.every(Boolean)) this.finishNetworkProgression(game, session);
  }

  private updateNetworkGuest(game: Game, session: GuestSession): void {
    const phase = session.phaseState;
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
      if (button(ctx, game.ui, w / 2 - 120, h / 2 + 20, 240, 50, tt('coop.leave'))) {
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

    const accent = step.kind === 'ability' ? '#b18cff' : '#ffd23e';
    ctx.save();
    ctx.shadowColor = `${accent}66`;
    ctx.shadowBlur = 24;
    ctx.fillStyle = accent;
    ctx.font = displayFont(22);
    ctx.textAlign = 'center';
    const title = step.kind === 'ability' ? tt('prog.abilityTitle') : tt('prog.contractTitle');
    ctx.fillText(title, w / 2, 46);
    ctx.restore();

    ctx.fillStyle = '#a8a8ba';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const subtitle = step.kind === 'ability'
      ? tt('prog.abilitySub', game.state.wave)
      : tt('prog.contractSub', game.state.wave + 1);
    ctx.fillText(subtitle, w / 2, 78, w - 40);

    if (step.kind === 'ability') drawSprite(ctx, game.localPlayer.character.sprite, w / 2, 116, 46);
    else drawIcon(ctx, 'i_wave', w / 2, 116, 42);

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
      ctx.fillStyle = step.kind === 'contract' && choice !== null ? '#9fdca0' : '#77778c';
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
