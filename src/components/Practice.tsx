import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { sphereName } from '../types';
import { isCounted, setMark } from '../store';
import { Quran } from './Quran';
import { Books } from './Books';
import { Languages, LANGS } from './Languages';
import { Course } from './Course';
import { Health } from './Health';
import { Umrah, prepPct } from './Umrah';
import { Food, foodOf } from './Food';
import { Sadaqa, sadaqaOf, sadaqaStreak } from './Sadaqa';
import { health } from '../health';
import { debt, ramadanDay, ramadanMonth, ramadanOf } from '../ramadan';
import { A1 } from '../course/a1';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  suggestedId?: string;
  onSafar: () => void;
  onRamadan: () => void;
}

type Mode = 'home' | 'focus' | 'tasbih' | 'quran' | 'books' | 'langs' | 'course' | 'health' | 'umrah' | 'food' | 'sadaqa';

export function Practice({ state, update, today, suggestedId, onSafar, onRamadan }: Props) {
  const [mode, setMode] = useState<Mode>('home');
  const active = state.habits.filter((h) => h.status === 'active');
  const [habitId, setHabitId] = useState<string>(suggestedId ?? active[0]?.id ?? '');
  const habit = active.find((h) => h.id === habitId);
  const markHabit = (m: Mark) => habitId && update((s) => setMark(s, today, habitId, m));

  if (mode === 'focus') return <Focus habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'quran') return <Quran state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'course') return <Course state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={(m) => { markHabit(m); setMode('home'); }} />;
  if (mode === 'langs') return <Languages state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'books') return <Books state={state} update={update} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'health') return <Health state={state} update={update} today={today} habitName={habit?.action} onExit={() => setMode('home')} onFinish={markHabit} />;
  if (mode === 'sadaqa') return <Sadaqa state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'food') return <Food state={state} update={update} today={today} onExit={() => setMode('home')} />;
  if (mode === 'umrah') return <Umrah state={state} update={update} onExit={() => setMode('home')} />;
  if (mode === 'tasbih') return <Tasbih onExit={() => setMode('home')} onFinish={() => markHabit('done')} habitName={habit?.action} />;

  return (
    <div className="page">
      <h1 className="page-h">Практика</h1>
      <p className="page-sub">Сделай привычку здесь, не выходя из приложения. Когда закончишь, она отметится сама.</p>

      {active.length > 0 && (
        <label className="field">
          <span>Для привычки</span>
          <select value={habitId} onChange={(e) => setHabitId(e.target.value)}>
            <option value="">без привязки</option>
            {active.map((h) => (
              <option key={h.id} value={h.id}>
                {isCounted(state.log[today]?.[h.id]) ? '✓ ' : ''}{h.action} · {sphereName(h.sphere)}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="button" className="course-card" onClick={() => setMode('course')}>
        <small>Курс · разговорный A1</small>
        <b>Английский по дням</b>
        <span>{state.course ? `День ${state.course.day + 1} из ${A1.length}: ${A1[state.course.day].t} · фраз выучено ${state.course.learned.length}` : `${A1.length} уроков по 15 минут: фразы с озвучкой и транскрипцией, диалоги, разговор вслух`}</span>
      </button>

      <div className="types">
        <button type="button" className="type" onClick={() => setMode('focus')}>
          <span className="ic">⏱</span><b>Фокус</b><small>Таймер без отвлечений: чтение, работа, английский, спорт</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('tasbih')}>
          <span className="ic ar">سُبْحَانَ</span><b>Тасбих</b><small>33 · 33 · 34 после намаза</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('quran')}>
          <span className="ic ar">قرآن</span><b>Коран</b><small>{state.quran ? `Закладка: сура ${state.quran.surah}, аят ${state.quran.ayah}` : 'Текст и перевод смыслов, закладка'}</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('langs')}>
          <span className="ic">Aa</span><b>Языки</b>
          <small>{state.langs?.current ? `${LANGS.find((l) => l.id === state.langs!.current)?.label ?? state.langs.current.replace('custom:', '')}: ${(state.langs.decks[state.langs.current] ?? []).filter((c) => c.due <= today).length} к повторению` : 'Английский, арабский, турецкий'}</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('health')}>
          <span className="ic">🌿</span><b>Здоровье</b><small>{`Вода ${health(state).water[today] ?? 0}/${health(state).waterGoal} · сон, тренировки, посты`}</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('food')}>
          <span className="ic">🍽</span><b>Питание</b><small>{(() => { const d = foodOf(state).meals[today] ?? {}; const n = Object.keys(d).length; return n ? `Сегодня отмечено ${n} из 3` : 'Правило трети, сунна, чистые дни'; })()}</small>
        </button>
        <button type="button" className="type" onClick={onRamadan}>
          <span className="ic">🌙</span><b>Рамадан</b><small>{(() => { const d = ramadanDay(today); const left = debt(ramadanOf(state)).left; if (d) return `День ${d} из ${ramadanMonth(today).days.length}${ramadanOf(state).fasts[today] === 'fast' ? ' · пост ✓' : ''}`; const m = ramadanMonth(today); return `${m.state === 'next' ? `Через ${m.daysTo} дн.` : 'Ид и Шавваль'}${left ? ` · долг ${left} дн.` : ' · пост, хатм, ночи'}`; })()}</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('sadaqa')}>
          <span className="ic ar">صدقة</span><b>Садака</b><small>{(() => { const q = sadaqaOf(state); const d = q.days[today]; const n = sadaqaStreak(q, today); return d?.money || d?.deed ? `Сегодня есть ✓ · серия ${n}` : n ? `Серия ${n} · доброе дело дня ждёт` : 'Каждый день понемногу, в тайне'; })()}</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('umrah')}>
          <span className="ic ar">عمرة</span><b>Умра</b><small>{state.umrah?.prep?.length ? `Подготовка ${prepPct(state)}%` : 'Обряды со счётчиком, подготовка, мои дуа'}</small>
        </button>
        <button type="button" className="type" onClick={onSafar}>
          <span className="ic">🧭</span><b>Сафар</b><small>{state.trip ? `Поездка: ${state.trip.place}` : 'Поездка, кибла, дуа путника'}</small>
        </button>
        <button type="button" className="type" onClick={() => setMode('books')}>
          <span className="ic">📖</span><b>Книги</b><small>{state.books?.length ? `На полке: ${state.books.length}` : 'Атомные привычки и свои PDF'}</small>
        </button>
      </div>
    </div>
  );
}

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
          <button type="button" className="gold-btn" onClick={() => { if (habitName) onFinish(); onExit(); }}>
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
