import { useState } from 'react';
import { addDays, fromKey } from './dates';
import { isCounted } from './store';
import type { AppState } from './types';
import type { Member, Reacts } from './circle';
import { isCloud, currentCircle } from './cloud';

// The circle's week runs Saturday to Friday, so it closes on Jumu'ah.
// Each member shares only weekly totals; the goal lives in the member docs of whoever set it (latest wins),
// so no new server table is needed.

export type GoalKind = 'prayers' | 'ontime' | 'fajr' | 'habits';
export interface WeekTotals { w: string; p: number; o: number; f: number; h: number }
export interface CGoal { w: string; k: GoalKind | 'none'; n: number; at: string }

export const GOAL_KINDS: Record<GoalKind, { ic: string; label: string; unit: [string, string, string]; per: number; step: number }> = {
  prayers: { ic: '🕌', label: 'Все намазы', unit: ['намаз вместе', 'намаза вместе', 'намазов вместе'], per: 30, step: 10 },
  ontime: { ic: '⏰', label: 'Намаз вовремя', unit: ['намаз вовремя', 'намаза вовремя', 'намазов вовремя'], per: 21, step: 5 },
  fajr: { ic: '🌅', label: 'Фаджр вовремя', unit: ['Фаджр вовремя', 'Фаджра вовремя', 'Фаджров вовремя'], per: 5, step: 1 },
  habits: { ic: '🌱', label: 'Привычки', unit: ['отметка привычек', 'отметки привычек', 'отметок привычек'], per: 10, step: 5 },
};
const KEY = (n: number): 'p' | 'o' | 'f' | 'h' => (['p', 'o', 'f', 'h'] as const)[n];
export const valOf = (t: WeekTotals, k: GoalKind) => t[KEY(['prayers', 'ontime', 'fajr', 'habits'].indexOf(k))];

/** Saturday that opens the week containing day. */
export function weekStart(day: string): string {
  const dow = fromKey(day).getDay(); // 0 Sun … 6 Sat
  return addDays(day, -((dow + 1) % 7));
}
export const weekEnd = (w: string) => addDays(w, 6);
export const isFriday = (day: string) => fromKey(day).getDay() === 5;

export function totals(s: AppState, w: string, today: string): WeekTotals {
  const t: WeekTotals = { w, p: 0, o: 0, f: 0, h: 0 };
  for (let i = 0; i < 7; i++) {
    const d = addDays(w, i);
    if (d > today) break;
    const pr = s.prayers[d] ?? {};
    t.p += Object.keys(pr).length;
    t.o += Object.values(pr).filter((m) => m === 'ontime').length;
    if (pr.fajr === 'ontime') t.f++;
    t.h += Object.values(s.log[d] ?? {}).filter((m) => isCounted(m)).length;
  }
  return t;
}

const lsKey = () => `lm.cg.${(isCloud && currentCircle()?.code) || 'local'}`;
function readMine(): CGoal[] { try { return JSON.parse(localStorage.getItem(lsKey()) || '[]'); } catch { return []; } }

/** Goals I set for this circle (this week and the last one), shared inside my member doc. */
export function useMyGoals(): [CGoal[], (g: CGoal) => void] {
  const [list, setList] = useState<CGoal[]>(readMine);
  const set = (g: CGoal) => {
    const next = [g, ...list.filter((x) => x.w !== g.w)].sort((a, b) => (a.w < b.w ? 1 : -1)).slice(0, 2);
    try { localStorage.setItem(lsKey(), JSON.stringify(next)); } catch { /* */ }
    setList(next);
  };
  return [list, set];
}

/** The goal for week w: the latest one anybody in the circle set. */
export function goalFor(members: Member[], w: string): (CGoal & { by: string }) | null {
  let best: (CGoal & { by: string }) | null = null;
  for (const m of members) for (const g of m.cgs ?? []) if (g.w === w && (!best || g.at > best.at)) best = { ...g, by: m.id };
  return best && best.k !== 'none' ? best : null;
}

/** Circle totals for week w from what each member shared. */
export function circleTotals(members: Member[], w: string): WeekTotals & { people: number } {
  const t = { w, p: 0, o: 0, f: 0, h: 0, people: 0 };
  for (const m of members) {
    const x = m.wk?.w === w ? m.wk : m.pw?.w === w ? m.pw : null;
    if (!x) continue;
    t.p += x.p; t.o += x.o; t.f += x.f; t.h += x.h;
    if (x.p + x.h > 0) t.people++;
  }
  return t;
}

/** Who supported others most this week: reactions, duas and nudges sent, counted by their latest day. */
export function supporters(reacts: Reacts, w: string): { id: string; n: number }[] {
  const end = weekEnd(w);
  return Object.entries(reacts)
    .map(([from, map]) => ({ id: from, n: Object.entries(map ?? {}).filter(([to, r]) => !to.startsWith('p:') && to !== from && r?.day >= w && r.day <= end).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function rangeLabel(w: string) {
  const a = fromKey(w), b = fromKey(weekEnd(w));
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}` : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}
export const addWeeks = (w: string, n: number) => addDays(w, n * 7);
