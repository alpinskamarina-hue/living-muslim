// «Фото еды»: shrink the photo on the phone and ask /api/food-photo what is on it.
// The photo is never saved: it goes to the server once and is dropped after the answer.
import { accessToken, authMe } from './auth';
import { LANG } from './i18n';

export interface PhotoItem { name: string; grams: number; pieces: number; unit: string; lo: number; hi: number; p: number; f: number; c: number; x: number; y: number }
export type PhotoResult =
  | { ok: true; items: PhotoItem[]; check: string; left: number | null }
  | { ok: false; why: 'notfood'; reason: string; left: number | null }
  | { ok: false; why: 'signin' | 'limit' | 'net' | 'busy' | 'nokey' | 'image' };

export const PHOTO_LIMIT = 10;
export const signedIn = () => Boolean(authMe());

/** Photos left today as last told by the server (null: unknown or no limit). Kept per day on this phone. */
export function photosLeft(today: string): number | null {
  try { const j = JSON.parse(localStorage.getItem('lm.foodPhotoLeft') || 'null'); return j && j.d === today ? j.n : null; } catch { return null; }
}
function setLeft(today: string, n: number | null) {
  try { if (n === null) localStorage.removeItem('lm.foodPhotoLeft'); else localStorage.setItem('lm.foodPhotoLeft', JSON.stringify({ d: today, n })); } catch { /* storage blocked */ }
}

/** JPEG, longest side 1024 px: enough to see the plate, ~150–300 KB. */
export async function shrink(file: Blob, max = 1024): Promise<{ data: string; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.82).split(',')[1];
  return { data, url };
}

export async function recognise(data: string, today: string, signal?: AbortSignal): Promise<PhotoResult> {
  const t = await accessToken();
  if (!t) return { ok: false, why: 'signin' };
  try {
    const r = await fetch('/api/food-photo', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ image: data, type: 'image/jpeg', lang: LANG }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { ok: false, why: 'signin' };
    if (r.status === 429) { setLeft(today, 0); return { ok: false, why: 'limit' }; }
    if (r.status === 503 && j.error === 'nokey') return { ok: false, why: 'nokey' };
    if (r.status === 400) return { ok: false, why: 'image' };
    if (!r.ok) return { ok: false, why: 'busy' };
    const left = typeof j.left === 'number' ? j.left : null;
    setLeft(today, left);
    if (!j.food || !Array.isArray(j.items) || !j.items.length) return { ok: false, why: 'notfood', reason: String(j.why || ''), left };
    return { ok: true, items: j.items as PhotoItem[], check: String(j.check || ''), left };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, why: 'net' };
    return { ok: false, why: 'net' };
  }
}

export type IngResult =
  | { ok: true; name: string; ingredients: string; logo: boolean; left: number | null }
  | { ok: false; why: 'unreadable'; reason: string; left: number | null }
  | { ok: false; why: 'signin' | 'limit' | 'net' | 'busy' | 'nokey' | 'image' };

/** «Халяль-сканер»: read the ingredient list off a photo of the pack (one photo from the same daily limit). */
export async function readIngredients(data: string, today: string, signal?: AbortSignal): Promise<IngResult> {
  const t = await accessToken();
  if (!t) return { ok: false, why: 'signin' };
  try {
    const r = await fetch('/api/food-photo', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ image: data, type: 'image/jpeg', lang: LANG, task: 'ingredients' }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { ok: false, why: 'signin' };
    if (r.status === 429) { setLeft(today, 0); return { ok: false, why: 'limit' }; }
    if (r.status === 503 && j.error === 'nokey') return { ok: false, why: 'nokey' };
    if (r.status === 400) return { ok: false, why: 'image' };
    if (!r.ok) return { ok: false, why: 'busy' };
    const left = typeof j.left === 'number' ? j.left : null;
    setLeft(today, left);
    if (!j.ok || !j.ingredients) return { ok: false, why: 'unreadable', reason: String(j.why || ''), left };
    return { ok: true, name: String(j.name || ''), ingredients: String(j.ingredients), logo: Boolean(j.halal_logo), left };
  } catch {
    return { ok: false, why: 'net' };
  }
}

export interface TextGuess { name: string; grams: number; k: number; p: number; f: number; c: number; portion: string }
/** «Что съел?» by hand, dish not in the table: a rough estimate from the words (does not use the photo limit). */
export async function guessText(text: string, signal?: AbortSignal): Promise<TextGuess | 'signin' | 'notfood' | 'fail'> {
  const t = await accessToken();
  if (!t) return 'signin';
  try {
    const r = await fetch('/api/food-photo', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ task: 'text', text, lang: LANG }),
    });
    if (r.status === 401) return 'signin';
    if (!r.ok) return 'fail';
    const j = await r.json().catch(() => ({}));
    if (!j.food) return 'notfood';
    return { name: String(j.name || text), grams: Number(j.grams) || 0, k: Number(j.k) || 0, p: Number(j.p) || 0, f: Number(j.f) || 0, c: Number(j.c) || 0, portion: String(j.portion || '') };
  } catch { return 'fail'; }
}
