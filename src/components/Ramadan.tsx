import { useEffect, useState } from 'react';
import { ayahIndex } from '../goals';
import type { AppState, FastMark, RamadanPush, RDua, ReminderPrefs } from '../types';
import { addDays, fromKey, hhmm } from '../dates';
import { type DayTimes, prayerTimes } from '../prayer';
import { here } from '../safar';
import { health, patchHealth } from '../health';
import { sadaqaOf, ramadanPlan } from './Sadaqa';
import { uid } from '../store';
import type { Anchor, Habit, Sphere } from '../types';
import { EID_SUNNA, IFTAR_DUA, MISSED, QADR_DUA, TAKBIR, debt, hOf, khatmProgress, lastThird, nightOf, patchR, ramadanDay, ramadanMonth, ramadanOf, shawwalCount } from '../ramadan';
import { RAMADAN_30 } from '../ramadan30';
import { FAST_FAQ } from '../fiqh';
import { Zakat } from './Zakat';
import { type Lang, durL, langOf, nw, tr } from '../i18n';
import { loadQuran } from './Quran';
import { rpushOf } from '../push';
import { isCloud } from '../cloud';

type Update = (fn: (s: AppState) => AppState) => void;
type Tab = 'prep' | 'day' | 'fast' | 'quran' | 'nights' | 'eid';
const fmtDay = (l: Lang, k: string) => fromKey(k).toLocaleDateString(l === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' });
const missL = (l: Lang, m?: FastMark) => { const x = MISSED.find((y) => y.id === m); return x ? (l === 'en' ? x.en : x.l) : ''; };

const toggleNight = (key: string, what: string): ((s: AppState) => AppState) => (s) => patchR(s, (r) => {
  const l = r.nights[key] ?? [];
  return { nights: { ...r.nights, [key]: l.includes(what) ? l.filter((x) => x !== what) : [...l, what] } };
});
const setFast = (key: string, m: FastMark | null): ((s: AppState) => AppState) => (s) => patchR(s, (r) => {
  const f = { ...r.fasts };
  if (m) f[key] = m; else delete f[key];
  return { fasts: f };
});
const toggleShawwal = (key: string): ((s: AppState) => AppState) => (s) => patchHealth(s, (h) => {
  const f = { ...h.fasts };
  if (f[key]) delete f[key]; else f[key] = true;
  return { fasts: f };
});
const toggleDeed = (year: number, day: number): ((s: AppState) => AppState) => (s) => patchR(s, (r) => {
  const l = r.deeds?.[String(year)] ?? [];
  return { deeds: { ...(r.deeds ?? {}), [String(year)]: l.includes(day) ? l.filter((x) => x !== day) : [...l, day] } };
});

/** Card on the Today screen: during Ramadan, on the eve of it, on Eid and through Shawwal. */
export function RamadanToday({ state, update, today, now, times, onOpen }: { state: AppState; update: Update; today: string; now: Date; times: DayTimes; onOpen: (tab?: Tab) => void }) {
  const l = langOf(state);
  const t = tr(l);
  const r = ramadanOf(state);
  const day = ramadanDay(today);
  const tomorrow = addDays(today, 1);
  const tDay = ramadanDay(tomorrow);
  const h = hOf(today);
  const night = nightOf(today);
  const tn = r.nights[today] ?? [];

  if (h?.month === 10 && h.day === 1) {
    const paid = r.fitr.includes(h.year);
    return (
      <div className="rm-card eid">
        <b className="rm-t">{t('Ид мубарак! 🌙', 'Eid Mubarak! 🌙')}</b>
        <p className="ar-dua light" lang="ar" dir="rtl">{TAKBIR.ar}</p>
        <small>{t(TAKBIR.tr, TAKBIR.trEn)}</small>
        {!paid && <button type="button" className="gold-btn" onClick={() => update((s) => patchR(s, (x) => ({ fitr: [...x.fitr, h.year] })))}>{t('Отметить: закят аль-фитр отдан', 'Mark zakat al-fitr as given')}</button>}
        <button type="button" className="rm-link" onClick={() => onOpen('eid')}>{t('Сунны Ида и итоги месяца ›', 'Eid sunnahs and your month ›')}</button>
      </div>
    );
  }
  const sh = shawwalCount(state, today);
  if (sh !== null && sh < 6) {
    const on = Boolean(health(state).fasts[today]);
    return (
      <div className="rm-card soft">
        <div className="meal-h"><b>{t('6 дней Шавваля', 'Six days of Shawwal')}</b><small>{t(`${sh} из 6`, `${sh} of 6`)}</small></div>
        <small>{t('«Кто постился в Рамадан, а потом добавил шесть дней Шавваля, будто постился весь год». Муслим, 1164', '"Whoever fasts Ramadan and follows it with six days of Shawwal, it is as if they fasted the whole year." Muslim, 1164')}</small>
        <button type="button" className={on ? 'pri-btn' : 'gold-btn'} onClick={() => update(toggleShawwal(today))}>{on ? t('Сегодня пощусь ✓', 'Fasting today ✓') : t('Сегодня пощусь', 'I am fasting today')}</button>
      </div>
    );
  }
  if (h?.month === 8 && tDay !== 1) {
    const mon = ramadanMonth(today);
    const pr = prepDone(state, mon.year).length;
    return (
      <button type="button" className="rm-card soft rm-btn" onClick={() => onOpen('prep')}>
        <div className="meal-h"><b>🌙 {t(`До Рамадана ${mon.daysTo} дн.`, `${nw(l, mon.daysTo, ['', '', ''], ['day', 'days'])} to Ramadan`)}</b><small>{t(`подготовка ${pr} из ${PREP.length} ›`, `ready ${pr} of ${PREP.length} ›`)}</small></div>
        <small>{t('Шаабан: время возместить долги постов, разогнать Коран и решить, какие привычки взять в Рамадан.', 'Sha‘ban: time to make up missed fasts, build up your Quran reading and decide which habits to take into Ramadan.')}</small>
      </button>
    );
  }
  if (!day && tDay !== 1) return null;

  const tt = prayerTimes(here(state, tomorrow), fromKey(tomorrow));
  let line: string, sub: string;
  if (day && now < times.fajr) { line = t(`Сухур до ${hhmm(times.fajr)}`, `Suhoor until ${hhmm(times.fajr)}`); sub = t(`осталось ${durL(l, times.fajr.getTime() - now.getTime())}`, `${durL(l, times.fajr.getTime() - now.getTime())} left`); }
  else if (day && now < times.maghrib) { line = t(`Ифтар в ${hhmm(times.maghrib)}`, `Iftar at ${hhmm(times.maghrib)}`); sub = t(`через ${durL(l, times.maghrib.getTime() - now.getTime())}`, `in ${durL(l, times.maghrib.getTime() - now.getTime())}`); }
  else if (tDay) { line = t(`Сухур завтра до ${hhmm(tt.fajr)}`, `Suhoor tomorrow until ${hhmm(tt.fajr)}`); sub = tDay === 1 ? t('Завтра первый день поста', 'Tomorrow is the first fast') : t('Не забудь намерение на завтрашний пост', 'Remember your intention for tomorrow’s fast'); }
  else { line = t('Завтра Ид аль-Фитр', 'Eid al-Fitr is tomorrow'); sub = t('Закят аль-фитр нужно отдать до праздничного намаза', 'Give zakat al-fitr before the Eid prayer'); }
  const mark = day ? r.fasts[today] : undefined;
  const kp = day ? khatmProgress(state, r, day) : null;
  const afterMaghrib = now >= times.maghrib;
  const iftarSoon = day && !afterMaghrib && times.maghrib.getTime() - now.getTime() < 45 * 60000;
  const mon = ramadanMonth(today);
  const pd = day ? RAMADAN_30[day - 1] : null;
  const deedDone = day ? (r.deeds?.[String(mon.year)] ?? []).includes(day) : false;
  const lastTen = night && night >= 21 && night <= 30;

  return (
    <div className="rm-card">
      <div className="rm-head">
        <span>{day ? t(`Рамадан · день ${day} из ${mon.days.length}`, `Ramadan · day ${day} of ${mon.days.length}`) : t('Сегодня первая ночь Рамадана', 'Tonight is the first night of Ramadan')}</span>
        <button type="button" className="rm-link" onClick={() => onOpen()}>{t('Открыть ›', 'Open ›')}</button>
      </div>
      <b className="rm-t">{line}</b>
      <small>{sub}</small>
      {day && <FastLine l={l} now={now} times={times} />}
      {(iftarSoon || (day && afterMaghrib && now.getTime() - times.maghrib.getTime() < 60 * 60000)) && (
        <div className="rm-dua"><p className="ar-dua light" lang="ar" dir="rtl">{IFTAR_DUA.ar}</p><small>{t(IFTAR_DUA.tr, IFTAR_DUA.trEn)} {t(IFTAR_DUA.src, IFTAR_DUA.srcEn)}</small></div>
      )}
      <div className="rm-row">
        {day && (
          <button type="button" className={`rm-chip${mark === 'fast' ? ' on' : ''}`} onClick={() => update(setFast(today, mark === 'fast' ? null : 'fast'))}>{mark === 'fast' ? t('Пощусь ✓', 'Fasting ✓') : t('Пощусь', 'Fasting')}</button>
        )}
        {night && night <= 30 && (
          <button type="button" className={`rm-chip${tn.includes('tarawih') ? ' on' : ''}`} onClick={() => update(toggleNight(today, 'tarawih'))}>{tn.includes('tarawih') ? t('Таравих ✓', 'Tarawih ✓') : t('Таравих', 'Tarawih')}</button>
        )}
        {lastTen && (
          <button type="button" className={`rm-chip${tn.includes('tahajjud') ? ' on' : ''}`} onClick={() => update(toggleNight(today, 'tahajjud'))}>{tn.includes('tahajjud') ? t('Тахаджуд ✓', 'Tahajjud ✓') : t('Тахаджуд', 'Tahajjud')}</button>
        )}
      </div>
      {day && mark && mark !== 'fast' && <small>{t(`Сегодня без поста: ${missL(l, mark).toLowerCase()}. Это видишь только ты.`, `Not fasting today: ${missL(l, mark).toLowerCase()}. Only you can see this.`)}</small>}
      {day && afterMaghrib && (() => { const w = health(state).water[today] ?? 0; const g = health(state).waterGoal; return (
        <div className="rm-water"><small>💧 {t(`Вода до сухура: ${w} из ${g}`, `Water before suhoor: ${w} of ${g}`)}</small><button type="button" className="rm-chip" onClick={() => update((s) => patchHealth(s, (x) => ({ water: { ...x.water, [today]: (x.water[today] ?? 0) + 1 } })))}>{t('+ стакан', '+ glass')}</button></div>
      ); })()}
      {pd && (
        <div className="rm-deed">
          <button type="button" className="rm-link" onClick={() => onOpen('day')}>✨ {t('Дело дня', 'Deed of the day')}: {pd.deed[l === 'en' ? 1 : 0]}</button>
          <button type="button" className={`rm-chip${deedDone ? ' on' : ''}`} onClick={() => update(toggleDeed(mon.year, day!))}>{deedDone ? t('Сделал ✓', 'Done ✓') : t('Сделал', 'Done')}</button>
        </div>
      )}
      {kp && <small className="rm-k">{t(`Коран: ${kp.done} из ${kp.goal} джузов, по плану ${kp.expected}. После каждого намаза примерно ${kp.pagesPerPrayer} стр.`, `Quran: ${kp.done} of ${kp.goal} juz, ${kp.expected} by plan. About ${kp.pagesPerPrayer} pages after each prayer.`)}</small>}
      {lastTen && (
        <button type="button" className="rm-link rm-k" onClick={() => onOpen('nights')}>
          {night! % 2 ? t(`${night}-я ночь, нечётная. Ищи Ляйлят аль-Кадр · план ночи ›`, `Night ${night}, an odd night. Seek Laylat al-Qadr · night plan ›`) : t(`${night}-я ночь из последних десяти · план ночи ›`, `Night ${night} of the last ten · night plan ›`)}
        </button>
      )}
    </div>
  );
}

/** The fasting day as a line: suhoor, Dhuhr, Asr, iftar, tarawih. */
function FastLine({ l, now, times }: { l: Lang; now: Date; times: DayTimes }) {
  const t = tr(l);
  const steps: [string, Date][] = [[t('Сухур', 'Suhoor'), times.fajr], [t('Зухр', 'Dhuhr'), times.dhuhr], [t('Аср', 'Asr'), times.asr], [t('Ифтар', 'Iftar'), times.maghrib], [t('Таравих', 'Tarawih'), times.isha]];
  const next = steps.findIndex(([, d]) => now < d);
  return (
    <div className="rm-line" aria-label={t('День поста', 'The fasting day')}>
      {steps.map(([n, d], i) => (
        <div key={n} className={next === -1 || i < next ? 'done' : i === next ? 'now' : ''}><i /><b>{n}</b><small>{hhmm(d)}</small></div>
      ))}
    </div>
  );
}

export function Ramadan({ state, update, today, onClose, start }: { state: AppState; update: Update; today: string; onClose: () => void; start?: Tab }) {
  const l = langOf(state);
  const t = tr(l);
  const mon = ramadanMonth(today);
  const h = hOf(today);
  const [tab, setTab] = useState<Tab>(start ?? (h?.month === 10 ? 'eid' : mon.state === 'next' ? 'prep' : mon.state === 'now' ? 'day' : 'fast'));
  const sub = mon.state === 'now' ? t(`День ${ramadanDay(today)} из ${mon.days.length}`, `Day ${ramadanDay(today)} of ${mon.days.length}`) : mon.state === 'past' ? t(`Рамадан ${mon.year} прошёл`, `Ramadan ${mon.year} has ended`) : t(`До Рамадана ${mon.daysTo} дн.`, `${nw(l, mon.daysTo, ['', '', ''], ['day', 'days'])} to Ramadan`);
  const setLang = (x: Lang) => update((s) => ({ ...s, settings: { ...s.settings, lang: x } }));
  const tabs: [Tab, string][] = [['prep', t('Старт', 'Prep')], ['day', t('День', 'Today')], ['fast', t('Пост', 'Fast')], ['quran', t('Коран', 'Quran')], ['nights', t('Ночи', 'Nights')], ['eid', t('Ид', 'Eid')]];
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Закрыть', 'Close')}>✕</button>
        <div><b>{t('Рамадан', 'Ramadan')}</b><small>{sub}</small></div>
        <div className="rm-lang" role="group" aria-label={t('Язык', 'Language')}>
          {(['ru', 'en'] as const).map((x) => <button key={x} type="button" aria-pressed={l === x} onClick={() => setLang(x)}>{x.toUpperCase()}</button>)}
        </div>
      </div>
      <div className="seg six">
        {tabs.map(([k, lb]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{lb}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'prep' && <Prep state={state} update={update} today={today} mon={mon} l={l} go={setTab} />}
        {tab === 'day' && <DayTab state={state} update={update} today={today} mon={mon} l={l} go={setTab} />}
        {tab === 'fast' && <Fasts state={state} update={update} today={today} mon={mon} l={l} go={setTab} />}
        {tab === 'quran' && <Khatm state={state} update={update} today={today} mon={mon} l={l} go={setTab} />}
        {tab === 'nights' && <Nights state={state} update={update} today={today} mon={mon} l={l} go={setTab} />}
        {tab === 'eid' && <Eid state={state} update={update} today={today} mon={mon} l={l} go={setTab} />}
      </div>
    </div>
  );
}

type Mon = ReturnType<typeof ramadanMonth>;
interface P { state: AppState; update: Update; today: string; mon: Mon; l: Lang; go: (t: Tab) => void }

/** Ayah text and translation from the app's Quran files. */
function Ayah({ at, l }: { at: [number, number]; l: Lang }) {
  const [v, setV] = useState<{ ar: string; tr: string; name: string } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setV(null); setErr(false);
    loadQuran(l).then((q) => { if (!alive) return; const s = q[at[0] - 1]; const a = s?.[4]?.[at[1] - 1]; if (a) setV({ ar: a[0], tr: a[1], name: s[1] }); else setErr(true); }, () => alive && setErr(true));
    return () => { alive = false; };
  }, [at[0], at[1], l]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = tr(l);
  return (
    <div className="h-card third">
      <small>{t('Аят дня', 'Ayah of the day')}</small>
      {v ? (
        <>
          <p className="ar-dua" lang="ar" dir="rtl">{v.ar}</p>
          <p className="dua-ru">{v.tr}</p>
          <small className="src">{t(`Коран, ${v.name}, ${at[0]}:${at[1]} · перевод смыслов Э. Кулиева`, `Quran, ${v.name}, ${at[0]}:${at[1]} · Saheeh International`)}</small>
        </>
      ) : <small>{err ? t(`Коран, ${at[0]}:${at[1]}. Текст не загрузился, открой его в разделе Коран.`, `Quran ${at[0]}:${at[1]}. The text did not load; open it in the Quran section.`) : t('Загружаю…', 'Loading…')}</small>}
    </div>
  );
}

function DayTab({ state, update, today, mon, l, go }: P) {
  const t = tr(l);
  const i = l === 'en' ? 1 : 0;
  const r = ramadanOf(state);
  const cur = mon.state === 'now' ? ramadanDay(today) ?? 1 : mon.state === 'past' ? 30 : 1;
  const [n, setN] = useState(cur);
  const d = RAMADAN_30[n - 1];
  const done = r.deeds?.[String(mon.year)] ?? [];
  const night = nightOf(today);
  return (
    <>
      {mon.state === 'next' && <p className="q-msg left">{t(`Это программа на 30 дней Рамадана: каждый день аят, хадис, короткий урок и одно доброе дело. Начнётся через ${mon.daysTo} дн., а пока можно посмотреть заранее.`, `This is a 30-day programme for Ramadan: each day an ayah, a hadith, a short lesson and one good deed. It starts in ${nw(l, mon.daysTo, ['', '', ''], ['day', 'days'])}; you can look ahead now.`)}</p>}
      <div className="rm-daynav">
        <button type="button" className="icon-btn" disabled={n <= 1} onClick={() => setN(n - 1)} aria-label={t('Предыдущий день', 'Previous day')}>‹</button>
        <div><small>{t(`День ${n} из 30`, `Day ${n} of 30`)}{n === cur && mon.state === 'now' ? t(' · сегодня', ' · today') : ''}</small><b>{d.theme[i]}</b></div>
        <button type="button" className="icon-btn" disabled={n >= 30} onClick={() => setN(n + 1)} aria-label={t('Следующий день', 'Next day')}>›</button>
      </div>
      {night && night >= 21 && night <= 30 && n === cur && (
        <button type="button" className="h-card rm-tonight" onClick={() => go('nights')}>
          <b>🌙 {night % 2 ? t(`Сегодня ${night}-я ночь, нечётная`, `Tonight is night ${night}, an odd night`) : t(`Сегодня ${night}-я ночь`, `Tonight is night ${night}`)}</b>
          <small>{t('План ночи и твой список дуа ›', 'Night plan and your du‘a list ›')}</small>
        </button>
      )}
      <Ayah at={d.ayah} l={l} />
      <div className="h-card">
        <small>{t('Хадис', 'Hadith')}</small>
        <p className="dua-ru">{d.hadith[l]}</p>
        <small className="src">{d.hadith.src[i]}</small>
      </div>
      <div className="h-card">
        <small>{t('Урок дня', 'Lesson of the day')}</small>
        <p className="rm-lesson">{d.lesson[i]}</p>
      </div>
      <div className={`h-card sunna${done.includes(n) ? ' on' : ''}`}>
        <small>{t('Доброе дело дня', 'Good deed of the day')}</small>
        <b>{d.deed[i]}</b>
        {mon.state !== 'next' && n <= cur && (
          <button type="button" className={done.includes(n) ? 'pri-btn' : 'gold-btn'} onClick={() => update(toggleDeed(mon.year, n))}>{done.includes(n) ? t('Сделал ✓', 'Done ✓') : t('Сделал', 'Done')}</button>
        )}
      </div>
      {mon.state !== 'next' && <p className="q-msg left tiny-note">{t(`Добрых дел за месяц: ${done.length} из 30.`, `Good deeds this month: ${done.length} of 30.`)}</p>}
    </>
  );
}

function Fasts({ state, update, today, mon, l }: P) {
  const t = tr(l);
  const r = ramadanOf(state);
  const [sel, setSel] = useState<string>(mon.days.includes(today) ? today : mon.days.filter((d) => d <= today).slice(-1)[0] ?? '');
  const dbt = debt(r);
  const kept = mon.days.filter((d) => r.fasts[d] === 'fast').length;
  const madeToday = r.qada.includes(today);
  const m = sel ? r.fasts[sel] : undefined;
  const mx = MISSED.find((x) => x.id === m);
  return (
    <>
      {mon.state !== 'next' && (
        <div className="h-card h-hero">
          <small>{t('Постов в этом Рамадане', 'Fasts this Ramadan')}</small>
          <b className="h-big sm">{t(`${kept} из ${mon.days.length}`, `${kept} of ${mon.days.length}`)}</b>
        </div>
      )}
      <div className="rm-grid">
        {mon.days.map((d, i) => {
          const v = r.fasts[d];
          return (
            <button type="button" key={d} disabled={d > today} data-v={v === 'fast' ? 'fast' : v ? 'miss' : ''} aria-pressed={sel === d} onClick={() => setSel(d)}>
              {i + 1}
            </button>
          );
        })}
      </div>
      {mon.state === 'next' && <p className="q-msg left">{t(`Рамадан начнётся примерно ${fmtDay(l, mon.days[0])}, через ${mon.daysTo} дн. Точную дату объявит твоя мечеть. Дни станут доступны по мере наступления.`, `Ramadan should begin around ${fmtDay(l, mon.days[0])}, in ${nw(l, mon.daysTo, ['', '', ''], ['day', 'days'])}. Your mosque will announce the exact date. Days open as they come.`)}</p>}
      {sel && (
        <div className="h-card">
          <div className="meal-h"><b>{t(`${ramadanDay(sel)}-й день`, `Day ${ramadanDay(sel)}`)} · {fmtDay(l, sel)}</b>{m && <button type="button" className="link-btn" onClick={() => update(setFast(sel, null))}>{t('Снять', 'Clear')}</button>}</div>
          <button type="button" className={m === 'fast' ? 'pri-btn' : 'gold-btn'} onClick={() => update(setFast(sel, 'fast'))}>{m === 'fast' ? t('Постился ✓', 'Fasted ✓') : t('Постился', 'Fasted')}</button>
          <small>{t('Если без поста, отметь причину. Её видишь только ты, в Круг она не попадает.', 'If you did not fast, mark the reason. Only you can see it; it never goes to your Circle.')}</small>
          <div className="choices">{MISSED.map((x) => <button type="button" key={x.id} aria-pressed={m === x.id} onClick={() => update(setFast(sel, x.id))}>{l === 'en' ? x.en : x.l}</button>)}</div>
          {mx && <small>{l === 'en' ? mx.noteEn : mx.note}</small>}
        </div>
      )}
      <div className="h-card">
        <div className="meal-h"><b>{t('Долг постов', 'Fasts to make up')}</b><small>{t('за все годы', 'all years')}</small></div>
        {dbt.left || dbt.made ? <b className="h-big sm">{nw(l, dbt.left, ['день', 'дня', 'дней'], ['day', 'days'])}</b> : <small>{t('Долгов нет. Альхамдулиллях.', 'Nothing to make up. Alhamdulillah.')}</small>}
        {dbt.made > 0 && <small>{t(`Возмещено ${dbt.made} из ${dbt.missed}.`, `Made up ${dbt.made} of ${dbt.missed}.`)}</small>}
        {(dbt.left > 0 || madeToday) && !ramadanDay(today) && (
          <button type="button" className={madeToday ? 'pri-btn' : 'gold-btn'} onClick={() => update((s) => patchR(s, (x) => ({ qada: x.qada.includes(today) ? x.qada.filter((d) => d !== today) : [...x.qada, today] })))}>{madeToday ? t('Сегодня возмещаю ✓', 'Making one up today ✓') : t('Сегодня возмещаю пост', 'I am making up a fast today')}</button>
        )}
        <small>{t('«…а кто из вас болен или в пути, пусть постится столько же дней в другое время». Коран, 2:184. Лучше возместить до следующего Рамадана.', '"…and whoever among you is ill or on a journey, then an equal number of other days." Quran 2:184. Best made up before the next Ramadan.')}</small>
        {dbt.fidya > 0 && <small>{t(`Дней на фидью: ${dbt.fidya}. За каждый день кормят одного бедного. Размер уточни в своей мечети.`, `Days for fidyah: ${dbt.fidya}. For each day, feed one poor person. Ask your mosque for the amount.`)}</small>}
      </div>
      {dbt.left > 0 && <QadaPlan state={state} update={update} today={today} l={l} left={dbt.left} />}
      {dbt.fidya > 0 && <Fidya state={state} update={update} l={l} days={dbt.fidya} />}
      <h2 className="sub-h">{t('Вопросы о посте', 'Questions about fasting')}</h2>
      <FastFaq l={l} madhab={state.settings.madhab} />
    </>
  );
}

/** The first day of the next Ramadan after today. */
function nextRamadan(today: string): string | null {
  for (let i = 1; i <= 420; i++) { const d = addDays(today, i); if (ramadanDay(d) === 1) return d; }
  return null;
}

function QadaPlan({ state, update, today, l, left }: { state: AppState; update: Update; today: string; l: Lang; left: number }) {
  const t = tr(l);
  const plan = ramadanOf(state).qadaPlan;
  const per = plan?.perWeek ?? 0;
  const next = nextRamadan(today);
  const end = per ? addDays(today, Math.ceil(left / per) * 7) : null;
  const inTime = end && next ? end < next : true;
  const setPer = (n: number) => update((s) => patchR(s, () => ({ qadaPlan: n ? { perWeek: n, from: today } : null })));
  const days: Record<number, [string, string]> = { 1: ['по понедельникам', 'on Mondays'], 2: ['по понедельникам и четвергам (сунна)', 'on Mondays and Thursdays (sunnah)'], 3: ['пн, чт и в выходной', 'Mon, Thu and one weekend day'], 7: ['подряд, каждый день', 'every day in a row'] };
  return (
    <div className="h-card">
      <div className="meal-h"><b>{t('План возмещения', 'Make-up plan')}</b>{next && <small>{t('Рамадан', 'Ramadan')} ~{fromKey(next).toLocaleDateString(l === 'en' ? 'en-GB' : 'ru-RU', { month: 'short', year: 'numeric' })}</small>}</div>
      <small>{t('Сколько дней в неделю возмещать?', 'How many days a week will you make up?')}</small>
      <div className="choices">
        {[1, 2, 3, 7].map((n) => <button type="button" key={n} aria-pressed={per === n} onClick={() => setPer(per === n ? 0 : n)}>{t(`${n} в нед.`, `${n}/week`)}</button>)}
      </div>
      {per > 0 && end && (
        <small>{t(`Возмещай ${days[per][0]}. Закончишь примерно ${fmtDay(l, end)}`, `Make them up ${days[per][1]}. You will finish around ${fmtDay(l, end)}`)}{next ? (inTime ? t(', до следующего Рамадана ✓', ', before the next Ramadan ✓') : t('. Это позже следующего Рамадана: возьми больше дней в неделю.', '. That is after the next Ramadan: take more days a week.')) : '.'}</small>
      )}
    </div>
  );
}

function Fidya({ state, update, l, days }: { state: AppState; update: Update; l: Lang; days: number }) {
  const t = tr(l);
  const cur = sadaqaOf(state).cur;
  const price = ramadanOf(state).fidyaPrice ?? 0;
  return (
    <div className="h-card">
      <div className="meal-h"><b>{t('Фидья', 'Fidyah')}</b><small>{nw(l, days, ['день', 'дня', 'дней'], ['day', 'days'])}</small></div>
      <label className="field"><span>{t(`Один день, ${cur} (сумму называет мечеть)`, `One day, ${cur} (your mosque gives the amount)`)}</span>
        <input type="number" inputMode="decimal" min="0" step="0.5" value={price || ''} onChange={(e) => update((s) => patchR(s, () => ({ fidyaPrice: Math.max(0, Number(e.target.value) || 0) })))} placeholder={t('например, 10', 'e.g. 10')} />
      </label>
      {price > 0 && <b className="h-big sm">{(Math.round(price * days * 100) / 100).toLocaleString(l === 'en' ? 'en-GB' : 'ru-RU')} {cur}</b>}
      <small>{t('Можно отдать сразу или по мере пропусков. Фидью отдают бедным едой или деньгами.', 'You can give it at once or as the days come. Fidyah goes to the poor as food or money.')}</small>
    </div>
  );
}

function FastFaq({ l, madhab }: { l: Lang; madhab: 'shafi' | 'hanafi' }) {
  const t = tr(l);
  const i = l === 'en' ? 1 : 0;
  return (
    <div className="rm-faq">
      {FAST_FAQ.map((f) => {
        const m = madhab === 'hanafi' ? f.hanafi : f.shafi;
        return (
          <details key={f.q[0]} className="h-card">
            <summary><b>{f.q[i]}</b></summary>
            <p>{f.a[i]}</p>
            {m && <p className="rm-madhab">{m[i]}</p>}
            {f.src && <small className="src">{f.src[i]}</small>}
          </details>
        );
      })}
      <p className="q-msg left tiny-note">{t('Мазхаб берётся из настроек намазов в Профиле. Это короткие ответы на частые случаи; со своим случаем лучше подойти к имаму.', 'The school comes from your prayer settings in Profile. These are short answers for common cases; take your own situation to an imam.')}</p>
    </div>
  );
}

function Khatm({ state, update, today, mon, l }: P) {
  const t = tr(l);
  const r = ramadanOf(state);
  const day = mon.state === 'now' ? ramadanDay(today) ?? 0 : mon.state === 'past' ? 30 : 0;
  const kp = khatmProgress(state, r, day);
  const k = r.khatm;
  const set = (rate: number) => update((s) => patchR(s, (x) => ({ khatm: { rate, startDay: x.khatm?.year === mon.year ? x.khatm.startDay ?? 1 : Math.max(1, day), startIdx: x.khatm?.year === mon.year ? x.khatm.startIdx : (s.quran ? ayahIdx(s) : 0), rounds: x.khatm?.year === mon.year ? x.khatm.rounds : 0, year: mon.year } })));
  const juz = (n: number) => (l === 'en' ? `${n} juz` : `${n} ${n === 1 ? 'джуз' : 'джуза'}`);
  return (
    <>
      <p className="q-msg left">{t('Выбери план на месяц. Норма делится на пять частей, после каждого намаза. Прогресс считается по закладке в разделе Коран.', 'Choose a plan for the month. The daily portion is split into five parts, one after each prayer. Progress follows your bookmark in the Quran section.')}</p>
      <div className="choices">
        {([[0.5, t('Полхатма', 'Half')], [1, t('1 хатм', '1 khatm')], [2, t('2 хатма', '2 khatms')], [3, t('3 хатма', '3 khatms')]] as const).map(([v, lb]) => (
          <button type="button" key={v} aria-pressed={k?.rate === v} onClick={() => set(v)}>{lb}</button>
        ))}
      </div>
      {k && kp && (
        <>
          <div className="h-card h-hero">
            <small>{t('Прочитано с начала плана', 'Read since the plan began')}</small>
            <b className="h-big sm">{t(`${kp.done} из ${kp.goal} джузов`, `${kp.done} of ${kp.goal} juz`)}</b>
            <div className="bar2 wide"><i style={{ width: `${Math.min(100, (kp.done / kp.goal) * 100)}%` }} /></div>
            <small>{day ? t(`По плану к сегодняшнему дню: ${kp.expected}`, `By plan for today: ${kp.expected}`) : t('Счёт пойдёт с первого дня Рамадана', 'Counting starts on the first day of Ramadan')}</small>
            {day > 0 && kp.done < kp.goal && kp.done < kp.expected && <small>{t('Чтобы успеть к концу месяца:', 'To finish by the end of the month:')} {juz(Math.ceil(((kp.goal - kp.done) / Math.max(1, mon.days.length - day + 1)) * 10) / 10)} {t('в день', 'a day')}</small>}
          </div>
          <div className="h-card">
            <b>{t('Каждый день', 'Every day')}</b>
            <small>{t(`${juz(k.rate)} в день, это примерно ${Math.round(k.rate * 20)} страниц. После каждого из пяти намазов около ${kp.pagesPerPrayer} стр.`, `${juz(k.rate)} a day, about ${Math.round(k.rate * 20)} pages. About ${kp.pagesPerPrayer} pages after each of the five prayers.`)}</small>
          </div>
          {kp.nearEnd && (
            <button type="button" className="gold-btn" onClick={() => update((s) => patchR({ ...s, quran: s.quran ? { ...s.quran, surah: 1, ayah: 1 } : s.quran }, (x) => ({ khatm: x.khatm ? { ...x.khatm, rounds: x.khatm.rounds + 1 } : x.khatm })))}>{t('Хатм завершён, начать заново с аль-Фатихи', 'Khatm complete, start again from al-Fatihah')}</button>
          )}
          <button type="button" className="ghost-btn" onClick={() => update((s) => patchR(s, () => ({ khatm: null })))}>{t('Сбросить план', 'Reset plan')}</button>
        </>
      )}
      <p className="q-msg left tiny-note">{t('Читать вместе с братьями и сёстрами можно в Круге: там есть общий хатм, где каждый берёт свои джузы.', 'You can read together with brothers and sisters in the Circle: there is a shared khatm where each person takes their own juz.')}</p>
    </>
  );
}
const ayahIdx = (s: AppState) => (s.quran ? ayahIndex(s.quran.surah, s.quran.ayah) : 0);

/** Night plan steps. tarawih and tahajjud share their marks with the nights grid. */
const PLAN: { id: string; night?: 'tarawih' | 'tahajjud'; t: [string, string]; at?: 'isha' | 'third' | 'fajr' }[] = [
  { id: 'tarawih', night: 'tarawih', t: ['Иша и таравих, в мечети или дома', 'Isha and tarawih, at the mosque or at home'], at: 'isha' },
  { id: 'quran', t: ['Коран: свой джуз или сура аль-Кадр с тафсиром', 'Quran: your juz, or Surat al-Qadr with tafsir'] },
  { id: 'dhikr', t: ['Зикр: 100 раз «Астагфируллах» и 100 раз «Субханаллахи ва бихамдихи»', 'Dhikr: "Astaghfirullah" 100 times and "Subhanallahi wa bihamdihi" 100 times'] },
  { id: 'sadaqa', t: ['Садака этой ночью, хоть немного', 'Sadaqah tonight, even a little'] },
  { id: 'rest', t: ['Короткий сон с намерением встать', 'A short sleep with the intention to wake'] },
  { id: 'tahajjud', night: 'tahajjud', t: ['Тахаджуд в последнюю треть ночи', 'Tahajjud in the last third of the night'], at: 'third' },
  { id: 'duas', t: ['Свой список дуа и «Аллахумма иннака ‘афуввун…»', 'Your du‘a list and "Allahumma innaka ‘afuwwun…"'] },
  { id: 'suhoor', t: ['Сухур и истигфар перед рассветом', 'Suhoor and seeking forgiveness before dawn'], at: 'fajr' },
];

function NightPlan({ state, update, today, l, evening, n }: { state: AppState; update: Update; today: string; l: Lang; evening: string; n: number }) {
  const t = tr(l);
  const r = ramadanOf(state);
  const tm = prayerTimes(here(state, evening), fromKey(evening));
  const nx = addDays(evening, 1);
  const tf = prayerTimes(here(state, nx), fromKey(nx));
  const third = lastThird(tm.maghrib, tf.fajr);
  const times = { isha: hhmm(tm.isha), third: hhmm(third), fajr: hhmm(tf.fajr) };
  const doneIds = r.qadr?.[evening] ?? [];
  const nl = r.nights[evening] ?? [];
  const isOn = (p: (typeof PLAN)[number]) => (p.night ? nl.includes(p.night) : doneIds.includes(p.id));
  const can = evening <= today;
  const toggle = (p: (typeof PLAN)[number]) => update(p.night ? toggleNight(evening, p.night) : (s) => patchR(s, (x) => {
    const cur = x.qadr?.[evening] ?? [];
    return { qadr: { ...(x.qadr ?? {}), [evening]: cur.includes(p.id) ? cur.filter((y) => y !== p.id) : [...cur, p.id] } };
  }));
  const count = PLAN.filter(isOn).length;
  return (
    <div className="h-card rm-plan">
      <div className="meal-h"><b>{t(`План на ${n}-ю ночь`, `Plan for night ${n}`)}</b><small>{count}/{PLAN.length}</small></div>
      <small>{t(`Последняя треть ночи с ${times.third} до Фаджра в ${times.fajr}. В это время Аллах нисходит к ближнему небу (аль-Бухари, 1145).`, `The last third of the night runs from ${times.third} to Fajr at ${times.fajr}. At this time Allah descends to the lowest heaven (al-Bukhari, 1145).`)}</small>
      {PLAN.map((p) => (
        <button type="button" key={p.id} className={`rm-step${isOn(p) ? ' on' : ''}`} disabled={!can} onClick={() => toggle(p)}>
          <i>{isOn(p) ? '✓' : ''}</i><span>{p.t[l === 'en' ? 1 : 0]}</span>{p.at && <small>{p.at === 'isha' ? times.isha : p.at === 'third' ? t(`с ${times.third}`, `from ${times.third}`) : t(`до ${times.fajr}`, `until ${times.fajr}`)}</small>}
        </button>
      ))}
      {!can && <small>{t('Отмечать можно, когда наступит эта ночь.', 'You can tick these once the night comes.')}</small>}
    </div>
  );
}

function DuaList({ state, update, l, today }: { state: AppState; update: Update; l: Lang; today: string }) {
  const t = tr(l);
  const list = ramadanOf(state).duas ?? [];
  const [v, setV] = useState('');
  const add = () => { const x = v.trim(); if (!x) return; update((s) => patchR(s, (r) => ({ duas: [...(r.duas ?? []), { id: uid(), t: x, at: today }] }))); setV(''); };
  const set = (id: string, f: (d: RDua) => RDua | null) => update((s) => patchR(s, (r) => ({ duas: (r.duas ?? []).flatMap((d) => { if (d.id !== id) return [d]; const x = f(d); return x ? [x] : []; }) })));
  const open = list.filter((d) => !d.ok), ok = list.filter((d) => d.ok);
  return (
    <div className="h-card">
      <div className="meal-h"><b>{t('Мой список дуа', 'My du‘a list')}</b><small>{t('видишь только ты', 'only you can see it')}</small></div>
      <small>{t('Собери заранее, о чём хочешь попросить: для себя, семьи, умерших, уммы. В нечётные ночи открой и читай по списку.', 'Gather in advance what you want to ask for: for yourself, your family, those who have passed, the ummah. On the odd nights, open it and go through it.')}</small>
      {open.map((d) => (
        <div key={d.id} className="rm-dua-row">
          <span>{d.t}</span>
          <button type="button" className="link-btn" onClick={() => set(d.id, (x) => ({ ...x, ok: today }))}>{t('Принято ✓', 'Answered ✓')}</button>
          <button type="button" className="link-btn" aria-label={t('Удалить', 'Delete')} onClick={() => set(d.id, () => null)}>✕</button>
        </div>
      ))}
      <div className="rm-dua-add">
        <input className="j-in" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder={t('Например: здоровье маме', 'For example: health for my mother')} maxLength={200} />
        <button type="button" className="pri-btn" disabled={!v.trim()} onClick={add}>{t('Добавить', 'Add')}</button>
      </div>
      {ok.length > 0 && (
        <details className="rm-ok">
          <summary>{t(`Принятые дуа: ${ok.length}. Альхамдулиллях`, `Answered du‘as: ${ok.length}. Alhamdulillah`)}</summary>
          {ok.map((d) => (
            <div key={d.id} className="rm-dua-row done">
              <span>{d.t}</span><small>{fmtDay(l, d.ok!)}</small>
              <button type="button" className="link-btn" onClick={() => set(d.id, (x) => ({ ...x, ok: undefined }))}>{t('Вернуть', 'Undo')}</button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function Nights({ state, update, today, mon, l }: P) {
  const t = tr(l);
  const r = ramadanOf(state);
  const q = sadaqaOf(state);
  const plan = q.ramadan ? ramadanPlan(q.ramadan.total, q.ramadan.odd2) : [];
  // Evening of day N-1 is night N; the first night is the evening before day 1.
  const evenings = mon.days.length ? [addDays(mon.days[0], -1), ...mon.days.slice(0, -1)] : [];
  const tonight = nightOf(today);
  const count = (w: string) => evenings.filter((e) => r.nights[e]?.includes(w)).length;
  // The night plan shown on top: tonight in the last ten, otherwise the 21st night.
  const planN = tonight && tonight >= 21 ? tonight : 21;
  const planE = evenings[planN - 1];
  return (
    <>
      <div className="h-card h-hero">
        <small>{tonight ? t(`Сегодня ${tonight}-я ночь`, `Tonight is night ${tonight}`) : t('Ночи Рамадана', 'Nights of Ramadan')}</small>
        <b className="h-big sm">{t(`Таравих ${count('tarawih')} из ${evenings.length}`, `Tarawih ${count('tarawih')} of ${evenings.length}`)}</b>
        <small>{t('«Кто простоит Рамадан с верой и надеждой на награду, тому простятся прежние грехи». аль-Бухари, 37', '"Whoever stands in prayer in Ramadan out of faith and hoping for reward, their previous sins will be forgiven." al-Bukhari, 37')}</small>
      </div>
      <div className="rm-grid">
        {evenings.map((e, i) => (
          <button type="button" key={e} disabled={e > today} data-v={r.nights[e]?.includes('tarawih') ? 'fast' : ''} className={i >= 20 && (i + 1) % 2 ? 'odd' : ''} onClick={() => update(toggleNight(e, 'tarawih'))}>{i + 1}</button>
        ))}
      </div>
      <h2 className="sub-h">{t('Ляйлят аль-Кадр', 'Laylat al-Qadr')}</h2>
      <div className="h-card third">
        <b>{t('Дуа в Ляйлят аль-Кадр', 'Du‘a for Laylat al-Qadr')}</b>
        <p className="ar-dua" lang="ar" dir="rtl">{QADR_DUA.ar}</p>
        <p className="dua-tr">{t(QADR_DUA.tr, QADR_DUA.trEn)}</p>
        <p className="dua-ru">{t(QADR_DUA.ru, QADR_DUA.en)}</p>
        <small className="src">{t(QADR_DUA.src, QADR_DUA.srcEn)}</small>
      </div>
      {planE && <NightPlan state={state} update={update} today={today} l={l} evening={planE} n={planN} />}
      <DuaList state={state} update={update} l={l} today={today} />
      <h2 className="sub-h">{t('Последние 10 ночей', 'The last ten nights')}</h2>
      {evenings.slice(20).map((e, j) => {
        const n = 21 + j;
        const ln = r.nights[e] ?? [];
        const share = plan.find((p) => p.night === n);
        const pd = (r.qadr?.[e] ?? []).length + ln.filter((x) => x !== 'itikaf').length;
        return (
          <div key={e} className={`h-card rm-night${n % 2 ? ' odd' : ''}${tonight === n ? ' now' : ''}`}>
            <div className="meal-h"><b>{t(`${n}-я ночь${n % 2 ? ' · нечётная' : ''}`, `Night ${n}${n % 2 ? ' · odd' : ''}`)}</b><small>{t('вечер', 'evening of')} {fmtDay(l, e)}</small></div>
            <div className="choices">
              {[['tarawih', t('Таравих', 'Tarawih')], ['tahajjud', t('Тахаджуд', 'Tahajjud')], ['itikaf', t('Иʼтикаф', 'I‘tikaf')]].map(([w, lb]) => (
                <button type="button" key={w} disabled={e > today} aria-pressed={ln.includes(w)} onClick={() => update(toggleNight(e, w))}>{lb}</button>
              ))}
            </div>
            {pd > 0 && n !== planN && <small>{t(`План ночи: ${pd} из ${PLAN.length}`, `Night plan: ${pd} of ${PLAN.length}`)}</small>}
            {share && <small>{t('Садака по плану:', 'Planned sadaqah:')} {q.ramadan!.given.includes(n) ? t('отдана ✓', 'given ✓') : q.secret ? t('есть в плане', 'in your plan') : `${share.share} ${q.cur}`}</small>}
          </div>
        );
      })}
      {!plan.length && <p className="q-msg left tiny-note">{t('План садаки на эти ночи можно задать в Практике → Садака → Рамадан.', 'You can set a sadaqah plan for these nights in Practice → Sadaqah → Ramadan.')}</p>}
    </>
  );
}

function Eid({ state, update, today, mon, l }: P) {
  const t = tr(l);
  const r = ramadanOf(state);
  const year = mon.year;
  const paid = r.fitr.includes(year);
  const sh = shawwalCount(state, today);
  const evenings = mon.days.length ? [addDays(mon.days[0], -1), ...mon.days.slice(0, -1)] : [];
  const kp = khatmProgress(state, r, 30);
  const sq = sadaqaOf(state);
  const [keep, setKeep] = useState(r.keep[String(year)] ?? '');
  const habits = state.habits.filter((x) => x.status === 'active' && (!x.ramadan || x.ramadan === year));
  const deeds = (r.deeds?.[String(year)] ?? []).length;
  return (
    <>
      <div className="h-card">
        <div className="meal-h"><b>{t('Закят аль-фитр', 'Zakat al-fitr')}</b>{paid && <small>{t('отдан ✓', 'given ✓')}</small>}</div>
        <small>{t('Обязателен за себя и за каждого, кого содержишь. Отдать нужно до праздничного намаза, можно за день-два до Ида. Размер равен са‘ основной еды (около 2,5–3 кг) или его стоимости. Сумму на этот год объявляет мечеть.', 'It is due for yourself and everyone you support. Give it before the Eid prayer; a day or two before Eid is fine. It equals one sa‘ of staple food (about 2.5–3 kg) or its value. Your mosque announces this year’s amount.')}</small>
        <button type="button" className={paid ? 'pri-btn' : 'gold-btn'} onClick={() => update((s) => patchR(s, (x) => ({ fitr: paid ? x.fitr.filter((y) => y !== year) : [...x.fitr, year] })))}>{paid ? t('Отдан ✓', 'Given ✓') : t('Отдал', 'Given')}</button>
      </div>
      <ZakatCard state={state} update={update} l={l} />
      <div className="h-card third">
        <b>{t('Такбир', 'Takbir')}</b>
        <p className="ar-dua" lang="ar" dir="rtl">{TAKBIR.ar}</p>
        <p className="dua-tr">{t(TAKBIR.tr, TAKBIR.trEn)}</p>
      </div>
      <h2 className="sub-h">{t('Сунны Ида', 'Sunnahs of Eid')}</h2>
      <ul className="rules">{EID_SUNNA.map((x) => <li key={x[0]}>{x[l === 'en' ? 1 : 0]}</li>)}</ul>
      {mon.state !== 'next' && (
        <>
          <h2 className="sub-h">{t('Итоги месяца', 'Your month')}</h2>
          <div className="rm-sum">
            <div><b>{mon.days.filter((d) => r.fasts[d] === 'fast').length}</b><small>{t('постов', 'fasts')}</small></div>
            <div><b>{evenings.filter((e) => r.nights[e]?.includes('tarawih')).length}</b><small>{t('таравихов', 'tarawih')}</small></div>
            <div><b>{kp ? kp.done : '—'}</b><small>{t('джузов', 'juz')}</small></div>
            <div><b>{deeds}</b><small>{t('добрых дел', 'good deeds')}</small></div>
            <div><b>{sq.ramadan ? sq.ramadan.given.length : '—'}</b><small>{t('ночей садаки', 'sadaqah nights')}</small></div>
          </div>
          <div className="h-card">
            <b>{t('Какую одну привычку оставить после Рамадана?', 'Which one habit will you keep after Ramadan?')}</b>
            <div className="choices">{habits.slice(0, 6).map((x) => <button type="button" key={x.id} aria-pressed={keep === x.action} onClick={() => setKeep(x.action)}>{x.action}</button>)}</div>
            <input className="j-in" value={keep} onChange={(e) => setKeep(e.target.value)} placeholder={t('Или напиши свою: таравих дома 2 ракаата', 'Or write your own: 2 rak‘ahs of night prayer at home')} />
            <button type="button" className="pri-btn" disabled={!keep.trim()} onClick={() => update((s) => patchR({ ...s, habits: s.habits.map((x) => (x.ramadan && x.action === keep.trim() ? { ...x, ramadan: undefined } : x)) }, (x) => ({ keep: { ...x.keep, [String(year)]: keep.trim() } })))}>{r.keep[String(year)] === keep.trim() && keep ? t('Сохранено ✓', 'Saved ✓') : t('Сохранить', 'Save')}</button>
            <small>{t('«Самые любимые Аллаху дела те, что постоянны, даже если малы». аль-Бухари, 6464', '"The most beloved deeds to Allah are those done consistently, even if small." al-Bukhari, 6464')}</small>
          </div>
        </>
      )}
      <div className="h-card">
        <div className="meal-h"><b>{t('6 дней Шавваля', 'Six days of Shawwal')}</b><small>{sh !== null ? t(`${sh} из 6`, `${sh} of 6`) : t('после Ида', 'after Eid')}</small></div>
        <small>{t('«Кто постился в Рамадан, а потом добавил шесть дней Шавваля, будто постился весь год». Муслим, 1164. Можно подряд или вразбивку, кроме дня Ида.', '"Whoever fasts Ramadan and follows it with six days of Shawwal, it is as if they fasted the whole year." Muslim, 1164. Consecutive or spread out, but not on the day of Eid.')}</small>
        {sh !== null && hOf(today)!.day > 1 && (
          <button type="button" className={health(state).fasts[today] ? 'pri-btn' : 'gold-btn'} onClick={() => update(toggleShawwal(today))}>{health(state).fasts[today] ? t('Сегодня пощусь ✓', 'Fasting today ✓') : t('Сегодня пощусь', 'I am fasting today')}</button>
        )}
      </div>
    </>
  );
}

function ZakatCard({ state, update, l }: { state: AppState; update: Update; l: Lang }) {
  const t = tr(l);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="h-card rm-zk" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="meal-h"><b>{t('Закят аль-маль', 'Zakat al-mal')}</b><small>{open ? t('свернуть', 'close') : t('посчитать ›', 'calculate ›')}</small></span>
        <small>{t('Закят с имущества. Многие отдают его в Рамадан. Тот же калькулятор есть в Практике → Садака → Закят.', 'Zakat on wealth. Many give it in Ramadan. The same calculator is in Practice → Sadaqah → Zakat.')}</small>
      </button>
      {open && <Zakat state={state} update={update} l={l} />}
    </>
  );
}

export const PREP: { id: string; t: [string, string]; why?: [string, string] }[] = [
  { id: 'qada', t: ['Возместить долги постов', 'Make up missed fasts'], why: ['Отметка ставится сама, когда долгов нет', 'Ticks itself when nothing is left to make up'] },
  { id: 'shaban', t: ['Поститься в Шаабан, хотя бы по понедельникам и четвергам', 'Fast in Sha‘ban, at least on Mondays and Thursdays'], why: ['«Я не видела, чтобы он постился в каком-то месяце больше, чем в Шаабан». аль-Бухари, 1969; Муслим, 1156', '"I never saw him fast more in any month than in Sha‘ban." al-Bukhari, 1969; Muslim, 1156'] },
  { id: 'khatm', t: ['Выбрать план хатма', 'Choose a khatm plan'], why: ['Вкладка «Коран»', 'Quran tab'] },
  { id: 'read', t: ['Разогнать чтение Корана: каждый день хотя бы страница', 'Build up your Quran reading: at least a page a day'] },
  { id: 'sleep', t: ['Сдвигать сон: раньше ложиться, раз в неделю вставать на тахаджуд', 'Shift your sleep: go to bed earlier and wake for tahajjud once a week'] },
  { id: 'coffee', t: ['Постепенно меньше кофе и сладкого, чтобы первые дни поста дались легче', 'Gradually cut down on coffee and sweets so the first fasts are easier'] },
  { id: 'habits', t: ['Решить, какие привычки на минимум, а какие взять на 30 дней', 'Decide which habits go to minimum and which to take on for 30 days'], why: ['Ниже на этом экране', 'Below on this screen'] },
  { id: 'sadaqa', t: ['Составить план садаки на последние 10 ночей', 'Plan your sadaqah for the last ten nights'], why: ['Практика → Садака → Рамадан', 'Practice → Sadaqah → Ramadan'] },
  { id: 'duas', t: ['Записать свой список дуа на Рамадан', 'Write your du‘a list for Ramadan'], why: ['Вкладка «Ночи». Отметка ставится сама, когда в списке три дуа', 'Nights tab. Ticks itself once the list has three du‘as'] },
  { id: 'iftar', t: ['Договориться об ифтаре с братьями или сёстрами', 'Arrange an iftar with brothers or sisters'], why: ['Вкладка «Круг»', 'Circle tab'] },
];
const AUTO = ['qada', 'khatm', 'habits', 'sadaqa', 'shaban', 'duas'];

/** Preparation items done for this Ramadan, auto ones included. */
export function prepDone(s: AppState, year: number): string[] {
  const r = ramadanOf(s);
  const manual = r.prep?.[String(year)] ?? [];
  const auto: string[] = [];
  if (Object.keys(r.fasts).length && debt(r).left === 0) auto.push('qada');
  if (r.khatm?.year === year) auto.push('khatm');
  if (Object.keys(r.plan ?? {}).length || s.habits.some((h) => h.ramadan === year)) auto.push('habits');
  if (sadaqaOf(s).ramadan) auto.push('sadaqa');
  if ((r.duas ?? []).length >= 3) auto.push('duas');
  let sh = 0;
  for (const d of Object.keys(health(s).fasts)) { const x = hOf(d); if (x?.month === 8 && x.year === year) sh++; }
  if (sh >= 4) auto.push('shaban');
  return [...new Set([...manual, ...auto])];
}

const RAMADAN_HABITS: { action: [string, string]; min: [string, string]; anchor: Anchor; sphere: Sphere }[] = [
  { action: ['Утренние азкары', 'Morning adhkar'], min: ['3 зикра', '3 adhkar'], anchor: 'fajr', sphere: 'faith' },
  { action: ['Садака каждый день', 'Sadaqah every day'], min: ['монета или доброе слово', 'a coin or a kind word'], anchor: 'dhuhr', sphere: 'faith' },
  { action: ['Дуа перед ифтаром', 'Du‘a before iftar'], min: ['одно дуа', 'one du‘a'], anchor: 'asr', sphere: 'faith' },
  { action: ['Тафсир одного аята с семьёй', 'Tafsir of one ayah with family'], min: ['1 аят', '1 ayah'], anchor: 'isha', sphere: 'family' },
];

/** Ramadan reminder settings; shared by the Ramadan screen and Profile → Reminders. */
export function RamadanPushFields({ l, prefs, onChange }: { l: Lang; prefs?: ReminderPrefs; onChange: (r: RamadanPush) => void }) {
  const t = tr(l);
  const r = rpushOf(prefs);
  const set = (p: Partial<RamadanPush>) => onChange({ ...r, ...p });
  return (
    <>
      <label className="field">
        <span>{t('Сухур', 'Suhoor')}</span>
        <select value={r.suhoor} onChange={(e) => set({ suhoor: Number(e.target.value) })}>
          <option value={0}>{t('Не напоминать', 'Off')}</option>
          {[20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{t(`За ${m} мин до Фаджра`, `${m} min before Fajr`)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('Ифтар', 'Iftar')}</span>
        <select value={r.iftar} onChange={(e) => set({ iftar: Number(e.target.value) })}>
          <option value={-1}>{t('Не напоминать', 'Off')}</option>
          <option value={0}>{t('В момент Магриба', 'At Maghrib')}</option>
          {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{t(`За ${m} мин`, `${m} min before`)}</option>)}
        </select>
      </label>
      <label className="check-row"><input type="checkbox" checked={r.tarawih} onChange={(e) => set({ tarawih: e.target.checked })} />{t('Таравих после Иши', 'Tarawih after Isha')}</label>
      <label className="check-row"><input type="checkbox" checked={r.nights} onChange={(e) => set({ nights: e.target.checked })} />{t('Первая ночь и нечётные ночи последней декады', 'The first night and the odd nights of the last ten')}</label>
      <label className="check-row"><input type="checkbox" checked={r.fitr} onChange={(e) => set({ fitr: e.target.checked })} />{t('Закят аль-фитр за пару дней до Ида', 'Zakat al-fitr a few days before Eid')}</label>
    </>
  );
}

function Prep({ state, update, today, mon, l }: P) {
  const t = tr(l);
  const i = l === 'en' ? 1 : 0;
  const r = ramadanOf(state);
  const year = mon.year;
  const done = prepDone(state, year);
  const h = hOf(today);
  const plan = r.plan ?? {};
  const regular = state.habits.filter((x) => x.status === 'active' && !x.ramadan);
  const mine = state.habits.filter((x) => x.ramadan === year);
  const dbt = debt(r);
  const rem = state.settings.reminders;
  const toggle = (id: string) => update((s) => patchR(s, (x) => { const ls = x.prep?.[String(year)] ?? []; return { prep: { ...(x.prep ?? {}), [String(year)]: ls.includes(id) ? ls.filter((y) => y !== id) : [...ls, id] } }; }));
  const setPlan = (id: string, v: 'min' | 'pause' | null) => update((s) => patchR(s, (x) => { const p = { ...(x.plan ?? {}) }; if (v) p[id] = v; else delete p[id]; return { plan: p }; }));
  const phase = h?.month === 8 ? t('Сейчас Шаабан, последний месяц перед Рамаданом. Самое время поститься чаще и закрыть долги.', 'It is Sha‘ban, the last month before Ramadan. The time to fast more often and make up missed fasts.')
    : h?.month === 7 ? t('Сейчас Раджаб. Начни потихоньку: два месяца хватит, чтобы войти в Рамадан готовым.', 'It is Rajab. Start gently: two months is enough to enter Ramadan ready.')
    : mon.state === 'now' ? t('Рамадан уже идёт. Здесь можно поменять план привычек.', 'Ramadan has begun. You can still change your habit plan here.')
    : t('Подготовку удобно начинать за два месяца, в Раджаб. Можно и раньше.', 'A good time to start preparing is two months ahead, in Rajab. Earlier is fine too.');
  return (
    <>
      <div className="h-card h-hero">
        <small>{mon.state === 'next' ? t(`До Рамадана ${mon.daysTo} дн.`, `${nw(l, mon.daysTo, ['', '', ''], ['day', 'days'])} to Ramadan`) : t('Подготовка', 'Preparation')}</small>
        <b className="h-big sm">{t(`${done.length} из ${PREP.length}`, `${done.length} of ${PREP.length}`)}</b>
        <div className="bar2 wide"><i style={{ width: `${(done.length / PREP.length) * 100}%` }} /></div>
        <small>{phase}</small>
      </div>
      {PREP.map((p) => {
        const on = done.includes(p.id);
        const auto = AUTO.includes(p.id) && on && !(r.prep?.[String(year)] ?? []).includes(p.id);
        return (
          <button type="button" key={p.id} className={`h-card sunna${on ? ' on' : ''}`} onClick={() => !auto && toggle(p.id)}>
            <span className="meal-h"><b>{on ? '✓ ' : ''}{p.t[i]}</b></span>
            {p.id === 'qada' && dbt.left > 0 && <small>{t(`Осталось ${dbt.left} дн. Отмечай возмещение во вкладке «Пост».`, `${nw(l, dbt.left, ['', '', ''], ['day', 'days'])} left. Mark make-up fasts in the Fast tab.`)}</small>}
            {p.why && <small className={p.why[i].startsWith('«') || p.why[i].startsWith('"') ? 'src' : ''}>{p.why[i]}</small>}
          </button>
        );
      })}

      {isCloud && (
        <>
          <h2 className="sub-h">{t('Напоминания в Рамадан', 'Ramadan reminders')}</h2>
          {rem?.on ? (
            <div className="h-card">
              <RamadanPushFields l={l} prefs={rem} onChange={(x) => update((s) => ({ ...s, settings: { ...s.settings, reminders: { ...s.settings.reminders!, ramadan: x } } }))} />
            </div>
          ) : (
            <p className="q-msg left">{t('Включи напоминания в Профиле → Напоминания. Тогда в Рамадан придут сухур, ифтар, нечётные ночи и закят аль-фитр.', 'Turn on reminders in Profile → Reminders. In Ramadan you will then get suhoor, iftar, the odd nights and zakat al-fitr.')}</p>
          )}
        </>
      )}

      <label className="h-card check-row rm-theme"><input type="checkbox" checked={state.settings.ramadanTheme !== false} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, ramadanTheme: e.target.checked } }))} />{t('Ночные цвета и звёзды во всём приложении в Рамадан', 'Night colours and stars across the app in Ramadan')}</label>

      <h2 className="sub-h">{t('Привычки в Рамадан', 'Habits in Ramadan')}</h2>
      <p className="q-msg left">{t('В пост сил меньше. Реши заранее, что держать как обычно, что на минимуме, а что поставить на паузу. Пауза и минимум не ломают серию.', 'Fasting leaves less energy. Decide ahead what to keep as usual, what to do at minimum and what to pause. Pause and minimum do not break your streak.')}</p>
      {regular.length === 0 && <p className="q-msg left tiny-note">{t('Активных привычек пока нет.', 'No active habits yet.')}</p>}
      {regular.map((x: Habit) => (
        <div key={x.id} className="h-card">
          <b>{x.action}</b>
          <div className="choices">
            {([[null, t('Как обычно', 'As usual')], ['min', `${t('Минимум', 'Minimum')}${x.min ? `: ${x.min}` : ''}`], ['pause', t('Пауза', 'Pause')]] as const).map(([v, lb]) => (
              <button type="button" key={String(v)} aria-pressed={(plan[x.id] ?? null) === v} onClick={() => setPlan(x.id, v)}>{lb}</button>
            ))}
          </div>
        </div>
      ))}
      <h2 className="sub-h">{t('Только на 30 дней', 'Just for 30 days')}</h2>
      <p className="q-msg left">{t('Эти привычки появятся в первый день Рамадана и не занимают место в лимите из пяти. На Ид спросим, какую оставить.', 'These habits appear on the first day of Ramadan and do not count towards your limit of five. On Eid we will ask which one to keep.')}</p>
      {RAMADAN_HABITS.map((h0) => {
        const added = mine.find((m) => h0.action.includes(m.action));
        return (
          <div key={h0.action[0]} className="h-card">
            <div className="meal-h"><b>{h0.action[i]}</b><small>{t('минимум', 'minimum')}: {h0.min[i]}</small></div>
            <button type="button" className={added ? 'pri-btn' : 'ghost-btn'} onClick={() => update((s) => added
              ? { ...s, habits: s.habits.filter((y) => y.id !== added.id) }
              : { ...s, habits: [...s.habits, { id: uid(), action: h0.action[i], min: h0.min[i], anchor: h0.anchor, sphere: h0.sphere, status: 'active', createdAt: mon.days[0] ?? today, ramadan: year }] })}>{added ? t('Добавлено ✓', 'Added ✓') : t('+ На Рамадан', '+ For Ramadan')}</button>
          </div>
        );
      })}
    </>
  );
}
