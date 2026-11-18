import { useEffect, useRef, useState } from 'react';
import { _t } from './i18n';

// Minimal typings for the claude.ai page runtime; it is absent when the app is opened as a plain file.
declare global {
  interface Window { claude?: { use(name: string): Promise<any> } }
}

export interface Member {
  id: string;
  day: string;
  done: number;
  total: number;
  prayers: number;
  ontime: number;
  goals?: { t: string; p: number }[];
  week?: { p: number; h: number }; // prayers and habit marks over the last 7 days, for the common counter
  wk?: import('./cweek').WeekTotals; // this circle week (Sat–Fri)
  pw?: import('./cweek').WeekTotals; // the previous circle week, for the Friday summary
  cgs?: import('./cweek').CGoal[]; // weekly goals I set for the circle
  ask?: import('./cweek').DuaAsk | null; // my request for dua, shown to the circle for 3 days
  act?: string[]; // my active days, last 30, for the circle streak
  fj?: string[]; // days with Fajr on time, last 14 (challenges)
  p5?: string[]; // days with all 5 prayers marked, last 14 (challenges)
  chs?: import('./cweek').Challenge[]; // challenges I sent
  acc?: string[]; // challenge ids I accepted
  amir?: import('./cweek').Amir | null; // I volunteered as amir of the week
  fast?: boolean;
  // Business circles only:
  biz?: { d: number; t: number }; // business habits marked today / active, counts only
  shura?: import('./biz').Shura | null; // my three lines for this week
  adv?: import('./biz').Advice[]; // advice I gave to others
  // Family circles only:
  fam?: boolean; // set by the owner: this circle is a family
  lit?: string[]; // my counted days, last 120
  kids?: KidSummary[];
  tog?: { day: string; a: string[]; week: number }; // prayers together at home
  promise?: { text: string; days: number } | null; // Ramadan fast today; reasons for not fasting are never shared
  updated: string;
}
export interface KidSummary { id: string; name: string; age: number; color: string; done: number; total: number; lit: string[]; stickers: number }
export type Reacts = Record<string, Record<string, { e: string; day: string }>>; // from -> to -> reaction

export interface CircleApi {
  status: 'loading' | 'off' | 'ready';
  me: string | null;
  isOwner: boolean;
  members: Member[];
  reacts: Reacts;
  names: Record<string, { name: string; avatarUrl: string; color: string; gender?: string }>;
  stale: boolean;
  error: string;
  join: (m: Omit<Member, 'id' | 'updated'>) => Promise<void>;
  leave: () => Promise<void>;
  push: (m: Omit<Member, 'id' | 'updated'>) => Promise<void>;
  react: (to: string, e: string, day: string) => Promise<void>;
  /** Nudges live in the same map as reactions, under the key "n:<to>". */
  nudge: (to: string, day: string) => Promise<void>;
  /** Praise for a child, under the key "p:<kidId>". */
  praise: (kidId: string, day: string) => Promise<void>;
}

async function capability(name: string): Promise<any> {
  try { return window.claude ? await window.claude.use(name) : null; } catch { return null; }
}

/** One subscription per app view: members of the circle and the reactions between them. */
export function useCircle(): CircleApi {
  const [status, setStatus] = useState<CircleApi['status']>('loading');
  const [me, setMe] = useState<string | null>(null);
  const [isOwner, setOwner] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [reacts, setReacts] = useState<Reacts>({});
  const [names, setNames] = useState<CircleApi['names']>({});
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const db = useRef<any>(null);
  const user = useRef<any>(null);
  const writing = useRef<Promise<void>>(Promise.resolve());
  const lastPushed = useRef('');

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let alive = true;
    const t = setTimeout(() => { if (alive) setStatus((s) => (s === 'loading' ? 'off' : s)); }, 12000);
    (async () => {
      const [d, u] = await Promise.all([capability('db'), capability('user')]);
      if (!alive) return;
      clearTimeout(t);
      const id = u ? await u.id() : null;
      if (!d || !id) { setStatus('off'); return; }
      db.current = d;
      user.current = u;
      setMe(id);
      setOwner(Boolean(await u.isOwner()));
      setStatus('ready');
      const slow = setTimeout(() => alive && setStale(true), 10000);
      unsubs.push(
        d.collection('circle').onSnapshot(
          (snap: any) => {
            if (!snap.metadata.fromCache) { clearTimeout(slow); setStale(false); }
            setMembers(snap.docs.filter((x: any) => x.exists).map((x: any) => ({ id: x.id, ...(x.data() as object) }) as Member));
          },
          () => { clearTimeout(slow); setError(_t("Круг сейчас недоступен. Открой позже.")); },
        ),
        d.collection('reacts').onSnapshot(
          (snap: any) => {
            const r: Reacts = {};
            snap.docs.forEach((x: any) => { if (x.exists) r[x.id] = (x.data() ?? {}) as Reacts[string]; });
            setReacts(r);
          },
          () => {},
        ),
      );
    })();
    return () => { alive = false; clearTimeout(t); unsubs.forEach((f) => f()); unsubs = []; };
  }, []);

  // Names are resolved on every change of who is on screen; never stored.
  useEffect(() => {
    const ids = members.map((m) => m.id);
    if (!user.current || !ids.length) return;
    let alive = true;
    user.current.profiles(ids).then((ps: any) => {
      if (!alive) return;
      const out: CircleApi['names'] = {};
      for (const id of ids) out[id] = { name: ps[id]?.name || '', avatarUrl: ps[id]?.avatarUrl || '', color: ps[id]?.color || '#1f7a4d', gender: ps[id]?.gender || '' };
      setNames(out);
    });
    return () => { alive = false; };
  }, [members.map((m) => m.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const serial = (fn: () => Promise<void>) => {
    writing.current = writing.current.then(fn, fn);
    return writing.current;
  };

  const push: CircleApi['push'] = (m) => {
    if (!db.current || !me) return Promise.resolve();
    const key = JSON.stringify(m);
    if (key === lastPushed.current) return Promise.resolve();
    lastPushed.current = key;
    return serial(async () => {
      try { await db.current.doc(`circle/${me}`).set({ ...m, updated: new Date().toISOString() }); setError(''); }
      catch (e: any) {
        lastPushed.current = '';
        setError(e?.code === 'invalid_argument' ? _t("Нет права писать в круг. Попроси владельца дать доступ «Участник».") : _t("Не удалось обновить итог."));
      }
    });
  };

  return {
    status, me, isOwner, members, reacts, names, stale, error, push,
    join: (m) => { lastPushed.current = ''; return push(m); },
    leave: () => serial(async () => {
      if (!db.current || !me) return;
      try { await db.current.doc(`circle/${me}`).delete(); lastPushed.current = ''; } catch { setError(_t("Не удалось выйти из круга.")); }
    }),
    praise: (kidId, day) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(reacts[me] ?? {}) };
      const k = `p:${kidId}`;
      if (mine[k]?.day === day) delete mine[k];
      else mine[k] = { e: 'praise', day };
      try { await db.current.doc(`reacts/${me}`).set(mine); } catch { setError(_t("Не удалось отправить похвалу.")); }
    }),
    nudge: (to, day) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(reacts[me] ?? {}) };
      const k = `n:${to}`;
      if (mine[k]?.day === day) delete mine[k];
      else mine[k] = { e: 'nudge', day };
      try { await db.current.doc(`reacts/${me}`).set(mine); } catch { setError(_t("Не удалось подтолкнуть.")); }
    }),
    react: (to, e, day) => serial(async () => {
      if (!db.current || !me) return;
      const mine = { ...(reacts[me] ?? {}) };
      if (mine[to]?.e === e && mine[to]?.day === day) delete mine[to];
      else mine[to] = { e, day };
      try { await db.current.doc(`reacts/${me}`).set(mine); } catch { setError(_t("Не удалось отправить реакцию.")); }
    }),
  };
}

export const CIRCLE_RULES = [
  { path: 'circle', read: 'view', write: 'owner' },
  { path: 'circle/{self}', read: 'view', write: 'interact' },
  { path: 'reacts', read: 'view', write: 'owner' },
  { path: 'reacts/{self}', read: 'view', write: 'interact' },
];
