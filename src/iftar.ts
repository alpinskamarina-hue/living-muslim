import { useEffect, useRef, useState } from 'react';
import { _t } from './i18n';

export interface Iftar { date: string; time: string; place: string; note: string; bring: string[]; created: string }
export interface IRsvp { s: 'go' | 'no'; bring?: string }
export interface IftarApi {
  ready: boolean;
  me: string | null;
  events: Record<string, Iftar>; // by host
  rsvp: Record<string, Record<string, IRsvp>>; // user -> host -> answer
  names: Record<string, string>;
  error: string;
  save: (e: Iftar) => Promise<void>;
  remove: () => Promise<void>;
  respond: (host: string, r: IRsvp | null) => Promise<void>;
}

async function cap(name: string): Promise<any> {
  try { return window.claude ? await window.claude.use(name) : null; } catch { return null; }
}

/** Iftars hosted by circle members: one per host at a time, answers kept per guest. */
export function useIftar(): IftarApi {
  const db = useRef<any>(null);
  const user = useRef<any>(null);
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<IftarApi['events']>({});
  const [rsvp, setRsvp] = useState<IftarApi['rsvp']>({});
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
        () => setError(_t("Ифтары сейчас недоступны.")),
      ));
      sub('iftar', setEvents);
      sub('iftarRsvp', setRsvp);
    })();
    return () => { alive = false; unsubs.forEach((f) => f()); };
  }, []);

  const ids = [...new Set([...Object.keys(events), ...Object.keys(rsvp)])].sort();
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
    ready, me, events, rsvp, names, error,
    save: (e) => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`iftar/${me}`).set(JSON.parse(JSON.stringify(e))); setError(''); } catch (x) { fail(x); } }),
    remove: () => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`iftar/${me}`).delete(); } catch (x) { fail(x); } }),
    respond: (host, r) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(rsvp[me] ?? {}) };
      if (r) mine[host] = JSON.parse(JSON.stringify(r)); else delete mine[host];
      try { await db.current.doc(`iftarRsvp/${me}`).set(mine); } catch (x) { fail(x); }
    }),
  };
}
