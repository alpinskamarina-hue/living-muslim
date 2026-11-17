import { say, type Trigger } from '../words';
import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { sphereName } from '../types';
import { isCounted, setMark } from '../store';
import { Quran } from './Quran';
import { Books } from './Books';
import { Languages } from './Languages';
import { Course } from './Course';
import { Health } from './Health';
import { prepPct } from './Umrah';
import { UmrahHub } from './UmrahHub';
import type { UmrahApi } from '../umrahCircle';
import { Food, foodOf } from './Food';
import { Sadaqa, sadaqaOf, sadaqaStreak } from './Sadaqa';
import { health } from '../health';
import { debt, ramadanDay, ramadanMonth, ramadanOf } from '../ramadan';
import { A1 } from '../course/a1';
import { Videos } from './Videos';
import { isCloud } from '../cloud';
import { catalog as catalogItems } from '../videos';

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
}

type Mode = 'home' | 'focus' | 'tasbih' | 'quran' | 'books' | 'langs' | 'course' | 'health' | 'umrah' | 'food' | 'sadaqa' | 'videos' | 'body';

export function Practice({ state, update, today, suggestedId, onSafar, onRamadan, start, umrah }: Props) {
  const [mode, setMode] = useState<Mode>((start?.mode as Mode) ?? 'home');
  const active = state.habits.filter((h) => h.status === 'active');
  const [habitId, setHabitId] = useState<string>(suggestedId ?? active[0]?.id ?? '');
  const habit = active.find((h) => h.id === habitId);
  const markHabit = (m: Mark) => habitId && update((s) => setMark(s, today, habitId, m));
  const [editFav, setEditFav] = useState(false);
  const [special, setSpecial] = useState(false);

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
  if (mode === 'umrah') return <UmrahHub state={state} update={update} today={today} api={umrah} nameOf={(id) => umrah.names[id] || 'Участник'} backLabel="Практика" onExit={() => setMode('home')} />;
  if (mode === 'videos') return <Videos state={state} update={update} habitName={habit?.action} open={start?.mode === 'videos' ? start.ref : undefined} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'body') return (
    <div className="page">
      <button type="button" className="link-btn pro-back" onClick={() => setMode('home')}>← Практика</button>
      <h1 className="page-h">Тело</h1>
      <p className="page-sub">Тело — аманат. Немного каждый день.</p>
      <div className="pgrp">
        <button type="button" className="prow" onClick={() => setMode('health')}><i className="pic">🌿</i><span><b>Здоровье</b><small>{`Вода ${health(state).water[today] ?? 0}/${health(state).waterGoal} · сон, тренировки, посты`}</small></span><em>›</em></button>
        <button type="button" className="prow" onClick={() => setMode('food')}><i className="pic">🍽</i><span><b>Питание</b><small>{(() => { const n = Object.keys(foodOf(state).meals[today] ?? {}).length; return n ? `Сегодня отмечено ${n} из 3` : 'Правило трети, сунна, чистые дни'; })()}</small></span><em>›</em></button>
      </div>
    </div>
  );
  if (mode === 'tasbih') return <Tasbih onExit={() => setMode('home')} onFinish={() => markHabit('done')} habitName={habit?.action} />;

  // ---- home: «Сейчас», favourites, groups ----
  const due = state.langs?.current ? (state.langs.decks[state.langs.current] ?? []).filter((c) => c.due <= today).length : 0;
  const vs = state.videos;
  const vidDone = vs ? Object.values(vs.pos).filter((p) => p.done).length : 0;
  const rDay = ramadanDay(today);
  const rm = ramadanMonth(today);
  const rLeft = debt(ramadanOf(state)).left;
  const sq = sadaqaOf(state); const sqN = sadaqaStreak(sq, today); const sqToday = sq.days[today];

  const P: Record<string, Item> = {
    quran: { ic: 'قرآن', ar: true, title: 'Коран', sub: state.quran ? `Сура ${state.quran.surah}, аят ${state.quran.ayah}` : 'Текст и перевод смыслов, закладка', pct: state.quran ? state.quran.surah / 114 : undefined, open: () => setMode('quran') },
    tasbih: { ic: 'سبحان', ar: true, title: 'Тасбих', sub: '33 · 33 · 34 после намаза', open: () => setMode('tasbih') },
    sadaqa: { ic: 'صدقة', ar: true, title: 'Садака', sub: sqToday?.money || sqToday?.deed ? `Сегодня есть ✓ · серия ${sqN}` : sqN ? `Серия ${sqN} · доброе дело дня ждёт` : 'Каждый день понемногу, в тайне', open: () => setMode('sadaqa') },
    ...(isCloud ? { videos: { ic: '▶', title: 'Видеоуроки', sub: vidDone ? `Просмотрено уроков: ${vidDone}` : 'Вера, бизнес, развитие и другое', open: () => setMode('videos') } } : {}),
    books: { ic: '📖', title: 'Книги', sub: state.books?.length ? `На полке: ${state.books.length}` : 'Атомные привычки и свои PDF', open: () => setMode('books') },
    langs: { ic: 'Aa', title: 'Языки', sub: state.course ? `Английский A1: день ${state.course.day + 1}${due ? ` · ${due} к повторению` : ''}` : due ? `${due} карточек к повторению` : 'Курс английского, карточки слов', pct: state.course ? (state.course.day + 1) / A1.length : undefined, open: () => setMode('langs') },
    body: { ic: '🌿', title: 'Здоровье и питание', sub: `Вода ${health(state).water[today] ?? 0}/${health(state).waterGoal} · еда ${Object.keys(foodOf(state).meals[today] ?? {}).length} из 3 · сон, посты`, open: () => setMode('body') },
    focus: { ic: '⏱', title: 'Фокус-таймер', sub: 'Засечь время на любое дело', open: () => setMode('focus') },
    umrah: { ic: 'عمرة', ar: true, title: 'Умра', sub: state.umrah?.prep?.length ? `Подготовка ${prepPct(state)}%` : 'Обряды со счётчиком, подготовка, дуа', open: () => setMode('umrah') },
    safar: { ic: '🧭', title: 'Сафар', sub: state.trip ? `Поездка: ${state.trip.place}` : 'Поездка, кибла, дуа путника', open: onSafar },
  };
  const favIds = (state.practiceFav ?? ['quran', 'videos', 'tasbih', 'langs']).filter((id) => P[id]).slice(0, 4);
  const toggleFav = (id: string) => update((s) => {
    const cur = (s.practiceFav ?? favIds).filter((x) => P[x]);
    return { ...s, practiceFav: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id] };
  });

  // «Сейчас»: what fits this time of day.
  const h = new Date().getHours();
  const part = h >= 4 && h < 11 ? 'утро' : h < 17 && h >= 11 ? 'день' : h >= 17 ? 'вечер' : 'ночь';
  type Now = { title: string; sub: string; btn: string; go: () => void; short: string };
  const cand: Record<string, Now | null> = {
    ramadan: rDay ? { title: `Рамадан, день ${rDay}`, sub: 'Пост, хатм, ночи', btn: 'Открыть', go: onRamadan, short: 'Рамадан' } : null,
    video: vs?.last ? { title: 'Продолжить видеоурок', sub: (() => { const it = [...vs.mine, ...catalogItems()].find((x) => x.id === vs.last!.item); return it ? it.title : 'С того места, где остановился'; })(), btn: '▶ Продолжить', go: () => setMode('videos'), short: 'Видеоурок' } : null,
    quran: { title: state.quran ? `Коран: сура ${state.quran.surah}, аят ${state.quran.ayah}` : 'Коран: несколько аятов', sub: state.quran ? 'С закладки, с переводом смыслов' : 'Начни с суры Аль-Фатиха', btn: 'Читать', go: () => setMode('quran'), short: 'Коран' },
    tasbih: { title: 'Тасбих после намаза', sub: 'СубханаЛлах 33 · Альхамдулиллях 33 · Аллаху акбар 34', btn: 'Начать', go: () => setMode('tasbih'), short: 'Тасбих 33·33·34' },
    langs: due ? { title: `Повтори слова: ${due}`, sub: 'Пара минут на карточки', btn: 'Повторить', go: () => setMode('langs'), short: 'Слова' } : null,
    course: state.course ? { title: `Английский: день ${state.course.day + 1}`, sub: A1[state.course.day]?.t ?? 'Урок на 15 минут', btn: 'Продолжить', go: () => setMode('course'), short: 'Английский' } : null,
  };
  const order = part === 'утро' ? ['ramadan', 'quran', 'tasbih', 'langs'] : part === 'день' ? ['ramadan', 'langs', 'course', 'video', 'quran'] : part === 'вечер' ? ['ramadan', 'video', 'quran', 'tasbih'] : ['ramadan', 'tasbih', 'quran'];
  const picks = order.map((k) => cand[k]).filter(Boolean) as Now[];
  const now = picks[0], alt = picks[1];

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
      <h1 className="page-h">Практика</h1>
      <p className="page-sub">Сделай привычку здесь. Когда закончишь, она отметится сама.</p>

      {now && (
        <div className="pnow">
          <small>Сейчас · {part}</small>
          <b>{now.title}</b>
          <p>{now.sub}</p>
          <div className="pnow-row">
            <button type="button" className="pnow-go" onClick={now.go}>{now.btn}</button>
            {alt && <button type="button" className="pnow-alt" onClick={alt.go}>Или: {alt.short}</button>}
          </div>
          {active.length > 0 && (
            <label className="pnow-hab">Отметит привычку:{' '}
              <select value={habitId} onChange={(e) => setHabitId(e.target.value)}>
                <option value="">без привязки</option>
                {active.map((x) => <option key={x.id} value={x.id}>{isCounted(state.log[today]?.[x.id]) ? '✓ ' : ''}{x.action} · {sphereName(x.sphere)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <h3 className="ph">Мои практики <button type="button" className="link-btn" onClick={() => setEditFav(!editFav)}>{editFav ? 'Готово' : 'Изменить'}</button></h3>
      {editFav && <p className="tiny">Отметь звёздочкой до 4 практик ниже. Они будут стоять здесь первыми.</p>}
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
          <span><b>{rDay ? `Рамадан, день ${rDay} из ${rm.days.length}` : `Рамадан через ${rm.daysTo} ${rm.daysTo === 1 ? 'день' : rm.daysTo < 5 ? 'дня' : 'дней'}`}</b>
          <small>{rDay ? (ramadanOf(state).fasts[today] === 'fast' ? 'Пост сегодня отмечен ✓ · хатм, ночи' : 'Пост, хатм, последние ночи') : `Подготовка: ${rLeft ? `долг ${rLeft} дн., ` : ''}план хатма, привычки на месяц`}</small></span>
        </button>
      )}

      <div className="pgl">Поклонение</div>
      <div className="pgrp">{['quran', 'tasbih', 'sadaqa'].map(row)}</div>
      <div className="pgl">Знания</div>
      <div className="pgrp">{['videos', 'books', 'langs'].map(row)}</div>
      <div className="pgl">Тело и время</div>
      <div className="pgrp">{['body', 'focus'].map(row)}</div>

      <button type="button" className="pmore" onClick={() => setSpecial(!special)} aria-expanded={special}>
        <span>Особые случаи: {season ? 'Умра, Сафар' : 'Рамадан, Умра, Сафар'}</span><span>{special ? '▴' : '›'}</span>
      </button>
      {special && (
        <div className="pgrp">
          {!season && (
            <button type="button" className="prow" onClick={onRamadan}><i className="pic">🌙</i><span><b>Рамадан</b><small>{rm.state === 'next' ? `Через ${rm.daysTo} дн.` : 'Ид и Шавваль'}{rLeft ? ` · долг ${rLeft} дн.` : ' · пост, хатм, ночи'}</small></span><em>›</em></button>
          )}
          {['umrah', 'safar'].map(row)}
        </div>
      )}
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
        <button type="button" className="icon-btn light" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>{habitName ?? 'Фокус'}</b><small>Телефон в сторону. Только это дело.</small></div>
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
              <button key={p} type="button" aria-pressed={!custom && total === p * 60} onClick={() => { setCustom(false); setMin(p); }}>{p} мин</button>
            ))}
            <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Своё</button>
          </div>
          {custom && (
            <div className="custom-min">
              <button type="button" onClick={() => setMin(total / 60 - 5)} aria-label="Меньше на 5 минут">−5</button>
              <button type="button" onClick={() => setMin(total / 60 - 1)} aria-label="Меньше на минуту">−1</button>
              <label><input type="number" inputMode="numeric" min={1} max={240} value={total / 60} onChange={(e) => setMin(Number(e.target.value))} aria-label="Минуты" /> мин</label>
              <button type="button" onClick={() => setMin(total / 60 + 1)} aria-label="Больше на минуту">+1</button>
              <button type="button" onClick={() => setMin(total / 60 + 5)} aria-label="Больше на 5 минут">+5</button>
            </div>
          )}
          <button type="button" className="gold-btn" onClick={start}>Начать</button>
        </>
      ) : done ? (
        <div className="finish">
          <b>{done === 'full' ? 'Готово, машаАллах' : 'Остановлено раньше'}</b>
          <p>{habitName ? 'Как отметить привычку?' : 'Сессия завершена.'}</p>
          {habitName ? (
            <div className="row2">
              <button type="button" onClick={() => { onFinish('min'); onExit(); }}>Минимум</button>
              <button type="button" className="gold-btn" onClick={() => { onFinish('done'); onExit(); }}>Сделано</button>
            </div>
          ) : (
            <button type="button" className="gold-btn" onClick={onExit}>Закрыть</button>
          )}
        </div>
      ) : (
        <div className="row2">
          <button type="button" onClick={togglePause}>{paused ? 'Продолжить' : 'Пауза'}</button>
          <button type="button" className="gold-btn" onClick={() => setDone('early')}>Закончить</button>
        </div>
      )}
    </div>
  );
}

const DHIKR = [
  { ar: 'سُبْحَانَ ٱللَّٰهِ', ru: 'СубханАллах', n: 33 },
  { ar: 'ٱلْحَمْدُ لِلَّٰهِ', ru: 'Альхамдулиллях', n: 33 },
  { ar: 'ٱللَّٰهُ أَكْبَرُ', ru: 'Аллаху акбар', n: 34 },
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
        <button type="button" className="icon-btn light" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>Тасбих</b><small>Нажимай в любом месте круга</small></div>
      </div>
      <button type="button" className="tasbih" onClick={tap} aria-label="Плюс один">
        <span className="ar-big">{all ? 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ' : cur.ar}</span>
        <span className="tr">{all ? 'Ля иляха илляЛлах' : cur.ru}</span>
        <span className="cnt">{all ? '100' : `${Math.min(rest, cur.n)} / ${cur.n}`}</span>
      </button>
      <div className="dots3">
        {DHIKR.map((d, i) => (
          <i key={d.ru} data-on={i < step || all ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>
      {all ? (
        <div className="row2">
          <button type="button" onClick={() => setCount(0)}>Заново</button>
          <button type="button" className="gold-btn" onClick={() => { say('tasbih_done'); if (habitName) onFinish(); onExit(); }}>
            {habitName ? 'Отметить привычку' : 'Готово'}
          </button>
        </div>
      ) : (
        <div className="row2">
          <button type="button" onClick={() => setCount(0)}>Сбросить</button>
          <button type="button" onClick={() => setCount(Math.max(0, count - 1))}>−1</button>
        </div>
      )}
    </div>
  );
}
