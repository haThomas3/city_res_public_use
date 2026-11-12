import type { Lang, LocalizedList, LocalizedText } from './types';

/** Pick the text for a language, falling back to English. Pure: safe to use at build time. */
export function loc(t: LocalizedText | undefined, lang: Lang): string {
  if (t === undefined) return '';
  if (typeof t === 'string') return t;
  return lang === 'he' && t.he ? t.he : t.en;
}

export function locList(t: LocalizedList | undefined, lang: Lang): string[] {
  if (!t) return [];
  if (Array.isArray(t)) return t;
  return lang === 'he' && t.he && t.he.length ? t.he : t.en;
}

/** Every language variant of a text, for searching. */
export function allVariants(t: LocalizedText | undefined): string[] {
  if (t === undefined) return [];
  if (typeof t === 'string') return [t];
  return t.he ? [t.en, t.he] : [t.en];
}
