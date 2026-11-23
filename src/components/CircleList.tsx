import { useEffect, useMemo, useState } from 'react';
import { meRpc, myCircles, currentCircle, kindOf, isDm, type CircleRef } from '../cloud';
import type { Member } from '../circle';
import { FounderMark } from './FounderBadge';
import { readsReady, readStateOf, type Msg } from '../chat';
import { Ticks, shortOf } from './CircleChat';
import { _t, _tj, LOC } from '../i18n';
import { plural } from '../dates';
import { Ic, IcT } from './LIcon';
import { openPerson, usePersonReady, useAsks } from '../person';
import { AsksBox, IntentsFeed } from './Person';
import { InviteInbox } from './Nick';
import type { AppState } from '../types';
import { useStories, type StoryGroup } from '../stories';
import { StoryStrip, StoryViewer, StoryCreate, StoryNudge } from './Stories';
import { useOpenReady, openPending } from '../openCircles';
import { FindCircle, CommonCircle } from './OpenCircles';
import { useDmReady, useDms } from '../dm';
import { DmTab } from './Dm';

type Names = Record<string, { name: string; avatarUrl: string; color: string } | undefined>;
interface Row { last: Msg | null; who: Record<string, string>; rd: [number, number] | null }

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
      const rd = (await readsReady()) ? await meRpc<Record<string, [number, number]> | null>('lm_chat_reads', { p_code: null }).catch(() => null) : null;
      await Promise.all(circles.map(async (c) => {
        if (first || !who[c.code]) {
          const s = await meRpc<{ members: { uid: string; name: string }[] } | null>('lm_state', { p_code: c.code }).catch(() => null);
          who[c.code] = Object.fromEntries((s?.members ?? []).map((m) => [m.uid, m.name]));
        }
        const r = await meRpc<{ msgs: Msg[] } | null>('lm_chat_list', { p_code: c.code }).catch(() => null);
        const msgs = (r?.msgs ?? []).filter((m) => !m.deleted);
        out[c.code] = { last: msgs[msgs.length - 1] ?? null, who: who[c.code], rd: rd ? rd[c.code] ?? [0, 0] : null };
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

export function CircleList({ state, me, unread, members, names, today, onOpen, onNew }: {
  state: AppState; me: string | null; unread: Record<string, number>; members: Member[]; names: Names; today: string;
  onOpen: (c: CircleRef) => void; onNew: () => void;
}) {
  const all = myCircles();
  const rows = useLastMessages(all);
  // «Личные»: chats of two have their own tab (supabase/dm.sql)
  const dmOn = useDmReady();
  const dms = useDms(dmOn);
  const dmSet = new Set([...dms.list.map((d) => d.code), ...all.filter((c) => isDm(c.code)).map((c) => c.code)]);
  const circles = dmOn ? all.filter((c) => !dmSet.has(c.code)) : all;
  const dmOnRef = dmOn;
  const dmUnread = dmOn ? [...dmSet].filter((c) => (unread[c] ?? 0) > 0).length : 0;
  const [q, setQ] = useState('');
  const personOn = usePersonReady();
  const asks = useAsks(personOn);
  useEffect(() => {
    if (!asks.list.length) return;
    let go = false; try { go = !!sessionStorage.getItem('lm.asksGo'); sessionStorage.removeItem('lm.asksGo'); } catch { /* */ }
    if (go) { if (dmOnRef) setTab('dm'); setTimeout(() => document.getElementById('lm-asks')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); }
  }, [asks.list.length]);
  const [seekers, setSeekers] = useState(false);
  const stories = useStories();
  const [watch, setWatch] = useState<{ groups: StoryGroup[]; i: number } | null>(null);
  const [making, setMaking] = useState(false);
  useEffect(() => { if (!seekers) return; history.pushState({ lmSeek: 1 }, ''); const f = (e: Event) => { e.stopImmediatePropagation(); setSeekers(false); }; window.addEventListener('popstate', f, true); return () => window.removeEventListener('popstate', f, true); }, [seekers]);
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

  // open circles: «Мои · Найти круг» and the common circle (supabase/open-circles.sql)
  const openOn = useOpenReady();
  const [tab, setTab] = useState<'mine' | 'dm' | 'find'>(() => { try { const t = sessionStorage.getItem('lm.findTab'); return t === 'find' || t === 'dm' ? t : 'mine'; } catch { return 'mine'; } });
  useEffect(() => { try { sessionStorage.setItem('lm.findTab', tab); } catch { /* */ } }, [tab]);
  const [common, setCommon] = useState(() => { try { const g = sessionStorage.getItem('lm.commonGo'); sessionStorage.removeItem('lm.commonGo'); return Boolean(g); } catch { return false; } });
  useEffect(() => { if (!common) return; history.pushState({ lmCommon: 1 }, ''); window.scrollTo(0, 0); const f = (e: Event) => { e.stopImmediatePropagation(); setCommon(false); }; window.addEventListener('popstate', f, true); return () => window.removeEventListener('popstate', f, true); }, [common]);
  const sex = state.settings.me ?? '';
  const [pend, setPend] = useState<{ code: string; title: string; n: number }[]>([]);
  useEffect(() => { if (openOn) openPending().then(setPend); }, [openOn]);

  if (seekers) return <IntentsFeed onBack={() => history.back()} />;
  if (common) return <CommonCircle today={today} onBack={() => history.back()} onFind={() => { history.back(); setTab('find'); }} />;
  return (
    <div className="page wa-list">
      <div className="wa-lt"><h1>{_t("Круги")}</h1></div>
      {(openOn || dmOn) && (
        <div className="oc-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>{_t("Мои")}</button>
          {dmOn && <button type="button" role="tab" aria-selected={tab === 'dm'} onClick={() => setTab('dm')}>{_t("Личные")}{dmUnread + asks.list.length > 0 && <em className="dm-segn">{dmUnread + asks.list.length}</em>}</button>}
          {openOn && <button type="button" role="tab" aria-selected={tab === 'find'} onClick={() => setTab('find')}>{_t("Найти круг")}</button>}
        </div>
      )}
      {dmOn && tab === 'dm' ? <DmTab list={dms.list} rows={rows} unread={unread} me={me} circles={all} onOpen={onOpen} asks={personOn ? <AsksBox list={asks.list} reload={asks.reload} /> : null} />
        : openOn && tab === 'find' ? <FindCircle today={today} sex={sex} onCommon={() => setCommon(true)} /> : <>
      {pend.filter((p) => circles.some((c) => c.code === p.code)).map((p) => (
        <button key={p.code} type="button" className="wa-asks oc-pend" onClick={() => { try { sessionStorage.setItem('lm.ocOwn', p.code); } catch { /* */ } onOpen(circles.find((c) => c.code === p.code)!); }}>
          {_tj("📩 {0} {1} в «{2}» ›", p.n, plural(p.n, _t("просится"), _t("просятся"), _t("просятся")), p.title)}
        </button>
      ))}
      <input className="wa-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={_t("🔍 Поиск")} />
      <InviteInbox />
      {personOn && !dmOn && <AsksBox list={asks.list} reload={asks.reload} />}
      {dmOn && asks.list.length > 0 && <button type="button" className="wa-asks" onClick={() => setTab('dm')}>{_tj("📩 {0} просят написать тебе ›", asks.list.length)}</button>}
      {stories.ready && (
        <>
          <StoryStrip api={stories} me={me} members={members} names={names} today={today}
            onPerson={(id) => (personOn ? openPerson(id) : cur && onOpen(cur))} onCreate={() => setMaking(true)} onView={(groups, i) => setWatch({ groups, i })} />
          <StoryNudge state={state} today={today} api={stories} me={me} onCreate={() => setMaking(true)} />
        </>
      )}
      {watch && <StoryViewer groups={watch.groups} start={watch.i} api={stories} me={me} onClose={() => setWatch(null)} onCreate={() => { history.back(); setTimeout(() => setMaking(true), 50); }} />}
      {making && <StoryCreate state={state} today={today} api={stories} me={me} names={names} onClose={() => setMaking(false)} />}
      {!stories.ready && people.length > 1 && (
        <div className="wa-status" aria-label={_t("Как прошёл день в «{0}»", cur?.title || _t("Круг"))}>
          {people.map((m) => {
            const fr = ringOf(m);
            const p = names[m.id];
            return (
              <button key={m.id} type="button" onClick={() => (personOn ? openPerson(m.id) : cur && onOpen(cur))}>
                <span className="wa-ring" style={{ background: `conic-gradient(var(--wa-acc) ${fr * 360}deg, var(--line) 0)` }}>
                  {p?.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <i style={{ background: p?.color || '#1f7a4d' }}>{(p?.name || '?').slice(0, 1).toUpperCase()}</i>}
                </span>
                <small>{m.id === me ? _t("Ты") : (p?.name || _t("Участник")).split(' ')[0]}<FounderMark uid={m.id} size={12} /></small>
              </button>
            );
          })}
        </div>
      )}
      {(circles.length > 1 || personOn) && (
        <div className="wa-filt">
          {personOn && <button type="button" className="wa-seek" onClick={() => setSeekers(true)}><IcT t={_t("🧭 Кто что ищет")} /></button>}
          {circles.length > 1 && <button type="button" aria-pressed={f === 'all'} onClick={() => setF('all')}>{_t("Все")}</button>}
          {circles.length > 1 && <button type="button" aria-pressed={f === 'unread'} onClick={() => setF('unread')}>{_t("Непрочитанные")}{unreadN ? ` ${unreadN}` : ''}</button>}
          {kinds.length > 1 && kinds.map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{kindOf(k as never)?.ru ?? k}</button>)}
        </div>
      )}
      <div className="wa-rows">
        {openOn && !q.trim() && f === 'all' && (
          <button type="button" className="wa-row oc-pinrow" onClick={() => setCommon(true)}>
            <span className="wa-av oc-cav">☪</span>
            <span className="wa-rt">
              <span className="wa-l1"><b>{_t("Общий круг Living Muslim")}</b></span>
              <span className="wa-l2"><span>{_t("Аят дня, хатм месяца и просьбы о дуа")}</span></span>
            </span>
          </button>
        )}
        {list.map((c) => {
          const r = rows[c.code];
          const m = r?.last;
          const n = unread[c.code] ?? 0;
          const who = m ? (m.uid === me ? _t("Ты") : (r.who[m.uid] || '').split(' ')[0]) : '';
          const text = !m ? _t("Сообщений пока нет") : `${m.ref?.t === 'dua' ? '🤲 ' : ''}${who ? `${who}: ` : ''}${shortOf(m, 60)}`;
          return (
            <button key={c.code} type="button" className="wa-row" onClick={() => onOpen(c)}>
              <span className="wa-av" style={{ background: KIND_BG[c.kind ?? 'other'] ?? '#eef0f3' }}><Ic e={kindOf(c.kind)?.ic ?? '👥'} /></span>
              <span className="wa-rt">
                <span className="wa-l1"><b>{c.title}</b>{m && <time className={n ? 'new' : ''}>{timeOf(m.at)}</time>}</span>
                <span className="wa-l2"><span>{m?.uid === me && m.kind !== 'event' ? <><Ticks s={r.rd ? readStateOf(r.rd[0], r.rd[1]) : 'sent'} /> </> : ''}{text}</span>{n > 0 && <em>{n > 99 ? '99+' : n}</em>}</span>
              </span>
            </button>
          );
        })}
        {!list.length && <p className="wa-none">{_t("Ничего не найдено")}</p>}
      </div>
      </>}
      {tab !== 'dm' && <button type="button" className="wa-fab" aria-label={_t("Новый круг")} onClick={onNew}>＋</button>}
    </div>
  );
}
