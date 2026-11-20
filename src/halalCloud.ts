// «Халяль-сканер», step 2: the shared base (supabase/halal.sql). Reading works without an account;
// adding an ingredient list or a halal sign needs the email sign-in. Only the barcode, the product name,
// the ingredient text and a small photo of the sign are sent; nothing else about the person.
import { accessToken } from './auth';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

export interface Shared { name: string; ingredients: string; signs: number; ok: boolean | null; mine: boolean }
export type CloudErr = 'signin' | 'nosql' | 'net' | 'day' | 'big' | 'bad';

async function call<T>(fn: string, args: Record<string, unknown>, needUser: boolean, signal?: AbortSignal): Promise<T> {
  const t = await accessToken();
  if (needUser && !t) throw new Error('signin');
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', signal, headers: { apikey: KEY, Authorization: `Bearer ${t || KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (r.status === 404) throw new Error('nosql');
  if (r.status === 401 || r.status === 403) throw new Error(needUser ? 'signin' : 'net');
  if (!r.ok) throw new Error('net');
  const txt = await r.text();
  return (txt ? JSON.parse(txt) : null) as T;
}
const why = (e: unknown): CloudErr => { const m = (e as Error)?.message; return (['signin', 'nosql', 'day', 'big', 'bad'] as string[]).includes(m) ? (m as CloudErr) : 'net'; };

/** What people added for this barcode; null when the base is unreachable or not set up yet. */
export async function sharedOf(code: string, signal?: AbortSignal): Promise<Shared | null> {
  if (!code) return null;
  try {
    const j = await call<Shared>('lm_halal_get', { p_code: code }, false, signal);
    if (!j) return null;
    return { name: String(j.name || ''), ingredients: String(j.ingredients || ''), signs: Number(j.signs) || 0, ok: j.ok === true ? true : j.ok === false ? false : null, mine: Boolean(j.mine) };
  } catch { return null; }
}

export async function saveShared(code: string, name: string, ing: string): Promise<{ ok: true } | { ok: false; why: CloudErr }> {
  try {
    const j = await call<{ ok?: boolean; error?: string }>('lm_halal_save', { p_code: code, p_name: name, p_ing: ing }, true);
    if (j?.error) return { ok: false, why: why(new Error(j.error)) };
    return { ok: true };
  } catch (e) { return { ok: false, why: why(e) }; }
}

/** «На упаковке знак халяль»: photo is base64 JPEG without the data: prefix (or '' when skipped). */
export async function sendSign(code: string, name: string, photo: string): Promise<{ ok: true; signs: number } | { ok: false; why: CloudErr }> {
  try {
    const j = await call<{ ok?: boolean; signs?: number; error?: string }>('lm_halal_sign', { p_code: code, p_name: name, p_b64: photo }, true);
    if (j?.error) return { ok: false, why: why(new Error(j.error)) };
    return { ok: true, signs: Number(j?.signs) || 1 };
  } catch (e) { return { ok: false, why: why(e) }; }
}

export async function dropSign(code: string) { try { await call('lm_halal_unsign', { p_code: code }, true); } catch { /* offline: stays until next time */ } }

export interface QueueItem { code: string; name: string; ingredients: string; signs: number; last: string; photos: string[] | null }
export const halalQueue = () => call<QueueItem[] | null>('lm_halal_queue', {}, true);
export const halalDecide = (code: string, ok: boolean) => call('lm_halal_decide', { p_code: code, p_ok: ok }, true);
