import { CHARACTERS } from './characters';
import { EVOLUTIONS } from './evolutions';
import { ITEMS } from './items';
import { DICTS, hasExplicitTranslation } from './locales';
import { CLASS_DEFS, WEAPON_CLASS, type WeaponClassId } from './sets';
import { WEAPONS } from './weapons';
import { ABILITY_AUGMENTS } from './abilityAugments';
import { TALENTS } from './talents';
import { CAMPAIGN_CONTRACT_WAVES, WAVE_CONTRACTS } from './contracts';
import { WEAPON_BRANCHES } from './weaponBranches';
import { WAVE_OBJECTIVES } from './objectives';
import { ROUTES } from './routes';
import { THEMES } from './maps';
import { CHALLENGES, COSMETICS } from './challenges';
import { UPGRADES } from './upgrades';
import { PERKS } from './perks';
import { DIFFICULTIES } from './difficulty';
import { ENEMIES } from './enemies';

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
    if (!DICTS.ru[key].trim()) problems.push(`ru: empty ${key}`);
    if (!DICTS.en[key]) problems.push(`en: missing ${key}`);
    const ruParams = (DICTS.ru[key].match(/\{\d+\}/g) ?? []).sort().join(',');
    const enParams = (DICTS.en[key]?.match(/\{\d+\}/g) ?? []).sort().join(',');
    if (DICTS.en[key] && ruParams !== enParams) problems.push(`en: placeholder mismatch in ${key}`);
  }
  const explicitlyLocalizedKeys = Object.keys(DICTS.en);
  for (const key of explicitlyLocalizedKeys) {
    if (!DICTS.en[key].trim()) problems.push(`en: empty ${key}`);
  }
  for (const lang of Object.keys(DICTS)) {
    if (lang === 'ru' || lang === 'en') continue;
    for (const key of explicitlyLocalizedKeys) {
      if (!hasExplicitTranslation(lang, key)) problems.push(`${lang}: missing explicit ${key}`);
      if (!DICTS[lang][key]?.trim()) problems.push(`${lang}: empty ${key}`);
      const expectedParams = (DICTS.en[key].match(/\{\d+\}/g) ?? []).sort().join(',');
      const actualParams = (DICTS[lang][key]?.match(/\{\d+\}/g) ?? []).sort().join(',');
      if (actualParams !== expectedParams) problems.push(`${lang}: placeholder mismatch in ${key}`);
    }
  }

  const requiredContentKeys = [
    ...CHARACTERS.flatMap((character) => [
      `c:${character.id}`, `cd:${character.id}`,
      `ab:${character.ability.id}`, `abd:${character.ability.id}`,
    ]),
    ...WEAPONS.map((weapon) => `w:${weapon.id}`),
    ...ITEMS.map((item) => `i:${item.id}`),
    ...UPGRADES.map((upgrade) => `u:${upgrade.id}`),
    ...PERKS.map((perk) => `p:${perk.id}`),
    ...Object.values(CLASS_DEFS).map((weaponClass) => `s:${weaponClass.id}`),
    ...DIFFICULTIES.flatMap((difficulty) => [`d:${difficulty.id}`, `dd:${difficulty.id}`]),
    ...THEMES.map((theme) => `t:${theme.name}`),
    ...ENEMIES.map((enemy) => `enemy:${enemy.id}`),
    ...CHALLENGES.flatMap((challenge) => [`challenge:${challenge.id}`, `challenged:${challenge.id}`]),
    ...COSMETICS.map((cosmetic) => `cos:${cosmetic.id}`),
    ...ROUTES.flatMap((route) => [`route:${route.id}`, `routed:${route.id}`, `router:${route.id}`]),
    ...TALENTS.flatMap((talent) => [`tal:${talent.id}`, `tald:${talent.id}`]),
    ...ABILITY_AUGMENTS.flatMap((augment) => [`aug:${augment.id}`, `augd:${augment.id}`]),
    ...WEAPON_BRANCHES.flatMap((branch) => [`br:${branch.id}`, `brd:${branch.id}`, `brs:${branch.id}`]),
    ...WAVE_CONTRACTS.flatMap((contract) => [`con:${contract.id}`, `cond:${contract.id}`, `conr:${contract.id}`]),
    ...Object.values(WAVE_OBJECTIVES).map((objective) => `obj:${objective.id}`),
    'source:enemy', 'source:explosion', 'source:fire', 'source:projectile', 'source:frost',
  ];
  const dictionaryOnlyKeys = [
    ...ENEMIES.map((enemy) => `enemy:${enemy.id}`),
    'source:enemy', 'source:explosion', 'source:fire', 'source:projectile', 'source:frost',
  ];

  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const key of [
      'hero.arsenal', 'hero.anyClass', 'tt.explosion', 'tt.bounces', 'tt.radius', 'tt.summons', 'tt.impact', 'tt.tickDmg',
      'talent.title', 'prog.abilityTitle', 'prog.contractTitle', 'shop.specialization', 'shop.chooseModule', 'contract.none',
      'objective.hunter', 'objective.collector', 'objective.hold',
    ]) {
      if (!dict[key]) problems.push(`${lang}: missing ${key}`);
    }
    if (lang === 'ru') {
      for (const key of dictionaryOnlyKeys) if (!dict[key]) problems.push(`${lang}: missing ${key}`);
      continue;
    }
    for (const key of requiredContentKeys) if (!dict[key]) problems.push(`${lang}: missing ${key}`);
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
