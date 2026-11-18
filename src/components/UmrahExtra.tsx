import { useState } from 'react';
import { _t, _tj } from '../i18n';

// Three more pieces of the umrah screen: when to go, umrah for someone else, and Madinah.

// Average daytime highs in Makkah by month (°C, long-term climate).
const HEAT = [30, 31, 34, 38, 41, 43, 43, 43, 42, 39, 34, 31];
const MON = [_t("янв"), _t("фев"), _t("мар"), _t("апр"), _t("май"), _t("июн"), _t("июл"), _t("авг"), _t("сен"), _t("окт"), _t("ноя"), _t("дек")];
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
      <div className="pp-top"><b>{_t("Когда лучше ехать")}</b><small>{_t("12 месяцев вперёд")}</small></div>
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
          {sel.closed ? _t("сезон хаджа, умра для приезжих обычно приостановлена. Проверь даты в Nusuk.")
            : [
              sel.heat <= 34 ? _t("днём около {0}°, комфортно", sel.heat) : sel.heat <= 39 ? _t("днём около {0}°, жарко", sel.heat) : _t("днём {0}° и выше, очень жарко: обряды ночью", sel.heat),
              sel.ramadan ? _t("Рамадан: умра в Рамадан по награде как хадж (аль-Бухари, 1782), но толпа и цены максимальные, особенно в последние 10 ночей") : '',
              sel.holidays ? _t("школьные каникулы, людей и цены больше") : '',
              !sel.ramadan && !sel.holidays ? _t("спокойнее и дешевле") : '',
            ].filter(Boolean).join('; ') + '.'}
        </p>
      ) : (
        <p className="wg-note">{best.length ? <>{_t("Лучшее время: ")}<b>{best.map((x) => MON[x.m]).join(', ')}</b>{_t(". Прохладнее, без Рамадана и каникул, обычно дешевле.")}</> : _t("Нажми на месяц, чтобы увидеть подробности.")}</p>
      )}
      <small className="pp-tip">{_t("🌙 Рамадан · ⛔ сезон хаджа. Температура средняя многолетняя, даты по календарю Умм аль-Кура.")}</small>
    </div>
  );
}

export function Badal() {
  const [name, setName] = useState('');
  return (
    <details className="pp-card ex-d">
      <summary><b>{_t("Умра за другого (бадаль)")}</b><small>{_t("за умершего или того, кто не может поехать")}</small></summary>
      <p>{_t("Умру можно совершить за умершего родственника или за того, кто сам уже не сможет из-за старости или тяжёлой болезни. Это мнение большинства учёных.")}</p>
      <ul className="rules">
        <li>{_t("Сначала соверши умру за себя. Пророк ﷺ сказал человеку, который делал хадж за Шубруму: «Соверши сначала за себя, потом за Шубруму» (Абу Дауд, 1811).")}</li>
        <li>{_t("Одна умра за одного человека. Намерение делается у миката, обряды те же самые.")}</li>
        <li>{_t("Можно взять за это расходы, но лучше делать ради Аллаха и ради близкого человека.")}</li>
      </ul>
      <label className="field"><span>{_t("За кого")}</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={_t("Например: моя мама Фатима")} /></label>
      <div className="h-card dua">
        <p className="ar-dua" lang="ar" dir="rtl">لَبَّيْكَ اللَّهُمَّ عُمْرَةً عَنْ فُلَان</p>
        <p className="dua-tr">{_tj("Ляббайка-Ллахумма ʿумратан ʿан {0}.", name || _t("(имя)"))}</p>
        <p className="dua-ru">{_tj("Вот я перед Тобой, о Аллах, с умрой за {0}. Вместо «фулян» называется имя.", name || _t("(имя)"))}</p>
      </div>
      <small className="pp-tip">{_t("Детали различаются по мазхабам: уточни у своего имама.")}</small>
    </details>
  );
}

const MADINAH: { t: string; s: string; body: string; ar?: string; tr?: string; ru?: string; src?: string }[] = [
  { t: _t("Мечеть Пророка ﷺ"), s: _t("Намаз там лучше тысячи"), body: _t("Входи с правой ноги с дуа входа в мечеть и соверши 2 ракаата приветствия. Намаз в этой мечети лучше тысячи намазов в других, кроме Масджид аль-Харам (аль-Бухари, 1190; Муслим, 1394). Поездка в Медину не часть умры, но это сунна и большая награда.") },
  { t: _t("Равда"), s: _t("Только по записи в Nusuk"), body: _t("Место между домом Пророка ﷺ и его минбаром: «сад из садов Рая» (аль-Бухари, 1196). Пускают по времени из приложения Nusuk, отдельно братьев и сестёр. Не толкайся, сделай 2 ракаата и дуа, уступи место следующим.") },
  { t: _t("Приветствие Пророку ﷺ"), s: _t("Спокойно, без громкого голоса"), body: _t("Подойди к могиле Пророка ﷺ, скажи салам, затем Абу Бакру и Умару, да будет доволен ими Аллах. Дуа делай, повернувшись к кибле, проси только у Аллаха."), ar: 'السَّلَامُ عَلَيْكَ يَا رَسُولَ اللَّهِ', tr: _t("Ас-саляму ʿаляйка йа Расуль-Аллах."), ru: _t("Мир тебе, о Посланник Аллаха."), src: _t("так приветствовал Ибн Умар (Муватта Малика)") },
  { t: _t("Мечеть Куба"), s: _t("Награда как за умру"), body: _t("Первая мечеть в исламе. Пророк ﷺ сказал: «Кто совершил омовение у себя дома, затем пришёл в мечеть Куба и совершил в ней намаз, тому награда как за умру» (Ибн Маджа, 1412; ан-Насаи, 699). Хорошо ехать в субботу утром, как делал Пророк ﷺ.") },
  { t: _t("Кладбище аль-Баки"), s: _t("Сподвижники и семья Пророка ﷺ"), body: _t("Рядом с мечетью. Здесь похоронены многие сподвижники и жёны Пророка ﷺ. Обычно открыто для братьев после Фаджра и Асра."), ar: 'السَّلَامُ عَلَيْكُمْ أَهْلَ الدِّيَارِ مِنَ الْمُؤْمِنِينَ وَالْمُسْلِمِينَ، وَإِنَّا إِنْ شَاءَ اللَّهُ بِكُمْ لَلَاحِقُونَ، أَسْأَلُ اللَّهَ لَنَا وَلَكُمُ الْعَافِيَةَ', tr: _t("Ас-саляму ʿалайкум ахля-д-дияр мина-ль-муʾминина ва-ль-муслимин, ва инна ин шаа-Ллаху бикум ля-ляхикун, асʾалю-Ллаха ляна ва лякуму-ль-ʿафия."), ru: _t("Мир вам, жители этих жилищ из верующих и мусульман, и мы, если пожелает Аллах, присоединимся к вам. Прошу у Аллаха благополучия для нас и для вас."), src: _t("Муслим, 975") },
  { t: _t("Гора Ухуд"), s: _t("Шахиды Ухуда и Хамза"), body: _t("Место битвы Ухуд. Пророк ﷺ сказал: «Ухуд это гора, которая любит нас, и мы любим её» (аль-Бухари, 4083). Поприветствуй шахидов, похороненных здесь, вспомни их историю, сделай дуа за них.") },
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
