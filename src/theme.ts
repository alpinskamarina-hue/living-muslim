// Light or dark for the whole app. Default «после Магриба»: dark from Maghrib to Fajr, light in the day.
// The result is always written to <html data-theme>, so the CSS never has to guess from the phone's setting.
import type { DayTimes } from './prayer';
import type { Settings } from './types';

export type ThemeMode = NonNullable<Settings['theme']>;
export const themeMode = (s: Settings): ThemeMode => s.theme ?? 'prayer';

export function effectiveTheme(mode: ThemeMode, times: DayTimes, now: Date, sysDark: boolean): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'auto') return sysDark ? 'dark' : 'light';
  return now >= times.maghrib || now < times.fajr ? 'dark' : 'light';
}

let current: 'light' | 'dark' = 'light';
/** Set by the app on every render, before its screens render. */
export const setCurrentTheme = (t: 'light' | 'dark') => { current = t; };
export const currentTheme = () => current;

export const sysPrefersDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
