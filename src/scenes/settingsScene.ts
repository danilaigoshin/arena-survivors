import type { Game, Scene } from '../game';
import { consumeAnyKeyPress } from '../core/input';
import { copyBackup, createBackupText, importBackupText, pasteBackup } from '../core/backup';
import { clearCheckpoint } from '../core/checkpoint';
import { resetMeta, resetTutorial } from '../core/save';
import {
  applyCanvasAccessibility,
  loadSettings,
  readableKey,
  resetSettings,
  setBinding,
  updateSetting,
  type InputAction,
} from '../core/settings';
import { t } from '../core/i18n';
import { syncAudioSettings } from '../render/audio';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { displayFont } from '../render/font';
import { menuScene } from './menu';

const ACTIONS: InputAction[] = ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'ability', 'pause', 'mute'];

class SettingsScene implements Scene {
  private returnScene: Scene | null = null;
  private pending: (() => void) | null = null;
  private waitingBinding: InputAction | null = null;
  private status = '';
  private resetArmed = false;

  open(returnScene: Scene): void {
    this.returnScene = returnScene;
    this.pending = null;
    this.waitingBinding = null;
    this.status = '';
    this.resetArmed = false;
  }

  update(game: Game): void {
    if (this.waitingBinding) {
      const code = consumeAnyKeyPress();
      if (code === 'Escape') {
        this.waitingBinding = null;
      } else if (code) {
        setBinding(this.waitingBinding, code);
        this.waitingBinding = null;
        this.status = t('settings.bindingSaved');
      }
      return;
    }
    const action = this.pending;
    this.pending = null;
    if (action) action();
    applyCanvasAccessibility(game.canvas);
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 1120, 700, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
  }

  private boolRow(
    ctx: CanvasRenderingContext2D,
    ui: UiInput,
    x: number,
    y: number,
    rowWidth: number,
    label: string,
    value: boolean,
    change: () => void,
  ): void {
    ctx.save();
    ctx.fillStyle = '#c8c8dc';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y + 18, rowWidth - 102);
    const clicked = button(ctx, ui, x + rowWidth - 90, y, 90, 36, value ? t('settings.on') : t('settings.off'), {
      primary: value,
      fontSize: 12,
    });
    ctx.restore();
    if (clicked) {
      this.pending = change;
    }
  }

  private volumeRow(
    ctx: CanvasRenderingContext2D,
    ui: UiInput,
    x: number,
    y: number,
    rowWidth: number,
    label: string,
    value: number,
    change: (value: number) => void,
  ): void {
    ctx.save();
    ctx.fillStyle = '#c8c8dc';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const increaseX = x + rowWidth - 36;
    const valueX = increaseX - 34;
    const decreaseX = valueX - 70;
    ctx.fillText(label, x, y + 18, decreaseX - x - 12);
    const decrease = button(ctx, ui, decreaseX, y, 36, 36, '−');
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(value * 100)}%`, valueX, y + 18);
    const increase = button(ctx, ui, increaseX, y, 36, 36, '+');
    ctx.restore();
    if (decrease) this.pending = () => change(Math.max(0, value - 0.1));
    if (increase) this.pending = () => change(Math.min(1, value + 0.1));
  }

  private sectionTitle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    color: string,
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  private gamepadHint(ctx: CanvasRenderingContext2D, x: number, y: number, maxWidth: number): void {
    const parts = t('settings.gamepad').split(' · ');
    const firstLine = parts.shift() ?? '';
    const secondLine = parts.join(' · ');
    ctx.save();
    ctx.fillStyle = '#8a8aa6';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(firstLine, x, y, maxWidth);
    if (secondLine) ctx.fillText(secondLine, x, y + 17, maxWidth);
    ctx.restore();
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    sceneBackground(ctx, w, h, '#181c28', '#090a10');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(23);
    ctx.textAlign = 'center';
    ctx.fillText(t('settings.title'), w / 2, 42);

    const settings = loadSettings();
    const colW = 340;
    const contentInset = 14;
    const contentW = colW - contentInset * 2;
    const gap = 22;
    const startX = w / 2 - (colW * 3 + gap * 2) / 2;
    const top = 82;
    const panelH = h - 158;
    for (let i = 0; i < 3; i++) panel(ctx, startX + i * (colW + gap), top, colW, panelH, { radius: 16 });

    const x1 = startX + contentInset;
    this.sectionTitle(ctx, x1, top + 28, t('settings.audio'), '#8be9fd');
    const setVolume = (key: 'masterVolume' | 'musicVolume' | 'sfxVolume', value: number): void => {
      updateSetting(key, value);
      syncAudioSettings();
    };
    this.volumeRow(ctx, ui, x1, top + 52, contentW, t('settings.master'), settings.masterVolume, (value) => setVolume('masterVolume', value));
    this.volumeRow(ctx, ui, x1, top + 98, contentW, t('settings.music'), settings.musicVolume, (value) => setVolume('musicVolume', value));
    this.volumeRow(ctx, ui, x1, top + 144, contentW, t('settings.sfx'), settings.sfxVolume, (value) => setVolume('sfxVolume', value));

    this.sectionTitle(ctx, x1, top + 216, t('settings.accessibility'), '#ffd23e');
    this.boolRow(ctx, ui, x1, top + 238, contentW, t('settings.shake'), settings.screenShake, () => updateSetting('screenShake', !settings.screenShake));
    this.boolRow(ctx, ui, x1, top + 280, contentW, t('settings.flash'), settings.screenFlash, () => updateSetting('screenFlash', !settings.screenFlash));
    this.boolRow(ctx, ui, x1, top + 322, contentW, t('settings.numbers'), settings.damageNumbers, () => updateSetting('damageNumbers', !settings.damageNumbers));
    this.boolRow(ctx, ui, x1, top + 364, contentW, t('settings.lowFx'), settings.reducedEffects, () => updateSetting('reducedEffects', !settings.reducedEffects));
    this.boolRow(ctx, ui, x1, top + 406, contentW, t('settings.contrast'), settings.highContrast, () => updateSetting('highContrast', !settings.highContrast));

    const x2 = startX + colW + gap + contentInset;
    this.sectionTitle(ctx, x2, top + 28, t('settings.controls'), '#b18cff');
    ACTIONS.forEach((action, index) => {
      const y = top + 52 + index * 48;
      ctx.save();
      ctx.fillStyle = '#c8c8dc';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(t(`settings.action.${action}`), x2, y + 18, contentW - 120);
      const clicked = button(ctx, ui, x2 + contentW - 108, y, 108, 36, this.waitingBinding === action ? '…' : readableKey(settings.bindings[action]), {
        primary: this.waitingBinding === action,
        fontSize: 12,
      });
      ctx.restore();
      if (clicked) {
        this.waitingBinding = action;
        this.status = t('settings.pressKey');
      }
    });
    this.gamepadHint(ctx, x2, top + 397, contentW);
    this.boolRow(ctx, ui, x2, top + 436, contentW, t('settings.quick'), settings.quickTransitions, () => updateSetting('quickTransitions', !settings.quickTransitions));
    this.boolRow(ctx, ui, x2, top + 478, contentW, t('settings.fps'), settings.showFps, () => updateSetting('showFps', !settings.showFps));

    const x3 = startX + (colW + gap) * 2 + contentInset;
    this.sectionTitle(ctx, x3, top + 28, t('settings.display'), '#8dff9a');
    ctx.save();
    ctx.fillStyle = '#c8c8dc';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const increaseTextX = x3 + contentW - 36;
    const textScaleValueX = increaseTextX - 34;
    const decreaseTextX = textScaleValueX - 70;
    ctx.fillText(t('settings.textScale'), x3, top + 70, decreaseTextX - x3 - 12);
    const decreaseText = button(ctx, ui, decreaseTextX, top + 52, 36, 36, '−');
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(settings.textScale * 100)}%`, textScaleValueX, top + 70);
    const increaseText = button(ctx, ui, increaseTextX, top + 52, 36, 36, '+');
    ctx.restore();
    if (decreaseText) this.pending = () => updateSetting('textScale', Math.max(0.85, settings.textScale - 0.1));
    if (increaseText) this.pending = () => updateSetting('textScale', Math.min(1.25, settings.textScale + 0.1));
    const filters = ['none', 'deuteranopia', 'tritanopia'] as const;
    const nextFilter = filters[(filters.indexOf(settings.colorFilter) + 1) % filters.length];
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8c8dc';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(t('settings.color'), x3, top + 126, contentW - 176);
    const changeFilter = button(ctx, ui, x3 + contentW - 164, top + 108, 164, 36, t(`settings.color.${settings.colorFilter}`), { fontSize: 11 });
    ctx.restore();
    if (changeFilter) {
      this.pending = () => updateSetting('colorFilter', nextFilter);
    }
    if (button(ctx, ui, x3, top + 170, contentW, 38, t('settings.fullscreen'))) {
      this.pending = () => {
        const request = document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen();
        void request.catch(() => {});
      };
    }

    this.sectionTitle(ctx, x3, top + 246, t('settings.data'), '#ffd23e');
    const dataButtonGap = 14;
    const dataButtonW = (contentW - dataButtonGap) / 2;
    if (button(ctx, ui, x3, top + 270, dataButtonW, 38, t('settings.copy'))) {
      void copyBackup().then((ok) => {
        if (!ok) window.prompt(t('settings.copyManual'), createBackupText());
        this.status = ok ? t('settings.copied') : t('settings.copyManual');
      });
    }
    if (button(ctx, ui, x3 + dataButtonW + dataButtonGap, top + 270, dataButtonW, 38, t('settings.paste'))) {
      void pasteBackup().then((ok) => {
        if (!ok) {
          const value = window.prompt(t('settings.pastePrompt'), '');
          ok = value ? importBackupText(value) : false;
        }
        syncAudioSettings();
        this.status = ok ? t('settings.imported') : t('settings.importFailed');
      });
    }
    if (button(ctx, ui, x3, top + 322, contentW, 38, t('settings.resetTutorial'))) {
      this.pending = () => {
        resetTutorial();
        this.status = t('settings.tutorialReset');
      };
    }
    if (button(ctx, ui, x3, top + 370, contentW, 38, t('settings.defaults'))) {
      this.pending = () => {
        resetSettings();
        syncAudioSettings();
        this.status = t('settings.defaultsDone');
      };
    }
    if (button(ctx, ui, x3, top + 430, contentW, 38, this.resetArmed ? t('settings.resetConfirm') : t('settings.resetProgress'), {
      labelColor: '#ff8a98',
    })) {
      if (this.resetArmed) {
        this.pending = () => {
          resetMeta();
          clearCheckpoint();
          this.resetArmed = false;
          this.status = t('settings.progressReset');
        };
      } else {
        this.resetArmed = true;
      }
    }

    if (this.status) {
      ctx.fillStyle = '#8be9fd';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.status, w / 2, h - 84, w - 80);
    }
    if (button(ctx, ui, w / 2 - 120, h - 62, 240, 44, t('hero.back'), { primary: true })) {
      this.pending = () => game.setScene(this.returnScene ?? menuScene);
    }
  }
}

export const settingsScene = new SettingsScene();
