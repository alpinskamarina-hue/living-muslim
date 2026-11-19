// Courses together: the course of the week in a circle, ratings and reviews, badges, and courses that open after another one.
import { useEffect, useState } from 'react';
import { addDays, plural } from './dates';
import { cloudMe, cloudRpc, currentCircle, isCloud, meRpc } from './cloud';
import type { Member } from './circle';
import { catalog, type VideoItem, type VideoState } from './videos';
import { _t } from './i18n';

// ───── Course of the week in a circle ─────
// Like the circle's weekly goal, the course lives in the member doc of whoever suggested it (the latest wins),
// so no new server table is needed. Members share only how many lessons they watched, never notes or test scores.

/** A course suggested to the circle. until: last day ('' = no deadline). id '' = the suggester ended it. */
export interface CCourse { id: string; title: string; n: number; until: string; at: string }
/** My place in the circle's course: lessons watched, out of n, and the day I finished it. */
export interface CProg { id: string; d: number; n: number; ok?: string }

const ccKey = (code?: string) => `lm.cc.${code || (isCloud && currentCircle()?.code) || 'local'}`;
function readCC(code?: string): CCourse | null { try { return JSON.parse(localStorage.getItem(ccKey(code)) || 'null'); } catch { return null; } }

/** Save a suggestion for a circle (any of mine, not only the open one). */
export function suggestCourse(code: string | undefined, c: CCourse) {
  try { localStorage.setItem(ccKey(code), JSON.stringify(c)); } catch { /* */ }
  window.dispatchEvent(new Event('lm-cc'));
}

/** What I suggested to the open circle, shared inside my member doc. */
export function useMyCC(): [CCourse | null, (c: CCourse | null) => void] {
  const [cc, setCC] = useState<CCourse | null>(() => readCC());
  useEffect(() => {
    const f = () => setCC(readCC());
    window.addEventListener('lm-cc', f);
    return () => window.removeEventListener('lm-cc', f);
  }, []);
  const set = (c: CCourse | null) => {
    try { if (c) localStorage.setItem(ccKey(), JSON.stringify(c)); else localStorage.removeItem(ccKey()); } catch { /* */ }
    setCC(c);
  };
  return [cc, set];
}

/** The circle's course: the latest suggestion anyone made. Shown until 7 days after its deadline. */
export function courseOfCircle(members: Member[], today: string): (CCourse & { by: string }) | null {
  let best: (CCourse & { by: string }) | null = null;
  for (const m of members) { const c = m.cc; if (c && (!best || c.at > best.at)) best = { ...c, by: m.id }; }
  if (!best || !best.id) return null;
  if (best.until && addDays(best.until, 7) < today) return null;
  return best;
}

/** My progress on a course, from the lessons I marked as watched. */
export function progOf(vs: VideoState | undefined, c: { id: string; n: number }): CProg {
  const d = Math.min(c.n, (vs?.byCourse?.[c.id] ?? []).length);
  const ok = vs?.doneC?.[c.id];
  return { id: c.id, d: ok ? c.n : d, n: c.n, ...(ok ? { ok } : {}) };
}

// ───── Ratings and reviews (supabase/course-reviews.sql) ─────

export interface CStat { c: string; done: number; n: number; avg: number | null }
export interface Review { who: string; nick: boolean; stars: number; body: string; day: string }
export interface AdminReview extends Review { uid: string; hidden: boolean }

const anonRpc = <T,>(fn: string, args: Record<string, unknown>) => cloudRpc<T>(fn, args);

const SC = 'lm.cstats';
let stats: Record<string, CStat> = (() => { try { return JSON.parse(localStorage.getItem(SC) || 'null')?.m ?? {}; } catch { return {}; } })();
let statsP: Promise<void> | null = null;
/** Ratings for the catalog, cached for an hour. Empty until the server has course-reviews.sql. */
export function useStats(): Record<string, CStat> {
  const [m, setM] = useState(stats);
  useEffect(() => {
    let live = true;
    try { const c = JSON.parse(localStorage.getItem(SC) || 'null'); if (c && Date.now() - c.at < 3600000) return; } catch { /* */ }
    statsP ??= anonRpc<CStat[]>('lm_course_stats', {}).then((rows) => {
      stats = Object.fromEntries((rows ?? []).map((r) => [r.c, r]));
      try { localStorage.setItem(SC, JSON.stringify({ at: Date.now(), m: stats })); } catch { /* */ }
    }).catch(() => {});
    statsP.then(() => live && setM(stats));
    return () => { live = false; };
  }, []);
  return m;
}
const refreshStats = () => { statsP = null; try { localStorage.removeItem(SC); } catch { /* */ } };

export const reviewsOf = (course: string) => anonRpc<Review[]>('lm_course_reviews', { p_course: course }).catch(() => [] as Review[]);

/** Rating works only on the standalone site with a profile. */
export const canRate = () => isCloud && Boolean(cloudMe());

// Finished courses not yet told to the server (offline, or the server was not updated yet).
const PEND = 'lm.cdone';
const pending = (): string[] => { try { return JSON.parse(localStorage.getItem(PEND) || '[]'); } catch { return []; } };
export async function sendDone(ids: string[]) {
  if (!canRate()) return;
  const todo = [...new Set([...pending(), ...ids])];
  const left: string[] = [];
  for (const id of todo) { const ok = await meRpc<boolean>('lm_course_done', { p_course: id }).catch(() => false); if (!ok) left.push(id); }
  try { localStorage.setItem(PEND, JSON.stringify(left.slice(0, 50))); } catch { /* */ }
}
const sent = new Set<string>();
/** Tell the server once per visit about finished courses, so their owners can rate them. */
export function syncDone(vs: VideoState | undefined) {
  const ids = Object.keys(vs?.doneC ?? {}).filter((id) => !sent.has(id));
  if (!ids.length && !pending().length) return;
  ids.forEach((id) => sent.add(id));
  sendDone(ids);
}

/** 'ok' | 'not_done' | 'old' (server not updated) | 'error' */
export async function rate(course: string, stars: number, body: string): Promise<string> {
  try {
    await meRpc<boolean>('lm_course_done', { p_course: course });
    const r = await meRpc<string>('lm_course_rate', { p_course: course, p_stars: stars, p_body: body.trim().slice(0, 600) });
    if (r === 'ok') refreshStats();
    return r;
  } catch (e) { return /404/.test(String(e)) ? 'old' : 'error'; }
}

// Owner screens: signed in by email (the same token the admin courses editor uses).
export const adminRpc = <T,>(fn: string, args: Record<string, unknown>, token: string) => cloudRpc<T>(fn, args, token);

export const starsText = (avg: number | null | undefined) => (avg == null ? '' : avg.toFixed(1).replace('.', _t(",")));

// ───── Badges ─────

export interface Badge { k: string; ic: string; t: string; got: boolean; hint?: string }
const COUNTS = [1, 3, 5, 10];
const cn = (c: number) => (c === 1 ? _t("Первый курс") : `${c} ${plural(c, _t("курс"), _t("курса"), _t("курсов"))}`);

/** All badges: one per finished course, course counts, the first faith course, finished with a circle. */
export function badgesOf(vs: VideoState | undefined, items: VideoItem[] = catalog()): Badge[] {
  const done = Object.keys(vs?.doneC ?? {});
  const find = (id: string) => [...(vs?.mine ?? []), ...items].find((x) => x.id === id);
  const out: Badge[] = [];
  for (const id of done.sort((a, b) => ((vs!.doneC![a] < vs!.doneC![b]) ? -1 : 1))) {
    const it = find(id);
    if (it) out.push({ k: `c:${id}`, ic: '🏅', t: it.title, got: true });
  }
  const n = done.length;
  let nextShown = false;
  for (const c of COUNTS) {
    if (n >= c) out.push({ k: `n${c}`, ic: String(c), t: cn(c), got: true });
    else if (!nextShown) { nextShown = true; out.push({ k: `n${c}`, ic: String(c), t: cn(c), got: false, hint: _t("ещё {0}", c - n) }); }
  }
  const faith = done.some((id) => find(id)?.cat === 'faith');
  out.push({ k: 'faith', ic: '🌙', t: _t("Первый курс по вере"), got: faith, ...(faith ? {} : { hint: _t("пройди курс по вере") }) });
  const circ = Object.keys(vs?.withCircle ?? {}).some((id) => vs?.doneC?.[id]);
  out.push({ k: 'circle', ic: '👥', t: _t("Прошёл с кругом"), got: circ, ...(circ ? {} : { hint: _t("пройди курс недели в кругу") }) });
  return out;
}

/** The one badge shown next to my name in the circle: my choice, or the best one I have. */
export function shownBadge(vs: VideoState | undefined): { ic: string; t: string } | null {
  const pick = vs?.badge;
  if (pick === 'off') return null;
  const got = badgesOf(vs).filter((b) => b.got);
  if (!got.length) return null;
  const b = (pick && got.find((x) => x.k === pick)) || [...got].reverse().find((x) => /^n\d/.test(x.k)) || got[0];
  // Next to a name a digit alone reads as part of it: count badges travel as a medal with words.
  return { ic: /^\d+$/.test(b.ic) ? '🏅' : b.ic, t: b.t.length > 22 ? `${b.t.slice(0, 21)}…` : b.t };
}

// ───── Courses that open after another ─────

/** The course that has to be finished first, when this one is still closed for me. */
export function lockedBy(item: VideoItem, vs: VideoState | undefined, items: VideoItem[] = catalog()): VideoItem | null {
  const after = item.plan?.after;
  if (!after || after === item.id || vs?.doneC?.[after]) return null;
  return items.find((x) => x.id === after) ?? null;
}
/** Courses that open once this one is finished. */
export const opensAfter = (id: string, items: VideoItem[] = catalog()) => items.filter((x) => x.plan?.after === id);
