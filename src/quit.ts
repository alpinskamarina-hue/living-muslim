// «Хочу оставить»: breaking a bad habit. Private to the device: never sent to the circle or the server.
// Clean days are counted from the last slip; resisted urges are wins of their own; a slip opens tawba, not a reset of the past.
import type { AppState } from './types';
import { addDays, daysBetween } from './dates';
import { _t } from './i18n';

export interface Quit {
  id: string;
  what: string;
  niyya: string;
  triggers: string[];
  instead: string;
  barriers: { t: string; done: boolean }[];
  start: string;                                    // day the person began
  status: 'active' | 'archived';
  slips: { day: string; at: number; cause: string[] }[];
  urges: { day: string; at: number }[];             // «Тянет» pressed and resisted
  clean: string[];                                  // days answered «удержался» in the evening
}

/** Templates: the thing, a ready niyya idea, likely triggers, a replacement and barriers. */
export const TEMPLATES: { what: string; triggers: string[]; instead: string; barriers: string[] }[] = [
  { what: _t("Телефон после Иши"), triggers: [_t("В кровати"), _t("Один"), _t("Устал")], instead: _t("1 страница книги и азкары перед сном"), barriers: [_t("Заряжать телефон на кухне"), _t("Купить обычный будильник"), _t("Ограничение экрана после 22:00")] },
  { what: _t("Сладкое"), triggers: [_t("После еды"), _t("Устал"), _t("Скучно")], instead: _t("Финики или фрукт, стакан воды"), barriers: [_t("Не держать сладкое дома"), _t("Не ходить в магазин голодным")] },
  { what: _t("Курение"), triggers: [_t("С кофе"), _t("С друзьями"), _t("Стресс")], instead: _t("Выйти пройтись 5 минут, вода, зикр"), barriers: [_t("Выбросить сигареты и зажигалку"), _t("Сказать близким, что бросаю"), _t("Обходить место, где куришь")] },
  { what: _t("Злословие (гыйба)"), triggers: [_t("С друзьями"), _t("После ссоры"), _t("В чатах")], instead: _t("Сказать о человеке хорошее или промолчать"), barriers: [_t("Выходить из разговора о других"), _t("Сделать дуа за того, о ком хотел сказать")] },
  { what: _t("Сон после Фаджра"), triggers: [_t("Лёг поздно"), _t("В кровати"), _t("Устал")], instead: _t("Коран или прогулка 10 минут после намаза"), barriers: [_t("Свет и умыться сразу после намаза"), _t("Лечь до 23:00")] },
  { what: _t("Откладывать намаз"), triggers: [_t("За работой"), _t("Телефон в руках"), _t("Устал")], instead: _t("Встать на азан сразу, дела после"), barriers: [_t("Напоминание на азан включено"), _t("Коврик на виду")] },
  { what: _t("Хранить взгляд"), triggers: [_t("Один"), _t("Ночью"), _t("Скучно")], instead: _t("Омовение и 2 ракаата"), barriers: [_t("Телефон не в спальне"), _t("Фильтр контента на телефоне"), _t("Отписаться от лишних аккаунтов")] },
];
export const TRIGGERS = [_t("В кровати"), _t("Один"), _t("Устал"), _t("Скучно"), _t("После ссоры"), _t("С друзьями"), _t("Стресс"), _t("Ночью"), _t("Телефон в руках"), _t("Лёг поздно")];

export const quitsOf = (s: AppState) => s.quits ?? [];
export const activeQuits = (s: AppState) => quitsOf(s).filter((q) => q.status === 'active');

export function lastSlip(q: Quit) { return q.slips.length ? q.slips[q.slips.length - 1].day : null; }

/** Clean days in a row: full days since the last slip (or the start), plus today once answered «удержался». */
export function cleanDays(q: Quit, today: string) {
  const ls = lastSlip(q);
  const base = ls ?? addDays(q.start, -1);
  const n = daysBetween(base, today) - 1 + (q.clean.includes(today) && ls !== today ? 1 : 0);
  return Math.max(0, n);
}

/** Best run: the longest gap between slips, the current run included. */
export function bestRun(q: Quit, today: string) {
  let best = cleanDays(q, today);
  let prev = addDays(q.start, -1);
  for (const s of q.slips) { best = Math.max(best, daysBetween(prev, s.day) - 1); prev = s.day; }
  return best;
}

export const urgesThisWeek = (q: Quit, today: string) => q.urges.filter((u) => u.day > addDays(today, -7)).length;
export const slippedToday = (q: Quit, today: string) => q.slips.some((s) => s.day === today);
export const answeredToday = (q: Quit, today: string) => q.clean.includes(today) || slippedToday(q, today);

const MILESTONES = [3, 7, 14, 21, 40, 60, 90, 180, 365];
export const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? n + 100;

/** Day states for the calendar: before start, slip, resisted, clean, today. */
export function dayMarks(q: Quit, today: string, n = 28) {
  const out: { day: string; k: 'none' | 'slip' | 'urge' | 'clean' | 'today' }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    let k: 'none' | 'slip' | 'urge' | 'clean' | 'today' = 'none';
    if (d < q.start) k = 'none';
    else if (q.slips.some((s) => s.day === d)) k = 'slip';
    else if (q.urges.some((u) => u.day === d)) k = 'urge';
    else if (d < today || q.clean.includes(d)) k = 'clean';
    else k = 'today';
    out.push({ day: d, k });
  }
  return out;
}

export const BUCKETS = [
  { id: 'morning', t: _t("Утро"), from: 5, to: 11 },
  { id: 'day', t: _t("День"), from: 11, to: 17 },
  { id: 'evening', t: _t("Вечер"), from: 17, to: 21 },
  { id: 'late', t: _t("21–00"), from: 21, to: 24 },
  { id: 'night', t: _t("Ночь"), from: 0, to: 5 },
];
const bucketOf = (at: number) => { const h = new Date(at).getHours(); return BUCKETS.find((b) => h >= b.from && h < b.to) ?? BUCKETS[4]; };

/** When it pulls (urges and slips by time of day) and what came before slips. */
export function triggerMap(q: Quit) {
  const events = [...q.urges.map((u) => u.at), ...q.slips.map((s) => s.at)];
  const byTime = BUCKETS.map((b) => ({ ...b, n: events.filter((at) => bucketOf(at).id === b.id).length }));
  const causes: Record<string, number> = {};
  for (const s of q.slips) for (const c of s.cause) causes[c] = (causes[c] ?? 0) + 1;
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]);
  const peak = [...byTime].sort((a, b) => b.n - a.n)[0];
  return { events: events.length, byTime, causes: top, peak: peak.n ? peak : null };
}

export const newQuitId = () => 'q' + Date.now().toString(36);

export function updQuit(s: AppState, id: string, fn: (q: Quit) => Quit): AppState {
  return { ...s, quits: quitsOf(s).map((q) => (q.id === id ? fn(q) : q)) };
}
