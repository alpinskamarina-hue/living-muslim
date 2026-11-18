import { Hint } from './Guide';
import { say, type Trigger } from '../words';
import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { sphereName } from '../types';
import { isCounted, setMark } from '../store';
import { Quran } from './Quran';
import { prepPct } from './Umrah';
import type { UmrahApi } from '../umrahCircle';
import { Food, foodOf } from './Food';
import { Sadaqa, sadaqaOf, sadaqaStreak } from './Sadaqa';
import { health } from '../health';
import { debt, ramadanDay, ramadanMonth, ramadanOf } from '../ramadan';
import { A1 } from '../course/a1';
import { lazyNamed } from '../lazy';
const Books = lazyNamed(() => import('./Books').then((m) => m.Books));
const Languages = lazyNamed(() => import('./Languages').then((m) => m.Languages));
const Course = lazyNamed(() => import('./Course').then((m) => m.Course));
const Health = lazyNamed(() => import('./Health').then((m) => m.Health));
const UmrahHub = lazyNamed(() => import('./UmrahHub').then((m) => m.UmrahHub));
const Videos = lazyNamed(() => import('./Videos').then((m) => m.Videos));
import { isCloud } from '../cloud';
import { catalog as catalogItems } from '../videos';
import { _t, _tj, isEn } from '../i18n';
import { dayPlan, markStarted, startedOf, type PlanItem } from '../dayplan';
import { Azkar } from './Azkar';
import { activeQuits, cleanDays } from '../quit';
import { azkarNow, streak as azkarStreak } from '../azkar';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  suggestedId?: string;
  onSafar: () => void;
  onRamadan: () => void;
  /** Opened from a goal: which practice, and for videos which course. */
  start?: { mode: string; ref?: string };
  umrah: UmrahApi;
  onQuit?: () => void;
}

type Mode = 'home' | 'focus' | 'tasbih' | 'azkar' | 'quran' | 'books' | 'langs' | 'course' | 'health' | 'umrah' | 'food' | 'sadaqa' | 'videos' | 'body';

export function Practice({ state, update, today, suggestedId, onSafar, onRamadan, start, umrah, onQuit }: Props) {
  const [mode, setMode] = useState<Mode>((start?.mode as Mode) ?? 'home');
  const active = state.habits.filter((h) => h.status === 'active');
  const [habitId, setHabitId] = useState<string>(suggestedId ?? active[0]?.id ?? '');
  const habit = active.find((h) => h.id === habitId);
  const markHabit = (m: Mark) => habitId && update((s) => setMark(s, today, habitId, m));
  const [editFav, setEditFav] = useState(false);
  const [special, setSpecial] = useState(false);
  const [vref, setVref] = useState<string | undefined>(start?.mode === 'videos' ? start.ref : undefined);

  // Opening a section greets once a day with one fitting ayah or hadith (the sections are full-screen sheets).
  const OPEN: Partial<Record<Mode, Trigger>> = { quran: 'quran_open', langs: 'langs_open', books: 'books_open', health: 'health_open', sadaqa: 'sadaqa_open', food: 'food_open', umrah: 'umrah_open' };
  useEffect(() => { const t = OPEN[mode]; if (t) say(t); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === 'focus') return <Focus habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'quran') return <Quran state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'course') return <Course state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={(m) => { markHabit(m); setMode('home'); }} />;
  if (mode === 'langs') return <Languages state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} onCourse={() => setMode('course')} />;
  if (mode === 'books') return <Books state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'health') return <Health state={state} update={update} today={today} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'sadaqa') return <Sadaqa state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'food') return <Food state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'umrah') return <UmrahHub state={state} update={update} today={today} api={umrah} nameOf={(id) => umrah.names[id] || _t("Участник")} backLabel={_t("Практика")} onExit={() => setMode('home')} />;
  if (mode === 'videos') return <Videos state={state} update={update} habitName={habit?.action} open={vref} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'body') return (
    <div className="page">
      <button type="button" className="link-btn pro-back" onClick={() => setMode('home')}>{_t("← Практика")}</button>
      <h1 className="page-h">{_t("Тело")}</h1>
      <p className="page-sub">{_t("Тело — аманат. Немного каждый день.")}</p>
      <div className="pgrp">
        <button type="button" className="prow" onClick={() => setMode('health')}><i className="pic">🌿</i><span><b>{_t("Здоровье")}</b><small>{_t("Вода {0}/{1} · сон, тренировки, посты", health(state).water[today] ?? 0, health(state).waterGoal)}</small></span><em>›</em></button>
        <button type="button" className="prow" onClick={() => setMode('food')}><i className="pic">🍽</i><span><b>{_t("Питание")}</b><small>{(() => { const n = Object.keys(foodOf(state).meals[today] ?? {}).length; return n ? _t("Сегодня отмечено {0} из 3", n) : _t("Правило трети, сунна, чистые дни"); })()}</small></span><em>›</em></button>
      </div>
    </div>
  );
  if (mode === 'azkar') return <Azkar state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'tasbih') return <Tasbih onExit={() => setMode('home')} onFinish={() => markHabit('done')} habitName={habit?.action} />;

  // ---- home: «Сейчас», favourites, groups ----
  const due = state.langs?.current ? (state.langs.decks[state.langs.current] ?? []).filter((c) => c.due <= today).length : 0;
  const vs = state.videos;
  const vidDone = vs ? Object.values(vs.pos).filter((p) => p.done).length : 0;
  const rDay = ramadanDay(today);
  const rm = ramadanMonth(today);
  const rLeft = debt(ramadanOf(state)).left;
  const sq = sadaqaOf(state); const sqN = sadaqaStreak(sq, today); const sqToday = sq.days[today];

  const az = azkarNow(state, today);
  const azN = azkarStreak(state, today, az.part);
  const P: Record<string, Item> = {
    quran: { ic: 'قرآن', ar: true, title: _t("Коран"), sub: state.quran ? _t("Сура {0}, аят {1}", state.quran.surah, state.quran.ayah) : _t("Текст и перевод смыслов, закладка"), pct: state.quran ? state.quran.surah / 114 : undefined, open: () => setMode('quran') },
    azkar: { ic: 'أذكار', ar: true, title: _t("Азкары"), sub: az.done ? (az.part === 'm' ? _t("Утренние прочитаны ✓") : _t("Вечерние прочитаны ✓")) + (azN > 1 ? _t(" · серия {0}", azN) : '') : az.line, open: () => setMode('azkar') },
    tasbih: { ic: 'سبحان', ar: true, title: _t("Тасбих"), sub: _t("33 · 33 · 34 после намаза"), open: () => setMode('tasbih') },
    sadaqa: { ic: 'صدقة', ar: true, title: _t("Садака"), sub: sqToday?.money || sqToday?.deed ? _t("Сегодня есть ✓ · серия {0}", sqN) : sqN ? _t("Серия {0} · доброе дело дня ждёт", sqN) : _t("Каждый день понемногу, в тайне"), open: () => setMode('sadaqa') },
    ...(isCloud ? { videos: { ic: '▶', title: _t("Видеоуроки"), sub: vidDone ? _t("Просмотрено уроков: {0}", vidDone) : _t("Вера, бизнес, развитие и другое"), open: () => setMode('videos') } } : {}),
    books: { ic: '📖', title: _t("Книги"), sub: state.books?.length ? _t("На полке: {0}", state.books.length) : _t("Атомные привычки и свои PDF"), open: () => setMode('books') },
    langs: { ic: 'Aa', title: _t("Языки"), sub: state.course ? _t("Английский A1: день {0}{1}", state.course.day + 1, due ? _t(" · {0} к повторению", due) : '') : due ? _t("{0} карточек к повторению", due) : isEn ? _t("Карточки слов с повторением") : _t("Курс английского, карточки слов"), pct: state.course ? (state.course.day + 1) / A1.length : undefined, open: () => setMode('langs') },
    body: { ic: '🌿', title: _t("Здоровье и питание"), sub: _t("Вода {0}/{1} · еда {2} из 3 · сон, посты", health(state).water[today] ?? 0, health(state).waterGoal, Object.keys(foodOf(state).meals[today] ?? {}).length), open: () => setMode('body') },
    focus: { ic: '⏱', title: _t("Фокус-таймер"), sub: _t("Засечь время на любое дело"), open: () => setMode('focus') },
    umrah: { ic: 'عمرة', ar: true, title: _t("Умра"), sub: state.umrah?.prep?.length ? _t("Подготовка {0}%", prepPct(state)) : _t("Обряды со счётчиком, подготовка, дуа"), open: () => setMode('umrah') },
    quit: { ic: '🛡', title: _t("Хочу оставить"), sub: (() => { const a = activeQuits(state); return a.length ? a.map((q) => _t("{0}: {1} дн.", q.what, cleanDays(q, today))).join(' · ') : _t("Оставить вредную привычку, тайно"); })(), open: () => onQuit?.() },
    safar: { ic: '🧭', title: _t("Сафар"), sub: state.trip ? _t("Поездка: {0}", state.trip.place) : _t("Поездка, кибла, дуа путника"), open: onSafar },
  };
  const favIds = (state.practiceFav ?? ['quran', 'videos', 'tasbih', 'langs']).filter((id) => P[id]).slice(0, 4);
  const toggleFav = (id: string) => update((s) => {
    const cur = (s.practiceFav ?? favIds).filter((x) => P[x]);
    return { ...s, practiceFav: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id] };
  });

  // «Сейчас»: what fits this time of day.
  const h = new Date().getHours();
  const part = h >= 4 && h < 11 ? _t("утро") : h < 17 && h >= 11 ? _t("день") : h >= 17 ? _t("вечер") : _t("ночь");
  type Now = { title: string; sub: string; btn: string; go: () => void; short: string };
  const cand: Record<string, Now | null> = {
    ramadan: rDay ? { title: _t("Рамадан, день {0}", rDay), sub: _t("Пост, хатм, ночи"), btn: _t("Открыть"), go: onRamadan, short: _t("Рамадан") } : null,
    video: vs?.last ? { title: _t("Продолжить видеоурок"), sub: (() => { const it = [...vs.mine, ...catalogItems()].find((x) => x.id === vs.last!.item); return it ? it.title : _t("С того места, где остановился"); })(), btn: _t("▶ Продолжить"), go: () => setMode('videos'), short: _t("Видеоурок") } : null,
    quran: { title: state.quran ? _t("Коран: сура {0}, аят {1}", state.quran.surah, state.quran.ayah) : _t("Коран: несколько аятов"), sub: state.quran ? _t("С закладки, с переводом смыслов") : _t("Начни с суры Аль-Фатиха"), btn: _t("Читать"), go: () => setMode('quran'), short: _t("Коран") },
    azkar: az.live && !az.done ? { title: az.part === 'm' ? _t("Утренние азкары") : _t("Вечерние азкары"), sub: az.line, btn: _t("Начать"), go: () => setMode('azkar'), short: _t("Азкары") } : null,
    tasbih: { title: _t("Тасбих после намаза"), sub: _t("СубханаЛлах 33 · Альхамдулиллях 33 · Аллаху акбар 34"), btn: _t("Начать"), go: () => setMode('tasbih'), short: _t("Тасбих 33·33·34") },
    langs: due ? { title: _t("Повтори слова: {0}", due), sub: _t("Пара минут на карточки"), btn: _t("Повторить"), go: () => setMode('langs'), short: _t("Слова") } : null,
    course: state.course ? { title: _t("Английский: день {0}", state.course.day + 1), sub: A1[state.course.day]?.t ?? _t("Урок на 15 минут"), btn: _t("Продолжить"), go: () => setMode('course'), short: _t("Английский") } : null,
  };
  const order = part === _t("утро") ? ['ramadan', 'azkar', 'quran', 'tasbih', 'langs'] : part === _t("день") ? ['ramadan', 'azkar', 'langs', 'course', 'video', 'quran'] : part === _t("вечер") ? ['ramadan', 'azkar', 'video', 'quran', 'tasbih'] : ['ramadan', 'azkar', 'tasbih', 'quran'];
  const picks = order.map((k) => cand[k]).filter(Boolean) as Now[];
  const now = picks[0], alt = picks[1];

  // «На сегодня»: start opens the practice (and remembers it was started); «2 минуты» also ticks the habit's minimum.
  const plan = dayPlan(state, today);
  const go = (it: PlanItem, min?: boolean) => {
    update((s) => { const x = markStarted(s, today, it.key); return min && it.habitId ? setMark(x, today, it.habitId, 'min') : x; });
    if (it.habitId) setHabitId(it.habitId);
    setVref(it.ref);
    setMode(it.mode === 'focus' ? 'focus' : it.mode);
  };

  const season = rDay || (rm.state === 'next' && rm.daysTo <= 30);
  const row = (id: string) => { const it = P[id]; return it && (
    <button key={id} type="button" className="prow" onClick={editFav ? () => toggleFav(id) : it.open}>
      <i className={`pic${it.ar ? ' ar' : ''}`}>{it.ic}</i>
      <span><b>{it.title}</b><small>{it.sub}</small></span>
      <em>{editFav ? (favIds.includes(id) ? '★' : '☆') : '›'}</em>
    </button>
  ); };

  return (
    <div className="page">
      <h1 className="page-h">{_t("Практика")}</h1>
      <p className="page-sub">{_t("Сделай привычку здесь. Когда закончишь, она отметится сама.")}</p>
      <Hint id="practice" />

      <TodayPlan items={plan} startedN={startedOf(state, today).length} go={go} />

      {now && (
        <div className="pnow">
          <small>{_tj("Сейчас · {0}", part)}</small>
          <b>{now.title}</b>
          <p>{now.sub}</p>
          <div className="pnow-row">
            <button type="button" className="pnow-go" onClick={now.go}>{now.btn}</button>
            {alt && <button type="button" className="pnow-alt" onClick={alt.go}>{_tj("Или: {0}", alt.short)}</button>}
          </div>
          {active.length > 0 && (
            <label className="pnow-hab">{_t("Отметит привычку: ")}
              <select value={habitId} onChange={(e) => setHabitId(e.target.value)}>
                <option value="">{_t("без привязки")}</option>
                {active.map((x) => <option key={x.id} value={x.id}>{isCounted(state.log[today]?.[x.id]) ? '✓ ' : ''}{x.action} · {sphereName(x.sphere)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <h3 className="ph">{_t("Мои практики ")}<button type="button" className="link-btn" onClick={() => setEditFav(!editFav)}>{editFav ? _t("Готово") : _t("Изменить")}</button></h3>
      {editFav && <p className="tiny">{_t("Отметь звёздочкой до 4 практик ниже. Они будут стоять здесь первыми.")}</p>}
      <div className="pfav">
        {favIds.map((id) => { const it = P[id]; return (
          <button key={id} type="button" className="pf" onClick={it.open}>
            <i className={`pic${it.ar ? ' ar' : ''}`}>{it.ic}</i><b>{it.title}</b><small>{it.sub}</small>
            {it.pct !== undefined && <span className="pbar"><i style={{ width: `${Math.max(4, it.pct * 100)}%` }} /></span>}
          </button>
        ); })}
      </div>

      {season && (
        <button type="button" className="pseason" onClick={onRamadan}>
          <i>🌙</i>
          <span><b>{rDay ? _t("Рамадан, день {0} из {1}", rDay, rm.days.length) : _t("Рамадан через {0} {1}", rm.daysTo, rm.daysTo === 1 ? _t("день") : rm.daysTo < 5 ? _t("дня") : _t("дней"))}</b>
          <small>{rDay ? (ramadanOf(state).fasts[today] === 'fast' ? _t("Пост сегодня отмечен ✓ · хатм, ночи") : _t("Пост, хатм, последние ночи")) : _t("Подготовка: {0}план хатма, привычки на месяц", rLeft ? _t("долг {0} дн., ", rLeft) : '')}</small></span>
        </button>
      )}

      <div className="pgl">{_t("Поклонение")}</div>
      <div className="pgrp">{['quran', 'azkar', 'tasbih', 'sadaqa'].map(row)}</div>
      <div className="pgl">{_t("Знания")}</div>
      <div className="pgrp">{['videos', 'books', 'langs'].map(row)}</div>
      <div className="pgl">{_t("Тело и время")}</div>
      <div className="pgrp">{['body', 'focus'].map(row)}</div>
      <div className="pgl">{_t("Работа над собой")}</div>
      <div className="pgrp">{['quit'].map(row)}</div>

      <button type="button" className="pmore" onClick={() => setSpecial(!special)} aria-expanded={special}>
        <span>{_tj("Особые случаи: {0}", season ? _t("Умра, Сафар") : _t("Рамадан, Умра, Сафар"))}</span><span>{special ? '▴' : '›'}</span>
      </button>
      {special && (
        <div className="pgrp">
          {!season && (
            <button type="button" className="prow" onClick={onRamadan}><i className="pic">🌙</i><span><b>{_t("Рамадан")}</b><small>{rm.state === 'next' ? _t("Через {0} дн.", rm.daysTo) : _t("Ид и Шавваль")}{rLeft ? _t(" · долг {0} дн.", rLeft) : _t(" · пост, хатм, ночи")}</small></span><em>›</em></button>
          )}
          {['umrah', 'safar'].map(row)}
        </div>
      )}
    </div>
  );
}

function TodayPlan({ items, startedN, go }: { items: PlanItem[]; startedN: number; go: (it: PlanItem, min?: boolean) => void }) {
  if (!items.length) return startedN ? <div className="dp dp-done">{_t("✓ На сегодня всё начато. МашаАллах, продолжай в том же духе.")}</div> : null;
  return (
    <div className="dp">
      <div className="dp-h"><b>{_t("На сегодня")}</b><i>{items.length}</i></div>
      {items.slice(0, 4).map((it) => (
        <div key={it.key} className="dp-row">
          <span className="dp-ic">{it.ic}</span>
          <span className="dp-t"><b>{it.title}</b><small>{it.sub}</small></span>
          <span className="dp-btns">
            <button type="button" className="dp-go" onClick={() => go(it)}>{_t("Начать")}</button>
            {it.habitId && <button type="button" className="dp-min" onClick={() => go(it, true)}>{_t("2 минуты")}</button>}
          </span>
        </div>
      ))}
      {items.length > 4 && <small className="dp-more">{_t("и ещё {0}", items.length - 4)}</small>}
      <small className="dp-note">{_t("Нет сил? Нажми «2 минуты»: начать хватит, минимум засчитается.")}</small>
    </div>
  );
}

type Item = { ic: string; ar?: boolean; title: string; sub: string; pct?: number; open: () => void };

const PRESETS = [10, 15, 25, 45, 60];

function Focus({ habitName, onExit, onFinish }: { habitName?: string; onExit: () => void; onFinish: (m: Mark) => void }) {
  const [total, setTotal] = useState(() => { try { const v = Number(localStorage.getItem('qadam.focusMin')); return v >= 1 && v <= 240 ? v * 60 : 25 * 60; } catch { return 25 * 60; } });
  const [custom, setCustom] = useState(() => !PRESETS.includes(total / 60));
  const setMin = (m: number) => {
    const v = Math.min(240, Math.max(1, Math.round(m) || 1));
    setTotal(v * 60);
    try { localStorage.setItem('qadam.focusMin', String(v)); } catch { /* ignore */ }
  };
  const [left, setLeft] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState<null | 'full' | 'early'>(null);
  const endAt = useRef(0);

  useEffect(() => {
    if (left === null || paused || done) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        setDone('full');
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
      }
    }, 250);
    return () => clearInterval(t);
  }, [left === null, paused, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { endAt.current = Date.now() + total * 1000; setLeft(total); };
  const togglePause = () => {
    if (left === null) return;
    if (paused) endAt.current = Date.now() + left * 1000;
    setPaused(!paused);
  };
  const mm = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const C = 2 * Math.PI * 110;
  const shown = left ?? total;

  return (
    <div className="sess">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{habitName ?? _t("Фокус")}</b><small>{_t("Телефон в сторону. Только это дело.")}</small></div>
      </div>
      <div className="dial">
        <svg viewBox="0 0 240 240">
          <circle cx="120" cy="120" r="110" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
          <circle cx="120" cy="120" r="110" fill="none" stroke="var(--gold)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - shown / total)} transform="rotate(-90 120 120)" />
        </svg>
        <span>{mm(shown)}</span>
      </div>
      {left === null ? (
        <>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={!custom && total === p * 60} onClick={() => { setCustom(false); setMin(p); }}>{_tj("{0} мин", p)}</button>
            ))}
            <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>{_t("Своё")}</button>
          </div>
          {custom && (
            <div className="custom-min">
              <button type="button" onClick={() => setMin(total / 60 - 5)} aria-label={_t("Меньше на 5 минут")}>−5</button>
              <button type="button" onClick={() => setMin(total / 60 - 1)} aria-label={_t("Меньше на минуту")}>−1</button>
              <label><input type="number" inputMode="numeric" min={1} max={240} value={total / 60} onChange={(e) => setMin(Number(e.target.value))} aria-label={_t("Минуты")} />{_t(" мин")}</label>
              <button type="button" onClick={() => setMin(total / 60 + 1)} aria-label={_t("Больше на минуту")}>+1</button>
              <button type="button" onClick={() => setMin(total / 60 + 5)} aria-label={_t("Больше на 5 минут")}>+5</button>
            </div>
          )}
          <button type="button" className="gold-btn" onClick={start}>{_t("Начать")}</button>
        </>
      ) : done ? (
        <div className="finish">
          <b>{done === 'full' ? _t("Готово, машаАллах") : _t("Остановлено раньше")}</b>
          <p>{habitName ? _t("Как отметить привычку?") : _t("Сессия завершена.")}</p>
          {habitName ? (
            <div className="row2">
              <button type="button" onClick={() => { onFinish('min'); onExit(); }}>{_t("Минимум")}</button>
              <button type="button" className="gold-btn" onClick={() => { onFinish('done'); onExit(); }}>{_t("Сделано")}</button>
            </div>
          ) : (
            <button type="button" className="gold-btn" onClick={onExit}>{_t("Закрыть")}</button>
          )}
        </div>
      ) : (
        <div className="row2">
          <button type="button" onClick={togglePause}>{paused ? _t("Продолжить") : _t("Пауза")}</button>
          <button type="button" className="gold-btn" onClick={() => setDone('early')}>{_t("Закончить")}</button>
        </div>
      )}
    </div>
  );
}

const DHIKR = [
  { ar: 'سُبْحَانَ ٱللَّٰهِ', ru: _t("СубханАллах"), n: 33 },
  { ar: 'ٱلْحَمْدُ لِلَّٰهِ', ru: _t("Альхамдулиллях"), n: 33 },
  { ar: 'ٱللَّٰهُ أَكْبَرُ', ru: _t("Аллаху акбар"), n: 34 },
];

function Tasbih({ onExit, onFinish, habitName }: { onExit: () => void; onFinish: () => void; habitName?: string }) {
  const [count, setCount] = useState(0);
  let rest = count;
  let step = 0;
  while (step < DHIKR.length - 1 && rest >= DHIKR[step].n) { rest -= DHIKR[step].n; step++; }
  const all = count >= 100;
  const cur = DHIKR[step];

  const tap = () => {
    if (all) return;
    const next = count + 1;
    setCount(next);
    try { navigator.vibrate?.(next === 33 || next === 66 || next === 100 ? 120 : 15); } catch { /* ignore */ }
  };

  return (
    <div className="sess">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Тасбих")}</b><small>{_t("Нажимай в любом месте круга")}</small></div>
      </div>
      <button type="button" className="tasbih" onClick={tap} aria-label={_t("Плюс один")}>
        <span className="ar-big">{all ? 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ' : cur.ar}</span>
        <span className="tr">{all ? _t("Ля иляха илляЛлах") : cur.ru}</span>
        <span className="cnt">{all ? '100' : `${Math.min(rest, cur.n)} / ${cur.n}`}</span>
      </button>
      <div className="dots3">
        {DHIKR.map((d, i) => (
          <i key={d.ru} data-on={i < step || all ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>
      {all ? (
        <div className="row2">
          <button type="button" onClick={() => setCount(0)}>{_t("Заново")}</button>
          <button type="button" className="gold-btn" onClick={() => { say('tasbih_done'); if (habitName) onFinish(); onExit(); }}>
            {habitName ? _t("Отметить привычку") : _t("Готово")}
          </button>
        </div>
      ) : (
        <div className="row2">
          <button type="button" onClick={() => setCount(0)}>{_t("Сбросить")}</button>
          <button type="button" onClick={() => setCount(Math.max(0, count - 1))}>−1</button>
        </div>
      )}
    </div>
  );
}
