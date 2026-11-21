import { inRamadan } from '../rplan';
import { THANKS, g, say, type Sex, type To } from '../words';
import { sexOf } from './Words';
import type { CircleApi, Member, Reacts } from '../circle';
import { plural } from '../dates';
import type { UmrahApi } from '../umrahCircle';
import { lazyNamed } from '../lazy';
const UmrahHub = lazyNamed(() => import('./UmrahHub').then((m) => m.UmrahHub));
import type { HubTab } from './UmrahHub';
import { UmrahBanner } from './UmrahBanner';
import type { KhatmApi } from '../khatm';
import { KhatmSection } from './Khatm';
import type { IftarApi } from '../iftar';
import { IftarSection } from './Iftar';
import { CloudSetup, CloudInvite } from './CloudCircle';
import { InviteByNick, InviteInbox } from './Nick';
import { nicksReady, meRpc, serverHas, leaveCircle } from '../cloud';
import { shareInvite } from './CloudCircle';
import { isCloud, currentCircle, myCircles, switchCircle, kindOf, pendingInvite, isDm } from '../cloud';
import { useEffect, useState } from 'react';
import type { Anchor, AppState } from '../types';
import { FamilySection } from './Family';
import { CircleGoal, WeekSummary, DuaAsks, StreakLine, Challenges, AmirCard } from './CircleWeek';
import type { CGoal, DuaAsk, Challenge, Amir } from '../cweek';
import { patchF, famOf } from '../family';
import type { Shura, Advice } from '../biz';
import { NikahInCircle } from './Nikah';
import { ShuraCard, BizHabitsOffer, AdviceBox, bizLine } from './BizCircle';
import { useChat, duaReplies, duaEventId } from '../chat';
import { CircleChat, DuaReplies, type Draft } from './CircleChat';
import { CircleList } from './CircleList';
import { openPerson, personOk, usePersonReady, useAsks } from '../person';
import { useRef } from 'react';
import { CH_KINDS, CH_DAYS, goalFor, circleTotals, valOf, weekStart, amirOf } from '../cweek';
import { addDays } from '../dates';
import { _t, _tj } from '../i18n';
import { CircleCourse } from './CircleCourse';
import type { CCourse } from '../courseSocial';

interface Props {
  circle: CircleApi;
  joined: boolean;
  today: string;
  summary: Omit<Member, 'id' | 'updated'>;
  onJoin: () => void;
  onLeave: () => void;
  umrah: UmrahApi;
  myReady: number;
  khatm: KhatmApi;
  iftar: IftarApi;
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  current: Anchor;
  onCircleGoal: (g: CGoal) => void;
  myAsk: DuaAsk | null;
  onAsk: (a: DuaAsk | null) => void;
  ch: { chs: Challenge[]; acc: string[]; add: (c: Challenge) => void; remove: (id: string) => void; accept: (id: string) => void };
  amir: Amir | null;
  onAmir: (a: Amir | null) => void;
  shura: Shura | null;
  onShura: (s: Shura | null) => void;
  adv: Advice[];
  giveAdv: (a: Advice) => void;
  onNikah?: () => void;
  /** Unread chat messages per circle code. */
  chatUnread?: Record<string, number>;
  myCC?: CCourse | null;
  onCC?: (c: CCourse | null) => void;
  onOpenCourse?: (id: string) => void;
}

const REACTIONS = [
  { e: '🤲', label: _t("Дуа за тебя"), short: _t("Дуа") },
  { e: '✨', label: _t("МашаАллах"), short: _t("МашаАллах") },
];

export function Circle({ circle, joined, today, summary, onJoin, onLeave, umrah, myReady, khatm, iftar, state, update, current, onCircleGoal, myAsk, onAsk, ch, amir, onAmir, shura, onShura, adv, giveAdv, onNikah, chatUnread, onCC, onOpenCourse }: Props) {
  const { status, me, members, reacts, names, isOwner } = circle;
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [jobs, setJobs] = useState(false);
  const [umra, setUmra] = useState<false | HubTab>(false);
  const [adding, setAdding] = useState(false);
  // The circle as a chat (main screen): side panel of the circle, sheets for a dua request and a poll.
  const [panel, setPanelRaw] = useState(false);
  const panelRef = useRef(false);
  const setPanel = (v: boolean) => { panelRef.current = v; setPanelRaw(v); };
  useEffect(() => {
    const f = () => { if (depth.current > 0) depth.current--; if (panelRef.current) setPanel(false); else setListOn(true); window.scrollTo(0, 0); };
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [openM, setOpenM] = useState('');
  const [sheet, setSheet] = useState<'' | 'dua' | 'poll'>('');
  const [duaText, setDuaText] = useState('');
  const [poll, setPoll] = useState<{ q: string; o: string[] }>({ q: '', o: ['', ''] });
  const openPanel = (sec?: string) => {
    if (!panelRef.current) { pushNav(); window.scrollTo(0, 0); }
    setPanel(true);
    if (sec) setTimeout(() => { const el = document.getElementById(sec); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.classList.add('cx-flash'); setTimeout(() => el?.classList.remove('cx-flash'), 1600); }, 120);
  };
  const [inviting, setInviting] = useState(false);
  const [nicks, setNicks] = useState(false);
  useEffect(() => { nicksReady().then(setNicks); }, []);
  const chatCode = isCloud ? currentCircle()?.code : undefined;
  // WhatsApp-like: the Circles tab opens on the list of my circles; a circle opens as its chat.
  const personOn = usePersonReady();
  const asks = useAsks(personOn && isCloud);
  const [listOn, setListOn] = useState(() => {
    if (!isCloud || !myCircles().length) return false;
    try { if (sessionStorage.getItem('lm.chat') === chatCode || new URLSearchParams(location.search).get('c') || sessionStorage.getItem('lm.umrahGo') || sessionStorage.getItem('lm.autojoin')) return false; } catch { /* */ }
    return true;
  });
  const depth = useRef(0);
  const pushNav = () => { try { history.pushState({ lm: 'circle' }, ''); depth.current++; } catch { /* */ } };
  const goBack = (fallback: () => void) => { if (depth.current > 0) history.back(); else fallback(); };
  const [view, setView] = useState<'circle' | 'chat'>(() => {
    try { const c = sessionStorage.getItem('lm.chat'); if (c && c === chatCode) { sessionStorage.removeItem('lm.chat'); return 'chat'; } } catch { /* */ }
    return 'circle';
  });
  const [cxOn, setCxOn] = useState(false);
  const chat = useChat(joined ? chatCode : undefined, view === 'chat' || (cxOn && !panel));
  const [draft, setDraft] = useState<Draft | null>(null);
  const openChat = (d?: Draft) => { if (d) setDraft(d); setView('chat'); setPanel(false); window.scrollTo(0, 0); };
  useEffect(() => {
    const f = () => { try { if (sessionStorage.getItem('lm.chat') === chatCode) { sessionStorage.removeItem('lm.chat'); setView('chat'); setListOn(false); } } catch { /* */ } };
    window.addEventListener('lm-open-chat', f);
    return () => window.removeEventListener('lm-open-chat', f);
  }, [chatCode]);
  // Came by «Позвать в поездку»: once in the circle, open the umrah group.
  useEffect(() => {
    if (!joined) return;
    try { if (sessionStorage.getItem('lm.umrahGo')) { sessionStorage.removeItem('lm.umrahGo'); setUmra('trip'); window.scrollTo(0, 0); } } catch { /* */ }
  }, [joined]);
  // Owner removes a member; a removed person sees why the circle is gone.
  const [kickOn, setKickOn] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const [removed, setRemoved] = useState<{ uid: string; name: string }[]>([]);
  const [kicked, setKicked] = useState(false);
  const loadRemoved = () => { if (chatCode) meRpc<{ uid: string; name: string }[] | boolean>('lm_kicked', { p_code: chatCode }).then((r) => setRemoved(Array.isArray(r) ? r : [])).catch(() => {}); };
  useEffect(() => {
    if (!isCloud || !isOwner || !joined) return;
    serverHas('lm_kick', { p_uid: null, p_token: null, p_code: null, p_other: null }).then((on) => { setKickOn(on); if (on) loadRemoved(); });
  }, [isOwner, joined, chatCode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isCloud || !chatCode || status !== 'ready' || (joined && !circle.error && !circle.stale)) return;
    meRpc<boolean>('lm_kicked', { p_code: chatCode }).then((r) => setKicked(r === true)).catch(() => {});
  }, [circle.error, circle.stale, joined, status, chatCode]);
  const kick = async (id: string, name: string) => {
    if (!chatCode || !confirm(_t("Убрать {0} из круга? Его отметки и сообщения в этом круге удалятся. Вернуться по ссылке он не сможет, пока ты не разрешишь.", name))) return;
    const r = await meRpc<string>('lm_kick', { p_code: chatCode, p_other: id }).catch(() => 'error');
    if (r === 'ok') { setGone((g) => [...g, id]); loadRemoved(); } else alert(_t("Не получилось убрать. Попробуй ещё раз."));
  };
  const unkick = async (id: string) => {
    if (!chatCode) return;
    await meRpc<boolean>('lm_unkick', { p_code: chatCode, p_other: id }).catch(() => false);
    setGone((g) => g.filter((x) => x !== id));
    loadRemoved();
  };
  const invite = () => { if (!nicks) { if (isCloud && currentCircle()) shareInvite(currentCircle()!.code); return; } setInviting(true); window.scrollTo(0, 0); };
  const famKindOwner = isCloud && currentCircle()?.kind === 'family' && isOwner && !famOf(state).on;
  useEffect(() => { if (famKindOwner) update((s) => patchF(s, () => ({ on: true }))); }, [famKindOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Just created or joined a circle on the standalone site: share today's total right away.
    if (status !== 'ready' || joined) return;
    try { if (sessionStorage.getItem('lm.autojoin') || isDm(currentCircle()?.code)) { sessionStorage.removeItem('lm.autojoin'); onJoin(); } } catch { /* */ }
  }, [status, joined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading')
    return <div className="page"><h1 className="page-h">{_t("Круг")}</h1><p className="page-sub">{_t("Подключаюсь…")}</p></div>;

  if (status === 'off' && isCloud) return <CloudSetup />;
  if (isCloud && pendingInvite() && !myCircles().some((c) => c.code === pendingInvite())) return <CloudSetup onCancel={() => { try { sessionStorage.removeItem('lm.invite'); } catch { /* */ } location.reload(); }} />;

  if (status === 'off')
    return (
      <div className="page">
        <h1 className="page-h">{_t("Круг")}</h1>
        <p className="page-sub">{_t("Круг работает, когда приложение открыто по ссылке claude.ai и ты вошёл в аккаунт. В этом окне он недоступен, остальные разделы работают как обычно.")}</p>
      </div>
    );

  const sorted = members.filter((m) => !gone.includes(m.id)).sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : (b.day === today ? 1 : 0) - (a.day === today ? 1 : 0)));
  const activeToday = members.filter((m) => m.day === today && (m.done > 0 || m.prayers > 0)).length;
  const received = (to: string) => {
    const out: Record<string, number> = {};
    for (const [from, map] of Object.entries(reacts)) {
      if (from === to) continue;
      const r = map?.[to];
      if (r && r.day === today) out[r.e] = (out[r.e] ?? 0) + 1;
    }
    return out;
  };

  // ---- circle meta (standalone site: several circles with a title and a kind) ----
  const cur = isCloud ? currentCircle() : null;
  const kind = cur?.kind;
  const kindInfo = kindOf(kind);
  const familyKind = kind === 'family' || (!kind && members.some((m) => m.fam));
  const biz = kind === 'biz';
  const alone = members.filter((m) => m.id !== me).length === 0;
  const chatOn = Boolean(chat.ready && joined && isCloud && (!alone || isDm(currentCircle()?.code)) && me);
  const cx = chatOn && !kicked;
  if (cx !== cxOn) setTimeout(() => setCxOn(cx), 0);
  const ask = (a: DuaAsk | null) => {
    if (chatOn && myAsk) { const id = duaEventId(chat.msgs, me!, myAsk.d); if (id && (!a || a.t !== myAsk.t)) chat.remove(id); }
    onAsk(a);
    if (a && chatOn) chat.send(a.t, { t: 'dua', d: a.d }, 'event');
  };
  const ch2 = {
    ...ch,
    accept: (id: string) => {
      ch.accept(id);
      const c = members.flatMap((m) => (m.chs ?? []).map((x) => ({ ...x, from: m.id }))).find((x) => x.id === id);
      if (c && chatOn) chat.send(_t("принял вызов «{0}»{1}", CH_KINDS[c.k].short, c.from !== me ? _t(" от {0}", names[c.from]?.name || _t("брата")) : ''), { t: 'ch', k: c.k }, 'event');
    },
  };
  const duaExtra = (asker: string, a: DuaAsk) => (
    <>
      {biz && me && <AdviceBox members={members} me={me} to={asker} k="a" w={a.d} nameOf={nm} mine={adv} give={giveAdv} />}
      {chatOn && me && <DuaReplies list={duaReplies(chat.msgs, asker, a.d)} names={names} me={me} onReply={() => { const id = duaEventId(chat.msgs, asker, a.d); openChat({ text: '', ref: id ? { r: id } : { t: 'dua', to: asker, d: a.d } }); }} />}
    </>
  );

  const wk = members.reduce((acc, m) => ({ p: acc.p + (m.week?.p ?? 0), h: acc.h + (m.week?.h ?? 0) }), { p: 0, h: 0 });
  const tdy = members.filter((m) => m.day === today).reduce((acc, m) => ({ p: acc.p + m.prayers, h: acc.h + m.done }), { p: 0, h: 0 });
  let duas = 0;
  for (const [from, map] of Object.entries(reacts)) for (const [to, r] of Object.entries(map ?? {})) if (to !== from && !to.startsWith('n:') && r?.e === '🤲' && r.day === today) duas++;
  const lit = (m: Member) => (range === 'week' ? (m.week?.p ?? 0) + (m.week?.h ?? 0) > 0 : m.day === today && (m.done > 0 || m.prayers > 0));
  const nm = (id: string) => (id === me ? _t("Ты") : names[id]?.name || _t("Участник"));
  // Who is thanked: a brother or a sister. From the profile, else from the kind of circle; unknown = ask with two buttons.
  const toOf = (id: string): To | '' => { const gd = names[id]?.gender; return gd === 'm' || gd === 'f' ? gd : kind === 'sisters' ? 'f' : kind === 'brothers' ? 'm' : ''; };

  // «Что нового»: what happened today that concerns me or the whole circle.
  const feed: { e: string; t: string }[] = [];
  if (me) {
    for (const [from, map] of Object.entries(reacts)) {
      if (from === me) continue;
      const r = map?.[me];
      if (r?.day === today && r.e !== '🤲') feed.push({ e: r.e, t: r.e === '💚' ? _t("{0}: {1} тебе. Ответь «{2}»", nm(from), THANKS[sexOf(state) || 'm'].ru.toLowerCase(), THANKS[toOf(from) || 'm'].reply) : _t("{0}: машаАллах тебе", nm(from)) });
      if (map?.[`n:${me}`]?.day === today) feed.push({ e: '👋', t: _t("{0} мягко напоминает о себе и о тебе", nm(from)) });
    }
  }
  for (const m of members) if (m.id !== me && m.day === today && m.prayers >= 5) feed.push({ e: '✅', t: _t("{0}: все 5 намазов сегодня", nm(m.id)) });
  for (const [host, k] of Object.entries(khatm.list)) {
    const done = Object.values(khatm.juz).reduce((n, byHost) => n + (byHost?.[host]?.done?.length ?? 0), 0);
    feed.push({ e: '📖', t: _t("{0}: прочитано {1} из 30 джузов", k.title || _t("Хатм"), Math.min(30, done)) });
  }
  const jobsActive = Object.keys(khatm.list).length > 0 || Object.keys(iftar.events).length > 0;
  const umraCount = Object.keys(umrah.trips).length;
  const umraGoing = Boolean(me && Object.entries(umrah.rsvp[me] ?? {}).some(([h, r]) => r.s === 'go' && umrah.trips[h]));

  const umraName = (id: string) => names[id]?.name || umrah.names[id] || khatm.names[id] || _t("Участник");
  if (umra) return <UmrahHub state={state} update={update} today={today} api={umrah} nameOf={umraName} start={umra} circle={circle} joined={joined} backLabel={_t("Круг")} onExit={() => { setUmra(false); window.scrollTo(0, 0); }} />;
  if (adding) return <CloudSetup onCancel={() => setAdding(false)} />;
  if (inviting && cur) return <InviteByNick code={cur.code} onBack={() => { setInviting(false); window.scrollTo(0, 0); }} />;
  if (listOn && isCloud && myCircles().length && !kicked)
    return <CircleList me={me} unread={chatUnread ?? {}} members={members} names={names} today={today} onNew={() => setAdding(true)}
      onOpen={(c) => {
        if (c.code === cur?.code) { setListOn(false); pushNav(); window.scrollTo(0, document.documentElement.scrollHeight); return; }
        try { sessionStorage.setItem('lm.chat', c.code); } catch { /* */ }
        switchCircle(c.code);
      }} />;
  const backToList = isCloud && myCircles().length > 0 ? () => goBack(() => { setListOn(true); window.scrollTo(0, 0); }) : null;

  const membersBlock = members.length > 0 && !(alone && isCloud) && (
      <>
        <h3 className="ch-h">{cx ? _t("Сегодня") : familyKind ? _t("Взрослые") : _t("Участники")} <small>{members.length}</small></h3>
        <div className="ch-mem">
          {sorted.map((m) => {
            const p = names[m.id];
            const isMe = m.id === me;
            const fresh = m.day === today;
            const got = received(m.id);
            const mine = me ? reacts[me]?.[m.id] : undefined;
            const empty = !fresh || (m.done === 0 && m.prayers === 0);
            const nudged = Boolean(me && reacts[me]?.[`n:${m.id}`]?.day === today);
            return (
              <div className="ch-m" key={m.id}>
                <div className="ch-mt" onClick={cx && !isMe ? () => setOpenM((x) => (x === m.id ? '' : m.id)) : undefined}>
                  {p?.avatarUrl ? <img className="ava" src={p.avatarUrl} alt="" /> : <span className="ava ch-ava" style={{ background: p?.color }}>{(p?.name || '?').slice(0, 1).toUpperCase()}</span>}
                  <span>
                    <b>{isMe ? _t("{0} (ты)", p?.name || _t("Ты")) : p?.name || _t("Участник")}</b>
                    <small>{fresh ? _t("Намазы {0}/5 · {1}привычки {2}/{3}{4}", m.prayers, biz && m.biz?.t ? _t("дела {0}/{1} · ", m.biz.d, m.biz.t) : '', m.done, m.total, m.fast ? _t(" · постится ✓") : '') : _t("Сегодня ещё не отмечался")}</small>
                    {(m.goals ?? []).map((g) => <small key={g.t} className="m-goal">🎯 {g.t} · {g.p}%</small>)}
                  </span>
                  {Object.keys(got).length > 0 && <em className="ch-got">{Object.entries(got).map(([e, n]) => `${e} ${n}`).join('  ')}</em>}
                </div>
                {fresh && m.total > 0 && <span className="ch-bar"><i style={{ width: `${(m.done / m.total) * 100}%` }} /></span>}
                {!isMe && joined && (!cx || openM === m.id) && (
                  <div className="ch-acts">
                    {REACTIONS.map((r) => {
                      const on = mine?.e === r.e && mine.day === today;
                      return <button key={r.e} type="button" aria-pressed={on} onClick={() => { if (!on) say(r.e === '🤲' ? 'dua_sent' : 'masha_sent'); circle.react(m.id, r.e, today); }}>{r.e} {r.short}{on ? ' ✓' : ''}</button>;
                    })}
                    {personOk() && <button type="button" onClick={() => openPerson(m.id)}>{_t("👤 Профиль")}</button>}
                    {chatOn && <button type="button" aria-label={_t("Написать {0} в чате", p?.name || _t("участнику"))} onClick={() => openChat({ text: `${(p?.name || '').split(' ')[0]}, `, ref: null })}>💬</button>}
                    {kickOn && <button type="button" className="kick" onClick={() => kick(m.id, p?.name || _t("участника"))}>{_t("Убрать из круга")}</button>}
                    {empty && <button type="button" className="nd" aria-pressed={nudged} onClick={() => { if (!nudged) say('nudge_sent'); circle.nudge(m.id, today); }}>{nudged ? _t("👋 Отправлено") : _t("👋 Подтолкнуть")}</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  const body = (
    <>
      {isCloud && nicks && <InviteInbox />}
      {kicked ? (
        <div className="warn kicked">
          <b>{_t("Владелец убрал тебя из круга «{0}».", cur?.title || _t("Круг"))}</b>
          <p>{_t("Твои привычки и отметки остались у тебя. Можно создать свой круг или вступить в другой.")}</p>
          <button type="button" className="pri-btn" onClick={async () => { await leaveCircle(); location.reload(); }}>{_t("Понятно")}</button>
        </div>
      ) : circle.error && <div className="warn">{circle.error}</div>}
      {circle.stale && !kicked && <p className="tiny">{_t("Данные круга пока не загрузились, могут быть устаревшими.")}</p>}

      {kicked ? null : !joined ? (
        <div className="join">
          <b>{_t("Присоединиться к кругу")}</b>
          <p>{_t("Остальные увидят: сколько привычек и намазов ты отметил сегодня. Названия привычек, заметки и мухасаба остаются только у тебя.")}</p>
          <button type="button" className="pri-btn big-btn" onClick={onJoin}>{_t("Присоединиться")}</button>
        </div>
      ) : alone && isCloud ? (
        <div className="ch-empty">
          <i>🤝</i>
          <b>{_t("Позови первого человека")}</b>
          <p>{_tj("{0} Вместе держаться легче, а дуа друг за друга приходят каждый день.", kind === 'family' ? _t("Жена, муж, родители, взрослые дети.") : biz ? _t("Партнёр, брат с похожим делом, друг-предприниматель.") : kind === 'sisters' ? _t("Подруга, сестра, соседка по мечети.") : kind === 'masjid' ? _t("Братья и сёстры с урока или из мечети.") : _t("Брат, друг, однокурсник."))}</p>
          <button type="button" className="pri-btn big-btn" onClick={invite}>{_t("Пригласить в круг")}</button>
        </div>
      ) : cx ? null : (
        <div className={`ch-hero${biz ? ' biz' : ''}`}>
          <div className="ch-seg">
            <button type="button" aria-pressed={range === 'today'} onClick={() => setRange('today')}>{_t("Сегодня")}</button>
            <button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>{_t("Неделя")}</button>
          </div>
          <div className="ch-avs">
            {sorted.map((m) => (
              <span key={m.id} className={`ch-av${lit(m) ? ' on' : ''}`}>
                {names[m.id]?.avatarUrl ? <img src={names[m.id]!.avatarUrl} alt="" /> : <i style={{ background: names[m.id]?.color || '#1f7a4d' }}>{(names[m.id]?.name || '?').slice(0, 1).toUpperCase()}</i>}
                <small>{m.id === me ? _t("Ты") : (names[m.id]?.name || _t("Участник")).split(' ')[0]}</small>
              </span>
            ))}
          </div>
          {range === 'today' ? (
            <>
              <b>{_tj("{0} из {1} сегодня в деле", activeToday, members.length)}</b>
              <StreakLine members={members} today={today} />
              {biz && bizLine(members, today) && <small className="bz-hl">{bizLine(members, today)}</small>}
              <small>{_tj("Вместе сегодня: {0}  {1} и {2}  {3}{4}", tdy.p, plural(tdy.p, _t("намаз"), _t("намаза"), _t("намазов")), tdy.h, plural(tdy.h, _t("привычка"), _t("привычки"), _t("привычек")), duas ? _t(" · 🤲 {0} дуа друг за друга", duas) : '')}</small>
            </>
          ) : (
            <>
              <b>{_tj("{0}  {1} за неделю", wk.p, plural(wk.p, _t("намаз"), _t("намаза"), _t("намазов")))}</b>
              <small>{_tj("И {0}  {1}. Общий счёт, без рейтинга: каждый добавляет свой свет.", wk.h, plural(wk.h, _t("привычка"), _t("привычки"), _t("привычек")))}</small>
            </>
          )}
        </div>
      )}

      {joined && !(alone && isCloud) && (
        <>
          <WeekSummary members={members} reacts={reacts} me={me} today={today} title={cur?.title || _t("Круг")} nameOf={(id) => names[id]?.name || _t("Участник")} onSet={onCircleGoal} />
          <div id="cx-goal" /><CircleGoal members={members} reacts={reacts} me={me} today={today} title={cur?.title || _t("Круг")} nameOf={nm} onSet={onCircleGoal} />
          {me && onOpenCourse && onCC && <CircleCourse members={members} me={me} today={today} isOwner={isOwner} nameOf={nm} onOpen={onOpenCourse} onEnd={onCC} onCheer={(text) => (isCloud ? openChat({ text, ref: null }) : navigator.clipboard?.writeText(text).catch(() => {}))} />}
          <div id="cx-amir" />{me && <AmirCard members={members} me={me} today={today} nameOf={nm} amir={amir} onAmir={onAmir} />}
          {biz && me && <ShuraCard members={members} reacts={reacts} me={me} today={today} nameOf={nm} shura={shura} onShura={onShura} adv={adv} give={giveAdv} react={(k, e) => circle.react(k, e, today)} />}
        </>
      )}

      {joined && (
        <UmrahBanner api={umrah} names={names} reacts={reacts} today={today} family={Boolean(familyKind)} myReady={myReady}
          unread={(h) => chat.msgs.filter((m) => m.ref?.tr === h && m.uid !== me && m.id > chat.seen).length}
          onOpen={(t) => { setUmra(t); window.scrollTo(0, 0); }}
          onEvent={(h, text) => { if (chatOn) chat.send(text, { tr: h }, 'event'); }} />
      )}

      {joined && !cx && feed.length > 0 && (
        <>
          <h3 className="ch-h">{_t("Что нового")}</h3>
          <div className="ch-feed">{feed.slice(0, 5).map((f, i) => <div key={i}><em>{f.e}</em><span>{f.t}</span></div>)}</div>
        </>
      )}

      {joined && biz && <BizHabitsOffer state={state} update={update} today={today} />}
      <div id="cx-dua" />
      {joined && me && !(alone && isCloud) && <DuaAsks members={members} reacts={reacts} me={me} today={today} nameOf={nm} myAsk={myAsk} onAsk={ask} react={(k) => { say('dua_sent'); circle.react(k, '🤲', today); }}
        biz={biz} extra={biz || chatOn ? duaExtra : undefined} />}
      {joined && me && isCloud && cur && !alone && <NikahInCircle code={cur.code} me={me} reacts={reacts} today={today} react={(k) => { say('dua_sent'); circle.react(k, '🤲', today); }} onOpenMine={() => onNikah?.()} />}
      <div id="cx-ch" />
      {joined && me && !(alone && isCloud) && <Challenges members={members} me={me} today={today} nameOf={nm} ch={ch2} />}
      {joined && me && <DuaGot reacts={reacts} me={me} today={today} nameOf={nm} toOf={toOf} react={(to, e) => circle.react(to, e, today)} sex={sexOf(state)} />}
      {joined && familyKind && <FamilySection state={state} update={update} circle={circle} today={today} current={current} />}
      {joined && isOwner && !isCloud && !members.some((m) => m.fam) && (
        <div className="fam-on">
          <b>{_t("Это ваша семья?")}</b>
          <p>{_t("Включите семейный круг: намаз вместе дома, детские профили с наклейками, общий семейный сад и семейное обещание.")}</p>
          <button type="button" className="pri-btn" onClick={() => update((s) => patchF(s, () => ({ on: true })))}>{_t("Сделать круг семейным")}</button>
        </div>
      )}

      {joined && inRamadan(today) && members.length > 1 && (() => {
        const fasting = members.filter((m) => m.day === today && m.fast).length;
        return <div className="rm-together"><span aria-hidden="true">🌙</span><span>{_t("Постимся вместе: ")}<b>{fasting}</b>{_tj(" из {0} сегодня", members.length)}</span></div>;
      })()}
      {!cx && membersBlock}

      {joined && (
        <>
          <h3 className="ch-h" id="cx-deeds">{_t("Общие дела")}</h3>
          <button type="button" className="um-entry" onClick={() => { setUmra('trip'); window.scrollTo(0, 0); }}>
            <span className="um-ic">🕋</span>
            <span><b>{_t("Умра")}</b><small>{umraCount ? `${umraCount} ${plural(umraCount, _t("поездка"), _t("поездки"), _t("поездок"))} · ${umraGoing ? _t("ты едешь") : _t("открой, чтобы присоединиться")}` : _t("Собрать группу, сэкономить и поехать вместе")}</small></span>
            <i aria-hidden="true">›</i>
          </button>
          {(jobsActive || jobs) ? (
            <>
              <IftarSection api={iftar} today={today} nameOf={(id) => names[id]?.name || iftar.names[id] || _t("Участник")} />
              <KhatmSection api={khatm} today={today} nameOf={(id) => names[id]?.name || khatm.names[id] || umrah.names[id] || _t("Участник")} />
            </>
          ) : (
            <button type="button" className="ch-new" onClick={() => setJobs(true)}>{_tj("+ Начать общее дело: хатм{0}", kind === 'family' || kind === 'masjid' ? _t(", ифтар") : '')}</button>
          )}
        </>
      )}

      <p className="ch-priv">{_tj("🔒 В круге видят только итог дня{0}.", biz ? _t(" и то, чем ты сам поделился в шуре. Суммы денег не видны никогда") : _t(". Названия привычек, заметки и мухасаба остаются у тебя"))}</p>
      {kickOn && removed.length > 0 && (
        <div className="ch-removed">
          <small>{_t("Убраны из круга:")}</small>
          {removed.map((r) => (
            <span key={r.uid}>{r.name || _t("Участник")} <button type="button" className="link-btn" onClick={() => { if (confirm(_t("Разрешить {0} снова вступить в круг? Он сможет вернуться по ссылке или приглашению.", r.name || _t("участнику")))) unkick(r.uid); }}>{_t("Разрешить вернуться")}</button></span>
          ))}
        </div>
      )}
      {isCloud && !kicked && <CloudInvite isOwner={isOwner} />}
      {!isCloud && isOwner && (
        <div className="invite">
          <b>{_t("Как пригласить")}</b>
          <p>{_t("Открой меню «Поделиться» у этой страницы на claude.ai и добавь человека с уровнем «Участник» (Contributor). Он откроет ту же ссылку и нажмёт «Присоединиться».")}</p>
        </div>
      )}
      {joined && isOwner && members.some((m) => m.fam) && kind !== 'family' && (
        <button type="button" className="link-btn" onClick={() => { if (confirm(_t("Выключить семейный режим? Детские профили останутся на этом телефоне."))) update((s) => patchF(s, () => ({ on: false }))); }}>{_t("Выключить семейный режим")}</button>
      )}
      {joined && !isCloud && <button type="button" className="danger" onClick={onLeave}>{_t("Выйти из круга")}</button>}
    </>
  );

  if (cx && me) {
    const w = weekStart(today);
    const goal = goalFor(members, w);
    const gt = goal && goal.k !== 'none' ? Math.min(goal.n, valOf(circleTotals(members, w), goal.k)) : 0;
    const am = amirOf(members, w);
    const chN = members.flatMap((m) => m.chs ?? []).filter((c) => c.start > addDays(today, -CH_DAYS)).length;
    const khatms = Object.entries(khatm.list).map(([host, k]) => ({ host, t: k.title, n: Math.min(30, Object.values(khatm.juz).reduce((n, byHost) => n + (byHost?.[host]?.done?.length ?? 0), 0)) }));
    const chips: { k: string; t: string; go: () => void }[] = [];
    if (goal && goal.k !== 'none') chips.push({ k: 'g', t: `🎯 ${gt}/${goal.n}`, go: () => openPanel('cx-goal') });
    if (chN) chips.push({ k: 'c', t: _t("⚔️ Вызовов: {0}", chN), go: () => openPanel('cx-ch') });
    for (const k of khatms) chips.push({ k: `k${k.host}`, t: `📖 ${k.n}/30`, go: () => openPanel('cx-deeds') });
    if (umraCount) chips.push({ k: 'u', t: _t("🕋 Умра"), go: () => { setUmra('trip'); window.scrollTo(0, 0); } });
    if (am) chips.push({ k: 'a', t: _t("👑 Амир: {0}", nm(am.id).split(' ')[0]), go: () => openPanel('cx-amir') });
    if (!chips.length) chips.push({ k: 'n', t: _t("＋ Начать общее дело"), go: () => openPanel('cx-goal') });
    const acts = [
      { ic: '🤲', c: '#25a55f', label: _t("Дуа"), run: () => { setDuaText(''); setSheet('dua'); } },
      { ic: '📊', c: '#02a698', label: _t("Опрос"), run: () => { setPoll({ q: '', o: ['', ''] }); setSheet('poll'); } },
      { ic: '🎯', c: '#1f7aec', label: _t("Цель недели"), run: () => openPanel('cx-goal') },
      { ic: '⚔️', c: '#e8763a', label: _t("Вызов"), run: () => openPanel('cx-ch') },
      { ic: '📖', c: '#11553a', label: kind === 'family' || kind === 'masjid' ? _t("Хатм, ифтар") : _t("Хатм"), run: () => { setJobs(true); openPanel('cx-deeds'); } },
      { ic: '🕋', c: '#b88a2c', label: _t("Умра"), run: () => { setUmra('trip'); window.scrollTo(0, 0); } },
      { ic: '👑', c: '#c79a1e', label: _t("Амир"), run: () => openPanel('cx-amir') },
      { ic: '➕', c: '#54656f', label: _t("Позвать"), run: invite },
    ];
    const pollOk = poll.q.trim() && poll.o.filter((x) => x.trim()).length >= 2;
    const sendPoll = () => {
      if (!pollOk) return;
      const o = poll.o.map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 4);
      chat.send(poll.q.trim().slice(0, 200), { t: 'poll', o }, 'event');
      setSheet('');
    };
    const others = sorted.filter((m) => m.id !== me).map((m) => (names[m.id]?.name || _t("Участник")).split(' ')[0]);
    if (panel) {
      return (
        <div className="page wa-info">
          <div className="wa-ibar">
            <button type="button" aria-label={_t("Назад")} onClick={() => goBack(() => setPanel(false))}>←</button>
            <b>{_t("Данные круга")}</b>
          </div>
          <div className="wa-ihead">
            <span className="wa-bigav">{kindOf(kind)?.ic ?? '👥'}</span>
            <b>{cur?.title || _t("Круг")}</b>
            <small>{_tj("Круг · {0}  {1}", members.length, plural(members.length, _t("участник"), _t("участника"), _t("участников")))}{am ? _t(" · амир {0}", nm(am.id)) : ''}</small>
            <div className="wa-ibtn">
              <button type="button" onClick={invite}><span>➕</span>{_t("Позвать")}</button>
              <button type="button" onClick={() => { goBack(() => setPanel(false)); setTimeout(() => { setDuaText(''); setSheet('dua'); }, 80); }}><span>🤲</span>{_t("Дуа")}</button>
              <button type="button" onClick={() => goBack(() => setPanel(false))}><span>💬</span>{_t("Чат")}</button>
            </div>
          </div>
          {chips.length > 0 && chips[0].k !== 'n' && (
            <div className="wa-isec">
              <h4>{_t("Общие дела")}</h4>
              <div className="wa-deeds">{chips.map((c) => <button key={c.k} type="button" onClick={c.go}>{c.t}</button>)}</div>
            </div>
          )}
          <div className="wa-isec">
            <div className="cx-hero">
              <b>{_tj("{0} из {1} сегодня в деле", activeToday, members.length)}</b>
              <StreakLine members={members} today={today} />
              <small>{_tj("Вместе сегодня: {0}  {1} и {2}  {3}{4}", tdy.p, plural(tdy.p, _t("намаз"), _t("намаза"), _t("намазов")), tdy.h, plural(tdy.h, _t("привычка"), _t("привычки"), _t("привычек")), duas ? _t(" · 🤲 {0} дуа друг за друга", duas) : '')}</small>
            </div>
            {membersBlock}
          </div>
          <div className="wa-isec">
            <h3 className="ch-h">{_t("Вместе")}</h3>
            {body}
          </div>
        </div>
      );
    }
    return (
      <div className="page cx wa">
        <header className="wa-head">
          {backToList && <button type="button" className="wa-back" aria-label={_t("Назад к кругам")} onClick={backToList}>←{(() => { const n = Object.entries(chatUnread ?? {}).filter(([c]) => c !== cur?.code).reduce((a, [, v]) => a + v, 0); return n ? <em>{n > 99 ? '99+' : n}</em> : null; })()}</button>}
          <button type="button" className="wa-who" onClick={() => openPanel()}>
            <span className="wa-hav">{kindOf(kind)?.ic ?? '👥'}</span>
            <span className="wa-ht"><b>{cur?.title || _t("Круг")}</b><small>{others.length ? `${_t("Ты")}, ${others.join(', ')}` : _t("Ты")}</small></span>
          </button>
          <button type="button" className="wa-hbtn" aria-label={_t("Общие дела")} onClick={() => openPanel(chips[0]?.k === 'n' ? 'cx-goal' : undefined)}>🎯</button>
          <button type="button" className="wa-hbtn" aria-label={_t("Данные круга")} onClick={() => openPanel()}>⋮</button>
        </header>
        {isCloud && nicks && <InviteInbox />}
        {asks.list.length > 0 && <button type="button" className="wa-asks" onClick={() => { setListOn(true); window.scrollTo(0, 0); }}>{_tj("📩 {0} хочет написать тебе ›", asks.list.length === 1 ? asks.list[0].from.name : _t("{0} человека", asks.list.length))}</button>}
        <CircleChat chat={chat} me={me} names={names} members={members} reacts={reacts} today={today} isOwner={isOwner} state={state} update={update} actions={acts}
          draft={draft} onDraftUsed={() => setDraft(null)} onAmin={(asker) => { say('dua_sent'); circle.react(`a:${asker}`, '🤲', today); }} title={cur?.title || _t("Круг")} placeholder={_t("Сообщение")} other={isDm(cur?.code) ? cur?.title : undefined} />

        {sheet === 'dua' && (
          <>
            <div className="dim" onClick={() => setSheet('')} />
            <div className="sheet cx-sheet" role="dialog" aria-label={_t("Попросить дуа")}>
              <b>{_t("🤲 Попросить круг о дуа")}</b>
              <p>{_t("Коротко, о чём дуа. Увидят только люди круга, просьба держится 3 дня.")}</p>
              <textarea rows={3} maxLength={140} value={duaText} onChange={(e) => setDuaText(e.target.value)} placeholder={_t("Например: за маму, завтра операция")} autoFocus />
              <div className="cx-sheet-row">
                <button type="button" className="link-btn" onClick={() => setSheet('')}>{_t("Отмена")}</button>
                <button type="button" className="pri-btn" disabled={!duaText.trim()} onClick={() => { ask({ t: duaText.trim(), d: today }); setSheet(''); }}>{_t("Попросить")}</button>
              </div>
            </div>
          </>
        )}
        {sheet === 'poll' && (
          <>
            <div className="dim" onClick={() => setSheet('')} />
            <div className="sheet cx-sheet" role="dialog" aria-label={_t("Опрос")}>
              <b>{_t("📊 Опрос в круге")}</b>
              <input value={poll.q} maxLength={200} onChange={(e) => setPoll({ ...poll, q: e.target.value })} placeholder={_t("Вопрос, например: где читаем Коран в субботу?")} autoFocus />
              {poll.o.map((x, i) => (
                <input key={i} value={x} maxLength={40} onChange={(e) => { const o = [...poll.o]; o[i] = e.target.value; setPoll({ ...poll, o }); }} placeholder={_t("Вариант {0}", i + 1)} />
              ))}
              {poll.o.length < 4 && <button type="button" className="link-btn" onClick={() => setPoll({ ...poll, o: [...poll.o, ''] })}>{_t("+ Ещё вариант")}</button>}
              <div className="cx-sheet-row">
                <button type="button" className="link-btn" onClick={() => setSheet('')}>{_t("Отмена")}</button>
                <button type="button" className="pri-btn" disabled={!pollOk} onClick={sendPoll}>{_t("Отправить в чат")}</button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="ch-top">
        {backToList && !listOn && <button type="button" className="wa-back2" onClick={backToList}>{_t("← Круги")}</button>}
        <h1 className="page-h">{_t("Круг")}</h1>
        {isCloud && joined && <button type="button" className="ch-inv" onClick={invite}>{_t("+ Пригласить")}</button>}
      </div>

      {isCloud && (
        <div className="ch-tabs">
          {myCircles().map((c) => (
            <button key={c.code} type="button" aria-pressed={c.code === cur?.code} onClick={() => c.code !== cur?.code && switchCircle(c.code)}>
              {kindOf(c.kind)?.ic ?? '👥'} {c.title}{c.code !== cur?.code && (chatUnread?.[c.code] ?? 0) > 0 && <span className="cc-badge">{chatUnread![c.code]}</span>}
            </button>
          ))}
          <button type="button" className="ch-add" onClick={() => setAdding(true)}>{_t("+ Новый")}</button>
        </div>
      )}
      <p className="ch-sub">{cur ? <><b>{cur.title}</b>{kindInfo && kindInfo.ru !== cur.title ? ` · ${kindInfo.ru}` : ''} · </> : null}{_tj("{0}  {1} · видят только итог дня", members.length, plural(members.length, _t("человек"), _t("человека"), _t("человек")))}</p>

      {chatOn && (
        <div className="cc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'circle'} onClick={() => setView('circle')}>{_t("Круг")}</button>
          <button type="button" role="tab" aria-selected={view === 'chat'} onClick={() => openChat()}>{_t("Чат")}{view !== 'chat' && chat.unread > 0 && <span className="cc-badge">{chat.unread > 99 ? '99+' : chat.unread}</span>}</button>
        </div>
      )}
      {chatOn && view === 'chat' ? (
        <CircleChat chat={chat} me={me!} names={names} members={members} reacts={reacts} today={today} isOwner={isOwner} state={state} update={update}
          draft={draft} onDraftUsed={() => setDraft(null)} onAmin={(asker) => { say('dua_sent'); circle.react(`a:${asker}`, '🤲', today); }} title={cur?.title || _t("Круг")} />
      ) : (<>
      {body}      </>)}
    </div>
  );
}

/** Someone made dua for me today: answer with «Аамин» (a dua back) or with thanks in the right form. */
function DuaGot({ reacts, me, today, nameOf, toOf, react, sex }: { reacts: Reacts; me: string; today: string; nameOf: (id: string) => string; toOf: (id: string) => To | ''; react: (to: string, e: string) => void; sex: Sex }) {
  const from = Object.entries(reacts).filter(([f, map]) => f !== me && map?.[me]?.e === '🤲' && map[me].day === today).map(([f]) => f);
  if (!from.length) return null;
  return (
    <>
      {from.map((f) => {
        const to = toOf(f);
        const mine = reacts[me]?.[f];
        const answered = mine?.day === today && (mine.e === '🤲' || mine.e === '💚');
        const thanks = (t: To) => <button key={t} type="button" className={mine?.day === today && mine.e === '💚' ? 'on' : ''} onClick={() => { say('dua_got'); react(f, '💚'); }}>{THANKS[t].ru}{to ? '' : t === 'm' ? _t(" (брату)") : _t(" (сестре)")}</button>;
        return (
          <div className="dua-got" key={f}>
            <p>🤲 <b>{nameOf(f)}</b>{_tj("  {0} за тебя дуа сегодня.", to === 'f' ? _t("сделала") : to === 'm' ? _t("сделал") : _t("сделал(а)"))}</p>
            <div className="row">
              <button type="button" className={mine?.day === today && mine.e === '🤲' ? 'on' : ''} onClick={() => { say('dua_sent'); react(f, '🤲'); }}>{_t("Аамин, и тебе дуа")}</button>
              {to ? thanks(to) : (['m', 'f'] as To[]).map(thanks)}
            </div>
            {answered && <small>{mine!.e === '💚' ? `${g(_t("Ты ответил[/а]"), sex)}: ${THANKS[to || 'm'].ru.toLowerCase()}.` : _t("Ангел говорит и тебе: «И тебе того же».")}</small>}
          </div>
        );
      })}
    </>
  );
}
