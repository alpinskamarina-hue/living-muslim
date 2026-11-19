import { Hint } from './Guide';
import { currentTheme } from '../theme';
import { useEffect, useMemo, useState } from 'react';
import { shareCard, SITE } from '../share';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { IHRAM_RULES, PREP, STEPS, type Step } from '../umrah/guide';
import { DuaList, StepView, umrahOf, prepPct } from './Umrah';
import { UmrahTrips, TripCard } from './UmrahTrips';
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
import { UmrahBook } from './UmrahBook';
import { PassCard } from './UmrahPlan';
import { GroupDash, GroupPass, RollCall, DayPlan, activeRoll } from './UmrahDash';
import { UmrahDocs } from './UmrahDocs';
import { GroupRadar, useStopSharingAfter } from './UmrahGroup';
import { plural } from '../dates';
import { UMRAH_VIDEOS, embed, mins } from '../umrah/videos';
import { _t, _tj } from '../i18n';

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

const HEART = ['niyya', 'tawba', 'debts', 'learn', 'talbiya', 'duas', 'farewell'];
const daysOf = (when: string) => Number(when.split(' ')[0]) || 0;
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const dLabel = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${[_t("янв"), _t("фев"), _t("мар"), _t("апр"), _t("мая"), _t("июн"), _t("июл"), _t("авг"), _t("сен"), _t("окт"), _t("ноя"), _t("дек")][m - 1]}`; };

export function UmrahHub({ state, update, today, api: rawApi, nameOf, onExit, backLabel, start, circle, joined }: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const [miqat, setMiqat] = useState(false);
  const [lost, setLost] = useState(false);
  const [qibla, setQibla] = useState(false);
  const [inviting, setInviting] = useState<'' | 'sheet' | 'nick'>('');
  const [gsub, setGsub] = useState<'chat' | 'trip' | null>(null);
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

  const [tab, setTab] = useState<UTab>(() => (start === 'trip' || start === 'group' ? 'group' : start === 'duas' ? 'duas' : start === 'heart' ? 'prep' : start === 'rites' ? (onSite ? 'rite' : 'prep') : onSite ? 'rite' : 'now'));
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
  const [pick, setPick] = useState<string | null>(null);
  const tripHost = (pick && trips[pick] ? pick : null) ?? myTrips[0] ?? answered[0] ?? newest[0] ?? null;

  // The trip chat: a branch of the Circle chat, so it needs the Circle and the chat server.
  const chatCode = isCloud && joined && circle?.me ? currentCircle()?.code : undefined;
  const chat = useChat(chatCode, tab === 'group');
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

  const togglePrep = (id: string) => update((s) => patch(s, { prep: umrahOf(s).prep.includes(id) ? umrahOf(s).prep.filter((x) => x !== id) : [...umrahOf(s).prep, id] }));
  const heart = PREP.filter((p) => HEART.includes(p.id));
  const deeds = PREP.filter((p) => !HEART.includes(p.id));
  const pct = (l: typeof PREP) => Math.round((l.filter((p) => u.prep.includes(p.id)).length / l.length) * 100);
  // What to do next: undone items whose time has come, earliest deadline first.
  const due = PREP.filter((p) => !u.prep.includes(p.id) && (left === null || left > 30 ? HEART.includes(p.id) : left <= daysOf(p.when) + 7)).sort((a, b) => Number(Boolean(b.must)) - Number(Boolean(a.must)) || daysOf(b.when) - daysOf(a.when)).slice(0, 3);

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

  if (step) return <div className={`um-app${dark ? ' um-dk' : ''}`}><StepView step={step} state={state} update={update} asks={asks.map((a) => ({ ...a, who: nameOf(a.who) }))} onBack={() => setStep(null)}
    onNext={() => { const i = STEPS.findIndex((x) => x.id === step.id); setStep(STEPS[i + 1] ?? null); }} /></div>;
  if (lost) return <LostCard state={state} onClose={() => setLost(false)} />;
  if (miqat) return <div className={`um-app${dark ? ' um-dk' : ''}`}><MiqatView state={state} update={update} onBack={() => setMiqat(false)} /></div>;
  if (inviting === 'nick' && chatCode) {
    const t = tripHost ? trips[tripHost] : null;
    const url = `${inviteLink(chatCode)}&umrah=group`;
    const called = me && circle ? Object.keys(circle.reacts[me] ?? {}).filter((k) => k.startsWith('u:')).map((k) => k.slice(2)) : [];
    return (
      <div className={`um-app${dark ? ' um-dk' : ''}`}>
        <InviteByNick code={chatCode} onBack={() => { setInviting(''); window.scrollTo(0, 0); }}
          trip={{ title: t?.title ?? _t("Умра"), url, called,
            text: _tj("Ассаляму алейкум! Собираемся на умру вместе: «{0}». Присоединяйся, там даты, задачи и наш чат:", t?.title ?? _t("Умра")),
            onCall: (uid, name) => {
              circle?.react(`u:${uid}`, '🕋', today);
              if (tripHost) emit(tripHost, _tj("позвал в поездку: {0}", name || _t("Участник")));
            } }} />
      </div>
    );
  }
  if (qibla) return <QiblaScreen state={state} update={update} today={today} start="qibla" onClose={() => setQibla(false)} />;

  // The rite in progress on site: tawaf until 7, then sa'i.
  const riteStep = STEPS.find((s) => s.counter && u[s.counter] < 7) ?? null;
  const riteN = riteStep?.counter ? u[riteStep.counter] : 7;
  const lap = (d: number) => riteStep?.counter && update((s) => patch(s, { [riteStep.counter!]: Math.max(0, Math.min(7, umrahOf(s)[riteStep.counter!] + d)) }));

  // A group trip without dates yet: the first steps are the brothers and the dates, not my own dates.
  const going = groupHost ? groupMembers.filter((id) => rsvp[id]?.[groupHost]?.s === 'go' || id === groupHost).length : 0;
  const openTrip = () => { setGsub('trip'); go('group'); };
  const goingIds = groupHost ? groupMembers.filter((id) => rsvp[id]?.[groupHost]?.s === 'go' || id === groupHost) : [];
  const canCall = Boolean(me && groupHost && (me === groupHost || trips[groupHost]?.amir === me));
  const openStep = (i: number) => { try { sessionStorage.setItem('lm.upStep', String(i)); } catch { /* */ } if (groupHost) setPick(groupHost); openTrip(); };
  const roll = groupHost ? activeRoll(rawApi, groupHost) : null;
  const rollCall = groupHost ? <RollCall api={rawApi} host={groupHost} going={goingIds} me={me} nameOf={nameOf} canCall={canCall} emit={(t) => emit(groupHost, t)} /> : null;
  const tripFirst = groupHost && !groupDates && phase === 'none'
    ? going <= 1 ? { k: _t("Следующий шаг"), t: _t("Позвать братьев в поездку"), go: () => setInviting('sheet') } : { k: _t("Следующий шаг"), t: _t("Предложить даты поездки"), go: openTrip }
    : null;
  // The gold bar: always the one next step.
  const book = u.booked ?? [];
  const next: { k: string; t: string; go: () => void } | null =
    onSite ? (riteStep ? { k: _t("Сейчас"), t: _tj("{0}: круг {1} из 7", riteStep.title, riteN + 1), go: () => go('rite') } : null)
    : phase === 'after' ? { k: _t("Сейчас"), t: _t("Сохрани умру: картинка и 40 дней"), go: () => go('now') }
    : tripFirst ? tripFirst
    : due[0] ? { k: _t("Следующий шаг"), t: due[0].text, go: () => go('prep') }
    : !from ? { k: _t("Следующий шаг"), t: _t("Выбери, когда едешь"), go: () => go(tripHost ? 'group' : 'money') }
    : (phase === 'month' || phase === 'week') && book.length < 5 ? { k: _t("Следующий шаг"), t: _tj("Собрать поездку: {0} из 5", book.length), go: () => go('money') }
    : null;

  const NAV: { k: UTab | 'lost' | 'qibla'; ic: string; l: string }[] = onSite
    ? [{ k: 'rite', ic: '🕋', l: _t("Обряд") }, { k: 'group', ic: '📡', l: _t("Группа") }, { k: 'lost', ic: '!', l: _t("Потерялся") }, { k: 'docs', ic: '📁', l: _t("Документы") }, { k: 'qibla', ic: '🧭', l: _t("Кибла") }]
    : [{ k: 'now', ic: '🕋', l: _t("Сейчас") }, { k: 'prep', ic: '✓', l: _t("Подготовка") }, { k: 'group', ic: '👥', l: _t("Группа") }, { k: 'docs', ic: '📁', l: _t("Документы") }, { k: 'money', ic: '💰', l: phase === 'after' || phase === 'done' ? _t("Поездка") : _t("Копилка") }];
  const unread = chatOn && tab !== 'group' ? chat.msgs.filter((m) => m.ref?.tr === tripHost && m.id > chat.seen && m.uid !== me).length : 0;

  const trip = tripHost ? trips[tripHost] : null;
  const title = tab === 'now' && trip && myTrips.includes(tripHost!) ? trip.title : _t("Умра");
  const sub = onSite ? _t("Ляббайк, Аллахумма ляббайк") : from && left! > 0 ? _tj("Вылет через {0} {1} · {2}{3}", left, plural(left!, _t("день"), _t("дня"), _t("дней")), dLabel(from), to ? ` – ${dLabel(to)}` : '') : '';

  const people = tripHost ? <People host={tripHost} api={api} names={circle?.names} nameOf={nameOf} onInvite={chatCode ? () => setInviting('sheet') : undefined} onOpen={() => go('group')} /> : null;

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

  return (
    <div className={`um-app${dark ? ' um-dk' : ''}${tab === 'group' && chatOn ? ' um-chat' : ''}`}>
      <div className="um-top">
        <button type="button" className="um-out" onClick={onExit}>← {backLabel === _t("Круг") ? _t("Круг") : 'Living Muslim'}</button>
        <span className="um-top-r">
          <button type="button" className="um-theme" onClick={flipTheme} aria-label={dark ? _t("Светлая тема") : _t("Тёмная тема")}>{dark ? '☀' : '🌙'}</button>
          <span className="um-badge">{onSite ? _t("Умра · на месте") : _t("Умра")}</span>
        </span>
      </div>

      {roll && me !== roll.by && tab !== 'group' && rollCall}

      {tab !== 'group' && tab !== 'rite' && tab !== 'docs' && (
        <div className="um-title">
          <h1>{title}</h1>
          {sub && <small>{sub}</small>}
        </div>
      )}

      {tab === 'now' && (
        <div className="um-sec">
          {people}
          {unread > 0 && <button type="button" className="um-card um-unread" onClick={() => go('group')}><b>💬 {_tj("Новых в чате группы: {0}", unread)}</b><small>{_t("Открыть ›")}</small></button>}
          {groupHost && <GroupDash api={rawApi} host={groupHost} going={goingIds} me={me} nameOf={nameOf} onStep={openStep} onDocs={() => go('docs')} />}
          {groupHost && <GroupPass going={goingIds} me={me} nameOf={nameOf} />}
          {!groupHost && <div className="um-ready">
            <span><b>{pct(heart)}%</b><small>{_t("сердце")}</small></span>
            <span><b>{pct(deeds)}%</b><small>{_t("дела")}</small></span>
            <span><b>{from ? (left! > 0 ? left : '—') : '—'}</b><small>{from && left! > 0 ? plural(left!, _t("день до вылета"), _t("дня до вылета"), _t("дней до вылета")) : _t("дней до вылета")}</small></span>
          </div>}
          <button type="button" className="um-card um-duas" onClick={() => go('duas')}>
            <b>🤲 {_t("Дуа")}</b>
            <small>{_tj("мои: {0}{1} ›", u.duas.length, asks.length ? _t(" · просят из Круга: {0}", asks.length) : '')}</small>
          </button>
          {u.ihram && (
            <button type="button" className="um-ihram" onClick={() => setMiqat(true)}>
              <b>{_t("Ты в ихраме")}</b><small>{_t("тальбия и запреты ›")}</small>
            </button>
          )}
          <Hint id="umrah" />
          <div className="um-now">
            <em>{_t("Сейчас")}</em>
            {phase === 'none' && groupHost && (
              <>
                <b>{_tj("Поездка «{0}» собрана", trips[groupHost].title)}</b>
                <p>{_t("Дальше три шага. Даты возьмутся из поездки, когда группа их выберет.")}</p>
                <div className="um-steps">
                  <button type="button" onClick={() => setInviting('sheet')}><i>1</i><span><b>{_t("Позови братьев")}</b><small>{_tj("Сейчас едут: {0}", going)}</small></span><em>›</em></button>
                  <button type="button" onClick={openTrip}><i>2</i><span><b>{_t("Предложите даты и выберите лучшие")}</b><small>{trips[groupHost].dates?.length ? _tj("Вариантов: {0}, голосуем", trips[groupHost].dates!.length) : _t("Пока вариантов нет")}</small></span><em>›</em></button>
                  <button type="button" onClick={() => go('money')}><i>3</i><span><b>{_t("Начни копилку")}</b><small>{_t("Сумма и сколько откладывать в неделю")}</small></span><em>›</em></button>
                </div>
              </>
            )}
            {phase === 'none' && !groupHost && !tripHost && isCloud && myCircles().length > 1 && (
              <div className="um-other">
                <b>{_tj("Поездки собираются внутри Круга. Сейчас открыт «{0}», здесь поездок нет.", currentCircle()?.title ?? _t("Круг"))}</b>
                <small>{_t("Если поездка в другом круге, открой его:")}</small>
                <div>{myCircles().filter((c) => c.code !== currentCircle()?.code).map((c) => (
                  <button key={c.code} type="button" onClick={() => { try { sessionStorage.setItem('lm.umrahGo', '1'); } catch { /* */ } switchCircle(c.code); }}>{c.title || _t("Круг")} ›</button>
                ))}</div>
              </div>
            )}
            {phase === 'none' && !groupHost && (
              <>
                <b>{_t("Копилка на умру")}</b>
                <UmrahSavings state={state} update={update} today={today} compact onOpen={() => go('money')} />
                <b>{_t("Когда едешь?")}</b>
                <p>{_t("Укажи дни, и экран будет подсказывать, что делать сейчас. Если едешь группой из Круга, даты возьмутся из поездки.")}</p>
                <div className="up-add">
                  <input type="date" defaultValue={u.from} onChange={(e) => update((s) => patch(s, { from: e.target.value || undefined }))} aria-label={_t("Вылет")} />
                  <input type="date" defaultValue={u.to} onChange={(e) => update((s) => patch(s, { to: e.target.value || undefined }))} aria-label={_t("Возвращение")} />
                </div>
                <p className="tiny">{_t("Пока дат нет, начни с сердца: намерение и покаяние не зависят от билетов.")}</p>
              </>
            )}
            {phase === 'far' && <><b>{_t("Время намерения")}</b><p>{_tj("До вылета {0}  {1}. Самое важное сейчас не билеты, а сердце: ради кого ты едешь. Обнови намерение, попроси прощения, начни учить тальбию.", left, plural(left!, _t("день"), _t("дня"), _t("дней")))}</p>{(u.funds ?? []).some((f) => !f.for) && <UmrahSavings state={state} update={update} today={today} compact onOpen={() => go('money')} />}</>}
            {phase === 'month' && <><b>{_t("Месяц до умры")}</b><p>{_t("Прививка, разрешение в Nusuk, запись в Равду, билеты. И по одному шагу гида в день, чтобы на месте всё было знакомо.")}</p>{left! <= 28 && <WalkPlan state={state} update={update} today={today} left={left} compact />}<UmrahBook state={state} update={update} from={from} to={to} compact /></>}
            {phase === 'week' && <><b>{_t("Последняя неделя")}</b><p>{_t("Вещи, список дуа, договорённости с семьёй и работой. Попрощайся с близкими и оставь садака.")}</p><button type="button" className="pri-btn" onClick={() => setMiqat(true)}>{_t("✈ Микат в самолёте: указать рейс")}</button><UmrahBook state={state} update={update} from={from} to={to} compact /></>}
            {onSite && <><b>{_t("Ты в пути. Ляббайк, Аллахумма ляббайк")}</b><p>{_tj("Гид работает без интернета. Таваф {0}/7, саи {1}/7.", u.tawaf, u.saee)}</p><button type="button" className="pri-btn" onClick={() => go('rite')}>{_t("Открыть обряд")}</button></>}
            {phase === 'after' && (
              <>
                <b>{_t("Умра позади. Да примет Аллах")}</b>
                <p>{_t("Сохрани это состояние: оставь одну привычку из поездки и не возвращайся к тому, от чего покаялся.")}</p>
                <StoryButton state={state} from={from} to={to} />
                <FortyDays state={state} update={update} today={today} />
                <Diary state={state} update={update} today={today} prompt={_t("Что ты привёз из умры? Что хочешь сохранить?")} />
              </>
            )}
            {phase === 'done' && <><b>{_t("Да примет Аллах твою умру")}</b><p>{_t("Если собираешься снова, укажи новые даты в «Поездке».")}</p></>}
            {due.length > 0 && !onSite && phase !== 'after' && !groupHost && (
              <div className="um-due">
                {due.map((p) => (
                  <label key={p.id} className="chk">
                    <input type="checkbox" checked={false} onChange={() => togglePrep(p.id)} />
                    <span><b>{p.text}</b><small>{_tj("{0} · за {1}", HEART.includes(p.id) ? _t("сердце") : _t("дела"), p.when)}</small></span>
                  </label>
                ))}
              </div>
            )}
            {from && phase !== 'none' && <small className="um-dates">{groupDates ? _t("Даты группы") : _t("Мои даты")}: {dLabel(from)}{to ? ` – ${dLabel(to)}` : ''}</small>}
          </div>
          {left !== null && left > 0 && <UmrahShareBtn left={left} group={groupMembers.length > 1} />}
          <UmrahLive />
          <YearAgo state={state} today={today} />
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
            <button type="button" onClick={() => go('money')}>📍 {u.site?.meet ? u.site.meet : _t("Точка встречи")}</button>
          </div>
          <Diary state={state} update={update} today={today} />
          <h3>{_t("Все обряды")}</h3>
          {ritesList}
        </div>
      )}

      {tab === 'prep' && (
        <div className="um-sec">
          <p className="tiny">{_t("Умра начинается задолго до самолёта. Главная подготовка внутри.")}</p>
          <UmrahVideos u={u} update={update} />
          <h3>{_t("Сердце")} <small>{pct(heart)}%</small></h3>
          {heart.map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}</b><small>{_tj("за {0} до поездки", p.when)}</small></span></label>
          ))}
          <TalbiyaLearn state={state} update={update} />
          <h3>{_t("Дела")} <small>{pct(deeds)}%</small></h3>
          {deeds.map((p) => (
            <div key={p.id} className="pp-deed">
              <label className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}{p.must && <em className="pp-must">{_t("обязательно")}</em>}</b><small>{_tj("за {0} до поездки", p.when)}</small></span></label>
              {p.how && <details><summary>{_t("Как это сделать")}</summary><p>{p.how}</p></details>}
            </div>
          ))}
          <WalkPlan state={state} update={update} today={today} left={left} />
          <p className="tiny">{_t("Готовность видна группе только процентом, сами пункты нет.")}</p>
          <h3>{_t("План дня на месте")}</h3>
          <DayPlan state={state} update={update} today={today} />
          <h3>{_t("Обряды по шагам")}</h3>
          {ritesList}
        </div>
      )}

      {tab === 'duas' && (
        <div className="um-sec">
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
        <UmrahDocs state={state} update={update} today={today} api={rawApi} hosts={myTrips} host={groupHost ?? null} going={goingIds} canSee={canCall} nameOf={nameOf} to={to} />
      )}

      {tab === 'money' && (
        <div className="um-sec">
          {(phase === 'none' || phase === 'done') && <WhenToGo today={today} />}
          {phase !== 'there' && phase !== 'after' && phase !== 'done' && <UmrahBook state={state} update={update} from={from} to={to} />}
          <UmrahSavings state={state} update={update} today={today} api={rawApi} nameOf={nameOf} />
          <OnSiteSetup state={state} update={update} />
          {myTrips.length === 0 && <PassCard isHost going={1} />}
          {myTrips.length === 0 && (
            <div className="um-solo">
              <b>{_t("Едешь один или с агентством?")}</b>
              <p className="tiny">{_t("Укажи свои даты, и «Сейчас» будет подсказывать по дням.")}</p>
              <div className="up-add">
                <input type="date" defaultValue={u.from} onChange={(e) => update((s) => patch(s, { from: e.target.value || undefined }))} aria-label={_t("Вылет")} />
                <input type="date" defaultValue={u.to} onChange={(e) => update((s) => patch(s, { to: e.target.value || undefined }))} aria-label={_t("Возвращение")} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'group' && (
        <GroupTab sub={gsub} setSub={setGsub} api={api} me={me} tripHost={tripHost} hosts={newest} onPick={setPick} people={<>{people}{rollCall}</>} myReady={prepPct(state)} nameOf={nameOf}
          onSite={onSite} radar={onSite && groupHost && me ? <GroupRadar state={state} update={update} api={rawApi} host={groupHost} members={groupMembers} nameOf={nameOf} /> : null}
          chat={chatOn && tripHost && circle?.me ? (
            <CircleChat chat={chat} me={circle.me} names={circle.names} members={circle.members} reacts={circle.reacts} today={today} isOwner={circle.isOwner} state={state} update={update}
              draft={null} onDraftUsed={() => {}} onAmin={(asker) => circle.react(`a:${asker}`, '🤲', today)} title={trips[tripHost]?.title ?? _t("Умра")}
              topic={tripHost} placeholder={_t("Написать группе поездки…")} emptyNote={_t("Здесь переписка только этой поездки: билеты, отель, встреча. Голос, фото и файлы тоже можно. Видят люди Круга.")} />
          ) : null}
          noChat={!me ? _t("Чтобы поехать группой, войди в Круг: там собираются поездки, даты, жильё и общая касса.") : !chatCode ? _t("Чат поездки работает в Круге на сайте Living Muslim.") : ''} />
      )}

      {next && tab !== 'group' && tab !== 'docs' && !(tab === 'rite' && onSite) && (
        <button type="button" className="um-next" onClick={next.go}><span><em>{next.k}</em><b>{next.t}</b></span><i>›</i></button>
      )}

      {inviting === 'sheet' && chatCode && <InviteSheet code={chatCode} title={trip?.title ?? _t("Умра")} onNick={() => setInviting('nick')} onClose={() => setInviting('')} />}

      <nav className="um-nav" aria-label={_t("Умра")}>
        {NAV.map((n) => (
          <button key={n.k} type="button" className={`${tab === n.k ? 'on' : ''}${n.k === 'lost' ? ' sos' : ''}`} aria-current={tab === n.k ? 'page' : undefined}
            onClick={() => { try { navigator.vibrate?.(8); } catch { /* */ } if (n.k === 'lost') setLost(true); else if (n.k === 'qibla') setQibla(true); else go(n.k); }}>
            <span className="k" aria-hidden="true">{n.k === 'lost' ? '!' : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{UM_ICONS[n.k] ?? UM_ICONS.now}</svg>}{n.k === 'group' && unread > 0 && <i className="nav-badge">{unread > 9 ? '9+' : unread}</i>}</span>
            <small>{n.l}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Line icons for the umrah keys, drawn like the main app's tab keys. */
const UM_ICONS: Record<string, React.ReactNode> = {
  now: <><path d="M4 8l8-4 8 4v10l-8 3-8-3z" /><path d="M4 8l8 3 8-3M12 11v10" /><path d="M4 11.5l8 3 8-3" /></>,
  rite: <><path d="M4 8l8-4 8 4v10l-8 3-8-3z" /><path d="M4 8l8 3 8-3M12 11v10" /><path d="M4 11.5l8 3 8-3" /></>,
  prep: <><path d="M9 4h6v3H9z" /><path d="M7 5H5v16h14V5h-2" /><path d="M8.5 13l2.5 2.5 4.5-5" /></>,
  group: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.9.1 5 2.3 5 5.3" /></>,
  docs: <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M8 13h8M8 16h5" /></>,
  money: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M3 11h18" /><circle cx="16.5" cy="15.5" r="1.4" /><path d="M6 7l9-3.5 2 3.5" /></>,
  duas: <><path d="M8 21v-6l-3-4 1-6 2 5" /><path d="M16 21v-6l3-4-1-6-2 5" /><path d="M12 3v3M10 5h4" /></>,
  qibla: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
};

type UTab = 'now' | 'prep' | 'group' | 'duas' | 'money' | 'rite' | 'docs';

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

function GroupTab({ sub: sub0, setSub, api, me, tripHost, hosts, onPick, people, myReady, nameOf, chat, noChat, radar, onSite }: {
  sub: 'chat' | 'trip' | null; setSub: (v: 'chat' | 'trip') => void; api: UmrahApi; me: string | null; tripHost: string | null; hosts: string[]; onPick: (h: string) => void; people: React.ReactNode; myReady: number;
  nameOf: (id: string) => string; chat: React.ReactNode; noChat: string; radar: React.ReactNode; onSite: boolean;
}) {
  const sub = !chat ? 'trip' : sub0 ?? 'chat';
  if (!me) return <div className="um-sec"><p className="tiny">{noChat}</p></div>;
  if (!tripHost) return <div className="um-sec"><UmrahTrips api={api} myReady={myReady} nameOf={nameOf} embedded /></div>;
  const trip = api.trips[tripHost];
  return (
    <div className="um-sec um-group">
      <div className="um-title"><h1>{trip.title}</h1><small>{_tj("{0}{1}", trip.month, trip.city ? _t(" · из {0}", trip.city) : '')}</small></div>
      {hosts.length > 1 && (
        <div className="um-trips">{hosts.map((h) => <button key={h} type="button" aria-pressed={h === tripHost} onClick={() => onPick(h)}>{api.trips[h].title}</button>)}</div>
      )}
      {people}
      {radar}
      <div className="seg um-gseg">
        {chat && <button type="button" aria-pressed={sub === 'chat'} onClick={() => setSub('chat')}>{_t("Чат")}</button>}
        <button type="button" aria-pressed={sub === 'trip'} onClick={() => setSub('trip')}>{onSite ? _t("Поездка") : _t("Поездка и задачи")}</button>
      </div>
      {!chat && noChat && <p className="tiny">{noChat}</p>}
      {sub === 'chat' && chat}
      {sub === 'trip' && (
        <div className="umrah-page">
          <TripCard host={tripHost} trip={trip} api={api} nameOf={nameOf} myReady={myReady} open onToggle={() => {}} />
          <UmrahTrips api={api} myReady={myReady} nameOf={nameOf} embedded />
        </div>
      )}
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
