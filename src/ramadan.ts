import type { AppState, FastMark, RamadanState } from './types';
import { addDays, fromKey } from './dates';
import { juzDone, ayahIndex } from './goals';

export const ramadanOf = (s: AppState): RamadanState => ({ fasts: {}, qada: [], khatm: null, nights: {}, fitr: [], keep: {}, ...(s.ramadan ?? {}) });
export const patchR = (s: AppState, fn: (r: RamadanState) => Partial<RamadanState>): AppState => { const r = ramadanOf(s); return { ...s, ramadan: { ...r, ...fn(r) } }; };

export function hijriY(d: Date): { day: number; month: number; year: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const day = g('day'), month = g('month'), year = g('year');
    return day && month && year ? { day, month, year } : null;
  } catch { return null; }
}
export const hOf = (key: string) => hijriY(fromKey(key));

/** Day of Ramadan (1..30) for a date, or null. */
export const ramadanDay = (key: string) => { const h = hOf(key); return h?.month === 9 ? h.day : null; };

/** The Ramadan to show: the current one, the one that ended under 60 days ago, otherwise the next. */
export function ramadanMonth(today: string): { days: string[]; year: number; state: 'now' | 'past' | 'next'; daysTo: number } {
  let anchor: string | null = null, state: 'now' | 'past' | 'next' = 'next', daysTo = 0;
  if (ramadanDay(today)) { anchor = today; state = 'now'; }
  for (let i = 1; !anchor && i <= 60; i++) if (ramadanDay(addDays(today, -i))) { anchor = addDays(today, -i); state = 'past'; }
  for (let i = 1; !anchor && i <= 400; i++) if (ramadanDay(addDays(today, i))) { anchor = addDays(today, i); daysTo = i; }
  if (!anchor) return { days: [], year: 0, state, daysTo };
  let start = anchor;
  while (ramadanDay(addDays(start, -1))) start = addDays(start, -1);
  const days: string[] = [];
  for (let d = start; ramadanDay(d) && days.length < 31; d = addDays(d, 1)) days.push(d);
  return { days, year: hOf(start)!.year, state, daysTo };
}

export const MISSED: { id: FastMark; l: string; en: string; note: string; noteEn: string }[] = [
  { id: 'ill', l: 'Болезнь', en: 'Illness', note: 'Возместить потом', noteEn: 'Make it up later' },
  { id: 'travel', l: 'В пути', en: 'Travelling', note: 'Возместить потом', noteEn: 'Make it up later' },
  { id: 'period', l: 'Месячные', en: 'Period', note: 'Возместить потом', noteEn: 'Make it up later' },
  { id: 'other', l: 'Другое', en: 'Other', note: 'Возместить потом', noteEn: 'Make it up later' },
  { id: 'chronic', l: 'Не могу поститься', en: 'Cannot fast', note: 'Старость или болезнь без надежды на выздоровление: фидья', noteEn: 'Old age or an illness with no hope of recovery: fidyah' },
];

export function debt(r: RamadanState) {
  const missed = Object.values(r.fasts).filter((m) => m !== 'fast' && m !== 'chronic').length;
  return { missed, made: r.qada.length, left: Math.max(0, missed - r.qada.length), fidya: Object.values(r.fasts).filter((m) => m === 'chronic').length };
}

/** Khatm plan progress in juz. */
export function khatmProgress(s: AppState, r: RamadanState, day: number) {
  const k = r.khatm;
  if (!k) return null;
  const idx = s.quran ? ayahIndex(s.quran.surah, s.quran.ayah) : 0;
  const done = Math.max(0, juzDone(idx) + k.rounds * 30 - juzDone(k.startIdx));
  const goal = Math.round(k.rate * 30);
  const expected = Math.max(0, Math.min(goal, Math.round(k.rate * (day - (k.startDay ?? 1) + 1) * 10) / 10));
  const pagesPerPrayer = Math.round((k.rate * 20) / 5);
  return { done, goal, expected, pagesPerPrayer, nearEnd: juzDone(idx) >= 29 };
}

/** Which night of Ramadan begins on the evening of this day (night N starts at Maghrib before day N). */
export function nightOf(key: string): number | null {
  const t = ramadanDay(addDays(key, 1));
  return t;
}

export const EID_SUNNA: [string, string][] = [
  ['Гусль и лучшая одежда', 'Ghusl and your best clothes'],
  ['Перед намазом съесть нечётное число фиников (аль-Бухари, 953)', 'Eat an odd number of dates before the prayer (al-Bukhari, 953)'],
  ['Такбиры по дороге на намаз', 'Takbir on the way to the prayer'],
  ['Пойти одной дорогой, вернуться другой (аль-Бухари, 986)', 'Go by one route and return by another (al-Bukhari, 986)'],
  ['Поздравить: «Такаббаля-Ллаху минна ва минкум»', 'Greet: "Taqabbal-Allahu minna wa minkum"'],
];
export const TAKBIR = { ar: 'اللَّهُ أَكْبَرُ اللَّهُ أَكْبَرُ، لَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ اللَّهُ أَكْبَرُ، وَلِلَّهِ الْحَمْدُ', tr: 'Аллаху акбар, Аллаху акбар, ля иляха илля-Ллах, ва-Ллаху акбар, Аллаху акбар, ва ли-Лляхи-ль-хамд.', trEn: 'Allahu akbar, Allahu akbar, la ilaha illa-llah, wa-llahu akbar, Allahu akbar, wa lillahi-l-hamd.' };
export const QADR_DUA = { ar: 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي', tr: 'Аллахумма иннака ‘афуввун тухиббу-ль-‘афва фа‘фу ‘анни.', trEn: 'Allahumma innaka ‘afuwwun tuhibbu-l-‘afwa fa‘fu ‘anni.', ru: '«О Аллах, Ты Прощающий, любишь прощать, так прости же меня».', en: '"O Allah, You are Pardoning and You love to pardon, so pardon me."', src: 'ат-Тирмизи, 3513', srcEn: 'at-Tirmidhi, 3513' };
export const IFTAR_DUA = { ar: 'ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ', tr: 'Захаба-з-зама’у ва-бталляти-ль-‘урук ва сабата-ль-аджру ин ша’а-Ллах.', trEn: 'Dhahaba-dh-dhama’u wabtallati-l-‘uruqu wa thabata-l-ajru in sha’ Allah.', src: 'Абу Дауд, 2357', srcEn: 'Abu Dawud, 2357' };

/** Day of the 30-day programme to show on a date: the day of Ramadan, else null. */
export const programmeDay = (key: string) => ramadanDay(key);

/** The last third of the night that begins on the evening of `key`, from Maghrib to the next Fajr. */
export function lastThird(maghrib: Date, nextFajr: Date) {
  return new Date(maghrib.getTime() + ((nextFajr.getTime() - maghrib.getTime()) * 2) / 3);
}

/** Shawwal days fasted (from Health fasts), skipping Eid day. */
export function shawwalCount(s: AppState, today: string) {
  const h = hOf(today);
  if (!h || h.month !== 10) return null;
  let n = 0;
  for (let i = 0; i < h.day; i++) {
    const d = addDays(today, -i);
    const x = hOf(d);
    if (x?.month === 10 && x.day > 1 && s.health?.fasts?.[d]) n++;
  }
  return n;
}
