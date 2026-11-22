// Open circles and the common circle «Общий круг Living Muslim» (supabase/open-circles.sql).
// Open circles: an owner shows his circle in «Найти круг»; strangers see only its public card. Brothers never
// see sisters' circles and the other way round. The common circle: everyone is in it, no free chat.
import { useCallback, useEffect, useState } from 'react';
import { cloudMe, cloudRpc, isCloud, meRpc, type CircleKind } from './cloud';

export type OWho = 'brothers' | 'sisters' | 'all';
export interface OpenCard {
  id: string; title: string; kind: CircleKind; about: string; who: OWho; join: 'open' | 'ask'; lang: string; city: string;
  max: number; verified: boolean; n: number; today: number; member: boolean; asked: 'pending' | 'accepted' | 'declined' | 'cancelled' | null; post_at?: string | null;
}
export interface OpenView extends OpenCard { rules: string[]; amir: string; fajr: number; days: number; code: string | null }
export interface OpenSettings { id?: string; about: string; rules: string[]; who: OWho; wants_all?: boolean; join: 'open' | 'ask'; lang: string; city: string; max: number; helpers: string[]; verified?: boolean }
export interface OpenAsk { id: string; uid: string; name: string; nick: string | null; color: string; city: string; since: string; note: string; created: string }
export interface OpenMine { owner: boolean; can: boolean; kind: string; gender: string; open: OpenSettings | null; asks: OpenAsk[]; members: { uid: string; name: string }[] }
export interface OpenMe { open: boolean; id?: string; who?: OWho; helper?: boolean; boss?: boolean; write_at?: string | null; links_at?: string | null; text_only?: boolean }
export interface CommonDua { id: number; body: string; amin: number; created: string; mine: boolean; said: boolean }
export interface Common { people: number; fajr: number; marked: boolean; khatm: { juz: number; done: boolean; mine: boolean }[]; dua: CommonDua[] }

/** Kinds an owner may open. Family, umrah (it has «Ищут людей»), business and chats of two stay closed. */
export const OPEN_KINDS: CircleKind[] = ['brothers', 'sisters', 'study', 'masjid', 'friends', 'startup', 'other'];

const args = () => { const me = cloudMe(); return { p_uid: me?.uid ?? null, p_token: me?.token ?? null }; };
const call = <T,>(fn: string, a: Record<string, unknown> = {}) => cloudRpc<T>(fn, { ...args(), ...a });

let ready: boolean | null = null;
const waiters = new Set<(v: boolean) => void>();
/** true once the server has open-circles.sql; until then everything here stays hidden. */
export function useOpenReady(): boolean {
  const [ok, setOk] = useState(Boolean(ready));
  useEffect(() => {
    if (!isCloud) return;
    if (ready !== null) { setOk(ready); return; }
    waiters.add(setOk);
    if (waiters.size === 1) {
      cloudRpc('lm_common', { p_uid: null, p_token: null, p_day: '2000-01-01', p_month: '2000-01' })
        .then(() => true, () => false)
        .then((v) => { ready = v; waiters.forEach((f) => f(v)); waiters.clear(); });
    }
    return () => { waiters.delete(setOk); };
  }, []);
  return ok;
}

const G = 'lm.gender';
/** The gender the catalog filters by: profile first, else what the person picked here. */
export const savedGender = (): '' | 'm' | 'f' => { try { const g = localStorage.getItem(G); return g === 'm' || g === 'f' ? g : ''; } catch { return ''; } };
export const rememberGender = (g: 'm' | 'f') => { try { localStorage.setItem(G, g); } catch { /* */ } };

export const openList = (gender: string, day: string) => call<OpenCard[]>('lm_open_list', { p_gender: gender, p_day: day }).catch(() => [] as OpenCard[]);
export const openView = (gender: string, id: string, day: string) => call<OpenView | null>('lm_open_view', { p_gender: gender, p_id: id, p_day: day }).catch(() => null);
export const openJoin = (id: string, note: string) => meRpc<{ r: string; code?: string; title?: string; kind?: CircleKind }>('lm_open_join', { p_id: id, p_note: note }).catch(() => ({ r: 'error' } as { r: string; code?: string; title?: string; kind?: CircleKind }));
export const openAskCancel = (id: string) => meRpc<boolean>('lm_open_ask_cancel', { p_id: id }).catch(() => false);
export const openMine = (code: string) => meRpc<OpenMine | null>('lm_open_mine', { p_code: code }).catch(() => null);
export const openSet = (code: string, p: Partial<OpenSettings> | null) => meRpc<string>('lm_open_set', { p_code: code, p }).catch(() => 'error');
export const openAnswer = (ask: string, yes: boolean) => meRpc<string>('lm_open_answer', { p_ask: ask, p_yes: yes }).catch(() => 'error');
export const openPending = () => meRpc<{ code: string; title: string; n: number }[]>('lm_open_pending').catch(() => [] as { code: string; title: string; n: number }[]);
export const openMe = (code: string) => meRpc<OpenMe | null>('lm_open_me', { p_code: code }).catch(() => null);

export const commonGet = (day: string, month: string) => call<Common>('lm_common', { p_day: day, p_month: month }).catch(() => null);
export const commonMark = (day: string) => meRpc<boolean>('lm_common_mark', { p_day: day }).catch(() => false);
export const commonJuz = (month: string, juz: number, act: 'take' | 'done' | 'drop') => meRpc<string>('lm_common_juz', { p_month: month, p_juz: juz, p_act: act }).catch(() => 'error');
export const commonDuaAdd = (body: string) => meRpc<string>('lm_common_dua_add', { p_body: body }).catch(() => 'error');
export const commonAmin = (id: number) => meRpc<number>('lm_common_amin', { p_id: id }).catch(() => null);
export const commonReport = (id: number) => meRpc<boolean>('lm_common_report', { p_id: id }).catch(() => false);
export const commonDuaDel = (id: number) => meRpc<boolean>('lm_common_dua_del', { p_id: id }).catch(() => false);

/** The common circle's numbers, refreshed every minute while shown. */
export function useCommon(on: boolean, day: string) {
  const month = day.slice(0, 7);
  const [c, setC] = useState<Common | null>(null);
  const load = useCallback(() => commonGet(day, month).then((r) => { if (r) setC(r); }), [day, month]);
  useEffect(() => {
    if (!on) return;
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(t);
  }, [on, load]);
  return { c, month, reload: load };
}

/** Counts me in «прочитали Фаджр сегодня» once a day, after Fajr is marked. */
export function markFajrOnce(day: string) {
  if (!isCloud || !cloudMe() || ready === false) return;
  const k = 'lm.cfajr';
  try { if (localStorage.getItem(k) === day) return; } catch { /* */ }
  commonMark(day).then((ok) => { if (ok) { try { localStorage.setItem(k, day); } catch { /* */ } } });
}
