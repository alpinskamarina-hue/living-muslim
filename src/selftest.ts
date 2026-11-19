// «Тесты» in Practice. Test 1 «Что мне даётся труднее»: 12 statements over 6 parts of life (0–3 each) and one question
// about why habits break. The result is a strength, two growth zones, and a plan of small habits and one goal.
// Runs are kept on the phone; the test can be repeated every 30 days to see «было → стало».
import type { Anchor, AppState, Goal, GoalSource, Habit, Sphere } from './types';
import { _t } from './i18n';
import { addDays, daysBetween } from './dates';
import { activeLimit, consistency, slotsUsed, uid } from './store';
import { goalLimit, rawValue } from './goals';

export const TEST_ID = 'hard';
export const REPEAT_DAYS = 30;

/** Order also breaks ties: faith first. */
export const PARTS: Sphere[] = ['faith', 'body', 'food', 'mind', 'family', 'biz'];
export const partName = (p: Sphere) => ({
  faith: _t("Вера"), body: _t("Тело"), food: _t("Питание"), mind: _t("Ум"), family: _t("Семья"), biz: _t("Дело и деньги"),
}[p]);
/** Lowercase, for the middle of a sentence. */
export const partLow = (p: Sphere) => ({
  faith: _t("вера"), body: _t("тело"), food: _t("питание"), mind: _t("ум"), family: _t("семья"), biz: _t("дело и деньги"),
}[p]);

export interface GoalIdea { title: string; source: GoalSource; target: number; unit: string }
export interface Question { part: Sphere; q: string; habit: { action: string; min: string; anchor: Anchor }; why: string; goal?: GoalIdea }

export const QUESTIONS: Question[] = [
  { part: 'faith', q: _t("Я совершаю все пять намазов вовремя."),
    habit: { action: _t("Фаджр в начале времени"), min: _t("встать к Фаджру по будильнику"), anchor: 'fajr' },
    why: _t("Один намаз вовремя тянет за собой остальные."),
    goal: { title: _t("Все 5 намазов вовремя"), source: 'prayers', target: 100, unit: '%' } },
  { part: 'faith', q: _t("Каждый день я читаю Коран или делаю зикр, хотя бы несколько минут."),
    habit: { action: _t("1 страница Корана после Фаджра"), min: _t("1 аят"), anchor: 'fajr' },
    why: _t("Немного каждый день лучше, чем много раз в месяц.") },
  { part: 'body', q: _t("Я двигаюсь не меньше 30 минут в день (ходьба тоже считается)."),
    habit: { action: _t("Прогулка 20 минут после Асра"), min: _t("5 минут ходьбы"), anchor: 'asr' },
    why: _t("Ходьба даёт силы и ясную голову на вечер.") },
  { part: 'body', q: _t("Я ложусь спать до полуночи и высыпаюсь."),
    habit: { action: _t("Телефон в другой комнате после Иши"), min: _t("убрать телефон за 10 минут до сна"), anchor: 'isha' },
    why: _t("Без экрана перед сном легче уснуть и встать на Фаджр.") },
  { part: 'food', q: _t("Я ем без переедания и не перекусываю сладким на ходу."),
    habit: { action: _t("Без сладкого после Магриба"), min: _t("заменить сладкое фруктом"), anchor: 'maghrib' },
    why: _t("Вечером сладкое чаще едят по привычке, а не от голода.") },
  { part: 'food', q: _t("Я пью достаточно воды, 6–8 стаканов в день."),
    habit: { action: _t("Стакан воды после каждого намаза"), min: _t("стакан воды после Фаджра"), anchor: 'fajr' },
    why: _t("Привяжи воду к намазу, и 5 стаканов наберутся сами.") },
  { part: 'mind', q: _t("Я читаю книгу или учусь новому хотя бы 15 минут в день."),
    habit: { action: _t("10 страниц книги в день"), min: _t("1 страница"), anchor: 'isha' },
    why: _t("10 страниц в день — это примерно книга в месяц."),
    goal: { title: _t("Прочитать книгу по главам"), source: 'bookch', target: 12, unit: _t("глав") } },
  { part: 'mind', q: _t("Я провожу в телефоне «просто так» меньше часа в день."),
    habit: { action: _t("Первые 30 минут после Фаджра без телефона"), min: _t("5 минут без телефона после Фаджра"), anchor: 'fajr' },
    why: _t("Утро без ленты остаётся твоим.") },
  { part: 'family', q: _t("Я провожу время с семьёй без телефона."),
    habit: { action: _t("Ужин с семьёй без телефона"), min: _t("10 минут разговора с близкими"), anchor: 'maghrib' },
    why: _t("Близким важнее твоё внимание, чем время рядом.") },
  { part: 'family', q: _t("Хотя бы раз в неделю я звоню или навещаю родственников."),
    habit: { action: _t("Позвонить родственнику"), min: _t("написать родственнику пару слов"), anchor: 'dhuhr' },
    why: _t("Родственные связи легко потерять в суете, а держатся они на коротких звонках.") },
  { part: 'biz', q: _t("Я планирую день и делаю главное дело до обеда."),
    habit: { action: _t("После Иши записать 3 главных дела на завтра"), min: _t("записать 1 главное дело"), anchor: 'isha' },
    why: _t("Утром не тратишь силы на то, чтобы решить, с чего начать.") },
  { part: 'biz', q: _t("Я знаю, сколько трачу, и регулярно откладываю или даю садаку."),
    habit: { action: _t("Вечером записать траты дня"), min: _t("записать одну трату"), anchor: 'isha' },
    why: _t("Когда видишь траты, легче откладывать и давать садаку.") },
];

export const SCALE = [_t("Почти никогда"), _t("Иногда"), _t("Часто"), _t("Почти всегда")];

export type Barrier = 'forget' | 'time' | 'energy' | 'why' | 'alone';
export const BARRIERS: { id: Barrier; label: string; tip: string }[] = [
  { id: 'forget', label: _t("Забываю"), tip: _t("Каждая привычка привязана к намазу: сделал намаз, сразу шаг.") },
  { id: 'time', label: _t("Нет времени"), tip: _t("Берём облегчённые версии на 2 минуты. Когда войдёт в привычку, увеличишь.") },
  { id: 'energy', label: _t("Нет сил или настроения"), tip: _t("Начни с одной привычки, а не с трёх. Остальные можно добавить позже.") },
  { id: 'why', label: _t("Не вижу, зачем это мне"), tip: _t("У каждой привычки написано, что она даёт. Самые любимые Аллаху дела те, что постоянны, даже если малы.") },
  { id: 'alone', label: _t("Не с кем, одному трудно"), tip: _t("Позови друзей в Круг и предложи вызов на 7 дней с этой привычкой. Вместе держаться легче.") },
];

export interface TestRun { day: string; a: number[]; b?: Barrier; habits?: string[]; goal?: string }
export interface TestsState { runs: Record<string, TestRun[]> }

export const runsOf = (s: AppState, id = TEST_ID): TestRun[] => s.tests?.runs[id] ?? [];
export const lastRun = (s: AppState, id = TEST_ID): TestRun | undefined => { const r = runsOf(s, id); return r[r.length - 1] as TestRun | undefined; };
/** Days left until the repeat; ≤ 0 means it is time. */
export const repeatIn = (r: TestRun, today: string) => REPEAT_DAYS - daysBetween(r.day, today);

export function saveRun(s: AppState, run: TestRun, id = TEST_ID): AppState {
  const prev = runsOf(s, id).filter((r) => r.day !== run.day);
  return { ...s, tests: { runs: { ...(s.tests?.runs ?? {}), [id]: [...prev, run].slice(-12) } } };
}

export type Scores = Record<Sphere, number>;
export function scores(a: number[]): Scores {
  const out = Object.fromEntries(PARTS.map((p) => [p, 0])) as Scores;
  QUESTIONS.forEach((q, i) => { out[q.part] += a[i] ?? 0; });
  return out;
}
export const level = (n: number) => (n <= 2 ? 'low' : n <= 4 ? 'mid' : 'high');
export const levelText = (n: number) => (n <= 2 ? _t("Здесь труднее всего") : n <= 4 ? _t("Получается через раз") : _t("Сильная сторона"));

export interface Result { sc: Scores; strong: Sphere; zones: [Sphere, Sphere]; ranked: Sphere[] }
export function result(a: number[]): Result {
  const sc = scores(a);
  const ranked = [...PARTS].sort((x, y) => sc[y] - sc[x] || PARTS.indexOf(x) - PARTS.indexOf(y));
  const low = [...PARTS].sort((x, y) => sc[x] - sc[y] || PARTS.indexOf(x) - PARTS.indexOf(y));
  return { sc, strong: ranked[0], zones: [low[0], low[1]], ranked };
}

export const STRONG_TEXT: Record<Sphere, string> = {
  faith: _t("Намаз и зикр уже держат твой день. Привяжем новые привычки к намазу, так их легче не забыть."),
  body: _t("Ты заботишься о теле, и это даёт силы. Новые привычки поставим на время, когда ты бодрее всего."),
  food: _t("Ты следишь за едой, а это дисциплина. Тот же подход сработает и в других частях."),
  mind: _t("Ты любишь учиться. Пусть к каждой новой привычке будет понятно, зачем она."),
  family: _t("Ты держишь близких рядом. Позови их в Круг: вместе держать привычки легче."),
  biz: _t("Ты умеешь планировать. Впиши новые привычки в свой день, как встречи."),
};
export const zoneText = (n: number) => n >= 5
  ? _t("Здесь у тебя уже хорошо. Если хочешь расти дальше, начни отсюда.")
  : _t("Здесь пока трудно, и это нормально. Не нужно менять всё сразу: начни с одного маленького шага на месяц.");

/** Index of the weaker question of a part (the first one on a tie). */
function weakest(a: number[], p: Sphere): number {
  const idx = QUESTIONS.map((q, i) => (q.part === p ? i : -1)).filter((i) => i >= 0);
  return idx.reduce((m, i) => ((a[i] ?? 0) < (a[m] ?? 0) ? i : m), idx[0]);
}
const other = (p: Sphere, i: number) => QUESTIONS.findIndex((q, j) => q.part === p && j !== i);

export interface Proposal { qi: number; action: string; min: string; anchor: Anchor; part: Sphere; why: string; on: boolean }
/** Up to 3 small habits: the weaker question of each growth zone, then the other question of the first zone. */
export function proposals(a: number[], b: Barrier): Proposal[] {
  const { zones } = result(a);
  const w0 = weakest(a, zones[0]), w1 = weakest(a, zones[1]), o0 = other(zones[0], w0);
  const list = [w0, w1, ...(o0 >= 0 && (a[o0] ?? 0) <= 2 ? [o0] : [])];
  return list.map((qi, k) => {
    const q = QUESTIONS[qi];
    const light = b === 'time';
    return {
      qi, part: q.part, why: q.why, anchor: q.habit.anchor,
      action: light ? cap(q.habit.min) : q.habit.action, min: q.habit.min,
      on: b === 'energy' ? k === 0 : k < 2,
    };
  });
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The month's goal: the first growth zone's own goal if it has one, else a goal made of the chosen habits. */
export function goalIdea(a: number[]): GoalIdea {
  const { zones } = result(a);
  for (const z of zones) { const g = QUESTIONS[weakest(a, z)].goal; if (g) return g; }
  return { title: _t("Месяц маленьких шагов"), source: 'habits', target: 80, unit: '%' };
}

/** Adds the chosen habits (active while there is room, else in «Скоро») and the goal. Returns the new ids. */
export function applyPlan(s: AppState, picks: Proposal[], goal: GoalIdea | null, today: string): { s: AppState; habitIds: string[]; goalId?: string } {
  let used = slotsUsed(s);
  const habitIds: string[] = [];
  const created: Habit[] = [];
  for (const p of picks) {
    const same = s.habits.find((h) => h.action === p.action && h.status !== 'archived');
    if (same) { habitIds.push(same.id); continue; }
    const st: Habit['status'] = used < activeLimit() ? 'active' : 'queued';
    if (st === 'active') used++;
    const h: Habit = { id: uid(), action: p.action, min: p.min, anchor: p.anchor, sphere: p.part, status: st, createdAt: today };
    created.push(h); habitIds.push(h.id);
  }
  let next: AppState = { ...s, habits: [...s.habits, ...created] };
  if (!goal) return { s: next, habitIds };
  const activeGoals = (next.goals ?? []).filter((g) => g.status === 'active').length;
  const g: Goal = {
    id: uid(), title: goal.title, source: goal.source,
    identity: goal.source === 'habits' ? _t("Я делаю маленькие шаги каждый день") : '',
    niyya: '', target: goal.target, unit: goal.unit, start: 0, manual: 0,
    due: addDays(today, REPEAT_DAYS), habitIds: goal.source === 'habits' ? habitIds : [],
    status: activeGoals < goalLimit() ? 'active' : 'later', createdAt: today,
  };
  g.start = rawValue(next, g, today);
  next = { ...next, goals: [...(next.goals ?? []), g] };
  return { s: next, habitIds, goalId: g.id };
}

/** How the habits from the last plan went: days done out of the last 30. */
export function planReport(s: AppState, r: TestRun, today: string) {
  return (r.habits ?? []).map((id) => s.habits.find((h) => h.id === id)).filter(Boolean).map((h) => {
    const c = consistency(s, h!, today, Math.min(30, Math.max(1, daysBetween(r.day, today))));
    return { action: h!.action, done: c.hit, days: c.total };
  });
}
