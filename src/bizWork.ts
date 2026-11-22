// The business circle as a workspace: shared tasks («Дела»), meetings and deadlines («Календарь»),
// the plan (niyyah, goal of the year, goals of the quarter) and the journal of shura decisions.
// Server: supabase/biz-work.sql. Until it is run, bizWorkReady() is false and the tabs are not shown.
import { useCallback, useEffect, useState } from 'react';
import type { Anchor, AppState, Settings } from './types';
import { isCloud, meRpc, serverHas } from './cloud';
import { prayerTimes } from './prayer';
import { setPlans, type Plan } from './plans';
import { _t } from './i18n';

export type TaskStatus = 'todo' | 'doing' | 'done';
export interface BizTask { id: number; title: string; owner: string | null; due: string | null; due_p: Anchor | null; status: TaskStatus; msg: number | null; by: string | null; created: string; done_at: string | null }
export interface BizEvent { id: number; title: string; day: string; at: string | null; after_p: Anchor | null; kind: 'meet' | 'due'; msg: number | null; by: string | null }
export interface BizGoal { t: string; o?: string; p: number }
export interface BizPlan { niyya: string; goal: string; goals: BizGoal[]; upd?: string; by?: string | null }
export interface BizDecision { id: number; body: string; day: string; msg: number | null; by: string | null }
export interface BizData { tasks: BizTask[]; events: BizEvent[]; plan: BizPlan | null; decisions: BizDecision[] }

let readyP: Promise<boolean> | null = null;
export function bizWorkReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.bizwork') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_biz_get', { p_uid: null, p_token: null, p_code: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.bizwork', '1'); } catch { /* */ }
    return ok;
  });
  return readyP;
}
export function useBizWorkReady(on: boolean) {
  const [ok, setOk] = useState(false);
  useEffect(() => { if (on) bizWorkReady().then(setOk); }, [on]);
  return ok && on;
}

/** One circle's workspace, refreshed every 20 s while the page is visible and right after each change. */
export function useBiz(code: string | undefined, on: boolean) {
  const [data, setData] = useState<BizData | null>(null);
  const load = useCallback(async () => {
    if (!code) return;
    const r = await meRpc<BizData | null>('lm_biz_get', { p_code: code }).catch(() => null);
    if (r) setData({ ...r, plan: r.plan ? { ...r.plan, goals: Array.isArray(r.plan.goals) ? r.plan.goals : [] } : null });
  }, [code]);
  useEffect(() => {
    setData(null);
    if (!on || !code) return;
    let alive = true, t: number | undefined;
    const tick = async () => { if (!alive) return; if (document.visibilityState === 'visible') await load(); t = window.setTimeout(tick, 20000); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [code, on, load]);

  const call = async (fn: string, args: Record<string, unknown>) => { const r = await meRpc<number | boolean>(fn, { p_code: code, ...args }).catch(() => 0); await load(); return r; };
  return {
    data, reload: load,
    setTask: (id: number, p: Partial<BizTask> | null) => call('lm_biz_task_set', { p_id: id, p }) as Promise<number>,
    setEvent: (id: number, p: Partial<BizEvent> | null) => call('lm_biz_event_set', { p_id: id, p }) as Promise<number>,
    setPlan: (p: BizPlan) => call('lm_biz_plan_set', { p }) as Promise<boolean>,
    setDecision: (id: number, p: Partial<BizDecision> | null) => call('lm_biz_decision_set', { p_id: id, p }) as Promise<number>,
  };
}
export type BizApi = ReturnType<typeof useBiz>;

const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
/** When a meeting starts (ms), or null without a time. «После Зухра» = 20 minutes after the adhan. */
export function eventAt(st: Settings, e: { day: string; at: string | null; after_p: Anchor | null }): number | null {
  const [y, m, d] = e.day.split('-').map(Number);
  if (e.after_p) return prayerTimes(st, D(e.day))[e.after_p].getTime() + 20 * 60000;
  if (e.at) { const [hh, mm] = e.at.split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); }
  return null;
}
/** A meeting on Friday from 15 minutes before Zuhr to 75 after clashes with Jumu'ah: returns a better time (HH:MM), else null. */
export function jumuahClash(st: Settings, day: string, at: string | null, after?: Anchor | null): string | null {
  if (D(day).getDay() !== 5) return null;
  const z = prayerTimes(st, D(day)).dhuhr.getTime();
  const t = after === 'dhuhr' ? z + 20 * 60000 : at ? eventAt(st, { day, at, after_p: null }) : null;
  if (t == null || t < z - 15 * 60000 || t > z + 75 * 60000) return null;
  const s = new Date(z + 90 * 60000);
  const mm = Math.ceil(s.getMinutes() / 15) * 15;
  s.setMinutes(mm, 0, 0);
  return `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
}

/** «после Зухра», «до пятницы», «сб» … for a due date. */
const AFTER: Record<Anchor, () => string> = { fajr: () => _t("после Фаджра"), dhuhr: () => _t("после Зухра"), asr: () => _t("до Асра"), maghrib: () => _t("до Магриба"), isha: () => _t("до Иши") };
export const anchorLabel = (a: Anchor) => AFTER[a]();
export function dueLabel(t: { due: string | null; due_p: Anchor | null }, today: string): string {
  if (!t.due) return t.due_p ? anchorLabel(t.due_p) : '';
  const diff = Math.round((D(t.due).getTime() - D(today).getTime()) / 86400000);
  const day = diff === 0 ? _t("сегодня") : diff === 1 ? _t("завтра") : diff === -1 ? _t("вчера") : D(t.due).toLocaleDateString(undefined, diff > 0 && diff < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
  return t.due_p ? `${day}, ${anchorLabel(t.due_p)}` : day;
}
export const isLate = (t: BizTask, today: string) => t.status !== 'done' && Boolean(t.due && t.due < today);

/** Meetings of my business circles go into my own «Планы» with a reminder; changes and deletions follow. */
export function syncPlans(s: AppState, code: string, title: string, events: BizEvent[], today: string): AppState | null {
  const pre = `bz-${code}-`;
  const want = new Map(events.filter((e) => e.day >= today).map((e) => [pre + e.id, e]));
  const have = (s.plans ?? []).filter((p) => p.id.startsWith(pre));
  let changed = false;
  const next: Plan[] = [];
  for (const p of have) {
    const e = want.get(p.id);
    if (!e) { if (!p.del && p.date >= today) { next.push({ ...p, del: true, upd: Date.now() }); changed = true; } else next.push(p); continue; }
    const text = `${e.kind === 'due' ? '📄' : '🤝'} ${e.title} · ${title}`;
    const time = e.after_p ? undefined : e.at ?? undefined;
    const after = e.after_p ?? undefined;
    if (p.text !== text || p.date !== e.day || p.time !== time || p.after !== after || p.del) { next.push({ ...p, text, date: e.day, time, after, del: false, upd: Date.now() }); changed = true; } else next.push(p);
    want.delete(p.id);
  }
  for (const [id, e] of want) {
    next.push({ id, text: `${e.kind === 'due' ? '📄' : '🤝'} ${e.title} · ${title}`, date: e.day, time: e.after_p ? undefined : e.at ?? undefined, after: e.after_p ?? undefined, remind: e.at || e.after_p ? 'h1' : undefined, list: _t("Работа"), made: Date.now(), upd: Date.now() });
    changed = true;
  }
  if (!changed) return null;
  return setPlans(s, (l) => [...l.filter((p) => !p.id.startsWith(pre)), ...next]);
}
