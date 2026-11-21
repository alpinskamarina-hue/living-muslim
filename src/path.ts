// «Путь» in the profile (supabase/profile-path.sql). The phone keeps the real data and sends a short
// summary of the good things only: on-time share of prayers, days in a row, what is studied, counts for the month.
// Each block has its own «кто видит»; the server hands others only what they may see.
import { useEffect, useState } from 'react';
import type { AppState, Anchor } from './types';
import { ANCHORS } from './types';
import { addDays } from './dates';
import { streak } from './store';
import { ayahIndex, TOTAL_AYAHS, progress } from './goals';
import { catalog } from './videos';
import { cloudMe, isCloud, meRpc } from './cloud';
import { _t, _tj } from './i18n';

export type Block = 'prayer' | 'habits' | 'study' | 'deeds' | 'goals';
export const BLOCKS: Block[] = ['prayer', 'habits', 'study', 'deeds', 'goals'];
export type Vis = 'all' | 'circles' | 'none';
export interface PathPrayer { days: number; pct: number; by: Partial<Record<Anchor, number>>; fajr: number }
export interface PathHabit { t: string; a: Anchor; run: number }
export interface PathStudy { k: string; t: string; sub: string; pct?: number }
export interface PathDeeds { m: string; quran?: number; sadaqa?: number; azkar?: number; fasts?: number }
export interface PathGoal { t: string; pct: number }
export interface Path { prayer?: PathPrayer; habits?: PathHabit[]; study?: PathStudy[]; deeds?: PathDeeds; goals?: PathGoal[] }

/** Habit ids the person chose not to show (kept on this phone, in settings). */
export const hiddenHabits = (s: AppState): string[] => s.settings.pathHide ?? [];

/** The summary of the last 30 days and this month. Blocks with nothing good to show are left out. */
export function buildPath(s: AppState, today: string): Path {
  const p: Path = {};
  // Prayers: only days the person marked anything; the share on time, per prayer, and Fajr on time in a row.
  let days = 0, on = 0;
  const per: Record<string, [number, number]> = {};
  for (let i = 0; i < 30; i++) {
    const d = s.prayers[addDays(today, -i)];
    if (!d || !Object.keys(d).length) continue;
    days++;
    for (const a of ANCHORS) {
      per[a] ??= [0, 0];
      per[a][1]++;
      if (d[a] === 'ontime') { on++; per[a][0]++; }
    }
  }
  if (days >= 5 && on > 0) {
    let fajr = 0;
    let d = s.prayers[today]?.fajr === 'ontime' ? today : addDays(today, -1);
    while (s.prayers[d]?.fajr === 'ontime') { fajr++; d = addDays(d, -1); }
    const by: Partial<Record<Anchor, number>> = {};
    for (const a of ANCHORS) if (per[a]) by[a] = Math.round((per[a][0] / per[a][1]) * 100);
    p.prayer = { days, pct: Math.round((on / (days * 5)) * 100), by, fajr };
  }
  // Habits: active ones with their days in a row (the same count as on the habit card).
  const hide = new Set(hiddenHabits(s));
  const hs = s.habits.filter((h) => h.status === 'active' && !hide.has(h.id))
    .map((h) => ({ t: h.action.slice(0, 60), a: h.anchor, run: streak(s, h, today) }))
    .filter((h) => h.run > 0).sort((a, b) => b.run - a.run).slice(0, 6);
  if (hs.length) p.habits = hs;
  // Studies: Arabic and English by days, started courses, books.
  const st: PathStudy[] = [];
  if (s.courseAr && s.courseAr.day > 1) st.push({ k: 'ar', t: _t("Арабский по дням"), sub: _tj("день {0} · слов: {1}", s.courseAr.day, s.courseAr.learned.length) });
  if (s.course && s.course.day > 1) st.push({ k: 'en', t: _t("Английский по дням"), sub: _tj("день {0} · слов: {1}", s.course.day, s.course.learned.length) });
  const v = s.videos;
  if (v?.started?.length) {
    const cat = catalog(true);
    for (const id of v.started.slice(-4).reverse()) {
      const c = cat.find((x) => x.id === id);
      if (!c) continue;
      const seen = v.byCourse?.[id]?.length ?? 0;
      const n = c.count ?? 0;
      st.push({ k: `c:${id}`, t: c.title.slice(0, 60), sub: n ? _tj("{0} из {1} уроков", seen, n) : _tj("уроков: {0}", seen), pct: n ? Math.min(100, Math.round((seen / n) * 100)) : undefined });
    }
  }
  for (const b of (s.books ?? []).filter((x) => x.page > 1).slice(-2)) st.push({ k: `b:${b.id}`, t: b.title.slice(0, 60), sub: _tj("стр. {0} из {1}", b.page, b.pages), pct: b.pages ? Math.round((b.page / b.pages) * 100) : undefined });
  if (st.length) p.study = st.slice(0, 6);
  // Good deeds this month.
  const m = today.slice(0, 7);
  const inM = (d: string) => d.startsWith(m);
  const deeds: PathDeeds = { m };
  if (s.quran) { const q = Math.round((ayahIndex(s.quran.surah, s.quran.ayah) / TOTAL_AYAHS) * 100); if (q > 0) deeds.quran = q; }
  const sd = Object.keys(s.sadaqa?.days ?? {}).filter(inM).length; if (sd) deeds.sadaqa = sd;
  const az = new Set([...(s.azkar?.m ?? []), ...(s.azkar?.e ?? [])].filter(inM)).size; if (az) deeds.azkar = az;
  const fs = new Set([...Object.keys(s.health?.fasts ?? {}), ...Object.entries(s.ramadan?.fasts ?? {}).filter(([, k]) => k === 'fast').map(([d]) => d)].filter(inM)).size; if (fs) deeds.fasts = fs;
  if (Object.keys(deeds).length > 1) p.deeds = deeds;
  // Goals: titles and progress.
  const gs = (s.goals ?? []).filter((g) => g.status === 'active').slice(0, 5).map((g) => ({ t: g.title.slice(0, 60), pct: progress(s, g, today).pct }));
  if (gs.length) p.goals = gs;
  return p;
}

let lastSent = '';
/** Sends my summary when it changed (at most every 10 minutes). Silent when the server has no profile-path.sql. */
export async function syncPath(s: AppState, today: string, force = false) {
  if (!isCloud || !cloudMe()) return;
  const body = JSON.stringify(buildPath(s, today));
  try { lastSent ||= localStorage.getItem('lm.pathSent') || ''; } catch { /* */ }
  let at = 0; try { at = Number(localStorage.getItem('lm.pathAt') || 0); } catch { /* */ }
  if (!force && (body === lastSent || Date.now() - at < 600000)) return;
  const ok = await meRpc<boolean>('lm_path_set', { p: JSON.parse(body) }).catch(() => false);
  if (!ok) return;
  lastSent = body;
  try { localStorage.setItem('lm.pathSent', body); localStorage.setItem('lm.pathAt', String(Date.now())); } catch { /* */ }
}

export const getPath = (uid: string) => meRpc<{ path: Path; at: string | null } | null>('lm_path', { p_other: uid }).catch(() => null);
export interface PathSettings { vis: Record<Block, Vis>; ask_from: Vis; sisters_only: boolean; gender: string }
export const getPathSettings = () => meRpc<PathSettings | null>('lm_path_mine').catch(() => null);
export const setPathSettings = (vis: Partial<Record<Block, Vis>> | null, askFrom?: Vis) => meRpc<boolean>('lm_path_vis_set', { p_vis: vis, p_ask_from: askFrom ?? null }).catch(() => false);

/** true when the server has profile-path.sql. */
let okP: Promise<boolean> | null = null;
export function pathReady(): Promise<boolean> {
  if (!isCloud || !cloudMe()) return Promise.resolve(false);
  okP ??= getPathSettings().then(Boolean);
  return okP;
}
export function usePathReady() {
  const [ok, setOk] = useState(false);
  useEffect(() => { pathReady().then(setOk); }, []);
  return ok;
}
