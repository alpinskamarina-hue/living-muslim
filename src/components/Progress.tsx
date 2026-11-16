import type { AppState } from '../types';
import { ANCHORS, ANCHOR_LABEL, sphereName } from '../types';
import { consistency, isCounted, streak } from '../store';
import { addDays, fromKey, plural } from '../dates';

export function Progress({ state, today }: { state: AppState; today: string }) {
  const habits = state.habits.filter((h) => h.status === 'active');
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));

  const daily = days.map((d) => {
    const alive = habits.filter((h) => h.createdAt <= d);
    const hit = alive.filter((h) => isCounted(state.log[d]?.[h.id])).length;
    return { d, rate: alive.length ? hit / alive.length : -1 };
  });
  const tracked = daily.filter((x) => x.rate >= 0 && (x.d !== today || x.rate > 0));
  const avg = tracked.length ? Math.round((tracked.reduce((a, x) => a + x.rate, 0) / tracked.length) * 100) : 0;
  const notes = Object.entries(state.notes).filter(([, v]) => v.trim()).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 7);

  const prayerDays = days.filter((d) => d < today || Object.keys(state.prayers[d] ?? {}).length > 0);
  const firstPrayer = Object.keys(state.prayers).filter((d) => Object.keys(state.prayers[d] ?? {}).length).sort()[0];
  const pDays = firstPrayer ? prayerDays.filter((d) => d >= firstPrayer) : [];
  // Today is still in progress, so only what is already marked counts toward it.
  const pTotal = pDays.filter((d) => d !== today).length * 5 + Object.keys(state.prayers[today] ?? {}).length;
  const pDone = pDays.reduce((a, d) => a + Object.keys(state.prayers[d] ?? {}).length, 0);
  const pOn = pDays.reduce((a, d) => a + Object.values(state.prayers[d] ?? {}).filter((m) => m === 'ontime').length, 0);
  const prayerBlock = firstPrayer ? (
    <>
      <h2 className="sub-h">Намазы <small>с {fromKey(firstPrayer).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</small></h2>
      <div className="stat-card">
        <div className="big">{pTotal ? Math.round((pDone / pTotal) * 100) : 0}%</div>
        <div>
          <b>Отмечено {pDone} из {pTotal}</b>
          <small>из них вовремя {pOn}</small>
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
    </>
  ) : null;

  if (!habits.length)
    return (
      <div className="prog">
        <p className="page-sub">Здесь появится постоянство по намазам и по каждой привычке.</p>
        {prayerBlock}
      </div>
    );

  return (
    <div className="prog">
      <p className="page-sub">Считаем постоянство, а не идеальные серии. Один пропуск не обнуляет серию, два подряд — да.</p>

      <div className="stat-card">
        <div className="big">{avg}%</div>
        <div>
          <b>Постоянство за 4 недели</b>
          <small>доля отмеченных привычек по дням</small>
        </div>
      </div>
      <div className="heat" aria-label="Последние 28 дней">
        {daily.map((x) => (
          <i key={x.d} title={x.d} style={{ opacity: x.rate < 0 ? 0.15 : 0.2 + x.rate * 0.8 }} data-today={x.d === today || undefined}>
            {fromKey(x.d).getDate()}
          </i>
        ))}
      </div>

      {prayerBlock}

      <h2 className="sub-h">По привычкам</h2>
      <div className="hlist">
        {habits.map((h) => {
          const c = consistency(state, h, today);
          const st = streak(state, h, today);
          return (
            <div className="hrow" key={h.id} data-sphere={h.sphere}>
              <div className="hrow-top">
                <div>
                  <b>{h.action}</b>
                  <small>{sphereName(h.sphere)} · {ANCHOR_LABEL[h.anchor].after.replace('После', 'после')}{h.formed ? ' · закреплена' : ''}</small>
                </div>
                <div className="pct">{Math.round(c.rate * 100)}%<small>{st} {plural(st, 'день', 'дня', 'дней')}</small></div>
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

      {notes.length > 0 && (
        <>
          <h2 className="sub-h">Мухасаба</h2>
          <div className="notes-list">
            {notes.map(([d, v]) => (
              <div key={d}><small>{fromKey(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</small><p>{v}</p></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
