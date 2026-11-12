import type { Lang } from './types';
import { STRINGS, fmt, type StringKey } from './strings';

let current: Lang = 'en';
const listeners = new Set<(lang: Lang) => void>();

export function getLang(): Lang {
  return current;
}

export function isRtl(): boolean {
  return current === 'he';
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  return fmt(STRINGS[current][key], vars);
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem('city-lang', lang);
  } catch {
    /* storage unavailable: language just won't be remembered */
  }
  applyStaticStrings();
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn: (lang: Lang) => void): void {
  listeners.add(fn);
}

/** Language from ?lang=he, then the remembered choice, then English (the chosen default). */
export function initLang(): void {
  let lang: Lang = 'en';
  const param = new URLSearchParams(location.search).get('lang');
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('city-lang');
  } catch {
    saved = null;
  }
  if (param === 'he' || param === 'en') lang = param;
  else if (saved === 'he' || saved === 'en') lang = saved;
  setLang(lang);
}

/** Fill elements marked with data-i18n / data-i18n-title / data-i18n-ph in index.html. */
export function applyStaticStrings(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as StringKey);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const s = t(el.dataset.i18nTitle as StringKey);
    el.title = s;
    el.setAttribute('aria-label', s);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh as StringKey);
  });
}
