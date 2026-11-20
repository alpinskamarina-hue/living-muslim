// What the assistant knows about this person: a short plain-text summary built on the phone from the app's own data
// and sent with each question (it is not stored on the server). Only the person's own data, plus what their circle
// already sees (names and day totals); notes and the dua list stay out unless they belong to a goal the person keeps.
import type { AppState, Anchor } from './types';
import { ANCHORS, ANCHOR_LABEL } from './types';
import { addDays } from './dates';
import { isCounted, streak } from './store';
import { daysLeft, progressLabel, todayStep } from './goals';
import { dayPlan } from './dayplan';
import { catalog } from './videos';
import { myCircles, currentCircle } from './cloud';
import type { CircleApi } from './circle';
import type { DayTimes } from './prayer';

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const cut = (t: string, n = 140) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

export function buildContext(s: AppState, today: string, now: Date, times?: DayTimes, circle?: CircleApi): string {
  const L: string[] = [];
  const st = s.settings;
  L.push(`Today: ${today} (${now.toLocaleDateString('en-GB', { weekday: 'long' })}), local time ${hm(now)}. City: ${st.place || '—'}.`);
  if (st.name) L.push(`Name in the app: ${st.name}.`);
  if (st.path) L.push(`Path chosen at start: ${st.path === 'new' ? 'new Muslim' : st.path === 'back' ? 'returning to prayer after a break' : 'praying, wants consistency'}.`);

  // Prayers
  if (times) L.push(`Prayer times today: ${ANCHORS.map((a) => `${a} ${hm(times[a])}`).join(', ')} (sunrise ${hm(times.sunrise)}).`);
  const pm = s.prayers[today] ?? {};
  L.push(`Prayers marked today: ${ANCHORS.map((a) => `${a} ${pm[a] === 'ontime' ? 'on time' : pm[a] === 'late' ? 'late' : '—'}`).join(', ')}.`);
  let p7 = 0, on7 = 0, fj7 = 0;
  for (let i = 0; i < 7; i++) { const d = s.prayers[addDays(today, -i)] ?? {}; for (const a of ANCHORS) { if (d[a]) p7++; if (d[a] === 'ontime') on7++; } if (d.fajr) fj7++; }
  L.push(`Last 7 days: ${p7} of 35 prayers marked, ${on7} on time, Fajr on ${fj7} of 7 days.`);

  // Habits
  const act = s.habits.filter((h) => h.status === 'active');
  if (act.length) {
    L.push('', 'HABITS (after which prayer · habit · minimum · today · streak days · last 7 days):');
    for (const h of act) {
      let w = 0; for (let i = 0; i < 7; i++) if (isCounted(s.log[addDays(today, -i)]?.[h.id])) w++;
      const m = s.log[today]?.[h.id];
      L.push(`- [id:${h.id}] after ${ANCHOR_LABEL[h.anchor as Anchor].ru} · ${cut(h.action, 80)} · min: ${cut(h.min, 50)} · today: ${m === 'done' ? 'done' : m === 'min' ? 'minimum done' : m === 'later' ? 'postponed' : 'not yet'} · streak ${streak(s, h, today)} · ${w}/7${h.formed ? ' · formed' : ''}`);
    }
  } else L.push('', 'HABITS: none yet.');
  const queued = s.habits.filter((h) => h.status === 'queued');
  if (queued.length) L.push(`Habits waiting in the queue: ${queued.map((h) => `[id:${h.id}] ${cut(h.action, 60)}`).join('; ')}.`);

  // Goals
  const goals = s.goals ?? [];
  const live = goals.filter((g) => g.status !== 'done');
  if (live.length) {
    L.push('', 'GOALS:');
    for (const g of live) {
      const left = daysLeft(g, today);
      L.push(`- [id:${g.id}] «${cut(g.title, 90)}» (${g.source === 'steps' ? 'tracked by steps' : `counted automatically: ${g.source}`})${g.status === 'later' ? ' (postponed)' : ''} · progress: ${progressLabel(s, g, today)}${g.due ? ` · due ${g.due}${left != null ? ` (${left} days left)` : ''}` : ''}`);
      if (g.niyya) L.push(`  niyya: ${cut(g.niyya)}`);
      if (g.identity) L.push(`  identity: «${cut(g.identity, 90)}»`);
      if (g.steps?.length) L.push(`  steps: ${g.steps.map((x) => `[id:${x.id}] ${x.done ? '✓' : '○'} ${cut(x.text, 60)}`).join('; ')}`);
      if (g.habitIds.length) L.push(`  linked habits: ${g.habitIds.map((id) => s.habits.find((h) => h.id === id)?.action).filter(Boolean).map((t) => cut(t!, 50)).join('; ')}`);
      if (g.status === 'active') { const t = todayStep(s, g, today); L.push(`  today's step: ${t.text}${t.sub ? ` (${t.sub})` : ''}`); }
      const notes = (g.notes ?? []).slice(-3);
      if (notes.length) L.push(`  latest notes: ${notes.map((n) => `${n.day}: ${cut(n.text, 100)}`).join(' | ')}`);
    }
  } else L.push('', 'GOALS: none yet.');
  const done = goals.filter((g) => g.status === 'done');
  if (done.length) L.push(`Goals reached: ${done.map((g) => `[id:${g.id}] «${cut(g.title, 60)}»${g.doneAt ? ` (${g.doneAt})` : ''}`).join('; ')}.`);

  // Ideas
  const ideas = (s.ideas ?? []).slice(-15);
  if (ideas.length) L.push('', `MY IDEAS (newest last): ${ideas.map((x) => `[id:${x.id}] ${new Date(x.at).toISOString().slice(0, 10)}: ${cut(x.text, 120)}`).join(' | ')}`);

  // Today's plan («На сегодня»)
  try {
    const plan = dayPlan(s, today);
    if (plan.length) L.push('', `PLANNED FOR TODAY (not started yet): ${plan.map((p) => `${p.title}${p.sub ? ` — ${p.sub}` : ''}`).join('; ')}.`);
  } catch { /* plan is a nice-to-have */ }

  // Quitting bad habits
  const quits = (s.quits ?? []).filter((q) => q.status === 'active');
  if (quits.length) {
    L.push('', 'LEAVING BEHIND (bad habits, private):');
    for (const q of quits) {
      const last = q.slips.length ? q.slips[q.slips.length - 1].day : q.start;
      L.push(`- ${cut(q.what, 60)} · since ${q.start} · last slip ${q.slips.length ? last : 'none'} · resisted urges: ${q.urges.length}${q.instead ? ` · instead: ${cut(q.instead, 60)}` : ''}`);
    }
  }

  // Learning
  const v = s.videos;
  if (v?.started?.length) {
    const cat = catalog(true);
    L.push('', `COURSES started: ${v.started.map((id) => `${cut(cat.find((c) => c.id === id)?.title ?? id, 60)} (${v.byCourse?.[id]?.length ?? 0} lessons watched)`).join('; ')}.`);
  }
  if (s.quran) L.push(`Quran: stopped at surah ${s.quran.surah}, ayah ${s.quran.ayah}.`);
  if (s.books?.length) L.push(`Books: ${s.books.map((b) => `[id:${b.id}] ${cut(b.title, 50)} p. ${b.page}/${b.pages}`).join('; ')}.`);
  if (s.course) L.push(`English by days: day ${s.course.day}, ${s.course.learned.length} words learned.`);
  if (s.courseAr) L.push(`Arabic by days: day ${s.courseAr.day}, ${s.courseAr.learned.length} words learned.`);

  // Health, sadaqa, trip, umrah
  const hl = s.health;
  if (hl) {
    const parts = [hl.water?.[today] ? `water ${hl.water[today]}/${hl.waterGoal} glasses today` : '', hl.sleep?.[today] ? `slept ${hl.sleep[today].bed}–${hl.sleep[today].wake}` : '', hl.fasts?.[today] ? 'fasting today' : ''].filter(Boolean);
    if (parts.length) L.push(`Health: ${parts.join(', ')}.`);
  }
  const sd = s.sadaqa?.days;
  if (sd) { const m = today.slice(0, 7); const n = Object.entries(sd).filter(([d, x]) => d.startsWith(m) && (x.money || x.deed)).length; if (n) L.push(`Sadaqa: ${n} days this month${sd[today] ? ', given today' : ''}.`); }
  if (s.trip && s.trip.to >= today) L.push(`Travelling (safar): ${s.trip.place}, ${s.trip.from} to ${s.trip.to}.`);
  const u = s.umrah;
  if (u?.from) L.push(`Umrah trip: ${u.from}${u.to ? ` to ${u.to}` : ''}; preparation items done: ${u.prep?.length ?? 0}; duas on the list: ${u.duas?.length ?? 0}.`);

  // Circles
  const mine = myCircles();
  if (mine.length) {
    const cur = currentCircle();
    L.push('', `CIRCLES: ${mine.map((c) => `${c.title}${c.code === cur?.code ? ' (open now)' : ''}`).join('; ')}.`);
    if (circle?.status === 'ready' && circle.members.length) {
      const nm = (id: string) => circle.names[id]?.name || 'member';
      L.push(`In the open circle today (only day totals are shared): ${circle.members.map((m) => `${m.id === circle.me ? 'me' : nm(m.id)}: ${m.day === today ? `${m.prayers}/5 prayers, ${m.done}/${m.total} habits` : 'not marked today'}`).join('; ')}.`);
      const asks = circle.members.filter((m) => m.ask?.t && m.id !== circle.me).map((m) => `${nm(m.id)}: «${cut(m.ask!.t, 80)}»`);
      if (asks.length) L.push(`Dua requests in the circle: ${asks.join('; ')}.`);
    }
  }

  return L.join('\n').slice(0, 12000);
}
