// The assistant's hands: each tool call from /api/ask is carried out here, on the person's own data.
// All calls of one answer are applied to a copy of the state; the chat then saves it in one step and keeps
// the state from before, so «Отменить» can put everything back.
import type { AppState, Anchor, BookMeta, Goal, Habit, Sphere } from './types';
import { ANCHORS, ANCHOR_LABEL } from './types';
import { setMark, setPrayer, uid } from './store';
import { rawValue } from './goals';
import { defaultHealth } from './health';
import type { GoTo } from './guide';
import { _t } from './i18n';

export interface ToolCall { id: string; name: string; input: Record<string, unknown> }
export interface ActDone { ok: boolean; line: string; result: string }

const S = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAnchor = (v: unknown): v is Anchor => ANCHORS.includes(v as Anchor);
const SPHERES: Sphere[] = ['faith', 'body', 'food', 'mind', 'biz', 'family'];

export const SCREENS: Record<string, GoTo> = {
  today: { tab: 'today' }, circle: { tab: 'circle' }, goals: { tab: 'progress' }, profile: { tab: 'profile' },
  quran: { practice: 'quran' }, tasbih: { practice: 'tasbih' }, focus: { practice: 'focus' }, books: { practice: 'books' }, courses: { practice: 'videos' },
  languages: { practice: 'langs' }, health: { practice: 'health' }, food: { practice: 'food' }, sadaqa: { practice: 'sadaqa' }, umrah: { practice: 'umrah' },
  ramadan: { ramadan: true }, safar: { safar: true }, add_habit: { add: true }, reminders: { profile: 'remind' }, prayer_settings: { profile: 'prayer' },
  my_habits: { profile: 'habits' }, garden: { profile: 'garden' }, account: { profile: 'account' }, ideas: { profile: 'ideas' },
};

/** Runs one call on `s`. Returns the new state (or the same one on failure) and what happened. */
export function runTool(s: AppState, c: ToolCall, today: string): { s: AppState; done: ActDone; go?: GoTo } {
  const i = c.input ?? {};
  const fail = (why: string): { s: AppState; done: ActDone } => ({ s, done: { ok: false, line: '', result: `error: ${why}` } });
  const ok = (next: AppState, line: string, result = 'done'): { s: AppState; done: ActDone } => ({ s: next, done: { ok: true, line, result } });
  const habit = (id: unknown) => s.habits.find((h) => h.id === id);
  const goal = (id: unknown) => (s.goals ?? []).find((g) => g.id === id);
  const setGoal = (id: string, patch: Partial<Goal>) => ({ ...s, goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const day = isDay(i.date) ? (i.date as string) : today;
  if (day > today) return fail('the date is in the future');

  switch (c.name) {
    case 'add_habit': {
      const action = S(i.action, 120), min = S(i.minimum, 80);
      if (!action) return fail('no action');
      if (!isAnchor(i.after_prayer)) return fail('after_prayer must be one of fajr, dhuhr, asr, maghrib, isha');
      const h: Habit = { id: uid(), action, min: min || action, anchor: i.after_prayer, sphere: SPHERES.includes(i.sphere as Sphere) ? (i.sphere as Sphere) : 'faith', status: 'active', createdAt: today };
      return ok({ ...s, habits: [...s.habits, h] }, _t("Новая привычка: {0} (после {1})", action, ANCHOR_LABEL[h.anchor].ru), `habit added, id ${h.id}`);
    }
    case 'edit_habit': {
      const h = habit(i.habit_id); if (!h) return fail('no habit with this id');
      const patch: Partial<Habit> = {};
      if (S(i.action)) patch.action = S(i.action, 120);
      if (S(i.minimum)) patch.min = S(i.minimum, 80);
      if (isAnchor(i.after_prayer)) patch.anchor = i.after_prayer;
      return ok({ ...s, habits: s.habits.map((x) => (x.id === h.id ? { ...x, ...patch } : x)) }, _t("Привычка изменена: {0}", patch.action ?? h.action));
    }
    case 'archive_habit': {
      const h = habit(i.habit_id); if (!h) return fail('no habit with this id');
      return ok({ ...s, habits: s.habits.map((x) => (x.id === h.id ? { ...x, status: 'archived' as const } : x)) }, _t("Привычка в архиве: {0}", h.action));
    }
    case 'mark_habit': {
      const h = habit(i.habit_id); if (!h) return fail('no habit with this id');
      const m = i.mark === 'done' ? 'done' : i.mark === 'minimum' ? 'min' : null;
      return ok(setMark(s, day, h.id, m), m === 'done' ? _t("Отмечено: {0}", h.action) : m === 'min' ? _t("Отмечен минимум: {0}", h.action) : _t("Отметка снята: {0}", h.action));
    }
    case 'mark_prayer': {
      if (!isAnchor(i.prayer)) return fail('unknown prayer');
      const m = i.status === 'on_time' ? 'ontime' : i.status === 'late' ? 'late' : null;
      const n = ANCHOR_LABEL[i.prayer].ru;
      return ok(setPrayer(s, day, i.prayer, m), m === 'ontime' ? _t("{0}: вовремя", n) : m === 'late' ? _t("{0}: с опозданием", n) : _t("{0}: отметка снята", n));
    }
    case 'create_goal': {
      const title = S(i.title, 120); if (!title) return fail('no title');
      const steps = (Array.isArray(i.steps) ? i.steps : []).map((t) => S(t, 120)).filter(Boolean).slice(0, 30).map((text) => ({ id: uid(), text }));
      const hids = (Array.isArray(i.habit_ids) ? i.habit_ids : []).filter((id) => habit(id)) as string[];
      const g: Goal = {
        id: uid(), title, source: 'steps', identity: S(i.identity, 160), niyya: S(i.niyya, 300), target: steps.length || 1, unit: '', start: 0, manual: 0,
        due: isDay(i.due) && (i.due as string) >= today ? (i.due as string) : undefined, habitIds: hids, status: 'active', createdAt: today, steps,
      };
      g.start = rawValue(s, g, today);
      return ok({ ...s, goals: [...(s.goals ?? []), g] }, _t("Новая цель: {0}{1}", title, steps.length ? _t(" · шагов: {0}", steps.length) : ''), `goal created, id ${g.id}, step ids ${steps.map((x) => x.id).join(',') || 'none'}`);
    }
    case 'create_book_goal': {
      const b = (s.books ?? []).find((x) => x.id === i.book_id); if (!b) return fail('no such book');
      const g = bookGoal(s, b, today, isDay(i.due) && (i.due as string) >= today ? (i.due as string) : undefined, S(i.niyya, 300));
      return ok({ ...s, goals: [...(s.goals ?? []), g] }, _t("Новая цель: {0}", g.title), `goal created, id ${g.id}`);
    }
    case 'update_goal': {
      const g = goal(i.goal_id); if (!g) return fail('no goal with this id');
      const patch: Partial<Goal> = {};
      if (S(i.title)) patch.title = S(i.title, 120);
      if (S(i.niyya)) patch.niyya = S(i.niyya, 300);
      if (i.due === 'none') patch.due = undefined; else if (isDay(i.due)) patch.due = i.due as string;
      if (i.status === 'active' || i.status === 'later' || i.status === 'done') { patch.status = i.status; if (i.status === 'done') patch.doneAt = today; }
      const what = patch.status === 'done' ? _t("Цель достигнута: {0}", g.title) : patch.status === 'later' ? _t("Цель отложена: {0}", g.title) : _t("Цель изменена: {0}", patch.title ?? g.title);
      return ok(setGoal(g.id, patch), what);
    }
    case 'add_goal_steps': {
      const g = goal(i.goal_id); if (!g) return fail('no goal with this id');
      if (g.source !== 'steps') return fail('this goal is counted automatically and has no steps; use add_goal_note instead');
      const add = (Array.isArray(i.steps) ? i.steps : []).map((t) => S(t, 120)).filter(Boolean).slice(0, 30).map((text) => ({ id: uid(), text }));
      if (!add.length) return fail('no steps');
      const steps = [...(g.steps ?? []), ...add];
      return ok(setGoal(g.id, { steps, target: steps.length }), _t("Шаги в цель «{0}»: +{1}", g.title, add.length), `steps added, ids ${add.map((x) => x.id).join(',')}`);
    }
    case 'tick_goal_step': {
      const g = goal(i.goal_id); if (!g) return fail('no goal with this id');
      const st = g.steps?.find((x) => x.id === i.step_id); if (!st) return fail('no step with this id');
      const on = i.done !== false;
      return ok(setGoal(g.id, { steps: g.steps!.map((x) => (x.id === st.id ? { ...x, done: on ? today : undefined } : x)) }), on ? _t("Шаг сделан: {0}", st.text) : _t("Шаг снова не сделан: {0}", st.text));
    }
    case 'add_goal_note': {
      const g = goal(i.goal_id); if (!g) return fail('no goal with this id');
      const text = S(i.text, 1000); if (!text) return fail('empty note');
      return ok(setGoal(g.id, { notes: [...(g.notes ?? []), { id: uid(), day: today, at: Date.now(), text }] }), _t("Заметка в цель «{0}»", g.title));
    }
    case 'save_idea': {
      const text = S(i.text, 1000); if (!text) return fail('empty idea');
      const id = uid();
      return ok({ ...s, ideas: [...(s.ideas ?? []), { id, at: Date.now(), text }] }, _t("Записано в «Мои идеи»"), `idea saved, id ${id}`);
    }
    case 'delete_idea': {
      const it = s.ideas?.find((x) => x.id === i.idea_id); if (!it) return fail('no idea with this id');
      return ok({ ...s, ideas: s.ideas!.filter((x) => x.id !== it.id) }, _t("Идея удалена"));
    }
    case 'mark_sadaqa': {
      const sd = { days: {}, secret: true, cur: '€', ramadan: null, jariya: [], ...(s.sadaqa ?? {}) };
      const d = { ...(sd.days[day] ?? {}) };
      if (i.kind === 'deed') d.deed = true;
      else { d.money = true; if (typeof i.amount === 'number' && i.amount > 0) d.amt = (d.amt ?? 0) + Math.round(i.amount * 100) / 100; }
      return ok({ ...s, sadaqa: { ...sd, days: { ...sd.days, [day]: d } } }, i.kind === 'deed' ? _t("Садака делом отмечена") : _t("Садака отмечена{0}", typeof i.amount === 'number' && i.amount > 0 ? ` · ${i.amount} ${sd.cur}` : ''));
    }
    case 'add_water': {
      const n = Math.round(Number(i.glasses) || 0); if (!n) return fail('glasses must be a whole number');
      const h = s.health ?? defaultHealth();
      const v = Math.max(0, (h.water[today] ?? 0) + n);
      return ok({ ...s, health: { ...h, water: { ...h.water, [today]: v } } }, _t("Вода сегодня: {0} из {1}", v, h.waterGoal));
    }
    case 'open_screen': {
      const g = SCREENS[S(i.screen, 40)]; if (!g) return fail('unknown screen');
      return { s, done: { ok: true, line: '', result: 'opening' }, go: g };
    }
  }
  return fail('unknown tool');
}

/** A goal «Прочитать «book»», counted by the pages read in Книги from today. */
export function bookGoal(s: AppState, b: BookMeta, today: string, due?: string, niyya = ''): Goal {
  const g: Goal = {
    id: uid(), title: _t("Прочитать «{0}»", b.title.slice(0, 90)), source: 'pages', identity: _t("Я тот, кто читает каждый день"), niyya,
    target: Math.max(1, b.pages - Math.max(0, b.page - 1)), unit: _t("стр."), start: 0, manual: 0, due, habitIds: [], status: 'active', createdAt: today,
  };
  g.start = rawValue(s, g, today);
  return g;
}
