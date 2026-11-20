import type { AppState, HealthState } from './types';
import { _t, LANG } from './i18n';
import { addDays, fromKey } from './dates';

export const defaultHealth = (): HealthState => ({ sleepHours: 7, wakeBefore: 20, sleep: {}, waterGoal: 8, water: {}, fasts: {}, workouts: {} });
export const health = (s: AppState): HealthState => ({ ...defaultHealth(), ...(s.health ?? {}) });
export const patchHealth = (s: AppState, fn: (h: HealthState) => Partial<HealthState>): AppState => {
  const h = health(s);
  return { ...s, health: { ...h, ...fn(h) } };
};

/** Hijri day and month (Umm al-Qura); null where the browser lacks the calendar. */
export function hijri(d: Date): { day: number; month: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric' }).formatToParts(d);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    return day && month ? { day, month } : null;
  } catch { return null; }
}

/** Why a day is a sunnah fast, or null. Ramadan and the Eid / Tashriq days are left out. */
export function sunnahFast(d: Date): string | null {
  const h = hijri(d);
  if (h) {
    if (h.month === 9) return null;
    if (h.month === 10 && h.day === 1) return null;
    if (h.month === 12 && h.day >= 10 && h.day <= 13) return null;
    if (h.month === 12 && h.day === 9) return _t("День Арафа");
    if (h.month === 1 && (h.day === 9 || h.day === 10)) return h.day === 10 ? _t("Ашура") : _t("Тасуа (перед Ашурой)");
    if (h.day >= 13 && h.day <= 15) return _t("Белые дни");
  }
  const w = d.getDay();
  if (w === 1) return _t("Понедельник");
  if (w === 4) return _t("Четверг");
  return null;
}

export interface Exercise { n: string; hint: string; sec: number }
export interface Workout { id: string; title: string; sub: string; rest: number; rounds: number; ex: Exercise[] }

export const WORKOUTS: Workout[] = [
  {
    id: 'morning', title: _t("Зарядка после Фаджра"), sub: _t("Разбудить тело"), rest: 15, rounds: 1,
    ex: [
      { n: _t("Вращения плечами и руками"), hint: _t("По 10 раз вперёд и назад, дыши ровно"), sec: 40 },
      { n: _t("Наклоны и повороты корпуса"), hint: _t("Медленно, без рывков"), sec: 40 },
      { n: _t("Приседания"), hint: _t("Спина прямая, колени смотрят туда же, куда носки"), sec: 40 },
      { n: _t("Отжимания"), hint: _t("От пола или от стены, если тяжело"), sec: 40 },
      { n: _t("Планка"), hint: _t("Тело одной линией, живот подтянут"), sec: 30 },
      { n: _t("Растяжка задней поверхности"), hint: _t("Наклон к ногам, колени слегка согнуты"), sec: 40 },
    ],
  },
  {
    id: 'back', title: _t("Спина и шея"), sub: _t("Для тех, кто много сидит"), rest: 10, rounds: 1,
    ex: [
      { n: _t("Повороты и наклоны головы"), hint: _t("Плавно, без боли"), sec: 45 },
      { n: _t("Кошка-корова"), hint: _t("На четвереньках: прогнись вниз, затем округли спину"), sec: 60 },
      { n: _t("Поза ребёнка"), hint: _t("Сядь на пятки, руки вперёд, расслабь поясницу"), sec: 60 },
      { n: _t("Скручивания лёжа"), hint: _t("Колени в сторону, плечи на полу, по 30 сек на сторону"), sec: 60 },
      { n: _t("Ягодичный мост"), hint: _t("Поднимай таз, сжимая ягодицы, 15 раз"), sec: 45 },
      { n: _t("Растяжка груди у стены"), hint: _t("Рука на стене, разворачивай корпус от неё"), sec: 60 },
      { n: _t("Супермен"), hint: _t("Лёжа на животе, подними руки и ноги, держи 3 сек"), sec: 45 },
    ],
  },
  {
    id: 'strength', title: _t("Сила без инвентаря"), sub: _t("Всё тело"), rest: 15, rounds: 2,
    ex: [
      { n: _t("Приседания"), hint: _t("В своём темпе, до параллели с полом"), sec: 40 },
      { n: _t("Отжимания"), hint: _t("Можно с колен"), sec: 40 },
      { n: _t("Выпады"), hint: _t("Поочерёдно на каждую ногу"), sec: 40 },
      { n: _t("Планка"), hint: _t("Не проваливай поясницу"), sec: 40 },
      { n: _t("Ягодичный мост"), hint: _t("Задержка наверху на 1 сек"), sec: 40 },
      { n: _t("Скалолаз"), hint: _t("В упоре лёжа поочерёдно подтягивай колени к груди"), sec: 30 },
    ],
  },
];

// ───── Workouts v2: own workouts, the week, the streak in weeks, extra kcal ─────

/** Own workout types. kcal per minute for light / medium / hard, for 70 kg (rough MET-based numbers). */
export const WTYPES: { id: string; ic: string; n: string; k: [number, number, number] }[] = [
  { id: 'gym', ic: '🏋️', n: _t("Зал"), k: [3.5, 5, 6] },
  { id: 'run', ic: '🏃', n: _t("Бег"), k: [7, 10, 12.5] },
  { id: 'walk', ic: '🚶', n: _t("Ходьба"), k: [3, 4, 5] },
  { id: 'football', ic: '⚽', n: _t("Футбол"), k: [6, 8, 10] },
  { id: 'swim', ic: '🏊', n: _t("Плавание"), k: [5, 7, 9] },
  { id: 'bike', ic: '🚴', n: _t("Велосипед"), k: [4, 6, 9] },
  { id: 'martial', ic: '🥋', n: _t("Единоборства"), k: [6, 8, 10] },
  { id: 'other', ic: '✨', n: _t("Другое"), k: [3.5, 5, 7] },
];
export const LEVELS = [_t("Легко"), _t("Средне"), _t("Тяжело")];
/** Timer workouts: how hard they are, for kcal. */
const TIMER_LVL: Record<string, 1 | 2 | 3> = { morning: 1, back: 1, strength: 2 };

export const workoutMin = (w: Workout) => Math.round((w.rounds * w.ex.reduce((a, e) => a + e.sec + w.rest, 0)) / 60);

export interface WEntry {
  raw: string;
  /** Timer workout id, or undefined for an own one. */
  timer?: string;
  type: string;
  name: string;
  ic: string;
  /** Minutes; undefined when not known (older entries). */
  min?: number;
  lvl?: 1 | 2 | 3;
  ai?: boolean;
}

const clean = (x: string) => x.replace(/[|]/g, '/').replace(/\s+/g, ' ').trim().slice(0, 40);

/** One stored entry for an own workout: own:<type>[:<name>]|<min>|<lvl>[|ai]. */
export function ownEntry(type: string, min: number | undefined, lvl: 1 | 2 | 3 | undefined, name?: string, ai?: boolean) {
  const t = WTYPES.some((x) => x.id === type) ? type : 'other';
  const n = name ? clean(name) : '';
  return `own:${t}${n ? `:${n}` : ''}|${min && min > 0 ? Math.min(600, Math.round(min)) : ''}|${lvl ?? ''}${ai ? '|ai' : ''}`;
}

export function parseW(raw: string): WEntry {
  const [head, m, l, by] = raw.split('|');
  const min = Number(m) > 0 ? Number(m) : undefined;
  const lvl = ([1, 2, 3] as const).find((x) => x === Number(l));
  if (!head.startsWith('own:')) {
    const w = WORKOUTS.find((x) => x.id === head);
    return { raw, timer: head, type: 'timer', name: w?.title ?? head, ic: '⏱', min: min ?? (w ? workoutMin(w) : undefined), lvl: TIMER_LVL[head] ?? 1 };
  }
  const body = head.slice(4);
  const i = body.indexOf(':');
  const first = i < 0 ? body : body.slice(0, i);
  const t = WTYPES.find((x) => x.id === first);
  // Older entries from the assistant: own:<any text>, no minutes.
  if (!t) return { raw, type: 'other', name: body || _t("Тренировка"), ic: '✨', min, lvl, ai: by === 'ai' || (!m && !l) };
  const name = i < 0 ? '' : body.slice(i + 1);
  // «Бег» + «5 км» reads «Бег, 5 км»; a name that already says the type stays as it is.
  const full = !name || t.id === 'other' ? name || t.n : name.toLowerCase().startsWith(t.n.toLowerCase()) ? name : `${t.n}, ${name}`;
  return { raw, type: t.id, name: full, ic: t.ic, min, lvl, ai: by === 'ai' };
}

export const wEntries = (h: HealthState, day: string) => (h.workouts[day] ?? []).map(parseW);

/** kcal one entry burns, scaled by body weight. Older entries without minutes count as 250, as before. */
export function entryKcal(e: WEntry, kg = 70) {
  if (!e.min) return 250;
  const rate = e.timer ? [3.5, 5, 6][(e.lvl ?? 1) - 1] : (WTYPES.find((x) => x.id === e.type)?.k ?? WTYPES[7].k)[(e.lvl ?? 2) - 1];
  return rate * e.min * (kg > 25 && kg < 300 ? kg / 70 : 1);
}
/** Extra kcal for the «Спорт» food mode on a day: by type, minutes and how hard, at most 800. */
export const workoutKcal = (h: HealthState, day: string, kg?: number) => Math.min(800, Math.round(wEntries(h, day).reduce((a, e) => a + entryKcal(e, kg), 0)));
export const round50 = (k: number) => Math.max(50, Math.round(k / 50) * 50);

export const wGoal = (h: HealthState) => Math.min(5, Math.max(2, h.wgoal ?? 3));
export const wSound = (h: HealthState) => h.wsound ?? 'voice';
export const wVoice = (h: HealthState) => h.wvoice ?? LANG;

/** Monday of the week of a day. */
export const weekStart = (day: string) => addDays(day, -((fromKey(day).getDay() + 6) % 7));
export const weekDays = (day: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
const had = (h: HealthState, d: string) => (h.workouts[d]?.length ?? 0) > 0;
/** Days with a workout in the week of `day`. */
export const weekCount = (h: HealthState, day: string) => weekDays(day).filter((d) => had(h, d)).length;
export const dayMin = (h: HealthState, d: string) => wEntries(h, d).reduce((a, e) => a + (e.min ?? 30), 0);
export const weekMin = (h: HealthState, day: string) => weekDays(day).reduce((a, d) => a + dayMin(h, d), 0);
export const monthCount = (h: HealthState, day: string) => Object.keys(h.workouts).filter((d) => d.startsWith(day.slice(0, 7)) && had(h, d)).length;

/** Weeks in a row with the weekly goal met. The current week counts once it is met and never breaks the streak while it is still going. */
export function wStreak(h: HealthState, today: string) {
  const goal = wGoal(h);
  let n = weekCount(h, today) >= goal ? 1 : 0;
  for (let k = addDays(weekStart(today), -7); n < 520; k = addDays(k, -7)) {
    if (weekCount(h, k) >= goal) n++; else break;
  }
  return n;
}

/**
 * Reminder after a chosen prayer on a day without a workout, only while the week is behind its goal:
 * by day d (Monday = 0) at least floor(goal × (d+1) / 7) workout days should be done.
 */
export function workoutRemindDays(h: HealthState, today: string): string[] {
  if (!h.wrem || h.wrem === 'none') return [];
  const goal = wGoal(h);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (had(h, d)) continue;
    const days = weekDays(d);
    const idx = days.indexOf(d);
    const done = days.slice(0, idx).filter((x) => had(h, x)).length;
    if (done >= goal) continue;
    if (done < Math.floor((goal * (idx + 1)) / 7)) out.push(d);
  }
  return out;
}

/** Workout reminders for the push server: 20 minutes after the chosen prayer, on the days from workoutRemindDays. */
export function workoutRings(s: AppState, today: string, timesOf: (day: string) => Record<string, Date>, now = Date.now()): { k: string; at: number; t: string; w: 1 }[] {
  const h = health(s);
  const a = h.wrem;
  if (!a || a === 'none') return [];
  const goal = wGoal(h);
  return workoutRemindDays(h, today).map((d) => {
    const at = timesOf(d)[a].getTime() + 20 * 60000;
    const done = weekDays(d).filter((x) => x < d && (h.workouts[x]?.length ?? 0) > 0).length;
    return { k: `wk${d.replace(/-/g, '').slice(2)}`, at, t: _t("На этой неделе {0} из {1}. Короткая тренировка сейчас?", done, goal), w: 1 as const };
  }).filter((x) => x.at > now - 15 * 60000);
}
