import { inRamadan } from '../rplan';
import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark, SleepLog } from '../types';
import { prayerTimes } from '../prayer';
import { addDays, fromKey, hhmm, durationLabel } from '../dates';
import { here } from '../safar';
import { WORKOUTS, health, patchHealth, sunnahFast, type Workout } from '../health';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
}

type View = 'home' | 'sleep' | 'water' | 'fasts' | 'workouts';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const sleepMin = (l: SleepLog) => { const d = toMin(l.wake) - toMin(l.bed); return d <= 0 ? d + 1440 : d; };
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function Health({ state, update, today, habitName, onExit, onFinish }: Props) {
  const [view, setView] = useState<View>('home');
  const [run, setRun] = useState<Workout | null>(null);
  const h = health(state);

  // Tonight's bedtime: tomorrow's Fajr minus time to get up before it, minus hours of sleep.
  const fajrTomorrow = prayerTimes(here(state, addDays(today, 1)), fromKey(addDays(today, 1))).fajr;
  const wakeAt = new Date(fajrTomorrow.getTime() - h.wakeBefore * 60000);
  const bedAt = new Date(wakeAt.getTime() - h.sleepHours * 3600000);
  const water = h.water[today] ?? 0;
  const fastToday = sunnahFast(fromKey(today));

  if (run) return <Runner w={run} habitName={habitName} onClose={() => setRun(null)}
    onDone={(m) => { update((s) => patchHealth(s, (x) => ({ workouts: { ...x.workouts, [today]: [...(x.workouts[today] ?? []), run.id] } }))); if (m) onFinish(m); setRun(null); }} />;

  const top = (title: string, sub: string, back: () => void) => (
    <div className="sess-top">
      <button type="button" className="icon-btn" onClick={back} aria-label="Назад">‹</button>
      <div><b>{title}</b><small>{sub}</small></div>
    </div>
  );

  if (view === 'sleep') return <div className="sess light-sess">{top('Сон от Фаджра', 'Режим строится от утреннего намаза', () => setView('home'))}<Sleep state={state} update={update} today={today} bedAt={bedAt} wakeAt={wakeAt} fajr={fajrTomorrow} /></div>;
  if (view === 'water') return <div className="sess light-sess">{top('Вода', 'Стакан после каждого намаза и между ними', () => setView('home'))}<Water state={state} update={update} today={today} /></div>;
  if (view === 'fasts') return <div className="sess light-sess">{top('Посты сунны', 'Понедельник, четверг, белые дни', () => setView('home'))}<Fasts state={state} update={update} today={today} /></div>;
  if (view === 'workouts') return (
    <div className="sess light-sess">
      {top('Тренировки', 'Без инвентаря, таймер ведёт сам', () => setView('home'))}
      <div className="h-wrap">
        {WORKOUTS.map((w) => {
          const total = w.rounds * w.ex.reduce((a, e) => a + e.sec + w.rest, 0);
          const doneToday = h.workouts[today]?.includes(w.id);
          return (
            <button type="button" key={w.id} className="h-card" onClick={() => setRun(w)}>
              <b>{doneToday ? '✓ ' : ''}{w.title}</b>
              <small>{w.sub} · {w.ex.length} упражнений{w.rounds > 1 ? ` × ${w.rounds}` : ''} · ~{Math.round(total / 60)} мин</small>
              <span className="h-ex">{w.ex.map((e) => e.n).join(' · ')}</span>
            </button>
          );
        })}
        <p className="q-msg">Если есть боль или проблемы со здоровьем, сначала посоветуйся с врачом.</p>
      </div>
    </div>
  );

  const lastNight = h.sleep[today];
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>Здоровье</b><small>«Твоё тело имеет на тебя право» (аль-Бухари)</small></div>
      </div>
      <div className="h-wrap">
        {inRamadan(today) && (
          <div className="h-card fast-card">
            <b>🌙 Рамадан</b>
            <small>Воду пей между ифтаром и сухуром: 2 стакана на ифтаре, 2 после Магриба, 2 после таравиха, 2 на сухуре. Тренировку делай через 1–2 часа после ифтара и легче обычного. Короткую зарядку после Фаджра можно оставить.</small>
          </div>
        )}
        <button type="button" className="h-card" onClick={() => setView('sleep')}>
          <span className="h-ic">🌙</span>
          <b>Сон</b>
          <small>Сегодня ложись до <em>{hhmm(bedAt)}</em>, чтобы спать {h.sleepHours} ч и встать к Фаджру ({hhmm(fajrTomorrow)})</small>
          {lastNight ? <span className="h-ex">Прошлой ночью: {durationLabel(sleepMin(lastNight) * 60000)}</span> : <span className="h-ex">Отметь, как спал этой ночью</span>}
        </button>
        <div className="h-card">
          <button type="button" className="h-head" onClick={() => setView('water')}>
            <span className="h-ic">💧</span><b>Вода</b><small>{water} из {h.waterGoal} стаканов</small>
          </button>
          <div className="glasses" style={{ gridTemplateColumns: `repeat(${Math.min(h.waterGoal, 8)}, 1fr)` }}>
            {Array.from({ length: h.waterGoal }, (_, i) => (
              <button type="button" key={i} aria-label={`Стакан ${i + 1}`} aria-pressed={i < water}
                onClick={() => update((s) => patchHealth(s, (x) => ({ water: { ...x.water, [today]: i < (x.water[today] ?? 0) ? i : i + 1 } })))} />
            ))}
          </div>
        </div>
        <button type="button" className="h-card" onClick={() => setView('workouts')}>
          <span className="h-ic">💪</span>
          <b>Тренировки</b>
          <small>Зарядка после Фаджра, спина и шея, сила без инвентаря</small>
          {h.workouts[today]?.length ? <span className="h-ex">Сегодня: {h.workouts[today].length} ✓</span> : null}
        </button>
        <button type="button" className="h-card" onClick={() => setView('fasts')}>
          <span className="h-ic">🌅</span>
          <b>Посты сунны</b>
          <small>{fastToday ? `Сегодня: ${fastToday.toLowerCase()}, желательный пост` : nextFastLabel(today)}</small>
          {h.fasts[today] ? <span className="h-ex">Сегодня постишься ✓</span> : null}
        </button>
      </div>
    </div>
  );
}

function nextFastLabel(today: string) {
  for (let i = 1; i < 30; i++) {
    const k = addDays(today, i);
    const why = sunnahFast(fromKey(k));
    if (why) return `Ближайший: ${i === 1 ? 'завтра' : fmtDay(k)}, ${why.toLowerCase()}`;
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
        <small>Сегодня ложись до</small>
        <b className="h-big">{hhmm(bedAt)}</b>
        <small>Подъём {hhmm(wakeAt)} · Фаджр {hhmm(fajr)}</small>
      </div>
      <div className="h-row">
        <label className="field"><span>Сколько спать</span>
          <select value={h.sleepHours} onChange={(e) => update((s) => patchHealth(s, () => ({ sleepHours: Number(e.target.value) })))}>
            {[6, 6.5, 7, 7.5, 8, 8.5, 9].map((v) => <option key={v} value={v}>{String(v).replace('.5', ',5')} ч</option>)}
          </select>
        </label>
        <label className="field"><span>Встать до Фаджра за</span>
          <select value={h.wakeBefore} onChange={(e) => update((s) => patchHealth(s, () => ({ wakeBefore: Number(e.target.value) })))}>
            {[0, 10, 20, 30, 45, 60].map((v) => <option key={v} value={v}>{v} мин</option>)}
          </select>
        </label>
      </div>

      <h2 className="sub-h">Как спал этой ночью</h2>
      <div className="h-row">
        <label className="field"><span>Лёг</span><input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></label>
        <label className="field"><span>Встал</span><input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></label>
      </div>
      <div className="h-q">
        {([[1, 'Плохо'], [2, 'Нормально'], [3, 'Хорошо']] as const).map(([q, l]) => (
          <button type="button" key={q} aria-pressed={prev?.q === q} onClick={() => save(q)}>{l}</button>
        ))}
      </div>
      {prev && <p className="q-msg">Записано: {durationLabel(sleepMin(prev) * 60000)}</p>}

      <h2 className="sub-h">Неделя {avg ? <small>в среднем {durationLabel(avg * 60000)}</small> : null}</h2>
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
        <small>Сегодня</small>
        <b className="h-big">{n} / {h.waterGoal}</b>
        <div className="h-q">
          <button type="button" onClick={() => set(n - 1)}>− стакан</button>
          <button type="button" aria-pressed onClick={() => set(n + 1)}>+ стакан</button>
        </div>
      </div>
      <label className="field"><span>Цель в день</span>
        <select value={h.waterGoal} onChange={(e) => update((s) => patchHealth(s, () => ({ waterGoal: Number(e.target.value) })))}>
          {[5, 6, 7, 8, 9, 10, 12].map((v) => <option key={v} value={v}>{v} стаканов</option>)}
        </select>
      </label>
      <p className="q-msg">Простое правило: стакан после каждого намаза, и ещё несколько между ними. Пей сидя, в три глотка, как в сунне.</p>
      <h2 className="sub-h">Неделя</h2>
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
      <div className="stat-card"><div className="big">{count}</div><div><b>постов в этом месяце</b><small>отмечай после ифтара</small></div></div>
      <div className="fast-list">
        {days.map((k) => {
          const future = k > today;
          return (
            <button type="button" key={k} className={`fast${k === today ? ' now' : ''}`} disabled={future} aria-pressed={Boolean(h.fasts[k])} onClick={() => toggle(k)}>
              <b>{k === today ? 'Сегодня' : fmtDay(k)}</b>
              <small>{sunnahFast(fromKey(k))}</small>
              <span>{h.fasts[k] ? '✓' : future ? '' : '○'}</span>
            </button>
          );
        })}
      </div>
      <p className="q-msg">Даты хиджры по календарю Умм аль-Кура. В твоей общине начало месяца может отличаться на день.</p>
    </div>
  );
}

function Runner({ w, habitName, onClose, onDone }: { w: Workout; habitName?: string; onClose: () => void; onDone: (m: Mark | null) => void }) {
  const steps = Array.from({ length: w.rounds }, (_, r) => w.ex.flatMap((e, i) => {
    const s = [{ kind: 'work' as const, e, r }];
    const last = r === w.rounds - 1 && i === w.ex.length - 1;
    return last ? s : [...s, { kind: 'rest' as const, e: w.ex[(i + 1) % w.ex.length], r }];
  })).flat();
  const [idx, setIdx] = useState(-1);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const endAt = useRef(0);
  const finished = idx >= steps.length;
  const step = steps[idx];
  const dur = step ? (step.kind === 'work' ? step.e.sec : w.rest) : 0;

  const go = (i: number) => {
    setIdx(i);
    const s = steps[i];
    if (!s) { try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ } return; }
    const d = s.kind === 'work' ? s.e.sec : w.rest;
    endAt.current = Date.now() + d * 1000;
    setLeft(d);
    try { navigator.vibrate?.(120); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (idx < 0 || finished || paused) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) go(idx + 1);
    }, 250);
    return () => clearInterval(t);
  }, [idx, paused, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const C = 2 * Math.PI * 110;
  return (
    <div className="sess">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onClose} aria-label="Выйти">✕</button>
        <div><b>{w.title}</b><small>{finished ? 'Готово' : idx < 0 ? w.sub : `${step.kind === 'work' ? 'Упражнение' : 'Отдых'} · ${Math.min(steps.filter((s, j) => s.kind === 'work' && j <= idx).length, w.ex.length * w.rounds)} из ${w.ex.length * w.rounds}`}</small></div>
      </div>
      {idx < 0 ? (
        <>
          <ol className="w-list">{w.ex.map((e) => <li key={e.n}><b>{e.n}</b> <small>{e.sec} сек</small><br /><small>{e.hint}</small></li>)}</ol>
          <button type="button" className="gold-btn" onClick={() => go(0)}>Начать</button>
        </>
      ) : finished ? (
        <div className="finish">
          <b>Готово, машаАллах</b>
          <p>{habitName ? 'Как отметить привычку?' : 'Тренировка записана.'}</p>
          <div className="row2">
            {habitName ? (
              <>
                <button type="button" onClick={() => onDone('min')}>Минимум</button>
                <button type="button" className="gold-btn" onClick={() => onDone('done')}>Сделано</button>
              </>
            ) : <button type="button" className="gold-btn" onClick={() => onDone(null)}>Закрыть</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="w-now">
            <small>{step.kind === 'rest' ? 'Отдых. Дальше:' : w.rounds > 1 ? `Круг ${step.r + 1}` : ''}</small>
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
          <div className="row2">
            <button type="button" onClick={() => { if (paused) endAt.current = Date.now() + left * 1000; setPaused(!paused); }}>{paused ? 'Продолжить' : 'Пауза'}</button>
            <button type="button" onClick={() => go(idx + 1)}>Пропустить ›</button>
          </div>
        </>
      )}
    </div>
  );
}
