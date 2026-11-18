import { useEffect, useRef, useState } from 'react';
import { _t } from './i18n';

export interface KhatmDoc { title: string; due: string; dedicate?: string; created: string }
export type KhatmMine = Record<string, { taken: number[]; done: number[] }>; // host -> my juz

export interface KhatmApi {
  ready: boolean;
  me: string | null;
  list: Record<string, KhatmDoc>;
  juz: Record<string, KhatmMine>; // user -> host -> juz
  error: string;
  names: Record<string, string>;
  start: (k: KhatmDoc) => Promise<void>;
  remove: () => Promise<void>;
  setMine: (host: string, v: { taken: number[]; done: number[] }) => Promise<void>;
}

async function cap(name: string): Promise<any> {
  try { return window.claude ? await window.claude.use(name) : null; } catch { return null; }
}

export function useKhatm(): KhatmApi {
  const db = useRef<any>(null);
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<KhatmApi['list']>({});
  const [juz, setJuz] = useState<KhatmApi['juz']>({});
  const [error, setError] = useState('');
  const user = useRef<any>(null);
  const [names, setNames] = useState<Record<string, string>>({});
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
        () => setError(_t("Общий хатм сейчас недоступен.")),
      ));
      sub('khatm', setList);
      sub('khatmJuz', setJuz);
    })();
    return () => { alive = false; unsubs.forEach((f) => f()); };
  }, []);

  const ids = [...new Set([...Object.keys(list), ...Object.keys(juz)])].sort();
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

  const fail = () => setError(_t("Не удалось сохранить. Нужен доступ «Участник»."));
  return {
    ready, me, list, juz, error, names,
    start: (k) => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`khatm/${me}`).set(JSON.parse(JSON.stringify(k))); } catch { fail(); } }),
    remove: () => serial(async () => { if (!db.current || !me) return; try { await db.current.doc(`khatm/${me}`).delete(); } catch { fail(); } }),
    setMine: (host, v) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(juz[me] ?? {}), [host]: v };
      try { await db.current.doc(`khatmJuz/${me}`).set(mine); } catch { fail(); }
    }),
  };
}
