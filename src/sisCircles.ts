// Sisters' circles by theme and verified teachers (supabase/sisters-circles.sql).
// An owner gives her open circle a theme; the catalog shows theme tiles to sisters. A teacher sends her ijazah or
// diploma (only the team sees it); once the team checks it, her open circles carry «✓ проверенная учительница».
import { useEffect, useState } from 'react';
import { cloudRpc, isCloud, meRpc } from './cloud';
import { _t } from './i18n';

export type Topic = '' | 'moms' | 'new' | 'hifz' | 'tajwid' | 'arabic' | 'fiqh' | 'sport' | 'study' | 'biz';
export const TOPICS: { k: Exclude<Topic, ''>; l: () => string; bg: string; fg: string }[] = [
  { k: 'moms', l: () => _t("Мамы"), bg: '#f7ecec', fg: '#7d4456' },
  { k: 'new', l: () => _t("Новые мусульманки"), bg: '#e8f3ec', fg: '#2f6b4f' },
  { k: 'hifz', l: () => _t("Хифз"), bg: '#f6ecd6', fg: '#8a611b' },
  { k: 'tajwid', l: () => _t("Таджвид с учительницей"), bg: '#e3eeec', fg: '#2f6f6a' },
  { k: 'sport', l: () => _t("Спорт дома"), bg: '#ece7fb', fg: '#5b4a9a' },
  { k: 'arabic', l: () => _t("Арабский"), bg: '#e6f0f8', fg: '#335f86' },
  { k: 'fiqh', l: () => _t("Фикх для сестёр"), bg: '#f3eee4', fg: '#6b5a35' },
  { k: 'study', l: () => _t("Учёба"), bg: '#e6f4f6', fg: '#2a6a74' },
  { k: 'biz', l: () => _t("Работа и дело"), bg: '#f3e6dc', fg: '#9a5a33' },
];
export const topicOf = (k?: string) => TOPICS.find((t) => t.k === k);

export type Subject = 'tajwid' | 'hifz' | 'arabic' | 'new' | 'fiqh' | 'kids';
export const SUBJECTS: { k: Subject; l: () => string }[] = [
  { k: 'tajwid', l: () => _t("Таджвид") },
  { k: 'hifz', l: () => _t("Хифз") },
  { k: 'arabic', l: () => _t("Арабский") },
  { k: 'new', l: () => _t("Основы для новых") },
  { k: 'fiqh', l: () => _t("Фикх для сестёр") },
  { k: 'kids', l: () => _t("Для детей") },
];
export const subjectsText = (s?: string[]) => (s ?? []).map((k) => SUBJECTS.find((x) => x.k === k)?.l()).filter(Boolean).join(', ');

let ready: boolean | null = null;
const waiters = new Set<(v: boolean) => void>();
/** true once the server has sisters-circles.sql; until then themes and teachers stay hidden. */
export function useSisCirclesReady(): boolean {
  const [ok, setOk] = useState(Boolean(ready));
  useEffect(() => {
    if (!isCloud) return;
    if (ready !== null) { setOk(ready); return; }
    waiters.add(setOk);
    if (waiters.size === 1) {
      cloudRpc('lm_open_topic_get', { p_uid: null, p_token: null, p_code: '' })
        .then(() => true, () => false)
        .then((v) => { ready = v; waiters.forEach((f) => f(v)); waiters.clear(); });
    }
    return () => { waiters.delete(setOk); };
  }, []);
  return ok;
}

export const openTopicGet = (code: string) => meRpc<string | null>('lm_open_topic_get', { p_code: code }).catch(() => null);
export const openTopicSet = (code: string, topic: Topic) => meRpc<string>('lm_open_topic', { p_code: code, p_topic: topic }).catch(() => 'error');

export interface TeacherMe { status: 'pending' | 'ok' | 'no'; subjects: string[]; ref: string; about: string; proof: boolean; created: string }
export const teacherMe = () => meRpc<TeacherMe | null>('lm_teacher_me').catch(() => null);
export const teacherApply = (p: { subjects: string[]; proof: string; ref: string; about: string }) =>
  meRpc<string>('lm_teacher_apply', { p }).catch(() => 'error');
export const teacherWithdraw = () => meRpc<boolean>('lm_teacher_withdraw').catch(() => false);

/** The town the person set for prayer times, for «Рядом со мной». */
export function myTown(): string {
  try { const s = JSON.parse(localStorage.getItem('qadam.v1') || '{}'); return String(s?.settings?.place || '').split(',')[0].trim(); } catch { return ''; }
}
export const sameTown = (a: string, b: string) => Boolean(a && b) && a.trim().toLowerCase().split(',')[0] === b.trim().toLowerCase().split(',')[0];
