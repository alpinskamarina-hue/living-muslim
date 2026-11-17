import { useState } from 'react';

// Three more pieces of the umrah screen: when to go, umrah for someone else, and Madinah.

// Average daytime highs in Makkah by month (°C, long-term climate).
const HEAT = [30, 31, 34, 38, 41, 43, 43, 43, 42, 39, 34, 31];
const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const hij = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric' });
const hm = (d: Date) => { const p = hij.formatToParts(d); return { m: Number(p.find((x) => x.type === 'month')?.value), d: Number(p.find((x) => x.type === 'day')?.value) }; };

type Month = { y: number; m: number; heat: number; ramadan: boolean; closed: boolean; holidays: boolean; score: number };
function months(today: string): Month[] {
  const t = new Date(today);
  return Array.from({ length: 12 }, (_, i) => {
    const y = t.getFullYear() + Math.floor((t.getMonth() + i) / 12), m = (t.getMonth() + i) % 12;
    let ramadan = false, closed = false;
    for (let day = 1; day <= 28; day += 3) {
      const h = hm(new Date(y, m, day));
      if (h.m === 9) ramadan = true;
      // Umrah for visitors usually pauses around the Hajj season: mid Dhu al-Qadah to the end of Dhu al-Hijjah.
      if ((h.m === 11 && h.d >= 15) || h.m === 12) closed = true;
    }
    const holidays = m === 0 || m === 6 || m === 7 || m === 11;
    const heat = HEAT[m];
    const score = closed ? -9 : (heat <= 34 ? 2 : heat <= 39 ? 1 : 0) + (ramadan ? -2 : 0) + (holidays ? -1 : 0);
    return { y, m, heat, ramadan, closed, holidays, score };
  });
}

export function WhenToGo({ today }: { today: string }) {
  const [pick, setPick] = useState<number | null>(null);
  const list = months(today);
  const best = list.filter((x) => x.score >= 2);
  const sel = pick !== null ? list[pick] : null;
  return (
    <div className="pp-card">
      <div className="pp-top"><b>Когда лучше ехать</b><small>12 месяцев вперёд</small></div>
      <div className="wg-grid">
        {list.map((x, i) => (
          <button key={i} type="button" aria-pressed={pick === i} className={`wg-m s${Math.max(-1, Math.min(2, x.score))}`} onClick={() => setPick(pick === i ? null : i)}>
            <b>{MON[x.m]}</b><small>{x.heat}°</small>{x.ramadan && <em>🌙</em>}{x.closed && <em>⛔</em>}
          </button>
        ))}
      </div>
      {sel ? (
        <p className="wg-note">
          <b>{MON[sel.m]} {sel.y}: </b>
          {sel.closed ? 'сезон хаджа, умра для приезжих обычно приостановлена. Проверь даты в Nusuk.'
            : [
              sel.heat <= 34 ? `днём около ${sel.heat}°, комфортно` : sel.heat <= 39 ? `днём около ${sel.heat}°, жарко` : `днём ${sel.heat}° и выше, очень жарко: обряды ночью`,
              sel.ramadan ? 'Рамадан: умра в Рамадан по награде как хадж (аль-Бухари, 1782), но толпа и цены максимальные, особенно в последние 10 ночей' : '',
              sel.holidays ? 'школьные каникулы, людей и цены больше' : '',
              !sel.ramadan && !sel.holidays ? 'спокойнее и дешевле' : '',
            ].filter(Boolean).join('; ') + '.'}
        </p>
      ) : (
        <p className="wg-note">{best.length ? <>Лучшее время: <b>{best.map((x) => MON[x.m]).join(', ')}</b>. Прохладнее, без Рамадана и каникул, обычно дешевле.</> : 'Нажми на месяц, чтобы увидеть подробности.'}</p>
      )}
      <small className="pp-tip">🌙 Рамадан · ⛔ сезон хаджа. Температура средняя многолетняя, даты по календарю Умм аль-Кура.</small>
    </div>
  );
}

export function Badal() {
  const [name, setName] = useState('');
  return (
    <details className="pp-card ex-d">
      <summary><b>Умра за другого (бадаль)</b><small>за умершего или того, кто не может поехать</small></summary>
      <p>Умру можно совершить за умершего родственника или за того, кто сам уже не сможет из-за старости или тяжёлой болезни. Это мнение большинства учёных.</p>
      <ul className="rules">
        <li>Сначала соверши умру за себя. Пророк ﷺ сказал человеку, который делал хадж за Шубруму: «Соверши сначала за себя, потом за Шубруму» (Абу Дауд, 1811).</li>
        <li>Одна умра за одного человека. Намерение делается у миката, обряды те же самые.</li>
        <li>Можно взять за это расходы, но лучше делать ради Аллаха и ради близкого человека.</li>
      </ul>
      <label className="field"><span>За кого</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: моя мама Фатима" /></label>
      <div className="h-card dua">
        <p className="ar-dua" lang="ar" dir="rtl">لَبَّيْكَ اللَّهُمَّ عُمْرَةً عَنْ فُلَان</p>
        <p className="dua-tr">Ляббайка-Ллахумма ʿумратан ʿан {name || '(имя)'}.</p>
        <p className="dua-ru">Вот я перед Тобой, о Аллах, с умрой за {name || '(имя)'}. Вместо «фулян» называется имя.</p>
      </div>
      <small className="pp-tip">Детали различаются по мазхабам: уточни у своего имама.</small>
    </details>
  );
}

const MADINAH: { t: string; s: string; body: string; ar?: string; tr?: string; ru?: string; src?: string }[] = [
  { t: 'Мечеть Пророка ﷺ', s: 'Намаз там лучше тысячи', body: 'Входи с правой ноги с дуа входа в мечеть и соверши 2 ракаата приветствия. Намаз в этой мечети лучше тысячи намазов в других, кроме Масджид аль-Харам (аль-Бухари, 1190; Муслим, 1394). Поездка в Медину не часть умры, но это сунна и большая награда.' },
  { t: 'Равда', s: 'Только по записи в Nusuk', body: 'Место между домом Пророка ﷺ и его минбаром: «сад из садов Рая» (аль-Бухари, 1196). Пускают по времени из приложения Nusuk, отдельно братьев и сестёр. Не толкайся, сделай 2 ракаата и дуа, уступи место следующим.' },
  { t: 'Приветствие Пророку ﷺ', s: 'Спокойно, без громкого голоса', body: 'Подойди к могиле Пророка ﷺ, скажи салам, затем Абу Бакру и Умару, да будет доволен ими Аллах. Дуа делай, повернувшись к кибле, проси только у Аллаха.', ar: 'السَّلَامُ عَلَيْكَ يَا رَسُولَ اللَّهِ', tr: 'Ас-саляму ʿаляйка йа Расуль-Аллах.', ru: 'Мир тебе, о Посланник Аллаха.', src: 'так приветствовал Ибн Умар (Муватта Малика)' },
  { t: 'Мечеть Куба', s: 'Награда как за умру', body: 'Первая мечеть в исламе. Пророк ﷺ сказал: «Кто совершил омовение у себя дома, затем пришёл в мечеть Куба и совершил в ней намаз, тому награда как за умру» (Ибн Маджа, 1412; ан-Насаи, 699). Хорошо ехать в субботу утром, как делал Пророк ﷺ.' },
  { t: 'Кладбище аль-Баки', s: 'Сподвижники и семья Пророка ﷺ', body: 'Рядом с мечетью. Здесь похоронены многие сподвижники и жёны Пророка ﷺ. Обычно открыто для братьев после Фаджра и Асра.', ar: 'السَّلَامُ عَلَيْكُمْ أَهْلَ الدِّيَارِ مِنَ الْمُؤْمِنِينَ وَالْمُسْلِمِينَ، وَإِنَّا إِنْ شَاءَ اللَّهُ بِكُمْ لَلَاحِقُونَ، أَسْأَلُ اللَّهَ لَنَا وَلَكُمُ الْعَافِيَةَ', tr: 'Ас-саляму ʿалайкум ахля-д-дияр мина-ль-муʾминина ва-ль-муслимин, ва инна ин шаа-Ллаху бикум ля-ляхикун, асʾалю-Ллаха ляна ва лякуму-ль-ʿафия.', ru: 'Мир вам, жители этих жилищ из верующих и мусульман, и мы, если пожелает Аллах, присоединимся к вам. Прошу у Аллаха благополучия для нас и для вас.', src: 'Муслим, 975' },
  { t: 'Гора Ухуд', s: 'Шахиды Ухуда и Хамза', body: 'Место битвы Ухуд. Пророк ﷺ сказал: «Ухуд это гора, которая любит нас, и мы любим её» (аль-Бухари, 4083). Поприветствуй шахидов, похороненных здесь, вспомни их историю, сделай дуа за них.' },
];

export function MadinahGuide() {
  return (
    <div className="ex-md">
      {MADINAH.map((x) => (
        <details key={x.t} className="pp-card ex-d">
          <summary><b>{x.t}</b><small>{x.s}</small></summary>
          <p>{x.body}</p>
          {x.ar && (
            <div className="h-card dua">
              <p className="ar-dua" lang="ar" dir="rtl">{x.ar}</p>
              <p className="dua-tr">{x.tr}</p>
              <p className="dua-ru">{x.ru}</p>
              <small className="src">{x.src}</small>
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
