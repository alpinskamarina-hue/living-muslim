// Video lessons: curated YouTube courses by category, plus the user's own links.
import { CATALOG } from './videos/catalog';

export type VideoCat = 'faith' | 'biz' | 'mind' | 'body' | 'food' | 'family' | 'lang';
export const VIDEO_CATS: { id: VideoCat; ru: string; ic: string }[] = [
  { id: 'faith', ru: 'Вера', ic: '🕌' },
  { id: 'biz', ru: 'Бизнес', ic: '💼' },
  { id: 'mind', ru: 'Развитие', ic: '🧠' },
  { id: 'body', ru: 'Здоровье', ic: '💪' },
  { id: 'food', ru: 'Питание', ic: '🥗' },
  { id: 'family', ru: 'Семья', ic: '👨‍👩‍👧' },
  { id: 'lang', ru: 'Языки', ic: '🗣' },
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
}
export const emptyVideos = (): VideoState => ({ mine: [], pos: {}, notes: {} });

export const catalog = (): VideoItem[] => CATALOG;

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
