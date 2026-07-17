import type { Game, Scene } from '../game';
import { serializeLocalPlayerProfile } from '../core/playerProfile';
import { isUnlocked } from '../core/save';
import { t, tn } from '../core/i18n';
import { CHARACTERS } from '../data/characters';
import { DIFFICULTIES } from '../data/difficulty';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawSprite } from '../render/sprites';
import { displayFont } from '../render/font';
import {
  HostSession,
  GuestSession,
  type NetworkSession,
  type SessionStatus,
} from '../multiplayer/session';
import { normalizeRoomCode } from '../multiplayer/protocol';
import { menuScene } from './menu';
import { runScene } from './run';

type LobbyMode = 'choose' | 'host' | 'guest';
type LobbyAction =
  | 'back'
  | 'host'
  | 'join'
  | 'previous-character'
  | 'next-character'
  | 'previous-difficulty'
  | 'next-difficulty'
  | 'ready'
  | 'start'
  | 'copy'
  | null;

const availableCharacters = () => CHARACTERS.filter((character) => !character.unlockCost || isUnlocked(character.id));
const localizedStatuses = new Set<SessionStatus>([
  'loading',
  'waiting',
  'connecting',
  'connected',
  'room-full',
  'version-mismatch',
  'timeout',
  'connection-lost',
  'closed',
  'webrtc-unsupported',
  'error',
]);

function networkErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return localizedStatuses.has(message as SessionStatus)
    ? t(`coop.status.${message}`)
    : message;
}

class LobbyScene implements Scene {
  private mode: LobbyMode = 'choose';
  private action: LobbyAction = null;
  private characterIndex = 0;
  private difficultyIndex = 1;
  private busy = false;
  private error = '';
  private session: NetworkSession | null = null;

  onEnter(game: Game): void {
    if (!game.networkSession) {
      this.mode = 'choose';
      this.session = null;
      this.error = '';
      this.busy = false;
    }
  }

  update(game: Game, _dt: number): void {
    const action = this.action;
    this.action = null;
    if (!action || this.busy) return;

    if (action === 'back') {
      const session = this.session;
      this.session = null;
      game.networkSession = null;
      game.sessionRole = 'solo';
      if (session) void session.close();
      game.setScene(menuScene);
      return;
    }

    if (action === 'host') {
      this.busy = true;
      this.error = '';
      const character = availableCharacters()[this.characterIndex] ?? availableCharacters()[0];
      void HostSession.create(character.id, serializeLocalPlayerProfile(), DIFFICULTIES[this.difficultyIndex].id)
        .then((session) => {
          this.session = session;
          game.networkSession = session;
          game.sessionRole = 'host';
          this.mode = 'host';
        })
        .catch((error: unknown) => {
          this.error = networkErrorText(error);
        })
        .finally(() => { this.busy = false; });
      return;
    }

    if (action === 'join') {
      const entered = window.prompt(t('coop.enterCode'), '') ?? '';
      const code = normalizeRoomCode(entered);
      if (!code) {
        this.error = t('coop.invalidCode');
        return;
      }
      this.busy = true;
      this.error = '';
      const character = availableCharacters()[this.characterIndex] ?? availableCharacters()[0];
      void GuestSession.join(code, character.id, serializeLocalPlayerProfile())
        .then((session) => {
          this.session = session;
          game.networkSession = session;
          game.sessionRole = 'guest';
          this.mode = 'guest';
          session.onStarted = () => {
            runScene.enterWave(game);
            game.setScene(runScene, true);
          };
        })
        .catch((error: unknown) => {
          this.error = networkErrorText(error);
        })
        .finally(() => { this.busy = false; });
      return;
    }

    const characters = availableCharacters();
    if (action === 'previous-character' || action === 'next-character') {
      const delta = action === 'previous-character' ? -1 : 1;
      this.characterIndex = (this.characterIndex + delta + characters.length) % characters.length;
      const selected = characters[this.characterIndex];
      if (this.session instanceof HostSession) this.session.setHostSelection(selected.id);
      if (this.session instanceof GuestSession) this.session.setGuestSelection(selected.id);
      return;
    }

    if (this.session instanceof HostSession) {
      if (action === 'previous-difficulty' || action === 'next-difficulty') {
        const delta = action === 'previous-difficulty' ? -1 : 1;
        this.difficultyIndex = (this.difficultyIndex + delta + DIFFICULTIES.length) % DIFFICULTIES.length;
        this.session.setHostSelection(
          characters[this.characterIndex].id,
          DIFFICULTIES[this.difficultyIndex].id,
        );
      } else if (action === 'ready') {
        this.session.setReady(!this.session.host.ready);
      } else if (action === 'copy') {
        void navigator.clipboard?.writeText(this.session.roomCode);
      } else if (action === 'start') {
        this.busy = true;
        void this.session.startRun(game).then((started) => {
          if (started) {
            runScene.enterWave(game);
            game.setScene(runScene, true);
          }
        }).catch((error: unknown) => {
          this.error = networkErrorText(error);
        }).finally(() => { this.busy = false; });
      }
    } else if (this.session instanceof GuestSession && action === 'ready') {
      this.session.setReady(!this.session.guest.ready);
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 900, 560, (width, height, ui) => {
      this.renderContent(ctx, width, height, ui);
    });
  }

  private renderContent(ctx: CanvasRenderingContext2D, width: number, height: number, ui: UiInput): void {
    sceneBackground(ctx, width, height, '#161827', '#080910');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23e';
    ctx.font = displayFont(28);
    ctx.fillText(t('coop.title'), width / 2, 50);

    if (this.mode === 'choose') {
      ctx.fillStyle = '#9a9ab4';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(t('coop.subtitle'), width / 2, 104);
      if (button(ctx, ui, width / 2 - 150, 160, 300, 64, t('coop.create'), { primary: true })) this.action = 'host';
      if (button(ctx, ui, width / 2 - 150, 240, 300, 64, t('coop.join'))) this.action = 'join';
      if (button(ctx, ui, width / 2 - 100, height - 70, 200, 46, t('hero.back'))) this.action = 'back';
      if (this.busy) this.statusText(ctx, width, t('coop.loading'));
      if (this.error) this.statusText(ctx, width, this.error, '#ff7080');
      return;
    }

    const session = this.session;
    if (!session) return;
    const characters = availableCharacters();
    const selected = characters[this.characterIndex] ?? characters[0];
    panel(ctx, 56, 92, width - 112, 330, { radius: 18 });
    drawSprite(ctx, selected.sprite, width / 2, 182, 72);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(tn('c', selected.id, selected.name), width / 2, 240);
    if (button(ctx, ui, width / 2 - 190, 158, 52, 52, '‹', { fontSize: 26 })) this.action = 'previous-character';
    if (button(ctx, ui, width / 2 + 138, 158, 52, 52, '›', { fontSize: 26 })) this.action = 'next-character';

    if (session instanceof HostSession) {
      ctx.fillStyle = '#8be9fd';
      ctx.font = displayFont(22);
      ctx.fillText(session.roomCode, width / 2, 292);
      if (button(ctx, ui, width / 2 + 115, 268, 110, 46, t('coop.copy'))) this.action = 'copy';
      const difficulty = DIFFICULTIES[this.difficultyIndex];
      if (button(ctx, ui, width / 2 - 185, 328, 42, 42, '‹')) this.action = 'previous-difficulty';
      ctx.fillStyle = '#c8c8dc';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(tn('d', difficulty.id, difficulty.name), width / 2, 350);
      if (button(ctx, ui, width / 2 + 143, 328, 42, 42, '›')) this.action = 'next-difficulty';
      ctx.fillStyle = '#9a9ab4';
      ctx.font = '14px system-ui, sans-serif';
      const status = session.status === 'connected'
        ? t('coop.connected')
        : session.status === 'waiting'
          ? t('coop.waiting')
          : t(`coop.status.${session.status}`);
      ctx.fillText(status, width / 2, 398);
    } else if (session instanceof GuestSession) {
      ctx.fillStyle = '#9a9ab4';
      ctx.font = '14px system-ui, sans-serif';
      const hostReady = session.lobbyState?.hostReady ?? false;
      ctx.fillText(hostReady ? t('coop.hostReady') : t('coop.waitHost'), width / 2, 314);
      ctx.fillText(t(`coop.status.${session.status}`), width / 2, 362);
    }

    const localReady = session instanceof HostSession
      ? session.host.ready
      : session instanceof GuestSession && session.guest.ready;
    if (button(ctx, ui, width / 2 - 150, 442, 300, 52, localReady ? t('coop.unready') : t('coop.ready'), {
      primary: localReady,
      enabled: session.status === 'connected',
    })) this.action = 'ready';
    if (session instanceof HostSession && button(ctx, ui, width / 2 + 170, 442, 170, 52, t('coop.start'), {
      primary: true,
      enabled: session.canStart() && !this.busy,
    })) this.action = 'start';
    if (button(ctx, ui, 26, height - 64, 150, 42, t('hero.back'))) this.action = 'back';
    if (this.error) this.statusText(ctx, width, this.error, '#ff7080');
  }

  private statusText(ctx: CanvasRenderingContext2D, width: number, text: string, color = '#9a9ab4'): void {
    ctx.fillStyle = color;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, 522);
  }
}

export const lobbyScene = new LobbyScene();
