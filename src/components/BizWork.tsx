// The business circle as a workspace: tabs «Дела», «Календарь», «План» next to the chat.
import { useMemo, useState } from 'react';
import type { Anchor, AppState } from '../types';
import { ANCHORS } from '../types';
import { prayerTimes } from '../prayer';
import { addDays, keyOf, weekStart } from '../plans';
import { anchorLabel, dueLabel, eventAt, isLate, jumuahClash, type BizApi, type BizEvent, type BizGoal, type BizTask, type TaskStatus } from '../bizWork';
import { _t, _tj, LOC } from '../i18n';

type Names = Record<string, { name: string } | undefined>;
export type BizTab = 'chat' | 'path' | 'tasks' | 'cal' | 'plan';
/** What a sheet starts with: a new task/meeting/decision, maybe from a chat message. */
export type BizDraft =
  | { k: 'task'; id?: number; title: string; owner?: string | null; due?: string | null; due_p?: Anchor | null; status?: TaskStatus; msg?: number | null }
  | { k: 'event'; id?: number; title: string; day?: string; at?: string | null; after_p?: Anchor | null; kind?: 'meet' | 'due'; msg?: number | null }
  | { k: 'dec'; id?: number; body: string; msg?: number | null };

const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const hm = (ms: number) => new Date(ms).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
const PR_SHORT: Record<Anchor, () => string> = { fajr: () => _t("Фаджр"), dhuhr: () => _t("Зухр"), asr: () => _t("Аср"), maghrib: () => _t("Магриб"), isha: () => _t("Иша") };
const AFTER_P: Record<Anchor, () => string> = { fajr: () => _t("после Фаджра"), dhuhr: () => _t("после Зухра"), asr: () => _t("после Асра"), maghrib: () => _t("после Магриба"), isha: () => _t("после Иши") };

export function BizTabs({ tab, onTab, counts, startup }: { tab: BizTab; onTab: (t: BizTab) => void; counts: { tasks: number }; startup?: boolean }) {
  const T: [BizTab, string][] = startup
    ? [['chat', _t("Чат")], ['path', _t("Путь")], ['tasks', _t("Дела")], ['cal', _t("Календарь")]]
    : [['chat', _t("Чат")], ['tasks', _t("Дела")], ['cal', _t("Календарь")], ['plan', _t("План")]];
  return (
    <div className={`bw-tabs${startup ? ' su' : ''}`} role="tablist">
      {T.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => onTab(k)}>
          {l}{k === 'tasks' && counts.tasks > 0 && <em>{counts.tasks}</em>}
        </button>
      ))}
    </div>
  );
}

interface Common { api: BizApi; me: string; names: Names; people: string[]; state: AppState; today: string; onDraft: (d: BizDraft) => void }
const firstName = (names: Names, me: string, id?: string | null) => (!id ? '' : id === me ? _t("Ты") : (names[id]?.name || _t("Участник")).split(' ')[0]);
const initial = (names: Names, id?: string | null) => ((id && names[id]?.name) || '?').trim().charAt(0).toUpperCase();

/** «Дела»: what is mine today, then the board Надо · В работе · Готово. */
export function BizTasks({ api, me, names, today, onDraft }: Common) {
  const tasks = api.data?.tasks ?? [];
  const mineToday = tasks.filter((t) => t.owner === me && (t.status !== 'done' ? (!t.due || t.due <= today) : t.done_at?.slice(0, 10) === today));
  const col = (s: TaskStatus) => tasks.filter((t) => t.status === s).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id - b.id);
  const toggle = (t: BizTask) => api.setTask(t.id, { ...t, status: t.status === 'done' ? 'todo' : 'done' });
  if (!api.data) return <p className="tiny bw-load">{_t("Загружаю…")}</p>;
  return (
    <div className="bw-pane">
      <div className="bw-card bw-today">
        <span className="bw-k">{_t("Сегодня у тебя")}</span>
        {mineToday.length ? mineToday.map((t) => (
          <div key={t.id} className={`bw-li${t.status === 'done' ? ' done' : ''}`}>
            <button type="button" className={`bw-chk${t.status === 'done' ? ' on' : ''}`} aria-label={t.status === 'done' ? _t("Вернуть в работу") : _t("Готово")} onClick={() => toggle(t)} />
            <button type="button" className="bw-lt" onClick={() => onDraft({ k: 'task', ...t })}>{t.title}</button>
            <small className={isLate(t, today) ? 'late' : ''}>{dueLabel(t, today)}</small>
          </div>
        )) : <p className="bw-none">{_t("На сегодня твоих дел нет. Возьми дело с доски или добавь своё.")}</p>}
      </div>
      <div className="bw-board">
        {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => {
          const l = col(s);
          return (
            <div key={s} className={`bw-lane l-${s}`}>
              <div className="bw-lh"><b>{s === 'todo' ? _t("Надо") : s === 'doing' ? _t("В работе") : _t("Готово")}</b><span>{l.length}</span></div>
              {l.slice(0, s === 'done' ? 8 : 60).map((t) => (
                <button key={t.id} type="button" className={`bw-task${isLate(t, today) ? ' late' : ''}`} onClick={() => onDraft({ k: 'task', ...t })}>
                  <span>{t.title}</span>
                  <small><span>{isLate(t, today) ? '⚠ ' : ''}{dueLabel(t, today)}</span>{t.owner && <i title={names[t.owner]?.name}>{initial(names, t.owner)}</i>}</small>
                </button>
              ))}
              {!l.length && <p className="bw-empty">{s === 'todo' ? _t("Пусто") : '—'}</p>}
            </div>
          );
        })}
      </div>
      <button type="button" className="bw-fab" onClick={() => onDraft({ k: 'task', title: '', owner: me })}>{_t("＋ Дело")}</button>
    </div>
  );
}

/** «Календарь»: a week, day by day, with the prayers; Friday shows Jumu'ah. */
export function BizCalendar({ api, state, today, me, names, onDraft }: Common) {
  const [mon, setMon] = useState(today); // 7 days from today; arrows move by a week
  const st = state.settings;
  const events = api.data?.events ?? [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const next = events.filter((e) => e.day >= today).slice(0, 3);
  if (!api.data) return <p className="tiny bw-load">{_t("Загружаю…")}</p>;
  const whenOf = (e: BizEvent) => (e.after_p ? AFTER_P[e.after_p]() : e.at ?? (e.kind === 'due' ? _t("срок") : _t("в течение дня")));
  return (
    <div className="bw-pane">
      <div className="bw-wk">
        <button type="button" aria-label={_t("Прошлая неделя")} onClick={() => setMon(addDays(mon, -7))}>‹</button>
        <b>{D(mon).toLocaleDateString(LOC, { day: 'numeric', month: 'short' })} – {D(addDays(mon, 6)).toLocaleDateString(LOC, { day: 'numeric', month: 'short' })}</b>
        <button type="button" aria-label={_t("Следующая неделя")} onClick={() => setMon(addDays(mon, 7))}>›</button>
      </div>
      {days.map((k) => {
        const pt = prayerTimes(st, D(k));
        const list = events.filter((e) => e.day === k).sort((a, b) => (eventAt(st, a) ?? 0) - (eventAt(st, b) ?? 0));
        const fri = D(k).getDay() === 5;
        return (
          <div key={k} className={`bw-day${k === today ? ' now' : ''}${k < today ? ' past' : ''}`}>
            <div className="bw-dh">
              <b>{D(k).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric' })}</b>
              <span className="bw-pt">{ANCHORS.map((a) => <span key={a}>{fri && a === 'dhuhr' ? _t("Джума") : PR_SHORT[a]()} {hm(pt[a].getTime())}</span>)}</span>
              <button type="button" className="bw-add" aria-label={_t("Встреча в этот день")} onClick={() => onDraft({ k: 'event', title: '', day: k })}>＋</button>
            </div>
            {list.map((e) => (
              <button key={e.id} type="button" className={`bw-ev k-${e.kind}`} onClick={() => onDraft({ k: 'event', ...e })}>
                <i>{e.kind === 'due' ? '📄' : '🤝'}</i><span><b>{e.title}</b><small>{whenOf(e)}{e.by && e.by !== me ? ` · ${firstName(names, me, e.by)}` : ''}</small></span>
              </button>
            ))}
          </div>
        );
      })}
      {next.length > 0 && (
        <div className="bw-card">
          <span className="bw-k">{_t("Ближайшее")}</span>
          {next.map((e) => <div key={e.id} className="bw-li"><span>{e.kind === 'due' ? '📄' : '🤝'}</span><span className="bw-lt">{e.title}</span><small>{D(e.day).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric' })} · {whenOf(e)}</small></div>)}
        </div>
      )}
      <p className="bw-note">{_t("Встречи круга сами попадают в твои «Планы» и напоминают за час.")}</p>
      <button type="button" className="bw-fab" onClick={() => onDraft({ k: 'event', title: '', day: today >= mon && today <= addDays(mon, 6) ? today : mon })}>{_t("＋ Встреча")}</button>
    </div>
  );
}

/** «План»: niyyah, goal of the year, goals of the quarter, decisions of the shura. */
export function BizPlanPane({ api, me, names, people, onDraft }: Common) {
  const plan = api.data?.plan ?? { niyya: '', goal: '', goals: [] };
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(plan);
  const [busy, setBusy] = useState(false);
  if (!api.data) return <p className="tiny bw-load">{_t("Загружаю…")}</p>;
  const empty = !plan.niyya && !plan.goal && !plan.goals.length;
  const avg = plan.goals.length ? Math.round(plan.goals.reduce((a, g) => a + (g.p || 0), 0) / plan.goals.length) : 0;
  const start = () => { setF({ ...plan, goals: plan.goals.length ? plan.goals : [{ t: '', p: 0 }] }); setEdit(true); };
  const save = async () => {
    setBusy(true);
    await api.setPlan({ niyya: f.niyya.trim(), goal: f.goal.trim(), goals: f.goals.filter((g) => g.t.trim()).map((g) => ({ t: g.t.trim().slice(0, 80), o: g.o || undefined, p: Math.max(0, Math.min(100, Math.round(g.p || 0))) })) });
    setBusy(false); setEdit(false);
  };
  const setG = (i: number, p: Partial<BizGoal>) => setF({ ...f, goals: f.goals.map((g, j) => (j === i ? { ...g, ...p } : g)) });
  const decisions = api.data.decisions;

  return (
    <div className="bw-pane">
      {edit ? (
        <div className="bw-card bw-form">
          <label><span className="bw-k">{_t("Ниййат")}</span><textarea rows={3} maxLength={300} value={f.niyya} onChange={(e) => setF({ ...f, niyya: e.target.value })} placeholder={_t("Ради чего этот бизнес. Например: халяль-кофейня, где честно платят поставщикам и часть прибыли идёт в садака")} /></label>
          <label><span className="bw-k">{_t("Цель года")}</span><input maxLength={140} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder={_t("Например: открыть 2 точки и выйти в плюс")} /></label>
          <span className="bw-k">{_t("Цели этого квартала")}</span>
          {f.goals.map((g, i) => (
            <div key={i} className="bw-g">
              <input maxLength={80} value={g.t} onChange={(e) => setG(i, { t: e.target.value })} placeholder={_t("Цель {0}", i + 1)} />
              <div className="bw-gr">
                <select value={g.o ?? ''} onChange={(e) => setG(i, { o: e.target.value || undefined })} aria-label={_t("Кто отвечает")}>
                  <option value="">{_t("Кто отвечает")}</option>
                  {people.map((u) => <option key={u} value={u}>{u === me ? _t("Я") : names[u]?.name || _t("Участник")}</option>)}
                </select>
                <input type="range" min={0} max={100} step={5} value={g.p} onChange={(e) => setG(i, { p: Number(e.target.value) })} aria-label={_t("Готово, %")} />
                <b>{g.p}%</b>
                <button type="button" className="link-btn" aria-label={_t("Убрать цель")} onClick={() => setF({ ...f, goals: f.goals.filter((_, j) => j !== i) })}>✕</button>
              </div>
            </div>
          ))}
          {f.goals.length < 5 && <button type="button" className="link-btn" onClick={() => setF({ ...f, goals: [...f.goals, { t: '', p: 0 }] })}>{_t("+ Ещё цель")}</button>}
          <div className="bw-row">
            <button type="button" className="link-btn" onClick={() => setEdit(false)}>{_t("Отмена")}</button>
            <button type="button" className="pri-btn" disabled={busy} onClick={save}>{_t("Сохранить")}</button>
          </div>
        </div>
      ) : empty ? (
        <div className="bw-card bw-start">
          <b>{_t("План команды на одной странице")}</b>
          <p>{_t("Ниййат, цель года и 3 цели квартала с ответственными. Видят только люди круга. Суммы денег писать не нужно.")}</p>
          <button type="button" className="pri-btn" onClick={start}>{_t("Составить план")}</button>
        </div>
      ) : (
        <>
          {plan.niyya && <div className="bw-card bw-niyya"><span className="bw-k">{_t("Ниййат")}</span><p>{plan.niyya}</p></div>}
          {plan.goal && (
            <div className="bw-card">
              <span className="bw-k">{_t("Цель года")}</span>
              <b className="bw-goal">{plan.goal}</b>
              {plan.goals.length > 0 && <><div className="bw-bar"><i style={{ width: `${avg}%` }} /></div><small className="bw-sm">{_tj("{0}% по целям квартала", avg)}</small></>}
            </div>
          )}
          {plan.goals.length > 0 && (
            <div className="bw-card">
              <span className="bw-k">{_t("Цели этого квартала")}</span>
              {plan.goals.map((g, i) => (
                <div key={i} className="bw-gv">
                  <div><span>{g.t}</span><small>{firstName(names, me, g.o)}</small></div>
                  <div className="bw-bar"><i style={{ width: `${g.p}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="link-btn bw-edit" onClick={start}>{_t("✏️ Изменить план")}</button>
        </>
      )}

      <div className="bw-card">
        <div className="bw-dech"><span className="bw-k">{_t("Решения шуры")}</span><button type="button" className="link-btn" onClick={() => onDraft({ k: 'dec', body: '' })}>{_t("+ Решение")}</button></div>
        {decisions.length ? decisions.map((d) => (
          <button key={d.id} type="button" className="bw-dec" onClick={() => onDraft({ k: 'dec', id: d.id, body: d.body })}>
            <i>✅</i><span><b>{D(d.day).toLocaleDateString(LOC, { day: '2-digit', month: '2-digit' })}</b> {d.body}{d.by && <small> · {firstName(names, me, d.by)}</small>}</span>
          </button>
        )) : <p className="bw-none">{_t("Что решили на шуре, записывайте сюда, чтобы не спорить заново. Можно и из чата: долгое нажатие на сообщение → «Записать как решение».")}</p>}
      </div>
    </div>
  );
}

/** The sheet for a task, a meeting or a decision: new or open. */
export function BizSheet({ draft, api, me, names, people, state, today, onClose, onSaved }: Omit<Common, 'onDraft'> & { draft: BizDraft; onClose: () => void; onSaved: (k: BizDraft['k'], id: number, title: string, isNew: boolean, extra: string) => void }) {
  const [d, setD] = useState<BizDraft>(draft);
  const [busy, setBusy] = useState(false);
  const st = state.settings;
  const isNew = !d.id;
  const fri = useMemo(() => { const days: string[] = []; for (let i = 0; i < 7; i++) { const k = addDays(today, i); if (D(k).getDay() === 5) days.push(k); } return days[0]; }, [today]);
  const clash = d.k === 'event' && d.day ? jumuahClash(st, d.day, d.at ?? null, d.after_p) : null;

  const save = async () => {
    setBusy(true);
    let id = 0, title = '', extra = '';
    if (d.k === 'task') {
      title = d.title.trim();
      id = await api.setTask(d.id ?? 0, { title, owner: d.owner ?? null, due: d.due ?? null, due_p: d.due_p ?? null, status: d.status ?? 'todo', msg: d.msg ?? null });
      extra = [d.owner ? firstName(names, me, d.owner) : '', dueLabel({ due: d.due ?? null, due_p: d.due_p ?? null }, today)].filter(Boolean).join(' · ');
    } else if (d.k === 'event') {
      title = d.title.trim();
      id = await api.setEvent(d.id ?? 0, { title, day: d.day ?? today, at: d.after_p ? null : d.at ?? null, after_p: d.after_p ?? null, kind: d.kind ?? 'meet', msg: d.msg ?? null });
      extra = `${D(d.day ?? today).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' })}${d.after_p ? `, ${AFTER_P[d.after_p]()}` : d.at ? `, ${d.at}` : ''}`;
    } else {
      title = d.body.trim();
      id = await api.setDecision(d.id ?? 0, { body: title, msg: d.msg ?? null });
    }
    setBusy(false);
    if (id) { onSaved(d.k, id, title, isNew, extra); onClose(); }
  };
  const remove = async () => {
    if (!d.id || !confirm(_t("Удалить для всех в круге?"))) return;
    if (d.k === 'task') await api.setTask(d.id, null); else if (d.k === 'event') await api.setEvent(d.id, null); else await api.setDecision(d.id, null);
    onClose();
  };
  const ok = (d.k === 'dec' ? d.body : d.title).trim().length > 0 && (d.k !== 'event' || Boolean(d.day));
  const head = d.k === 'task' ? (isNew ? _t("📋 Новое дело") : _t("📋 Дело")) : d.k === 'event' ? (isNew ? _t("📅 Новая встреча") : _t("📅 Встреча")) : (isNew ? _t("✅ Решение шуры") : _t("✅ Решение"));
  const dayChips: [string, string][] = [[today, _t("Сегодня")], [addDays(today, 1), _t("Завтра")], ...(fri && fri !== today && fri !== addDays(today, 1) ? [[fri, _t("Пятница")] as [string, string]] : []), [addDays(weekStart(today), 7), _t("След. пн")]];

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet" role="dialog" aria-label={head}>
        <b>{head}</b>
        {d.k === 'dec' ? (
          <textarea rows={3} maxLength={300} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} placeholder={_t("Что решили. Например: кредит не берём, ищем партнёра-инвестора")} autoFocus={isNew} />
        ) : (
          <input maxLength={d.k === 'task' ? 140 : 120} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder={d.k === 'task' ? _t("Что сделать. Например: позвонить поставщику") : _t("Например: встреча с инвестором")} autoFocus={isNew} />
        )}

        {d.k === 'task' && (
          <>
            <span className="bw-sl">{_t("Кто делает")}</span>
            <div className="bw-chips">{people.map((u) => <button key={u} type="button" aria-pressed={d.owner === u} onClick={() => setD({ ...d, owner: d.owner === u ? null : u })}>{u === me ? _t("Я") : (names[u]?.name || _t("Участник")).split(' ')[0]}</button>)}</div>
            <span className="bw-sl">{_t("Срок")}</span>
            <div className="bw-chips">
              <button type="button" aria-pressed={!d.due} onClick={() => setD({ ...d, due: null })}>{_t("Без срока")}</button>
              {dayChips.map(([k, l]) => <button key={l} type="button" aria-pressed={d.due === k} onClick={() => setD({ ...d, due: k })}>{l}</button>)}
              <input type="date" value={d.due ?? ''} min={today} onChange={(e) => setD({ ...d, due: e.target.value || null })} aria-label={_t("Дата")} />
            </div>
            <div className="bw-chips small">{ANCHORS.map((a) => <button key={a} type="button" aria-pressed={d.due_p === a} onClick={() => setD({ ...d, due_p: d.due_p === a ? null : a })}>{anchorLabel(a)}</button>)}</div>
            {!isNew && (
              <>
                <span className="bw-sl">{_t("Где сейчас")}</span>
                <div className="bw-chips">{(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => <button key={s} type="button" aria-pressed={(d.status ?? 'todo') === s} onClick={() => setD({ ...d, status: s })}>{s === 'todo' ? _t("Надо") : s === 'doing' ? _t("В работе") : _t("Готово")}</button>)}</div>
              </>
            )}
          </>
        )}

        {d.k === 'event' && (
          <>
            <div className="bw-chips">
              <button type="button" aria-pressed={(d.kind ?? 'meet') === 'meet'} onClick={() => setD({ ...d, kind: 'meet' })}>{_t("🤝 Встреча")}</button>
              <button type="button" aria-pressed={d.kind === 'due'} onClick={() => setD({ ...d, kind: 'due' })}>{_t("📄 Срок")}</button>
            </div>
            <span className="bw-sl">{_t("День")}</span>
            <div className="bw-chips">
              {dayChips.map(([k, l]) => <button key={l} type="button" aria-pressed={d.day === k} onClick={() => setD({ ...d, day: k })}>{l}</button>)}
              <input type="date" value={d.day ?? ''} onChange={(e) => setD({ ...d, day: e.target.value })} aria-label={_t("Дата")} />
            </div>
            <span className="bw-sl">{_t("Время")}</span>
            <div className="bw-chips small">
              {ANCHORS.map((a) => <button key={a} type="button" aria-pressed={d.after_p === a} onClick={() => setD({ ...d, after_p: d.after_p === a ? null : a, at: null })}>{AFTER_P[a]()}</button>)}
              <input type="time" value={d.after_p ? '' : d.at ?? ''} onChange={(e) => setD({ ...d, at: e.target.value || null, after_p: null })} aria-label={_t("Время")} />
            </div>
            {clash && (
              <div className="bw-warn">
                <span>{_t("⚠ Это время Джума. Поставим встречу после намаза?")}</span>
                <button type="button" onClick={() => setD({ ...d, at: clash, after_p: null })}>{_tj("Поставить на {0}", clash)}</button>
              </div>
            )}
          </>
        )}

        {d.k !== 'dec' && d.msg ? <p className="bw-from">{_t("Из сообщения в чате")}</p> : null}
        <div className="bw-row">
          {!isNew ? <button type="button" className="link-btn danger-t" onClick={remove}>{_t("Удалить")}</button> : <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>}
          <button type="button" className="pri-btn" disabled={!ok || busy || Boolean(clash)} onClick={save}>{isNew ? (d.k === 'dec' ? _t("Записать") : _t("Добавить")) : _t("Сохранить")}</button>
        </div>
        {isNew && d.k !== 'dec' && <p className="bw-from">{_t("Круг увидит карточку в чате.")}</p>}
      </div>
    </>
  );
}

/** «вторник 13:00» → a date for a meeting draft from chat text, best effort. */
export function guessDay(text: string, today: string): { day?: string; after_p?: Anchor; at?: string } {
  const t = text.toLowerCase();
  const out: { day?: string; after_p?: Anchor; at?: string } = {};
  const wd: [RegExp, number][] = [[/понедельник|\bпн\b/, 1], [/вторник|\bвт\b/, 2], [/сред[аыу]|\bср\b/, 3], [/четверг|\bчт\b/, 4], [/пятниц|\bпт\b/, 5], [/суббот|\bсб\b/, 6], [/воскресень|\bвс\b/, 0]];
  if (/послезавтра/.test(t)) out.day = addDays(today, 2);
  else if (/завтра/.test(t)) out.day = addDays(today, 1);
  else if (/сегодня/.test(t)) out.day = today;
  else for (const [re, n] of wd) if (re.test(t)) { let k = addDays(today, 1); while (D(k).getDay() !== n) k = addDays(k, 1); out.day = k; break; }
  const pr: [RegExp, Anchor][] = [[/фаджр/, 'fajr'], [/зухр/, 'dhuhr'], [/аср/, 'asr'], [/магриб/, 'maghrib'], [/иша|иши/, 'isha']];
  for (const [re, a] of pr) if (re.test(t)) { out.after_p = a; break; }
  const m = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(t);
  if (m && !out.after_p) out.at = `${m[1].padStart(2, '0')}:${m[2]}`;
  return out;
}
export { keyOf };
