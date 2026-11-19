// Video lessons: curated YouTube courses by category, plus the user's own links.
import { CATALOG } from './videos/catalog';
import { _t } from './i18n';

export type VideoCat = 'faith' | 'biz' | 'mind' | 'body' | 'food' | 'family' | 'lang';
export const VIDEO_CATS: { id: VideoCat; ru: string; ic: string }[] = [
  { id: 'faith', ru: _t("Вера"), ic: '🕌' },
  { id: 'biz', ru: _t("Бизнес"), ic: '💼' },
  { id: 'mind', ru: _t("Развитие"), ic: '🧠' },
  { id: 'body', ru: _t("Здоровье"), ic: '💪' },
  { id: 'food', ru: _t("Питание"), ic: '🥗' },
  { id: 'family', ru: _t("Семья"), ic: '👨‍👩‍👧' },
  { id: 'lang', ru: _t("Языки"), ic: '🗣' },
];
export const catOf = (c: VideoCat) => VIDEO_CATS.find((x) => x.id === c)!;

/** A course is a YouTube playlist; a single video is a course of one lesson. */
export interface VideoItem {
  kind: 'list' | 'video';
  id: string; // playlist id or video id
  cat: VideoCat;
  title: string;
  channel?: string;
  lang?: 'ru' | 'en';
  count?: number;
  note?: string;
  pro?: boolean;
  mine?: boolean;
  /** Course content the owner wrote: modules, lesson summaries, practice, tests. */
  plan?: CoursePlan;
}

/** One test question: options and the index of the right one. */
export interface QuizQ { q: string; opts: string[]; a: number; why?: string }
/** A module is the next `n` lessons of the playlist, with an optional mini-test. */
export interface ModulePlan { title: string; n: number; quiz?: QuizQ[] }
/** What goes under a lesson's video. */
export interface LessonPlan { sum?: string[]; ask?: string; act?: string }
export interface CoursePlan {
  about?: string;
  modules?: ModulePlan[];
  /** By video id. */
  lessons?: Record<string, LessonPlan>;
  final?: QuizQ[];
  /** Faith courses: summaries and tests show only after an imam checked them. */
  checked?: boolean;
}

export interface Lesson { id: string; title: string; seconds: number }

export interface VideoState {
  mine: VideoItem[];
  /** Per video: last position in seconds and whether it was watched. */
  pos: Record<string, { t: number; done?: boolean; d?: number }>;
  notes: Record<string, string>;
  /** What to continue: course id (or video id) and the lesson inside it. */
  last?: { item: string; v: string };
  /** Watched lesson ids per course, for goals. */
  byCourse?: Record<string, string[]>;
  /** Courses the person started (the free plan allows 3). */
  started?: string[];
  /** Best test score in percent: `<course>:<module index>` or `<course>:f` for the final test. */
  quiz?: Record<string, number>;
  /** Lesson practice done: video id → day. */
  acts?: Record<string, string>;
  /** Finished courses: course id → day the certificate was earned. */
  doneC?: Record<string, string>;
  /** Day of the last watched lesson (for the reminder after 3 quiet days). */
  lastDay?: string;
}
export const emptyVideos = (): VideoState => ({ mine: [], pos: {}, notes: {} });

/** A course the owner added or changed from the app (table lm_courses). */
export interface CourseRow { kind: 'list' | 'video'; yt: string; cat: VideoCat; title: string; channel?: string | null; lang?: 'ru' | 'en'; note?: string | null; pos?: number; hidden?: boolean; plan?: CoursePlan | null }

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const SBKEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const RC = 'lm.courses';
let remote: CourseRow[] = (() => { try { return JSON.parse(localStorage.getItem(RC) || 'null')?.rows ?? []; } catch { return []; } })();

/** Reads the owner's courses (cached for 30 minutes). Resolves true when the list changed. */
export async function loadCourses(force = false): Promise<boolean> {
  try {
    const c = JSON.parse(localStorage.getItem(RC) || 'null');
    if (!force && c && Date.now() - c.at < 30 * 60000) return false;
  } catch { /* */ }
  try {
    const cols = 'kind,yt,cat,title,channel,lang,note,pos,hidden';
    let r = await fetch(`${SB}/rest/v1/lm_courses?select=${cols},plan&order=pos.asc,created.desc`, { headers: { apikey: SBKEY } });
    // Before course-plan.sql the table has no plan column: read the rest.
    if (r.status === 400) r = await fetch(`${SB}/rest/v1/lm_courses?select=${cols}&order=pos.asc,created.desc`, { headers: { apikey: SBKEY } });
    if (!r.ok) return false; // table not created yet: built-in list only
    const rows = (await r.json()) as CourseRow[];
    const changed = JSON.stringify(rows) !== JSON.stringify(remote);
    remote = rows;
    try { localStorage.setItem(RC, JSON.stringify({ at: Date.now(), rows })); } catch { /* */ }
    return changed;
  } catch { return false; }
}
export const remoteCourses = () => remote;
export function setRemoteCourses(rows: CourseRow[]) {
  remote = rows;
  try { localStorage.setItem(RC, JSON.stringify({ at: Date.now(), rows })); } catch { /* */ }
}

const fromRow = (r: CourseRow): VideoItem => ({ kind: r.kind, id: r.yt, cat: r.cat, title: r.title, channel: r.channel ?? undefined, lang: r.lang ?? 'ru', note: r.note ?? undefined, plan: r.plan ?? undefined });

/** Built-in catalog with the owner's changes: new courses first, edited ones replaced, hidden ones removed. */
export function catalog(withHidden = false): VideoItem[] {
  const by = new Map(remote.map((r) => [r.yt, r]));
  const builtIn = new Set(CATALOG.map((x) => x.id));
  const added = remote.filter((r) => !builtIn.has(r.yt) && (withHidden || !r.hidden)).map(fromRow);
  const base = CATALOG.filter((x) => withHidden || !by.get(x.id)?.hidden).map((x) => { const r = by.get(x.id); return r ? { ...x, ...fromRow(r) } : x; });
  return [...added, ...base];
}
export const builtInIds = () => new Set(CATALOG.map((x) => x.id));

/** Playlist or video id from any YouTube link (or a bare id). */
export function parseYouTube(input: string): { kind: 'list' | 'video'; id: string } | null {
  const s = input.trim();
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const list = u.searchParams.get('list');
    if (list) return { kind: 'list', id: list };
    if (/youtu\.be$/.test(u.hostname)) return { kind: 'video', id: u.pathname.slice(1, 12) };
    const v = u.searchParams.get('v');
    if (v) return { kind: 'video', id: v };
    const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
    if (m) return { kind: 'video', id: m[1] };
  } catch { /* not a URL */ }
  if (/^PL[\w-]{10,}$/.test(s)) return { kind: 'list', id: s };
  if (/^[\w-]{11}$/.test(s)) return { kind: 'video', id: s };
  return null;
}

export const thumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

const CACHE = 'lm.yt.';
const DAY = 86400000;

/** Lessons of a playlist, cached on the device for a day. */
export async function lessons(item: VideoItem): Promise<{ title: string; channel: string; items: Lesson[] }> {
  if (item.kind === 'video') {
    return { title: item.title, channel: item.channel ?? '', items: [{ id: item.id, title: item.title, seconds: 0 }] };
  }
  try {
    const c = JSON.parse(localStorage.getItem(CACHE + item.id) || 'null');
    if (c && Date.now() - c.at < DAY && c.items?.length) return c;
  } catch { /* */ }
  const r = await fetch(`/api/yt?list=${encodeURIComponent(item.id)}`);
  if (!r.ok) throw new Error('yt');
  const j = await r.json();
  const out = { title: j.title || item.title, channel: j.channel || item.channel || '', items: (j.items || []) as Lesson[], at: Date.now() };
  try { localStorage.setItem(CACHE + item.id, JSON.stringify(out)); } catch { /* full */ }
  return out;
}

export async function lookup(p: { kind: 'list' | 'video'; id: string }): Promise<{ title: string; channel: string; count: number; first?: string }> {
  if (p.kind === 'list') {
    const r = await fetch(`/api/yt?list=${encodeURIComponent(p.id)}`);
    if (!r.ok) throw new Error('yt');
    const j = await r.json();
    if (!j.items?.length) throw new Error('empty');
    return { title: j.title, channel: j.channel, count: j.items.length, first: j.items[0].id };
  }
  const r = await fetch(`/api/yt?v=${encodeURIComponent(p.id)}`);
  if (!r.ok) throw new Error('yt');
  const j = await r.json();
  return { title: j.title, channel: j.channel, count: 1, first: p.id };
}

export const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
