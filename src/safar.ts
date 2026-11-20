import type { Anchor, AppState, Masah, PastTrip, Settings, Trip } from './types';
import { ANCHORS } from './types';
import { _t } from './i18n';
import { prayerTimes, type DayTimes } from './prayer';
import { fromKey } from './dates';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const KAABA = { lat: 21.4225, lng: 39.8262 };
/** Initial great-circle bearing to the Kaaba, degrees clockwise from true north. */
export function qibla(lat: number, lng: number) {
  const f1 = rad(lat), f2 = rad(KAABA.lat), dl = rad(KAABA.lng - lng);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export function compassWord(deg: number) {
  return [_t("север"), _t("северо-восток"), _t("восток"), _t("юго-восток"), _t("юг"), _t("юго-запад"), _t("запад"), _t("северо-запад")][Math.round(deg / 45) % 8];
}

export const tripOn = (s: AppState, day: string) => Boolean(s.trip && day >= s.trip.from && day <= s.trip.to);
/** A trip without a return date keeps `to` far ahead. */
export const OPEN_TO = '2099-12-31';
/** Without a return date habit days are excused only for the first days, else streaks could be frozen for good. */
export const OPEN_EXCUSED = 3;
const plusDays = (k: string, n: number) => { const d = fromKey(k); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysBetween = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 864e5);
/** Shafi'i: not knowing when one leaves, shortening lasts up to 18 days. */
export const SHAFI_OPEN_DAYS = 18;

export function isTripDay(s: AppState, day: string) {
  if (tripOn(s, day) && (!s.trip!.open || day < plusDays(s.trip!.from, OPEN_EXCUSED))) return true;
  return (s.pastTrips ?? []).some((t) => day >= t.from && day <= (t.open ? [t.to, plusDays(t.from, OPEN_EXCUSED - 1)].sort()[0] : t.to));
}

/** Settings for prayer times: the destination while a trip is on. */
export function here(s: AppState, day: string): Settings {
  return tripOn(s, day) ? { ...s.settings, place: s.trip!.place, lat: s.trip!.lat, lng: s.trip!.lng } : s.settings;
}

export const MIN_KM = 80;
export const STAY_LIMIT = { shafi: 4, hanafi: 15 } as const;

/**
 * Whether shortening applies today, with a short reason. A long planned stay keeps the rukhsa only
 * on the days of the journey itself (departure and return).
 */
export function travelStatus(s: AppState, day: string): { traveler: boolean; why: string } {
  if (!s.trip || !tripOn(s, day)) return { traveler: false, why: '' };
  const km = distanceKm(s.settings, s.trip);
  if (km < MIN_KM) return { traveler: false, why: _t("До места {0} км. Обычно сафаром считается поездка от ~80 км.", Math.round(km)) };
  const hanafi = s.settings.madhab === 'hanafi';
  const roadDay = day === s.trip.from;
  const shortWhy = hanafi ? _t("Зухр, Аср и Иша по 2 ракаата. У ханафитов намазы не объединяют.") : _t("Зухр, Аср и Иша по 2 ракаата. Можно объединять Зухр с Асром и Магриб с Ишой.");
  if (s.trip.settled && day >= s.trip.settled && !roadDay)
    return { traveler: false, why: _t("Ты решил остаться на месте надолго: ты уже не путник, намазы полностью, джума обязательна.") };
  if (s.trip.open === 'long' && !roadDay)
    return { traveler: false, why: _t("Ты остаёшься надолго: путник только в день дороги. На месте намазы полностью, джума обязательна.") };
  if (s.trip.open === 'unknown') {
    if (hanafi) return { traveler: true, why: _t("Ты не знаешь, когда уедешь, и не решил пробыть 15 дней: сокращаешь, даже если ждёшь долго. ") + shortWhy };
    const n = daysBetween(s.trip.from, day);
    if (n > SHAFI_OPEN_DAYS) return { traveler: false, why: _t("Прошло больше {0} дней: по шафиитскому мазхабу, даже если не знаешь, когда уедешь, теперь намазы полностью.", SHAFI_OPEN_DAYS) };
    return { traveler: true, why: shortWhy };
  }
  const limit = STAY_LIMIT[s.settings.madhab];
  if (s.trip.stayDays >= limit && day !== s.trip.from && day !== s.trip.to)
    return { traveler: false, why: _t("Ты собираешься пробыть на месте {0} дн. По {1} мазхабу от {2} дней на месте ты уже не путник: намазы полностью. Сокращение только в дни дороги.", s.trip.stayDays, s.settings.madhab === 'hanafi' ? _t("ханафитскому") : _t("шафиитскому"), limit) };
  return { traveler: true, why: s.settings.madhab === 'hanafi' ? _t("Зухр, Аср и Иша по 2 ракаата. У ханафитов намазы не объединяют.") : _t("Зухр, Аср и Иша по 2 ракаата. Можно объединять Зухр с Асром и Магриб с Ишой.") };
}

export const CHECKLIST = [_t("Коврик для намаза"), _t("Коран или приложение"), _t("Бутылка для омовения"), _t("Зарядка и пауэрбанк"), _t("Лекарства"), _t("Документы и билеты"), _t("Садака в дорогу"), _t("Попрощаться с близкими"), _t("Носки для масха (надеть после омовения)")];
/** Built-in items are kept by id, so a tick survives switching the language. Older trips hold the text itself. */
export const checkId = (i: number) => `c${i}`;
export const isChecked = (t: Trip, i: number) => t.checklist.includes(checkId(i)) || t.checklist.includes(CHECKLIST[i]);

export interface Dua { title: string; when: string; ar: string; tr: string; ru: string; src: string }
export const DUAS: Dua[] = [
  {
    title: _t("Дуа в начале пути"), when: _t("Когда сел в машину, поезд или самолёт"),
    ar: 'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ، اللهُ أَكْبَرُ، سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ، اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى، وَمِنَ الْعَمَلِ مَا تَرْضَى، اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الْأَهْلِ، اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ، وَكَآبَةِ الْمَنْظَرِ، وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالْأَهْلِ',
    tr: _t("Аллаху акбар (3 раза). Субхана-ллязи саххара ляна хаза ва ма кунна ляху мукринин, ва инна иля Раббина ля-мункалибун. Аллахумма инна нас'алюка фи сафарина хаза-ль-бирра ва-т-такуа, ва мина-ль-'амали ма тарда. Аллахумма хаввин 'алейна сафарана хаза ва-тви 'анна бу'дах. Аллахумма анта-с-сахибу фи-с-сафар, ва-ль-халифату фи-ль-ахль. Аллахумма инни а'узу бика мин ва'са'и-с-сафар, ва ка'абати-ль-манзар, ва су'и-ль-мункаляби фи-ль-мали ва-ль-ахль."),
    ru: _t("Аллах велик (3 раза). Пречист Тот, Кто подчинил нам это, ведь сами мы не смогли бы этого сделать, и, поистине, мы вернёмся к нашему Господу. О Аллах, просим Тебя в этой поездке о благочестии и богобоязненности и о делах, которыми Ты доволен. О Аллах, облегчи нам эту поездку и сократи её расстояние. О Аллах, Ты спутник в пути и оберегающий семью. О Аллах, прибегаю к Тебе от тягот пути, от печального зрелища и от дурного возвращения к имуществу и семье."),
    src: _t("Муслим, 1342"),
  },
  {
    title: _t("Остающимся при прощании"), when: _t("Уезжающий говорит тем, кто остаётся"),
    ar: 'أَسْتَوْدِعُكُمُ اللهَ الَّذِي لَا تَضِيعُ وَدَائِعُهُ',
    tr: _t("Астауди'укуму-Ллаха-ллязи ля тади'у вада'и'ух."),
    ru: _t("Оставляю вас на попечение Аллаха, у Которого не пропадает то, что Ему доверено."),
    src: _t("Ибн Маджа, 2825"),
  },
  {
    title: _t("Когда остановился в месте"), when: _t("Отель, дом, любая остановка"),
    ar: 'أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    tr: _t("А'узу би-калимати-Лляхи-т-таммати мин шарри ма халяк."),
    ru: _t("Прибегаю к совершенным словам Аллаха от зла того, что Он сотворил."),
    src: _t("Муслим, 2708"),
  },
  {
    title: _t("В дороге: подъём и спуск"), when: _t("Самолёт взлетает, дорога идёт в гору или вниз"),
    ar: 'اللهُ أَكْبَرُ ... سُبْحَانَ اللهِ',
    tr: _t("При подъёме: «Аллаху акбар». При спуске: «Субхана-Ллах»."),
    ru: _t("При подъёме «Аллах велик», при спуске «Пречист Аллах»."),
    src: _t("аль-Бухари, 2993"),
  },
  {
    title: _t("При возвращении"), when: _t("Дуа начала пути и в конце эти слова"),
    ar: 'آيِبُونَ، تَائِبُونَ، عَابِدُونَ، لِرَبِّنَا حَامِدُونَ',
    tr: _t("Айибуна, та'ибуна, 'абидуна, ли-Раббина хамидун."),
    ru: _t("Возвращаемся, каемся, поклоняемся и восхваляем нашего Господа."),
    src: _t("Муслим, 1342"),
  },
];

// ───── The traveller's day ─────

export interface PlanRow { a: Anchor[]; at: Date; until: Date; rakats: string; together: boolean }

/** Today's prayers for a traveller: shortened, and for the Shafi'i madhab Dhuhr+Asr and Maghrib+Isha together. */
export function travelPlan(s: AppState, day: string, t: DayTimes): PlanRow[] {
  const st = travelStatus(s, day);
  const short = st.traveler;
  const join = short && s.settings.madhab === 'shafi';
  const r = (a: Anchor) => (a === 'fajr' ? '2' : a === 'maghrib' ? '3' : short ? '2' : '4');
  const end = (a: Anchor): Date => {
    if (a === 'fajr') return t.sunrise;
    const i = ANCHORS.indexOf(a);
    if (i < 4) return t[ANCHORS[i + 1]];
    const m = new Date(t.isha); m.setHours(23, 59, 0, 0); return m;
  };
  if (!join) return ANCHORS.map((a) => ({ a: [a], at: t[a], until: end(a), rakats: r(a), together: false }));
  return [
    { a: ['fajr'], at: t.fajr, until: t.sunrise, rakats: '2', together: false },
    { a: ['dhuhr', 'asr'], at: t.dhuhr, until: t.maghrib, rakats: '2+2', together: true },
    { a: ['maghrib', 'isha'], at: t.maghrib, until: end('isha'), rakats: '3+2', together: true },
  ];
}

// ───── Masah over socks ─────

export const MASAH_H = { traveler: 72, home: 24 } as const;
/** The term runs from the first time wudu broke after putting the socks on (Hanafi and Shafi'i). */
export function masahLeft(m: Masah | null | undefined, traveler: boolean, now = Date.now()) {
  if (!m) return null;
  const hours = traveler ? MASAH_H.traveler : MASAH_H.home;
  if (!m.broke) return { started: false, hours, end: null as number | null, left: hours * 3600e3, frac: 1 };
  const end = m.broke + hours * 3600e3;
  const left = Math.max(0, end - now);
  return { started: true, hours, end, left, frac: left / (hours * 3600e3) };
}
export function leftLabel(ms: number) {
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 24) return _t("{0} сут {1} ч", Math.floor(h / 24), h % 24);
  return h > 0 ? _t("{0} ч {1} мин", h, m) : _t("{0} мин", m);
}

// ───── The road: which prayers fall into it ─────

export interface RoadStep { at: Date; kind: 'dep' | 'arr' | 'prayer'; a?: Anchor; inside?: boolean; advice?: string }

const LBL = (a: Anchor) => ({ fajr: _t("Фаджр"), dhuhr: _t("Зухр"), asr: _t("Аср"), maghrib: _t("Магриб"), isha: _t("Иша") }[a]);
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Prayer windows met on the road. Position is taken along a straight line between home and the destination,
 * so times in the air are close enough to plan by. Times are by the phone's clock (home time zone).
 */
export function roadPlan(s: AppState, trip: Trip): { dep: Date; arr: Date; steps: RoadStep[] } | null {
  if (!trip.depTime || !trip.dur) return null;
  const [h, m] = trip.depTime.split(':').map(Number);
  const dep = fromKey(trip.from); dep.setHours(h, m, 0, 0);
  const arr = new Date(dep.getTime() + trip.dur * 60e3);
  const home = s.settings;
  const at = (d: Date): Settings => {
    const f = Math.min(1, Math.max(0, (d.getTime() - dep.getTime()) / (arr.getTime() - dep.getTime())));
    return { ...home, lat: home.lat + (trip.lat - home.lat) * f, lng: home.lng + (trip.lng - home.lng) * f };
  };
  const shafi = home.madhab === 'shafi';
  const traveler = distanceKm(home, trip) >= MIN_KM;
  const mode = trip.mode ?? 'plane';
  const steps: RoadStep[] = [{ at: dep, kind: 'dep' }, { at: arr, kind: 'arr' }];
  // Walk the road in 5-minute steps; a prayer starts when its time at the current point has come.
  let prev: Anchor | 'sunrise' | null = null;
  const cur = (d: Date): Anchor | 'sunrise' | null => {
    const t = prayerTimes(at(d), d);
    let c: Anchor | 'sunrise' | null = null;
    for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) if (t[k].getTime() <= d.getTime()) c = k;
    return c;
  };
  // The prayer already running at departure counts too.
  const begin = new Date(dep.getTime() - 1);
  prev = cur(begin);
  const met: { a: Anchor; at: Date; startedBefore: boolean }[] = [];
  if (prev && prev !== 'sunrise') met.push({ a: prev, at: prayerTimes(at(begin), begin)[prev], startedBefore: true });
  for (let x = dep.getTime(); x <= arr.getTime(); x += 5 * 60e3) {
    const d = new Date(x);
    const c = cur(d);
    if (c !== prev && c && c !== 'sunrise') met.push({ a: c, at: d, startedBefore: false });
    prev = c;
  }
  const atArr = cur(arr);
  for (const p of met) {
    const goesOn = p.a === atArr; // the window is still open on arrival
    const pair: Anchor | null = shafi && traveler ? ({ dhuhr: 'asr', asr: 'dhuhr', maghrib: 'isha', isha: 'maghrib' } as Partial<Record<Anchor, Anchor>>)[p.a] ?? null : null;
    let advice: string;
    if (p.startedBefore) advice = goesOn ? _t("Время уже идёт. Лучше соверши до посадки, или после прибытия.") : _t("Время уже идёт: соверши до посадки.");
    else if (goesOn) advice = _t("Можно совершить после прибытия: время ещё будет.");
    else if (pair === 'asr' || pair === 'isha') advice = _t("Можно отложить и совершить вместе с {0} после прибытия.", pair === 'asr' ? _t("Асром") : _t("Ишой"));
    else if (pair) advice = _t("Лучше соверши вместе с {0} до посадки.", pair === 'dhuhr' ? _t("Зухром") : _t("Магрибом"));
    else advice = mode === 'car' ? _t("Время закончится в дороге: остановись и соверши намаз.") : _t("Время закончится в пути: соверши намаз на месте, стоя или сидя.");
    steps.push({ at: p.at, kind: 'prayer', a: p.a, inside: !p.startedBefore, advice });
  }
  steps.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === 'dep' ? -1 : 1));
  return { dep, arr, steps };
}
export const prayerName = LBL;
export const hhmm = hm;

// ───── Summary after the trip ─────

export function tripSummary(s: AppState, t: Trip): PastTrip {
  let prayers = 0, total = 0;
  for (let d = fromKey(t.from); ; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (k > t.to || k > plusDays(t.from, 400)) break;
    total += 5;
    prayers += Object.keys(s.prayers?.[k] ?? {}).length;
  }
  return { from: t.from, to: t.to, place: t.place, prayers, total, duas: t.duas?.length ?? 0, ...(t.open ? { open: true } : {}) };
}

/** Shafi'i, return unknown: days of shortening left (0 = from today full prayers). Null when it does not apply. */
export function shafiDaysLeft(s: AppState, day: string): number | null {
  const t = s.trip;
  if (!t || t.open !== 'unknown' || s.settings.madhab !== 'shafi' || t.settled) return null;
  return Math.max(0, SHAFI_OPEN_DAYS - daysBetween(t.from, day));
}

/** Reminders for the server: the end of masah (3 h before) and joined prayers on the next two trip days. */
export function safarRings(s: AppState, today: string, now = Date.now()): { k: string; at: number; t: string }[] {
  const out: { k: string; at: number; t: string }[] = [];
  const m = masahLeft(s.masah, travelStatus(s, today).traveler, now);
  if (m?.end) out.push({ k: `masah-${s.masah!.broke}`, at: m.end - 3 * 3600e3, t: _t("Масх на носки заканчивается в {0}. Дальше снова полное омовение с мытьём ног.", hm(new Date(m.end))) });
  for (let i = 0; i < 2; i++) {
    const d = fromKey(today); d.setDate(d.getDate() + i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!tripOn(s, k) || !travelStatus(s, k).traveler || s.settings.madhab !== 'shafi') continue;
    const t = prayerTimes({ ...here(s, k), offsets: s.settings.offsets }, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
    for (const r of travelPlan(s, k, t)) if (r.together) out.push({ k: `safar-${k}-${r.a[0]}`, at: r.at.getTime() - 10 * 60e3, t: _t("Через 10 минут {0} вместе: по {1} ракаата.", r.a.map(LBL).join(' + '), r.rakats) });
  }
  return out;
}
