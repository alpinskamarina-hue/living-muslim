// The assistant's hands: each tool call from /api/ask is carried out here, on the person's own data.
// All calls of one answer are applied to a copy of the state; the chat then saves it in one step and keeps
// the state from before, so «Отменить» can put everything back.
import type { AppState, Anchor, BookMeta, Goal, Habit, Ping, Sphere } from './types';
import { prayerTimes } from './prayer';
import { type Plan, type PlanAfter, type PlanRepeat, addDays, dayLabel, dropPlan, editPlan, movePlan, pid, ringAt, toggleDone, weekStart, whenLabel } from './plans';
import { ANCHORS, ANCHOR_LABEL } from './types';
import { setMark, setPrayer, uid } from './store';
import { rawValue } from './goals';
import { defaultHealth } from './health';
import type { GoTo } from './guide';
import { _t, LANG } from './i18n';

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
  my_habits: { profile: 'habits' }, garden: { profile: 'garden' }, account: { profile: 'account' }, ideas: { profile: 'ideas' }, my_reminders: { profile: 'pings' }, plans: { profile: 'plans' },
};

/** Runs one call on `s`. Returns the new state (or the same one on failure) and what happened. */
export interface Draft { to: string; text: string }
export function runTool(s: AppState, c: ToolCall, today: string): { s: AppState; done: ActDone; go?: GoTo; draft?: Draft } {
  const i = c.input ?? {};
  const fail = (why: string): { s: AppState; done: ActDone } => ({ s, done: { ok: false, line: '', result: `error: ${why}` } });
  const ok = (next: AppState, line: string, result = 'done'): { s: AppState; done: ActDone } => ({ s: next, done: { ok: true, line, result } });
  const habit = (id: unknown) => s.habits.find((h) => h.id === id);
  const goal = (id: unknown) => (s.goals ?? []).find((g) => g.id === id);
  const setGoal = (id: string, patch: Partial<Goal>) => ({ ...s, goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const day = isDay(i.date) ? (i.date as string) : today;
  // Marks cannot be made for days ahead; a reminder is about the future.
  if (day > today && !['set_reminder', 'add_plan', 'update_plan', 'draft_message'].includes(c.name)) return fail('the date is in the future');

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
    case 'set_reminder': {
      const text = S(i.text, 200); if (!text) return fail('empty reminder');
      if (!isDay(i.date)) return fail('date must be YYYY-MM-DD');
      const [y, m, d] = (i.date as string).split('-').map(Number);
      const pr = S(i.after_prayer, 10) as Anchor | 'jumuah' | '';
      let at: number;
      if (pr) {
        if (pr !== 'jumuah' && !isAnchor(pr)) return fail('unknown prayer');
        if (pr === 'jumuah' && new Date(y, m - 1, d).getDay() !== 5) return fail('that day is not a Friday');
        const t = prayerTimes(s.settings, new Date(y, m - 1, d, 12));
        const mins = typeof i.minutes_after === 'number' && i.minutes_after >= 0 && i.minutes_after <= 600 ? i.minutes_after : pr === 'jumuah' ? 60 : 30;
        at = t[pr === 'jumuah' ? 'dhuhr' : pr].getTime() + mins * 60000;
      } else {
        const tm = S(i.time, 5); if (!/^\d{1,2}:\d{2}$/.test(tm)) return fail('give a time HH:MM or after_prayer');
        const [hh, mm] = tm.split(':').map(Number);
        at = new Date(y, m - 1, d, hh, mm).getTime();
      }
      if (at < Date.now() - 60000) return fail('that moment has already passed');
      const p: Ping = { id: uid(), text, at, made: Date.now(), ...(pr ? { prayer: pr } : {}) };
      const pushOn = Boolean(s.settings.reminders?.on);
      return ok({ ...s, pings: [...(s.pings ?? []), p] }, _t("Напоминание: {0} · {1}", pingWhen(p), text),
        `reminder set, id ${p.id}, at ${new Date(at).toString().slice(0, 21)}${pushOn ? '' : '; notifications are OFF on this phone, so it shows only in the app until they turn on Профиль → Напоминания'}`);
    }
    case 'cancel_reminder': {
      const p = (s.pings ?? []).find((x) => x.id === i.reminder_id); if (!p) return fail('no such reminder');
      return ok({ ...s, pings: (s.pings ?? []).filter((x) => x.id !== p.id) }, _t("Напоминание отменено: {0}", p.text));
    }
    case 'add_plan': {
      const text = S(i.text, 200); if (!text) return fail('empty plan');
      if (!isDay(i.date)) return fail('date must be YYYY-MM-DD');
      let date = i.date as string;
      if (date < today) return fail('that day has passed');
      const week = i.this_week === true;
      if (week) date = addDays(weekStart(date), 6);
      const pr = S(i.after_prayer, 10) as PlanAfter | '';
      if (pr && pr !== 'jumuah' && !isAnchor(pr)) return fail('unknown prayer');
      if (pr === 'jumuah' && new Date(`${date}T12:00:00`).getDay() !== 5) return fail('that day is not a Friday');
      const tm = S(i.time, 5);
      if (tm && !/^\d{1,2}:\d{2}$/.test(tm)) return fail('time must be HH:MM');
      const hasWhen = !week && Boolean(pr || tm);
      const rm = i.remind === 'hour_before' ? 'h1' : i.remind === 'none' ? undefined : hasWhen ? 'at' : undefined;
      const rep = ['day', 'week', 'month'].includes(i.repeat as string) ? (i.repeat as PlanRepeat) : undefined;
      const lst = S(i.list, 30);
      const p: Plan = { id: pid(), text, date, made: Date.now(), upd: Date.now(), ...(week ? { week: true } : {}), ...(!week && pr ? { after: pr } : !week && tm ? { time: tm.padStart(5, '0') } : {}), ...(hasWhen && rm ? { remind: rm } : {}), ...(lst ? { list: lst } : {}), ...(rep && !week ? { repeat: rep } : {}), ...(S(i.note, 1000) ? { note: S(i.note, 1000) } : {}) };
      const next = { ...s, plans: [...(s.plans ?? []), p] };
      const at = ringAt(s.settings, p, date);
      const pushOn = Boolean(s.settings.reminders?.on);
      return ok(next, _t("План: {0} · {1}", `${dayLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}${whenLabel(s.settings, p, date) ? `, ${whenLabel(s.settings, p, date)}` : ''}`, text),
        `plan added, id ${p.id}${at ? `, rings at ${new Date(at).toString().slice(0, 21)}${pushOn ? '' : ' (notifications are OFF on this phone)'}` : ''}`);
    }
    case 'update_plan': {
      const p = (s.plans ?? []).find((x) => x.id === i.plan_id && !x.del); if (!p) return fail('no plan with this id');
      const d = isDay(i.date) ? (i.date as string) : today;
      switch (i.action) {
        case 'done': return ok(toggleDone(s, p.id, d, true), _t("Сделано: {0}", p.text));
        case 'undone': return ok(toggleDone(s, p.id, d, false), _t("Снова не сделано: {0}", p.text));
        case 'move': if (!isDay(i.date) || d < today) return fail('give a new day YYYY-MM-DD, today or later'); return ok(movePlan(s, p.id, d), _t("Перенесено на {0}: {1}", dayLabel(d, { weekday: 'short', day: 'numeric', month: 'short' }), p.text));
        case 'delete': return ok(dropPlan(s, p.id), _t("План удалён: {0}", p.text));
        case 'edit': {
          const patch: Partial<Plan> = {};
          if (S(i.text)) patch.text = S(i.text, 200);
          const pr = S(i.after_prayer, 10) as PlanAfter | '';
          if (pr) { if (pr !== 'jumuah' && !isAnchor(pr)) return fail('unknown prayer'); patch.after = pr; patch.time = undefined; }
          else if (/^\d{1,2}:\d{2}$/.test(S(i.time, 5))) { patch.time = S(i.time, 5).padStart(5, '0'); patch.after = undefined; }
          if (i.remind === 'none') patch.remind = undefined; else if (i.remind === 'at') patch.remind = 'at'; else if (i.remind === 'hour_before') patch.remind = 'h1';
          return ok(editPlan(s, p.id, patch), _t("План изменён: {0}", patch.text ?? p.text));
        }
      }
      return fail('unknown action');
    }
    case 'draft_message': {
      const text = S(i.text, 2000); if (!text) return fail('empty message');
      return { s, done: { ok: true, line: '', result: 'shown to the person with copy and WhatsApp buttons; they send it themselves' }, draft: { to: S(i.to, 60), text } };
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

const PR_NAME: Record<string, () => string> = {
  fajr: () => _t("Фаджра"), dhuhr: () => _t("Зухра"), asr: () => _t("Асра"), maghrib: () => _t("Магриба"), isha: () => _t("Иши"), jumuah: () => _t("Джумы"),
};
/** «пт, 21 нояб., 13:45 (после Джумы)» */
export function pingWhen(p: Ping): string {
  const d = new Date(p.at);
  const day = d.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  const tm = d.toLocaleTimeString(LANG === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' });
  return p.prayer ? `${day}, ${tm} (${_t("после {0}", PR_NAME[p.prayer]())})` : `${day}, ${tm}`;
}
