// Posts in circles (supabase/posts.sql). The common circle: the team writes. Other circles: the owner and helpers.
// Public posts of an open circle are shown before joining. Hidden until the SQL is run (probe lm_posts).
import { useCallback, useEffect, useState } from 'react';
import { cloudMe, cloudRpc, isCloud } from './cloud';
import { accessToken, authMe } from './auth';
import { savedGender } from './openCircles';

export type PostRx = '🤲' | '❤' | '👍';
export interface Post {
  id: number; code: string | null; body: string; link: { l: string; u: string } | null; photo: boolean; vis: 'public' | 'members';
  who: 'all' | 'brothers' | 'sisters'; pinned: boolean; at: string; edited: boolean; hidden: boolean; later: boolean; push: boolean;
  uid: string | null; by: string | null; role: 'team' | 'owner' | 'helper'; rx: Partial<Record<PostRx, number>>; my: PostRx | null; mine: boolean;
}
export interface PostList { can: boolean; posts: Post[] }
export interface PostDraft { body: string; link?: { l: string; u: string } | null; vis?: 'public' | 'members'; who?: 'all' | 'brothers' | 'sisters'; pin?: boolean; push?: boolean; at?: string | null; photo?: { mime: string; b64: string } | null }

/** Every call goes as me (uid + token) and, when signed in by email, with the session too: the team is checked by email. */
async function call<T>(fn: string, a: Record<string, unknown> = {}): Promise<T> {
  const me = cloudMe();
  const bearer = authMe() ? (await accessToken()) ?? undefined : undefined;
  return cloudRpc<T>(fn, { p_uid: me?.uid ?? null, p_token: me?.token ?? null, ...a }, bearer);
}

let ready: boolean | null = null;
const waiters = new Set<(v: boolean) => void>();
export function usePostsReady(): boolean {
  const [ok, setOk] = useState(Boolean(ready));
  useEffect(() => {
    if (!isCloud) return;
    if (ready !== null) { setOk(ready); return; }
    waiters.add(setOk);
    if (waiters.size === 1) {
      cloudRpc('lm_posts', { p_uid: null, p_token: null, p_code: null, p_open: null, p_gender: '', p_limit: 1 })
        .then(() => true, () => false)
        .then((v) => { ready = v; waiters.forEach((f) => f(v)); waiters.clear(); });
    }
    return () => { waiters.delete(setOk); };
  }, []);
  return ok;
}

const g = () => savedGender();
export const postsGet = (code: string | null, open: string | null = null, limit = 30) =>
  call<PostList | null>('lm_posts', { p_code: code, p_open: open, p_gender: g(), p_limit: limit }).catch(() => null);
export const postAdd = (code: string | null, d: PostDraft) => call<{ r: string; id?: number; push?: boolean }>('lm_post_add', {
  p_code: code, p_body: d.body, p_link: d.link ?? null, p_vis: d.vis ?? 'members', p_who: d.who ?? 'all', p_pin: Boolean(d.pin), p_push: Boolean(d.push),
  p_at: d.at ?? null, p_mime: d.photo?.mime ?? null, p_b64: d.photo?.b64 ?? null,
}).catch(() => ({ r: 'error' } as { r: string; id?: number; push?: boolean }));
export const postSet = (id: number, act: 'pin' | 'unpin' | 'edit' | 'del', body = '') => call<boolean>('lm_post_set', { p_id: id, p_act: act, p_body: body }).catch(() => false);
export const postReact = (id: number, e: PostRx) => call<Post | null>('lm_post_react', { p_id: id, p_emoji: e }).catch(() => null);
export const postReport = (id: number) => call<boolean>('lm_post_report', { p_id: id }).catch(() => false);

const photos = new Map<number, Promise<string | null>>();
export const postPhoto = (id: number) => {
  if (!photos.has(id)) photos.set(id, call<{ mime: string; b64: string } | null>('lm_post_photo', { p_id: id, p_gender: g() }).then((r) => (r ? `data:${r.mime};base64,${r.b64}` : null), () => null));
  return photos.get(id)!;
};

/** Posts of one place, reloaded every 2 minutes while shown. */
export function usePosts(on: boolean, code: string | null, open: string | null = null) {
  const [d, setD] = useState<PostList | null>(null);
  const load = useCallback(() => postsGet(code, open).then((r) => { if (r) setD(r); }), [code, open]);
  useEffect(() => {
    if (!on) return;
    setD(null); load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000);
    return () => clearInterval(t);
  }, [on, load]);
  const patch = (p: Post) => setD((x) => (x ? { ...x, posts: x.posts.map((y) => (y.id === p.id ? p : y)) } : x));
  return { d, load, patch };
}

const SEEN = 'lm.postSeen';
/** The newest post time I have looked at, per place ('common' or a circle code). */
export const postSeen = (k: string): string => { try { return (JSON.parse(localStorage.getItem(SEEN) || '{}') as Record<string, string>)[k] || ''; } catch { return ''; } };
export const markPostSeen = (k: string, at: string) => {
  try { const m = JSON.parse(localStorage.getItem(SEEN) || '{}') as Record<string, string>; if ((m[k] || '') < at) { m[k] = at; localStorage.setItem(SEEN, JSON.stringify(m)); } } catch { /* */ }
};

/** A photo picked by the person, made smaller (long side 1280) and turned into JPEG base64. */
export async function shrinkPhoto(f: File): Promise<{ mime: string; b64: string; url: string } | null> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.82);
    return { mime: 'image/jpeg', b64: url.split(',')[1], url };
  } catch { return null; }
}
