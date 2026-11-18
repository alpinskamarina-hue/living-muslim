import type { AppState, Kid } from '../types';
import { patchF } from '../family';
import { ramadanDay, ramadanMonth } from '../ramadan';
import { _t, _tj } from '../i18n';

type Update = (fn: (s: AppState) => AppState) => void;

/** One small deed a day for children, in the order of the month. */
export const KID_DEEDS: { t: string; icon: string }[] = [
  { t: _t("Сказать «Бисмиллях» перед едой"), icon: '🍽️' }, { t: _t("Принести воду маме или папе на ифтар"), icon: '🥛' },
  { t: _t("Выучить дуа ифтара"), icon: '🤲' }, { t: _t("Помочь накрыть на стол"), icon: '🍴' },
  { t: _t("Положить монетку в копилку садаки"), icon: '🪙' }, { t: _t("Сказать доброе слово брату или сестре"), icon: '💬' },
  { t: _t("Послушать суру аль-Фатиха"), icon: '🎧' }, { t: _t("Убрать свои игрушки без напоминания"), icon: '🧸' },
  { t: _t("Нарисовать открытку для бабушки или дедушки"), icon: '🎨' }, { t: _t("Угостить соседа финиками"), icon: '🌴' },
  { t: _t("Сказать «Альхамдулиллях» за еду"), icon: '😊' }, { t: _t("Помолиться вместе с семьёй"), icon: '🕌' },
  { t: _t("Выучить суру аль-Ихлас"), icon: '📖' }, { t: _t("Поделиться игрушкой"), icon: '🎁' },
  { t: _t("Не спорить целый день"), icon: '🕊️' }, { t: _t("Помочь помыть посуду после ифтара"), icon: '🧽' },
  { t: _t("Узнать историю пророка Юнуса"), icon: '🐋' }, { t: _t("Сделать дуа за друга"), icon: '🤝' },
  { t: _t("Полить растение"), icon: '🪴' }, { t: _t("Сказать салям всем дома"), icon: '👋' },
  { t: _t("Узнать, что такое Ночь могущества"), icon: '🌙' }, { t: _t("Покормить птиц"), icon: '🐦' },
  { t: _t("Прочитать с родителями аят и его смысл"), icon: '📚' }, { t: _t("Помочь кому-то, ничего не говоря"), icon: '💝' },
  { t: _t("Сказать «Субханаллах» 10 раз"), icon: '📿' }, { t: _t("Собрать одежду или игрушки для нуждающихся"), icon: '📦' },
  { t: _t("Поблагодарить маму и папу"), icon: '❤️' }, { t: _t("Узнать, что такое закят аль-фитр"), icon: '🌾' },
  { t: _t("Нарисовать открытку к Иду"), icon: '✉️' }, { t: _t("Приготовить нарядную одежду к Иду"), icon: '👕' },
];

type KR = NonNullable<Kid['ramadan']>[string];
const setDay = (kidId: string, day: string, fn: (x: KR) => KR): ((s: AppState) => AppState) => (s) => patchF(s, (f) => ({
  kids: f.kids.map((k) => {
    if (k.id !== kidId) return k;
    const r = { ...(k.ramadan ?? {}) };
    const v = fn({ ...(r[day] ?? {}) });
    if (!v.fast && !v.deed) delete r[day]; else r[day] = v;
    return { ...k, ramadan: r };
  }),
}));

/** Shown on a child's screen during Ramadan: fasting by strength, the deed of the day and a month of moons. */
export function KidRamadan({ kid, update, today }: { kid: Kid; update: Update; today: string }) {
  const day = ramadanDay(today);
  if (!day) return null;
  const mon = ramadanMonth(today);
  const r = kid.ramadan ?? {};
  const cur = r[today] ?? {};
  const deed = KID_DEEDS[(day - 1) % KID_DEEDS.length];
  const moons = mon.days.filter((d) => r[d]?.fast || r[d]?.deed).length;
  const fasts = mon.days.filter((d) => r[d]?.fast).length;
  return (
    <div className="kid-rm">
      <div className="kid-rm-h"><b>{_t("🌙 Мой Рамадан")}</b><small>{_tj("день {0}", day)}</small></div>
      <p className="kid-rm-q">{_t("Сегодня я пощусь…")}</p>
      <div className="kid-rm-fast">
        {([['full', '🌕', _t("Весь день")], ['half', '🌓', _t("До обеда")]] as const).map(([v, ic, l]) => (
          <button key={v} type="button" aria-pressed={cur.fast === v} onClick={() => update(setDay(kid.id, today, (x) => ({ ...x, fast: x.fast === v ? undefined : v })))}>
            <span aria-hidden="true">{ic}</span>{l}
          </button>
        ))}
      </div>
      <button type="button" className={`kid-rm-deed${cur.deed ? ' on' : ''}`} aria-pressed={Boolean(cur.deed)} onClick={() => update(setDay(kid.id, today, (x) => ({ ...x, deed: !x.deed })))}>
        <span className="ic" aria-hidden="true">{deed.icon}</span>
        <span><small>{_t("Доброе дело дня")}</small><b>{deed.t}</b></span>
        <i aria-hidden="true">{cur.deed ? '✓' : ''}</i>
      </button>
      <div className="kid-rm-cal" aria-label={_t("Календарь Рамадана")}>
        {mon.days.map((d, i) => {
          const v = r[d];
          const ic = v?.fast === 'full' ? '🌕' : v?.fast === 'half' ? '🌓' : v?.deed ? '⭐' : '';
          return <span key={d} className={`${d === today ? 'now' : ''}${ic ? ' on' : ''}`} title={_t("День {0}", i + 1)}>{ic || i + 1}</span>;
        })}
      </div>
      <small className="kid-rm-note">{_tj("{0} Дети постятся по силам: до взрослого возраста пост не обязателен, а учиться можно понемногу.", moons ? _t("Уже {0} светлых дней, из них {1} с постом. МашаАллах!", moons, fasts) : _t("Каждый день с постом или добрым делом засветится на календаре."))}</small>
    </div>
  );
}
