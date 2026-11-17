import type { AppState } from './types';
import { plural } from './dates';

export type Lang = 'ru' | 'en';

/** The interface language. Unset: English only when the browser itself is English. */
export function langOf(s: AppState): Lang {
  if (s.settings.lang) return s.settings.lang;
  try { return /^en\b/i.test(navigator.language) ? 'en' : 'ru'; } catch { return 'ru'; }
}

/** `t('Пост', 'Fast')` */
export const tr = (l: Lang) => (ru: string, en: string) => (l === 'en' ? en : ru);

/** Count with a noun: n(l, 3, ['день', 'дня', 'дней'], ['day', 'days']). */
export const nw = (l: Lang, n: number, ru: [string, string, string], en: [string, string]) =>
  `${n} ${l === 'en' ? (n === 1 ? en[0] : en[1]) : plural(n, ...ru)}`;

export function durL(l: Lang, ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60), r = m % 60;
  if (l === 'en') return h === 0 ? `${r} min` : r ? `${h} h ${r} min` : `${h} h`;
  return h === 0 ? `${r} мин` : r ? `${h} ч ${r} мин` : `${h} ч`;
}

export const ordL = (l: Lang, n: number) => {
  if (l === 'ru') return `${n}-я`;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};
