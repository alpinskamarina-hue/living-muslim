// «Для сестёр»: days without prayer (haid, nifas), privacy by default. Everything here stays on this phone:
// the circle sees an ordinary day, the server never hears about it.
import type { Anchor, AppState, PrayerMark } from './types';
import { addDays, daysBetween } from './dates';
import { inRamadan } from './rplan';
import { _t, LANG } from './i18n';

export interface SisRange { from: string; to: string; nifas?: boolean }
export interface SisState {
  /** Start day of the days without prayer that are going on now. */
  cur?: string;
  /** Started after a birth (nifas): up to 40 days. */
  nifas?: boolean;
  /** Past days without prayer, newest first (up to 24). */
  past?: SisRange[];
  /** zk[day] = prayer times at which the dhikr was done on such a day. */
  zk?: Record<string, Anchor[]>;
  /** Settings; missing means the default (dhikr, Quran and soft reminders on, the guess off). */
  zikr?: boolean;
  quran?: boolean;
  soft?: boolean;
  guess?: boolean;
  /** The «Включили для тебя» card after «Я сестра» was seen (privacy by default). */
  priv?: 'shown' | 'done' | 'own';
  /** Режим «Мама»: expecting, breastfeeding or a baby under 2. */
  mama?: Mama | null;
  /** Ticks in «Пока малыш спит»: day -> item ids. */
  nap?: Record<string, string[]>;
}
export type MamaKind = 'preg' | 'feed' | 'baby';
export interface Mama { k: MamaKind; since: string; born?: string; easy?: boolean }

export const mamaOf = (s: AppState): Mama | null => (isSister(s) ? s.sis?.mama ?? null : null);
/** Habits show their minimum as enough. */
export const mamaEasy = (s: AppState) => Boolean(mamaOf(s) && mamaOf(s)!.easy !== false);
/** Missed days forgiven in a week: 3 for a mother, 1 otherwise. */
export const forgiveLimit = (s: AppState) => (mamaOf(s) ? 3 : 1);
export const MAMA_KINDS: { k: MamaKind; l: () => string }[] = [
  { k: 'preg', l: () => _t("Жду малыша") },
  { k: 'feed', l: () => _t("Кормлю") },
  { k: 'baby', l: () => _t("Малыш до 2 лет") },
];
export function setMama(s: AppState, k: MamaKind | null, today: string): AppState {
  if (!k) return put(s, { mama: null });
  const m = sisOf(s).mama;
  return put(s, { mama: { ...(m ?? {}), k, since: m?.k === k ? m.since : today } });
}
export function toggleNap(s: AppState, d: string, id: string): AppState {
  const x = sisOf(s);
  const list = x.nap?.[d] ?? [];
  const nap = Object.fromEntries(Object.entries(x.nap ?? {}).filter(([k]) => daysBetween(k, d) <= 30));
  return put(s, { nap: { ...nap, [d]: list.includes(id) ? list.filter((y) => y !== id) : [...list, id] } });
}

export const sisOf = (s: AppState): SisState => s.sis ?? {};
const savedGender = () => { try { return localStorage.getItem('lm.gender') || ''; } catch { return ''; } };
export const isSister = (s: AppState) => s.settings.me === 'f' || (!s.settings.me && savedGender() === 'f');

/** Was this day one without prayer (on now, or in the past)? */
export function sisDay(s: AppState, d: string): boolean {
  const x = s.sis;
  if (!x) return false;
  if (x.cur && d >= x.cur) return true;
  return (x.past ?? []).some((r) => d >= r.from && d <= r.to);
}
export const sisNow = (s: AppState) => Boolean(s.sis?.cur);
/** Day number of the days going on now (1 on the first day). */
export const sisDayN = (s: AppState, today: string) => (s.sis?.cur ? daysBetween(s.sis.cur, today) + 1 : 0);

const put = (s: AppState, p: Partial<SisState>): AppState => ({ ...s, sis: { ...sisOf(s), ...p } });

/** Ramadan days in a range get the «Месячные» fast mark, so the days to make up count themselves. */
function markFasts(s: AppState, from: string, to: string): AppState {
  if (!s.ramadan) return s;
  const fasts = { ...s.ramadan.fasts };
  let ch = false;
  for (let d = from, i = 0; d <= to && i < 60; d = addDays(d, 1), i++) {
    if (inRamadan(d) && !fasts[d]) { fasts[d] = 'period'; ch = true; }
  }
  return ch ? { ...s, ramadan: { ...s.ramadan, fasts } } : s;
}

export function sisStart(s: AppState, today: string, nifas = false): AppState {
  if (s.sis?.cur) return s;
  // Prayers of today not prayed yet stay unmarked; those already prayed stay as they are.
  const next = put(s, { cur: today, nifas: nifas || undefined });
  syncSw(next);
  return markFasts(next, today, today);
}

export function sisEnd(s: AppState, today: string): AppState {
  const x = sisOf(s);
  if (!x.cur) return s;
  const to = today >= x.cur ? today : x.cur;
  const past = [{ from: x.cur, to, ...(x.nifas ? { nifas: true } : {}) }, ...(x.past ?? [])].slice(0, 24);
  // Only the last 60 days of dhikr ticks are kept.
  const zk = Object.fromEntries(Object.entries(x.zk ?? {}).filter(([d]) => daysBetween(d, today) <= 60));
  const next = markFasts(put(s, { cur: undefined, nifas: undefined, past, zk }), x.cur, to);
  syncSw(next);
  return next;
}

/** Undo a start made by mistake today. */
export function sisCancel(s: AppState): AppState {
  const next = put(s, { cur: undefined, nifas: undefined });
  syncSw(next);
  return next;
}

export function toggleZk(s: AppState, d: string, a: Anchor): AppState {
  const x = sisOf(s);
  const list = x.zk?.[d] ?? [];
  return put(s, { zk: { ...(x.zk ?? {}), [d]: list.includes(a) ? list.filter((y) => y !== a) : [...list, a] } });
}
export const zkDone = (s: AppState, d: string, a: Anchor) => Boolean(s.sis?.zk?.[d]?.includes(a));

/** Prayer marks as the circle and the day's light see them: on such a day a dhikr at a prayer time counts like that prayer. */
export function prayersSeen(s: AppState, d: string): Partial<Record<Anchor, PrayerMark>> {
  const pr = s.prayers[d] ?? {};
  if (!sisDay(s, d)) return pr;
  const out: Partial<Record<Anchor, PrayerMark>> = { ...pr };
  for (const a of s.sis?.zk?.[d] ?? []) out[a] = out[a] ?? 'ontime';
  return out;
}

export interface Zikr { t: string; m: number; go?: 'azkar' | 'quran' }
/** What to do at each prayer time on such a day: a short dhikr, a surah to listen to, a dua. */
export function zikrAt(s: AppState, a: Anchor): Zikr | null {
  const x = sisOf(s);
  if (x.zikr === false) return null;
  const quran = x.quran !== false;
  switch (a) {
    case 'fajr': return { t: _t("Утренние азкары"), m: 5, go: 'azkar' };
    case 'dhuhr': return { t: _t("СубханАллах ×33"), m: 1 };
    case 'asr': return quran ? { t: _t("Сура аль-Мульк на слух"), m: 6, go: 'quran' } : { t: _t("Истигфар ×33"), m: 1 };
    case 'maghrib': return { t: _t("Вечерние азкары"), m: 5, go: 'azkar' };
    default: return { t: _t("Дуа своими словами"), m: 2 };
  }
}

/** What the end-of-days sheet shows. */
export function sisSummary(s: AppState, today: string) {
  const x = sisOf(s);
  const from = x.cur ?? today;
  let zk = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) zk += x.zk?.[d]?.length ?? 0;
  let ram = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) if (inRamadan(d)) ram++;
  return { days: daysBetween(from, today) + 1, zk, ram };
}

/** A rough guess of when the next days start: the average gap between the last starts. Only on this phone. */
export function sisGuess(s: AppState, today: string): { inDays: number; day: string } | null {
  if (s.sis?.cur) return null;
  const starts = (s.sis?.past ?? []).filter((r) => !r.nifas).map((r) => r.from).sort();
  if (starts.length < 2) return null;
  const last = starts.slice(-4);
  const gaps = last.slice(1).map((d, i) => daysBetween(last[i], d)).filter((g) => g >= 15 && g <= 60);
  if (!gaps.length) return null;
  const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const day = addDays(starts[starts.length - 1], avg);
  return { inDays: daysBetween(today, day), day };
}

export const setSis = (s: AppState, p: Partial<SisState>): AppState => {
  const next = put(s, p);
  if ('soft' in p) syncSw(next);
  return next;
};

/**
 * The service worker shows prayer reminders sent by the server. On days without prayer it swaps them
 * for a soft «время зикра» on the phone itself, so the server is never told. The flag lives in Cache Storage,
 * the only store both the page and the worker can read.
 */
export function syncSw(s: AppState) {
  try {
    if (typeof caches === 'undefined') return;
    const on = Boolean(s.sis?.cur) && s.sis?.soft !== false;
    const body = JSON.stringify({ on: true, en: LANG === 'en' });
    caches.open('lm-local').then(async (c) => {
      if (on) await c.put('/__lm-sis', new Response(body, { headers: { 'content-type': 'application/json' } }));
      else await c.delete('/__lm-sis');
    }).catch(() => {});
  } catch { /* no cache storage */ }
}

