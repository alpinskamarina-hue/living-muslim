import type { AppState, HealthState } from './types';

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
    if (h.month === 12 && h.day === 9) return 'День Арафа';
    if (h.month === 1 && (h.day === 9 || h.day === 10)) return h.day === 10 ? 'Ашура' : 'Тасуа (перед Ашурой)';
    if (h.day >= 13 && h.day <= 15) return 'Белые дни';
  }
  const w = d.getDay();
  if (w === 1) return 'Понедельник';
  if (w === 4) return 'Четверг';
  return null;
}

export interface Exercise { n: string; hint: string; sec: number }
export interface Workout { id: string; title: string; sub: string; rest: number; rounds: number; ex: Exercise[] }

export const WORKOUTS: Workout[] = [
  {
    id: 'morning', title: 'Зарядка после Фаджра', sub: 'Разбудить тело', rest: 15, rounds: 1,
    ex: [
      { n: 'Вращения плечами и руками', hint: 'По 10 раз вперёд и назад, дыши ровно', sec: 40 },
      { n: 'Наклоны и повороты корпуса', hint: 'Медленно, без рывков', sec: 40 },
      { n: 'Приседания', hint: 'Спина прямая, колени смотрят туда же, куда носки', sec: 40 },
      { n: 'Отжимания', hint: 'От пола или от стены, если тяжело', sec: 40 },
      { n: 'Планка', hint: 'Тело одной линией, живот подтянут', sec: 30 },
      { n: 'Растяжка задней поверхности', hint: 'Наклон к ногам, колени слегка согнуты', sec: 40 },
    ],
  },
  {
    id: 'back', title: 'Спина и шея', sub: 'Для тех, кто много сидит', rest: 10, rounds: 1,
    ex: [
      { n: 'Повороты и наклоны головы', hint: 'Плавно, без боли', sec: 45 },
      { n: 'Кошка-корова', hint: 'На четвереньках: прогнись вниз, затем округли спину', sec: 60 },
      { n: 'Поза ребёнка', hint: 'Сядь на пятки, руки вперёд, расслабь поясницу', sec: 60 },
      { n: 'Скручивания лёжа', hint: 'Колени в сторону, плечи на полу, по 30 сек на сторону', sec: 60 },
      { n: 'Ягодичный мост', hint: 'Поднимай таз, сжимая ягодицы, 15 раз', sec: 45 },
      { n: 'Растяжка груди у стены', hint: 'Рука на стене, разворачивай корпус от неё', sec: 60 },
      { n: 'Супермен', hint: 'Лёжа на животе, подними руки и ноги, держи 3 сек', sec: 45 },
    ],
  },
  {
    id: 'strength', title: 'Сила без инвентаря', sub: 'Всё тело', rest: 15, rounds: 2,
    ex: [
      { n: 'Приседания', hint: 'В своём темпе, до параллели с полом', sec: 40 },
      { n: 'Отжимания', hint: 'Можно с колен', sec: 40 },
      { n: 'Выпады', hint: 'Поочерёдно на каждую ногу', sec: 40 },
      { n: 'Планка', hint: 'Не проваливай поясницу', sec: 40 },
      { n: 'Ягодичный мост', hint: 'Задержка наверху на 1 сек', sec: 40 },
      { n: 'Скалолаз', hint: 'В упоре лёжа поочерёдно подтягивай колени к груди', sec: 30 },
    ],
  },
];
