import { _t, LOC, isEn } from './i18n';
const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

export const daysBetween = (a: string, b: string) =>
  Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);

export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function gregorianLabel(d: Date) {
  const s = new Intl.DateTimeFormat(LOC, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const HIJRI_MONTHS = [_t("мухаррама"), _t("сафара"), _t("раби-уль-авваля"), _t("раби-уль-ахира"), _t("джумада-ль-уля"), _t("джумада-ль-ахира"), _t("раджаба"), _t("шабана"), _t("рамадана"), _t("шавваля"), _t("зуль-каады"), _t("зуль-хиджжи")];

/** Hijri date with our own month names: some phones print Gregorian month names for the Islamic calendar. */
export function hijriLabel(d: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const day = get('day'), month = get('month'), year = get('year');
    if (!day || !month || !year || month > 12) return '';
    return `${day} ${HIJRI_MONTHS[month - 1]} ${year}`;
  } catch {
    return '';
  }
}

export function durationLabel(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return _t("{0} мин", r);
  return r ? _t("{0} ч {1} мин", h, r) : _t("{0} ч", h);
}

export function plural(n: number, one: string, few: string, many: string) {
  if (isEn) return Math.abs(n) === 1 ? one : many;
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
