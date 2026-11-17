import { useState } from 'react';
import type { Member, Reacts } from '../circle';
import { plural } from '../dates';
import {
  GOAL_KINDS, valOf, weekStart, weekEnd, addWeeks, isFriday, goalFor, circleTotals, supporters, rangeLabel,
  type CGoal, type GoalKind,
} from '../cweek';
import { daysBetween } from '../dates';

interface Props {
  members: Member[];
  reacts: Reacts;
  me: string | null;
  today: string;
  title: string;
  nameOf: (id: string) => string;
  onSet: (g: CGoal) => void;
}

const unit = (k: GoalKind, n: number) => plural(n, ...GOAL_KINDS[k].unit);

/** «Цель недели»: one shared target for the whole circle, Saturday to Friday. Anyone can set or change it. */
export function CircleGoal({ members, me, today, nameOf, onSet }: Props) {
  const w = weekStart(today);
  const goal = goalFor(members, w);
  const [edit, setEdit] = useState(false);
  const people = Math.max(1, members.length);
  const [k, setK] = useState<GoalKind>(goal?.k as GoalKind ?? 'fajr');
  const suggest = (x: GoalKind) => Math.max(GOAL_KINDS[x].step, Math.round((GOAL_KINDS[x].per * people) / GOAL_KINDS[x].step) * GOAL_KINDS[x].step);
  const [n, setN] = useState(goal?.n ?? suggest('fajr'));
  const left = daysBetween(today, weekEnd(w));

  const save = () => { onSet({ w, k, n, at: new Date().toISOString() }); setEdit(false); };
  const clear = () => { onSet({ w, k: 'none', n: 0, at: new Date().toISOString() }); setEdit(false); };

  if (edit || !goal) {
    if (!edit) {
      return (
        <button type="button" className="cg-empty" onClick={() => { setK('fajr'); setN(suggest('fajr')); setEdit(true); }}>
          <span aria-hidden="true">🎯</span>
          <span><b>Поставьте цель круга на неделю</b><small>Например, {suggest('fajr')} {unit('fajr', suggest('fajr'))} на всех. Общая шкала, без рейтинга.</small></span>
          <i aria-hidden="true">›</i>
        </button>
      );
    }
    return (
      <div className="cg-card cg-edit">
        <b className="cg-h">🎯 Цель круга до пятницы</b>
        <div className="cg-kinds">
          {(Object.keys(GOAL_KINDS) as GoalKind[]).map((x) => (
            <button key={x} type="button" aria-pressed={k === x} onClick={() => { setK(x); setN(suggest(x)); }}>{GOAL_KINDS[x].ic} {GOAL_KINDS[x].label}</button>
          ))}
        </div>
        <div className="cg-num">
          <button type="button" aria-label="Меньше" onClick={() => setN((v) => Math.max(GOAL_KINDS[k].step, v - GOAL_KINDS[k].step))}>−</button>
          <span><b>{n}</b><small>{unit(k, n)}</small></span>
          <button type="button" aria-label="Больше" onClick={() => setN((v) => v + GOAL_KINDS[k].step)}>+</button>
        </div>
        <p className="tiny">На {people} {plural(people, 'человека', 'человек', 'человек')} это примерно {Math.round((n / people) * 10) / 10} на каждого за неделю. Считается всё, что отмечено с субботы.</p>
        <div className="cg-row">
          <button type="button" className="pri-btn" onClick={save}>{goal ? 'Сохранить' : 'Поставить цель'}</button>
          <button type="button" className="link-btn" onClick={() => setEdit(false)}>Отмена</button>
          {goal && <button type="button" className="link-btn cg-del" onClick={clear}>Убрать цель</button>}
        </div>
      </div>
    );
  }

  const gk = goal.k as GoalKind;
  const have = circleTotals(members, w);
  const v = valOf(have, gk);
  const pct = Math.min(100, Math.round((v / goal.n) * 100));
  const done = v >= goal.n;
  return (
    <div className={`cg-card${done ? ' done' : ''}`}>
      <div className="cg-top">
        <span className="cg-ic" aria-hidden="true">{GOAL_KINDS[gk].ic}</span>
        <span>
          <small>Цель недели · поставил{goal.by === me ? ' ты' : `(а) ${nameOf(goal.by)}`}</small>
          <b>{goal.n} {unit(gk, goal.n)}</b>
        </span>
        <button type="button" className="link-btn" onClick={() => { setK(gk); setN(goal.n); setEdit(true); }}>Изменить</button>
      </div>
      <span className="cg-bar"><i style={{ width: `${pct}%` }} /></span>
      <p className="cg-sub">
        {done ? <>✓ Цель достигнута, машаАллах! Уже {v}. Можно поднять планку.</>
          : <><b>{v}</b> из {goal.n} · осталось {goal.n - v} · {left === 0 ? 'сегодня последний день' : `ещё ${left} ${plural(left, 'день', 'дня', 'дней')} до пятницы`}</>}
      </p>
    </div>
  );
}

/** Friday summary: shown on Friday for this week, and on Saturday–Sunday for the week that just ended. */
export function WeekSummary({ members, reacts, today, title, nameOf }: Props) {
  const cur = weekStart(today);
  const dow = daysBetween(cur, today); // 0 Sat … 6 Fri
  const w = isFriday(today) ? cur : dow <= 1 ? addWeeks(cur, -1) : '';
  const [sent, setSent] = useState(false);
  if (!w || members.length < 2) return null;
  const t = circleTotals(members, w);
  if (t.p + t.h === 0) return null;
  const goal = goalFor(members, w);
  const gv = goal ? valOf(t, goal.k as GoalKind) : 0;
  const pctOn = t.p ? Math.round((t.o / t.p) * 100) : 0;
  const sup = supporters(reacts, w).slice(0, 3);
  const live = w === cur;

  const text = [
    `🤝 Наш круг «${title}» ${live ? 'на этой неделе' : 'за неделю'} (${rangeLabel(w)}):`,
    `🕌 ${t.p} ${plural(t.p, 'намаз', 'намаза', 'намазов')}, из них ${pctOn}% вовремя`,
    t.f ? `🌅 ${t.f} ${plural(t.f, 'Фаджр', 'Фаджра', 'Фаджров')} вовремя` : '',
    t.h ? `🌱 ${t.h} ${plural(t.h, 'отметка', 'отметки', 'отметок')} привычек` : '',
    goal ? `🎯 Цель «${goal.n} ${unit(goal.k as GoalKind, goal.n)}»: ${gv >= goal.n ? 'выполнена ✓' : `${gv} из ${goal.n}`}` : '',
    sup.length ? `🤲 Больше всех поддерживали: ${sup.map((x) => nameOf(x.id)).join(', ')}` : '',
    '',
    'Держимся вместе в Living Muslim: https://living-muslim.vercel.app',
  ].filter((x, i, a) => x !== '' || i === a.length - 2).join('\n');

  const share = async () => {
    try { if (navigator.share) { await navigator.share({ text }); setSent(true); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
  };

  return (
    <div className="ws-card">
      <small className="ws-k">Итог недели · {rangeLabel(w)}{live ? ' · до вечера ещё можно добавить' : ''}</small>
      <div className="ws-grid">
        <div><b>{t.p}</b><small>{plural(t.p, 'намаз', 'намаза', 'намазов')}</small></div>
        <div><b>{pctOn}%</b><small>вовремя</small></div>
        <div><b>{t.f}</b><small>Фаджр вовремя</small></div>
        <div><b>{t.h}</b><small>привычек</small></div>
      </div>
      {goal && <p className="ws-line">🎯 {gv >= goal.n ? <>Цель «{goal.n} {unit(goal.k as GoalKind, goal.n)}» <b>выполнена</b>, машаАллах</> : <>Цель: {gv} из {goal.n} {unit(goal.k as GoalKind, goal.n)}</>}</p>}
      {sup.length > 0 && <p className="ws-line">🤲 Больше всех поддерживали: <b>{sup.map((x) => nameOf(x.id)).join(', ')}</b></p>}
      <p className="ws-line ws-soft">В деле было {t.people} из {members.length}. Общий итог, без рейтинга по поклонению.</p>
      <button type="button" className="pri-btn ws-share" onClick={share}>{sent ? '✓ Отправлено' : 'Отправить итог в WhatsApp или Telegram'}</button>
    </div>
  );
}
