import { useEffect, useState } from 'react';
import { isCloud, meRpc, serverHas, cloudMe } from './cloud';
import { _t } from './i18n';

// «Никах через свои круги»: a short profile without photo or contacts, seen only by chosen circles and trusted people;
// proposals come through someone who knows a family and asked them first; families talk through the wali.
// Server: supabase/nikah.sql. Until it is run, every nikah screen stays hidden.

export interface NkData { age?: string; city?: string; prayer?: string; madhab?: string; kids?: string; move?: string; work?: string }
export interface NkMine {
  gender: 'm' | 'f'; data: NkData; about: string; circles: string[]; shared: { uid: string; name: string; nick: string | null }[];
  wali: string | null; wali_name: string | null; wali_rel: string; wali_ok: boolean; active: boolean;
}
export interface NkWard { uid: string; name: string; gender: 'm' | 'f'; data: NkData; about: string; rel: string; ok: boolean }
export type NkStatus = 'new' | 'interested' | 'contacts' | 'meet' | 'done' | 'declined';
export interface NkProp { id: string; to: string; to_name: string; from_name: string; code: string; data: NkData; note: string; status: NkStatus; created: string; contact: string }
export interface NkSent { id: string; to_name: string; status: NkStatus; created: string }
export interface NkMe { mine: NkMine | null; wards: NkWard[]; inbox: NkProp[]; sent: NkSent[] }
export interface NkCard { uid: string; name: string; color: string; gender: 'm' | 'f'; data: NkData; about: string; wali_rel: string; wali_name: string; props: number; sent: boolean }
export interface NkPerson { uid: string; name: string; nick: string | null; color: string }

export const FIELDS: { k: keyof NkData; label: string; opts?: string[]; ph?: string }[] = [
  { k: 'age', label: _t("Возраст"), ph: '27' },
  { k: 'city', label: _t("Город"), ph: _t("Амстердам") },
  { k: 'prayer', label: _t("Намаз"), opts: [_t("5 раз в день"), _t("стараюсь 5 раз"), _t("начинаю")] },
  { k: 'madhab', label: _t("Мазхаб"), opts: [_t("ханафи"), _t("шафии"), _t("малики"), _t("ханбали"), _t("не важно")] },
  { k: 'kids', label: _t("Дети"), opts: [_t("хочу"), _t("есть, хочу ещё"), _t("есть"), _t("обсудим")] },
  { k: 'move', label: _t("Переезд"), opts: [_t("возможен"), _t("только в своём городе"), _t("обсудим")] },
  { k: 'work', label: _t("Дело или учёба"), ph: _t("IT, своё дело") },
];
export const STEPS: { s: NkStatus; title: string; sub: string }[] = [
  { s: 'new', title: _t("Анкета пришла"), sub: _t("Вали и ты смотрите, подходит ли") },
  { s: 'interested', title: _t("Истихара"), sub: _t("Два ракаата и дуа истихары (Бухари, 1162). Обычно до трёх ночей") },
  { s: 'contacts', title: _t("Контакт вали"), sub: _t("Связаться с семьёй, договориться о встрече") },
  { s: 'meet', title: _t("Встреча семей"), sub: _t("При махраме, с вопросами для встречи") },
  { s: 'done', title: _t("Решение"), sub: _t("Если да, дальше никах: дата, имам, свидетели, валима") },
];
export const NEXT: Partial<Record<NkStatus, { to: NkStatus; label: string }>> = {
  new: { to: 'interested', label: _t("✓ Интересно") },
  interested: { to: 'contacts', label: _t("✓ Истихара сделана, открыть контакт") },
  contacts: { to: 'meet', label: _t("✓ Семьи договорились о встрече") },
  meet: { to: 'done', label: _t("✓ Решение принято") },
};
export const MEET_QUESTIONS = [
  _t("Какое место в жизни занимают намаз и Коран?"),
  _t("Где будем жить и как смотришь на переезд?"),
  _t("Работа, учёба и как делим заботы по дому"),
  _t("Дети: когда и сколько, как воспитывать"),
  _t("Отношения с родителями обеих сторон"),
  _t("Что для тебя важно в муже или жене?"),
];
export const brief = (d: NkData) => [d.age && _t("{0} лет", d.age), d.city, d.prayer && _t("намаз {0}", d.prayer), d.madhab, d.kids && _t("дети: {0}", d.kids), d.move && _t("переезд: {0}", d.move), d.work].filter(Boolean).join(' · ');

let readyP: Promise<boolean> | null = null;
export function nikahReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.nikah') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_nikah_feed', { p_uid: null, p_token: '', p_code: '' }).then((ok) => { if (ok) try { sessionStorage.setItem('lm.nikah', '1'); } catch { /* */ } return ok; });
  return readyP;
}
export function useNikahReady() {
  const [ok, setOk] = useState(false);
  useEffect(() => { nikahReady().then(setOk); }, []);
  return ok;
}

// ── my nikah state, shared by Profile, Today and Circle ──
let cur: NkMe | null = null;
const subs = new Set<(x: NkMe | null) => void>();
export async function refreshNikah(): Promise<NkMe | null> {
  if (!cloudMe() || !(await nikahReady())) return null;
  try { cur = await meRpc<NkMe | null>('lm_nikah_me'); } catch { return cur; }
  subs.forEach((f) => f(cur));
  return cur;
}
export function useNikahMe(on = true): NkMe | null {
  const [x, setX] = useState(cur);
  useEffect(() => {
    if (!on) return;
    subs.add(setX);
    refreshNikah();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshNikah(); }, 120000);
    return () => { subs.delete(setX); clearInterval(t); };
  }, [on]);
  return x;
}

export const saveNikah = (p: Omit<NkMine, 'shared' | 'wali_name' | 'wali_ok'> & { shared: string[] }) => meRpc<string>('lm_nikah_save', { p }).catch(() => 'error');
export const deleteNikah = () => meRpc<boolean>('lm_nikah_delete').catch(() => false);
export const answerWali = (owner: string, ok: boolean) => meRpc<boolean>('lm_nikah_wali', { p_owner: owner, p_ok: ok }).catch(() => false);
export const nikahFeed = (code: string) => meRpc<NkCard[] | null>('lm_nikah_feed', { p_code: code }).then((x) => x ?? []).catch(() => [] as NkCard[]);
export const nikahPeople = () => meRpc<NkPerson[] | null>('lm_nikah_people').then((x) => x ?? []).catch(() => [] as NkPerson[]);
export const propose = (to: string, code: string, p: { data: NkData; note: string; contact: string; agreed: boolean }) =>
  meRpc<string>('lm_nikah_propose', { p_to: to, p_code: code, p }).catch(() => 'error');
export const answerProp = (id: string, status: NkStatus) => meRpc<string>('lm_nikah_answer', { p_id: id, p_status: status }).catch(() => 'error');
export const withdrawProp = (id: string) => meRpc<boolean>('lm_nikah_withdraw', { p_id: id }).catch(() => false);

/** What needs my attention: new proposals to me or my wards, and wali requests. */
export function nikahTodo(x: NkMe | null): { props: number; wali: NkWard[] } {
  if (!x) return { props: 0, wali: [] };
  return { props: x.inbox.filter((p) => p.status === 'new').length, wali: x.wards.filter((w) => !w.ok) };
}
