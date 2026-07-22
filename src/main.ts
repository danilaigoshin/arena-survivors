import { Game } from './game';
import { menuScene } from './scenes/menu';
import { toggleMute } from './render/audio';
import { loadFonts } from './render/font';
import { runScene } from './scenes/run';
import { validateSprites } from './render/sprites';
import { validateGameContent } from './data/validation';
import { lobbyScene } from './scenes/lobbyScene';
import { normalizeRoomCode } from './multiplayer/protocol';
import { keyFor } from './core/settings';
import { settingsScene } from './scenes/settingsScene';

loadFonts();
if (import.meta.env.DEV) {
  const problems = [...validateGameContent(), ...validateSprites()];
  if (problems.length > 0) throw new Error(`Invalid game content:\n${problems.join('\n')}`);
}
const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
const inviteCode = typeof location === 'undefined'
  ? null
  : normalizeRoomCode(new URL(location.href).searchParams.get('room') ?? '');
game.setScene(inviteCode ? lobbyScene : menuScene);
game.start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Installation is optional; the online game remains fully playable.
    });
  });
}

window.addEventListener('keydown', (e) => {
  if (!e.repeat && e.code === keyFor('mute') && game.scene !== settingsScene) toggleMute();
});

// auto-pause when the tab loses focus mid-fight
window.addEventListener('blur', () => {
  if (game.scene === runScene && !runScene.levelUpChoices) runScene.paused = true;
});

if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
