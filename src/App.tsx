import { useEffect, useMemo, useState } from 'react';
import { isCloud, currentCircle } from './cloud';
import type { Anchor, Habit } from './types';
import { useAppState } from './store';
import { dayKey } from './dates';
import { prayerTimes, windowState } from './prayer';
import { Today } from './components/Today';
import { HabitSheet } from './components/HabitSheet';
import { Practice } from './components/Practice';
import { Progress } from './components/Progress';
import { Profile } from './components/Profile';
import { syncPush } from './push';
import { Circle } from './components/Circle';
import { useCircle } from './circle';
import { useUmrahCircle } from './umrahCircle';
import { prepPct } from './components/Umrah';
import { Goals } from './components/Goals';
import { progress, snapshot } from './goals';
import { useKhatm } from './khatm';
import { useIftar } from './iftar';
import { inRamadan } from './rplan';
import { isCounted } from './store';
import { here, tripOn } from './safar';
import { Safar } from './components/Safar';
import { Ramadan } from './components/Ramadan';
import { ramadanHidden } from './rplan';
import { weekTotals } from './gamify';
import { famOf, kidSummaries, myLitDays, togWeek } from './family';
import type { Page as ProfilePage } from './components/Profile';

type Tab = 'today' | 'practice' | 'circle' | 'progress' | 'profile';

const ICONS: Record<Tab, JSX.Element> = {
  today: <path d="M12 3l2.6 5.4L20 9.2l-4 4 .9 5.8L12 16.3 7.1 19l.9-5.8-4-4 5.4-.8z" />,
  practice: <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5zM13 4h5.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H13z" />,
  circle: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M15 20a5 5 0 017-4.5" /></>,
  progress: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
};
const LABELS: Record<Tab, string> = { today: 'Сегодня', practice: 'Практика', circle: 'Круг', progress: 'Цели', profile: 'Профиль' };

export function App() {
  const [state, update, replace] = useAppState();
  const [tab, setTab] = useState<Tab>(() => {
    try { const t = sessionStorage.getItem('lm.tab'); sessionStorage.removeItem('lm.tab'); if (t === 'circle') return 'circle' as Tab; } catch { /* */ }
    try { if (new URLSearchParams(location.search).get('c')) return 'circle' as Tab; } catch { /* */ }
    return 'today';
  });
  const [now, setNow] = useState(() => new Date());
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
  const remKey = JSON.stringify(state.settings.reminders ?? null);
  useEffect(() => {
    if (state.settings.reminders?.on) syncPush(state.settings, state.settings.reminders);
  }, [lat, lng, method, madhab, offKey, remKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { theme = 'auto', textScale = 1 } = state.settings;
  useEffect(() => {
    const r = document.documentElement;
    if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
    document.body.style.zoom = textScale === 1 ? '' : String(textScale);
  }, [theme, textScale]);
  const [safar, setSafar] = useState(false);
  const [ramadan, setRamadan] = useState(false);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);
  const [practiceStart, setPracticeStart] = useState<{ n: number; mode?: string; ref?: string }>({ n: 0 });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [profileStart, setProfileStart] = useState<{ p: ProfilePage; n: number }>({ p: 'main', n: 0 });
  const openGarden = () => { setProfileStart((x) => ({ p: 'garden', n: x.n + 1 })); setTab('profile'); window.scrollTo(0, 0); };
  useEffect(() => { update((s) => snapshot(s, today)); }, [today, state.quran, state.books, state.summaryRead, state.course, state.prayers, state.health, state.umrah, state.log, state.goals?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = windowState(times, now).current ?? 'fajr';

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
  const prayersToday = state.prayers?.[today] ?? {};
  const summary = {
    day: today,
    done: active.filter((h) => isCounted(state.log[today]?.[h.id])).length,
    total: active.length,
    prayers: Object.keys(prayersToday).length,
    ontime: Object.values(prayersToday).filter((m) => m === 'ontime').length,
    ...(inRamadan(today) && state.ramadan?.fasts?.[today] === 'fast' ? { fast: true } : {}),
    week: weekTotals(state, today),
    goals: (state.goals ?? []).filter((g) => g.status === 'active' && g.shared && (!isCloud || !g.circles?.length || g.circles.includes(currentCircle()?.code ?? ''))).map((g) => ({ t: g.title, p: progress(state, g, today).pct })),
  };
  const joined = Boolean(circle.me && circle.members.some((m) => m.id === circle.me));
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
  const support: { text: string; onOpen: () => void }[] = [];
  if (joined && circle.me) {
    const name = (id: string) => circle.names[id]?.name || 'Друг';
    const duaFrom: string[] = [], nudgeFrom: string[] = [];
    for (const [from, map] of Object.entries(circle.reacts)) {
      if (from === circle.me) continue;
      if (map?.[circle.me]?.e === '🤲' && map[circle.me].day === today) duaFrom.push(name(from));
      if (map?.[`n:${circle.me}`]?.day === today) nudgeFrom.push(name(from));
    }
    const open = () => setTab('circle');
    if (nudgeFrom.length && summary.done === 0 && summary.prayers === 0) support.push({ text: `${nudgeFrom.join(', ')} ${nudgeFrom.length > 1 ? 'напоминают' : 'напоминает'}: даже минимум считается`, onOpen: open });
    if (duaFrom.length) support.push({ text: `🤲 ${duaFrom.join(', ')} ${duaFrom.length > 1 ? 'сделали' : 'сделал(а)'} за тебя дуа`, onOpen: open });
  }

  const nextUp = state.habits.find((h) => h.status === 'active' && h.anchor === current && !state.log[today]?.[h.id]);

  return (
    <div className="app">
      <main className="screen" data-tab={tab}>
        {tab === 'today' && (
          <Today state={state} update={update} today={today} now={now} times={times}
            circleLine={joined && circleToday.length ? { names: circleToday.map((m) => circle.names[m.id]?.name || 'Участник'), onOpen: () => setTab('circle') } : undefined}
            onEdit={(h) => setSheet({ editing: h, anchor: h.anchor })} onAdd={(a) => setSheet({ anchor: a })} onSafar={() => setSafar(true)} onRamadan={() => setRamadan(true)} onGarden={openGarden} support={support}
            onGoal={(id) => { setGoalOpen(id); setReviewOpen(false); setTab('progress'); }} onReview={() => { setGoalOpen(null); setReviewOpen(true); setTab('progress'); }} />
        )}
        {tab === 'circle' && (
          <Circle circle={circle} joined={joined} today={today} summary={summary} onJoin={() => circle.join(summary)} onLeave={() => circle.leave()} umrah={umrah} myReady={prepPct(state)} khatm={khatm} iftar={iftar} state={state} update={update} current={current} />
        )}
        {tab === 'practice' && <Practice key={practiceStart.n} start={practiceStart.mode ? { mode: practiceStart.mode, ref: practiceStart.ref } : undefined} state={state} update={update} today={today} suggestedId={nextUp?.id} onSafar={() => setSafar(true)} onRamadan={() => setRamadan(true)} />}
        {tab === 'progress' && (
          <div className="page">
            <Goals state={state} update={update} today={today} openId={goalOpen} setOpenId={setGoalOpen} reviewOpen={reviewOpen} setReviewOpen={setReviewOpen} stats={<Progress state={state} today={today} />}
              onDo={(st) => { window.scrollTo(0, 0); if (st.action === 'today') { setTab('today'); return; } setPracticeStart((x) => ({ n: x.n + 1, mode: st.action, ref: st.ref })); setTab('practice'); }}
              onCircle={() => { window.scrollTo(0, 0); setTab('circle'); }} />
          </div>
        )}
        {tab === 'profile' && (
          <Profile key={profileStart.n} start={profileStart.p} state={state} update={update} replace={replace} times={times} onEdit={(h) => setSheet({ editing: h, anchor: h.anchor })} />
        )}
      </main>

      {tab === 'today' && (
        <button type="button" className="fab" onClick={() => setSheet({ anchor: current })} aria-label="Добавить привычку">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
          Добавить
        </button>
      )}

      <nav className="nav" aria-label="Разделы">
        {(Object.keys(LABELS) as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => { if (t === 'profile') setProfileStart((x) => ({ p: 'main', n: x.n + 1 })); if (t === 'practice') setPracticeStart((x) => ({ n: x.n + 1 })); setTab(t); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{ICONS[t]}</svg>
            {LABELS[t]}
          </button>
        ))}
      </nav>

      {ramadan && <Ramadan state={state} update={update} today={today} onClose={() => setRamadan(false)} />}
      {safar && <Safar state={state} update={update} today={today} onClose={() => setSafar(false)} />}

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
