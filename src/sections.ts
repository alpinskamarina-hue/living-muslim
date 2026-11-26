// Names and groups of the sections the anonymous counter knows (src/usage.ts). Used by the owner's «Разделы» screen.
import { _t } from './i18n';

export type SecGroup = 'faith' | 'study' | 'people' | 'life' | 'app';

export interface SecInfo { k: string; t: string; g: SecGroup }

// Order inside a group is only a tie-break; the screen sorts by people.
const LIST: [string, string, SecGroup][] = [
  ['today', 'Сегодня', 'faith'],
  ['quran', 'Коран', 'faith'],
  ['azkar', 'Азкары', 'faith'],
  ['tasbih', 'Тасбих', 'faith'],
  ['adhan', 'Азан', 'faith'],
  ['qibla', 'Кибла и мечети', 'faith'],
  ['ramadan', 'Рамадан', 'faith'],
  ['khutba', 'Перевод хутбы', 'faith'],
  ['newpath', 'Новый путь', 'faith'],
  ['focus', 'Фокус', 'faith'],
  ['nap', 'Пока малыш спит', 'faith'],
  ['videos', 'Курсы', 'study'],
  ['books', 'Книги', 'study'],
  ['langs', 'Языки', 'study'],
  ['course', 'Английский A1', 'study'],
  ['course-ar', 'Арабский A1', 'study'],
  ['tests', 'Тест «Что труднее»', 'study'],
  ['test-salah', 'Тест «Намаз и Коран»', 'study'],
  ['test-umrah', 'Тест «Готовность к умре»', 'study'],
  ['study', 'Круг «Учёба»', 'study'],
  ['guide', 'Гид', 'study'],
  ['circle', 'Круг', 'people'],
  ['chat', 'Чат круга', 'people'],
  ['dm', 'Личные сообщения', 'people'],
  ['stories', 'Сторис', 'people'],
  ['open', 'Открытые круги', 'people'],
  ['nikah', 'Никах', 'people'],
  ['seek', 'Сейчас ищу', 'people'],
  ['biz', 'Круг «Бизнес»', 'people'],
  ['startup', 'Круг «Стартап»', 'people'],
  ['sisters', 'Для сестёр', 'people'],
  ['umrah', 'Умра', 'life'],
  ['goals', 'Цели', 'life'],
  ['health', 'Здоровье', 'life'],
  ['body', 'Здоровье и питание', 'life'],
  ['food', 'Питание', 'life'],
  ['sadaqa', 'Садака', 'life'],
  ['safar', 'Сафар', 'life'],
  ['halal', 'Халяль-сканер', 'life'],
  ['plans', 'Планы', 'life'],
  ['quit', 'Хочу оставить', 'life'],
  ['garden', 'Сад', 'life'],
  ['assistant', 'Помощник', 'app'],
  ['pings', 'Напоминания помощника', 'app'],
  ['ideas', 'Идеи помощника', 'app'],
  ['founders', 'Круг основателей', 'app'],
  ['support', 'Поддержать проект', 'app'],
  ['pro', 'Тарифы', 'app'],
  ['practice', 'Практика (главная)', 'app'],
  ['profile', 'Профиль', 'app'],
  ['me', 'Мой профиль', 'app'],
  ['remind', 'Напоминания', 'app'],
  ['words', 'Фразы', 'app'],
  ['look', 'Внешний вид', 'app'],
  ['teacher', 'Я учительница / гид', 'app'],
];

export const GROUPS: [SecGroup, string][] = [['faith', 'Вера'], ['study', 'Учёба'], ['people', 'Сообщество'], ['life', 'Жизнь'], ['app', 'Приложение']];

const MAP = new Map(LIST.map(([k, t, g]) => [k, { k, t, g }]));

export function secInfo(k: string): SecInfo {
  const s = MAP.get(k);
  return s ? { ...s, t: _t(s.t) } : { k, t: k, g: 'app' };
}

/** Readable name of an action inside a section. */
const ACTS: Record<string, string> = {
  open: 'Открыли', finish: 'Отметили «Сделано»', ayah: 'Аятов прочитано', surah: 'Сур открыто', tr: 'Читали с транскрипцией',
  lesson: 'Уроков пройдено', start: 'Начали курс', half: 'Половина курса', done: 'Закончили', chapter: 'Глав отмечено',
  book_add: 'Книг добавлено', book_done: 'Дочитали книгу', test_done: 'Прошли тест', prayer: 'Отметок намаза', azkar_done: 'Азкары прочитаны',
  count: 'Нажатий тасбиха', meal: 'Приёмов пищи отмечено', water: 'Стаканов воды', workout: 'Тренировок', scan: 'Сканирований',
  deed: 'Добрых дел отмечено', ask: 'Вопросов помощнику', send: 'Сообщений отправлено', event: 'Дел и событий добавлено',
  goal_add: 'Целей создано', step: 'Шагов отмечено', card: 'Карточек повторено', mark: 'Отметок', trip: 'Поездок создано', view: 'Просмотров',
};

export function actName(a: string): string {
  if (a.startsWith('via:')) return _t('Пришли из «{0}»', secInfo(a.slice(4)).t);
  const base = a.split(':')[0];
  return ACTS[base] ? _t(ACTS[base]) : a;
}
