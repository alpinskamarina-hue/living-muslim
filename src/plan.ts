import { useEffect, useState } from 'react';
import { _t } from './i18n';

// Living Muslim plans: 7 days of Pro from the first day in the app, then Free with «по 3»:
// 3 habits, 3 circles, 3 goals, 3 books, 3 video courses. Everything about worship stays free for ever.
// No payments yet: «Оформить» puts the person on the list of first buyers and keeps Pro open until payment starts.

export const TRIAL_DAYS = 7;
/** Free limits switch on after the trial. Turn off to keep everything open (e.g. while payments are not ready). */
export const LIMITS_ON = true;
export const FREE = { habits: 3, circles: 3, goals: 3, books: 3, courses: 3, quits: 1 } as const;
export const PRO = { habits: 5, circles: 20, goals: 5, books: 100, courses: 100, quits: 3 } as const;
export type LimitKey = keyof typeof FREE;

export const PRICES = {
  year: { price: '€29.99', per: _t("в год"), month: '€2.50', note: _t("первый год со скидкой −37%: выходит €2.50 в месяц") },
  month: { price: '€3.99', per: _t("в месяц"), month: '€3.99', note: _t("можно отменить в любой момент") },
  family: { price: '€44.99', per: _t("в год"), month: '€0.75', note: _t("до 5 человек в одной семье, €0.75 в месяц на каждого") },
} as const;
export type PlanId = keyof typeof PRICES;

interface PlanStore { trial: number; early?: { plan: PlanId; at: number }; seen?: number[] }
const LS = 'lm.plan';
const DAY = 86400000;

function read(): PlanStore {
  try {
    const x = JSON.parse(localStorage.getItem(LS) || 'null');
    if (x && typeof x.trial === 'number') return x;
  } catch { /* */ }
  // First day in the app (or the day this version arrived for someone already using it).
  let t = Date.now();
  try { const old = JSON.parse(localStorage.getItem('lm.pro') || 'null'); if (typeof old?.trial === 'number' && old.trial > Date.now() - TRIAL_DAYS * DAY) t = old.trial; } catch { /* */ }
  const s: PlanStore = { trial: t };
  write(s);
  return s;
}
function write(s: PlanStore) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* private mode */ } }

let store: PlanStore | null = null;
const subs = new Set<() => void>();
const get = () => (store ??= read());
const set = (p: Partial<PlanStore>) => { store = { ...get(), ...p }; write(store); subs.forEach((f) => f()); };

export interface PlanInfo {
  pro: boolean;          // features open
  trial: boolean;        // inside the 7 days
  early: boolean;        // on the list of first buyers (Pro open until payment starts)
  day: number;           // day of the trial, 1…7 (8+ after)
  msLeft: number;        // time left in the trial
  daysLeft: number;      // whole days left, rounded up
  ends: Date;
  limits: Record<LimitKey, number>;
  owner: boolean;        // the app's owner (email in lm_admins): everything open, no tariff at all
}
// The owner (lm_is_admin said yes for the signed-in email) never sees a tariff. Cleared on sign-out.
const OWNER = 'lm.owner';
export const isOwner = () => { try { return localStorage.getItem(OWNER) === '1'; } catch { return false; } };
export function setOwner(on: boolean) {
  if (on === isOwner()) return;
  try { if (on) localStorage.setItem(OWNER, '1'); else localStorage.removeItem(OWNER); } catch { /* */ }
  subs.forEach((f) => f());
}

export function planInfo(now = Date.now()): PlanInfo {
  const s = get();
  const owner = isOwner();
  const ends = new Date(s.trial + TRIAL_DAYS * DAY);
  const msLeft = Math.max(0, ends.getTime() - now);
  const trial = msLeft > 0;
  const early = Boolean(s.early);
  const pro = owner || trial || early || !LIMITS_ON;
  return { owner, pro, trial: trial && !owner, early, day: Math.floor((now - s.trial) / DAY) + 1, msLeft, daysLeft: Math.ceil(msLeft / DAY), ends, limits: pro ? { ...PRO } : { ...FREE } };
}
export const limitOf = (k: LimitKey) => planInfo().limits[k];
export function usePlan(): PlanInfo {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    const t = setInterval(f, 60000);
    return () => { subs.delete(f); clearInterval(t); };
  }, []);
  return planInfo();
}

/** «Оформить»: no payments yet, so the person joins the first buyers and keeps Pro until payment starts. */
export function joinEarly(plan: PlanId) { set({ early: { plan, at: Date.now() } }); }
export const earlyPlan = () => get().early?.plan ?? null;

/** Reminder sheets on day 5, day 7 and the first day after the trial; each shown once. */
export function dueSheet(): 5 | 7 | 8 | null {
  const p = planInfo();
  if (p.owner || p.early || !LIMITS_ON) return null;
  const seen = get().seen ?? [];
  const d = p.trial ? p.day : 8;
  for (const k of [8, 7, 5] as const) if (d >= k && !seen.includes(k)) return k;
  return null;
}
export function markSheet(k: number) { set({ seen: [...new Set([...(get().seen ?? []), ...[5, 7, 8].filter((x) => x <= k)])] }); }

export const LIMIT_RU: Record<LimitKey, [string, string]> = {
  habits: [_t("активные привычки"), _t("привычки")],
  circles: [_t("круги"), _t("круга")],
  goals: [_t("активные цели"), _t("цели")],
  books: [_t("книги в библиотеке"), _t("книги")],
  courses: [_t("видеокурсы"), _t("видеокурса")],
  quits: [_t("привычки, которые оставляешь"), _t("привычка, которую оставляешь")],
};

/** Opens the Pro screen from anywhere (App listens). */
export const PRO_EVENT = 'lm:pro';
export function openPro() { try { window.dispatchEvent(new Event(PRO_EVENT)); } catch { /* */ } }

/** Invite a friend: the plain landing link, no rewards. ref=share shows up in the owner's analytics. */
export const SHARE_URL = 'https://living-muslim.vercel.app/?ref=share';
export async function inviteFriend(): Promise<'shared' | 'copied' | 'cancel'> {
  const text = _t("Я держу намазы и привычки в Living Muslim, а братья в круге помогают не бросать. Попробуй, первые 7 дней Pro бесплатно:");
  try {
    if (navigator.share) { await navigator.share({ title: 'Living Muslim', text, url: SHARE_URL }); return 'shared'; }
  } catch { return 'cancel'; }
  try { await navigator.clipboard.writeText(`${text} ${SHARE_URL}`); return 'copied'; } catch { return 'cancel'; }
}

/** «2 д 14:05:31» style countdown. */
export function leftLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d ? _t("{0} д ", d) : ''}${p(h)}:${p(m)}:${p(x)}`;
}
