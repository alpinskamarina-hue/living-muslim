// «Место» in circle chats: send one point, or share it live for 15 min / 1 hour / «до встречи».
// One point is an ordinary chat message (ref.t = 'loc'). Live sharing keeps only the latest point on the server
// (supabase/location.sql) and updates it every ~20 s while the app is open; nothing is kept after the time is up.
// Maps are OpenStreetMap tiles (free), routes open in Google or Apple Maps.
import { useCallback, useEffect, useState } from 'react';
import { isCloud, meRpc, serverHas } from './cloud';
import { findMosques, sortNear, mosqueName, savePos } from './mosques';
import { LANG } from './i18n';

export interface LivePt { uid: string; lat: number; lng: number; until: string; upd: string }
export interface LocData { on: boolean; live: LivePt[] }
export interface Pt { lat: number; lng: number }

let readyP: Promise<boolean> | null = null;
export function locReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.loc') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_loc_get', { p_uid: null, p_token: null, p_code: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.loc', '1'); } catch { /* */ }
    return ok;
  });
  return readyP;
}
export function useLocReady() {
  const [ok, setOk] = useState(false);
  useEffect(() => { locReady().then(setOk); }, []);
  return ok;
}

/** Who shares their place in this circle; polled every 15 s while `poll` and the page is visible. */
export function useLoc(code: string | undefined, ready: boolean, poll: boolean) {
  const [data, setData] = useState<LocData | null>(null);
  const load = useCallback(async () => {
    if (!code) return;
    const r = await meRpc<LocData | null>('lm_loc_get', { p_code: code }).catch(() => null);
    if (r) setData({ on: r.on !== false, live: Array.isArray(r.live) ? r.live : [] });
  }, [code]);
  useEffect(() => { setData(null); if (ready && code) load(); }, [code, ready, load]);
  useEffect(() => {
    if (!ready || !code || !poll) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => clearInterval(t);
  }, [code, ready, poll, load]);
  // my own sharing changed (started / stopped / a new point sent)
  useEffect(() => { const f = () => load(); window.addEventListener('lm-live', f); return () => window.removeEventListener('lm-live', f); }, [load]);
  const setOn = async (on: boolean) => {
    const ok = await meRpc<boolean>('lm_loc_setting', { p_code: code, p_on: on }).catch(() => false);
    if (ok) { setData((d) => ({ on, live: on ? d?.live ?? [] : [] })); await load(); }
    return ok;
  };
  return { data, reload: load, setOn };
}

// ───── where am I ─────
/** A fresh, precise point (asks for permission the first time). Rounded to ~10 m. */
export function here(): Promise<Pt | { err: 'denied' | 'none' }> {
  if (!navigator.geolocation) return Promise.resolve({ err: 'none' });
  return new Promise((res) => {
    navigator.geolocation.getCurrentPosition(
      (p) => { const pt = { lat: r4(p.coords.latitude), lng: r4(p.coords.longitude) }; savePos(pt); res(pt); },
      (e) => res({ err: e.code === 1 ? 'denied' : 'none' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function km(a: Pt, b: Pt) {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * d) / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(((b.lng - a.lng) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** A short address («ул. Ибрагим аль-Халиль 12») from OpenStreetMap; '' when not found. */
export async function addressOf(p: Pt): Promise<string> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${p.lat}&lon=${p.lng}&accept-language=${LANG === 'en' ? 'en' : 'ru,en'}`, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    const j = await r.json();
    const a = j.address ?? {};
    const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(' ');
    const name = j.name && j.name !== a.road ? j.name : '';
    return (name || street || a.neighbourhood || a.suburb || a.city || '').slice(0, 60);
  } catch { return ''; }
}

/** The nearest mosque within 1 km, if any. */
export async function mosqueNear(p: Pt): Promise<{ name: string; km: number; lat: number; lng: number } | null> {
  try {
    const n = sortNear(await findMosques(p), p, 1)[0];
    return n ? { name: mosqueName(n).slice(0, 40), km: n.km, lat: n.lat, lng: n.lng } : null;
  } catch { return null; }
}

const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const routeTo = (p: Pt) => ios()
  ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=w`
  : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
export const openAt = (p: Pt) => ios()
  ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${p.lat},${p.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// ───── live sharing on this phone ─────
const KEY = 'lm.live';
type Mine = Record<string, number>; // circle code → until (ms)
const readMine = (): Mine => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Mine; } catch { return {}; } };
const writeMine = (m: Mine) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* */ } };
/** The latest point the live watcher has (no new prompt, no wait). */
export const livePt = (): Pt | null => lastPt;
export const myLive = (code?: string) => { const u = code ? readMine()[code] : 0; return u && u > Date.now() ? u : 0; };

let watch: number | null = null;
let lastSent = 0;
let lastPt: Pt | null = null;
let timer: number | undefined;

async function push(force = false) {
  const m = readMine(), now = Date.now();
  const codes = Object.keys(m).filter((c) => m[c] > now);
  if (!lastPt || (!force && now - lastSent < 20000)) return;
  lastSent = now;
  await Promise.all(codes.map((c) => meRpc('lm_loc_set', { p_code: c, p_lat: lastPt!.lat, p_lng: lastPt!.lng, p_until: new Date(m[c]).toISOString() }).catch(() => null)));
  window.dispatchEvent(new Event('lm-live'));
}

/** Keeps sending my point while any sharing is active and the app is open; stops itself when the time is up. */
export function ensureLive() {
  const m = readMine(), now = Date.now();
  let changed = false;
  for (const c of Object.keys(m)) if (m[c] <= now) { delete m[c]; changed = true; }
  if (changed) writeMine(m);
  const any = Object.keys(m).length > 0;
  if (!any || !navigator.geolocation) {
    if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
    clearInterval(timer); timer = undefined;
    return;
  }
  if (watch == null) {
    watch = navigator.geolocation.watchPosition(
      (p) => { lastPt = { lat: r4(p.coords.latitude), lng: r4(p.coords.longitude) }; push(); },
      () => { /* no permission or no signal: the card shows «обновлено N мин назад» */ },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );
  }
  // the phone may not report a move while standing still: send the same point now and then, and end on time
  timer ??= window.setInterval(() => { ensureLive(); push(true); }, 25000);
}

/** Start sharing in a circle for `mins` minutes from point `p`. */
export async function startLive(code: string, mins: number, p: Pt) {
  const until = Date.now() + mins * 60000;
  writeMine({ ...readMine(), [code]: until });
  lastPt = p; lastSent = 0;
  await meRpc('lm_loc_set', { p_code: code, p_lat: p.lat, p_lng: p.lng, p_until: new Date(until).toISOString() }).catch(() => null);
  lastSent = Date.now();
  ensureLive();
  window.dispatchEvent(new Event('lm-live'));
  return until;
}
export async function stopLive(code: string) {
  const m = readMine(); delete m[code]; writeMine(m);
  await meRpc('lm_loc_set', { p_code: code, p_lat: null, p_lng: null, p_until: null }).catch(() => null);
  ensureLive();
  window.dispatchEvent(new Event('lm-live'));
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ensureLive(); push(true); } });

// ───── map tiles ─────
export const TILE = 256;
export function worldPx(p: Pt, z: number) {
  const n = TILE * 2 ** z;
  const s = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
/** The zoom that fits all points into w×h pixels (at most 17). */
export function fitZoom(pts: Pt[], w: number, h: number) {
  for (let z = 17; z > 3; z--) {
    const xs = pts.map((p) => worldPx(p, z));
    const dx = Math.max(...xs.map((q) => q.x)) - Math.min(...xs.map((q) => q.x));
    const dy = Math.max(...xs.map((q) => q.y)) - Math.min(...xs.map((q) => q.y));
    if (dx <= w && dy <= h) return z;
  }
  return 4;
}
