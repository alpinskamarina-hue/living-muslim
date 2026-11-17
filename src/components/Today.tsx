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
  firstWeek?: React.ReactNode;
  onGoal: (id: string) => void;
  onReview: () => void;
  onRamadan: (tab?: 'prep' | 'day' | 'fast' | 'quran' | 'nights' | 'eid') => void;
  onGarden: () => void;
  support?: { text: string; onOpen: () => void }[];
}

export function Today({ state, update, today, now, times, onEdit, onAdd, circleLine, onSafar, onGoal, onReview, onRamadan, onGarden, support, firstWeek }: Props) {
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

  const mark = (id: string) => (m: Mark | null) => update((s) => setMark(s, today, id, m));

  const title = next
    ? `${ANCHOR_LABEL[next].ru} через ${durationLabel(times[next].getTime() - now.getTime())}`
    : 'Все намазы дня прошли';
  const sub = current ? `Сейчас окно ${ANCHOR_LABEL[current].after.replace('После', 'после')}` : 'До Фаджра';

  const renderCards = (a: Anchor) => {
    const list = active.filter((h) => h.anchor === a);
    if (!list.length)
      return (
        <button type="button" className="empty" onClick={() => onAdd(a)}>
          + Добавить привычку {ANCHOR_LABEL[a].after.replace('После', 'после')}
        </button>
      );
    return (
      <div className="cards">
        {list.map((h) => (
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
        ))}
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
            {next ? <Countdown to={times[next]} label={ANCHOR_LABEL[next].after.replace('После', 'До')} /> : <b>{title}</b>}
            <small>{sub} · {here(state, today).place}<button type="button" className="safar-chip" onClick={onSafar}>{onTrip ? '🧭 в пути' : '🧭 Сафар'}</button></small>
          </div>
          <button type="button" className="ring light" onClick={onGarden} aria-label={`Свет дня: ${Math.round(light.total * 100)}%. Открыть мой сад`}>
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
            <span>{light.lit ? <Sun /> : <small>свет</small>}</span>
          </button>
        </div>
      </header>

      <div className="scroll">
        {(j.streak > 0 || j.lit > 0) && (
          <button type="button" className="streak-line" onClick={onGarden}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V11M12 11C12 7 9 5 5 5c0 4 3 6 7 6zM12 14c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" /></svg>
            <span>
              <b>{j.streak > 0 ? `Серия ${j.streak} ${plural(j.streak, 'день', 'дня', 'дней')}` : 'Начни серию сегодня'}</b>
              <small>
                {j.pausedToday ? 'Сегодня пауза: серия не сгорит' : j.litToday ? 'Сегодня засчитан, машаАллах' : j.repairLeft ? 'Один пропуск в неделю простится' : 'Пропуск на этой неделе уже был: сегодня важно'}
              </small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
        )}
        {(support ?? []).map((x, i) => (
          <button key={i} type="button" className="circle-line support" onClick={x.onOpen}>
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
            <b>Пересмотр недели</b><small>Пятница. 2 минуты: что продвинулось и какой шаг на неделю</small>
          </button>
        )}
        <RamadanToday state={state} update={update} today={today} now={now} times={times} onOpen={onRamadan} />
        <PrayerStrip state={state} update={update} today={today} now={now} times={times} />
        {firstWeek}
        {circleLine && (
          <button type="button" className="circle-line" onClick={circleLine.onOpen}>
            <span><b>{circleLine.names.slice(0, 2).join(' и ')}</b>{circleLine.names.length > 2 ? ` и ещё ${circleLine.names.length - 2}` : ''} уже {circleLine.names.length > 1 ? 'отметились' : 'отметился'} сегодня</span>
            <span aria-hidden="true">›</span>
          </button>
        )}
        {active.length === 0 && (
          <div className="welcome">
            <h2>Ас-саляму алейкум{state.settings.name ? `, ${state.settings.name}` : ''}</h2>
            <p className="motto">«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»</p>
            <p>Начни с одной–трёх привычек и привяжи каждую к намазу. Лучше маленькая привычка каждый день, чем большая раз в неделю.</p>
            <button type="button" className="pri-btn" onClick={() => onAdd(nowAnchor)}>Добавить первую привычку</button>
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
            <small>{current ? `сейчас · до ${hhmm(end(nowAnchor))}` : `скоро · ${hhmm(times.fajr)}`}</small>
          </h3>
          {active.some((h) => h.anchor === nowAnchor) && (
            <button type="button" className="hard" aria-pressed={hardOn} onClick={() => update((s) => toggleHard(s, today, nowAnchor))}>
              Тяжёлый день
            </button>
          )}
        </div>
        {renderCards(nowAnchor)}
        {active.some((h) => h.anchor === nowAnchor) && (
          <div className="hint">Касание по кружку — сделал. Свайп влево — минимум или позже. Касание по названию — изменить.</div>
        )}

        {others.some((a) => windowStatus(a, current) === 'future') && (
          <div className="later">
            <h4>Дальше сегодня</h4>
            {others.filter((a) => windowStatus(a, current) === 'future').map((a) => (
              <WindowRow key={a} a={a} active={active} log={log} time={times[a]} open={open === a} onToggle={() => setOpen(open === a ? null : a)} future>
                {renderCards(a)}
              </WindowRow>
            ))}
          </div>
        )}

        {(current === 'isha' || current === 'maghrib') && active.length > 0 && (
          <Muhasaba value={state.notes[today] ?? ''} onChange={(v) => update((s) => ({ ...s, notes: { ...s.notes, [today]: v } }))} />
        )}
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
          <span className="tk"><Ticks />{done} из {list.length}</span>
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
      <h4>Мухасаба</h4>
      <p>Что сегодня получилось и что завтра сделать лучше? Одной-двумя фразами.</p>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder="Сегодня я…" />
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
  const at = to.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="cd" role="timer" aria-label={`${label}: ${h} ч ${m} мин`}>
      <span className="cd-l">{label} · {at}</span>
      <span className="cd-t" aria-hidden="true">
        <i><b>{p2(h)}</b><small>час</small></i><em>:</em>
        <i><b>{p2(m)}</b><small>мин</small></i>
        {!calm && <><em>:</em><i className="s"><b>{p2(sec)}</b><small>сек</small></i></>}
      </span>
    </div>
  );
}
