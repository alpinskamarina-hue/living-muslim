import type { AppState, Goal, GoalSource } from './types';
import { addDays, daysBetween } from './dates';
import { consistency } from './store';
import { health } from './health';
import { prepPct } from './components/Umrah';
import { isCounted } from './store';
import { catalog } from './videos';

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
  { id: 'video', label: 'Видеокурс', hint: 'просмотренные уроки', unit: 'уроков', target: 20, counter: false },
  { id: 'hifz', label: 'Выучить суру', hint: 'отмечаю выученные аяты', unit: 'аятов', target: 30, counter: false },
];

/** Surahs people most often learn by heart. */
export const HIFZ: { n: number; ru: string }[] = [
  { n: 67, ru: 'аль-Мульк' }, { n: 36, ru: 'Йа Син' }, { n: 18, ru: 'аль-Кахф' }, { n: 55, ru: 'ар-Рахман' },
  { n: 56, ru: 'аль-Вакиа' }, { n: 78, ru: 'ан-Наба' }, { n: 32, ru: 'ас-Саджда' }, { n: 87, ru: 'аль-Аля' }, { n: 2, ru: 'аль-Бакара, последние 2 аята' },
];
export const surahAyahs = (n: number) => AYAHS[n - 1] ?? 0;
export const hifzName = (ref?: string) => HIFZ.find((h) => String(h.n) === ref)?.ru ?? (ref ? `сура ${ref}` : 'сура');
export const sourceDef = (id: GoalSource) => SOURCES.find((s) => s.id === id)!;

/** Raw value of a source right now. */
export function rawValue(s: AppState, g: Pick<Goal, 'source' | 'habitIds' | 'manual'> & { ref?: string }, today: string): number {
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
    case 'manual': case 'hifz': return g.manual;
    case 'video': return (s.videos?.byCourse?.[(g as Goal).ref ?? ''] ?? []).length;
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
  if (g.source === 'video') return `урок ${p.value} из ${g.target}`;
  if (g.source === 'hifz') return `${p.value} из ${g.target} аятов · ${hifzName(g.ref)}`;
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

export interface Template { group: TplGroup; ic: string; ar?: boolean; sub: string; title: string; source: GoalSource; target?: number; unit?: string; identity: string; habits: { action: string; min: string; anchor: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; sphere: 'faith' | 'body' | 'food' | 'mind' | 'biz' | 'family' }[] }
export const TEMPLATES: Template[] = [
  { group: 'faith', ic: 'قرآن', ar: true, sub: 'считается по закладке в Коране', title: 'Хатм Корана', source: 'quran', identity: 'Я тот, кто читает Коран каждый день', habits: [{ action: 'Читать Коран 2 страницы', min: '1 аят', anchor: 'fajr', sphere: 'faith' }, { action: 'Слушать Коран в дороге', min: '10 минут', anchor: 'dhuhr', sphere: 'faith' }] },
  { group: 'faith', ic: '🕌', sub: 'доля намазов вовремя за 30 дней', title: 'Все намазы вовремя', source: 'prayers', identity: 'Я тот, кто встречает намаз, а не догоняет', habits: [{ action: 'Вуду сразу после азана', min: 'встать после азана', anchor: 'asr', sphere: 'faith' }, { action: 'Лечь спать до 23:00', min: 'телефон убран в 22:30', anchor: 'isha', sphere: 'body' }] },
  { group: 'faith', ic: 'حفظ', ar: true, sub: 'аль-Мульк, Йа Син, аль-Кахф…', title: 'Выучить суру', source: 'hifz', identity: 'Я тот, кто носит Коран в сердце', habits: [{ action: 'Повторить выученные аяты', min: '1 аят', anchor: 'fajr', sphere: 'faith' }] },
  { group: 'faith', ic: '🌙', sub: 'понедельник и четверг', title: 'Посты сунны', source: 'fasts', target: 8, identity: 'Я тот, кто держит пост по понедельникам и четвергам', habits: [] },
  { group: 'faith', ic: '🕋', sub: 'по списку подготовки', title: 'Готов к умре', source: 'umrah', identity: 'Я тот, кто едет к Каабе подготовленным', habits: [] },
  { group: 'mind', ic: '▶', sub: 'Сира, сподвижники, бизнес · по просмотрам', title: 'Пройти видеокурс', source: 'video', identity: 'Я тот, кто учится каждый день', habits: [{ action: 'Один урок', min: '5 минут видео', anchor: 'isha', sphere: 'mind' }] },
  { group: 'mind', ic: '📖', sub: 'страницы из раздела Книги', title: 'Прочитать книгу', source: 'pages', target: 300, identity: 'Я тот, кто читает каждый день', habits: [{ action: 'Чтение, 10 страниц', min: '2 страницы', anchor: 'asr', sphere: 'mind' }] },
  { group: 'mind', ic: 'Aa', sub: '30 уроков по дням', title: 'Английский A1 за 30 дней', source: 'course', identity: 'Я тот, кто говорит по-английски без страха', habits: [{ action: 'Урок английского', min: '5 фраз вслух', anchor: 'asr', sphere: 'mind' }] },
  { group: 'body', ic: '💪', sub: 'из раздела Здоровье', title: 'Сильное тело', source: 'workouts', target: 20, identity: 'Я тот, кто заботится о теле как об аманате', habits: [{ action: 'Зарядка после Фаджра', min: '10 отжиманий', anchor: 'fajr', sphere: 'body' }] },
  { group: 'body', ic: '⚖️', sub: 'своё число: кг', title: 'Сбросить вес', source: 'manual', target: 5, unit: 'кг', identity: 'Я тот, кто ест треть и двигается каждый день', habits: [{ action: 'Ужин без добавки', min: 'полтарелки', anchor: 'maghrib', sphere: 'food' }] },
  { group: 'life', ic: '💰', sub: 'своё число: €', title: 'Накопить на умру', source: 'manual', target: 2000, unit: '€', identity: 'Я тот, кто откладывает ради важного', habits: [{ action: 'Отложить в копилку', min: 'хоть 1 €', anchor: 'maghrib', sphere: 'biz' }] },
  { group: 'life', ic: '🏡', sub: 'по привычкам', title: 'Время с семьёй', source: 'habits', identity: 'Я тот, кто рядом со своими', habits: [{ action: 'Ужин без телефона', min: '15 минут', anchor: 'maghrib', sphere: 'family' }] },
];

/** Ready-made Ramadan goals, shown in the month before. */
export const RAMADAN_TPL: Template[] = [
  { group: 'faith', ic: 'قرآن', ar: true, sub: 'к первому дню Рамадана', title: 'Хатм к Рамадану', source: 'quran', identity: 'Я тот, кто входит в Рамадан с Кораном', habits: [{ action: 'Читать Коран 2 страницы', min: '1 аят', anchor: 'fajr', sphere: 'faith' }] },
  { group: 'faith', ic: '🌙', sub: 'посты сунны до Рамадана', title: 'Привыкнуть к посту', source: 'fasts', target: 6, identity: 'Я тот, кто готов к посту', habits: [] },
  { group: 'life', ic: 'صدقة', ar: true, sub: 'каждый день понемногу', title: 'Садака каждый день', source: 'habits', identity: 'Я тот, кто даёт каждый день', habits: [{ action: 'Садака, хоть немного', min: 'улыбка или 1 €', anchor: 'dhuhr', sphere: 'faith' }] },
];

const PAGE_AYAHS = TOTAL_AYAHS / 604;
const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

export type StepAction = 'quran' | 'books' | 'course' | 'videos' | 'health' | 'umrah' | 'today' | 'add';
export interface Step { text: string; sub: string; btn: string; action: StepAction; ref?: string }

/** What to do today for this goal, and where the button leads. */
export function todayStep(s: AppState, g: Goal, today: string): Step {
  const p = progress(s, g, today);
  const left = g.due ? Math.max(1, daysBetween(today, g.due)) : 0;
  const rest = Math.max(0, g.target - p.value);
  const perDay = left ? rest / left : 0;
  switch (g.source) {
    case 'quran': {
      const pages = Math.max(1, Math.ceil((left ? (TOTAL_AYAHS - p.raw) / left : PAGE_AYAHS) / PAGE_AYAHS));
      const q = s.quran;
      return { text: `${pages} ${pl(pages, 'страница', 'страницы', 'страниц')}`, sub: `≈ ${pages * 5} минут${q ? ` · сура ${q.surah}, аят ${q.ayah}` : ' · с суры аль-Фатиха'}`, btn: '▶ Читать', action: 'quran' };
    }
    case 'pages': { const n = Math.max(1, Math.ceil(perDay || 10)); return { text: `${n} ${pl(n, 'страница', 'страницы', 'страниц')}`, sub: `осталось ${rest} стр.`, btn: '▶ Читать', action: 'books' }; }
    case 'chapters': return { text: '1 глава пересказа', sub: `${p.value} из ${g.target} глав`, btn: '▶ Читать', action: 'books' };
    case 'course': return { text: `Урок ${Math.min(30, p.value + 1)} английского`, sub: '15 минут · фразы, диалог, карточки', btn: '▶ Начать', action: 'course' };
    case 'video': {
      const it = catalog().find((x) => x.id === g.ref) ?? s.videos?.mine.find((x) => x.id === g.ref);
      return { text: `Урок ${Math.min(g.target, p.value + 1)} из ${g.target}`, sub: it?.title ?? 'видеокурс', btn: '▶ Смотреть', action: 'videos', ref: g.ref };
    }
    case 'prayers': {
      const d = s.prayers[today] ?? {};
      const on = Object.values(d).filter((m) => m === 'ontime').length;
      return { text: `Сегодня вовремя ${on} из 5`, sub: 'отмечай намаз сразу после него', btn: 'Отметить', action: 'today' };
    }
    case 'habits': {
      const hs = s.habits.filter((h) => g.habitIds.includes(h.id) && h.status === 'active');
      const done = hs.filter((h) => isCounted(s.log[today]?.[h.id])).length;
      return { text: hs.length ? `Привычки сегодня: ${done} из ${hs.length}` : 'Привяжи привычку к цели', sub: hs.map((h) => h.action).slice(0, 2).join(' · '), btn: 'Отметить', action: 'today' };
    }
    case 'fasts': {
      const wd = new Date(today + 'T12:00:00').getDay();
      const next = wd === 1 || wd === 4 ? 'Сегодня день поста' : `Ближайший пост: ${wd < 4 && wd > 1 ? 'в четверг' : 'в понедельник'}`;
      return { text: next, sub: `${p.value} из ${g.target} постов${DAYS[wd] ? '' : ''}`, btn: 'Отметить', action: 'health' };
    }
    case 'workouts': return { text: 'Тренировка 10–20 минут', sub: `${p.value} из ${g.target} тренировок`, btn: '▶ Начать', action: 'health' };
    case 'umrah': return { text: `Подготовка: ${p.value}%`, sub: 'следующий пункт из списка умры', btn: 'Открыть', action: 'umrah' };
    case 'hifz': {
      const n = Math.max(1, Math.ceil(perDay || 1));
      return { text: `Выучить ${n} ${pl(n, 'аят', 'аята', 'аятов')}`, sub: `${hifzName(g.ref)} · ${p.value} из ${g.target}`, btn: '+1 аят', action: 'add' };
    }
    case 'manual': {
      const u = g.unit || '';
      return p.behind && perDay
        ? { text: `Отстаю на ${p.behind} дн.`, sub: `чтобы успеть: ~${fmtN(perDay)} ${u} в день`, btn: '+ Добавить', action: 'add' }
        : { text: perDay ? `~${fmtN(perDay)} ${u} в день` : 'Добавь, сколько сделал', sub: `${p.value} из ${g.target} ${u}`, btn: '+ Добавить', action: 'add' };
    }
  }
}
const fmtN = (n: number) => (n >= 10 ? String(Math.ceil(n)) : n.toFixed(1).replace('.', ',').replace(',0', ''));
const pl = (n: number, a: string, b: string, c: string) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

/** Four milestones in the goal's own units. */
export function milestones(s: AppState, g: Goal, today: string) {
  const p = progress(s, g, today);
  const fr = g.source === 'quran' ? [1 / 3, 0.5, 2 / 3, 1] : [0.25, 0.5, 0.75, 1];
  return fr.map((f) => {
    const when = g.due ? addDays(g.createdAt, Math.round(daysBetween(g.createdAt, g.due) * f)) : null;
    let label: string, ok: boolean;
    if (g.source === 'quran') { const j = Math.round(30 * f); label = f === 1 ? 'Хатм' : `${j} джузов`; ok = juzDone(p.raw) >= j; }
    else {
      const v = Math.round(g.target * f);
      ok = p.value >= v;
      label = f === 1 ? 'Цель' : g.source === 'video' ? `урок ${v}` : g.source === 'hifz' ? `${v} аятов` : `${v}${g.unit ? ' ' + g.unit : ''}`;
    }
    return { label, when, ok };
  });
}

/** Last 30 days for «who I am» goals: 2 = fully, 1 = partly, 0 = no. */
export function dayDots(s: AppState, g: Goal, today: string): number[] {
  const out: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    if (g.source === 'prayers') {
      const n = Object.values(s.prayers[d] ?? {}).filter((m) => m === 'ontime').length;
      out.push(n >= 5 ? 2 : n > 0 ? 1 : 0);
    } else {
      const hs = s.habits.filter((h) => g.habitIds.includes(h.id));
      const n = hs.filter((h) => isCounted(s.log[d]?.[h.id])).length;
      out.push(hs.length && n === hs.length ? 2 : n > 0 ? 1 : 0);
    }
  }
  return out;
}

export type TplGroup = 'faith' | 'mind' | 'body' | 'life';
export const TPL_GROUPS: { id: TplGroup; ru: string }[] = [
  { id: 'faith', ru: 'Поклонение' }, { id: 'mind', ru: 'Знания' }, { id: 'body', ru: 'Тело' }, { id: 'life', ru: 'Деньги и семья' },
];
