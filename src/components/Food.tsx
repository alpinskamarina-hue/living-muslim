import { Fragment, useState } from 'react';
import type { AppState, FoodState, Meal } from '../types';
import { addDays, fromKey, hhmm } from '../dates';
import { prayerTimes } from '../prayer';
import { here } from '../safar';
import { health, hijri, sunnahFast } from '../health';
import { _t, _tj, LOC } from '../i18n';

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void }

export const foodOf = (s: AppState): FoodState => ({ meals: {}, rules: ['sweet'], clean: {}, sunna: {}, weight: {}, ...(s.food ?? {}) });
const patch = (s: AppState, fn: (f: FoodState) => Partial<FoodState>): AppState => { const f = foodOf(s); return { ...s, food: { ...f, ...fn(f) } }; };

const MEALS: { id: Meal; l: string; when: string }[] = [
  { id: 'b', l: _t("Завтрак"), when: _t("после Фаджра") },
  { id: 'l', l: _t("Обед"), when: _t("после Зухра") },
  { id: 'd', l: _t("Ужин"), when: _t("после Магриба") },
];
const FEEL: { v: 1 | 2 | 3; l: string }[] = [{ v: 1, l: _t("Легко") }, { v: 2, l: _t("Нормально") }, { v: 3, l: _t("Переел") }];
export const RULES: { id: string; l: string }[] = [
  { id: 'sweet', l: _t("Без сладкого") },
  { id: 'soda', l: _t("Без газировки") },
  { id: 'fast', l: _t("Без фастфуда") },
  { id: 'late', l: _t("Без еды после Иши") },
  { id: 'snack', l: _t("Без перекусов между едой") },
];
const SUNNA: { id: string; l: string; ar: string; why: string; src: string }[] = [
  { id: 'dates', l: _t("Финики"), ar: 'تمر', why: _t("Кто утром съест семь фиников аджва, тому в тот день не повредит ни яд, ни колдовство."), src: _t("аль-Бухари, 5445; Муслим, 2047") },
  { id: 'honey', l: _t("Мёд"), ar: 'عسل', why: _t("«…в нём исцеление для людей»."), src: _t("Коран, 16:69") },
  { id: 'olive', l: _t("Оливковое масло"), ar: 'زيت', why: _t("Ешьте оливковое масло и умащайтесь им: оно от благословенного дерева."), src: _t("ат-Тирмизи, 1851") },
  { id: 'seed', l: _t("Чёрный тмин"), ar: 'حبة سوداء', why: _t("В чёрном тмине исцеление от всякой болезни, кроме смерти."), src: _t("аль-Бухари, 5688; Муслим, 2215") },
  { id: 'milk', l: _t("Молоко"), ar: 'لبن', why: _t("Выпив молока, Пророк ﷺ говорил: «О Аллах, благослови нас в нём и дай нам больше»."), src: _t("ат-Тирмизи, 3455") },
  { id: 'talbina', l: _t("Тальбина (ячменная каша)"), ar: 'تلبينة', why: _t("Тальбина успокаивает сердце больного и уменьшает печаль."), src: _t("аль-Бухари, 5417") },
];
const DUAS = [
  { t: _t("Перед едой"), ar: 'بِسْمِ اللَّهِ', tr: _t("Бисмиллях."), ru: _t("С именем Аллаха. Ешь правой рукой и с того, что ближе к тебе."), src: _t("аль-Бухари, 5376") },
  { t: _t("Если забыл в начале"), ar: 'بِسْمِ اللَّهِ أَوَّلَهُ وَآخِرَهُ', tr: _t("Бисмилляхи аввалаху ва ахырах."), ru: _t("С именем Аллаха в начале и в конце."), src: _t("Абу Дауд, 3767") },
  { t: _t("После еды"), ar: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا، وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ', tr: _t("Аль-хамду лилляхи-ллязи ат’амани хаза ва разаканихи мин гайри хаулин минни ва ля куввах."), ru: _t("Хвала Аллаху, Который накормил меня этим и наделил этим без какой-либо силы и мощи с моей стороны."), src: _t("Абу Дауд, 4023; ат-Тирмизи, 3458") },
];
const THIRD = { ar: 'فَثُلُثٌ لِطَعَامِهِ، وَثُلُثٌ لِشَرَابِهِ، وَثُلُثٌ لِنَفَسِهِ', ru: _t("Не наполнял человек сосуда хуже, чем желудок. Достаточно сыну Адама нескольких кусков, чтобы поддержать спину. А если без этого никак, то треть для еды, треть для питья и треть для дыхания."), src: _t("ат-Тирмизи, 2380") };
const WD = [_t("вс"), _t("пн"), _t("вт"), _t("ср"), _t("чт"), _t("пт"), _t("сб")];

/** Consecutive days a rule was kept, "never miss twice" style; today counts only when marked. */
function ruleStreak(f: FoodState, rule: string, today: string) {
  let n = f.clean[today]?.includes(rule) ? 1 : 0;
  let miss = 0;
  for (let i = 1; i < 400; i++) {
    const d = addDays(today, -i);
    if (f.clean[d]?.includes(rule)) { n++; miss = 0; } else if (++miss >= 2) break;
  }
  return n;
}

export function fastingInfo(state: AppState, today: string) {
  const t = fromKey(today);
  const h = hijri(t);
  const ramadan = h?.month === 9;
  const fastToday = ramadan || Boolean(health(state).fasts[today]) || Boolean(sunnahFast(t));
  const tomorrow = addDays(today, 1);
  const ht = hijri(fromKey(tomorrow));
  const fastTomorrow = ht?.month === 9 || Boolean(sunnahFast(fromKey(tomorrow)));
  return { ramadan, fastToday, fastTomorrow, why: ramadan ? _t("Рамадан") : sunnahFast(t), whyTomorrow: ht?.month === 9 ? _t("Рамадан") : sunnahFast(fromKey(tomorrow)) };
}

export function Food({ state, update, today, onExit }: Props) {
  const [tab, setTab] = useState<'day' | 'clean' | 'sunna' | 'weight'>('day');
  const f = foodOf(state);
  const day = f.meals[today] ?? {};
  const setMeal = (m: Meal, v: 1 | 2 | 3) => update((s) => patch(s, (x) => {
    const d = { ...(x.meals[today] ?? {}) };
    if (d[m] === v) delete d[m]; else d[m] = v;
    return { meals: { ...x.meals, [today]: d } };
  }));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const over = week.flatMap((d) => MEALS.map((m) => ({ d, m: m.id, v: f.meals[d]?.[m.id] }))).filter((x) => x.v === 3);
  const worst = MEALS.map((m) => ({ m, n: over.filter((x) => x.m === m.id).length })).sort((a, b) => b.n - a.n)[0];
  const fi = fastingInfo(state, today);
  const t = prayerTimes(here(state, today), fromKey(today));
  const t2 = prayerTimes(here(state, addDays(today, 1)), fromKey(addDays(today, 1)));

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Питание")}</b><small>{_t("Мера, сунна и простые отметки, без калорий")}</small></div>
      </div>
      <div className="seg">
        {([['day', _t("День")], ['clean', _t("Без")], ['sunna', _t("Сунна")], ['weight', _t("Вес")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'day' && (
          <>
            {(fi.fastToday || fi.fastTomorrow) && (
              <div className="h-card fast-card">
                {fi.fastToday ? (
                  <>
                    <b>{_tj("🌙 Сегодня {0}", fi.why === _t("Рамадан") ? _t("Рамадан") : _t("желательный пост: {0}", String(fi.why).toLowerCase()))}</b>
                    <small>{_tj("Сухур до Фаджра ({0}), ифтар на Магрибе ({1}). Разговляйся свежими финиками, а если их нет, сухими или водой.", hhmm(t.fajr), hhmm(t.maghrib))}</small>
                    <p className="ar-dua" lang="ar" dir="rtl">ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ</p>
                    <small>{_t("Захаба-з-зама'у ва-бталляти-ль-'урук ва сабата-ль-аджру ин ша'а-Ллах. «Ушла жажда, увлажнились жилы, и награда утвердилась, если пожелает Аллах». Абу Дауд, 2357; ат-Тирмизи, 696")}</small>
                  </>
                ) : (
                  <>
                    <b>{_tj("🌙 Завтра {0}", fi.whyTomorrow === _t("Рамадан") ? _t("Рамадан") : _t("желательный пост: {0}", String(fi.whyTomorrow).toLowerCase()))}</b>
                    <small>{_tj("Сухур до {0}. «Ешьте сухур, ведь в сухуре баракат» (аль-Бухари, 1923).", hhmm(t2.fajr))}</small>
                  </>
                )}
              </div>
            )}
            {MEALS.map((m) => (
              <div key={m.id} className="h-card">
                <div className="meal-h"><b>{m.l}</b><small>{m.when}</small></div>
                <div className="h-q">
                  {FEEL.map((x) => (
                    <button type="button" key={x.v} data-v={x.v} aria-pressed={day[m.id] === x.v} onClick={() => setMeal(m.id, x.v)}>{x.l}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="h-card third">
              <b>{_t("Правило трети")}</b>
              <p className="ar-dua" lang="ar" dir="rtl">{THIRD.ar}</p>
              <small>{THIRD.ru} ({THIRD.src})</small>
            </div>
            <h2 className="sub-h">{_t("Неделя")}</h2>
            <div className="meal-grid">
              <span />{week.map((d) => <small key={d}>{WD[fromKey(d).getDay()]}</small>)}
              {MEALS.map((m) => (
                <Fragment key={m.id}>
                  <small>{m.l.slice(0, 3)}</small>
                  {week.map((d) => <i key={d} data-v={f.meals[d]?.[m.id] ?? 0} />)}
                </Fragment>
              ))}
            </div>
            <p className="q-msg left">{over.length ? _t("За неделю переедал {0} раз, чаще всего: {1}. Попробуй там правило трети.", over.length, worst.m.l.toLowerCase()) : _t("Зелёный: легко, светлый: нормально, золотой: переел.")}</p>
            <h2 className="sub-h">{_t("Адаб еды")}</h2>
            {DUAS.map((d) => (
              <div key={d.t} className="h-card dua">
                <b>{d.t}</b>
                <p className="ar-dua" lang="ar" dir="rtl">{d.ar}</p>
                <p className="dua-tr">{d.tr}</p>
                <p className="dua-ru">{d.ru}</p>
                <small className="src">{d.src}</small>
              </div>
            ))}
            <ul className="rules"><li>{_t("Ешь правой рукой и сидя.")}</li><li>{_t("Бери с того, что ближе к тебе.")}</li><li>{_t("Не порицай еду: нравится, ешь, не нравится, оставь.")}</li><li>{_t("Ешь вместе с семьёй: в совместной еде баракат.")}</li></ul>
          </>
        )}

        {tab === 'clean' && (
          <>
            <p className="q-msg left">{_t("Выбери, от чего отказываешься, и отмечай чистые дни. Как и с привычками, один пропуск не обнуляет серию, два подряд обнуляют.")}</p>
            <div className="choices">
              {RULES.map((r) => (
                <button type="button" key={r.id} aria-pressed={f.rules.includes(r.id)} onClick={() => update((s) => patch(s, (x) => ({ rules: x.rules.includes(r.id) ? x.rules.filter((y) => y !== r.id) : [...x.rules, r.id] })))}>{r.l}</button>
              ))}
            </div>
            {f.rules.map((id) => {
              const r = RULES.find((x) => x.id === id);
              if (!r) return null;
              const kept = f.clean[today]?.includes(id);
              return (
                <div key={id} className="h-card">
                  <div className="meal-h"><b>{r.l}</b><small>{_tj("серия {0} дн.", ruleStreak(f, id, today))}</small></div>
                  <div className="dots7">{week.map((d) => <i key={d} data-on={Boolean(f.clean[d]?.includes(id))} title={d} />)}</div>
                  <button type="button" className={kept ? 'pri-btn' : 'gold-btn'} onClick={() => update((s) => patch(s, (x) => {
                    const l = x.clean[today] ?? [];
                    return { clean: { ...x.clean, [today]: l.includes(id) ? l.filter((y) => y !== id) : [...l, id] } };
                  }))}>{kept ? _t("Сегодня чисто ✓") : _t("Сегодня чисто")}</button>
                </div>
              );
            })}
          </>
        )}

        {tab === 'sunna' && (
          <>
            <p className="q-msg left">{_t("Отмечай, что из продуктов, которые любил Пророк ﷺ, было сегодня.")}</p>
            {SUNNA.map((x) => {
              const on = f.sunna[today]?.includes(x.id);
              const n = week.filter((d) => f.sunna[d]?.includes(x.id)).length;
              return (
                <button type="button" key={x.id} className={`h-card sunna${on ? ' on' : ''}`} onClick={() => update((s) => patch(s, (y) => {
                  const l = y.sunna[today] ?? [];
                  return { sunna: { ...y.sunna, [today]: l.includes(x.id) ? l.filter((z) => z !== x.id) : [...l, x.id] } };
                }))}>
                  <span className="meal-h"><b>{on ? '✓ ' : ''}{x.l} <span className="ar-s">{x.ar}</span></b><small>{_tj("{0} из 7 дней", n)}</small></span>
                  <small>{x.why}</small>
                  <small className="src">{x.src}</small>
                </button>
              );
            })}
            <p className="q-msg left tiny-note">{_t("Если есть болезни или аллергия, посоветуйся с врачом: например, мёд и чёрный тмин подходят не всем.")}</p>
          </>
        )}

        {tab === 'weight' && <Weight state={state} update={update} today={today} />}
      </div>
    </div>
  );
}

function Weight({ state, update, today }: { state: AppState; update: Props['update']; today: string }) {
  const f = foodOf(state);
  const entries = Object.entries(f.weight).sort(([a], [b]) => (a < b ? -1 : 1));
  const last = entries[entries.length - 1];
  const [v, setV] = useState(last ? String(last[1]) : '');
  const recent = entries.slice(-12);
  const min = Math.min(...recent.map(([, w]) => w)), max = Math.max(...recent.map(([, w]) => w));
  const W = 320, H = 120, pad = 16;
  const pts = recent.map(([, w], i) => [pad + (i * (W - 2 * pad)) / Math.max(1, recent.length - 1), H - pad - ((w - min) / Math.max(0.1, max - min)) * (H - 2 * pad)]);
  const due = !last || (fromKey(today).getTime() - fromKey(last[0]).getTime()) / 86400000 >= 6;
  const first = entries[0];
  return (
    <>
      <p className="q-msg left">{_t("Раз в неделю, утром после туалета, до еды. Ежедневные колебания только сбивают.")}</p>
      <div className="h-card h-hero">
        <small>{last ? _t("Последний раз {0}", fromKey(last[0]).toLocaleDateString(LOC, { day: 'numeric', month: 'long' })) : _t("Ещё нет записей")}</small>
        <b className="h-big sm">{last ? _t("{0} кг", String(last[1]).replace('.', ',')) : '—'}</b>
        {first && last && first !== last && <small>{_tj("С начала: {0} кг", (last[1] - first[1] > 0 ? '+' : '') + (last[1] - first[1]).toFixed(1).replace('.', ','))}</small>}
      </div>
      <div className="task-add">
        <input type="number" inputMode="decimal" step="0.1" value={v} onChange={(e) => setV(e.target.value)} placeholder={_t("кг")} />
        <button type="button" className="pri-btn" disabled={!Number(v)} onClick={() => update((s) => patch(s, (x) => ({ weight: { ...x.weight, [today]: Math.round(Number(v) * 10) / 10 } })))}>{due ? _t("Записать") : _t("Обновить сегодня")}</button>
      </div>
      {recent.length > 1 && (
        <svg className="w-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={_t("Вес по неделям")}>
          <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--line)" />
          <polyline fill="none" stroke="var(--green-2)" strokeWidth="2.5" points={pts.map((p) => p.join(',')).join(' ')} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.5 : 3} fill={i === pts.length - 1 ? 'var(--gold)' : 'var(--green-2)'} />)}
          <text x={pad} y={12} fontSize="10" fill="var(--ink-2)">{max.toFixed(1)}</text>
          <text x={pad} y={H - 2} fontSize="10" fill="var(--ink-2)">{min.toFixed(1)}</text>
        </svg>
      )}
    </>
  );
}
