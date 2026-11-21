import { QuitCheck, QuitScreen, type QuitView } from './components/Quit';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { WordCard, WordsLayer } from './components/Words';
import { todayTrigger, useWordsWatch } from './wordsWatch';
import { say } from './words';
import { isCloud, currentCircle, myCircles, switchCircle } from './cloud';
import { useChatUnread } from './chat';
import type { Anchor, AppState, Habit } from './types';
import { useAppState } from './store';
import { dayKey, addDays, fromKey, plural } from './dates';
import { prayerTimes, windowState } from './prayer';
import { workoutRings } from './health';
import { AdhanPlayer, AdhanToast, useAdhanClock } from './components/Adhan';
import { adhanServer } from './adhan';
import { Today } from './components/Today';
import { PlansPage, usePlansCloud, setPlanStart } from './components/Plans';
import { HabitSheet } from './components/HabitSheet';
import { Practice } from './components/Practice';
import { Progress } from './components/Progress';
import { Profile } from './components/Profile';
import { syncPush, setNudge, nudgeOf, setPings } from './push';
import { planRings } from './plans';
import { effectiveTheme, themeMode, setCurrentTheme, sysPrefersDark } from './theme';
import { Circle } from './components/Circle';
import { useCircle } from './circle';
import { useUmrahCircle } from './umrahCircle';
import { umrahCall } from './components/UmrahBanner';
import { UmrahMadeCard } from './components/UmrahMade';
import { GiftNudge } from './components/GiftPass';
import { prepPct } from './components/Umrah';
import { Goals } from './components/Goals';
import { progress, snapshot } from './goals';
import { useKhatm } from './khatm';
import { useIftar } from './iftar';
import { inRamadan } from './rplan';
import { isCounted } from './store';
import { here, tripOn, safarRings } from './safar';
import { Safar } from './components/Safar';
import { Khutba } from './components/Khutba';
import { HalalScan } from './components/HalalScan';
import { Assistant, AssistantFab } from './components/Assistant';
import { buildContext } from './aiContext';
import { QiblaScreen, type QiblaTab } from './components/Mosques';
import { Ramadan } from './components/Ramadan';
import { ramadanHidden } from './rplan';
import { weekTotals } from './gamify';
import { famOf, kidSummaries, myLitDays, togWeek } from './family';
import type { Page as ProfilePage } from './components/Profile';
import { FirstWeek, Hint } from './components/Guide';
import { useInvites } from './components/Nick';
import { useNikahReady, useNikahMe, nikahTodo } from './nikah';
import { bizToday, takeBizPick, addBizHabits, useMyShura, useMyAdvice } from './biz';
import { activeLimit, slotsUsed } from './store';
import { useMyCC, courseOfCircle, progOf, shownBadge, syncDone } from './courseSocial';
import { weekStart, totals, useMyGoals, isFriday, addWeeks, useMyAsk, askLive, activeDays, chDays, useMyChallenges, useMyAmir, CH_KINDS } from './cweek';
import type { GoTo } from './guide';
import { usePlan, dueSheet, PRO_EVENT } from './plan';
import { dayPlan, goalsWaiting } from './dayplan';
import { TrialDial, PlanSheet } from './components/Plan';
import { useIsAdmin } from './components/Admin';
import { _t } from './i18n';
import { PathChoice, PathToday, PATH_EVENT, type PathView } from './components/NewPath';
import { OnboardCard, useOnb } from './components/Onboard';
import { npOf } from './newpath';
import { lazyNamed } from './lazy';
import type { OutGo } from './components/NewPathScreens';
const PathScreen = lazyNamed(() => import('./components/NewPathScreens').then((m) => m.PathScreen));

type Tab = 'today' | 'practice' | 'circle' | 'progress' | 'profile';

const ICONS: Record<Tab, JSX.Element> = {
  today: <path d="M12 3l2.6 5.4L20 9.2l-4 4 .9 5.8L12 16.3 7.1 19l.9-5.8-4-4 5.4-.8z" />,
  practice: <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5zM13 4h5.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H13z" />,
  circle: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M15 20a5 5 0 017-4.5" /></>,
  progress: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
};
const LABELS: Record<Tab, string> = { today: _t("Сегодня"), practice: _t("Практика"), circle: _t("Круг"), progress: _t("Цели"), profile: _t("Профиль") };

export function App() {
  const [state, update, replace] = useAppState();
  const [tab, setTab] = useState<Tab>(() => {
    try { const t = sessionStorage.getItem('lm.tab'); sessionStorage.removeItem('lm.tab'); if (t === 'circle') return 'circle' as Tab; } catch { /* */ }
    try { const q = new URLSearchParams(location.search); if (q.get('c')) { if (q.has('umrah')) sessionStorage.setItem('lm.umrahGo', '1'); return 'circle' as Tab; } if (q.has('umrah') || q.get('course')) return 'practice' as Tab; } catch { /* */ }
    try { const c = new URLSearchParams(location.search).get('chat'); if (c) { sessionStorage.setItem('lm.chat', c); return 'circle' as Tab; } } catch { /* */ }
    return 'today';
  });
  const chatUnread = useChatUnread();
  const chatTotal = Object.values(chatUnread).reduce((a, n) => a + n, 0);
  // A chat notification was tapped: open that circle's chat (switching circle reloads the page).
  useEffect(() => {
    const open = (code: string) => {
      if (!isCloud || !code) return;
      try { sessionStorage.setItem('lm.chat', code); } catch { /* */ }
      if (currentCircle()?.code !== code && myCircles().some((c) => c.code === code)) { switchCircle(code); return; }
      setTab('circle');
      window.dispatchEvent(new Event('lm-open-chat'));
    };
    try {
      const u = new URL(location.href);
      const c = u.searchParams.get('chat');
      if (c) { u.searchParams.delete('chat'); history.replaceState(null, '', u.toString()); open(c); }
    } catch { /* */ }
    const onMsg = (e: MessageEvent) => { try { if (e.data?.type === 'open') open(new URL(e.data.url, location.origin).searchParams.get('chat') || ''); } catch { /* */ } };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);
  const [now, setNow] = useState(() => new Date());
  const invites = useInvites(isCloud);
  const [sheet, setSheet] = useState<null | { editing?: Habit; anchor: Anchor }>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    const vis = () => setNow(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const today = dayKey(now);
  const place = here(state, today);
  const { lat, lng, method, madhab } = place;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offKey = JSON.stringify(state.settings.offsets ?? {});
  const times = useMemo(() => prayerTimes({ ...place, offsets: state.settings.offsets }, now), [today, lat, lng, method, madhab, offKey]);
  const adhan = useAdhanClock(state.settings, times, today, now);
  const setSettings = (patch: Partial<AppState['settings']>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const nudge = nudgeOf(state, today);
  setNudge(nudge);
  const wRings = workoutRings(state, today, (d) => { const [y, m, dd] = d.split('-').map(Number); return prayerTimes({ ...here(state, d), offsets: state.settings.offsets }, new Date(y, m - 1, dd, 12)) as unknown as Record<string, Date>; });
  const pingKey = JSON.stringify(setPings(state.pings, planRings(state), wRings, safarRings(state, today)));
  const remKey = pingKey + JSON.stringify(state.settings.reminders ?? null) + (state.settings.lang ?? '') + JSON.stringify(adhanServer(state.settings)) + JSON.stringify(nudge);
  useEffect(() => {
    if (!state.settings.reminders?.on) return;
    // Ticking habits changes the counts often: wait a moment so a burst of ticks is one save.
    // On a trip the server computes prayer reminders for the destination.
    const t = setTimeout(() => syncPush(place, state.settings.reminders!), 1500);
    return () => clearTimeout(t);
  }, [lat, lng, method, madhab, offKey, remKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { textScale = 1 } = state.settings;
  const [sysDark, setSysDark] = useState(sysPrefersDark);
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setSysDark(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, []);
  const theme = effectiveTheme(themeMode(state.settings), times, now, sysDark);
  setCurrentTheme(theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('lm.theme', theme); } catch { /* private mode */ }
  }, [theme]);
  useEffect(() => { document.body.style.zoom = textScale === 1 ? '' : String(textScale); }, [textScale]);
  const season = inRamadan(today) && state.settings.ramadanTheme !== false ? 'ramadan' : '';
  useEffect(() => {
    const r = document.documentElement;
    if (season) r.setAttribute('data-season', season); else r.removeAttribute('data-season');
  }, [season]);
  const [safar, setSafar] = useState(false);
  const [khutba, setKhutba] = useState(() => { try { return new URLSearchParams(location.search).has('khutba'); } catch { return false; } });
  const [halal, setHalal] = useState<'' | 'cam' | 'hist'>('');
  const [aiOpen, setAiOpen] = useState(false);
  const [qiblaOpen, setQiblaOpen] = useState<QiblaTab | null>(null);
  const [pathOpen, setPathOpen] = useState<PathView | null>(null);
  useEffect(() => {
    const f = (e: Event) => setPathOpen({ ...((e as CustomEvent).detail as PathView) });
    window.addEventListener(PATH_EVENT, f);
    try { if (new URLSearchParams(location.search).get('path') === 'new' && !state.settings.path) setPathOpen({ v: 'list' }); } catch { /* */ }
    return () => window.removeEventListener(PATH_EVENT, f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [ramadan, setRamadan] = useState<false | string>(false);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);
  const [quitOpen, setQuitOpen] = useState<{ id?: string; view?: QuitView } | null>(null);
  // ?umrah opens the umrah app right away (the phone shortcut and /umrah links).
  const [practiceStart, setPracticeStart] = useState<{ n: number; mode?: string; ref?: string }>(() => {
    try { const q = new URLSearchParams(location.search); if (q.has('umrah') && !q.get('c')) return { n: 0, mode: 'umrah', ref: q.get('umrah') || undefined }; if (q.get('course')) return { n: 0, mode: 'videos', ref: q.get('course') || undefined }; } catch { /* */ }
    return { n: 0 };
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [profileStart, setProfileStart] = useState<{ p: ProfilePage; n: number }>({ p: 'main', n: 0 });
  const openGarden = () => { setProfileStart((x) => ({ p: 'garden', n: x.n + 1 })); setTab('profile'); window.scrollTo(0, 0); };
  useEffect(() => { update((s) => snapshot(s, today)); }, [today, state.quran, state.books, state.summaryRead, state.course, state.prayers, state.health, state.umrah, state.log, state.goals?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = windowState(times, now).current ?? 'fajr';
  useWordsWatch(state, today);

  const save = (h: Habit, replaceId?: string) => {
    update((s) => {
      const exists = s.habits.some((x) => x.id === h.id);
      let habits = exists ? s.habits.map((x) => (x.id === h.id ? h : x)) : [...s.habits, h];
      if (replaceId) habits = habits.map((x) => (x.id === replaceId ? { ...x, status: 'archived' as const } : x));
      return { ...s, habits };
    });
    setSheet(null);
  };

  const circle = useCircle();
  const umrah = useUmrahCircle();
  const khatm = useKhatm();
  const iftar = useIftar();
  const paused = tripOn(state, today) ? state.trip?.paused ?? [] : [];
  const active = state.habits.filter((h) => h.status === 'active' && !paused.includes(h.id) && !ramadanHidden(state, h, today));
  // First day with the helper: for people who start fresh (no habits, no path), or who are midway through it.
  const onb = useOnb();
  const [onbFor, setOnbFor] = useState(() => onb !== 'done' && onb !== 'skip' && (onb !== '' || (active.length === 0 && !state.settings.path)));
  useEffect(() => { if (onb === 'again') setOnbFor(true); }, [onb]);
  const prayersToday = state.prayers?.[today] ?? {};
  const [myGoals, setMyGoal] = useMyGoals();
  const [myAsk, setMyAsk] = useMyAsk();
  const myCh = useMyChallenges(today);
  const [myAmir, setMyAmir] = useMyAmir();
  const [myShura, setMyShura] = useMyShura();
  const nikahOn = useNikahReady();
  const nk = useNikahMe(nikahOn);
  const [myAdv, giveAdv] = useMyAdvice(today);
  const [myCC, setMyCC] = useMyCC();
  const circleCourse = courseOfCircle(circle.members, today);
  // The certificate is earned on this phone; tell the server so the course can be rated (course-reviews.sql).
  useEffect(() => { syncDone(state.videos); }, [Object.keys(state.videos?.doneC ?? {}).length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Finished the circle's course: keep it for the «Прошёл с кругом» badge.
  useEffect(() => {
    const id = circleCourse?.id;
    if (id && state.videos?.doneC?.[id] && !state.videos.withCircle?.[id]) update((s) => ({ ...s, videos: { ...s.videos!, withCircle: { ...(s.videos!.withCircle ?? {}), [id]: s.videos!.doneC![id] } } }));
  }, [circleCourse?.id, state.videos?.doneC?.[circleCourse?.id ?? '']]); // eslint-disable-line react-hooks/exhaustive-deps
  // Business habits picked while creating or joining a business circle (the page reloaded since).
  useEffect(() => { const p = takeBizPick(); if (p?.length) update((s) => addBizHabits(s, p, today, activeLimit(), slotsUsed(s))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = {
    day: today,
    done: active.filter((h) => isCounted(state.log[today]?.[h.id])).length,
    total: active.length,
    prayers: Object.keys(prayersToday).length,
    ontime: Object.values(prayersToday).filter((m) => m === 'ontime').length,
    ...(inRamadan(today) && state.ramadan?.fasts?.[today] === 'fast' ? { fast: true } : {}),
    week: weekTotals(state, today),
    wk: totals(state, weekStart(today), today),
    pw: totals(state, addWeeks(weekStart(today), -1), today),
    cgs: myGoals,
    ask: askLive(myAsk, today) ? myAsk : null,
    act: activeDays(state, today),
    ...chDays(state, today),
    chs: myCh.chs,
    acc: myCh.acc,
    amir: myAmir && myAmir.w === weekStart(today) ? myAmir : null,
    cc: myCC,
    cp: circleCourse ? progOf(state.videos, circleCourse) : null,
    bd: shownBadge(state.videos),
    goals: (state.goals ?? []).filter((g) => g.status === 'active' && g.shared && (!isCloud || !g.circles?.length || g.circles.includes(currentCircle()?.code ?? ''))).map((g) => ({ t: g.title, p: progress(state, g, today).pct })),
  };
  const joined = Boolean(circle.me && circle.members.some((m) => m.id === circle.me));
  // Business circles share counts of business habits, my shura lines and the advice I gave.
  const bizOn = isCloud && currentCircle()?.kind === 'biz';
  if (bizOn) {
    Object.assign(summary, {
      biz: bizToday(state, today, active),
      shura: myShura && myShura.w === weekStart(today) ? myShura : null,
      adv: myAdv,
    });
  }
  // Family circles share more: counted days, the children kept on this phone, prayers together.
  const fam = famOf(state);
  const ck = isCloud ? currentCircle()?.kind : undefined;
  const familyOn = (!ck || ck === 'family') && Boolean((circle.isOwner && fam.on) || circle.members.some((m) => m.fam && m.id !== circle.me));
  const litKey = useMemo(() => (familyOn ? myLitDays(state, today) : []), [familyOn, today, state.log, state.prayers, state.habits]); // eslint-disable-line react-hooks/exhaustive-deps
  if (familyOn) {
    Object.assign(summary, {
      lit: litKey,
      kids: kidSummaries(state, today),
      tog: { day: today, a: fam.together[today] ?? [], week: togWeek(state, today) },
      ...(circle.isOwner ? { fam: Boolean(fam.on), promise: fam.promise ?? null } : {}),
    });
  }
  const summaryKey = JSON.stringify(summary);
  // Keep my circle total in step with what I mark; push only when it actually changes.
  useEffect(() => {
    if (!joined) return;
    const t = setTimeout(() => circle.push(summary), 1500);
    return () => clearTimeout(t);
  }, [summaryKey, joined]); // eslint-disable-line react-hooks/exhaustive-deps
  const circleToday = circle.members.filter((m) => m.id !== circle.me && m.day === today && (m.done > 0 || m.prayers > 0));

  // Support from the circle for me today: who made dua and who nudged me.
  const support: { text: string; onOpen: () => void; cls?: string }[] = [];
  // Someone called me to their umrah trip and I have not answered: first, it is a real invitation.
  const uCall = joined && circle.me ? umrahCall(umrah, circle.reacts, today) : null;
  if (uCall && !uCall.answered) support.push({ cls: 'invite',
    text: _t("🕋 {0} зовёт тебя на умру «{1}»", circle.names[uCall.c]?.name || umrah.names[uCall.c] || _t("Брат"), umrah.trips[uCall.h]?.title || _t("Умра")),
    onOpen: () => { window.scrollTo(0, 0); try { sessionStorage.setItem('lm.umHost', uCall.h); } catch { /* */ } setPracticeStart((x) => ({ n: x.n + 1, mode: 'umrah' })); setTab('practice'); } });
  const nkTodo = nikahTodo(nk);
  if (nkTodo.wali.length) support.push({ cls: 'invite', text: _t("💍 {0} просит тебя быть вали в поиске пары", nkTodo.wali[0].name), onOpen: () => go({ profile: 'nikah' }) });
  if (nkTodo.props) support.push({ cls: 'invite', text: _t("💍 {0} для никаха", nkTodo.props === 1 ? _t("Новое предложение") : _t("{0} новых предложения", nkTodo.props)), onOpen: () => go({ profile: 'nikah' }) });
  if (invites.length) {
    const f = invites[0];
    support.push({ cls: 'invite', onOpen: () => { window.scrollTo(0, 0); setTab('circle'); },
      text: invites.length === 1 ? _t("🔔 {0} зовёт тебя в круг «{1}»", f.from.name || _t("Кто-то"), f.title || _t("Круг")) : _t("🔔 {0} приглашения в круги ждут ответа", invites.length) });
  }
  if (chatTotal > 0) {
    const codes = Object.keys(chatUnread);
    const title = codes.length === 1 ? myCircles().find((c) => c.code === codes[0])?.title : '';
    support.push({ cls: 'invite', onOpen: () => { window.scrollTo(0, 0); try { if (codes.length === 1) sessionStorage.setItem('lm.chat', codes[0]); } catch { /* */ } if (codes.length === 1 && currentCircle()?.code !== codes[0]) { switchCircle(codes[0]); return; } setTab('circle'); window.dispatchEvent(new Event('lm-open-chat')); },
      text: _t("💬 {0} {1} в {2}", chatTotal, plural(chatTotal, _t("новое сообщение"), _t("новых сообщения"), _t("новых сообщений")), title ? _t("круге «{0}»", title) : _t("кругах")) });
  }
  if (joined && circle.me) {
    const name = (id: string) => circle.names[id]?.name || _t("Друг");
    const duaFrom: string[] = [], nudgeFrom: string[] = [];
    for (const [from, map] of Object.entries(circle.reacts)) {
      if (from === circle.me) continue;
      if (map?.[circle.me]?.e === '🤲' && map[circle.me].day === today) duaFrom.push(name(from));
      if (map?.[`n:${circle.me}`]?.day === today) nudgeFrom.push(name(from));
    }
    const open = () => setTab('circle');
    if (nudgeFrom.length && summary.done === 0 && summary.prayers === 0) support.push({ text: _t("{0} {1}: даже минимум считается", nudgeFrom.join(', '), nudgeFrom.length > 1 ? _t("напоминают") : _t("напоминает")), onOpen: open });
    if (duaFrom.length) support.push({ text: _t("🤲 {0} {1} за тебя дуа", duaFrom.join(', '), duaFrom.length > 1 ? _t("сделали") : _t("сделал(а)")), onOpen: open });
  }

  if (joined && circle.me) {
    for (const m of circle.members) {
      if (m.id === circle.me || !askLive(m.ask, today)) continue;
      if ((circle.reacts[circle.me]?.[`a:${m.id}`]?.day ?? '') >= m.ask.d) continue;
      support.push({ cls: 'invite', text: _t("🤲 {0} просит дуа: «{1}»", circle.names[m.id]?.name || _t("Брат из круга"), m.ask.t), onOpen: () => { window.scrollTo(0, 0); setTab('circle'); } });
    }
  }
  if (joined && circle.me) {
    for (const m of circle.members) for (const c of m.chs ?? []) {
      if (c.to !== circle.me || myCh.acc.includes(c.id) || addDays(c.start, 2) < today) continue;
      support.push({ cls: 'invite', text: _t("⚔️ {0} бросает тебе вызов: {1}", circle.names[m.id]?.name || _t("Брат"), CH_KINDS[c.k].label), onOpen: () => { window.scrollTo(0, 0); setTab('circle'); } });
    }
  }
  if (joined && bizOn && circle.members.length > 1 && fromKey(today).getDay() === 4 && !(myShura && myShura.w === weekStart(today))) {
    support.push({ cls: 'invite', text: _t("🧭 Сегодня шура круга: что сделал, где застрял, о чём спросить братьев"), onOpen: () => { window.scrollTo(0, 0); setTab('circle'); } });
  }
  if (joined && circle.members.length > 1 && isFriday(today) && now.getHours() >= 14) {
    support.push({ text: _t("📊 Итог недели круга готов: посмотри и отправь братьям"), onOpen: () => { window.scrollTo(0, 0); setTab('circle'); } });
  }

  // Guide buttons: open any part of the app.
  const go = (t: GoTo) => {
    window.scrollTo(0, 0);
    if ('tab' in t) { if (t.tab === 'profile') setProfileStart((x) => ({ p: 'main', n: x.n + 1 })); setTab(t.tab); return; }
    if ('practice' in t) { setPracticeStart((x) => ({ n: x.n + 1, mode: t.practice })); setTab('practice'); return; }
    if ('profile' in t) { setProfileStart((x) => ({ p: t.profile, n: x.n + 1 })); setTab('profile'); return; }
    if ('add' in t) { setTab('today'); setSheet({ anchor: current }); return; }
    if ('ramadan' in t) { setRamadan('auto'); return; }
    if ('safar' in t) { setSafar(true); return; }
    if ('assistant' in t) { setAiOpen(true); return; }
    if ('muhasaba' in t) { setTab('today'); setTimeout(() => document.querySelector('.muhasaba')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }
  };
  // A tap on a reminder notification opens /app/?go=pings (Мои напоминания) or ?go=plans&pl=…&do=…&d=… (a plan,
  // with «Сделано», «Через час», «Завтра» from the notification buttons). Also when the app is already open.
  useEffect(() => {
    const handle = (href: string) => {
      const u = new URL(href, location.origin);
      const g = u.searchParams.get('go');
      if (g === 'workouts') { try { sessionStorage.setItem('lm.hview', 'workouts'); } catch { /* */ } go({ practice: 'health' }); return true; }
      if (g !== 'pings' && g !== 'ideas' && g !== 'plans') return false;
      if (g === 'plans') setPlanStart({ plan: u.searchParams.get('pl') || undefined, act: u.searchParams.get('do') || undefined, day: u.searchParams.get('d') || undefined });
      go({ profile: g });
      return true;
    };
    try {
      if (handle(location.href)) { const u = new URL(location.href); ['go', 'pl', 'do', 'd'].forEach((k) => u.searchParams.delete(k)); history.replaceState(null, '', u.toString()); }
    } catch { /* */ }
    const onMsg = (e: MessageEvent) => { try { if (e.data?.type === 'open') handle(e.data.url); } catch { /* */ } };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  usePlansCloud(state, update);

  // Tariff: 7 days of Pro from the first day, then Free «по 3». Re-check the limits when the plan changes,
  // show the reminder sheets on day 5, day 7 and day 8, and open the Pro screen from anywhere.
  const plan = usePlan();
  // Gold numbers on Practice and Goals: what is planned for today and not started yet.
  const planN = useMemo(() => dayPlan(state, today).length, [state, today]);
  const goalsN = useMemo(() => goalsWaiting(state, today).length, [state, today]);
  useIsAdmin(); // marks the owner, who never sees a tariff
  const [planSheet, setPlanSheet] = useState<5 | 7 | 8 | null>(null);
  useEffect(() => { update((s) => s); }, [plan.pro]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = dueSheet(); if (k && k !== planSheet) setPlanSheet(k); }, [plan.day, plan.trial, plan.early]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = () => { setPlanSheet(null); go({ profile: 'pro' }); window.scrollTo(0, 0); };
    window.addEventListener(PRO_EVENT, f);
    return () => window.removeEventListener(PRO_EVENT, f);
  });

  // «Новый путь»: the card on Today, the prayer the teacher opens with, and lesson buttons that lead elsewhere.
  const npOn = Boolean(npOf(state).on);
  const ws = windowState(times, now);
  const teachA: Anchor = ws.current ?? ws.next ?? 'fajr';
  const choice = !state.settings.path && active.length === 0 ? <PathChoice state={state} update={update} today={today} /> : null;
  const onbOver = onb === 'done' || onb === 'skip';
  const pathCard = npOn ? <PathToday state={state} update={update} today={today} prayer={teachA} />
    : onbFor ? <><OnboardCard state={state} update={update} times={times} today={today} onGo={(t) => (t === 'circle' ? go({ tab: 'circle' }) : setAiOpen(true))} />{onbOver && choice}</>
    : choice;
  const pathGo = (g: OutGo) => {
    setPathOpen(null);
    if (g === 'qibla' || g === 'mosques') { setQiblaOpen(g); return; }
    if (g === 'azkar' || g === 'quran') { setPracticeStart((x) => ({ n: x.n + 1, mode: g })); setTab('practice'); window.scrollTo(0, 0); return; }
    if (g === 'circle') { setTab('circle'); window.scrollTo(0, 0); return; }
    setTab('today'); setSheet({ anchor: current });
  };

  const nextUp = state.habits.find((h) => h.status === 'active' && h.anchor === current && !state.log[today]?.[h.id]);

  return (
    <div className="app">
      <main className="screen" data-tab={tab}>
        {tab === 'today' && <UmrahMadeCard state={state} update={update} api={umrah} />}
        {tab === 'today' && (
          <Today state={state} update={update} today={today} now={now} times={times}
            circleLine={joined && circleToday.length ? { names: circleToday.map((m) => circle.names[m.id]?.name || _t("Участник")), onOpen: () => setTab('circle') } : undefined}
            onEdit={(h) => setSheet({ editing: h, anchor: h.anchor })} onAdd={(a) => setSheet({ anchor: a })} onSafar={() => setSafar(true)} onKhutba={() => setKhutba(true)} onAssistant={state.settings.aiFab === false ? () => setAiOpen(true) : undefined} onQibla={(t) => setQiblaOpen(t)} onRamadan={(t?: unknown) => setRamadan(typeof t === 'string' ? t : 'auto')} onGarden={openGarden} support={support} plan={<TrialDial />}
            onPlans={() => go({ profile: 'plans' })} onQuit={(id) => setQuitOpen({ id, view: 'home' })}
            notes={<><WordCard t={todayTrigger(now, times)} state={state} today={today} /><GiftNudge today={today} /></>}
            quitCheck={<QuitCheck state={state} update={update} today={today} onSlip={(id) => setQuitOpen({ id, view: 'tawba' })} />} firstWeek={npOn || (onbFor && !onbOver) ? null : <FirstWeek state={state} joined={joined} go={go} />} pathCard={pathCard}
            onGoal={(id) => { setGoalOpen(id); setReviewOpen(false); setTab('progress'); }} onReview={() => { setGoalOpen(null); setReviewOpen(true); setTab('progress'); }} />
        )}
        {tab === 'circle' && <Hint id="circle" />}
        {tab === 'circle' && (
          <Circle circle={circle} joined={joined} today={today} summary={summary} onCircleGoal={setMyGoal} myAsk={askLive(myAsk, today) ? myAsk : null} onAsk={setMyAsk} ch={myCh} amir={myAmir} onAmir={setMyAmir} shura={myShura} onShura={setMyShura} adv={myAdv} giveAdv={giveAdv} chatUnread={chatUnread} myCC={myCC} onCC={setMyCC} onOpenCourse={(id) => { window.scrollTo(0, 0); setPracticeStart((x) => ({ n: x.n + 1, mode: 'videos', ref: id })); setTab('practice'); }} onNikah={() => go({ profile: 'nikah' })} onJoin={() => circle.join(summary)} onLeave={() => circle.leave()} umrah={umrah} myReady={prepPct(state)} khatm={khatm} iftar={iftar} state={state} update={update} current={current} />
        )}
        {tab === 'practice' && <Practice umrah={umrah} circle={circle} joined={joined} umrahStart={practiceStart.mode === 'umrah' && practiceStart.ref === 'group' ? 'group' : undefined} key={practiceStart.n} start={practiceStart.mode ? { mode: practiceStart.mode, ref: practiceStart.ref } : undefined} state={state} update={update} today={today} suggestedId={nextUp?.id} onSafar={() => setSafar(true)} onKhutba={() => setKhutba(true)} onHalal={() => setHalal('cam')} onRamadan={() => { say('ramadan_open'); setRamadan('auto'); }} onQuit={() => setQuitOpen({})} />}
        {tab === 'progress' && (
          <div className="page">
            {!goalOpen && !reviewOpen && <Hint id="goals" />}
            <Goals state={state} update={update} today={today} openId={goalOpen} setOpenId={setGoalOpen} reviewOpen={reviewOpen} setReviewOpen={setReviewOpen} stats={<Progress state={state} today={today} onOpenGoal={setGoalOpen} />}
              plans={<PlansPage state={state} update={update} today={today} onAsk={() => go({ assistant: true })} />}
              onDo={(st) => { window.scrollTo(0, 0); if (st.action === 'today') { setTab('today'); return; } setPracticeStart((x) => ({ n: x.n + 1, mode: st.action, ref: st.ref })); setTab('practice'); }}
              onCircle={() => { window.scrollTo(0, 0); setTab('circle'); }} />
            {!goalOpen && !reviewOpen && <WordCard t="goals_open" state={state} today={today} />}
          </div>
        )}
        {tab === 'profile' && (
          <Profile onGo={go} key={profileStart.n} start={profileStart.p} state={state} update={update} replace={replace} times={times} onEdit={(h) => setSheet({ editing: h, anchor: h.anchor })} />
        )}
      </main>

      {tab === 'today' && (
        <button type="button" className="fab" onClick={() => setSheet({ anchor: current })} aria-label={_t("Добавить привычку")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
          {_t("Добавить")}
        </button>
      )}

      {!aiOpen && <AssistantFab s={state.settings} onOpen={() => setAiOpen(true)} />}

      <nav className="nav" aria-label={_t("Разделы")}>
        {(Object.keys(LABELS) as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onPointerDown={() => { try { navigator.vibrate?.(8); } catch { /* */ } }} aria-current={tab === t ? 'page' : undefined} aria-label={t === 'circle' && invites.length ? _t("{0}, приглашений: {1}", LABELS[t], invites.length) : undefined} onClick={() => { if (t === 'profile') setProfileStart((x) => ({ p: 'main', n: x.n + 1 })); if (t === 'practice') setPracticeStart((x) => ({ n: x.n + 1 })); setTab(t); }}>
            <span className="k" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[t]}</svg>{t === 'practice' && planN > 0 && <i className="nav-badge gold">{planN}</i>}{t === 'progress' && goalsN > 0 && <i className="nav-badge gold">{goalsN}</i>}{t === 'circle' && invites.length > 0 && <i className="nav-badge">{invites.length > 9 ? '9+' : invites.length}</i>}{t === 'circle' && !invites.length && chatTotal > 0 && <i className="nav-badge">{chatTotal > 9 ? '9+' : chatTotal}</i>}</span>
            <small>{LABELS[t]}</small>
          </button>
        ))}
        <span className="nav-ind" aria-hidden="true" style={{ '--i': Math.max(0, (Object.keys(LABELS) as Tab[]).indexOf(tab)) } as CSSProperties} />
      </nav>

      <WordsLayer state={state} today={today} />
      {quitOpen && <QuitScreen state={state} update={update} today={today} start={quitOpen} onClose={() => setQuitOpen(null)} />}
      {ramadan && <Ramadan state={state} update={update} today={today} start={ramadan === 'auto' ? undefined : (ramadan as 'day')} onClose={() => setRamadan(false)} />}
      {khutba && <Khutba state={state} update={update} today={today} onClose={() => setKhutba(false)} />}
      {halal && <HalalScan state={state} today={today} start={halal} onClose={() => setHalal('')} />}
      {safar && <Safar state={state} update={update} today={today} onClose={() => setSafar(false)} circle={circle} joined={joined} />}
      {aiOpen && <Assistant state={state} onClose={() => setAiOpen(false)} onSignIn={() => { setAiOpen(false); go({ profile: 'account' }); }} context={(st) => buildContext(st, today, new Date(), times, circle)} apply={(st) => update(() => st)} onGo={(t) => { setAiOpen(false); go(t); }} />}
      {adhan.open && <AdhanPlayer key={adhan.open.n} open={adhan.open} s={state.settings} set={setSettings} onClose={adhan.close} />}
      {adhan.toast && <AdhanToast a={adhan.toast} onClose={adhan.closeToast} />}
      {pathOpen && <PathScreen state={state} update={update} today={today} prayer={teachA} start={pathOpen} onClose={() => setPathOpen(null)} onGo={pathGo} />}
      {qiblaOpen && <QiblaScreen state={state} update={update} today={today} start={qiblaOpen} onClose={() => setQiblaOpen(null)} />}

      {planSheet && !sheet && <PlanSheet k={planSheet} state={state} today={today} onClose={() => setPlanSheet(null)} />}

      {sheet && (
        <HabitSheet
          key={sheet.editing?.id ?? 'new'}
          state={state}
          editing={sheet.editing}
          defaultAnchor={sheet.anchor}
          onSave={save}
          onDelete={(id) => { update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, status: 'archived' } : h)) })); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
