import type { Game } from '../game';
import {
  addShake,
  flashScreen,
  spawnBurst,
  spawnDamageNumber,
  spawnDeathPop,
  spawnGibs,
  spawnRing,
  spawnSparks,
  stampGoo,
} from '../render/fx';
import { playSfx, type SfxEvent } from '../render/audio';
import type { GameplayEvent } from './events';

export function replayGameplayEvent(game: Game, event: GameplayEvent): void {
  if (event.type === 'damage') {
    spawnDamageNumber(event.x, event.y, event.damage, event.crit, event.heal ?? false);
    if (!event.heal && event.target === 'player' && event.targetSlot === game.localPlayerSlot) {
      flashScreen();
      addShake(7);
    }
    return;
  }
  if (event.type === 'death') {
    spawnDeathPop(event.enemyId, event.x, event.y, event.radius * 2.3, event.flip);
    spawnGibs(event.x, event.y, event.enemyId, event.boss ? 26 : event.radius >= 14 ? 10 : 6, event.hitAngle);
    stampGoo(game.state.floorCanvas, event.x, event.y, event.color);
    if (event.boss) addShake(12);
    return;
  }
  if (event.type === 'fx') {
    if (event.effect === 'burst') spawnBurst(event.x, event.y, event.color, event.count ?? 8);
    else if (event.effect === 'ring') spawnRing(event.x, event.y, event.color);
    else spawnSparks(event.x, event.y, event.angle ?? 0, event.color, event.count ?? 2);
    return;
  }
  if (event.type === 'sfx') {
    playSfx(event.sound as SfxEvent);
  }
}
