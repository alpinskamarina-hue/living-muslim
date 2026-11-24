// The assistant's hands: each tool call from /api/ask is carried out here, on the person's own data.
// All calls of one answer are applied to a copy of the state; the chat then saves it in one step and keeps
// the state from before, so «Отменить» can put everything back.
import type { AppState, Anchor, BookMeta, Goal, Habit, Ping, Sphere } from './types';
import { prayerTimes } from './prayer';
import { type Plan, type PlanAfter, type PlanRepeat, addDays, dayLabel, dropPlan, editPlan, movePlan, pid, ringAt, toggleDone, weekStart, whenLabel } from './plans';
import { ANCHORS, ANCHOR_LABEL } from './types';
import { setMark, setPrayer, uid } from './store';
import { rawValue } from './goals';
import { defaultHealth, WORKOUTS, WTYPES, ownEntry, parseW } from './health';
import { markDone as azkarDone, azkarOf } from './azkar';
import { ramadanOf } from './ramadan';
import { updQuit } from './quit';
import { famOf, toggleKidTask } from './family';
import { search as foodSearch, itemFrom } from './foodcalc';
import type { FastMark, FoodItem, FoodState, Meal, UmrahState } from './types';
import type { GoTo } from './guide';
import { _t, _tj, LANG } from './i18n';
import { getMemory, setMemory } from './assistant';

export interface ToolCall { id: string; name: string; input: Record<string, unknown> }
export interface ActDone { ok: boolean; line: string; result: string }

/** A workout name that only repeats the type («Зал», «Running») adds nothing next to it. */
const PLAIN_TYPE = /^(зал|тренаж[её]рный зал|качалка|gym|бег|пробежка|run|running|ходьба|прогулка|walk|walking|футбол|football|soccer|плавание|бассейн|swim|swimming|велосипед|велик|bike|cycling|единоборства|martial arts|другое|other)$/i;
const S = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAnchor = (v: unknown): v is Anchor => ANCHORS.includes(v as Anchor);
const SPHERES: Sphere[] = ['faith', 'body', 'food', 'mind', 'biz', 'family'];

export const SCREENS: Record<string, GoTo> = {
  today: { tab: 'today' }, circle: { tab: 'circle' }, goals: { tab: 'progress' }, profile: { tab: 'profile' },
  quran: { practice: 'quran' }, tasbih: { practice: 'tasbih' }, focus: { practice: 'focus' }, books: { practice: 'books' }, courses: { practice: 'videos' },
  languages: { practice: 'langs' }, health: { practice: 'health' }, food: { practice: 'food' }, sadaqa: { practice: 'sadaqa' }, umrah: { practice: 'umrah' }, tests: { practice: 'tests' },
  azkar: { practice: 'azkar' }, ramadan: { ramadan: true }, safar: { safar: true }, add_habit: { add: true }, reminders: { profile: 'remind' }, prayer_settings: { profile: 'prayer' },
  my_habits: { profile: 'habits' }, garden: { profile: 'garden' }, account: { profile: 'account' }, ideas: { profile: 'ideas' }, my_reminders: { profile: 'pings' }, plans: { profile: 'plans' },
  halal: { open: 'halal' }, khutba: { open: 'khutba' }, qibla: { open: 'qibla' }, mosques: { open: 'mosques' }, quit: { open: 'quit' },
  nikah: { profile: 'nikah' }, adhan: { profile: 'adhan' }, cycle: { profile: 'cycle' }, sisters: { profile: 'sisters' },
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
  if (day > today && !['set_reminder', 'add_plan', 'update_plan', 'draft_message', 'change_setting', 'memory', 'set_quran_place', 'set_book_page', 'umrah'].includes(c.name)) return fail('the date is in the future');

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
    case 'log_health': {
      const h = { ...defaultHealth(), ...(s.health ?? {}) };
      const put = (patch: Partial<typeof h>) => ({ ...s, health: { ...h, ...patch } });
      switch (i.what) {
        case 'sleep': {
          const bed = S(i.bed, 5), wake = S(i.wake, 5);
          if (!/^\d{1,2}:\d{2}$/.test(bed) || !/^\d{1,2}:\d{2}$/.test(wake)) return fail('give bed and wake as HH:MM');
          const q = i.quality === 'good' ? 3 : i.quality === 'bad' ? 1 : 2;
          const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
          const mins = ((wh * 60 + wm) - (bh * 60 + bm) + 1440) % 1440;
          return ok(put({ sleep: { ...h.sleep, [day]: { bed: bed.padStart(5, '0'), wake: wake.padStart(5, '0'), q } } }), _t("Сон: {0}–{1}, {2} ч {3} мин", bed.padStart(5, '0'), wake.padStart(5, '0'), Math.floor(mins / 60), mins % 60), `sleep saved for the night before ${day}: ${Math.floor(mins / 60)}h ${mins % 60}m`);
        }
        case 'workout': {
          const w = WORKOUTS.find((x) => x.id === i.workout_id);
          const type = WTYPES.find((x) => x.id === i.workout_type)?.id;
          const extra = S(i.workout_name, 40);
          if (!w && !type && !extra) return fail('give workout_id, workout_type or workout_name');
          const min = Math.round(Number(i.minutes) || 0);
          const lvl = i.intensity === 'light' ? 1 : i.intensity === 'hard' ? 3 : i.intensity === 'medium' ? 2 : undefined;
          // Timer workouts keep their id; own ones carry type, name, minutes and how hard (health.ts ownEntry).
          const id = w ? (min > 0 ? `${w.id}|${Math.min(600, min)}` : w.id) : ownEntry(type ?? 'other', min > 0 ? min : undefined, lvl, extra && !PLAIN_TYPE.test(extra) && extra !== WTYPES.find((x) => x.id === type)?.n ? extra : undefined, true);
          const e = parseW(id);
          return ok(put({ workouts: { ...h.workouts, [day]: [...(h.workouts[day] ?? []), id] } }), _t("Тренировка: {0}", [e.name, e.min ? _tj("{0} мин", e.min) : ''].filter(Boolean).join(', ')));
        }
        case 'no_workout': {
          const list = h.workouts[day] ?? [];
          if (!list.length) return fail(`no workouts on ${day}`);
          const q = S(i.workout_name, 40).toLowerCase();
          let at = list.length - 1;
          if (q) { at = -1; for (let j = list.length - 1; j >= 0; j--) { const e = parseW(list[j]); if (e.name.toLowerCase().includes(q) || e.type === q || e.timer === q) { at = j; break; } } }
          if (at < 0) return fail(`no workout matching «${q}» on ${day}`);
          const gone = parseW(list[at]);
          const rest = list.filter((_, j) => j !== at);
          const wk = { ...h.workouts }; if (rest.length) wk[day] = rest; else delete wk[day];
          return ok(put({ workouts: wk }), _t("Тренировка убрана: {0}", gone.name));
        }
        case 'fast': return ok(put({ fasts: { ...h.fasts, [day]: true } }), _t("Пост отмечен"));
        case 'no_fast': { const f = { ...h.fasts }; delete f[day]; return ok(put({ fasts: f }), _t("Отметка поста снята")); }
        case 'water_goal': { const n = Math.round(Number(i.glasses) || 0); if (n < 1 || n > 30) return fail('glasses 1..30'); return ok(put({ waterGoal: n }), _t("Цель по воде: {0} стаканов", n)); }
        case 'weight': {
          const kg = Number(i.weight_kg); if (!(kg > 20 && kg < 400)) return fail('weight_kg must be a number in kg');
          const f = foodState(s);
          return ok({ ...s, food: { ...f, weight: { ...f.weight, [day]: Math.round(kg * 10) / 10 } } }, _t("Вес: {0} кг", Math.round(kg * 10) / 10));
        }
      }
      return fail('unknown what');
    }
    case 'log_food': {
      const f = foodState(s);
      const meal: Meal = i.meal === 'breakfast' ? 'b' : i.meal === 'dinner' ? 'd' : i.meal === 'lunch' ? 'l' : (new Date().getHours() < 11 ? 'b' : new Date().getHours() < 16 ? 'l' : 'd');
      const items: FoodItem[] = [];
      for (const x of (Array.isArray(i.items) ? i.items : []).slice(0, 20) as Record<string, unknown>[]) {
        const n = S(x?.name, 60); const g = Number(x?.grams); if (!n || !(g > 0 && g < 5000)) continue;
        const row = foodSearch(n)[0];
        const k = Number(x.kcal);
        if (k >= 0 && Number.isFinite(k) && x.kcal !== undefined) {
          const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 10) / 10 : 0);
          items.push({ id: `fi-${uid()}`, n, g: Math.round(g), k: Math.round(k), p: num(x.protein), f: num(x.fat), c: num(x.carbs), m: meal });
        } else if (row) items.push({ ...itemFrom(row, g, meal), n });
      }
      if (!items.length) return fail('give items with name and grams (and kcal, protein, fat, carbs per portion)');
      const kc = items.reduce((a, x) => a + x.k, 0);
      const log = { ...(f.log ?? {}), [day]: [...(f.log?.[day] ?? []), ...items] };
      const meals = i.portion ? { ...f.meals, [day]: { ...(f.meals[day] ?? {}), [meal]: i.portion === 'light' ? 1 : i.portion === 'overate' ? 3 : 2 } } : f.meals;
      const dayK = log[day].reduce((a, x) => a + x.k, 0);
      return ok({ ...s, food: { ...f, log, meals } }, _t("Питание: {0} · {1} ккал", items.map((x) => `${x.n} ${x.g} г`).join(', '), kc), `logged ${items.length} items, ${kc} kcal; today total ${dayK} kcal${f.mode && f.mode !== 'mera' ? '' : ' (calorie counting is not the chosen mode; the items are still saved)'}`);
    }
    case 'rate_meal': {
      const f = foodState(s);
      const meal: Meal | null = i.meal === 'breakfast' ? 'b' : i.meal === 'lunch' ? 'l' : i.meal === 'dinner' ? 'd' : null;
      if (!meal) return fail('meal must be breakfast, lunch or dinner');
      const v = i.portion === 'light' ? 1 : i.portion === 'overate' ? 3 : i.portion === 'normal' ? 2 : 0;
      const dm = { ...(f.meals[day] ?? {}) }; if (v) dm[meal] = v as 1 | 2 | 3; else delete dm[meal];
      return ok({ ...s, food: { ...f, meals: { ...f.meals, [day]: dm } } }, v ? _t("Приём пищи отмечен") : _t("Отметка снята"));
    }
    case 'mark_azkar': {
      const part = i.part === 'evening' ? 'e' : i.part === 'morning' ? 'm' : null; if (!part) return fail('part must be morning or evening');
      if (i.done === false) { const a = azkarOf(s); return ok({ ...s, azkar: { ...a, [part]: a[part].filter((d) => d !== day) } }, _t("Отметка азкаров снята")); }
      return ok(azkarDone(s, day, part), part === 'm' ? _t("Утренние азкары прочитаны") : _t("Вечерние азкары прочитаны"));
    }
    case 'set_quran_place': {
      const su = Math.round(Number(i.surah)), ay = Math.max(1, Math.round(Number(i.ayah) || 1));
      if (!(su >= 1 && su <= 114)) return fail('surah 1..114');
      const q = { translation: true, size: 1, ...(s.quran ?? {}), surah: su, ayah: ay };
      return ok({ ...s, quran: q }, _t("Коран: закладка на суре {0}, аят {1}", su, ay));
    }
    case 'set_book_page': {
      const b = (s.books ?? []).find((x) => x.id === i.book_id); if (!b) return fail('no such book');
      const pg = Math.round(Number(i.page)); if (!(pg >= 1 && pg <= b.pages)) return fail(`page 1..${b.pages}`);
      return ok({ ...s, books: s.books!.map((x) => (x.id === b.id ? { ...x, page: pg } : x)) }, _t("«{0}»: стр. {1} из {2}", b.title.slice(0, 40), pg, b.pages));
    }
    case 'ramadan': {
      const r = ramadanOf(s);
      const put = (patch: Partial<typeof r>, line: string) => ok({ ...s, ramadan: { ...r, ...patch } }, line);
      if (i.what === 'fast') {
        const m = ['fast', 'ill', 'travel', 'period', 'other', 'chronic'].includes(i.status as string) ? (i.status as FastMark) : 'fast';
        return put({ fasts: { ...r.fasts, [day]: m } }, m === 'fast' ? _t("Пост отмечен") : _t("День без поста отмечен"));
      }
      if (i.what === 'clear_fast') { const f = { ...r.fasts }; delete f[day]; return put({ fasts: f }, _t("Отметка поста снята")); }
      if (i.what === 'night') {
        const n = ['tarawih', 'tahajjud', 'itikaf'].includes(i.night as string) ? (i.night as string) : null; if (!n) return fail('night must be tarawih, tahajjud or itikaf');
        const l = r.nights[day] ?? [];
        return put({ nights: { ...r.nights, [day]: l.includes(n) ? l : [...l, n] } }, _t("Ночь отмечена: {0}", n === 'tarawih' ? _t("таравих") : n === 'tahajjud' ? _t("тахаджуд") : _t("иатикаф")));
      }
      if (i.what === 'qada') return put({ qada: r.qada.includes(day) ? r.qada : [...r.qada, day] }, _t("Возмещённый пост отмечен"));
      return fail('unknown what');
    }
    case 'quit_log': {
      const q = (s.quits ?? []).find((x) => x.id === i.quit_id && x.status === 'active'); if (!q) return fail('no such active «Хочу оставить» item');
      if (i.kind === 'urge') return ok(updQuit(s, q.id, (x) => ({ ...x, urges: [...x.urges, { day, at: Date.now() }].slice(-500) })), _t("«Тянуло, но удержался» · {0}", q.what.slice(0, 40)));
      if (i.kind === 'held') return ok(updQuit(s, q.id, (x) => ({ ...x, clean: x.clean.includes(day) ? x.clean : [...x.clean, day] })), _t("День без срыва · {0}", q.what.slice(0, 40)));
      if (i.kind === 'slip') {
        const cause = (Array.isArray(i.causes) ? i.causes : []).map((t) => S(t, 40)).filter(Boolean).slice(0, 5);
        return ok(updQuit(s, q.id, (x) => ({ ...x, clean: x.clean.filter((d) => d !== day), slips: [...x.slips.filter((sl) => sl.day !== day), { day, at: Date.now(), cause }].sort((a, b) => a.at - b.at).slice(-500) })), _t("Срыв записан · {0}", q.what.slice(0, 40)));
      }
      return fail('kind must be urge, held or slip');
    }
    case 'umrah': {
      const u: UmrahState = { prep: [], duas: [], tawaf: 0, saee: 0, ...(s.umrah ?? {}) };
      if (i.action === 'add_dua') { const t = S(i.text, 300); if (!t) return fail('empty dua'); return ok({ ...s, umrah: { ...u, duas: [...u.duas, { id: uid(), text: t, ...(S(i.for_whom, 60) ? { who: S(i.for_whom, 60) } : {}) }] } }, _t("Дуа для умры записано")); }
      if (i.action === 'tawaf' || i.action === 'saee') { const n = Math.round(Number(i.count)); if (!(n >= 0 && n <= 7)) return fail('count 0..7'); return ok({ ...s, umrah: { ...u, [i.action]: n } }, i.action === 'tawaf' ? _t("Таваф: круг {0} из 7", n) : _t("Сай: {0} из 7", n)); }
      return fail('unknown action');
    }
    case 'kid_task': {
      const fam = famOf(s); const k = fam.kids.find((x) => x.id === i.kid_id); if (!k) return fail('no such child');
      const t = k.tasks.find((x) => x.id === i.task_id); if (!t) return fail('no such task');
      const has = (k.log[day] ?? []).includes(t.id);
      if (has === (i.done !== false)) return ok(s, _t("{0}: «{1}» уже отмечено", k.name, t.t));
      return ok(toggleKidTask(s, k.id, day, t.id), i.done === false ? _t("{0}: отметка снята", k.name) : _t("{0}: «{1}» ✓", k.name, t.t));
    }
    case 'change_setting': {
      const st = { ...s.settings };
      const lines: string[] = [];
      if (['prayer', 'auto', 'light', 'dark'].includes(i.theme as string)) { st.theme = i.theme as typeof st.theme; lines.push(_t("тема")); }
      if (i.text_size === 'normal' || i.text_size === 'large' || i.text_size === 'larger') { st.textScale = i.text_size === 'normal' ? 1 : i.text_size === 'large' ? 1.1 : 1.2; lines.push(_t("размер текста")); }
      if (['normal', 'calm', 'phrases'].includes(i.words as string)) { st.words = i.words as typeof st.words; lines.push(_t("исламские фразы")); }
      if (i.me === 'brother' || i.me === 'sister') { st.me = i.me === 'brother' ? 'm' : 'f'; lines.push(_t("обращение")); }
      if (S(i.name, 40)) { st.name = S(i.name, 40); lines.push(_t("имя")); }
      if (i.madhab === 'hanafi' || i.madhab === 'shafi') { st.madhab = i.madhab; lines.push(_t("мазхаб для Асра")); }
      if (isAnchor(i.offset_prayer) && typeof i.offset_minutes === 'number' && Math.abs(i.offset_minutes) <= 60) { st.offsets = { ...(st.offsets ?? {}), [i.offset_prayer]: Math.round(i.offset_minutes) }; lines.push(_t("поправка {0}: {1} мин", ANCHOR_LABEL[i.offset_prayer].ru, Math.round(i.offset_minutes))); }
      if (!lines.length) return fail('nothing to change (language, city and notifications are changed by the person in Профиль)');
      return ok({ ...s, settings: st }, _t("Настройки: {0}", lines.join(', ')));
    }
    case 'memory': {
      if (s.settings.aiMemory === false) return fail('memory is switched off by the person in Профиль → Помощник → Память; tell them to switch it on');
      const t = S(i.text, 300).replace(/\s+/g, ' ');
      if (!t) return fail('empty text');
      const m = getMemory();
      const lines = m.text.split('\n').map((x) => x.trim()).filter(Boolean);
      const norm = (x: string) => x.replace(/^-\s*/, '').trim().toLowerCase();
      if (i.action === 'forget') {
        const keep = lines.filter((x) => !norm(x).includes(t.toLowerCase()));
        if (keep.length === lines.length) return fail('no line in the memory contains this text; use the exact words from assistant_memory');
        setMemory({ ...m, text: keep.join('\n'), at: Date.now() });
        return ok(s, _t("Забыла: {0}", t));
      }
      if (lines.some((x) => norm(x) === t.toLowerCase())) return ok(s, _t("Уже помню: {0}", t));
      const next = [`- ${t}`, ...lines].join('\n');
      if (next.length > 3000) return fail('memory is full (3000 characters); ask the person what to forget');
      setMemory({ ...m, text: next, at: Date.now() });
      return ok(s, _t("Запомнила: {0}", t), 'saved to the memory; it comes with every question from now on');
    }
    case 'delete_food': {
      const f = foodState(s);
      const items = f.log?.[day] ?? [];
      const it = items.find((x) => x.id === i.item_id); if (!it) return fail('no food item with this id on that day');
      return ok({ ...s, food: { ...f, log: { ...(f.log ?? {}), [day]: items.filter((x) => x.id !== it.id) } } }, _t("Убрано из питания: {0} {1} г", it.n, it.g));
    }
    case 'open_screen': {
      const g = SCREENS[S(i.screen, 40)]; if (!g) return fail('unknown screen');
      return { s, done: { ok: true, line: '', result: 'opening' }, go: g };
    }
  }
  return fail('unknown tool');
}

const foodState = (s: AppState): FoodState => ({ meals: {}, rules: ['sweet'], clean: {}, sunna: {}, weight: {}, ...(s.food ?? {}) });

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
