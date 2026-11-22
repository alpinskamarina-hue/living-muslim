import { TrSettings } from './TrText';
import { inRamadan } from '../rplan';
import { THANKS, g, say, type Sex, type To } from '../words';
import { sexOf } from './Words';
import type { CircleApi, Member, Reacts } from '../circle';
import { Ic, IcT, Rx } from './LIcon';
import { plural } from '../dates';
import type { UmrahApi } from '../umrahCircle';
import { lazyNamed } from '../lazy';
const UmrahHub = lazyNamed(() => import('./UmrahHub').then((m) => m.UmrahHub));
import type { HubTab } from './UmrahHub';
import { UmrahBanner, umrahCall } from './UmrahBanner';
import type { KhatmApi } from '../khatm';
import { KhatmSection } from './Khatm';
import type { IftarApi } from '../iftar';
import { IftarSection } from './Iftar';
import { CloudSetup, CloudInvite } from './CloudCircle';
import { AsksBox } from './Person';
import { InviteByNick, InviteInbox } from './Nick';
import { nicksReady, meRpc, serverHas, leaveCircle, cloudMe } from '../cloud';
import { shareInvite } from './CloudCircle';
import { isCloud, currentCircle, myCircles, switchCircle, kindOf, pendingInvite, isDm, renameCircle, rootOf, suffixOf, circleTitle, SUFFIX_MAX } from '../cloud';
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
import { OpenOwnerBox, OpenChatNote } from './OpenCircles';
import { useOpenReady, openMe } from '../openCircles';
import { usePostsReady, usePosts, postSeen } from '../posts';
import { PostFeed, PinBar } from './Posts';
import { openPerson, personOk, usePersonReady, useAsks } from '../person';
import { useRef } from 'react';
import { CH_KINDS, CH_DAYS, goalFor, circleTotals, valOf, weekStart, amirOf } from '../cweek';
import { addDays } from '../dates';
import { _t, _tj } from '../i18n';
import { CircleCourse } from './CircleCourse';
import type { CCourse } from '../courseSocial';
import { useBiz, useBizWorkReady, syncPlans } from '../bizWork';
import { StartupPane } from './Startup';
import { useStartup, useStartupReady } from '../startup';
import { StudyPane, StudyLessons } from './Study';
import { useStudy, useStudyReady, revFromSubs, syncHomework, hasPlan } from '../study';
import { BizTabs, BizTasks, BizCalendar, BizPlanPane, BizSheet, guessDay, type BizTab, type BizDraft } from './BizWork';

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

/** An invite link (?c=) opens its circle once; later visits to the tab start on the list. */
let cLinkUsed = false;

export function Circle({ circle, joined, today, summary, onJoin, onLeave, umrah, myReady, khatm, iftar, state, update, current, onCircleGoal, myAsk, onAsk, ch, amir, onAmir, shura, onShura, adv, giveAdv, onNikah, chatUnread, onCC, onOpenCourse }: Props) {
  const { status, me, members, reacts, names, isOwner } = circle;
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [nameEdit, setNameEdit] = useState<string | null>(null);
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
  const openOn = useOpenReady();
  const asks = useAsks(personOn && isCloud);
  const [listOn, setListOn] = useState(() => {
    if (!isCloud || !myCircles().length) return false;
    try { if (sessionStorage.getItem('lm.asksGo') || sessionStorage.getItem('lm.commonGo')) return true; } catch { /* */ }
    try { if (sessionStorage.getItem('lm.chat') === chatCode || (!cLinkUsed && new URLSearchParams(location.search).get('c')) || sessionStorage.getItem('lm.umrahGo') || sessionStorage.getItem('lm.autojoin')) return false; } catch { /* */ }
    return true;
  });
  useEffect(() => () => { cLinkUsed = true; }, []);
  useEffect(() => {
    const f = () => { if (isCloud && myCircles().length) setListOn(true); };
    window.addEventListener('lm-open-asks', f);
    return () => window.removeEventListener('lm-open-asks', f);
  }, []);
  const depth = useRef(0);
  const pushNav = () => { try { history.pushState({ lm: 'circle' }, ''); depth.current++; } catch { /* */ } };
  const goBack = (fallback: () => void) => { if (depth.current > 0) history.back(); else fallback(); };
  const [view, setView] = useState<'circle' | 'chat'>(() => {
    try { const c = sessionStorage.getItem('lm.chat'); if (c && c === chatCode) { sessionStorage.removeItem('lm.chat'); return 'chat'; } } catch { /* */ }
    return 'circle';
  });
  const [cxOn, setCxOn] = useState(false);
  // «open» marks messages as read, so it must stay off while the list of circles is on screen:
  // otherwise the current circle's new messages were read silently and its number never showed.
  const listShown = listOn && isCloud && myCircles().length > 0;
  // business circle: tabs Чат · Дела · Календарь · План (supabase/biz-work.sql)
  const isSu = currentCircle()?.kind === 'startup';
  // study circle: tabs Чат · Учёба · Занятия (supabase/study.sql + biz-work.sql for the lessons)
  const isSt = currentCircle()?.kind === 'study';
  const bizBase = useBizWorkReady(Boolean(isCloud && joined && (currentCircle()?.kind === 'biz' || isSu || isSt)));
  const stOn = useStudyReady(bizBase && isSt);
  const bizOn = bizBase && (!isSt || stOn);
  const suOn = useStartupReady(bizOn && isSu);
  const [bizTab, setBizTab] = useState<BizTab>('chat');
  const [bizDraft, setBizDraft] = useState<BizDraft | null>(null);
  useEffect(() => { setBizTab('chat'); }, [chatCode]);
  const bizApi = useBiz(chatCode, bizOn && !listShown);
  const suApi = useStartup(chatCode, suOn && !listShown);
  const stApi = useStudy(chatCode, stOn && !listShown);
  // a new study circle opens on «Учёба», where the circle picks what it learns
  useEffect(() => {
    if (!stApi.data || hasPlan(stApi.data.state.plan) || !chatCode) return;
    try { if (sessionStorage.getItem(`lm.stsetup.${chatCode}`)) return; sessionStorage.setItem(`lm.stsetup.${chatCode}`, '1'); } catch { /* */ }
    setBizTab('path');
  }, [Boolean(stApi.data), chatCode]); // eslint-disable-line react-hooks/exhaustive-deps
  // the teacher's marks change my revision; my homework deadlines go into my «Планы»
  const stKey = stApi.data ? `${stApi.data.subs.map((x) => `${x.id}${x.status}`).join()}|${stApi.data.tasks.map((t) => `${t.id}${t.due}${t.due_p}${t.title}`).join()}` : '';
  useEffect(() => {
    const d = stApi.data; const me0 = cloudMe()?.uid;
    if (!d || !chatCode || !me0) return;
    const mine = d.prog.find((x) => x.uid === me0);
    const rev = revFromSubs(mine?.rev ?? {}, d.subs, me0);
    if (rev) void stApi.prog({ rev });
    update((s) => syncHomework(s, chatCode, currentCircle()?.title || _t("Учёба"), d, me0, today) ?? s);
  }, [stKey, chatCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const bizEvKey = (bizApi.data?.events ?? []).map((e) => `${e.id}${e.day}${e.at}${e.after_p}${e.title}`).join('|');
  useEffect(() => {
    if (!bizApi.data || !chatCode) return;
    const title = currentCircle()?.title || _t("Бизнес");
    update((s) => syncPlans(s, chatCode, title, bizApi.data!.events, today, isSt) ?? s);
  }, [bizEvKey, chatCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const chat = useChat(joined ? chatCode : undefined, !listShown && (!bizOn || bizTab === 'chat') && (view === 'chat' || (cxOn && !panel)));
  // Posts: a «Чат · Посты» switch once the circle has posts or I may write them. Only in circles of the kind «Своё»:
  // the ready-made kinds (brothers, sisters, business, study…) have their own tools and stay without posts (22.11, Nasim).
  const postsOn = usePostsReady();
  const postCircle = Boolean(postsOn && joined && chatCode && !isDm(chatCode) && !bizOn && currentCircle()?.kind === 'other');
  const posts = usePosts(postCircle && !listShown, postCircle ? chatCode! : null);
  const [ptab, setPtab] = useState<'chat' | 'posts'>('chat');
  const [ocOpen, setOcOpen] = useState(false);
  useEffect(() => { setPtab('chat'); }, [chatCode]);
  useEffect(() => { if (posts.d?.can && chatCode) openMe(chatCode).then((r) => setOcOpen(Boolean(r?.open))); }, [posts.d?.can, posts.d?.posts.length, chatCode, ptab]);
  const goPost = (id?: number) => {
    setPtab('posts'); window.scrollTo(0, 0);
    if (id) setTimeout(() => { const el = document.querySelector(`.ps-card[data-id="${id}"]`); el?.scrollIntoView({ block: 'center' }); el?.classList.add('cx-flash'); setTimeout(() => el?.classList.remove('cx-flash'), 1600); }, 300);
  };
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

  // «N просятся в круг» on the list of circles opens the requests here.
  useEffect(() => {
    if (!openOn || status !== 'ready' || !chatCode || listShown) return;
    try {
      if (sessionStorage.getItem('lm.ocOwn') !== chatCode) return;
      sessionStorage.removeItem('lm.ocOwn');
    } catch { return; }
    setTimeout(() => { const el = document.getElementById('oc-own'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); else openPanel('oc-own'); }, 600);
  }, [openOn, status, chatCode, listShown]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading')
    return <div className="page"><h1 className="page-h">{_t("Круг")}</h1><p className="page-sub">{_t("Подключаюсь…")}</p></div>;

  if (status === 'off' && isCloud) return asks.list.length ? <><div className="page"><AsksBox list={asks.list} reload={asks.reload} /></div><CloudSetup /></> : <CloudSetup />;
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
  const bizPeople = [me, ...members.map((m) => m.id).filter((id) => id !== me && !gone.includes(id))].filter(Boolean) as string[];
  const bizCommon = { api: bizApi, me: me ?? '', names, people: bizPeople, state, today, onDraft: (d: BizDraft) => setBizDraft(d) };
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
  // A personal call to an umrah trip waiting for my answer, and opening a trip from the chat or the strip
  // (not answered yet: «Сейчас» opens with «Еду» on top; already going: the group).
  const uCall = joined ? umrahCall(umrah, reacts, today) : null;
  const openTrip = (host: string) => { try { sessionStorage.setItem('lm.umHost', host); } catch { /* */ } setUmra(me && umrah.rsvp[me]?.[host]?.s === 'go' ? 'trip' : 'now'); window.scrollTo(0, 0); };
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

  const umraName = (id: string) => names[id]?.name || umrah.names[id] || khatm.names[id] || _t("Участник");
  if (umra) return <UmrahHub state={state} update={update} today={today} api={umrah} nameOf={umraName} start={umra} circle={circle} joined={joined} backLabel={_t("Круг")} onExit={() => { setUmra(false); window.scrollTo(0, 0); }} />;
  if (adding) return <CloudSetup onCancel={() => setAdding(false)} />;
  if (inviting && cur) return <InviteByNick code={cur.code} onBack={() => { setInviting(false); window.scrollTo(0, 0); }} />;
  if (listOn && isCloud && myCircles().length && !kicked)
    return <CircleList state={state} me={me} unread={chatUnread ?? {}} members={members} names={names} today={today} onNew={() => setAdding(true)}
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
                    {(m.goals ?? []).map((g) => <small key={g.t} className="m-goal"><Ic e="goal" cls="lead" />{g.t} · {g.p}%</small>)}
                  </span>
                  {Object.keys(got).length > 0 && <em className="ch-got">{Object.entries(got).map(([e, n]) => `${e} ${n}`).join('  ')}</em>}
                </div>
                {fresh && m.total > 0 && <span className="ch-bar"><i style={{ width: `${(m.done / m.total) * 100}%` }} /></span>}
                {!isMe && joined && (!cx || openM === m.id) && (
                  <div className="ch-acts">
                    {REACTIONS.map((r) => {
                      const on = mine?.e === r.e && mine.day === today;
                      return <button key={r.e} type="button" aria-pressed={on} onClick={() => { if (!on) say(r.e === '🤲' ? 'dua_sent' : 'masha_sent'); circle.react(m.id, r.e, today); }}><Rx e={r.e} /> {r.short}{on ? ' ✓' : ''}</button>;
                    })}
                    {personOk() && <button type="button" onClick={() => openPerson(m.id)}>{_t("👤 Профиль")}</button>}
                    {chatOn && <button type="button" aria-label={_t("Написать {0} в чате", p?.name || _t("участнику"))} onClick={() => openChat({ text: `${(p?.name || '').split(' ')[0]}, `, ref: null })}>💬</button>}
                    {kickOn && <button type="button" className="kick" onClick={() => kick(m.id, p?.name || _t("участника"))}>{_t("Убрать из круга")}</button>}
                    {empty && <button type="button" className="nd" aria-pressed={nudged} onClick={() => { if (!nudged) say('nudge_sent'); circle.nudge(m.id, today); }}><IcT t={nudged ? _t("👋 Отправлено") : _t("👋 Подтолкнуть")} /></button>}
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
          {openOn && cur && !isDm(cur.code) && <OpenOwnerBox code={cur.code} kind={kind} />}
          {postCircle && posts.d?.can && (
            <div className="ps-solo">
              <div className="oc-lbl">{_t("Посты круга")}</div>
              <p className="tiny">{ocOpen ? _t("Посты «видят все» показываются в «Найти круг»: по ним видно, что круг живой.") : _t("Пост это объявление амира: его не уносит лентой, его можно закрепить. Участники увидят его, когда придут.")}</p>
              <PostFeed code={chatCode!} api={posts} open={ocOpen} seenKey={chatCode!} empty="" />
            </div>
          )}
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
          <div className="ch-feed">{feed.slice(0, 5).map((f, i) => <div key={i}><em><Rx e={f.e} /></em><span>{f.t}</span></div>)}</div>
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
    if (am) chips.push({ k: 'a', t: _t("👑 Амир: {0}", nm(am.id).split(' ')[0]), go: () => openPanel('cx-amir') });
    if (!chips.length) chips.push({ k: 'n', t: _t("＋ Начать общее дело"), go: () => openPanel('cx-goal') });
    const acts = [
      { ic: 'dua', c: '#25a55f', label: _t("Дуа"), run: () => { setDuaText(''); setSheet('dua'); } },
      { ic: 'poll', c: '#02a698', label: _t("Опрос"), run: () => { setPoll({ q: '', o: ['', ''] }); setSheet('poll'); } },
      { ic: 'goal', c: '#1f7aec', label: _t("Цель недели"), run: () => openPanel('cx-goal') },
      { ic: 'challenge', c: '#e8763a', label: _t("Вызов"), run: () => openPanel('cx-ch') },
      { ic: 'khatm', c: '#11553a', label: kind === 'family' || kind === 'masjid' ? _t("Хатм, ифтар") : _t("Хатм"), run: () => { setJobs(true); openPanel('cx-deeds'); } },
      { ic: 'umrah', c: '#b88a2c', label: _t("Умра"), run: () => { setUmra('trip'); window.scrollTo(0, 0); } },
      { ic: 'amir', c: '#c79a1e', label: _t("Амир"), run: () => openPanel('cx-amir') },
      { ic: 'invite', c: '#54656f', label: _t("Позвать"), run: invite },
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
            <span className="wa-bigav"><Ic e={kindOf(kind)?.ic ?? '👥'} /></span>
            {nameEdit === null ? (
              <b className="wa-iname">{cur?.title || _t("Круг")}{cur && !isDm(cur.code) && <button type="button" className="wa-ren" aria-label={_t("Изменить название")} onClick={() => setNameEdit(suffixOf(cur.title, kind))}>✎</button>}</b>
            ) : (
              <form className="wa-renf" onSubmit={(e) => { e.preventDefault(); if (cur) { renameCircle(cur.code, circleTitle(kind, nameEdit), kind); } setNameEdit(null); }}>
                <span className={`cl-name${rootOf(kind) ? ' has-root' : ''}`}>
                  {rootOf(kind) && <em className="cl-root">{rootOf(kind)} ·</em>}
                  <input autoFocus value={nameEdit} maxLength={SUFFIX_MAX(kind)} placeholder={rootOf(kind) ? _t("своё к названию") : _t("Название")} onChange={(e) => setNameEdit(e.target.value)} />
                </span>
                {rootOf(kind) && <small>{_tj("«{0}» встроено и не меняется. Меняется только твоя часть.", rootOf(kind))}</small>}
                <span className="wa-renb"><button type="button" className="ghost-btn" onClick={() => setNameEdit(null)}>{_t("Отмена")}</button><button type="submit" className="pri-btn">{_t("Сохранить")}</button></span>
              </form>
            )}
            <small>{_tj("Круг · {0}  {1}", members.length, plural(members.length, _t("участник"), _t("участника"), _t("участников")))}{am ? _t(" · амир {0}", nm(am.id)) : ''}</small>
            <div className="wa-ibtn">
              <button type="button" onClick={invite}><span><Ic e="invite" /></span>{_t("Позвать")}</button>
              <button type="button" onClick={() => { goBack(() => setPanel(false)); setTimeout(() => { setDuaText(''); setSheet('dua'); }, 80); }}><span><Ic e="dua" /></span>{_t("Дуа")}</button>
              <button type="button" onClick={() => goBack(() => setPanel(false))}><span><Ic e="chat" /></span>{_t("Чат")}</button>
            </div>
          </div>
          {openOn && cur && !isDm(cur.code) && <OpenOwnerBox code={cur.code} kind={kind} />}
          {cur && <TrSettings code={cur.code} />}
          {chips.length > 0 && chips[0].k !== 'n' && (
            <div className="wa-isec">
              <h4>{_t("Общие дела")}</h4>
              <div className="wa-deeds">{chips.map((c) => <button key={c.k} type="button" onClick={c.go}><IcT t={c.t} /></button>)}</div>
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
            <span className="wa-hav"><Ic e={kindOf(kind)?.ic ?? '👥'} /></span>
            <span className="wa-ht"><b>{cur?.title || _t("Круг")}</b><small>{others.length ? `${_t("Ты")}, ${others.join(', ')}` : _t("Ты")}</small></span>
          </button>
          <button type="button" className="wa-hbtn" aria-label={_t("Общие дела")} onClick={() => openPanel(chips[0]?.k === 'n' ? 'cx-goal' : undefined)}><Ic e="goal" /></button>
          <button type="button" className="wa-hbtn" aria-label={_t("Данные круга")} onClick={() => openPanel()}>⋮</button>
        </header>
        {isCloud && nicks && <InviteInbox />}
        {asks.list.length > 0 && <button type="button" className="wa-asks" onClick={() => { setListOn(true); window.scrollTo(0, 0); }}>{_tj("📩 {0} хочет написать тебе ›", asks.list.length === 1 ? asks.list[0].from.name : _t("{0} человека", asks.list.length))}</button>}
        {uCall && (
          <button type="button" className="um-call" onClick={() => openTrip(uCall.h)}>
            <i aria-hidden="true">🕋</i>
            <span><small>{_tj("{0} зовёт тебя на умру", nm(uCall.c))}</small><b>{umrah.trips[uCall.h]?.title || _t("Умра")}</b></span>
            <em>{_t("Открыть ›")}</em>
          </button>
        )}
        {bizOn && <BizTabs startup={suOn} study={isSt} tab={bizTab} onTab={(t) => { setBizTab(t); window.scrollTo(0, 0); }} counts={{ tasks: (bizApi.data?.tasks ?? []).filter((t) => t.owner === me && t.status !== 'done' && (!t.due || t.due <= today)).length,
          path: isSt && stApi.data ? (stApi.data.me.teacher || !stApi.data.state.teachers.length ? stApi.data.subs.filter((x) => x.status === 'wait' && x.uid !== me).length : 0) + (stApi.data.quiz && !stApi.data.quiz.mine ? 1 : 0) : 0 }} />}
        {postCircle && posts.d && (posts.d.can || posts.d.posts.length > 0) && (() => {
          const seen = postSeen(chatCode!);
          const n = posts.d.posts.filter((p) => p.at > seen && p.uid !== me && !p.later).length;
          return (
            <div className="bw-tabs ps-ctabs" role="tablist">
              <button type="button" role="tab" aria-selected={ptab === 'chat'} onClick={() => setPtab('chat')}>{_t("Чат")}</button>
              <button type="button" role="tab" aria-selected={ptab === 'posts'} onClick={() => goPost()}>{_t("Посты")}{n > 0 && ptab !== 'posts' && <em>{n}</em>}</button>
            </div>
          );
        })()}
        {postCircle && ptab === 'chat' && (() => { const pin = posts.d?.posts.find((p) => p.pinned); return pin ? <PinBar post={pin} onOpen={() => goPost(pin.id)} /> : null; })()}
        {postCircle && ptab === 'posts' ? (
          <PostFeed code={chatCode!} api={posts} open={ocOpen} seenKey={chatCode!} empty={_t("Постов пока нет. Пост это объявление амира: его не уносит лентой, его можно закрепить.")} />
        ) : bizOn && bizTab !== 'chat' && me ? (
          isSt && me ? (bizTab === 'path'
            ? <StudyPane st={stApi} chat={chat} me={me} names={names} people={bizPeople} today={today} state={state} update={update}
              post={(b) => { if (chatOn) chat.send(b.slice(0, 300), null, 'event'); }} toChat={() => { setBizTab('chat'); window.scrollTo(0, 0); }} />
            : <StudyLessons st={stApi} chat={chat} me={me} names={names} people={bizPeople} today={today} state={state} update={update}
              post={(b) => { if (chatOn) chat.send(b.slice(0, 300), null, 'event'); }} toChat={() => { setBizTab('chat'); window.scrollTo(0, 0); }}
              calendar={<BizCalendar {...bizCommon} study />} />)
          : bizTab === 'path' && suOn ? <StartupPane su={suApi} biz={bizApi} me={me} names={names} people={bizPeople} today={today} msgs={chat.msgs} code={chatCode} transcribe={chat.transcribe}
            post={(b) => { if (chatOn) chat.send(b.slice(0, 300), null, 'event'); }} toChat={() => { setBizTab('chat'); window.scrollTo(0, 0); }} />
            : bizTab === 'tasks' ? <BizTasks {...bizCommon} />
            : bizTab === 'cal' ? <BizCalendar {...bizCommon} />
              : <BizPlanPane {...bizCommon} />
        ) : (
        <CircleChat notice={openOn ? <OpenChatNote code={chatCode} /> : undefined} onPost={postCircle ? goPost : undefined} chat={chat} me={me} names={names} members={members} reacts={reacts} today={today} isOwner={isOwner} state={state} update={update} actions={acts}
          draft={draft} onDraftUsed={() => setDraft(null)} onAmin={(asker) => { say('dua_sent'); circle.react(`a:${asker}`, '🤲', today); }} title={cur?.title || _t("Круг")} placeholder={_t("Сообщение")} other={isDm(cur?.code) ? cur?.title : undefined} onUmrah={openTrip}
          biz={bizOn && !isSt ? {
            make: (k, m) => {
              const text = m.body.replace(/\s+/g, ' ').trim();
              if (k === 'dec') setBizDraft({ k: 'dec', body: text.slice(0, 300), msg: m.id });
              else if (k === 'task') setBizDraft({ k: 'task', title: text.slice(0, 140), owner: m.uid, msg: m.id, ...(() => { const g = guessDay(text, today); return { due: g.day ?? null, due_p: g.after_p ?? null }; })() });
              else { const g = guessDay(text, today); setBizDraft({ k: 'event', title: text.slice(0, 120), day: g.day ?? today, at: g.at ?? null, after_p: g.after_p ?? null, msg: m.id }); }
            },
            open: (k) => setBizTab(k === 'task' ? 'tasks' : k === 'event' ? 'cal' : suOn ? 'path' : 'plan'),
          } : undefined} />
        )}
        {bizDraft && me && (
          <BizSheet study={isSt} draft={bizDraft} api={bizApi} me={me} names={names} people={bizPeople} state={state} today={today} onClose={() => setBizDraft(null)}
            onSaved={(k, id, title, isNew, extra) => {
              if (!isNew || !chatOn) return;
              const body = k === 'task' ? _tj("📋 Новое дело: «{0}»{1}", title, extra ? ` · ${extra}` : '') : k === 'event' ? (isSt ? _tj("📅 Занятие: «{0}» · {1}", title, extra) : _tj("📅 Встреча: «{0}» · {1}", title, extra)) : _tj("✅ Решение: {0}", title);
              chat.send(body.slice(0, 300), { t: 'bz', k: k === 'task' ? 't' : k === 'event' ? 'e' : 'd', bz: id }, 'event');
            }} />
        )}

        {sheet === 'dua' && (
          <>
            <div className="dim" onClick={() => setSheet('')} />
            <div className="sheet cx-sheet" role="dialog" aria-label={_t("Попросить дуа")}>
              <b><IcT t={_t("🤲 Попросить круг о дуа")} /></b>
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
              <Ic e={kindOf(c.kind)?.ic ?? '👥'} cls="lead" />{c.title}{c.code !== cur?.code && (chatUnread?.[c.code] ?? 0) > 0 && <span className="cc-badge">{chatUnread![c.code]}</span>}
            </button>
          ))}
          <button type="button" className="ch-add" onClick={() => setAdding(true)}>{_t("+ Новый")}</button>
        </div>
      )}
      <p className="ch-sub">{cur ? <><b>{cur.title}</b>{kindInfo && !cur.title.startsWith(kindInfo.ru) ? ` · ${kindInfo.ru}` : ''} · </> : null}{_tj("{0}  {1} · видят только итог дня", members.length, plural(members.length, _t("человек"), _t("человека"), _t("человек")))}</p>

      {chatOn && (
        <div className="cc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'circle'} onClick={() => setView('circle')}>{_t("Круг")}</button>
          <button type="button" role="tab" aria-selected={view === 'chat'} onClick={() => openChat()}>{_t("Чат")}{view !== 'chat' && chat.unread > 0 && <span className="cc-badge">{chat.unread > 99 ? '99+' : chat.unread}</span>}</button>
        </div>
      )}
      {chatOn && view === 'chat' ? (
        <CircleChat chat={chat} me={me!} names={names} members={members} reacts={reacts} today={today} isOwner={isOwner} state={state} update={update}
          draft={draft} onDraftUsed={() => setDraft(null)} onAmin={(asker) => { say('dua_sent'); circle.react(`a:${asker}`, '🤲', today); }} title={cur?.title || _t("Круг")} onUmrah={openTrip} />
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
