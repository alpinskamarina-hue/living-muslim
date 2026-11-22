// The study circle «Учёба»: what the circle learns and at what pace, the teachers, each member's place and revision,
// hand-ins (recitations and homework) with the teacher's marks, «Сажусь учить», questions, lesson notes and the
// Friday quiz. Server: supabase/study.sql (lessons in «Занятия» use biz-work.sql). Until study.sql is run,
// studyReady() is false and the circle stays a plain chat.
import { useCallback, useEffect, useState } from 'react';
import type { Anchor } from './types';
import { isCloud, meRpc, serverHas } from './cloud';
import { surahAyahs, surahName } from './goals';
import { setPlans, type Plan } from './plans';
import { plural } from './dates';
import { _t, _tj } from './i18n';

export type Subj = 'hifz' | 'tajwid' | 'arabic' | 'book' | 'course' | 'own';
export interface StPlan { subj?: Subj; title?: string; refs?: number[]; total?: number; unit?: string; pace?: number; per?: 'd' | 'w'; start?: string }
export interface StProg { uid: string; pos: number; day: string | null; streak: number; rev: Record<string, { d?: string; l?: number; w?: number }>; cert_by: string | null; cert_at: string | null }
export interface StTask { id: number; title: string; body: string; due: string | null; due_p: Anchor | null; by: string | null; created: string }
export interface StRef { s: number; a1: number; a2: number }
export type SubStatus = 'wait' | 'ok' | 'redo';
export interface StSub { id: number; uid: string; label: string; ref: StRef | null; msg: number | null; task: number | null; body: string; status: SubStatus; marks: number[]; note: string; checker: string | null; created: string; checked: string | null }
export interface StLive { uid: string; what: string; mins: number; started: string; id: number }
export interface StQ { id: number; uid: string | null; anon: boolean; priv: boolean; mine: boolean; body: string; tag: string; too: number; too_me: boolean; answer: string; ans_msg: number | null; ans_by: string | null; ans_at: string | null; pinned: boolean; created: string }
export interface StCard { a: string; t: string }
export interface StNote { id: number; title: string; day: string; body: string; points: string[]; cards: StCard[]; checked: boolean; has_ai: boolean; by: string | null; created: string }
export interface StQuizQ { q: string; o: string[]; ok?: number; src?: string }
export interface StQuiz { week: string; by: string | null; qs: StQuizQ[]; mine: number[] | null; n: number; right: number[] | null }
export interface StData {
  me: { teacher: boolean; lead: boolean; owner: boolean };
  state: { plan: StPlan; teachers: string[]; goal_min: number };
  prog: StProg[]; tasks: StTask[]; subs: StSub[]; live: StLive[]; days: { day: string; min: number }[]; mine_min: number;
  qs: StQ[]; notes: StNote[]; quiz: StQuiz | null;
}

let readyP: Promise<boolean> | null = null;
export function studyReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.study') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_st_get', { p_uid: null, p_token: null, p_code: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.study', '1'); } catch { /* */ }
    return ok;
  });
  return readyP;
}
export function useStudyReady(on: boolean) {
  const [ok, setOk] = useState(false);
  useEffect(() => { if (on) studyReady().then(setOk); }, [on]);
  return ok && on;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
function norm(r: Partial<StData>): StData {
  return {
    me: r.me ?? { teacher: false, lead: false, owner: false },
    state: { plan: (r.state?.plan && typeof r.state.plan === 'object' ? r.state.plan : {}) as StPlan, teachers: arr<string>(r.state?.teachers), goal_min: r.state?.goal_min ?? 0 },
    prog: arr<StProg>(r.prog).map((p) => ({ ...p, rev: p.rev && typeof p.rev === 'object' ? p.rev : {} })),
    tasks: arr(r.tasks), subs: arr<StSub>(r.subs).map((s) => ({ ...s, marks: arr<number>(s.marks) })), live: arr(r.live), days: arr(r.days), mine_min: r.mine_min ?? 0,
    qs: arr(r.qs), notes: arr<StNote>(r.notes).map((n) => ({ ...n, points: arr<string>(n.points), cards: arr<StCard>(n.cards) })),
    quiz: r.quiz ? { ...r.quiz, qs: arr<StQuizQ>(r.quiz.qs), mine: Array.isArray(r.quiz.mine) ? r.quiz.mine : null, right: Array.isArray(r.quiz.right) ? r.quiz.right : null } : null,
  };
}

/** One study circle, refreshed every 20 s while the page is visible and right after each change. */
export function useStudy(code: string | undefined, on: boolean) {
  const [data, setData] = useState<StData | null>(null);
  const load = useCallback(async () => {
    if (!code) return;
    const r = await meRpc<Partial<StData> | null>('lm_st_get', { p_code: code }).catch(() => null);
    if (r) setData(norm(r));
  }, [code]);
  useEffect(() => {
    setData(null);
    if (!on || !code) return;
    let alive = true, t: number | undefined;
    const tick = async () => { if (!alive) return; if (document.visibilityState === 'visible') await load(); t = window.setTimeout(tick, 20000); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [code, on, load]);
  const call = async <T,>(fn: string, args: Record<string, unknown>) => { const r = await meRpc<T>(fn, { p_code: code, ...args }).catch(() => null); await load(); return r; };
  return {
    data, reload: load, code,
    set: (p: { plan?: StPlan; teachers?: string[]; goal_min?: number }) => call<boolean>('lm_st_set', { p }),
    prog: (p: Partial<Pick<StProg, 'pos' | 'day' | 'streak' | 'rev'>>) => call<boolean>('lm_st_prog', { p }),
    cert: (target: string, onOff: boolean) => call<boolean>('lm_st_cert', { p_target: target, p_on: onOff }),
    setTask: (id: number, p: Partial<StTask> | null) => call<number>('lm_st_task_set', { p_id: id, p }),
    sub: (id: number, p: { label: string; ref?: StRef | null; msg?: number | null; task?: number | null; body?: string } | null) => call<number>('lm_st_sub', { p_id: id, p }),
    check: (id: number, status: SubStatus, marks: number[], note: string) => call<boolean>('lm_st_check', { p_id: id, p_status: status, p_marks: marks, p_note: note }),
    focus: (act: 'start' | 'stop', mins = 25, what = '') => call<number>('lm_st_focus', { p_act: act, p_mins: mins, p_what: what }),
    ask: (p: { body: string; anon?: boolean; priv?: boolean; tag?: string } | null, id = 0) => call<number>('lm_st_q', { p_id: id, p }),
    too: (id: number) => call<boolean>('lm_st_q_too', { p_id: id }),
    answer: (id: number, p: { answer?: string; msg?: number | null; pin?: boolean; tag?: string }) => call<boolean>('lm_st_q_answer', { p_id: id, p }),
    setNote: (id: number, p: Partial<StNote> | null) => call<number>('lm_st_note_set', { p_id: id, p }),
    setQuiz: (week: string, qs: StQuizQ[] | null) => call<boolean>('lm_st_quiz_set', { p_week: week, p_qs: qs }),
    answerQuiz: (week: string, ans: number[]) => call<boolean>('lm_st_quiz_ans', { p_week: week, p_ans: ans }),
  };
}
export type StApi = ReturnType<typeof useStudy>;

// ——— dates ———
const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (k: string, n: number) => { const d = D(k); d.setDate(d.getDate() + n); return keyOf(d); };
export const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 864e5);
/** The Friday of the quiz: today when Friday, else the next one. */
export const quizFriday = (today: string) => { const d = D(today); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return keyOf(d); };

// ——— what we learn ———
export const SUBJ = (): { k: Subj; t: string; ic: string; unit: string }[] => [
  { k: 'hifz', t: _t("Хифз"), ic: '🕋', unit: 'ayah' },
  { k: 'tajwid', t: _t("Таджвид"), ic: '🎙', unit: 'lesson' },
  { k: 'arabic', t: _t("Арабский"), ic: 'ض', unit: 'lesson' },
  { k: 'book', t: _t("Книга"), ic: '📖', unit: 'page' },
  { k: 'course', t: _t("Курс"), ic: '🎓', unit: 'lesson' },
  { k: 'own', t: _t("Своё"), ic: '✏️', unit: 'step' },
];
/** Ready-made sets for hifz, in the order people usually learn them (from the short surahs up). */
export const HIFZ_PLANS = (): { id: string; t: string; refs: number[] }[] => [
  { id: 'last10', t: _t("Последние 10 сур"), refs: [114, 113, 112, 111, 110, 109, 108, 107, 106, 105] },
  { id: 'amma', t: _t("Джуз Амма (30-й джуз)"), refs: Array.from({ length: 37 }, (_, i) => 114 - i) },
  { id: 'tabarak', t: _t("Джуз Табарак (29-й джуз)"), refs: [77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67] },
  { id: 'mulk', t: _t("Аль-Мульк"), refs: [67] },
  { id: 'kahf', t: _t("Аль-Кахф"), refs: [18] },
  { id: 'yasin', t: _t("Йа Син"), refs: [36] },
  { id: 'baqara', t: _t("Аль-Бакара"), refs: [2] },
];
export const UNIT_L: Record<string, () => [string, string, string]> = {
  ayah: () => [_t("аят"), _t("аятов"), _t("аята")], lesson: () => [_t("урок"), _t("уроков"), _t("урока")], page: () => [_t("страница"), _t("страниц"), _t("страницы")],
  chapter: () => [_t("глава"), _t("глав"), _t("главы")], step: () => [_t("шаг"), _t("шагов"), _t("шага")],
};
/** «аятов», or with a number the right form: 564 аята, 21 урок. */
export const unitMany = (p: Pick<StPlan, 'unit'>, n?: number) => { const u = (UNIT_L[p.unit ?? 'step'] ?? UNIT_L.step)(); return n == null ? u[1] : plural(n, u[0], u[2], u[1]); };
export const hifzTotal = (refs: number[]) => refs.reduce((a, s) => a + surahAyahs(s), 0);
export const hasPlan = (p: StPlan) => Boolean(p.subj && (p.total ?? 0) > 0);

/** The (n)th ayah of a hifz plan (1-based) as surah + ayah. */
export function ayahAt(refs: number[], n: number): { s: number; a: number } | null {
  let left = n;
  for (const s of refs) { const c = surahAyahs(s); if (left <= c) return { s, a: left }; left -= c; }
  return null;
}
/** Units from..to of the plan as words: «Ан-Наба 11–15», «урок 4», «стр. 21–30». */
export function rangeLabel(p: StPlan, from: number, to: number): string {
  if (from > to) return '';
  if (p.subj === 'hifz' && p.refs?.length) {
    const parts: string[] = [];
    let i = from;
    while (i <= to) {
      const a = ayahAt(p.refs, i); if (!a) break;
      const left = surahAyahs(a.s) - a.a; const end = Math.min(to, i + left);
      const b = a.a + (end - i);
      parts.push(a.a === 1 && b === surahAyahs(a.s) ? surahName(a.s) : `${surahName(a.s)} ${a.a === b ? a.a : `${a.a}–${b}`}`);
      i = end + 1;
    }
    return parts.join(', ');
  }
  const u = p.unit ?? 'step';
  const one = u === 'page' ? _t("стр.") : (UNIT_L[u] ?? UNIT_L.step)()[0];
  return from === to ? `${one} ${from}` : `${one} ${from}–${to}`;
}
/** The hifz ranges of one stretch, one per surah (for hand-ins). */
export function refsOf(p: StPlan, from: number, to: number): StRef[] {
  if (p.subj !== 'hifz' || !p.refs?.length) return [];
  const out: StRef[] = [];
  for (let i = from; i <= to;) {
    const a = ayahAt(p.refs, i); if (!a) break;
    const end = Math.min(to, i + surahAyahs(a.s) - a.a);
    out.push({ s: a.s, a1: a.a, a2: a.a + (end - i) });
    i = end + 1;
  }
  return out;
}
export const refLabel = (r: StRef) => `${surahName(r.s)} ${r.a1 === r.a2 ? r.a1 : `${r.a1}–${r.a2}`}`;

/** How far everyone should be by today, and how many units a step is. */
export function expectedPos(p: StPlan, today: string): number {
  if (!hasPlan(p) || !p.start) return 0;
  const days = Math.max(0, daysBetween(p.start, today));
  const steps = p.per === 'w' ? Math.floor(days / 7) : days;
  return Math.min(p.total!, steps * (p.pace ?? 1));
}
/** Weeks the plan takes at its pace. */
export function planWeeks(p: StPlan): number {
  if (!hasPlan(p)) return 0;
  const steps = Math.ceil(p.total! / Math.max(1, p.pace ?? 1));
  return p.per === 'w' ? steps : Math.max(1, Math.ceil(steps / 7));
}
/** How many days (or weeks) behind the plan: 0 when on time. */
export function lagOf(p: StPlan, pos: number, today: string): number {
  const exp = expectedPos(p, today);
  if (pos >= exp) return 0;
  return Math.floor((exp - pos) / Math.max(1, p.pace ?? 1));
}
export const doneToday = (pr: StProg | undefined, today: string) => pr?.day === today;
/** My next step: units from..to. */
export function nextStep(p: StPlan, pos: number): [number, number] | null {
  if (!hasPlan(p) || pos >= p.total!) return null;
  return [pos + 1, Math.min(p.total!, pos + (p.pace ?? 1))];
}

// ——— revision (мураджаа) for hifz ———
const GAP = [1, 2, 4, 7, 14, 30];
/** Surahs I learned fully (or started), in plan order. */
export function learnedSurahs(p: StPlan, pos: number): number[] {
  if (p.subj !== 'hifz' || !p.refs?.length) return [];
  const out: number[] = []; let n = 0;
  for (const s of p.refs) { const c = surahAyahs(s); if (n + c <= pos) out.push(s); n += c; }
  return out;
}
export interface RevItem { s: number; tag: 'ok' | 'gap' | 'weak' | 'new'; days: number }
/** Up to 3 surahs to repeat today, most needed first. */
export function revisionToday(p: StPlan, pr: StProg | undefined, today: string): RevItem[] {
  const learned = learnedSurahs(p, pr?.pos ?? 0);
  const rev = pr?.rev ?? {};
  const items = learned.map((s) => {
    const r = rev[s] ?? {};
    const days = r.d ? daysBetween(r.d, today) : 99;
    const gap = r.w ? 1 : GAP[Math.min(GAP.length - 1, r.l ?? 0)];
    const due = days >= gap;
    const tag: RevItem['tag'] = r.w ? 'weak' : !r.d ? 'new' : days >= 3 ? 'gap' : 'ok';
    return { s, tag, days, due, over: days - gap };
  }).filter((x) => x.due).sort((a, b) => (b.tag === 'weak' ? 1 : 0) - (a.tag === 'weak' ? 1 : 0) || b.over - a.over);
  return items.slice(0, 3).map(({ s, tag, days }) => ({ s, tag, days }));
}
export const revDoneToday = (pr: StProg | undefined, s: number, today: string) => pr?.rev?.[s]?.d === today;
/** Marks one surah as repeated today: the gap grows, a weak surah stays weak until the teacher accepts it. */
export function revMark(rev: StProg['rev'], s: number, today: string): StProg['rev'] {
  const r = rev[s] ?? {};
  return { ...rev, [s]: { ...r, d: today, l: Math.min(GAP.length - 1, (r.l ?? 0) + (r.d === today ? 0 : 1)) } };
}
/** Teacher's marks change my revision: a mistake makes the surah weak, «принято» makes it strong again. */
export function revFromSubs(rev: StProg['rev'], subs: StSub[], me: string): StProg['rev'] | null {
  let next = rev, changed = false;
  for (const x of [...subs].filter((y) => y.uid === me && y.ref && y.checked).sort((a, b) => a.id - b.id)) {
    const s = x.ref!.s, r = next[s] ?? {};
    const at = x.checked!.slice(0, 10);
    if ((r as { c?: string }).c && (r as { c?: string }).c! >= `${at}#${x.id}`) continue;
    const mark = `${at}#${x.id}`;
    if (x.status === 'redo' || x.marks.length) next = { ...next, [s]: { ...r, w: 1, l: 0, c: mark } as StProg['rev'][string] };
    else if (x.status === 'ok') next = { ...next, [s]: { ...r, w: 0, c: mark } as StProg['rev'][string] };
    else continue;
    changed = true;
  }
  return changed ? next : null;
}

// ——— «Сажусь учить» ———
export const liveLeft = (l: StLive, now = Date.now()) => Math.max(0, Date.parse(l.started) + l.mins * 60000 - now);
export const hhmm = (min: number) => (min >= 60 ? _tj("{0} ч {1} мин", Math.floor(min / 60), min % 60).replace(/ 0 мин$/, '') : _tj("{0} мин", min));

// ——— questions ———
export const Q_TAGS = (): string[] => [_t("таджвид"), _t("хифз"), _t("арабский"), _t("фикх"), _t("акыда"), _t("другое")];

// ——— quiz from the cards of the week's notes ———
export function quizFromCards(notes: StNote[], today: string): StQuizQ[] {
  const cards = notes.filter((n) => daysBetween(n.day, today) <= 7).flatMap((n) => n.cards).filter((c) => c.a && c.t);
  const backs = [...new Set(cards.map((c) => c.t))];
  if (cards.length < 2 || backs.length < 2) return [];
  const out: StQuizQ[] = [];
  for (const c of cards.slice(0, 5)) {
    const wrong = backs.filter((b) => b !== c.t).sort(() => Math.random() - 0.5).slice(0, 3);
    const o = [...wrong, c.t].sort(() => Math.random() - 0.5);
    out.push({ q: _tj("«{0}» — это…", c.a), o, ok: o.indexOf(c.t), src: _t("Карточки конспектов недели") });
  }
  return out;
}

/** Plan words for the circle chat and the share card. */
export const planTitle = (p: StPlan) => p.title || SUBJ().find((x) => x.k === p.subj)?.t || _t("Учёба");

/** Homework with a deadline goes into my own «Планы» with a reminder an hour before; handed in = removed. */
export function syncHomework(s: import('./types').AppState, code: string, title: string, d: StData, me: string, today: string): import('./types').AppState | null {
  const pre = `st-${code}-`;
  const mineOpen = (t: StTask) => {
    if (t.by === me || d.state.teachers.includes(me) || !t.due || t.due < today) return false;
    const last = d.subs.filter((x) => x.task === t.id && x.uid === me).sort((a, b) => b.id - a.id)[0];
    return !last || last.status === 'redo';
  };
  const want = new Map(d.tasks.filter(mineOpen).map((t) => [pre + t.id, t]));
  const have = (s.plans ?? []).filter((p) => p.id.startsWith(pre));
  let changed = false;
  const next: Plan[] = [];
  for (const p of have) {
    const t = want.get(p.id);
    if (!t) { if (!p.del) { next.push({ ...p, del: true, upd: Date.now() }); changed = true; } else next.push(p); continue; }
    const text = `📝 ${t.title} · ${title}`;
    const after = (t.due_p ?? undefined) as Plan['after'];
    if (p.text !== text || p.date !== t.due || p.after !== after || p.del) { next.push({ ...p, text, date: t.due!, after, del: false, upd: Date.now() }); changed = true; } else next.push(p);
    want.delete(p.id);
  }
  for (const [id, t] of want) {
    next.push({ id, text: `📝 ${t.title} · ${title}`, date: t.due!, after: (t.due_p ?? undefined) as Plan['after'], remind: t.due_p ? 'h1' : undefined, list: _t("Учёба"), made: Date.now(), upd: Date.now() });
    changed = true;
  }
  if (!changed) return null;
  return setPlans(s, (l) => [...l.filter((p) => !p.id.startsWith(pre)), ...next]);
}
