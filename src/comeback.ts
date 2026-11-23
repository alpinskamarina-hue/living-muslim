import type { AppState, Habit } from './types';
import { ANCHORS } from './types';
import { addDays, daysBetween } from './dates';
import { consistency, isCounted } from './store';
import { isTripDay } from './safar';
import { dayLight, journey, garden } from './gamify';

/**
 * «С возвращением» (23.11): someone who was away for 3+ days gets one warm sheet instead of a screen of empty days.
 * The garden is shown as saved, travel or illness up to 10 days turns into hard days (the streak survives),
 * and «Начать с одного» keeps one steady habit and rests the others, bringing them back one by one.
 */

export type BackWhy = 'sick' | 'road' | 'work' | 'slip' | 'none';
export interface BackState {
  /** Day of the return. */
  from: string;
  /** Missed days before it. */
  gap: number;
  why?: BackWhy;
  /** The habit kept on; the rested ones wait in `ids` (status archived + rest). */
  keep?: string;
  ids: string[];
  /** Day of the last «вернуть ещё одну?» (asked or returned): the next ask comes after 3 more lit days. */
  step?: string;
}

/** Days with at least one mark, before today. */
function lastActive(s: AppState, today: string): string | null {
  let last = s.seen && s.seen < today ? s.seen : '';
  for (const d of Object.keys(s.log)) if (d < today && d > last && Object.values(s.log[d] ?? {}).some((m) => isCounted(m))) last = d;
  for (const d of Object.keys(s.prayers)) if (d < today && d > last && Object.keys(s.prayers[d] ?? {}).length) last = d;
  return last || null;
}

const paused = (s: AppState, d: string) => isTripDay(s, d) || (s.hard[d]?.length ?? 0) > 0;
export const MIN_GAP = 3;
/** Travel or illness up to this many days becomes hard days, so the streak goes on. */
export const FORGIVE_DAYS = 10;

export interface BackInfo { last: string; gap: number; lit: number; leaves: number; fruits: number; best: number; habits: number; demo?: boolean }

/** Whether to greet: 3+ missed days that were not a trip or hard days, and someone with something to come back to. */
export function comebackDue(s: AppState, today: string): BackInfo | null {
  if (s.back?.from === today) return null;
  const last = lastActive(s, today);
  if (!last) return null;
  const gap = daysBetween(last, today) - 1;
  if (gap < MIN_GAP) return null;
  let real = 0;
  for (let d = addDays(last, 1); d < today; d = addDays(d, 1)) if (!paused(s, d)) real++;
  if (real < MIN_GAP) return null;
  return info(s, today, last, gap);
}

function info(s: AppState, today: string, last: string, gap: number, demo?: boolean): BackInfo {
  const j = journey(s, today);
  const g = garden(j.lit);
  const habits = s.habits.filter((h) => h.status === 'active' && !h.ramadan).length;
  return { last, gap, lit: j.lit, leaves: g.leaves, fruits: g.fruits, best: j.best, habits, demo };
}

/** ?back=1 on the test link: the sheet as after a 5-day gap, without touching the days. */
export function comebackDemo(s: AppState, today: string): BackInfo {
  return info(s, today, lastActive(s, today) ?? addDays(today, -6), 5, true);
}

/** The steadiest active habit before the gap (its last 28 days), the oldest on a tie. */
export function steadiest(s: AppState, last: string): Habit | null {
  const list = s.habits.filter((h) => h.status === 'active' && !h.ramadan);
  if (!list.length) return null;
  const rate = (h: Habit) => (h.createdAt <= last ? consistency(s, h, last, 28).rate : 0);
  return [...list].sort((a, b) => rate(b) - rate(a) || (a.createdAt < b.createdAt ? -1 : 1))[0];
}

/** Travel or illness, gap up to 10 days: the missed days become hard days (pause, nothing ticked). */
function forgive(s: AppState, b: BackInfo, why: BackWhy | undefined, today: string): AppState {
  if (b.demo || (why !== 'sick' && why !== 'road') || b.gap > FORGIVE_DAYS) return s;
  const hard = { ...s.hard };
  for (let d = addDays(b.last, 1); d < today; d = addDays(d, 1)) if (!hard[d]?.length && !isTripDay(s, d)) hard[d] = [...ANCHORS];
  return { ...s, hard };
}

/** «Начать с одного»: keep the steadiest habit, rest the others (archived + rest, nothing deleted). */
export function startWithOne(s: AppState, b: BackInfo, why: BackWhy | undefined, today: string): AppState {
  const keep = steadiest(s, b.last);
  const rest = keep ? s.habits.filter((h) => h.status === 'active' && !h.ramadan && h.id !== keep.id).map((h) => h.id) : [];
  const habits = s.habits.map((h) => (rest.includes(h.id) ? { ...h, status: 'archived' as const, rest: true } : h));
  const back: BackState = { from: today, gap: b.gap, why, keep: keep?.id, ids: rest, step: today };
  return forgive({ ...s, habits, back }, b, why, today);
}

/** «Продолжить как было»: only remember the answer (and forgive travel or illness). */
export function carryOn(s: AppState, b: BackInfo, why: BackWhy | undefined, today: string): AppState {
  return forgive({ ...s, back: { from: today, gap: b.gap, why, ids: [] } }, b, why, today);
}

/** Lit days after `from` up to today. */
function litSince(s: AppState, from: string, today: string) {
  let n = 0;
  for (let d = addDays(from, 1); d <= today; d = addDays(d, 1)) if (dayLight(s, d).lit) n++;
  return n;
}
export const STEP_DAYS = 3;

/** The rested habit to offer back now: after 3 lit days since the return or the last ask. */
export function nextBack(s: AppState, today: string): Habit | null {
  const b = s.back;
  if (!b?.ids.length) return null;
  const from = b.step ?? b.from;
  if (from >= today || litSince(s, from, today) < STEP_DAYS) return null;
  return s.habits.find((h) => h.id === b.ids[0] && h.rest) ?? null;
}

/** Bring one rested habit back (or every one, from the profile). */
export function restoreHabit(s: AppState, id: string, today: string): AppState {
  const habits = s.habits.map((h) => (h.id === id && h.rest ? { ...h, status: 'active' as const, rest: undefined } : h));
  const back = s.back ? { ...s.back, ids: s.back.ids.filter((x) => x !== id), step: today } : s.back;
  return { ...s, habits, back };
}

/** «Позже»: ask again after 3 more lit days. */
export const laterBack = (s: AppState, today: string): AppState => (s.back ? { ...s, back: { ...s.back, step: today } } : s);

/** Days since the return, while the «лучшая серия» line under the streak still helps. */
export const backRecent = (s: AppState, today: string) => Boolean(s.back && daysBetween(s.back.from, today) < 14);
