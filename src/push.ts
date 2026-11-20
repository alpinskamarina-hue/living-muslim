// Install as an app (PWA) and prayer reminders by Web Push. Only on the standalone site.
import { isCloud } from './cloud';
import type { Anchor, AppState, Ping, RamadanPush, ReminderPrefs, Settings } from './types';
import { adhanServer } from './adhan';
import type { PlanRing } from './plans';
export type { ReminderPrefs, RamadanPush };

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
export const VAPID_PUBLIC = 'BInevmSIw4VHEgjfRCrc-xKV6X0nKv07nM_TOuX9VwJcatbnTqQ73he5q6gRerEzwXnMQuYKFEbDetXklS74W7I';

export const DEFAULT_PREFS: ReminderPrefs = { on: false, prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], before: 0, muhasaba: '' };
/** Ramadan reminders are on by default for anyone with reminders on; the server uses the same defaults. */
export const RPUSH_DEFAULT: RamadanPush = { suhoor: 45, iftar: 15, tarawih: false, nights: true, fitr: true };
export const rpushOf = (p?: ReminderPrefs): RamadanPush => ({ ...RPUSH_DEFAULT, ...(p?.ramadan ?? {}) });

// ---- install ----
// main.tsx keeps an install prompt that fired before this module loaded.
let deferred: any = typeof window !== 'undefined' ? (window as any).__lmInstall ?? null : null;
const listeners = new Set<() => void>();
if (isCloud && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
  // The app code loads after the page, so the load event may already be over.
  const reg = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
  if ('serviceWorker' in navigator) { if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg); }
}
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const isStandalone = () => typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
export const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
export const canPrompt = () => !!deferred;
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null; listeners.forEach((f) => f());
  return r?.outcome === 'accepted';
}

// ---- push ----
export const pushSupported = () => isCloud && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function b64ToBytes(s: string) {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Open habits per prayer: counts only (n) and whether one is Quran (q). Never names. */
export type NudgeCounts = Partial<Record<Anchor, { n: number; q?: 1 }>>;
export interface Nudge { d: string; b: NudgeCounts; p: NudgeCounts }
const QURAN_RE = /коран|quran|qur'an|сур[аыу]|аят|джуз|juz|хифз|hifz|тафсир|tafsir|мусхаф/i;

/** What the server needs for habit nudges: for each prayer, how many active habits sit after it (b) and how many are still open today (p). */
export function nudgeOf(st: AppState, today: string): Nudge {
  const b: NudgeCounts = {}, p: NudgeCounts = {};
  const marks = st.log[today] ?? {};
  for (const h of st.habits) {
    if (h.status !== 'active' || h.ramadan) continue;
    const q = QURAN_RE.test(h.action);
    const add = (o: NudgeCounts) => { const v = (o[h.anchor] ??= { n: 0 }); v.n++; if (q) v.q = 1; };
    add(b);
    const m = marks[h.id];
    if (m !== 'done' && m !== 'min') add(p);
  }
  return { d: today, b, p };
}
let nudge: Nudge | null = null;
/** The app keeps this current; it goes to the server with the next save. */
export const setNudge = (n: Nudge) => { nudge = n; };

/** Server copy of what it needs to compute prayer times: place, method, offsets, time zone, and counts for habit nudges. No habit names or notes. */
let pings: { k: string; at: number; t: string; pl?: string; d?: string; a?: string; w?: 1 }[] = [];
/** Upcoming reminders the server should send (next 14 days, at most 30): the person's own and those of plans (⏰). */
export function setPings(list: Ping[] | undefined, plans: PlanRing[] = [], workouts: { k: string; at: number; t: string; w: 1 }[] = []) {
  const now = Date.now();
  const own = (list ?? []).filter((x) => x.at > now - 15 * 60000 && x.at < now + 14 * 864e5).map((x) => ({ k: x.id, at: x.at, t: x.text.slice(0, 160) }));
  const pl = plans.map((x) => ({ k: x.id, at: x.at, t: x.text.slice(0, 160), pl: x.plan, d: x.day, ...(x.prayer ? { a: x.prayer } : {}) }));
  pings = [...own, ...pl, ...workouts.slice(0, 7)].sort((a, b) => a.at - b.at).slice(0, 30);
  return pings;
}
function serverPrefs(s: Settings, p: ReminderPrefs) {
  return {
    lat: s.lat, lng: s.lng, method: s.method, madhab: s.madhab, offsets: s.offsets ?? {},
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, prayers: p.prayers, before: p.before, muhasaba: p.muhasaba,
    ramadan: rpushOf(p), chat: p.chat !== false, quiet: Boolean(s.quiet), lang: s.lang ?? (/^en\b/i.test(navigator.language) ? 'en' : 'ru'),
    adhan: adhanServer(s),
    habits: p.habits !== false, courses: p.courses !== false, nudge: p.habits !== false ? nudge : null, pings,
  };
}

/** Asks permission if needed, subscribes and saves preferences on the server. Returns '' or an error message. */
export async function enablePush(s: Settings, p: ReminderPrefs): Promise<string> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  const j = sub.toJSON();
  await rpc('lm_push_save', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_prefs: serverPrefs(s, p) });
  return '';
}

/** Re-sends preferences after a settings change (city, offsets, toggles). */
export async function syncPush(s: Settings, p: ReminderPrefs) {
  const sub = await currentSubscription();
  if (!sub) return;
  const j = sub.toJSON();
  await rpc('lm_push_save', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_prefs: serverPrefs(s, p) }).catch(() => {});
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await rpc('lm_push_delete', { p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
