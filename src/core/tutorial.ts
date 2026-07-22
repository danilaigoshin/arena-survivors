import { tutorialSeen } from './save';

export type TutorialStepId =
  | 'movement'
  | 'ability'
  | 'objective'
  | 'boss'
  | 'shop'
  | 'merge'
  | 'evolution';

export interface TutorialStep {
  id: TutorialStepId;
  icon: string;
  titleKey: string;
  bodyKey: string;
}

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStep> = {
  movement: { id: 'movement', icon: 'i_speed', titleKey: 'tutorial.movement.title', bodyKey: 'tutorial.movement.body' },
  ability: { id: 'ability', icon: 'i_star', titleKey: 'tutorial.ability.title', bodyKey: 'tutorial.ability.body' },
  objective: { id: 'objective', icon: 'i_trophy', titleKey: 'tutorial.objective.title', bodyKey: 'tutorial.objective.body' },
  boss: { id: 'boss', icon: 'i_skull', titleKey: 'tutorial.boss.title', bodyKey: 'tutorial.boss.body' },
  shop: { id: 'shop', icon: 'i_gem', titleKey: 'tutorial.shop.title', bodyKey: 'tutorial.shop.body' },
  merge: { id: 'merge', icon: 'i_aspd', titleKey: 'tutorial.merge.title', bodyKey: 'tutorial.merge.body' },
  evolution: { id: 'evolution', icon: 'i_planet', titleKey: 'tutorial.evolution.title', bodyKey: 'tutorial.evolution.body' },
};

export function runTutorialForWave(wave: number): TutorialStepId | null {
  const id = wave === 1 ? 'movement' : wave === 2 ? 'ability' : wave === 3 ? 'objective' : wave === 5 ? 'boss' : null;
  return id && !tutorialSeen(id) ? id : null;
}

export function shopTutorialAfterWave(wave: number): TutorialStepId | null {
  const id = wave === 1 ? 'shop' : wave === 2 ? 'merge' : wave === 4 ? 'evolution' : null;
  return id && !tutorialSeen(id) ? id : null;
}
