// «На сегодня»: the practice items a person planned for today (habits that live in a practice, and goals' daily steps).
// An item leaves the list once it is started or the habit is ticked; the count lights up on the Practice and Goals tabs.
import type { AppState, Anchor, Goal, Habit } from './types';
import { ANCHORS } from './types';
import { isCounted } from './store';
import { todayStep } from './goals';
import { isCloud } from './cloud';
import { _t } from './i18n';
import { addDays } from './dates';
import { ANCHOR_LABEL } from './types';
import { azkarHabits, azkarNow } from './azkar';

export type PlanMode = 'azkar' | 'quran' | 'videos' | 'course' | 'course-ar' | 'langs' | 'books' | 'tasbih' | 'health' | 'umrah' | 'focus';
export interface PlanItem {
  key: string;            // h:<habitId> or g:<goalId>
  ic: string;
  title: string;
  sub: string;
  mode: PlanMode;
  ref?: string;           // video course id
  habitId?: string;       // ticking the habit when the practice ends
  anchor?: Anchor;
  min?: string;           // the minimum version, for «2 минуты»
}

const IC: Record<PlanMode, string> = { azkar: '🤲', quran: '📖', videos: '▶', course: '🇬🇧', 'course-ar': 'ع', langs: 'Aa', books: '📚', tasbih: '📿', health: '🌿', umrah: '🕋', focus: '⏱' };

/** Which practice a habit lives in, guessed from its name (English is checked before «урок», so «урок английского» goes to the course). */
export function modeOfHabit(h: Habit, s: AppState): PlanMode | null {
  const a = h.action.toLowerCase();
  if (/араб|arabic/.test(a)) return s.courseAr ? 'course-ar' : 'langs';
  if (/англ|english|язык|слов|language|word/.test(a)) return s.course ? 'course' : 'langs';
  if (/коран|аят|сур[аыу]|quran|qur'an|ayah|surah/.test(a)) return 'quran';
  if (isCloud && /видео|ролик|урок|курс|лекци|video|lesson|course|lecture/.test(a)) return 'videos';
  if (/книг|чита|страниц|глав|book|read|page|chapter/.test(a)) return 'books';
  if (/азкар|adhkar|azkar/.test(a) || (/зикр|dhikr/.test(a) && /утр|вечер|morning|evening/.test(a))) return 'azkar';
  if (/тасбих|зикр|dhikr|tasbih/.test(a)) return 'tasbih';
  if (/трениров|спорт|зарядк|бег|отжим|workout|exercise|run|sport/.test(a)) return 'health';
  return null;
}

const GOAL_MODE: Partial<Record<string, PlanMode>> = { quran: 'quran', books: 'books', course: 'course', videos: 'videos', health: 'health', umrah: 'umrah' };

export const startedOf = (s: AppState, today: string) => s.started?.[today] ?? [];
/** Remember a started item for today; days before yesterday are dropped. */
export function markStarted(s: AppState, today: string, key: string): AppState {
  const cur = startedOf(s, today);
  if (cur.includes(key)) return s;
  const keep = Object.fromEntries(Object.entries(s.started ?? {}).filter(([d]) => d >= addDays(today, -1) && d < today));
  return { ...s, started: { ...keep, [today]: [...cur, key] } };
}

/** Everything planned for today in Practice, in prayer order, not yet started. */
export function dayPlan(s: AppState, today: string): PlanItem[] {
  const started = startedOf(s, today);
  const out: PlanItem[] = [];
  const modes = new Set<PlanMode>();
  const habits = s.habits.filter((h) => h.status === 'active').sort((a, b) => ANCHORS.indexOf(a.anchor) - ANCHORS.indexOf(b.anchor));
  // Adhkar in their time (morning from Fajr, evening from Asr) until read or started.
  const az = azkarNow(s, today);
  const azKey = `az:${az.part}`;
  const azHabit = azkarHabits(s, az.part)[0];
  for (const h of habits) {
    const m = modeOfHabit(h, s);
    if (m === 'azkar' && h.id !== azHabit?.id) continue;
    if (m === 'azkar' && (!az.live || az.done)) continue;
    if (!m || isCounted(s.log[today]?.[h.id]) || started.includes(`h:${h.id}`)) continue;
    modes.add(m);
    out.push({ key: `h:${h.id}`, ic: IC[m], title: h.action, sub: _t("{0} · минимум: {1}", afterLabel(h.anchor), h.min), mode: m, habitId: h.id, anchor: h.anchor, min: h.min });
  }
  if (az.live && !az.done && !azHabit && !started.includes(azKey)) {
    out.push({ key: azKey, ic: az.part === 'm' ? '☀️' : '🌙', title: az.part === 'm' ? _t("Утренние азкары") : _t("Вечерние азкары"), sub: az.line, mode: 'azkar' });
  }
  for (const g of (s.goals ?? []).filter((x) => x.status === 'active')) {
    const st = todayStep(s, g, today);
    const m = GOAL_MODE[st.action];
    if (!m || started.includes(`g:${g.id}`)) continue;
    // A habit for the same practice already covers this goal today.
    if (modes.has(m) && m !== 'videos') continue;
    out.push({ key: `g:${g.id}`, ic: IC[m], title: st.text, sub: _t("Цель: {0}", g.title), mode: m, ref: st.ref });
  }
  return out;
}

/** Active goals that have a step for today and were not touched yet (the Goals tab count). */
export function goalsWaiting(s: AppState, today: string): Goal[] {
  const started = startedOf(s, today);
  return (s.goals ?? []).filter((g) => g.status === 'active' && !started.includes(`g:${g.id}`) && todayStep(s, g, today).action !== 'today');
}

const afterLabel = (a: Anchor) => ANCHOR_LABEL[a].after.replace(_t("После"), _t("после"));
