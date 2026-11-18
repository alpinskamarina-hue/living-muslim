// «Прогресс»: goal trends and forecasts, comparison with the previous 4 weeks, and plain-words findings.
import type { AppState, Goal, Habit } from './types';
import { ANCHORS, ANCHOR_LABEL } from './types';
import { addDays, daysBetween, fromKey } from './dates';
import { consistency, isCounted } from './store';
import { progress, sourceDef } from './goals';
import { _t, LOC } from './i18n';

/** Share of active habits ticked on each of `n` days ending `end` (−1: no habits yet). */
function habitRates(s: AppState, habits: Habit[], end: string, n: number) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1)).map((d) => {
    const alive = habits.filter((h) => h.createdAt <= d);
    const hit = alive.filter((h) => isCounted(s.log[d]?.[h.id])).length;
    return { d, rate: alive.length ? hit / alive.length : -1 };
  });
}

/** Average consistency over the 4 weeks before the current 4 weeks, or null when there is too little to compare. */
export function previousAvg(s: AppState, today: string) {
  const habits = s.habits.filter((h) => h.status === 'active');
  const prev = habitRates(s, habits, addDays(today, -28), 28).filter((x) => x.rate >= 0);
  if (prev.length < 7) return null;
  return Math.round((prev.reduce((a, x) => a + x.rate, 0) / prev.length) * 100);
}

export interface GoalTrend {
  g: Goal;
  pct: number;
  /** Percent points over the last 7 days. */
  week: number;
  /** Daily share (0..100) for the last 28 days, filled forward from the snapshots. */
  line: number[];
  /** Expected finish day at the current pace, '' when there is no pace or the goal is a «who I am» goal. */
  eta: string;
  identity: boolean;
}

export function goalTrends(s: AppState, today: string): GoalTrend[] {
  return (s.goals ?? []).filter((g) => g.status === 'active').map((g) => {
    const def = sourceDef(g.source);
    const p = progress(s, g, today);
    const toPct = (v: number) => Math.max(0, Math.min(100, (v / Math.max(1, g.target)) * 100));
    const snaps = g.snaps ?? {};
    let last = Object.keys(snaps).filter((k) => k < addDays(today, -27)).sort().map((k) => snaps[k]).pop() ?? (def.counter ? 0 : null);
    const line: number[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = addDays(today, -i);
      if (i === 0) last = p.value;
      else if (snaps[d] !== undefined) last = snaps[d];
      line.push(last == null ? -1 : toPct(last));
    }
    const known = line.filter((x) => x >= 0);
    const weekAgo = line[20] >= 0 ? line[20] : known[0] ?? p.pct;
    const week = Math.round(p.pct - weekAgo);
    // Pace over the last 14 days (or since the goal was made).
    let eta = '';
    if (!def.identity && p.pct < 100) {
      const span = Math.min(14, Math.max(1, daysBetween(g.createdAt, today)));
      const from = line[27 - span] >= 0 ? line[27 - span] : known[0] ?? 0;
      const perDay = (p.pct - from) / span;
      if (perDay > 0.05) {
        const days = Math.ceil((100 - p.pct) / perDay);
        if (days < 3650) eta = addDays(today, days);
      }
    }
    return { g, pct: p.pct, week, line, eta, identity: Boolean(def.identity) };
  });
}

export const fmtDay = (d: string) => fromKey(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: d.slice(0, 4) === new Date().toISOString().slice(0, 4) ? undefined : 'numeric' });

/** Up to three findings in plain words. */
export function findings(s: AppState, today: string): { ic: string; text: string }[] {
  const out: { ic: string; text: string; w: number }[] = [];
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, -28 + i)); // without today

  // Prayers: the one that most often comes late or is missing.
  const marked = days.filter((d) => Object.keys(s.prayers[d] ?? {}).length);
  if (marked.length >= 7) {
    const rate = ANCHORS.map((a) => ({ a, on: marked.filter((d) => s.prayers[d]?.[a] === 'ontime').length / marked.length }));
    rate.sort((x, y) => x.on - y.on);
    const worst = rate[0], best = rate[rate.length - 1];
    if (best.on - worst.on >= 0.15) out.push({ ic: '🕌', w: 3, text: _t("Труднее всего даётся {0}: вовремя {1}% дней. Лучше всего {2}: {3}%.", ANCHOR_LABEL[worst.a].ru, Math.round(worst.on * 100), ANCHOR_LABEL[best.a].ru, Math.round(best.on * 100)) });
    else if (worst.on >= 0.8) out.push({ ic: '🕌', w: 2, text: _t("Все пять намазов идут ровно: каждый вовремя не реже {0}% дней. Машаллах.", Math.round(worst.on * 100)) });
  }

  // Habits: best and weakest day of the week.
  const habits = s.habits.filter((h) => h.status === 'active');
  const rates = habitRates(s, habits, addDays(today, -1), 28).filter((x) => x.rate >= 0);
  if (rates.length >= 14) {
    const wd = Array.from({ length: 7 }, (_, i) => {
      const r = rates.filter((x) => fromKey(x.d).getDay() === i);
      return { i, v: r.length ? r.reduce((a, x) => a + x.rate, 0) / r.length : -1 };
    }).filter((x) => x.v >= 0).sort((a, b) => b.v - a.v);
    const name = (i: number) => fromKey(addDays('2024-01-07', i)).toLocaleDateString(LOC, { weekday: 'long' }); // 7 Jan 2024 is a Sunday
    if (wd.length >= 5 && wd[0].v - wd[wd.length - 1].v >= 0.15) out.push({ ic: '📅', w: 2, text: _t("Лучший день недели: {0} ({1}%). Слабее всего: {2} ({3}%). Можно заранее облегчить этот день.", name(wd[0].i), Math.round(wd[0].v * 100), name(wd[wd.length - 1].i), Math.round(wd[wd.length - 1].v * 100)) });
  }

  // Habits that grow or slip: last 14 days against the 14 before.
  const yest = addDays(today, -1);
  const moves = habits.filter((h) => daysBetween(h.createdAt, today) >= 21).map((h) => {
    const now = consistency(s, h, yest, 14).rate;
    const before = consistency(s, h, addDays(yest, -14), 14).rate;
    return { h, d: now - before, now };
  }).sort((a, b) => a.d - b.d);
  const slip = moves[0];
  if (slip && slip.d <= -0.2) out.push({ ic: '⚠️', w: 3, text: _t("Проседает «{0}»: {1}% за 2 недели против {2}% раньше. Попробуй минимум: {3}.", slip.h.action, Math.round(slip.now * 100), Math.round((slip.now - slip.d) * 100), slip.h.min || _t("самый маленький шаг")) });
  const grow = moves[moves.length - 1];
  if (grow && grow !== slip && grow.d >= 0.2) out.push({ ic: '🌱', w: 1, text: _t("Растёт «{0}»: {1}% за 2 недели, на {2}% больше, чем раньше.", grow.h.action, Math.round(grow.now * 100), Math.round(grow.d * 100)) });

  return out.sort((a, b) => b.w - a.w).slice(0, 3).map(({ ic, text }) => ({ ic, text }));
}
