// A person's profile others can open, «Сейчас ищу» and asks to get in touch (supabase/intents.sql).
import { useEffect, useState } from 'react';
import { isCloud, meRpc, serverHas, cloudMe, addCircleQuiet, myCircles, type CircleRef } from './cloud';
import type { AvatarPick } from './avatar';
import { _t } from './i18n';

export type IntentKind = 'umrah' | 'nikah' | 'job' | 'biz' | 'study';
export type AskKind = 'hi' | 'umrah' | 'job' | 'biz' | 'study' | 'meet' | 'question' | 'learn' | 'dua' | 'other';
export interface Intent { kind: IntentKind; mode: string; title: string; note: string; vis: 'circles' | 'all'; updated: string; until: string }
export interface Person {
  uid: string; name: string; nick: string | null; bio: string; avatar: AvatarPick; color: string; gender: string; city: string; since: string; photo: string;
  shared: string[]; intents: Intent[]; can: Partial<Record<AskKind, string>>; asked: boolean; chat: string | null;
}
export interface FeedItem { uid: string; name: string; nick: string | null; color: string; avatar: AvatarPick; gender: string; city: string; photo: string; code: string | null; kind: IntentKind; mode: string; title: string; note: string; updated: string }
export interface Ask { id: string; kind: AskKind; note: string; created: string; from: { uid: string; name: string; nick: string | null; color: string; avatar: AvatarPick; city: string; photo: string; since?: string; shared?: string[] } }

interface Mode { id: string; label: string; tag: string; btn: string }
export interface IntentMeta { ic: string; label: string; sub: string; cls: string; modes: Mode[]; ph: string; ph2: string }
export const INTENTS: Record<IntentKind, IntentMeta> = {
  umrah: { ic: '🕋', label: _t("Умра"), sub: _t("Еду на умру или собираю группу"), cls: 'u', ph: _t("Когда и откуда, например: 12–20 марта из Казани"), ph2: _t("Например: ищем ещё двоих братьев"),
    modes: [{ id: 'go', label: _t("Еду"), tag: _t("Едет на умру"), btn: _t("Хочу с вами") }, { id: 'group', label: _t("Собираю группу"), tag: _t("Собирает группу на умру"), btn: _t("Хочу с вами") }] },
  nikah: { ic: '💍', label: _t("Никах"), sub: _t("В профиле только значок. Анкета, вали и знакомство идут через раздел «Никах»"), cls: 'n', ph: '', ph2: '',
    modes: [{ id: '', label: '', tag: _t("Ищет никах"), btn: '' }] },
  job: { ic: '💼', label: _t("Работа"), sub: _t("Ищу работу или нанимаю людей"), cls: 'j', ph: _t("Кем, например: дизайнер интерфейсов"), ph2: _t("Опыт, где: удалённо, Казань, с января"),
    modes: [{ id: 'seek', label: _t("Ищу работу"), tag: _t("Ищет работу"), btn: _t("Есть предложение") }, { id: 'hire', label: _t("Нанимаю"), tag: _t("Нанимает"), btn: _t("Откликнуться") }, { id: 'part', label: _t("Подработка"), tag: _t("Ищет подработку"), btn: _t("Есть подработка") }] },
  biz: { ic: '🚀', label: _t("Бизнес и стартап"), sub: _t("Свой проект, кофаундер или помощь другим"), cls: 'b', ph: _t("Проект, например: халяль-кофейня в Казани"), ph2: _t("Кого ищу, например: партнёра с опытом в общепите"),
    modes: [{ id: 'partner', label: _t("Ищу партнёра"), tag: _t("Ищет партнёра"), btn: _t("Связаться") }, { id: 'invest', label: _t("Ищу инвестора"), tag: _t("Ищет инвестора"), btn: _t("Связаться") }, { id: 'clients', label: _t("Ищу клиентов"), tag: _t("Ищет клиентов"), btn: _t("Связаться") }, { id: 'share', label: _t("Делюсь опытом"), tag: _t("Делится опытом"), btn: _t("Спросить совета") }, { id: 'cofounder', label: _t("Ищу кофаундера"), tag: _t("Ищет кофаундера"), btn: _t("Хочу в команду") }, { id: 'join', label: _t("Хочу в стартап"), tag: _t("Хочет в стартап"), btn: _t("Позвать в команду") }] },
  study: { ic: '🎓', label: _t("Учёба"), sub: _t("Ищу напарника для Корана, арабского или курса"), cls: 's', ph: _t("Что учу, например: арабский по дням, A1"), ph2: _t("Например: 15 минут в день, после Иши"),
    modes: [{ id: 'quran', label: _t("Коран"), tag: _t("Учит Коран"), btn: _t("Учиться вместе") }, { id: 'arabic', label: _t("Арабский"), tag: _t("Учит арабский"), btn: _t("Учиться вместе") }, { id: 'other', label: _t("Другое"), tag: _t("Ищет напарника по учёбе"), btn: _t("Учиться вместе") }] },
};
export const KINDS: IntentKind[] = ['umrah', 'nikah', 'job', 'biz', 'study'];
export const modeOf = (i: { kind: IntentKind; mode: string }) => INTENTS[i.kind].modes.find((m) => m.id === i.mode) ?? INTENTS[i.kind].modes[0];
export const ASK_LABEL: Record<AskKind, string> = { hi: _t("хочет написать тебе"), umrah: _t("про умру"), job: _t("про работу"), biz: _t("про бизнес"), study: _t("про учёбу"),
  meet: _t("хочет познакомиться"), question: _t("с вопросом"), learn: _t("про учёбу вместе"), dua: _t("с просьбой о дуа"), other: _t("хочет написать тебе") };

let readyP: Promise<boolean> | null = null;
export function personReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.person') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_intents_feed', { p_uid: null, p_token: '' }).then((ok) => { if (ok) try { sessionStorage.setItem('lm.person', '1'); } catch { /* */ } return ok; });
  return readyP;
}
/** Already known to be on (no waiting): for taps in lists. */
export function personOk(): boolean { try { return sessionStorage.getItem('lm.person') === '1'; } catch { return false; } }
export function usePersonReady() {
  const [ok, setOk] = useState(false);
  useEffect(() => { personReady().then(setOk); }, []);
  return ok;
}

/** Opens someone's profile over the app. */
export function openPerson(uid: string) {
  if (!uid) return;
  window.dispatchEvent(new CustomEvent('lm-person', { detail: { uid } }));
}

export const getPerson = (uid: string) => meRpc<Person | null>('lm_person', { p_other: uid }).catch(() => null);
export const myIntents = () => meRpc<{ city: string; list: Intent[] } | null>('lm_intents_mine').catch(() => null);
export const setIntent = (kind: IntentKind, p: Partial<Intent> | null) => meRpc<string>('lm_intent_set', { p_kind: kind, p }).catch(() => 'error');
export const setCity = (city: string) => meRpc<boolean>('lm_city_set', { p_city: city }).catch(() => false);
export const intentsFeed = () => meRpc<FeedItem[] | null>('lm_intents_feed').then((x) => x ?? []).catch(() => [] as FeedItem[]);
export const reportAsk = (id: string) => meRpc<boolean>('lm_ask_report', { p_id: id }).catch(() => false);
export const sendAsk = (to: string, kind: AskKind, note: string) => meRpc<string>('lm_ask', { p_to: to, p_kind: kind, p_note: note }).catch(() => 'error');
export async function answerAsk(id: string, yes: boolean): Promise<CircleRef | null | false> {
  const r = await meRpc<{ ok: boolean; code?: string; title?: string } | null>('lm_ask_answer', { p_id: id, p_yes: yes }).catch(() => null);
  if (!r?.ok) return false;
  return r.code ? { code: r.code, title: r.title || _t("Чат"), kind: 'friends' } : null;
}

/** Asks to me; chats that people opened for my asks are added to my circles quietly. */
export async function loadAsks(): Promise<Ask[]> {
  if (!cloudMe()) return [];
  const r = await meRpc<{ in: Ask[]; out: { code: string; title: string }[] } | null>('lm_asks').catch(() => null);
  if (!r) return [];
  const have = new Set(myCircles().map((c) => c.code));
  for (const o of r.out ?? []) if (!have.has(o.code)) addCircleQuiet({ code: o.code, title: o.title || _t("Чат"), kind: 'friends' });
  return r.in ?? [];
}
export function useAsks(on: boolean, pollMs = 0) {
  const [list, setList] = useState<Ask[]>([]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    loadAsks().then((x) => { if (alive) setList(x); });
    return () => { alive = false; };
  }, [on, n]);
  useEffect(() => {
    if (!on || !pollMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') setN((x) => x + 1); }, pollMs);
    const f = () => setN((x) => x + 1);
    window.addEventListener('lm-asks-changed', f);
    return () => { clearInterval(t); window.removeEventListener('lm-asks-changed', f); };
  }, [on, pollMs]);
  return { list, reload: () => setN((x) => x + 1) };
}

/** «12 марта»-style range from two YYYY-MM-DD days. */
export function rangeOf(from?: string, to?: string, loc = 'ru-RU') {
  if (!from) return '';
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  return to && to !== from ? `${f(from)} – ${f(to)}` : f(from);
}
