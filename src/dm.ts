// «Личные» in Circles: chats of two, marked on the server (supabase/dm.sql).
import { useEffect, useState } from 'react';
import { isCloud, meRpc, cloudMe, serverHas, myCircles, markDms, addCircleQuiet, openCircleChat, type CircleRef } from './cloud';
import type { AvatarPick } from './avatar';
import { _t } from './i18n';

export interface Dm {
  code: string; uid: string; name: string; nick: string | null; color: string; avatar: AvatarPick; gender: string; photo: string;
  src: string; mine: boolean; muted: boolean; pinned: boolean; hidden: boolean; blocked: boolean;
}
export type DmMode = 'chat' | 'direct' | 'ask' | 'new' | 'locked' | 'closed' | 'self';
export interface DmPerson { uid: string; name: string; nick: string | null; color: string; avatar: AvatarPick; gender: string; photo: string; circle: string | null; mode: DmMode }
export interface DmSettings { circles: 'direct' | 'ask' | 'none'; others: 'all' | 'circles' | 'none'; ticks: boolean; bro: boolean; gender: string; sisters_only: boolean; locked: boolean; blocked: number }

let readyP: Promise<boolean> | null = null;
export function dmReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.dmOn') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_dm_list', { p_uid: null, p_token: '' }).then((ok) => { if (ok) try { sessionStorage.setItem('lm.dmOn', '1'); } catch { /* */ } return ok; });
  return readyP;
}
export function useDmReady() {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem('lm.dmOn') === '1'; } catch { return false; } });
  useEffect(() => { dmReady().then(setOk); }, []);
  return ok;
}

const KEY = 'lm.dms';
/** Last known list (so the tab and the chat header draw at once). */
export function dmsCached(): Dm[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Dm[]; } catch { return []; } }
export const dmOf = (code?: string | null) => (code ? dmsCached().find((d) => d.code === code) : undefined);

/** Loads my chats of two; adds any I don't have on this phone to my list. */
export async function loadDms(): Promise<Dm[] | null> {
  if (!cloudMe()) return null;
  const r = await meRpc<Dm[] | null>('lm_dm_list').catch(() => null);
  if (!r) return null;
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* */ }
  const have = new Set(myCircles().map((c) => c.code));
  for (const d of r) if (!have.has(d.code)) addCircleQuiet({ code: d.code, title: d.name || _t("Чат"), kind: 'friends' });
  markDms(r.map((d) => d.code));
  return r;
}
export function useDms(on: boolean) {
  const [list, setList] = useState<Dm[]>(dmsCached);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    loadDms().then((r) => { if (alive && r) setList(r); });
    const t = setInterval(() => { if (document.visibilityState === 'visible') setN((x) => x + 1); }, 60000);
    const f = () => setN((x) => x + 1);
    window.addEventListener('lm-dms-changed', f);
    return () => { alive = false; clearInterval(t); window.removeEventListener('lm-dms-changed', f); };
  }, [on, n]);
  return { list, reload: () => setN((x) => x + 1) };
}
const changed = () => window.dispatchEvent(new Event('lm-dms-changed'));

/** «Круг «Братья · Фаджр»» or «Просьба: Работа». */
export function srcLine(src: string): string {
  if (src.startsWith('c:')) return src.length > 2 ? _t("Круг «{0}»", src.slice(2)) : _t("Из общего круга");
  if (src.startsWith('a:')) {
    const k = src.slice(2);
    const L: Record<string, string> = { hi: _t("Написать"), meet: _t("Познакомиться"), question: _t("Вопрос"), umrah: _t("Умра"), study: _t("Учёба"), learn: _t("Учиться вместе"), job: _t("Работа"), biz: _t("Бизнес"), dua: _t("Просьба о дуа"), other: _t("Другое") };
    return _t("Просьба: {0}", L[k] ?? k);
  }
  return '';
}

export const dmCan = (uid: string) => meRpc<{ mode: DmMode; chat: string | null; ask: string; hi: string } | null>('lm_dm_can', { p_other: uid }).catch(() => null);
export const dmPeople = () => meRpc<DmPerson[] | null>('lm_dm_people').then((x) => x ?? []).catch(() => [] as DmPerson[]);

/** Opens the chat with someone of my circles; '' when it opened, else why not. */
export async function openDm(uid: string): Promise<string> {
  type R = { code?: string; title?: string; error?: string };
  const r = await meRpc<R>('lm_dm_open', { p_other: uid }).catch((): R => ({ error: 'net' }));
  if (!r?.code) return r?.error || 'net';
  markDms([r.code]);
  const ref: CircleRef = { code: r.code, title: r.title || _t("Чат"), kind: 'friends' };
  loadDms().finally(() => openCircleChat(ref));
  return '';
}
export function dmWhy(e: string, first = ''): string {
  return e === 'new' ? _t("Писать в личку можно через сутки после регистрации.")
    : e === 'slow' ? _t("Сегодня уже 10 новых чатов. Попробуй завтра.")
      : e === 'locked' ? _t("Личные сообщения закрыты до проверки жалоб.")
        : e === 'closed' ? _t("{0} сейчас не принимает сообщения.", first || _t("Человек"))
          : e === 'ask' ? _t("Сначала нужна просьба с темой.")
            : _t("Не получилось открыть чат. Проверь интернет.");
}

export async function dmPref(code: string, p: { muted?: boolean; pinned?: boolean; hide?: boolean }) {
  const ok = await meRpc<boolean>('lm_dm_pref', { p_code: code, p_muted: p.muted ?? null, p_pinned: p.pinned ?? null, p_hide: p.hide ?? null }).catch(() => false);
  if (ok) {
    try { localStorage.setItem(KEY, JSON.stringify(dmsCached().map((d) => (d.code === code ? { ...d, muted: p.muted ?? d.muted, pinned: p.pinned ?? d.pinned, hidden: p.hide ?? d.hidden } : d)))); } catch { /* */ }
    changed();
  }
  return ok;
}
export async function dmReport(code: string, reason: string, block: boolean) {
  const ok = await meRpc<boolean>('lm_dm_report', { p_code: code, p_reason: reason, p_block: block }).catch(() => false);
  if (ok) changed();
  return ok;
}
export const dmSettings = () => meRpc<DmSettings | null>('lm_dm_settings').catch(() => null);
export const dmSettingsSet = (p: Partial<DmSettings>) => meRpc<boolean>('lm_dm_settings_set', { p }).catch(() => false);
export const dmBlocked = () => meRpc<{ uid: string; name: string; nick: string | null; color: string }[] | null>('lm_dm_blocked').then((x) => x ?? []).catch(() => []);
export const dmUnblock = (uid: string) => meRpc<boolean>('lm_dm_unblock', { p_other: uid }).then((x) => { changed(); return x; }).catch(() => false);
