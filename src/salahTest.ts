// Test 3 «Намаз и Коран: с чего мне начать»: 10 Да/Нет statements on a ladder of 4 steps and one question about time.
// The step is the first one with a «Нет». Not an exam: the person answers about themselves. The plan links to
// «Новый путь», the Arabic course, the Quran and hifz goals.
import type { Anchor, AppState, Goal, GoalSource, Habit } from './types';
import { _t } from './i18n';
import { addDays } from './dates';
import { activeLimit, slotsUsed, uid } from './store';
import { goalLimit, hifzTotal, rawValue } from './goals';
import { turnOn } from './newpath';
import { runsOf, type TestRun } from './selftest';

export const SALAH_TEST = 'salah';
export const SALAH_REPEAT = 60;

export type Rung = 1 | 2 | 3 | 4;
export const RUNGS: { n: Rung; title: string; sub: string }[] = [
  { n: 1, title: _t("Основа"), sub: _t("Омовение, Фатиха, ракаат") },
  { n: 2, title: _t("Постоянство"), sub: _t("5 намазов, 3 суры, смысл") },
  { n: 3, title: _t("Чтение"), sub: _t("Арабские буквы, Коран на арабском") },
  { n: 4, title: _t("Глубина"), sub: _t("Тафсир, заучивание") },
];

export const SQUESTIONS: { r: Rung; q: string }[] = [
  { r: 1, q: _t("Я знаю, как совершать омовение (вуду).") },
  { r: 1, q: _t("Я знаю наизусть суру аль-Фатиха.") },
  { r: 1, q: _t("Я знаю, что говорить и делать в каждом ракаате.") },
  { r: 2, q: _t("Я совершаю все 5 намазов почти каждый день.") },
  { r: 2, q: _t("Я знаю наизусть минимум 3 короткие суры (например, аль-Ихлас, аль-Фалак, ан-Нас).") },
  { r: 2, q: _t("Я понимаю смысл того, что читаю в намазе.") },
  { r: 3, q: _t("Я читаю арабские буквы, пусть медленно.") },
  { r: 3, q: _t("Я читаю Коран на арабском хотя бы раз в неделю.") },
  { r: 4, q: _t("Я регулярно читаю толкование (тафсир) или перевод смыслов.") },
  { r: 4, q: _t("Я учу новые суры и повторяю выученные.") },
];
export const MINUTES = [5, 15, 30];

/** a[0..9] = 1 yes / 0 no, a[10] = index in MINUTES. */
export function rungOf(a: number[]): Rung {
  for (const r of [1, 2, 3] as Rung[]) if (SQUESTIONS.some((q, i) => q.r === r && !a[i])) return r;
  return 4;
}
export const minutesOf = (a: number[]) => MINUTES[a[10] ?? 1] ?? 15;
/** Steps fully done below the current one (all «Да»). */
export const rungDone = (a: number[], r: Rung) => SQUESTIONS.every((q, i) => q.r !== r || !!a[i]);
export const gaps = (a: number[], r: Rung) => SQUESTIONS.filter((q, i) => q.r === r && !a[i]).map((q) => q.q);

export const RUNG_TEXT: Record<Rung, { head: string; text: string }> = {
  1: { head: _t("Начнём с основы"), text: _t("Ты в самом начале, и это лучшее время: каждый шаг здесь даёт награду. Начнём с омовения и Фатихи, по одному шагу в день.") },
  2: { head: _t("Главное сейчас: постоянство"), text: _t("Основу ты знаешь. Теперь важно не пропускать намазы и понимать, что читаешь.") },
  3: { head: _t("Пора читать Коран самому"), text: _t("Каждый день немного, и через пару месяцев ты будешь читать медленно, но сам(а).") },
  4: { head: _t("Следующий шаг: глубже и больше"), text: _t("Ты уже читаешь и молишься постоянно. Дальше: понимать глубже и запоминать больше.") },
};

export function rungText(r: Rung, me?: 'm' | 'f') {
  const t = RUNG_TEXT[r];
  if (r !== 3 || !me) return t;
  return { head: me === 'f' ? _t("Пора читать Коран самой") : t.head, text: me === 'f' ? _t("Каждый день немного, и через пару месяцев ты будешь читать медленно, но сама.") : _t("Каждый день немного, и через пару месяцев ты будешь читать медленно, но сам.") };
}

export interface SHabit { key: string; action: string; min: string; anchor: Anchor; on: boolean }
export interface SGoal { title: string; source: GoalSource; ref?: string; target: number; unit: string; steps?: string[]; days: number; sub: string }
export interface SPlan { habits: SHabit[]; goal: SGoal; newpath?: boolean; course?: 'newpath' | 'ar' | 'quran' }

export function planOf(a: number[]): SPlan {
  const r = rungOf(a), m = minutesOf(a);
  if (r === 1) return {
    newpath: true, course: 'newpath',
    habits: [{ key: 'fatiha', action: _t("Учить аль-Фатиху: 1 аят в день после Фаджра"), min: _t("повторить выученные аяты"), anchor: 'fajr', on: true }],
    goal: { title: _t("Выучить аль-Фатиху"), source: 'hifz', ref: '1', target: hifzTotal([1]), unit: _t("аятов"), days: 14, sub: _t("7 аятов, отмечаешь выученные · 2 недели") },
  };
  if (r === 2) return {
    course: 'quran',
    habits: [
      { key: 'sura', action: _t("Учить суру: {0} минут после Фаджра", m), min: _t("повторить выученное"), anchor: 'fajr', on: true },
      { key: 'meaning', action: _t("Смысл одного аята из намаза в день"), min: _t("прочитать перевод аль-Фатихи"), anchor: 'isha', on: true },
    ],
    goal: { title: _t("Выучить 3 последние суры"), source: 'hifz', ref: '112,113,114', target: hifzTotal([112, 113, 114]), unit: _t("аятов"), days: 30, sub: _t("аль-Ихлас, аль-Фалак, ан-Нас · месяц") },
  };
  if (r === 3) return {
    course: 'ar',
    habits: [{ key: 'arabic', action: _t("Арабский: {0} минут после Фаджра", m), min: _t("5 минут букв"), anchor: 'fajr', on: true }],
    goal: {
      title: _t("Читать Коран на арабском"), source: 'steps', target: 4, unit: '', days: 60, sub: _t("4 шага · 2 месяца"),
      steps: [_t("Выучить буквы арабского алфавита"), _t("Научиться соединять буквы в слова"), _t("Самостоятельно прочитать аль-Фатиху по-арабски"), _t("Прочитать суру аль-Мульк по-арабски")],
    },
  };
  return {
    course: 'quran',
    habits: [
      { key: 'tafsir', action: _t("Тафсир: {0} минут после Фаджра", m), min: _t("тафсир одного аята"), anchor: 'fajr', on: true },
      { key: 'review', action: _t("Читать выученные суры в сунне-намазах"), min: _t("одна выученная сура"), anchor: 'isha', on: true },
    ],
    goal: { title: _t("Выучить суру аль-Мульк"), source: 'hifz', ref: '67', target: hifzTotal([67]), unit: _t("аятов"), days: 60, sub: _t("30 аятов · 2 месяца") },
  };
}

export function applySalahPlan(s: AppState, plan: SPlan, habits: SHabit[], goalOn: boolean, pathOn: boolean, today: string): { s: AppState; habitIds: string[]; goalId?: string } {
  let used = slotsUsed(s);
  const habitIds: string[] = [];
  const created: Habit[] = [];
  for (const h of habits) {
    const same = s.habits.find((x) => x.action === h.action && x.status !== 'archived');
    if (same) { habitIds.push(same.id); continue; }
    const st: Habit['status'] = used < activeLimit() ? 'active' : 'queued';
    if (st === 'active') used++;
    const nh: Habit = { id: uid(), action: h.action, min: h.min, anchor: h.anchor, sphere: h.key === 'arabic' ? 'mind' : 'faith', status: st, createdAt: today };
    created.push(nh); habitIds.push(nh.id);
  }
  let next: AppState = { ...s, habits: [...s.habits, ...created] };
  if (pathOn && plan.newpath) next = turnOn(next, today);
  if (!goalOn) return { s: next, habitIds };
  const g0 = plan.goal;
  const activeGoals = (next.goals ?? []).filter((x) => x.status === 'active').length;
  const gl: Goal = {
    id: uid(), title: g0.title, source: g0.source, identity: '', niyya: '', target: g0.target, unit: g0.unit, start: 0, manual: 0,
    due: addDays(today, g0.days), habitIds: [], ref: g0.ref, status: activeGoals < goalLimit() ? 'active' : 'later', createdAt: today,
    ...(g0.source === 'hifz' ? { hifz: {} } : {}),
    ...(g0.steps ? { steps: g0.steps.map((text) => ({ id: uid(), text })) } : {}),
  };
  gl.start = rawValue(next, gl, today);
  next = { ...next, goals: [...(next.goals ?? []), gl] };
  return { s: next, habitIds, goalId: gl.id };
}

export const sRuns = (s: AppState): TestRun[] => runsOf(s, SALAH_TEST);
