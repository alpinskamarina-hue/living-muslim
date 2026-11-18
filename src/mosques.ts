import type { Anchor, AppState } from './types';
import { distanceKm } from './safar';
import { _t, LOC } from './i18n';

/** A mosque or prayer room found in OpenStreetMap. */
export interface Mosque { id: string; name: string; lat: number; lng: number; kind: 'mosque' | 'musalla'; addr?: string }

/** The person's own mosque, kept in the app state: jamaat times are typed in by hand. */
export interface MyMosque extends Mosque {
  /** Khutbah time on Friday, "HH:MM". */
  jumuah?: string;
  /** Congregation time per prayer, "HH:MM". */
  jamaat?: Partial<Record<Anchor, string>>;
}

export interface MosqueSettings {
  mine?: MyMosque | null;
  /** The card «мечеть перед намазом» on Today. On by default. */
  card?: boolean;
  /** Friday sunnah ticks: day → ['ghusl', 'kahf', 'salawat']. Only the last few Fridays are kept. */
  friday?: Record<string, string[]>;
}

export interface Pos { lat: number; lng: number; at: number }

// Position and search results stay on this phone (localStorage), never in the synced state.
const POS_KEY = 'lm_pos';
const CACHE_KEY = 'lm_mosques';
const HIDE_KEY = 'lm_mcard_hide';

const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export const lastPos = (): Pos | null => read<Pos>(POS_KEY);
export const savePos = (p: { lat: number; lng: number }) => write(POS_KEY, { lat: p.lat, lng: p.lng, at: Date.now() });

/** Ask the phone where it is. `quiet`: only if the person already allowed it, never a prompt. */
export async function locate(quiet = false): Promise<Pos | null> {
  if (!navigator.geolocation) return null;
  if (quiet) {
    try {
      const st = await (navigator as any).permissions?.query({ name: 'geolocation' });
      if (st?.state !== 'granted') return null;
    } catch { return null; }
  }
  return new Promise((res) => {
    navigator.geolocation.getCurrentPosition(
      (p) => { const pos = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }; savePos(pos); res(pos); },
      () => res(null),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** ~1 km grid: the search service never sees the exact spot. */
const grid = (x: number) => Math.round(x * 100) / 100;
const RADIUS_M = 3000;
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

interface Cache { lat: number; lng: number; at: number; list: Mosque[] }

function parse(els: any[]): Mosque[] {
  const out: Mosque[] = [];
  for (const e of els ?? []) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const t = e.tags ?? {};
    const small = /prayer|musalla|musholla|mushola|surau/i.test(`${t.building ?? ''} ${t['place_of_worship'] ?? ''} ${t.name ?? ''}`) || t.building === 'room';
    const name = (t['name:ru'] && LOC === 'ru-RU' ? t['name:ru'] : null) ?? t.name ?? t['name:en'] ?? '';
    const addr = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
    out.push({ id: `${e.type}/${e.id}`, name, lat, lng, kind: small ? 'musalla' : 'mosque', addr: addr || undefined });
  }
  return out;
}

/** Mosques around a point, from OpenStreetMap. Cached on the phone for a week per ~1 km square. */
export async function findMosques(at: { lat: number; lng: number }, fresh = false): Promise<Mosque[]> {
  const gl = grid(at.lat), gg = grid(at.lng);
  const c = read<Cache>(CACHE_KEY);
  if (!fresh && c && c.lat === gl && c.lng === gg && Date.now() - c.at < 7 * 864e5) return c.list;
  // A little wider than the radius, so rounding the point never hides a mosque that is really within 3 km.
  const q = `[out:json][timeout:20];nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${RADIUS_M + 800},${gl},${gg});out center tags 80;`;
  let err: unknown = null;
  for (const s of SERVERS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(`${s}?data=${encodeURIComponent(q)}`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const list = parse(j.elements);
      write(CACHE_KEY, { lat: gl, lng: gg, at: Date.now(), list } satisfies Cache);
      return list;
    } catch (e) { err = e; }
  }
  throw err ?? new Error('overpass');
}

/** The last search, if it was made around this point (within ~1.5 km). */
export function cachedNear(at: { lat: number; lng: number }): Mosque[] | null {
  const c = read<Cache>(CACHE_KEY);
  if (!c || Date.now() - c.at > 7 * 864e5) return null;
  return distanceKm(c, at) < 1.5 ? c.list : null;
}

export interface Near extends Mosque { km: number }
export function sortNear(list: Mosque[], at: { lat: number; lng: number }, maxKm = RADIUS_M / 1000): Near[] {
  return list.map((m) => ({ ...m, km: distanceKm(at, m) })).filter((m) => m.km <= maxKm).sort((a, b) => a.km - b.km);
}

/** Streets are not straight: about 1.25 × the straight line, at 5 km/h. */
export const walkMin = (km: number) => Math.max(1, Math.round((km * 1.25 / 5) * 60));
export const driveMin = (km: number) => Math.max(2, Math.round((km * 1.4 / 30) * 60) + 2);

export function distLabel(km: number) {
  return km < 1 ? _t("{0} м", Math.round(km * 1000 / 10) * 10) : _t("{0} км", km.toFixed(1).replace('.', _t(",")));
}
export function wayLabel(km: number) {
  return km <= 2 ? _t("{0} мин пешком", walkMin(km)) : _t("{0} мин на машине", driveMin(km));
}

export function mosqueName(m: Mosque) {
  return m.name || (m.kind === 'musalla' ? _t("Молельная комната") : _t("Мечеть без названия"));
}

/** Route in the phone's maps (Google Maps opens the app when it is installed). */
export function routeUrl(m: { lat: number; lng: number }, km?: number) {
  const mode = km !== undefined && km > 2 ? 'driving' : 'walking';
  return `https://www.google.com/maps/dir/?api=1&destination=${m.lat.toFixed(6)},${m.lng.toFixed(6)}&travelmode=${mode}`;
}
/** Search without sending our position: the maps app uses its own. */
export const mapsSearchUrl = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(_t("мечеть"))}`;

export const mosq = (s: AppState): MosqueSettings => s.mosque ?? {};

export function setMine(s: AppState, m: MyMosque | null): AppState {
  return { ...s, mosque: { ...mosq(s), mine: m } };
}

export const FRIDAY_SUNNAH = ['ghusl', 'kahf', 'salawat'] as const;
export function toggleFriday(s: AppState, day: string, k: string): AppState {
  const f = { ...(mosq(s).friday ?? {}) };
  const cur = f[day] ?? [];
  f[day] = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
  // Keep only the last 8 Fridays.
  const keep = Object.keys(f).sort().slice(-8);
  return { ...s, mosque: { ...mosq(s), friday: Object.fromEntries(keep.map((d) => [d, f[d]])) } };
}

const hm = (d: Date, t: string) => { const [h, m] = t.split(':').map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

export interface CardInfo {
  kind: 'prayer' | 'jumuah';
  anchor: Anchor;
  at: Date;
  /** The mosque and how far, when known. */
  mosque: Mosque | null;
  km: number | null;
  mine: boolean;
  /** For Jumu'ah: whether `at` is the khutbah the person typed in. */
  typed: boolean;
  /** When to leave home. */
  leave: Date | null;
  key: string;
}

/**
 * The card on Today: 40 minutes before a prayer when a mosque is within 2 km, and on Friday from Fajr
 * until Jumu'ah. Uses «моя мечеть» first, else the nearest one from the last search.
 */
export function mosqueCard(s: AppState, today: string, now: Date, times: Record<Anchor | 'sunrise', Date>, next: Anchor | null, pos: Pos | null): CardInfo | null {
  const ms = mosq(s);
  if (ms.card === false) return null;
  const friday = now.getDay() === 5;
  const mine = ms.mine ?? null;
  const near = pos ? sortNear(cachedNear(pos) ?? [], pos, 2) : [];

  let kind: CardInfo['kind'] | null = null;
  let anchor: Anchor | null = null;
  let at: Date | null = null;
  let typed = false;
  if (friday && now >= times.fajr) {
    const k = mine?.jumuah ? hm(now, mine.jumuah) : times.dhuhr;
    // Until the khutbah has started (or the end of Dhuhr's first half hour when no time was typed).
    if (now.getTime() < k.getTime() + (mine?.jumuah ? 0 : 30 * 60000)) { kind = 'jumuah'; anchor = 'dhuhr'; at = k; typed = Boolean(mine?.jumuah); }
  }
  if (!kind && next) {
    const t = mine?.jamaat?.[next] ? hm(now, mine.jamaat[next]!) : times[next];
    const left = t.getTime() - now.getTime();
    if (left > 0 && left <= 40 * 60000) { kind = 'prayer'; anchor = next; at = t; }
  }
  if (!kind || !anchor || !at) return null;

  let mosque: Mosque | null = null;
  let km: number | null = null;
  if (mine) {
    mosque = mine;
    km = pos ? distanceKm(pos, mine) : null;
    // Away from home (a trip, work across town): the own mosque is no help, fall back to a near one.
    if (km !== null && km > 2 && kind === 'prayer') { mosque = null; km = null; }
  }
  if (!mosque && near.length) { mosque = near[0]; km = near[0].km; }
  // Before an ordinary prayer the card only helps when there is somewhere close to go.
  if (kind === 'prayer' && !mosque) return null;

  const key = `${today}:${kind}:${anchor}`;
  if (read<string>(HIDE_KEY) === key) return null;
  const leave = km !== null && km <= 2 ? new Date(at.getTime() - (walkMin(km) + 5) * 60000) : null;
  return { kind, anchor, at, mosque, km, mine: Boolean(mine && mosque && mosque.id === mine.id), typed, leave, key };
}

export const hideCard = (key: string) => write(HIDE_KEY, key);
