import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import type { Anchor, MethodId, Settings } from './types';
import { _t } from './i18n';

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

export const PLACES: { name: string; lat: number; lng: number }[] = [
  { name: _t("Амстердам"), lat: 52.3676, lng: 4.9041 },
  { name: _t("Роттердам"), lat: 51.9244, lng: 4.4777 },
  { name: _t("Гаага"), lat: 52.0705, lng: 4.3007 },
  { name: _t("Москва"), lat: 55.7558, lng: 37.6173 },
  { name: _t("Санкт-Петербург"), lat: 59.9343, lng: 30.3351 },
  { name: _t("Казань"), lat: 55.7963, lng: 49.1088 },
  { name: _t("Уфа"), lat: 54.7388, lng: 55.9721 },
  { name: _t("Махачкала"), lat: 42.9849, lng: 47.5047 },
  { name: _t("Грозный"), lat: 43.3178, lng: 45.6949 },
  { name: _t("Нальчик"), lat: 43.4853, lng: 43.6071 },
  { name: _t("Ташкент"), lat: 41.2995, lng: 69.2401 },
  { name: _t("Алматы"), lat: 43.2389, lng: 76.8897 },
  { name: _t("Баку"), lat: 40.4093, lng: 49.8671 },
  { name: _t("Стамбул"), lat: 41.0082, lng: 28.9784 },
  { name: _t("Дубай"), lat: 25.2048, lng: 55.2708 },
  { name: _t("Лондон"), lat: 51.5074, lng: -0.1278 },
  { name: _t("Берлин"), lat: 52.52, lng: 13.405 },
  { name: _t("Нью-Йорк"), lat: 40.7128, lng: -74.006 },
  { name: _t("Мекка"), lat: 21.4225, lng: 39.8262 },
  { name: _t("Медина"), lat: 24.4672, lng: 39.6111 },
  { name: _t("Джидда"), lat: 21.4858, lng: 39.1925 },
  { name: _t("Эр-Рияд"), lat: 24.7136, lng: 46.6753 },
  { name: _t("Абу-Даби"), lat: 24.4539, lng: 54.3773 },
  { name: _t("Доха"), lat: 25.2854, lng: 51.531 },
  { name: _t("Каир"), lat: 30.0444, lng: 31.2357 },
  { name: _t("Анкара"), lat: 39.9334, lng: 32.8597 },
  { name: _t("Анталья"), lat: 36.8969, lng: 30.7133 },
  { name: _t("Утрехт"), lat: 52.0907, lng: 5.1214 },
  { name: _t("Эйндховен"), lat: 51.4416, lng: 5.4697 },
  { name: _t("Брюссель"), lat: 50.8503, lng: 4.3517 },
  { name: _t("Антверпен"), lat: 51.2194, lng: 4.4025 },
  { name: _t("Париж"), lat: 48.8566, lng: 2.3522 },
  { name: _t("Кёльн"), lat: 50.9375, lng: 6.9603 },
  { name: _t("Дюссельдорф"), lat: 51.2277, lng: 6.7735 },
  { name: _t("Франкфурт"), lat: 50.1109, lng: 8.6821 },
  { name: _t("Мюнхен"), lat: 48.1351, lng: 11.582 },
  { name: _t("Вена"), lat: 48.2082, lng: 16.3738 },
  { name: _t("Копенгаген"), lat: 55.6761, lng: 12.5683 },
  { name: _t("Стокгольм"), lat: 59.3293, lng: 18.0686 },
  { name: _t("Варшава"), lat: 52.2297, lng: 21.0122 },
  { name: _t("Прага"), lat: 50.0755, lng: 14.4378 },
  { name: _t("Рим"), lat: 41.9028, lng: 12.4964 },
  { name: _t("Мадрид"), lat: 40.4168, lng: -3.7038 },
  { name: _t("Барселона"), lat: 41.3874, lng: 2.1686 },
  { name: _t("Сараево"), lat: 43.8563, lng: 18.4131 },
  { name: _t("Тбилиси"), lat: 41.7151, lng: 44.8271 },
  { name: _t("Бишкек"), lat: 42.8746, lng: 74.5698 },
  { name: _t("Душанбе"), lat: 38.5598, lng: 68.787 },
  { name: _t("Самарканд"), lat: 39.6542, lng: 66.9597 },
  { name: _t("Куала-Лумпур"), lat: 3.139, lng: 101.6869 },
  { name: _t("Джакарта"), lat: -6.2088, lng: 106.8456 },
];

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
