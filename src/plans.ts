// «Планы»: things to do on a day, placed between the prayers. A plan can ring (⏰) at a time or some minutes after
// a prayer; those rings go to the server with the other reminders and show in «Мои напоминания».
// Plans live in the app state (the phone). With «В облаке» they are also kept on the server (supabase/plans.sql),
// so they come back on another phone and feed the calendar subscription (api/plans-ics.js).
import type { Anchor, AppState, Settings } from './types';
import { ANCHORS } from './types';
import { prayerTimes } from './prayer';
import { _t, LANG } from './i18n';

export type PlanAfter = Anchor | 'jumuah';
export type PlanRepeat = 'day' | 'week' | 'month';
export interface Plan {
  id: string;
  text: string;
  /** First (or only) day, YYYY-MM-DD. For «на неделе» the last day of that week. */
  date: string;
  /** «На неделе»: no fixed day, shown on the week, due by `date`. */
  week?: boolean;
  /** Fixed time HH:MM, or after a prayer. Neither = no time. */
  time?: string;
  after?: PlanAfter;
  /** ⏰: 'at' = at the time / 30 min after the prayer (60 after Jumu'ah); 'h1' = an hour earlier. Missing = no ring. */
  remind?: 'at' | 'h1';
  list?: string;
  repeat?: PlanRepeat;
  /** Days of this plan that are done (one-time plans: at most one). */
  done?: string[];
  /** Moved rings for a day: «Через час». */
  snooze?: Record<string, number>;
  note?: string;
  made: number;
  /** Last change, ms: the newer copy wins when phone and cloud meet. */
  upd: number;
  /** Deleted (kept a while so the cloud learns about it). */
  del?: boolean;
}
export interface PlansSettings {
  store?: 'phone' | 'cloud';
  prayers?: boolean; // show prayers in the day view; default on
  lists?: string[];
  /** Secret for the calendar subscription link (cloud only). */
  ics?: string;
}

export const DEFAULT_LISTS = () => [_t("Работа"), _t("Семья"), _t("Дин"), _t("Умра")];
export const listsOf = (s: AppState) => s.plansSet?.lists?.length ? s.plansSet.lists : DEFAULT_LISTS();
const LIST_TONE = ['t-w', 't-f', 't-d', 't-u', 't-o'];
export const listTone = (s: AppState, l?: string) => (l ? LIST_TONE[Math.max(0, listsOf(s).indexOf(l)) % LIST_TONE.length] : '');

export const pid = () => Math.random().toString(36).slice(2, 10);
export const live = (s: AppState) => (s.plans ?? []).filter((p) => !p.del);

const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (k: string, n: number) => { const d = D(k); d.setDate(d.getDate() + n); return keyOf(d); };
/** Monday of the week of `k`. */
export const weekStart = (k: string) => { const d = D(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d); };

/** Does the plan fall on day `k`? Weekly «на неделе» plans fall on their last day only for the day view. */
export function on(p: Plan, k: string): boolean {
  if (p.del || k < p.date) return false;
  if (k === p.date) return true;
  if (!p.repeat) return false;
  const a = D(p.date), b = D(k);
  if (p.repeat === 'day') return true;
  if (p.repeat === 'week') return a.getDay() === b.getDay();
  return a.getDate() === b.getDate();
}
export const isDone = (p: Plan, k: string) => Boolean(p.done?.includes(k));

/** Plans of one day, in the order of the day: Fajr..Isha, fixed times by the clock, no time last within its block. */
export function dayPlans(s: AppState, k: string): Plan[] {
  return live(s).filter((p) => !p.week && on(p, k)).sort((a, b) => sortKey(s.settings, a, k) - sortKey(s.settings, b, k) || a.made - b.made);
}
/** «На неделе» plans of the week that starts on `mon`. */
export function weekPlans(s: AppState, mon: string): Plan[] {
  const sun = addDays(mon, 6);
  return live(s).filter((p) => p.week && p.date >= mon && p.date <= sun);
}
/** Undone one-time plans from before `today` (not older than 14 days), offered for moving. */
export function overdue(s: AppState, today: string): Plan[] {
  const from = addDays(today, -14);
  return live(s).filter((p) => !p.repeat && p.date < today && p.date >= from && !isDone(p, p.date));
}

const PR_ORDER: Record<string, number> = { fajr: 1, dhuhr: 2, jumuah: 2.5, asr: 3, maghrib: 4, isha: 5 };
function sortKey(st: Settings, p: Plan, k: string) {
  const t = startAt(st, p, k);
  return t ?? D(k).getTime() + 13 * 3600e3; // no time: middle of the list
}

/** When the plan starts on day k (ms), or null without a time. */
export function startAt(st: Settings, p: Plan, k: string): number | null {
  const [y, m, d] = k.split('-').map(Number);
  if (p.after) {
    const t = prayerTimes(st, new Date(y, m - 1, d, 12));
    return t[p.after === 'jumuah' ? 'dhuhr' : p.after].getTime();
  }
  if (p.time && /^\d{1,2}:\d{2}$/.test(p.time)) { const [hh, mm] = p.time.split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); }
  return null;
}
/** When it rings on day k (ms), or null. */
export function ringAt(st: Settings, p: Plan, k: string): number | null {
  if (!p.remind) return null;
  if (p.snooze?.[k]) return p.snooze[k];
  const t = startAt(st, p, k);
  if (t == null) return null;
  const after = p.after ? (p.after === 'jumuah' ? 60 : 30) * 60000 : 0;
  return t + after - (p.remind === 'h1' ? 3600e3 : 0);
}

/** Which prayer block a plan on day k belongs to (the last prayer before it starts). Plans without time go to `null`. */
export function blockOf(st: Settings, p: Plan, k: string): Anchor | null {
  if (p.after) return p.after === 'jumuah' ? 'dhuhr' : p.after;
  const t = startAt(st, p, k); if (t == null) return null;
  const [y, m, d] = k.split('-').map(Number);
  const pt = prayerTimes(st, new Date(y, m - 1, d, 12));
  let b: Anchor = 'fajr';
  for (const a of ANCHORS) if (pt[a].getTime() <= t) b = a;
  return b;
}

const AFTER_RU: Record<PlanAfter, () => string> = {
  fajr: () => _t("после Фаджра"), dhuhr: () => _t("после Зухра"), asr: () => _t("после Асра"), maghrib: () => _t("после Магриба"), isha: () => _t("после Иши"), jumuah: () => _t("после Джумы"),
};
export const afterLabel = (a: PlanAfter) => AFTER_RU[a]();
const loc = () => (LANG === 'en' ? 'en-GB' : 'ru-RU');
export const hm = (ms: number) => new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
export const dayLabel = (k: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'long' }) => D(k).toLocaleDateString(loc(), o);

/** «⏰ через 30 мин после Зухра», «18:30», «после Асра». */
export function whenLabel(st: Settings, p: Plan, k: string): string {
  const bits: string[] = [];
  if (p.week) bits.push(_t("на неделе"));
  if (p.after) bits.push(afterLabel(p.after));
  else if (p.time) bits.push(p.time);
  const r = ringAt(st, p, k);
  if (r != null) bits.push(`⏰ ${hm(r)}`);
  if (p.repeat) bits.push(p.repeat === 'day' ? _t("каждый день") : p.repeat === 'week' ? _t("каждую неделю") : _t("каждый месяц"));
  return bits.join(' · ');
}

/** Rings of plans in the next 14 days, in the shape of reminders («Мои напоминания» and the server). */
export interface PlanRing { id: string; plan: string; day: string; text: string; at: number; prayer?: PlanAfter }
export function planRings(s: AppState, now = Date.now()): PlanRing[] {
  const out: PlanRing[] = [];
  const today = keyOf(new Date(now));
  for (const p of live(s)) {
    if (!p.remind) continue;
    for (let i = -1; i < 14; i++) {
      const k = addDays(today, i);
      if (!on(p, k) || isDone(p, k)) continue;
      const at = ringAt(s.settings, p, k);
      if (at == null || at < now - 15 * 60000 || at > now + 14 * 864e5) continue;
      out.push({ id: `pl${p.id}${k.replace(/-/g, '').slice(2)}`, plan: p.id, day: k, text: p.text, at, ...(p.after ? { prayer: p.after } : {}) });
      if (!p.repeat) break;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export const touch = (p: Plan, patch: Partial<Plan>): Plan => ({ ...p, ...patch, upd: Date.now() });
export function setPlans(s: AppState, f: (list: Plan[]) => Plan[]): AppState { return { ...s, plans: f(s.plans ?? []) }; }
export const editPlan = (s: AppState, id: string, patch: Partial<Plan>) => setPlans(s, (l) => l.map((p) => (p.id === id ? touch(p, patch) : p)));
export function toggleDone(s: AppState, id: string, k: string, val?: boolean): AppState {
  return setPlans(s, (l) => l.map((p) => {
    if (p.id !== id) return p;
    const has = isDone(p, k); const want = val ?? !has;
    if (want === has) return p;
    return touch(p, { done: want ? [...(p.done ?? []), k].slice(-400) : (p.done ?? []).filter((x) => x !== k) });
  }));
}
export const dropPlan = (s: AppState, id: string) => setPlans(s, (l) => l.map((p) => (p.id === id ? touch(p, { del: true }) : p)));
/** Move a one-time plan to another day (keeps time and ring). */
export const movePlan = (s: AppState, id: string, k: string) => editPlan(s, id, { date: k, week: false, snooze: undefined });

/** Merge two copies (phone and cloud): per plan the newer `upd` wins; deleted ones older than 30 days are dropped. */
export function mergePlans(a: Plan[], b: Plan[]): Plan[] {
  const m = new Map<string, Plan>();
  for (const p of [...a, ...b]) { const o = m.get(p.id); if (!o || p.upd > o.upd) m.set(p.id, p); }
  const old = Date.now() - 30 * 864e5;
  return [...m.values()].filter((p) => !(p.del && p.upd < old));
}

// ---- add to a calendar ----
const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (t: string) => t.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
/** One plan as an .ics file (opens in the phone's calendar). */
export function planIcs(st: Settings, p: Plan, k: string): string {
  const t = startAt(st, p, k);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Living Muslim//Plans//RU', 'BEGIN:VEVENT', `UID:${p.id}@living-muslim`, `DTSTAMP:${icsDate(Date.now())}`];
  if (t != null) { const s0 = t + (p.after ? 30 * 60000 : 0); lines.push(`DTSTART:${icsDate(s0)}`, `DTEND:${icsDate(s0 + 30 * 60000)}`); }
  else lines.push(`DTSTART;VALUE=DATE:${k.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(k, 1).replace(/-/g, '')}`);
  if (p.repeat) lines.push(`RRULE:FREQ=${p.repeat === 'day' ? 'DAILY' : p.repeat === 'week' ? 'WEEKLY' : 'MONTHLY'}`);
  lines.push(`SUMMARY:${esc(p.text)}`);
  if (p.note || p.after) lines.push(`DESCRIPTION:${esc([p.after ? afterLabel(p.after) : '', p.note ?? ''].filter(Boolean).join('\n'))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
/** Google Calendar «add event» link for one plan. */
export function planGoogle(st: Settings, p: Plan, k: string): string {
  const t = startAt(st, p, k);
  const dates = t != null ? `${icsDate(t + (p.after ? 30 * 60000 : 0))}/${icsDate(t + (p.after ? 60 : 30) * 60000)}` : `${k.replace(/-/g, '')}/${addDays(k, 1).replace(/-/g, '')}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: p.text, dates, details: [p.after ? afterLabel(p.after) : '', p.note ?? ''].filter(Boolean).join('\n') });
  if (p.repeat) q.set('recur', `RRULE:FREQ=${p.repeat === 'day' ? 'DAILY' : p.repeat === 'week' ? 'WEEKLY' : 'MONTHLY'}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}
export const AFTERS: PlanAfter[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const prOrder = PR_ORDER;
