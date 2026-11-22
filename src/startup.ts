// The startup circle: the path of 5 stages, the idea on one page, the 7-day idea check, customer talks,
// the team vote with istikhara, the weekly pulse. Server: supabase/startup.sql (needs biz-work.sql too).
import { useCallback, useEffect, useState } from 'react';
import { isCloud, meRpc, serverHas } from './cloud';
import { _t } from './i18n';

export interface Idea { problem?: string; who?: string; solution?: string; better?: string; earn?: string }
export interface Check { start?: string; done?: Record<string, string>; list?: number; pre?: number }
export interface SuState { stage: number; idea: Idea; chk: Check; pulse_label: string; pulse_goal: number | null; goal_by: string | null; mentors: string[]; round: number }
export interface Talk { id: number; who: string; quote: string; pain: number; by: string | null; created: string }
export type Vote = 'go' | 'change' | 'stop';
export interface SuVote { uid: string; vote: Vote; note: string; at: string }
export interface SuData { state: SuState; talks: Talk[]; votes: SuVote[]; pulse: { week: string; value: number }[] }

const EMPTY: SuState = { stage: 1, idea: {}, chk: {}, pulse_label: '', pulse_goal: null, goal_by: null, mentors: [], round: 1 };

let readyP: Promise<boolean> | null = null;
export function startupReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.startup') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_su_get', { p_uid: null, p_token: null, p_code: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.startup', '1'); } catch { /* */ }
    return ok;
  });
  return readyP;
}
export function useStartupReady(on: boolean) {
  const [ok, setOk] = useState(false);
  useEffect(() => { if (on) startupReady().then(setOk); }, [on]);
  return ok && on;
}

export function useStartup(code: string | undefined, on: boolean) {
  const [data, setData] = useState<SuData | null>(null);
  const load = useCallback(async () => {
    if (!code) return;
    const r = await meRpc<Partial<SuData> | null>('lm_su_get', { p_code: code }).catch(() => null);
    if (r) setData({ state: { ...EMPTY, ...(r.state ?? {}), idea: r.state?.idea ?? {}, chk: r.state?.chk ?? {}, mentors: Array.isArray(r.state?.mentors) ? r.state!.mentors : [] }, talks: r.talks ?? [], votes: r.votes ?? [], pulse: r.pulse ?? [] });
  }, [code]);
  useEffect(() => {
    setData(null);
    if (!on || !code) return;
    let alive = true, t: number | undefined;
    const tick = async () => { if (!alive) return; if (document.visibilityState === 'visible') await load(); t = window.setTimeout(tick, 20000); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [code, on, load]);
  const call = async <T,>(fn: string, args: Record<string, unknown>) => { const r = await meRpc<T>(fn, { p_code: code, ...args }).catch(() => null); await load(); return r; };
  return {
    data, reload: load,
    set: (p: Partial<SuState>) => {
      if (data) setData({ ...data, state: { ...data.state, ...p } }); // feels instant
      return call<boolean>('lm_su_set', { p });
    },
    setTalk: (id: number, p: Partial<Talk> | null) => call<number>('lm_su_talk_set', { p_id: id, p }),
    vote: (v: Vote | null, note = '') => call<boolean>('lm_su_vote', { p_vote: v, p_note: note }),
    setPulse: (week: string, value: number | null) => call<boolean>('lm_su_pulse_set', { p_week: week, p_value: value }),
  };
}
export type SuApi = ReturnType<typeof useStartup>;

export const STAGES = (): { t: string; sub: string }[] => [
  { t: _t("Идея"), sub: _t("Идея на одной странице") },
  { t: _t("Проверка"), sub: _t("7 дней: разговоры, предзаказы, список ожидания") },
  { t: _t("Первая версия"), sub: _t("Самое простое, что можно дать людям") },
  { t: _t("Первые клиенты"), sub: _t("10 человек, которые вернулись сами") },
  { t: _t("Рост"), sub: _t("Пульс недели, команда, деньги без риба") },
];
export const IDEA_FIELDS = (): { k: keyof Idea; t: string; ph: string }[] => [
  { k: 'problem', t: _t("Проблема"), ph: _t("Что болит у людей? Например: халяль-еду долго искать") },
  { k: 'who', t: _t("Для кого"), ph: _t("Кто именно? Например: семьи, которые работают до вечера") },
  { k: 'solution', t: _t("Решение"), ph: _t("Что ты даёшь? Например: доставка за 30 минут") },
  { k: 'better', t: _t("Чем лучше"), ph: _t("Почему выберут вас, а не других?") },
  { k: 'earn', t: _t("Как зарабатываем"), ph: _t("Без процентов и долгов. Например: наценка на доставку") },
];
/** The 7 days of the idea check: one task a day. */
export const CHECK_DAYS = (): string[] => [
  _t("Записать 5 человек, у кого есть эта проблема"),
  _t("Сделать простую страницу с предзаказом"),
  _t("Поговорить с 5 людьми из списка"),
  _t("Позвать 10 человек в список ожидания"),
  _t("Попросить первый предзаказ или задаток"),
  _t("Собрать итог разговоров и цифры"),
  _t("Решить командой: делаем, меняем или стоп"),
];
export const QUESTIONS = (): string[] => [
  _t("Когда в последний раз с тобой это было?"),
  _t("Что ты тогда сделал?"),
  _t("Сколько времени или денег это стоило?"),
  _t("Что раздражало больше всего?"),
  _t("Если бы это решили, что изменилось бы?"),
];

const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Day of the check, 1..7 (0 = not started, 8+ = over). */
export function checkDay(chk: Check, today: string): number {
  if (!chk.start) return 0;
  return Math.floor((D(today).getTime() - D(chk.start).getTime()) / 864e5) + 1;
}
export const mondayOf = (day: string) => { const d = D(day); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return keyOf(d); };
export const isThursday = (day: string) => D(day).getDay() === 4;
export const thursdayOf = (day: string) => { const d = D(day); const back = (d.getDay() - 4 + 7) % 7; d.setDate(d.getDate() - back); return keyOf(d); };

/** Short local summary of the talks (no AI needed): how many felt the pain. */
export function talkSummary(talks: Talk[]): { n: number; strong: number; avg: number } {
  const n = talks.length;
  const strong = talks.filter((t) => t.pain >= 4).length;
  const avg = n ? Math.round((talks.reduce((a, t) => a + t.pain, 0) / n) * 10) / 10 : 0;
  return { n, strong, avg };
}
/** When the goal is reached at the current pace (last 4 weeks), or null. */
export function forecast(pulse: { week: string; value: number }[], goal: number | null): string | null {
  if (!goal || pulse.length < 2) return null;
  const last = pulse[pulse.length - 1], first = pulse[Math.max(0, pulse.length - 5)];
  const weeks = (D(last.week).getTime() - D(first.week).getTime()) / (7 * 864e5);
  const pace = weeks > 0 ? (last.value - first.value) / weeks : 0;
  if (last.value >= goal) return keyOf(D(last.week));
  if (pace <= 0) return null;
  const d = D(last.week); d.setDate(d.getDate() + Math.ceil((goal - last.value) / pace) * 7);
  return keyOf(d);
}
