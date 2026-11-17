import { useState } from 'react';
import { addDays } from './dates';
import { isCounted, uid } from './store';
import { isCloud, currentCircle } from './cloud';
import type { AppState, Habit } from './types';
import type { Member, Reacts } from './circle';

// «Круг бизнес»: business habits next to the prayers, a weekly shura (three lines each),
// a business goal for the week and dua for a deal. Everything travels inside each member's own
// circle doc, so no new server table is needed. Money amounts are never asked for or shown.

export const BIZ_HABITS: Pick<Habit, 'action' | 'min' | 'anchor'>[] = [
  { action: 'План дня из 3 дел', min: 'одно главное дело', anchor: 'fajr' },
  { action: 'Один звонок клиенту', min: 'одно сообщение', anchor: 'dhuhr' },
  { action: 'Час глубокой работы', min: '15 минут, телефон в сторону', anchor: 'asr' },
  { action: 'Учёт дня, 5 минут', min: 'записать одно число для себя', anchor: 'isha' },
];
export const BIZ_DEFAULT = [0, 1, 2];

export const isBizCircle = () => isCloud && currentCircle()?.kind === 'biz';

const PICK = 'lm.bizpick';
/** The habits chosen while creating or joining a business circle wait here until the app reloads. */
export function rememberBizPick(idx: number[]) { try { localStorage.setItem(PICK, JSON.stringify(idx)); } catch { /* */ } }
export function takeBizPick(): number[] | null {
  try { const v = JSON.parse(localStorage.getItem(PICK) || 'null'); localStorage.removeItem(PICK); return Array.isArray(v) ? v : null; } catch { return null; }
}

/** Adds the chosen business habits (skips ones already there). Over the limit of 5 they wait in the queue. */
export function addBizHabits(s: AppState, idx: number[], today: string, limit: number, used: number): AppState {
  const have = new Set(s.habits.filter((h) => h.status !== 'archived').map((h) => h.action));
  let n = used;
  const add: Habit[] = [];
  for (const i of idx) {
    const b = BIZ_HABITS[i];
    if (!b || have.has(b.action)) continue;
    add.push({ id: uid(), ...b, sphere: 'biz', status: n < limit ? 'active' : 'queued', createdAt: today });
    n++;
  }
  return add.length ? { ...s, habits: [...s.habits, ...add] } : s;
}

/** Business habits marked today, out of my active business habits. Only counts, no names. */
export function bizToday(s: AppState, today: string, active: Habit[]): { d: number; t: number } {
  const biz = active.filter((h) => h.sphere === 'biz');
  return { d: biz.filter((h) => isCounted(s.log[today]?.[h.id])).length, t: biz.length };
}

/** Business habit marks over the days [from, today]. */
export function bizMarks(s: AppState, from: string, today: string): number {
  const ids = new Set(s.habits.filter((h) => h.sphere === 'biz').map((h) => h.id));
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (d > today) break;
    for (const [id, m] of Object.entries(s.log[d] ?? {})) if (ids.has(id) && isCounted(m)) n++;
  }
  return n;
}

// ── Shura of the week ──
/** My three lines for the week w: what went well, where I am stuck, what I need advice on. */
export interface Shura { w: string; ok: string; stuck: string; ask: string; at: string }
/** Advice I gave: to a person's shura (k 's', w = week) or to a dua request for a deal (k 'a', w = day it was asked). */
export interface Advice { to: string; k: 's' | 'a'; w: string; t: string; at: string }

const key = (n: string) => `${n}.${(isCloud && currentCircle()?.code) || 'local'}`;
function useLs<T>(name: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const x = localStorage.getItem(key(name)); return x ? JSON.parse(x) : init; } catch { return init; } });
  return [v, (x: T) => { try { if (x === null) localStorage.removeItem(key(name)); else localStorage.setItem(key(name), JSON.stringify(x)); } catch { /* */ } setV(x); }];
}
export const useMyShura = () => useLs<Shura | null>('lm.shura', null);
export function useMyAdvice(today: string): [Advice[], (a: Advice) => void] {
  const [list, setList] = useLs<Advice[]>('lm.adv', []);
  const fresh = list.filter((a) => a.w >= addDays(today, -13));
  return [fresh, (a) => setList([a, ...fresh.filter((x) => !(x.to === a.to && x.k === a.k && x.w === a.w))].slice(0, 30))];
}

/** Advice the circle gave to one person's shura or dua request. */
export function adviceFor(members: Member[], to: string, k: 's' | 'a', w: string): { from: string; t: string; at: string }[] {
  const out: { from: string; t: string; at: string }[] = [];
  for (const m of members) for (const a of m.adv ?? []) if (a.to === to && a.k === k && a.w === w && m.id !== to) out.push({ from: m.id, t: a.t, at: a.at });
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** Shura numbers for the week: who shared, how much advice and how many duas and «МашаАллах» followed. */
export function shuraTotals(members: Member[], reacts: Reacts, w: string) {
  const shared = members.filter((m) => m.shura?.w === w && (m.shura.ok || m.shura.stuck || m.shura.ask));
  let advice = 0, duas = 0, mash = 0;
  for (const m of shared) {
    advice += adviceFor(members, m.id, 's', w).length;
    for (const [from, map] of Object.entries(reacts)) {
      if (from === m.id) continue;
      const r = map?.[`s:${m.id}`];
      if (!r || r.day < w) continue;
      if (r.e === '🤲') duas++; else if (r.e === '✨') mash++;
    }
  }
  return { shared: shared.length, advice, duas, mash };
}
