// Anonymous section counter for the owner's analytics («Для владельца» → «Разделы»).
// Counts only which section was opened and a few main actions inside it, per random device id (lm.vid, the same one
// the visit counter uses). Never content: no names, texts, notes, goals, amounts. «Мой цикл» is never counted.
// One row per device + section + action + day on the server; repeat actions only add to its counter.
import { useEffect } from 'react';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const QK = 'lm.use.q';
const ONCE = 'lm.use.once';
const OK = /^[a-z0-9_:-]{1,48}$/;
const OK_ACT = /^[A-Za-z0-9_:.-]{1,60}$/; // course ids from YouTube keep their case
/** Sections that are never counted, whatever calls them. */
const NEVER = new Set(['cycle', 'period']);

type Q = Record<string, number>; // "day|sec|act" → n

const utcDay = () => new Date().toISOString().slice(0, 10);

function ls(): Storage | null { try { return window.localStorage; } catch { return null; } }

export function deviceId(): string {
  const s = ls();
  let v = s?.getItem('lm.vid') ?? '';
  if (!/^[a-z0-9]{8,40}$/.test(v)) {
    v = (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 24);
    try { s?.setItem('lm.vid', v); } catch { /* private mode */ }
  }
  return v;
}

function readQ(): Q { try { return JSON.parse(ls()?.getItem(QK) || '{}') as Q; } catch { return {}; } }
function writeQ(q: Q) { try { ls()?.setItem(QK, JSON.stringify(q)); } catch { /* full */ } }

let timer: ReturnType<typeof setTimeout> | undefined;
let last = '';

/** Count one action in a section (act 'open' when the section is opened). */
export function track(sec: string, act = 'open', n = 1) {
  if (NEVER.has(sec) || !OK.test(sec) || !OK_ACT.test(act) || !(n > 0)) return;
  const q = readQ();
  const k = `${utcDay()}|${sec}|${act}`;
  q[k] = Math.min(100000, (q[k] ?? 0) + Math.round(n));
  writeQ(q);
  if (!timer) timer = setTimeout(flush, 5000);
}

/** A section was opened. Also notes where the person came from (the section opened before it). */
export function openSec(sec: string) {
  if (NEVER.has(sec)) return;
  track(sec, 'open');
  if (last && last !== sec) track(sec, `via:${last}`.slice(0, 48));
  last = sec;
}

/** Count an action only once ever on this device (a course started, a book finished). */
export function trackOnce(sec: string, act: string) {
  const s = ls();
  let seen: string[] = [];
  try { seen = JSON.parse(s?.getItem(ONCE) || '[]') as string[]; } catch { /* */ }
  const k = `${sec}|${act}`;
  if (seen.includes(k)) return;
  seen.push(k);
  try { s?.setItem(ONCE, JSON.stringify(seen.slice(-800))); } catch { /* */ }
  track(sec, act);
}

/** Open a section when this screen appears. */
export function useSec(sec: string | undefined | false) {
  useEffect(() => { if (sec) openSec(sec); }, [sec]);
}

interface Batch { id: string; items: { d: string; s: string; a: string; n: number }[] }
const FK = 'lm.use.f';
let sending = false;

/** Sends the batch in flight (or makes one from the queue). A batch keeps its id until the server answers, so a batch
 * cut off by leaving the page is sent again on the next visit and the server counts it only once. */
export async function flush() {
  timer = undefined;
  if (sending) return;
  const st = ls();
  let b: Batch | null = null;
  try { b = JSON.parse(st?.getItem(FK) || 'null') as Batch | null; } catch { b = null; }
  if (!b) {
    const q = readQ();
    const keys = Object.keys(q).slice(0, 60);
    if (!keys.length) return;
    const from = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    b = { id: Math.random().toString(36).slice(2, 12) + Date.now().toString(36), items: keys.map((k) => { const [d, s1, a] = k.split('|'); return { d, s: s1, a, n: q[k] }; }).filter((x) => x.d >= from) };
    const rest: Q = { ...q };
    keys.forEach((k) => delete rest[k]);
    try { st?.setItem(FK, JSON.stringify(b)); } catch { return; }
    writeQ(rest);
  }
  sending = true;
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/lm_use`, { method: 'POST', keepalive: true, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_vid: deviceId(), p_items: b.items, p_bid: b.id }) });
    if (r.status >= 500) throw new Error(String(r.status));
    try { st?.removeItem(FK); } catch { /* */ }
  } catch {
    sending = false;
    if (!timer) timer = setTimeout(flush, 60000);
    return;
  }
  sending = false;
  if (Object.keys(readQ()).length && !timer) timer = setTimeout(flush, 2000);
}

if (typeof document !== 'undefined') {
  // keepalive lets the last batch finish when the page is hidden or left.
  const now = () => { if (timer) clearTimeout(timer); void flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') now(); });
  window.addEventListener('pagehide', now);
  // A batch left from the last visit, or counts not sent yet.
  try { if (ls()?.getItem(FK) || ls()?.getItem(QK)) timer = setTimeout(flush, 3000); } catch { /* */ }
}
