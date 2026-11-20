// «Планы»: day (between the prayers), week and month views, a form for a plan, and settings
// (where plans are kept, the calendar subscription). The card «Планы на сегодня» sits on Today.
import { useEffect, useMemo, useState } from 'react';
import type { AppState, Anchor } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { prayerTimes } from '../prayer';
import { _t, LANG } from '../i18n';
import {
  type Plan, type PlanAfter, type PlanRepeat, AFTERS, addDays, afterLabel, blockOf, dayLabel, dayPlans, dropPlan, editPlan, hm, isDone,
  keyOf, listTone, listsOf, live, movePlan, on, overdue, pid, planGoogle, planIcs, setPlans, toggleDone, weekPlans, weekStart, whenLabel,
} from '../plans';
import { googleSubUrl, icsKey, icsOff, icsUrl, signedIn, syncPlans, webcalUrl } from '../plansCloud';

type Up = (fn: (s: AppState) => AppState) => void;
const loc = () => (LANG === 'en' ? 'en-GB' : 'ru-RU');

function Check({ done, onClick }: { done: boolean; onClick: () => void }) {
  return <button type="button" className={`pn-ck${done ? ' on' : ''}`} aria-pressed={done} aria-label={done ? _t("Сделано") : _t("Отметить сделанным")} onClick={(e) => { e.stopPropagation(); onClick(); }}>{done ? '✓' : ''}</button>;
}

function Item({ state, p, k, update, onOpen, onTick }: { state: AppState; p: Plan; k: string; update: Up; onOpen?: (p: Plan) => void; onTick?: (id: string, done: boolean) => void }) {
  const done = isDone(p, k);
  return (
    <div className={`pn-it${done ? ' done' : ''}`} role="button" tabIndex={0} onClick={() => onOpen?.(p)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(p); }}>
      <Check done={done} onClick={() => { onTick?.(p.id, !done); update((s) => toggleDone(s, p.id, k)); }} />
      <div className="pn-tx">
        <b>{p.text}</b>
        <small>{p.list && <span className={`pn-tag ${listTone(state, p.list)}`}>{p.list}</span>}{whenLabel(state.settings, p, k)}</small>
      </div>
    </div>
  );
}

/** Today: «Планы на сегодня». Hidden when there is nothing today and nothing overdue. */
export function PlansCard({ state, update, today, onOpen }: { state: AppState; update: Up; today: string; onOpen: () => void }) {
  // Done plans leave Today (Nasim: the main page gets crowded). A plan ticked just now stays a moment so the tick is seen.
  const [fresh, setFresh] = useState<string[]>([]);
  const tick = (id: string, done: boolean) => {
    if (!done) return;
    setFresh((f) => [...f, id]);
    setTimeout(() => setFresh((f) => f.filter((x) => x !== id)), 1400);
  };
  const all = dayPlans(state, today);
  const list = all.filter((p) => !isDone(p, today) || fresh.includes(p.id));
  const late = overdue(state, today);
  if (!list.length && !late.length) return null;
  const n = all.filter((p) => isDone(p, today)).length;
  const mon = weekStart(today);
  let rest = 0;
  for (let i = 1; i < 7; i++) { const k = addDays(today, i); if (k > addDays(mon, 6)) break; rest += dayPlans(state, k).length; }
  rest += weekPlans(state, mon).filter((p) => !isDone(p, p.date)).length;
  return (
    <section className="pn-card">
      <div className="pn-card-h"><b>🗓 {_t("Планы на сегодня")}</b><button type="button" className="link-btn" onClick={onOpen}>{_t("Все")} ›</button></div>
      {list.slice(0, 5).map((p) => <Item key={p.id} state={state} p={p} k={today} update={update} onOpen={onOpen} onTick={tick} />)}
      {late.length > 0 && (
        <div className="pn-late">
          <span>{_t("Не сделано раньше: {0}", late.length)}</span>
          <button type="button" className="link-btn" onClick={() => update((s) => late.reduce((acc, p) => movePlan(acc, p.id, today), s))}>{_t("Перенести на сегодня")}</button>
        </div>
      )}
      <small className="pn-card-f">{all.length ? _t("{0} из {1} сделано", n, all.length) : ''}{rest ? `${all.length ? ' · ' : ''}${_t("ещё {0} на неделе", rest)}` : ''}</small>
    </section>
  );
}

type View = 'day' | 'week' | 'month';
export interface PlansStart { plan?: string; act?: string; day?: string }
let pending: PlansStart | undefined;
/** What a notification asked for; the plans page takes it once. */
export const setPlanStart = (x: PlansStart) => { pending = x; };
export const takePlanStart = () => { const x = pending; pending = undefined; return x; };

export function PlansPage({ state, update, today, onAsk, start }: { state: AppState; update: Up; today: string; onAsk: () => void; start?: PlansStart }) {
  const [view, setView] = useState<View>('day');
  const [cur, setCur] = useState(start?.day || today);
  const [form, setForm] = useState<{ p?: Plan; date: string } | null>(null);
  const [open, setOpen] = useState<Plan | null>(null);
  const [gear, setGear] = useState(false);
  const [priv, setPriv] = useState(false);
  const inCloud = state.plansSet?.store === 'cloud';

  // From a notification: «Сделано», «Через час», «Завтра».
  useEffect(() => {
    if (!start?.plan) return;
    const p = live(state).find((x) => x.id === start.plan); if (!p) return;
    const k = start.day || today;
    if (start.act === 'done') update((s) => toggleDone(s, p.id, k, true));
    else if (start.act === 'hour') update((s) => editPlan(s, p.id, { snooze: { ...(p.snooze ?? {}), [k]: Date.now() + 3600e3 } }));
    else if (start.act === 'tomorrow') update((s) => (p.repeat ? toggleDone(s, p.id, k, true) : movePlan(s, p.id, addDays(k, 1))));
    else setOpen(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gear) return <PlansSettings state={state} update={update} onBack={() => setGear(false)} />;
  if (form) return <PlanForm state={state} update={update} today={today} init={form} onDone={() => setForm(null)} />;

  return (
    <div className="pl">
      <button type="button" className="pn-lock" onClick={() => setPriv(true)}>🔒 {inCloud ? _t("В облаке Living Muslim") : _t("Только на этом телефоне")}</button>
      {priv && (
        <div className="pn-sheet-bg" onClick={() => setPriv(false)}>
          <div className="pn-sheet" role="dialog" aria-label={_t("Где хранятся твои планы")} onClick={(e) => e.stopPropagation()}>
            <b className="pn-sheet-t">🔒 {_t("Где хранятся твои планы")}</b>
            <div className="pn-pt"><span>📱</span><p>{inCloud ? _t("Копия есть на этом телефоне, а для других устройств они хранятся в облаке Living Muslim.") : _t("Сейчас только на этом телефоне. В интернет они не уходят.")}</p></div>
            <div className="pn-pt"><span>☁️</span><p>{inCloud ? _t("Облако Living Muslim: наше закрытое хранилище, не Google. Видны только тебе.") : _t("Хочешь видеть их на других устройствах? Включи облако Living Muslim. Это наше закрытое хранилище, не Google.")}</p></div>
            <div className="pn-pt"><span>🚫</span><p>{_t("Мы не продаём данные и не показываем рекламу.")}</p></div>
            <button type="button" className="pn-btn" onClick={() => setPriv(false)}>{_t("Понятно")}</button>
            <button type="button" className="link-btn" onClick={() => { setPriv(false); setGear(true); }}>{_t("Настройки хранения")}</button>
          </div>
        </div>
      )}
      <div className="pn-bar">
        <div className="pn-seg" role="tablist">
          {(['day', 'week', 'month'] as View[]).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'day' ? _t("День") : v === 'week' ? _t("Неделя") : _t("Месяц")}</button>)}
        </div>
        <button type="button" className="pn-gear" aria-label={_t("Настройки планов")} onClick={() => setGear(true)}>⚙︎</button>
      </div>
      {view === 'day' && <DayView state={state} update={update} today={today} k={cur} setK={setCur} onOpen={setOpen} />}
      {view === 'week' && <WeekView state={state} update={update} today={today} k={cur} setK={setCur} onDay={(k) => { setCur(k); setView('day'); }} />}
      {view === 'month' && <MonthView state={state} update={update} today={today} k={cur} setK={setCur} onOpen={setOpen} />}
      <div className="pn-acts">
        <button type="button" className="pn-btn" onClick={() => setForm({ date: cur < today ? today : cur })}>+ {_t("План")}</button>
        <button type="button" className="ghost-btn" onClick={onAsk}>{_t("Сказать помощнику")}</button>
      </div>
      {open && <PlanSheet state={state} update={update} p={open} k={on(open, cur) ? cur : open.date} onClose={() => setOpen(null)} onEdit={() => { setForm({ p: open, date: open.date }); setOpen(null); }} />}
    </div>
  );
}

function Nav({ label, prev, next, right }: { label: string; prev: () => void; next: () => void; right?: string }) {
  return (
    <div className="pn-nav">
      <button type="button" onClick={prev} aria-label={_t("Назад")}>‹</button><b>{label}</b><button type="button" onClick={next} aria-label={_t("Вперёд")}>›</button>
      {right && <small>{right}</small>}
    </div>
  );
}

function DayView({ state, update, today, k, setK, onOpen }: { state: AppState; update: Up; today: string; k: string; setK: (k: string) => void; onOpen: (p: Plan) => void }) {
  const list = dayPlans(state, k);
  const wk = weekPlans(state, weekStart(k)).filter(() => k === today);
  const [y, m, d] = k.split('-').map(Number);
  const t = prayerTimes(state.settings, new Date(y, m - 1, d, 12));
  const fri = new Date(y, m - 1, d).getDay() === 5;
  const showPr = state.plansSet?.prayers !== false;
  const free = list.filter((p) => blockOf(state.settings, p, k) == null);
  const by: Record<Anchor, Plan[]> = { fajr: [], dhuhr: [], asr: [], maghrib: [], isha: [] };
  for (const p of list) { const b = blockOf(state.settings, p, k); if (b) by[b].push(p); }
  const pre = list.filter((p) => { const b = blockOf(state.settings, p, k); return b === 'fajr' && !p.after && (p.time ?? '') < hm(t.fajr.getTime()); });
  return (
    <>
      <Nav label={k === today ? _t("Сегодня, {0}", dayLabel(k, { day: 'numeric', month: 'long' })) : dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })} prev={() => setK(addDays(k, -1))} next={() => setK(addDays(k, 1))} right={list.length ? _t("планов: {0}", list.length) : ''} />
      {k !== today && <button type="button" className="link-btn pn-today" onClick={() => setK(today)}>{_t("К сегодня")}</button>}
      {free.length > 0 && (
        <>
          <div className="pn-pr"><span>{_t("В течение дня")}</span></div>
          {free.map((p) => <Item key={p.id} state={state} p={p} k={k} update={update} onOpen={onOpen} />)}
        </>
      )}
      {showPr ? ANCHORS.map((a) => (
        <div key={a}>
          <div className="pn-pr"><span>{a === 'dhuhr' && fri ? _t("Зухр · Джума") : ANCHOR_LABEL[a].ru}</span><i>{hm(t[a].getTime())}</i></div>
          {by[a].filter((p) => !pre.includes(p)).map((p) => <Item key={p.id} state={state} p={p} k={k} update={update} onOpen={onOpen} />)}
          {a === 'dhuhr' && fri && <div className="pn-jum">🕌 <span><b>{_t("Джума")}</b><small>{_t("пятничный намаз")}</small></span></div>}
          {by[a].length === 0 && !(a === 'dhuhr' && fri) && <p className="pn-free">{_t("Свободно")}</p>}
        </div>
      )) : list.filter((p) => !free.includes(p)).map((p) => <Item key={p.id} state={state} p={p} k={k} update={update} onOpen={onOpen} />)}
      {wk.length > 0 && (
        <>
          <div className="pn-pr"><span>{_t("На этой неделе")}</span></div>
          {wk.map((p) => <Item key={p.id} state={state} p={p} k={p.date} update={update} onOpen={onOpen} />)}
        </>
      )}
      {list.length === 0 && <p className="tiny">{_t("Добавь план или скажи помощнику: «завтра после Зухра забронировать отель».")}</p>}
    </>
  );
}

function WeekView({ state, update, today, k, setK, onDay }: { state: AppState; update: Up; today: string; k: string; setK: (k: string) => void; onDay: (k: string) => void }) {
  const mon = weekStart(k);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const wk = weekPlans(state, mon);
  let all = 0, done = 0;
  for (const d of days) for (const p of dayPlans(state, d)) { all++; if (isDone(p, d)) done++; }
  for (const p of wk) { all++; if (isDone(p, p.date)) done++; }
  const late = overdue(state, today);
  return (
    <>
      <Nav label={`${dayLabel(mon, { day: 'numeric', month: 'short' })} – ${dayLabel(days[6], { day: 'numeric', month: 'short' })}`} prev={() => setK(addDays(mon, -7))} next={() => setK(addDays(mon, 7))} right={all ? _t("{0} из {1}", done, all) : ''} />
      {wk.length > 0 && (
        <div className="pn-wk pn-wk-any">
          <div className="pn-wd"><small>{_t("неделя")}</small><b>✦</b></div>
          <ul>{wk.map((p) => <li key={p.id} className={isDone(p, p.date) ? 'done' : ''} onClick={() => update((s) => toggleDone(s, p.id, p.date))}>{p.text}</li>)}</ul>
        </div>
      )}
      {days.map((d) => {
        const list = dayPlans(state, d);
        return (
          <button type="button" key={d} className={`pn-wk${d === today ? ' today' : ''}`} onClick={() => onDay(d)}>
            <div className="pn-wd"><small>{dayLabel(d, { weekday: 'short' })}</small><b>{Number(d.slice(8))}</b></div>
            <ul>
              {list.length === 0 && <li className="none">—</li>}
              {list.map((p) => {
                const lateOne = !isDone(p, d) && d < today;
                return <li key={p.id} className={isDone(p, d) ? 'done' : lateOne ? 'late' : ''}>{p.text}{p.after ? ` · ${afterLabel(p.after)}` : p.time ? ` · ${p.time}` : ''}</li>;
              })}
            </ul>
          </button>
        );
      })}
      {late.length > 0 && (
        <div className="pn-late">
          <span>{_t("Не сделано раньше: {0}", late.length)}</span>
          <button type="button" className="link-btn" onClick={() => update((s) => late.reduce((acc, p) => movePlan(acc, p.id, today), s))}>{_t("Перенести на сегодня")}</button>
        </div>
      )}
    </>
  );
}

function hijriMonth(k: string) {
  try { return new Date(`${k}T12:00:00`).toLocaleDateString(LANG === 'en' ? 'en-u-ca-islamic-umalqura' : 'ru-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }); } catch { return ''; }
}

function MonthView({ state, update, today, k, setK, onOpen }: { state: AppState; update: Up; today: string; k: string; setK: (k: string) => void; onOpen: (p: Plan) => void }) {
  const first = `${k.slice(0, 8)}01`;
  const [y, m] = k.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells = useMemo(() => Array.from({ length: n }, (_, i) => {
    const d = addDays(first, i);
    const c = dayPlans(state, d).length;
    const fri = new Date(y, m - 1, i + 1).getDay() === 5;
    return { d, c, fri };
  }), [state, first, n, y, m]);
  const list = dayPlans(state, k);
  const wd = LANG === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const mv = (dm: number) => { const t = new Date(y, m - 1 + dm, 1); setK(keyOf(t)); };
  return (
    <>
      <Nav label={new Date(y, m - 1, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' })} prev={() => mv(-1)} next={() => mv(1)} right={hijriMonth(k)} />
      <div className="pn-grid">
        {wd.map((w) => <span key={w} className="h">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} className="e" />)}
        {cells.map((c) => (
          <button type="button" key={c.d} className={`${c.d === k ? 'sel' : ''}${c.d === today ? ' tod' : ''}`} onClick={() => setK(c.d)} aria-label={`${dayLabel(c.d)}${c.c ? `, ${_t("планов: {0}", c.c)}` : ''}`}>
            {Number(c.d.slice(8))}
            <span className="dots">{Array.from({ length: Math.min(3, c.c) }, (_, i) => <i key={i} />)}{c.fri && <i className="go" />}</span>
          </button>
        ))}
      </div>
      <p className="tiny"><span className="pn-dot" /> {_t("план")} · <span className="pn-dot go" /> {_t("пятница")}</p>
      <div className="pn-pr"><span>{dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      {list.length ? list.map((p) => <Item key={p.id} state={state} p={p} k={k} update={update} onOpen={onOpen} />) : <p className="pn-free">{_t("Свободно")}</p>}
    </>
  );
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function PlanSheet({ state, update, p, k, onClose, onEdit }: { state: AppState; update: Up; p: Plan; k: string; onClose: () => void; onEdit: () => void }) {
  const done = isDone(p, k);
  const tomorrow = addDays(k, 1);
  return (
    <div className="pn-sheet-bg" onClick={onClose}>
      <div className="pn-sheet" role="dialog" aria-label={p.text} onClick={(e) => e.stopPropagation()}>
        <b className="pn-sheet-t">{p.text}</b>
        <small>{dayLabel(k)} · {whenLabel(state.settings, p, k) || _t("без времени")}</small>
        {p.note && <p className="pn-note">{p.note}</p>}
        <button type="button" className="pn-btn" onClick={() => { update((s) => toggleDone(s, p.id, k)); onClose(); }}>{done ? _t("Снять отметку") : _t("✓ Сделано")}</button>
        <div className="pn-sheet-row">
          <button type="button" className="ghost-btn" onClick={onEdit}>{_t("Изменить")}</button>
          {!p.repeat && <button type="button" className="ghost-btn" onClick={() => { update((s) => movePlan(s, p.id, tomorrow)); onClose(); }}>{_t("На завтра")}</button>}
        </div>
        <div className="pn-sheet-row">
          <a className="ghost-btn" href={planGoogle(state.settings, p, k)} target="_blank" rel="noreferrer">{_t("В Google Календарь")}</a>
          <button type="button" className="ghost-btn" onClick={() => download('plan.ics', planIcs(state.settings, p, k))}>{_t("В календарь телефона")}</button>
        </div>
        <button type="button" className="link-btn pn-del" onClick={() => { if (confirm(_t("Удалить план «{0}»?", p.text))) { update((s) => dropPlan(s, p.id)); onClose(); } }}>{_t("Удалить")}</button>
      </div>
    </div>
  );
}

type When = 'none' | 'time' | PlanAfter;
function PlanForm({ state, update, today, init, onDone }: { state: AppState; update: Up; today: string; init: { p?: Plan; date: string }; onDone: () => void }) {
  const p0 = init.p;
  const [text, setText] = useState(p0?.text ?? '');
  const [date, setDate] = useState(p0?.date ?? init.date);
  const [week, setWeek] = useState(Boolean(p0?.week));
  const [when, setWhen] = useState<When>(p0?.after ?? (p0?.time ? 'time' : 'none'));
  const [time, setTime] = useState(p0?.time ?? '09:00');
  const [remind, setRemind] = useState<'' | 'at' | 'h1'>(p0?.remind ?? '');
  const [list, setList] = useState(p0?.list ?? '');
  const [own, setOwn] = useState('');
  const [repeat, setRepeat] = useState<'' | PlanRepeat>(p0?.repeat ?? '');
  const [note, setNote] = useState(p0?.note ?? '');
  const lists = listsOf(state);
  const tmr = addDays(today, 1);
  const fri = new Date(`${date}T12:00:00`).getDay() === 5;
  const afters: PlanAfter[] = fri ? [...AFTERS.slice(0, 1), 'jumuah', ...AFTERS.slice(1)] : AFTERS;
  const save = () => {
    const t = text.trim(); if (!t) return;
    const lst = (own.trim() || list).slice(0, 30) || undefined;
    const rec: Plan = {
      id: p0?.id ?? pid(), text: t.slice(0, 200), date: week ? addDays(weekStart(date), 6) : date, made: p0?.made ?? Date.now(), upd: Date.now(), done: p0?.done,
      ...(week ? { week: true } : {}),
      ...(!week && when === 'time' ? { time } : {}),
      ...(!week && when !== 'none' && when !== 'time' ? { after: when === 'jumuah' && !fri ? 'dhuhr' : when } : {}),
      ...(!week && when !== 'none' && remind ? { remind } : {}),
      ...(lst ? { list: lst } : {}),
      ...(repeat && !week ? { repeat } : {}),
      ...(note.trim() ? { note: note.trim().slice(0, 1000) } : {}),
    };
    update((s) => {
      let n = setPlans(s, (l) => (p0 ? l.map((x) => (x.id === rec.id ? rec : x)) : [...l, rec]));
      if (own.trim() && !lists.includes(own.trim())) n = { ...n, plansSet: { ...(n.plansSet ?? {}), lists: [...lists, own.trim().slice(0, 30)] } };
      return n;
    });
    onDone();
  };
  const Chip = ({ on: o, label, click }: { on: boolean; label: string; click: () => void }) => <button type="button" className={`pn-chip${o ? ' on' : ''}`} aria-pressed={o} onClick={click}>{label}</button>;
  return (
    <div className="pn-form">
      <button type="button" className="link-btn left" onClick={onDone}>← {_t("Планы")}</button>
      <h2 className="pn-h">{p0 ? _t("Изменить план") : _t("Новый план")}</h2>
      <label className="pn-lbl" htmlFor="pn-t">{_t("Что сделать")}</label>
      <input id="pn-t" className="pn-in" value={text} maxLength={200} autoFocus={!p0} onChange={(e) => setText(e.target.value)} placeholder={_t("Например, забронировать отель")} />
      <div className="pn-lbl">{_t("Когда")}</div>
      <div className="pn-chips">
        <Chip on={!week && date === today} label={_t("Сегодня")} click={() => { setWeek(false); setDate(today); }} />
        <Chip on={!week && date === tmr} label={_t("Завтра")} click={() => { setWeek(false); setDate(tmr); }} />
        <Chip on={week} label={_t("На неделе")} click={() => { setWeek(true); setDate(today); }} />
        <label className={`pn-chip${!week && date !== today && date !== tmr ? ' on' : ''}`}>📅 {!week && date !== today && date !== tmr ? dayLabel(date, { day: 'numeric', month: 'short' }) : _t("Дата…")}
          <input type="date" className="pn-date" min={today} value={date} onChange={(e) => { if (e.target.value) { setWeek(false); setDate(e.target.value); } }} />
        </label>
      </div>
      {!week && (
        <>
          <div className="pn-lbl">{_t("Время")}</div>
          <div className="pn-chips">
            <Chip on={when === 'none'} label={_t("Без времени")} click={() => setWhen('none')} />
            <Chip on={when === 'time'} label={when === 'time' ? `🕐 ${time}` : _t("🕐 К часу…")} click={() => setWhen('time')} />
            {afters.map((a) => <Chip key={a} on={when === a} label={afterLabel(a).replace(/^./, (c) => c.toUpperCase())} click={() => setWhen(a)} />)}
          </div>
          {when === 'time' && <input type="time" className="pn-in pn-time" value={time} onChange={(e) => setTime(e.target.value || '09:00')} />}
          {when !== 'none' && (
            <>
              <div className="pn-lbl">{_t("Напомнить")}</div>
              <div className="pn-chips">
                <Chip on={!remind} label={_t("Нет")} click={() => setRemind('')} />
                <Chip on={remind === 'at'} label={when === 'time' ? _t("⏰ В это время") : when === 'jumuah' ? _t("⏰ Через час после Джумы") : _t("⏰ Через 30 мин после намаза")} click={() => setRemind('at')} />
                <Chip on={remind === 'h1'} label={_t("За 1 час")} click={() => setRemind('h1')} />
              </div>
            </>
          )}
        </>
      )}
      <div className="pn-lbl">{_t("Список")}</div>
      <div className="pn-chips">
        {lists.map((l) => <Chip key={l} on={list === l && !own} label={l} click={() => { setOwn(''); setList(list === l ? '' : l); }} />)}
        <input className={`pn-chip pn-own${own ? ' on' : ''}`} value={own} maxLength={30} placeholder={_t("+ свой")} onChange={(e) => setOwn(e.target.value)} aria-label={_t("Свой список")} />
      </div>
      {!week && (
        <>
          <div className="pn-lbl">{_t("Повтор")}</div>
          <div className="pn-chips">
            <Chip on={!repeat} label={_t("Один раз")} click={() => setRepeat('')} />
            <Chip on={repeat === 'day'} label={_t("Каждый день")} click={() => setRepeat('day')} />
            <Chip on={repeat === 'week'} label={_t("Каждую неделю")} click={() => setRepeat('week')} />
            <Chip on={repeat === 'month'} label={_t("Каждый месяц")} click={() => setRepeat('month')} />
          </div>
        </>
      )}
      <div className="pn-lbl">{_t("Заметка")}</div>
      <textarea className="pn-in" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={_t("Ссылка, телефон, детали…")} />
      <button type="button" className="pn-btn" disabled={!text.trim()} onClick={save}>{_t("Сохранить")}</button>
      {remind && !state.settings.reminders?.on && <p className="tiny ai-err-t">{_t("Уведомления на этом телефоне выключены: напоминание будет видно только в приложении. Включи их в Профиль → Напоминания.")}</p>}
      {remind && <p className="tiny">{_t("План с напоминанием появится и в «Мои напоминания».")}</p>}
    </div>
  );
}

function PlansSettings({ state, update, onBack }: { state: AppState; update: Up; onBack: () => void }) {
  const ps = state.plansSet ?? {};
  const set = (patch: Partial<typeof ps>) => update((s) => ({ ...s, plansSet: { ...(s.plansSet ?? {}), ...patch } }));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const cloud = ps.store === 'cloud';
  const errText = (e: string) => (e === 'nosql' ? _t("Облако для планов ещё не включено на сервере. Скоро заработает, а пока планы хранятся на телефоне.") : e === 'signin' ? _t("Чтобы хранить планы в облаке, войди по почте: Профиль → Аккаунт.") : _t("Нет связи с сервером. Попробуй ещё раз."));
  const toCloud = async () => {
    if (!signedIn()) { setMsg(errText('signin')); return; }
    setBusy(true); setMsg('');
    const r = await syncPlans(state.plans ?? [], state.settings);
    setBusy(false);
    if ('err' in r) { setMsg(errText(r.err)); return; }
    update((s) => ({ ...s, plans: r.plans, plansSet: { ...(s.plansSet ?? {}), store: 'cloud' } }));
    setMsg(_t("Готово: планы в облаке."));
  };
  const toPhone = () => { set({ store: 'phone', ics: undefined }); icsOff(); setMsg(_t("Планы хранятся только на этом телефоне. Копия в облаке больше не обновляется.")); };
  const sub = async (where: 'google' | 'apple' | 'link') => {
    setBusy(true); setMsg('');
    const k = ps.ics || (await icsKey());
    setBusy(false);
    if (typeof k !== 'string') { setMsg(errText(k.err)); return; }
    if (!ps.ics) set({ ics: k });
    if (where === 'google') window.open(googleSubUrl(k), '_blank');
    else if (where === 'apple') location.href = webcalUrl(k);
    else { try { await navigator.clipboard.writeText(icsUrl(k)); setMsg(_t("Ссылка скопирована. Вставь её в календаре: «Добавить календарь по ссылке».")); } catch { setMsg(icsUrl(k)); } }
  };
  return (
    <div className="pn-form">
      <button type="button" className="link-btn left" onClick={onBack}>← {_t("Планы")}</button>
      <h2 className="pn-h">{_t("Настройки планов")}</h2>
      <div className="pn-priv"><b>🔒 {_t("Твои планы только твои")}</b><p>{_t("Хранятся на твоём телефоне. Мы не передаём их Google и никому другому и не показываем по ним рекламу.")}</p></div>
      <div className="pn-lbl">{_t("Где хранить планы")}</div>
      <button type="button" className={`pn-opt${!cloud ? ' on' : ''}`} onClick={toPhone}><i /><span><b>{_t("Только на этом телефоне")}</b><small>{_t("Никто, кроме тебя, их не видит. Если сменишь телефон, планы не перейдут.")}</small></span></button>
      <button type="button" className={`pn-opt${cloud ? ' on' : ''}`} disabled={busy} onClick={toCloud}><i /><span><b>{_t("В облаке Living Muslim")}</b><small>{_t("Наше закрытое хранилище, не Google. Видны только тебе, на всех твоих устройствах после входа по почте.")}</small></span></button>
      <div className="pn-lbl">{_t("Показывать в календаре телефона")}</div>
      <div className="pn-opt pn-opt-s"><span className="ic">📅</span><span><b>{_t("Подписка на мои планы")}</b>
        <small>{_t("По желанию. Если включишь, календарь Google, Apple или Outlook будет видеть планы и намазы, которые ты туда отправишь. Обновляется само, в одну сторону.")}</small>
        {cloud ? (
          <span className="pn-sub-btns">
            <button type="button" className="ghost-btn" disabled={busy} onClick={() => sub('google')}>Google</button>
            <button type="button" className="ghost-btn" disabled={busy} onClick={() => sub('apple')}>Apple</button>
            <button type="button" className="ghost-btn" disabled={busy} onClick={() => sub('link')}>{_t("Ссылка")}</button>
          </span>
        ) : <small className="pn-need">{_t("Работает, когда планы в облаке.")}</small>}
        {cloud && ps.ics && <button type="button" className="link-btn left" onClick={async () => { const k = await icsKey(true); if (typeof k === 'string') { set({ ics: k }); setMsg(_t("Старая ссылка больше не работает. Подпишись заново.")); } }}>{_t("Сменить ссылку")}</button>}
      </span></div>
      <div className="pn-opt pn-opt-s"><span className="ic">➕</span><span><b>{_t("Кнопка «В календарь» у каждого плана")}</b><small>{_t("Открой план и нажми «В Google Календарь» или «В календарь телефона».")}</small></span></div>
      <div className="pn-lbl">{_t("Также")}</div>
      <button type="button" className={`pn-opt pn-tog${ps.prayers !== false ? ' on' : ''}`} onClick={() => set({ prayers: ps.prayers === false })}><span className="ic">🕌</span><span><b>{_t("Показывать намазы в Планах")}</b><small>{ps.prayers !== false ? _t("Включено") : _t("Выключено")}</small></span></button>
      {msg && <p className="tiny pn-msg">{msg}</p>}
    </div>
  );
}

/** Keeps plans in the cloud up to date: on start and a few seconds after each change. */
export function usePlansCloud(state: AppState, update: Up) {
  const cloud = state.plansSet?.store === 'cloud';
  const sig = cloud ? JSON.stringify((state.plans ?? []).map((p) => [p.id, p.upd])) : '';
  useEffect(() => {
    if (!cloud || !signedIn()) return;
    const t = setTimeout(async () => {
      const r = await syncPlans(state.plans ?? [], state.settings);
      if ('err' in r) return;
      const same = JSON.stringify(r.plans.map((p) => [p.id, p.upd]).sort()) === JSON.stringify((state.plans ?? []).map((p) => [p.id, p.upd]).sort());
      if (!same) update((s) => ({ ...s, plans: r.plans }));
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, sig]);
}

export const todayKey = () => keyOf(new Date());
