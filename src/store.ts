import { useCallback, useEffect, useState } from 'react';
import type { Anchor, AppState, Habit, Mark, PrayerMark } from './types';
import { addDays, dayKey, daysBetween } from './dates';
import { isTripDay } from './safar';
import { ramadanHidden } from './rplan';

const KEY = 'qadam.v1';
const OLD_KEYS = ['istiqama.v1'];
export const ACTIVE_LIMIT = 5;
const FORM_DAYS = 21;
const FORM_RATE = 0.8;

export const initialState = (): AppState => ({
  version: 1,
  habits: [],
  log: {},
  hard: {},
  notes: {},
  prayers: {},
  settings: { place: 'Амстердам', lat: 52.3676, lng: 4.9041, method: 'MuslimWorldLeague', madhab: 'shafi', name: '' },
});

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY) ?? OLD_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ?? null;
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s && s.version === 1 && Array.isArray(s.habits)) return { ...initialState(), ...s };
    }
  } catch {
    /* storage can be blocked; the app still works for this visit */
  }
  return initialState();
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => promote(fn(s))), []);
  return [state, update, setState] as const;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const isCounted = (m?: Mark) => m === 'done' || m === 'min';

/** Habits that count toward the limit of 5. */
export const slotsUsed = (s: AppState) => s.habits.filter((h) => h.status === 'active' && !h.formed && !h.ramadan).length;

/**
 * Streak with the "never miss twice" rule: a single missed day does not break it, two in a row do.
 * Today counts only when already marked.
 */
export function streak(s: AppState, h: Habit, today: string) {
  let n = 0;
  let misses = 0;
  let d = today;
  if (isCounted(s.log[today]?.[h.id])) n++;
  d = addDays(today, -1);
  while (d >= h.createdAt) {
    if (isCounted(s.log[d]?.[h.id])) {
      n++;
      misses = 0;
    } else if (isTripDay(s, d) || ramadanHidden(s, h, d)) {
      /* travel days are not misses */
    } else if (++misses >= 2) break;
    d = addDays(d, -1);
  }
  return n;
}

/** Yesterday was missed, so today must not be. */
export function atRisk(s: AppState, h: Habit, today: string) {
  const y = addDays(today, -1);
  if (isTripDay(s, today) || isTripDay(s, y) || ramadanHidden(s, h, today) || ramadanHidden(s, h, y)) return false;
  return y >= h.createdAt && !isCounted(s.log[y]?.[h.id]) && !isCounted(s.log[today]?.[h.id]);
}

/** Share of days marked over the last `days` days (today included only if marked). */
export function consistency(s: AppState, h: Habit, today: string, days = 28) {
  let total = 0;
  let hit = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (d < h.createdAt) break;
    const ok = isCounted(s.log[d]?.[h.id]);
    if (i === 0 && !ok) continue;
    if (!ok && (isTripDay(s, d) || ramadanHidden(s, h, d))) continue;
    total++;
    if (ok) hit++;
  }
  return { total, hit, rate: total ? hit / total : 0 };
}

/** Mark formed habits and move the queue forward while there is room. */
function promote(s: AppState): AppState {
  const today = dayKey(new Date());
  let changed = false;
  const habits = s.habits.map((h) => {
    if (h.status !== 'active' || h.formed || daysBetween(h.createdAt, today) < FORM_DAYS) return h;
    const c = consistency(s, h, today, FORM_DAYS);
    if (c.total >= FORM_DAYS && c.rate >= FORM_RATE) {
      changed = true;
      return { ...h, formed: true };
    }
    return h;
  });
  let used = habits.filter((h) => h.status === 'active' && !h.formed && !h.ramadan).length;
  for (let i = 0; i < habits.length && used < ACTIVE_LIMIT; i++) {
    if (habits[i].status === 'queued') {
      habits[i] = { ...habits[i], status: 'active', createdAt: today };
      used++;
      changed = true;
    }
  }
  return changed ? { ...s, habits } : s;
}

export function setMark(s: AppState, date: string, id: string, m: Mark | null): AppState {
  const day = { ...(s.log[date] ?? {}) };
  if (m) day[id] = m;
  else delete day[id];
  return { ...s, log: { ...s.log, [date]: day } };
}

export function toggleHard(s: AppState, date: string, a: Anchor): AppState {
  const list = s.hard[date] ?? [];
  const on = !list.includes(a);
  const ids = s.habits.filter((h) => h.status === 'active' && h.anchor === a).map((h) => h.id);
  const day = { ...(s.log[date] ?? {}) };
  for (const id of ids) {
    if (on && day[id] !== 'done') day[id] = 'min';
    if (!on && day[id] === 'min') delete day[id];
  }
  return {
    ...s,
    log: { ...s.log, [date]: day },
    hard: { ...s.hard, [date]: on ? [...list, a] : list.filter((x) => x !== a) },
  };
}

export function setPrayer(s: AppState, date: string, a: Anchor, m: PrayerMark | null): AppState {
  const day = { ...(s.prayers[date] ?? {}) };
  if (m) day[a] = m;
  else delete day[a];
  return { ...s, prayers: { ...s.prayers, [date]: day } };
}
