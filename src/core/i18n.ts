import { DICTS } from '../data/locales';

export type Lang = 'ru' | 'en' | 'es' | 'de' | 'fr' | 'pt' | 'zh' | 'ja';

export const LANGS: { code: Lang; native: string }[] = [
  { code: 'ru', native: 'Русский' },
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'de', native: 'Deutsch' },
  { code: 'fr', native: 'Français' },
  { code: 'pt', native: 'Português' },
  { code: 'zh', native: '中文' },
  { code: 'ja', native: '日本語' },
];

const KEY = 'as_lang';

function detect(): Lang {
  const saved = localStorage.getItem(KEY) as Lang | null;
  if (saved && LANGS.some((l) => l.code === saved)) return saved;
  const sys = (navigator.language || 'en').toLowerCase().slice(0, 2);
  const match = LANGS.find((l) => l.code === sys);
  return match ? match.code : 'en';
}

let lang: Lang = detect();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem(KEY, l);
}

/** UI string by key; params replace {0}, {1}… Falls back ru → key. */
export function t(key: string, ...params: (string | number)[]): string {
  let s = DICTS[lang]?.[key] ?? DICTS.ru[key] ?? key;
  for (let i = 0; i < params.length; i++) s = s.replace(`{${i}}`, String(params[i]));
  return s;
}

/** Content name (weapon/item/upgrade/…): dictionary override or the data's own (Russian) string. */
export function tn(prefix: string, id: string, fallback: string): string {
  if (lang === 'ru') return fallback;
  return DICTS[lang]?.[`${prefix}:${id}`] ?? fallback;
}
