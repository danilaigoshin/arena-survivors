import { CHARACTERS } from './characters';
import { EVOLUTIONS } from './evolutions';
import { ITEMS } from './items';
import { DICTS } from './locales';
import { WEAPON_CLASS, type WeaponClassId } from './sets';
import { WEAPONS } from './weapons';
import { ABILITY_AUGMENTS } from './abilityAugments';
import { TALENTS } from './talents';
import { CAMPAIGN_CONTRACT_WAVES, WAVE_CONTRACTS } from './contracts';
import { WEAPON_BRANCHES } from './weaponBranches';
import { WAVE_OBJECTIVES } from './objectives';
import { ROUTES } from './routes';
import { THEMES } from './maps';
import { CHALLENGES, COSMETICS } from './challenges';

export function validateGameContent(): string[] {
  const problems: string[] = [];
  const weaponIds = new Set<string>();
  const itemIds = new Set(ITEMS.map((item) => item.id));
  const classes: WeaponClassId[] = ['gunner', 'blade', 'arcane'];

  for (const weapon of WEAPONS) {
    if (weaponIds.has(weapon.id)) problems.push(`duplicate weapon id: ${weapon.id}`);
    weaponIds.add(weapon.id);
    if (!WEAPON_CLASS[weapon.id]) problems.push(`weapon without class: ${weapon.id}`);
    const config = weapon[weapon.behavior];
    if (!config) problems.push(`weapon without ${weapon.behavior} config: ${weapon.id}`);
  }

  for (const item of ITEMS) {
    if ((item.modifiers.maxHp ?? 0) > 13) problems.push(`${item.id}: item max-HP bonus exceeds 13`);
    if ((item.modifiers.hpRegen ?? 0) > 1.5) problems.push(`${item.id}: item HP regen exceeds 1.5`);
  }

  for (const cls of classes) {
    const bases = WEAPONS.filter((weapon) => !weapon.evolved && WEAPON_CLASS[weapon.id] === cls);
    if (bases.length !== 6) problems.push(`${cls}: ${bases.length} base weapons, expected 6`);
    const locked = bases.filter((weapon) => weapon.unlockCost);
    if (locked.length !== 2) problems.push(`${cls}: ${locked.length} locked weapons, expected 2`);
  }

  const normalEvolutions = EVOLUTIONS.filter((evolution) => !evolution.minWave);
  for (const base of WEAPONS.filter((weapon) => !weapon.evolved)) {
    const recipes = normalEvolutions.filter((evolution) => evolution.base === base.id);
    if (recipes.length !== 1) problems.push(`${base.id}: ${recipes.length} normal evolutions, expected 1`);
  }
  for (const evolution of EVOLUTIONS) {
    const base = WEAPONS.find((weapon) => weapon.id === evolution.base);
    const result = WEAPONS.find((weapon) => weapon.id === evolution.result);
    if (!base) problems.push(`unknown evolution base: ${evolution.base}`);
    if (!result?.evolved) problems.push(`invalid evolution result: ${evolution.result}`);
    if (!itemIds.has(evolution.catalyst)) problems.push(`unknown catalyst: ${evolution.catalyst}`);
    if (base && result && WEAPON_CLASS[base.id] !== WEAPON_CLASS[result.id]) problems.push(`cross-class evolution: ${base.id} -> ${result.id}`);
  }

  for (const character of CHARACTERS) {
    const start = WEAPONS.find((weapon) => weapon.id === character.weapon);
    if (!start) problems.push(`${character.id}: unknown starting weapon ${character.weapon}`);
    else if (character.weaponClass !== 'all' && WEAPON_CLASS[start.id] !== character.weaponClass) problems.push(`${character.id}: forbidden starting weapon ${start.id}`);
    const augmentCount = ABILITY_AUGMENTS.filter((augment) => augment.ability === character.ability.id).length;
    if (augmentCount !== 4) problems.push(`${character.ability.id}: ${augmentCount} augments, expected 4`);
  }

  for (const branch of WEAPON_BRANCHES) {
    const sustainedMult = branch.damageMult * branch.attackSpeedMult;
    if (sustainedMult < 0.97 || sustainedMult > 1.03) problems.push(`${branch.id}: branch DPS multiplier ${sustainedMult.toFixed(3)} outside balance budget`);
  }
  for (const contract of WAVE_CONTRACTS) {
    if (contract.materialMult > 1.25) problems.push(`${contract.id}: material multiplier exceeds 1.25`);
    if (contract.enemySpeedMult > 1.15) problems.push(`${contract.id}: speed multiplier exceeds 1.15`);
    if (contract.enemyDamageMult > 1.1) problems.push(`${contract.id}: damage multiplier exceeds 1.10`);
  }
  if (new Set(CAMPAIGN_CONTRACT_WAVES).size !== 5) problems.push('campaign must contain five unique contract waves');
  for (const nextWave of [6, 11, 16]) {
    if ((CAMPAIGN_CONTRACT_WAVES as readonly number[]).includes(nextWave)) {
      problems.push(`contract wave ${nextWave} collides with a boss-reward transition`);
    }
  }

  for (const key of Object.keys(DICTS.ru)) {
    if (!DICTS.en[key]) problems.push(`en: missing ${key}`);
  }

  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const key of [
      'hero.arsenal', 'hero.anyClass', 'tt.explosion', 'tt.bounces', 'tt.radius', 'tt.summons', 'tt.impact', 'tt.tickDmg',
      'talent.title', 'prog.abilityTitle', 'prog.contractTitle', 'shop.specialization', 'shop.chooseModule', 'contract.none',
      'objective.hunter', 'objective.collector', 'objective.hold',
    ]) {
      if (!dict[key]) problems.push(`${lang}: missing ${key}`);
    }
    if (lang === 'ru') continue;
    for (const character of CHARACTERS) {
      if (!dict[`ab:${character.ability.id}`]) problems.push(`${lang}: missing ab:${character.ability.id}`);
      if (!dict[`abd:${character.ability.id}`]) problems.push(`${lang}: missing abd:${character.ability.id}`);
    }
    for (const talent of TALENTS) {
      if (!dict[`tal:${talent.id}`]) problems.push(`${lang}: missing tal:${talent.id}`);
      if (!dict[`tald:${talent.id}`]) problems.push(`${lang}: missing tald:${talent.id}`);
    }
    for (const augment of ABILITY_AUGMENTS) {
      if (!dict[`aug:${augment.id}`]) problems.push(`${lang}: missing aug:${augment.id}`);
      if (!dict[`augd:${augment.id}`]) problems.push(`${lang}: missing augd:${augment.id}`);
    }
    for (const branch of WEAPON_BRANCHES) {
      if (!dict[`br:${branch.id}`]) problems.push(`${lang}: missing br:${branch.id}`);
      if (!dict[`brd:${branch.id}`]) problems.push(`${lang}: missing brd:${branch.id}`);
      if (!dict[`brs:${branch.id}`]) problems.push(`${lang}: missing brs:${branch.id}`);
    }
    for (const contract of WAVE_CONTRACTS) {
      if (!dict[`con:${contract.id}`]) problems.push(`${lang}: missing con:${contract.id}`);
      if (!dict[`cond:${contract.id}`]) problems.push(`${lang}: missing cond:${contract.id}`);
      if (!dict[`conr:${contract.id}`]) problems.push(`${lang}: missing conr:${contract.id}`);
    }
    for (const objective of Object.values(WAVE_OBJECTIVES)) if (!dict[`obj:${objective.id}`]) problems.push(`${lang}: missing obj:${objective.id}`);
    for (const weapon of WEAPONS) if (!dict[`w:${weapon.id}`]) problems.push(`${lang}: missing w:${weapon.id}`);
  }

  const routeIds = new Set<string>();
  for (const chapter of [1, 2, 3] as const) {
    if (ROUTES.filter((route) => route.chapter === chapter).length !== 2) {
      problems.push(`chapter ${chapter}: expected exactly two routes`);
    }
  }
  for (const route of ROUTES) {
    if (routeIds.has(route.id)) problems.push(`duplicate route id: ${route.id}`);
    routeIds.add(route.id);
    if (route.themeIndices.length !== 5) problems.push(`${route.id}: expected five route themes`);
    if (route.themeIndices.some((index) => !Number.isInteger(index) || !THEMES[index])) {
      problems.push(`${route.id}: invalid theme index`);
    }
  }
  const cosmeticIds = new Set<string>(COSMETICS.map((cosmetic) => cosmetic.id));
  const challengeIds = new Set<string>();
  for (const challenge of CHALLENGES) {
    if (challengeIds.has(challenge.id)) problems.push(`duplicate challenge id: ${challenge.id}`);
    challengeIds.add(challenge.id);
    if (challenge.cosmetic && !cosmeticIds.has(challenge.cosmetic)) problems.push(`${challenge.id}: unknown cosmetic reward`);
  }
  return problems;
}
