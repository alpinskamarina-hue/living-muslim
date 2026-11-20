import { _t } from './i18n';
export type Anchor = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type Sphere = 'faith' | 'body' | 'food' | 'mind' | 'biz' | 'family';
export type Mark = 'done' | 'min' | 'later';
export type PrayerMark = 'ontime' | 'late';
export type HabitStatus = 'active' | 'queued' | 'archived';

export interface Habit {
  id: string;
  action: string;
  min: string;
  anchor: Anchor;
  sphere: Sphere;
  status: HabitStatus;
  /** Formed habits (21 days at 80%) stay on screen but free a slot in the limit of 5. */
  formed?: boolean;
  createdAt: string; // YYYY-MM-DD
  /** Hijri year: a habit taken on only for that Ramadan. */
  ramadan?: number;
}

export type MethodId =
  | 'MuslimWorldLeague'
  | 'MoonsightingCommittee'
  | 'NorthAmerica'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'Turkey';

export interface Settings {
  place: string;
  lat: number;
  lng: number;
  method: MethodId;
  madhab: 'shafi' | 'hanafi';
  name: string;
  /** Minutes added to each calculated prayer time, to match the local mosque. */
  offsets?: Partial<Record<Anchor, number>>;
  /** prayer = dark from Maghrib to Fajr (the default when missing); auto = like the phone. */
  theme?: 'prayer' | 'auto' | 'light' | 'dark';
  /** Text size: 1 normal, 1.1 large, 1.2 larger. */
  textScale?: number;
  reminders?: ReminderPrefs;
  /** Who I am, for Arabic and Russian word forms: brother or sister. */
  me?: 'm' | 'f';
  /** Islamic phrases and reminders: normal, calm (default), or phrases only. */
  words?: 'normal' | 'calm' | 'phrases';
  /** Interface language. For now only Ramadan and its reminders speak English. */
  lang?: 'ru' | 'en';
  /** Night colours in Ramadan; default on. */
  ramadanTheme?: boolean;
  /** «Где ты сейчас на своём пути?»: new to Islam, praying and want consistency, coming back to prayer. */
  path?: 'new' | 'steady' | 'back';
  /** Quiet mode: notifications without religious words («Время для себя»). */
  quiet?: boolean;
  /** Adhan: reciter, Fajr reciter, what plays at each prayer, volume. */
  adhan?: AdhanPrefs;
  /** The assistant's name the person chose; empty means «Помощник». */
  aiName?: string;
  /** The assistant's look: an ornament badge or the person's own photo (kept on the device). */
  aiStyle?: import('./aiLook').AiStyle;
  /** The chat's light: a running gold ring (default), a soft aurora, or night with zellige stars. */
  aiGlow?: 'ring' | 'aurora' | 'night';
  /** 3D finish of the assistant's picture: gold medal (default), pearl, halo, glass, night star. */
  aiFinish?: import('./aiLook').AiFinish;
  /** «Память помощника»: false = do not remember between conversations. */
  aiMemory?: boolean;
  /** Badge colour key from AI_COLORS. */
  aiColor?: string;
  /** How it speaks: «ты» or «вы», short or detailed, soft / warm / to the point. */
  aiYou?: 'ty' | 'vy';
  aiLen?: 'short' | 'long';
  aiTone?: 'soft' | 'warm' | 'direct';
  /** The round button at the bottom right; on unless switched off. */
  aiFab?: boolean;
}

export type AdhanMode = 'full' | 'short' | 'off';
export interface AdhanPrefs {
  /** Plays at the start of each prayer while the app is open. */
  on: boolean;
  reciter: string;
  /** Reciter for Fajr; '' = the same as the others. */
  fajr: string;
  /** Missing means a full adhan. */
  mode: Partial<Record<Anchor, AdhanMode>>;
  /** 0..1 */
  vol: number;
}

export interface ReminderPrefs {
  on: boolean;
  prayers: Anchor[];
  /** Minutes before the prayer time; 0 = at the time. */
  before: number;
  /** Evening muhasabah reminder, "HH:MM" or '' for off. */
  muhasaba: string;
  /** Ramadan reminders; missing means the defaults (RPUSH_DEFAULT). */
  ramadan?: RamadanPush;
  /** New messages in circle chats; missing means on. */
  chat?: boolean;
  /** Habit nudges 25 minutes after a prayer, at most 3 a day; missing means on. */
  habits?: boolean;
  /** «New course» notices; missing means on. */
  courses?: boolean;
}

export interface RamadanPush {
  /** Minutes before Fajr to wake for suhoor; 0 = off. */
  suhoor: number;
  /** Minutes before Maghrib; -1 = off, 0 = at the time. */
  iftar: number;
  tarawih: boolean;
  /** Odd nights of the last ten and the first night of Ramadan. */
  nights: boolean;
  /** Zakat al-fitr a few days before Eid. */
  fitr: boolean;
}

export interface AppState {
  version: 1;
  habits: Habit[];
  /** log[date][habitId] = mark */
  log: Record<string, Record<string, Mark>>;
  hard: Record<string, Anchor[]>;
  notes: Record<string, string>;
  /** prayers[date][anchor] = whether the prayer was prayed on time or late */
  prayers: Record<string, Partial<Record<Anchor, PrayerMark>>>;
  settings: Settings;
  videos?: import('./videos').VideoState;
  /** Practice ids pinned to the top of Practice (up to 4). */
  practiceFav?: string[];
  /** started[day] = keys of today's practice items the person already started (h:<habitId>, g:<goalId>). */
  started?: Record<string, string[]>;
  /** Morning (m) and evening (e) adhkar: the days they were read; short = the short set; tr = show transliteration. */
  azkar?: { m: string[]; e: string[]; short?: boolean; tr?: boolean };
  /** «Хочу оставить»: bad habits the person is leaving (private, device only). */
  quits?: import('./quit').Quit[];
  /** «Моя мечеть», jamaat times, the Today card switch, Friday sunnah ticks. Position and search results stay on the phone. */
  mosque?: import('./mosques').MosqueSettings;
  quran?: { surah: number; ayah: number; translation: boolean; size: number; lang?: 'ru' | 'en' | 'tr'; /** Reading in Russian or Latin letters under the Arabic; missing means on. */ tr?: boolean };
  langs?: LangState;
  course?: { learned: string[]; done: number[]; day: number; rec?: Record<number, string> };
  /** Arabic A1 course: the same shape as the English one. */
  courseAr?: { learned: string[]; done: number[]; day: number; rec?: Record<number, string>; tr?: boolean };
  books?: BookMeta[];
  summaryRead?: string[];
  summaryNotes?: { key: string; date: string; text: string }[];
  health?: HealthState;
  trip?: Trip | null;
  umrah?: UmrahState;
  goals?: Goal[];
  food?: FoodState;
  sadaqa?: SadaqaState;
  ramadan?: RamadanState;
  goalReview?: string; // day of the last weekly review
  pastTrips?: { from: string; to: string }[];
  family?: FamilyState;
  /** «Новый путь» for those who have just accepted Islam. */
  newpath?: import('./newpath').NewPathState;
  /** «Тесты» in Practice: past runs per test (answers stay on the phone). */
  tests?: import('./selftest').TestsState;
  /** «Мои идеи»: ideas and notes the person (or the assistant for them) wrote down. */
  ideas?: Idea[];
  /** Reminders the assistant (or the person) set: a push at `at` (ms), shown in Мои идеи. */
  pings?: Ping[];
  /** «Планы»: things to do on a day, between the prayers. */
  plans?: import('./plans').Plan[];
  plansSet?: import('./plans').PlansSettings;
}

export interface Idea { id: string; at: number; text: string }

export interface KidTask { id: string; t: string; icon: string }
export interface Kid {
  id: string;
  name: string;
  age: number;
  color: string;
  tasks: KidTask[];
  log: Record<string, string[]>; // day -> task ids done
  created: string;
  /** Ramadan for children: day -> fast (full or until midday) and the good deed of the day. */
  ramadan?: Record<string, { fast?: 'full' | 'half'; deed?: boolean }>;
}
export interface FamilyState {
  kids: Kid[];
  together: Record<string, Anchor[]>; // day -> prayers prayed together at home
  promise?: { text: string; days: number } | null;
  on?: boolean; // owner turned the circle into a family circle
}

export interface BookMeta {
  id: string;
  title: string;
  kind: 'pdf' | 'txt';
  pages: number;
  page: number;
  addedAt: string;
  notes?: { date: string; page: number; text: string }[];
}

export const ANCHORS: Anchor[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const ANCHOR_LABEL: Record<Anchor, { ru: string; after: string; ar: string }> = {
  fajr: { ru: _t("Фаджр"), after: _t("После Фаджра"), ar: 'الفجر' },
  dhuhr: { ru: _t("Зухр"), after: _t("После Зухра"), ar: 'الظهر' },
  asr: { ru: _t("Аср"), after: _t("После Асра"), ar: 'العصر' },
  maghrib: { ru: _t("Магриб"), after: _t("После Магриба"), ar: 'المغرب' },
  isha: { ru: _t("Иша"), after: _t("После Иша"), ar: 'العشاء' },
};

export const SPHERES: { id: Sphere; ru: string }[] = [
  { id: 'faith', ru: _t("Вера") },
  { id: 'body', ru: _t("Тело") },
  { id: 'food', ru: _t("Еда") },
  { id: 'mind', ru: _t("Знания") },
  { id: 'biz', ru: _t("Бизнес") },
  { id: 'family', ru: _t("Семья") },
];

export const sphereName = (s: Sphere) => SPHERES.find((x) => x.id === s)?.ru ?? '';

export interface Card {
  id: string;
  front: string;
  back: string;
  box: number; // Leitner box 0..5
  due: string; // YYYY-MM-DD
  tr?: string; // pronunciation (IPA) found for a word the person added
}

export interface LangState {
  current: string; // language id
  decks: Record<string, Card[]>;
}

export interface SleepLog { bed: string; wake: string; q: 1 | 2 | 3 }
export interface HealthState {
  sleepHours: number;
  wakeBefore: number; // minutes before Fajr
  sleep: Record<string, SleepLog>; // keyed by the morning's day
  waterGoal: number;
  water: Record<string, number>;
  fasts: Record<string, true>;
  /** Per day: timer ids ('morning', 'back|7' with real minutes) and own entries ('own:gym|60|3', see health.ts parseW). */
  workouts: Record<string, string[]>;
  /** Workout settings: days a week (2–5), timer sound, voice language, reminder after a prayer. */
  wgoal?: number;
  wsound?: 'voice' | 'beep' | 'off';
  wvoice?: 'ru' | 'en';
  wrem?: 'none' | 'fajr' | 'asr' | 'isha';
}

export interface Trip {
  place: string;
  lat: number;
  lng: number;
  from: string; // departure day
  to: string; // return day
  stayDays: number; // planned days at the destination
  paused: string[]; // habit ids on pause during the trip
  checklist: string[]; // ticked items
}

export interface UmrahState {
  prep: string[];
  duas: { id: string; text: string; who?: string; done?: boolean }[];
  tawaf: number;
  saee: number;
  /** My own travel days when I go without a Circle group (YYYY-MM-DD). */
  from?: string;
  to?: string;
  /** Dua requests from the Circle I have already made: `${from}:${host}:${i}`. */
  asked?: string[];
  /** Umrah video lessons already watched (video ids). */
  watched?: string[];
  vlang?: 'ru' | 'en';
  /** The flight for the miqat countdown: where from and landing time (datetime-local). */
  flight?: { dir: 'north' | 'east' | 'south' | 'medina'; land: string };
  /** When I entered ihram (ms), until I leave it. */
  ihram?: number;
  /** Savings for umrah: mine (no `for`) and gifts for a parent. Sums only, the money stays with the person. */
  /** On the ground: hotel for the lost card, walk to the mosque, group meeting point and leader. */
  site?: { city?: 'makkah' | 'madinah'; hotel?: string; hotelAr?: string; address?: string; walk?: number; meet?: string; amir?: string; amirName?: string };
  /** One habit kept for 40 days after the trip. */
  keep?: { what: string; start: string; days: string[] };
  /** Pilgrim's diary, on this device only. */
  diary?: { id: string; d: string; text: string }[];
  /** "Made at the Kaaba" notes I have already seen. */
  madeSeen?: string[];
  /** Days I did the walking norm (YYYY-MM-DD). */
  walk?: string[];
  /** Share my place with my trip group while there (this device). */
  shareLoc?: boolean;
  /** Trip pieces ready: visa, flight, hotel, esim, insure. */
  booked?: string[];
  /** My umrah documents: the files stay on this phone (IndexedDB), only this list is in the state. */
  docs?: { id: string; kind: string; name: string; type: string; size: number; added: string; until?: string }[];
  /** My plan for days on site: time (HH:MM) and what, by day (YYYY-MM-DD). */
  dayPlan?: { id: string; d: string; t: string; text: string }[];
  /** Talbiya phrases I know by heart (indexes 0..3). */
  talbiyaKnown?: number[];
  funds?: { id: string; goal: number; cur: string; by?: string; for?: string; entries: { d: string; amt: number; who?: string }[] }[];
}

export type GoalSource = 'quran' | 'pages' | 'bookch' | 'chapters' | 'course' | 'prayers' | 'fasts' | 'workouts' | 'umrah' | 'habits' | 'manual' | 'video' | 'hifz' | 'steps';
export interface GoalStepItem { id: string; text: string; done?: string }
/** A dated note in an open goal (Nasim, 19.11): what was done or thought, for long goals with rare steps. */
export interface GoalNote { id: string; day: string; at: number; text: string }

export interface Goal {
  id: string;
  title: string;
  source: GoalSource;
  identity: string;
  niyya: string;
  target: number;
  unit: string;
  start: number; // value when the goal was created (for counters)
  manual: number; // for source 'manual'
  due?: string;
  habitIds: string[];
  status: 'active' | 'later' | 'done';
  createdAt: string;
  snaps?: Record<string, number>; // day -> value, for the weekly review
  shared?: boolean;
  /** Circles the goal is shown in (standalone site); empty = the open one. */
  circles?: string[];
  /** video: course id; hifz: surah numbers, «67» or «112,113,114». */
  ref?: string;
  /** hifz: learned ayahs per surah. */
  hifz?: Record<string, number>;
  /** steps: a life goal (move, trip, wedding) as a list of steps; done = the day it was ticked. */
  steps?: GoalStepItem[];
  /** Goal journal, newest last. */
  notes?: GoalNote[];
  doneAt?: string;
}

export type Meal = 'b' | 'l' | 'd';
export interface FoodState {
  meals: Record<string, Partial<Record<Meal, 1 | 2 | 3>>>; // 1 light, 2 normal, 3 overate
  rules: string[]; // chosen clean-day rules
  clean: Record<string, string[]>; // day -> rules kept
  sunna: Record<string, string[]>;
  weight: Record<string, number>;
  own?: { id: string; l: string }[]; // own clean-day rules («Без хлеба на ночь»)
  goal?: number; // weight goal, kg
  /** Nutrition mode (20.11): Мера (default, no numbers) or a mode with daily targets. */
  mode?: FoodMode;
  body?: FoodBody;
  /** Daily kcal set by hand instead of the calculated one. */
  kcal?: number;
  /** What was eaten, typed in: day -> items. */
  log?: Record<string, FoodItem[]>;
}

export type FoodMode = 'mera' | 'lose' | 'sport' | 'keep';
export interface FoodBody { h: number; age: number; sex: 'm' | 'f'; act: 1 | 2 | 3 | 4 }
/** One logged food: name, grams, kcal, protein, fat, carbs, meal slot. */
export interface FoodItem { id: string; n: string; g: number; k: number; p: number; f: number; c: number; m: Meal }

export interface SadaqaDay { money?: boolean; amt?: number; deed?: boolean }
export interface SadaqaState {
  days: Record<string, SadaqaDay>;
  secret: boolean; // amounts hidden until tapped
  cur: string;
  ramadan: { total: number; odd2: boolean; given: number[] } | null; // given = nights (21..30) already sent
  jariya: { id: string; title: string; kind: string; forWhom?: string; date: string }[];
  zakat?: ZakatState;
}
export interface ZakatState {
  basis: 'gold' | 'silver';
  gold: number; // price of 1 g of gold
  silver: number; // price of 1 g of silver
  items: Record<string, number>; // cash, bank, gold, silver, invest, goods, owed, debts
  paid: { date: string; amt: number }[];
}

export type FastMark = 'fast' | 'ill' | 'travel' | 'period' | 'other' | 'chronic';
export interface RamadanState {
  fasts: Record<string, FastMark>; // gregorian day -> mark
  qada: string[]; // days a missed fast was made up
  khatm: { rate: number; startDay?: number; startIdx: number; rounds: number; year: number } | null; // rate = juz per day
  nights: Record<string, string[]>; // day of the evening -> tarawih | tahajjud | itikaf
  fitr: number[]; // hijri years zakat al-fitr was given
  keep: Record<string, string>; // hijri year -> the one habit to keep
  plan?: Record<string, 'min' | 'pause'>; // habit id -> how it runs during Ramadan
  prep?: Record<string, string[]>; // hijri year -> preparation items done
  deeds?: Record<string, number[]>; // hijri year -> days of the 30-day programme whose good deed is done
  duas?: RDua[]; // personal dua list, private
  qadr?: Record<string, string[]>; // day of the evening -> night plan items done
  qadaPlan?: { perWeek: number; from: string } | null; // making up missed fasts: days per week from a date
  fidyaPrice?: number; // price of one meal for fidyah, in the sadaqa currency
  itikaf?: { year: number; from: string; end?: string } | null;
  itikafLog?: Record<string, string[]>; // day -> schedule items done
  wake?: string; // "HH:MM" when I get up for work, for the sleep plan
}
export interface RDua { id: string; t: string; at: string; ok?: string }

export interface Ping {
  id: string;
  text: string;
  /** When to remind, ms since epoch. */
  at: number;
  /** Set relative to a prayer («после Зухра»): which one, for the label. */
  prayer?: Anchor | 'jumuah';
  made: number;
}
