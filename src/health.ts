import type { AppState, HealthState } from './types';
import { _t } from './i18n';

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
