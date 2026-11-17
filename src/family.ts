import type { Anchor, AppState, FamilyState, Kid } from './types';
import type { KidSummary, Member } from './circle';
import { addDays } from './dates';
import { dayLight } from './gamify';
import { uid } from './store';

export const famOf = (s: AppState): FamilyState => ({ kids: [], together: {}, ...(s.family ?? {}) });
export const patchF = (s: AppState, fn: (f: FamilyState) => Partial<FamilyState>): AppState => {
  const f = famOf(s);
  return { ...s, family: { ...f, ...fn(f) } };
};

/** Starter tasks by age; the parent picks up to five. */
export const KID_TASKS: { max: number; list: { t: string; icon: string }[] }[] = [
  { max: 6, list: [
    { t: 'Бисмиллях перед едой', icon: '🍽️' }, { t: 'Салям при встрече', icon: '👋' }, { t: 'Убрать игрушки', icon: '🧸' },
    { t: 'Дуа перед сном', icon: '🌙' }, { t: 'Помочь маме', icon: '❤️' }, { t: 'Послушать суру', icon: '🎧' },
  ] },
  { max: 10, list: [
    { t: 'Намаз вместе', icon: '🕌' }, { t: 'Выучить аят', icon: '📖' }, { t: 'Помочь дома', icon: '🧹' },
    { t: 'Дуа перед сном', icon: '🌙' }, { t: 'Доброе дело другу', icon: '🤝' }, { t: 'Почитать книгу', icon: '📚' },
  ] },
  { max: 99, list: [
    { t: 'Пять намазов', icon: '🕌' }, { t: 'Коран: 1 страница', icon: '📖' }, { t: 'Помочь родителям', icon: '🤲' },
    { t: 'Час без телефона', icon: '📵' }, { t: 'Садака или доброе дело', icon: '💝' }, { t: 'Утренние азкары', icon: '☀️' },
  ] },
];
export const tasksFor = (age: number) => KID_TASKS.find((g) => age <= g.max)!.list;

/** Sticker album: one sticker for every 3 tasks done. Stories every child can be told. */
export const STICKERS: { icon: string; t: string }[] = [
  { icon: '🐋', t: 'Юнус и кит' }, { icon: '🚢', t: 'Ковчег Нуха' }, { icon: '🐜', t: 'Сулейман и муравей' },
  { icon: '🕷️', t: 'Паук у пещеры Саур' }, { icon: '🐪', t: 'Верблюдица Салиха' }, { icon: '🐦', t: 'Удод Сулеймана' },
  { icon: '🔥', t: 'Огонь стал прохладой для Ибрахима' }, { icon: '🐺', t: 'Юсуф и братья' }, { icon: '🐄', t: 'Корова Мусы' },
  { icon: '🐶', t: 'Собака людей пещеры' }, { icon: '🌊', t: 'Море расступилось перед Мусой' }, { icon: '⭐', t: 'Ибрахим и звёзды' },
  { icon: '🌴', t: 'Марьям и финиковая пальма' }, { icon: '🐘', t: 'Год слона' }, { icon: '🌙', t: 'Ночь могущества' },
];
export const KID_COLORS = ['#e3a23c', '#4a86c5', '#8fc46a', '#b06ad0', '#e0705a', '#3fa7a0'];

export const kidDone = (k: Kid) => Object.values(k.log).reduce((n, l) => n + l.length, 0);
export const kidStickers = (k: Kid) => Math.min(STICKERS.length, Math.floor(kidDone(k) / 3));

export function newKid(name: string, age: number, n: number): Kid {
  return {
    id: uid(), name: name.trim(), age, color: KID_COLORS[n % KID_COLORS.length], created: new Date().toISOString().slice(0, 10),
    tasks: tasksFor(age).slice(0, 3).map((x) => ({ id: uid(), ...x })), log: {},
  };
}

export function toggleKidTask(s: AppState, kidId: string, day: string, taskId: string): AppState {
  return patchF(s, (f) => ({
    kids: f.kids.map((k) => {
      if (k.id !== kidId) return k;
      const l = k.log[day] ?? [];
      return { ...k, log: { ...k.log, [day]: l.includes(taskId) ? l.filter((x) => x !== taskId) : [...l, taskId] } };
    }),
  }));
}

export function toggleTogether(s: AppState, day: string, a: Anchor): AppState {
  return patchF(s, (f) => {
    const l = f.together[day] ?? [];
    return { together: { ...f.together, [day]: l.includes(a) ? l.filter((x) => x !== a) : [...l, a] } };
  });
}

/** My counted days among the last n. */
export function myLitDays(s: AppState, today: string, n = 120) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) { const d = addDays(today, -i); if (dayLight(s, d).lit) out.push(d); }
  return out;
}

const kidLit = (k: Kid, today: string, n = 120) => {
  const from = addDays(today, -(n - 1));
  return Object.keys(k.log).filter((d) => d >= from && k.log[d].length > 0).sort();
};

export function kidSummaries(s: AppState, today: string): KidSummary[] {
  return famOf(s).kids.map((k) => ({
    id: k.id, name: k.name, age: k.age, color: k.color,
    done: (k.log[today] ?? []).filter((id) => k.tasks.some((t) => t.id === id)).length,
    total: k.tasks.length, lit: kidLit(k, today), stickers: kidStickers(k),
  }));
}

export function togWeek(s: AppState, today: string) {
  const t = famOf(s).together;
  let n = 0;
  for (let i = 0; i < 7; i++) n += (t[addDays(today, -i)] ?? []).length;
  return n;
}

/** Everyone in the family who keeps a record: adults who share their days, and every child. */
export function participants(members: Member[]) {
  const out: { id: string; name?: string; color: string; lit: string[]; kid?: boolean; ownerId: string }[] = [];
  for (const m of members) {
    if (m.lit) out.push({ id: m.id, color: '', lit: m.lit, ownerId: m.id });
    for (const k of m.kids ?? []) out.push({ id: k.id, name: k.name, color: k.color, lit: k.lit, kid: true, ownerId: m.id });
  }
  return out;
}

/**
 * Family days: days when every member who keeps a record had a counted day.
 * Someone counts from their first recorded day, so a new child does not erase the past.
 */
export function familyDays(members: Member[], today: string) {
  const ps = participants(members).filter((p) => p.lit.length);
  if (!ps.length) return { days: 0, list: [] as string[] };
  const sets = ps.map((p) => ({ first: p.lit[0], set: new Set(p.lit) }));
  const list: string[] = [];
  for (let i = 119; i >= 0; i--) {
    const d = addDays(today, -i);
    const due = sets.filter((x) => x.first <= d);
    if (due.length && due.every((x) => x.set.has(d))) list.push(d);
  }
  return { days: list.length, list };
}
