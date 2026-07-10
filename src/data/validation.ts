import { CHARACTERS } from './characters';
import { EVOLUTIONS } from './evolutions';
import { ITEMS } from './items';
import { DICTS } from './locales';
import { WEAPON_CLASS, type WeaponClassId } from './sets';
import { WEAPONS } from './weapons';

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
  }

  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const key of ['hero.arsenal', 'hero.anyClass', 'tt.explosion', 'tt.bounces', 'tt.radius', 'tt.summons', 'tt.impact', 'tt.tickDmg']) {
      if (!dict[key]) problems.push(`${lang}: missing ${key}`);
    }
    if (lang === 'ru') continue;
    for (const weapon of WEAPONS) if (!dict[`w:${weapon.id}`]) problems.push(`${lang}: missing w:${weapon.id}`);
  }
  return problems;
}
