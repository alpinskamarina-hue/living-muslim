import { useEffect, useRef, useState } from 'react';
import type { AppState, Habit, Mark, Sphere } from '../types';
import { ProGate } from './Plan';
import { limitOf } from '../plan';
import {
  catalog, catOf, dur, emptyVideos, lessons, loadCourses, lookup, parseYouTube, thumb, VIDEO_CATS,
  type Lesson, type QuizQ, type VideoCat, type VideoItem, type VideoState,
} from '../videos';
import { courseLink, courseView, lessonPlan, moduleAt, modulesOf, okQ, PASS, planOf } from '../courseFlow';
import { activeLimit, slotsUsed, uid } from '../store';
import { dayKey, fromKey } from '../dates';
import { drawCard, shareCard, type CardSpec } from '../share';
import { cachedProfile } from './Nick';
import { _t, _tj, LOC } from '../i18n';
import { canRate, lockedBy, opensAfter, rate, reviewsOf, starsText, suggestCourse, useStats, type CStat, type Review } from '../courseSocial';
import { currentCircle, isCloud, kindOf, myCircles, switchCircle } from '../cloud';
import { addDays, plural } from '../dates';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
  /** Course id to open right away (from a goal, the day plan or a shared link). */
  open?: string;
}

type QuizKey = number | 'f';
type View =
  | { page: 'home' } | { page: 'item'; item: VideoItem } | { page: 'play'; item: VideoItem; idx: number } | { page: 'add' }
  | { page: 'quiz'; item: VideoItem; k: QuizKey } | { page: 'cert'; item: VideoItem } | { page: 'notes'; item: VideoItem };

const MAIN: VideoCat[] = ['faith', 'biz', 'mind'];
const SPHERE: Record<VideoCat, Sphere> = { faith: 'faith', biz: 'biz', mind: 'mind', body: 'body', food: 'food', family: 'family', lang: 'mind' };
const today = () => dayKey(new Date());
const myName = (s: AppState) => { const n = cachedProfile()?.nick; return n ? `@${n}` : (s.settings.name ?? '').trim(); };
/** Who shared the course link, when the page was opened with ?course=…&by=… */
const sharedBy = (id: string) => { try { const q = new URLSearchParams(location.search); return q.get('course') === id ? (q.get('by') ?? '').replace(/[^\w.-]/g, '').slice(0, 30) : ''; } catch { return ''; } };

export function Videos({ state, update, habitName, onExit, onFinish, open }: Props) {
  const vs = state.videos ?? emptyVideos();
  const setVs = (fn: (v: VideoState) => VideoState) => update((s) => ({ ...s, videos: fn(s.videos ?? emptyVideos()) }));
  const find = (id?: string) => (id ? [...vs.mine, ...catalog()].find((x) => x.id === id) : undefined);
  const [view, setView] = useState<View>(() => {
    const it = find(open);
    return it ? (it.kind === 'list' ? { page: 'item', item: it } : { page: 'play', item: it, idx: 0 }) : { page: 'home' };
  });
  const [cat, setCat] = useState<VideoCat | 'all'>('all');
  const [more, setMore] = useState(false);
  const [, setTick] = useState(0);
  const stats = useStats();
  useEffect(() => {
    loadCourses().then((ch) => {
      if (!ch) return;
      setTick((n) => n + 1);
      // A shared link to a course the owner added: it is known only once the list has loaded.
      setView((v) => { const it = v.page === 'home' ? find(open) : undefined; return it ? { page: 'item', item: it } : v; });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };
  // Content can change in the owner's list; always show the fresh copy of the open course.
  const fresh = (it: VideoItem) => find(it.id) ?? it;

  const all = [...vs.mine, ...catalog()];
  const findItem = (id: string) => all.find((x) => x.id === id);
  const toCourse = (item: VideoItem) => go(item.kind === 'list' ? { page: 'item', item } : { page: 'home' });
  const addHabit = (item: VideoItem, action: string): 'active' | 'queued' | 'have' => {
    const a = action.trim().slice(0, 80);
    if (state.habits.some((h) => h.action === a && h.status !== 'archived')) return 'have';
    const st: Habit['status'] = slotsUsed(state) < activeLimit() ? 'active' : 'queued';
    update((s) => ({ ...s, habits: [...s.habits, { id: uid(), action: a, min: _t("1 шаг"), anchor: 'isha', sphere: SPHERE[item.cat], status: st, createdAt: today() }] }));
    return st;
  };

  if (view.page === 'add') return <AddVideo onBack={() => go({ page: 'home' })} onAdd={(it) => { setVs((v) => ({ ...v, mine: [it, ...v.mine.filter((x) => x.id !== it.id)] })); go({ page: 'item', item: it }); }} />;
  if (view.page === 'item') {
    const item = fresh(view.item);
    return (
      <Course item={item} vs={vs} setVs={setVs} by={sharedBy(item.id)} stat={stats[item.id]} onOpenItem={(it) => go({ page: 'item', item: it })} onBack={() => go({ page: 'home' })}
        onPlay={(idx) => go({ page: 'play', item, idx })} onQuiz={(k) => go({ page: 'quiz', item, k })}
        onCert={() => go({ page: 'cert', item })} onNotes={() => go({ page: 'notes', item })} />
    );
  }
  if (view.page === 'play') {
    const item = fresh(view.item);
    return (
      <Player
        item={item} idx={view.idx} vs={vs} setVs={setVs} habitName={habitName}
        onBack={() => toCourse(item)}
        onIdx={(idx) => go({ page: 'play', item, idx })}
        onQuiz={(k) => go({ page: 'quiz', item, k })}
        onHabit={(a) => addHabit(item, a)}
        onWatched={() => onFinish('done')}
      />
    );
  }
  if (view.page === 'quiz') {
    const item = fresh(view.item);
    return <Quiz item={item} k={view.k} vs={vs} setVs={setVs} onBack={() => toCourse(item)} onCert={() => go({ page: 'cert', item })} />;
  }
  if (view.page === 'cert') { const item = fresh(view.item); return <Cert item={item} state={state} vs={vs} setVs={setVs} onBack={() => toCourse(item)} onNotes={() => go({ page: 'notes', item })} onOpenItem={(it) => go({ page: 'item', item: it })} />; }
  if (view.page === 'notes') { const item = fresh(view.item); return <Notes item={item} vs={vs} onBack={() => toCourse(item)} />; }

  const inCat = (x: VideoItem) => cat === 'all' || x.cat === cat;
  const courses = catalog().filter((x) => x.kind === 'list' && inCat(x));
  const singles = catalog().filter((x) => x.kind === 'video' && inCat(x));
  const mine = vs.mine.filter(inCat);
  const last = vs.last && findItem(vs.last.item);
  const lastPos = vs.last ? vs.pos[vs.last.v] : undefined;
  const finished = Object.entries(vs.doneC ?? {}).map(([id, d]) => ({ it: findItem(id), d })).filter((x) => x.it).sort((a, b) => (a.d < b.d ? 1 : -1));

  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onExit}>{_t("← Практика")}</button>
      <h1 className="page-h">{_t("Курсы")}</h1>
      <p className="page-sub">{_t("Короткие уроки, заметки, практика и тесты. В конце сертификат, которым можно поделиться.")}</p>

      {[MAIN, VIDEO_CATS.map((c) => c.id).filter((id) => !MAIN.includes(id))].map((ids, row) => (row === 1 && !more && !ids.includes(cat as VideoCat)) ? null : (
        <div key={row} className={`vtopics${row ? ' sm' : ''}`}>
          {VIDEO_CATS.filter((c) => ids.includes(c.id)).map((c) => {
            const n = all.filter((x) => x.cat === c.id).length;
            return (
              <button key={c.id} type="button" className="vtopic" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? 'all' : c.id)}>
                <i>{c.ic}</i><b>{c.ru}</b><small>{n} {n === 1 ? _t("курс") : n < 5 ? _t("курса") : _t("курсов")}</small>
              </button>
            );
          })}
        </div>
      ))}
      <button type="button" className="vmore" onClick={() => setMore(!more)} aria-expanded={more}>
        {more ? _t("Свернуть темы ▴") : _t("Ещё темы: {0} ▾", VIDEO_CATS.filter((c) => !MAIN.includes(c.id)).map((c) => c.ru.toLowerCase()).join(', '))}
      </button>
      {cat !== 'all' && <button type="button" className="link-btn vall" onClick={() => setCat('all')}>{_t("Показать все темы")}</button>}

      {last && vs.last && !vs.doneC?.[last.id] && (
        <button type="button" className="vcont" onClick={() => {
          if (last.kind === 'video') return go({ page: 'play', item: last, idx: 0 });
          lessons(last).then((l) => go({ page: 'play', item: last, idx: Math.max(0, l.items.findIndex((x) => x.id === vs.last!.v)) })).catch(() => go({ page: 'item', item: last }));
        }}>
          <span className="vth" style={{ backgroundImage: `url(${thumb(vs.last.v)})` }}>
            <i className="vplay">▶</i>
            {lastPos?.d ? <i className="vbar" style={{ width: `${Math.min(100, (lastPos.t / lastPos.d) * 100)}%` }} /> : null}
          </span>
          <span className="vci"><small>{_t("Продолжить")}</small><b>{last.title}</b>{last.channel && <em>{last.channel}</em>}</span>
        </button>
      )}

      {courses.length > 0 && <h3 className="vh">{_t("Курсы")}</h3>}
      <div className="vgrid">{courses.map((x) => <Card key={x.id} item={x} vs={vs} stat={stats[x.id]} onClick={() => go({ page: 'item', item: x })} />)}</div>

      {singles.length > 0 && <h3 className="vh">{_t("Отдельные видео")}</h3>}
      <div className="vgrid">{singles.map((x) => <Card key={x.id} item={x} vs={vs} stat={stats[x.id]} onClick={() => go({ page: 'play', item: x, idx: 0 })} />)}</div>

      <h3 className="vh">{_t("Моё ")}<button type="button" className="link-btn" onClick={() => go({ page: 'add' })}>{_t("+ Добавить")}</button></h3>
      {mine.length ? (
        <div className="vgrid">{mine.map((x) => <Card key={x.id} item={x} vs={vs} stat={stats[x.id]} onClick={() => go(x.kind === 'list' ? { page: 'item', item: x } : { page: 'play', item: x, idx: 0 })} />)}</div>
      ) : (
        <button type="button" className="vempty" onClick={() => go({ page: 'add' })}>{_t("Вставь ссылку на видео или плейлист YouTube, который уже смотришь. Он появится здесь, с прогрессом и заметками.")}</button>
      )}

      {finished.length > 0 && (
        <>
          <h3 className="vh">{_t("Пройдено")}</h3>
          <div className="cs-done-list">
            {finished.map(({ it, d }) => (
              <button key={it!.id} type="button" className="cs-done" onClick={() => go({ page: 'cert', item: it! })}>
                <i aria-hidden="true">🏅</i><span><b>{it!.title}</b><small>{_t("Сертификат · {0}", fromKey(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }))}</small></span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="tiny">{_t("Видео с YouTube принадлежат их авторам. Мы только собираем их в курсы и помогаем смотреть понемногу.")}</p>
    </div>
  );
}

function Card({ item, vs, stat, onClick }: { item: VideoItem; vs: VideoState; stat?: CStat; onClick: () => void }) {
  const lock = lockedBy(item, vs);
  const [first, setFirst] = useState(item.kind === 'video' ? item.id : '');
  const [done, setDone] = useState(0);
  const [count, setCount] = useState(item.count ?? 0);
  useEffect(() => {
    if (item.kind !== 'list') { setDone(vs.pos[item.id]?.done ? 1 : 0); return; }
    let live = true;
    lessons(item).then((l) => {
      if (!live) return;
      setFirst(l.items[0]?.id ?? ''); setCount(l.items.length);
      setDone(l.items.filter((x) => vs.pos[x.id]?.done).length);
    }).catch(() => {});
    return () => { live = false; };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" className={`vcard${lock ? ' lk' : ''}`} onClick={onClick}>
      <span className="vth" style={first ? { backgroundImage: `url(${thumb(first)})` } : undefined}>
        {lock && <i className="vlock" aria-hidden="true">🔒</i>}
        {item.kind === 'list' && count > 0 && <i className="vdur">{count} {count === 1 ? _t("урок") : count < 5 ? _t("урока") : _t("уроков")}</i>}
        {done > 0 && count > 0 && <i className="vbar" style={{ width: `${(done / count) * 100}%` }} />}
      </span>
      <b>{item.title}{item.pro && <span className="pro-badge sm">PRO</span>}</b>
      <small>{catOf(item.cat).ic} {item.channel}{item.lang === 'en' ? ' · EN' : ''}{vs.doneC?.[item.id] ? _t(" · пройден ✓") : (planOf(item)?.final?.length || planOf(item)?.modules?.some((m) => m.quiz?.length)) ? _t(" · с тестами") : ''}</small>
      {lock ? <small className="vlk">{_t("Откроется после «{0}»", lock.title)}</small> : <StatLine stat={stat} />}
    </button>
  );
}

function useLessons(item: VideoItem) {
  const [data, setData] = useState<{ items: Lesson[]; title: string; channel: string } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setErr(false);
    lessons(item).then((d) => live && setData(d)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, err };
}

function Course({ item, vs, setVs, by, stat, onOpenItem, onBack, onPlay, onQuiz, onCert, onNotes }: {
  item: VideoItem; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void; by: string; stat?: CStat; onOpenItem: (it: VideoItem) => void;
  onBack: () => void; onPlay: (i: number) => void; onQuiz: (k: QuizKey) => void; onCert: () => void; onNotes: () => void;
}) {
  const { data, err } = useLessons(item);
  const items = data?.items ?? [];
  const cv = courseView(item, items, vs);
  const total = items.reduce((a, x) => a + x.seconds, 0);
  const about = planOf(item)?.about || item.note;
  // Free plan: 3 started courses; the ones already started stay open.
  const started = new Set([...Object.entries(vs.byCourse ?? {}).filter(([, v]) => v.length).map(([k]) => k), ...(vs.started ?? [])]);
  const locked = !started.has(item.id) && started.size >= limitOf('courses');
  const [gate, setGate] = useState(false);
  const [msg, setMsg] = useState('');
  const [withC, setWithC] = useState(false);
  // An advanced course opens after another one is finished.
  const needs = lockedBy(item, vs);
  const advanced = Boolean(item.plan?.after) && !needs;
  const begin = () => {
    if (needs) return false;
    if (locked) { setGate(true); return false; }
    if (!started.has(item.id)) setVs((v) => ({ ...v, started: [...new Set([...(v.started ?? []), item.id])] }));
    return true;
  };
  const play = (i: number) => { if (begin()) onPlay(i); };
  const quiz = (k: QuizKey) => { if (begin()) onQuiz(k); };
  // The day the course was finished: the certificate keeps this date.
  useEffect(() => {
    if (cv.complete && !vs.doneC?.[item.id]) setVs((v) => ({ ...v, doneC: { ...(v.doneC ?? {}), [item.id]: today() } }));
  }, [cv.complete]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = cv.next;
  const mainLabel = !cv.done && n.kind === 'lesson' && n.idx === 0 ? _t("Начать курс")
    : n.kind === 'lesson' ? _t("Продолжить: урок {0}", n.idx + 1)
    : n.kind === 'quiz' ? _t("Мини-тест модуля {0}", n.m + 1)
    : n.kind === 'final' ? _t("Итоговый тест") : _t("Пересмотреть");
  const main = () => (n.kind === 'lesson' ? play(n.idx) : n.kind === 'quiz' ? quiz(n.m) : n.kind === 'final' ? quiz('f') : play(0));
  const tests = cv.mods.filter((m) => m.quiz).length + (cv.final.length ? 1 : 0);
  const share = async () => {
    const r = await shareText(_t("Курс «{0}» в Living Muslim: короткие уроки, практика и тесты.", item.title), courseLink(item.id, cachedProfile()?.nick ?? undefined));
    setMsg(r === 'copied' ? _t("Ссылка скопирована") : '');
  };
  const quizSub = (m: (typeof cv.mods)[number]) => m.score === undefined ? (m.allDone ? _t("можно сдавать") : _t("после уроков модуля"))
    : m.passed ? _t("сдан, {0}%", m.score) : _t("{0}%, нужно {1}%. Можно пересдать", m.score, PASS);

  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Курсы")}</button>
      {by && <p className="cs-by">{_t("@{0} прошёл этот курс и делится им с тобой", by)}</p>}
      {items[0] && <div className="vth big" style={{ backgroundImage: `url(${thumb(items[0].id)})` }}><i className="vdur">{_tj("{0} уроков{1}", items.length, total ? ` · ${dur(total)}` : '')}</i></div>}
      <small className="cs-kick">{advanced ? _t("Продвинутый · ") : ''}{_t("Курс · {0}", catOf(item.cat).ru)}{tests ? _t(" · {0} теста", tests) : ''}</small>
      <h1 className="page-h">{item.mine ? data?.title || item.title : item.title}</h1>
      <StatLine stat={stat} big />
      {about && <p className="cs-about">{about}</p>}
      {needs && (
        <div className="cs-lock">
          <b>{_t("🔒 Откроется после курса «{0}»", needs.title)}</b>
          <small>{_t("Это продолжение. Сначала пройди первый курс до сертификата.")}</small>
          <button type="button" className="pri-btn" onClick={() => onOpenItem(needs)}>{_t("Открыть «{0}»", needs.title)}</button>
        </div>
      )}
      {advanced && !cv.done && <p className="cs-open">{_t("Курс открылся, потому что ты прошёл «{0}».", catalog().find((x) => x.id === item.plan!.after)?.title ?? '')}</p>}
      {items.length > 0 && <div className="vprog"><i style={{ width: `${cv.pct}%` }} /></div>}
      <p className="page-sub">{items.length ? _t("{0}% · {1} из {2} уроков · ", cv.pct, cv.done, items.length) : ''}{data?.channel || item.channel || ''}</p>
      {(gate || (locked && !cv.done)) && <ProGate k="courses" have={started.size} />}
      {cv.complete ? (
        <button type="button" className="cs-cert" onClick={onCert}><i aria-hidden="true">🏅</i><span><b>{_t("Курс пройден")}</b><small>{_t("Открыть сертификат и поделиться")}</small></span></button>
      ) : items.length > 0 && !needs && <button type="button" className="pri-btn big-btn" onClick={main}>{mainLabel}</button>}
      {!needs && !item.mine && items.length > 1 && isCloud && myCircles().length > 0 && !cv.complete && (
        <button type="button" className="ghost-btn cs-withc" onClick={() => setWithC(true)}>{_t("👥 Пройти с кругом")}</button>
      )}
      {withC && <WithCircle item={item} n={items.length} onClose={() => setWithC(false)} onDone={(cur) => { setWithC(false); begin(); setMsg(cur ? _t("Готово: курс недели появится в круге через минуту") : ''); }} />}
      {err && <p className="warn">{_t("Не получилось загрузить уроки. Проверь интернет и открой курс ещё раз.")}</p>}
      {!data && !err && <p className="tiny">{_t("Загружаю уроки…")}</p>}

      {cv.mods.map((m) => (
        <div key={m.i} className="cs-mod">
          {m.title && <h3 className="vh">{_t("Модуль {0}. {1}", m.i + 1, m.title)}<small>{m.done}/{m.to - m.from}</small></h3>}
          <div className="vls">
            {items.slice(m.from, m.to).map((x, j) => {
              const i = m.from + j, p = vs.pos[x.id];
              const isNext = n.kind === 'lesson' && n.idx === i;
              return (
                <button key={x.id} type="button" className={`vl${p?.done ? ' d' : ''}${isNext ? ' n' : ''}`} disabled={Boolean(needs)} onClick={() => play(i)}>
                  <i>{p?.done ? '✓' : i + 1}</i>
                  <span><b>{x.title}</b><small>{x.seconds ? dur(x.seconds) : ''}{p && !p.done && p.t > 5 ? _t(" · остановился на {0}", dur(Math.floor(p.t))) : ''}{vs.notes[x.id]?.trim() ? _t(" · есть заметка") : ''}</small></span>
                </button>
              );
            })}
            {m.quiz && (
              <button type="button" className={`vl vq${m.passed ? ' d' : ''}${n.kind === 'quiz' && n.m === m.i ? ' n' : ''}`} onClick={() => quiz(m.i)}>
                <i>{m.passed ? '✓' : '?'}</i><span><b>{_t("Мини-тест модуля {0}", m.i + 1)}</b><small>{_tj("{0} вопр. · {1}", m.quiz.length, quizSub(m))}</small></span>
              </button>
            )}
          </div>
        </div>
      ))}
      {cv.final.length > 0 && (
        <div className="vls">
          <button type="button" className={`vl vq${cv.complete ? ' d' : ''}${n.kind === 'final' ? ' n' : ''}`} disabled={!cv.finalReady} onClick={() => quiz('f')}>
            <i>{cv.complete ? '✓' : '★'}</i>
            <span><b>{_t("Итоговый тест")}</b><small>{!cv.finalReady ? _t("откроется после всех уроков и мини-тестов") : cv.finalScore === undefined ? _tj("{0} вопр. · проходной балл {1}%", cv.final.length, PASS) : cv.complete ? _t("сдан, {0}%", cv.finalScore) : _t("{0}%, нужно {1}%. Можно пересдать", cv.finalScore, PASS)}</small></span>
          </button>
        </div>
      )}
      {!cv.complete && items.length > 0 && <p className="cs-goal">{cv.final.length ? _t("В конце итоговый тест и сертификат, которым можно поделиться.") : _t("Пройди все уроки и получи сертификат, которым можно поделиться.")}</p>}

      <div className="cs-row">
        <button type="button" className="ghost-btn" onClick={onNotes}>{_t("Мой конспект")}</button>
        {!item.mine && <button type="button" className="ghost-btn" onClick={share}>{_t("Поделиться курсом")}</button>}
      </div>
      {msg && <p className="tiny">{msg}</p>}
      {!item.mine && cv.complete && <RateBox item={item} vs={vs} setVs={setVs} />}
      {!item.mine && <Reviews id={item.id} stat={stat} />}
      <p className="tiny">{_t("Чтобы урок стал привычкой, выбери привычку в Практике, например «Один урок после Иши». Просмотренный урок отметит её сам.")}</p>
      {item.mine && (
        <button type="button" className="link-btn" onClick={() => { if (confirm(_t("Убрать этот курс из «Моё»? Прогресс просмотра сохранится."))) { setVs((v) => ({ ...v, mine: v.mine.filter((m) => m.id !== item.id) })); onBack(); } }}>{_t("Убрать из «Моё»")}</button>
      )}
    </div>
  );
}

/** Share sheet with a link, or copy the text when there is none. */
async function shareText(text: string, url?: string): Promise<'shared' | 'copied' | 'cancel'> {
  try {
    if (navigator.share) { await navigator.share({ text, url }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancel'; }
  try { await navigator.clipboard.writeText(url ? `${text}\n${url}` : text); return 'copied'; } catch { return 'cancel'; }
}

function Quiz({ item, k, vs, setVs, onBack, onCert }: {
  item: VideoItem; k: QuizKey; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void; onBack: () => void; onCert: () => void;
}) {
  const plan = planOf(item);
  const qs: QuizQ[] = (k === 'f' ? plan?.final : plan?.modules?.[k]?.quiz)?.filter(okQ) ?? [];
  const key = `${item.id}:${k}`;
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [end, setEnd] = useState<number | null>(null);
  const q = qs[i];
  const title = k === 'f' ? _t("Итоговый тест") : _t("Мини-тест · модуль {0}", k + 1);
  const choose = (o: number) => { if (pick !== null) return; setPick(o); if (o === q.a) setRight((r) => r + 1); };
  const next = () => {
    if (i + 1 < qs.length) { setI(i + 1); setPick(null); return; }
    const pct = Math.round((right / qs.length) * 100);
    setEnd(pct);
    setVs((v) => ({ ...v, quiz: { ...(v.quiz ?? {}), [key]: Math.max(v.quiz?.[key] ?? 0, pct) } }));
  };
  const again = () => { setI(0); setPick(null); setRight(0); setEnd(null); };

  if (!qs.length) return <div className="page vids"><button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← К курсу")}</button><p className="tiny">{_t("В этом тесте пока нет вопросов.")}</p></div>;
  if (end !== null) {
    const ok = end >= PASS;
    return (
      <div className="page vids cs-quiz">
        <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← К курсу")}</button>
        <small className="cs-kick">{title}</small>
        <div className={`cs-score${ok ? ' ok' : ''}`}><b>{end}%</b><span>{_t("{0} из {1} верно", right, qs.length)}</span></div>
        <h1 className="page-h sm">{ok ? _t("Тест сдан. Машаллах!") : _t("Пока не сдан")}</h1>
        <p className="page-sub">{ok ? (k === 'f' ? _t("Курс пройден. Сертификат уже ждёт.") : _t("Можно идти дальше по курсу.")) : _t("Нужно {0}%. Пересмотри уроки модуля и попробуй ещё раз, попыток сколько угодно.", PASS)}</p>
        {ok && k === 'f' ? <button type="button" className="pri-btn big-btn" onClick={onCert}>{_t("Открыть сертификат")}</button>
          : ok ? <button type="button" className="pri-btn big-btn" onClick={onBack}>{_t("Дальше по курсу")}</button>
          : <button type="button" className="pri-btn big-btn" onClick={again}>{_t("Пройти ещё раз")}</button>}
        {!ok && <button type="button" className="ghost-btn" onClick={onBack}>{_t("К урокам")}</button>}
      </div>
    );
  }
  return (
    <div className="page vids cs-quiz">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← К курсу")}</button>
      <small className="cs-kick">{title} · {_t("вопрос {0} из {1}", i + 1, qs.length)}</small>
      <div className="cs-steps">{qs.map((_, j) => <i key={j} data-on={j <= i || undefined} />)}</div>
      <h1 className="page-h sm">{q.q}</h1>
      <div className="cs-opts">
        {q.opts.map((o, j) => !o.trim() ? null : (
          <button key={j} type="button" className="cs-opt" disabled={pick !== null && j !== pick && j !== q.a}
            data-r={pick === null ? undefined : j === q.a ? 'ok' : j === pick ? 'no' : undefined} onClick={() => choose(j)}>{o}</button>
        ))}
      </div>
      {pick !== null && (
        <div className={`cs-why${pick === q.a ? ' ok' : ''}`}>
          <b>{pick === q.a ? _t("Верно") : _t("Не совсем")}</b>
          {q.why && <p>{q.why}</p>}
        </div>
      )}
      {pick !== null && <button type="button" className="pri-btn big-btn" onClick={next}>{i + 1 < qs.length ? _t("Следующий вопрос") : _t("Узнать результат")}</button>}
      <p className="tiny">{_t("Проходной балл {0}%. Пересдавать можно сколько угодно.", PASS)}</p>
    </div>
  );
}

function Cert({ item, state, vs, setVs, onBack, onNotes, onOpenItem }: { item: VideoItem; state: AppState; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void; onBack: () => void; onNotes: () => void; onOpenItem: (it: VideoItem) => void }) {
  const next = opensAfter(item.id);
  const { data } = useLessons(item);
  const cv = courseView(item, data?.items ?? [], vs);
  const name = myName(state);
  const day = vs.doneC?.[item.id] ?? today();
  const [img, setImg] = useState('');
  const [msg, setMsg] = useState('');
  const tests = cv.mods.filter((m) => m.quiz).length + (cv.final.length ? 1 : 0);
  const spec: CardSpec = {
    theme: 'green',
    kicker: _t("Сертификат"),
    title: item.title,
    body: _t("Курс пройден в Living Muslim{0}", item.channel ? _t(". Уроки: {0}", item.channel) : ''),
    stats: [[String(cv.total), _t("уроков")], ...(tests ? [[String(tests), _t("тестов")] as [string, string]] : []), ...(cv.finalScore !== undefined ? [[`${cv.finalScore}%`, _t("итоговый тест")] as [string, string]] : [])],
    note: name || undefined,
    foot: fromKey(day).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' }),
  };
  const ready = cv.complete && cv.total > 0;
  useEffect(() => {
    if (!ready) return;
    if (!vs.doneC?.[item.id]) setVs((v) => ({ ...v, doneC: { ...(v.doneC ?? {}), [item.id]: day } }));
    let url = '';
    drawCard(spec).then((b) => { if (b) { url = URL.createObjectURL(b); setImg(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [ready, name, cv.total, cv.finalScore]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async () => {
    const link = item.mine ? '' : courseLink(item.id, cachedProfile()?.nick ?? undefined);
    const r = await shareCard(spec, 'living-muslim-certificate.png', `${_t("Прошёл курс «{0}» в Living Muslim.", item.title)}${link ? `\n${_t("Попробуй и ты:")} ${link}` : ''}`);
    setMsg(r === 'saved' ? _t("Картинка сохранена, текст со ссылкой скопирован") : '');
  };
  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← К курсу")}</button>
      {!data ? <p className="tiny">{_t("Загружаю…")}</p> : !ready ? (
        <p className="page-sub">{_t("Сертификат появится, когда пройдёшь все уроки и тесты курса.")}</p>
      ) : (
        <>
          <h1 className="page-h">{_t("Курс пройден. Машаллах!")}</h1>
          <div className="cs-img">{img ? <img src={img} alt={_t("Сертификат: {0}", item.title)} /> : <span>{_t("Рисую сертификат…")}</span>}</div>
          <button type="button" className="pri-btn big-btn" onClick={share}>{_t("Поделиться")}</button>
          {msg && <p className="tiny">{msg}</p>}
          {!name && <p className="tiny">{_t("Добавь ник в профиле, и он появится на сертификате.")}</p>}
          <p className="cs-badge">{_t("🏅 Значок курса добавлен в профиль")}</p>
          {next.map((x) => (
            <button key={x.id} type="button" className="cs-next" onClick={() => onOpenItem(x)}>
              <i aria-hidden="true">🔓</i><span><small>{_t("Открылся следующий курс")}</small><b>{x.title}</b></span><em aria-hidden="true">›</em>
            </button>
          ))}
          {!item.mine && <RateBox item={item} vs={vs} setVs={setVs} />}
          <button type="button" className="ghost-btn" onClick={onNotes}>{_t("Мой конспект")}</button>
          <p className="tiny">{_t("Делиться можно картинкой с ссылкой на курс: друг откроет его и начнёт с первого урока.")}</p>
        </>
      )}
    </div>
  );
}

function Notes({ item, vs, onBack }: { item: VideoItem; vs: VideoState; onBack: () => void }) {
  const { data } = useLessons(item);
  const [msg, setMsg] = useState('');
  const rows = (data?.items ?? []).map((x, i) => {
    const lp = lessonPlan(item, x.id);
    return { x, i, note: vs.notes[x.id]?.trim() ?? '', act: lp?.act && vs.acts?.[x.id] ? lp.act : '' };
  }).filter((r) => r.note || r.act);
  const text = [item.title, ...rows.map((r) => [`${r.i + 1}. ${r.x.title}`, r.note, r.act ? _t("Сделал: {0}", r.act) : ''].filter(Boolean).join('\n'))].join('\n\n');
  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← К курсу")}</button>
      <h1 className="page-h">{_t("Мой конспект")}</h1>
      <p className="page-sub">{item.title}</p>
      {!rows.length ? <p className="tiny">{_t("Здесь соберутся твои заметки к урокам и сделанная практика. Пиши заметку под видео, пока смотришь.")}</p> : (
        <>
          <div className="cs-notes">
            {rows.map((r) => (
              <div key={r.x.id}><small>{_t("Урок {0}. {1}", r.i + 1, r.x.title)}</small>{r.note && <p>{r.note}</p>}{r.act && <p className="cs-act">✓ {r.act}</p>}</div>
            ))}
          </div>
          <div className="cs-row">
            <button type="button" className="ghost-btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setMsg(_t("Скопировано")); } catch { setMsg(''); } }}>{_t("Скопировать")}</button>
            <button type="button" className="ghost-btn" onClick={async () => { const r = await shareText(text); setMsg(r === 'copied' ? _t("Скопировано") : ''); }}>{_t("Поделиться")}</button>
          </div>
          {msg && <p className="tiny">{msg}</p>}
        </>
      )}
    </div>
  );
}

// ---- ratings, reviews, course with a circle ----

function StatLine({ stat, big }: { stat?: CStat; big?: boolean }) {
  if (!stat || (!stat.n && !stat.done)) return null;
  return (
    <small className={big ? 'cs-stat' : 'vstat'}>
      {stat.n > 0 && <><b>★ {starsText(stat.avg)}</b>{big ? ` · ${stat.n} ${plural(stat.n, _t("оценка"), _t("оценки"), _t("оценок"))}` : ''}</>}
      {stat.done > 0 && `${stat.n > 0 ? ' · ' : ''}${_t("{0} прошли", stat.done)}`}
    </small>
  );
}

function Reviews({ id, stat }: { id: string; stat?: CStat }) {
  const [list, setList] = useState<Review[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (!stat?.n) return;
    let live = true;
    reviewsOf(id).then((r) => live && setList(r));
    return () => { live = false; };
  }, [id, stat?.n]);
  if (!list?.length) return null;
  const shown = all ? list : list.slice(0, 3);
  return (
    <div className="cs-revs">
      <h3 className="vh">{_t("Отзывы")}</h3>
      {shown.map((r, i) => (
        <div key={i} className="cs-rev">
          <div><b>{r.nick ? `@${r.who}` : r.who}</b><span>{'★'.repeat(r.stars)}<i>{'★'.repeat(5 - r.stars)}</i></span></div>
          <p>{r.body}</p>
        </div>
      ))}
      {list.length > 3 && !all && <button type="button" className="link-btn" onClick={() => setAll(true)}>{_t("Все отзывы ({0})", list.length)}</button>}
    </div>
  );
}

/** Stars and a few words after the certificate. Only people who finished can rate (checked on the server too). */
function RateBox({ item, vs, setVs }: { item: VideoItem; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void }) {
  const mine = vs.rated?.[item.id];
  const [edit, setEdit] = useState(!mine);
  const [s, setS] = useState(mine?.s ?? 0);
  const [t, setT] = useState(mine?.t ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!vs.doneC?.[item.id] || !canRate()) return null;
  if (!edit && mine) {
    return (
      <div className="cs-rate done">
        <span>{_t("Твоя оценка: ")}<b>{'★'.repeat(mine.s)}</b>{mine.t ? ` · ${mine.t.slice(0, 60)}${mine.t.length > 60 ? '…' : ''}` : ''}</span>
        <button type="button" className="link-btn" onClick={() => setEdit(true)}>{_t("Изменить")}</button>
      </div>
    );
  }
  const send = async () => {
    setBusy(true); setErr('');
    const r = await rate(item.id, s, t);
    setBusy(false);
    if (r === 'ok') { setVs((v) => ({ ...v, rated: { ...(v.rated ?? {}), [item.id]: { s, t: t.trim() } } })); setEdit(false); return; }
    setErr(r === 'old' ? _t("Отзывы скоро заработают: сервер ещё обновляется.") : r === 'not_done' ? _t("Оценить можно после того, как курс пройден.") : _t("Не получилось отправить. Попробуй ещё раз."));
  };
  return (
    <div className="cs-rate">
      <b>{_t("Как тебе курс?")}</b>
      <div className="cs-stars" role="radiogroup" aria-label={_t("Оценка")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={s === n} aria-label={_t("{0} из 5", n)} className={n <= s ? 'on' : ''} onClick={() => setS(n)}>★</button>
        ))}
      </div>
      <textarea rows={3} maxLength={600} value={t} onChange={(e) => setT(e.target.value)} placeholder={_t("Что тебе дал курс? (по желанию)")} />
      <button type="button" className="pri-btn" disabled={!s || busy} onClick={send}>{busy ? _t("Отправляю…") : _t("Отправить отзыв")}</button>
      {err && <p className="warn">{err}</p>}
      <small className="tiny">{_t("Отзыв увидят все рядом с твоим ником. Владелец приложения может скрыть отзыв.")}</small>
    </div>
  );
}

/** Suggest this course to one of my circles as the course of the week. */
function WithCircle({ item, n, onClose, onDone }: { item: VideoItem; n: number; onClose: () => void; onDone: (current: boolean) => void }) {
  const list = myCircles();
  const cur = currentCircle()?.code;
  const [code, setCode] = useState(cur ?? list[0]?.code ?? '');
  const [weeks, setWeeks] = useState<0 | 2 | 4>(4);
  const per = weeks ? Math.ceil(n / weeks) : 0;
  const go = () => {
    suggestCourse(code, { id: item.id, title: item.title.slice(0, 80), n, until: weeks ? addDays(today(), weeks * 7) : '', at: new Date().toISOString() });
    if (code !== cur) { switchCircle(code); return; }
    onDone(true);
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet cs-sheet" role="dialog" aria-modal="true" aria-label={_t("Пройти с кругом")}>
        <div className="grab" />
        <h2>{_t("Пройти с кругом")}</h2>
        <p className="tiny">{_t("Курс станет «курсом недели» в твоём круге. Каждый проходит в своём темпе, а круг видит, кто на каком уроке.")}</p>
        <small className="cs-lbl">{_t("Какой круг")}</small>
        <div className="cs-circles">
          {list.map((c) => (
            <button key={c.code} type="button" aria-pressed={code === c.code} onClick={() => setCode(c.code)}>
              <i aria-hidden="true">{kindOf(c.kind)?.ic ?? '👥'}</i><b>{c.title || _t("Круг")}</b>{code === c.code && <em aria-hidden="true">✓</em>}
            </button>
          ))}
        </div>
        <small className="cs-lbl">{_t("Цель круга")}</small>
        <div className="cs-weeks">
          {([2, 4, 0] as const).map((w) => (
            <button key={w} type="button" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w ? _t("{0} недели", w) : _t("Без срока")}</button>
          ))}
        </div>
        <p className="tiny">{weeks ? _tj("{0} {1} за {2} недели: примерно {3} в неделю", n, plural(n, _t("урок"), _t("урока"), _t("уроков")), weeks, `${per} ${plural(per, _t("урок"), _t("урока"), _t("уроков"))}`) : _t("Каждый проходит, когда удобно. Круг всё равно видит, кто на каком уроке.")}</p>
        <button type="button" className="pri-btn big-btn" disabled={!code} onClick={go}>{_t("Предложить кругу")}</button>
        {code !== cur && <p className="tiny">{_t("Откроется этот круг, и курс появится в нём.")}</p>}
        <p className="tiny">{_t("Видно только, кто на каком уроке. Заметки и баллы тестов остаются твоими.")}</p>
        <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>
      </div>
    </>
  );
}

// ---- player (YouTube IFrame API, privacy-enhanced host) ----

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
let ytReady: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytReady) {
    ytReady = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytReady;
}

function Player({ item, idx, vs, setVs, habitName, onBack, onIdx, onQuiz, onHabit, onWatched }: {
  item: VideoItem; idx: number; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void; habitName?: string;
  onBack: () => void; onIdx: (i: number) => void; onQuiz: (k: QuizKey) => void; onHabit: (action: string) => 'active' | 'queued' | 'have'; onWatched: () => void;
}) {
  const { data, err } = useLessons(item);
  const items = data?.items ?? [];
  const lesson = items[idx];
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [rate, setRate] = useState(1);
  const vid = lesson?.id;
  const saved = vid ? vs.pos[vid] : undefined;
  const [done, setDone] = useState(!!saved?.done);
  const [note, setNote] = useState(vid ? vs.notes[vid] ?? '' : '');
  const [habitMsg, setHabitMsg] = useState('');
  const lp = vid ? lessonPlan(item, vid) : undefined;
  const mods = modulesOf(item, items, vs);
  const mod = moduleAt(mods, idx);
  const final = planOf(item)?.final?.filter(okQ) ?? [];

  const markDone = () => {
    if (!vid) return;
    setDone(true);
    setVs((v) => ({ ...v, lastDay: today(), pos: { ...v.pos, [vid]: { ...(v.pos[vid] ?? { t: 0 }), done: true } }, byCourse: { ...(v.byCourse ?? {}), [item.id]: [...new Set([...(v.byCourse?.[item.id] ?? []), vid])] } }));
    onWatched();
  };

  useEffect(() => {
    if (!vid || !host.current) return;
    setDone(!!vs.pos[vid]?.done); setNote(vs.notes[vid] ?? ''); setHabitMsg('');
    setVs((v) => ({ ...v, last: { item: item.id, v: vid } }));
    let live = true;
    let timer: number | undefined;
    const save = () => {
      const p = player.current;
      if (!p?.getCurrentTime) return;
      const t = p.getCurrentTime(), d = p.getDuration?.() || 0;
      setVs((v) => ({ ...v, pos: { ...v.pos, [vid]: { ...(v.pos[vid] ?? {}), t, d } } }));
    };
    loadYT().then((YT) => {
      if (!live || !host.current) return;
      const el = document.createElement('div');
      host.current.innerHTML = ''; host.current.appendChild(el);
      const start = vs.pos[vid]?.done ? 0 : Math.floor(vs.pos[vid]?.t ?? 0);
      player.current = new YT.Player(el, {
        host: 'https://www.youtube-nocookie.com',
        videoId: vid,
        playerVars: { start, rel: 0, modestbranding: 1, playsinline: 1, hl: 'ru', cc_lang_pref: 'ru' },
        events: {
          onStateChange: (e: any) => {
            if (e.data === 1) { clearInterval(timer); timer = window.setInterval(save, 5000); }
            if (e.data === 2) { clearInterval(timer); save(); }
            if (e.data === 0) { clearInterval(timer); save(); markDone(); }
          },
        },
      });
    });
    return () => { live = false; clearInterval(timer); save(); try { player.current?.destroy?.(); } catch { /* */ } player.current = null; };
  }, [vid]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSpeed = (r: number) => { setRate(r); try { player.current?.setPlaybackRate(r); } catch { /* */ } };
  const saveNote = (t: string) => { setNote(t); if (vid) setVs((v) => ({ ...v, notes: { ...v.notes, [vid]: t } })); };
  const actDone = vid ? vs.acts?.[vid] : undefined;
  const tickAct = () => { if (vid) setVs((v) => ({ ...v, acts: { ...(v.acts ?? {}), [vid]: today() } })); };
  const makeHabit = () => {
    if (!lp?.act) return;
    const r = onHabit(lp.act);
    setHabitMsg(r === 'active' ? _t("Добавил в привычки, после Иши. Время можно поменять в «Сегодня».") : r === 'queued' ? _t("Привычка встала в очередь: сейчас занято 5 мест.") : _t("Такая привычка уже есть."));
  };
  // What comes after this lesson: the module's test, the next lesson or the final test.
  const quizHere = done && mod?.quiz && idx === mod.to - 1 && !mod.passed;
  const isLast = idx + 1 >= items.length;

  return (
    <div className="page vids vplayer">
      <div className="vframe"><div ref={host} />{!lesson && <span className="vload">{err ? _t("Не получилось загрузить видео") : _t("Загружаю…")}</span>}</div>
      <button type="button" className="link-btn pro-back" onClick={onBack}>← {item.kind === 'list' ? item.title : _t("Курсы")}</button>
      {lesson && <small className="cs-kick">{mod?.title ? _t("Модуль {0} · ", mod.i + 1) : ''}{items.length > 1 ? _t("урок {0} из {1}", idx + 1, items.length) : ''}</small>}
      {lesson && <h1 className="page-h sm">{lesson.title}</h1>}
      <div className="vspeed">
        {[1, 1.25, 1.5, 2].map((r) => <button key={r} type="button" aria-pressed={rate === r} onClick={() => setSpeed(r)}>{r}×</button>)}
      </div>

      {lp?.sum?.filter((x) => x.trim()).length ? (
        <div className="cs-box">
          <b>{_t("Главные мысли")}</b>
          <ol className="cs-sum">{lp.sum.filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      ) : null}
      {lp?.ask?.trim() && <div className="cs-box gold"><small>{_t("Вопрос себе")}</small><p>{lp.ask}</p></div>}

      <label className="field">
        <span>{_t("Моя заметка")}</span>
        <textarea className="io" rows={4} value={note} onChange={(e) => saveNote(e.target.value)} placeholder={lp?.ask?.trim() ? _t("Мой ответ на вопрос, главная мысль…") : _t("Главная мысль урока, что сделаю сегодня…")} />
        <small className="tiny">{_t("Все заметки собираются в «Мой конспект» курса.")}</small>
      </label>

      {lp?.act?.trim() && (
        <div className="cs-box act">
          <small>{_t("Практика на сегодня")}</small>
          <p>{lp.act}</p>
          <div className="cs-row">
            {actDone ? <span className="vdone">{_t("✓ Сделано")}</span> : <button type="button" className="pri-btn" onClick={tickAct}>{_t("Сделал")}</button>}
            <button type="button" className="ghost-btn" onClick={makeHabit}>{_t("Сделать привычкой")}</button>
          </div>
          {habitMsg && <p className="tiny">{habitMsg}</p>}
        </div>
      )}

      {done ? (
        <p className="vdone">{_tj("✓ Урок пройден{0}", habitName ? _t(" · привычка «{0}» отмечена", habitName) : '')}</p>
      ) : (
        <button type="button" className="pri-btn big-btn" onClick={markDone} disabled={!lesson}>{_t("✓ Урок пройден")}</button>
      )}
      {quizHere ? <button type="button" className="pri-btn big-btn" onClick={() => onQuiz(mod!.i)}>{_t("Мини-тест модуля {0} →", mod!.i + 1)}</button>
        : !isLast ? <button type="button" className={done ? 'pri-btn big-btn' : 'ghost-btn'} onClick={() => onIdx(idx + 1)}>{_t("Следующий урок →")}</button>
        : done && final.length ? <button type="button" className="pri-btn big-btn" onClick={() => onQuiz('f')}>{_t("Итоговый тест →")}</button>
        : done ? <button type="button" className="ghost-btn" onClick={onBack}>{_t("К курсу")}</button> : null}
      {idx > 0 && <button type="button" className="link-btn" onClick={() => onIdx(idx - 1)}>{_t("← Предыдущий урок")}</button>}
    </div>
  );
}

function AddVideo({ onBack, onAdd }: { onBack: () => void; onAdd: (it: VideoItem) => void }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState<null | { kind: 'list' | 'video'; id: string; title: string; channel: string; count: number; first?: string }>(null);
  const [cat, setCat] = useState<VideoCat>('mind');

  const check = async () => {
    const p = parseYouTube(link);
    setFound(null); setErr('');
    if (!p) return setErr(_t("Это не похоже на ссылку YouTube. Скопируй адрес видео или плейлиста."));
    setBusy(true);
    try { setFound({ ...p, ...(await lookup(p)) }); } catch { setErr(_t("Не нашёл такое видео. Возможно, оно закрыто или удалено.")); }
    setBusy(false);
  };

  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Курсы")}</button>
      <h1 className="page-h">{_t("Добавить своё видео")}</h1>
      <p className="page-sub">{_t("Видео или целый плейлист с YouTube. Видно только тебе.")}</p>
      <label className="field">
        <span>{_t("Ссылка")}</span>
        <input value={link} onChange={(e) => { setLink(e.target.value); setFound(null); }} onBlur={() => link.trim() && !found && check()} placeholder={_t("youtube.com/playlist?list=… или youtu.be/…")} inputMode="url" />
      </label>
      {!found && <button type="button" className="ghost-btn" disabled={busy || !link.trim()} onClick={check}>{busy ? _t("Ищу…") : _t("Найти")}</button>}
      {err && <p className="warn">{err}</p>}
      {found && (
        <>
          <div className="vcont static">
            <span className="vth" style={found.first ? { backgroundImage: `url(${thumb(found.first)})` } : undefined}>{found.kind === 'list' && <i className="vdur">{_tj("{0} видео", found.count)}</i>}</span>
            <span className="vci"><small>{_t("Найдено на YouTube")}</small><b>{found.title}</b><em>{found.kind === 'list' ? _t("Плейлист · {0} видео", found.count) : _t("Видео")}{found.channel ? ` · ${found.channel}` : ''}</em></span>
          </div>
          <div className="field"><span>{_t("Вкладка")}</span></div>
          <div className="vchips">
            {VIDEO_CATS.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.ic} {c.ru}</button>)}
          </div>
          <button type="button" className="pri-btn big-btn" onClick={() => onAdd({ kind: found.kind, id: found.id, cat, title: found.title, channel: found.channel, count: found.count, mine: true })}>
            {found.kind === 'list' ? _t("Добавить как курс") : _t("Добавить видео")}
          </button>
        </>
      )}
    </div>
  );
}
