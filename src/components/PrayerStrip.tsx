import type { Anchor, AppState, PrayerMark } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { setPrayer } from '../store';
import { hhmm } from '../dates';
import type { DayTimes } from '../prayer';
import { travelStatus } from '../safar';
import { _t, _tj } from '../i18n';

const NEXT: Record<string, PrayerMark | null> = { none: 'ontime', ontime: 'late', late: null };

export interface PrayerProps {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  now: Date;
  times: DayTimes;
}

/** Marking prayers: tap cycles on time → late → not marked; prayers whose time has not come are locked (a traveller who joins may mark Asr/Isha early). */
export function prayerCtl({ state, update, today, now, times }: PrayerProps) {
  const day = state.prayers[today] ?? {};
  const tap = (a: Anchor) => update((s) => setPrayer(s, today, a, NEXT[day[a] ?? 'none']));
  const travel = travelStatus(state, today);
  const canJoin = travel.traveler && state.settings.madhab === 'shafi';
  const passed = (a: Anchor) => times[a].getTime() <= now.getTime();
  const unlocked = (a: Anchor) => passed(a) || Boolean(canJoin && ((a === 'asr' && passed('dhuhr')) || (a === 'isha' && passed('maghrib'))));
  const join = (a: Anchor, b: Anchor) => update((s) => setPrayer(setPrayer(s, today, a, 'ontime'), today, b, 'ontime'));
  return { day, tap, travel, canJoin, passed, unlocked, join };
}

/** «Ты в пути»: the travel line with joining buttons. */
export function TravelBar(props: PrayerProps) {
  const { day, travel, canJoin, passed, join } = prayerCtl(props);
  if (!travel.why) return null;
  return (
    <div className="safar-bar">
      <span>🧭 <b>{travel.traveler ? _t("Ты в пути.") : _t("Поездка.")}</b> {travel.why}</span>
      {canJoin && (passed('dhuhr') || passed('maghrib')) && (
        <div className="row2">
          {passed('dhuhr') && !(day.dhuhr && day.asr) && <button type="button" onClick={() => join('dhuhr', 'asr')}>{_t("Зухр + Аср вместе")}</button>}
          {passed('maghrib') && !(day.maghrib && day.isha) && <button type="button" onClick={() => join('maghrib', 'isha')}>{_t("Магриб + Иша вместе")}</button>}
        </div>
      )}
    </div>
  );
}

/** Five prayers of the day in a row (kept for screens other than Today). */
export function PrayerStrip(props: PrayerProps) {
  const { day, tap, travel, unlocked } = prayerCtl(props);
  const { times } = props;
  const prayed = ANCHORS.filter((a) => day[a]).length;

  return (
    <section className="prayers" aria-label={_t("Намазы сегодня")}>
      <div className="prayers-head">
        <h3>{_t("Намазы")}</h3>
        <span>{_tj("{0} из 5", prayed)}</span>
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
              aria-label={`${ANCHOR_LABEL[a].ru}: ${m === 'ontime' ? _t("вовремя") : m === 'late' ? _t("с опозданием") : _t("не отмечен")}`}
            >
              <span className="dot">
                {m === 'ontime' && <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M1 6.5l3 3 6-7M7 9.5l1 .5 7-8" /></svg>}
                {m === 'late' && <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 6.5l3 3 7-8" /></svg>}
                {!m && <span className="ar">{ANCHOR_LABEL[a].ar}</span>}
              </span>
              <b>{ANCHOR_LABEL[a].ru}</b>
              <small>{hhmm(times[a])}{travel.traveler && (a === 'dhuhr' || a === 'asr' || a === 'isha') ? _t(" · 2р") : ''}</small>
            </button>
          );
        })}
      </div>
      <TravelBar {...props} />
      <p className="prayers-hint">{_t("Касание: вовремя (две галочки), ещё касание: с опозданием (одна), ещё: снять.")}</p>
    </section>
  );
}
