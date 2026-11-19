import { InstallBanner } from './InstallBanner';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { dayLight, journey } from '../gamify';
import type { Anchor, AppState, Habit, Mark } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { atRisk, isCounted, setMark, streak, toggleHard } from '../store';
import { durationLabel, gregorianLabel, hhmm, hijriLabel, plural } from '../dates';
import { type DayTimes, windowState, windowStatus } from '../prayer';
import { HabitCard, Ticks } from './HabitCard';
import { Ornament } from './Ornament';
import { LogoMark } from './Logo';
import { PrayerStrip } from './PrayerStrip';
import { here, tripOn } from '../safar';
import { progress } from '../goals';
import { isReviewDay } from './Goals';
import { RamadanToday } from './Ramadan';
import { ramadanHidden, ramadanMode } from '../rplan';
import { _t, _tj, LOC } from '../i18n';
import { MosqueCard, QiblaChip, type QiblaTab } from './Mosques';
import { aiName } from '../assistant';

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
  onAssistant?: () => void;
  firstWeek?: React.ReactNode;
  onGoal: (id: string) => void;
  onReview: () => void;
  onRamadan: (tab?: 'prep' | 'day' | 'fast' | 'quran' | 'nights' | 'eid') => void;
  onGarden: () => void;
  support?: { text: string; onOpen: () => void; cls?: string }[];
  plan?: React.ReactNode;
  /** «Хочу оставить» lines under the plan, and the evening question next to the muhasaba. */
  quits?: React.ReactNode;
  quitCheck?: React.ReactNode;
  onQibla: (tab: QiblaTab) => void;
  /** «Новый путь»: the path card, or the choice for someone new. */
  pathCard?: React.ReactNode;
}

export function Today({ state, update, today, now, times, onEdit, onAdd, circleLine, onSafar, onAssistant, onGoal, onReview, onRamadan, onGarden, support, firstWeek, plan, quits, quitCheck, onQibla, pathCard }: Props) {
  const { current, next, end } = windowState(times, now);
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
  const hardOn = (state.hard[today] ?? []).includes(nowAnchor);
  const others = ANCHORS.filter((a) => a !== nowAnchor);

  return (
    <>
      <header className="top">
        <Ornament />
        <div className="d">
          <LogoMark size={18} />{gregorianLabel(now)} · {hijriLabel(now)}
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
      </header>

      <div className="scroll">
        <MosqueCard state={state} update={update} today={today} now={now} times={times} next={next} onOpen={onQibla} />
        {pathCard}
        {plan}
        {quits}
        {(j.streak > 0 || j.lit > 0) && (
          <button type="button" className="streak-line" onClick={onGarden}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V11M12 11C12 7 9 5 5 5c0 4 3 6 7 6zM12 14c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" /></svg>
            <span>
              <b>{j.streak > 0 ? _t("Серия {0} {1}", j.streak, plural(j.streak, _t("день"), _t("дня"), _t("дней"))) : _t("Начни серию сегодня")}</b>
              <small>
                {j.pausedToday ? _t("Сегодня пауза: серия не сгорит") : j.litToday ? _t("Сегодня засчитан, машаАллах") : j.repairLeft ? _t("Один пропуск в неделю простится") : _t("Пропуск на этой неделе уже был: сегодня важно")}
              </small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
        )}
        {(support ?? []).map((x, i) => (
          <button key={i} type="button" className={`circle-line support${x.cls ? ` ${x.cls}` : ""}`} onClick={x.onOpen}>
            <span>{x.text}</span><span aria-hidden="true">›</span>
          </button>
        ))}
        {(() => {
          const g = (state.goals ?? []).find((x) => x.status === 'active');
          if (!g) return null;
          const p = progress(state, g, today);
          return (
            <button type="button" className="gline" onClick={() => onGoal(g.id)}>
              <span aria-hidden="true">🎯</span><span className="nm">{g.title}</span><span className="bar2"><i style={{ width: `${p.pct}%` }} /></span><b>{p.pct}%</b>
            </button>
          );
        })()}
        {isReviewDay(state, today) && (
          <button type="button" className="g-review-cta" onClick={onReview} style={{ marginBottom: 10, width: '100%' }}>
            <b>{_t("Пересмотр недели")}</b><small>{_t("Пятница. 2 минуты: что продвинулось и какой шаг на неделю")}</small>
          </button>
        )}
        <RamadanToday state={state} update={update} today={today} now={now} times={times} onOpen={onRamadan} />
        <PrayerStrip state={state} update={update} today={today} now={now} times={times} />
        {firstWeek}
        {circleLine && (
          <button type="button" className="circle-line" onClick={circleLine.onOpen}>
            <span><b>{circleLine.names.slice(0, 2).join(_t(" и "))}</b>{_tj("{0} уже {1} сегодня", circleLine.names.length > 2 ? _t(" и ещё {0}", circleLine.names.length - 2) : '', circleLine.names.length > 1 ? _t("отметились") : _t("отметился"))}</span>
            <span aria-hidden="true">›</span>
          </button>
        )}
        {active.length === 0 && state.settings.path && !state.newpath?.on && (
          <div className="welcome">
            <h2>{_tj("Ас-саляму алейкум{0}", state.settings.name ? `, ${state.settings.name}` : '')}</h2>
            <p className="motto">{_t("«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»")}</p>
            <p>{_t("Начни с одной–трёх привычек и привяжи каждую к намазу. Лучше маленькая привычка каждый день, чем большая раз в неделю.")}</p>
            <button type="button" className="pri-btn" onClick={() => onAdd(nowAnchor)}>{_t("Добавить первую привычку")}</button>
          </div>
        )}

        {others.filter((a) => windowStatus(a, current) === 'past').map((a) => (
          <WindowRow key={a} a={a} active={active} log={log} time={times[a]} open={open === a} onToggle={() => setOpen(open === a ? null : a)}>
            {renderCards(a)}
          </WindowRow>
        ))}

        <div className="sec">
          <h3>
            {ANCHOR_LABEL[nowAnchor].after}
            <small>{current ? _t("сейчас · до {0}", hhmm(end(nowAnchor))) : _t("скоро · {0}", hhmm(times.fajr))}</small>
          </h3>
          {(hardOn || active.some((h) => h.anchor === nowAnchor && !isCounted(log[h.id]))) && (
            <button type="button" className="hard" aria-pressed={hardOn} onClick={() => update((s) => toggleHard(s, today, nowAnchor))}>
              {_t("Тяжёлый день")}
            </button>
          )}
        </div>
        {renderCards(nowAnchor)}
        {active.some((h) => h.anchor === nowAnchor && !isCounted(log[h.id])) && (
          <div className="hint">{_t("Касание по кружку — сделал. Свайп влево — минимум или позже. Касание по названию — изменить.")}</div>
        )}

        {others.some((a) => windowStatus(a, current) === 'future') && (
          <div className="later">
            <h4>{_t("Дальше сегодня")}</h4>
            {others.filter((a) => windowStatus(a, current) === 'future').map((a) => (
              <WindowRow key={a} a={a} active={active} log={log} time={times[a]} open={open === a} onToggle={() => setOpen(open === a ? null : a)} future>
                {renderCards(a)}
              </WindowRow>
            ))}
          </div>
        )}

        {(current === 'isha' || current === 'maghrib') && quitCheck}
        {(current === 'isha' || current === 'maghrib') && active.length > 0 && (
          <Muhasaba value={state.notes[today] ?? ''} onChange={(v) => update((s) => ({ ...s, notes: { ...s.notes, [today]: v } }))} />
        )}
        <InstallBanner />
      </div>
    </>
  );
}

function WindowRow(props: {
  a: Anchor; active: Habit[]; log: Record<string, Mark>; time: Date; open: boolean; onToggle: () => void; future?: boolean; children: React.ReactNode;
}) {
  const { a, active, log, time, open, onToggle, future, children } = props;
  const list = active.filter((h) => h.anchor === a);
  const done = list.filter((h) => isCounted(log[h.id])).length;
  const all = list.length > 0 && done === list.length;
  return (
    <div className="win">
      <button type="button" className={`lw${open ? ' open' : ''}`} onClick={onToggle} aria-expanded={open}>
        <span className="ar">{ANCHOR_LABEL[a].ar}</span>
        <span className="x">
          {ANCHOR_LABEL[a].after} · {hhmm(time)}
          {list.length > 0 && <small>{list.map((h) => h.action).join(' · ')}</small>}
        </span>
        {all ? (
          <span className="tk"><Ticks />{_tj("{0} из {1}", done, list.length)}</span>
        ) : (
          <span className="n">{list.length ? `${done}/${list.length}` : future ? '' : '—'}</span>
        )}
      </button>
      {open && <div className="win-body">{children}</div>}
    </div>
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
