// Stories in circles: live 24 hours, seen only by the circles the author chose; replies go to the circle chat.
// Server: supabase/stories.sql. Until it is run, storiesReady() is false and the strip stays as it was.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCloud, meRpc, serverHas } from './cloud';
import type { AppState } from './types';
import { journey } from './gamify';
import { progress, progressLabel } from './goals';
import { addDays, plural } from './dates';
import { DAY_AYAHS } from './ayahs';
import { _t, LANG } from './i18n';

export type StoryKind = 'ach' | 'photo' | 'text' | 'ayah';
export type StoryBg = 'green' | 'night' | 'dawn' | 'sand';
/** What a card shows: icon, title, small line, background; ar: Arabic of an ayah. */
export interface StoryCard { ic?: string; t?: string; s?: string; bg?: StoryBg; ar?: string }
export interface Story {
  id: number; uid: string; kind: StoryKind; body: string; card: StoryCard;
  w: number | null; h: number | null; thumb: string | null; at: string;
  /** The circles I see it in (for my own: all its circles). */
  in: string[];
  photo: boolean; seen: boolean; react: string | null; views: number | null;
  name: string; color: string; avatar: Record<string, string> | null; pic: string; gender: string;
}
export interface Viewer { uid: string; name: string; color: string; avatar: Record<string, string> | null; pic: string; react: string | null; at: string }

/** Quick answers: no hearts or likes, only words of the deen. */
export const STORY_REACTS = [
  { e: '🤲', ru: 'Амин' },
  { e: '✨', ru: 'МашаАллах' },
  { e: '🤍', ru: 'БаракАллах' },
];
export const reactText = (r: { e: string; ru: string }) => `${r.e} ${_t(r.ru)}`;

let readyP: Promise<boolean> | null = null;
export function storiesReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.stories.ok') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_story_feed', { p_uid: null, p_token: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.stories.ok', '1'); } catch { /* */ }
    return ok;
  });
  return readyP;
}

export interface StoriesApi {
  ready: boolean;
  list: Story[];
  reload: () => Promise<void>;
  add: (kind: StoryKind, body: string, card: StoryCard, circles: string[], photo?: { blob: Blob; w: number; h: number; thumb: string }) => Promise<string>;
  seen: (id: number, react?: string) => void;
  viewers: (id: number) => Promise<Viewer[]>;
  remove: (id: number) => Promise<boolean>;
  report: (id: number, reason: string) => Promise<boolean>;
  photoUrl: (id: number) => Promise<string>;
}

const photos = new Map<number, string>();
const toB64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b); });

/** All live stories I can see. Refreshed every 60 s while the page is visible. */
export function useStories(): StoriesApi {
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Story[]>([]);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    const r = await meRpc<Story[] | null>('lm_story_feed').catch(() => null);
    if (r && alive.current) setList(r.map((s) => ({ ...s, card: s.card ?? {} })));
  }, []);
  useEffect(() => {
    alive.current = true;
    let t: number | undefined;
    storiesReady().then((ok) => {
      if (!ok || !alive.current) return;
      setReady(true);
      const tick = async () => {
        if (document.visibilityState === 'visible') await reload();
        if (alive.current) t = window.setTimeout(tick, 60000);
      };
      tick();
    });
    return () => { alive.current = false; clearTimeout(t); };
  }, [reload]);

  const add: StoriesApi['add'] = async (kind, body, card, circles, photo) => {
    try {
      const args: Record<string, unknown> = { p_kind: kind, p_body: body, p_card: card, p_circles: circles };
      if (photo) Object.assign(args, { p_mime: 'image/jpeg', p_b64: await toB64(photo.blob), p_w: photo.w, p_h: photo.h, p_thumb: photo.thumb });
      const r = await meRpc<{ id?: number; error?: string }>('lm_story_add', args);
      if (r?.error) return r.error;
      await reload();
      return '';
    } catch { return 'error'; }
  };
  const seen = (id: number, react?: string) => {
    setList((l) => l.map((s) => (s.id === id ? { ...s, seen: true, react: react === undefined ? s.react : s.react === react ? null : react } : s)));
    meRpc('lm_story_seen', { p_id: id, p_react: react ?? null }).catch(() => null);
  };
  const viewers = async (id: number) => (await meRpc<Viewer[] | null>('lm_story_viewers', { p_id: id }).catch(() => null)) ?? [];
  const remove = async (id: number) => {
    const ok = await meRpc<boolean>('lm_story_delete', { p_id: id }).catch(() => false);
    if (ok) setList((l) => l.filter((s) => s.id !== id));
    reload();
    return ok;
  };
  const report = async (id: number, reason: string) => meRpc<boolean>('lm_story_report', { p_id: id, p_reason: reason }).catch(() => false);
  const photoUrl = async (id: number) => {
    const c = photos.get(id);
    if (c) return c;
    const r = await meRpc<{ mime: string; b64: string } | null>('lm_story_photo', { p_id: id }).catch(() => null);
    if (!r) return '';
    const bin = atob(r.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: r.mime }));
    photos.set(id, url);
    return url;
  };
  return { ready, list, reload, add, seen, viewers, remove, report, photoUrl };
}

/** Stories grouped by author: me first, then those with something new (newest first), then the rest. */
export interface StoryGroup { uid: string; name: string; color: string; avatar: Record<string, string> | null; pic: string; stories: Story[]; unseen: boolean; last: number }
export function groupStories(list: Story[], me: string | null): StoryGroup[] {
  const m = new Map<string, StoryGroup>();
  for (const s of list) {
    const g = m.get(s.uid) ?? { uid: s.uid, name: s.name, color: s.color, avatar: s.avatar, pic: s.pic, stories: [], unseen: false, last: 0 };
    g.stories.push(s);
    if (!s.seen) g.unseen = true;
    g.last = Math.max(g.last, Date.parse(s.at));
    m.set(s.uid, g);
  }
  return [...m.values()].sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : Number(b.unseen) - Number(a.unseen) || b.last - a.last));
}

/** Photos for a story: up to 1280 px, JPEG ~80%, and a tiny preview. */
export async function shrinkStoryPhoto(f: File): Promise<{ blob: Blob; thumb: string; w: number; h: number; url: string }> {
  const url = URL.createObjectURL(f);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const draw = (max: number) => {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  const big = draw(1280);
  const blob = await new Promise<Blob>((res, rej) => big.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.8));
  const thumb = draw(40).toDataURL('image/jpeg', 0.6);
  return { blob, thumb, w: big.width, h: big.height, url };
}

const fajrStreak = (s: AppState, today: string) => {
  let d = s.prayers[today]?.fajr ? today : addDays(today, -1), n = 0;
  while (s.prayers[d]?.fajr === 'ontime' && n < 400) { n++; d = addDays(d, -1); }
  return n;
};
const days = (n: number) => `${n} ${plural(n, _t('день'), _t('дня'), _t('дней'))}`;

/** Ready-made cards from what the person already did in the app (nothing to type). */
export function achievements(s: AppState, today: string): StoryCard[] {
  const out: StoryCard[] = [];
  const pr = s.prayers[today] ?? {};
  const marked = Object.keys(pr).length;
  if (marked >= 5) out.push({ ic: '🕌', t: _t('Все 5 намазов сегодня'), s: _t('альхамдулиллях') });
  const fs = fajrStreak(s, today);
  if (fs >= 2) out.push({ ic: '🌅', t: _t('{0} Фаджр вовремя', days(fs)), s: _t('серия') });
  const j = journey(s, today);
  if (j.streak >= 2) out.push({ ic: '🌿', t: _t('{0} подряд в свете', days(j.streak)), s: _t('серия') });
  const week = addDays(today, -7);
  for (const g of s.goals ?? []) {
    if (g.status === 'done' && (g.doneAt ?? '') >= week) out.push({ ic: '🏆', t: _t('Цель достигнута: {0}', g.title), s: _t('цель') });
  }
  for (const g of s.goals ?? []) {
    if (g.status !== 'active') continue;
    const p = progress(s, g, today);
    if (p.pct >= 10 && p.pct < 100) out.push({ ic: g.source === 'quran' ? '📖' : '🎯', t: g.title, s: progressLabel(s, g, today) });
  }
  if (s.azkar?.m?.includes(today)) out.push({ ic: '☀️', t: _t('Утренние азкары прочитаны'), s: _t('сегодня') });
  if (s.azkar?.e?.includes(today)) out.push({ ic: '🌙', t: _t('Вечерние азкары прочитаны'), s: _t('сегодня') });
  return out.slice(0, 8).map((c) => ({ ...c, bg: 'green' }));
}

/** An ayah card; n picks one of the day ayahs (0 = today's). */
export function ayahCard(today: string, n = 0): StoryCard {
  const base = Math.floor(Date.parse(today) / 86400000);
  const a = DAY_AYAHS[(((base + n) % DAY_AYAHS.length) + DAY_AYAHS.length) % DAY_AYAHS.length];
  return { ic: '📖', ar: a.ar, t: LANG === 'en' ? a.en : a.ru, s: `${a.n} ${a.s}:${a.a}`, bg: 'night' };
}

export function agoOf(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return _t('только что');
  if (m < 60) return _t('{0} мин назад', m);
  return _t('{0} ч назад', Math.floor(m / 60));
}
