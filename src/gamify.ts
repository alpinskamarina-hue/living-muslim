import type { Anchor, AppState, Habit } from './types';
import { ANCHORS } from './types';
import { addDays, daysBetween } from './dates';
import { isCounted } from './store';
import { isTripDay } from './safar';
import { ramadanHidden } from './rplan';
import { hOf } from './ramadan';
import { _t } from './i18n';
import { prayersSeen, sisDay } from './sisters';

/**
 * Gamification without points: the "light of the day" (five prayer windows), a soft streak
 * that survives one missed day a week, and a private garden that only grows.
 */

/** Habits that were on the plan that day: started by then and still active, or marked that day. */
function habitsOn(s: AppState, date: string): Habit[] {
  const log = s.log[date] ?? {};
  return s.habits.filter(
    (h) => h.status !== 'queued' && h.createdAt <= date && (h.status === 'active' || log[h.id]) && !ramadanHidden(s, h, date),
  );
}

/** 0..1 for one prayer window: the prayer itself plus the habits tied to it. A minimum counts in full. */
export function windowLight(s: AppState, date: string, a: Anchor, habits = habitsOn(s, date)) {
  const list = habits.filter((h) => h.anchor === a);
  const log = s.log[date] ?? {};
  const got = (prayersSeen(s, date)[a] ? 1 : 0) + list.filter((h) => isCounted(log[h.id])).length;
  return got / (1 + list.length);
}

export function dayLight(s: AppState, date: string) {
  const habits = habitsOn(s, date);
  const windows = ANCHORS.map((a) => windowLight(s, date, a, habits));
  const log = s.log[date] ?? {};
  const allHabits = habits.length > 0 && habits.every((h) => isCounted(log[h.id]));
  const total = windows.reduce((x, y) => x + y, 0) / 5;
  return { windows, total, lit: total >= 0.5 || allHabits };
}

/** A day that neither counts nor breaks the streak: travel, a day marked "Тяжёлый день", or a sister's day without prayer. */
const pausedDay = (s: AppState, d: string) => isTripDay(s, d) || (s.hard[d]?.length ?? 0) > 0 || sisDay(s, d);

export function firstDay(s: AppState) {
  const keys = [...Object.keys(s.log), ...Object.keys(s.prayers), ...s.habits.map((h) => h.createdAt)].filter(Boolean).sort();
  return keys[0] ?? null;
}

export interface Journey {
  streak: number;
  best: number;
  lit: number; // all lit days ever: the garden's leaves
  repairLeft: boolean; // the weekly "one missed day" is still unused
  pausedToday: boolean;
  litToday: boolean;
}

/**
 * Walk from the first day to today. A missed day is forgiven if no other miss was forgiven
 * in the 7 days before it; a second miss within that week ends the streak. Today never breaks it.
 */
export function journey(s: AppState, today: string): Journey {
  const start = firstDay(s);
  const out: Journey = { streak: 0, best: 0, lit: 0, repairLeft: true, pausedToday: pausedDay(s, today), litToday: false };
  if (!start) return out;
  let d = daysBetween(start, today) > 1500 ? addDays(today, -1500) : start;
  let cur = 0;
  let repair: string | null = null;
  for (; d <= today; d = addDays(d, 1)) {
    const { lit } = dayLight(s, d);
    if (lit) {
      cur++;
      out.lit++;
      if (d === today) out.litToday = true;
    } else if (d === today || pausedDay(s, d)) {
      /* today is still open; paused days neither count nor break */
    } else if (!repair || daysBetween(repair, d) >= 7) {
      repair = d;
    } else {
      cur = 0;
      repair = null;
    }
    out.best = Math.max(out.best, cur);
  }
  out.streak = cur;
  out.repairLeft = !repair || daysBetween(repair, today) >= 7;
  return out;
}

export const garden = (lit: number) => ({ leaves: lit, branches: Math.floor(lit / 7), fruits: Math.floor(lit / 40), toFruit: 40 - (lit % 40) });

/** Longest run of days with all five prayers on time. */
function bestOnTime(s: AppState) {
  const days = Object.keys(s.prayers).sort();
  let best = 0, cur = 0, prev = '';
  for (const d of days) {
    const full = ANCHORS.every((a) => s.prayers[d]?.[a] === 'ontime');
    cur = full ? (prev && daysBetween(prev, d) === 1 && cur > 0 ? cur + 1 : 1) : 0;
    prev = d;
    best = Math.max(best, cur);
  }
  return best;
}

function fullRamadan(s: AppState) {
  const byYear: Record<number, number> = {};
  for (const d of Object.keys(s.ramadan?.fasts ?? {})) {
    const h = hOf(d);
    if (h?.month === 9) byYear[h.year] = (byYear[h.year] ?? 0) + 1;
  }
  return Math.max(0, ...Object.values(byYear));
}

export interface Milestone { id: string; title: string; quote: string; src: string; got: boolean; now: number; of: number }

export function milestones(s: AppState, j: Journey): Milestone[] {
  const ot = bestOnTime(s);
  const khatm = s.ramadan?.khatm?.rounds ?? 0;
  const ram = fullRamadan(s);
  return [
    { id: 'w7', title: _t("7 дней подряд"), quote: _t("Аллах не возлагает на душу больше, чем она может вместить"), src: _t("Коран 2:286"), now: j.best, of: 7 },
    { id: 'l40', title: _t("40 дней: первый плод"), quote: _t("Самые любимые дела у Аллаха — самые постоянные, даже если их мало"), src: _t("Бухари, Муслим"), now: j.lit, of: 40 },
    { id: 'p7', title: _t("Неделя намазов вовремя"), quote: _t("Намаз предписан верующим в определённое время"), src: _t("Коран 4:103"), now: ot, of: 7 },
    { id: 'l100', title: _t("100 дней света"), quote: _t("Поистине, за тягостью — облегчение"), src: _t("Коран 94:6"), now: j.lit, of: 100 },
    { id: 'khatm', title: _t("Первый хатм"), quote: _t("Читайте Коран: в Судный день он придёт заступником за своих читателей"), src: _t("Муслим"), now: khatm, of: 1 },
    { id: 'ram', title: _t("Весь Рамадан"), quote: _t("Кто постился в Рамадан с верой и надеждой на награду, тому простятся прежние грехи"), src: _t("Бухари, Муслим"), now: ram, of: 29 },
  ].map((m) => ({ ...m, now: Math.min(m.now, m.of), got: m.now >= m.of }));
}

/** Totals of the last 7 days, shared with the circle for the common counter. */
export function weekTotals(s: AppState, today: string) {
  let p = 0, h = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    p += Object.keys(prayersSeen(s, d)).length;
    h += Object.values(s.log[d] ?? {}).filter((m) => isCounted(m)).length;
  }
  return { p, h };
}
