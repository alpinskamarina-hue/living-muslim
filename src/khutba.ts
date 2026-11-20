// «Перевод хутбы»: the phone listens to the imam with its own speech recognition (Web Speech API: free, no audio
// leaves the phone except to the phone's own recognition service), sends the recognised text in short pieces to
// /api/khutba and shows the translation as subtitles. Nothing is stored unless the person presses «Сохранить».
import { accessToken } from './auth';
import { RecCtor } from './speech';
import { loadQuran } from './components/Quran';
import type { AppState } from './types';

export type KFrom = 'ar' | 'tr' | 'en';
export type KTo = 'ru' | 'en' | 'tr';
export interface KTerm { w: string; src: string; note: string }
export interface KAyah { s: number; a: number; ar: string; tr: string; name: string; sure: boolean }
export interface KLine { id: number; text: string; terms: KTerm[]; ayah?: KAyah; gap?: boolean }
export interface KhutbaRec { id: string; day: string; mins: number; from: KFrom; to: KTo; lines: string[]; points: string[] }
export interface KhutbaState { from?: KFrom; to?: KTo; size?: 0 | 1 | 2; src?: boolean; saved?: KhutbaRec[] }

export const SPEECH: Record<KFrom, string> = { ar: 'ar-SA', tr: 'tr-TR', en: 'en-US' };
export const kh = (s: AppState): KhutbaState => s.khutba ?? {};

/** On Friday from Fajr until Asr the Today screen offers the translation. */
export const fridayWindow = (now: Date, asr: Date) => now.getDay() === 5 && now < asr;

// ───── Listening ─────

export type HearStatus = 'on' | 'quiet' | 'denied' | 'none' | 'paused';
export interface Hearing { stop: () => void }

/**
 * Keeps listening until stop(): phones end recognition on every pause, so each session that ends is started again.
 * onFinal gets each recognised piece once; onInterim the piece being said now.
 */
export function hear(lang: string, onInterim: (t: string) => void, onFinal: (t: string) => void, onStatus: (s: HearStatus) => void): Hearing | null {
  const C = RecCtor();
  if (!C) { onStatus('none'); return null; }
  let stopped = false, lastHeard = Date.now(), fails = 0;
  let r: InstanceType<NonNullable<ReturnType<typeof RecCtor>>> | null = null;
  const tick = setInterval(() => { if (!stopped) onStatus(Date.now() - lastHeard > 25000 ? 'quiet' : 'on'); }, 3000);
  const session = () => {
    if (stopped) return;
    const x = new C();
    r = x;
    x.lang = lang; x.interimResults = true; x.continuous = false;
    let fin = '';
    const began = Date.now();
    x.onresult = (e) => {
      lastHeard = Date.now(); fails = 0;
      let interim = '';
      fin = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += ' ' + res[0].transcript; else interim += ' ' + res[0].transcript;
      }
      onInterim((fin + ' ' + interim).replace(/\s+/g, ' ').trim());
    };
    x.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') { stopped = true; clearInterval(tick); onStatus('denied'); }
    };
    x.onend = () => {
      const t = fin.replace(/\s+/g, ' ').trim();
      if (t) onFinal(t);
      onInterim('');
      if (stopped) return;
      // A session that ended at once (no network, busy microphone) is not restarted in a tight loop.
      if (Date.now() - began < 500) fails++;
      setTimeout(session, fails ? Math.min(4000, 400 * fails) : 0);
    };
    try { x.start(); } catch { setTimeout(session, 1000); }
  };
  session();
  return {
    stop: () => {
      stopped = true; clearInterval(tick);
      if (r) { try { r.stop(); } catch { /* ended already */ } }
    },
  };
}

// ───── Screen stays on ─────

type Lock = { release: () => Promise<void> };
export function keepAwake(): () => void {
  let lock: Lock | null = null, off = false;
  const get = async () => {
    try {
      const n = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Lock> } };
      if (!off && n.wakeLock && document.visibilityState === 'visible') lock = await n.wakeLock.request('screen');
    } catch { /* not supported or refused: the tip asks to keep the screen on */ }
  };
  const vis = () => { if (document.visibilityState === 'visible') void get(); };
  void get();
  document.addEventListener('visibilitychange', vis);
  return () => { off = true; document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => undefined); };
}

// ───── Server ─────

async function post(body: unknown): Promise<{ status: number; j: any }> {
  const t = await accessToken();
  if (!t) return { status: 401, j: {} };
  try {
    const r = await fetch('/api/khutba', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  } catch { return { status: 0, j: {} }; }
}

export type TrOut = { ok: true; lines: { text: string; terms: KTerm[] }[]; ayahs: { s: number; a: number }[]; other: boolean } | { ok: false; why: 'signin' | 'net' | 'busy' };
export async function translate(from: KFrom, to: KTo, text: string, prev: string): Promise<TrOut> {
  const { status, j } = await post({ mode: 'tr', from, to, text, prev });
  if (status === 401) return { ok: false, why: 'signin' };
  if (status === 0) return { ok: false, why: 'net' };
  if (status !== 200) return { ok: false, why: 'busy' };
  return { ok: true, lines: Array.isArray(j.lines) ? j.lines : [], ayahs: Array.isArray(j.ayahs) ? j.ayahs : [], other: Boolean(j.other) };
}

export interface Summary { points: string[]; habit: { action: string; minimum: string; after_prayer: string } | null }
export async function summarise(to: KTo, text: string): Promise<Summary | null> {
  const { status, j } = await post({ mode: 'sum', to, text });
  if (status !== 200) return null;
  return { points: Array.isArray(j.points) ? j.points : [], habit: j.habit ?? null };
}

/** How the translation went, for the test: one line in the server log, no text. */
export function rate(v: 'good' | 'ok' | 'bad', from: KFrom, to: KTo, mins: number) {
  void post({ mode: 'rate', v, from, to, mins });
}

// ───── Quran verses ─────

const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
/** Arabic without vowel marks, with one form of alif, ya and ta marbuta, for comparing words. */
export function arPlain(s: string) {
  return s.replace(ARABIC_MARKS, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Share of the verse's words (up to its first 14) that were heard: a verse is shown only if it was really recited. */
export function heardShare(verse: string, heard: string) {
  const v = arPlain(verse).split(' ').filter((w) => w.length > 1).slice(0, 14);
  if (!v.length) return 0;
  const h = new Set(arPlain(heard).split(' '));
  return v.filter((w) => h.has(w) || h.has(w.replace(/^(و|ف|ب|ل|ال)/, ''))).length / v.length;
}

export async function ayahFor(s: number, a: number, to: KTo, from: KFrom, heard: string): Promise<KAyah | null> {
  try {
    const q = await loadQuran(to);
    const su = q[s - 1];
    const v = su?.[4]?.[a - 1];
    if (!v) return null;
    // Arabic speech: check the words. Turkish or English speech: the imam's own translation, so «по смыслу».
    const sure = from === 'ar' ? heardShare(v[0], heard) >= 0.55 : false;
    if (from === 'ar' && !sure) return null;
    return { s, a, ar: v[0], tr: v[1], name: su[1], sure };
  } catch { return null; }
}
