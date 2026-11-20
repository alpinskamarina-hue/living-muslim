import { inRamadan } from '../rplan';
import { Ic } from './LIcon';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, HealthState, Mark, SleepLog } from '../types';
import { prayerTimes } from '../prayer';
import { addDays, fromKey, hhmm, durationLabel } from '../dates';
import { here } from '../safar';
import {
  WORKOUTS, WTYPES, LEVELS, health, patchHealth, sunnahFast, type Workout, type WEntry,
  wEntries, workoutMin, ownEntry, entryKcal, workoutKcal, round50, wGoal, wSound, wVoice,
  weekDays, weekCount, weekMin, dayMin, monthCount, wStreak,
} from '../health';
import { lastWeight } from '../foodcalc';
import { speak, ttsAvailable } from '../speech';
import { PIcon } from './PIcon';
import { _t, _tj, LANG } from '../i18n';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
  onFood?: () => void;
}

type View = 'home' | 'sleep' | 'water' | 'fasts' | 'workouts' | 'wset';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const sleepMin = (l: SleepLog) => { const d = toMin(l.wake) - toMin(l.bed); return d <= 0 ? d + 1440 : d; };
const WD = [_t("вс"), _t("пн"), _t("вт"), _t("ср"), _t("чт"), _t("пт"), _t("сб")];
const LAST_KEY = 'lm.lastTimer';
const lastTimer = () => { try { return WORKOUTS.find((w) => w.id === localStorage.getItem(LAST_KEY)) ?? WORKOUTS[0]; } catch { return WORKOUTS[0]; } };
const firstView = (): View => { try { const v = sessionStorage.getItem('lm.hview'); sessionStorage.removeItem('lm.hview'); return v === 'workouts' ? 'workouts' : 'home'; } catch { return 'home'; } };

/** Extra kcal in the «Спорт» food mode, or null when another mode is on. */
function sportKcal(s: AppState) {
  const f = s.food;
  if (!f || f.mode !== 'sport') return null;
  return { kg: lastWeight({ ...f, weight: f.weight ?? {} }) };
}

export function Health({ state, update, today, habitName, onExit, onFinish, onFood }: Props) {
  const [view, setView] = useState<View>(firstView);
  const [run, setRun] = useState<Workout | null>(null);
  const [own, setOwn] = useState(false);
  const h = health(state);
  const goal = wGoal(h);

  // Tonight's bedtime: tomorrow's Fajr minus time to get up before it, minus hours of sleep.
  const fajrTomorrow = prayerTimes(here(state, addDays(today, 1)), fromKey(addDays(today, 1))).fajr;
  const wakeAt = new Date(fajrTomorrow.getTime() - h.wakeBefore * 60000);
  const bedAt = new Date(wakeAt.getTime() - h.sleepHours * 3600000);
  const water = h.water[today] ?? 0;
  const fastToday = sunnahFast(fromKey(today));
  const setH = (fn: (x: HealthState) => Partial<HealthState>) => update((s) => patchHealth(s, fn));
  const addEntry = (day: string, e: string) => setH((x) => ({ workouts: { ...x.workouts, [day]: [...(x.workouts[day] ?? []), e] } }));
  const start = (w: Workout) => { try { localStorage.setItem(LAST_KEY, w.id); } catch { /* */ } setRun(w); };

  if (run) return <Runner w={run} h={h} today={today} habitName={habitName} onClose={() => setRun(null)}
    onSound={(v) => setH(() => ({ wsound: v }))}
    onSave={(min) => addEntry(today, `${run.id}|${min}`)}
    onDone={(m) => { if (m) onFinish(m); setRun(null); }} />;

  const top = (title: string, sub: string, back: () => void, extra?: ReactNode) => (
    <div className="sess-top">
      <button type="button" className="icon-btn" onClick={back} aria-label={_t("Назад")}>‹</button>
      <div><b>{title}</b><small>{sub}</small></div>
      {extra}
    </div>
  );

  if (view === 'sleep') return <div className="sess light-sess">{top(_t("Сон от Фаджра"), _t("Режим строится от утреннего намаза"), () => setView('home'))}<Sleep state={state} update={update} today={today} bedAt={bedAt} wakeAt={wakeAt} fajr={fajrTomorrow} /></div>;
  if (view === 'water') return <div className="sess light-sess">{top(_t("Вода"), _t("Стакан после каждого намаза и между ними"), () => setView('home'))}<Water state={state} update={update} today={today} /></div>;
  if (view === 'fasts') return <div className="sess light-sess">{top(_t("Посты сунны"), _t("Понедельник, четверг, белые дни"), () => setView('home'))}<Fasts state={state} update={update} today={today} /></div>;
  if (view === 'wset') return <div className="sess light-sess">{top(_t("Настройки тренировок"), _t("Цель, звук и напоминание"), () => setView('workouts'))}<WSettings state={state} h={h} setH={setH} /></div>;
  if (view === 'workouts') {
    const sport = sportKcal(state);
    const days = weekDays(today);
    const mins = days.map((d) => dayMin(h, d) * ((h.workouts[d]?.length ?? 0) > 0 ? 1 : 0));
    const peak = Math.max(60, ...mins);
    const wn = weekCount(h, today), streak = wStreak(h, today);
    const yday = addDays(today, -1);
    const drop = (day: string, i: number) => setH((x) => {
      const l = [...(x.workouts[day] ?? [])]; l.splice(i, 1);
      const w = { ...x.workouts }; if (l.length) w[day] = l; else delete w[day];
      return { workouts: w };
    });
    const log = (day: string, label: string) => {
      const list = wEntries(h, day);
      if (!list.length) return null;
      return (
        <>
          <h2 className="sub-h">{label}</h2>
          <div className="wk-log">
            {list.map((e, i) => (
              <div key={`${e.raw}-${i}`} className="wk-row">
                <span className="wk-ic" aria-hidden="true"><Ic e={e.ic} /></span>
                <span><b>{e.name}</b><small>{entryLine(e, sport)}</small></span>
                <button type="button" className="wk-x" aria-label={_tj("Убрать: {0}", e.name)} onClick={() => drop(day, i)}>✕</button>
              </div>
            ))}
          </div>
        </>
      );
    };
    return (
      <div className="sess light-sess">
        {top(_t("Тренировки"), _t("Дома с таймером или своя"), () => setView('home'),
          <button type="button" className="icon-btn wk-gear" onClick={() => setView('wset')} aria-label={_t("Настройки тренировок")}>⚙</button>)}
        <div className="h-wrap">
          <div className="h-card wk-week">
            <div className="wk-wh"><b>{_t("Неделя")}</b><small>{_tj("{0} мин · {1} из {2}", weekMin(h, today), wn, goal)}</small></div>
            <div className="wk-bars">
              {days.map((d, i) => (
                <div key={d} className={`wk-bar${d === today ? ' now' : ''}${d > today ? ' fut' : ''}`}>
                  <span><i style={{ height: `${mins[i] ? Math.max(8, (mins[i] / peak) * 100) : 0}%` }} /></span>
                  <small>{WD[fromKey(d).getDay()]}</small>
                </div>
              ))}
            </div>
            <small>{streak > 0 ? _tj("Серия: {0} подряд с целью {1} в неделю.", weeksL(streak), goal) : _tj("Цель: {0} тренировки в неделю.", goal)} {_t("Пропущенный день серию не ломает.")}</small>
          </div>
          <button type="button" className="pri-btn wk-add" onClick={() => setOwn(true)}>{_t("＋ Записать свою тренировку")}</button>
          {log(today, _t("Сегодня"))}
          {log(yday, _t("Вчера"))}
          <h2 className="sub-h">{_t("Дома с таймером")}</h2>
          {WORKOUTS.map((w) => {
            const doneToday = wEntries(h, today).some((e) => e.timer === w.id);
            return (
              <button type="button" key={w.id} className="h-card wk-timer" onClick={() => start(w)}>
                <span>
                  <b>{doneToday ? '✓ ' : ''}{w.title}</b>
                  <small>{_tj("{0} · {1} упражнений{2} · ~{3} мин", doneToday ? _t("сегодня") : w.sub, w.ex.length, w.rounds > 1 ? ` × ${w.rounds}` : '', workoutMin(w))}</small>
                </span>
                <em aria-hidden="true">▶</em>
              </button>
            );
          })}
          <p className="q-msg">{_t("Если есть боль или проблемы со здоровьем, сначала посоветуйся с врачом.")}</p>
        </div>
        {own && <OwnSheet h={h} today={today} sport={sport} onClose={() => setOwn(false)} onSave={(day, e) => { addEntry(day, e); setOwn(false); }} />}
      </div>
    );
  }

  const lastNight = h.sleep[today];
  const wn = weekCount(h, today);
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Здоровье")}</b><small>{_t("«Твоё тело имеет на тебя право» (аль-Бухари)")}</small></div>
        {onFood && <div className="fsw"><button type="button" aria-pressed="true">{_t("Здоровье")}</button><button type="button" onClick={onFood}>{_t("Питание")}</button></div>}
      </div>
      <div className="h-wrap">
        {inRamadan(today) && (
          <div className="h-card fast-card">
            <b>{_t("🌙 Рамадан")}</b>
            <small>{_t("Воду пей между ифтаром и сухуром: 2 стакана на ифтаре, 2 после Магриба, 2 после таравиха, 2 на сухуре. Тренировку делай через 1–2 часа после ифтара и легче обычного. Короткую зарядку после Фаджра можно оставить.")}</small>
          </div>
        )}
        <button type="button" className="h-card h-row-card" onClick={() => setView('sleep')}>
          <PIcon k="moon" ball cls="h-d3" />
          <span>
            <b>{_t("Сон")}</b>
            <small>{_t("Сегодня ложись до ")}<em>{hhmm(bedAt)}</em>{_tj(", чтобы спать {0} ч и встать к Фаджру ({1})", h.sleepHours, hhmm(fajrTomorrow))}</small>
            {lastNight ? <span className="h-ex">{_tj("Прошлой ночью: {0}", durationLabel(sleepMin(lastNight) * 60000))}</span> : <span className="h-ex">{_t("Отметь, как спал этой ночью")}</span>}
          </span>
        </button>
        <div className="h-card">
          <button type="button" className="h-head h-row-card" onClick={() => setView('water')}>
            <PIcon k="drop" ball cls="h-d3" /><span><b>{_t("Вода")}</b><small>{_tj("{0} из {1} стаканов", water, h.waterGoal)}</small></span>
          </button>
          <div className="glasses" style={{ gridTemplateColumns: `repeat(${Math.min(h.waterGoal, 8)}, 1fr)` }}>
            {Array.from({ length: h.waterGoal }, (_, i) => (
              <button type="button" key={i} aria-label={_t("Стакан {0}", i + 1)} aria-pressed={i < water}
                onClick={() => update((s) => patchHealth(s, (x) => ({ water: { ...x.water, [today]: i < (x.water[today] ?? 0) ? i : i + 1 } })))} />
            ))}
          </div>
        </div>
        <div className="h-card wk-card">
          <button type="button" className="h-head h-row-card" onClick={() => setView('workouts')}>
            <PIcon k="dumbbell" ball cls="h-d3" />
            <span><b>{_t("Тренировки")}</b><small>{_tj("Цель: {0} в неделю · эта неделя {1} из {0}", goal, wn)}{wn >= goal ? ' ✓' : ''}</small></span>
          </button>
          <div className="wk-days">
            {weekDays(today).map((d) => {
              const on = (h.workouts[d]?.length ?? 0) > 0;
              return <span key={d} className={on ? 'on' : d === today ? 'now' : d > today ? 'fut' : ''}><small>{WD[fromKey(d).getDay()]}</small><i>{on ? '✓' : ''}</i></span>;
            })}
          </div>
          <div className="wk-stats">
            <span><b>{_tj("{0} нед.", wStreak(h, today))}</b><small>{_t("серия")}</small></span>
            <span><b>{weekMin(h, today)}</b><small>{_t("мин за неделю")}</small></span>
            <span><b>{monthCount(h, today)}</b><small>{_t("за месяц")}</small></span>
          </div>
          <div className="wk-btns">
            <button type="button" className="pri-btn" onClick={() => start(lastTimer())}>{_t("▶ Домашняя")}</button>
            <button type="button" onClick={() => { setView('workouts'); setOwn(true); }}>{_t("＋ Своя")}</button>
          </div>
        </div>
        <button type="button" className="h-card h-row-card" onClick={() => setView('fasts')}>
          <PIcon k="sunrise" ball cls="h-d3" />
          <span>
            <b>{_t("Посты сунны")}</b>
            <small>{fastToday ? _t("Сегодня: {0}, желательный пост", fastToday.toLowerCase()) : nextFastLabel(today)}</small>
            {h.fasts[today] ? <span className="h-ex">{_t("Сегодня постишься ✓")}</span> : null}
          </span>
        </button>
      </div>
    </div>
  );
}

const weeksL = (n: number) => (LANG === 'en' ? `${n} week${n === 1 ? '' : 's'}` : `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'неделя' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'недели' : 'недель'}`);

function entryLine(e: WEntry, sport: { kg?: number } | null) {
  const bits: string[] = [];
  if (e.min) bits.push(_tj("{0} мин", e.min));
  if (!e.timer && e.lvl) bits.push(LEVELS[e.lvl - 1].toLowerCase());
  if (e.timer) bits.push(_t("с таймером"));
  if (sport) bits.push(_tj("+{0} ккал в «Спорте»", round50(Math.min(800, entryKcal(e, sport.kg)))));
  if (e.ai) bits.push(_t("записал Помощник"));
  return bits.join(' · ');
}

function OwnSheet({ h, today, sport, onClose, onSave }: { h: HealthState; today: string; sport: { kg?: number } | null; onClose: () => void; onSave: (day: string, entry: string) => void }) {
  const [type, setType] = useState('');
  const [min, setMin] = useState(30);
  const [custom, setCustom] = useState('');
  const [mine, setMine] = useState(false);
  const [lvl, setLvl] = useState<1 | 2 | 3>(2);
  const [day, setDay] = useState(today);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const minutes = mine ? Math.round(Number(custom.replace(',', '.'))) : min;
  const okMin = minutes >= 1 && minutes <= 600;
  const ok = Boolean(type) && okMin;
  const missing = [!type ? _t("что за тренировка") : '', !okMin ? _t("сколько минут") : ''].filter(Boolean);
  const entry = type ? ownEntry(type, okMin ? minutes : undefined, lvl, type === 'other' ? name : undefined) : '';
  // Extra for the «Спорт» mode on that day, with what is already there.
  const before = workoutKcal(h, day, sport?.kg);
  const after = sport && entry ? Math.min(800, before + entryKcal({ raw: entry, type, name: '', ic: '', min: okMin ? minutes : undefined, lvl }, sport.kg)) : 0;
  const save = () => { setTried(true); if (ok) onSave(day, entry); };
  return createPortal(
    <div className="fp-dim" onClick={onClose}>
      <div className="fp-sheet wk-sheet" role="dialog" aria-label={_t("Своя тренировка")} onClick={(e) => e.stopPropagation()}>
        <i className="fp-grab" />
        <b>{_t("Своя тренировка")}</b>
        <small className="wk-lab">{_t("Что")}</small>
        <div className={`wk-chips${tried && !type ? ' bad' : ''}`}>
          {WTYPES.map((t) => <button type="button" key={t.id} aria-pressed={type === t.id} onClick={() => setType(t.id)}><span aria-hidden="true"><Ic e={t.ic} /></span> {t.n}</button>)}
        </div>
        {type === 'other' && <input className="wk-in" value={name} maxLength={40} placeholder={_t("Что именно, например, йога")} onChange={(e) => setName(e.target.value)} />}
        <small className="wk-lab">{_t("Сколько минут")}</small>
        <div className="wk-chips">
          {[15, 30, 45, 60, 90].map((m) => <button type="button" key={m} aria-pressed={!mine && min === m} onClick={() => { setMine(false); setMin(m); }}>{m}</button>)}
          <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>{_t("своё")}</button>
        </div>
        {mine && <input className="wk-in" inputMode="numeric" autoFocus value={custom} placeholder={_t("минут")} aria-invalid={tried && !okMin ? true : undefined} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} />}
        <small className="wk-lab">{_t("Как было")}</small>
        <div className="wk-chips">
          {LEVELS.map((l, i) => <button type="button" key={l} aria-pressed={lvl === i + 1} onClick={() => setLvl((i + 1) as 1 | 2 | 3)}>{l}</button>)}
        </div>
        <small className="wk-lab">{_t("Когда")}</small>
        <div className="wk-chips">
          <button type="button" aria-pressed={day === today} onClick={() => setDay(today)}>{_t("Сегодня")}</button>
          <button type="button" aria-pressed={day !== today} onClick={() => setDay(addDays(today, -1))}>{_t("Вчера")}</button>
        </div>
        {sport && entry && okMin && <p className="wk-note">{after > before
          ? _tj("В режиме питания «Спорт» норма на {0} станет больше на ~{1} ккал.", day === today ? _t("сегодня") : _t("вчера"), round50(after - before))
          : _t("В режиме питания «Спорт» прибавка за день уже максимальная: 800 ккал.")}</p>}
        {tried && !ok && <p className="fd-missing">{_tj("Чтобы записать, выбери: {0}.", missing.join(', '))}</p>}
        <button type="button" className={`pri-btn${ok ? '' : ' fd-wait'}`} onClick={save}>{_t("Записать")}</button>
      </div>
    </div>, document.body);
}

function WSettings({ state, h, setH }: { state: AppState; h: HealthState; setH: (fn: (x: HealthState) => Partial<HealthState>) => void }) {
  const goal = wGoal(h), sound = wSound(h), voice = wVoice(h), rem = h.wrem ?? 'none';
  const pushOn = Boolean(state.settings.reminders?.on);
  return (
    <div className="h-wrap">
      <small className="wk-lab">{_t("Цель в неделю")}</small>
      <div className="wk-chips">{[2, 3, 4, 5].map((n) => <button type="button" key={n} aria-pressed={goal === n} onClick={() => setH(() => ({ wgoal: n }))}>{n}</button>)}</div>
      <p className="wk-hint">{_t("Неделя засчитывается, когда набрано столько дней с тренировкой. Дни отдыха нужны телу, они серию не ломают.")}</p>
      <small className="wk-lab">{_t("Звук в таймере")}</small>
      <div className="wk-chips">
        {([['voice', _t("Голос и сигналы")], ['beep', _t("Только сигналы")], ['off', _t("Без звука")]] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={sound === v} onClick={() => setH(() => ({ wsound: v }))}>{l}</button>)}
      </div>
      {sound === 'voice' && (
        <>
          <small className="wk-lab">{_t("Голос")}</small>
          <div className="wk-chips">
            {([['ru', 'Русский'], ['en', 'English']] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={voice === v} onClick={() => setH(() => ({ wvoice: v }))}>{l}</button>)}
          </div>
          <p className="wk-hint">{ttsAvailable() ? _t("Голос встроен в телефон, работает без интернета. В наушниках звук слышен только тебе.") : _t("Этот браузер не умеет говорить, останутся только сигналы.")}</p>
        </>
      )}
      <small className="wk-lab">{_t("Напоминание")}</small>
      <div className="wk-chips">
        {([['none', _t("Нет")], ['fajr', _t("после Фаджра")], ['asr', _t("после Асра")], ['isha', _t("после Иша")]] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={rem === v} onClick={() => setH(() => ({ wrem: v }))}>{l}</button>)}
      </div>
      <p className="wk-hint">{_t("Пуш через 20 минут после намаза, только в день без тренировки и только если неделя отстаёт от цели.")}{rem !== 'none' && !pushOn ? ` ${_t("Чтобы он приходил, включи уведомления в Профиле → Напоминания.")}` : ''}</p>
    </div>
  );
}

function nextFastLabel(today: string) {
  for (let i = 1; i < 30; i++) {
    const k = addDays(today, i);
    const why = sunnahFast(fromKey(k));
    if (why) return _t("Ближайший: {0}, {1}", i === 1 ? _t("завтра") : fmtDay(k), why.toLowerCase());
  }
  return '';
}
const fmtDay = (k: string) => { const d = fromKey(k); return `${WD[d.getDay()]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

function Sleep({ state, update, today, bedAt, wakeAt, fajr }: { state: AppState; update: Props['update']; today: string; bedAt: Date; wakeAt: Date; fajr: Date }) {
  const h = health(state);
  const prev = h.sleep[today];
  const [bed, setBed] = useState(prev?.bed ?? '23:00');
  const [wake, setWake] = useState(prev?.wake ?? hhmm(prayerTimes(here(state, today), fromKey(today)).fajr));
  const save = (q: 1 | 2 | 3) => update((s) => patchHealth(s, (x) => ({ sleep: { ...x.sleep, [today]: { bed, wake, q } } })));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const logged = week.map((k) => h.sleep[k]).filter(Boolean) as SleepLog[];
  const avg = logged.length ? logged.reduce((a, l) => a + sleepMin(l), 0) / logged.length : 0;

  return (
    <div className="h-wrap">
      <div className="h-card h-hero">
        <small>{_t("Сегодня ложись до")}</small>
        <b className="h-big">{hhmm(bedAt)}</b>
        <small>{_tj("Подъём {0} · Фаджр {1}", hhmm(wakeAt), hhmm(fajr))}</small>
      </div>
      <div className="h-row">
        <label className="field"><span>{_t("Сколько спать")}</span>
          <select value={h.sleepHours} onChange={(e) => update((s) => patchHealth(s, () => ({ sleepHours: Number(e.target.value) })))}>
            {[6, 6.5, 7, 7.5, 8, 8.5, 9].map((v) => <option key={v} value={v}>{_tj("{0} ч", String(v).replace('.5', ',5'))}</option>)}
          </select>
        </label>
        <label className="field"><span>{_t("Встать до Фаджра за")}</span>
          <select value={h.wakeBefore} onChange={(e) => update((s) => patchHealth(s, () => ({ wakeBefore: Number(e.target.value) })))}>
            {[0, 10, 20, 30, 45, 60].map((v) => <option key={v} value={v}>{_tj("{0} мин", v)}</option>)}
          </select>
        </label>
      </div>

      <h2 className="sub-h">{_t("Как спал этой ночью")}</h2>
      <div className="h-row">
        <label className="field"><span>{_t("Лёг")}</span><input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></label>
        <label className="field"><span>{_t("Встал")}</span><input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></label>
      </div>
      <div className="h-q">
        {([[1, _t("Плохо")], [2, _t("Нормально")], [3, _t("Хорошо")]] as const).map(([q, l]) => (
          <button type="button" key={q} aria-pressed={prev?.q === q} onClick={() => save(q)}>{l}</button>
        ))}
      </div>
      {prev && <p className="q-msg">{_tj("Записано: {0}", durationLabel(sleepMin(prev) * 60000))}</p>}

      <h2 className="sub-h">{_t("Неделя ")}{avg ? <small>{_tj("в среднем {0}", durationLabel(avg * 60000))}</small> : null}</h2>
      <div className="h-bars">
        {week.map((k) => {
          const l = h.sleep[k];
          const m = l ? sleepMin(l) : 0;
          return (
            <div key={k} className="h-bar">
              <span><i data-q={l?.q} style={{ height: `${Math.min(100, (m / 600) * 100)}%` }} /></span>
              <small>{WD[fromKey(k).getDay()]}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Water({ state, update, today }: { state: AppState; update: Props['update']; today: string }) {
  const h = health(state);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const n = h.water[today] ?? 0;
  const set = (v: number) => update((s) => patchHealth(s, (x) => ({ water: { ...x.water, [today]: Math.max(0, v) } })));
  return (
    <div className="h-wrap">
      <div className="h-card h-hero">
        <small>{_t("Сегодня")}</small>
        <b className="h-big">{n} / {h.waterGoal}</b>
        <div className="h-q">
          <button type="button" onClick={() => set(n - 1)}>{_t("− стакан")}</button>
          <button type="button" aria-pressed onClick={() => set(n + 1)}>{_t("+ стакан")}</button>
        </div>
      </div>
      <label className="field"><span>{_t("Цель в день")}</span>
        <select value={h.waterGoal} onChange={(e) => update((s) => patchHealth(s, () => ({ waterGoal: Number(e.target.value) })))}>
          {[5, 6, 7, 8, 9, 10, 12].map((v) => <option key={v} value={v}>{_tj("{0} стаканов", v)}</option>)}
        </select>
      </label>
      <p className="q-msg">{_t("Простое правило: стакан после каждого намаза, и ещё несколько между ними. Пей сидя, в три глотка, как в сунне.")}</p>
      <h2 className="sub-h">{_t("Неделя")}</h2>
      <div className="h-bars">
        {week.map((k) => (
          <div key={k} className="h-bar">
            <span><i style={{ height: `${Math.min(100, ((h.water[k] ?? 0) / h.waterGoal) * 100)}%` }} /></span>
            <small>{WD[fromKey(k).getDay()]}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fasts({ state, update, today }: { state: AppState; update: Props['update']; today: string }) {
  const h = health(state);
  const days = Array.from({ length: 45 }, (_, i) => addDays(today, i - 14)).filter((k) => sunnahFast(fromKey(k)));
  const month = today.slice(0, 7);
  const count = Object.keys(h.fasts).filter((k) => k.startsWith(month)).length;
  const toggle = (k: string) => update((s) => patchHealth(s, (x) => {
    const f = { ...x.fasts };
    if (f[k]) delete f[k]; else f[k] = true;
    return { fasts: f };
  }));
  return (
    <div className="h-wrap">
      <div className="stat-card"><div className="big">{count}</div><div><b>{_t("постов в этом месяце")}</b><small>{_t("отмечай после ифтара")}</small></div></div>
      <div className="fast-list">
        {days.map((k) => {
          const future = k > today;
          return (
            <button type="button" key={k} className={`fast${k === today ? ' now' : ''}`} disabled={future} aria-pressed={Boolean(h.fasts[k])} onClick={() => toggle(k)}>
              <b>{k === today ? _t("Сегодня") : fmtDay(k)}</b>
              <small>{sunnahFast(fromKey(k))}</small>
              <span>{h.fasts[k] ? '✓' : future ? '' : '○'}</span>
            </button>
          );
        })}
      </div>
      <p className="q-msg">{_t("Даты хиджры по календарю Умм аль-Кура. В твоей общине начало месяца может отличаться на день.")}</p>
    </div>
  );
}

type Sound = 'voice' | 'beep' | 'off';
type Step = { kind: 'work' | 'rest'; e: Workout['ex'][number]; r: number };

/** Short sounds through WebAudio: made on the first tap, so phones allow them. */
function useBeeper() {
  const ctx = useRef<AudioContext | null>(null);
  const init = () => {
    try {
      if (!ctx.current) { const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (A) ctx.current = new A(); }
      void ctx.current?.resume();
    } catch { /* no audio */ }
  };
  const beep = (hz: number, ms: number) => {
    const c = ctx.current;
    if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = hz;
      const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + ms / 1000 + 0.05);
    } catch { /* */ }
  };
  useEffect(() => () => { try { void ctx.current?.close(); } catch { /* */ } }, []);
  return { init, beep };
}

/** Keeps the screen on while the timer runs, where the browser allows it. */
function useWakeLock(on: boolean) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!on || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const get = () => { nav.wakeLock!.request('screen').then((l) => { if (gone) void l.release(); else { lock = l; setOk(true); } }).catch(() => setOk(false)); };
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', vis);
    return () => { gone = true; document.removeEventListener('visibilitychange', vis); try { void lock?.release(); } catch { /* */ } };
  }, [on]);
  return ok;
}

/** Hides the ayah/hadith card while a workout runs, so nothing covers the timer. */
function useQuiet() {
  useEffect(() => {
    document.body.dataset.quiet = '1';
    try { window.dispatchEvent(new Event('lm:say-hide')); } catch { /* */ }
    return () => { delete document.body.dataset.quiet; };
  }, []);
}

function Runner({ w, h, today, habitName, onClose, onSound, onSave, onDone }: {
  w: Workout; h: HealthState; today: string; habitName?: string;
  onClose: () => void; onSound: (v: Sound) => void; onSave: (min: number) => void; onDone: (m: Mark | null) => void;
}) {
  const steps: Step[] = Array.from({ length: w.rounds }, (_, r) => w.ex.flatMap((e, i) => {
    const s: Step[] = [{ kind: 'work', e, r }];
    const last = r === w.rounds - 1 && i === w.ex.length - 1;
    return last ? s : [...s, { kind: 'rest' as const, e: w.ex[(i + 1) % w.ex.length], r }];
  })).flat();
  const total = w.ex.length * w.rounds;
  const sound = wSound(h);
  const vlang = wVoice(h);
  const [idx, setIdx] = useState(-1);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [said, setSaid] = useState('');
  const [mins, setMins] = useState(0);
  const endAt = useRef(0);
  const spent = useRef(0);
  const lastBeep = useRef(-1);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const { init, beep } = useBeeper();
  const finished = idx >= steps.length;
  const step = steps[idx];
  const dur = step ? (step.kind === 'work' ? step.e.sec : w.rest) : 0;
  const lockOk = useWakeLock(idx >= 0 && !finished);
  useQuiet();
  const [dict, setDict] = useState<Record<string, string> | null>(null);

  // The voice may speak the other language than the app: names come from the English table (or back from it).
  useEffect(() => {
    if (vlang === LANG) return;
    import('../en').then((m) => setDict(LANG === 'ru' ? m.EN : Object.fromEntries(Object.entries(m.EN).map(([k, v]) => [v, k])))).catch(() => { /* */ });
  }, [vlang]);
  const nm = (s: string) => (vlang === LANG ? s : dict?.[s] ?? s);
  const V = (ru: string, en: string) => (vlang === 'en' ? en : ru);
  const say = (text: string) => {
    setSaid(text);
    if (soundRef.current !== 'voice' || !ttsAvailable()) return;
    void speak(text, false, vlang === 'en' ? 'en-US' : 'ru-RU');
  };
  const workNo = (i: number) => steps.filter((s, j) => s.kind === 'work' && j <= i).length;

  const go = (i: number) => {
    // Time actually spent on the step that is ending.
    if (idx >= 0 && idx < steps.length) spent.current += Math.max(0, dur - left);
    setIdx(i);
    lastBeep.current = -1;
    const s = steps[i];
    if (!s) {
      const m = Math.max(1, Math.round(spent.current / 60));
      setMins(m);
      onSave(m);
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
      if (soundRef.current !== 'off') { beep(880, 250); setTimeout(() => beep(1175, 400), 280); }
      say(V('Готово, машаАллах. Тренировка записана.', 'Done, mashaAllah. Workout saved.'));
      return;
    }
    const d = s.kind === 'work' ? s.e.sec : w.rest;
    endAt.current = Date.now() + d * 1000;
    setLeft(d);
    try { navigator.vibrate?.(120); } catch { /* ignore */ }
    if (soundRef.current !== 'off') beep(s.kind === 'work' ? 990 : 660, 220);
    if (s.kind === 'work') say(i === 0 && idx < 0 ? V(`Начинаем. ${nm(s.e.n)}, ${d} секунд.`, `Let's start. ${nm(s.e.n)}, ${d} seconds.`) : V(`${nm(s.e.n)}, ${d} секунд.`, `${nm(s.e.n)}, ${d} seconds.`));
    else say(V(`Отдых. Дальше ${nm(s.e.n).toLowerCase()}.`, `Rest. Next: ${nm(s.e.n).toLowerCase()}.`));
  };

  useEffect(() => {
    if (idx < 0 || finished || paused) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(l);
      if (l > 0 && l <= 3 && lastBeep.current !== l) { lastBeep.current = l; if (soundRef.current !== 'off') beep(740, 120); }
      if (l === 0) go(idx + 1);
    }, 200);
    return () => clearInterval(t);
  }, [idx, paused, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ‹ Назад: to the start of this exercise if it has run a while, else to the one before. */
  const back = () => {
    const cur = step?.kind === 'rest' ? idx - 1 : idx;
    const ran = step?.kind === 'work' ? dur - left : 99;
    let to = ran > 3 ? cur : cur - 2;
    if (to < 0) to = 0;
    setPaused(false);
    go(to);
  };
  const nextSound: Record<Sound, Sound> = { voice: 'beep', beep: 'off', off: 'voice' };
  const soundLabel: Record<Sound, string> = { voice: _t("🔊 Голос"), beep: _t("🔔 Сигналы"), off: _t("🔇 Тихо") };

  const wn = weekCount(h, today), goal = wGoal(h), streak = wStreak(h, today);
  const C = 2 * Math.PI * 110;
  return (
    <div className="sess wk-run">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onClose} aria-label={_t("Выйти")}>✕</button>
        <div><b>{w.title}</b><small>{finished ? _t("Готово") : idx < 0 ? w.sub : _t("{0} · {1} из {2}", step.kind === 'work' ? _t("Упражнение") : _t("Отдых"), Math.min(workNo(idx), total), total)}</small></div>
        {!finished && <button type="button" className="wk-snd" onClick={() => { init(); const v = nextSound[sound]; onSound(v); if (v === 'off' || v === 'beep') { try { speechSynthesis.cancel(); } catch { /* */ } } }} aria-label={_t("Звук")}>{soundLabel[sound]}</button>}
      </div>
      {idx < 0 ? (
        <>
          <ol className="w-list">{w.ex.map((e) => <li key={e.n}><b>{e.n}</b> <small>{_tj("{0} сек", e.sec)}</small><br /><small>{e.hint}</small></li>)}</ol>
          <button type="button" className="gold-btn" onClick={() => { init(); go(0); }}>{_t("Начать")}</button>
          <small className="wk-foot">{sound === 'voice' ? _t("Таймер будет говорить, что делать, и пищать «3, 2, 1».") : sound === 'beep' ? _t("Таймер будет пищать «3, 2, 1» в конце каждого упражнения.") : _t("Звук выключен, только вибрация.")}</small>
        </>
      ) : finished ? (
        <div className="finish wk-fin">
          <b>{_t("Готово, машаАллах")}</b>
          <p>{_t("Тренировка записана")}</p>
          <div className="wk-fstats">
            <span><b>{mins}</b><small>{_t("минут")}</small></span>
            <span><b>{_tj("{0} из {1}", wn, goal)}</b><small>{_t("на этой неделе")}</small></span>
            <span><b>{streak}</b><small>{_t("недель подряд")}</small></span>
          </div>
          <blockquote className="wk-quote">{_t("Сильный верующий лучше и любимее Аллахом, чем слабый, но в каждом из них благо.")}<small>{_t("Муслим, 2664")}</small></blockquote>
          {habitName ? (
            <div className="wk-fbtns">
              <button type="button" className="gold-btn" onClick={() => onDone('done')}>{_t("Отметить привычку: Сделано")}</button>
              <button type="button" className="wk-link" onClick={() => onDone('min')}>{_t("Минимум")}</button>
            </div>
          ) : <div className="wk-fbtns"><button type="button" className="gold-btn" onClick={() => onDone(null)}>{_t("Закрыть")}</button></div>}
        </div>
      ) : (
        <>
          <div className="w-now">
            <small>{step.kind === 'rest' ? _t("Отдых. Дальше:") : w.rounds > 1 ? _t("Круг {0}", step.r + 1) : ''}</small>
            <b>{step.e.n}</b>
            <span>{step.e.hint}</span>
          </div>
          <div className="dial">
            <svg viewBox="0 0 240 240">
              <circle cx="120" cy="120" r="110" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
              <circle cx="120" cy="120" r="110" fill="none" stroke={step.kind === 'rest' ? 'rgba(255,255,255,.5)' : 'var(--gold)'} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - left / dur)} transform="rotate(-90 120 120)" />
            </svg>
            <span>{left}</span>
          </div>
          <div className="wk-321" aria-hidden="true">{[3, 2, 1].map((n) => <i key={n} className={left <= 3 && left >= n ? 'on' : ''}>{n}</i>)}</div>
          {sound === 'voice' && said && <p className="wk-said">🔊 «{said}»</p>}
          <div className="row2 wk-ctl">
            <button type="button" onClick={back}>{_t("‹ Назад")}</button>
            <button type="button" onClick={() => { if (paused) endAt.current = Date.now() + left * 1000; else { try { speechSynthesis.cancel(); } catch { /* */ } } setPaused(!paused); }}>{paused ? _t("Продолжить") : _t("Пауза")}</button>
            <button type="button" onClick={() => go(idx + 1)}>{_t("Дальше ›")}</button>
          </div>
          {lockOk && <small className="wk-foot">{_t("Экран не гаснет, пока идёт тренировка")}</small>}
        </>
      )}
    </div>
  );
}
