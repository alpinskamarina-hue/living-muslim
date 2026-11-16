import { useEffect, useRef, useState } from 'react';

export interface UTask { id: string; text: string; who?: string }
export interface UTrip { title: string; month: string; city: string; amir?: string; tasks: UTask[]; created: string }
export type UStatus = 'go' | 'maybe' | 'no';
export interface URsvp { s: UStatus; ready: number; done: string[] }

export interface UmrahApi {
  ready: boolean;
  me: string | null;
  trips: Record<string, UTrip>; // by host id
  rsvp: Record<string, Record<string, URsvp>>; // user -> host -> rsvp
  duas: Record<string, Record<string, string[]>>; // user -> host -> requests
  names: Record<string, string>;
  error: string;
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
        () => setError('Совместная умра сейчас недоступна.'),
      ));
      sub('umrahTrip', setTrips);
      sub('umrahRsvp', setRsvp);
      sub('umrahDua', setDuasState);
    })();
    return () => { alive = false; unsubs.forEach((f) => f()); };
  }, []);

  const ids = [...new Set([...Object.keys(trips), ...Object.keys(rsvp), ...Object.keys(duas), ...Object.values(trips).flatMap((t) => [t.amir ?? '', ...(t.tasks ?? []).map((x) => x.who ?? '')])])].filter(Boolean).sort();
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

  const fail = (e: any) => setError(e?.code === 'invalid_argument' || e?.code === 'permission_denied' ? 'Нет права писать. Попроси владельца дать доступ «Участник».' : 'Не удалось сохранить, попробуй ещё раз.');

  return {
    ready, me, trips, rsvp, duas, names, error,
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

export const UMRAH_RULES = ['umrahTrip', 'umrahRsvp', 'umrahDua'].flatMap((c) => [
  { path: c, read: 'view', write: 'owner' },
  { path: `${c}/{self}`, read: 'view', write: 'interact' },
]);
