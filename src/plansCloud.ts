// «Планы» in the cloud (supabase/plans.sql): the phone merges its copy with the server's and saves the result.
import { accessToken, authMe } from './auth';
import { mergePlans, type Plan } from './plans';
import type { Settings } from './types';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

/** 'nosql' = plans.sql not run yet; 'signin' = needs the email sign-in. */
export type CloudErr = 'nosql' | 'signin' | 'net';
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const t = await accessToken();
  if (!t) throw new Error('signin');
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (r.status === 404) throw new Error('nosql');
  if (r.status === 401 || r.status === 403) throw new Error('signin');
  if (!r.ok) throw new Error('net');
  const txt = await r.text();
  return (txt ? JSON.parse(txt) : null) as T;
}
const why = (e: unknown): CloudErr => { const m = (e as Error)?.message; return m === 'nosql' || m === 'signin' ? m : 'net'; };

export const signedIn = () => Boolean(authMe());

/** What the calendar feed needs to place prayers and «после Зухра» plans. */
export const placeOf = (s: Settings) => ({ lat: s.lat, lng: s.lng, method: s.method, madhab: s.madhab, offsets: s.offsets ?? {}, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: s.lang ?? 'ru', name: s.place });

/** Merge with the cloud and save. Returns the merged list, or an error. */
export async function syncPlans(local: Plan[], s: Settings): Promise<{ plans: Plan[]; ics: string | null } | { err: CloudErr }> {
  try {
    const got = await call<{ plans: Plan[]; ics: string | null } | null>('lm_plans_get');
    const merged = mergePlans(local, Array.isArray(got?.plans) ? got!.plans : []);
    const saved = await call<{ plans: Plan[]; ics: string | null }>('lm_plans_put', { p_plans: merged, p_place: placeOf(s) });
    return { plans: merged, ics: saved?.ics ?? null };
  } catch (e) { return { err: why(e) }; }
}

/** The secret calendar link (made on first use). */
export async function icsKey(fresh = false): Promise<string | { err: CloudErr }> {
  try { return await call<string>('lm_plans_ics_key', { p_new: fresh }); } catch (e) { return { err: why(e) }; }
}
export async function icsOff(): Promise<void> { await call('lm_plans_ics_off').catch(() => {}); }
export const icsUrl = (k: string) => `${location.origin}/api/plans-ics?t=${encodeURIComponent(k)}`;
export const webcalUrl = (k: string) => icsUrl(k).replace(/^https?:/, 'webcal:');
export const googleSubUrl = (k: string) => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(k))}`;
