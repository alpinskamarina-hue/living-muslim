import type { AppState, Habit } from './types';
import { fromKey } from './dates';

// Dependency-free Ramadan helpers, safe to import from the store.
function hm(key: string): { month: number; year: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric', year: 'numeric' }).formatToParts(fromKey(key));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return g('month') && g('year') ? { month: g('month'), year: g('year') } : null;
  } catch { return null; }
}
const cache = new Map<string, { month: number; year: number } | null>();
export const hMonth = (key: string) => { if (!cache.has(key)) cache.set(key, hm(key)); return cache.get(key)!; };
export const inRamadan = (key: string) => hMonth(key)?.month === 9;

/** How a habit runs on this day: hidden (paused for Ramadan, or a Ramadan-only habit outside its month), minimum, or as usual. */
export function ramadanMode(s: AppState, h: Habit, key: string): 'hide' | 'min' | null {
  const m = hMonth(key);
  const ram = m?.month === 9;
  if (h.ramadan) return ram && m!.year === h.ramadan ? null : 'hide';
  if (!ram) return null;
  const p = s.ramadan?.plan?.[h.id];
  return p === 'pause' ? 'hide' : p === 'min' ? 'min' : null;
}
export const ramadanHidden = (s: AppState, h: Habit, key: string) => ramadanMode(s, h, key) === 'hide';
