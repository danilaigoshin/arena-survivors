export interface RouteReward {
  materials?: number;
  maxHp?: number;
}

export interface RouteDef {
  id: string;
  chapter: 1 | 2 | 3;
  name: string;
  desc: string;
  rewardText: string;
  icon: string;
  /** Theme indices used by the next five waves. */
  themeIndices: readonly number[];
  reward: RouteReward;
}

export const ROUTES: readonly RouteDef[] = [
  {
    id: 'mistwood', chapter: 1, name: 'Тропа туманов',
    desc: 'Кладбища, тёмный лес и заросшие руины. Больше тесных проходов.',
    rewardText: '+12 материалов на подготовку', icon: 'i_skull',
    themeIndices: [1, 2, 1, 6, 2], reward: { materials: 12 },
  },
  {
    id: 'frostpass', chapter: 1, name: 'Ледяной перевал',
    desc: 'Открытые ледники сменяются древними руинами.',
    rewardText: '+8 к максимальному здоровью отряда', icon: '❄️',
    themeIndices: [4, 4, 6, 4, 6], reward: { maxHp: 8 },
  },
  {
    id: 'ashroad', chapter: 2, name: 'Пепельный тракт',
    desc: 'Пустоши и пепелища с прямыми линиями огня.',
    rewardText: '+20 материалов на подготовку', icon: '🔥',
    themeIndices: [3, 5, 3, 5, 6], reward: { materials: 20 },
  },
  {
    id: 'sunkenroad', chapter: 2, name: 'Затонувшая дорога',
    desc: 'Болота и чащи, где укрытие становится частью маршрута.',
    rewardText: '+12 к максимальному здоровью отряда', icon: 'i_heart',
    themeIndices: [7, 2, 7, 6, 7], reward: { maxHp: 12 },
  },
  {
    id: 'ironmarch', chapter: 3, name: 'Железный марш',
    desc: 'Укреплённые руины ведут к последнему бастиону.',
    rewardText: '+30 материалов перед финалом', icon: 'i_armor',
    themeIndices: [8, 6, 8, 6, 8], reward: { materials: 30 },
  },
  {
    id: 'demonrift', chapter: 3, name: 'Демонический разлом',
    desc: 'Короткий путь через пепел прямо к логову Владыки.',
    rewardText: '+15 к максимальному здоровью отряда', icon: 'i_star',
    themeIndices: [5, 9, 5, 9, 9], reward: { maxHp: 15 },
  },
] as const;

export function routesAfterWave(wave: number): readonly RouteDef[] {
  const chapter = wave === 5 ? 1 : wave === 10 ? 2 : wave === 15 ? 3 : 0;
  return chapter === 0 ? [] : ROUTES.filter((route) => route.chapter === chapter);
}

export function routeById(id: string): RouteDef | undefined {
  return ROUTES.find((route) => route.id === id);
}

/** Returns a selected route theme or the original campaign theme index. */
export function themeIndexForWave(wave: number, selectedRouteIds: readonly string[]): number {
  if (wave <= 5 || wave > 20) return (wave - 1) % 10;
  const chapter = Math.min(3, Math.floor((wave - 1) / 5)) as 1 | 2 | 3;
  const route = routeById(selectedRouteIds[chapter - 1] ?? '');
  if (!route || route.chapter !== chapter) return (wave - 1) % 10;
  const index = (wave - (chapter * 5 + 1)) % route.themeIndices.length;
  return route.themeIndices[Math.max(0, index)];
}
