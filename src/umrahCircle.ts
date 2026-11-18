import { useEffect, useRef, useState } from 'react';
import { _t } from './i18n';

export interface UTask { id: string; text: string; who?: string }
/** A date option the group votes for: departure and return days (YYYY-MM-DD). */
export interface UDate { id: string; from: string; to: string; note?: string }
/** A room booked or planned: city, price per night for the whole room, beds, who sleeps there. */
export interface URoom { id: string; city: 'mecca' | 'medina'; name: string; night: number; beds: number; walk?: number; people: string[] }
export interface UTrip {
  title: string; month: string; city: string; amir?: string; tasks: UTask[]; created: string;
  // Planning (the trip page). All optional so older trips keep working.
  dates?: UDate[];
  chosen?: string; // id of the chosen date option
  nights?: { mecca: number; medina: number };
  rooms?: URoom[];
  other?: number; // per person: visa, train, transfers, SIM
  agency?: number; // package price per person someone was offered, for the comparison
  cur?: string;
  plan?: string; // day by day, free text
}
export type UStatus = 'go' | 'maybe' | 'no';
/** Money one person paid for the whole group (split equally among those going). */
export interface UPaid { id: string; what: string; amt: number }
export interface URsvp {
  s: UStatus; ready: number; done: string[];
  votes?: string[]; // date option ids I can do
  from?: string; // my departure city
  ticket?: number; // my return ticket price
  bought?: boolean;
  docs?: string[]; // my documents checklist (ids)
  paid?: UPaid[];
  settled?: Record<string, number>; // money I already returned, by person
  made?: string[]; // dua requests I made in Makkah: `${from}:${host}:${i}`
  roll?: { id: string; at: number }; // a roll call I started («Все на месте?»)
  here?: string; // my answer to the latest roll call: its id, or `${id}!` if I need help
  hotel?: boolean; // I have my hotel booking in my documents
}

/** A savings box for someone's umrah that several people fill (a mother, a father). */
export interface UShared { id: string; for: string; goal: number; cur: string; by?: string }
/** My doc in umrahFund: boxes I started, and what I put into anyone's box (key `${owner}:${id}`). */
export interface UFundDoc { own?: UShared[]; gave?: Record<string, { d: string; amt: number }[]> }
/** Where I am right now, shared with my trip group while I am there. */
export interface ULoc { host: string; lat: number; lng: number; acc?: number; t: number }

export interface UmrahApi {
  ready: boolean;
  me: string | null;
  trips: Record<string, UTrip>; // by host id
  rsvp: Record<string, Record<string, URsvp>>; // user -> host -> rsvp
  duas: Record<string, Record<string, string[]>>; // user -> host -> requests
  names: Record<string, string>;
  funds: Record<string, UFundDoc>; // by user
  locs: Record<string, ULoc>; // by user
  error: string;
  saveFund: (doc: UFundDoc) => Promise<void>;
  saveLoc: (l: ULoc | null) => Promise<void>;
  saveTrip: (t: UTrip) => Promise<void>;
  deleteTrip: () => Promise<void>;
  respond: (host: string, p: Partial<URsvp>) => Promise<void>;
  setDuas: (host: string, list: string[]) => Promise<void>;
}

async function cap(name: string): Promise<any> {
  try { return window.claude ? await window.claude.use(name) : null; } catch { return null; }
}

export function useUmrahCircle(): UmrahApi {
  const db = useRef<any>(null);
  const user = useRef<any>(null);
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [trips, setTrips] = useState<UmrahApi['trips']>({});
  const [rsvp, setRsvp] = useState<UmrahApi['rsvp']>({});
  const [duas, setDuasState] = useState<UmrahApi['duas']>({});
  const [funds, setFunds] = useState<UmrahApi['funds']>({});
  const [locs, setLocs] = useState<UmrahApi['locs']>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const writing = useRef<Promise<void>>(Promise.resolve());
  const serial = (fn: () => Promise<void>) => { writing.current = writing.current.then(fn, fn); return writing.current; };

  useEffect(() => {
    let alive = true;
    const unsubs: (() => void)[] = [];
    (async () => {
      const [d, u] = await Promise.all([cap('db'), cap('user')]);
      if (!alive || !d || !u) return;
      const id = await u.id();
      if (!id || !alive) return;
      db.current = d; user.current = u; setMe(id); setReady(true);
      const sub = (col: string, set: (m: any) => void) => unsubs.push(d.collection(col).onSnapshot(
        (snap: any) => { const m: any = {}; snap.docs.forEach((x: any) => { if (x.exists) m[x.id] = x.data() ?? {}; }); set(m); },
        () => setError(_t("Совместная умра сейчас недоступна.")),
      ));
      sub('umrahTrip', setTrips);
      sub('umrahRsvp', setRsvp);
      sub('umrahDua', setDuasState);
      sub('umrahFund', setFunds);
      sub('umrahLoc', setLocs);
    })();
    return () => { alive = false; unsubs.forEach((f) => f()); };
  }, []);

  const ids = [...new Set([...Object.keys(trips), ...Object.keys(rsvp), ...Object.keys(duas), ...Object.keys(funds), ...Object.keys(locs), ...Object.values(trips).flatMap((t) => [t.amir ?? '', ...(t.tasks ?? []).map((x) => x.who ?? '')])])].filter(Boolean).sort();
  const idsKey = ids.join(',');
  useEffect(() => {
    if (!user.current || !ids.length) return;
    let alive = true;
    user.current.profiles(ids).then((ps: any) => {
      if (!alive) return;
      const out: Record<string, string> = {};
      for (const id of ids) out[id] = ps?.[id]?.name || '';
      setNames(out);
    });
    return () => { alive = false; };
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: any) => setError(e?.code === 'invalid_argument' || e?.code === 'permission_denied' ? _t("Нет права писать. Попроси владельца дать доступ «Участник».") : _t("Не удалось сохранить, попробуй ещё раз."));

  return {
    ready, me, trips, rsvp, duas, names, error, funds, locs,
    saveFund: (d) => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`umrahFund/${me}`).set(JSON.parse(JSON.stringify(d))); setError(''); } catch (e) { fail(e); } }),
    saveLoc: (l) => serial(async () => {
      if (!db.current || !me) return;
      try { if (l) await db.current.doc(`umrahLoc/${me}`).set(l); else await db.current.doc(`umrahLoc/${me}`).delete(); } catch { /* quiet: location is best effort */ }
    }),
    saveTrip: (t) => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`umrahTrip/${me}`).set(JSON.parse(JSON.stringify(t))); setError(''); } catch (e) { fail(e); } }),
    deleteTrip: () => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`umrahTrip/${me}`).delete(); } catch (e) { fail(e); } }),
    respond: (host, p) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(rsvp[me] ?? {}) };
      const cur: URsvp = mine[host] ?? { s: 'maybe', ready: 0, done: [] };
      mine[host] = { ...cur, ...p };
      try { await db.current.doc(`umrahRsvp/${me}`).set(mine); } catch (e) { fail(e); }
    }),
    setDuas: (host, list) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(duas[me] ?? {}) };
      if (list.length) mine[host] = list; else delete mine[host];
      try { await db.current.doc(`umrahDua/${me}`).set(mine); } catch (e) { fail(e); }
    }),
  };
}

export const UMRAH_RULES = ['umrahTrip', 'umrahRsvp', 'umrahDua', 'umrahFund', 'umrahLoc'].flatMap((c) => [
  { path: c, read: 'view', write: 'owner' },
  { path: `${c}/{self}`, read: 'view', write: 'interact' },
]);
