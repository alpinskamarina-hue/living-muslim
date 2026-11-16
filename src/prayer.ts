import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import type { Anchor, MethodId, Settings } from './types';

export const METHODS: { id: MethodId; ru: string }[] = [
  { id: 'MuslimWorldLeague', ru: 'Всемирная исламская лига' },
  { id: 'MoonsightingCommittee', ru: 'Moonsighting Committee' },
  { id: 'NorthAmerica', ru: 'ISNA (Северная Америка)' },
  { id: 'Egyptian', ru: 'Египетское управление' },
  { id: 'Karachi', ru: 'Университет Карачи' },
  { id: 'UmmAlQura', ru: 'Умм аль-Кура (Мекка)' },
  { id: 'Dubai', ru: 'Дубай' },
  { id: 'Turkey', ru: 'Диянет (Турция)' },
];

export const PLACES: { name: string; lat: number; lng: number }[] = [
  { name: 'Амстердам', lat: 52.3676, lng: 4.9041 },
  { name: 'Роттердам', lat: 51.9244, lng: 4.4777 },
  { name: 'Гаага', lat: 52.0705, lng: 4.3007 },
  { name: 'Москва', lat: 55.7558, lng: 37.6173 },
  { name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351 },
  { name: 'Казань', lat: 55.7963, lng: 49.1088 },
  { name: 'Уфа', lat: 54.7388, lng: 55.9721 },
  { name: 'Махачкала', lat: 42.9849, lng: 47.5047 },
  { name: 'Грозный', lat: 43.3178, lng: 45.6949 },
  { name: 'Нальчик', lat: 43.4853, lng: 43.6071 },
  { name: 'Ташкент', lat: 41.2995, lng: 69.2401 },
  { name: 'Алматы', lat: 43.2389, lng: 76.8897 },
  { name: 'Баку', lat: 40.4093, lng: 49.8671 },
  { name: 'Стамбул', lat: 41.0082, lng: 28.9784 },
  { name: 'Дубай', lat: 25.2048, lng: 55.2708 },
  { name: 'Лондон', lat: 51.5074, lng: -0.1278 },
  { name: 'Берлин', lat: 52.52, lng: 13.405 },
  { name: 'Нью-Йорк', lat: 40.7128, lng: -74.006 },
  { name: 'Мекка', lat: 21.4225, lng: 39.8262 },
  { name: 'Медина', lat: 24.4672, lng: 39.6111 },
  { name: 'Джидда', lat: 21.4858, lng: 39.1925 },
  { name: 'Эр-Рияд', lat: 24.7136, lng: 46.6753 },
  { name: 'Абу-Даби', lat: 24.4539, lng: 54.3773 },
  { name: 'Доха', lat: 25.2854, lng: 51.531 },
  { name: 'Каир', lat: 30.0444, lng: 31.2357 },
  { name: 'Анкара', lat: 39.9334, lng: 32.8597 },
  { name: 'Анталья', lat: 36.8969, lng: 30.7133 },
  { name: 'Утрехт', lat: 52.0907, lng: 5.1214 },
  { name: 'Эйндховен', lat: 51.4416, lng: 5.4697 },
  { name: 'Брюссель', lat: 50.8503, lng: 4.3517 },
  { name: 'Антверпен', lat: 51.2194, lng: 4.4025 },
  { name: 'Париж', lat: 48.8566, lng: 2.3522 },
  { name: 'Кёльн', lat: 50.9375, lng: 6.9603 },
  { name: 'Дюссельдорф', lat: 51.2277, lng: 6.7735 },
  { name: 'Франкфурт', lat: 50.1109, lng: 8.6821 },
  { name: 'Мюнхен', lat: 48.1351, lng: 11.582 },
  { name: 'Вена', lat: 48.2082, lng: 16.3738 },
  { name: 'Копенгаген', lat: 55.6761, lng: 12.5683 },
  { name: 'Стокгольм', lat: 59.3293, lng: 18.0686 },
  { name: 'Варшава', lat: 52.2297, lng: 21.0122 },
  { name: 'Прага', lat: 50.0755, lng: 14.4378 },
  { name: 'Рим', lat: 41.9028, lng: 12.4964 },
  { name: 'Мадрид', lat: 40.4168, lng: -3.7038 },
  { name: 'Барселона', lat: 41.3874, lng: 2.1686 },
  { name: 'Сараево', lat: 43.8563, lng: 18.4131 },
  { name: 'Тбилиси', lat: 41.7151, lng: 44.8271 },
  { name: 'Бишкек', lat: 42.8746, lng: 74.5698 },
  { name: 'Душанбе', lat: 38.5598, lng: 68.787 },
  { name: 'Самарканд', lat: 39.6542, lng: 66.9597 },
  { name: 'Куала-Лумпур', lat: 3.139, lng: 101.6869 },
  { name: 'Джакарта', lat: -6.2088, lng: 106.8456 },
];

export type DayTimes = Record<Anchor | 'sunrise', Date>;

export function prayerTimes(s: Settings, date: Date): DayTimes {
  const coords = new Coordinates(s.lat, s.lng);
  const params = CalculationMethod[s.method]();
  params.madhab = s.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  // Needed in the Netherlands and Russia in summer, when twilight barely ends.
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
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
