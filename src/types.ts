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
  theme?: 'auto' | 'light' | 'dark';
  /** Text size: 1 normal, 1.1 large, 1.2 larger. */
  textScale?: number;
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
  quran?: { surah: number; ayah: number; translation: boolean; size: number; lang?: 'ru' | 'en' | 'tr' };
  langs?: LangState;
  course?: { learned: string[]; done: number[]; day: number };
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
  fajr: { ru: 'Фаджр', after: 'После Фаджра', ar: 'الفجر' },
  dhuhr: { ru: 'Зухр', after: 'После Зухра', ar: 'الظهر' },
  asr: { ru: 'Аср', after: 'После Асра', ar: 'العصر' },
  maghrib: { ru: 'Магриб', after: 'После Магриба', ar: 'المغرب' },
  isha: { ru: 'Иша', after: 'После Иша', ar: 'العشاء' },
};

export const SPHERES: { id: Sphere; ru: string }[] = [
  { id: 'faith', ru: 'Вера' },
  { id: 'body', ru: 'Тело' },
  { id: 'food', ru: 'Еда' },
  { id: 'mind', ru: 'Знания' },
  { id: 'biz', ru: 'Бизнес' },
  { id: 'family', ru: 'Семья' },
];

export const sphereName = (s: Sphere) => SPHERES.find((x) => x.id === s)?.ru ?? '';

export interface Card {
  id: string;
  front: string;
  back: string;
  box: number; // Leitner box 0..5
  due: string; // YYYY-MM-DD
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
  workouts: Record<string, string[]>;
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
}

export type GoalSource = 'quran' | 'pages' | 'chapters' | 'course' | 'prayers' | 'fasts' | 'workouts' | 'umrah' | 'habits' | 'manual';
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
}

export type Meal = 'b' | 'l' | 'd';
export interface FoodState {
  meals: Record<string, Partial<Record<Meal, 1 | 2 | 3>>>; // 1 light, 2 normal, 3 overate
  rules: string[]; // chosen clean-day rules
  clean: Record<string, string[]>; // day -> rules kept
  sunna: Record<string, string[]>;
  weight: Record<string, number>;
}

export interface SadaqaDay { money?: boolean; amt?: number; deed?: boolean }
export interface SadaqaState {
  days: Record<string, SadaqaDay>;
  secret: boolean; // amounts hidden until tapped
  cur: string;
  ramadan: { total: number; odd2: boolean; given: number[] } | null; // given = nights (21..30) already sent
  jariya: { id: string; title: string; kind: string; forWhom?: string; date: string }[];
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
}
