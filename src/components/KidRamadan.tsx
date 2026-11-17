import type { AppState, Kid } from '../types';
import { patchF } from '../family';
import { ramadanDay, ramadanMonth } from '../ramadan';

type Update = (fn: (s: AppState) => AppState) => void;

/** One small deed a day for children, in the order of the month. */
export const KID_DEEDS: { t: string; icon: string }[] = [
  { t: 'Сказать «Бисмиллях» перед едой', icon: '🍽️' }, { t: 'Принести воду маме или папе на ифтар', icon: '🥛' },
  { t: 'Выучить дуа ифтара', icon: '🤲' }, { t: 'Помочь накрыть на стол', icon: '🍴' },
  { t: 'Положить монетку в копилку садаки', icon: '🪙' }, { t: 'Сказать доброе слово брату или сестре', icon: '💬' },
  { t: 'Послушать суру аль-Фатиха', icon: '🎧' }, { t: 'Убрать свои игрушки без напоминания', icon: '🧸' },
  { t: 'Нарисовать открытку для бабушки или дедушки', icon: '🎨' }, { t: 'Угостить соседа финиками', icon: '🌴' },
  { t: 'Сказать «Альхамдулиллях» за еду', icon: '😊' }, { t: 'Помолиться вместе с семьёй', icon: '🕌' },
  { t: 'Выучить суру аль-Ихлас', icon: '📖' }, { t: 'Поделиться игрушкой', icon: '🎁' },
  { t: 'Не спорить целый день', icon: '🕊️' }, { t: 'Помочь помыть посуду после ифтара', icon: '🧽' },
  { t: 'Узнать историю пророка Юнуса', icon: '🐋' }, { t: 'Сделать дуа за друга', icon: '🤝' },
  { t: 'Полить растение', icon: '🪴' }, { t: 'Сказать салям всем дома', icon: '👋' },
  { t: 'Узнать, что такое Ночь могущества', icon: '🌙' }, { t: 'Покормить птиц', icon: '🐦' },
  { t: 'Прочитать с родителями аят и его смысл', icon: '📚' }, { t: 'Помочь кому-то, ничего не говоря', icon: '💝' },
  { t: 'Сказать «Субханаллах» 10 раз', icon: '📿' }, { t: 'Собрать одежду или игрушки для нуждающихся', icon: '📦' },
  { t: 'Поблагодарить маму и папу', icon: '❤️' }, { t: 'Узнать, что такое закят аль-фитр', icon: '🌾' },
  { t: 'Нарисовать открытку к Иду', icon: '✉️' }, { t: 'Приготовить нарядную одежду к Иду', icon: '👕' },
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
      <div className="kid-rm-h"><b>🌙 Мой Рамадан</b><small>день {day}</small></div>
      <p className="kid-rm-q">Сегодня я пощусь…</p>
      <div className="kid-rm-fast">
        {([['full', '🌕', 'Весь день'], ['half', '🌓', 'До обеда']] as const).map(([v, ic, l]) => (
          <button key={v} type="button" aria-pressed={cur.fast === v} onClick={() => update(setDay(kid.id, today, (x) => ({ ...x, fast: x.fast === v ? undefined : v })))}>
            <span aria-hidden="true">{ic}</span>{l}
          </button>
        ))}
      </div>
      <button type="button" className={`kid-rm-deed${cur.deed ? ' on' : ''}`} aria-pressed={Boolean(cur.deed)} onClick={() => update(setDay(kid.id, today, (x) => ({ ...x, deed: !x.deed })))}>
        <span className="ic" aria-hidden="true">{deed.icon}</span>
        <span><small>Доброе дело дня</small><b>{deed.t}</b></span>
        <i aria-hidden="true">{cur.deed ? '✓' : ''}</i>
      </button>
      <div className="kid-rm-cal" aria-label="Календарь Рамадана">
        {mon.days.map((d, i) => {
          const v = r[d];
          const ic = v?.fast === 'full' ? '🌕' : v?.fast === 'half' ? '🌓' : v?.deed ? '⭐' : '';
          return <span key={d} className={`${d === today ? 'now' : ''}${ic ? ' on' : ''}`} title={`День ${i + 1}`}>{ic || i + 1}</span>;
        })}
      </div>
      <small className="kid-rm-note">{moons ? `Уже ${moons} светлых дней, из них ${fasts} с постом. МашаАллах!` : 'Каждый день с постом или добрым делом засветится на календаре.'} Дети постятся по силам: до взрослого возраста пост не обязателен, а учиться можно понемногу.</small>
    </div>
  );
}
