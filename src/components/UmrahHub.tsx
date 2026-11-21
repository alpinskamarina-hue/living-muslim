import { Hint } from './Guide';
import { currentTheme } from '../theme';
import { useEffect, useMemo, useState } from 'react';
import { shareCard, SITE } from '../share';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { IHRAM_RULES, PREP, STEPS, type Step } from '../umrah/guide';
import { DuaList, StepView, umrahOf } from './Umrah';
import { UmrahTrips } from './UmrahTrips';
import { CircleChat } from './CircleChat';
import { useChat } from '../chat';
import type { CircleApi } from '../circle';
import { isCloud, currentCircle, inviteLink, nicksReady, myCircles, switchCircle } from '../cloud';
import { InviteByNick } from './Nick';
import { QiblaScreen } from './Mosques';
import { MiqatView } from './Miqat';
import { UmrahSavings } from './UmrahSavings';
import { UmrahLive } from './UmrahLive';
import { TalbiyaLearn, WalkPlan } from './UmrahPrep';
import { LeaveForPrayer, LostCard, OnSiteSetup } from './UmrahOnSite';
import { Diary, FortyDays, StoryButton, YearAgo } from './UmrahAfter';
import { Badal, MadinahGuide, WhenToGo } from './UmrahExtra';
import { pathModel, umrahReady, HEART, DEED_STEP } from '../umrah/path';
import { UmrahBook } from './UmrahBook';
import { PassCard, UmrahPlan } from './UmrahPlan';
import { RollCall, DayPlan, activeRoll } from './UmrahDash';
import { UmrahDocs } from './UmrahDocs';
import { umrahCall } from './UmrahBanner';
import { AsksToMe, OpenGroups, OpenSwitch, useOpenList } from './UmrahOpen';
import { GuidesPane } from './UmrahGuides';
import { useGuides } from '../guides';
import { useUmrahAsks } from '../umrahOpen';
import { GroupRadar, useStopSharingAfter } from './UmrahGroup';
import { plural } from '../dates';
import { UMRAH_VIDEOS, embed, mins } from '../umrah/videos';
import { _t, _tj } from '../i18n';

type PView = 'mine' | 'guides' | 'open';

// One place for the whole umrah: what matters today, the heart, my duas, the rites and the trip.
// Both Practice and the Circle open this screen.

export type HubTab = 'now' | 'heart' | 'duas' | 'rites' | 'trip' | 'group';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  api: UmrahApi;
  nameOf: (id: string) => string;
  onExit: () => void;
  backLabel: string;
  start?: HubTab;
  /** The Circle, for the trip chat and the faces. */
  circle?: CircleApi;
  joined?: boolean;
}

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const dLabel = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${[_t("янв"), _t("фев"), _t("мар"), _t("апр"), _t("мая"), _t("июн"), _t("июл"), _t("авг"), _t("сен"), _t("окт"), _t("ноя"), _t("дек")][m - 1]}`; };

export function UmrahHub({ state, update, today, api: rawApi, nameOf, onExit, backLabel, start, circle, joined }: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const [miqat, setMiqat] = useState(false);
  const [lost, setLost] = useState(false);
  const [qibla, setQibla] = useState(false);
  const [inviting, setInviting] = useState<'' | 'sheet' | 'nick'>('');
  const [stepI, setStepI] = useState(0);
  const [umOpen] = useState(() => { try { const v = sessionStorage.getItem('lm.umOpen') ?? ''; sessionStorage.removeItem('lm.umOpen'); return v; } catch { return ''; } });
  const [peopleView, setPeopleView] = useState<PView>(umOpen === 'guides' || umOpen === 'become' ? 'guides' : umOpen ? 'open' : 'mine');
  const u = umrahOf(state);
  const { me, trips, rsvp, duas } = rawApi;

  // Travel days: the chosen dates of the group trip I am going on, else my own.
  const myTrips = me ? Object.entries(rsvp[me] ?? {}).filter(([h, r]) => r.s === 'go' && trips[h]).map(([h]) => h) : [];
  const groupDates = myTrips.map((h) => trips[h].dates?.find((d) => d.id === trips[h].chosen)).find(Boolean);
  const from = groupDates?.from ?? u.from;
  const to = groupDates?.to ?? u.to;
  const left = from ? diff(today, from) : null;
  const phase = !from ? 'none' : left! > 30 ? 'far' : left! > 6 ? 'month' : left! > 0 ? 'week' : to && diff(today, to) >= 0 ? 'there' : to && diff(to, today) <= 40 ? 'after' : 'done';
  const onSite = phase === 'there';

  const [tab, setTab] = useState<UTab>(() => (start === 'group' ? 'people' : start === 'duas' ? 'duas' : start === 'heart' ? 'know' : start === 'rites' ? (onSite ? 'rite' : 'know') : onSite ? 'rite' : 'path'));
  const gProbe = useGuides(isCloud && tab === 'step');
  const go = (t: UTab) => { setTab(t); window.scrollTo(0, 0); };

  // Light or dark like the whole app (auto follows the phone); the moon/sun switches it for the whole app.
  const dark = currentTheme() === 'dark';
  const flipTheme = () => update((s) => ({ ...s, settings: { ...s.settings, theme: dark ? 'light' : 'dark' } }));

  // The umrah is its own app: the main tabs hide while it is open.
  useEffect(() => {
    document.body.classList.add('um-on');
    return () => document.body.classList.remove('um-on', 'um-dark');
  }, []);
  useEffect(() => { document.body.classList.toggle('um-dark', dark); }, [dark]);

  // The trip I look at in «Группа»: the one I go on, else one I answered, else the newest.
  const answered = me ? Object.keys(rsvp[me] ?? {}).filter((h) => trips[h]) : [];
  const newest = Object.keys(trips).sort((a, b) => (trips[b].created ?? '').localeCompare(trips[a].created ?? ''));
  // Opened from a call («Насим зовёт тебя на умру»): show that trip.
  const [pick, setPick] = useState<string | null>(() => { try { const h = sessionStorage.getItem('lm.umHost'); sessionStorage.removeItem('lm.umHost'); return h; } catch { return null; } });
  const tripHost = (pick && trips[pick] ? pick : null) ?? myTrips[0] ?? answered[0] ?? newest[0] ?? null;

  // The trip chat: a branch of the Circle chat, so it needs the Circle and the chat server.
  const chatCode = isCloud && joined && circle?.me ? currentCircle()?.code : undefined;
  const chat = useChat(chatCode, tab === 'people');
  const chatOn = Boolean(chat.ready && chatCode && me);
  const emit = (host: string, text: string) => { if (chatOn) chat.send(text, { tr: host }, 'event'); };

  // Everything people do on the trip also lands in its chat: «Юсуф: еду», «Али купил билет», the dates, the amir, tasks done.
  const api: UmrahApi = useMemo(() => ({
    ...rawApi,
    respond: (host, p) => {
      const cur = me ? rawApi.rsvp[me]?.[host] : undefined;
      if (p.s && p.s !== cur?.s) emit(host, p.s === 'go' ? _t("едет") : p.s === 'maybe' ? _t("пока думает") : _t("в этот раз не едет"));
      if (p.bought && !cur?.bought) emit(host, _t("купил билет ✈"));
      const t = rawApi.trips[host]?.tasks ?? [];
      for (const id of p.done ?? []) if (!cur?.done?.includes(id)) { const x = t.find((y) => y.id === id); if (x) emit(host, _t("выполнил задачу: «{0}» ✓", x.text)); }
      return rawApi.respond(host, p);
    },
    saveTrip: (tr) => {
      const old = me ? rawApi.trips[me] : undefined;
      if (me && old) {
        if (tr.chosen && tr.chosen !== old.chosen) { const d = tr.dates?.find((x) => x.id === tr.chosen); if (d) emit(me, _t("выбрал даты: {0} – {1} ✈", dLabel(d.from), dLabel(d.to))); }
        if (tr.amir && tr.amir !== old.amir) emit(me, _t("назначил амира группы: {0}", nameOf(tr.amir)));
      }
      return rawApi.saveTrip(tr);
    },
  }), [rawApi, me, chatOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Just made an umrah circle: make its trip once the circle is connected, then offer «Позвать» right away.
  useEffect(() => {
    if (!rawApi.ready || !me) return;
    let n: { title: string; month: string } | null = null;
    try { n = JSON.parse(sessionStorage.getItem('lm.umNew') || 'null'); } catch { /* */ }
    if (!n) return;
    try { sessionStorage.removeItem('lm.umNew'); } catch { /* */ }
    if (!rawApi.trips[me]) rawApi.saveTrip({ title: n.title || _t("Умра с братьями"), month: n.month, city: '', tasks: [], created: new Date().toISOString() });
    rawApi.respond(me, { s: 'go', ready: umrahReady(state) });
    setPick(me); setTab('path'); setInviting('sheet');
  }, [rawApi.ready, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePrep = (id: string) => update((s) => patch(s, { prep: umrahOf(s).prep.includes(id) ? umrahOf(s).prep.filter((x) => x !== id) : [...umrahOf(s).prep, id] }));

  // Requests for dua from the Circle for the trips I am going on.
  const asks = Object.entries(duas).flatMap(([who, m]) => myTrips.flatMap((h) => (m?.[h] ?? []).map((text, i) => ({ key: `${who}:${h}:${i}`, who, text }))));
  // While in Makkah, ticked requests are shared back, so the person who asked learns it was made.
  const askedKey = (u.asked ?? []).join(',');
  // The group trip on «Сейчас»: one I go on, else the one I am gathering myself even before I pressed «Еду».
  const groupHost: string | undefined = myTrips[0] ?? (me && trips[me] ? me : undefined);
  const groupMembers = groupHost ? [...new Set([groupHost, ...Object.entries(rsvp).filter(([, r]) => r[groupHost]?.s === 'go').map(([id]) => id)])] : [];
  useStopSharingAfter(state, update, rawApi, onSite);
  useEffect(() => {
    if (!onSite || !me) return;
    for (const h of myTrips) {
      const made = (u.asked ?? []).filter((k) => k.split(':')[1] === h).sort();
      const cur = [...(rsvp[me]?.[h]?.made ?? [])].sort();
      if (made.join(',') !== cur.join(',')) rawApi.respond(h, { made });
    }
  }, [askedKey, phase, me, myTrips.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAsk = (k: string) => update((s) => { const a = umrahOf(s).asked ?? []; return patch(s, { asked: a.includes(k) ? a.filter((x) => x !== k) : [...a, k] }); });

  // «Моя умра»: one path for every way of going, one readiness number.
  const goingIds = groupHost ? groupMembers.filter((id) => rsvp[id]?.[groupHost]?.s === 'go' || id === groupHost) : [];
  const model = pathModel(state, groupHost ? { api: rawApi, host: groupHost, going: goingIds } : null);
  const mode = model.mode;

  // The one number lives in the state (Goals, Practice) and in my answer to each trip (the group sees it);
  // the group's chosen dates become my dates, so the Profile and the countdowns read the same days.
  useEffect(() => {
    const p: Partial<UmrahState> = {};
    if (u.ready !== model.ready) p.ready = model.ready;
    if (groupDates && (u.from !== groupDates.from || u.to !== groupDates.to)) { p.from = groupDates.from; p.to = groupDates.to; }
    if (Object.keys(p).length) update((s) => patch(s, p));
    if (me) for (const h of myTrips) if (rsvp[me]?.[h]?.ready !== model.ready) rawApi.respond(h, { ready: model.ready });
  }, [model.ready, groupDates?.from, groupDates?.to, me, myTrips.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step) return <div className={`um-app${dark ? ' um-dk' : ''}`}><StepView step={step} state={state} update={update} asks={asks.map((a) => ({ ...a, who: nameOf(a.who) }))} onBack={() => setStep(null)}
    onNext={() => { const i = STEPS.findIndex((x) => x.id === step.id); setStep(STEPS[i + 1] ?? null); }} /></div>;
  if (lost) return <LostCard state={state} onClose={() => setLost(false)} />;
  if (miqat) return <div className={`um-app${dark ? ' um-dk' : ''}`}><MiqatView state={state} update={update} onBack={() => setMiqat(false)} /></div>;
  // The call to a trip: a mark the person sees in the Circle and on Today (a second tap the same day must not take it back),
  // and a line in the circle's main chat that brings a notification and an unread mark, even if another circle is open.
  const callTo = (uid: string, name: string, host: string | null = tripHost) => {
    const mine = (me && circle?.reacts[me]) || {};
    if (!(mine[`u:${uid}`]?.e === '🕋' && mine[`u:${uid}`].day === today)) circle?.react(`u:${uid}`, '🕋', today);
    if (chatOn && host) chat.send(_tj("🕋 Зовёт на умру «{0}»: {1}", trips[host]?.title ?? _t("Умра"), name || _t("Участник")), { um: host, to: uid }, 'event');
  };
  if (inviting === 'nick' && chatCode) {
    const t = tripHost ? trips[tripHost] : null;
    const url = `${inviteLink(chatCode)}&umrah=group`;
    const mine = (me && circle?.reacts[me]) || {};
    const called = Object.keys(mine).filter((k) => k.startsWith('u:') && diff(mine[k].day, today) <= 30).map((k) => k.slice(2));
    return (
      <div className={`um-app${dark ? ' um-dk' : ''}`}>
        <InviteByNick code={chatCode} onBack={() => { setInviting(''); window.scrollTo(0, 0); }}
          trip={{ title: t?.title ?? _t("Умра"), url, called,
            text: _tj("Ассаляму алейкум! Собираемся на умру вместе: «{0}». Присоединяйся, там даты, задачи и наш чат:", t?.title ?? _t("Умра")),
            onCall: (uid, name) => callTo(uid, name) }} />
      </div>
    );
  }
  if (qibla) return <QiblaScreen state={state} update={update} today={today} start="qibla" onClose={() => setQibla(false)} />;

  const canCall = Boolean(me && groupHost && (me === groupHost || trips[groupHost]?.amir === me));
  const roll = groupHost ? activeRoll(rawApi, groupHost) : null;
  const rollCall = groupHost ? <RollCall api={rawApi} host={groupHost} going={goingIds} me={me} nameOf={nameOf} canCall={canCall} emit={(t) => emit(groupHost, t)} /> : null;
  const setMode = (m: UmrahState['mode']) => update((s) => patch(s, { mode: m }));
  const openStep = (i: number) => { if (model.steps[i].id === 'docs') { go('docs'); return; } setStepI(i); go('step'); };


  // The rite in progress on site: tawaf until 7, then sa'i.
  const riteStep = STEPS.find((s) => s.counter && u[s.counter] < 7) ?? null;
  const riteN = riteStep?.counter ? u[riteStep.counter] : 7;
  const lap = (d: number) => riteStep?.counter && update((s) => patch(s, { [riteStep.counter!]: Math.max(0, Math.min(7, umrahOf(s)[riteStep.counter!] + d)) }));

  // The gold bar: always the one next step. The heart comes first while the trip is far away.
  const heartDue = PREP.find((p) => HEART.includes(p.id) && !u.prep.includes(p.id));
  const stepNext = model.now >= 0 ? model.steps[model.now] : null;
  const next: { k: string; t: string; go: () => void } | null =
    onSite ? (riteStep ? { k: _t("Сейчас"), t: _tj("{0}: круг {1} из 7", riteStep.title, riteN + 1), go: () => go('rite') } : null)
    : phase === 'after' ? { k: _t("Сейчас"), t: _t("Сохрани умру: картинка и 40 дней"), go: () => go('path') }
    : !mode ? null
    : heartDue && (!stepNext || model.now >= 4 || (left !== null && left > 30 && model.now >= 2)) ? { k: _t("Следующий шаг · сердце"), t: heartDue.text, go: () => go('know') }
    : stepNext ? { k: _tj("Следующий шаг · {0}", stepNext.t), t: stepNext.next, go: () => (model.now === 0 && mode === 'group' && chatCode ? setInviting('sheet') : openStep(model.now)) }
    : null;

  const NAV: { k: UTab | 'lost' | 'qibla'; l: string }[] = onSite
    ? [{ k: 'rite', l: _t("Обряд") }, { k: 'people', l: _t("Люди") }, { k: 'lost', l: 'SOS' }, { k: 'know', l: _t("Знания") }, { k: 'qibla', l: _t("Кибла") }]
    : [{ k: 'path', l: _t("Путь") }, { k: 'people', l: _t("Люди") }, { k: 'docs', l: _t("Документы") }, { k: 'know', l: _t("Знания") }];
  const navOn = tab === 'step' ? 'path' : tab === 'duas' ? 'know' : tab;
  const unread = chatOn && tab !== 'people' ? chat.msgs.filter((m) => m.ref?.tr === tripHost && m.id > chat.seen && m.uid !== me).length : 0;

  const trip = tripHost ? trips[tripHost] : null;
  const title = groupHost && trips[groupHost] ? trips[groupHost].title : _t("Моя умра");
  const sub = onSite ? _t("Ляббайк, Аллахумма ляббайк") : from && left! > 0 ? _tj("Вылет через {0} {1} · {2}{3}", left, plural(left!, _t("день"), _t("дня"), _t("дней")), dLabel(from), to ? ` – ${dLabel(to)}` : '') : _t("Одна поездка, один путь: от намерения до возвращения");

  // Called or looking at someone else's trip and not answered yet: the answer comes first, where it can't be missed.
  const myS = me && tripHost ? rsvp[me]?.[tripHost]?.s : undefined;
  const call = circle ? umrahCall(rawApi, circle.reacts, today) : null;
  const caller = call && call.h === tripHost ? call.c : tripHost;
  const answer = (s: 'go' | 'maybe' | 'no') => { if (tripHost) api.respond(tripHost, { s, ready: model.ready }); };
  const ask = trip && tripHost && me && me !== tripHost && myS !== 'go' && myS !== 'no' ? (
    <div className="um-ask">
      <small>{caller && call?.h === tripHost ? _tj("{0} зовёт тебя на умру", nameOf(caller)) : _tj("{0} собирает умру", nameOf(tripHost))}</small>
      <b>{trip.title}</b>
      {trip.month && <span>{trip.month}{trip.city ? _t(" · из {0}", trip.city) : ''}</span>}
      <div className="um-ask-b">
        <button type="button" className="gold-btn" onClick={() => answer('go')}>{_t("Еду")}</button>
        <button type="button" className="ghost-btn" aria-pressed={myS === 'maybe'} onClick={() => answer('maybe')}>{myS === 'maybe' ? _t("Думаю ✓") : _t("Думаю")}</button>
        <button type="button" className="link-btn" onClick={() => answer('no')}>{_t("Не в этот раз")}</button>
      </div>
    </div>
  ) : null;
  const people = tripHost ? <>{ask}<People host={tripHost} api={api} names={circle?.names} nameOf={nameOf} onInvite={chatCode ? () => setInviting('sheet') : undefined} onOpen={() => go('people')} /></> : null;

  const deedList = (step: number) => {
    const l = PREP.filter((p) => DEED_STEP[p.id] === step && p.id !== 'tickets');
    if (!l.length) return null;
    return (
      <div className="mp-deeds">
        {l.map((p) => (
          <div key={p.id} className="pp-deed">
            <label className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}{p.must && <em className="pp-must">{_t("обязательно")}</em>}</b><small>{_tj("за {0} до поездки", p.when)}</small></span></label>
            {p.how && <details><summary>{_t("Как это сделать")}</summary><p>{p.how}</p></details>}
          </div>
        ))}
      </div>
    );
  };

  const ritesList = (
    <>
      <button type="button" className="q-row" onClick={() => setMiqat(true)}>
        <span className="q-n">✈</span>
        <span className="q-t"><b>{u.ihram ? _t("Я в ихраме") : _t("Микат в самолёте")}</b><small>{u.ihram ? _t("Тальбия и запреты") : _t("Таймер до намерения по времени посадки")}</small></span>
      </button>
      {STEPS.map((s, i) => (
        <button type="button" key={s.id} className="q-row" onClick={() => setStep(s)}>
          <span className="q-n">{i + 1}</span>
          <span className="q-t"><b>{s.title}</b><small>{s.short}{s.counter ? ` · ${u[s.counter]}/7` : ''}</small></span>
        </button>
      ))}
      <Badal />
      <h3>{_t("Медина")}</h3>
      <MadinahGuide />
      <h3>{_t("Запреты в ихраме")}</h3>
      <ul className="rules">{IHRAM_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      <p className="tiny">{_t("Гид описывает умру по сунне в общих чертах. Детали различаются по мазхабам: уточняй у своего имама или руководителя группы.")}</p>
    </>
  );

  const MODES: { m: NonNullable<UmrahState['mode']>; ic: string; t: string; s: string }[] = [
    { m: 'group', ic: '👥', t: _t("Еду с братьями или семьёй"), s: _t("Соберу группу или меня позвали. Даты, билеты, жильё и деньги вместе") },
    { m: 'solo', ic: '🚶', t: _t("Еду один"), s: _t("Свой путь без группы. По желанию попутчики") },
    { m: 'agency', ic: '🧳', t: _t("Еду с агентством"), s: _t("Билеты и отель берёт агентство. Остаются сердце, документы, знания") },
    { m: 'dream', ic: '🌱', t: _t("Пока только мечтаю"), s: _t("Копилка и подготовка сердца. Поездку добавишь позже") },
  ];
  const pickMode = (m: NonNullable<UmrahState['mode']>) => {
    setMode(m);
    if (m === 'group' && !groupHost) go('people');
    else if (m === 'agency' && !u.agency) { setStepI(0); go('step'); }
    else go('path');
  };
  const modeChips = (
    <div className="mp-modes">
      {MODES.map((x) => <button key={x.m} type="button" aria-pressed={mode === x.m} onClick={() => pickMode(x.m)}>{x.ic} {x.t}</button>)}
    </div>
  );

  const dateInputs = (
    <div className="up-add">
      <input type="date" defaultValue={u.from} onChange={(e) => update((s) => patch(s, { from: e.target.value || undefined }))} aria-label={_t("Вылет")} />
      <input type="date" defaultValue={u.to} onChange={(e) => update((s) => patch(s, { to: e.target.value || undefined }))} aria-label={_t("Возвращение")} />
    </div>
  );
  const plan = (show: number[]) => groupHost && trips[groupHost] ? <UmrahPlan host={groupHost} trip={trips[groupHost]} api={api} nameOf={nameOf} going={goingIds} show={show} /> : null;

  const guideCard = isCloud && gProbe.ok ? <button type="button" className="um-card" onClick={() => { setPeopleView('guides'); go('people'); }}><b>🧭 {_t("Найти гида")}</b><small>{_t("проверенные гиды в Мекке, Медине и готовые вылететь ›")}</small></button> : null;

  function stepBody(i: number) {
    switch (model.steps[i].id) {
      case 'gather': return (
        <>
          {groupHost ? (
            <>
              {people}
              {chatCode && <button type="button" className="pri-btn" onClick={() => setInviting('sheet')}>{_t("+ Позвать в поездку")}</button>}
              {plan([0])}
              {guideCard}
            </>
          ) : (
            <>
              <p className="tiny">{_t("Как ты едешь? Путь один и тот же, меняются только шаги про билеты и деньги.")}</p>
              {modeChips}
              {mode === 'group' && <button type="button" className="um-card" onClick={() => go('people')}><b>👥 {_t("Собрать группу")}</b><small>{_t("в Круге: позови братьев или найди группу ›")}</small></button>}
              {mode === 'solo' && <button type="button" className="um-card" onClick={() => { setPeopleView('open'); go('people'); }}><b>👀 {_t("Найти попутчиков")}</b><small>{_t("группы, которые ищут людей ›")}</small></button>}
              {(mode === 'solo' || mode === 'group') && guideCard}
              {mode === 'agency' && (
                <label className="field"><span>{_t("Агентство")}</span><input defaultValue={u.agency ?? ''} placeholder={_t("Название агентства")} onBlur={(e) => update((s) => patch(s, { agency: e.target.value.trim() || undefined }))} /></label>
              )}
              {mode === 'dream' && <p className="tiny">{_t("Начни с копилки и сердца. Когда решишь, как поедешь, просто выбери вариант выше.")}</p>}
            </>
          )}
        </>
      );
      case 'dates': return (
        <>
          {groupHost ? plan([1]) : (
            <>
              <p className="tiny">{mode === 'agency' ? _t("Даты из договора с агентством.") : _t("Укажи дни, и путь будет подсказывать, что делать сейчас.")}</p>
              {dateInputs}
            </>
          )}
          <WhenToGo today={today} />
        </>
      );
      case 'travel': return (
        <>
          {mode === 'agency' ? <p className="tiny">{_t("Билеты и отель берёт агентство. Добавь их брони в «Документы», чтобы они были с тобой без интернета.")}</p>
            : groupHost ? plan([2, 3])
            : <UmrahBook state={state} update={update} from={from} to={to} />}
        </>
      );
      case 'money': return (
        <>
          <UmrahSavings state={state} update={update} today={today} api={rawApi} nameOf={nameOf} />
          {groupHost && <h3>{_t("Общая касса")}</h3>}
          {plan([5])}
          <PassCard isHost={!groupHost || me === groupHost} going={Math.max(1, goingIds.length)} />
        </>
      );
      case 'road': return (
        <>
          <button type="button" className="pri-btn" onClick={() => setMiqat(true)}>{_t("✈ Микат в самолёте: указать рейс")}</button>
          <OnSiteSetup state={state} update={update} />
          {guideCard}
          {plan([6])}
          {deedList(5)}
          <WalkPlan state={state} update={update} today={today} left={left} />
          <h3>{_t("План дня на месте")}</h3>
          <DayPlan state={state} update={update} today={today} />
        </>
      );
      default: return null;
    }
  }

  const ring = (
    <div className="mp-ready">
      <div className="mp-ring" style={{ background: `conic-gradient(var(--um-ok, #2f9e66) 0 ${model.ready}%, var(--um-track, rgba(140,120,80,.18)) ${model.ready}% 100%)` }}><b>{model.ready}%</b></div>
      <div className="mp-bars">
        {[[_t("Сердце"), model.heart], ...(mode === 'dream' ? [] : [[_t("Дела"), model.tasks]]), [_t("Деньги"), model.money]].map(([l, v]) => (
          <div key={l as string}><span>{l}</span><i><em style={{ width: `${v}%` }} /></i><small>{v}%</small></div>
        ))}
        <small className="mp-cap">{_t("Готовность к умре · та же цифра в Целях")}</small>
      </div>
    </div>
  );

  return (
    <div className={`um-app${dark ? ' um-dk' : ''}${tab === 'people' && chatOn && peopleView === 'mine' ? ' um-chat' : ''}`}>
      <div className="um-top">
        <button type="button" className="um-out" onClick={tab === 'step' ? () => go('path') : tab === 'duas' ? () => go('know') : onExit}>
          ← {tab === 'step' ? _t("Путь") : tab === 'duas' ? _t("Знания") : backLabel === _t("Круг") ? _t("Круг") : 'Living Muslim'}
        </button>
        <span className="um-top-r">
          <button type="button" className="um-theme" onClick={flipTheme} aria-label={dark ? _t("Светлая тема") : _t("Тёмная тема")}>{dark ? '☀' : '🌙'}</button>
          <span className="um-badge">{onSite ? _t("Умра · на месте") : _t("Умра")}</span>
        </span>
      </div>

      {roll && me !== roll.by && tab !== 'people' && rollCall}

      {tab === 'path' && !mode && !tripHost && phase === 'none' && (
        <div className="um-sec">
          <div className="um-title"><h1>{_t("Моя умра")}</h1><small>{_t("Одна поездка, один путь: от намерения до возвращения")}</small></div>
          {phase === 'none' && isCloud && myCircles().length > 1 && (
            <div className="um-other">
              <b>{_tj("Поездки группы живут в Круге. Сейчас открыт «{0}», здесь поездок нет.", currentCircle()?.title ?? _t("Круг"))}</b>
              <small>{_t("Если поездка в другом круге, открой его:")}</small>
              <div>{myCircles().filter((c) => c.code !== currentCircle()?.code).map((c) => (
                <button key={c.code} type="button" onClick={() => { try { sessionStorage.setItem('lm.umrahGo', '1'); } catch { /* */ } switchCircle(c.code); }}>{c.title || _t("Круг")} ›</button>
              ))}</div>
            </div>
          )}
          <div className="mp-start">
            {MODES.map((x) => (
              <button key={x.m} type="button" onClick={() => pickMode(x.m)}>
                <span className="ic">{x.ic}</span><span><b>{x.t}</b><small>{x.s}</small></span>
              </button>
            ))}
          </div>
          {isCloud && <button type="button" className="um-card mp-open" onClick={() => { setPeopleView('open'); go('people'); }}><b>👀 {_t("Группы, которые ищут людей")}</b><small>{_t("присоединиться ›")}</small></button>}
          <p className="tiny">{_t("Любой вариант даёт одну цифру готовности, путь по шагам и документы в телефоне.")}</p>
        </div>
      )}

      {tab === 'path' && (mode || tripHost || phase !== 'none') && (
        <div className="um-sec">
          <div className="um-title"><h1>{title}</h1>{sub && <small>{sub}</small>}</div>
          {people}
          {unread > 0 && <button type="button" className="um-card um-unread" onClick={() => go('people')}><b>💬 {_tj("Новых в чате группы: {0}", unread)}</b><small>{_t("Открыть ›")}</small></button>}
          {u.ihram && <button type="button" className="um-ihram" onClick={() => setMiqat(true)}><b>{_t("Ты в ихраме")}</b><small>{_t("тальбия и запреты ›")}</small></button>}
          {onSite && <div className="um-now"><b>{_t("Ты в пути. Ляббайк, Аллахумма ляббайк")}</b><p>{_tj("Гид работает без интернета. Таваф {0}/7, саи {1}/7.", u.tawaf, u.saee)}</p><button type="button" className="pri-btn" onClick={() => go('rite')}>{_t("Открыть обряд")}</button></div>}
          {phase === 'after' && (
            <div className="um-now">
              <b>{_t("Умра позади. Да примет Аллах")}</b>
              <p>{_t("Сохрани это состояние: оставь одну привычку из поездки и не возвращайся к тому, от чего покаялся.")}</p>
              <StoryButton state={state} from={from} to={to} />
              <FortyDays state={state} update={update} today={today} />
              <Diary state={state} update={update} today={today} prompt={_t("Что ты привёз из умры? Что хочешь сохранить?")} />
            </div>
          )}
          {phase === 'done' && <div className="um-now"><b>{_t("Да примет Аллах твою умру")}</b><p>{_t("Если собираешься снова, укажи новые даты в шаге «Даты».")}</p></div>}
          {!onSite && phase !== 'after' && ring}
          {!onSite && phase !== 'after' && (
            <div className="mp-tl">
              {model.steps.map((st, i) => (
                <button key={st.id} type="button" className={`${st.ok ? 'ok' : ''}${i === model.now ? ' now' : ''}`} onClick={() => openStep(i)}>
                  <i>{st.ok ? '✓' : i + 1}</i>
                  <span><b>{st.t}</b><small>{st.s}</small>{i === model.now && <em>{st.next} ›</em>}</span>
                </button>
              ))}
            </div>
          )}
          <Hint id="umrah" />
          {left !== null && left > 0 && <UmrahShareBtn left={left} group={groupMembers.length > 1} />}
          <UmrahLive />
          <YearAgo state={state} today={today} />
        </div>
      )}

      {tab === 'step' && (
        <div className="um-sec mp-step">
          <div className="um-title"><small>{_tj("Шаг {0} из 6", stepI + 1)}</small><h1>{model.steps[stepI].t}</h1><small>{model.steps[stepI].s}</small></div>
          {stepBody(stepI)}
          {deedList(stepI)}
          {stepI < 5 && <button type="button" className="ghost-btn mp-nextstep" onClick={() => openStep(stepI + 1)}>{_tj("Дальше: {0} ›", model.steps[stepI + 1].t)}</button>}
        </div>
      )}

      {tab === 'rite' && (
        <div className="um-sec">
          {riteStep ? (
            <div className="um-rite">
              <button type="button" className="um-rite-h" onClick={() => setStep(riteStep)}><b>{riteStep.title}</b><small>{riteStep.short} ›</small></button>
              <Ring n={riteN} />
              <div className="um-rite-btns">
                <button type="button" className="um-rite-undo" disabled={riteN === 0} onClick={() => lap(-1)} aria-label={_t("Назад на круг")}>−1</button>
                <button type="button" className="um-rite-go" onClick={() => { try { navigator.vibrate?.(20); } catch { /* */ } lap(1); }}>{riteN === 6 ? _t("Последний круг ✓") : _t("Круг пройден ✓")}</button>
              </div>
              <button type="button" className="link-btn" onClick={() => setStep(riteStep)}>{_t("Дуа и подсказки этого обряда ›")}</button>
            </div>
          ) : (
            <div className="um-rite"><b className="um-rite-done">{_t("Таваф и саи завершены. Да примет Аллах")}</b><p className="tiny">{_t("Дальше бритьё или укорачивание волос, и ты выходишь из ихрама.")}</p></div>
          )}
          <WakeLock />
          {canCall && rollCall}
          <LeaveForPrayer state={state} />
          <DayPlan state={state} update={update} today={today} />
          <button type="button" className="um-card um-duas" onClick={() => go('duas')}><b>🤲 {_t("Дуа и просьбы из Круга")}</b><small>{asks.length ? _tj("{0} из {1} сделано ›", asks.filter((a) => u.asked?.includes(a.key)).length, asks.length) : _t("мой список ›")}</small></button>
          <div className="os-row">
            <button type="button" onClick={() => setLost(true)}>{_t("🆘 Я потерялся")}</button>
            <button type="button" onClick={() => { setStepI(5); go('step'); }}>📍 {u.site?.meet ? u.site.meet : _t("Точка встречи")}</button>
          </div>
          <Diary state={state} update={update} today={today} />
          <h3>{_t("Все обряды")}</h3>
          {ritesList}
        </div>
      )}

      {tab === 'know' && (
        <div className="um-sec">
          <div className="um-title"><h1>{_t("Знания")}</h1><small>{_t("Знание и сердце. Работает без интернета")}</small></div>
          <UmrahVideos u={u} update={update} />
          <h3>{_t("Сердце")} <small>{model.heart}%</small></h3>
          {PREP.filter((p) => HEART.includes(p.id)).map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}</b><small>{_tj("за {0} до поездки", p.when)}</small></span></label>
          ))}
          <TalbiyaLearn state={state} update={update} />
          <button type="button" className="um-card um-duas" onClick={() => go('duas')}>
            <b>🤲 {_t("Дуа")}</b>
            <small>{_tj("мои: {0}{1} ›", u.duas.length, asks.length ? _t(" · просят из Круга: {0}", asks.length) : '')}</small>
          </button>
          <h3>{_t("Обряды по шагам")}</h3>
          {ritesList}
        </div>
      )}

      {tab === 'duas' && (
        <div className="um-sec">
          <div className="um-title"><h1>{_t("Дуа")}</h1></div>
          {asks.length > 0 && (
            <>
              <h3>{_t("Просят из Круга ")}<small>{_tj("{0} из {1}", asks.filter((a) => u.asked?.includes(a.key)).length, asks.length)}</small></h3>
              {asks.map((a) => (
                <label key={a.key} className="chk">
                  <input type="checkbox" checked={Boolean(u.asked?.includes(a.key))} onChange={() => toggleAsk(a.key)} />
                  <span><b style={u.asked?.includes(a.key) ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{a.text}</b><small>{nameOf(a.who)}</small></span>
                </label>
              ))}
              <h3>{_t("Мои")}</h3>
            </>
          )}
          <DuaList state={state} update={update} />
        </div>
      )}

      {tab === 'docs' && (
        <>
          <UmrahDocs state={state} update={update} today={today} api={rawApi} hosts={myTrips} host={groupHost ?? null} going={goingIds} canSee={canCall} nameOf={nameOf} to={to} />
          <div className="um-sec">{deedList(3) && <><h3>{_t("Разрешения и прививка")}</h3>{deedList(3)}</>}</div>
        </>
      )}

      {tab === 'people' && (
        <PeopleTab becomeFirst={umOpen === 'become'} code={chatCode} onAccepted={(uid, name) => callTo(uid, name, me)} view={peopleView} setView={setPeopleView} api={api} me={me} tripHost={tripHost} hosts={newest} onPick={setPick}
          people={<>{people}{rollCall}</>} myReady={model.ready} nameOf={nameOf} onInvite={chatCode && tripHost ? () => setInviting('sheet') : undefined}
          radar={onSite && groupHost && me ? <GroupRadar state={state} update={update} api={rawApi} host={groupHost} members={groupMembers} nameOf={nameOf} /> : null}
          chat={chatOn && tripHost && circle?.me ? (
            <CircleChat chat={chat} me={circle.me} names={circle.names} members={circle.members} reacts={circle.reacts} today={today} isOwner={circle.isOwner} state={state} update={update}
              draft={null} onDraftUsed={() => {}} onAmin={(asker) => circle.react(`a:${asker}`, '🤲', today)} title={trips[tripHost]?.title ?? _t("Умра")}
              topic={tripHost} placeholder={_t("Написать группе поездки…")} emptyNote={_t("Здесь переписка только этой поездки: билеты, отель, встреча. Голос, фото и файлы тоже можно. Видят люди Круга.")} />
          ) : null}
          noChat={!me ? _t("Чтобы поехать группой, войди в Круг: там собираются поездки, даты, жильё и общая касса.") : !chatCode ? _t("Чат поездки работает в Круге на сайте Living Muslim.") : ''} />
      )}

      {next && (tab === 'path' || (tab === 'rite' && !onSite)) && (
        <button type="button" className="um-next" onClick={next.go}><span><em>{next.k}</em><b>{next.t}</b></span><i>›</i></button>
      )}

      {inviting === 'sheet' && chatCode && <InviteSheet code={chatCode} title={trip?.title ?? _t("Умра")} onNick={() => setInviting('nick')} onClose={() => setInviting('')} />}

      <nav className={`um-nav${onSite ? ' five' : ''}`} aria-label={_t("Умра")}>
        {NAV.map((n) => (
          <button key={n.k} type="button" className={`${navOn === n.k ? 'on' : ''}${n.k === 'lost' ? ' sos' : ''}`} aria-current={navOn === n.k ? 'page' : undefined}
            onClick={() => { try { navigator.vibrate?.(8); } catch { /* */ } if (n.k === 'lost') setLost(true); else if (n.k === 'qibla') setQibla(true); else go(n.k); }}>
            <span className="k" aria-hidden="true">{n.k === 'lost' ? '!' : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{UM_ICONS[n.k] ?? UM_ICONS.path}</svg>}{n.k === 'people' && unread > 0 && <i className="nav-badge">{unread > 9 ? '9+' : unread}</i>}</span>
            <small>{n.l}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Line icons for the umrah keys, drawn like the main app's tab keys. */
const UM_ICONS: Record<string, React.ReactNode> = {
  path: <><path d="M5 20c3-3 2-7 7-8s6-5 6-8" /><circle cx="5" cy="20" r="1.5" /><circle cx="18" cy="4" r="1.5" /></>,
  know: <><path d="M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0z" /><path d="M12 5.5V19" /></>,
  rite: <><path d="M4 8l8-4 8 4v10l-8 3-8-3z" /><path d="M4 8l8 3 8-3M12 11v10" /><path d="M4 11.5l8 3 8-3" /></>,
  prep: <><path d="M9 4h6v3H9z" /><path d="M7 5H5v16h14V5h-2" /><path d="M8.5 13l2.5 2.5 4.5-5" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.9.1 5 2.3 5 5.3" /></>,
  docs: <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M8 13h8M8 16h5" /></>,
  money: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M3 11h18" /><circle cx="16.5" cy="15.5" r="1.4" /><path d="M6 7l9-3.5 2 3.5" /></>,
  duas: <><path d="M8 21v-6l-3-4 1-6 2 5" /><path d="M16 21v-6l3-4-1-6-2 5" /><path d="M12 3v3M10 5h4" /></>,
  qibla: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
};

type UTab = 'path' | 'step' | 'people' | 'docs' | 'know' | 'duas' | 'rite';

/** The tawaf or sa'i ring: 7 arcs, the done ones gold. */
function Ring({ n }: { n: number }) {
  const R = 70, C = 2 * Math.PI * R, seg = C / 7;
  return (
    <div className="um-ring">
      <svg viewBox="0 0 170 170" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx="85" cy="85" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
            stroke={i < n ? 'var(--gold)' : 'rgba(255,255,255,.12)'} strokeDasharray={`${seg - 6} ${C - seg + 6}`} strokeDashoffset={-i * seg + C / 4} />
        ))}
      </svg>
      <div><b>{Math.min(7, n + (n < 7 ? 1 : 0))}</b><small>{n >= 7 ? _t("все 7") : _t("круг из 7")}</small></div>
    </div>
  );
}

/** Keeps the screen on while the rite screen is open. */
function WakeLock() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null; let off = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } };
    const get = () => nav.wakeLock?.request('screen').then((l) => { if (off) l.release(); else lock = l; }).catch(() => {});
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { off = true; lock?.release().catch(() => {}); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return <p className="tiny um-awake">{_t("☀ Экран не гаснет, пока открыт обряд")}</p>;
}

/** Brothers of the trip as avatars: going, thinking, silent, and a button to call someone in. */
function People({ host, api, names, nameOf, onInvite, onOpen }: { host: string; api: UmrahApi; names?: CircleApi['names']; nameOf: (id: string) => string; onInvite?: () => void; onOpen?: () => void }) {
  const t = api.trips[host];
  const st = (id: string) => api.rsvp[id]?.[host]?.s;
  const ids = [...new Set([host, ...Object.keys(api.rsvp).filter((id) => st(id))])].filter((id) => st(id) !== 'no');
  ids.sort((a, b) => Number(st(b) === 'go') - Number(st(a) === 'go'));
  const label = (id: string) => (t?.amir === id ? _t("амир") : st(id) === 'go' ? _t("едет") : st(id) === 'maybe' ? _t("думает") : _t("молчит"));
  return (
    <div className="um-ppl">
      {ids.map((id) => {
        const p = names?.[id];
        const nm = (p?.name || nameOf(id) || '?');
        return (
          <button type="button" key={id} className={`um-av ${st(id) ?? 'silent'}`} onClick={onOpen}>
            {p?.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <span style={{ background: p?.color || '#d9ad55' }}>{nm.slice(0, 1).toUpperCase()}</span>}
            <small>{nm.split(' ')[0]}</small><em>{label(id)}</em>
          </button>
        );
      })}
      {onInvite && <button type="button" className="um-av add" onClick={onInvite}><span>+</span><small>{_t("Позвать")}</small><em>&nbsp;</em></button>}
    </div>
  );
}

/** «Позвать в поездку»: send the link to WhatsApp, Telegram or anywhere, or invite by nick inside the app.
 *  The link joins the Circle and opens this umrah's group. */
function InviteSheet({ code, title, onNick, onClose }: { code: string; title: string; onNick: () => void; onClose: () => void }) {
  const [nicks, setNicks] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { nicksReady().then(setNicks); }, []);
  const url = `${inviteLink(code)}&umrah=group`;
  const text = _tj("Ассаляму алейкум! Собираемся на умру вместе: «{0}». Присоединяйся, там даты, задачи и наш чат:", title);
  const full = `${text}\n${url}`;
  const more = async () => { try { if (navigator.share) await navigator.share({ title: _t("Умра вместе"), text, url }); else { await navigator.clipboard.writeText(full); setNote(_t("Ссылка скопирована")); } } catch { /* cancelled */ } };
  const copy = async () => { try { await navigator.clipboard.writeText(full); setNote(_t("Ссылка скопирована")); } catch { setNote(url); } };
  return (
    <div className="um-sheet-bg" onClick={onClose}>
      <div className="um-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={_t("Позвать в поездку")}>
        <div className="um-sheet-h"><b>{_t("Позвать в поездку")}</b><button type="button" onClick={onClose} aria-label={_t("Закрыть")}>✕</button></div>
        <p className="tiny">{_t("Человек откроет ссылку, вступит в Круг и сразу попадёт в группу поездки.")}</p>
        <div className="um-sgrid">
          <a href={`https://wa.me/?text=${encodeURIComponent(full)}`} target="_blank" rel="noopener noreferrer" className="wa"><i>🟢</i>WhatsApp</a>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="tg"><i>✈️</i>Telegram</a>
          <button type="button" onClick={more}><i>↗</i>{_t("Другое")}</button>
          <button type="button" onClick={copy}><i>🔗</i>{_t("Копировать")}</button>
        </div>
        {nicks && <button type="button" className="um-nick" onClick={onNick}><b>@ {_t("Найти по нику в Living Muslim")}</b><small>{_t("Приглашение придёт ему в приложение, в Круг")}</small></button>}
        {note && <p className="tiny um-note">{note}</p>}
      </div>
    </div>
  );
}

/** «Люди»: my group (faces, roll call, chat) and the groups that look for people, behind one switch. */
function PeopleTab({ becomeFirst, code, onAccepted, view, setView, api, me, tripHost, hosts, onPick, people, myReady, nameOf, chat, noChat, radar, onInvite }: {
  becomeFirst?: boolean; code?: string; onAccepted: (uid: string, name: string) => void; view: PView; setView: (v: PView) => void;
  api: UmrahApi; me: string | null; tripHost: string | null; hosts: string[]; onPick: (h: string) => void; people: React.ReactNode; myReady: number;
  nameOf: (id: string) => string; chat: React.ReactNode; noChat: string; radar: React.ReactNode; onInvite?: () => void;
}) {
  const asks = useUmrahAsks(isCloud);
  const open = useOpenList(isCloud);
  const guides = useGuides(isCloud);
  useEffect(() => { if (view === 'open') open.reload(); if (view === 'guides') guides.reload(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const gOn = guides.ok !== false, oOn = asks.ok !== false;
  const seg = isCloud && (gOn || oOn) ? (
    <div className="seg uo-seg">
      <button type="button" aria-pressed={view === 'mine'} onClick={() => setView('mine')}>{_t("Группа")}</button>
      {gOn && <button type="button" aria-pressed={view === 'guides'} onClick={() => setView('guides')}>{guides.list?.length ? _tj("Гиды · {0}", guides.list.length) : _t("Гиды")}</button>}
      {oOn && <button type="button" aria-pressed={view === 'open'} onClick={() => setView('open')}>{open.list?.length ? _tj("Ищут людей · {0}", open.list.length) : _t("Ищут людей")}</button>}
    </div>
  ) : null;
  const head = <div className="um-title"><h1>{_t("Люди")}</h1></div>;
  if (view === 'open' && seg && oOn) return <div className="um-sec um-group">{head}{seg}<OpenGroups list={open.list} reload={open.reload} /></div>;
  if (view === 'guides' && seg && gOn) return <div className="um-sec um-group">{head}{seg}<GuidesPane becomeFirst={becomeFirst} list={guides.list} reload={guides.reload} code={tripHost && code ? code : null} /></div>;
  if (!me) return <div className="um-sec">{head}{seg}<p className="tiny">{noChat}</p></div>;
  if (!tripHost) return <div className="um-sec">{head}{seg}<UmrahTrips api={api} myReady={myReady} nameOf={nameOf} embedded /></div>;
  const trip = api.trips[tripHost];
  const going = 1 + Object.keys(api.rsvp).filter((id) => id !== tripHost && api.rsvp[id]?.[tripHost]?.s === 'go').length;
  const myAsks = me && api.trips[me] ? <AsksToMe asks={asks.to_me} title={api.trips[me].title} onAccepted={onAccepted} /> : null;
  return (
    <div className="um-sec um-group">
      <div className="um-title"><h1>{_t("Люди")}</h1><small>{trip.title}{trip.month ? ` · ${trip.month}` : ''}{trip.city ? _t(" · из {0}", trip.city) : ''}</small></div>
      {seg}
      {myAsks}
      {hosts.length > 1 && (
        <div className="um-trips">{hosts.map((h) => <button key={h} type="button" aria-pressed={h === tripHost} onClick={() => onPick(h)}>{api.trips[h].title}</button>)}</div>
      )}
      {people}
      {radar}
      {onInvite && <button type="button" className="ghost-btn mp-invite" onClick={onInvite}>{_t("+ Позвать в поездку")}</button>}
      {tripHost === me && code && asks.ok !== false && <OpenSwitch code={code} going={going} />}
      {!chat && noChat && <p className="tiny">{noChat}</p>}
      {chat && <h3>{_t("Чат поездки")}</h3>}
      {chat}
    </div>
  );
}

/** Video lessons: how to perform umrah, in Russian or English, played right here. */
function UmrahVideos({ u, update }: { u: UmrahState; update: Props['update'] }) {
  const [lang, setLang] = useState<'ru' | 'en'>(u.vlang ?? 'ru');
  const [play, setPlay] = useState<string | null>(null);
  const c = UMRAH_VIDEOS.find((x) => x.lang === lang)!;
  const seen = u.watched ?? [];
  const done = c.lessons.filter((l) => seen.includes(l.id)).length;
  const mark = (id: string) => update((s) => { const w = umrahOf(s).watched ?? []; return patch(s, { watched: w.includes(id) ? w : [...w, id] }); });
  const pick = (l: 'ru' | 'en') => { setLang(l); setPlay(null); update((s) => patch(s, { vlang: l })); };
  return (
    <div className="um-vid">
      <div className="um-vid-top">
        <span><b>{_t("▶ Как совершить умру")}</b><small>{_tj("{0} · {1} из {2}", c.by, done, c.lessons.length)}</small></span>
        <div className="um-lang">{(['ru', 'en'] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => pick(l)}>{l.toUpperCase()}</button>)}</div>
      </div>
      {play && (
        <div className="um-player">
          <iframe src={embed(play)} title={_t("Видеоурок")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      <div className="um-lessons">
        {c.lessons.map((l, i) => (
          <button key={l.id} type="button" className={`${play === l.id ? 'on' : ''}${seen.includes(l.id) ? ' seen' : ''}`} onClick={() => { setPlay(l.id); mark(l.id); }}>
            <em>{seen.includes(l.id) ? '✓' : i + 1}</em>
            <span>{l.t}</span>
            <small>{mins(l.s)}</small>
          </button>
        ))}
      </div>
      <small className="um-vid-src">{_t("Видео с YouTube, канал автора. Детали различаются по мазхабам, уточняй у своего имама.")}</small>
    </div>
  );
}

/** «Еду на умру»: a picture for family and friends, inviting them to send what to ask for at the Kaaba. */
function UmrahShareBtn({ left, group }: { left: number; group: boolean }) {
  const [st, setSt] = useState('');
  const days = `${left} ${plural(left, _t("день"), _t("дня"), _t("дней"))}`;
  const go = async () => {
    setSt(_t("Готовлю…"));
    const text = _t("{0} на умру, иншаАллах, через {1} 🕋\nНапиши, о чём сделать за тебя дуа у Каабы 🤲\n\nГотовимся в Living Muslim: https://{2}", group ? _t("Мы едем") : _t("Я еду"), days, SITE);
    const r = await shareCard({
      theme: 'night', kicker: _t("Умра · иншаАллах"), title: group ? _t("Мы едем на умру") : _t("Я еду на умру"),
      ar: 'لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ', stats: [[String(left), plural(left, _t("день до вылета"), _t("дня до вылета"), _t("дней до вылета"))]],
      note: _t("Напиши, о чём сделать за тебя дуа у Каабы 🤲"),
    }, 'umra', text);
    setSt(r === 'saved' ? _t("✓ Картинка сохранена, текст скопирован") : r === 'shared' ? _t("✓ Отправлено") : '');
  };
  return <button type="button" className="um-share" onClick={go}>{st || _t("🕋 Рассказать близким и собрать просьбы о дуа")}</button>;
}
