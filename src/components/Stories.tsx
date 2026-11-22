// Stories in circles: the strip on the «Круги» list, the full-screen viewer, «Новая сторис» and «Кто посмотрел».
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from '../types';
import type { Member } from '../circle';
import { meRpc, myCircles, currentCircle } from '../cloud';
import { avatarUrl } from '../avatar';
import {
  achievements, agoOf, ayahCard, groupStories, reactText, shrinkStoryPhoto, STORY_REACTS,
  type Story, type StoryBg, type StoryCard, type StoryGroup, type StoriesApi, type StoryKind, type Viewer,
} from '../stories';
import { _t } from '../i18n';
import { Ic } from './LIcon';
import { plural } from '../dates';

type Names = Record<string, { name: string; avatarUrl: string; color: string; gender?: string } | undefined>;
const circleTitle = (code: string) => myCircles().find((c) => c.code === code)?.title ?? _t('Круг');
const picOf = (p: { avatar: Record<string, string> | null; color: string; pic: string }) => avatarUrl(p.avatar ?? undefined, p.avatar?.c || p.color, p.pic);

/** Back button closes an overlay: push a history entry while it is open. */
function useBackClose(open: boolean, close: () => void) {
  const cb = useRef(close); cb.current = close;
  useEffect(() => {
    if (!open) return;
    history.pushState({ lmStory: 1 }, '');
    const f = (e: Event) => { e.stopImmediatePropagation(); cb.current(); };
    window.addEventListener('popstate', f, true);
    return () => window.removeEventListener('popstate', f, true);
  }, [open]);
}

function Face({ name, color, url, size = 54 }: { name: string; color: string; url: string; size?: number }) {
  return url ? <img className="st-face" src={url} alt="" style={{ width: size, height: size }} />
    : <i className="st-face" style={{ width: size, height: size, background: color || '#1f7a4d' }}>{(name || '?').slice(0, 1).toUpperCase()}</i>;
}

/** The strip above the circle list: my stories (with ＋), people with stories, then the rest of the open circle. */
export function StoryStrip({ api, me, members, names, today, onPerson, onCreate, onView }: {
  api: StoriesApi; me: string | null; members: Member[]; names: Names; today: string;
  onPerson: (id: string) => void; onCreate: () => void; onView: (groups: StoryGroup[], i: number) => void;
}) {
  const groups = useMemo(() => groupStories(api.list, me), [api.list, me]);
  const byUid = new Map(groups.map((g) => [g.uid, g]));
  const others = groups.filter((g) => g.uid !== me);
  const mine = me ? byUid.get(me) : undefined;
  const rest = members.filter((m) => m.id !== me && !byUid.has(m.id));
  const dayOf = (id: string) => { const m = members.find((x) => x.id === id); return m && m.day === today ? m.prayers : null; };
  const badge = (id: string) => { const n = dayOf(id); return n === null ? null : <span className="st-pr">{n}/5</span>; };
  const meName = me ? names[me] : undefined;
  return (
    <div className="st-strip" aria-label={_t('Сторис')}>
      <button type="button" className="st-p" onClick={() => (mine ? onView(groups, 0) : onCreate())}>
        <span className={`st-ring ${mine ? (mine.unseen ? 'new' : 'seen') : 'none'}`}>
          <Face name={meName?.name || _t('Я')} color={meName?.color || '#11553a'} url={meName?.avatarUrl || ''} />
          {me && badge(me)}
        </span>
        <span className="st-plus" role="button" aria-label={_t('Новая сторис')} onClick={(e) => { e.stopPropagation(); onCreate(); }}>+</span>
        <small><b>{_t('Моя')}</b></small>
      </button>
      {others.map((g) => {
        const n = names[g.uid];
        return (
          <button key={g.uid} type="button" className="st-p" onClick={() => onView(groups, groups.indexOf(g))}>
            <span className={`st-ring ${g.unseen ? 'new' : 'seen'}`} style={{ ['--n' as string]: g.stories.length }}>
              <Face name={g.name} color={n?.color || g.color} url={n?.avatarUrl || picOf(g)} />
              {badge(g.uid)}
            </span>
            <small>{g.unseen ? <b>{g.name.split(' ')[0]}</b> : g.name.split(' ')[0]}</small>
          </button>
        );
      })}
      {rest.map((m) => {
        const n = names[m.id];
        return (
          <button key={m.id} type="button" className="st-p quiet" onClick={() => onPerson(m.id)}>
            <span className="st-ring plain"><Face name={n?.name || '?'} color={n?.color || '#1f7a4d'} url={n?.avatarUrl || ''} />{badge(m.id)}</span>
            <small>{(n?.name || _t('Участник')).split(' ')[0]}</small>
          </button>
        );
      })}
    </div>
  );
}

/** The card itself: achievement, text on the pattern, ayah, or a photo. */
export function StoryFace({ s, photo }: { s: Pick<Story, 'kind' | 'body' | 'card' | 'thumb'>; photo?: string }) {
  const c = s.card ?? {};
  if (s.kind === 'photo') {
    return (
      <div className="st-card photo" style={{ backgroundImage: `url(${photo || s.thumb || ''})` }}>
        {!photo && <span className="st-wait" aria-hidden="true" />}
        {s.body && <p className="st-cap">{s.body}</p>}
      </div>
    );
  }
  return (
    <div className={`st-card bg-${c.bg || 'green'} k-${s.kind}`}>
      <i className="st-pat" aria-hidden="true" />
      <i className="st-arch" aria-hidden="true" />
      <div className="st-in">
        {s.kind === 'text' ? <p className="st-text">{s.body}</p> : <>
          {c.ic && <span className="st-ic"><Ic e={c.ic} /></span>}
          {c.ar && <p className="st-ar" dir="rtl" lang="ar">{c.ar}</p>}
          {c.t && <h3>{c.t}</h3>}
          {c.s && <span className="st-tag">{c.s}</span>}
        </>}
      </div>
      {s.kind !== 'text' && s.body && <p className="st-cap">{s.body}</p>}
    </div>
  );
}

const SEC = 6000;
/** Full screen, author by author. Tap right: next, left: back; hold: pause. Answers go to the circle chat. */
export function StoryViewer({ groups, start, api, me, onClose, onCreate }: {
  groups: StoryGroup[]; start: number; api: StoriesApi; me: string | null; onClose: () => void; onCreate: () => void;
}) {
  // the list can change while watching; keep the groups as they were when opened
  const [gs] = useState(groups);
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => { const g = groups[start]; const k = g?.stories.findIndex((s) => !s.seen) ?? 0; return g?.uid !== me && k > 0 ? k : 0; });
  const [paused, setPaused] = useState(false);
  const [t0, setT0] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [photo, setPhoto] = useState('');
  const g = gs[gi];
  const s = g?.stories[si];
  const mine = s?.uid === me;
  const cur = s ? api.list.find((x) => x.id === s.id) ?? s : null;
  const hold = paused || menu || sheet || text.length > 0;
  useBackClose(true, onClose);

  useEffect(() => { if (s && !mine && !s.seen) api.seen(s.id); }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPhoto('');
    if (s?.kind === 'photo') { let on = true; api.photoUrl(s.id).then((u) => { if (on) setPhoto(u); }); return () => { on = false; }; }
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const elapsed = useRef(0);
  useEffect(() => { elapsed.current = 0; setT0(Date.now()); }, [gi, si]);
  useEffect(() => {
    if (hold) { elapsed.current += Date.now() - t0; return; }
    setT0(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [hold]); // eslint-disable-line react-hooks/exhaustive-deps
  const frac = hold ? elapsed.current / SEC : Math.min(1, (elapsed.current + now - t0) / SEC);
  const close = () => history.back();
  const next = () => {
    if (!g) return;
    if (si + 1 < g.stories.length) setSi(si + 1);
    else if (gi + 1 < gs.length) { setGi(gi + 1); const ng = gs[gi + 1]; const k = ng.stories.findIndex((x) => !x.seen); setSi(ng.uid !== me && k > 0 ? k : 0); }
    else close();
  };
  const prev = () => { if (si > 0) setSi(si - 1); else if (gi > 0) { setGi(gi - 1); setSi(0); } };
  useEffect(() => { if (!hold && frac >= 1) next(); }, [frac >= 1]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!g || !s || !cur) return null;

  // the answer goes to the chat of a circle we share (the open one when it is among them)
  const code = (() => { const c = currentCircle()?.code; return c && cur.in.includes(c) ? c : cur.in[0]; })();
  const say = async (body: string, react?: string) => {
    if (react !== undefined) api.seen(s.id, react);
    if (react !== undefined && cur.react === react) return; // taking the answer back: nothing to post
    const ok = await meRpc<{ id?: number; error?: string }>('lm_chat_send', {
      p_code: code, p_body: body, p_kind: 'text',
      p_ref: { t: 'st', to: s.uid, k: (s.card?.t || s.body || (s.kind === 'photo' ? _t('фото') : '')).slice(0, 60), n: s.card?.ic || (s.kind === 'photo' ? '📷' : '✍️') },
    }).catch(() => null);
    setNote(ok && !ok.error ? _t('Отправлено в чат «{0}»', circleTitle(code)) : _t('Не отправилось. Проверь интернет.'));
    setTimeout(() => setNote(''), 2500);
  };
  const tap = (e: React.MouseEvent) => {
    if (menu || sheet) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) prev(); else next();
  };
  const face = picOf(g);
  return (
    <div className="st-view" role="dialog" aria-label={_t('Сторис {0}', g.name)}>
      <div className="st-bars">{g.stories.map((x, i) => <span key={x.id}><i style={{ width: `${i < si ? 100 : i === si ? frac * 100 : 0}%` }} /></span>)}</div>
      <div className="st-who">
        <Face name={g.name} color={g.color} url={face} size={36} />
        <div><b>{mine ? _t('Моя сторис') : g.name}</b><small>{agoOf(s.at)} · {cur.in.map((c) => `«${circleTitle(c)}»`).join(', ')}</small></div>
        <button type="button" aria-label={_t('Ещё')} onClick={() => setMenu(true)}>⋯</button>
        <button type="button" aria-label={_t('Закрыть')} onClick={close}>✕</button>
      </div>
      <div className="st-stage" onClick={tap} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
        <StoryFace s={cur} photo={photo} />
      </div>
      {note && <div className="st-note">{note}</div>}
      {mine ? (
        <div className="st-foot">
          <button type="button" className="st-views" onClick={() => setSheet(true)}><Ic e="views" cls="lead" />{_t('Посмотрели: {0}', cur.views ?? 0)}</button>
          <button type="button" className="st-views" onClick={onCreate}>＋ {_t('Ещё сторис')}</button>
        </div>
      ) : (
        <>
          <div className="st-reac">
            {STORY_REACTS.map((r) => <button key={r.e} type="button" className={cur.react === reactText(r) ? 'on' : ''} onClick={() => say(reactText(r), reactText(r))}>{reactText(r)}</button>)}
          </div>
          <form className="st-rep" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); say(t); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={_t('Ответить в чат круга…')} maxLength={500} />
            <button type="submit" aria-label={_t('Отправить')} disabled={!text.trim()}><Ic e="send" /></button>
          </form>
        </>
      )}
      <p className="st-priv">{_t('Видят только участники: {0} · исчезнет через {1} ч', cur.in.map((c) => `«${circleTitle(c)}»`).join(', '), Math.max(1, 24 - Math.floor((Date.now() - Date.parse(s.at)) / 3600000)))}</p>
      {menu && <StoryMenu s={cur} mine={mine} api={api} onClose={() => setMenu(false)} onGone={() => { setMenu(false); next(); }} />}
      {sheet && <ViewersSheet s={cur} api={api} onClose={() => setSheet(false)} onGone={() => { setSheet(false); next(); }} />}
    </div>
  );
}

function StoryMenu({ s, mine, api, onClose, onGone }: { s: Story; mine: boolean; api: StoriesApi; onClose: () => void; onGone: () => void }) {
  const [done, setDone] = useState('');
  return (
    <div className="st-menu" onClick={onClose}>
      <div className="st-sheet" onClick={(e) => e.stopPropagation()}>
        <i className="st-grab" />
        {done ? <p className="st-done">{done}</p> : mine ? (
          <button type="button" onClick={async () => { if (!confirm(_t('Удалить сторис?'))) return; await api.remove(s.id); onGone(); }}><Ic e="trash" cls="lead" />{_t('Удалить')}</button>
        ) : (
          <>
            <button type="button" onClick={async () => { const ok = await api.report(s.id, _t('неуместно')); setDone(ok ? _t('Спасибо. Жалоба ушла владельцу приложения.') : _t('Не получилось. Попробуй ещё раз.')); }}><Ic e="flag" cls="lead" />{_t('Пожаловаться')}</button>
            <button type="button" onClick={async () => { if (!confirm(_t('Убрать эту сторис из кругов, где ты владелец?'))) return; if (await api.remove(s.id)) onGone(); else setDone(_t('Убрать чужую сторис может только владелец круга.')); }}>🗑 {_t('Убрать из моего круга')}</button>
          </>
        )}
        <button type="button" className="quiet" onClick={onClose}>{_t('Закрыть')}</button>
      </div>
    </div>
  );
}

/** My story: who saw it and what they answered; delete; share to the circle chat. */
function ViewersSheet({ s, api, onClose, onGone }: { s: Story; api: StoriesApi; onClose: () => void; onGone: () => void }) {
  const [list, setList] = useState<Viewer[] | null>(null);
  const [tab, setTab] = useState<'all' | 'ans'>('all');
  const [note, setNote] = useState('');
  useEffect(() => { api.viewers(s.id).then(setList); }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ans = (list ?? []).filter((v) => v.react);
  const shown = tab === 'all' ? list ?? [] : ans;
  const toChat = async () => {
    const body = [s.card?.ic, s.card?.t, s.body].filter(Boolean).join(' ') || _t('Моя сторис');
    const r = await Promise.all(s.in.map((c) => meRpc<{ error?: string }>('lm_chat_send', { p_code: c, p_body: body.slice(0, 500), p_kind: 'text' }).catch(() => null)));
    setNote(r.every((x) => x && !x.error) ? _t('Отправлено в чат') : _t('Не отправилось. Проверь интернет.'));
  };
  return (
    <div className="st-menu" onClick={onClose}>
      <div className="st-sheet tall" onClick={(e) => e.stopPropagation()}>
        <i className="st-grab" />
        <div className="st-tabs">
          <button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}><Ic e="views" cls="lead" />{_t('Посмотрели {0}', list?.length ?? '…')}</button>
          <button type="button" aria-pressed={tab === 'ans'} onClick={() => setTab('ans')}><Ic e="chat" cls="lead" />{_t('Ответы {0}', ans.length)}</button>
        </div>
        <div className="st-vlist">
          {list === null ? <p className="tiny">{_t('Загружаю…')}</p> : !shown.length ? <p className="tiny">{tab === 'all' ? _t('Пока никто не смотрел') : _t('Пока без ответов')}</p>
            : shown.map((v) => (
              <div key={v.uid} className="st-vr">
                <Face name={v.name} color={v.color} url={picOf(v)} size={38} />
                <div><b>{v.name || _t('Участник')}</b><small>{agoOf(v.at)}</small></div>
                <span>{v.react || <small>{_t('посмотрел')}</small>}</span>
              </div>
            ))}
        </div>
        {note && <p className="st-done">{note}</p>}
        <div className="st-acts">
          <button type="button" onClick={async () => { if (!confirm(_t('Удалить сторис?'))) return; await api.remove(s.id); onGone(); }}><b><Ic e="trash" /></b>{_t('Удалить')}</button>
          <button type="button" onClick={toChat}><b>↗</b>{_t('В чат круга')}</button>
          <button type="button" onClick={onClose}><b><Ic e="close" /></b>{_t('Закрыть')}</button>
        </div>
      </div>
    </div>
  );
}

const BGS: StoryBg[] = ['green', 'night', 'dawn', 'sand'];
const MIXED_OK = new Set(['sisters', 'family']);

/** «Новая сторис»: from what you already did, a photo, a few words, or an ayah. Then: which circles see it. */
export function StoryCreate({ state, today, api, me, names, onClose }: {
  state: AppState; today: string; api: StoriesApi; me: string | null; names: Names; onClose: () => void;
}) {
  useBackClose(true, onClose);
  const circles = myCircles();
  const sister = (me && names[me]?.gender) === 'f';
  const achs = useMemo(() => achievements(state, today), [state, today]);
  const [kind, setKind] = useState<StoryKind>(achs.length ? 'ach' : 'text');
  const [ai, setAi] = useState(0);
  const [ay, setAy] = useState(0);
  const [text, setText] = useState('');
  const [cap, setCap] = useState('');
  const [bg, setBg] = useState<StoryBg>('green');
  const [ph, setPh] = useState<Awaited<ReturnType<typeof shrinkStoryPhoto>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cur = currentCircle()?.code;
  const okFor = (code: string) => !(sister && kind === 'photo') || MIXED_OK.has(circles.find((c) => c.code === code)?.kind ?? '');
  const [pick, setPick] = useState<Record<string, boolean>>(() => Object.fromEntries(circles.map((c) => [c.code, c.code === cur || circles.length <= 3])));
  // a sister's photo goes only to sisters' and family circles unless she ticks another herself
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const on = (code: string) => (touched[code] ? !!pick[code] : !!pick[code] && okFor(code));
  const chosen = circles.filter((c) => on(c.code)).map((c) => c.code);
  const close = () => history.back();

  const card: StoryCard = kind === 'ach' ? achs[ai] ?? {} : kind === 'ayah' ? ayahCard(today, ay) : kind === 'text' ? { bg } : {};
  const body = kind === 'text' ? text.trim() : cap.trim();
  const ready = chosen.length > 0 && (kind === 'photo' ? !!ph : kind === 'text' ? !!text.trim() : kind === 'ach' ? !!achs[ai] : true);
  const share = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const r = await api.add(kind, body, card, chosen, kind === 'photo' && ph ? ph : undefined);
    setBusy(false);
    if (!r) { close(); return; }
    setErr(r === 'day' ? _t('Не больше 10 сторис за сутки.') : r === 'big' ? _t('Фото слишком большое.') : _t('Не получилось. Проверь интернет и попробуй ещё раз.'));
  };
  const TYPES: { k: StoryKind; ic: string; t: string; s: string }[] = [
    { k: 'ach', ic: 'achieve', t: _t('Достижение'), s: _t('серия, цель, намазы') },
    { k: 'photo', ic: 'camera', t: _t('Фото'), s: _t('мечеть, ифтар, дорога') },
    { k: 'text', ic: 'pattern-text', t: _t('Текст на узоре'), s: _t('мысль, напоминание') },
    { k: 'ayah', ic: 'khatm', t: _t('Аят'), s: _t('с переводом') },
  ];
  return (
    <div className="st-new" role="dialog" aria-label={_t('Новая сторис')}>
      <div className="st-hd"><button type="button" aria-label={_t('Закрыть')} onClick={close}>✕</button><b>{_t('Новая сторис')}</b></div>
      <div className="st-body">
        <div className="st-types">
          {TYPES.map((x) => (
            <button key={x.k} type="button" aria-pressed={kind === x.k} onClick={() => { setKind(x.k); if (x.k === 'photo' && !ph) fileRef.current?.click(); }}>
              <span><Ic e={x.ic} /></span><b>{x.t}</b><small>{x.s}</small>
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try { setPh(await shrinkStoryPhoto(f)); } catch { setErr(_t('Не получилось открыть фото.')); }
        }} />

        <p className="st-lbl">{_t('Что получится')}</p>
        <div className="st-prev">
          {kind === 'photo' && !ph ? <button type="button" className="st-pick" onClick={() => fileRef.current?.click()}><Ic e="camera" cls="lead" />{_t('Выбрать фото')}</button>
            : kind === 'ach' && !achs.length ? <p className="st-empty">{_t('Пока нечем поделиться. Отметь намазы или шаг цели, и здесь появятся готовые карточки.')}</p>
            : <StoryFace s={{ kind, body, card, thumb: null }} photo={ph?.url} />}
        </div>
        {kind === 'ach' && achs.length > 1 && (
          <div className="st-chips">{achs.map((a, i) => <button key={i} type="button" aria-pressed={ai === i} onClick={() => setAi(i)}><Ic e={a.ic} cls="lead" />{a.t}</button>)}</div>
        )}
        {kind === 'ayah' && <button type="button" className="link-btn" onClick={() => setAy(ay + 1)}>↻ {_t('Другой аят')}</button>}
        {kind === 'photo' && ph && <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>↻ {_t('Другое фото')}</button>}
        {kind === 'text' ? (
          <>
            <textarea className="st-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} placeholder={_t('Пара слов для круга…')} />
            <div className="st-bgs">{BGS.map((b) => <button key={b} type="button" className={`bg-${b}`} aria-pressed={bg === b} aria-label={b} onClick={() => setBg(b)} />)}</div>
          </>
        ) : (kind !== 'ach' || achs.length > 0) && (
          <input className="st-input" value={cap} onChange={(e) => setCap(e.target.value)} maxLength={200} placeholder={_t('Подпись (можно без неё)')} />
        )}

        <p className="st-lbl">{_t('Кому показать')}</p>
        {circles.map((c) => {
          const n = !okFor(c.code);
          return (
            <label key={c.code} className="st-ck">
              <input type="checkbox" checked={on(c.code)} onChange={(e) => { setPick({ ...pick, [c.code]: e.target.checked }); setTouched({ ...touched, [c.code]: true }); }} />
              <span>{c.title}</span>
              {n && <small className="st-lock">{_t('фото сестёр сюда не идёт само')}</small>}
            </label>
          );
        })}
        {sister && kind === 'photo' && <p className="st-hint">{_t('Фото сестры по умолчанию видят только круги сестёр и семьи. Другой круг можно отметить самой.')}</p>}
        {kind === 'photo' && <p className="st-hint">{_t('Скриншот запретить нельзя: показывай только то, что не жалко показать.')}</p>}
        <p className="st-hint">⏱ {_t('Исчезнет через 24 часа · без музыки и лайков')}</p>
        {err && <p className="st-err">{err}</p>}
      </div>
      <button type="button" className="st-go" disabled={!ready || busy} onClick={share}>
        {busy ? _t('Отправляю…') : chosen.length ? _t('Поделиться: {0}', `${chosen.length} ${plural(chosen.length, _t('круг'), _t('круга'), _t('кругов'))}`) : _t('Выбери круг')}
      </button>
    </div>
  );
}

/** A gentle nudge on the list when something worth sharing happened today (can be turned off). */
export function StoryNudge({ state, today, api, me, onCreate }: { state: AppState; today: string; api: StoriesApi; me: string | null; onCreate: () => void }) {
  const key = `lm.stNudge.${today}`;
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem(key) || localStorage.getItem('lm.stNudge.off') === '1'; } catch { return false; } });
  const a = useMemo(() => achievements(state, today)[0], [state, today]);
  const postedToday = api.list.some((s) => s.uid === me);
  if (hidden || !a || postedToday) return null;
  const hide = (all: boolean) => { try { localStorage.setItem(all ? 'lm.stNudge.off' : key, '1'); } catch { /* */ } setHidden(true); };
  return (
    <div className="st-nudge">
      <button type="button" className="st-nudge-go" onClick={onCreate}><span><Ic e={a.ic} /></span><span><b>{a.t}</b><small>{_t('Поделиться с кругом?')}</small></span></button>
      <button type="button" className="st-nudge-x" aria-label={_t('Не сейчас')} onClick={() => hide(false)}>✕</button>
      <button type="button" className="link-btn st-nudge-off" onClick={() => hide(true)}>{_t('Не предлагать')}</button>
    </div>
  );
}

export type { Story };
