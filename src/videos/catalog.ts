// Starter catalog: public YouTube playlists picked by hand. Titles are ours; lessons load live from YouTube.
import type { VideoItem } from '../videos';
import { _t } from '../i18n';

const L = (cat: VideoItem['cat'], id: string, title: string, channel: string, lang: 'ru' | 'en' = 'ru', note?: string): VideoItem =>
  ({ kind: 'list', id, cat, title, channel, lang, note });

export const CATALOG: VideoItem[] = [
  // Вера
  L('faith', 'PLi7YQIILCkR_6sHvuZdJd-OIgXIANPqr_', _t("Жизнеописание Пророка ﷺ"), _t("Набиль аль-Авады")),
  L('faith', 'PLi7YQIILCkR-iVe3Bz66qy3KtFmTX-PfL', _t("История пророков"), _t("Набиль аль-Авады")),
  L('faith', 'PLlChGbUab9K9_ooTbJzFqJqU2Ew25iDur', _t("Жизнеописание сподвижников"), _t("Ясир Кады · на русском")),
  L('faith', 'PLQ02IYL5pmhFgND4Tyy5cTYenOKK_QFj5', 'Secrets of Salah', 'Yaqeen Institute', 'en', _t("Короткие уроки о том, как сделать намаз живым.")),
  L('faith', 'PLQ02IYL5pmhHvZ02LKQVeey8H-2XBKMGb', 'Meeting Muhammad ﷺ', 'Omar Suleiman', 'en'),
  L('faith', 'PLQ02IYL5pmhH0KWBrGxxR-lCCwlTFIVbm', "Allah's Names", 'Yaqeen Institute', 'en'),
  L('faith', 'PLYZxc42QNctXcCQZyZs48hAN90YJgnOnJ', 'The Stories of the Prophets', 'Yasir Qadhi', 'en'),
  // Бизнес
  L('biz', 'PLpO21zAdeMb8dH-t4cQncUGu0hmTGIlnx', _t("Основы экономики и бизнеса"), _t("Лаборатория экономики и бизнеса")),
  L('biz', 'PLQ-uHSnFig5MaafmEhFox7rO-b0RxQth-', 'How to Start a Startup', 'Y Combinator', 'en', _t("Классический курс лекций о том, как запустить своё дело.")),
  L('biz', 'PLQ-uHSnFig5M9fW16o2l35jrfdsxGknNB', 'Startup School', 'Y Combinator', 'en'),
  // Развитие
  L('mind', 'PLOrCiPx7HeJrDRa49nCG7m1fuhMWgLfSo', _t("Продуктивность: идеи из книг"), _t("КНИГАНТ")),
  L('mind', 'PL7BImOT2srcGtOFPLa_cPC_FBE8OXkIoz', 'Productivity Club', 'Ali Abdaal', 'en'),
  L('mind', 'PL7BImOT2srcE-wLIlCcgTCa_jznOZZLwS', 'Book Club', 'Ali Abdaal', 'en'),
  // Здоровье
  L('body', 'PLG7dHlVjap5exFM8H1q9U9QPtK92XYIpt', _t("Утренняя зарядка"), _t("ЗОЖ с Сарматом"), 'ru', _t("Короткая зарядка после Фаджра.")),
  L('body', 'PLEx0k235gxMme2nauJOyZBGMvbT6jAsfS', _t("Мягкие упражнения для старших"), _t("ЛФК каждый день"), 'ru', _t("Можно делать вместе с родителями.")),
  // Питание
  L('food', 'PLNlVKSW_ViCaNklZ1blmVOkF4XojJQ-qk', _t("Правильное питание"), _t("Доктор Утин")),
  L('food', 'PLMLarg_xd_Mr-v0gfAAf0qtGRFG1f1zJ-', _t("Питание без мифов"), _t("Доктор Никита, гастроэнтеролог")),
  // Семья
  L('family', 'PLp_3sjEzK2Ss0wtMhM1QSx-bqPib1T7xM', _t("Дочки и матери"), _t("Людмила Петрановская")),
  L('family', 'PLsH_9AIDQXIs3MTR2pBFgMrpB1TlpOz8T', _t("Как быть родителем"), _t("Людмила Петрановская")),
  // Языки
  L('lang', 'PL_004MF0FCGEwA3JrOE1KTD_i9J6rkhvt', _t("Арабский язык с нуля"), 'Leith Atetalla'),
  L('lang', 'PL9iyXJL3iMAmd0x4CHxjyAXxGidY_DrWF', 'Madinah Arabic, Book 1', 'Learn Quranic Arabic', 'en'),
  L('lang', 'PLMuaOd5gEFbA6F3zZwn42t0139HVNqZhJ', _t("Английский для начинающих"), 'Oxana Dolinka'),
];
