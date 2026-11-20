import { Fragment, useState } from 'react';
import { PIcon } from './PIcon';
import type { AppState, FoodState, Meal } from '../types';
import { addDays, fromKey, hhmm } from '../dates';
import { prayerTimes } from '../prayer';
import { here } from '../safar';
import { health, hijri, patchHealth, sunnahFast } from '../health';
import { _t, _tj, LOC } from '../i18n';

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void; onHealth?: () => void }

export const foodOf = (s: AppState): FoodState => ({ meals: {}, rules: ['sweet'], clean: {}, sunna: {}, weight: {}, ...(s.food ?? {}) });
const patch = (s: AppState, fn: (f: FoodState) => Partial<FoodState>): AppState => { const f = foodOf(s); return { ...s, food: { ...f, ...fn(f) } }; };

const MEALS: { id: Meal; l: string; when: string; ic: string; meal: string }[] = [
  { id: 'b', l: _t("Утро"), when: _t("после Фаджра"), ic: 'sunrise', meal: _t("завтрак") },
  { id: 'l', l: _t("День"), when: _t("после Зухра"), ic: 'sun', meal: _t("обед") },
  { id: 'd', l: _t("Вечер"), when: _t("после Магриба"), ic: 'moon', meal: _t("ужин") },
];
/** One short line a day at the top instead of the big hadith toast. */
const WORDS = [
  { k: _t("Хадис"), t: _t("Треть для еды, треть для питья, треть для дыхания"), src: _t("ат-Тирмизи, 2380") },
  { k: _t("Аят"), t: _t("Ешьте и пейте, но не излишествуйте"), src: _t("Коран, 7:31") },
  { k: _t("Хадис"), t: _t("Скажи «Бисмиллях», ешь правой рукой и из того, что перед тобой"), src: _t("аль-Бухари, 5376") },
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

export const ruleLabel = (f: FoodState, id: string) => RULES.find((x) => x.id === id)?.l ?? f.own?.find((x) => x.id === id)?.l;
const times = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? _t("раз") : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? _t("раза") : _t("раз"));

export function Food({ state, update, today, onExit, onHealth }: Props) {
  const [tab, setTab] = useState<'day' | 'clean' | 'sunna' | 'weight' | 'adab'>('day');
  const [pick, setPick] = useState<Meal | null>(null);
  const [duaOpen, setDuaOpen] = useState(false);
  const [wordHidden, setWordHidden] = useState(() => { try { return localStorage.getItem('lm.foodWord') === today; } catch { return false; } });
  const f = foodOf(state);
  const day = f.meals[today] ?? {};
  const setMeal = (m: Meal, v: 1 | 2 | 3 | 0) => update((s) => patch(s, (x) => {
    const d = { ...(x.meals[today] ?? {}) };
    if (!v || d[m] === v) delete d[m]; else d[m] = v;
    return { meals: { ...x.meals, [today]: d } };
  }));
  const toggleClean = (id: string) => update((s) => patch(s, (x) => {
    const l = x.clean[today] ?? [];
    return { clean: { ...x.clean, [today]: l.includes(id) ? l.filter((y) => y !== id) : [...l, id] } };
  }));
  const toggleSunna = (id: string) => update((s) => patch(s, (y) => {
    const l = y.sunna[today] ?? [];
    return { sunna: { ...y.sunna, [today]: l.includes(id) ? l.filter((z) => z !== id) : [...l, id] } };
  }));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const over = week.flatMap((d) => MEALS.map((m) => ({ d, m: m.id, v: f.meals[d]?.[m.id] }))).filter((x) => x.v === 3);
  const worst = MEALS.map((m) => ({ m, n: over.filter((x) => x.m === m.id).length })).sort((a, b) => b.n - a.n)[0];
  const fi = fastingInfo(state, today);
  const t = prayerTimes(here(state, today), fromKey(today));
  const t2 = prayerTimes(here(state, addDays(today, 1)), fromKey(addDays(today, 1)));
  const fasting = fi.ramadan || Boolean(health(state).fasts[today]);
  const setFast = (on: boolean) => update((s) => patchHealth(s, (h) => { const x = { ...h.fasts }; if (on) x[today] = true; else delete x[today]; return { fasts: x }; }));
  const now = new Date();
  const slots = fasting
    ? [{ ...MEALS[0], l: _t("Сухур"), when: _tj("до {0}", hhmm(t.fajr)), meal: _t("сухур") }, { ...MEALS[2], l: _t("Ифтар"), when: _tj("в {0}, на Магрибе", hhmm(t.maghrib)), meal: _t("ифтар") }]
    : MEALS;
  const cur: Meal = fasting ? (now < t.fajr ? 'b' : 'd') : now < t.dhuhr ? 'b' : now < t.maghrib ? 'l' : 'd';
  const doneN = slots.filter((m) => day[m.id]).length;
  const toIftar = Math.round((t.maghrib.getTime() - now.getTime()) / 60000);
  const word = WORDS[fromKey(today).getDate() % WORDS.length];
  const wd = WD[fromKey(today).getDay()];
  const [own, setOwn] = useState<string | null>(null);
  const addOwn = () => {
    const l = (own ?? '').trim();
    if (!l) { setOwn(null); return; }
    const id = `own-${Date.now().toString(36)}`;
    update((s) => patch(s, (x) => ({ own: [...(x.own ?? []), { id, l }], rules: [...x.rules, id] })));
    setOwn(null);
  };
  const allRules = [...RULES, ...(f.own ?? [])];

  const weekGrid = (
    <div className="h-card fd-card fd-week">
      <div className="meal-h"><b>{_t("Неделя")}</b><small>{_t("как ел")}</small></div>
      <div className="meal-grid">
        <span />{week.map((d) => <small key={d} className={d === today ? 'on' : ''}>{WD[fromKey(d).getDay()]}</small>)}
        {MEALS.map((m) => (
          <Fragment key={m.id}>
            <small className="lb">{m.l}</small>
            {week.map((d) => <i key={d} data-v={f.meals[d]?.[m.id] ?? 0} />)}
          </Fragment>
        ))}
      </div>
      <div className="fd-legend"><span><em data-v="1" />{_t("легко")}</span><span><em data-v="2" />{_t("нормально")}</span><span><em data-v="3" />{_t("переел")}</span><span><em data-v="0" />{_t("нет отметки")}</span></div>
      {over.length > 0 && <p className="fd-tip">{_tj("За неделю переедал {0} {1}, чаще всего: {2}. Попробуй там правило трети.", over.length, times(over.length), worst.m.meal)}</p>}
    </div>
  );

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Питание")}</b><small>{_t("Без калорий")}</small></div>
        {onHealth && <div className="fsw"><button type="button" onClick={onHealth}>{_t("Здоровье")}</button><button type="button" aria-pressed="true">{_t("Питание")}</button></div>}
      </div>
      {!wordHidden && (
        <div className="fd-word"><b>{word.k}</b><span>{word.t} <small>({word.src})</small></span>
          <button type="button" aria-label={_t("Скрыть")} onClick={() => { setWordHidden(true); try { localStorage.setItem('lm.foodWord', today); } catch { /* */ } }}>✕</button>
        </div>
      )}
      <div className="seg fd-seg">
        {([['day', _t("День")], ['clean', _t("Отказ")], ['sunna', _t("Сунна")], ['weight', _t("Вес")], ['adab', _t("Адаб")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'day' && (
          <>
            <div className="h-card fd-card fd-today">
              <div className="meal-h"><b>{fasting ? _tj("Сегодня пост · {0}", wd) : _tj("Сегодня, {0}", wd)}</b><small>{fasting && toIftar > 0 ? _tj("до ифтара {0}", toIftar >= 60 ? _tj("{0} ч {1} мин", Math.floor(toIftar / 60), toIftar % 60) : _tj("{0} мин", toIftar)) : _tj("{0} из {1}", doneN, slots.length)}</small></div>
              <div className={`fd-meals n${slots.length}`}>
                {slots.map((m) => {
                  const v = day[m.id];
                  return (
                    <button key={m.id} type="button" className={pick === m.id ? 'open' : ''} aria-expanded={pick === m.id} onClick={() => setPick(pick === m.id ? null : m.id)}>
                      <PIcon k={m.ic} ball cls={v ? 'has' : m.id === cur ? 'off now' : 'off'} />
                      {v ? <u className="fd-ok">✓</u> : null}
                      <b>{m.l}</b>
                      <small data-v={v ?? 0}>{v ? FEEL.find((x) => x.v === v)!.l : m.id === cur ? _tj("отметь {0}", m.meal) : m.when}</small>
                    </button>
                  );
                })}
              </div>
              {pick && (
                <div className="fd-pick" role="group" aria-label={_t("Как поел")}>
                  {FEEL.map((x) => <button key={x.v} type="button" data-v={x.v} aria-pressed={day[pick] === x.v} onClick={() => { setMeal(pick, x.v); setPick(null); }}>{x.l}</button>)}
                  {day[pick] ? <button type="button" className="clr" onClick={() => { setMeal(pick, 0); setPick(null); }}>{_t("Убрать")}</button> : null}
                </div>
              )}
              {fasting && (
                <div className="fd-row">
                  <span><b>{_t("Дуа ифтара")}</b><small>{_t("Разговляйся свежими финиками, если их нет, сухими или водой")}</small></span>
                  <button type="button" className="link-btn" onClick={() => setDuaOpen(!duaOpen)}>{duaOpen ? _t("Скрыть") : _t("Открыть ›")}</button>
                </div>
              )}
              {fasting && duaOpen && (
                <div className="fd-dua">
                  <p className="ar-dua" lang="ar" dir="rtl">ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ</p>
                  <small>{_t("Захаба-з-зама'у ва-бталляти-ль-'урук ва сабата-ль-аджру ин ша'а-Ллах. «Ушла жажда, увлажнились жилы, и награда утвердилась, если пожелает Аллах». Абу Дауд, 2357; ат-Тирмизи, 696")}</small>
                </div>
              )}
              {fi.ramadan ? (
                <div className="fd-row"><PIcon k="moon" cls="sm" /><span><b>{_t("Рамадан")}</b><small>{_tj("Сухур до {0} · ифтар в {1}", hhmm(t.fajr), hhmm(t.maghrib))}</small></span></div>
              ) : (
                <label className="fd-row">
                  <PIcon k="moon" cls="sm" />
                  <span><b>{fi.why && !fasting ? _tj("Желательный пост: {0}", String(fi.why).toLowerCase()) : _t("Я сегодня пощусь")}</b>
                    <small>{fasting ? _tj("Сухур до {0} · ифтар в {1}", hhmm(t.fajr), hhmm(t.maghrib)) : fi.fastTomorrow ? _tj("Завтра {0}: сухур до {1}", String(fi.whyTomorrow).toLowerCase(), hhmm(t2.fajr)) : _t("Сунна или возмещение: включи, и вместо трёх приёмов будут сухур и ифтар")}</small></span>
                  <input type="checkbox" className="tog" checked={fasting} onChange={(e) => setFast(e.target.checked)} aria-label={_t("Я сегодня пощусь")} />
                </label>
              )}
            </div>

            <div className="h-card fd-card">
              <div className="meal-h"><b>{_t("Отказ сегодня")}</b><button type="button" className="link-btn" onClick={() => setTab('clean')}>{f.rules.length ? _t("Все ›") : _t("Выбрать ›")}</button></div>
              {f.rules.length === 0 && <small className="fd-muted">{_t("Выбери, от чего отказываешься: сладкое, газировка, еда после Иши или своё.")}</small>}
              {f.rules.map((id) => {
                const l = ruleLabel(f, id); if (!l) return null;
                const kept = f.clean[today]?.includes(id);
                const n = ruleStreak(f, id, today);
                return (
                  <div key={id} className="fd-row">
                    <PIcon k="ban" cls="sm" />
                    <span><b>{l}</b><small>{n ? _tj("серия {0} дн.", n) : _t("начни серию сегодня")}</small></span>
                    <button type="button" className={kept ? 'fd-btn done' : 'fd-btn'} aria-pressed={kept} onClick={() => toggleClean(id)}>{kept ? _t("✓ Чисто") : _t("Чисто")}</button>
                  </div>
                );
              })}
            </div>

            <div className="h-card fd-card">
              <div className="meal-h"><b>{_t("Сунна сегодня")}</b><button type="button" className="link-btn" onClick={() => setTab('sunna')}>{_t("Все ›")}</button></div>
              <div className="choices">
                {SUNNA.map((x) => { const on = f.sunna[today]?.includes(x.id); return <button key={x.id} type="button" aria-pressed={on} onClick={() => toggleSunna(x.id)}>{on ? '✓ ' : ''}{x.l}</button>; })}
              </div>
            </div>

            {weekGrid}
          </>
        )}

        {tab === 'clean' && (
          <>
            <p className="q-msg left">{_t("Выбери, от чего отказываешься, и отмечай чистые дни. Один пропуск не обнуляет серию, два подряд обнуляют.")}</p>
            <div className="choices">
              {allRules.map((r) => (
                <button type="button" key={r.id} aria-pressed={f.rules.includes(r.id)} onClick={() => update((s) => patch(s, (x) => ({ rules: x.rules.includes(r.id) ? x.rules.filter((y) => y !== r.id) : [...x.rules, r.id] })))}>{r.l}</button>
              ))}
              {own === null && <button type="button" className="fd-add" onClick={() => setOwn('')}>{_t("＋ своё")}</button>}
            </div>
            {own !== null && (
              <div className="task-add">
                <input autoFocus value={own} maxLength={40} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOwn(); }} placeholder={_t("Например: без хлеба на ночь")} />
                <button type="button" className="pri-btn" onClick={addOwn}>{_t("Добавить")}</button>
              </div>
            )}
            {f.rules.map((id) => {
              const l = ruleLabel(f, id);
              if (!l) return null;
              const kept = f.clean[today]?.includes(id);
              return (
                <div key={id} className="h-card">
                  <div className="meal-h"><b>{l}</b><small>{_tj("серия {0} дн.", ruleStreak(f, id, today))}</small></div>
                  <div className="fd-days">{week.map((d) => <span key={d}><small className={d === today ? 'on' : ''}>{WD[fromKey(d).getDay()]}</small><i data-on={Boolean(f.clean[d]?.includes(id))} /></span>)}</div>
                  <button type="button" className={kept ? 'pri-btn' : 'gold-btn'} onClick={() => toggleClean(id)}>{kept ? _t("Сегодня чисто ✓") : _t("Сегодня чисто")}</button>
                  {id.startsWith('own-') && <button type="button" className="link-btn fd-del" onClick={() => update((s) => patch(s, (x) => ({ own: (x.own ?? []).filter((o) => o.id !== id), rules: x.rules.filter((r) => r !== id) })))}>{_t("Убрать своё правило")}</button>}
                </div>
              );
            })}
          </>
        )}

        {tab === 'sunna' && <SunnaList f={f} today={today} week={week} toggle={toggleSunna} />}

        {tab === 'weight' && <Weight state={state} update={update} today={today} />}

        {tab === 'adab' && (
          <>
            <div className="h-card third">
              <b>{_t("Правило трети")}</b>
              <p className="ar-dua" lang="ar" dir="rtl">{THIRD.ar}</p>
              <small>{THIRD.ru} ({THIRD.src})</small>
            </div>
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
      </div>
    </div>
  );
}

function SunnaList({ f, today, week, toggle }: { f: FoodState; today: string; week: string[]; toggle: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <p className="q-msg left">{_t("Отмечай, что из продуктов, которые любил Пророк ﷺ, было сегодня. Нажми на название, чтобы прочитать хадис.")}</p>
      <div className="h-card fd-card fd-list">
        {SUNNA.map((x) => {
          const on = Boolean(f.sunna[today]?.includes(x.id));
          const n = week.filter((d) => f.sunna[d]?.includes(x.id)).length;
          return (
            <div key={x.id} className="fd-sn">
              <div className="fd-row">
                <button type="button" className={`fd-chk${on ? ' on' : ''}`} aria-pressed={on} aria-label={x.l} onClick={() => toggle(x.id)}>✓</button>
                <button type="button" className="fd-snt" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>
                  <b>{x.l} <span className="ar-s">{x.ar}</span></b><small>{_tj("{0} из 7 дней", n)}</small>
                </button>
                <em>{open === x.id ? '▾' : '›'}</em>
              </div>
              {open === x.id && <p className="fd-why">{x.why} <small className="src">{x.src}</small></p>}
            </div>
          );
        })}
      </div>
      <p className="q-msg left tiny-note">{_t("Если есть болезни или аллергия, посоветуйся с врачом: например, мёд и чёрный тмин подходят не всем.")}</p>
    </>
  );
}

function Weight({ state, update, today }: { state: AppState; update: Props['update']; today: string }) {
  const f = foodOf(state);
  const entries = Object.entries(f.weight).sort(([a], [b]) => (a < b ? -1 : 1));
  const last = entries[entries.length - 1];
  const [v, setV] = useState('');
  const [g, setG] = useState(f.goal ? String(f.goal) : '');
  const [goalEdit, setGoalEdit] = useState(false);
  const kg = (n: number) => n.toFixed(1).replace('.', ',');
  const recent = entries.slice(-12);
  const vals = [...recent.map(([, x]) => x), ...(f.goal ? [f.goal] : [])];
  const min = Math.min(...vals), max = Math.max(...vals);
  const W = 320, H = 130, pad = 18, bottom = 22;
  const y = (x: number) => H - bottom - ((x - min) / Math.max(0.1, max - min)) * (H - bottom - pad);
  const pts = recent.map(([, x], i) => [pad + (i * (W - 2 * pad)) / Math.max(1, recent.length - 1), y(x)]);
  const due = !last || (fromKey(today).getTime() - fromKey(last[0]).getTime()) / 86400000 >= 6;
  const first = entries[0];
  const dl = (d: string) => fromKey(d).toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
  const num = (x: string) => Number(x.replace(',', '.'));
  const save = () => { const n = num(v); if (!(n > 20 && n < 400)) return; update((s) => patch(s, (x) => ({ weight: { ...x.weight, [today]: Math.round(n * 10) / 10 } }))); setV(''); };
  const left = f.goal && last ? last[1] - f.goal : null;
  return (
    <>
      <p className="q-msg left">{_t("Раз в неделю, утром после туалета, до еды. Ежедневные колебания только сбивают.")}</p>
      <div className="h-card h-hero">
        <small>{last ? _t("Последний раз {0}", fromKey(last[0]).toLocaleDateString(LOC, { day: 'numeric', month: 'long' })) : _t("Ещё нет записей")}</small>
        <b className="h-big sm">{last ? _t("{0} кг", kg(last[1])) : '—'}</b>
        {first && last && first !== last && <small>{_tj("С начала: {0} кг", (last[1] - first[1] > 0 ? '+' : '') + kg(last[1] - first[1]))}</small>}
        {left !== null && <small>{Math.abs(left) < 0.05 ? _t("Цель достигнута, МашаАллах") : _tj("До цели {0} кг", kg(Math.abs(left)))}</small>}
      </div>
      <div className="task-add">
        <input type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder={due ? _t("Сегодняшний вес, кг") : _t("Поправить сегодняшний, кг")} aria-label={_t("Вес, кг")} />
        <button type="button" className="pri-btn" disabled={!(num(v) > 20 && num(v) < 400)} onClick={save}>{_t("Записать")}</button>
      </div>
      {goalEdit ? (
        <div className="task-add">
          <input type="text" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} placeholder={_t("Цель, кг")} aria-label={_t("Цель, кг")} />
          <button type="button" className="pri-btn" onClick={() => { const n = num(g); update((s) => patch(s, () => ({ goal: n > 20 && n < 400 ? Math.round(n * 10) / 10 : undefined }))); setGoalEdit(false); }}>{_t("Сохранить")}</button>
        </div>
      ) : (
        <button type="button" className="link-btn fd-goal" onClick={() => setGoalEdit(true)}>{f.goal ? _tj("Цель: {0} кг · изменить", kg(f.goal)) : _t("＋ Поставить цель по весу (по желанию)")}</button>
      )}
      {recent.length > 1 && (
        <svg className="w-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={_t("Вес по неделям")}>
          <line x1={pad} x2={W - pad} y1={H - bottom} y2={H - bottom} stroke="var(--line)" />
          {f.goal ? <><line x1={pad} x2={W - pad} y1={y(f.goal)} y2={y(f.goal)} stroke="var(--gold)" strokeDasharray="4 4" /><text x={W - pad} y={y(f.goal) - 4} fontSize="10" textAnchor="end" fill="var(--gold)">{_tj("цель {0}", kg(f.goal))}</text></> : null}
          <polyline fill="none" stroke="var(--green-2)" strokeWidth="2.5" points={pts.map((p) => p.join(',')).join(' ')} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.5 : 3} fill={i === pts.length - 1 ? 'var(--gold)' : 'var(--green-2)'} />)}
          <text x={pts[0][0]} y={pts[0][1] - 7} fontSize="10" fill="var(--ink-2)">{kg(recent[0][1])}</text>
          <text x={pts[pts.length - 1][0]} y={pts[pts.length - 1][1] - 8} fontSize="10" textAnchor="end" fill="var(--ink)">{kg(recent[recent.length - 1][1])}</text>
          <text x={pad} y={H - 6} fontSize="10" fill="var(--ink-2)">{dl(recent[0][0])}</text>
          <text x={W - pad} y={H - 6} fontSize="10" textAnchor="end" fill="var(--ink-2)">{dl(recent[recent.length - 1][0])}</text>
        </svg>
      )}
    </>
  );
}
