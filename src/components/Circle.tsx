import { inRamadan } from '../rplan';
import { THANKS, g, say, type Sex, type To } from '../words';
import { sexOf } from './Words';
import type { CircleApi, Member, Reacts } from '../circle';
import { plural } from '../dates';
import type { UmrahApi } from '../umrahCircle';
import { UmrahHub } from './UmrahHub';
import type { KhatmApi } from '../khatm';
import { KhatmSection } from './Khatm';
import type { IftarApi } from '../iftar';
import { IftarSection } from './Iftar';
import { CloudSetup, CloudInvite } from './CloudCircle';
import { InviteByNick, InviteInbox } from './Nick';
import { nicksReady } from '../cloud';
import { shareInvite } from './CloudCircle';
import { isCloud, currentCircle, myCircles, switchCircle, kindOf, pendingInvite } from '../cloud';
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
import { CH_KINDS } from '../cweek';

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
}

const REACTIONS = [
  { e: '🤲', label: 'Дуа за тебя', short: 'Дуа' },
  { e: '✨', label: 'МашаАллах', short: 'МашаАллах' },
];

export function Circle({ circle, joined, today, summary, onJoin, onLeave, umrah, myReady, khatm, iftar, state, update, current, onCircleGoal, myAsk, onAsk, ch, amir, onAmir, shura, onShura, adv, giveAdv, onNikah, chatUnread }: Props) {
  const { status, me, members, reacts, names, isOwner } = circle;
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [jobs, setJobs] = useState(false);
  const [umra, setUmra] = useState(false);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [nicks, setNicks] = useState(false);
  useEffect(() => { nicksReady().then(setNicks); }, []);
  const chatCode = isCloud ? currentCircle()?.code : undefined;
  const [view, setView] = useState<'circle' | 'chat'>(() => {
    try { const c = sessionStorage.getItem('lm.chat'); if (c && c === chatCode) { sessionStorage.removeItem('lm.chat'); return 'chat'; } } catch { /* */ }
    return 'circle';
  });
  const chat = useChat(joined ? chatCode : undefined, view === 'chat');
  const [draft, setDraft] = useState<Draft | null>(null);
  const openChat = (d?: Draft) => { if (d) setDraft(d); setView('chat'); window.scrollTo(0, 0); };
  useEffect(() => {
    const f = () => { try { if (sessionStorage.getItem('lm.chat') === chatCode) { sessionStorage.removeItem('lm.chat'); setView('chat'); } } catch { /* */ } };
    window.addEventListener('lm-open-chat', f);
    return () => window.removeEventListener('lm-open-chat', f);
  }, [chatCode]);
  const invite = () => { if (!nicks) { if (isCloud && currentCircle()) shareInvite(currentCircle()!.code); return; } setInviting(true); window.scrollTo(0, 0); };
  const famKindOwner = isCloud && currentCircle()?.kind === 'family' && isOwner && !famOf(state).on;
  useEffect(() => { if (famKindOwner) update((s) => patchF(s, () => ({ on: true }))); }, [famKindOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Just created or joined a circle on the standalone site: share today's total right away.
    if (status !== 'ready' || joined) return;
    try { if (sessionStorage.getItem('lm.autojoin')) { sessionStorage.removeItem('lm.autojoin'); onJoin(); } } catch { /* */ }
  }, [status, joined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading')
    return <div className="page"><h1 className="page-h">Круг</h1><p className="page-sub">Подключаюсь…</p></div>;

  if (status === 'off' && isCloud) return <CloudSetup />;
  if (isCloud && pendingInvite() && !myCircles().some((c) => c.code === pendingInvite())) return <CloudSetup onCancel={() => { try { sessionStorage.removeItem('lm.invite'); } catch { /* */ } location.reload(); }} />;

  if (status === 'off')
    return (
      <div className="page">
        <h1 className="page-h">Круг</h1>
        <p className="page-sub">Круг работает, когда приложение открыто по ссылке claude.ai и ты вошёл в аккаунт. В этом окне он недоступен, остальные разделы работают как обычно.</p>
      </div>
    );

  const sorted = [...members].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : (b.day === today ? 1 : 0) - (a.day === today ? 1 : 0)));
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
  const chatOn = Boolean(chat.ready && joined && isCloud && !alone && me);
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
      if (c && chatOn) chat.send(`принял вызов «${CH_KINDS[c.k].short}»${c.from !== me ? ` от ${names[c.from]?.name || 'брата'}` : ''}`, { t: 'ch', k: c.k }, 'event');
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
  const nm = (id: string) => (id === me ? 'Ты' : names[id]?.name || 'Участник');
  // Who is thanked: a brother or a sister. From the profile, else from the kind of circle; unknown = ask with two buttons.
  const toOf = (id: string): To | '' => { const gd = names[id]?.gender; return gd === 'm' || gd === 'f' ? gd : kind === 'sisters' ? 'f' : kind === 'brothers' ? 'm' : ''; };

  // «Что нового»: what happened today that concerns me or the whole circle.
  const feed: { e: string; t: string }[] = [];
  if (me) {
    for (const [from, map] of Object.entries(reacts)) {
      if (from === me) continue;
      const r = map?.[me];
      if (r?.day === today && r.e !== '🤲') feed.push({ e: r.e, t: r.e === '💚' ? `${nm(from)}: ${THANKS[sexOf(state) || 'm'].ru.toLowerCase()} тебе. Ответь «${THANKS[toOf(from) || 'm'].reply}»` : `${nm(from)}: машаАллах тебе` });
      if (map?.[`n:${me}`]?.day === today) feed.push({ e: '👋', t: `${nm(from)} мягко напоминает о себе и о тебе` });
    }
  }
  for (const m of members) if (m.id !== me && m.day === today && m.prayers >= 5) feed.push({ e: '✅', t: `${nm(m.id)}: все 5 намазов сегодня` });
  for (const [host, k] of Object.entries(khatm.list)) {
    const done = Object.values(khatm.juz).reduce((n, byHost) => n + (byHost?.[host]?.done?.length ?? 0), 0);
    feed.push({ e: '📖', t: `${k.title || 'Хатм'}: прочитано ${Math.min(30, done)} из 30 джузов` });
  }
  const jobsActive = Object.keys(khatm.list).length > 0 || Object.keys(iftar.events).length > 0;
  const umraCount = Object.keys(umrah.trips).length;
  const umraGoing = Boolean(me && Object.entries(umrah.rsvp[me] ?? {}).some(([h, r]) => r.s === 'go' && umrah.trips[h]));

  const umraName = (id: string) => names[id]?.name || umrah.names[id] || khatm.names[id] || 'Участник';
  if (umra) return <UmrahHub state={state} update={update} today={today} api={umrah} nameOf={umraName} start="trip" backLabel="Круг" onExit={() => { setUmra(false); window.scrollTo(0, 0); }} />;
  if (adding) return <CloudSetup onCancel={() => setAdding(false)} />;
  if (inviting && cur) return <InviteByNick code={cur.code} onBack={() => { setInviting(false); window.scrollTo(0, 0); }} />;

  return (
    <div className="page">
      <div className="ch-top">
        <h1 className="page-h">Круг</h1>
        {isCloud && joined && <button type="button" className="ch-inv" onClick={invite}>+ Пригласить</button>}
      </div>

      {isCloud && (
        <div className="ch-tabs">
          {myCircles().map((c) => (
            <button key={c.code} type="button" aria-pressed={c.code === cur?.code} onClick={() => c.code !== cur?.code && switchCircle(c.code)}>
              {kindOf(c.kind)?.ic ?? '👥'} {c.title}{c.code !== cur?.code && (chatUnread?.[c.code] ?? 0) > 0 && <span className="cc-badge">{chatUnread![c.code]}</span>}
            </button>
          ))}
          <button type="button" className="ch-add" onClick={() => setAdding(true)}>+ Новый</button>
        </div>
      )}
      <p className="ch-sub">{cur ? <><b>{cur.title}</b>{kindInfo && kindInfo.ru !== cur.title ? ` · ${kindInfo.ru}` : ''} · </> : null}{members.length} {plural(members.length, 'человек', 'человека', 'человек')} · видят только итог дня</p>

      {chatOn && (
        <div className="cc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'circle'} onClick={() => setView('circle')}>Круг</button>
          <button type="button" role="tab" aria-selected={view === 'chat'} onClick={() => openChat()}>Чат{view !== 'chat' && chat.unread > 0 && <span className="cc-badge">{chat.unread > 99 ? '99+' : chat.unread}</span>}</button>
        </div>
      )}
      {chatOn && view === 'chat' ? (
        <CircleChat chat={chat} me={me!} names={names} members={members} reacts={reacts} today={today} isOwner={isOwner} state={state} update={update}
          draft={draft} onDraftUsed={() => setDraft(null)} onAmin={(asker) => { say('dua_sent'); circle.react(`a:${asker}`, '🤲', today); }} title={cur?.title || 'Круг'} />
      ) : (<>
      {isCloud && nicks && <InviteInbox />}
      {circle.error && <div className="warn">{circle.error}</div>}
      {circle.stale && <p className="tiny">Данные круга пока не загрузились, могут быть устаревшими.</p>}

      {!joined ? (
        <div className="join">
          <b>Присоединиться к кругу</b>
          <p>Остальные увидят: сколько привычек и намазов ты отметил сегодня. Названия привычек, заметки и мухасаба остаются только у тебя.</p>
          <button type="button" className="pri-btn big-btn" onClick={onJoin}>Присоединиться</button>
        </div>
      ) : alone && isCloud ? (
        <div className="ch-empty">
          <i>🤝</i>
          <b>Позови первого человека</b>
          <p>{kind === 'family' ? 'Жена, муж, родители, взрослые дети.' : biz ? 'Партнёр, брат с похожим делом, друг-предприниматель.' : kind === 'sisters' ? 'Подруга, сестра, соседка по мечети.' : kind === 'masjid' ? 'Братья и сёстры с урока или из мечети.' : 'Брат, друг, однокурсник.'} Вместе держаться легче, а дуа друг за друга приходят каждый день.</p>
          <button type="button" className="pri-btn big-btn" onClick={invite}>Пригласить в круг</button>
        </div>
      ) : (
        <div className={`ch-hero${biz ? ' biz' : ''}`}>
          <div className="ch-seg">
            <button type="button" aria-pressed={range === 'today'} onClick={() => setRange('today')}>Сегодня</button>
            <button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>Неделя</button>
          </div>
          <div className="ch-avs">
            {sorted.map((m) => (
              <span key={m.id} className={`ch-av${lit(m) ? ' on' : ''}`}>
                {names[m.id]?.avatarUrl ? <img src={names[m.id]!.avatarUrl} alt="" /> : <i style={{ background: names[m.id]?.color || '#1f7a4d' }}>{(names[m.id]?.name || '?').slice(0, 1).toUpperCase()}</i>}
                <small>{m.id === me ? 'Ты' : (names[m.id]?.name || 'Участник').split(' ')[0]}</small>
              </span>
            ))}
          </div>
          {range === 'today' ? (
            <>
              <b>{activeToday} из {members.length} сегодня в деле</b>
              <StreakLine members={members} today={today} />
              {biz && bizLine(members, today) && <small className="bz-hl">{bizLine(members, today)}</small>}
              <small>Вместе сегодня: {tdy.p} {plural(tdy.p, 'намаз', 'намаза', 'намазов')} и {tdy.h} {plural(tdy.h, 'привычка', 'привычки', 'привычек')}{duas ? ` · 🤲 ${duas} дуа друг за друга` : ''}</small>
            </>
          ) : (
            <>
              <b>{wk.p} {plural(wk.p, 'намаз', 'намаза', 'намазов')} за неделю</b>
              <small>И {wk.h} {plural(wk.h, 'привычка', 'привычки', 'привычек')}. Общий счёт, без рейтинга: каждый добавляет свой свет.</small>
            </>
          )}
        </div>
      )}

      {joined && !(alone && isCloud) && (
        <>
          <WeekSummary members={members} reacts={reacts} me={me} today={today} title={cur?.title || 'Круг'} nameOf={(id) => names[id]?.name || 'Участник'} onSet={onCircleGoal} />
          <CircleGoal members={members} reacts={reacts} me={me} today={today} title={cur?.title || 'Круг'} nameOf={nm} onSet={onCircleGoal} />
          {me && <AmirCard members={members} me={me} today={today} nameOf={nm} amir={amir} onAmir={onAmir} />}
          {biz && me && <ShuraCard members={members} reacts={reacts} me={me} today={today} nameOf={nm} shura={shura} onShura={onShura} adv={adv} give={giveAdv} react={(k, e) => circle.react(k, e, today)} />}
        </>
      )}

      {joined && feed.length > 0 && (
        <>
          <h3 className="ch-h">Что нового</h3>
          <div className="ch-feed">{feed.slice(0, 5).map((f, i) => <div key={i}><em>{f.e}</em><span>{f.t}</span></div>)}</div>
        </>
      )}

      {joined && biz && <BizHabitsOffer state={state} update={update} today={today} />}
      {joined && me && !(alone && isCloud) && <DuaAsks members={members} reacts={reacts} me={me} today={today} nameOf={nm} myAsk={myAsk} onAsk={ask} react={(k) => { say('dua_sent'); circle.react(k, '🤲', today); }}
        biz={biz} extra={biz || chatOn ? duaExtra : undefined} />}
      {joined && me && isCloud && cur && !alone && <NikahInCircle code={cur.code} me={me} reacts={reacts} today={today} react={(k) => { say('dua_sent'); circle.react(k, '🤲', today); }} onOpenMine={() => onNikah?.()} />}
      {joined && me && !(alone && isCloud) && <Challenges members={members} me={me} today={today} nameOf={nm} ch={ch2} />}
      {joined && me && <DuaGot reacts={reacts} me={me} today={today} nameOf={nm} toOf={toOf} react={(to, e) => circle.react(to, e, today)} sex={sexOf(state)} />}
      {joined && familyKind && <FamilySection state={state} update={update} circle={circle} today={today} current={current} />}
      {joined && isOwner && !isCloud && !members.some((m) => m.fam) && (
        <div className="fam-on">
          <b>Это ваша семья?</b>
          <p>Включите семейный круг: намаз вместе дома, детские профили с наклейками, общий семейный сад и семейное обещание.</p>
          <button type="button" className="pri-btn" onClick={() => update((s) => patchF(s, () => ({ on: true })))}>Сделать круг семейным</button>
        </div>
      )}

      {joined && inRamadan(today) && members.length > 1 && (() => {
        const fasting = members.filter((m) => m.day === today && m.fast).length;
        return <div className="rm-together"><span aria-hidden="true">🌙</span><span>Постимся вместе: <b>{fasting}</b> из {members.length} сегодня</span></div>;
      })()}
      {members.length > 0 && !(alone && isCloud) && (
        <>
          <h3 className="ch-h">{familyKind ? 'Взрослые' : 'Участники'} <small>{members.length}</small></h3>
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
                  <div className="ch-mt">
                    {p?.avatarUrl ? <img className="ava" src={p.avatarUrl} alt="" /> : <span className="ava ch-ava" style={{ background: p?.color }}>{(p?.name || '?').slice(0, 1).toUpperCase()}</span>}
                    <span>
                      <b>{isMe ? `${p?.name || 'Ты'} (ты)` : p?.name || 'Участник'}</b>
                      <small>{fresh ? `Намазы ${m.prayers}/5 · ${biz && m.biz?.t ? `дела ${m.biz.d}/${m.biz.t} · ` : ''}привычки ${m.done}/${m.total}${m.fast ? ' · постится ✓' : ''}` : 'Сегодня ещё не отмечался'}</small>
                      {(m.goals ?? []).map((g) => <small key={g.t} className="m-goal">🎯 {g.t} · {g.p}%</small>)}
                    </span>
                    {Object.keys(got).length > 0 && <em className="ch-got">{Object.entries(got).map(([e, n]) => `${e} ${n}`).join('  ')}</em>}
                  </div>
                  {fresh && m.total > 0 && <span className="ch-bar"><i style={{ width: `${(m.done / m.total) * 100}%` }} /></span>}
                  {!isMe && joined && (
                    <div className="ch-acts">
                      {REACTIONS.map((r) => {
                        const on = mine?.e === r.e && mine.day === today;
                        return <button key={r.e} type="button" aria-pressed={on} onClick={() => { if (!on) say(r.e === '🤲' ? 'dua_sent' : 'masha_sent'); circle.react(m.id, r.e, today); }}>{r.e} {r.short}{on ? ' ✓' : ''}</button>;
                      })}
                      {chatOn && <button type="button" aria-label={`Написать ${p?.name || 'участнику'} в чате`} onClick={() => openChat({ text: `${(p?.name || '').split(' ')[0]}, `, ref: null })}>💬</button>}
                      {empty && <button type="button" className="nd" aria-pressed={nudged} onClick={() => { if (!nudged) say('nudge_sent'); circle.nudge(m.id, today); }}>{nudged ? '👋 Отправлено' : '👋 Подтолкнуть'}</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {joined && (
        <>
          <h3 className="ch-h">Общие дела</h3>
          <button type="button" className="um-entry" onClick={() => { setUmra(true); window.scrollTo(0, 0); }}>
            <span className="um-ic">🕋</span>
            <span><b>Умра</b><small>{umraCount ? `${umraCount} ${plural(umraCount, 'поездка', 'поездки', 'поездок')} · ${umraGoing ? 'ты едешь' : 'открой, чтобы присоединиться'}` : 'Собрать группу, сэкономить и поехать вместе'}</small></span>
            <i aria-hidden="true">›</i>
          </button>
          {(jobsActive || jobs) ? (
            <>
              <IftarSection api={iftar} today={today} nameOf={(id) => names[id]?.name || iftar.names[id] || 'Участник'} />
              <KhatmSection api={khatm} today={today} nameOf={(id) => names[id]?.name || khatm.names[id] || umrah.names[id] || 'Участник'} />
            </>
          ) : (
            <button type="button" className="ch-new" onClick={() => setJobs(true)}>+ Начать общее дело: хатм{kind === 'family' || kind === 'masjid' ? ', ифтар' : ''}</button>
          )}
        </>
      )}

      <p className="ch-priv">🔒 В круге видят только итог дня{biz ? ' и то, чем ты сам поделился в шуре. Суммы денег не видны никогда' : '. Названия привычек, заметки и мухасаба остаются у тебя'}.</p>
      {isCloud && <CloudInvite isOwner={isOwner} />}
      {!isCloud && isOwner && (
        <div className="invite">
          <b>Как пригласить</b>
          <p>Открой меню «Поделиться» у этой страницы на claude.ai и добавь человека с уровнем «Участник» (Contributor). Он откроет ту же ссылку и нажмёт «Присоединиться».</p>
        </div>
      )}
      {joined && isOwner && members.some((m) => m.fam) && kind !== 'family' && (
        <button type="button" className="link-btn" onClick={() => { if (confirm('Выключить семейный режим? Детские профили останутся на этом телефоне.')) update((s) => patchF(s, () => ({ on: false }))); }}>Выключить семейный режим</button>
      )}
      {joined && !isCloud && <button type="button" className="danger" onClick={onLeave}>Выйти из круга</button>}
      </>)}
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
        const thanks = (t: To) => <button key={t} type="button" className={mine?.day === today && mine.e === '💚' ? 'on' : ''} onClick={() => { say('dua_got'); react(f, '💚'); }}>{THANKS[t].ru}{to ? '' : t === 'm' ? ' (брату)' : ' (сестре)'}</button>;
        return (
          <div className="dua-got" key={f}>
            <p>🤲 <b>{nameOf(f)}</b> {to === 'f' ? 'сделала' : to === 'm' ? 'сделал' : 'сделал(а)'} за тебя дуа сегодня.</p>
            <div className="row">
              <button type="button" className={mine?.day === today && mine.e === '🤲' ? 'on' : ''} onClick={() => { say('dua_sent'); react(f, '🤲'); }}>Аамин, и тебе дуа</button>
              {to ? thanks(to) : (['m', 'f'] as To[]).map(thanks)}
            </div>
            {answered && <small>{mine!.e === '💚' ? `${g('Ты ответил[/а]', sex)}: ${THANKS[to || 'm'].ru.toLowerCase()}.` : 'Ангел говорит и тебе: «И тебе того же».'}</small>}
          </div>
        );
      })}
    </>
  );
}
