import type { Anchor, AppState, PrayerMark } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { setPrayer } from '../store';
import { hhmm } from '../dates';
import type { DayTimes } from '../prayer';
import { travelStatus } from '../safar';

const NEXT: Record<string, PrayerMark | null> = { none: 'ontime', ontime: 'late', late: null };

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  now: Date;
  times: DayTimes;
}

/** Five prayers of the day. Tap: on time → late → not marked. Prayers whose time has not come are locked. */
export function PrayerStrip({ state, update, today, now, times }: Props) {
  const day = state.prayers[today] ?? {};
  const prayed = ANCHORS.filter((a) => day[a]).length;
  const tap = (a: Anchor) => update((s) => setPrayer(s, today, a, NEXT[day[a] ?? 'none']));
  const travel = travelStatus(state, today);
  const canJoin = travel.traveler && state.settings.madhab === 'shafi';
  const passed = (a: Anchor) => times[a].getTime() <= now.getTime();
  // Joining early: Asr may be prayed in Dhuhr's time, Isha in Maghrib's.
  const unlocked = (a: Anchor) => passed(a) || (canJoin && ((a === 'asr' && passed('dhuhr')) || (a === 'isha' && passed('maghrib'))));
  const join = (a: Anchor, b: Anchor) => update((s) => setPrayer(setPrayer(s, today, a, 'ontime'), today, b, 'ontime'));

  return (
    <section className="prayers" aria-label="Намазы сегодня">
      <div className="prayers-head">
        <h3>Намазы</h3>
        <span>{prayed} из 5</span>
      </div>
      <div className="prayers-row">
        {ANCHORS.map((a) => {
          const m = day[a];
          const locked = !unlocked(a) && !m;
          return (
            <button
              key={a}
              type="button"
              className="pr"
              data-m={m ?? (locked ? 'locked' : 'none')}
              disabled={locked}
              onClick={() => tap(a)}
              aria-label={`${ANCHOR_LABEL[a].ru}: ${m === 'ontime' ? 'вовремя' : m === 'late' ? 'с опозданием' : 'не отмечен'}`}
            >
              <span className="dot">
                {m === 'ontime' && <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M1 6.5l3 3 6-7M7 9.5l1 .5 7-8" /></svg>}
                {m === 'late' && <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 6.5l3 3 7-8" /></svg>}
                {!m && <span className="ar">{ANCHOR_LABEL[a].ar}</span>}
              </span>
              <b>{ANCHOR_LABEL[a].ru}</b>
              <small>{hhmm(times[a])}{travel.traveler && (a === 'dhuhr' || a === 'asr' || a === 'isha') ? ' · 2р' : ''}</small>
            </button>
          );
        })}
      </div>
      {travel.why && (
        <div className="safar-bar">
          <span>🧭 <b>{travel.traveler ? 'Ты в пути.' : 'Поездка.'}</b> {travel.why}</span>
          {canJoin && (passed('dhuhr') || passed('maghrib')) && (
            <div className="row2">
              {passed('dhuhr') && !(day.dhuhr && day.asr) && <button type="button" onClick={() => join('dhuhr', 'asr')}>Зухр + Аср вместе</button>}
              {passed('maghrib') && !(day.maghrib && day.isha) && <button type="button" onClick={() => join('maghrib', 'isha')}>Магриб + Иша вместе</button>}
            </div>
          )}
        </div>
      )}
      <p className="prayers-hint">Касание: вовремя (две галочки), ещё касание: с опозданием (одна), ещё: снять.</p>
    </section>
  );
}
