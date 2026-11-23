// «Мой цикл»: the calendar, averages, limits by madhab, make-up fasts, the PIN lock and the file copy.
// Everything here stays on this phone, like «Дни без намаза» in sisters.ts.
import type { AppState } from './types';
import { addDays, daysBetween } from './dates';
import { inRamadan } from './rplan';
import { _t } from './i18n';
import { markFasts, sisOf, setSis, syncSw, type CycMadhab, type CycNote, type SisRange, type SisState } from './sisters';

export const CYC_TAGS: { id: string; l: () => string }[] = [
  { id: 'pain', l: () => _t("Боль") },
  { id: 'weak', l: () => _t("Слабость") },
  { id: 'mood', l: () => _t("Настроение ниже") },
  { id: 'head', l: () => _t("Голова") },
  { id: 'heavy', l: () => _t("Обильно") },
  { id: 'ok', l: () => _t("Всё хорошо") },
];

/** Limits of the days by madhab, in days. Checked against the classical manuals; the imam reviews before release. */
export interface Limits { min: number; max: number; tuhr: number; nifas: number; minNote?: string }
export const LIMITS: Record<Exclude<CycMadhab, '?'>, Limits> = {
  h: { min: 3, max: 10, tuhr: 15, nifas: 40 },
  s: { min: 1, max: 15, tuhr: 15, nifas: 60 },
  m: { min: 0, max: 15, tuhr: 15, nifas: 60 },
  b: { min: 1, max: 15, tuhr: 13, nifas: 40 },
};
export const MADHABS: { id: CycMadhab; l: () => string }[] = [
  { id: 'h', l: () => _t("Ханафи") },
  { id: 's', l: () => _t("Шафии") },
  { id: 'm', l: () => _t("Малики") },
  { id: 'b', l: () => _t("Ханбали") },
  { id: '?', l: () => _t("Не знаю") },
];
export const madhabOf = (s: AppState): CycMadhab => sisOf(s).cmz ?? (s.settings.madhab === 'hanafi' ? 'h' : 's');
export const limitsOf = (s: AppState): Limits | null => { const m = madhabOf(s); return m === '?' ? null : LIMITS[m]; };
export const madhabName = (m: CycMadhab) => MADHABS.find((x) => x.id === m)!.l();

/** Days without prayer going on longer than the madhab allows: from this day prayer is due again. */
export function overLimit(s: AppState, today: string): { n: number; max: number; nifas: boolean } | null {
  const x = sisOf(s);
  const lim = limitsOf(s);
  if (!x.cur || !lim) return null;
  const n = daysBetween(x.cur, today) + 1;
  const max = x.nifas ? lim.nifas : lim.max;
  return n > max ? { n, max, nifas: Boolean(x.nifas) } : null;
}

/** All ranges, the current one up to today included, oldest first. */
export function ranges(s: AppState, today: string): (SisRange & { now?: boolean })[] {
  const x = sisOf(s);
  const out: (SisRange & { now?: boolean })[] = [...(x.past ?? [])].reverse();
  if (x.cur) out.push({ from: x.cur, to: today >= x.cur ? today : x.cur, nifas: x.nifas, now: true });
  return out;
}

/** Average cycle (start to start) and average length of the days, from the last 6 ordinary ones. */
export function averages(s: AppState): { cycle: number | null; days: number | null; n: number } {
  const past = (sisOf(s).past ?? []).filter((r) => !r.nifas).slice(0, 6).reverse();
  const lens = past.map((r) => daysBetween(r.from, r.to) + 1).filter((n) => n > 0 && n <= 20);
  const starts = [...past.map((r) => r.from), ...(sisOf(s).cur && !sisOf(s).nifas ? [sisOf(s).cur!] : [])];
  const gaps = starts.slice(1).map((d, i) => daysBetween(starts[i], d)).filter((g) => g >= 15 && g <= 60);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((p, c) => p + c, 0) / a.length) : null);
  return { cycle: avg(gaps), days: avg(lens), n: past.length };
}

/** What a day of the calendar is. */
export type DayKind = 'now' | 'past' | 'guess' | 'rem' | '';
export function dayKind(s: AppState, d: string, today: string, guess: { day: string } | null, avgDays: number | null): DayKind {
  const x = sisOf(s);
  if (x.cur && d >= x.cur && d <= today) return 'now';
  if ((x.past ?? []).some((r) => d >= r.from && d <= r.to)) return 'past';
  if (guess && d >= guess.day && d < addDays(guess.day, Math.max(1, avgDays ?? 1))) return d > today ? 'guess' : '';
  if (guess && x.rem !== false && d === addDays(guess.day, -2) && d >= today) return 'rem';
  return '';
}

/** Add days that already passed (from the calendar): kept sorted, overlapping ones merged. */
export function addPast(s: AppState, from: string, to: string): AppState {
  const x = sisOf(s);
  let r: SisRange = { from, to };
  const keep: SisRange[] = [];
  for (const p of x.past ?? []) {
    if (p.to >= addDays(r.from, -1) && p.from <= addDays(r.to, 1)) r = { from: p.from < r.from ? p.from : r.from, to: p.to > r.to ? p.to : r.to, ...(p.nifas ? { nifas: true } : {}) };
    else keep.push(p);
  }
  const past = [...keep, r].sort((a, b) => (a.from < b.from ? 1 : -1)).slice(0, 24);
  return markFasts(setSis(s, { past }), r.from, r.to);
}

/** Remove one past range (marked by mistake). Ramadan marks stay: they are her fasting record. */
export function dropPast(s: AppState, from: string): AppState {
  return setSis(s, { past: (sisOf(s).past ?? []).filter((r) => r.from !== from) });
}

/** Start the current days on a day that already passed. */
export function startOn(s: AppState, d: string, today: string): AppState {
  if (sisOf(s).cur) return s;
  const next = setSis(s, { cur: d });
  syncSw(next);
  return markFasts(next, d, today);
}

/** End the current days on a given day (today or earlier). */
export function endOn(s: AppState, d: string): AppState {
  const x = sisOf(s);
  if (!x.cur) return s;
  const to = d >= x.cur ? d : x.cur;
  const past = [{ from: x.cur, to, ...(x.nifas ? { nifas: true } : {}) }, ...(x.past ?? [])].slice(0, 24);
  const next = markFasts(setSis(s, { cur: undefined, nifas: undefined, past }), x.cur, to);
  syncSw(next);
  return next;
}

export function setNote(s: AppState, d: string, n: CycNote): AppState {
  const notes = { ...(sisOf(s).notes ?? {}) };
  const t = n.t?.filter(Boolean) ?? [];
  const xx = (n.x ?? '').slice(0, 280);
  if (!t.length && !xx.trim()) delete notes[d];
  else notes[d] = { ...(t.length ? { t } : {}), ...(xx.trim() ? { x: xx } : {}) };
  // Only the last 400 days are kept.
  const keys = Object.keys(notes).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete notes[k];
  return setSis(s, { notes });
}

/** Ramadan days missed because of the days, and the make-up record (shared with «Пост» in Ramadan). */
export function qadaOf(s: AppState) {
  const r = s.ramadan;
  const fasts = r?.fasts ?? {};
  const period = Object.entries(fasts).filter(([, m]) => m === 'period').map(([d]) => d).sort();
  const missed = Object.values(fasts).filter((m) => m !== 'fast' && m !== 'chronic').length;
  const made = [...(r?.qada ?? [])].sort();
  return { period, missed, made, left: Math.max(0, missed - made.length) };
}
export const inRam = inRamadan;

// ───── PIN ─────
async function sha(text: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function pinHash(pin: string, salt: string) { return sha(`lm-cycle:${salt}:${pin}`); }
export async function makeLock(pin: string): Promise<{ h: string; s: string }> {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((x) => x.toString(16).padStart(2, '0')).join('');
  return { h: await pinHash(pin, salt), s: salt };
}
export async function pinOk(s: AppState, pin: string) {
  const l = sisOf(s).lock;
  return Boolean(l && (await pinHash(pin, l.s)) === l.h);
}

/** Opened in this visit: the lock asks again after a reload or 5 minutes in the background. */
let openUntil = 0;
export const isOpen = () => Date.now() < openUntil;
export const markOpen = () => { openUntil = Date.now() + 5 * 60 * 1000; };
export const closeNow = () => { openUntil = 0; };

// Face ID / fingerprint: a passkey on this phone, used only as «it is her». Nothing goes to a server.
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export async function bioAvailable() {
  try { return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())); } catch { return false; }
}
export async function bioAdd(): Promise<string | null> {
  try {
    const c = (await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Living Muslim' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'cycle', displayName: _t("Мой цикл") },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    } })) as PublicKeyCredential | null;
    return c ? b64(c.rawId) : null;
  } catch { return null; }
}
export async function bioCheck(id: string): Promise<boolean> {
  try {
    const c = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id) }],
      userVerification: 'required', timeout: 60000,
    } });
    return Boolean(c);
  } catch { return false; }
}

// ───── File copy and wipe ─────
const FILE_KEYS: (keyof SisState)[] = ['cur', 'nifas', 'past', 'notes', 'cmz', 'qd', 'guess', 'rem', 'modest'];
export function cycleFile(s: AppState) {
  const x = sisOf(s);
  const data: Partial<SisState> = {};
  for (const k of FILE_KEYS) if (x[k] !== undefined) (data as Record<string, unknown>)[k] = x[k];
  return JSON.stringify({ app: 'living-muslim', kind: 'cycle', v: 1, at: new Date().toISOString(), data }, null, 1);
}
export function readCycleFile(s: AppState, text: string): AppState | null {
  try {
    const j = JSON.parse(text);
    if (j?.kind !== 'cycle' || typeof j.data !== 'object') return null;
    const d = j.data as Partial<SisState>;
    const ok = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    let next = s;
    for (const r of Array.isArray(d.past) ? d.past : []) if (ok(r?.from) && ok(r?.to) && r.from <= r.to) next = addPast(next, r.from, r.to);
    const notes = { ...(sisOf(next).notes ?? {}) };
    for (const [k, v] of Object.entries(d.notes ?? {})) if (ok(k) && v && typeof v === 'object') notes[k] = { t: Array.isArray(v.t) ? v.t.filter((t) => typeof t === 'string').slice(0, 8) : undefined, x: typeof v.x === 'string' ? v.x.slice(0, 280) : undefined };
    const p: Partial<SisState> = { notes };
    if (!sisOf(next).cur && ok(d.cur)) { p.cur = d.cur; if (d.nifas) p.nifas = true; }
    if (d.cmz && ['h', 's', 'm', 'b', '?'].includes(d.cmz)) p.cmz = d.cmz;
    if (Array.isArray(d.qd)) p.qd = d.qd.filter((n) => Number.isInteger(n) && n >= 0 && n < 7);
    if (typeof d.guess === 'boolean') p.guess = d.guess;
    next = setSis(next, p);
    syncSw(next);
    return next;
  } catch { return null; }
}
/** «Удалить все данные цикла»: days, notes, dhikr ticks and the lock. Ramadan fast marks stay (her fasting record). */
export function wipeCycle(s: AppState): AppState {
  const next = setSis(s, { cur: undefined, nifas: undefined, past: [], notes: {}, zk: {}, lock: null, rem: undefined, qd: undefined, guess: undefined });
  syncSw(next);
  return next;
}
