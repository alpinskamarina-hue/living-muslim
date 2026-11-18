import { useState } from 'react';
import { addDays, fromKey } from './dates';
import { isCounted } from './store';
import type { AppState } from './types';
import type { Member, Reacts } from './circle';
import { isCloud, currentCircle } from './cloud';
import { bizMarks } from './biz';
import { _t } from './i18n';

// The circle's week runs Saturday to Friday, so it closes on Jumu'ah.
// Each member shares only weekly totals; the goal lives in the member docs of whoever set it (latest wins),
// so no new server table is needed.

export type GoalKind = 'prayers' | 'ontime' | 'fajr' | 'habits' | 'biz';
export interface WeekTotals { w: string; p: number; o: number; f: number; h: number; b?: number } // b: business habit marks
export interface CGoal { w: string; k: GoalKind | 'none'; n: number; at: string }

export const GOAL_KINDS: Record<GoalKind, { ic: string; label: string; unit: [string, string, string]; per: number; step: number }> = {
  prayers: { ic: '🕌', label: _t("Все намазы"), unit: [_t("намаз вместе"), _t("намаза вместе"), _t("намазов вместе")], per: 30, step: 10 },
  ontime: { ic: '⏰', label: _t("Намаз вовремя"), unit: [_t("намаз вовремя"), _t("намаза вовремя"), _t("намазов вовремя")], per: 21, step: 5 },
  fajr: { ic: '🌅', label: _t("Фаджр вовремя"), unit: [_t("Фаджр вовремя"), _t("Фаджра вовремя"), _t("Фаджров вовремя")], per: 5, step: 1 },
  habits: { ic: '🌱', label: _t("Привычки"), unit: [_t("отметка привычек"), _t("отметки привычек"), _t("отметок привычек")], per: 10, step: 5 },
  biz: { ic: '💼', label: _t("Дела у намазов"), unit: [_t("деловая отметка"), _t("деловые отметки"), _t("деловых отметок")], per: 12, step: 5 },
};
/** Goal kinds offered in a circle: business circles start with the business goal. */
export const goalKindsFor = (biz: boolean): GoalKind[] => (biz ? ['biz', 'prayers', 'ontime', 'fajr'] : ['prayers', 'ontime', 'fajr', 'habits']);
const KEY: Record<GoalKind, 'p' | 'o' | 'f' | 'h' | 'b'> = { prayers: 'p', ontime: 'o', fajr: 'f', habits: 'h', biz: 'b' };
export const valOf = (t: WeekTotals, k: GoalKind) => t[KEY[k]] ?? 0;

/** Saturday that opens the week containing day. */
export function weekStart(day: string): string {
  const dow = fromKey(day).getDay(); // 0 Sun … 6 Sat
  return addDays(day, -((dow + 1) % 7));
}
export const weekEnd = (w: string) => addDays(w, 6);
export const isFriday = (day: string) => fromKey(day).getDay() === 5;

export function totals(s: AppState, w: string, today: string): WeekTotals {
  const t: WeekTotals = { w, p: 0, o: 0, f: 0, h: 0, b: bizMarks(s, w, today) };
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
  const t = { w, p: 0, o: 0, f: 0, h: 0, b: 0, people: 0 };
  for (const m of members) {
    const x = m.wk?.w === w ? m.wk : m.pw?.w === w ? m.pw : null;
    if (!x) continue;
    t.p += x.p; t.o += x.o; t.f += x.f; t.h += x.h; t.b += x.b ?? 0;
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

const MONTHS = [_t("января"), _t("февраля"), _t("марта"), _t("апреля"), _t("мая"), _t("июня"), _t("июля"), _t("августа"), _t("сентября"), _t("октября"), _t("ноября"), _t("декабря")];
export function rangeLabel(w: string) {
  const a = fromKey(w), b = fromKey(weekEnd(w));
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}` : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}
export const addWeeks = (w: string, n: number) => addDays(w, n * 7);

// ── Dua requests and the circle streak ──
export interface DuaAsk { t: string; d: string } // text, day asked; shown for 3 days
export const ASK_DAYS = 3;
export const askLive = (a: DuaAsk | null | undefined, today: string): a is DuaAsk => Boolean(a && a.t && a.d <= today && a.d > addDays(today, -ASK_DAYS));

const askKey = () => `lm.ask.${(isCloud && currentCircle()?.code) || 'local'}`;
export function useMyAsk(): [DuaAsk | null, (a: DuaAsk | null) => void] {
  const [a, setA] = useState<DuaAsk | null>(() => { try { return JSON.parse(localStorage.getItem(askKey()) || 'null'); } catch { return null; } });
  const set = (x: DuaAsk | null) => { try { if (x) localStorage.setItem(askKey(), JSON.stringify(x)); else localStorage.removeItem(askKey()); } catch { /* */ } setA(x); };
  return [a, set];
}
/** Who answered a dua request with «сделал дуа» (reaction key a:<asker>, on or after the day it was asked). */
export function askAnswers(reacts: Reacts, asker: string, a: DuaAsk): string[] {
  return Object.entries(reacts).filter(([from, map]) => from !== asker && (map?.[`a:${asker}`]?.day ?? '') >= a.d).map(([from]) => from);
}

/** My active days over the last n days: any prayer or counted habit marked. Shared for the circle streak. */
export function activeDays(s: AppState, today: string, n = 30): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(today, -i);
    if (Object.keys(s.prayers[d] ?? {}).length || Object.values(s.log[d] ?? {}).some((m) => isCounted(m))) out.push(d);
  }
  return out;
}
/** Days in a row when at least half the circle (and at least 2 people) marked something. Today counts once reached; until then the streak stands on yesterday. */
export function circleStreak(members: Member[], today: string): { n: number; todayOk: boolean; need: number; got: number } {
  const need = Math.max(2, Math.ceil(members.length / 2));
  const on = (d: string) => members.filter((m) => (m.act ?? []).includes(d) || (d === today && m.day === today && (m.done > 0 || m.prayers > 0))).length;
  const got = on(today);
  const todayOk = got >= need;
  let n = todayOk ? 1 : 0;
  for (let i = 1; i < 30; i++) { if (on(addDays(today, -i)) >= need) n++; else break; }
  return { n, todayOk, need, got };
}

// ── Challenges between two people and the weekly amir ──
export type ChKind = 'fajr' | 'five' | 'active';
export interface Challenge { id: string; to: string; k: ChKind; start: string; at: string }
export interface Amir { w: string; at: string; note: string }
export const CH_DAYS = 7;
export const CH_KINDS: Record<ChKind, { ic: string; label: string; short: string }> = {
  fajr: { ic: '🌅', label: _t("7 дней Фаджр вовремя"), short: _t("Фаджр вовремя") },
  five: { ic: '🕌', label: _t("7 дней все 5 намазов"), short: _t("все 5 намазов") },
  active: { ic: '🌱', label: _t("7 дней без пропуска привычек"), short: _t("хотя бы одна привычка") },
};
/** Days (last 14) that count for each kind of challenge, shared in my member doc. */
export function chDays(s: AppState, today: string): { fj: string[]; p5: string[] } {
  const fj: string[] = [], p5: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const pr = s.prayers[d] ?? {};
    if (pr.fajr === 'ontime') fj.push(d);
    if (Object.keys(pr).length >= 5) p5.push(d);
  }
  return { fj, p5 };
}
export const chHit = (m: Member | undefined, k: ChKind, d: string) => Boolean(m && (k === 'fajr' ? m.fj : k === 'five' ? m.p5 : m.act)?.includes(d));

function lsList<T>(name: string): [T[], (v: T[]) => void] {
  const key = `${name}.${(isCloud && currentCircle()?.code) || 'local'}`;
  const read = (): T[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const write = (v: T[]) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } };
  return [read(), write];
}
export function useMyChallenges(today: string): { chs: Challenge[]; acc: string[]; add: (c: Challenge) => void; remove: (id: string) => void; accept: (id: string) => void } {
  const [c0, wc] = lsList<Challenge>('lm.ch');
  const [a0, wa] = lsList<string>('lm.acc');
  const [chs, setChs] = useState(c0);
  const [acc, setAcc] = useState(a0);
  const fresh = (c: Challenge) => addDays(c.start, CH_DAYS + 2) >= today;
  return {
    chs: chs.filter(fresh), acc,
    add: (c) => { const v = [c, ...chs.filter(fresh)].slice(0, 6); wc(v); setChs(v); },
    remove: (id) => { const v = chs.filter((x) => x.id !== id); wc(v); setChs(v); },
    accept: (id) => { const v = [id, ...acc.filter((x) => x !== id)].slice(0, 12); wa(v); setAcc(v); },
  };
}
export function useMyAmir(): [Amir | null, (a: Amir | null) => void] {
  const key = `lm.amir.${(isCloud && currentCircle()?.code) || 'local'}`;
  const [a, setA] = useState<Amir | null>(() => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } });
  return [a, (x) => { try { if (x) localStorage.setItem(key, JSON.stringify(x)); else localStorage.removeItem(key); } catch { /* */ } setA(x); }];
}
/** The amir of week w: whoever volunteered first. */
export function amirOf(members: Member[], w: string): { id: string; a: Amir } | null {
  let best: { id: string; a: Amir } | null = null;
  for (const m of members) if (m.amir?.w === w && (!best || m.amir.at < best.a.at)) best = { id: m.id, a: m.amir };
  return best;
}
