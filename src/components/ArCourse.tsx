import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { AR1, LETTERS, NON_JOIN, type ArLesson, type Letter } from '../course/ar1';
import { arTr } from '../course/arTranslit';
import { playClip, stopClip } from '../course/arAudio';
import { uid } from '../store';
import { dayKey } from '../dates';
import { _t, _tj, isEn } from '../i18n';
import { Speak } from './Course';

// Arabic A1 by days: fusha on everyday topics. Same rhythm as the English course (lesson, dialog, cards, speak),
// plus a «Буквы» tab on the first 7 days. Audio is recorded (public/app/ar), the reading fades out after day 10.

const TOTAL = AR1.reduce((n, l) => n + l.p.length, 0);
const TR_DAYS = 10;
type Tab = 'letters' | 'lesson' | 'dialog' | 'cards' | 'speak';
const L2 = (x: [string, string]) => (isEn ? x[1] : x[0]);
const read = (ar: string) => arTr(ar, isEn ? 'lat' : 'ru');
type C = NonNullable<AppState['courseAr']>;
const EMPTY: C = { learned: [], done: [], day: 0 };

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
}

export function ArCourse({ state, update, habitName, onExit, onFinish }: Props) {
  const c = state.courseAr ?? EMPTY;
  const setC = (fn: (x: C) => C) => update((s) => ({ ...s, courseAr: fn(s.courseAr ?? EMPTY) }));
  const [day, setDay] = useState(c.day);
  const [tab, setTab] = useState<Tab>(c.day < LETTERS.length ? 'letters' : 'lesson');
  const [slow, setSlow] = useState(false);
  const [finish, setFinish] = useState(false);
  const chips = useRef<HTMLDivElement>(null);
  const L = AR1[day];
  const unlocked = (i: number) => i === 0 || c.done.includes(i - 1) || c.done.includes(i);
  const learnedSet = new Set(c.learned);
  // Reading under the Arabic: always on the first days, then the learner decides (a tap still shows it).
  const showTr = c.tr ?? day < TR_DAYS;

  useEffect(() => {
    chips.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [day]);
  useEffect(() => () => stopClip(), []);

  const pick = (i: number) => {
    if (!unlocked(i)) return;
    stopClip();
    setDay(i);
    setTab(i < LETTERS.length ? 'letters' : 'lesson');
    setC((x) => ({ ...x, day: i }));
  };
  const toggle = (key: string) => setC((x) => ({ ...x, learned: x.learned.includes(key) ? x.learned.filter((k) => k !== key) : [...x.learned, key] }));
  const learn = (key: string) => setC((x) => (x.learned.includes(key) ? x : { ...x, learned: [...x.learned, key] }));
  const saveRec = (d: number, date: string | null) => setC((x) => {
    const rec = { ...(x.rec ?? {}) };
    if (date) rec[d] = date; else delete rec[d];
    return { ...x, rec };
  });

  const complete = () => {
    const today = dayKey(new Date());
    update((s) => {
      const course = s.courseAr ?? EMPTY;
      const done = course.done.includes(day) ? course.done : [...course.done, day];
      const next = Math.min(AR1.length - 1, day + 1);
      // Phrases of a finished lesson go into the Arabic flashcards for spaced review.
      const langs = s.langs ?? { current: 'ar', decks: {} };
      const deck = langs.decks.ar ?? [];
      const have = new Set(deck.map((d) => d.front));
      const add = L.p.filter(([ar]) => !have.has(ar)).map(([ar, ru, en]) => ({ id: uid(), front: ar, back: isEn ? en : ru, box: 0, due: today }));
      return { ...s, courseAr: { ...course, done, day: next }, langs: { current: langs.current || 'ar', decks: { ...langs.decks, ar: [...deck, ...add] } } };
    });
    setFinish(true);
  };

  const tabs: [Tab, string][] = [
    ...(day < LETTERS.length ? [['letters', _t("Буквы")] as [Tab, string]] : []),
    ['lesson', _t("Урок")], ['dialog', _t("Диалог")], ['cards', _t("Карточки")], ['speak', _t("Говори")],
  ];

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Арабский по дням")}</b><small>{_tj("Фусха A1 · {0} уроков", AR1.length)}</small></div>
        <button type="button" className="slow-btn" aria-pressed={slow} onClick={() => setSlow(!slow)} title={_t("Медленная озвучка")}>🐢</button>
      </div>
      <div className="q-list course">
        <div className="c-prog">
          <span>{_tj("Выучено фраз: {0} из {1}", c.learned.length, TOTAL)}</span>
          <div className="bar"><i style={{ width: `${(c.learned.length / TOTAL) * 100}%` }} /></div>
        </div>
        <div className="days" ref={chips}>
          {AR1.map((_, i) => (
            <button key={i} type="button" className="dchip" aria-current={i === day} data-done={c.done.includes(i) || undefined} disabled={!unlocked(i)} onClick={() => pick(i)}>
              {i + 1}
            </button>
          ))}
        </div>

        <div className="c-day">{_tj("День {0}", day + 1)}</div>
        <h2 className="c-title">{L2(L.t)}</h2>
        <p className="c-goal">{_tj("Цель: {0}", L2(L.goal).toLowerCase())}</p>

        <div className="c-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { stopClip(); setTab(id); }}>{label}</button>
          ))}
        </div>

        <label className="ar-trsw">
          <input type="checkbox" checked={showTr} onChange={(e) => setC((x) => ({ ...x, tr: e.target.checked }))} />
          <span>{isEn ? _t("Чтение латиницей") : _t("Чтение русскими буквами")}</span>
          {day >= TR_DAYS && !showTr && <small>{_t("нажми на арабскую фразу, чтобы подсмотреть")}</small>}
        </label>

        {tab === 'letters' && <Letters day={day} slow={slow} onNext={() => setTab('lesson')} />}

        {tab === 'lesson' && (
          <>
            <p className="tiny">{_t("Нажми на динамик, послушай и повтори вслух 3 раза. Галочка — «выучил».")}</p>
            {L.p.map(([ar, ru, en], i) => {
              const key = `${day}:${i}`;
              const ok = learnedSet.has(key);
              return (
                <div className="phrase-row" key={key} data-ok={ok || undefined}>
                  <span className="pn">{i + 1}</span>
                  <div className="pt">
                    <ArText ar={ar} show={showTr} />
                    <span className="pru">{isEn ? en : ru}</span>
                  </div>
                  <div className="pbtns">
                    <button type="button" className="sq" onClick={() => void playClip(`l${day}p${i}`, slow)} aria-label={_t("Послушать")}>🔊</button>
                    <button type="button" className="sq chk2" aria-pressed={ok} onClick={() => toggle(key)} aria-label={_t("Выучил")}>✓</button>
                  </div>
                </div>
              );
            })}
            {L.g && (
              <div className="ar-tip">
                <small>{_t("Совет")}</small>
                <p>{L2(L.g)}</p>
              </div>
            )}
            <QuranWord q={L.q} />
            <button type="button" className="pri-btn big-btn" onClick={() => setTab('dialog')}>{_t("Дальше: диалог")}</button>
          </>
        )}

        {tab === 'dialog' && <Dialog day={day} lines={L.d} slow={slow} showTr={showTr} onNext={() => setTab('cards')} />}
        {tab === 'cards' && <Cards day={day} phrases={L.p} slow={slow} onLearn={learn} onNext={() => setTab('speak')} />}
        {tab === 'speak' && (
          <Speak
            day={day} task={L2(L.task)} phrases={L.p.map(([ar, ru]) => [ar, ru])} long={day === AR1.length - 1}
            onDone={complete} done={c.done.includes(day)} rec={c.rec ?? {}} onSaved={saveRec} prefix="speak-ar:"
            cheat={(
              <ul className="cheat ar-cheat">
                {L.p.map(([ar]) => <li key={ar}><span className="ar-txt sm" dir="rtl" lang="ar">{ar}</span>{showTr && <small>{read(ar)}</small>}</li>)}
              </ul>
            )}
          />
        )}
        <p className="tiny ar-note">{_t("Озвучка записана синтезом речи. Тексты курса до выхода проверит преподаватель арабского.")}</p>
      </div>

      {finish && (
        <div className="finish-sheet">
          <b>{_tj("День {0} пройден", day + 1)}</b>
          <p>{_tj("{0}Фразы урока добавлены в карточки «Языки → Арабский» для повторения.", day < AR1.length - 1 ? _t("Открыт день {0}. ", day + 2) : _t("Курс пройден, машаАллах! "))}</p>
          <div className="row2 light">
            {habitName ? (
              <>
                <button type="button" onClick={() => onFinish('min')}>{_t("Минимум")}</button>
                <button type="button" className="pri-btn" onClick={() => onFinish('done')}>{_t("Отметить привычку")}</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={onExit}>{_t("Готово")}</button>
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => { setFinish(false); if (day < AR1.length - 1) pick(day + 1); }}>
            {day < AR1.length - 1 ? _t("Открыть следующий день") : _t("Закрыть")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Arabic line with its reading; when the reading is off, a tap shows it. */
function ArText({ ar, show, big }: { ar: string; show: boolean; big?: boolean }) {
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [ar, show]);
  return (
    <>
      <span className={big ? 'ar-txt big' : 'ar-txt'} dir="rtl" lang="ar" onClick={show ? undefined : (e) => { e.stopPropagation(); setPeek(!peek); }}>{ar}</span>
      {(show || peek) && <span className="ar-read">{read(ar)}</span>}
    </>
  );
}

function QuranWord({ q }: { q: ArLesson['q'] }) {
  return (
    <div className="ar-quran">
      <small>{_t("Слово из Корана")}</small>
      <div className="ar-qw">
        <span className="ar-txt big" dir="rtl" lang="ar">{q.w}</span>
        <span>{isEn ? q.en : q.ru}</span>
      </div>
      <p className="ar-txt ayah" dir="rtl" lang="ar">{q.ar}</p>
      <p className="ar-qtr">«{isEn ? q.ten : q.tru}»</p>
      <small className="ar-ref">{q.ref}</small>
    </div>
  );
}

const HARAKAT: [string, string, string, string][] = [
  ['بَ', 'фатха', 'короткое «а»', 'fatha: short "a"'],
  ['بِ', 'кясра', 'короткое «и»', 'kasra: short "i"'],
  ['بُ', 'дамма', 'короткое «у»', 'damma: short "u"'],
  ['بْ', 'сукун', 'без гласной', 'sukun: no vowel'],
  ['بّ', 'шадда', 'удвоение: «бб»', 'shadda: doubled "bb"'],
  ['بًا', 'танвин', 'окончание «ан»', 'tanwin: ending "an"'],
];

function Letters({ day, slow, onNext }: { day: number; slow: boolean; onNext: () => void }) {
  const base = day * 4;
  return (
    <>
      {day === 0 && (
        <div className="ar-intro">
          <b>{_t("Как читать арабский")}</b>
          <p>{_t("Пишут справа налево. Гласные — это значки над и под буквой (харакаты). В уроках они всегда стоят, поэтому всё можно прочитать.")}</p>
          <div className="ar-hgrid">
            {HARAKAT.map(([ar, name, ru, en]) => (
              <div key={ar}><span className="ar-txt big" dir="rtl" lang="ar">{ar}</span><small>{isEn ? en : `${name}: ${ru}`}</small></div>
            ))}
          </div>
          <p className="tiny">{_t("Большинство букв соединяются с соседними и меняют вид: отдельно, в начале, в середине, в конце слова. Шесть букв (ا د ذ ر ز و) с буквой после себя не соединяются.")}</p>
        </div>
      )}
      <p className="tiny">{_t("4 буквы на сегодня. Нажми на букву, послушай название, потом слово-пример.")}</p>
      {LETTERS[day].map((x, i) => <LetterCard key={x[0]} x={x} n={base + i} slow={slow} />)}
      <button type="button" className="pri-btn big-btn" onClick={onNext}>{_t("Дальше: урок")}</button>
    </>
  );
}

function LetterCard({ x, n, slow }: { x: Letter; n: number; slow: boolean }) {
  const [l, name, sRu, sEn, ex, exRu, exEn] = x;
  const T = 'ـ';
  const joins = !NON_JOIN.includes(l);
  const forms: [string, string][] = joins
    ? [[l, _t("отдельно")], [l + T, _t("в начале")], [T + l + T, _t("в середине")], [T + l, _t("в конце")]]
    : [[l, _t("отдельно")], [T + l, _t("в конце")]];
  return (
    <div className="ar-letter">
      <button type="button" className="ar-lbig" onClick={() => void playClip(`k${n}`, slow)} aria-label={_t("Послушать")}>
        <span className="ar-txt" dir="rtl" lang="ar">{l}</span>
        <small>{name} · {read(name)} 🔊</small>
      </button>
      <div className="ar-lbody">
        <p>{isEn ? sEn : sRu}</p>
        <div className="ar-forms" dir="rtl">
          {forms.map(([f, lab]) => <div key={lab}><span className="ar-txt" lang="ar">{f}</span><small dir="ltr">{lab}</small></div>)}
        </div>
        <button type="button" className="ar-ex" onClick={() => void playClip(`k${n}e`, slow)}>
          <span className="ar-txt" dir="rtl" lang="ar">{ex}</span>
          <span>{read(ex)} · {isEn ? exEn : exRu} 🔊</span>
        </button>
      </div>
    </div>
  );
}

function Dialog({ day, lines, slow, showTr, onNext }: { day: number; lines: ArLesson['d']; slow: boolean; showTr: boolean; onNext: () => void }) {
  const [role, setRole] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState(-1);
  const stop = useRef(false);

  const playAll = async () => {
    stop.current = false;
    for (let i = 0; i < lines.length; i++) {
      if (stop.current) break;
      setPlaying(i);
      if (role && lines[i][0] === 'B') {
        await new Promise((r) => setTimeout(r, 5000)); // your turn: say it aloud
        continue;
      }
      await playClip(`l${day}d${i}`, slow);
      await new Promise((r) => setTimeout(r, 350));
    }
    setPlaying(-1);
  };
  useEffect(() => () => { stop.current = true; stopClip(); }, []);

  return (
    <>
      <div className="seg">
        <button type="button" aria-pressed={!role} onClick={() => setRole(false)}>{_t("Слушать")}</button>
        <button type="button" aria-pressed={role} onClick={() => { setRole(true); setOpen(new Set()); }}>{_t("По ролям: ты — B")}</button>
      </div>
      <p className="tiny">{role ? _t("Реплики B скрыты. Скажи их вслух по подсказке, потом открой и сверь.") : _t("Послушай диалог целиком, потом попробуй по ролям.")}</p>
      <div className="dlg">
        {lines.map(([who, ar, ru, en], i) => {
          const hidden = role && who === 'B' && !open.has(i);
          return (
            <div key={i} className={`bub ${who === 'B' ? 'me' : ''}`} data-on={playing === i || undefined}>
              {hidden ? (
                <button type="button" className="bub-hidden" onClick={() => { setOpen(new Set([...open, i])); void playClip(`l${day}d${i}`, slow); }}>
                  <small>{_t("Твоя реплика:")}</small> {isEn ? en : ru}
                  <em>{_t("нажми, чтобы сверить")}</em>
                </button>
              ) : (
                <button type="button" className="bub-text ar-bub" onClick={() => void playClip(`l${day}d${i}`, slow)}>
                  <span className="ar-txt" dir="rtl" lang="ar">{ar}</span>
                  {showTr && <span className="ar-read">{read(ar)}</span>}
                  <small>{isEn ? en : ru}</small>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="row2 light">
        <button type="button" onClick={playing >= 0 ? () => { stop.current = true; stopClip(); setPlaying(-1); } : playAll}>{playing >= 0 ? _t("Стоп") : _t("▶ Проиграть")}</button>
        <button type="button" className="pri-btn" onClick={onNext}>{_t("Дальше: карточки")}</button>
      </div>
    </>
  );
}

function Cards({ day, phrases, slow, onLearn, onNext }: { day: number; phrases: ArLesson['p']; slow: boolean; onLearn: (k: string) => void; onNext: () => void }) {
  const [order] = useState(() => phrases.map((_, i) => i).sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [again, setAgain] = useState<number[]>([]);
  const queue = [...order, ...again];
  const idx = queue[i];

  if (i >= queue.length)
    return (
      <div className="cards-done">
        <b>{_t("Все карточки пройдены")}</b>
        <button type="button" className="pri-btn big-btn" onClick={onNext}>{_t("Дальше: говори")}</button>
      </div>
    );
  const [ar, ru, en] = phrases[idx];
  return (
    <>
      <p className="tiny">{_tj("Скажи по-арабски, потом открой и сверь. {0} из {1}", i + 1, queue.length)}</p>
      <button type="button" className="flash" onClick={() => { setShown(true); void playClip(`l${day}p${idx}`, slow); }}>
        <span className="flash-b" style={{ color: 'var(--ink)' }}>{isEn ? en : ru}</span>
        {shown ? (
          <>
            <span className="ar-txt big" dir="rtl" lang="ar">{ar}</span>
            <span className="ar-read">{read(ar)}</span>
          </>
        ) : <span className="flash-hint">{_t("Скажи вслух и нажми")}</span>}
      </button>
      {shown && (
        <div className="row2 light rev-btns">
          <button type="button" onClick={() => { setAgain([...again, idx]); setShown(false); setI(i + 1); }}>{_t("Ещё раз")}</button>
          <button type="button" className="pri-btn" onClick={() => { onLearn(`${day}:${idx}`); setShown(false); setI(i + 1); }}>{_t("Сказал верно")}</button>
        </div>
      )}
    </>
  );
}
