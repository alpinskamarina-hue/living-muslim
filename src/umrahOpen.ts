// «Ищут людей»: open umrah groups (supabase/umrah-open.sql). An amir opens his trip himself; others see only
// the title, month, city, the amir's first name, how many go and how many places are left, and ask to join.
import { useCallback, useEffect, useState } from 'react';
import { isCloud, meRpc } from './cloud';

export type Who = 'brothers' | 'sisters' | 'families' | 'all';
export interface OpenGroup {
  host: string; title: string; month: string; city: string; from: string | null; amir: string;
  going: number; places: number; who: Who; note: string;
  mine: { id: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; reply: string } | null;
}
export interface MyListing { code: string; places: number; who: Who; note: string }
export interface AskToMe { id: string; uid: string; name: string; nick: string | null; color: string; gender: string; note: string; reply: string; created: string }
export interface MyAsk { id: string; host: string; amir: string; title: string; status: 'pending' | 'accepted' | 'declined'; reply: string; created: string }

/** false while the server has no umrah-open.sql yet: the whole feature stays hidden. */
let serverOk: boolean | null = null;
const tryRpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> => {
  try { const r = await meRpc<T>(fn, args); serverOk = true; return r; } catch (e) {
    if (/404|PGRST202|Could not find/.test(String((e as Error)?.message))) serverOk = false;
    return null;
  }
};

export const openList = () => tryRpc<OpenGroup[]>('lm_umrah_open_list').then((r) => r ?? []);
export const openMine = () => tryRpc<MyListing | null>('lm_umrah_open_mine');
export const openSet = (code: string, p: { places: number; who: Who; note: string } | null) => tryRpc<string>('lm_umrah_open_set', { p_code: code, p }).then((r) => r ?? 'error');
export const askJoin = (host: string, note: string) => tryRpc<string>('lm_umrah_ask', { p_host: host, p_note: note }).then((r) => r ?? 'error');
export const askCancel = (id: string) => tryRpc<boolean>('lm_umrah_ask_cancel', { p_id: id }).then(Boolean);
export const askAnswer = (id: string, act: 'yes' | 'no' | 'reply', text = '') => tryRpc<string>('lm_umrah_answer', { p_id: id, p_act: act, p_text: text }).then((r) => r ?? 'error');

const EV = 'lm-umrah-asks';
/** Requests to my trip and answers to mine. Refreshed every two minutes and after any change here. */
export function useUmrahAsks(on = true) {
  const [v, setV] = useState<{ to_me: AskToMe[]; mine: MyAsk[] }>({ to_me: [], mine: [] });
  const [ok, setOk] = useState<boolean | null>(serverOk);
  const load = useCallback(async () => {
    if (!isCloud) return;
    const r = await tryRpc<{ to_me: AskToMe[]; mine: MyAsk[] }>('lm_umrah_asks');
    setOk(serverOk);
    if (r) setV({ to_me: r.to_me ?? [], mine: r.mine ?? [] });
  }, []);
  useEffect(() => {
    if (!on || !isCloud) return;
    load();
    const t = setInterval(load, 120000);
    const onEv = () => load();
    window.addEventListener(EV, onEv);
    return () => { clearInterval(t); window.removeEventListener(EV, onEv); };
  }, [on, load]);
  return { ...v, ok, reload: load };
}
export const asksChanged = () => window.dispatchEvent(new Event(EV));
