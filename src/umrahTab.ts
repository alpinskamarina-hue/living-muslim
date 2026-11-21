// «Умра» in the bottom bar: shown while the person is on the way to an umrah (a trip they gather or go on,
// a call to a trip they have not answered, their own dates or an umrah goal) and gone once the umrah is made
// (the day after the return date).
import type { AppState } from './types';
import type { UmrahApi } from './umrahCircle';
import { umrahOf } from './components/Umrah';
import { hasUmrahGoal } from './umrahTest';
import { currentCircle, isCloud } from './cloud';

const KEY = 'lm.umTab';
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

/** The trip I gather or go on in the open circle, with its return day if the dates are chosen. */
function myTrip(api: UmrahApi): { on: boolean; to?: string } {
  const { me, trips, rsvp } = api;
  if (!me) return { on: false };
  const hosts = [...(trips[me] ? [me] : []), ...Object.entries(rsvp[me] ?? {}).filter(([h, r]) => r.s === 'go' && trips[h]).map(([h]) => h)];
  if (!hosts.length) return { on: false };
  const ends = hosts.map((h) => { const t = trips[h]; return t.dates?.find((d) => d.id === t.chosen)?.to; });
  // a trip without chosen dates keeps the tab; with dates, the latest return day counts
  return { on: true, to: ends.some((x) => !x) ? undefined : ends.sort().pop() };
}

export function umrahTabOn(state: AppState, api: UmrahApi, called: boolean, today: string): boolean {
  const u = umrahOf(state);
  const over = (to?: string) => Boolean(to && today > to);
  const trip = myTrip(api);
  const code = isCloud ? currentCircle()?.code ?? '' : '';
  let mem: { code: string; to?: string } | null = null;
  try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* */ }
  // The trip lives in one circle; remember it so the tab stays while another circle is open.
  if (trip.on && !over(trip.to)) {
    if (!mem || mem.code !== code || mem.to !== trip.to) try { localStorage.setItem(KEY, JSON.stringify({ code, to: trip.to })); } catch { /* */ }
    return true;
  }
  // the umrah is made: the tab goes, unless new dates of my own come after it
  if (trip.on) { try { localStorage.removeItem(KEY); } catch { /* */ } return Boolean(u.from && u.from > trip.to! && !over(u.to)); }
  if (mem && api.ready && (mem.code === code || over(mem.to))) { try { localStorage.removeItem(KEY); } catch { /* */ } mem = null; }
  if (mem) return true;
  if (called) return true;
  if (u.from) return !over(u.to ?? addDays(u.from, 21));
  return hasUmrahGoal(state);
}
