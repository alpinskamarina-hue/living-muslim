import type { AppState } from '../types';
import { sisDay } from '../sisters';
import { Ic } from './LIcon';
import { ANCHORS, ANCHOR_LABEL, sphereName } from '../types';
import { consistency, isCounted, streak } from '../store';
import { addDays, fromKey, plural } from '../dates';
import { _t, _tj, LOC } from '../i18n';
import { findings, fmtDay, goalTrends, previousAvg, type GoalTrend } from '../insights';

/** Small line of the last 28 days; gaps (no data yet) are left out. */
function Spark({ line }: { line: number[] }) {
  const pts = line.map((v, i) => (v < 0 ? null : `${(i / 27) * 100},${22 - (v / 100) * 20}`)).filter(Boolean) as string[];
  if (pts.length < 2) return null;
  const [x, y] = pts[pts.length - 1].split(',');
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} />
      <circle cx={x} cy={y} r="2.2" />
    </svg>
  );
}

function trendText(t: GoalTrend, today: string) {
  const parts: string[] = [];
  if (t.week > 0) parts.push(_t("+{0}% за неделю", t.week));
  else if (t.week < 0) parts.push(_t("{0}% за неделю", t.week));
  else if (t.pct < 100) parts.push(_t("за неделю без движения"));
  if (t.pct >= 100) parts.push(_t("цель достигнута"));
  else if (t.eta) {
    const due = t.g.due;
    if (due && t.eta > due) parts.push(_t("при таком темпе к {0}, а срок {1}", fmtDay(t.eta), fmtDay(due)));
    else if (due) parts.push(_t("успеваешь к сроку: при таком темпе к {0}", fmtDay(t.eta)));
    else parts.push(_t("при таком темпе к {0}", fmtDay(t.eta)));
  } else if (!t.identity && t.g.due && t.g.due >= today) parts.push(_t("срок {0}", fmtDay(t.g.due)));
  return parts.join(' · ');
}

export function Progress({ state, today, onOpenGoal }: { state: AppState; today: string; onOpenGoal?: (id: string) => void }) {
  const habits = state.habits.filter((h) => h.status === 'active');
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));

  const daily = days.map((d) => {
    const alive = habits.filter((h) => h.createdAt <= d);
    const hit = alive.filter((h) => isCounted(state.log[d]?.[h.id])).length;
    return { d, rate: alive.length ? hit / alive.length : -1 };
  });
  const tracked = daily.filter((x) => x.rate >= 0 && (x.d !== today || x.rate > 0));
  const avg = tracked.length ? Math.round((tracked.reduce((a, x) => a + x.rate, 0) / tracked.length) * 100) : 0;
  const prev = previousAvg(state, today);
  const trends = goalTrends(state, today);
  const finds = findings(state, today);
  const notes = Object.entries(state.notes).filter(([, v]) => v.trim()).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 7);

  const prayerDays = days.filter((d) => d < today || Object.keys(state.prayers[d] ?? {}).length > 0);
  const firstPrayer = Object.keys(state.prayers).filter((d) => Object.keys(state.prayers[d] ?? {}).length).sort()[0];
  // A sister's days without prayer are left out: nothing was owed on them.
  const pDays = firstPrayer ? prayerDays.filter((d) => d >= firstPrayer && !sisDay(state, d)) : [];
  // Today is still in progress, so only what is already marked counts toward it.
  const pTotal = pDays.filter((d) => d !== today).length * 5 + (pDays.includes(today) ? Object.keys(state.prayers[today] ?? {}).length : 0);
  const pDone = pDays.reduce((a, d) => a + Object.keys(state.prayers[d] ?? {}).length, 0);
  const pOn = pDays.reduce((a, d) => a + Object.values(state.prayers[d] ?? {}).filter((m) => m === 'ontime').length, 0);
  const prayerBlock = firstPrayer ? (
    <>
      <h2 className="sub-h">{_t("Намазы ")}<small>{_tj("с {0}", fromKey(firstPrayer > days[0] ? firstPrayer : days[0]).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }))}</small></h2>
      <div className="stat-card">
        <div className="big">{pTotal ? Math.round((pDone / pTotal) * 100) : 0}%</div>
        <div>
          <b>{_tj("Отмечено {0} из {1}", pDone, pTotal)}</b>
          <small>{_tj("из них вовремя {0}", pOn)}</small>
        </div>
      </div>
      <div className="hlist" style={{ marginTop: 10 }}>
        {ANCHORS.map((a) => (
          <div className="hrow" key={a} data-sphere="faith">
            <div className="hrow-top"><b>{ANCHOR_LABEL[a].ru}</b><span className="ar-s">{ANCHOR_LABEL[a].ar}</span></div>
            <div className="strip">
              {days.map((d) => {
                const m = state.prayers[d]?.[a];
                return <i key={d} data-m={d < firstPrayer ? 'none' : m === 'ontime' ? 'done' : m === 'late' ? 'min' : 'miss'} data-today={d === today || undefined} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="legend" data-sphere="faith"><span><i data-m="done" />{_t("вовремя")}</span><span><i data-m="min" />{_t("позже")}</span><span><i />{_t("не отмечен")}</span><span><i data-today />{_t("сегодня")}</span></div>
    </>
  ) : null;

  const top = (
    <>
      {finds.length > 0 && (
        <div className="finds">
          <b>{_t("Что видно за 4 недели")}</b>
          {finds.map((f, i) => <p key={i}><span aria-hidden="true"><Ic e={f.ic} /></span>{f.text}</p>)}
        </div>
      )}
      {trends.length > 0 && (
        <>
          <h2 className="sub-h">{_t("Цели")}</h2>
          <div className="gtr-list">
            {trends.map((t) => (
              <button type="button" className="gtr" key={t.g.id} onClick={() => onOpenGoal?.(t.g.id)}>
                <div className="gtr-top"><b>{t.g.title}</b><span className="pct">{t.pct}%</span></div>
                <Spark line={t.line} />
                <small data-up={t.week > 0 || undefined} data-late={(t.eta && t.g.due && t.eta > t.g.due) || undefined}>{trendText(t, today)}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  if (!habits.length)
    return (
      <div className="prog">
        <p className="page-sub">{_t("Здесь появится постоянство по намазам и по каждой привычке.")}</p>
        {top}
        {prayerBlock}
      </div>
    );

  return (
    <div className="prog">
      <p className="page-sub">{_t("Считаем постоянство, а не идеальные серии. Один пропуск не обнуляет серию, два подряд — да.")}</p>
      {top}
      {trends.length > 0 && <h2 className="sub-h">{_t("Привычки")}</h2>}

      <div className="stat-card">
        <div className="big">{avg}%</div>
        <div>
          <b>{_t("Постоянство за 4 недели")}</b>
          <small>{_t("доля отмеченных привычек по дням")}</small>
          {prev != null && (
            <small className="cmp" data-d={avg > prev ? 'up' : avg < prev ? 'down' : 'eq'}>
              {avg > prev ? _t("↑ на {0}% лучше прошлых 4 недель ({1}%)", avg - prev, prev) : avg < prev ? _t("↓ на {0}% ниже прошлых 4 недель ({1}%)", prev - avg, prev) : _t("как и прошлые 4 недели ({0}%)", prev)}
            </small>
          )}
        </div>
      </div>
      <div className="heat" aria-label={_t("Последние 28 дней")}>
        {daily.map((x) => (
          <i key={x.d} title={x.d} style={{ opacity: x.rate < 0 ? 0.15 : 0.2 + x.rate * 0.8 }} data-today={x.d === today || undefined}>
            {fromKey(x.d).getDate()}
          </i>
        ))}
      </div>

      {prayerBlock}

      <h2 className="sub-h">{_t("По привычкам")}</h2>
      <div className="hlist">
        {habits.map((h) => {
          const c = consistency(state, h, today);
          const st = streak(state, h, today);
          return (
            <div className="hrow" key={h.id} data-sphere={h.sphere}>
              <div className="hrow-top">
                <div>
                  <b>{h.action}</b>
                  <small>{sphereName(h.sphere)} · {ANCHOR_LABEL[h.anchor].after.replace(_t("После"), _t("после"))}{h.formed ? _t(" · закреплена") : ''}</small>
                </div>
                <div className="pct">{Math.round(c.rate * 100)}%<small>{st} {plural(st, _t("день"), _t("дня"), _t("дней"))}</small></div>
              </div>
              <div className="strip">
                {days.map((d) => {
                  const m = state.log[d]?.[h.id];
                  return <i key={d} data-m={d < h.createdAt ? 'none' : m ?? 'miss'} data-today={d === today || undefined} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="legend"><span><i data-m="done" />{_t("сделал")}</span><span><i data-m="min" />{_t("минимум")}</span><span><i />{_t("пропуск")}</span><span><i data-today />{_t("сегодня")}</span></div>

      {notes.length > 0 && (
        <>
          <h2 className="sub-h">{_t("Мухасаба")}</h2>
          <div className="notes-list">
            {notes.map(([d, v]) => (
              <div key={d}><small>{fromKey(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long' })}</small><p>{v}</p></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
