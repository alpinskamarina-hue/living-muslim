import { Hint } from './Guide';
import { MamaNap } from './Sisters';
import { mamaOf } from '../sisters';
import { PIcon } from './PIcon';
import { openPath } from './NewPath';
import { pathNow } from '../newpath';
import { history as halalHistory, mineHalal } from '../halal';
import { say, type Trigger } from '../words';
import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { setMark } from '../store';
import { Quran } from './Quran';
import { umrahReady } from '../umrah/path';
import type { UmrahApi } from '../umrahCircle';
import type { CircleApi } from '../circle';
import type { HubTab } from './UmrahHub';
import { Food, foodOf } from './Food';
import { Sadaqa, sadaqaOf, sadaqaStreak } from './Sadaqa';
import { health } from '../health';
import { debt, ramadanDay, ramadanMonth, ramadanOf } from '../ramadan';
import { A1 } from '../course/a1';
import { lazyNamed } from '../lazy';
const Books = lazyNamed(() => import('./Books').then((m) => m.Books));
const Languages = lazyNamed(() => import('./Languages').then((m) => m.Languages));
const Course = lazyNamed(() => import('./Course').then((m) => m.Course));
const ArCourse = lazyNamed(() => import('./ArCourse').then((m) => m.ArCourse));
const Health = lazyNamed(() => import('./Health').then((m) => m.Health));
const UmrahHub = lazyNamed(() => import('./UmrahHub').then((m) => m.UmrahHub));
const Videos = lazyNamed(() => import('./Videos').then((m) => m.Videos));
const SelfTest = lazyNamed(() => import('./SelfTest').then((m) => m.SelfTest));
const UmrahTest = lazyNamed(() => import('./UmrahTest').then((m) => m.UmrahTest));
const SalahTest = lazyNamed(() => import('./SalahTest').then((m) => m.SalahTest));
import { lastRun, repeatIn } from '../selftest';
import { UMRAH_TEST, uTotal } from '../umrahTest';
import { RUNGS, SALAH_REPEAT, SALAH_TEST, rungOf } from '../salahTest';
import { daysBetween } from '../dates';
import { isCloud } from '../cloud';
import { catalog as catalogItems } from '../videos';
import { _t, _tj, isEn } from '../i18n';
import { dayPlan, markStarted, type PlanItem } from '../dayplan';
import { Azkar } from './Azkar';
import { activeQuits, cleanDays } from '../quit';
import { azkarNow, streak as azkarStreak } from '../azkar';
import { openSec, track } from '../usage';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  suggestedId?: string;
  onSafar: () => void;
  onKhutba?: () => void;
  onHalal?: () => void;
  onRamadan: () => void;
  /** Opened from a goal: which practice, and for videos which course. */
  start?: { mode: string; ref?: string };
  umrah: UmrahApi;
  circle?: CircleApi;
  joined?: boolean;
  umrahStart?: HubTab;
  onQuit?: () => void;
}

type Mode = 'home' | 'focus' | 'tasbih' | 'azkar' | 'quran' | 'books' | 'langs' | 'course' | 'course-ar' | 'health' | 'umrah' | 'food' | 'sadaqa' | 'videos' | 'body' | 'tests' | 'test-umrah' | 'test-salah' | 'nap';

export function Practice({ state, update, today, suggestedId, onSafar, onHalal, onKhutba, onRamadan, start, umrah, onQuit, circle, joined, umrahStart }: Props) {
  const [mode, setMode] = useState<Mode>((start?.mode as Mode) ?? 'home');
  const active = state.habits.filter((h) => h.status === 'active');
  const [habitId, setHabitId] = useState<string>(suggestedId ?? active[0]?.id ?? '');
  const habit = active.find((h) => h.id === habitId);
  const markHabit = (m: Mark) => { track(mode === 'home' ? 'practice' : mode, 'finish'); if (habitId) update((s) => setMark(s, today, habitId, m)); };
  const [editFav, setEditFav] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(() => { try { return localStorage.getItem('lm.pall') === '1'; } catch { return false; } });
  const [uStart, setUStart] = useState<HubTab | undefined>();
  const [vref, setVref] = useState<string | undefined>(start?.mode === 'videos' ? start.ref : undefined);

  // Opening a section greets once a day with one fitting ayah or hadith (the sections are full-screen sheets).
  const OPEN: Partial<Record<Mode, Trigger>> = { quran: 'quran_open', langs: 'langs_open', books: 'books_open', health: 'health_open', sadaqa: 'sadaqa_open', umrah: 'umrah_open' };
  useEffect(() => { openSec(mode === 'home' ? 'practice' : mode); const t = OPEN[mode]; if (t) say(t); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === 'focus') return <Focus habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'quran') return <Quran state={state} update={update} habitName={habit?.action} startSurah={start?.mode === 'quran' && start.ref ? Number(start.ref) : undefined} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'course') return <Course state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={(m) => { markHabit(m); setMode('home'); }} />;
  if (mode === 'course-ar') return <ArCourse state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={(m) => { markHabit(m); setMode('home'); }} />;
  if (mode === 'langs') return <Languages state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} onCourse={() => setMode('course')} onCourseAr={() => setMode('course-ar')} />;
  if (mode === 'books') return <Books state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'health') return <Health state={state} update={update} today={today} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} onFood={() => setMode('food')} />;
  if (mode === 'sadaqa') return <Sadaqa state={state} update={update} today={today} startSub={start?.mode === 'sadaqa' && start.ref === 'gift' ? 'gift' : undefined} onExit={() => setMode('home')} />;
  if (mode === 'food') return <Food state={state} update={update} today={today} onExit={() => setMode('home')} onHealth={() => setMode('health')} />;
  if (mode === 'umrah') return <UmrahHub state={state} update={update} today={today} api={umrah} nameOf={(id) => umrah.names[id] || _t("Участник")} circle={circle} joined={joined} start={uStart ?? umrahStart ?? 'rites'} backLabel={_t("Практика")} onExit={() => setMode('home')} />;
  if (mode === 'videos') return <Videos state={state} update={update} habitName={habit?.action} open={vref} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'body') return (
    <div className="page">
      <button type="button" className="link-btn pro-back" onClick={() => setMode('home')}>{_t("← Практика")}</button>
      <h1 className="page-h">{_t("Тело")}</h1>
      <p className="page-sub">{_t("Тело — аманат. Немного каждый день.")}</p>
      <div className="pgrp">
        <button type="button" className="prow" onClick={() => setMode('health')}><PIcon k="leaf" /><span><b>{_t("Здоровье")}</b><small>{_t("Вода {0}/{1} · сон, тренировки, посты", health(state).water[today] ?? 0, health(state).waterGoal)}</small></span><em>›</em></button>
        <button type="button" className="prow" onClick={() => setMode('food')}><PIcon k="apple" /><span><b>{_t("Питание")}</b><small>{(() => { const n = Object.keys(foodOf(state).meals[today] ?? {}).length; return n ? _t("Сегодня отмечено {0} из 3", n) : _t("Правило трети, сунна, чистые дни"); })()}</small></span><em>›</em></button>
      </div>
    </div>
  );
  if (mode === 'test-umrah') return <UmrahTest state={state} update={update} today={today} onExit={() => setMode('home')} onUmrah={() => { setUStart('heart'); setMode('umrah'); }} />;
  if (mode === 'test-salah') return <SalahTest state={state} update={update} today={today} onExit={() => setMode('home')} onOpen={(m) => setMode(m)} />;
  if (mode === 'tests') return <SelfTest state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'azkar') return <Azkar state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'nap') return <MamaNap state={state} update={update} today={today} onExit={() => setMode('home')} onOpen={(m) => setMode(m)} />;
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
    quran: { ic: 'book', title: _t("Коран"), sub: state.quran ? _t("Сура {0}, аят {1}", state.quran.surah, state.quran.ayah) : _t("Текст и перевод смыслов, закладка"), pct: state.quran ? state.quran.surah / 114 : undefined, open: () => setMode('quran') },
    azkar: { ic: az.part === 'm' ? 'sun' : 'moon', title: _t("Азкары"), sub: az.done ? (az.part === 'm' ? _t("Утренние прочитаны ✓") : _t("Вечерние прочитаны ✓")) + (azN > 1 ? _t(" · серия {0}", azN) : '') : az.line, open: () => setMode('azkar') },
    tasbih: { ic: 'beads', title: _t("Тасбих"), sub: _t("33 · 33 · 34 после намаза"), open: () => setMode('tasbih') },
    sadaqa: { ic: 'heart', title: _t("Садака"), sub: sqToday?.money || sqToday?.deed ? _t("Сегодня есть ✓ · серия {0}", sqN) : sqN ? _t("Серия {0} · доброе дело дня ждёт", sqN) : _t("Каждый день понемногу, в тайне"), open: () => setMode('sadaqa') },
    ...(isCloud ? { videos: { ic: 'play', title: _t("Курсы"), sub: vidDone ? _t("Пройдено уроков: {0}", vidDone) : _t("Уроки, практика, тесты и сертификат"), open: () => setMode('videos') } } : {}),
    books: { ic: 'books', title: _t("Книги"), sub: state.books?.length ? _t("На полке: {0}", state.books.length) : _t("Атомные привычки и свои PDF"), open: () => setMode('books') },
    langs: { ic: 'lang', badge: due, title: _t("Языки"), sub: state.course ? _t("Английский A1: день {0}{1}", state.course.day + 1, due ? _t(" · {0} к повторению", due) : '') : state.courseAr ? _t("Арабский A1: день {0}{1}", state.courseAr.day + 1, due ? _t(" · {0} к повторению", due) : '') : due ? _t("{0} карточек к повторению", due) : isEn ? _t("Арабский A1, карточки слов") : _t("Курсы английского и арабского, карточки слов"), pct: state.course ? (state.course.day + 1) / A1.length : state.courseAr ? (state.courseAr.day + 1) / 30 : undefined, open: () => setMode('langs') },
    body: { ic: 'leaf', title: _t("Здоровье и питание"), sub: _t("Вода {0}/{1} · еда {2} из 3 · сон, посты", health(state).water[today] ?? 0, health(state).waterGoal, Object.keys(foodOf(state).meals[today] ?? {}).length), open: () => setMode('food') },
    ...(mamaOf(state) ? { nap: { ic: 'moon', title: _t("Пока малыш спит"), sub: (() => { const n = state.sis?.nap?.[today]?.length ?? 0; return n ? _tj("Сегодня сделано: {0}", n) : _t("Дуа, аят, тасбих: по 1–3 минуты"); })(), open: () => setMode('nap') } } : {}),
    focus: { ic: 'timer', title: _t("Фокус-таймер"), sub: _t("Засечь время на любое дело"), open: () => setMode('focus') },
    umrah: { ic: 'kaaba', title: _t("Умра"), sub: state.umrah?.prep?.length || state.umrah?.ready ? _t("Готовность {0}%", umrahReady(state)) : _t("Обряды со счётчиком, подготовка, дуа"), open: () => setMode('umrah') },
    quit: { ic: 'shield', title: _t("Хочу оставить"), sub: (() => { const a = activeQuits(state); return a.length ? a.map((q) => _t("{0}: {1} дн.", q.what, cleanDays(q, today))).join(' · ') : _t("Оставить вредную привычку, тайно"); })(), open: () => onQuit?.() },
    tests: { ic: 'test', title: _t("Тест: что мне даётся труднее"), sub: (() => { const r = lastRun(state); if (!r) return _t("3 минуты · сильная сторона и план на месяц"); const l = repeatIn(r, today); return l <= 0 ? _t("Прошло 30 дней: пора пройти снова") : _t("Пройден {0} · повтор через {1} дн.", r.day.slice(8, 10) + '.' + r.day.slice(5, 7), l); })(), open: () => setMode('tests') },
    testUmrah: { ic: 'test', title: _t("Тест: готовность к умре"), sub: (() => { const r = lastRun(state, UMRAH_TEST); if (!r) return _t("3 минуты · что осталось сделать до поездки"); const l = repeatIn(r, today); return l <= 0 ? _tj("{0} из 24 · пора пройти снова", uTotal(r.a)) : _tj("{0} из 24 · повтор через {1} дн.", uTotal(r.a), l); })(), open: () => setMode('test-umrah') },
    testSalah: { ic: 'test', title: _t("Тест: намаз и Коран"), sub: (() => { const r = lastRun(state, SALAH_TEST); if (!r) return _t("2 минуты · твоя ступенька и следующий шаг"); const st = RUNGS[rungOf(r.a) - 1].title; const l = SALAH_REPEAT - daysBetween(r.day, today); return l <= 0 ? _tj("Ступень «{0}» · пора пройти снова", st) : _tj("Ступень «{0}» · повтор через {1} дн.", st, l); })(), open: () => setMode('test-salah') },
    khutba: { ic: 'lang', title: _t("Перевод хутбы"), sub: _t("Хутба и уроки на арабском или турецком, текстом"), open: () => onKhutba?.() },
    halal: { ic: 'scan', title: _t("Халяль-сканер"), sub: (() => { const h = halalHistory(); const m = h.filter((x) => x.v === 'green' && mineHalal(x.code)).length; return h.length ? (m ? _tj("Проверено {0} · {1} отмечено тобой", h.length, m) : _tj("Проверено товаров: {0}", h.length)) : _t("Штрихкод в магазине: есть ли запрещённое"); })(), open: () => onHalal?.() },
    safar: { ic: 'compass', title: _t("Сафар"), sub: state.trip ? _t("Поездка: {0}", state.trip.place) : _t("Поездка, кибла, дуа путника"), open: onSafar },
  };
  const favIds = (state.practiceFav ?? ['quran', 'videos', 'tasbih', 'langs']).filter((id) => P[id]).slice(0, FAV_MAX);
  const toggleFav = (id: string) => update((s) => {
    const cur = (s.practiceFav ?? favIds).filter((x) => P[x]);
    return { ...s, practiceFav: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= FAV_MAX ? cur : [...cur, id] };
  });

  // «Сейчас»: what fits this time of day.
  const h = new Date().getHours();
  const part = h >= 4 && h < 11 ? _t("утро") : h < 17 && h >= 11 ? _t("день") : h >= 17 ? _t("вечер") : _t("ночь");
  type Now = { title: string; sub: string; btn: string; go: () => void; short: string };
  const cand: Record<string, Now | null> = {
    ramadan: rDay ? { title: _t("Рамадан, день {0}", rDay), sub: _t("Пост, хатм, ночи"), btn: _t("Открыть"), go: onRamadan, short: _t("Рамадан") } : null,
    video: vs?.last ? { title: _t("Продолжить курс"), sub: (() => { const it = [...vs.mine, ...catalogItems()].find((x) => x.id === vs.last!.item); return it ? it.title : _t("С того места, где остановился"); })(), btn: _t("▶ Продолжить"), go: () => setMode('videos'), short: _t("Курс") } : null,
    quran: { title: state.quran ? _t("Коран: сура {0}, аят {1}", state.quran.surah, state.quran.ayah) : _t("Коран: несколько аятов"), sub: state.quran ? _t("С закладки, с переводом смыслов") : _t("Начни с суры Аль-Фатиха"), btn: _t("Читать"), go: () => setMode('quran'), short: _t("Коран") },
    azkar: az.live && !az.done ? { title: az.part === 'm' ? _t("Утренние азкары") : _t("Вечерние азкары"), sub: az.line, btn: _t("Начать"), go: () => setMode('azkar'), short: _t("Азкары") } : null,
    tasbih: { title: _t("Тасбих после намаза"), sub: _t("СубханаЛлах 33 · Альхамдулиллях 33 · Аллаху акбар 34"), btn: _t("Начать"), go: () => setMode('tasbih'), short: _t("Тасбих 33·33·34") },
    langs: due ? { title: _t("Повтори слова: {0}", due), sub: _t("Пара минут на карточки"), btn: _t("Повторить"), go: () => setMode('langs'), short: _t("Слова") } : null,
    course: state.course ? { title: _t("Английский: день {0}", state.course.day + 1), sub: A1[state.course.day]?.t ?? _t("Урок на 15 минут"), btn: _t("Продолжить"), go: () => setMode('course'), short: _t("Английский") } : null,
    courseAr: state.courseAr ? { title: _t("Арабский: день {0}", state.courseAr.day + 1), sub: _t("Урок на 15 минут"), btn: _t("Продолжить"), go: () => setMode('course-ar'), short: _t("Арабский") } : null,
  };
  const order = part === _t("утро") ? ['ramadan', 'azkar', 'quran', 'tasbih', 'langs'] : part === _t("день") ? ['ramadan', 'azkar', 'langs', 'course', 'courseAr', 'video', 'quran'] : part === _t("вечер") ? ['ramadan', 'azkar', 'video', 'quran', 'tasbih'] : ['ramadan', 'azkar', 'tasbih', 'quran'];
  const picks = order.map((k) => cand[k]).filter(Boolean) as Now[];
  const now = picks[0];

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
      <PIcon k={it.ic} badge={it.badge} />
      <span><b>{it.title}</b><small>{it.sub}</small></span>
      <em>{editFav ? (favIds.includes(id) ? '★' : '☆') : '›'}</em>
    </button>
  ); };

  // «Сейчас»: the first thing planned for today that is not started yet; with nothing planned, what fits this time of day.
  const all = dayPlan(state, today, true);
  const hero = plan[0];
  const rest = all.filter((x) => x.key !== hero?.key);
  const restOpen = rest.filter((x) => !x.done);
  const testsDone = [lastRun(state), lastRun(state, UMRAH_TEST), lastRun(state, SALAH_TEST)].filter(Boolean).length;
  const testDue = (() => { const r = lastRun(state); return r && repeatIn(r, today) <= 0; })();

  // «Мои практики»: a row each, with where I stopped and one button to go on.
  const myRow = (id: string) => { const it = P[id]; return it && (
    <button key={id} type="button" className="pmy-r" onClick={it.open}>
      <PIcon k={it.ic} badge={it.badge} />
      <span className="pmy-t"><b>{it.title}</b><small>{it.sub}</small>{it.pct !== undefined && <i className="pmy-bar"><i style={{ width: `${Math.max(3, Math.min(100, Math.round(it.pct * 100)))}%` }} /></i>}</span>
      <em className="pmy-go">{VERB[id]?.() ?? _t("Открыть")}</em>
    </button>
  ); };
  const others = ALL_IDS.filter((id) => P[id] && (editFav || !favIds.includes(id)));
  const shown = (ids: string[]) => ids.filter((id) => others.includes(id));
  const listOpen = allOpen || editFav;
  const flipAll = () => { const v = !allOpen; setAllOpen(v); try { localStorage.setItem('lm.pall', v ? '1' : ''); } catch { /* */ } };
  const nowTitle = hero ? hero.title : now?.title;
  const nowSub = hero ? hero.sub : now?.sub;

  return (
    <div className="page">
      <h1 className="page-h">{_t("Практика")}</h1>
      <Hint id="practice" />

      {(hero || now) && (
        <div className="pnow slim">
          <div className="pnow-line">
            <span className="pnow-tx">
              <small>{_tj("Сейчас · {0}", part)}</small>
              <b>{nowTitle}</b>
              {nowSub && <span>{nowSub}</span>}
            </span>
            <button type="button" className="pnow-go" onClick={() => (hero ? go(hero) : now!.go())}>{hero ? _t("Начать") : now!.btn}</button>
          </div>
          {restOpen.length > 0 && (
            <button type="button" className="pnow-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
              {moreOpen ? _t("Свернуть ˄") : _tj("Ещё на сегодня: {0} ˅", restOpen.length)}
            </button>
          )}
          {moreOpen && restOpen.length > 0 && (
            <div className="pnow-more">
              {restOpen.map((it) => (
                <button key={it.key} type="button" className="pnow-it" onClick={() => go(it)}>
                  <PIcon k={MODE_IC[it.mode] ?? 'book'} /><span>{it.title}{it.min ? <small>{_tj(" · минимум: {0}", it.min)}</small> : null}</span><em>›</em>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {state.trip && (
        <button type="button" className="pseason" onClick={onSafar}>
          <PIcon k="compass" />
          <span><b>{_tj("Ты в поездке: {0}", state.trip.place)}</b><small>{_t("Сокращённые намазы, кибла, дуа путника")}</small></span><em>›</em>
        </button>
      )}
      {season && (
        <button type="button" className="pseason" onClick={onRamadan}>
          <PIcon k="moon" />
          <span><b>{rDay ? _t("Рамадан, день {0} из {1}", rDay, rm.days.length) : _t("Рамадан через {0} {1}", rm.daysTo, rm.daysTo === 1 ? _t("день") : rm.daysTo < 5 ? _t("дня") : _t("дней"))}</b>
          <small>{rDay ? (ramadanOf(state).fasts[today] === 'fast' ? _t("Пост сегодня отмечен ✓ · хатм, ночи") : _t("Пост, хатм, последние ночи")) : _t("Подготовка: {0}план хатма, привычки на месяц", rLeft ? _t("долг {0} дн., ", rLeft) : '')}</small></span><em>›</em>
        </button>
      )}

      <h3 className="ph">{_t("Мои практики ")}<button type="button" className="link-btn" onClick={() => setEditFav(!editFav)}>{editFav ? _t("Готово") : _t("Изменить")}</button></h3>
      {favIds.length > 0 && <div className="pmy">{favIds.map(myRow)}</div>}
      {editFav
        ? <p className="tiny">{_tj("Отметь звёздочкой до {0} практик ниже. Они будут стоять здесь первыми.", FAV_MAX)}</p>
        : favIds.length < FAV_MAX && <button type="button" className="pmy-add" onClick={() => setEditFav(true)}>{_t("＋ Добавить в мои")}</button>}

      <button type="button" className="pall" aria-expanded={listOpen} onClick={editFav ? () => setEditFav(false) : flipAll}>
        <b>{_tj("Все практики · {0}", others.length + 1)}</b>
        {!listOpen && <span className="pall-ic">{others.slice(0, 5).map((id) => <PIcon key={id} k={P[id].ic} />)}</span>}
        <em>{listOpen ? '˄' : '›'}</em>
      </button>
      {listOpen && (
        <>
          {[[_t("Поклонение"), ['nap', 'quran', 'azkar', 'tasbih', 'sadaqa']], [_t("Знания"), ['videos', 'books', 'langs', 'khutba']], [_t("Тело и время"), ['body', 'halal', 'focus']]].map(([name, ids]) => shown(ids as string[]).length > 0 && (
            <div key={name as string}>
              <div className="pgl">{name as string}</div>
              <div className="pgrp">{shown(ids as string[]).map(row)}</div>
            </div>
          ))}
          <div className="pgl">{_t("Работа над собой")}</div>
          <div className="pgrp">
            <button type="button" className="prow" onClick={() => setTestsOpen(!testsOpen)} aria-expanded={testsOpen}>
              <PIcon k="test" badge={testDue ? 1 : undefined} />
              <span><b>{_t("Тесты")}</b><small>{testDue ? _t("Прошло 30 дней: пора пройти снова") : testsDone ? _tj("Пройдено {0} из 3 · что даётся труднее, умра, намаз", testsDone) : _t("3 коротких теста: что даётся труднее, умра, намаз")}</small></span>
              <em className="pcnt">3</em><em>{testsOpen ? '▾' : '›'}</em>
            </button>
            {testsOpen && <div className="psub">{['tests', 'testUmrah', 'testSalah'].map(row)}</div>}
            {shown(['quit']).map(row)}
            <button type="button" className="prow" onClick={() => openPath({ v: 'list' })}>
              <PIcon k="moon" />
              <span><b>{_t("Новый путь")}</b><small>{state.newpath?.on ? _t("День {0} из 40 · учитель намаза, суры", pathNow(state, today).day) : _t("Для тех, кто недавно принял ислам")}</small></span><em>›</em>
            </button>
          </div>
        </>
      )}

      <div className="pgl">{_t("Особые дни")}</div>
      <div className="ppills">
        {!season && <button type="button" onClick={onRamadan}><PIcon k="moon" />{_t("Рамадан")}</button>}
        <button type="button" onClick={P.umrah.open}><PIcon k="kaaba" />{_t("Умра")}</button>
        {!state.trip && <button type="button" onClick={onSafar}><PIcon k="compass" />{_t("Сафар")}</button>}
      </div>
    </div>
  );
}

/** Practices offered in «Все практики» (tests sit in their own row there; umrah and safar are «Особые дни»). */
const ALL_IDS = ['nap', 'quran', 'azkar', 'tasbih', 'sadaqa', 'videos', 'books', 'langs', 'khutba', 'body', 'halal', 'focus', 'quit'];
const FAV_MAX = 6;
/** The button on a «Мои практики» row. */
const VERB: Record<string, () => string> = {
  quran: () => _t("Читать"), azkar: () => _t("Читать"), tasbih: () => _t("Счёт"), sadaqa: () => _t("Открыть"), videos: () => _t("Дальше"), books: () => _t("Читать"),
  langs: () => _t("Учить"), khutba: () => _t("Слушать"), body: () => _t("Открыть"), halal: () => _t("Сканировать"), focus: () => _t("Старт"), quit: () => _t("Открыть"),
  tests: () => _t("Пройти"), testUmrah: () => _t("Пройти"), testSalah: () => _t("Пройти"), umrah: () => _t("Открыть"), safar: () => _t("Открыть"),
};

const MODE_IC: Record<string, string> = { tests: 'test', azkar: 'sun', quran: 'book', videos: 'play', course: 'lang', 'course-ar': 'lang', langs: 'lang', books: 'books', tasbih: 'beads', health: 'leaf', umrah: 'kaaba', focus: 'timer' };

type Item = { ic: string; title: string; sub: string; pct?: number; badge?: number; open: () => void };

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
    track('tasbih', 'count');
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
