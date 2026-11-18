import { useEffect, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { ProGate } from './Plan';
import { limitOf } from '../plan';
import {
  catalog, catOf, dur, emptyVideos, lessons, loadCourses, lookup, parseYouTube, thumb, VIDEO_CATS,
  type Lesson, type VideoCat, type VideoItem, type VideoState,
} from '../videos';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
  /** Course id to open right away (from a goal). */
  open?: string;
}

type View = { page: 'home' } | { page: 'item'; item: VideoItem } | { page: 'play'; item: VideoItem; idx: number } | { page: 'add' };

const MAIN: VideoCat[] = ['faith', 'biz', 'mind'];

export function Videos({ state, update, habitName, onExit, onFinish, open }: Props) {
  const vs = state.videos ?? emptyVideos();
  const setVs = (fn: (v: VideoState) => VideoState) => update((s) => ({ ...s, videos: fn(s.videos ?? emptyVideos()) }));
  const [view, setView] = useState<View>(() => {
    const it = open ? [...vs.mine, ...catalog()].find((x) => x.id === open) : undefined;
    return it ? { page: 'item', item: it } : { page: 'home' };
  });
  const [cat, setCat] = useState<VideoCat | 'all'>('all');
  const [more, setMore] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { loadCourses().then((ch) => { if (ch) setTick((n) => n + 1); }); }, []);
  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };

  const all = [...vs.mine, ...catalog()];
  const findItem = (id: string) => all.find((x) => x.id === id);

  if (view.page === 'add') return <AddVideo onBack={() => go({ page: 'home' })} onAdd={(it) => { setVs((v) => ({ ...v, mine: [it, ...v.mine.filter((x) => x.id !== it.id)] })); go({ page: 'item', item: it }); }} />;
  if (view.page === 'item') return <Course item={view.item} vs={vs} setVs={setVs} onBack={() => go({ page: 'home' })} onPlay={(idx) => go({ page: 'play', item: view.item, idx })} />;
  if (view.page === 'play') {
    return (
      <Player
        item={view.item} idx={view.idx} vs={vs} setVs={setVs} habitName={habitName}
        onBack={() => go(view.item.kind === 'list' ? { page: 'item', item: view.item } : { page: 'home' })}
        onIdx={(idx) => go({ page: 'play', item: view.item, idx })}
        onWatched={() => onFinish('done')}
      />
    );
  }

  const inCat = (x: VideoItem) => cat === 'all' || x.cat === cat;
  const courses = catalog().filter((x) => x.kind === 'list' && inCat(x));
  const singles = catalog().filter((x) => x.kind === 'video' && inCat(x));
  const mine = vs.mine.filter(inCat);
  const last = vs.last && findItem(vs.last.item);
  const lastPos = vs.last ? vs.pos[vs.last.v] : undefined;

  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onExit}>← Практика</button>
      <h1 className="page-h">Видеоуроки</h1>
      <p className="page-sub">Только то, что ты выбрал. Без ленты рекомендаций.</p>

      {[MAIN, VIDEO_CATS.map((c) => c.id).filter((id) => !MAIN.includes(id))].map((ids, row) => (row === 1 && !more && !ids.includes(cat as VideoCat)) ? null : (
        <div key={row} className={`vtopics${row ? ' sm' : ''}`}>
          {VIDEO_CATS.filter((c) => ids.includes(c.id)).map((c) => {
            const n = all.filter((x) => x.cat === c.id).length;
            return (
              <button key={c.id} type="button" className="vtopic" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? 'all' : c.id)}>
                <i>{c.ic}</i><b>{c.ru}</b><small>{n} {n === 1 ? 'курс' : n < 5 ? 'курса' : 'курсов'}</small>
              </button>
            );
          })}
        </div>
      ))}
      <button type="button" className="vmore" onClick={() => setMore(!more)} aria-expanded={more}>
        {more ? 'Свернуть темы ▴' : `Ещё темы: ${VIDEO_CATS.filter((c) => !MAIN.includes(c.id)).map((c) => c.ru.toLowerCase()).join(', ')} ▾`}
      </button>
      {cat !== 'all' && <button type="button" className="link-btn vall" onClick={() => setCat('all')}>Показать все темы</button>}

      {last && vs.last && (
        <button type="button" className="vcont" onClick={() => {
          if (last.kind === 'video') return go({ page: 'play', item: last, idx: 0 });
          lessons(last).then((l) => go({ page: 'play', item: last, idx: Math.max(0, l.items.findIndex((x) => x.id === vs.last!.v)) })).catch(() => go({ page: 'item', item: last }));
        }}>
          <span className="vth" style={{ backgroundImage: `url(${thumb(vs.last.v)})` }}>
            <i className="vplay">▶</i>
            {lastPos?.d ? <i className="vbar" style={{ width: `${Math.min(100, (lastPos.t / lastPos.d) * 100)}%` }} /> : null}
          </span>
          <span className="vci"><small>Продолжить</small><b>{last.title}</b>{last.channel && <em>{last.channel}</em>}</span>
        </button>
      )}

      {courses.length > 0 && <h3 className="vh">Курсы</h3>}
      <div className="vgrid">{courses.map((x) => <Card key={x.id} item={x} vs={vs} onClick={() => go({ page: 'item', item: x })} />)}</div>

      {singles.length > 0 && <h3 className="vh">Отдельные видео</h3>}
      <div className="vgrid">{singles.map((x) => <Card key={x.id} item={x} vs={vs} onClick={() => go({ page: 'play', item: x, idx: 0 })} />)}</div>

      <h3 className="vh">Моё <button type="button" className="link-btn" onClick={() => go({ page: 'add' })}>+ Добавить</button></h3>
      {mine.length ? (
        <div className="vgrid">{mine.map((x) => <Card key={x.id} item={x} vs={vs} onClick={() => go(x.kind === 'list' ? { page: 'item', item: x } : { page: 'play', item: x, idx: 0 })} />)}</div>
      ) : (
        <button type="button" className="vempty" onClick={() => go({ page: 'add' })}>Вставь ссылку на видео или плейлист YouTube, который уже смотришь. Он появится здесь, с прогрессом и заметками.</button>
      )}
      <p className="tiny">Видео с YouTube принадлежат их авторам. Мы только собираем их в курсы и помогаем смотреть понемногу.</p>
    </div>
  );
}

function Card({ item, vs, onClick }: { item: VideoItem; vs: VideoState; onClick: () => void }) {
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
    <button type="button" className="vcard" onClick={onClick}>
      <span className="vth" style={first ? { backgroundImage: `url(${thumb(first)})` } : undefined}>
        {item.kind === 'list' && count > 0 && <i className="vdur">{count} {count === 1 ? 'урок' : count < 5 ? 'урока' : 'уроков'}</i>}
        {done > 0 && count > 0 && <i className="vbar" style={{ width: `${(done / count) * 100}%` }} />}
      </span>
      <b>{item.title}{item.pro && <span className="pro-badge sm">PRO</span>}</b>
      <small>{catOf(item.cat).ic} {item.channel}{item.lang === 'en' ? ' · EN' : ''}</small>
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

function Course({ item, vs, setVs, onBack, onPlay }: { item: VideoItem; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void; onBack: () => void; onPlay: (i: number) => void }) {
  const { data, err } = useLessons(item);
  const items = data?.items ?? [];
  const done = items.filter((x) => vs.pos[x.id]?.done).length;
  const next = Math.max(0, items.findIndex((x) => !vs.pos[x.id]?.done));
  const total = items.reduce((a, x) => a + x.seconds, 0);
  // Free plan: 3 started courses; the ones already started stay open.
  const started = new Set([...Object.entries(vs.byCourse ?? {}).filter(([, v]) => v.length).map(([k]) => k), ...(vs.started ?? [])]);
  const locked = !started.has(item.id) && started.size >= limitOf('courses');
  const [gate, setGate] = useState(false);
  const play = (i: number) => {
    if (locked) { setGate(true); return; }
    if (!started.has(item.id)) setVs((v) => ({ ...v, started: [...new Set([...(v.started ?? []), item.id])] }));
    onPlay(i);
  };
  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onBack}>← Видеоуроки</button>
      {items[0] && <div className="vth big" style={{ backgroundImage: `url(${thumb(items[0].id)})` }}><i className="vdur">{items.length} уроков{total ? ` · ${dur(total)}` : ''}</i></div>}
      <h1 className="page-h">{item.mine ? data?.title || item.title : item.title}</h1>
      {items.length > 0 && <div className="vprog"><i style={{ width: `${(done / items.length) * 100}%` }} /></div>}
      <p className="page-sub">{items.length ? `${done} из ${items.length} уроков · ` : ''}{catOf(item.cat).ic} {catOf(item.cat).ru}{data?.channel ? ` · ${data.channel}` : ''}</p>
      {item.note && <p className="tiny">{item.note}</p>}
      {(gate || (locked && !done)) && <ProGate k="courses" have={started.size} />}
      {items.length > 0 && <button type="button" className="pri-btn big-btn" onClick={() => play(next)}>{done ? (done === items.length ? 'Пересмотреть' : `Продолжить: урок ${next + 1}`) : 'Начать курс'}</button>}
      <p className="tiny">Чтобы урок стал привычкой, выбери привычку в Практике, например «Один урок после Иши». Просмотренный урок отметит её сам.</p>
      {err && <p className="warn">Не получилось загрузить уроки. Проверь интернет и открой курс ещё раз.</p>}
      {!data && !err && <p className="tiny">Загружаю уроки…</p>}
      <div className="vls">
        {items.map((x, i) => {
          const p = vs.pos[x.id];
          return (
            <button key={x.id} type="button" className={`vl${p?.done ? ' d' : ''}${i === next && !p?.done ? ' n' : ''}`} onClick={() => play(i)}>
              <i>{p?.done ? '✓' : i + 1}</i>
              <span><b>{x.title}</b><small>{x.seconds ? dur(x.seconds) : ''}{p && !p.done && p.t > 5 ? ` · остановился на ${dur(Math.floor(p.t))}` : ''}</small></span>
            </button>
          );
        })}
      </div>
      {item.mine && (
        <button type="button" className="link-btn" onClick={() => { if (confirm('Убрать этот курс из «Моё»? Прогресс просмотра сохранится.')) { setVs((v) => ({ ...v, mine: v.mine.filter((m) => m.id !== item.id) })); onBack(); } }}>Убрать из «Моё»</button>
      )}
    </div>
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

function Player({ item, idx, vs, setVs, habitName, onBack, onIdx, onWatched }: {
  item: VideoItem; idx: number; vs: VideoState; setVs: (fn: (v: VideoState) => VideoState) => void; habitName?: string;
  onBack: () => void; onIdx: (i: number) => void; onWatched: () => void;
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

  const markDone = () => {
    if (!vid) return;
    setDone(true);
    setVs((v) => ({ ...v, pos: { ...v.pos, [vid]: { ...(v.pos[vid] ?? { t: 0 }), done: true } }, byCourse: { ...(v.byCourse ?? {}), [item.id]: [...new Set([...(v.byCourse?.[item.id] ?? []), vid])] } }));
    onWatched();
  };

  useEffect(() => {
    if (!vid || !host.current) return;
    setDone(!!vs.pos[vid]?.done); setNote(vs.notes[vid] ?? '');
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

  return (
    <div className="page vids vplayer">
      <div className="vframe"><div ref={host} />{!lesson && <span className="vload">{err ? 'Не получилось загрузить видео' : 'Загружаю…'}</span>}</div>
      <button type="button" className="link-btn pro-back" onClick={onBack}>← {item.kind === 'list' ? item.title : 'Видеоуроки'}</button>
      {lesson && <h1 className="page-h sm">{items.length > 1 ? `Урок ${idx + 1}. ` : ''}{lesson.title}</h1>}
      <div className="vspeed">
        {[1, 1.25, 1.5, 2].map((r) => <button key={r} type="button" aria-pressed={rate === r} onClick={() => setSpeed(r)}>{r}×</button>)}
      </div>
      {done ? (
        <p className="vdone">✓ Урок просмотрен{habitName ? ` · привычка «${habitName}» отмечена` : ''}</p>
      ) : (
        <button type="button" className="pri-btn big-btn" onClick={markDone} disabled={!lesson}>✓ Отметить урок просмотренным</button>
      )}
      <label className="field">
        <span>Мои заметки</span>
        <textarea className="io" rows={4} value={note} onChange={(e) => saveNote(e.target.value)} placeholder="Главная мысль урока, что сделаю сегодня…" />
      </label>
      {idx + 1 < items.length && <button type="button" className="ghost-btn" onClick={() => onIdx(idx + 1)}>Следующий урок →</button>}
      {idx > 0 && <button type="button" className="link-btn" onClick={() => onIdx(idx - 1)}>← Предыдущий урок</button>}
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
    if (!p) return setErr('Это не похоже на ссылку YouTube. Скопируй адрес видео или плейлиста.');
    setBusy(true);
    try { setFound({ ...p, ...(await lookup(p)) }); } catch { setErr('Не нашёл такое видео. Возможно, оно закрыто или удалено.'); }
    setBusy(false);
  };

  return (
    <div className="page vids">
      <button type="button" className="link-btn pro-back" onClick={onBack}>← Видеоуроки</button>
      <h1 className="page-h">Добавить своё видео</h1>
      <p className="page-sub">Видео или целый плейлист с YouTube. Видно только тебе.</p>
      <label className="field">
        <span>Ссылка</span>
        <input value={link} onChange={(e) => { setLink(e.target.value); setFound(null); }} onBlur={() => link.trim() && !found && check()} placeholder="youtube.com/playlist?list=… или youtu.be/…" inputMode="url" />
      </label>
      {!found && <button type="button" className="ghost-btn" disabled={busy || !link.trim()} onClick={check}>{busy ? 'Ищу…' : 'Найти'}</button>}
      {err && <p className="warn">{err}</p>}
      {found && (
        <>
          <div className="vcont static">
            <span className="vth" style={found.first ? { backgroundImage: `url(${thumb(found.first)})` } : undefined}>{found.kind === 'list' && <i className="vdur">{found.count} видео</i>}</span>
            <span className="vci"><small>Найдено на YouTube</small><b>{found.title}</b><em>{found.kind === 'list' ? `Плейлист · ${found.count} видео` : 'Видео'}{found.channel ? ` · ${found.channel}` : ''}</em></span>
          </div>
          <div className="field"><span>Вкладка</span></div>
          <div className="vchips">
            {VIDEO_CATS.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.ic} {c.ru}</button>)}
          </div>
          <button type="button" className="pri-btn big-btn" onClick={() => onAdd({ kind: found.kind, id: found.id, cat, title: found.title, channel: found.channel, count: found.count, mine: true })}>
            {found.kind === 'list' ? 'Добавить как курс' : 'Добавить видео'}
          </button>
        </>
      )}
    </div>
  );
}
