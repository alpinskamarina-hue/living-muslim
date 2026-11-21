// «Гиды» for umrah (supabase/guides.sql). A guide applies, the owner checks the diploma, the Saudi licence
// and the imam's recommendation, and only then the card is listed. People call a guide into their trip;
// money goes from person to guide directly, the app stores no payments. A review only after an accepted call.
import { useCallback, useEffect, useState } from 'react';
import { isCloud, meRpc } from './cloud';
import { accessToken } from './auth';

export type Place = 'makkah' | 'madinah' | 'fly';
export interface Service { t: string; price: number; per: string }
export interface Guide {
  uid: string; name: string; color: string; avatar?: string | null; langs: string[]; about: string; school: string; field: string;
  grad: number | null; years: number; groups: number; place: Place; city: string; until: string; free: string; services: Service[];
  sisters: boolean; license: boolean; checks: { diploma?: boolean; license?: boolean; imam?: boolean }; imam: string;
  stars: number | null; reviews: number; mine?: { id: string; status: CallStatus } | null;
}
export type CallStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export interface GuideFull extends Guide {
  list: { name: string; stars: number; text: string; created: string }[];
  can_review: boolean; my_review: { stars: number; text: string } | null;
}
export interface CallToMe { id: string; uid: string; name: string; color: string; note: string; status: CallStatus; created: string }
export interface MyGuide extends Guide { status: 'pending' | 'ok' | 'no'; paused: boolean; note: string; has_diploma: boolean; calls: CallToMe[] }
export interface Apply {
  name: string; langs: string[]; about: string; school: string; field: string; grad: string; years: string; groups: string;
  place: Place; city: string; until: string; free: string; services: Service[]; sisters: boolean; license: boolean; imam: string;
}

/** false while the server has no guides.sql yet: the section stays hidden. */
export let guidesOk: boolean | null = null;
const tryRpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> => {
  try { const r = await meRpc<T>(fn, args); guidesOk = true; return r; } catch (e) {
    if (/404|PGRST202|Could not find/.test(String((e as Error)?.message))) guidesOk = false;
    return null;
  }
};

export const guidesList = () => tryRpc<Guide[]>('lm_guides_list').then((r) => r ?? []);
export const guideGet = (uid: string) => tryRpc<GuideFull | null>('lm_guide_get', { p_guide: uid });
export const guideMine = () => tryRpc<MyGuide | null>('lm_guide_mine');
export const guideApply = (p: Apply, diploma: string | null, license: string | null) =>
  tryRpc<string>('lm_guide_apply', { p, p_diploma: diploma, p_license: license }).then((r) => r ?? 'error');
export const guidePause = (on: boolean) => tryRpc<boolean>('lm_guide_pause', { p_on: on }).then(Boolean);
export const guideCall = (guide: string, code: string | null, note: string) => tryRpc<string>('lm_guide_call', { p_guide: guide, p_code: code, p_note: note }).then((r) => r ?? 'error');
export const guideAnswer = (id: string, yes: boolean) => tryRpc<string>('lm_guide_answer', { p_id: id, p_yes: yes }).then((r) => r ?? 'error');
export const guideReview = (guide: string, stars: number, text: string) => tryRpc<string>('lm_guide_review', { p_guide: guide, p_stars: stars, p_text: text }).then((r) => r ?? 'error');

/** The list, loaded once per opening; ok=false when the server has no guides.sql. */
export function useGuides(on: boolean) {
  const [list, setList] = useState<Guide[] | null>(null);
  const [ok, setOk] = useState<boolean | null>(guidesOk);
  const load = useCallback(async () => { if (!isCloud) return; const r = await guidesList(); setOk(guidesOk); setList(r); }, []);
  useEffect(() => { if (on) load(); }, [on, load]);
  return { list, ok, reload: load };
}

// The owner's check (admin): the JWT email must be in lm_admins.
const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
async function admin<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const t = await accessToken();
  if (!t) throw new Error('signin');
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (r.status === 404) throw new Error('nosql');
  if (!r.ok) throw new Error('net');
  const txt = await r.text();
  return (txt ? JSON.parse(txt) : null) as T;
}
export interface QueueGuide extends Guide { email: string | null; diploma_photo: string | null; license_photo: string | null; created: string; updated: string }
export const guideQueue = () => admin<QueueGuide[] | null>('lm_guide_queue', {});
export const guideDecide = (uid: string, ok: boolean, checks: Record<string, boolean>, note: string) => admin('lm_guide_decide', { p_guide: uid, p_ok: ok, p_checks: checks, p_note: note });

/** Phone numbers, emails and messenger links are hidden in guide texts, calls and reviews:
 *  people talk through the app chat (Nasim, 21.11). The owner's check still sees the raw application. */
const HIDE = '•••';
export function hideContacts(t: string): string {
  if (!t) return t;
  return t
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:wa\.me|t\.me|telegram\.me|api\.whatsapp\.com|chat\.whatsapp\.com|viber\.click|invite\.viber\.com)\/\S*/gi, HIDE)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, HIDE)
    .replace(/(?:\+|00)?\d[\d\s().-]{5,}\d/g, (m) => ((m.match(/\d/g) ?? []).length >= 7 ? HIDE : m));
}
