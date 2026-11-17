import { useMemo, useState } from 'react';
import type { AppState, Card, LangState, Mark } from '../types';
import { uid } from '../store';
import { addDays, dayKey, plural } from '../dates';

interface Lang { id: string; label: string; rtl?: boolean; starter: [string, string][] }

export const LANGS: Lang[] = [
  {
    id: 'en', label: 'Английский',
    starter: [
      ['habit', 'привычка'], ['goal', 'цель'], ['patience', 'терпение'], ['gratitude', 'благодарность'],
      ['knowledge', 'знание'], ['consistency', 'постоянство'], ['effort', 'усилие'], ['to improve', 'улучшать'],
      ['mercy', 'милость'], ['family', 'семья'], ['health', 'здоровье'], ['to remember', 'помнить'],
      ['success', 'успех'], ['honest', 'честный'], ['time', 'время'], ['morning', 'утро'],
      ['evening', 'вечер'], ['to read', 'читать'], ['to grow', 'расти'], ['step', 'шаг'],
    ],
  },
  {
    id: 'ar', label: 'Арабский', rtl: true,
    starter: [
      ['اللَّه', 'Аллах'], ['رَبّ', 'Господь'], ['قَالَ', 'сказал'], ['كِتَاب', 'книга, Писание'],
      ['يَوْم', 'день'], ['أَرْض', 'земля'], ['سَمَاء', 'небо'], ['قَلْب', 'сердце'],
      ['نَار', 'огонь'], ['جَنَّة', 'сад, Рай'], ['عِلْم', 'знание'], ['عَمَل', 'дело, деяние'],
      ['صَلَاة', 'молитва, намаз'], ['رَحْمَة', 'милость'], ['نَاس', 'люди'], ['حَقّ', 'истина'],
      ['خَيْر', 'благо'], ['نَفْس', 'душа'], ['دِين', 'религия'], ['صَبْر', 'терпение'],
    ],
  },
  {
    id: 'tr', label: 'Турецкий',
    starter: [
      ['alışkanlık', 'привычка'], ['merhaba', 'привет'], ['teşekkür ederim', 'спасибо'], ['evet', 'да'],
      ['hayır', 'нет'], ['su', 'вода'], ['ekmek', 'хлеб'], ['ev', 'дом'],
      ['aile', 'семья'], ['kitap', 'книга'], ['okumak', 'читать'], ['sabah', 'утро'],
      ['akşam', 'вечер'], ['bugün', 'сегодня'], ['yarın', 'завтра'], ['güzel', 'красивый, хороший'],
      ['zaman', 'время'], ['sağlık', 'здоровье'], ['çalışmak', 'работать'], ['sabır', 'терпение'],
    ],
  },
];

// Leitner: days until the next review for each box.
const INTERVAL = [0, 1, 2, 4, 7, 14, 30];
const SESSION_MAX = 20;

const langOf = (id: string): Lang =>
  LANGS.find((l) => l.id === id) ?? { id, label: id.replace(/^custom:/, ''), starter: [] };

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
  onCourse?: () => void;
}

export function Languages({ state, update, habitName, onExit, onFinish, onCourse }: Props) {
  const today = dayKey(new Date());
  const ls: LangState = state.langs ?? { current: '', decks: {} };
  const [mode, setMode] = useState<'home' | 'review' | 'words'>('home');
  const [custom, setCustom] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const setLs = (fn: (l: LangState) => LangState) => update((s) => ({ ...s, langs: fn(s.langs ?? { current: '', decks: {} }) }));

  const choose = (id: string) =>
    setLs((l) => {
      const decks = { ...l.decks };
      if (!decks[id]) decks[id] = langOf(id).starter.map(([f, b]) => ({ id: uid(), front: f, back: b, box: 0, due: today }));
      return { current: id, decks };
    });

  const lang = ls.current ? langOf(ls.current) : null;
  const deck = ls.current ? ls.decks[ls.current] ?? [] : [];
  const due = deck.filter((c) => c.due <= today);
  const learned = deck.filter((c) => c.box >= 4).length;

  const grade = (cardId: string, ok: boolean) =>
    setLs((l) => ({
      ...l,
      decks: {
        ...l.decks,
        [l.current]: (l.decks[l.current] ?? []).map((c) => {
          if (c.id !== cardId) return c;
          const box = ok ? Math.min(INTERVAL.length - 1, c.box + 1) : 0;
          return { ...c, box, due: addDays(today, INTERVAL[box]) };
        }),
      },
    }));

  const addCard = () => {
    if (!front.trim() || !back.trim()) return;
    setLs((l) => ({ ...l, decks: { ...l.decks, [l.current]: [{ id: uid(), front: front.trim(), back: back.trim(), box: 0, due: today }, ...(l.decks[l.current] ?? [])] } }));
    setFront('');
    setBack('');
  };
  const removeCard = (id: string) => setLs((l) => ({ ...l, decks: { ...l.decks, [l.current]: (l.decks[l.current] ?? []).filter((c) => c.id !== id) } }));

  if (mode === 'review' && lang)
    return <Review lang={lang} cards={due.slice(0, SESSION_MAX)} habitName={habitName} onGrade={grade} onBack={() => setMode('home')} onFinish={(m) => { onFinish(m); onExit(); }} />;

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={mode === 'words' ? () => setMode('home') : onExit} aria-label={mode === 'words' ? 'Назад' : 'Выйти'}>
          {mode === 'words' ? '‹' : '✕'}
        </button>
        <div><b>{mode === 'words' && lang ? `Слова: ${lang.label}` : 'Языки'}</b><small>{habitName ?? 'Карточки слов с повторением'}</small></div>
      </div>
      <div className="q-list">
        {mode === 'home' && (
          <>
            {onCourse && (
              <button type="button" className="course-card" onClick={onCourse}>
                <small>Курс · разговорный A1</small>
                <b>Английский по дням</b>
                <span>{state.course ? `День ${state.course.day + 1} · фраз выучено ${state.course.learned.length}` : '30 уроков по 15 минут: фразы с озвучкой, диалоги, разговор вслух'}</span>
              </button>
            )}
            <div className="lab" style={{ margin: '0 0 6px' }}>Какой язык учишь</div>
            <div className="langs">
              {LANGS.map((l) => (
                <button key={l.id} type="button" aria-pressed={ls.current === l.id} onClick={() => choose(l.id)}>{l.label}</button>
              ))}
              {Object.keys(ls.decks).filter((id) => id.startsWith('custom:')).map((id) => (
                <button key={id} type="button" aria-pressed={ls.current === id} onClick={() => choose(id)}>{langOf(id).label}</button>
              ))}
            </div>
            <div className="custom-lang">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Другой язык, например немецкий" />
              <button type="button" disabled={!custom.trim()} onClick={() => { choose(`custom:${custom.trim()}`); setCustom(''); }}>Добавить</button>
            </div>

            {lang ? (
              <>
                <div className="stat-card" style={{ marginTop: 14 }}>
                  <div className="big">{due.length}</div>
                  <div>
                    <b>{due.length ? `${plural(due.length, 'слово', 'слова', 'слов')} к повторению` : 'На сегодня всё повторено'}</b>
                    <small>{deck.length} в наборе · выучено {learned}</small>
                  </div>
                </div>
                <button type="button" className="pri-btn big-btn" disabled={!due.length} onClick={() => setMode('review')}>
                  {due.length ? `Повторить ${Math.min(due.length, SESSION_MAX)}` : 'Приходи завтра'}
                </button>

                <div className="lab">Новое слово</div>
                <div className="add-card">
                  <input value={front} onChange={(e) => setFront(e.target.value)} placeholder={lang.rtl ? 'كَلِمَة' : 'слово'} dir={lang.rtl ? 'rtl' : undefined} />
                  <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="перевод" />
                  <button type="button" className="pri-btn" disabled={!front.trim() || !back.trim()} onClick={addCard}>+</button>
                </div>
                <button type="button" className="link-btn" onClick={() => setMode('words')}>Все слова ({deck.length})</button>
                <p className="tiny">Каждое слово возвращается через 1, 2, 4, 7, 14 и 30 дней, если ты его помнишь. Если забыл, начинается сначала.</p>
              </>
            ) : (
              <p className="q-msg">Выбери язык. Для английского, арабского и турецкого есть стартовый набор из 20 слов. Арабский набор собран из частых слов Корана.</p>
            )}
          </>
        )}

        {mode === 'words' && lang && deck.map((c) => (
          <div className="word" key={c.id}>
            <span className={lang.rtl ? 'w-f ar' : 'w-f'} dir={lang.rtl ? 'rtl' : undefined}>{c.front}</span>
            <span className="w-b">{c.back}</span>
            <span className="w-box" title="Уровень">{c.box}</span>
            <button type="button" className="hg-act" onClick={() => removeCard(c.id)}>Убрать</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Review({ lang, cards, habitName, onGrade, onBack, onFinish }: {
  lang: Lang; cards: Card[]; habitName?: string; onGrade: (id: string, ok: boolean) => void; onBack: () => void; onFinish: (m: Mark) => void;
}) {
  const [queue] = useState(() => [...cards].sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [ok, setOk] = useState(0);
  const card = queue[i];
  const done = i >= queue.length;
  const pct = useMemo(() => (queue.length ? (i / queue.length) * 100 : 100), [i, queue.length]);

  const answer = (good: boolean) => {
    onGrade(card.id, good);
    if (good) setOk((n) => n + 1);
    setShown(false);
    setI((n) => n + 1);
  };

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Назад">‹</button>
        <div><b>{lang.label}</b><small>{done ? 'Готово' : `${i + 1} из ${queue.length}`}</small></div>
      </div>
      <div className="rev-bar"><i style={{ width: `${pct}%` }} /></div>
      {!done ? (
        <div className="rev">
          <button type="button" className="flash" onClick={() => setShown(true)} aria-label="Показать перевод">
            <span className={lang.rtl ? 'flash-f ar' : 'flash-f'} dir={lang.rtl ? 'rtl' : undefined}>{card.front}</span>
            {shown ? <span className="flash-b">{card.back}</span> : <span className="flash-hint">Вспомни перевод и нажми</span>}
          </button>
          {shown ? (
            <div className="row2 light rev-btns">
              <button type="button" onClick={() => answer(false)}>Не помню</button>
              <button type="button" className="pri-btn" onClick={() => answer(true)}>Помню</button>
            </div>
          ) : (
            <button type="button" className="pri-btn big-btn" onClick={() => setShown(true)}>Показать</button>
          )}
        </div>
      ) : (
        <div className="rev">
          <div className="finish light">
            <b>Повторено {queue.length}</b>
            <p>Помнишь {ok} из {queue.length}. {ok === queue.length ? 'МашаАллах!' : 'Забытые слова останутся в повторении на сегодня.'}</p>
          </div>
          <div className="row2 light rev-btns">
            {habitName ? (
              <>
                <button type="button" onClick={() => onFinish('min')}>Минимум</button>
                <button type="button" className="pri-btn" onClick={() => onFinish('done')}>Отметить привычку</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={onBack}>Готово</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
