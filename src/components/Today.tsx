import { InstallBanner } from './InstallBanner';
import { ThemeSwitch } from './ThemeSwitch';
import type React from 'react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayLight, journey } from '../gamify';
import type { Anchor, AppState, Habit, Mark } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { atRisk, isCounted, setMark, streak, toggleHard } from '../store';
import { durationLabel, gregorianLabel, hhmm, hijriLabel, plural } from '../dates';
import { type DayTimes, windowState, windowStatus } from '../prayer';
import { HabitCard, Ticks } from './HabitCard';
import { Ornament } from './Ornament';
import { Lamps } from './Lamps';
import { LogoMark } from './Logo';
import { prayerCtl, TravelBar } from './PrayerStrip';
import { PlanItem, PlansLate } from './Plans';
import { blockOf, dayPlans, isDone } from '../plans';
import { activeQuits, cleanDays } from '../quit';
import { here, tripOn } from '../safar';
import { isReviewDay } from './Goals';
import { RamadanToday } from './Ramadan';
import { ramadanHidden, ramadanMode } from '../rplan';
import { _t, _tj, LOC } from '../i18n';
import { MosqueCard, QiblaChip, type QiblaTab } from './Mosques';
import { KhutbaCard } from './Khutba';
import { fridayWindow } from '../khutba';
import { aiName } from '../assistant';
import { forgiveLimit, isSister, mamaEasy, sisNow, toggleZk, zikrAt, zkDone } from '../sisters';
import { GhuslSheet, PrayerPick, SisBand, SisEnd, useSisSheets } from './Sisters';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  now: Date;
  times: DayTimes;
  onEdit: (h: Habit) => void;
  onAdd: (a: Anchor) => void;
  circleLine?: { names: string[]; onOpen: () => void };
  onSafar: () => void;
  onKhutba?: () => void;
  onAssistant?: () => void;
  firstWeek?: React.ReactNode;
  onGoal: (id: string) => void;
  onReview: () => void;
  onRamadan: (tab?: 'prep' | 'day' | 'fast' | 'quran' | 'nights' | 'eid') => void;
  onGarden: () => void;
  support?: { text: string; onOpen: () => void; cls?: string }[];
  plan?: React.ReactNode;
  /** Open «Хочу оставить» for one habit. */
  onQuit: (id: string) => void;
  /** Open the plans page. */
  onPlans: () => void;
  /** The evening question next to the muhasaba. */
  quitCheck?: React.ReactNode;
  /** Cards from outside (word of the day, gift a pass) that also go to «Главное сейчас». */
  notes?: React.ReactNode;
  onQibla: (tab: QiblaTab) => void;
  /** «Новый путь»: the path card, or the choice for someone new. */
  pathCard?: React.ReactNode;
  /** Open morning/evening adhkar or the Quran in Practice (a sister's dhikr on days without prayer). */
  onPractice?: (g: 'azkar' | 'quran') => void;
}

export function Today({ state, update, today, now, times, onEdit, onAdd, circleLine, onSafar, onKhutba, onAssistant, onReview, onRamadan, onGarden, support, firstWeek, plan, onQuit, onPlans, quitCheck, notes, onQibla, pathCard, onPractice }: Props) {
  const { current, next, end } = windowState(times, now);
  const [khHidden, setKhHidden] = useState(() => { try { return localStorage.getItem('lm.khutbaHide') ?? ''; } catch { return ''; } });
  const [open, setOpen] = useState<Anchor | null>(null);
  const onTrip = tripOn(state, today);
  const paused = onTrip ? state.trip?.paused ?? [] : [];
  const active = state.habits.filter((h) => h.status === 'active' && !paused.includes(h.id) && !ramadanHidden(state, h, today));
  const log = state.log[today] ?? {};
  const C = 163.4;
  const SEG = C / 5;
  const light = dayLight(state, today);
  const j = useMemo(() => journey(state, today), [state.log, state.prayers, state.hard, state.habits, state.trip, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Done habits fold away so the eye stays on what is still waiting. A fresh tick stays a moment, so the person sees it land.
  const [fresh, setFresh] = useState<string[]>([]);
  const [showDone, setShowDone] = useState<Anchor[]>([]);
  const mark = (id: string) => (m: Mark | null) => {
    update((s) => setMark(s, today, id, m));
    if (m && isCounted(m)) {
      setFresh((f) => [...f, id]);
      setTimeout(() => setFresh((f) => f.filter((x) => x !== id)), 1400);
    }
  };

  const title = next
    ? _t("{0} через {1}", ANCHOR_LABEL[next].ru, durationLabel(times[next].getTime() - now.getTime()))
    : _t("Все намазы дня прошли");
  const sub = current ? _t("Сейчас окно {0}", ANCHOR_LABEL[current].after.replace(_t("После"), _t("после"))) : _t("До Фаджра");

  const easy = mamaEasy(state);
  const renderCards = (a: Anchor) => {
    const list = active.filter((h) => h.anchor === a);
    if (!list.length)
      return (
        <button type="button" className="empty" onClick={() => onAdd(a)}>
          {_tj("+ Добавить привычку {0}", ANCHOR_LABEL[a].after.replace(_t("После"), _t("после")))}
        </button>
      );
    const card = (h: Habit) => (
      <HabitCard
        key={h.id}
        habit={h}
        mark={log[h.id]}
        streak={streak(state, h, today)}
        risk={atRisk(state, h, today)}
        onMark={mark(h.id)}
        onOpen={() => onEdit(h)}
        ramadanMin={ramadanMode(state, h, today) === 'min'}
        easyMin={easy}
      />
    );
    const done = list.filter((h) => isCounted(log[h.id]) && !fresh.includes(h.id));
    const todo = list.filter((h) => !done.includes(h));
    const shown = showDone.includes(a);
    const flip = () => setShowDone((x) => (shown ? x.filter((y) => y !== a) : [...x, a]));
    return (
      <div className="cards">
        {todo.map(card)}
        {done.length > 0 && (
          <button type="button" className={`done-fold${todo.length ? '' : ' all'}`} aria-expanded={shown} onClick={flip}>
            <Ticks />
            <span><b>{todo.length ? _t("Сделано") : _t("Всё сделано")}</b>{!shown && <small>{done.map((h) => h.action).join(' · ')}</small>}</span>
            <i aria-hidden="true">{shown ? _t("скрыть") : _t("показать")}</i>
          </button>
        )}
        {shown && done.map(card)}
      </div>
    );
  };

  const nowAnchor: Anchor = current ?? 'fajr';
  const sky = skyOf(times, now);
  const prayedToday = ANCHORS.filter((a) => state.prayers[today]?.[a]).length;
  const hardOn = (state.hard[today] ?? []).includes(nowAnchor);
  const pc = prayerCtl({ state, update, today, now, times });
  // Sisters: a tap on a prayer circle opens a choice with «Дни без намаза»; on those days circles are moons with a dhikr.
  const sister = isSister(state);
  const sd = sisNow(state);
  const ss = useSisSheets();
  const dotTap = (a: Anchor) => (sd ? update((s) => toggleZk(s, today, a)) : sister ? ss.setPick(a) : pc.tap(a));
  // A few days of marking teach the circles; the hint goes away then.
  const newToPrayers = Object.keys(state.prayers).filter((k) => Object.keys(state.prayers[k] ?? {}).length).length < 3;
  const evening = current === 'isha' || current === 'maghrib';

  // Plans stand at their prayer; without a time, at the current one. A plan ticked just now stays a moment.
  const [freshPlans, setFreshPlans] = useState<string[]>([]);
  const tickPlan = (id: string, done: boolean) => {
    if (!done) return;
    setFreshPlans((f) => [...f, id]);
    setTimeout(() => setFreshPlans((f) => f.filter((x) => x !== id)), 1400);
  };
  const dayList = dayPlans(state, today).filter((p) => !isDone(p, today) || freshPlans.includes(p.id));
  const plansAt = (a: Anchor) => dayList.filter((p) => (blockOf(state.settings, p, today) ?? nowAnchor) === a);
  const quitList = activeQuits(state);
  const khutbaOn = Boolean(onKhutba && fridayWindow(now, times.asr) && khHidden !== today);

  // Everything that is not the day itself: one card at a time in «Главное сейчас», most pressing first.
  const slot = [
    <RamadanToday key="rm" state={state} update={update} today={today} now={now} times={times} onOpen={onRamadan} />,
    khutbaOn && onKhutba && <KhutbaCard key="kh" onOpen={onKhutba} onHide={() => { try { localStorage.setItem('lm.khutbaHide', today); } catch { /* */ } setKhHidden(today); }} />,
    <MosqueCard key="mq" state={state} update={update} today={today} now={now} times={times} next={next} onOpen={onQibla} />,
    plan ? <Fragment key="pl">{plan}</Fragment> : null,
    firstWeek ? <Fragment key="fw">{firstWeek}</Fragment> : null,
    isReviewDay(state, today) && (
      <button key="rv" type="button" className="g-review-cta" onClick={onReview} style={{ margin: '10px 14px 0', width: 'calc(100% - 28px)' }}>
        <b>{_t("Пересмотр недели")}</b><small>{_t("Пятница. 2 минуты: что продвинулось и какой шаг на неделю")}</small>
      </button>
    ),
    <PlansLate key="late" state={state} update={update} today={today} onOpen={onPlans} />,
    ...(support ?? []).map((x, i) => (
      <button key={`sp${i}`} type="button" className={`circle-line support${x.cls ? ` ${x.cls}` : ""}`} onClick={x.onOpen}>
        <span>{x.text}</span><span aria-hidden="true">›</span>
      </button>
    )),
    circleLine && (
      <button key="cl" type="button" className="circle-line" onClick={circleLine.onOpen}>
        <span><b>{circleLine.names.slice(0, 2).join(_t(" и "))}</b>{_tj("{0} уже {1} сегодня", circleLine.names.length > 2 ? _t(" и ещё {0}", circleLine.names.length - 2) : '', circleLine.names.length > 1 ? _t("отметились") : _t("отметился"))}</span>
        <span aria-hidden="true">›</span>
      </button>
    ),
    (j.streak > 0 || j.lit > 0) && (
      <button key="st" type="button" className="streak-line" onClick={onGarden}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V11M12 11C12 7 9 5 5 5c0 4 3 6 7 6zM12 14c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" /></svg>
        <span>
          <b>{j.streak > 0 ? _t("Серия {0} {1}", j.streak, plural(j.streak, _t("день"), _t("дня"), _t("дней"))) : _t("Начни серию сегодня")}</b>
          <small>
            {j.pausedToday ? _t("Сегодня пауза: серия не сгорит") : j.litToday ? _t("Сегодня засчитан, машаАллах") : j.repairLeft ? (forgiveLimit(state) > 1 ? _t("Пропуски простятся: до 3 в неделю") : _t("Один пропуск в неделю простится")) : _t("Пропуск на этой неделе уже был: сегодня важно")}
          </small>
        </span>
        <i aria-hidden="true">›</i>
      </button>
    ),
    notes ? <Fragment key="nt">{notes}</Fragment> : null,
    <InstallBanner key="ib" />,
  ];

  const quitChip = (q: (typeof quitList)[number]) => {
    const n = cleanDays(q, today);
    return (
      <button key={q.id} type="button" className="dl-chip q" onClick={() => onQuit(q.id)}>
        🛡 {_t("{0}: {1} {2}", q.what, n, plural(n, _t("день"), _t("дня"), _t("дней")))}
      </button>
    );
  };

  // One prayer of the day: its circle (mark the prayer), what belongs to it, and the current one open.
  const node = (a: Anchor) => {
    const cur = a === nowAnchor;
    const st = cur ? 'now' : windowStatus(a, current);
    const list = active.filter((h) => h.anchor === a);
    const done = list.filter((h) => isCounted(log[h.id])).length;
    const pl = plansAt(a);
    const qs = a === 'isha' ? quitList : [];
    const expanded = cur || open === a;
    const m = pc.day[a];
    const locked = !pc.unlocked(a) && !m;
    const undone = list.some((h) => !isCounted(log[h.id]));
    const zk = sd ? zikrAt(state, a) : null;
    const sum = list.length
      ? (done === list.length ? <span className="tk"><Ticks />{_tj("{0} из {1}", done, list.length)}</span> : <span className="n">{done}/{list.length}</span>)
      : pl.length ? <span className="n">{_t("{0} {1}", pl.length, plural(pl.length, _t("план"), _t("плана"), _t("планов")))}</span> : null;
    return (
      <div key={a} className={`dl-node ${st}${expanded ? ' open' : ''}`}>
        {sd ? (
          <button type="button" className="dl-dot" data-m={zkDone(state, today, a) ? 'zk' : m ?? 'moon'} disabled={locked} onClick={() => dotTap(a)}
            aria-label={`${ANCHOR_LABEL[a].ru}: ${zkDone(state, today, a) ? _t("зикр сделан") : _t("время зикра")}`}>
            {zkDone(state, today, a) || m ? <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 6.5l3 3 7-8" /></svg> : <span className="moon">☾</span>}
          </button>
        ) : (
        <button type="button" className="dl-dot" data-m={m ?? (locked ? 'locked' : 'none')} disabled={locked} onClick={() => dotTap(a)}
          aria-label={`${ANCHOR_LABEL[a].ru}: ${m === 'ontime' ? _t("вовремя") : m === 'late' ? _t("с опозданием") : _t("не отмечен")}`}>
          {m === 'ontime' && <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M1 6.5l3 3 6-7M7 9.5l1 .5 7-8" /></svg>}
          {m === 'late' && <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 6.5l3 3 7-8" /></svg>}
          {!m && <span className="ar">{ANCHOR_LABEL[a].ar}</span>}
        </button>
        )}
        <div className="dl-main">
          {cur ? (
            <div className="dl-h">
              <span><b>{ANCHOR_LABEL[a].ru}</b><small>{current ? _t("сейчас · до {0}", hhmm(end(a))) : _t("скоро · {0}", hhmm(times.fajr))}</small></span>
              {!sd && (hardOn || undone) && (
                <button type="button" className="hard" aria-pressed={hardOn} onClick={() => update((s) => toggleHard(s, today, nowAnchor))}>{_t("Тяжёлый день")}</button>
              )}
            </div>
          ) : (
            <button type="button" className="dl-h" onClick={() => setOpen(open === a ? null : a)} aria-expanded={expanded}>
              <span><b>{ANCHOR_LABEL[a].ru}</b><small>{hhmm(times[a])}</small></span>
              {sum}
            </button>
          )}
          {sd && zk && !locked && (
            <button type="button" className={`dl-zk${zkDone(state, today, a) ? ' ok' : ''}`}
              onClick={() => (zk.go && !zkDone(state, today, a) && onPractice ? (update((s) => toggleZk(s, today, a)), onPractice(zk.go)) : update((s) => toggleZk(s, today, a)))}>
              {zkDone(state, today, a) ? `✓ ${zk.t}` : _tj("{0} · {1} мин", zk.t, zk.m)}
            </button>
          )}
          {!expanded && (list.length > 0 || pl.length > 0 || qs.length > 0) && (
            <div className="dl-chips">
              {list.map((h) => <span key={h.id} className={`dl-chip${isCounted(log[h.id]) ? ' ok' : ''}`}>{isCounted(log[h.id]) ? '✓ ' : ''}{h.action}</span>)}
              {pl.map((p) => <span key={p.id} className="dl-chip pl">☐ {p.text}</span>)}
              {qs.map(quitChip)}
            </div>
          )}
          {expanded && (
            <div className="dl-box">
              {(list.length > 0 || cur || (pl.length === 0 && qs.length === 0)) && renderCards(a)}
              {pl.length > 0 && (
                <div className="dl-plans">
                  {pl.map((p) => <PlanItem key={p.id} state={state} p={p} k={today} update={update} onOpen={onPlans} onTick={tickPlan} />)}
                </div>
              )}
              {qs.length > 0 && <div className="dl-chips">{qs.map(quitChip)}</div>}
              {cur && undone && <div className="dl-tip">{_t("Касание по кружку — сделал. Свайп влево — минимум или позже. Касание по названию — изменить.")}</div>}
              {cur && evening && quitCheck}
              {cur && evening && active.length > 0 && (
                <Muhasaba value={state.notes[today] ?? ''} onChange={(v) => update((s) => ({ ...s, notes: { ...s.notes, [today]: v } }))} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="top sky" data-sky={sky}>
        <Ornament />
        <Lamps prayed={prayedToday} />
        <div className="d">
          <LogoMark size={18} />{gregorianLabel(now)} · {hijriLabel(now)}
          <ThemeSwitch state={state} update={update} times={times} />
        </div>
        <div className="row">
          <div className="top-main">
            {next ? <Countdown to={times[next]} label={ANCHOR_LABEL[next].after.replace(_t("После"), _t("До"))} /> : <b>{title}</b>}
            <small>{sub} · {here(state, today).place}<button type="button" className="safar-chip" onClick={onSafar}>{onTrip ? _t("🧭 в пути") : _t("🧭 Сафар")}</button><QiblaChip state={state} today={today} onOpen={() => onQibla('qibla')} />{onAssistant && <button type="button" className="safar-chip ai-chip" onClick={onAssistant}>✨ {aiName(state.settings)}</button>}</small>
          </div>
          <button type="button" className="ring light" onClick={onGarden} aria-label={_t("Свет дня: {0}%. Открыть мой сад", Math.round(light.total * 100))}>
            <svg viewBox="0 0 62 62" aria-hidden="true">
              {light.windows.map((f, i) => (
                <g key={i}>
                  <circle cx="31" cy="31" r="26" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${SEG - 11} ${C}`} strokeDashoffset={-i * SEG - 5.5} />
                  {f > 0 && (
                    <circle cx="31" cy="31" r="26" fill="none" stroke="var(--gold-light)" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${Math.max(0.5, (SEG - 11) * f)} ${C}`} strokeDashoffset={-i * SEG - 5.5} />
                  )}
                </g>
              ))}
            </svg>
            <span>{light.lit ? <Sun /> : <small>{_t("свет")}</small>}</span>
          </button>
        </div>
        <svg className="arch" viewBox="0 0 360 20" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 20 L0 14 C110 14 160 9 180 0 C200 9 250 14 360 14 L360 20 Z" /></svg>
      </header>

      <div className="scroll">
        {pathCard}
        <NowSlot>{slot}</NowSlot>
        {active.length === 0 && state.settings.path && !state.newpath?.on && (
          <div className="welcome">
            <h2>{_tj("Ас-саляму алейкум{0}", state.settings.name ? `, ${state.settings.name}` : '')}</h2>
            <p className="motto">{_t("«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»")}</p>
            <p>{_t("Начни с одной–трёх привычек и привяжи каждую к намазу. Лучше маленькая привычка каждый день, чем большая раз в неделю.")}</p>
            <button type="button" className="pri-btn" onClick={() => onAdd(nowAnchor)}>{_t("Добавить первую привычку")}</button>
          </div>
        )}
        <TravelBar state={state} update={update} today={today} now={now} times={times} />
        {sd && <SisBand state={state} update={update} today={today} onEnd={() => ss.setEnd(true)} />}
        <section className="dayline" aria-label={_t("День по намазам")}>
          {ANCHORS.map(node)}
        </section>
        {ss.pick && <PrayerPick state={state} update={update} today={today} a={ss.pick} onClose={() => ss.setPick(null)} />}
        {ss.end && <SisEnd state={state} update={update} today={today} next={next ? `${ANCHOR_LABEL[next].ru} ${hhmm(times[next])}` : ''} onClose={() => ss.setEnd(false)} onGhusl={() => ss.setGhusl(true)} />}
        {ss.ghusl && <GhuslSheet onClose={() => ss.setGhusl(false)} />}
        {newToPrayers && sister && !sd && <p className="dl-tip dl-hint">{_t("Кружок слева — намаз: касание откроет выбор «вовремя», «с опозданием» или «дни без намаза».")}</p>}
        {newToPrayers && !sister && <p className="dl-tip dl-hint">{_t("Кружок слева — намаз: касание — вовремя (две галочки), ещё касание — с опозданием (одна), ещё — снять.")}</p>}
      </div>
    </>
  );
}

/** «Главное сейчас»: one card at a time out of everything Today has to say; arrows or a swipe show the next. */
function NowSlot({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  const [i, setI] = useState(0);
  const at = useRef(0);
  at.current = i;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Cards decide themselves whether to show (and hide on ✕), so count what is really on the page.
    const apply = () => {
      const kids = Array.from(el.children);
      setN(kids.length);
      const k = Math.min(at.current, Math.max(0, kids.length - 1));
      kids.forEach((c, j) => c.classList.toggle('ns-off', j !== k));
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  });
  const k = Math.min(i, Math.max(0, n - 1));
  const go = (d: number) => setI((k + d + n) % n);
  const x0 = useRef<number | null>(null);
  return (
    <>
      <div ref={ref} className="now-slot" onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (x0.current == null || n < 2) return; const dx = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
        {children}
      </div>
      {n > 1 && (
        <div className="ns-nav">
          <button type="button" onClick={() => go(-1)} aria-label={_t("Назад")}>‹</button>
          <span aria-label={_t("{0} из {1}", k + 1, n)}>{n <= 8 ? Array.from({ length: n }, (_, j) => <i key={j} className={j === k ? 'on' : ''} />) : _tj("{0} из {1}", k + 1, n)}</span>
          <button type="button" onClick={() => go(1)} aria-label={_t("Дальше")}>›</button>
        </div>
      )}
    </>
  );
}

function Muhasaba({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="muhasaba">
      <h4>{_t("Мухасаба")}</h4>
      <p>{_t("Что сегодня получилось и что завтра сделать лучше? Одной-двумя фразами.")}</p>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={_t("Сегодня я…")} />
    </div>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}


/** Live countdown to the next prayer: calm tiles, seconds tick once a second (once a minute with reduced motion). */
/** The header sky follows the prayer of the day: dawn at Fajr, emerald day, amber Asr, copper Maghrib, night after Isha. */
export type Sky = 'dawn' | 'day' | 'asr' | 'maghrib' | 'night';
export function skyOf(t: DayTimes, now: Date): Sky {
  const n = now.getTime();
  if (n < t.fajr.getTime() || n >= t.isha.getTime()) return 'night';
  if (n < t.sunrise.getTime() + 30 * 60_000) return 'dawn';
  if (n < t.asr.getTime()) return 'day';
  if (n < t.maghrib.getTime()) return 'asr';
  return 'maghrib';
}

function Countdown({ to, label }: { to: Date; label: string }) {
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    let id: number | undefined;
    const tick = () => { setT(Date.now()); id = window.setTimeout(tick, calm ? 60_000 - (Date.now() % 60_000) : 1000 - (Date.now() % 1000)); };
    tick();
    const vis = () => { if (document.visibilityState === 'visible') { clearTimeout(id); tick(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(id); document.removeEventListener('visibilitychange', vis); };
  }, [calm]);
  const left = Math.max(0, Math.floor((to.getTime() - t) / 1000));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), sec = left % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  const at = to.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="cd" role="timer" aria-label={_t("{0}: {1} ч {2} мин", label, h, m)}>
      <span className="cd-l">{label} · {at}</span>
      <span className="cd-t" aria-hidden="true">
        <i><b>{p2(h)}</b><small>{_t("час")}</small></i><em>:</em>
        <i><b>{p2(m)}</b><small>{_t("мин")}</small></i>
        {!calm && <><em>:</em><i className="s"><b>{p2(sec)}</b><small>{_t("сек")}</small></i></>}
      </span>
    </div>
  );
}
