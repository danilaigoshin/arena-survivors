import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTS } from '../src/data/locales';
import { validateGameContent } from '../src/data/validation';
import { getLang, setLang, tn, type Lang } from '../src/core/i18n';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('localization coverage', () => {
  it('resolves every literal UI translation key used by the game', () => {
    const usedKeys = new Set<string>();
    const translationCall = /(?<![A-Za-z0-9_])(?:t|tt)\('([^']+)'/g;
    const translationLiteral = /'([A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+)'/g;
    const knownPrefixes = new Set(Object.keys(DICTS.en).map((key) => key.split('.')[0]));

    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      if (file.endsWith('locales.ts') || file.endsWith('fullTranslations.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(translationCall)) usedKeys.add(match[1]);
      for (const match of source.matchAll(translationLiteral)) {
        if (knownPrefixes.has(match[1].split('.')[0])) usedKeys.add(match[1]);
      }
    }

    expect(usedKeys.size).toBeGreaterThan(300);
    expect([...usedKeys].filter((key) => !DICTS.en[key]).sort()).toEqual([]);
  });

  it('keeps every locale and dynamic content translation complete', () => {
    expect(validateGameContent()).toEqual([]);
  });

  it('localizes dictionary-only enemy names in every language', () => {
    const previous = getLang();
    const expected: Record<Lang, string> = {
      ru: 'Преследователь', en: 'Chaser', es: 'Perseguidor', de: 'Verfolger',
      fr: 'Poursuivant', pt: 'Perseguidor', zh: '追猎者', ja: '追跡者',
    };
    try {
      for (const [lang, name] of Object.entries(expected) as [Lang, string][]) {
        setLang(lang);
        expect(tn('enemy', 'chaser', 'chaser')).toBe(name);
      }
    } finally {
      setLang(previous);
    }
  });
});
