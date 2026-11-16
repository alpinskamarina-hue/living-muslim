import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { A1 } from '../course/a1';
import { TR } from '../course/tr';
import { uid } from '../store';
import { dayKey } from '../dates';

const TOTAL = A1.reduce((n, l) => n + l.p.length, 0);
type Tab = 'lesson' | 'dialog' | 'cards' | 'speak';

// ---- speech ----
function ttsAvailable() {
  try { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; } catch { return false; }
}
function pickVoice() {
  try {
    const v = speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().startsWith('en'));
    return v.find((x) => /en-(US|GB)/i.test(x.lang) && /google|samantha|daniel|natural/i.test(x.name)) ?? v.find((x) => /en-(US|GB)/i.test(x.lang)) ?? v[0];
  } catch { return undefined; }
}
export function speak(text: string, slow = false): Promise<void> {
  return new Promise((res) => {
    if (!ttsAvailable()) return res();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = slow ? 0.6 : 0.9;
      u.onend = () => res();
      u.onerror = () => res();
      speechSynthesis.speak(u);
    } catch { res(); }
  });
}

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
}

export function Course({ state, update, habitName, onExit, onFinish }: Props) {
  const c = state.course ?? { learned: [], done: [], day: 0 };
  const setC = (fn: (x: typeof c) => typeof c) => update((s) => ({ ...s, course: fn(s.course ?? { learned: [], done: [], day: 0 }) }));
  const [day, setDay] = useState(c.day);
  const [tab, setTab] = useState<Tab>('lesson');
  const [slow, setSlow] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  const [finish, setFinish] = useState(false);
  const chips = useRef<HTMLDivElement>(null);
  const L = A1[day];
  const unlocked = (i: number) => i === 0 || c.done.includes(i - 1) || c.done.includes(i);
  const learnedSet = new Set(c.learned);

  useEffect(() => {
    if (!ttsAvailable()) { setNoVoice(true); return; }
    const check = () => { try { if (!speechSynthesis.getVoices().length) setNoVoice(true); else setNoVoice(false); } catch { setNoVoice(true); } };
    const t = setTimeout(check, 1200);
    try { speechSynthesis.addEventListener('voiceschanged', check); } catch { /* ignore */ }
    return () => { clearTimeout(t); try { speechSynthesis.removeEventListener('voiceschanged', check); } catch { /* ignore */ } };
  }, []);

  useEffect(() => {
    chips.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [day]);

  const pick = (i: number) => { if (!unlocked(i)) return; setDay(i); setTab('lesson'); setC((x) => ({ ...x, day: i })); };
  const toggle = (key: string) => setC((x) => ({ ...x, learned: x.learned.includes(key) ? x.learned.filter((k) => k !== key) : [...x.learned, key] }));
  const learn = (key: string) => setC((x) => (x.learned.includes(key) ? x : { ...x, learned: [...x.learned, key] }));

  const complete = () => {
    const today = dayKey(new Date());
    update((s) => {
      const course = s.course ?? { learned: [], done: [], day: 0 };
      const done = course.done.includes(day) ? course.done : [...course.done, day];
      const next = Math.min(A1.length - 1, day + 1);
      // Phrases of a finished lesson go into the English flashcards for spaced review.
      const langs = s.langs ?? { current: 'en', decks: {} };
      const deck = langs.decks.en ?? [];
      const have = new Set(deck.map((d) => d.front));
      const add = L.p.filter(([en]) => !have.has(en)).map(([en, ru]) => ({ id: uid(), front: en, back: ru, box: 0, due: today }));
      return {
        ...s,
        course: { ...course, done, day: next },
        langs: { current: langs.current || 'en', decks: { ...langs.decks, en: [...deck, ...add] } },
      };
    });
    setFinish(true);
  };

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>Английский по дням</b><small>Разговорный A1 · {A1.length} уроков</small></div>
        <button type="button" className="slow-btn" aria-pressed={slow} onClick={() => setSlow(!slow)} title="Медленная озвучка">🐢</button>
      </div>
      <div className="q-list course">
        <div className="c-prog">
          <span>Выучено фраз: {c.learned.length} из {TOTAL}</span>
          <div className="bar"><i style={{ width: `${(c.learned.length / TOTAL) * 100}%` }} /></div>
        </div>
        <div className="days" ref={chips}>
          {A1.map((_, i) => (
            <button key={i} type="button" className="dchip" aria-current={i === day} data-done={c.done.includes(i) || undefined} disabled={!unlocked(i)} onClick={() => pick(i)}>
              {i + 1}
            </button>
          ))}
        </div>

        <div className="c-day">День {day + 1}</div>
        <h2 className="c-title">{L.t}</h2>
        <p className="c-goal">Цель: {L.goal.toLowerCase()}</p>

        <div className="c-tabs" role="tablist">
          {([['lesson', 'Урок'], ['dialog', 'Диалог'], ['cards', 'Карточки'], ['speak', 'Говори']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {noVoice && (
          <div className="warn">Озвучка не работает в этом окне. Открой страницу в Chrome или Safari, там звук будет. Транскрипция в скобках поможет и без звука.</div>
        )}

        {tab === 'lesson' && (
          <>
            <p className="tiny">Нажми на динамик, чтобы послушать, повтори вслух 3 раза. Галочка — «выучил».</p>
            {L.p.map(([en, ru], i) => {
              const key = `${day}:${i}`;
              const ok = learnedSet.has(key);
              return (
                <div className="phrase-row" key={key} data-ok={ok || undefined}>
                  <span className="pn">{i + 1}</span>
                  <div className="pt">
                    <b>{en}</b>
                    {TR[en] && <span className="ptr">[{TR[en]}]</span>}
                    <span className="pru">{ru}</span>
                  </div>
                  <div className="pbtns">
                    <button type="button" className="sq" onClick={() => speak(en, slow)} aria-label="Послушать">🔊</button>
                    <button type="button" className="sq chk2" aria-pressed={ok} onClick={() => toggle(key)} aria-label="Выучил">✓</button>
                  </div>
                </div>
              );
            })}
            <button type="button" className="pri-btn big-btn" onClick={() => setTab('dialog')}>Дальше: диалог</button>
          </>
        )}

        {tab === 'dialog' && <Dialog lines={L.d} slow={slow} onNext={() => setTab('cards')} />}
        {tab === 'cards' && <Cards day={day} phrases={L.p} slow={slow} onLearn={learn} onNext={() => setTab('speak')} />}
        {tab === 'speak' && <Speak task={L.task} phrases={L.p} long={day === A1.length - 1} onDone={complete} done={c.done.includes(day)} />}
      </div>

      {finish && (
        <div className="finish-sheet">
          <b>День {day + 1} пройден</b>
          <p>{day < A1.length - 1 ? `Открыт день ${day + 2}. ` : 'Курс пройден, машаАллах! '}Фразы урока добавлены в карточки «Языки → Английский» для повторения.</p>
          <div className="row2 light">
            {habitName ? (
              <>
                <button type="button" onClick={() => onFinish('min')}>Минимум</button>
                <button type="button" className="pri-btn" onClick={() => onFinish('done')}>Отметить привычку</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={onExit}>Готово</button>
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => { setFinish(false); if (day < A1.length - 1) pick(day + 1); }}>
            {day < A1.length - 1 ? 'Открыть следующий день' : 'Закрыть'}
          </button>
        </div>
      )}
    </div>
  );
}

function Dialog({ lines, slow, onNext }: { lines: ['A' | 'B', string, string][]; slow: boolean; onNext: () => void }) {
  const [role, setRole] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState(-1);
  const stop = useRef(false);

  const playAll = async () => {
    stop.current = false;
    for (let i = 0; i < lines.length; i++) {
      if (stop.current) break;
      if (role && lines[i][0] === 'B') {
        setPlaying(i);
        await new Promise((r) => setTimeout(r, 4000)); // your turn: say it aloud
        continue;
      }
      setPlaying(i);
      await speak(lines[i][1], slow);
      await new Promise((r) => setTimeout(r, 300));
    }
    setPlaying(-1);
  };
  useEffect(() => () => { stop.current = true; try { speechSynthesis.cancel(); } catch { /* ignore */ } }, []);

  return (
    <>
      <div className="seg">
        <button type="button" aria-pressed={!role} onClick={() => setRole(false)}>Слушать</button>
        <button type="button" aria-pressed={role} onClick={() => { setRole(true); setOpen(new Set()); }}>По ролям: ты — B</button>
      </div>
      <p className="tiny">{role ? 'Реплики B скрыты. Скажи их вслух по подсказке, потом открой и сверь.' : 'Послушай диалог целиком, потом попробуй по ролям.'}</p>
      <div className="dlg">
        {lines.map(([who, en, ru], i) => {
          const hidden = role && who === 'B' && !open.has(i);
          return (
            <div key={i} className={`bub ${who === 'B' ? 'me' : ''}`} data-on={playing === i || undefined}>
              {hidden ? (
                <button type="button" className="bub-hidden" onClick={() => { setOpen(new Set([...open, i])); speak(en, slow); }}>
                  <small>Твоя реплика:</small> {ru}
                  <em>нажми, чтобы сверить</em>
                </button>
              ) : (
                <button type="button" className="bub-text" onClick={() => speak(en, slow)}>
                  <b>{en}</b>
                  <small>{ru}</small>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="row2 light">
        <button type="button" onClick={playing >= 0 ? () => { stop.current = true; setPlaying(-1); } : playAll}>{playing >= 0 ? 'Стоп' : '▶ Проиграть'}</button>
        <button type="button" className="pri-btn" onClick={onNext}>Дальше: карточки</button>
      </div>
    </>
  );
}

function Cards({ day, phrases, slow, onLearn, onNext }: { day: number; phrases: [string, string][]; slow: boolean; onLearn: (k: string) => void; onNext: () => void }) {
  const [order] = useState(() => phrases.map((_, i) => i).sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [again, setAgain] = useState<number[]>([]);
  const queue = [...order, ...again];
  const idx = queue[i];
  const done = i >= queue.length;

  if (done)
    return (
      <div className="cards-done">
        <b>Все карточки пройдены</b>
        <button type="button" className="pri-btn big-btn" onClick={onNext}>Дальше: говори</button>
      </div>
    );
  const [en, ru] = phrases[idx];
  return (
    <>
      <p className="tiny">Скажи по-английски, потом открой и сверь. {i + 1} из {queue.length}</p>
      <button type="button" className="flash" onClick={() => { setShown(true); speak(en, slow); }}>
        <span className="flash-b" style={{ color: 'var(--ink)' }}>{ru}</span>
        {shown ? (
          <>
            <span className="flash-f" style={{ fontSize: 24 }}>{en}</span>
            {TR[en] && <span className="ptr">[{TR[en]}]</span>}
          </>
        ) : <span className="flash-hint">Скажи вслух и нажми</span>}
      </button>
      {shown && (
        <div className="row2 light rev-btns">
          <button type="button" onClick={() => { setAgain([...again, idx]); setShown(false); setI(i + 1); }}>Ещё раз</button>
          <button type="button" className="pri-btn" onClick={() => { onLearn(`${day}:${idx}`); setShown(false); setI(i + 1); }}>Сказал верно</button>
        </div>
      )}
    </>
  );
}

function Speak({ task, phrases, long, onDone, done }: { task: string; phrases: [string, string][]; long: boolean; onDone: () => void; done: boolean }) {
  const total = long ? 120 : 60;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <>
      <div className="task">
        <small>Задание</small>
        <p>{task}</p>
      </div>
      <p className="tiny">Говори вслух {total / 60} {long ? 'минуты' : 'минуту'} без остановки. Ошибки — нормально, главное не молчать. Подсказки:</p>
      <ul className="cheat">{phrases.map(([en]) => <li key={en}>{en}</li>)}</ul>
      <div className="speak-timer">{left === null ? `${total / 60}:00` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</div>
      {left === null ? (
        <button type="button" className="pri-btn big-btn" onClick={() => setLeft(total)}>Начать говорить</button>
      ) : left > 0 ? (
        <button type="button" className="ghost-btn" style={{ width: '100%' }} onClick={() => setLeft(0)}>Закончил раньше</button>
      ) : (
        <button type="button" className="pri-btn big-btn" onClick={onDone}>{done ? 'Пройти ещё раз' : 'Завершить день'}</button>
      )}
    </>
  );
}
