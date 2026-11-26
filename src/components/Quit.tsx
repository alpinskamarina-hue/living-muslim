import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { addDays, plural } from '../dates';
import { limitOf } from '../plan';
import { Advice, ProGate } from './Plan';
import {
  activeQuits, answeredToday, bestRun, cleanDays, dayMarks, newQuitId, nextMilestone, quitsOf, slippedToday,
  TEMPLATES, TRIGGERS, triggerMap, updQuit, urgesThisWeek, type Quit,
} from '../quit';
import { _t, isEn } from '../i18n';
import { useSec } from '../usage';

// «Хочу оставить»: setup, the habit screen, «Тянет» (ten minutes to ride out the urge), tawba after a slip, the slip map.
// Everything stays on the device; the circle never sees it.

type Update = (fn: (s: AppState) => AppState) => void;
export type QuitView = 'list' | 'setup' | 'home' | 'sos' | 'tawba' | 'map';
const days = (n: number) => plural(n, _t("день"), _t("дня"), _t("дней"));
const times = (n: number) => (isEn ? (n === 1 ? 'time' : 'times') : plural(n, 'раз', 'раза', 'раз'));

function Shield() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z" /></svg>;
}

/** Today: one quiet line per habit being left. */
export function QuitToday({ state, today, onOpen }: { state: AppState; today: string; onOpen: (id: string) => void }) {
  const list = activeQuits(state);
  if (!list.length) return null;
  return (
    <>
      {list.map((q) => {
        const n = cleanDays(q, today), u = urgesThisWeek(q, today), b = bestRun(q, today);
        return (
          <button key={q.id} type="button" className="qt-line" onClick={() => onOpen(q.id)}>
            <i><Shield /></i>
            <span>
              <small>{_t("Хочу оставить")}</small>
              <b>{_t("{0}: {1} {2}", q.what, n, days(n))}</b>
              <em>{[u ? _t("Устоял {0} {1} на этой неделе", u, times(u)) : '', b > n ? _t("лучшая серия {0}", b) : ''].filter(Boolean).join(' · ') || _t("Видишь только ты")}</em>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        );
      })}
    </>
  );
}

/** Evening, next to the muhasaba: one question per habit, answered once a day. */
export function QuitCheck({ state, update, today, onSlip }: { state: AppState; update: Update; today: string; onSlip: (id: string) => void }) {
  const list = activeQuits(state).filter((q) => !answeredToday(q, today) && q.start <= today);
  if (!list.length) return null;
  return (
    <>
      {list.map((q) => (
        <div key={q.id} className="qt-check">
          <small>{_t("Вечером, в мухасабе")}</small>
          <b>{_t("Сегодня без «{0}»?", q.what)}</b>
          <div>
            <button type="button" className="qt-yes" onClick={() => update((s) => updQuit(s, q.id, (x) => ({ ...x, clean: [...x.clean.filter((d) => d !== today), today].slice(-400) })))}>{_t("Да, удержался")}</button>
            <button type="button" className="qt-no" onClick={() => onSlip(q.id)}>{_t("Сорвался")}</button>
          </div>
          <small>{_t("Только ты видишь этот вопрос.")}</small>
        </div>
      ))}
    </>
  );
}

/** Full-screen: list, setup, the habit, «Тянет», tawba, map. */
export function QuitScreen({ state, update, today, start, onClose }: { state: AppState; update: Update; today: string; start: { id?: string; view?: QuitView }; onClose: () => void }) {
  useSec('quit');
  const all = activeQuits(state);
  const [id, setId] = useState<string | undefined>(start.id ?? (all.length === 1 ? all[0].id : undefined));
  const [view, setView] = useState<QuitView>(start.view ?? (start.id || all.length === 1 ? 'home' : all.length ? 'list' : 'setup'));
  const [edit, setEdit] = useState<Quit | null>(null);
  const q = quitsOf(state).find((x) => x.id === id);
  const back = () => (all.length > 1 ? setView('list') : onClose());

  if (view === 'setup' || !q && view !== 'list') {
    return <Setup state={state} today={today} edit={edit} onCancel={() => { setEdit(null); if (q) setView('home'); else if (all.length) setView('list'); else onClose(); }}
      onSave={(nq) => { update((s) => (quitsOf(s).some((x) => x.id === nq.id) ? updQuit(s, nq.id, () => nq) : { ...s, quits: [...quitsOf(s), nq] })); setEdit(null); setId(nq.id); setView('home'); }} />;
  }
  if (view === 'list' || !q) {
    return (
      <div className="qt-page">
        <div className="qt-top"><button type="button" className="link-btn" onClick={onClose}>{_t("← Назад")}</button></div>
        <h1 className="qt-h">{_t("Хочу оставить")}</h1>
        <p className="qt-sub">{_t("Видишь только ты. Круг и друзья этого не знают.")}</p>
        {all.map((x) => { const n = cleanDays(x, today); return (
          <button key={x.id} type="button" className="qt-line" onClick={() => { setId(x.id); setView('home'); }}>
            <i><Shield /></i><span><b>{x.what}</b><em>{_t("Чистых дней: {0}", n)}</em></span><span aria-hidden="true">›</span>
          </button>
        ); })}
        {all.length >= limitOf('quits') ? <ProGate k="quits" have={all.length} /> : <button type="button" className="ghost-btn qt-add" onClick={() => { setEdit(null); setView('setup'); }}>{_t("+ Ещё одна привычка")}</button>}
      </div>
    );
  }
  if (view === 'sos') return <Sos q={q} onDone={(ok) => { if (ok) { update((s) => updQuit(s, q.id, (x) => ({ ...x, urges: [...x.urges, { day: today, at: Date.now() }].slice(-500) }))); setView('home'); } else setView('tawba'); }} onExit={() => setView('home')} />;
  if (view === 'tawba') return <Tawba q={q} state={state} update={update} today={today} onDone={() => setView('home')} />;
  if (view === 'map') return <QMap q={q} onBack={() => setView('home')} />;
  return <Home q={q} update={update} today={today} onBack={back} go={setView} onAdd={() => { setEdit(null); setId(undefined); setView('setup'); }} onEdit={() => { setEdit(q); setView('setup'); }} onArchived={() => { setId(undefined); if (all.length > 1) setView('list'); else onClose(); }} />;
}

function Setup({ state, today, edit, onCancel, onSave }: { state: AppState; today: string; edit: Quit | null; onCancel: () => void; onSave: (q: Quit) => void }) {
  const [what, setWhat] = useState(edit?.what ?? '');
  const [niyya, setNiyya] = useState(edit?.niyya ?? '');
  const [trig, setTrig] = useState<string[]>(edit?.triggers ?? []);
  const [instead, setInstead] = useState(edit?.instead ?? '');
  const [bars, setBars] = useState<{ t: string; done: boolean }[]>(edit?.barriers ?? []);
  const [own, setOwn] = useState('');
  const [custom, setCustom] = useState(Boolean(edit && !TEMPLATES.some((t) => t.what === edit.what)));
  const active = activeQuits(state).length;
  if (!edit && active >= limitOf('quits')) {
    return (
      <div className="qt-page">
        <div className="qt-top"><button type="button" className="link-btn" onClick={onCancel}>{_t("← Назад")}</button></div>
        <h1 className="qt-h">{_t("Хочу оставить")}</h1>
        <ProGate k="quits" have={active} />
      </div>
    );
  }
  const pickT = (t: (typeof TEMPLATES)[number]) => {
    setCustom(false); setWhat(t.what); setTrig(t.triggers);
    if (!instead || TEMPLATES.some((x) => x.instead === instead)) setInstead(t.instead);
    setBars(t.barriers.map((b) => ({ t: b, done: false })));
  };
  const chips = [...new Set([...trig, ...TRIGGERS])];
  const ok = what.trim().length > 1;
  const save = () => onSave({
    id: edit?.id ?? newQuitId(), what: what.trim(), niyya: niyya.trim(), triggers: trig, instead: instead.trim(), barriers: bars.filter((b) => b.t.trim()),
    start: edit?.start ?? today, status: 'active', slips: edit?.slips ?? [], urges: edit?.urges ?? [], clean: edit?.clean ?? [],
  });
  return (
    <div className="qt-page qt-setup">
      <div className="qt-top">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{edit ? _t("Изменить план") : _t("Хочу оставить")}</b><small>{_t("Видишь только ты")}</small></div>
      </div>

      {!edit && <Advice k="quits" n={active} />}
      <h2 className="qt-h2">{_t("Что хочешь оставить?")}</h2>
      <div className="qt-chips">
        {TEMPLATES.map((t) => <button key={t.what} type="button" aria-pressed={!custom && what === t.what} onClick={() => pickT(t)}>{t.what}</button>)}
        <button type="button" className="dash" aria-pressed={custom} onClick={() => { setCustom(true); setWhat(''); }}>{_t("Своё…")}</button>
      </div>
      {custom && <input className="qt-in" value={what} onChange={(e) => setWhat(e.target.value)} placeholder={_t("Например: ругаться за рулём")} autoFocus />}

      <div className="qt-step">
        <label htmlFor="qt-niyya">{_t("Нийя: зачем мне это")}</label>
        <input id="qt-niyya" className="qt-in" value={niyya} onChange={(e) => setNiyya(e.target.value)} placeholder={_t("Например: чтобы вставать на Фаджр бодрым")} />
        <small>{_t("Эту фразу приложение покажет, когда будет тянуть.")}</small>
      </div>

      <div className="qt-step">
        <span className="qt-lab">{_t("Когда тянет сильнее всего")}</span>
        <div className="qt-chips sm">
          {chips.map((c) => <button key={c} type="button" aria-pressed={trig.includes(c)} onClick={() => setTrig(trig.includes(c) ? trig.filter((x) => x !== c) : [...trig, c])}>{c}</button>)}
        </div>
      </div>

      <div className="qt-step">
        <label htmlFor="qt-instead">{_t("Что делаю вместо")}</label>
        <input id="qt-instead" className="qt-in" value={instead} onChange={(e) => setInstead(e.target.value)} placeholder={_t("Например: стакан воды и прогулка")} />
        <span className="qt-lab">{_t("И как сделать труднее")}</span>
        {bars.map((b, i) => (
          <label key={i} className="qt-bar">
            <input type="checkbox" checked={b.done} onChange={() => setBars(bars.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
            <span>{b.t}</span>
            <button type="button" className="link-btn" aria-label={_t("Убрать")} onClick={(e) => { e.preventDefault(); setBars(bars.filter((_, j) => j !== i)); }}>✕</button>
          </label>
        ))}
        <div className="qt-own">
          <input className="qt-in" value={own} onChange={(e) => setOwn(e.target.value)} placeholder={_t("Своя преграда")} onKeyDown={(e) => { if (e.key === 'Enter' && own.trim()) { setBars([...bars, { t: own.trim(), done: false }]); setOwn(''); } }} />
          <button type="button" className="ghost-btn" disabled={!own.trim()} onClick={() => { setBars([...bars, { t: own.trim(), done: false }]); setOwn(''); }}>{_t("Добавить")}</button>
        </div>
        <small>{_t("Отметь галочкой то, что уже сделал.")}</small>
      </div>

      <button type="button" className="gold-btn qt-go" disabled={!ok} onClick={save}>{edit ? _t("Сохранить") : _t("Начать с сегодняшнего дня")}</button>
      <small className="qt-foot">{_t("Круг и друзья этого не видят.")}</small>
    </div>
  );
}

function Ring({ n, of, size = 112 }: { n: number; of: number; size?: number }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold-light, #e3b964)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.max(1, c * Math.min(1, n / of))} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function Home({ q, update, today, onBack, go, onAdd, onEdit, onArchived }: { q: Quit; update: Update; today: string; onBack: () => void; go: (v: QuitView) => void; onAdd: () => void; onEdit: () => void; onArchived: () => void }) {
  const n = cleanDays(q, today), best = bestRun(q, today), u = urgesThisWeek(q, today), m = nextMilestone(n);
  const marks = dayMarks(q, today);
  const map = triggerMap(q);
  const [sure, setSure] = useState(false);
  const yesterdaySlip = q.slips.some((s) => s.day === addDays(today, -1));
  const toggleBar = (i: number) => update((s) => updQuit(s, q.id, (x) => ({ ...x, barriers: x.barriers.map((b, j) => (j === i ? { ...b, done: !b.done } : b)) })));
  return (
    <div className="qt-page">
      <div className="qt-top"><button type="button" className="link-btn" onClick={onBack}>{_t("← Назад")}</button></div>
      <small className="qt-kick">{_t("Хочу оставить")}</small>
      <h1 className="qt-h">{q.what}</h1>
      {q.niyya && <p className="qt-niyya">«{q.niyya}»</p>}

      <div className="qt-ring">
        <div className="qt-ring-c"><Ring n={n} of={m} /><span><b>{n}</b><small>{_t("чистых {0}", plural(n, _t("день"), _t("дня"), _t("дней")))}</small></span></div>
        <div className="qt-ring-s">
          <span><b>{u}</b> {_t("{0} устоял на этой неделе", times(u))}</span>
          <span><b>{best}</b> {_t("лучшая серия")}</span>
          <small>{_t("Следующая веха: {0} {1}", m, days(m))}</small>
        </div>
      </div>

      <button type="button" className="qt-sos" onClick={() => go('sos')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4" /></svg>
        {_t("Тянет. Помоги переждать")}
      </button>

      {yesterdaySlip && !slippedToday(q, today) && <div className="qt-note">{_t("Вчера был срыв. Главное правило: не два дня подряд. Сегодня ты справишься, ин ша Аллах.")}</div>}

      <div className="qt-card">
        <span className="qt-lab">{_t("Последние 4 недели")}</span>
        <div className="qt-cal">{marks.map((d) => <i key={d.day} data-k={d.k} title={d.day} />)}</div>
        <div className="qt-legend">
          <span><i data-k="clean" />{_t("чистый день")}</span>
          <span><i data-k="urge" />{_t("устоял, хотя тянуло")}</span>
          <span><i data-k="slip" />{_t("срыв и тауба")}</span>
        </div>
      </div>

      <div className="qt-card">
        <span className="qt-lab">{_t("Мой план")} <button type="button" className="link-btn" onClick={onEdit}>{_t("Изменить")}</button></span>
        {q.instead && <p><b>{_t("Вместо:")}</b> {q.instead}</p>}
        {q.barriers.map((b, i) => (
          <label key={i} className="qt-bar"><input type="checkbox" checked={b.done} onChange={() => toggleBar(i)} /><span>{b.t}</span></label>
        ))}
        <p><b>{_t("Правило:")}</b> {_t("не срываться два дня подряд")}</p>
      </div>

      <button type="button" className="qt-maplink" onClick={() => go('map')}>
        <span><b>{_t("Карта срывов")}</b><small>{map.peak && map.events >= 3 ? _t("Чаще тянет: {0}", map.peak.t.toLowerCase()) : _t("Появится после нескольких отметок")}</small></span>
        <span aria-hidden="true">›</span>
      </button>

      {!slippedToday(q, today) && <button type="button" className="link-btn qt-slip" onClick={() => go('tawba')}>{_t("Сегодня сорвался")}</button>}
      <div className="qt-arch">
        {sure ? (
          <>
            <span>{_t("Убрать из списка? История останется на телефоне.")}</span>
            <button type="button" className="link-btn" onClick={() => { update((s) => updQuit(s, q.id, (x) => ({ ...x, status: 'archived' }))); onArchived(); }}>{_t("Да, убрать")}</button>
            <button type="button" className="link-btn" onClick={() => setSure(false)}>{_t("Отмена")}</button>
          </>
        ) : (
          <>
            <button type="button" className="link-btn" onClick={onAdd}>{_t("+ Ещё одна привычка")}</button>
            <button type="button" className="link-btn" onClick={() => setSure(true)}>{_t("Убрать привычку из списка")}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** «Тянет»: ten minutes with breathing, istighfar with a counter, the person's own replacement and niyya. */
function Sos({ q, onDone, onExit }: { q: Quit; onDone: (resisted: boolean) => void; onExit: () => void }) {
  const t0 = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [count, setCount] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const passed = Math.floor((now - t0.current) / 1000);
  const left = Math.max(0, 600 - passed);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  const inhale = passed % 10 < 4;
  const c = 2 * Math.PI * 94;
  const tap = () => { const n = count + 1; setCount(n); try { navigator.vibrate?.(n % 33 === 0 ? 120 : 12); } catch { /* */ } };
  return (
    <div className="sess qt-sossess">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Переждать 10 минут")}</b><small>{_t("Желание проходит, как волна")}</small></div>
      </div>
      <div className="qt-timer">
        <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true">
          <circle cx="105" cy="105" r="94" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="8" />
          <circle cx="105" cy="105" r="94" fill="none" stroke="var(--gold-light, #e3b964)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * (1 - left / 600)} ${c}`} transform="rotate(-90 105 105)" />
        </svg>
        <span className={`qt-breath${inhale ? ' in' : ''}`} aria-hidden="true" />
        <span className="qt-tt" role="timer"><b>{left ? `${mm}:${ss}` : _t("Прошло")}</b><small>{inhale ? _t("вдох…") : _t("выдох…")}</small></span>
      </div>
      <div className="qt-ist">
        <span className="ar" lang="ar" dir="rtl">أَسْتَغْفِرُ اللَّهَ</span>
        <small>{_t("Астагфируллах · нажимай на круг")}</small>
        <button type="button" className="qt-cnt" onClick={tap} aria-label={_t("Плюс один")}><b>{count % 33 || (count ? 33 : 0)}</b><small>{_t("из 33")}{count >= 33 ? ` · ×${Math.floor(count / 33)}` : ''}</small></button>
      </div>
      <div className="qt-help">
        <span className="qt-lab">{_t("Ещё помогает")}</span>
        <div className="qt-chips dark">
          <span>{_t("Сделать омовение")}</span>
          <span>{_t("Выйти пройтись")}</span>
          {q.instead && <span>{q.instead}</span>}
        </div>
        {q.niyya && <p className="qt-niyya">{_t("Твоя нийя: «{0}»", q.niyya)}</p>}
      </div>
      <div className="qt-sos-btns">
        <button type="button" className="gold-btn" onClick={() => onDone(true)}>{_t("Устоял, альхамдулиллях")}</button>
        <button type="button" className="qt-no-dark" onClick={() => onDone(false)}>{_t("Не удержался")}</button>
      </div>
    </div>
  );
}

const DEEDS = [_t("Садака"), _t("2 ракаата"), _t("Позвонить родителям"), _t("Страница Корана")];

/** After a slip: no shame. Istighfar, a good deed to follow it, and what came before (for the map). */
function Tawba({ q, update, today, onDone }: { q: Quit; state: AppState; update: Update; today: string; onDone: () => void }) {
  const [ist, setIst] = useState(0);
  const [deed, setDeed] = useState<string | null>(null);
  const [cause, setCause] = useState<string[]>([]);
  const had = cleanDays(q, today);
  const chips = [...new Set([...q.triggers, _t("Телефон был рядом"), _t("Лёг поздно"), _t("Плохое настроение"), ...TRIGGERS])].slice(0, 10);
  const finish = () => {
    update((s) => updQuit(s, q.id, (x) => {
      const others = x.slips.filter((sl) => sl.day !== today);
      return { ...x, clean: x.clean.filter((d) => d !== today), slips: [...others, { day: today, at: Date.now(), cause }].sort((a, b) => a.at - b.at).slice(-500) };
    }));
    onDone();
  };
  return (
    <div className="qt-page qt-tawba">
      <div className="qt-top"><button type="button" className="icon-btn" onClick={finish} aria-label={_t("Закрыть")}>✕</button><b>{_t("Тауба")}</b></div>
      <div className="qt-tw-head">
        <h1 className="qt-h">{_t("Ты вернулся, и это главное")}</h1>
        <p>{had > 0 ? _t("Двери покаяния открыты. {0} {1}, которые ты уже прошёл, никуда не делись: они записаны.", had, days(had)) : _t("Двери покаяния открыты. Каждый новый день можно начать заново.")}</p>
      </div>
      <div className="qt-tw-ist">
        <span className="ar" lang="ar" dir="rtl">أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ</span>
        <small>{_t("Астагфируллаха ва атубу иляйх · 3 раза")}</small>
        <button type="button" className="gold-btn" onClick={() => setIst(Math.min(3, ist + 1))}>{ist >= 3 ? _t("Сказал ✓") : _t("Сказал {0} из 3", ist)}</button>
      </div>
      <div className="qt-tw-deed">
        <p><b>{_t("Вслед за плохим сделай хорошее, и оно сотрёт его.")}</b> <span>{_t("(ат-Тирмизи, 1987)")}</span></p>
        <div className="qt-chips">{DEEDS.map((d) => <button key={d} type="button" aria-pressed={deed === d} onClick={() => setDeed(deed === d ? null : d)}>{d}</button>)}</div>
      </div>
      <div className="qt-step">
        <span className="qt-lab">{_t("Что было перед этим?")}</span>
        <div className="qt-chips sm">{chips.map((c) => <button key={c} type="button" aria-pressed={cause.includes(c)} onClick={() => setCause(cause.includes(c) ? cause.filter((x) => x !== c) : [...cause, c])}>{c}</button>)}</div>
        <small>{_t("Из этих ответов складывается карта срывов.")}</small>
      </div>
      <div className="qt-note">{_t("Главное правило: не срываться два дня подряд. Завтра снова чистый день.")}</div>
      <button type="button" className="pri-btn qt-go" onClick={finish}>{_t("Начать заново с завтрашнего дня")}</button>
    </div>
  );
}

function QMap({ q, onBack }: { q: Quit; onBack: () => void }) {
  const m = triggerMap(q);
  const max = Math.max(1, ...m.byTime.map((b) => b.n));
  const top = m.causes[0];
  return (
    <div className="qt-page">
      <div className="qt-top"><button type="button" className="link-btn" onClick={onBack}>{_t("← Назад")}</button></div>
      <h1 className="qt-h">{_t("Карта срывов")}</h1>
      <p className="qt-sub">{_t("Срывов: {0} · устоял: {1} {2}", q.slips.length, q.urges.length, times(q.urges.length))}</p>
      {m.events < 3 ? (
        <div className="qt-card"><p>{_t("Карта появится, когда будет хотя бы 3 отметки: нажатия «Тянет» или срывы. Чем честнее отметки, тем точнее подсказки.")}</p></div>
      ) : (
        <>
          <div className="qt-card">
            <span className="qt-lab">{_t("Когда тянет")}</span>
            <div className="qt-bars">
              {m.byTime.map((b) => (
                <div key={b.id}><i style={{ height: `${Math.max(6, (b.n / max) * 110)}px` }} data-hot={b.n === max ? '1' : undefined} /><small>{b.t}</small></div>
              ))}
            </div>
          </div>
          {m.causes.length > 0 && (
            <div className="qt-card">
              <span className="qt-lab">{_t("Что было перед этим")}</span>
              {m.causes.slice(0, 5).map(([t, n]) => (
                <div key={t} className="qt-cause"><span>{t}</span><b>{n}</b><i><em style={{ width: `${(n / m.causes[0][1]) * 100}%` }} /></i></div>
              ))}
            </div>
          )}
          {m.peak && (
            <div className="qt-tip">
              <b>{_t("Подсказка")}</b>
              <p>{top ? _t("Чаще всего тянет: {0}, и перед срывом чаще всего «{1}». Поставь преграду именно на это время и место.", m.peak.t.toLowerCase(), top[0]) : _t("Чаще всего тянет: {0}. Поставь преграду именно на это время.", m.peak.t.toLowerCase())}</p>
            </div>
          )}
        </>
      )}
      <div className="qt-card soft">
        <span className="qt-lab">{_t("Напарник")}</span>
        <p>{_t("Скоро: один человек из круга, которому при «Тянет» придёт только «Просит дуа прямо сейчас», без подробностей.")}</p>
      </div>
    </div>
  );
}
