import { useEffect, useState } from 'react';
import { accessToken } from '../auth';
import {
  builtInIds, catalog, catOf, lessons, loadCourses, lookup, parseYouTube, remoteCourses, setRemoteCourses, thumb, VIDEO_CATS,
  type CoursePlan, type CourseRow, type Lesson, type LessonPlan, type QuizQ, type VideoCat, type VideoItem,
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

interface Draft { kind: 'list' | 'video'; yt: string; cat: VideoCat; title: string; channel: string; lang: 'ru' | 'en'; note: string; count?: number; first?: string; hidden?: boolean; plan?: CoursePlan }
const toDraft = (x: VideoItem, hidden = false): Draft => ({ kind: x.kind, yt: x.id, cat: x.cat, title: x.title, channel: x.channel ?? '', lang: x.lang ?? 'ru', note: x.note ?? '', hidden, plan: x.plan });

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
    const plan = d.plan ? cleanPlan(d.plan) : undefined;
    const p = { kind: d.kind, yt: d.yt, cat: d.cat, title: d.title.trim(), channel: d.channel.trim(), lang: d.lang, note: d.note.trim(), hidden, ...(d.plan ? { plan } : {}) };
    const saved = await rpc<CourseRow>('lm_course_save', { p });
    // Before course-plan.sql the server drops the plan without an error.
    if (d.plan && !('plan' in saved)) throw new Error('Курс сохранён, но содержание (модули, конспекты, тесты) нет: один раз запусти course-plan.sql в Supabase');
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
    if (!confirm(isBuilt ? `Вернуть «${x.title}» как было в стандартном списке?` : `Удалить «${x.title}» из курсов у всех?`)) return;
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
          {d.kind === 'list' && <PlanEditor d={d} plan={d.plan ?? {}} onChange={(plan) => set({ plan })} />}
          <button type="button" className="pri-btn big-btn" disabled={!ok || state === 'save'} onClick={submit}>{state === 'save' ? 'Сохраняю…' : isNew ? 'Добавить в курсы' : 'Сохранить'}</button>
          {!isNew && <AdminReviews course={d.yt} />}
        </>
      )}
      {err && <div className="warn">{err}</div>}
    </div>
  );
}

// ---- reviews: the owner sees all of them and can hide any (course-reviews.sql) ----

interface AReview { uid: string; who: string; stars: number; body: string; hidden: boolean; day: string }
function AdminReviews({ course }: { course: string }) {
  const [list, setList] = useState<AReview[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => rpc<AReview[]>('lm_course_reviews_admin', { p_course: course }).then((r) => { setList(r ?? []); setErr(''); })
    .catch((e) => setErr(/courses\.sql|404|course_reviews/.test(String(e)) ? 'Отзывы появятся после того, как запустишь course-reviews.sql в Supabase' : String(e instanceof Error ? e.message : e)));
  useEffect(() => { load(); }, [course]); // eslint-disable-line react-hooks/exhaustive-deps
  const hide = async (r: AReview) => {
    try { await rpc('lm_course_review_hide', { p_course: course, p_who: r.uid, p_hidden: !r.hidden }); load(); } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
  };
  const vis = (list ?? []).filter((r) => !r.hidden);
  const avg = vis.length ? (vis.reduce((a, r) => a + r.stars, 0) / vis.length).toFixed(1).replace('.', ',') : '';
  return (
    <div className="ac-plan">
      <h3 className="ac-h">Оценки и отзывы{avg ? ` · ★ ${avg} (${vis.length})` : ''}</h3>
      {err && <p className="tiny">{err}</p>}
      {list && !list.length && !err && <p className="tiny">Пока никто не оценил. Оценить может только тот, кто прошёл курс до сертификата.</p>}
      {(list ?? []).map((r) => (
        <div key={r.uid} className={`ac-rev${r.hidden ? ' off' : ''}`}>
          <div><b>{r.who || 'Без имени'}</b><span>{'★'.repeat(r.stars)}</span><small>{r.day}</small></div>
          {r.body && <p>{r.body}</p>}
          <button type="button" className="link-btn" onClick={() => hide(r)}>{r.hidden ? 'Показать снова' : 'Скрыть'}</button>
        </div>
      ))}
      <p className="tiny">Скрытый отзыв не видят люди, и он не считается в средней оценке.</p>
    </div>
  );
}

// ---- course content: modules, lesson summaries and practice, tests ----

const tidy = (x?: string) => (x ?? '').trim();
function cleanQs(qs?: QuizQ[]): QuizQ[] | undefined {
  const out = (qs ?? []).map((q) => ({ q: tidy(q.q), opts: q.opts.map(tidy), a: q.a, ...(tidy(q.why) ? { why: tidy(q.why) } : {}) }))
    .filter((q) => q.q && q.opts.filter(Boolean).length >= 2 && q.opts[q.a]);
  return out.length ? out : undefined;
}
function cleanPlan(p: CoursePlan): CoursePlan {
  const lessonsOut: Record<string, LessonPlan> = {};
  for (const [id, l] of Object.entries(p.lessons ?? {})) {
    const sum = (l.sum ?? []).map(tidy).filter(Boolean);
    const v: LessonPlan = { ...(sum.length ? { sum } : {}), ...(tidy(l.ask) ? { ask: tidy(l.ask) } : {}), ...(tidy(l.act) ? { act: tidy(l.act) } : {}) };
    if (Object.keys(v).length) lessonsOut[id] = v;
  }
  return {
    ...(tidy(p.about) ? { about: tidy(p.about) } : {}),
    ...(p.modules?.length ? { modules: p.modules.map((m) => ({ title: tidy(m.title) || 'Модуль', n: Math.max(1, Math.floor(m.n || 1)), ...(cleanQs(m.quiz) ? { quiz: cleanQs(m.quiz) } : {}) })) } : {}),
    ...(Object.keys(lessonsOut).length ? { lessons: lessonsOut } : {}),
    ...(cleanQs(p.final) ? { final: cleanQs(p.final) } : {}),
    ...(p.checked ? { checked: true } : {}),
    ...(tidy(p.after) ? { after: tidy(p.after) } : {}),
  };
}

function PlanEditor({ d, plan, onChange }: { d: Draft; plan: CoursePlan; onChange: (p: CoursePlan) => void }) {
  const [items, setItems] = useState<Lesson[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    lessons({ kind: 'list', id: d.yt, cat: d.cat, title: d.title }).then((l) => live && setItems(l.items)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [d.yt]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<CoursePlan>) => onChange({ ...plan, ...p });
  const mods = plan.modules ?? [];
  const setMod = (i: number, p: Partial<NonNullable<CoursePlan['modules']>[number]>) => set({ modules: mods.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const setLesson = (id: string, p: Partial<LessonPlan>) => set({ lessons: { ...(plan.lessons ?? {}), [id]: { ...(plan.lessons?.[id] ?? {}), ...p } } });
  const covered = mods.reduce((a, m) => a + Math.max(0, m.n || 0), 0);
  // Which module a lesson falls into, for the headings in the lesson list.
  const modAt = (i: number) => { let at = 0; for (let j = 0; j < mods.length; j++) { at += Math.max(0, mods[j].n || 0); if (i < at) return j; } return mods.length - 1; };

  return (
    <div className="ac-plan">
      <h3 className="ac-h">Содержание курса</h3>
      <p className="tiny">Всё необязательно. Без этого курс работает как список уроков: заметки, прогресс и сертификат в конце. Модули, конспекты, практика и тесты делают из него полноценный курс.</p>
      {d.cat === 'faith' && (
        <label className="ac-check"><input type="checkbox" checked={Boolean(plan.checked)} onChange={(e) => set({ checked: e.target.checked })} />
          <span><b>Проверено имамом</b><small>Курсы о вере: без этой галочки конспекты и тесты людям не показываются, только уроки.</small></span></label>
      )}
      <label className="field">Открывается после курса
        <select value={plan.after ?? ''} onChange={(e) => set({ after: e.target.value || undefined })}>
          <option value="">Открыт сразу</option>
          {catalog().filter((x) => x.kind === 'list' && x.id !== d.yt).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <small className="tiny">Продвинутый курс: человек видит его с замком, пока не получит сертификат первого.</small>
      </label>
      <label className="field">О курсе (на странице курса)<textarea rows={3} maxLength={600} value={plan.about ?? ''} onChange={(e) => set({ about: e.target.value })} placeholder="Чему научится человек, для кого курс" /></label>

      <h4 className="ac-sub">Модули {items && <small>{covered} из {items.length} уроков разложено{covered < items.length && mods.length ? ', остальные уйдут в последний модуль' : ''}</small>}</h4>
      {mods.map((m, i) => (
        <div key={i} className="ac-mod">
          <div className="ac-mod-top">
            <b>{i + 1}</b>
            <input value={m.title} placeholder="Название модуля" onChange={(e) => setMod(i, { title: e.target.value })} />
            <input type="number" min={1} max={200} value={m.n} aria-label="Сколько уроков" onChange={(e) => setMod(i, { n: Number(e.target.value) })} />
            <span className="tiny">уроков</span>
            <button type="button" aria-label="Убрать модуль" onClick={() => set({ modules: mods.filter((_, j) => j !== i) })}>✕</button>
          </div>
          <QEditor title={`Мини-тест модуля ${i + 1}`} qs={m.quiz ?? []} onChange={(quiz) => setMod(i, { quiz })} />
        </div>
      ))}
      <button type="button" className="ghost-btn" onClick={() => set({ modules: [...mods, { title: '', n: Math.max(1, Math.min(5, (items?.length ?? 5) - covered)) }] })}>+ Модуль</button>

      <h4 className="ac-sub">Уроки</h4>
      {err && <p className="warn">Не получилось загрузить уроки плейлиста.</p>}
      {!items && !err && <p className="tiny">Загружаю уроки…</p>}
      {items?.map((x, i) => {
        const l = plan.lessons?.[x.id] ?? {};
        const has = Boolean(l.sum?.some((s) => s.trim()) || l.ask?.trim() || l.act?.trim());
        const m = mods.length ? modAt(i) : -1;
        const head = m >= 0 && (i === 0 || modAt(i - 1) !== m);
        return (
          <div key={x.id}>
            {head && <p className="ac-modh">Модуль {m + 1}{mods[m]?.title ? `. ${mods[m].title}` : ''}</p>}
            <details className="ac-lesson">
              <summary>{i + 1}. {x.title}{has ? ' ✓' : ''}</summary>
              <label className="field">Главные мысли (каждая с новой строки, лучше 3)<textarea rows={3} value={(l.sum ?? []).join('\n')} onChange={(e) => setLesson(x.id, { sum: e.target.value.split('\n') })} /></label>
              <label className="field">Вопрос себе<input value={l.ask ?? ''} onChange={(e) => setLesson(x.id, { ask: e.target.value })} placeholder="Например: что из урока я сделаю на этой неделе?" /></label>
              <label className="field">Практика на сегодня<input value={l.act ?? ''} onChange={(e) => setLesson(x.id, { act: e.target.value })} placeholder="Одно простое действие на сегодня" /></label>
            </details>
          </div>
        );
      })}

      <h4 className="ac-sub">Итоговый тест</h4>
      <QEditor title="Итоговый тест" qs={plan.final ?? []} onChange={(final) => set({ final })} />
      <p className="tiny">Проходной балл 70%. Сертификат даётся, когда пройдены все уроки, мини-тесты и итоговый тест.</p>
    </div>
  );
}

function QEditor({ title, qs, onChange }: { title: string; qs: QuizQ[]; onChange: (q: QuizQ[]) => void }) {
  const [open, setOpen] = useState(false);
  const setQ = (i: number, p: Partial<QuizQ>) => onChange(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  return (
    <details className="ac-quiz" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{title}: {qs.length ? `${qs.length} вопр.` : 'нет вопросов'}</summary>
      {qs.map((q, i) => (
        <div key={i} className="ac-q">
          <div className="ac-mod-top"><b>{i + 1}</b><input value={q.q} placeholder="Вопрос" onChange={(e) => setQ(i, { q: e.target.value })} />
            <button type="button" aria-label="Убрать вопрос" onClick={() => onChange(qs.filter((_, j) => j !== i))}>✕</button></div>
          {[0, 1, 2, 3].map((o) => (
            <label key={o} className="ac-opt">
              <input type="radio" name={`${title}-${i}`} checked={q.a === o} onChange={() => setQ(i, { a: o })} aria-label="Верный ответ" />
              <input value={q.opts[o] ?? ''} placeholder={o < 2 ? `Ответ ${o + 1}` : `Ответ ${o + 1} (необязательно)`} onChange={(e) => { const opts = [0, 1, 2, 3].map((k) => (k === o ? e.target.value : q.opts[k] ?? '')); setQ(i, { opts }); }} />
            </label>
          ))}
          <input className="ac-why" value={q.why ?? ''} placeholder="Пояснение после ответа (необязательно)" onChange={(e) => setQ(i, { why: e.target.value })} />
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => onChange([...qs, { q: '', opts: ['', '', '', ''], a: 0 }])}>+ Вопрос</button>
      <p className="tiny">Кружок слева отмечает верный ответ.</p>
    </details>
  );
}
