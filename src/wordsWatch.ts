import { useEffect, useRef } from 'react';
import type { AppState } from './types';
import { ANCHORS } from './types';
import { isCounted, streak } from './store';
import { calendarTrigger, say, type Trigger } from './words';
import type { DayTimes } from './prayer';

const STREAKS = [3, 7, 14, 21, 30, 40, 60, 100];

/**
 * Watches what the person just did (by comparing the state before and after a change) and asks for one fitting phrase.
 * Only one event per change: the strongest one wins.
 */
export function useWordsWatch(state: AppState, today: string) {
  const prev = useRef<AppState | null>(null);
  useEffect(() => {
    const a = prev.current;
    prev.current = state;
    if (!a) return;
    const ev = detect(a, state, today);
    if (ev) say(ev.t, ev.extra);
  }, [state, today]);
}

const KEYS: (keyof AppState)[] = ['prayers', 'hard', 'log', 'sadaqa', 'videos', 'course', 'goals', 'trip', 'health', 'habits', 'settings'];

function detect(a: AppState, b: AppState, today: string): { t: Trigger; extra?: string } | null {
  // A whole-state replace (import, sync) changes many parts at once: that is not something the person just did.
  if (KEYS.filter((k) => a[k] !== b[k]).length > 2) return null;
  // Prayers
  const pa = a.prayers[today] ?? {};
  const pb = b.prayers[today] ?? {};
  for (const x of ANCHORS) {
    if (pb[x] && pb[x] !== pa[x]) {
      if (pb[x] === 'late') return { t: 'prayer_late' };
      if (ANCHORS.every((y) => pb[y] === 'ontime') && !ANCHORS.every((y) => pa[y] === 'ontime')) return { t: 'prayer_all5' };
      if (x === 'fajr' && !pa[x]) return { t: 'prayer_fajr' };
      return { t: 'prayer_ontime' };
    }
  }
  // Hard day
  if ((b.hard[today]?.length ?? 0) > (a.hard[today]?.length ?? 0)) return { t: 'hard_day' };
  // Habits
  const la = a.log[today] ?? {};
  const lb = b.log[today] ?? {};
  for (const [id, m] of Object.entries(lb)) {
    if (isCounted(m) && !isCounted(la[id])) {
      const h = b.habits.find((x) => x.id === id);
      const n = h ? streak(b, h, today) : 0;
      if (STREAKS.includes(n)) return { t: 'streak', extra: `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней'} подряд.` };
      return { t: 'habit_done' };
    }
  }
  // Sadaqa
  const sa = a.sadaqa?.days[today];
  const sb = b.sadaqa?.days[today];
  if ((sb?.money && !sa?.money) || (sb?.deed && !sa?.deed)) return { t: 'sadaqa_add' };
  // Video lessons
  const vd = (s: AppState) => (s.videos ? Object.values(s.videos.pos).filter((p) => p.done).length : 0);
  if (vd(b) > vd(a)) return { t: 'lesson_done' };
  // Course lessons (English course)
  if ((b.course?.done.length ?? 0) > (a.course?.done.length ?? 0)) return { t: 'lesson_done' };
  // Goals
  const ga = a.goals ?? [];
  const gb = b.goals ?? [];
  if (gb.length > ga.length && gb.some((g) => !ga.find((x) => x.id === g.id))) return { t: 'goal_new' };
  for (const g of gb) {
    const o = ga.find((x) => x.id === g.id);
    if (!o) continue;
    if (g.status === 'done' && o.status !== 'done') return { t: 'goal_done' };
    if (g.manual > o.manual) return { t: 'goal_step' };
  }
  // Travel
  if (b.trip && !a.trip) return { t: 'safar_on' };
  // Workout
  if ((b.health?.workouts?.[today]?.length ?? 0) > (a.health?.workouts?.[today]?.length ?? 0)) return { t: 'workout' };
  return null;
}

/** The reminder of the day for Today, by the time of day, Friday and the hijri calendar. */
export function todayTrigger(now: Date, times: DayTimes): Trigger {
  const t = now.getTime();
  const cal = calendarTrigger(now);
  if (now.getDay() === 5) return t < times.asr.getTime() ? 'friday_am' : t < times.maghrib.getTime() ? 'friday_pm' : 'evening';
  if (cal && t >= times.asr.getTime()) return cal; // fasts are reminded the evening before
  if (cal === 'dhulhijja' || cal === 'arafa') return cal;
  if (t < times.fajr.getTime()) return 'night';
  if (t < times.dhuhr.getTime()) return 'morning';
  if (t >= times.isha.getTime()) return 'night';
  if (t >= times.asr.getTime()) return 'evening';
  return cal ?? 'morning';
}
