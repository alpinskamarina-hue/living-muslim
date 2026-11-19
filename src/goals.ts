import type { AppState, Goal, GoalSource } from './types';
import { addDays, daysBetween } from './dates';
import { consistency } from './store';
import { health } from './health';
import { prepPct } from './components/Umrah';
import { isCounted } from './store';
import { catalog } from './videos';

import { limitOf } from './plan';
import { _t, isEn } from './i18n';
export const goalLimit = () => limitOf('goals');

const AYAHS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const CUM = AYAHS.reduce<number[]>((a, n, i) => { a.push((a[i - 1] ?? 0) + (i ? AYAHS[i - 1] : 0)); return a; }, []);
export const TOTAL_AYAHS = 6236;
export const ayahIndex = (surah: number, ayah: number) => (CUM[surah - 1] ?? 0) + ayah;
const JUZ: [number, number][] = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
/** Juz fully read when the bookmark stands at `idx`. */
export const juzDone = (idx: number) => JUZ.filter(([s, a], i) => i > 0 && ayahIndex(s, a) <= idx + 1).length;

export interface SourceDef { id: GoalSource; label: string; hint: string; unit: string; target: number; counter: boolean; identity?: boolean }
export const SOURCES: SourceDef[] = [
  { id: 'quran', label: _t("Коран: хатм по закладке"), hint: _t("из раздела Коран"), unit: _t("аятов"), target: TOTAL_AYAHS, counter: false },
  { id: 'pages', label: _t("Страницы моих книг"), hint: _t("из раздела Книги"), unit: _t("стр."), target: 300, counter: true },
  { id: 'bookch', label: _t("Главы книги"), hint: _t("отмечаю прочитанные главы сам"), unit: _t("глав"), target: 12, counter: false },
  { id: 'chapters', label: _t("Главы пересказов"), hint: _t("из раздела Книги"), unit: _t("глав"), target: 20, counter: true },
  { id: 'course', label: _t("Курс «Английский по дням»"), hint: _t("пройденные дни"), unit: _t("дней"), target: 30, counter: false },
  { id: 'prayers', label: _t("Намазы вовремя"), hint: _t("доля за 30 дней"), unit: '%', target: 100, counter: false, identity: true },
  { id: 'fasts', label: _t("Посты сунны"), hint: _t("из раздела Здоровье"), unit: _t("постов"), target: 12, counter: true },
  { id: 'workouts', label: _t("Тренировки"), hint: _t("из раздела Здоровье"), unit: _t("тренировок"), target: 20, counter: true },
  { id: 'umrah', label: _t("Подготовка к умре"), hint: _t("из раздела Умра"), unit: '%', target: 100, counter: false },
  { id: 'habits', label: _t("Образ себя по привычкам"), hint: _t("доля дней за 30 дней"), unit: '%', target: 100, counter: false, identity: true },
  { id: 'manual', label: _t("Своё число"), hint: _t("ввожу сам: деньги, вес, шаги"), unit: '', target: 100, counter: false },
  { id: 'video', label: _t("Видеокурс"), hint: _t("просмотренные уроки"), unit: _t("уроков"), target: 20, counter: false },
  { id: 'steps', label: _t("Мечта или жизненная цель"), hint: _t("переезд, поездка, свадьба: шаги отмечаю сам"), unit: _t("шагов"), target: 1, counter: false },
  { id: 'hifz', label: _t("Выучить суры"), hint: _t("выбираю суры, отмечаю выученные аяты"), unit: _t("аятов"), target: 30, counter: false },
];

/** Surahs people most often learn by heart. */
export const HIFZ: { n: number; ru: string }[] = [
  { n: 67, ru: _t("аль-Мульк") }, { n: 36, ru: _t("Йа Син") }, { n: 18, ru: _t("аль-Кахф") }, { n: 55, ru: _t("ар-Рахман") },
  { n: 56, ru: _t("аль-Вакиа") }, { n: 78, ru: _t("ан-Наба") }, { n: 32, ru: _t("ас-Саджда") }, { n: 87, ru: _t("аль-Аля") }, { n: 2, ru: _t("аль-Бакара, последние 2 аята") },
];
export const surahAyahs = (n: number) => AYAHS[n - 1] ?? 0;
/** Surah names as in the Quran list (transliterated). */
export const SURAH_NAMES: string[] = ["Al-Fatihah", "Al-Baqarah", "Ali 'Imran", "An-Nisa", "Al-Ma'idah", "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra", "Al-Kahf", "Maryam", "Taha", "Al-Anbya", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara", "An-Naml", "Al-Qasas", "Al-'Ankabut", "Ar-Rum", "Luqman", "As-Sajdah", "Al-Ahzab", "Saba", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shuraa", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saf", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba", "An-Nazi'at", "'Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-'Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-'Adiyat", "Al-Qari'ah", "At-Takathur", "Al-'Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"];
const SURAH_RU: string[] = ["аль-Фатиха", "аль-Бакара", "Аль Имран", "ан-Ниса", "аль-Маида", "аль-Анам", "аль-Араф", "аль-Анфаль", "ат-Тауба", "Юнус", "Худ", "Юсуф", "ар-Раад", "Ибрахим", "аль-Хиджр", "ан-Нахль", "аль-Исра", "аль-Кахф", "Марьям", "Та Ха", "аль-Анбия", "аль-Хадж", "аль-Муминун", "ан-Нур", "аль-Фуркан", "аш-Шуара", "ан-Намль", "аль-Касас", "аль-Анкабут", "ар-Рум", "Лукман", "ас-Саджда", "аль-Ахзаб", "Саба", "Фатыр", "Йа Син", "ас-Саффат", "Сад", "аз-Зумар", "Гафир", "Фуссылят", "аш-Шура", "аз-Зухруф", "ад-Духан", "аль-Джасия", "аль-Ахкаф", "Мухаммад", "аль-Фатх", "аль-Худжурат", "Каф", "аз-Зарият", "ат-Тур", "ан-Наджм", "аль-Камар", "ар-Рахман", "аль-Вакиа", "аль-Хадид", "аль-Муджадила", "аль-Хашр", "аль-Мумтахана", "ас-Сафф", "аль-Джумуа", "аль-Мунафикун", "ат-Тагабун", "ат-Талак", "ат-Тахрим", "аль-Мульк", "аль-Калям", "аль-Хакка", "аль-Мааридж", "Нух", "аль-Джинн", "аль-Муззаммиль", "аль-Муддассир", "аль-Кияма", "аль-Инсан", "аль-Мурсалят", "ан-Наба", "ан-Назиат", "Абаса", "ат-Таквир", "аль-Инфитар", "аль-Мутаффифин", "аль-Иншикак", "аль-Бурудж", "ат-Тарик", "аль-Аля", "аль-Гашия", "аль-Фаджр", "аль-Баляд", "аш-Шамс", "аль-Лейль", "ад-Духа", "аш-Шарх", "ат-Тин", "аль-Алак", "аль-Кадр", "аль-Баййина", "аз-Зальзаля", "аль-Адийат", "аль-Кариа", "ат-Такасур", "аль-Аср", "аль-Хумаза", "аль-Филь", "Курайш", "аль-Маун", "аль-Каусар", "аль-Кафирун", "ан-Наср", "аль-Масад", "аль-Ихлас", "аль-Фалак", "ан-Нас"];
/** One surah: the popular name in the user's language, else the transliterated one. 2 means the last two ayahs of al-Baqarah. */
export const surahName = (n: number) => HIFZ.find((h) => h.n === n)?.ru ?? (isEn ? SURAH_NAMES : SURAH_RU)[n - 1] ?? _t("сура {0}", n);
/** hifz goals keep their surahs in ref as «67» or «112,113,114». */
export const hifzRefs = (ref?: string) => [...new Set((ref ?? '').split(',').map(Number).filter((n) => n >= 1 && n <= 114))];
export const hifzAyahs = (n: number) => (n === 2 ? 2 : surahAyahs(n));
export const hifzTotal = (refs: number[]) => refs.reduce((a, n) => a + hifzAyahs(n), 0);
export function hifzName(ref?: string) {
  const r = hifzRefs(ref);
  if (!r.length) return _t("сура");
  if (r.length <= 3) return r.map(surahName).join(', ');
  return _t("{0} и ещё {1}", r.slice(0, 2).map(surahName).join(', '), r.length - 2);
}
/** Learned ayahs per surah. Old one-surah goals kept only the total. */
export function hifzMap(g: Pick<Goal, 'ref' | 'manual' | 'hifz'>): Record<string, number> {
  if (g.hifz) return g.hifz;
  const r = hifzRefs(g.ref);
  return r.length === 1 ? { [r[0]]: g.manual } : {};
}
/** +d ayahs to surah n (or to the first unfinished one). */
export function hifzStep(g: Goal, d: number, n?: number): Partial<Goal> {
  const refs = hifzRefs(g.ref);
  const m = { ...hifzMap(g) };
  const at = n ?? refs.find((x) => (m[x] ?? 0) < hifzAyahs(x)) ?? refs[refs.length - 1];
  if (!at) return { manual: Math.max(0, Math.min(g.target, g.manual + d)) };
  m[at] = Math.max(0, Math.min(hifzAyahs(at), (m[at] ?? 0) + d));
  return { hifz: m, manual: Math.min(g.target, Object.values(m).reduce((a, x) => a + x, 0)) };
}
/** Ticks the next undone step of a life goal (or marks a goal without steps as reached). */
export function stepsTick(g: Goal, today: string, id?: string): Partial<Goal> {
  const st = g.steps ?? [];
  if (!st.length) return { manual: g.manual ? 0 : 1, target: 1 };
  const at = id ?? st.find((x) => !x.done)?.id;
  const steps = st.map((x) => (x.id === at ? { ...x, done: x.done ? undefined : today } : x));
  return { steps, target: steps.length };
}

/** Ready-made sets for the picker. */
export const HIFZ_SETS: { id: string; ru: string; refs: number[] }[] = [
  { id: 'last10', ru: _t("Последние 10 сур"), refs: [105, 106, 107, 108, 109, 110, 111, 112, 113, 114] },
  { id: 'amma', ru: _t("Джуз Амма (78–114)"), refs: Array.from({ length: 37 }, (_, i) => 78 + i) },
  { id: 'night', ru: _t("Перед сном: аль-Мульк, ас-Саджда"), refs: [67, 32] },
  { id: 'friday', ru: _t("Пятница: аль-Кахф"), refs: [18] },
];
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
    case 'manual': case 'hifz': case 'bookch': return g.manual;
    case 'steps': { const st = (g as Goal).steps ?? []; return st.length ? st.filter((x) => x.done).length : g.manual; }
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
    return q ? _t("сура {0}, аят {1} · {2} из 30 джузов", q.surah, q.ayah, juzDone(p.raw)) : _t("открой Коран, чтобы начать");
  }
  if (g.source === 'video') return _t("урок {0} из {1}", p.value, g.target);
  if (g.source === 'bookch') return _t("{0} из {1} глав", p.value, g.target);
  if (g.source === 'hifz') return _t("{0} из {1} аятов · {2}", p.value, g.target, hifzName(g.ref));
  if (g.source === 'steps') return g.steps?.length ? _t("{0} из {1} шагов", p.value, g.steps.length) : p.value ? _t("цель достигнута") : _t("шаги не добавлены");
  const def = sourceDef(g.source);
  if (def.unit === '%') return _t("{0}% из {1}%", p.value, g.target);
  return _t("{0} из {1}{2}", p.value, g.target, g.unit ? ' ' + g.unit : '');
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

/** The reading habit that fits how a book goal is counted. */
export const BOOK_HABIT: Record<'bookch' | 'pages', { action: string; min: string; anchor: 'asr'; sphere: 'mind' }> = {
  bookch: { action: _t("Чтение: одна глава"), min: _t("2 страницы"), anchor: 'asr', sphere: 'mind' },
  pages: { action: _t("Чтение, 10 страниц"), min: _t("2 страницы"), anchor: 'asr', sphere: 'mind' },
};
export interface Template { group: TplGroup; ic: string; ar?: boolean; sub: string; title: string; source: GoalSource; target?: number; unit?: string; identity: string; habits: { action: string; min: string; anchor: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; sphere: 'faith' | 'body' | 'food' | 'mind' | 'biz' | 'family' }[] }
export const TEMPLATES: Template[] = ([
  { group: 'faith', ic: 'قرآن', ar: true, sub: _t("считается по закладке в Коране"), title: _t("Хатм Корана"), source: 'quran', identity: _t("Я тот, кто читает Коран каждый день"), habits: [{ action: _t("Читать Коран 2 страницы"), min: _t("1 аят"), anchor: 'fajr', sphere: 'faith' }, { action: _t("Слушать Коран в дороге"), min: _t("10 минут"), anchor: 'dhuhr', sphere: 'faith' }] },
  { group: 'faith', ic: '🕌', sub: _t("доля намазов вовремя за 30 дней"), title: _t("Все намазы вовремя"), source: 'prayers', identity: _t("Я тот, кто встречает намаз, а не догоняет"), habits: [{ action: _t("Вуду сразу после азана"), min: _t("встать после азана"), anchor: 'asr', sphere: 'faith' }, { action: _t("Лечь спать до 23:00"), min: _t("телефон убран в 22:30"), anchor: 'isha', sphere: 'body' }] },
  { group: 'faith', ic: 'حفظ', ar: true, sub: _t("Любые суры: последние 10, Джуз Амма, аль-Мульк…"), title: _t("Выучить суры"), source: 'hifz', identity: _t("Я тот, кто носит Коран в сердце"), habits: [{ action: _t("Повторить выученные аяты"), min: _t("1 аят"), anchor: 'fajr', sphere: 'faith' }] },
  { group: 'faith', ic: '🌙', sub: _t("понедельник и четверг"), title: _t("Посты сунны"), source: 'fasts', target: 8, identity: _t("Я тот, кто держит пост по понедельникам и четвергам"), habits: [] },
  { group: 'faith', ic: '🕋', sub: _t("по списку подготовки"), title: _t("Готов к умре"), source: 'umrah', identity: _t("Я тот, кто едет к Каабе подготовленным"), habits: [] },
  { group: 'mind', ic: '▶', sub: _t("Сира, сподвижники, бизнес · по просмотрам"), title: _t("Пройти видеокурс"), source: 'video', identity: _t("Я тот, кто учится каждый день"), habits: [{ action: _t("Один урок"), min: _t("5 минут видео"), anchor: 'isha', sphere: 'mind' }] },
  { group: 'mind', ic: '📖', sub: _t("по главам или по страницам"), title: _t("Прочитать книгу"), source: 'bookch', target: 12, identity: _t("Я тот, кто читает каждый день"), habits: [BOOK_HABIT.bookch] },
  { group: 'mind', ic: 'Aa', sub: _t("30 уроков по дням"), title: _t("Английский A1 за 30 дней"), source: 'course', identity: _t("Я тот, кто говорит по-английски без страха"), habits: [{ action: _t("Урок английского"), min: _t("5 фраз вслух"), anchor: 'asr', sphere: 'mind' }] },
  { group: 'body', ic: '💪', sub: _t("из раздела Здоровье"), title: _t("Сильное тело"), source: 'workouts', target: 20, identity: _t("Я тот, кто заботится о теле как об аманате"), habits: [{ action: _t("Зарядка после Фаджра"), min: _t("10 отжиманий"), anchor: 'fajr', sphere: 'body' }] },
  { group: 'body', ic: '⚖️', sub: _t("своё число: кг"), title: _t("Сбросить вес"), source: 'manual', target: 5, unit: _t("кг"), identity: _t("Я тот, кто ест треть и двигается каждый день"), habits: [{ action: _t("Ужин без добавки"), min: _t("полтарелки"), anchor: 'maghrib', sphere: 'food' }] },
  { group: 'life', ic: '💰', sub: _t("своё число: €"), title: _t("Накопить на умру"), source: 'manual', target: 2000, unit: '€', identity: _t("Я тот, кто откладывает ради важного"), habits: [{ action: _t("Отложить в копилку"), min: _t("хоть 1 €"), anchor: 'maghrib', sphere: 'biz' }] },
  { group: 'life', ic: '🏡', sub: _t("по привычкам"), title: _t("Время с семьёй"), source: 'habits', identity: _t("Я тот, кто рядом со своими"), habits: [{ action: _t("Ужин без телефона"), min: _t("15 минут"), anchor: 'maghrib', sphere: 'family' }] },
] as Template[]).filter((t) => !(isEn && t.source === 'course')); // the English course is for Russian speakers

/** Ready-made Ramadan goals, shown in the month before. */
export const RAMADAN_TPL: Template[] = [
  { group: 'faith', ic: 'قرآن', ar: true, sub: _t("к первому дню Рамадана"), title: _t("Хатм к Рамадану"), source: 'quran', identity: _t("Я тот, кто входит в Рамадан с Кораном"), habits: [{ action: _t("Читать Коран 2 страницы"), min: _t("1 аят"), anchor: 'fajr', sphere: 'faith' }] },
  { group: 'faith', ic: '🌙', sub: _t("посты сунны до Рамадана"), title: _t("Привыкнуть к посту"), source: 'fasts', target: 6, identity: _t("Я тот, кто готов к посту"), habits: [] },
  { group: 'life', ic: 'صدقة', ar: true, sub: _t("каждый день понемногу"), title: _t("Садака каждый день"), source: 'habits', identity: _t("Я тот, кто даёт каждый день"), habits: [{ action: _t("Садака, хоть немного"), min: _t("улыбка или 1 €"), anchor: 'dhuhr', sphere: 'faith' }] },
];

const PAGE_AYAHS = TOTAL_AYAHS / 604;
const DAYS = [_t("воскресенье"), _t("понедельник"), _t("вторник"), _t("среду"), _t("четверг"), _t("пятницу"), _t("субботу")];

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
      return { text: `${pages} ${pl(pages, _t("страница"), _t("страницы"), _t("страниц"))}`, sub: _t("≈ {0} минут{1}", pages * 5, q ? _t(" · сура {0}, аят {1}", q.surah, q.ayah) : _t(" · с суры аль-Фатиха")), btn: _t("▶ Читать"), action: 'quran' };
    }
    case 'pages': { const n = Math.max(1, Math.ceil(perDay || 10)); return { text: `${n} ${pl(n, _t("страница"), _t("страницы"), _t("страниц"))}`, sub: _t("осталось {0} стр.", rest), btn: _t("▶ Читать"), action: 'books' }; }
    case 'bookch': {
      const n = Math.max(1, Math.ceil(perDay || 1));
      const next = Math.min(g.target, p.value + 1);
      if (rest <= 0) return { text: _t("Книга прочитана, машаАллах"), sub: _t("{0} из {0} глав", g.target), btn: _t("✓ Цель достигнута"), action: 'add' };
      return { text: n > 1 ? _t("Главы {0}–{1}", next, Math.min(g.target, p.value + n)) : _t("Глава {0}", next), sub: _t("{0} из {1} глав{2}", p.value, g.target, left ? _t(" · {0} в день, чтобы успеть", `${n} ${pl(n, _t("глава"), _t("главы"), _t("глав"))}`) : ''), btn: _t("✓ Прочитал главу {0}", next), action: 'add' };
    }
    case 'chapters': return { text: _t("1 глава пересказа"), sub: _t("{0} из {1} глав", p.value, g.target), btn: _t("▶ Читать"), action: 'books' };
    case 'course': return { text: _t("Урок {0} английского", Math.min(30, p.value + 1)), sub: _t("15 минут · фразы, диалог, карточки"), btn: _t("▶ Начать"), action: 'course' };
    case 'video': {
      const it = catalog().find((x) => x.id === g.ref) ?? s.videos?.mine.find((x) => x.id === g.ref);
      return { text: _t("Урок {0} из {1}", Math.min(g.target, p.value + 1), g.target), sub: it?.title ?? _t("видеокурс"), btn: _t("▶ Смотреть"), action: 'videos', ref: g.ref };
    }
    case 'prayers': {
      const d = s.prayers[today] ?? {};
      const on = Object.values(d).filter((m) => m === 'ontime').length;
      return { text: _t("Сегодня вовремя {0} из 5", on), sub: _t("отмечай намаз сразу после него"), btn: _t("Отметить"), action: 'today' };
    }
    case 'habits': {
      const hs = s.habits.filter((h) => g.habitIds.includes(h.id) && h.status === 'active');
      const done = hs.filter((h) => isCounted(s.log[today]?.[h.id])).length;
      return { text: hs.length ? _t("Привычки сегодня: {0} из {1}", done, hs.length) : _t("Привяжи привычку к цели"), sub: hs.map((h) => h.action).slice(0, 2).join(' · '), btn: _t("Отметить"), action: 'today' };
    }
    case 'fasts': {
      const wd = new Date(today + 'T12:00:00').getDay();
      const next = wd === 1 || wd === 4 ? _t("Сегодня день поста") : _t("Ближайший пост: {0}", wd < 4 && wd > 1 ? _t("в четверг") : _t("в понедельник"));
      return { text: next, sub: _t("{0} из {1} постов{2}", p.value, g.target, DAYS[wd] ? '' : ''), btn: _t("Отметить"), action: 'health' };
    }
    case 'workouts': return { text: _t("Тренировка 10–20 минут"), sub: _t("{0} из {1} тренировок", p.value, g.target), btn: _t("▶ Начать"), action: 'health' };
    case 'steps': {
      const st = g.steps ?? [];
      const next = st.find((x) => !x.done);
      if (!st.length) return { text: g.manual ? _t("Цель достигнута, альхамдулиллях") : _t("Раздели цель на шаги"), sub: _t("Добавь шаги ниже или отметь, когда цель сбудется"), btn: _t("✓ Цель достигнута"), action: 'add' };
      if (!next) return { text: _t("Все шаги сделаны, альхамдулиллях"), sub: _t("{0} из {0} шагов", st.length), btn: _t("✓ Цель достигнута"), action: 'add' };
      return { text: next.text, sub: _t("Следующий шаг · {0} из {1} сделано", p.value, st.length), btn: _t("✓ Сделано"), action: 'add' };
    }
    case 'umrah': return { text: _t("Подготовка: {0}%", p.value), sub: _t("следующий пункт из списка умры"), btn: _t("Открыть"), action: 'umrah' };
    case 'hifz': {
      const n = Math.max(1, Math.ceil(perDay || 1));
      const refs = hifzRefs(g.ref);
      const m = hifzMap(g);
      const cur = refs.find((x) => (m[x] ?? 0) < hifzAyahs(x));
      return { text: _t("Выучить {0} {1}", n, pl(n, _t("аят"), _t("аята"), _t("аятов"))), sub: cur && refs.length > 1 ? _t("Сейчас: {0}, {1} из {2} · всего {3} из {4}", surahName(cur), m[cur] ?? 0, hifzAyahs(cur), p.value, g.target) : _t("{0} · {1} из {2}", hifzName(g.ref), p.value, g.target), btn: _t("+1 аят"), action: 'add' };
    }
    case 'manual': {
      const u = g.unit || '';
      return p.behind && perDay
        ? { text: _t("Отстаю на {0} дн.", p.behind), sub: _t("чтобы успеть: ~{0} {1} в день", fmtN(perDay), u), btn: _t("+ Добавить"), action: 'add' }
        : { text: perDay ? _t("~{0} {1} в день", fmtN(perDay), u) : _t("Добавь, сколько сделал"), sub: _t("{0} из {1} {2}", p.value, g.target, u), btn: _t("+ Добавить"), action: 'add' };
    }
  }
}
const fmtN = (n: number) => (n >= 10 ? String(Math.ceil(n)) : n.toFixed(1).replace('.', ',').replace(',0', ''));
const pl = (n: number, a: string, b: string, c: string) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

/** Four milestones in the goal's own units. */
export function milestones(s: AppState, g: Goal, today: string) {
  const p = progress(s, g, today);
  if (g.source === 'steps') return [];
  const fr = g.source === 'quran' ? [1 / 3, 0.5, 2 / 3, 1] : [0.25, 0.5, 0.75, 1];
  return fr.map((f) => {
    const when = g.due ? addDays(g.createdAt, Math.round(daysBetween(g.createdAt, g.due) * f)) : null;
    let label: string, ok: boolean;
    if (g.source === 'quran') { const j = Math.round(30 * f); label = f === 1 ? _t("Хатм") : _t("{0} джузов", j); ok = juzDone(p.raw) >= j; }
    else {
      const v = Math.round(g.target * f);
      ok = p.value >= v;
      label = f === 1 ? _t("Цель") : g.source === 'video' ? _t("урок {0}", v) : g.source === 'bookch' ? _t("глава {0}", v) : g.source === 'hifz' ? _t("{0} аятов", v) : `${v}${g.unit ? ' ' + g.unit : ''}`;
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
  { id: 'faith', ru: _t("Поклонение") }, { id: 'mind', ru: _t("Знания") }, { id: 'body', ru: _t("Тело") }, { id: 'life', ru: _t("Деньги и семья") },
];
