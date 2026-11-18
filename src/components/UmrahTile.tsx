import type { AppState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { plural } from '../dates';
import { _t, _tj } from '../i18n';

/** The door to the umrah app on «Сегодня»: shown once umrah is in someone's plans. */
export function UmrahTile({ state, api, today, onOpen }: { state: AppState; api: UmrahApi; today: string; onOpen: () => void }) {
  const u = state.umrah;
  const me = api.me;
  const going = me ? Object.entries(api.rsvp[me] ?? {}).find(([h, r]) => r.s === 'go' && api.trips[h]) : undefined;
  const trip = going ? api.trips[going[0]] : undefined;
  const chosen = trip?.dates?.find((d) => d.id === trip.chosen);
  const from = chosen?.from ?? u?.from;
  const to = chosen?.to ?? u?.to;
  if (!trip && !from && !(u?.prep?.length) && !(u?.funds?.length)) return null;
  const left = from ? Math.round((Date.parse(from) - Date.parse(today)) / 86400000) : null;
  const there = left !== null && left <= 0 && to && Date.parse(to) >= Date.parse(today);
  if (left !== null && left < -45 && !there) return null;
  const sub = there ? _t("Ты на умре · открыть обряд")
    : left !== null && left > 0 ? _tj("{0}через {1} {2}", trip ? `${trip.title} · ` : '', left, plural(left, _t("день"), _t("дня"), _t("дней")))
    : trip ? trip.title : _t("Подготовка, группа, копилка");
  return (
    <button type="button" className="um-tile" onClick={onOpen}>
      <span className="um-tile-ic" aria-hidden="true">🕋</span>
      <span><b>{_t("Умра")}</b><small>{sub}</small></span>
      <i aria-hidden="true">›</i>
    </button>
  );
}
