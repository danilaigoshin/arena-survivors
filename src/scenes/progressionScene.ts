import type { Game, Scene } from '../game';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon } from '../render/icons';
import { drawSprite } from '../render/sprites';
import { displayFont } from '../render/font';
import { playSfx } from '../render/audio';
import { t as tt, tn } from '../core/i18n';
import { rollAbilityAugmentChoices, type AbilityAugmentDef } from '../data/abilityAugments';
import { rollContractChoices, shouldOfferContract, type WaveContractDef } from '../data/contracts';
import { runScene } from './run';

type ProgressionStep =
  | { kind: 'ability'; choices: AbilityAugmentDef[] }
  | { kind: 'contract'; choices: (WaveContractDef | null)[] };

class ProgressionScene implements Scene {
  /** A transition may contain exactly one forced decision. */
  private step: ProgressionStep | null = null;
  private action: number | null = null;
  private finishing = false;

  enter(game: Game): void {
    const state = game.state;
    const player = state.player;
    this.step = null;
    this.action = null;
    this.finishing = false;
    // A contract is always scoped to exactly one wave.
    state.activeContract = null;

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

  update(game: Game, _dt: number): void {
    if (this.finishing) return;
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
      game.state.player.addAbilityAugment(augment.id);
    } else {
      const contract = step.choices[choice];
      if (contract === undefined) return;
      game.state.activeContract = contract;
    }
    this.step = null;
    playSfx('click');
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 820, 500, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const step = this.step;
    sceneBackground(ctx, w, h, '#1c1a2a', '#0a0a10');
    ctx.textBaseline = 'middle';
    if (!step) return;

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

    if (step.kind === 'ability') drawSprite(ctx, game.state.player.character.sprite, w / 2, 116, 46);
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
