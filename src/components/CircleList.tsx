import { useEffect, useMemo, useState } from 'react';
import { meRpc, myCircles, currentCircle, kindOf, type CircleRef } from '../cloud';
import type { Member } from '../circle';
import type { Msg } from '../chat';
import { shortOf } from './CircleChat';
import { _t, LOC } from '../i18n';

type Names = Record<string, { name: string; avatarUrl: string; color: string } | undefined>;
interface Row { last: Msg | null; who: Record<string, string> }

const KIND_BG: Record<string, string> = { family: '#fdeee0', brothers: '#e8f3ec', sisters: '#fbe8f0', biz: '#e7eefb', friends: '#eef0f3', masjid: '#efe7fb', study: '#e6f4f6', work: '#e7eefb', other: '#f6f0dc' };

function timeOf(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return _t("Вчера");
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString(LOC, { weekday: 'short' });
  return d.toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
}

/** Last message of each of my circles and the names of who wrote it; refreshed every 30 s while the list is open. */
function useLastMessages(circles: CircleRef[]) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const codes = circles.map((c) => c.code).join(',');
  useEffect(() => {
    let alive = true, t: number | undefined;
    const who: Record<string, Record<string, string>> = {};
    const load = async (first: boolean) => {
      const out: Record<string, Row> = {};
      await Promise.all(circles.map(async (c) => {
        if (first || !who[c.code]) {
          const s = await meRpc<{ members: { uid: string; name: string }[] } | null>('lm_state', { p_code: c.code }).catch(() => null);
          who[c.code] = Object.fromEntries((s?.members ?? []).map((m) => [m.uid, m.name]));
        }
        const r = await meRpc<{ msgs: Msg[] } | null>('lm_chat_list', { p_code: c.code }).catch(() => null);
        const msgs = (r?.msgs ?? []).filter((m) => !m.deleted);
        out[c.code] = { last: msgs[msgs.length - 1] ?? null, who: who[c.code] };
      }));
      if (alive) setRows(out);
    };
    const tick = async (first = false) => {
      if (document.visibilityState === 'visible') await load(first);
      if (alive) t = window.setTimeout(() => tick(), 30000);
    };
    tick(true);
    return () => { alive = false; clearTimeout(t); };
  }, [codes]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

export function CircleList({ me, unread, members, names, today, onOpen, onNew }: {
  me: string | null; unread: Record<string, number>; members: Member[]; names: Names; today: string;
  onOpen: (c: CircleRef) => void; onNew: () => void;
}) {
  const circles = myCircles();
  const rows = useLastMessages(circles);
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'unread' | string>('all');
  const cur = currentCircle();
  const kinds = useMemo(() => [...new Set(circles.map((c) => c.kind).filter(Boolean))] as string[], [circles.map((c) => c.kind).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const unreadN = circles.filter((c) => (unread[c.code] ?? 0) > 0).length;

  const list = circles
    .filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((c) => f === 'all' || (f === 'unread' ? (unread[c.code] ?? 0) > 0 : c.kind === f))
    .sort((a, b) => (rows[b.code]?.last?.id ?? 0) - (rows[a.code]?.last?.id ?? 0));

  const ringOf = (m: Member) => (m.day !== today ? 0 : Math.min(1, (m.prayers / 5) * 0.6 + (m.total ? (m.done / m.total) * 0.4 : 0)));
  const people = [...members].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : ringOf(b) - ringOf(a)));

  return (
    <div className="page wa-list">
      <div className="wa-lt"><h1>{_t("Круги")}</h1></div>
      <input className="wa-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={_t("🔍 Поиск")} />
      {people.length > 1 && (
        <div className="wa-status" aria-label={_t("Как прошёл день в «{0}»", cur?.title || _t("Круг"))}>
          {people.map((m) => {
            const fr = ringOf(m);
            const p = names[m.id];
            return (
              <button key={m.id} type="button" onClick={() => cur && onOpen(cur)}>
                <span className="wa-ring" style={{ background: `conic-gradient(var(--wa-acc) ${fr * 360}deg, var(--line) 0)` }}>
                  {p?.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <i style={{ background: p?.color || '#1f7a4d' }}>{(p?.name || '?').slice(0, 1).toUpperCase()}</i>}
                </span>
                <small>{m.id === me ? _t("Ты") : (p?.name || _t("Участник")).split(' ')[0]}</small>
              </button>
            );
          })}
        </div>
      )}
      {circles.length > 1 && (
        <div className="wa-filt">
          <button type="button" aria-pressed={f === 'all'} onClick={() => setF('all')}>{_t("Все")}</button>
          <button type="button" aria-pressed={f === 'unread'} onClick={() => setF('unread')}>{_t("Непрочитанные")}{unreadN ? ` ${unreadN}` : ''}</button>
          {kinds.length > 1 && kinds.map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{kindOf(k as never)?.ru ?? k}</button>)}
        </div>
      )}
      <div className="wa-rows">
        {list.map((c) => {
          const r = rows[c.code];
          const m = r?.last;
          const n = unread[c.code] ?? 0;
          const who = m ? (m.uid === me ? _t("Ты") : (r.who[m.uid] || '').split(' ')[0]) : '';
          const text = !m ? _t("Сообщений пока нет") : `${m.ref?.t === 'dua' ? '🤲 ' : ''}${who ? `${who}: ` : ''}${shortOf(m, 60)}`;
          return (
            <button key={c.code} type="button" className="wa-row" onClick={() => onOpen(c)}>
              <span className="wa-av" style={{ background: KIND_BG[c.kind ?? 'other'] ?? '#eef0f3' }}>{kindOf(c.kind)?.ic ?? '👥'}</span>
              <span className="wa-rt">
                <span className="wa-l1"><b>{c.title}</b>{m && <time className={n ? 'new' : ''}>{timeOf(m.at)}</time>}</span>
                <span className="wa-l2"><span>{m?.uid === me && m.kind !== 'event' ? '✓✓ ' : ''}{text}</span>{n > 0 && <em>{n > 99 ? '99+' : n}</em>}</span>
              </span>
            </button>
          );
        })}
        {!list.length && <p className="wa-none">{_t("Ничего не найдено")}</p>}
      </div>
      <button type="button" className="wa-fab" aria-label={_t("Новый круг")} onClick={onNew}>＋</button>
    </div>
  );
}
