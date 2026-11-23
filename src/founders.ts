// «Круг основателей»: the levels, the payment call and what the server gave me (supabase/founders.sql).
import { useEffect, useState } from 'react';
import { isCloud, meRpc, serverHas, cloudMe } from './cloud';
import { accessToken } from './auth';
import { _t } from './i18n';

export type Tier = 'f100' | 'f250' | 'f500' | 'f1000';
export interface TierInfo { id: Tier; name: string; amount: number; service: number; tag: string; perks: string[]; hot?: boolean; top?: boolean }
export interface FounderRec {
  id: string; tier: Tier; amount: number; service: number; contrib: number; name: string; email: string; country: string; wall: string; lang: string;
  status: 'paid' | 'test'; no: number; code: string; pro_until: string | null; pro_forever: boolean; paid: string; gifts: { code: string; used: boolean }[];
}
export interface Mine { list: FounderRec[]; forever: boolean; until: string | null }
export interface Wall { sum: number; count: number; goal: number; anon: number; names: { w: string; t: Tier }[] }

/** Same numbers as _lm_ftier in supabase/founders.sql and TIERS in api/_founders.js. Amounts in cents. */
export const TIERS: TierInfo[] = [
  { id: 'f100', name: _t("Основатель"), amount: 10000, service: 1500, tag: _t("Уровень 1"), perks: [_t("Pro на 3 месяца"), _t("Имя на стене основателей"), _t("Значок рядом с ником"), _t("Именной сертификат")] },
  { id: 'f250', name: _t("Ансар"), amount: 25000, service: 3000, tag: _t("Чаще всего выбирают"), hot: true, perks: [_t("Pro на год"), _t("Голос по дорожной карте"), _t("Закрытый круг с основателем"), _t("Всё из уровня 1")] },
  { id: 'f500', name: _t("Мухсин"), amount: 50000, service: 6000, tag: _t("Уровень 3"), perks: [_t("Pro на год"), _t("1 подарочный Pro близкому"), _t("Звонок с командой раз в год"), _t("Всё из уровней 1–2")] },
  { id: 'f1000', name: _t("Партнёр"), amount: 100000, service: 10000, tag: _t("Уровень 4"), top: true, perks: [_t("Pro навсегда"), _t("3 подарочных Pro близким"), _t("Имя в титрах приложения"), _t("Приоритет в будущем раунде долей и на поездки умры")] },
];
export const tierOf = (id: string) => TIERS.find((t) => t.id === id) ?? TIERS[0];
export const eur = (cents: number) => `€${(cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`;
export const certNo = (n: number) => `F-${String(n).padStart(4, '0')}`;

let readyP: Promise<boolean> | null = null;
/** True when founders.sql is on the server. Remembered for the session. */
export function foundersReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.founders') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_founders_wall', {}).then((ok) => { if (ok) try { sessionStorage.setItem('lm.founders', '1'); } catch { /* */ } return ok; });
  return readyP;
}
export function useFoundersReady() {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem('lm.founders') === '1'; } catch { return false; } });
  useEffect(() => { foundersReady().then(setOk); }, []);
  return ok;
}

const CACHE = 'lm.founder';
interface Cache { tier: Tier | null; forever: boolean; until: string | null; at: number }
export function cachedFounder(): Cache | null { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } }
function cache(m: Mine | null) {
  try {
    if (!m) { localStorage.removeItem(CACHE); return; }
    const best = [...m.list].sort((a, b) => b.amount - a.amount)[0];
    localStorage.setItem(CACHE, JSON.stringify({ tier: best?.tier ?? null, forever: m.forever, until: m.until, at: Date.now() } satisfies Cache));
  } catch { /* */ }
}
/** Pro the server gave me (own level or a gift code), from the cache: plan.ts reads it. */
export function founderPro(now = Date.now()): { on: boolean; forever: boolean; until: Date | null } {
  const c = cachedFounder();
  if (!c) return { on: false, forever: false, until: null };
  const until = c.until ? new Date(c.until) : null;
  return { on: c.forever || Boolean(until && until.getTime() > now), forever: c.forever, until };
}

export async function myFounder(): Promise<Mine | null> {
  if (!cloudMe()) return null;
  const m = await meRpc<Mine | null>('lm_founder_mine').catch(() => null);
  if (m) cache(m);
  return m;
}
export const foundersWall = () => (fetch(`${SB}/rest/v1/rpc/lm_founders_wall`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' }).then((r) => (r.ok ? r.json() : null)) as Promise<Wall | null>).catch(() => null);
export const founderOf = (uid: string) => fetch(`${SB}/rest/v1/rpc/lm_founder_of`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_other: uid }) }).then((r) => (r.ok ? r.json() : null)).then((t) => (t as Tier | null) || null).catch(() => null);
export interface GiftResult { ok?: boolean; until?: string; error?: string }
export const useGift = (code: string): Promise<GiftResult> => meRpc<GiftResult>('lm_founder_gift_use', { p_code: code.trim().toUpperCase() }).then((r) => { if (r?.ok) myFounder(); return r; }).catch(() => ({ error: 'net' } as GiftResult));

export interface Order { tier: Tier; name: string; email: string; country: string; wall: string }
/** Opens Stripe Checkout. 'nostripe' = payments are not connected yet; 'input', 'net' otherwise. */
export async function checkout(o: Order, lang: string): Promise<{ url?: string; error?: string }> {
  const me = cloudMe();
  if (!me) return { error: 'input' };
  try {
    const r = await fetch('/api/invest?op=checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...o, lang, uid: me.uid, token: me.token }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return { url: j.url };
    return { error: j.error || 'net' };
  } catch { return { error: 'net' }; }
}
/** The owner's test record (lm_admins): the whole path without paying. */
export async function testOrder(o: Order, lang: string): Promise<FounderRec | { error: string }> {
  const me = cloudMe(); const t = await accessToken();
  if (!me || !t) return { error: 'auth' };
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/lm_founder_test`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_uid: me.uid, p_token: me.token, p_tier: o.tier, p_name: o.name, p_email: o.email, p_country: o.country, p_wall: o.wall, p_lang: lang }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { error: 'net' };
    if (j.error) return j;
    await myFounder();
    return j as FounderRec;
  } catch { return { error: 'net' }; }
}

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

/** What the address asked for: /app/?founder=f250 | ok | cancel | mine | terms, or ?gift=CODE. Read once. */
export function takeFounderStart(): { tier?: Tier; ok?: boolean; cancel?: boolean; mine?: boolean; terms?: boolean; gift?: string } | null {
  try {
    const u = new URL(location.href);
    const f = u.searchParams.get('founder'), g = u.searchParams.get('gift');
    if (!f && !g) return null;
    ['founder', 's', 'gift'].forEach((k) => u.searchParams.delete(k));
    history.replaceState(null, '', u.toString());
    if (g) return { gift: g };
    if (f === 'ok') return { ok: true };
    if (f === 'cancel') return { cancel: true };
    if (f === 'mine') return { mine: true };
    if (f === 'terms') return { terms: true };
    if (TIERS.some((t) => t.id === f)) return { tier: f as Tier };
    return { mine: true };
  } catch { return null; }
}
