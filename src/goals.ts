import type { AppState, Goal, GoalSource } from './types';
import { addDays, daysBetween } from './dates';
import { consistency } from './store';
import { health } from './health';
import { prepPct } from './components/Umrah';

export const GOAL_LIMIT = 3;

const AYAHS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const CUM = AYAHS.reduce<number[]>((a, n, i) => { a.push((a[i - 1] ?? 0) + (i ? AYAHS[i - 1] : 0)); return a; }, []);
export const TOTAL_AYAHS = 6236;
export const ayahIndex = (surah: number, ayah: number) => (CUM[surah - 1] ?? 0) + ayah;
const JUZ: [number, number][] = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
/** Juz fully read when the bookmark stands at `idx`. */
export const juzDone = (idx: number) => JUZ.filter(([s, a], i) => i > 0 && ayahIndex(s, a) <= idx + 1).length;

export interface SourceDef { id: GoalSource; label: string; hint: string; unit: string; target: number; counter: boolean; identity?: boolean }
export const SOURCES: SourceDef[] = [
  { id: 'quran', label: 'Коран: хатм по закладке', hint: 'из раздела Коран', unit: 'аятов', target: TOTAL_AYAHS, counter: false },
  { id: 'pages', label: 'Страницы моих книг', hint: 'из раздела Книги', unit: 'стр.', target: 300, counter: true },
  { id: 'chapters', label: 'Главы пересказов', hint: 'из раздела Книги', unit: 'глав', target: 20, counter: true },
  { id: 'course', label: 'Курс «Английский по дням»', hint: 'пройденные дни', unit: 'дней', target: 30, counter: false },
  { id: 'prayers', label: 'Намазы вовремя', hint: 'доля за 30 дней', unit: '%', target: 100, counter: false, identity: true },
  { id: 'fasts', label: 'Посты сунны', hint: 'из раздела Здоровье', unit: 'постов', target: 12, counter: true },
  { id: 'workouts', label: 'Тренировки', hint: 'из раздела Здоровье', unit: 'тренировок', target: 20, counter: true },
  { id: 'umrah', label: 'Подготовка к умре', hint: 'из раздела Умра', unit: '%', target: 100, counter: false },
  { id: 'habits', label: 'Образ себя по привычкам', hint: 'доля дней за 30 дней', unit: '%', target: 100, counter: false, identity: true },
  { id: 'manual', label: 'Своё число', hint: 'ввожу сам: деньги, вес, шаги', unit: '', target: 100, counter: false },
];
export const sourceDef = (id: GoalSource) => SOURCES.find((s) => s.id === id)!;

/** Raw value of a source right now. */
export function rawValue(s: AppState, g: Pick<Goal, 'source' | 'habitIds' | 'manual'>, today: string): number {
  switch (g.source) {
    case 'quran': return s.quran ? ayahIndex(s.quran.surah, s.quran.ayah) : 0;
    case 'pages': return (s.books ?? []).reduce((a, b) => a + Math.max(0, b.page - 1), 0);
    case 'chapters': return (s.summaryRead ?? []).length;
    case 'course': return s.course?.done.length ?? 0;
    case 'prayers': {
      let total = 0, on = 0;
      for (let i = 1; i <= 30; i++) {
        const d = addDays(today, -i);
        const day = s.prayers[d];
        if (!day || !Object.keys(day).length) continue;
        total += 5; on += Object.values(day).filter((m) => m === 'ontime').length;
      }
      const t = s.prayers[today] ?? {};
      total += Object.keys(t).length; on += Object.values(t).filter((m) => m === 'ontime').length;
      return total ? Math.round((on / total) * 100) : 0;
    }
    case 'fasts': return Object.keys(health(s).fasts).length;
    case 'workouts': return Object.values(health(s).workouts).reduce((a, l) => a + l.length, 0);
    case 'umrah': return prepPct(s);
    case 'habits': {
      const hs = s.habits.filter((h) => g.habitIds.includes(h.id));
      if (!hs.length) return 0;
      return Math.round((hs.reduce((a, h) => a + consistency(s, h, today, 30).rate, 0) / hs.length) * 100);
    }
    case 'manual': return g.manual;
  }
}

export function progress(s: AppState, g: Goal, today: string) {
  const def = sourceDef(g.source);
  const raw = rawValue(s, g, today);
  const value = def.counter ? raw - g.start : raw;
  const target = g.target;
  const exact = Math.max(0, Math.min(100, (value / Math.max(1, target)) * 100));
  const pct = Math.round(exact);
  let behind = 0;
  if (g.due && !def.identity && exact < 100) {
    const total = Math.max(1, daysBetween(g.createdAt, g.due));
    const passed = Math.max(0, Math.min(total, daysBetween(g.createdAt, today)));
    const startPct = def.counter ? 0 : Math.min(99, (g.start / Math.max(1, target)) * 100);
    const expected = startPct + ((100 - startPct) * passed) / total;
    if (exact < expected) behind = Math.floor(((expected - exact) / (100 - startPct)) * total);
  }
  return { value, target, pct, behind, raw };
}

export function progressLabel(s: AppState, g: Goal, today: string) {
  const p = progress(s, g, today);
  if (g.source === 'quran') {
    const q = s.quran;
    return q ? `сура ${q.surah}, аят ${q.ayah} · ${juzDone(p.raw)} из 30 джузов` : 'открой Коран, чтобы начать';
  }
  const def = sourceDef(g.source);
  if (def.unit === '%') return `${p.value}% из ${g.target}%`;
  return `${p.value} из ${g.target}${g.unit ? ' ' + g.unit : ''}`;
}

export const daysLeft = (g: Goal, today: string) => (g.due ? daysBetween(today, g.due) : null);

/** Value snapshots for the weekly review: one per day, written when the app is open. */
export function snapshot(s: AppState, today: string): AppState {
  const goals = s.goals ?? [];
  let changed = false;
  const next = goals.map((g) => {
    if (g.status !== 'active') return g;
    const v = progress(s, g, today).value;
    if (g.snaps?.[today] === v) return g;
    changed = true;
    const snaps = { ...(g.snaps ?? {}), [today]: v };
    // keep the last 60 days
    for (const k of Object.keys(snaps)) if (daysBetween(k, today) > 60) delete snaps[k];
    return { ...g, snaps };
  });
  return changed ? { ...s, goals: next } : s;
}

/** Progress made over the last 7 days. */
export function weekDelta(s: AppState, g: Goal, today: string) {
  const now = progress(s, g, today).value;
  const keys = Object.keys(g.snaps ?? {}).filter((k) => k <= addDays(today, -7)).sort();
  const base = keys.length ? g.snaps![keys[keys.length - 1]] : (Object.values(g.snaps ?? {})[0] ?? now);
  return now - base;
}

export interface Template { title: string; source: GoalSource; target?: number; unit?: string; identity: string; habits: { action: string; min: string; anchor: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; sphere: 'faith' | 'body' | 'food' | 'mind' | 'biz' | 'family' }[] }
export const TEMPLATES: Template[] = [
  { title: 'Хатм Корана', source: 'quran', identity: 'Я тот, кто читает Коран каждый день', habits: [{ action: 'Читать Коран 5 страниц', min: '1 страница', anchor: 'fajr', sphere: 'faith' }, { action: 'Слушать Коран в дороге', min: '10 минут', anchor: 'dhuhr', sphere: 'faith' }] },
  { title: 'Все намазы вовремя', source: 'prayers', identity: 'Я тот, кто встречает намаз, а не догоняет', habits: [{ action: 'Вуду сразу после азана', min: 'встать после азана', anchor: 'asr', sphere: 'faith' }, { action: 'Лечь спать до 23:00', min: 'телефон убран в 22:30', anchor: 'isha', sphere: 'body' }] },
  { title: 'Английский A1 за 30 дней', source: 'course', identity: 'Я тот, кто говорит по-английски без страха', habits: [{ action: 'Урок английского', min: '5 фраз вслух', anchor: 'asr', sphere: 'mind' }] },
  { title: 'Прочитать книгу', source: 'pages', target: 300, identity: 'Я тот, кто читает каждый день', habits: [{ action: 'Чтение, 10 страниц', min: '2 страницы', anchor: 'asr', sphere: 'mind' }] },
  { title: 'Посты сунны', source: 'fasts', target: 8, identity: 'Я тот, кто держит пост по понедельникам и четвергам', habits: [] },
  { title: 'Сильное тело', source: 'workouts', target: 20, identity: 'Я тот, кто заботится о теле как об аманате', habits: [{ action: 'Зарядка после Фаджра', min: '10 отжиманий', anchor: 'fajr', sphere: 'body' }] },
  { title: 'Готов к умре', source: 'umrah', identity: 'Я тот, кто едет к Каабе подготовленным', habits: [] },
  { title: 'Накопить на умру', source: 'manual', target: 2000, unit: '€', identity: 'Я тот, кто откладывает ради важного', habits: [{ action: 'Отложить в копилку', min: 'хоть 1 €', anchor: 'maghrib', sphere: 'biz' }] },
  { title: 'Своя цель', source: 'habits', identity: '', habits: [] },
];
