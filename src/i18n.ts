import type { AppState } from './types';

export type Lang = 'ru' | 'en';

/** The interface language. Unset: English only when the browser itself is English. */
export function langOf(_s?: AppState): Lang {
  return LANG;
}

/** `t('Пост', 'Fast')` */
export const tr = (l: Lang) => (ru: string, en: string) => (l === 'en' ? en : ru);

/** Count with a noun: n(l, 3, ['день', 'дня', 'дней'], ['day', 'days']). */
export const nw = (l: Lang, n: number, ru: [string, string, string], en: [string, string]) =>
  `${n} ${l === 'en' ? (n === 1 ? en[0] : en[1]) : ruPlural(n, ...ru)}`;

function ruPlural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}

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

// ───── Whole-app translation ─────
// Every Russian UI string goes through _t() (see scripts/i18n-codemod.cjs). The language is read once at start;
// switching it in Profile reloads the app.
import { Fragment, createElement } from 'react';
/** Filled from ./en before the app starts, only when the interface is English (see main.tsx). */
let EN: Record<string, string> = {};
export const setEN = (d: Record<string, string>) => { EN = d; };

function startLang(): Lang {
  try {
    const raw = localStorage.getItem('qadam.v1') ?? localStorage.getItem('istiqama.v1');
    const l = raw ? (JSON.parse(raw)?.settings?.lang as Lang | undefined) : undefined;
    if (l === 'ru' || l === 'en') return l;
  } catch { /* storage blocked */ }
  try { return /^en\b/i.test(navigator.language) ? 'en' : 'ru'; } catch { return 'ru'; }
}

/** The app's language for this visit. */
export const LANG: Lang = startLang();
export const isEn = LANG === 'en';
/** Locale for dates and numbers. */
export const LOC = isEn ? 'en-GB' : 'ru-RU';

const look = (s: string) => {
  if (!isEn) return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const v = EN[m[2]];
  return v == null ? s : m[1] + v + m[3];
};

/** A Russian UI string in the current language; {0}, {1}… are filled from the arguments. */
export function _t(s: string, ...a: unknown[]): string {
  const out = look(s);
  return a.length ? out.replace(/\{(\d+)\}/g, (_, i) => String(a[+i])) : out;
}

/** Same for JSX text with values or elements inside: false/null/undefined print nothing. */
export function _tj(s: string, ...a: unknown[]): any {
  const parts = look(s).split(/\{(\d+)\}/);
  const vals = parts.map((p, i) => (i % 2 ? a[+p] : p)).map((v) => (v == null || typeof v === 'boolean' ? '' : v));
  return vals.every((v) => typeof v !== 'object') ? vals.join('') : createElement(Fragment, null, ...(vals as any[]));
}
