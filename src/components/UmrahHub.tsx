import { Hint } from './Guide';
import { useEffect, useState } from 'react';
import { shareCard, SITE } from '../share';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { IHRAM_RULES, PREP, STEPS, type Step } from '../umrah/guide';
import { DuaList, StepView, umrahOf, prepPct } from './Umrah';
import { UmrahTrips } from './UmrahTrips';
import { MiqatView } from './Miqat';
import { UmrahSavings } from './UmrahSavings';
import { UmrahLive } from './UmrahLive';
import { TalbiyaLearn, WalkPlan } from './UmrahPrep';
import { LeaveForPrayer, LostCard, OnSiteSetup } from './UmrahOnSite';
import { Diary, FortyDays, StoryButton, YearAgo } from './UmrahAfter';
import { Badal, MadinahGuide, WhenToGo } from './UmrahExtra';
import { UmrahBook } from './UmrahBook';
import { PassCard } from './UmrahPlan';
import { GroupRadar, useStopSharingAfter } from './UmrahGroup';
import { plural } from '../dates';
import { UMRAH_VIDEOS, embed, mins } from '../umrah/videos';
import { _t, _tj } from '../i18n';

// One place for the whole umrah: what matters today, the heart, my duas, the rites and the trip.
// Both Practice and the Circle open this screen.

export type HubTab = 'heart' | 'duas' | 'rites' | 'trip';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  api: UmrahApi;
  nameOf: (id: string) => string;
  onExit: () => void;
  backLabel: string;
  start?: HubTab;
}

const HEART = ['niyya', 'tawba', 'debts', 'learn', 'talbiya', 'duas', 'farewell'];
const daysOf = (when: string) => Number(when.split(' ')[0]) || 0;
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const dLabel = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${[_t("янв"), _t("фев"), _t("мар"), _t("апр"), _t("мая"), _t("июн"), _t("июл"), _t("авг"), _t("сен"), _t("окт"), _t("ноя"), _t("дек")][m - 1]}`; };

export function UmrahHub({ state, update, today, api, nameOf, onExit, backLabel, start }: Props) {
  const [tab, setTab] = useState<HubTab>(start ?? 'heart');
  const [step, setStep] = useState<Step | null>(null);
  const [miqat, setMiqat] = useState(false);
  const [lost, setLost] = useState(false);
  const u = umrahOf(state);
  const { me, trips, rsvp, duas } = api;

  // Travel days: the chosen dates of the group trip I am going on, else my own.
  const myTrips = me ? Object.entries(rsvp[me] ?? {}).filter(([h, r]) => r.s === 'go' && trips[h]).map(([h]) => h) : [];
  const groupDates = myTrips.map((h) => trips[h].dates?.find((d) => d.id === trips[h].chosen)).find(Boolean);
  const from = groupDates?.from ?? u.from;
  const to = groupDates?.to ?? u.to;
  const left = from ? diff(today, from) : null;
  const phase = !from ? 'none' : left! > 30 ? 'far' : left! > 6 ? 'month' : left! > 0 ? 'week' : to && diff(today, to) >= 0 ? 'there' : to && diff(to, today) <= 40 ? 'after' : 'done';

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
  const groupHost = myTrips[0];
  const groupMembers = groupHost ? [...new Set([groupHost, ...Object.entries(rsvp).filter(([, r]) => r[groupHost]?.s === 'go').map(([id]) => id)])] : [];
  useStopSharingAfter(state, update, api, phase === 'there');
  useEffect(() => {
    if (phase !== 'there' || !me) return;
    for (const h of myTrips) {
      const made = (u.asked ?? []).filter((k) => k.split(':')[1] === h).sort();
      const cur = [...(rsvp[me]?.[h]?.made ?? [])].sort();
      if (made.join(',') !== cur.join(',')) api.respond(h, { made });
    }
  }, [askedKey, phase, me, myTrips.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAsk = (k: string) => update((s) => { const a = umrahOf(s).asked ?? []; return patch(s, { asked: a.includes(k) ? a.filter((x) => x !== k) : [...a, k] }); });

  if (step) return <StepView step={step} state={state} update={update} asks={asks.map((a) => ({ ...a, who: nameOf(a.who) }))} onBack={() => setStep(null)}
    onNext={() => { const i = STEPS.findIndex((x) => x.id === step.id); setStep(STEPS[i + 1] ?? null); }} />;

  if (lost) return <LostCard state={state} onClose={() => setLost(false)} />;
  if (miqat) return <MiqatView state={state} update={update} onBack={() => setMiqat(false)} />;


  return (
    <div className="page umrah-page">
      <button type="button" className="link-btn um-back" onClick={onExit}>← {backLabel}</button>
      <div className="um-hero">
        <span>🕋</span>
        <h1 className="page-h">{_t("Умра")}</h1>
        <div className="um-ready">
          <span><b>{pct(heart)}%</b><small>{_t("сердце")}</small></span>
          <span><b>{pct(deeds)}%</b><small>{_t("дела")}</small></span>
          <span><b>{from ? (left! > 0 ? left : '—') : '—'}</b><small>{from && left! > 0 ? plural(left!, _t("день до вылета"), _t("дня до вылета"), _t("дней до вылета")) : _t("дней до вылета")}</small></span>
        </div>
      </div>

      {left !== null && left > 0 && <UmrahShareBtn left={left} group={groupMembers.length > 1} />}
      <UmrahLive />
      <YearAgo state={state} today={today} />

      {u.ihram && (
        <button type="button" className="um-ihram" onClick={() => setMiqat(true)}>
          <b>{_t("Ты в ихраме")}</b><small>{_t("тальбия и запреты ›")}</small>
        </button>
      )}

      <Hint id="umrah" />

      {/* Now: changes by the days left, so the person sees only what matters today. */}
      <div className="um-now">
        <em>{_t("Сейчас")}</em>
        {phase === 'none' && (
          <>
            <b>{_t("Копилка на умру")}</b>
            <UmrahSavings state={state} update={update} today={today} compact onOpen={() => setTab('trip')} />
            <b>{_t("Когда едешь?")}</b>
            <p>{_t("Укажи дни, и экран будет подсказывать, что делать сейчас. Если едешь группой из Круга, даты возьмутся из поездки.")}</p>
            <div className="up-add">
              <input type="date" defaultValue={u.from} onChange={(e) => update((s) => patch(s, { from: e.target.value || undefined }))} aria-label={_t("Вылет")} />
              <input type="date" defaultValue={u.to} onChange={(e) => update((s) => patch(s, { to: e.target.value || undefined }))} aria-label={_t("Возвращение")} />
            </div>
            <p className="tiny">{_t("Пока дат нет, начни с сердца: намерение и покаяние не зависят от билетов.")}</p>
          </>
        )}
        {phase === 'far' && <><b>{_t("Время намерения")}</b><p>{_tj("До вылета {0}  {1}. Самое важное сейчас не билеты, а сердце: ради кого ты едешь. Обнови намерение, попроси прощения, начни учить тальбию.", left, plural(left!, _t("день"), _t("дня"), _t("дней")))}</p>{(u.funds ?? []).some((f) => !f.for) && <UmrahSavings state={state} update={update} today={today} compact />}</>}
        {phase === 'month' && <><b>{_t("Месяц до умры")}</b><p>{_t("Прививка, разрешение в Nusuk, запись в Равду, билеты. И по одному шагу гида в день, чтобы на месте всё было знакомо.")}</p>{left! <= 28 && <WalkPlan state={state} update={update} today={today} left={left} compact />}<UmrahBook state={state} update={update} from={from} to={to} compact /></>}
        {phase === 'week' && <><b>{_t("Последняя неделя")}</b><p>{_t("Вещи, список дуа, договорённости с семьёй и работой. Попрощайся с близкими и оставь садака.")}</p><button type="button" className="pri-btn" onClick={() => setMiqat(true)}>{_t("✈ Микат в самолёте: указать рейс")}</button><UmrahBook state={state} update={update} from={from} to={to} compact /></>}
        {phase === 'there' && (
          <>
            <b>{_t("Ты в пути. Ляббайк, Аллахумма ляббайк")}</b>
            <p>{_tj("Гид работает без интернета. Таваф {0}/7, саи {1}/7.", u.tawaf, u.saee)}</p>
            <LeaveForPrayer state={state} />
            {groupHost && me && <GroupRadar state={state} update={update} api={api} host={groupHost} members={groupMembers} nameOf={nameOf} />}
            <Diary state={state} update={update} today={today} />
            <div className="os-row">
              <button type="button" onClick={() => setLost(true)}>{_t("🆘 Я потерялся")}</button>
              <button type="button" onClick={() => setTab('trip')}>📍 {u.site?.meet ? u.site.meet : _t("Точка встречи")}</button>
            </div>
            {!u.ihram && <button type="button" className="pri-btn" onClick={() => setMiqat(true)}>{_t("✈ Микат в самолёте")}</button>}
            <button type="button" className="pri-btn" onClick={() => setTab('rites')}>{_t("Открыть обряды")}</button>
          </>
        )}
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
        {due.length > 0 && phase !== 'there' && phase !== 'after' && (
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

      <div className="seg um-seg">
        {([['heart', _t("Сердце")], ['duas', _t("Дуа")], ['rites', _t("Обряды")], ['trip', _t("Поездка")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'heart' && (
        <div className="um-sec">
          <p className="tiny">{_t("Умра начинается задолго до самолёта. Главная подготовка внутри.")}</p>
          <UmrahVideos u={u} update={update} />
          {heart.map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}</b><small>{_tj("за {0} до поездки", p.when)}</small></span></label>
          ))}
          <TalbiyaLearn state={state} update={update} />
          <h3>{_t("Дела")}</h3>
          {deeds.map((p) => (
            <div key={p.id} className="pp-deed">
              <label className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}{p.must && <em className="pp-must">{_t("обязательно")}</em>}</b><small>{_tj("за {0} до поездки", p.when)}</small></span></label>
              {p.how && <details><summary>{_t("Как это сделать")}</summary><p>{p.how}</p></details>}
            </div>
          ))}
          <WalkPlan state={state} update={update} today={today} left={left} />
          <p className="tiny">{_t("Готовность видна группе только процентом, сами пункты нет.")}</p>
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

      {tab === 'rites' && (
        <div className="um-sec">
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
        </div>
      )}

      {tab === 'trip' && (
        <div className="um-sec">
          {(phase === 'none' || phase === 'done') && <WhenToGo today={today} />}
          {(phase === 'week' || phase === 'there') && <OnSiteSetup state={state} update={update} />}
          {phase !== 'there' && phase !== 'after' && phase !== 'done' && <UmrahBook state={state} update={update} from={from} to={to} />}
          <UmrahSavings state={state} update={update} today={today} api={api} nameOf={nameOf} />
          {phase !== 'week' && phase !== 'there' && <OnSiteSetup state={state} update={update} />}
          {api.me ? (
            <UmrahTrips api={api} myReady={prepPct(state)} nameOf={nameOf} embedded />
          ) : (
            <p className="tiny">{_t("Чтобы поехать группой, войди в Круг: там собираются поездки, даты, жильё и общая касса.")}</p>
          )}
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
