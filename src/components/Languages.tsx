import { useEffect, useMemo, useState } from 'react';
import type { AppState, Card, LangState, Mark } from '../types';
import { uid } from '../store';
import { addDays, dayKey, plural } from '../dates';
import { _t, _tj, isEn } from '../i18n';
import { hasVoice, speak, speechLang } from '../speech';
import { lookupIpa, needsLookup, pronOf } from '../pron';
import { sayAr } from '../course/arAudio';

interface Lang { id: string; label: string; rtl?: boolean; starter: [string, string][] }

export const LANGS: Lang[] = [
  {
    id: 'en', label: _t("Английский"),
    starter: [
      ['habit', _t("привычка")], ['goal', _t("цель")], ['patience', _t("терпение")], ['gratitude', _t("благодарность")],
      ['knowledge', _t("знание")], ['consistency', _t("постоянство")], ['effort', _t("усилие")], ['to improve', _t("улучшать")],
      ['mercy', _t("милость")], ['family', _t("семья")], ['health', _t("здоровье")], ['to remember', _t("помнить")],
      ['success', _t("успех")], ['honest', _t("честный")], ['time', _t("время")], ['morning', _t("утро")],
      ['evening', _t("вечер")], ['to read', _t("читать")], ['to grow', _t("расти")], ['step', _t("шаг")],
    ],
  },
  {
    id: 'ar', label: _t("Арабский"), rtl: true,
    starter: [
      ['اللَّه', _t("Аллах")], ['رَبّ', _t("Господь")], ['قَالَ', _t("сказал")], ['كِتَاب', _t("книга, Писание")],
      ['يَوْم', _t("день")], ['أَرْض', _t("земля")], ['سَمَاء', _t("небо")], ['قَلْب', _t("сердце")],
      ['نَار', _t("огонь")], ['جَنَّة', _t("сад, Рай")], ['عِلْم', _t("знание")], ['عَمَل', _t("дело, деяние")],
      ['صَلَاة', _t("молитва, намаз")], ['رَحْمَة', _t("милость")], ['نَاس', _t("люди")], ['حَقّ', _t("истина")],
      ['خَيْر', _t("благо")], ['نَفْس', _t("душа")], ['دِين', _t("религия")], ['صَبْر', _t("терпение")],
    ],
  },
  {
    id: 'tr', label: _t("Турецкий"),
    starter: [
      ['alışkanlık', _t("привычка")], ['merhaba', _t("привет")], ['teşekkür ederim', _t("спасибо")], ['evet', _t("да")],
      ['hayır', _t("нет")], ['su', _t("вода")], ['ekmek', _t("хлеб")], ['ev', _t("дом")],
      ['aile', _t("семья")], ['kitap', _t("книга")], ['okumak', _t("читать")], ['sabah', _t("утро")],
      ['akşam', _t("вечер")], ['bugün', _t("сегодня")], ['yarın', _t("завтра")], ['güzel', _t("красивый, хороший")],
      ['zaman', _t("время")], ['sağlık', _t("здоровье")], ['çalışmak', _t("работать")], ['sabır', _t("терпение")],
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
  onCourseAr?: () => void;
}

export function Languages({ state, update, habitName, onExit, onFinish, onCourse, onCourseAr }: Props) {
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

  const setTr = (cardId: string, tr: string) =>
    setLs((l) => ({ ...l, decks: Object.fromEntries(Object.entries(l.decks).map(([k, d]) => [k, d.map((c) => (c.id === cardId ? { ...c, tr } : c))])) }));

  const addCard = () => {
    if (!front.trim() || !back.trim()) return;
    const id = uid();
    const w = front.trim();
    setLs((l) => ({ ...l, decks: { ...l.decks, [l.current]: [{ id, front: w, back: back.trim(), box: 0, due: today }, ...(l.decks[l.current] ?? [])] } }));
    if (needsLookup(ls.current, w)) lookupIpa(w).then((ipa) => { if (ipa) setTr(id, ipa); });
    setFront('');
    setBack('');
  };
  const removeCard = (id: string) => setLs((l) => ({ ...l, decks: { ...l.decks, [l.current]: (l.decks[l.current] ?? []).filter((c) => c.id !== id) } }));

  if (mode === 'review' && lang)
    return <Review lang={lang} cards={due.slice(0, SESSION_MAX)} habitName={habitName} onGrade={grade} onTr={setTr} onBack={() => setMode('home')} onFinish={(m) => { onFinish(m); onExit(); }} />;

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={mode === 'words' ? () => setMode('home') : onExit} aria-label={mode === 'words' ? _t("Назад") : _t("Выйти")}>
          {mode === 'words' ? '‹' : '✕'}
        </button>
        <div><b>{mode === 'words' && lang ? _t("Слова: {0}", lang.label) : _t("Языки")}</b><small>{habitName ?? _t("Карточки слов с повторением")}</small></div>
      </div>
      <div className="q-list">
        {mode === 'home' && (
          <>
            {onCourseAr && (
              <button type="button" className="course-card ar-card" onClick={onCourseAr}>
                <small>{_t("Курс · фусха A1")}</small>
                <b>{_t("Арабский по дням")}</b>
                <span>{state.courseAr ? _t("День {0} · фраз выучено {1}", state.courseAr.day + 1, state.courseAr.learned.length) : _t("30 уроков по 15 минут: буквы, фразы с озвучкой, диалоги, слово из Корана")}</span>
              </button>
            )}
            {onCourse && !isEn && (
              <button type="button" className="course-card" onClick={onCourse}>
                <small>{_t("Курс · разговорный A1")}</small>
                <b>{_t("Английский по дням")}</b>
                <span>{state.course ? _t("День {0} · фраз выучено {1}", state.course.day + 1, state.course.learned.length) : _t("30 уроков по 15 минут: фразы с озвучкой, диалоги, разговор вслух")}</span>
              </button>
            )}
            <div className="lab" style={{ margin: '0 0 6px' }}>{_t("Какой язык учишь")}</div>
            <div className="langs">
              {LANGS.map((l) => (
                <button key={l.id} type="button" aria-pressed={ls.current === l.id} onClick={() => choose(l.id)}>{l.label}</button>
              ))}
              {Object.keys(ls.decks).filter((id) => id.startsWith('custom:')).map((id) => (
                <button key={id} type="button" aria-pressed={ls.current === id} onClick={() => choose(id)}>{langOf(id).label}</button>
              ))}
            </div>
            <div className="custom-lang">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={_t("Другой язык, например немецкий")} />
              <button type="button" disabled={!custom.trim()} onClick={() => { choose(`custom:${custom.trim()}`); setCustom(''); }}>{_t("Добавить")}</button>
            </div>

            {lang ? (
              <>
                <div className="stat-card" style={{ marginTop: 14 }}>
                  <div className="big">{due.length}</div>
                  <div>
                    <b>{due.length ? _t("{0} к повторению", plural(due.length, _t("слово"), _t("слова"), _t("слов"))) : _t("На сегодня всё повторено")}</b>
                    <small>{_tj("{0} в наборе · выучено {1}", deck.length, learned)}</small>
                  </div>
                </div>
                <button type="button" className="pri-btn big-btn" disabled={!due.length} onClick={() => setMode('review')}>
                  {due.length ? _t("Повторить {0}", Math.min(due.length, SESSION_MAX)) : _t("Приходи завтра")}
                </button>

                <div className="lab">{_t("Новое слово")}</div>
                <div className="add-card">
                  <input value={front} onChange={(e) => setFront(e.target.value)} placeholder={lang.rtl ? 'كَلِمَة' : _t("слово")} dir={lang.rtl ? 'rtl' : undefined} />
                  <input value={back} onChange={(e) => setBack(e.target.value)} placeholder={_t("перевод")} />
                  <button type="button" className="pri-btn" disabled={!front.trim() || !back.trim()} onClick={addCard}>+</button>
                </div>
                <button type="button" className="link-btn" onClick={() => setMode('words')}>{_tj("Все слова ({0})", deck.length)}</button>
                <p className="tiny">{_t("Каждое слово возвращается через 1, 2, 4, 7, 14 и 30 дней, если ты его помнишь. Если забыл, начинается сначала.")}</p>
              </>
            ) : (
              <p className="q-msg">{_t("Выбери язык. Для английского, арабского и турецкого есть стартовый набор из 20 слов. Арабский набор собран из частых слов Корана.")}</p>
            )}
          </>
        )}

        {mode === 'words' && lang && deck.map((c) => (
          <div className="word" key={c.id}>
            <span className="w-fp">
              <span className={lang.rtl ? 'w-f ar' : 'w-f'} dir={lang.rtl ? 'rtl' : undefined}>{c.front}</span>
              {pronOf(lang.id, c.front, c.tr).map((x) => <small key={x} className="w-tr">{x}</small>)}
            </span>
            <span className="w-b">{c.back}</span>
            <SayBtn lang={lang.id} text={c.front} small />
            <span className="w-box" title={_t("Уровень")}>{c.box}</span>
            <button type="button" className="hg-act" onClick={() => removeCard(c.id)}>{_t("Убрать")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Listen button: the phone's own voice for this language. */
function SayBtn({ lang, text, small, slow }: { lang: string; text: string; small?: boolean; slow?: boolean }) {
  const code = speechLang(lang);
  const [none, setNone] = useState(false);
  if (!code) return null;
  const say = () => {
    // Arabic: the recorded course clip when there is one, else the phone voice.
    if (lang === 'ar') { void sayAr(text, slow).then((ok) => setNone(!ok)); return; }
    if (hasVoice(code) === false) { setNone(true); return; }
    void speak(text, slow, code);
  };
  return (
    <button type="button" className={small ? 'say-btn sm' : 'say-btn'} onClick={(e) => { e.stopPropagation(); say(); }} aria-label={slow ? _t("Послушать медленно") : _t("Послушать произношение")} title={none ? _t("На этом телефоне нет голоса для этого языка") : undefined}>
      {none ? '🔇' : slow ? '🐢' : '🔊'}
    </button>
  );
}

function Review({ lang, cards, habitName, onGrade, onTr, onBack, onFinish }: {
  lang: Lang; cards: Card[]; habitName?: string; onGrade: (id: string, ok: boolean) => void; onTr: (id: string, tr: string) => void; onBack: () => void; onFinish: (m: Mark) => void;
}) {
  const [queue] = useState(() => [...cards].sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [ok, setOk] = useState(0);
  const card = queue[i];
  const done = i >= queue.length;
  const pct = useMemo(() => (queue.length ? (i / queue.length) * 100 : 100), [i, queue.length]);
  const [found, setFound] = useState<Record<string, string>>({});
  const code = speechLang(lang.id);

  // English words added before IPA lookup existed: find it once, keep it on the card.
  useEffect(() => {
    let off = false;
    (async () => {
      for (const c of queue) {
        if (off) return;
        if (!needsLookup(lang.id, c.front, c.tr)) continue;
        const ipa = await lookupIpa(c.front);
        if (ipa && !off) { setFound((f) => ({ ...f, [c.id]: ipa })); onTr(c.id, ipa); }
      }
    })();
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Say the word when a new card comes up.
  useEffect(() => {
    if (!card || !code) return;
    if (lang.id === 'ar') { const t = setTimeout(() => void sayAr(card.front), 250); return () => clearTimeout(t); }
    if (hasVoice(code) === false) return;
    const t = setTimeout(() => void speak(card.front, false, code), 250);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (good: boolean) => {
    onGrade(card.id, good);
    if (good) setOk((n) => n + 1);
    setShown(false);
    setI((n) => n + 1);
  };

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={_t("Назад")}>‹</button>
        <div><b>{lang.label}</b><small>{done ? _t("Готово") : _t("{0} из {1}", i + 1, queue.length)}</small></div>
      </div>
      <div className="rev-bar"><i style={{ width: `${pct}%` }} /></div>
      {!done ? (
        <div className="rev">
          <div className="flash-wrap">
            <button type="button" className="flash" onClick={() => setShown(true)} aria-label={_t("Показать перевод")}>
              <span className={lang.rtl ? 'flash-f ar' : 'flash-f'} dir={lang.rtl ? 'rtl' : undefined}>{card.front}</span>
              {pronOf(lang.id, card.front, card.tr ?? found[card.id]).map((x, k) => <span key={x} className={k ? 'flash-tr2' : 'flash-tr'}>{x}</span>)}
              {shown ? <span className="flash-b">{card.back}</span> : <span className="flash-hint">{_t("Вспомни перевод и нажми")}</span>}
            </button>
            <div className="flash-say">
              <SayBtn lang={lang.id} text={card.front} />
              <SayBtn lang={lang.id} text={card.front} slow />
            </div>
          </div>
          {shown ? (
            <div className="row2 light rev-btns">
              <button type="button" onClick={() => answer(false)}>{_t("Не помню")}</button>
              <button type="button" className="pri-btn" onClick={() => answer(true)}>{_t("Помню")}</button>
            </div>
          ) : (
            <button type="button" className="pri-btn big-btn" onClick={() => setShown(true)}>{_t("Показать")}</button>
          )}
        </div>
      ) : (
        <div className="rev">
          <div className="finish light">
            <b>{_tj("Повторено {0}", queue.length)}</b>
            <p>{_tj("Помнишь {0} из {1}. {2}", ok, queue.length, ok === queue.length ? _t("МашаАллах!") : _t("Забытые слова останутся в повторении на сегодня."))}</p>
          </div>
          <div className="row2 light rev-btns">
            {habitName ? (
              <>
                <button type="button" onClick={() => onFinish('min')}>{_t("Минимум")}</button>
                <button type="button" className="pri-btn" onClick={() => onFinish('done')}>{_t("Отметить привычку")}</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={onBack}>{_t("Готово")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
