import type { Anchor, AppState } from './types';
import { addDays, daysBetween } from './dates';
import { isEn } from './i18n';

// «Новый путь»: a calm 40-day path for someone who has just accepted Islam.
// One small step a day, a prayer teacher that counts rak'ahs, and a trainer for the first suras.
// Texts are general and mainstream; they still need an imam's review before wide launch.

const L = (ru: string, en: string) => (isEn ? en : ru);
/** «{сделал/сделала}» → the form for a brother or a sister. */
export const gx = (t: string, f?: boolean) => t.replace(/\{([^/{}]*)\/([^/{}]*)\}/g, (_, m, w) => (f ? w : m));

export interface SuraProgress {
  /** Ayah being learned now (0-based). */
  ayah: number;
  /** Hint level for that ayah: 0 full transliteration, 1 gaps, 2 first letters, 3 none. */
  stage: number;
  /** Ayahs already known by heart. */
  known: number[];
  /** Day the whole sura was recited from memory. */
  learned?: string;
  /** Days of review after learning. */
  reviews?: string[];
}

export interface NewPathState {
  on: boolean;
  /** Day the path started. */
  start: string;
  /** Lesson number → day it was done. */
  done: Record<number, string>;
  suras: Record<number, SuraProgress>;
  /** The card on Today was hidden after the 40 days. */
  closed?: boolean;
}

export const npOf = (s: AppState): NewPathState => s.newpath ?? { on: false, start: '', done: {}, suras: {} };

export function turnOn(s: AppState, today: string): AppState {
  const np = npOf(s);
  return { ...s, newpath: { ...np, on: true, closed: false, start: np.start || today } };
}
export const turnOff = (s: AppState): AppState => ({ ...s, newpath: { ...npOf(s), on: false } });

export function markLesson(s: AppState, n: number, today: string): AppState {
  const np = npOf(s);
  if (np.done[n]) return s;
  return { ...s, newpath: { ...np, done: { ...np.done, [n]: today } } };
}

export function setSura(s: AppState, n: number, patch: Partial<SuraProgress>): AppState {
  const np = npOf(s);
  const cur = np.suras[n] ?? { ayah: 0, stage: 0, known: [] };
  return { ...s, newpath: { ...np, suras: { ...np.suras, [n]: { ...cur, ...patch } } } };
}

/** The path as the person sees it today: how many steps are done, which one is next, was one done today. */
export function pathNow(s: AppState, today: string) {
  const np = npOf(s);
  const doneN = LESSONS.filter((l) => np.done[l.n]).length;
  const next = LESSONS.find((l) => !np.done[l.n]) ?? null;
  const todayDone = Object.values(np.done).includes(today);
  const last = LESSONS.filter((l) => np.done[l.n] === today).pop() ?? null;
  return { np, doneN, next, todayDone, last, day: Math.min(40, doneN + (todayDone ? 0 : 1)), finished: doneN >= LESSONS.length };
}

/** Skills the person already has, for the chips on Today. */
export function skills(s: AppState) {
  const np = npOf(s);
  const out: string[] = [];
  for (const l of LESSONS) if (l.skill && np.done[l.n] && !out.includes(l.skill)) out.push(l.skill);
  for (const n of Object.keys(np.suras).map(Number)) {
    const sp = np.suras[n];
    const name = SURAS[n]?.name;
    if (sp?.learned && name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Spaced review after a sura is learned: the next day, after 3 days, a week and a month. */
const GAPS = [1, 3, 7, 30];
export function reviewDue(s: AppState, today: string): number | null {
  const np = npOf(s);
  for (const n of SURA_ORDER) {
    const sp = np.suras[n];
    if (!sp?.learned) continue;
    const r = sp.reviews ?? [];
    if (r.length >= GAPS.length || r.includes(today)) continue;
    const from = r.length ? r[r.length - 1] : sp.learned;
    const gap = GAPS[r.length] - (r.length ? GAPS[r.length - 1] : 0);
    if (daysBetween(from, today) >= gap) return n;
  }
  return null;
}
export const nextReview = (sp: SuraProgress) => {
  if (!sp.learned) return null;
  const r = sp.reviews ?? [];
  if (r.length >= GAPS.length) return null;
  return addDays(sp.learned, GAPS[r.length]);
};

/** The sura to read after al-Fatiha in the first two rak'ahs: the last one learned, besides al-Fatiha. */
export function prayerSura(s: AppState): number | null {
  const np = npOf(s);
  const list = SURA_ORDER.filter((n) => n !== 1 && np.suras[n]?.learned);
  return list.length ? list[list.length - 1] : null;
}

// ─── Suras ──────────────────────────────────────────────────────────────────

export interface Ayah { ar: string; tr: string; mean: string }
export interface Sura { n: number; name: string; ar: string; why: string; ayahs: Ayah[] }

const A = (ar: string, ru: string, en: string, mRu: string, mEn: string): Ayah => ({ ar, tr: L(ru, en), mean: L(mRu, mEn) });

export const SURA_ORDER = [1, 112, 108, 103, 113, 114];

export const SURAS: Record<number, Sura> = {
  1: {
    n: 1, name: L('Аль-Фатиха', 'Al-Fatiha'), ar: 'الفاتحة',
    why: L('Открывающая. Её читают в каждом ракаате каждого намаза.', 'The Opening. It is recited in every rak‘ah of every prayer.'),
    ayahs: [
      A('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ', 'Бисмилляхи-р-Рахмани-р-Рахим', 'Bismillahir-Rahmanir-Rahim', 'Во имя Аллаха, Милостивого, Милосердного', 'In the name of Allah, the Entirely Merciful, the Especially Merciful'),
      A('ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ', 'Аль-хамду ли-Лляхи Рабби-ль-‘алямин', 'Al-hamdu lillahi Rabbil-‘alamin', 'Хвала Аллаху, Господу миров', 'All praise is due to Allah, Lord of the worlds'),
      A('ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ', 'Ар-Рахмани-р-Рахим', 'Ar-Rahmanir-Rahim', 'Милостивому, Милосердному', 'The Entirely Merciful, the Especially Merciful'),
      A('مَٰلِكِ يَوۡمِ ٱلدِّينِ', 'Мялики яуми-д-дин', 'Maliki yawmid-din', 'Властелину Дня воздаяния', 'Sovereign of the Day of Recompense'),
      A('إِيَّاكَ نَعۡبُدُ وَإِيَّاكَ نَسۡتَعِينُ', 'Ийяка на‘буду ва ийяка наста‘ин', 'Iyyaka na‘budu wa iyyaka nasta‘in', 'Тебе одному мы поклоняемся и Тебя одного молим о помощи', 'It is You we worship and You we ask for help'),
      A('ٱهۡدِنَا ٱلصِّرَٰطَ ٱلۡمُسۡتَقِيمَ', 'Ихдина-с-сырата-ль-мустакым', 'Ihdinas-siratal-mustaqim', 'Веди нас прямым путём', 'Guide us to the straight path'),
      A('صِرَٰطَ ٱلَّذِينَ أَنۡعَمۡتَ عَلَيۡهِمۡ غَيۡرِ ٱلۡمَغۡضُوبِ عَلَيۡهِمۡ وَلَا ٱلضَّآلِّينَ', 'Сырата-ллязина ан‘амта ‘аляйхим, гайри-ль-магдуби ‘аляйхим ва ля-д-доллин', 'Siratal-ladhina an‘amta ‘alayhim, ghayril-maghdubi ‘alayhim wa lad-dallin', 'путём тех, кого Ты облагодетельствовал, не тех, на кого пал гнев, и не заблудших', 'The path of those You have blessed, not of those who earned anger, nor of those astray'),
    ],
  },
  112: {
    n: 112, name: L('Аль-Ихляс', 'Al-Ikhlas'), ar: 'الإخلاص',
    why: L('Искренность. Четыре коротких аята о том, Кто такой Аллах. Пророк ﷺ сказал, что она равна трети Корана.', 'Sincerity. Four short ayahs about Who Allah is. The Prophet ﷺ said it equals a third of the Qur’an.'),
    ayahs: [
      A('قُلۡ هُوَ ٱللَّهُ أَحَدٌ', 'Куль хуа-Ллаху ахад', 'Qul huwa Allahu ahad', 'Скажи: «Он Аллах Единый', 'Say, “He is Allah, the One'),
      A('ٱللَّهُ ٱلصَّمَدُ', 'Аллаху-с-Самад', 'Allahus-Samad', 'Аллах Самодостаточный, в Ком нуждаются все', 'Allah, the Eternal Refuge'),
      A('لَمۡ يَلِدۡ وَلَمۡ يُولَدۡ', 'Лям ялид ва лям юляд', 'Lam yalid wa lam yulad', 'Он не родил и не был рождён', 'He neither begets nor is born'),
      A('وَلَمۡ يَكُن لَّهُۥ كُفُوًا أَحَدُۢ', 'Ва лям якун ляху куфуан ахад', 'Wa lam yakun lahu kufuwan ahad', 'и нет никого, равного Ему»', 'Nor is there to Him any equivalent”'),
    ],
  },
  108: {
    n: 108, name: L('Аль-Каусар', 'Al-Kawthar'), ar: 'الكوثر',
    why: L('Изобилие. Самая короткая сура Корана, всего три аята.', 'Abundance. The shortest sura of the Qur’an, only three ayahs.'),
    ayahs: [
      A('إِنَّآ أَعۡطَيۡنَٰكَ ٱلۡكَوۡثَرَ', 'Инна а‘тайна-ка-ль-Каусар', 'Inna a‘taynakal-Kawthar', 'Мы даровали тебе аль-Каусар (бесчисленные блага)', 'Indeed, We have granted you al-Kawthar'),
      A('فَصَلِّ لِرَبِّكَ وَٱنۡحَرۡ', 'Фа салли ли-Раббика ва-нхар', 'Fa salli li-Rabbika wanhar', 'Посему молись своему Господу и закалывай жертву', 'So pray to your Lord and sacrifice'),
      A('إِنَّ شَانِئَكَ هُوَ ٱلۡأَبۡتَرُ', 'Инна шани’ака хуа-ль-абтар', 'Inna shani’aka huwal-abtar', 'Воистину, твой ненавистник сам окажется безвестным', 'Indeed, your enemy is the one cut off'),
    ],
  },
  103: {
    n: 103, name: L('Аль-Аср', 'Al-‘Asr'), ar: 'العصر',
    why: L('Время. Три аята о том, как не потерять жизнь: вера, добрые дела, истина и терпение.', 'Time. Three ayahs on how not to lose your life: faith, good deeds, truth and patience.'),
    ayahs: [
      A('وَٱلۡعَصۡرِ', 'Ва-ль-‘аср', 'Wal-‘asr', 'Клянусь временем', 'By time'),
      A('إِنَّ ٱلۡإِنسَٰنَ لَفِي خُسۡرٍ', 'Инна-ль-инсана ляфи хуср', 'Innal-insana lafi khusr', 'Воистину, человек в убытке', 'Indeed, mankind is in loss'),
      A('إِلَّا ٱلَّذِينَ ءَامَنُواْ وَعَمِلُواْ ٱلصَّـٰلِحَٰتِ وَتَوَاصَوۡاْ بِٱلۡحَقِّ وَتَوَاصَوۡاْ بِٱلصَّبۡرِ', 'Илля-ллязина аману ва ‘амилю-с-салихати ва тавасау би-ль-хакки ва тавасау би-с-сабр', 'Illal-ladhina amanu wa ‘amilus-salihati wa tawasaw bil-haqqi wa tawasaw bis-sabr', 'кроме тех, кто уверовал, творил добро, заповедовал друг другу истину и заповедовал терпение', 'Except those who believe, do good, and urge one another to truth and to patience'),
    ],
  },
  113: {
    n: 113, name: L('Аль-Фаляк', 'Al-Falaq'), ar: 'الفلق',
    why: L('Рассвет. Просьба о защите. Её читают утром, вечером и перед сном.', 'Daybreak. A plea for protection, read morning, evening and before sleep.'),
    ayahs: [
      A('قُلۡ أَعُوذُ بِرَبِّ ٱلۡفَلَقِ', 'Куль а‘узу би-Рабби-ль-фаляк', 'Qul a‘udhu bi-Rabbil-falaq', 'Скажи: «Прибегаю к защите Господа рассвета', 'Say, “I seek refuge in the Lord of daybreak'),
      A('مِن شَرِّ مَا خَلَقَ', 'Мин шарри ма халяк', 'Min sharri ma khalaq', 'от зла того, что Он сотворил', 'from the evil of what He created'),
      A('وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ', 'Ва мин шарри гасикын иза вакаб', 'Wa min sharri ghasiqin idha waqab', 'от зла мрака, когда он наступает', 'and from the evil of darkness when it settles'),
      A('وَمِن شَرِّ ٱلنَّفَّـٰثَٰتِ فِي ٱلۡعُقَدِ', 'Ва мин шарри-н-наффасати фи-ль-‘укад', 'Wa min sharrin-naffathati fil-‘uqad', 'от зла колдуний, дующих на узлы', 'and from the evil of those who blow on knots'),
      A('وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ', 'Ва мин шарри хасидин иза хасад', 'Wa min sharri hasidin idha hasad', 'от зла завистника, когда он завидует»', 'and from the evil of an envier when he envies”'),
    ],
  },
  114: {
    n: 114, name: L('Ан-Нас', 'An-Nas'), ar: 'الناس',
    why: L('Люди. Защита от шёпота сомнений. Последняя сура Корана.', 'Mankind. Protection from whispered doubts. The last sura of the Qur’an.'),
    ayahs: [
      A('قُلۡ أَعُوذُ بِرَبِّ ٱلنَّاسِ', 'Куль а‘узу би-Рабби-н-нас', 'Qul a‘udhu bi-Rabbin-nas', 'Скажи: «Прибегаю к защите Господа людей', 'Say, “I seek refuge in the Lord of mankind'),
      A('مَلِكِ ٱلنَّاسِ', 'Мялики-н-нас', 'Malikin-nas', 'Царя людей', 'the Sovereign of mankind'),
      A('إِلَٰهِ ٱلنَّاسِ', 'Иляхи-н-нас', 'Ilahin-nas', 'Бога людей', 'the God of mankind'),
      A('مِن شَرِّ ٱلۡوَسۡوَاسِ ٱلۡخَنَّاسِ', 'Мин шарри-ль-васваси-ль-ханнас', 'Min sharril-waswasil-khannas', 'от зла искусителя, отступающего при поминании Аллаха', 'from the evil of the retreating whisperer'),
      A('ٱلَّذِي يُوَسۡوِسُ فِي صُدُورِ ٱلنَّاسِ', 'Аллязи ювасвису фи судури-н-нас', 'Alladhi yuwaswisu fi sudurin-nas', 'который шепчет в груди людей', 'who whispers into the breasts of mankind'),
      A('مِنَ ٱلۡجِنَّةِ وَٱلنَّاسِ', 'Мина-ль-джиннати ва-н-нас', 'Minal-jinnati wan-nas', 'из джиннов и людей»', 'from among the jinn and mankind”'),
    ],
  },
};

/** Reciter audio for one ayah (Mishary Alafasy, from everyayah.com). */
export const ayahAudio = (sura: number, ayah: number) => `https://everyayah.com/data/Alafasy_64kbps/${String(sura).padStart(3, '0')}${String(ayah + 1).padStart(3, '0')}.mp3`;

/** The transliteration with the hint fading: 0 full, 1 every other word hidden, 2 first letters, 3 nothing. */
export function fade(tr: string, stage: number): string {
  if (stage <= 0) return tr;
  if (stage >= 3) return '';
  const first = (w: string) => {
    const m = /^([^A-Za-zА-Яа-яЁё]*)(.)(.*)$/.exec(w);
    return m && m[3].length > 1 ? `${m[1]}${m[2]}…` : w;
  };
  const words = tr.split(' ');
  // A one-word ayah («Аллаху-с-Самад») fades by its hyphenated parts.
  const one = words.length === 1;
  const parts = one ? tr.split('-') : words;
  const sep = one ? '-' : ' ';
  if (stage === 1) return parts.map((w, i) => (i % 2 ? '···' : w)).join(sep);
  return words.map((w) => w.split('-').map(first).join('-')).join(' ');
}

// ─── Words said in the prayer ───────────────────────────────────────────────

export type DhikrId = 'takbir' | 'ruku' | 'rise' | 'sujud' | 'between' | 'tashahhud' | 'salawat' | 'salam' | 'amin' | 'shahada';
export interface Dhikr { title: string; ar: string; tr: string; mean: string; note?: string }

export const DHIKR: Record<DhikrId, Dhikr> = {
  shahada: { title: L('Шахада', 'Shahada'), ar: 'أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللهِ',
    tr: L('Ашхаду ал-ля иляха илля-Ллах, ва ашхаду анна Мухаммадан расулю-Ллах', 'Ash-hadu al-la ilaha illallah, wa ash-hadu anna Muhammadan rasulullah'),
    mean: L('Свидетельствую, что нет божества, кроме Аллаха, и свидетельствую, что Мухаммад посланник Аллаха', 'I bear witness that there is no god but Allah, and I bear witness that Muhammad is the Messenger of Allah') },
  takbir: { title: L('Такбир', 'Takbir'), ar: 'اللهُ أَكْبَرُ', tr: L('Аллаху акбар', 'Allahu akbar'), mean: L('Аллах велик', 'Allah is the Greatest'),
    note: L('С ним начинается намаз и с ним переходят из позы в позу.', 'It opens the prayer and is said when moving from one position to the next.') },
  amin: { title: L('После Фатихи', 'After al-Fatiha'), ar: 'آمِين', tr: L('Амин', 'Amin'), mean: L('О Аллах, прими', 'O Allah, answer') },
  ruku: { title: L('В поясном поклоне', 'In ruku‘ (bowing)'), ar: 'سُبْحَانَ رَبِّيَ الْعَظِيمِ', tr: L('Субхана Раббияль-‘Азым (3 раза)', 'Subhana Rabbiyal-‘Azim (3 times)'), mean: L('Пречист мой Великий Господь', 'Glory be to my Lord, the Most Great') },
  rise: { title: L('Выпрямляясь из поклона', 'Rising from ruku‘'), ar: 'سَمِعَ اللهُ لِمَنْ حَمِدَهُ، رَبَّنَا وَلَكَ الْحَمْدُ', tr: L('Сами‘а-Ллаху лиман хамидах. Раббана ва ляка-ль-хамд', 'Sami‘Allahu liman hamidah. Rabbana wa lakal-hamd'), mean: L('Аллах слышит того, кто Его восхвалил. Господь наш, Тебе хвала', 'Allah hears the one who praises Him. Our Lord, to You is all praise') },
  sujud: { title: L('В земном поклоне', 'In sujud (prostration)'), ar: 'سُبْحَانَ رَبِّيَ الْأَعْلَى', tr: L('Субхана Раббияль-А‘ля (3 раза)', 'Subhana Rabbiyal-A‘la (3 times)'), mean: L('Пречист мой Всевышний Господь', 'Glory be to my Lord, the Most High') },
  between: { title: L('Сидя между поклонами', 'Sitting between prostrations'), ar: 'رَبِّ اغْفِرْ لِي', tr: L('Рабби-гфир ли', 'Rabbighfir li'), mean: L('Господи, прости меня', 'My Lord, forgive me') },
  tashahhud: { title: L('Ташаххуд (Ат-тахийяту)', 'Tashahhud (At-tahiyyatu)'),
    ar: 'التَّحِيَّاتُ لِلّٰهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ، السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللهِ وَبَرَكَاتُهُ، السَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللهِ الصَّالِحِينَ، أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ',
    tr: L('Ат-тахийяту ли-Лляхи ва-с-саляуату ва-т-таййибат. Ас-саляму ‘аляйка аййуха-н-набийю ва рахмату-Лляхи ва баракятух. Ас-саляму ‘аляйна ва ‘аля ‘ибади-Лляхи-с-салихин. Ашхаду ал-ля иляха илля-Ллах, ва ашхаду анна Мухаммадан ‘абдуху ва расулюх',
      'At-tahiyyatu lillahi was-salawatu wat-tayyibat. As-salamu ‘alayka ayyuhan-nabiyyu wa rahmatullahi wa barakatuh. As-salamu ‘alayna wa ‘ala ‘ibadillahis-salihin. Ash-hadu al-la ilaha illallah, wa ash-hadu anna Muhammadan ‘abduhu wa rasuluh'),
    mean: L('Приветствия, молитвы и благие слова принадлежат Аллаху. Мир тебе, о Пророк, милость Аллаха и Его благословение. Мир нам и праведным рабам Аллаха. Свидетельствую, что нет божества, кроме Аллаха, и свидетельствую, что Мухаммад Его раб и посланник',
      'All greetings, prayers and good words are for Allah. Peace be upon you, O Prophet, and the mercy of Allah and His blessings. Peace be upon us and upon the righteous servants of Allah. I bear witness that there is no god but Allah, and that Muhammad is His servant and Messenger'),
    note: L('Это вариант Ибн Мас‘уда. В шафиитском мазхабе читают близкий вариант Ибн ‘Аббаса; уточни у имама своей мечети.', 'This is the version of Ibn Mas‘ud. Shafi‘is use the close version of Ibn ‘Abbas; ask the imam of your mosque.') },
  salawat: { title: L('Салават Пророку ﷺ', 'Salawat on the Prophet ﷺ'),
    ar: 'اللّٰهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ، اللّٰهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ',
    tr: L('Аллахумма салли ‘аля Мухаммадин ва ‘аля али Мухаммад, кама салляйта ‘аля Ибрахима ва ‘аля али Ибрахим, иннака Хамидун Маджид. Аллахумма барик ‘аля Мухаммадин ва ‘аля али Мухаммад, кама баракта ‘аля Ибрахима ва ‘аля али Ибрахим, иннака Хамидун Маджид',
      'Allahumma salli ‘ala Muhammadin wa ‘ala ali Muhammad, kama sallayta ‘ala Ibrahima wa ‘ala ali Ibrahim, innaka Hamidun Majid. Allahumma barik ‘ala Muhammadin wa ‘ala ali Muhammad, kama barakta ‘ala Ibrahima wa ‘ala ali Ibrahim, innaka Hamidun Majid'),
    mean: L('О Аллах, благослови Мухаммада и семью Мухаммада, как Ты благословил Ибрахима и семью Ибрахима, Ты Достойный хвалы, Славный. О Аллах, ниспошли благодать Мухаммаду и семье Мухаммада, как ниспослал её Ибрахиму и семье Ибрахима, Ты Достойный хвалы, Славный',
      'O Allah, send prayers on Muhammad and the family of Muhammad, as You sent prayers on Ibrahim and the family of Ibrahim; You are Praiseworthy, Glorious. O Allah, bless Muhammad and the family of Muhammad, as You blessed Ibrahim and the family of Ibrahim; You are Praiseworthy, Glorious') },
  salam: { title: L('Салям: конец намаза', 'Salam: ending the prayer'), ar: 'السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللهِ', tr: L('Ас-саляму ‘аляйкум ва рахмату-Ллах', 'As-salamu ‘alaykum wa rahmatullah'), mean: L('Мир вам и милость Аллаха', 'Peace be upon you and the mercy of Allah'),
    note: L('Сначала повернув голову направо, потом налево.', 'First turning the head to the right, then to the left.') },
};

// ─── The prayer teacher ─────────────────────────────────────────────────────

export const FARD: Record<Anchor, number> = { fajr: 2, dhuhr: 4, asr: 4, maghrib: 3, isha: 4 };
export type Pose = 'stand' | 'ruku' | 'sujud' | 'sit';
export interface TeacherStep { title: string; text: string; dhikr: DhikrId[]; pose: Pose; last?: boolean }

/** What to do now, after `s` prostrations (0–2) of rak'ah `r` of a prayer with `total` rak'ahs. */
export function teacherStep(total: number, r: number, s: number, sura: string | null): TeacherStep {
  const suraLine = sura
    ? L(`, после неё суру «${sura}»`, `, then the sura ${sura}`)
    : L(', после неё короткую суру, если знаешь. Пока не знаешь ни одной, читай только Фатиху', ', then a short sura if you know one. Until you do, al-Fatiha alone');
  const stand = (n: number, first: boolean) =>
    (first ? L('Подними руки и скажи «Аллаху акбар». ', 'Raise your hands and say “Allahu akbar”. ') : '')
    + L('Прочитай Фатиху', 'Recite al-Fatiha') + (n <= 2 ? suraLine : '')
    + L('. Потом поясной поклон, выпрямись и опустись в земной поклон. После поклона коснись экрана.', '. Then bow, stand up straight and go down into sujud. After it, touch the screen.');
  if (s === 0) return { title: r === 1 ? L('Стоя: такбир и Фатиха', 'Standing: takbir and al-Fatiha') : L(`Стоя: ${r}-й ракаат`, `Standing: rak‘ah ${r}`), text: stand(r, r === 1), dhikr: [...(r === 1 ? ['takbir' as const] : []), 'amin', 'ruku', 'rise', 'sujud'], pose: 'stand' };
  if (s === 1) return { title: L('Сядь, потом второй земной поклон', 'Sit, then the second sujud'), text: L('Сядь ненадолго, скажи «Рабби-гфир ли» и сделай второй земной поклон. Потом коснись экрана.', 'Sit briefly, say “Rabbighfir li” and make the second sujud. Then touch the screen.'), dhikr: ['between', 'sujud'], pose: 'sit' };
  if (r === total) return { title: L('Последнее сидение и салям', 'Final sitting and salam'), text: L('Сядь и прочитай «Ат-тахийяту…», затем салават Пророку ﷺ, можно короткое дуа. Заверши намаз: «Ас-саляму алейкум ва рахматуллах» направо, потом налево.', 'Sit and recite “At-tahiyyatu…”, then the salawat on the Prophet ﷺ, and a short du‘a if you like. End the prayer: “As-salamu ‘alaykum wa rahmatullah” to the right, then to the left.'), dhikr: ['tashahhud', 'salawat', 'salam'], pose: 'sit', last: true };
  if (r === 2) return { title: L('Сядь: первое сидение (ташаххуд)', 'Sit: the first tashahhud'), text: L(`Прочитай «Ат-тахийяту…» до свидетельства, потом встань на третий ракаат со словами «Аллаху акбар». ${stand(3, false)}`, `Recite “At-tahiyyatu…” up to the testimony, then stand for the third rak‘ah saying “Allahu akbar”. ${stand(3, false)}`), dhikr: ['tashahhud', 'takbir'], pose: 'sit' };
  return { title: L(`Встань на ${r + 1}-й ракаат`, `Stand for rak‘ah ${r + 1}`), text: L('Скажи «Аллаху акбар» и встань. ', 'Say “Allahu akbar” and stand up. ') + stand(r + 1, false), dhikr: ['takbir', 'ruku', 'rise', 'sujud'], pose: 'stand' };
}

export const LOST_COUNT = L(
  'Если не уверен, сколько ракаатов {сделал/сделала}, бери меньшее число и доделай намаз. Перед салямом сделай два земных поклона забывчивости (саджда сахв). Сомнения бывают у всех, Аллах видит твоё старание. Если сбиваешься часто, спроси имама: в разных мазхабах здесь есть подробности.',
  'If you are unsure how many rak‘ahs you prayed, take the smaller number and complete the prayer. Before the salam make two prostrations of forgetfulness (sajdat as-sahw). Everyone has doubts; Allah sees your effort. If it happens often, ask an imam: the schools of fiqh have details here.',
);

// ─── The 40 steps ───────────────────────────────────────────────────────────

export type LessonGo = { sura: number } | { prayer: Anchor } | { poses: true } | 'qibla' | 'mosques' | 'azkar' | 'quran' | 'circle' | 'habit';
export interface Lesson { n: number; t: string; p: string[]; task?: string; go?: LessonGo; skill?: string; dhikr?: DhikrId[] }

const S = (n: number, t: [string, string], p: [string, string][], extra: { task?: [string, string]; go?: LessonGo; skill?: [string, string]; dhikr?: DhikrId[] } = {}): Lesson => ({
  n, t: L(...t), p: p.map((x) => L(...x)), task: extra.task && L(...extra.task), go: extra.go, skill: extra.skill && L(...extra.skill), dhikr: extra.dhikr,
});

export const WEEKS = [
  L('Основа', 'The foundation'), L('Первый намаз', 'The first prayer'), L('Пять намазов', 'Five prayers'),
  L('Мечеть и община', 'Mosque and community'), L('Жизнь мусульманина', 'Living as a Muslim'), L('Дальше', 'Going on'),
];
export const weekOf = (n: number) => (n <= 7 ? 0 : n <= 15 ? 1 : n <= 21 ? 2 : n <= 28 ? 3 : n <= 35 ? 4 : 5);

export const LESSONS: Lesson[] = [
  S(1, ['Шахада: что ты {сказал/сказала}', 'Shahada: what you said'], [
    ['Ты {произнёс/произнесла} шахаду: нет божества, кроме Аллаха, и Мухаммад Его посланник. С этих слов ты {мусульманин/мусульманка}.', 'You said the shahada: there is no god but Allah, and Muhammad is His Messenger. With these words you are a Muslim.'],
    ['Пророк ﷺ сказал, что ислам стирает то, что было до него. Ты начинаешь с чистого листа.', 'The Prophet ﷺ said that Islam wipes out what came before it. You start with a clean page.'],
    ['Не нужно знать всё сразу. Здесь по одному маленькому шагу в день, без спешки и без вины.', 'You do not need to know everything at once. Here it is one small step a day, without rush and without guilt.'],
  ], { skill: ['Шахада', 'Shahada'], dhikr: ['shahada'], task: ['Произнеси шахаду ещё раз, спокойно, понимая каждое слово.', 'Say the shahada once more, calmly, understanding every word.'] }),
  S(2, ['Чистота перед намазом', 'Purity before prayer'], [
    ['Намаз совершают в состоянии чистоты: после омовения, в чистой одежде и на чистом месте.', 'Prayer is made in a state of purity: after wudu, in clean clothes, on a clean place.'],
    ['Малое омовение (вуду) нарушают туалет, выход газов и глубокий сон. Тогда перед намазом его делают заново.', 'Small ablution (wudu) is broken by using the toilet, passing wind and deep sleep. Then you renew it before praying.'],
    ['Это не сложно: вуду занимает пару минут, и скоро ты будешь делать его не задумываясь.', 'It is not hard: wudu takes a couple of minutes, and soon you will do it without thinking.'],
  ]),
  S(3, ['Омовение (вуду) шаг за шагом', 'Wudu step by step'], [
    ['1. Намерение в сердце и «Бисмиллях». 2. Вымой кисти рук. 3. Прополощи рот и нос.', '1. Intention in the heart and “Bismillah”. 2. Wash your hands. 3. Rinse your mouth and nose.'],
    ['4. Умой лицо от волос до подбородка и от уха до уха. 5. Вымой руки до локтей, сначала правую. 6. Протри мокрой рукой голову, затем уши.', '4. Wash your face from hairline to chin and ear to ear. 5. Wash your arms up to the elbows, right first. 6. Wipe your head with wet hands, then your ears.'],
    ['7. Вымой ноги до щиколоток, сначала правую. Каждое действие можно делать трижды. Обязательны лицо, руки, протирание головы и ноги, как сказано в Коране (5:6).', '7. Wash your feet up to the ankles, right first. Each action may be done three times. The face, arms, wiping the head and the feet are obligatory, as the Qur’an says (5:6).'],
  ], { skill: ['Омовение', 'Wudu'], task: ['Сделай вуду сегодня, глядя в шаги.', 'Make wudu today, following the steps.'] }),
  S(4, ['Гусль: полное омовение', 'Ghusl: the full bath'], [
    ['Гусль это омовение всего тела. Он обязателен после близости, после окончания месячных и послеродового периода.', 'Ghusl is washing the whole body. It is required after intimacy and after menstruation or post-natal bleeding ends.'],
    ['Многие учёные советуют сделать гусль и после принятия ислама, а некоторые считают его обязательным.', 'Many scholars advise making ghusl after accepting Islam, and some hold it obligatory.'],
    ['Как: намерение, «Бисмиллях», вымой руки и интимные места, сделай вуду, затем облей водой всё тело, чтобы не осталось сухого места. Ханафиты обязательно полощут рот и нос.', 'How: intention, “Bismillah”, wash hands and private parts, make wudu, then pour water over the whole body so that no dry spot remains. Hanafis also require rinsing the mouth and nose.'],
  ], { skill: ['Гусль', 'Ghusl'] }),
  S(5, ['Пять намазов в день', 'Five prayers a day'], [
    ['Фаджр до рассвета, 2 ракаата. Зухр после полудня, 4. Аср днём, 4. Магриб после заката, 3. Иша ночью, 4.', 'Fajr before sunrise, 2 rak‘ahs. Dhuhr after midday, 4. ‘Asr in the afternoon, 4. Maghrib after sunset, 3. ‘Isha at night, 4.'],
    ['Время каждого намаза приложение уже считает для твоего города, оно вверху экрана «Сегодня».', 'The app already calculates each prayer time for your city; you see it at the top of Today.'],
    ['Ракаат это один круг движений: стояние, поясной поклон, два земных поклона. Скоро разберём каждый.', 'A rak‘ah is one cycle: standing, bowing and two prostrations. We will go through each soon.'],
  ], { skill: ['Времена намаза', 'Prayer times'] }),
  S(6, ['Кибла, место и одежда', 'Qibla, place and clothing'], [
    ['Намаз совершают лицом к Каабе в Мекке. Это направление называется кибла.', 'Prayer is made facing the Ka‘bah in Makkah. That direction is called the qibla.'],
    ['Место должно быть чистым: подойдёт коврик, полотенце или просто чистый пол.', 'The place must be clean: a prayer mat, a towel or just a clean floor will do.'],
    ['Мужчина закрывает тело хотя бы от пупка до колен, женщина всё тело, кроме лица и кистей рук. Одежда не должна быть прозрачной.', 'A man covers at least from navel to knees; a woman the whole body except the face and hands. Clothes should not be see-through.'],
  ], { go: 'qibla', task: ['Найди киблу у себя дома и запомни направление.', 'Find the qibla at home and remember the direction.'] }),
  S(7, ['Позы намаза', 'The positions of prayer'], [
    ['Стояние (кыям): прямо, взгляд на место поклона. Поясной поклон (руку‘): спина ровная, руки на коленях.', 'Standing (qiyam): upright, eyes on the place of prostration. Bowing (ruku‘): back straight, hands on knees.'],
    ['Земной поклон (суджуд): лоб и нос, ладони, колени и пальцы ног касаются пола. Сидение: на коленях, руки на бёдрах.', 'Prostration (sujud): forehead and nose, palms, knees and toes touch the floor. Sitting: kneeling, hands on thighs.'],
    ['Попробуй каждую позу сегодня без слов, просто чтобы тело запомнило.', 'Try each position today without words, just so your body remembers.'],
  ], { go: { poses: true }, skill: ['Позы намаза', 'Prayer positions'] }),

  S(8, ['Намерение и такбир', 'Intention and takbir'], [
    ['Намерение живёт в сердце: ты знаешь, какой намаз совершаешь и ради Кого. Произносить его вслух не обязательно.', 'Intention lives in the heart: you know which prayer you are making and for Whom. Saying it aloud is not required.'],
    ['Намаз начинается с такбира: подними руки и скажи «Аллаху акбар». С этой секунды ты в намазе: не говоришь и не отвлекаешься.', 'The prayer begins with the takbir: raise your hands and say “Allahu akbar”. From that moment you are in prayer: no talking, no distraction.'],
  ], { dhikr: ['takbir'], skill: ['Такбир', 'Takbir'] }),
  S(9, ['Фатиха: первые аяты', 'Al-Fatiha: the first ayahs'], [
    ['Фатиха это сердце намаза, её читают в каждом ракаате. Всего 7 аятов.', 'Al-Fatiha is the heart of the prayer, recited in every rak‘ah. It has 7 ayahs.'],
    ['Сегодня начни: послушай чтеца, повтори за ним, и подсказка будет постепенно таять. Если ты уже знаешь Фатиху, просто проверь себя.', 'Start today: listen to the reciter, repeat after him, and the hint will slowly fade. If you already know al-Fatiha, just check yourself.'],
  ], { go: { sura: 1 } }),
  S(10, ['Фатиха: продолжаем', 'Al-Fatiha: going on'], [
    ['«Тебе одному мы поклоняемся и Тебя одного молим о помощи». В этих словах весь смысл намаза.', '“It is You we worship and You we ask for help.” These words hold the whole meaning of the prayer.'],
    ['Продолжи с того аята, где {остановился/остановилась} вчера. Медленно и правильно лучше, чем быстро.', 'Continue from where you stopped yesterday. Slow and correct is better than fast.'],
  ], { go: { sura: 1 } }),
  S(11, ['Фатиха целиком и «Амин»', 'All of al-Fatiha and “Amin”'], [
    ['Сегодня прочитай Фатиху целиком по памяти. После неё в намазе говорят «Амин».', 'Today recite all of al-Fatiha from memory. In prayer, “Amin” is said after it.'],
    ['Если пока не получается, ничего страшного: тренажёр будет ждать, а повторы придут сами.', 'If it does not work yet, that is fine: the trainer will wait, and reviews will come by themselves.'],
  ], { go: { sura: 1 }, dhikr: ['amin'], skill: ['Фатиха', 'Al-Fatiha'] }),
  S(12, ['Слова в поклонах', 'Words in the positions'], [
    ['В каждой позе свои короткие слова. Их всего четыре, и они повторяются в каждом ракаате.', 'Each position has its own short words. There are only four, and they repeat in every rak‘ah.'],
  ], { dhikr: ['ruku', 'rise', 'sujud', 'between'], skill: ['Зикры поклонов', 'Words of the positions'] }),
  S(13, ['Ташаххуд', 'Tashahhud'], [
    ['Сидя после второго ракаата и в конце намаза читают «Ат-тахийяту». Это приветствие Аллаху, Пророку ﷺ и праведникам и свидетельство веры.', 'Sitting after the second rak‘ah and at the end of the prayer you recite “At-tahiyyatu”: a greeting to Allah, the Prophet ﷺ and the righteous, and the testimony of faith.'],
    ['Он длиннее, поэтому учи по фразе в день. Пока не {выучил/выучила}, можно читать то, что знаешь.', 'It is longer, so learn a phrase a day. Until you know it, recite what you can.'],
  ], { dhikr: ['tashahhud'], skill: ['Ташаххуд', 'Tashahhud'] }),
  S(14, ['Салават и салям', 'Salawat and salam'], [
    ['В последнем сидении после ташаххуда читают салават Пророку ﷺ, а затем завершают намаз салямом направо и налево.', 'In the final sitting, after the tashahhud, you recite the salawat on the Prophet ﷺ, then end the prayer with salam to the right and left.'],
  ], { dhikr: ['salawat', 'salam'], skill: ['Салават и салям', 'Salawat and salam'] }),
  S(15, ['Первый намаз с учителем: Фаджр', 'First prayer with the teacher: Fajr'], [
    ['Теперь всё вместе. Положи телефон на пол перед собой экраном вверх. После каждого земного поклона касайся экрана лбом или рукой, и учитель подскажет, что дальше.', 'Now everything together. Put the phone on the floor in front of you, screen up. After each prostration touch the screen with your forehead or hand, and the teacher will tell you what comes next.'],
    ['Ошибки в первых намазах нормальны. Аллах принимает старание.', 'Mistakes in your first prayers are normal. Allah accepts the effort.'],
  ], { go: { prayer: 'fajr' }, skill: ['Намаз в 2 ракаата', 'A 2-rak‘ah prayer'] }),

  S(16, ['Намаз в 4 ракаата', 'A 4-rak‘ah prayer'], [
    ['Зухр, Аср и Иша по 4 ракаата. После второго ракаата садишься на первый ташаххуд и встаёшь. В третьем и четвёртом ракаате читаешь только Фатиху.', 'Dhuhr, ‘Asr and ‘Isha have 4 rak‘ahs. After the second you sit for the first tashahhud and stand up again. In the third and fourth you recite only al-Fatiha.'],
  ], { go: { prayer: 'asr' }, skill: ['Намаз в 4 ракаата', 'A 4-rak‘ah prayer'] }),
  S(17, ['Магриб: 3 ракаата', 'Maghrib: 3 rak‘ahs'], [
    ['Магриб сразу после заката: 2 ракаата, первое сидение, третий ракаат и последнее сидение. Счётчик не даст сбиться.', 'Maghrib right after sunset: 2 rak‘ahs, the first sitting, a third rak‘ah and the final sitting. The counter will keep you on track.'],
  ], { go: { prayer: 'maghrib' }, skill: ['Магриб', 'Maghrib'] }),
  S(18, ['Сура «Аль-Ихляс»: смысл', 'Al-Ikhlas: its meaning'], [
    ['Четыре аята: Аллах Один, ни в ком не нуждается, никого не родил и не был рождён, и нет равного Ему.', 'Four ayahs: Allah is One, needs no one, neither begets nor is begotten, and nothing is equal to Him.'],
    ['Это вторая сура для намаза: в первых двух ракаатах её читают после Фатихи. Начни учить сегодня.', 'This is your second sura for prayer: in the first two rak‘ahs it is recited after al-Fatiha. Start learning it today.'],
  ], { go: { sura: 112 } }),
  S(19, ['Ихлас наизусть', 'Al-Ikhlas by heart'], [
    ['Сегодня дойди до конца. Когда сура выучена, учитель намаза сам подскажет читать её после Фатихи.', 'Today go all the way. Once you know it, the prayer teacher will remind you to recite it after al-Fatiha.'],
  ], { go: { sura: 112 }, skill: ['Ихлас', 'Al-Ikhlas'] }),
  S(20, ['Ошибся в намазе? Это нормально', 'A mistake in prayer? It happens'], [
    ['Если что-то забыл или сомневаешься в счёте, в конце делают два земных поклона забывчивости (саджда сахв).', 'If you forgot something or doubt the count, two prostrations of forgetfulness (sajdat as-sahw) are made at the end.'],
    [LOST_COUNT, LOST_COUNT],
  ]),
  S(21, ['Пропущенный намаз', 'A missed prayer'], [
    ['Если {проспал/проспала} или {забыл/забыла}, соверши намаз, как только {вспомнил/вспомнила}. Это называется восполнение (када).', 'If you overslept or forgot, pray as soon as you remember. This is called making up (qada).'],
    ['Намазы за годы до ислама восполнять не нужно: ты тогда ещё не {был мусульманином/была мусульманкой}.', 'You do not make up prayers from the years before Islam: you were not yet a Muslim then.'],
    ['Не корми чувство вины. Лучший ответ на пропуск это следующий намаз вовремя.', 'Do not feed guilt. The best answer to a missed prayer is the next one on time.'],
  ]),

  S(22, ['Сура «Аль-Каусар»', 'Sura al-Kawthar'], [
    ['Самая короткая сура Корана: три аята. С ней в намазе будет уже две суры на выбор.', 'The shortest sura of the Qur’an: three ayahs. With it you will have two suras to choose from in prayer.'],
  ], { go: { sura: 108 } }),
  S(23, ['Джума: пятничный намаз', 'Jumu‘ah: the Friday prayer'], [
    ['В пятницу вместо Зухра в мечети совершают джума: проповедь (хутба) и 2 ракаата за имамом. Для мужчин он обязателен, для женщин желателен.', 'On Friday, instead of Dhuhr, the jumu‘ah is held in the mosque: a sermon (khutbah) and 2 rak‘ahs behind the imam. It is required for men and recommended for women.'],
    ['Перед джума желательно сделать гусль, надеть чистую одежду и прийти пораньше.', 'Before jumu‘ah it is good to take a ghusl, wear clean clothes and come early.'],
  ], { go: 'mosques' }),
  S(24, ['Первый раз в мечети', 'Your first time at the mosque'], [
    ['Сделай вуду дома, сними обувь у входа. Войдя, можно совершить 2 ракаата приветствия мечети.', 'Make wudu at home and take off your shoes at the entrance. On entering you may pray 2 rak‘ahs to greet the mosque.'],
    ['В общем намазе просто повторяй за имамом. Смело скажи, что ты {новый мусульманин/новая мусульманка}: в мечети этому рады и помогут.', 'In congregation just follow the imam. Feel free to say you are a new Muslim: people there will be glad and will help.'],
  ], { go: 'mosques', task: ['Найди ближайшую мечеть и время джума.', 'Find the nearest mosque and its jumu‘ah time.'] }),
  S(25, ['Сура «Аль-Аср»', 'Sura al-‘Asr'], [
    ['Имам аш-Шафи‘и говорил, что если бы людям была дана только эта сура, её хватило бы. Три аята о том, как не потерять жизнь.', 'Imam ash-Shafi‘i said that if people had only this sura, it would be enough. Three ayahs on how not to lose your life.'],
  ], { go: { sura: 103 } }),
  S(26, ['Дуа: говори с Аллахом', 'Du‘a: speak to Allah'], [
    ['Дуа это просьба к Аллаху. Вне намаза можно просить на любом языке, своими словами, о чём угодно хорошем.', 'Du‘a is asking Allah. Outside the prayer you can ask in any language, in your own words, for anything good.'],
    ['Лучшее время: в земном поклоне, в последней трети ночи, между азаном и икаматом, в пятницу.', 'Good times: in sujud, in the last third of the night, between the adhan and iqamah, on Friday.'],
  ], { task: ['Сегодня попроси у Аллаха что-то своими словами.', 'Today ask Allah for something in your own words.'] }),
  S(27, ['Утро и вечер с зикром', 'Morning and evening remembrance'], [
    ['Утренние и вечерние азкары это короткие слова защиты и благодарности. Начни с короткого набора, это 3 минуты.', 'Morning and evening adhkar are short words of protection and gratitude. Start with the short set, it takes 3 minutes.'],
  ], { go: 'azkar' }),
  S(28, ['Халяль в еде', 'Halal food'], [
    ['Запрещены свинина, алкоголь, кровь, мертвечина и мясо, заколотое не ради Аллаха. Всё остальное по умолчанию дозволено.', 'Forbidden are pork, alcohol, blood, carrion and meat slaughtered for other than Allah. Everything else is permitted by default.'],
    ['О мясе в обычных магазинах и о морепродуктах мнения учёных расходятся. Спроси имама своей общины и не спорь с теми, кто следует другому мнению.', 'Scholars differ about meat in ordinary shops and about seafood. Ask the imam of your community and do not argue with those who follow another view.'],
  ]),

  S(29, ['Сура «Аль-Фаляк»', 'Sura al-Falaq'], [
    ['Просьба о защите от всякого зла. Пророк ﷺ читал её утром, вечером и перед сном.', 'A plea for protection from every evil. The Prophet ﷺ recited it morning, evening and before sleep.'],
  ], { go: { sura: 113 } }),
  S(30, ['Сура «Ан-Нас»', 'Sura an-Nas'], [
    ['Последняя сура Корана: защита от шёпота сомнений. Сомнения бывают у каждого, особенно в начале. Их встречают зикром, а не страхом.', 'The last sura of the Qur’an: protection from whispered doubts. Everyone has doubts, especially at the start. Meet them with remembrance, not fear.'],
  ], { go: { sura: 114 } }),
  S(31, ['Семья, которая не мусульмане', 'Family who are not Muslim'], [
    ['Ислам велит быть добрым к родителям, даже если они не мусульмане (Коран 31:15). Твой характер скажет им больше любых споров.', 'Islam commands kindness to parents even if they are not Muslim (Qur’an 31:15). Your character will tell them more than any debate.'],
    ['Не обязательно рассказывать всем сразу. Если близкие пока не знают, включи тихий режим: уведомления придут без религиозных слов.', 'You do not have to tell everyone at once. If family does not know yet, turn on quiet mode: notifications will come without religious words.'],
  ]),
  S(32, ['Рамадан: заранее', 'Ramadan: ahead of time'], [
    ['Девятый месяц хиджры, когда постятся от рассвета до заката: без еды, питья и близости. Больные, путники, беременные освобождены и восполняют позже.', 'The ninth month of the hijri year, when Muslims fast from dawn to sunset: no food, drink or intimacy. The sick, travellers and pregnant women are excused and make it up later.'],
    ['Первый Рамадан можно начать мягко. Приложение подготовит тебя, когда он будет близко.', 'Your first Ramadan can begin gently. The app will prepare you when it comes close.'],
  ]),
  S(33, ['Садака и закят', 'Sadaqah and zakat'], [
    ['Садака это любое добро ради Аллаха, даже улыбка. Закят это обязательная доля (2,5%) от сбережений выше порога, раз в год.', 'Sadaqah is any good done for Allah, even a smile. Zakat is the required share (2.5%) of savings above a threshold, once a year.'],
    ['Если сбережений немного, закят пока может быть не нужен. Разберёшься позже, спешить не надо.', 'If your savings are small, zakat may not be due yet. You can learn it later, no rush.'],
  ]),
  S(34, ['Коран: как начать читать', 'The Qur’an: how to begin'], [
    ['Начни с перевода смыслов на родном языке, по несколько аятов в день. Арабский придёт постепенно.', 'Start with a translation of the meanings in your own language, a few ayahs a day. Arabic will come gradually.'],
  ], { go: 'quran', task: ['Прочитай сегодня 5 аятов с переводом.', 'Read 5 ayahs with translation today.'] }),
  S(35, ['Пророк Мухаммад ﷺ', 'The Prophet Muhammad ﷺ'], [
    ['Он родился в Мекке около 570 года, в 40 лет получил первое откровение и 23 года передавал Коран. Его называли честным ещё до пророчества.', 'He was born in Makkah around 570, received the first revelation at 40 and conveyed the Qur’an for 23 years. People called him trustworthy even before prophethood.'],
    ['Мусульмане любят его и учатся у него: как молиться, как обращаться с людьми, как быть мягким. Услышав его имя, говорят «салляллаху алейхи ва саллям».', 'Muslims love him and learn from him: how to pray, how to treat people, how to be gentle. On hearing his name they say “sallallahu ‘alayhi wa sallam”.'],
  ]),

  S(36, ['Сунна-намазы', 'Sunnah prayers'], [
    ['Кроме пяти обязательных есть желательные: 2 ракаата перед Фаджром, ракааты до и после Зухра, после Магриба и Иша.', 'Besides the five obligatory prayers there are recommended ones: 2 rak‘ahs before Fajr, some before and after Dhuhr, after Maghrib and after ‘Isha.'],
    ['Добавляй их, когда фард стал привычкой. Начни с 2 ракаатов перед Фаджром.', 'Add them once the obligatory prayers are a habit. Start with 2 rak‘ahs before Fajr.'],
  ]),
  S(37, ['Покаяние: дверь всегда открыта', 'Repentance: the door is always open'], [
    ['Каждый ошибается. Тауба это вернуться: пожалеть, оставить и решить не повторять. Аллах любит кающихся.', 'Everyone slips. Tawbah means returning: regret, stop, and resolve not to repeat. Allah loves those who repent.'],
    ['Не позволяй ошибке оторвать тебя от намаза. Намаз как раз то, что помогает подняться.', 'Do not let a mistake pull you away from prayer. Prayer is exactly what helps you get up.'],
  ]),
  S(38, ['Братья и сёстры рядом', 'Brothers and sisters nearby'], [
    ['Одному держаться трудно. Найди круг: двое-трое людей, которые напомнят о намазе и сделают за тебя дуа. Сёстрам лучше учиться у сестёр.', 'It is hard to keep going alone. Find a circle: two or three people who will remind you of prayer and make du‘a for you. Sisters do best learning from sisters.'],
  ], { go: 'circle' }),
  S(39, ['У кого учиться', 'Whom to learn from'], [
    ['Учись у имама своей мечети и у признанных учёных. Осторожно с теми, кто в интернете быстро объявляет других неверными или зовёт к крайностям.', 'Learn from the imam of your mosque and recognised scholars. Be careful with those online who quickly call others disbelievers or call to extremes.'],
    ['Мусульмане обычно следуют одному из четырёх мазхабов. Разница между ними в деталях, все они на истине.', 'Muslims usually follow one of the four schools of fiqh. They differ in details, and all of them are upon the truth.'],
  ]),
  S(40, ['40 дней позади', '40 days behind you'], [
    ['Ты {прошёл/прошла} путь, который многие проходят годами: омовение, намаз, первые суры. МашаАллах.', 'You have walked a path many take years to walk: wudu, prayer, your first suras. MashaAllah.'],
    ['Дальше главное постоянство. Добавь одну маленькую привычку после намаза, и пусть она станет твоей.', 'Now what matters is consistency. Add one small habit after a prayer, and let it become yours.'],
  ], { go: 'habit' }),
];
