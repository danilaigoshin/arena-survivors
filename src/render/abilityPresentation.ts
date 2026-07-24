import type { Player } from '../entities/player';
import { playSfx } from './audio';
import { spawnBurst, spawnRing } from './fx';

export function playAbilityPresentation(player: Player): void {
  switch (player.character.ability.id) {
    case 'adaptation':
      spawnBurst(player.x, player.y, '#8dff9a', 12);
      spawnRing(player.x, player.y, '#8dff9a');
      playSfx('levelup');
      break;
    case 'whirlwind':
      spawnBurst(player.x, player.y, '#ffd23e', 10);
      playSfx('heavy');
      break;
    case 'overheat':
      spawnBurst(player.x, player.y, '#ff9a45', 12);
      spawnRing(player.x, player.y, '#ff9a45');
      playSfx('fire');
      break;
    case 'arcane_circle':
      spawnBurst(player.x, player.y, '#b18cff', 14);
      spawnRing(player.x, player.y, '#b18cff');
      playSfx('magic');
      break;
  }
}
