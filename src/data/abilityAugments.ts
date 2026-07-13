import type { AbilityId } from './abilities';
import { pick } from '../core/rng';

export type AbilityAugmentId =
  | 'adaptation_power' | 'adaptation_duration' | 'adaptation_cycle' | 'adaptation_heal'
  | 'whirlwind_hits' | 'whirlwind_radius' | 'whirlwind_stride' | 'whirlwind_pull'
  | 'overheat_duration' | 'overheat_speed' | 'overheat_focus' | 'overheat_recovery'
  | 'circle_duration' | 'circle_radius' | 'circle_mobile' | 'circle_power';

export interface AbilityAugmentDef {
  id: AbilityAugmentId;
  ability: AbilityId;
  name: string;
  icon: string;
  desc: string;
}

export const ABILITY_AUGMENTS: readonly AbilityAugmentDef[] = [
  { id: 'adaptation_power', ability: 'adaptation', name: 'Глубокая адаптация', icon: 'i_sword', desc: 'Бонус за каждый класс оружия увеличен с 10% до 11%' },
  { id: 'adaptation_duration', ability: 'adaptation', name: 'Долгая адаптация', icon: 'i_star', desc: 'Длительность увеличена с 5 до 5,5 секунды' },
  { id: 'adaptation_cycle', ability: 'adaptation', name: 'Быстрая перестройка', icon: 'i_aspd', desc: 'Перезарядка способности сокращена на 10%' },
  { id: 'adaptation_heal', ability: 'adaptation', name: 'Живая ткань', icon: 'i_heart', desc: 'Активация лечит 2% максимального здоровья за каждый класс оружия' },

  { id: 'whirlwind_hits', ability: 'whirlwind', name: 'Четвёртый оборот', icon: 'w_stormblade', desc: 'Вихрь наносит 4 удара по 40% вместо 3 ударов по 50%' },
  { id: 'whirlwind_radius', ability: 'whirlwind', name: 'Широкий замах', icon: 'w_sword', desc: 'Радиус вихря увеличен на 20%' },
  { id: 'whirlwind_stride', ability: 'whirlwind', name: 'Твёрдый шаг', icon: 'i_speed', desc: 'Штраф скорости движения во время вихря снижен с 25% до 10%' },
  { id: 'whirlwind_pull', ability: 'whirlwind', name: 'Глаз бури', icon: 'i_magnet', desc: 'Удары вихря притягивают врагов вместо отталкивания' },

  { id: 'overheat_duration', ability: 'overheat', name: 'Теплоёмкость', icon: 'i_rage', desc: 'Перегрев длится на 0,5 секунды дольше' },
  { id: 'overheat_speed', ability: 'overheat', name: 'Красная зона', icon: 'i_aspd', desc: 'Бонус скорости атаки увеличен с 60% до 65%' },
  { id: 'overheat_focus', ability: 'overheat', name: 'Нарезной ствол', icon: 'i_crit', desc: 'Разброс во время перегрева дополнительно снижен на 40%' },
  { id: 'overheat_recovery', ability: 'overheat', name: 'Быстрый отвод тепла', icon: 'i_speed', desc: 'Штраф после перегрева: −15% на 1,5 с вместо −25% на 2 с' },

  { id: 'circle_duration', ability: 'arcane_circle', name: 'Стойкая печать', icon: 'i_orb', desc: 'Магический круг существует на 0,6 секунды дольше' },
  { id: 'circle_radius', ability: 'arcane_circle', name: 'Большая печать', icon: 'i_star', desc: 'Радиус магического круга увеличен на 15%' },
  { id: 'circle_mobile', ability: 'arcane_circle', name: 'Живая печать', icon: 'i_speed', desc: 'Круг следует за магом, но его радиус уменьшается на 20%' },
  { id: 'circle_power', ability: 'arcane_circle', name: 'Резонанс маны', icon: 'i_aspd', desc: 'Бонус скорости магического оружия увеличен с 35% до 42%' },
];

export function rollAbilityAugmentChoices(ability: AbilityId, owned: ReadonlySet<string>, count = 3): AbilityAugmentDef[] {
  const pool = ABILITY_AUGMENTS.filter((augment) => augment.ability === ability && !owned.has(augment.id));
  const out: AbilityAugmentDef[] = [];
  while (pool.length > 0 && out.length < count) {
    const chosen = pick(pool);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}
