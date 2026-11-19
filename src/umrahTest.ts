// Test 2 «Готовность к умре»: 12 statements in 4 parts (Да 2 / Частично 1 / Нет 0, 0–24 in total).
// The result is a level, what is left to do, small habits, ticks for the Umrah preparation list, and the goal «Подготовка к умре».
import type { Anchor, AppState, Goal, Habit } from './types';
import { _t } from './i18n';
import { addDays } from './dates';
import { activeLimit, slotsUsed, uid } from './store';
import { goalLimit, rawValue } from './goals';
import { umrahOf } from './components/Umrah';
import { PREP } from './umrah/guide';
import { runsOf, type TestRun } from './selftest';

export const UMRAH_TEST = 'umrah';

export type UPart = 'know' | 'body' | 'docs' | 'heart';
export const UPARTS: UPart[] = ['know', 'body', 'docs', 'heart'];
export const uPartName = (p: UPart) => ({ know: _t("Знания"), body: _t("Тело"), docs: _t("Документы и деньги"), heart: _t("Сердце") }[p]);

/** «обсудил(а)»: the word form follows Profile → «Я брат / Я сестра». */
const g = (me: 'm' | 'f' | undefined, m: string, f: string, both: string) => (me === 'f' ? f : me === 'm' ? m : both);

export interface UQuestion { part: UPart; q: string; step: string; prep?: string[] }
export function uQuestions(me?: 'm' | 'f'): UQuestion[] {
  return [
    { part: 'know', q: _t("Я знаю по шагам, что делать в умре: ихрам, таваф, саи, стрижка."), step: _t("Пройти гид по обрядам умры"), prep: ['learn'] },
    { part: 'know', q: _t("Я знаю, что нельзя делать в состоянии ихрама."), step: _t("Прочитать запреты ихрама в гиде") },
    { part: 'know', q: _t("Я знаю тальбию и несколько дуа для тавафа и саи."), step: _t("Выучить тальбию наизусть"), prep: ['talbiya'] },
    { part: 'body', q: _t("Я могу пройти 10 км за день без сильной усталости."), step: _t("Пройти 10 км за один день"), prep: ['walk'] },
    { part: 'body', q: _t("Я хожу пешком хотя бы 30 минут 4 раза в неделю."), step: _t("Ходить по 30 минут 4 раза в неделю") },
    { part: 'body', q: g(me, _t("Я обсудил поездку с врачом, или у меня нет проблем со здоровьем."), _t("Я обсудила поездку с врачом, или у меня нет проблем со здоровьем."), _t("Я обсудил(а) поездку с врачом, или у меня нет проблем со здоровьем.")), step: _t("Сходить к врачу, спросить про прививку от менингита") },
    { part: 'docs', q: _t("У меня есть загранпаспорт, который действует ещё минимум 6 месяцев."), step: _t("Проверить или сделать загранпаспорт") },
    { part: 'docs', q: _t("Я знаю, сколько стоит поездка, и у меня есть план, как накопить."), step: _t("Посчитать стоимость и начать копить") },
    { part: 'docs', q: g(me, _t("Я решил, когда и с кем еду: группа, агентство или сам."), _t("Я решила, когда и с кем еду: группа, агентство или сама."), _t("Я решил(а), когда и с кем еду: группа, агентство или сам(а).")), step: _t("Выбрать даты и с кем ехать") },
    { part: 'heart', q: _t("Я регулярно делаю истигфар и стараюсь оставить грехи до поездки."), step: _t("Истигфар каждый день") },
    { part: 'heart', q: g(me, _t("Я помирился с теми, с кем был конфликт, и знаю, как верну долги."), _t("Я помирилась с теми, с кем был конфликт, и знаю, как верну долги."), _t("Я помирился(ась) с теми, с кем был конфликт, и знаю, как верну долги.")), step: _t("Попросить прощения и договориться о долгах"), prep: ['tawba', 'debts'] },
    { part: 'heart', q: _t("У меня есть список дуа, о чём я попрошу у Каабы."), step: _t("Написать свой список дуа"), prep: ['duas'] },
  ];
}

export const UANSWERS = [_t("Нет"), _t("Частично"), _t("Да")];

export type ULevel = 'start' | 'base' | 'almost';
export const uTotal = (a: number[]) => a.reduce((x, y) => x + (y ?? 0), 0);
export const uLevel = (t: number): ULevel => (t <= 8 ? 'start' : t <= 16 ? 'base' : 'almost');
export const U_LEVEL: Record<ULevel, { title: string; text: string; months: number }> = {
  start: { title: _t("Начало пути"), text: _t("Хорошо, что начинаешь заранее. На подготовку уйдёт 3–6 месяцев. Мы разбили её на маленькие шаги."), months: 6 },
  base: { title: _t("Хорошая основа"), text: _t("Большая часть уже есть. Осталось несколько шагов, это 1–3 месяца."), months: 3 },
  almost: { title: _t("Почти готов(а)"), text: _t("Ты почти готов(а). Пройди последние шаги и повтори обряды перед поездкой."), months: 1 },
};
export const uLevelTitle = (l: ULevel, me?: 'm' | 'f') => (l === 'almost' ? g(me, _t("Почти готов"), _t("Почти готова"), _t("Почти готов(а)")) : U_LEVEL[l].title);
export const uLevelText = (l: ULevel, me?: 'm' | 'f') => (l === 'almost' ? g(me, _t("Ты почти готов. Пройди последние шаги и повтори обряды перед поездкой."), _t("Ты почти готова. Пройди последние шаги и повтори обряды перед поездкой."), U_LEVEL.almost.text) : U_LEVEL[l].text);

export function uScores(a: number[]): Record<UPart, number> {
  const out = { know: 0, body: 0, docs: 0, heart: 0 };
  uQuestions().forEach((q, i) => { out[q.part] += a[i] ?? 0; });
  return out;
}

/** What is left: every «Нет» and «Частично», «Нет» first. */
export const uLeft = (a: number[], me?: 'm' | 'f') => uQuestions(me).map((q, i) => ({ ...q, i, v: a[i] ?? 0 })).filter((x) => x.v < 2).sort((x, y) => x.v - y.v || x.i - y.i);

export interface UHabit { key: string; action: string; min: string; anchor: Anchor; on: boolean }
export function uHabits(a: number[]): UHabit[] {
  const out: UHabit[] = [];
  if ((a[3] ?? 0) < 2 || (a[4] ?? 0) < 2) out.push({ key: 'walk', action: _t("Прогулка 30 минут после Асра"), min: _t("10 минут ходьбы"), anchor: 'asr', on: true });
  if ((a[2] ?? 0) < 2) out.push({ key: 'talbiya', action: _t("Учить тальбию: 1 строка в день"), min: _t("повторить тальбию один раз"), anchor: 'fajr', on: true });
  if ((a[9] ?? 0) < 2) out.push({ key: 'istighfar', action: _t("Истигфар 100 раз после Фаджра"), min: _t("истигфар 10 раз"), anchor: 'fajr', on: out.length < 2 });
  if ((a[7] ?? 0) < 2) out.push({ key: 'save', action: _t("Откладывать на умру"), min: _t("отложить любую сумму"), anchor: 'isha', on: out.length < 2 });
  return out;
}

/** Preparation items the answers say are already done («Да»). */
export function uDonePrep(a: number[]): string[] {
  const ids = uQuestions().flatMap((q, i) => ((a[i] ?? 0) === 2 ? q.prep ?? [] : []));
  return [...new Set(ids)].filter((id) => PREP.some((p) => p.id === id));
}

export const hasUmrahGoal = (s: AppState) => (s.goals ?? []).some((x) => x.source === 'umrah' && x.status !== 'done');

export function applyUmrahPlan(s: AppState, a: number[], habits: UHabit[], tick: boolean, goal: boolean, today: string): { s: AppState; habitIds: string[]; goalId?: string } {
  let used = slotsUsed(s);
  const habitIds: string[] = [];
  const created: Habit[] = [];
  for (const h of habits) {
    const same = s.habits.find((x) => x.action === h.action && x.status !== 'archived');
    if (same) { habitIds.push(same.id); continue; }
    const st: Habit['status'] = used < activeLimit() ? 'active' : 'queued';
    if (st === 'active') used++;
    const nh: Habit = { id: uid(), action: h.action, min: h.min, anchor: h.anchor, sphere: h.key === 'walk' ? 'body' : h.key === 'save' ? 'biz' : 'faith', status: st, createdAt: today };
    created.push(nh); habitIds.push(nh.id);
  }
  let next: AppState = { ...s, habits: [...s.habits, ...created] };
  if (tick) {
    const u = umrahOf(next);
    next = { ...next, umrah: { ...u, prep: [...new Set([...u.prep, ...uDonePrep(a)])] } };
  }
  if (!goal || hasUmrahGoal(next)) return { s: next, habitIds };
  const lv = U_LEVEL[uLevel(uTotal(a))];
  const activeGoals = (next.goals ?? []).filter((x) => x.status === 'active').length;
  const gl: Goal = {
    id: uid(), title: _t("Подготовка к умре"), source: 'umrah', identity: '', niyya: _t("Ради Аллаха"), target: 100, unit: '%', start: 0, manual: 0,
    due: addDays(today, lv.months * 30), habitIds, status: activeGoals < goalLimit() ? 'active' : 'later', createdAt: today,
  };
  gl.start = rawValue(next, gl, today);
  next = { ...next, goals: [...(next.goals ?? []), gl] };
  return { s: next, habitIds, goalId: gl.id };
}

export const uRuns = (s: AppState): TestRun[] => runsOf(s, UMRAH_TEST);
