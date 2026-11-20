import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import type { Anchor, MethodId, Settings } from './types';
import { _t } from './i18n';
import { ALL_PLACES } from './places';

export const METHODS: { id: MethodId; ru: string }[] = [
  { id: 'MuslimWorldLeague', ru: _t("Всемирная исламская лига") },
  { id: 'MoonsightingCommittee', ru: 'Moonsighting Committee' },
  { id: 'NorthAmerica', ru: _t("ISNA (Северная Америка)") },
  { id: 'Egyptian', ru: _t("Египетское управление") },
  { id: 'Karachi', ru: _t("Университет Карачи") },
  { id: 'UmmAlQura', ru: _t("Умм аль-Кура (Мекка)") },
  { id: 'Dubai', ru: _t("Дубай") },
  { id: 'Turkey', ru: _t("Диянет (Турция)") },
];

/** Every city of every country (see places.ts). */
export const PLACES: { name: string; lat: number; lng: number }[] = ALL_PLACES;

export type DayTimes = Record<Anchor | 'sunrise', Date>;

export function prayerTimes(s: Settings, date: Date): DayTimes {
  const coords = new Coordinates(s.lat, s.lng);
  const params = CalculationMethod[s.method]();
  params.madhab = s.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  // Needed in the Netherlands and Russia in summer, when twilight barely ends.
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  const o = s.offsets ?? {};
  params.adjustments = { fajr: o.fajr ?? 0, sunrise: 0, dhuhr: o.dhuhr ?? 0, asr: o.asr ?? 0, maghrib: o.maghrib ?? 0, isha: o.isha ?? 0 };
  const t = new PrayerTimes(coords, date, params);
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

const ORDER: Anchor[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** The window "after X" runs from prayer X to the next prayer (after Isha: until midnight). */
export function windowState(times: DayTimes, now: Date) {
  let current: Anchor | null = null;
  for (const a of ORDER) if (times[a].getTime() <= now.getTime()) current = a;
  const idx = current ? ORDER.indexOf(current) : -1;
  const next = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  const end = (a: Anchor) => {
    const i = ORDER.indexOf(a);
    if (i < ORDER.length - 1) return times[ORDER[i + 1]];
    const m = new Date(now);
    m.setHours(23, 59, 59, 0);
    return m;
  };
  return { current, next, end };
}

export function windowStatus(a: Anchor, current: Anchor | null): 'past' | 'now' | 'future' {
  if (!current) return 'future';
  const i = ORDER.indexOf(a);
  const c = ORDER.indexOf(current);
  return i < c ? 'past' : i === c ? 'now' : 'future';
}
