import { useEffect, useState } from 'react';
import { accessToken } from '../auth';
import {
  builtInIds, catalog, catOf, loadCourses, lookup, parseYouTube, remoteCourses, setRemoteCourses, thumb, VIDEO_CATS,
  type CourseRow, type VideoCat, type VideoItem,
} from '../videos';

// Owner screen: add YouTube courses to «Видеоуроки», change their title or category, hide or bring them back.
// Writes go through lm_course_save / lm_course_delete, which check the owner's email on the server (courses.sql).

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const t = await accessToken();
  if (!t) throw new Error('Войди по почте владельца');
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) {
    let m = ''; try { const j = await r.json(); m = j.message || ''; } catch { /* */ }
    if (r.status === 404 || /lm_course/.test(m)) throw new Error('В базе ещё нет таблицы курсов: запусти courses.sql в Supabase');
    throw new Error(m || `ошибка ${r.status}`);
  }
  return (await r.json()) as T;
}

interface Draft { kind: 'list' | 'video'; yt: string; cat: VideoCat; title: string; channel: string; lang: 'ru' | 'en'; note: string; count?: number; first?: string; hidden?: boolean }
const toDraft = (x: VideoItem, hidden = false): Draft => ({ kind: x.kind, yt: x.id, cat: x.cat, title: x.title, channel: x.channel ?? '', lang: x.lang ?? 'ru', note: x.note ?? '', hidden });

export function AdminCourses() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [, setTick] = useState(0);
  const [cat, setCat] = useState<VideoCat | 'all'>('all');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [msg, setMsg] = useState('');
  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    fetch(`${SB}/rest/v1/lm_courses?select=yt&limit=1`, { headers: { apikey: KEY } }).then((r) => setReady(r.ok)).catch(() => setReady(false));
    loadCourses(true).then(refresh);
  }, []);

  const rows = remoteCourses();
  const rowOf = (yt: string) => rows.find((r) => r.yt === yt);
  const builtIn = builtInIds();
  const list = catalog(true).filter((x) => cat === 'all' || x.cat === cat);

  const save = async (d: Draft, hidden = d.hidden ?? false) => {
    setMsg('');
    const p = { kind: d.kind, yt: d.yt, cat: d.cat, title: d.title.trim(), channel: d.channel.trim(), lang: d.lang, note: d.note.trim(), hidden };
    const saved = await rpc<CourseRow>('lm_course_save', { p });
    setRemoteCourses([saved, ...rows.filter((r) => r.yt !== saved.yt)]);
    refresh();
    return saved;
  };
  const toggle = async (x: VideoItem) => {
    const r = rowOf(x.id);
    try { await save(toDraft(x, !r?.hidden), !r?.hidden); setMsg(!r?.hidden ? `«${x.title}» скрыт у всех` : `«${x.title}» снова виден всем`); } catch (e) { setMsg(String(e instanceof Error ? e.message : e)); }
  };
  const remove = async (x: VideoItem) => {
    const isBuilt = builtIn.has(x.id);
    if (!confirm(isBuilt ? `Вернуть «${x.title}» как было в стандартном списке?` : `Удалить «${x.title}» из видеоуроков у всех?`)) return;
    try { await rpc('lm_course_delete', { p_yt: x.id }); setRemoteCourses(rows.filter((r) => r.yt !== x.id)); refresh(); setMsg(isBuilt ? 'Вернул как было' : 'Удалено'); } catch (e) { setMsg(String(e instanceof Error ? e.message : e)); }
  };

  if (edit) return <CourseForm d={edit} isNew={!catalog(true).some((x) => x.id === edit.yt)} onBack={() => setEdit(null)} onSave={async (d) => { await save(d); setEdit(null); setMsg(`Сохранено: «${d.title}». У всех появится в течение получаса, у тебя сразу.`); }} />;

  return (
    <div className="ac">
      {ready === false && <div className="warn">Чтобы добавлять курсы, один раз запусти <b>courses.sql</b> в Supabase (SQL Editor → вставить → Run). Пока видно только стандартный список.</div>}
      <button type="button" className="pri-btn big-btn" disabled={ready === false} onClick={() => setEdit({ kind: 'list', yt: '', cat: cat === 'all' ? 'faith' : cat, title: '', channel: '', lang: 'ru', note: '' })}>+ Добавить курс с YouTube</button>
      {msg && <p className="ac-msg">{msg}</p>}
      <div className="chips-row ac-cats">
        <button type="button" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>Все</button>
        {VIDEO_CATS.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.ic} {c.ru}</button>)}
      </div>
      <p className="tiny">{list.length} {list.length === 1 ? 'курс' : 'курсов'} · ✎ изменить, 👁 скрыть или показать</p>
      <div className="ac-list">
        {list.map((x) => {
          const r = rowOf(x.id), hidden = Boolean(r?.hidden), mine = !builtIn.has(x.id);
          return (
            <div key={x.id} className={`ac-row${hidden ? ' off' : ''}`}>
              <span className="ac-ic">{catOf(x.cat).ic}</span>
              <span className="ac-t"><b>{x.title}</b><small>{x.channel || 'YouTube'} · {x.lang === 'en' ? 'EN' : 'RU'}{mine ? ' · добавлен тобой' : r ? ' · изменён' : ''}{hidden ? ' · скрыт' : ''}</small></span>
              <button type="button" aria-label="Изменить" onClick={() => setEdit(toDraft(x, hidden))}>✎</button>
              <button type="button" aria-label={hidden ? 'Показать' : 'Скрыть'} disabled={ready === false} onClick={() => toggle(x)}>{hidden ? '🙈' : '👁'}</button>
              {r && <button type="button" aria-label={mine ? 'Удалить' : 'Вернуть как было'} onClick={() => remove(x)}>{mine ? '🗑' : '↺'}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CourseForm({ d: d0, isNew, onBack, onSave }: { d: Draft; isNew: boolean; onBack: () => void; onSave: (d: Draft) => Promise<void> }) {
  const [d, setD] = useState<Draft>(d0);
  const [link, setLink] = useState(d0.yt ? (d0.kind === 'list' ? `https://www.youtube.com/playlist?list=${d0.yt}` : `https://youtu.be/${d0.yt}`) : '');
  const [state, setState] = useState<'' | 'look' | 'save'>('');
  const [err, setErr] = useState('');
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const check = async () => {
    const p = parseYouTube(link);
    if (!p) { setErr('Не похоже на ссылку YouTube. Скопируй ссылку на плейлист (в ней есть list=) или на одно видео.'); return; }
    setErr(''); setState('look');
    try {
      const info = await lookup(p);
      set({ kind: p.kind, yt: p.id, title: d.title || info.title, channel: d.channel || info.channel, count: info.count, first: info.first });
    } catch { set({ kind: p.kind, yt: p.id }); setErr('Не получилось прочитать плейлист. Проверь, что он открыт для всех, или впиши название сам.'); }
    setState('');
  };
  const ok = d.yt && d.title.trim().length > 0;
  const submit = async () => {
    if (!ok) return;
    setState('save'); setErr('');
    try { await onSave(d); } catch (e) { setErr(String(e instanceof Error ? e.message : e)); setState(''); }
  };

  return (
    <div className="ac">
      <button type="button" className="link-btn" onClick={onBack}>← К списку курсов</button>
      <h3 className="ac-h">{isNew ? 'Новый курс' : 'Изменить курс'}</h3>
      {isNew && (
        <label className="field">Ссылка на плейлист или видео YouTube
          <div className="ac-link"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…" inputMode="url" />
            <button type="button" className="pri-btn" disabled={!link.trim() || state === 'look'} onClick={check}>{state === 'look' ? '…' : 'Найти'}</button></div>
        </label>
      )}
      {d.yt && (
        <>
          {d.first && <div className="ac-prev"><img src={thumb(d.first)} alt="" /><small>{d.kind === 'list' ? `${d.count ?? '?'} ${d.count === 1 ? 'урок' : 'уроков'}` : 'одно видео'}</small></div>}
          <label className="field">Название (как увидят люди)<input value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="field">Автор или канал<input value={d.channel} maxLength={80} onChange={(e) => set({ channel: e.target.value })} /></label>
          <label className="field">Раздел
            <select value={d.cat} onChange={(e) => set({ cat: e.target.value as VideoCat })}>{VIDEO_CATS.map((c) => <option key={c.id} value={c.id}>{c.ic} {c.ru}</option>)}</select>
          </label>
          <label className="field">Язык
            <select value={d.lang} onChange={(e) => set({ lang: e.target.value as 'ru' | 'en' })}><option value="ru">Русский</option><option value="en">English</option></select>
          </label>
          <label className="field">Пара слов о курсе (необязательно)<textarea rows={2} maxLength={300} value={d.note} onChange={(e) => set({ note: e.target.value })} /></label>
          <button type="button" className="pri-btn big-btn" disabled={!ok || state === 'save'} onClick={submit}>{state === 'save' ? 'Сохраняю…' : isNew ? 'Добавить в видеоуроки' : 'Сохранить'}</button>
        </>
      )}
      {err && <div className="warn">{err}</div>}
    </div>
  );
}
