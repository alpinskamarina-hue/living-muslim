import { useState } from 'react';
import type { Anchor, AppState, Habit, Mark } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { atRisk, isCounted, setMark, streak, toggleHard } from '../store';
import { durationLabel, gregorianLabel, hhmm, hijriLabel } from '../dates';
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
  onGoal: (id: string) => void;
  onReview: () => void;
  onRamadan: () => void;
}

export function Today({ state, update, today, now, times, onEdit, onAdd, circleLine, onSafar, onGoal, onReview, onRamadan }: Props) {
  const { current, next, end } = windowState(times, now);
  const [open, setOpen] = useState<Anchor | null>(null);
  const onTrip = tripOn(state, today);
  const paused = onTrip ? state.trip?.paused ?? [] : [];
  const active = state.habits.filter((h) => h.status === 'active' && !paused.includes(h.id) && !ramadanHidden(state, h, today));
  const log = state.log[today] ?? {};
  const doneCount = active.filter((h) => isCounted(log[h.id])).length;
  const C = 163.4;

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
          <div>
            <b>{title}</b>
            <small>{sub} · {here(state, today).place}<button type="button" className="safar-chip" onClick={onSafar}>{onTrip ? '🧭 в пути' : '🧭 Сафар'}</button></small>
          </div>
          <div className="ring" aria-label={`Сделано ${doneCount} из ${active.length}`}>
            <svg viewBox="0 0 62 62">
              <circle cx="31" cy="31" r="26" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="6" />
              <circle cx="31" cy="31" r="26" fill="none" stroke="var(--gold)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={active.length ? C - (C * doneCount) / active.length : C} />
            </svg>
            <span>{doneCount}/{active.length}</span>
          </div>
        </div>
      </header>

      <div className="scroll">
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
