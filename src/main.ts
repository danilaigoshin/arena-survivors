import { Game } from './game';
import { menuScene } from './scenes/menu';
import { toggleMute } from './render/audio';
import { loadFonts } from './render/font';
import { runScene } from './scenes/run';

loadFonts();
const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.setScene(menuScene);
game.start();

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') toggleMute();
});

// auto-pause when the tab loses focus mid-fight
window.addEventListener('blur', () => {
  if (game.scene === runScene && !runScene.levelUpChoices) runScene.paused = true;
});

if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
