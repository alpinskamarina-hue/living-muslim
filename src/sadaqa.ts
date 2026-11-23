// «Подари Pro тому, кто просит», «Поддержать Living Muslim» and «Куда отдать» (supabase/sadaqa.sql, api/_sadaqa-*.js).
import { useEffect, useState } from 'react';
import { isCloud, meRpc, serverHas, cloudMe } from './cloud';
import { accessToken } from './auth';
import { myFounder } from './founders';
import { _t } from './i18n';

export type Eur = 5 | 10 | 20 | 50;
export const EURS: Eur[] = [5, 10, 20, 50];
export type PayKind = 'gift' | 'support';

/** What a gift buys: the same shares as _lm_gmonths in sadaqa.sql. */
export const giftWhat = (e: Eur) => (e === 5 ? _t("1 месяц Pro одному человеку") : e === 10 ? _t("2 месяца Pro") : e === 20 ? _t("5 месяцев Pro") : _t("год Pro одному и 4 месяца ещё одному"));
/** What support means in plain words (the mockup's lines). */
export const supportWhat = (e: Eur) => (e === 5 ? _t("чашка кофе команде") : e === 10 ? _t("день работы серверов") : e === 20 ? _t("перевод одного курса") : _t("неделя помощника для всех"));

export interface SadaqaWall { waiting: number; helped: number; pool: number; supporters: number; anon: number; names: string[] }
export interface MyPay { id: string; kind: PayKind; eur: Eur; mode: 'once' | 'month'; sign: 'secret' | 'nick'; wall: string; status: 'paid' | 'test' | 'ended'; periods: number; paid: string; opened: number; pooled: number }
export interface MyAsk { status: 'wait' | 'got'; created: string; got: string | null; months: number; from: string | null }
export interface SadaqaMine { list: MyPay[]; ask: MyAsk | null; supporter: boolean }
export interface Charity { id: number; title: string; org: string; kind: CharityKind; url: string; region: string; note: string; jariya: boolean }
export type CharityKind = 'water' | 'orphans' | 'food' | 'mosque' | 'urgent' | 'other';
export const CHARITY_KINDS: [CharityKind, string][] = [['water', _t("Вода")], ['orphans', _t("Сироты")], ['food', _t("Еда")], ['mosque', _t("Мечети")], ['urgent', _t("Срочно")], ['other', _t("Другое")]];

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const pub = <T,>(fn: string, args: Record<string, unknown> = {}) =>
  fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);

let readyP: Promise<boolean> | null = null;
/** True when sadaqa.sql is on the server. Remembered for the session. */
export function sadaqaReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.sadaqaSrv') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_sadaqa_wall', {}).then((ok) => { if (ok) try { sessionStorage.setItem('lm.sadaqaSrv', '1'); } catch { /* */ } return ok; });
  return readyP;
}
export function useSadaqaReady() {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem('lm.sadaqaSrv') === '1'; } catch { return false; } });
  useEffect(() => { sadaqaReady().then(setOk); }, []);
  return ok;
}

export const sadaqaWall = () => pub<SadaqaWall>('lm_sadaqa_wall');
export const charities = () => pub<Charity[]>('lm_charities').then((l) => (Array.isArray(l) ? l : []));
export const supporterOf = (uid: string) => pub<boolean>('lm_supporter_of', { p_other: uid }).then(Boolean);

const MINE = 'lm.sadaqaMine';
export function cachedMine(): SadaqaMine | null { try { return JSON.parse(localStorage.getItem(MINE) || 'null'); } catch { return null; } }
export async function sadaqaMine(): Promise<SadaqaMine | null> {
  if (!cloudMe()) return null;
  const m = await meRpc<SadaqaMine | null>('lm_sadaqa_mine').catch(() => null);
  if (m) try { localStorage.setItem(MINE, JSON.stringify(m)); } catch { /* */ }
  // Pro that someone gave me lives with the founders' grants (pro_grants): refresh that cache too.
  if (m?.ask?.status === 'got') myFounder().catch(() => null);
  return m;
}
export interface AskResult { ok?: boolean; status?: 'wait' | 'got'; soon?: boolean; error?: string }
export const proAsk = (note: string): Promise<AskResult> => meRpc<AskResult>('lm_pro_ask', { p_note: note.slice(0, 200) })
  .then((r) => { sadaqaMine(); return r; }).catch((): AskResult => ({ error: 'net' }));

export interface PayOrder { kind: PayKind; eur: Eur; mode: 'once' | 'month'; sign: 'secret' | 'nick'; wall: string }
/** Opens Stripe Checkout. 'nostripe' = payments are not connected yet. */
export async function sadaqaCheckout(o: PayOrder, lang: string): Promise<{ url?: string; error?: string }> {
  const me = cloudMe();
  if (!me) return { error: 'auth' };
  try {
    const r = await fetch('/api/invest?op=sadaqa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...o, lang, uid: me.uid, token: me.token }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return { url: j.url };
    return { error: j.error || 'net' };
  } catch { return { error: 'net' }; }
}
/** The owner's test record: the whole path without paying (stays off the wall and the totals). */
export async function sadaqaTest(o: PayOrder, lang: string): Promise<MyPay | { error: string }> {
  const me = cloudMe(); const t = await accessToken();
  if (!me || !t) return { error: 'auth' };
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/lm_sadaqa_test`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_uid: me.uid, p_token: me.token, p_kind: o.kind, p_eur: o.eur, p_mode: o.mode, p_sign: o.sign, p_wall: o.wall, p_lang: lang }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { error: 'net' };
    if (j.error) return j;
    await sadaqaMine();
    return j as MyPay;
  } catch { return { error: 'net' }; }
}

/** /app/?sadaqa=ok|cancel&k=gift|support (back from Stripe). Read once. */
export function takeSadaqaReturn(): { ok: boolean; kind: PayKind } | null {
  try {
    const u = new URL(location.href);
    const s = u.searchParams.get('sadaqa');
    if (!s) return null;
    const kind: PayKind = u.searchParams.get('k') === 'support' ? 'support' : 'gift';
    ['sadaqa', 'k'].forEach((k) => u.searchParams.delete(k));
    history.replaceState(null, '', u.toString());
    return { ok: s === 'ok', kind };
  } catch { return null; }
}
