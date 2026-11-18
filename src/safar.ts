import type { AppState, Settings } from './types';
import { _t } from './i18n';

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

export function isTripDay(s: AppState, day: string) {
  if (tripOn(s, day)) return true;
  return (s.pastTrips ?? []).some((t) => day >= t.from && day <= t.to);
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
  const limit = STAY_LIMIT[s.settings.madhab];
  if (s.trip.stayDays >= limit && day !== s.trip.from && day !== s.trip.to)
    return { traveler: false, why: _t("Ты собираешься пробыть на месте {0} дн. По {1} мазхабу от {2} дней на месте ты уже не путник: намазы полностью. Сокращение только в дни дороги.", s.trip.stayDays, s.settings.madhab === 'hanafi' ? _t("ханафитскому") : _t("шафиитскому"), limit) };
  return { traveler: true, why: s.settings.madhab === 'hanafi' ? _t("Зухр, Аср и Иша по 2 ракаата. У ханафитов намазы не объединяют.") : _t("Зухр, Аср и Иша по 2 ракаата. Можно объединять Зухр с Асром и Магриб с Ишой.") };
}

export const CHECKLIST = [_t("Коврик для намаза"), _t("Коран или приложение"), _t("Бутылка для омовения"), _t("Зарядка и пауэрбанк"), _t("Лекарства"), _t("Документы и билеты"), _t("Садака в дорогу"), _t("Попрощаться с близкими")];

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
