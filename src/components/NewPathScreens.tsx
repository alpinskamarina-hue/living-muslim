import { useEffect, useRef, useState } from 'react';
import type { Anchor, AppState } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { _t, _tj, LOC } from '../i18n';
import { fromKey } from '../dates';
import { setPrayer } from '../store';
import {
  ayahAudio, DHIKR, type DhikrId, fade, FARD, gx, LESSONS, type LessonGo, LOST_COUNT, markLesson, nextReview, npOf, pathNow,
  type Pose, prayerSura, setSura, SURA_ORDER, SURAS, teacherStep, turnOff, WEEKS, weekOf,
} from '../newpath';
import { type PathView, QuietToggle, startPath } from './NewPath';

type Update = (fn: (s: AppState) => AppState) => void;
export type OutGo = Exclude<LessonGo, { sura: number } | { prayer: Anchor } | { poses: true }>;

interface Props {
  state: AppState;
  update: Update;
  today: string;
  /** The prayer of the current window, for the teacher. */
  prayer: Anchor;
  start: PathView;
  onClose: () => void;
  /** Lesson buttons that lead to other parts of the app. */
  onGo: (g: OutGo) => void;
}

export function PathScreen({ state, update, today, prayer, start, onClose, onGo }: Props) {
  const [view, setView] = useState<PathView>(start);
  const [stack, setStack] = useState<PathView[]>([]);
  useEffect(() => { setView(start); setStack([]); }, [start]);
  const open = (v: PathView) => { setStack((s) => [...s, view]); setView(v); };
  const back = () => { if (!stack.length) { onClose(); return; } setView(stack[stack.length - 1]); setStack((s) => s.slice(0, -1)); };
  const f = state.settings.me === 'f';

  if (view.v === 'prayer') return <Teacher state={state} update={update} today={today} start={view.a ?? prayer} onClose={back} f={f} />;
  if (view.v === 'sura') return <Trainer state={state} update={update} today={today} n={view.n} review={view.review} onClose={back} f={f} />;
  const title = view.v === 'lesson' ? _t("Шаг {0} из 40", view.n) : view.v === 'poses' ? _t("Позы намаза") : _t("Новый путь");
  const p = pathNow(state, today);
  return (
    <div className="sess light-sess np-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={back} aria-label={stack.length ? _t("Назад") : _t("Закрыть")}>{stack.length ? '‹' : '✕'}</button>
        <div><b>{title}</b><small>{view.v === 'list' && p.np.on ? _t("День {0} из 40 · по шагу в день", p.day) : _t("Для тех, кто недавно принял ислам")}</small></div>
      </div>
      <div className="h-wrap">
        {view.v === 'list' && <PathList state={state} update={update} today={today} open={open} f={f} />}
        {view.v === 'lesson' && <LessonView state={state} update={update} today={today} n={view.n} open={open} onGo={onGo} f={f} />}
        {view.v === 'poses' && <Poses />}
      </div>
    </div>
  );
}

// ─── The list: tools, suras, 40 steps, settings ─────────────────────────────

function PathList({ state, update, today, open, f }: { state: AppState; update: Update; today: string; open: (v: PathView) => void; f: boolean }) {
  const p = pathNow(state, today);
  const np = p.np;
  return (
    <>
      {!np.on && (
        <div className="np-intro">
          <b>{_t("40 дней, по одному шагу в день")}</b>
          <p>{_t("Омовение, первый намаз с учителем, который считает ракааты, первые суры с чтецом. Без спешки и без вины.")}</p>
          <button type="button" className="pri-btn" onClick={() => startPath(update, today)}>{_t("Начать путь")}</button>
          <small>{_t("Тем, кто недавно принял ислам, Pro на первый год в подарок.")}</small>
        </div>
      )}
      <div className="np-tools">
        <button type="button" onClick={() => open({ v: 'prayer' })}><b>{_t("Учитель намаза")}</b><small>{_t("Считает ракааты и подсказывает, что дальше")}</small></button>
        <button type="button" onClick={() => open({ v: 'poses' })}><b>{_t("Позы намаза")}</b><small>{_t("Как стоять, кланяться и сидеть")}</small></button>
      </div>

      <h4 className="np-h">{_t("Суры для намаза")}</h4>
      <div className="np-suras">
        {SURA_ORDER.map((n) => {
          const s = SURAS[n];
          const sp = np.suras[n];
          const nr = sp && nextReview(sp);
          const st = sp?.learned ? (nr ? _t("Выучена ✓ · повтор {0}", fromKey(nr).toLocaleDateString(LOC, { day: 'numeric', month: 'short' })) : _t("Выучена ✓"))
            : sp ? _t("Аят {0} из {1}", Math.min(sp.ayah + 1, s.ayahs.length), s.ayahs.length) : _t("{0} аята", s.ayahs.length);
          return (
            <button key={n} type="button" className={sp?.learned ? 'ok' : ''} onClick={() => open({ v: 'sura', n })}>
              <span className="ar" lang="ar">{s.ar}</span>
              <span><b>{s.name}</b><small>{st}</small></span>
            </button>
          );
        })}
      </div>

      {WEEKS.map((w, wi) => (
        <div key={wi} className="np-week">
          <h4 className="np-h">{_tj("Неделя {0} · {1}", wi + 1, w)}</h4>
          {LESSONS.filter((l) => weekOf(l.n) === wi).map((l) => {
            const done = Boolean(np.done[l.n]);
            const now = np.on && l.n === p.next?.n;
            return (
              <button key={l.n} type="button" className={`np-step${done ? ' ok' : ''}${now ? ' now' : ''}`} onClick={() => open({ v: 'lesson', n: l.n })}>
                <i aria-hidden="true">{done ? '✓' : l.n}</i>
                <span><b>{gx(l.t, f)}</b>{now && <small>{p.todayDone ? _t("Следующий, завтра") : _t("Шаг дня")}</small>}</span>
                <em aria-hidden="true">›</em>
              </button>
            );
          })}
        </div>
      ))}

      <h4 className="np-h">{_t("Настройки")}</h4>
      <QuietToggle on={Boolean(state.settings.quiet)} onChange={(v) => update((s) => ({ ...s, settings: { ...s.settings, quiet: v } }))} />
      {np.on && <button type="button" className="link-btn np-off" onClick={() => update(turnOff)}>{_t("Выключить «Новый путь» на «Сегодня»")}</button>}
      <p className="np-fine">{_t("Тексты общие, без спорных мнений. Где мазхабы расходятся, мы так и пишем: уточни у имама своей мечети.")}</p>
    </>
  );
}

// ─── One step ───────────────────────────────────────────────────────────────

function LessonView({ state, update, today, n, open, onGo, f }: { state: AppState; update: Update; today: string; n: number; open: (v: PathView) => void; onGo: (g: OutGo) => void; f: boolean }) {
  const l = LESSONS.find((x) => x.n === n)!;
  const np = npOf(state);
  const done = np.done[n];
  const [just, setJust] = useState(false);
  const next = LESSONS.find((x) => x.n > n && !np.done[x.n]);
  const go = l.go;
  const goBtn = (() => {
    if (!go) return null;
    if (typeof go === 'object' && 'sura' in go) return { t: _tj("Учить «{0}»", SURAS[go.sura].name), on: () => open({ v: 'sura', n: go.sura }) };
    if (typeof go === 'object' && 'prayer' in go) return { t: _tj("Открыть учителя: {0}", ANCHOR_LABEL[go.prayer].ru), on: () => open({ v: 'prayer', a: go.prayer }) };
    if (typeof go === 'object') return { t: _t("Посмотреть позы"), on: () => open({ v: 'poses' }) };
    const T: Record<OutGo, string> = { qibla: _t("Найти киблу"), mosques: _t("Мечети рядом"), azkar: _t("Открыть азкары"), quran: _t("Открыть Коран"), circle: _t("Открыть «Круг»"), habit: _t("Добавить привычку") };
    return { t: T[go], on: () => onGo(go) };
  })();
  return (
    <div className="np-lessonv">
      <small className="np-wk">{WEEKS[weekOf(n)]}</small>
      <h2>{gx(l.t, f)}</h2>
      {l.p.map((x, i) => <p key={i}>{gx(x, f)}</p>)}
      {l.dhikr?.map((d) => <DhikrCard key={d} id={d} />)}
      {l.task && <div className="np-task"><small>{_t("Сегодня")}</small><span>{gx(l.task, f)}</span></div>}
      {goBtn && <button type="button" className="ghost-btn np-go" onClick={goBtn.on}>{goBtn.t}</button>}
      {!done ? (
        <button type="button" className="pri-btn np-done" onClick={() => { update((s) => markLesson(s, n, today)); setJust(true); try { navigator.vibrate?.(30); } catch { /* */ } }}>{_t("Шаг пройден")}</button>
      ) : just ? (
        <div className="np-well">
          <b>{_t("МашаАллах!")}</b>
          <span>{next ? _tj("Следующий шаг завтра: «{0}». Отдохни, это тоже часть пути.", gx(next.t, f)) : (f ? _t("Ты прошла все 40 шагов.") : _t("Ты прошёл все 40 шагов."))}</span>
          {next && <button type="button" className="link-btn" onClick={() => open({ v: 'lesson', n: next.n })}>{_t("Всё равно открыть сейчас")}</button>}
        </div>
      ) : (
        <p className="np-fine">{_tj("✓ Пройден {0}", fromKey(done).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }))}</p>
      )}
    </div>
  );
}

function DhikrCard({ id, dark }: { id: DhikrId; dark?: boolean }) {
  const d = DHIKR[id];
  return (
    <div className={`np-dhikr${dark ? ' dark' : ''}`}>
      <small>{d.title}</small>
      <span className="ar" lang="ar" dir="rtl">{d.ar}</span>
      <b>{d.tr}</b>
      <span>{d.mean}</span>
      {d.note && <em>{d.note}</em>}
    </div>
  );
}

// ─── Poses ──────────────────────────────────────────────────────────────────

// Real photos of one rak'ah, frame by frame (public/app/salah/m-*.webp). The player cross-fades through them
// like a slow film; the teacher shows only the frames of the current step.
type Frame = 'takbir' | 'qiyam' | 'ruku' | 'itidal' | 'sujud' | 'jalsa' | 'sujud2' | 'tash';
const FRAME_ORDER: Frame[] = ['takbir', 'qiyam', 'ruku', 'itidal', 'sujud', 'jalsa', 'sujud2', 'tash'];
const FRAME_IMG: Record<Frame, string> = { takbir: 'takbir', qiyam: 'qiyam', ruku: 'ruku', itidal: 'itidal', sujud: 'sujud', jalsa: 'jalsa', sujud2: 'sujud', tash: 'tash' };
const FRAME_NAME: Record<Frame, string> = {
  takbir: _t("Такбир: «Аллаху акбар»"),
  qiyam: _t("Стояние: Фатиха и сура"),
  ruku: _t("Поясной поклон (руку‘)"),
  itidal: _t("Выпрямиться"),
  sujud: _t("Земной поклон (суджуд)"),
  jalsa: _t("Сидение между поклонами"),
  sujud2: _t("Второй земной поклон"),
  tash: _t("Сидение: ташаххуд"),
};
const FRAME_TEXT: Record<Frame, string> = {
  takbir: _t("Руки подняты к ушам, ладони к кибле. Только в начале намаза."),
  qiyam: _t("Правая рука поверх левой, взгляд на место поклона."),
  ruku: _t("Спина ровная, параллельно полу, ладони на коленях. «Субхана Раббияль-‘азым» 3 раза."),
  itidal: _t("«Сами‘а Ллаху лиман хамидах», выпрямившись: «Раббана ва лякаль-хамд»."),
  sujud: _t("Лоб и нос, ладони, колени и пальцы ног на полу. Локти не лежат. «Субхана Раббияль-а‘ля» 3 раза."),
  jalsa: _t("Сядь ненадолго, руки на бёдрах: «Рабби-гфир ли»."),
  sujud2: _t("Так же, как первый. После него ракаат завершён."),
  tash: _t("После второго ракаата и в конце намаза. Указательный палец правой руки показывает вперёд."),
};
const frameSrc = (fr: Frame) => `/app/salah/m-${FRAME_IMG[fr]}.webp`;

/** Which frames show the current teacher step. */
function stepFrames(pose: Pose, r: number, s: number): Frame[] {
  if (pose === 'stand') return r === 1 && s === 0 ? ['takbir', 'qiyam', 'ruku', 'itidal', 'sujud'] : ['qiyam', 'ruku', 'itidal', 'sujud'];
  if (s === 1) return ['jalsa', 'sujud2'];
  return ['tash'];
}

function RakahPlayer({ frames, dark }: { frames: Frame[]; dark?: boolean }) {
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(frames.length > 1);
  const key = frames.join();
  useEffect(() => { setI(0); setPlay(frames.length > 1); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!play || frames.length < 2) return;
    const t = window.setTimeout(() => setI((x) => (x + 1) % frames.length), 2800);
    return () => window.clearTimeout(t);
  }, [play, i, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fr = frames[Math.min(i, frames.length - 1)];
  const go = (d: number) => { setPlay(false); setI((x) => (x + d + frames.length) % frames.length); };
  return (
    <div className={`np-film${dark ? ' dark' : ''}`}>
      <div className="np-film-pic" onClick={() => frames.length > 1 && setPlay(!play)}>
        {frames.map((f, k) => <img key={f} src={frameSrc(f)} alt={k === i ? FRAME_NAME[f] : ''} className={k === i ? 'on' : ''} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" />)}
        {frames.length > 1 && <span className="np-film-n">{i + 1} / {frames.length}</span>}
      </div>
      <div className="np-film-cap">
        <b>{FRAME_NAME[fr]}</b>
        <small>{FRAME_TEXT[fr]}</small>
      </div>
      {frames.length > 1 && (
        <div className="np-film-ctl">
          <button type="button" onClick={() => go(-1)} aria-label={_t("Назад")}>‹</button>
          <span>{frames.map((f, k) => <i key={f} className={k === i ? 'on' : ''} onClick={() => { setPlay(false); setI(k); }} />)}</span>
          <button type="button" onClick={() => setPlay(!play)} aria-label={play ? _t("Пауза") : _t("Смотреть")}>{play ? '❚❚' : '▶'}</button>
          <button type="button" onClick={() => go(1)} aria-label={_t("Дальше")}>›</button>
        </div>
      )}
    </div>
  );
}

function Poses() {
  return (
    <div className="np-poses">
      <p className="np-poses-h">{_t("Один ракаат от начала до конца. Листается сам, можно остановить и листать руками.")}</p>
      <RakahPlayer frames={FRAME_ORDER} />
    </div>
  );
}

// ─── The prayer teacher: the phone on the floor counts prostrations ─────────

function Teacher({ state, update, today, start, onClose, f }: { state: AppState; update: Update; today: string; start: Anchor; onClose: () => void; f: boolean }) {
  const [a, setA] = useState<Anchor>(start);
  const total = FARD[a];
  const [phase, setPhase] = useState<'ready' | 'go' | 'end'>('ready');
  const [r, setR] = useState(1);
  const [s, setS] = useState(0);
  const [hist, setHist] = useState<[number, number][]>([]);
  const [show, setShow] = useState<'' | 'text' | 'pose' | 'lost'>('pose');
  const last = useRef(0);
  const sn = prayerSura(state);
  const step = teacherStep(total, r, s, sn ? SURAS[sn].name : null);
  const marked = Boolean(state.prayers[today]?.[a]);

  // Keep the screen awake while praying.
  useEffect(() => {
    if (phase !== 'go') return;
    let lock: any = null;
    const get = () => { (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => {}); };
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.().catch?.(() => {}); };
  }, [phase]);

  const tap = () => {
    if (step.last) return;
    const t = Date.now();
    if (t - last.current < 1500) return; // a forehead can touch twice
    last.current = t;
    setHist((h) => [...h, [r, s]]);
    if (s < 2) setS(s + 1); else { setR(r + 1); setS(1); }
    setShow('pose');
    try { navigator.vibrate?.(s + 1 >= 2 ? [40, 60, 40] : 40); } catch { /* */ }
  };
  const undo = () => { const p = hist[hist.length - 1]; if (!p) return; setR(p[0]); setS(p[1]); setHist((h) => h.slice(0, -1)); };
  const begin = () => { setR(1); setS(0); setHist([]); setShow('pose'); setPhase('go'); };
  const name = ANCHOR_LABEL[a].ru;
  const rk = (n: number) => (n === 2 ? _t("2 ракаата") : n === 3 ? _t("3 ракаата") : _t("4 ракаата"));

  return (
    <div className="sess np-pr">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_tj("{0} · {1} фарда", name, rk(total))}</b><small>{phase === 'go' ? _t("Телефон на полу перед собой, экран вверх") : _t("Учитель намаза")}</small></div>
      </div>

      {phase === 'ready' && (
        <>
          <div className="np-seg" role="tablist">
            {ANCHORS.map((x) => <button key={x} type="button" role="tab" aria-selected={x === a} onClick={() => setA(x)}>{ANCHOR_LABEL[x].ru}<small>{FARD[x]}</small></button>)}
          </div>
          <div className="np-before">
            <b>{_t("Перед началом")}</b>
            <ul>
              <li>{_t("Омовение сделано, одежда и место чистые")}</li>
              <li>{_t("Лицом к кибле")}</li>
              <li>{_tj("Намерение в сердце: «Совершаю {0} фарда {1} ради Аллаха»", rk(total), name)}</li>
              <li>{_t("Положи телефон на пол перед местом поклона, экраном вверх")}</li>
            </ul>
            <span>{_t("После каждого земного поклона касайся экрана лбом или рукой. Учитель посчитает ракааты и подскажет, что дальше. Можно сначала пройти всё как тренировку.")}</span>
          </div>
          <button type="button" className="gold-btn" onClick={begin}>{_t("Начать")}</button>
        </>
      )}

      {phase === 'go' && (
        <>
          <div className="np-rk" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-label={_t("Ракаат {0} из {1}", r, total)}>
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              const got = n < r ? 2 : n === r ? s : 0;
              return (
                <span key={n} className={n === r ? 'cur' : n < r ? 'past' : ''}>
                  <span>{[0, 1].map((k) => <i key={k} className={k < got ? 'on' : ''} />)}</span>{n}
                </span>
              );
            })}
          </div>
          <button type="button" className={`np-tap${step.last ? ' fin' : ''}`} onClick={tap} aria-label={_t("Отметить земной поклон")}>
            <small>{_t("Ракаат")}</small>
            <b>{r}</b>
            <em>{s === 0 ? _t("коснись после поклона") : s === 1 ? _t("один поклон из двух") : _t("оба поклона сделаны")}</em>
          </button>
          <span className="np-hint">{_t("Касайся экрана лбом или рукой после каждого земного поклона")}</span>
          <div className="np-now">
            <small>{_t("Теперь")}</small>
            <b>{step.title}</b>
            <span>{gx(step.text, f)}</span>
            <div className="np-row">
              <button type="button" className={show === 'text' ? 'on' : ''} onClick={() => setShow(show === 'text' ? '' : 'text')}>{show === 'text' ? _t("Скрыть текст") : _t("Показать текст")}</button>
              <button type="button" className={show === 'pose' ? 'on' : ''} onClick={() => setShow(show === 'pose' ? '' : 'pose')}>{_t("Показать движения")}</button>
            </div>
            {show === 'text' && step.dhikr.map((d) => <DhikrCard key={d} id={d} />)}
            {show === 'pose' && <RakahPlayer frames={stepFrames(step.pose, r, s)} />}
            {step.last && <button type="button" className="pri-btn" onClick={() => setPhase('end')}>{f ? _t("Я завершила намаз") : _t("Я завершил намаз")}</button>}
          </div>
          <div className="np-under">
            {hist.length > 0 && <button type="button" className="link-btn" onClick={undo}>{_t("Отменить последнее касание")}</button>}
            <button type="button" className="link-btn" onClick={() => setShow(show === 'lost' ? '' : 'lost')}>{_t("Сбился со счёта? Что делать")}</button>
          </div>
          {show === 'lost' && <p className="np-lost">{gx(LOST_COUNT, f)}</p>}
        </>
      )}

      {phase === 'end' && (
        <div className="np-end">
          <b>{_tj("МашаАллах, {0} совершён", name)}</b>
          <span>{_t("Пусть Аллах примет. Каждый намаз делает следующий легче.")}</span>
          {!marked ? (
            <>
              <button type="button" className="gold-btn" onClick={() => { update((x) => setPrayer(x, today, a, 'ontime')); onClose(); }}>{_tj("Отметить {0} в намазах дня", name)}</button>
              <button type="button" className="link-btn light" onClick={onClose}>{_t("Это была тренировка")}</button>
            </>
          ) : (
            <button type="button" className="gold-btn" onClick={onClose}>{_t("Готово")}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── The sura trainer ───────────────────────────────────────────────────────

const STAGES = [_t("Полностью"), _t("С пропусками"), _t("Первые буквы"), _t("Без подсказки")];

function Trainer({ state, update, today, n, review, onClose, f }: { state: AppState; update: Update; today: string; n: number; review?: boolean; onClose: () => void; f: boolean }) {
  const sura = SURAS[n];
  const sp = npOf(state).suras[n] ?? { ayah: 0, stage: 0, known: [] };
  const all = sp.known.length >= sura.ayahs.length || Boolean(sp.learned);
  const [whole, setWhole] = useState(review || all);
  const [i, setI] = useState(Math.min(sp.ayah, sura.ayahs.length - 1));
  const [stage, setStage] = useState(whole ? 2 : sp.stage);
  const [slow, setSlow] = useState(false);
  const [rep, setRep] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [audioErr, setAudioErr] = useState(false);
  const [rec, setRec] = useState<'idle' | 'rec'>('idle');
  const [mine, setMine] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const mr = useRef<MediaRecorder | null>(null);

  const stop = () => { audio.current?.pause(); audio.current = null; setPlaying(false); };
  useEffect(() => () => { stop(); try { mr.current?.stop(); } catch { /* */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (mine) URL.revokeObjectURL(mine); }, [mine]);
  useEffect(() => { stop(); setMine(null); }, [i, whole]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    if (playing) { stop(); return; }
    const list = whole ? sura.ayahs.map((_, k) => k) : Array(rep ? 3 : 1).fill(i);
    let k = 0;
    setAudioErr(false);
    const one = () => {
      if (k >= list.length) { setPlaying(false); audio.current = null; return; }
      const a = new Audio(ayahAudio(n, list[k]));
      a.playbackRate = slow ? 0.75 : 1;
      audio.current = a;
      a.onended = () => { k++; setTimeout(() => { if (audio.current === a) one(); }, whole ? 300 : 900); };
      a.onerror = () => { setAudioErr(true); setPlaying(false); };
      a.play().catch(() => { setAudioErr(true); setPlaying(false); });
    };
    setPlaying(true);
    one();
  };

  const record = async () => {
    if (rec === 'rec') { mr.current?.stop(); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(s);
      const parts: Blob[] = [];
      m.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      m.onstop = () => { s.getTracks().forEach((t) => t.stop()); setRec('idle'); setMine(URL.createObjectURL(new Blob(parts, { type: m.mimeType || 'audio/webm' }))); };
      mr.current = m;
      stop();
      m.start();
      setRec('rec');
    } catch { setRec('idle'); alert(_t("Нет доступа к микрофону. Разреши его в настройках браузера.")); }
  };

  const save = (patch: Parameters<typeof setSura>[2]) => update((s) => setSura(s, n, patch));
  const ay = sura.ayahs[i];
  const knowAyah = () => {
    const known = [...new Set([...sp.known, i])];
    const nx = sura.ayahs.findIndex((_, k) => !known.includes(k));
    if (nx < 0) { save({ known, ayah: i, stage: 0 }); setWhole(true); setStage(2); return; }
    save({ known, ayah: nx, stage: 0 });
    setI(nx); setStage(0);
  };
  const lighter = () => { const st = Math.min(3, stage + 1); setStage(st); save({ ayah: i, stage: st }); };
  const finishWhole = () => {
    if (review || sp.learned) {
      save({ reviews: [...new Set([...(sp.reviews ?? []), today])] });
      setDoneMsg(_t("Повтор засчитан. Следующий придёт сам."));
    } else {
      save({ learned: today, reviews: [], known: sura.ayahs.map((_, k) => k) });
      setDoneMsg(n === 1 ? _t("Фатиха выучена! Теперь она с тобой в каждом намазе.") : _tj("Сура «{0}» выучена! Учитель намаза подскажет читать её после Фатихи.", sura.name));
    }
    try { navigator.vibrate?.([40, 60, 120]); } catch { /* */ }
  };

  const Hint = ({ tr }: { tr: string }) => {
    const h = fade(tr, stage);
    return h ? <b className="np-tr">{h}</b> : <b className="np-tr none">{_t("Прочитай по памяти")}</b>;
  };

  return (
    <div className="sess light-sess np-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Назад")}>‹</button>
        <div><b>{_tj("Сура «{0}»", sura.name)}</b><small>{review ? _t("Повторение · 1 минута") : whole ? _t("Вся сура целиком") : _t("Аят {0} из {1}", i + 1, sura.ayahs.length)}</small></div>
      </div>
      <div className="h-wrap">
        {!review && (
          <div className="np-ayahs" role="tablist">
            {sura.ayahs.map((_, k) => (
              <button key={k} type="button" role="tab" aria-selected={!whole && k === i} className={sp.known.includes(k) || sp.learned ? 'ok' : ''} onClick={() => { setWhole(false); setI(k); setStage(k === sp.ayah ? sp.stage : 0); }}>{k + 1}</button>
            ))}
            <button type="button" role="tab" aria-selected={whole} className="all" onClick={() => { setWhole(true); setStage(2); }}>{_t("Вся")}</button>
          </div>
        )}
        {!whole && i === 0 && !sp.known.length && <p className="np-why">{sura.why}</p>}

        {doneMsg ? (
          <div className="np-well big">
            <b>{_t("МашаАллах!")}</b>
            <span>{doneMsg}</span>
            <button type="button" className="pri-btn" onClick={onClose}>{_t("Готово")}</button>
          </div>
        ) : (
          <>
            <div className="np-ayah">
              {whole ? sura.ayahs.map((x, k) => (
                <div key={k} className="np-wline"><span className="ar" lang="ar" dir="rtl">{x.ar} <i>{k + 1}</i></span><Hint tr={x.tr} /></div>
              )) : (
                <>
                  <span className="ar big" lang="ar" dir="rtl">{ay.ar}</span>
                  <Hint tr={ay.tr} />
                  <span className="np-mean">{ay.mean}</span>
                </>
              )}
            </div>

            <div className="np-stages">
              <small>{whole ? _t("Подсказка") : _t("Подсказка тает с каждым повтором")}</small>
              <div>{STAGES.map((t, k) => <button key={k} type="button" aria-pressed={stage === k} className={k < stage ? 'past' : ''} onClick={() => setStage(k)}>{t}</button>)}</div>
            </div>

            <div className="np-row np-audio">
              <button type="button" className="pri-btn" onClick={play}>{playing ? _t("■ Стоп") : _t("▶ Слушать чтеца")}</button>
              <button type="button" className={`ghost-btn${rec === 'rec' ? ' rec' : ''}`} onClick={record}>{rec === 'rec' ? _t("■ Остановить запись") : _t("● Записать себя")}</button>
            </div>
            <div className="np-opts">
              <button type="button" aria-pressed={slow} onClick={() => setSlow(!slow)}>{_t("Медленно")}</button>
              {!whole && <button type="button" aria-pressed={rep} onClick={() => setRep(!rep)}>{_t("Повтор ×3")}</button>}
              <span>{_t("Чтец: Мишари Аль-Афаси")}</span>
            </div>
            {audioErr && <p className="np-fine">{_t("Не удалось загрузить чтение. Проверь интернет и попробуй ещё раз.")}</p>}
            {mine && <div className="np-mine"><small>{_t("Твоя запись (остаётся только на телефоне)")}</small><audio src={mine} controls /></div>}

            {whole ? (
              <button type="button" className="gold-btn np-cta" onClick={finishWhole}>{review || sp.learned ? (f ? _t("Повторила") : _t("Повторил")) : (f ? _t("Прочитала всю суру по памяти") : _t("Прочитал всю суру по памяти"))}</button>
            ) : stage < 3 ? (
              <button type="button" className="gold-btn np-cta" onClick={lighter}>{f ? _t("Повторила, убрать подсказку") : _t("Повторил, убрать подсказку")}</button>
            ) : (
              <button type="button" className="gold-btn np-cta" onClick={knowAyah}>{_t("Знаю этот аят")}</button>
            )}
            {!whole && stage > 0 && <button type="button" className="link-btn" onClick={() => setStage(stage - 1)}>{_t("Ещё раз с подсказкой")}</button>}
          </>
        )}
        <p className="np-fine">{_t("Выучишь, и сура встанет в намаз: учитель подскажет читать её после Фатихи. Повторы придут завтра, через 3 дня, через неделю и через месяц.")}</p>
      </div>
    </div>
  );
}
