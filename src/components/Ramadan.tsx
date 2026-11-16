import { useState } from 'react';
import { ayahIndex } from '../goals';
import type { AppState, FastMark } from '../types';
import { addDays, durationLabel, fromKey, hhmm } from '../dates';
import { type DayTimes, prayerTimes } from '../prayer';
import { here } from '../safar';
import { health, patchHealth } from '../health';
import { sadaqaOf, ramadanPlan } from './Sadaqa';
import { uid } from '../store';
import type { Anchor, Habit, Sphere } from '../types';
import { EID_SUNNA, IFTAR_DUA, MISSED, QADR_DUA, TAKBIR, debt, hOf, khatmProgress, nightOf, patchR, ramadanDay, ramadanMonth, ramadanOf, shawwalCount } from '../ramadan';

type Update = (fn: (s: AppState) => AppState) => void;
const fmtDay = (k: string) => fromKey(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

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

/** Card on the Today screen: during Ramadan, on the eve of it, on Eid and through Shawwal. */
export function RamadanToday({ state, update, today, now, times, onOpen }: { state: AppState; update: Update; today: string; now: Date; times: DayTimes; onOpen: () => void }) {
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
        <b className="rm-t">Ид мубарак! 🌙</b>
        <p className="ar-dua light" lang="ar" dir="rtl">{TAKBIR.ar}</p>
        <small>{TAKBIR.tr}</small>
        {!paid && <button type="button" className="gold-btn" onClick={() => update((s) => patchR(s, (x) => ({ fitr: [...x.fitr, h.year] })))}>Отметить: закят аль-фитр отдан</button>}
        <button type="button" className="rm-link" onClick={onOpen}>Сунны Ида и итоги месяца ›</button>
      </div>
    );
  }
  const sh = shawwalCount(state, today);
  if (sh !== null && sh < 6) {
    const on = Boolean(health(state).fasts[today]);
    return (
      <div className="rm-card soft">
        <div className="meal-h"><b>6 дней Шавваля</b><small>{sh} из 6</small></div>
        <small>«Кто постился в Рамадан, а потом добавил шесть дней Шавваля, будто постился весь год». Муслим, 1164</small>
        <button type="button" className={on ? 'pri-btn' : 'gold-btn'} onClick={() => update(toggleShawwal(today))}>{on ? 'Сегодня пощусь ✓' : 'Сегодня пощусь'}</button>
      </div>
    );
  }
  if (h?.month === 8 && tDay !== 1) {
    const mon = ramadanMonth(today);
    const pr = prepDone(state, mon.year).length;
    return (
      <button type="button" className="rm-card soft rm-btn" onClick={onOpen}>
        <div className="meal-h"><b>🌙 До Рамадана {mon.daysTo} дн.</b><small>подготовка {pr} из {PREP.length} ›</small></div>
        <small>Шаабан: время возместить долги постов, разогнать Коран и решить, какие привычки взять в Рамадан.</small>
      </button>
    );
  }
  if (!day && tDay !== 1) return null;

  const tt = prayerTimes(here(state, tomorrow), fromKey(tomorrow));
  let line: string, sub: string;
  if (day && now < times.fajr) { line = `Сухур до ${hhmm(times.fajr)}`; sub = `осталось ${durationLabel(times.fajr.getTime() - now.getTime())}`; }
  else if (day && now < times.maghrib) { line = `Ифтар в ${hhmm(times.maghrib)}`; sub = `через ${durationLabel(times.maghrib.getTime() - now.getTime())}`; }
  else if (tDay) { line = `Сухур завтра до ${hhmm(tt.fajr)}`; sub = tDay === 1 ? 'Завтра первый день поста' : 'Не забудь намерение на завтрашний пост'; }
  else { line = 'Завтра Ид аль-Фитр'; sub = 'Закят аль-фитр нужно отдать до праздничного намаза'; }
  const mark = day ? r.fasts[today] : undefined;
  const kp = day ? khatmProgress(state, r, day) : null;
  const afterMaghrib = now >= times.maghrib;
  const iftarSoon = day && !afterMaghrib && times.maghrib.getTime() - now.getTime() < 45 * 60000;

  return (
    <div className="rm-card">
      <div className="rm-head">
        <span>{day ? `Рамадан · день ${day} из ${ramadanMonth(today).days.length}` : 'Сегодня первая ночь Рамадана'}</span>
        <button type="button" className="rm-link" onClick={onOpen}>Открыть ›</button>
      </div>
      <b className="rm-t">{line}</b>
      <small>{sub}</small>
      {(iftarSoon || (day && afterMaghrib && now.getTime() - times.maghrib.getTime() < 60 * 60000)) && (
        <div className="rm-dua"><p className="ar-dua light" lang="ar" dir="rtl">{IFTAR_DUA.ar}</p><small>{IFTAR_DUA.tr} {IFTAR_DUA.src}</small></div>
      )}
      <div className="rm-row">
        {day && (
          <button type="button" className={`rm-chip${mark === 'fast' ? ' on' : ''}`} onClick={() => update(setFast(today, mark === 'fast' ? null : 'fast'))}>{mark === 'fast' ? 'Пощусь ✓' : 'Пощусь'}</button>
        )}
        {night && night <= 30 && (
          <button type="button" className={`rm-chip${tn.includes('tarawih') ? ' on' : ''}`} onClick={() => update(toggleNight(today, 'tarawih'))}>{tn.includes('tarawih') ? 'Таравих ✓' : 'Таравих'}</button>
        )}
        {night && night >= 21 && night <= 30 && (
          <button type="button" className={`rm-chip${tn.includes('tahajjud') ? ' on' : ''}`} onClick={() => update(toggleNight(today, 'tahajjud'))}>{tn.includes('tahajjud') ? 'Тахаджуд ✓' : 'Тахаджуд'}</button>
        )}
      </div>
      {day && mark && mark !== 'fast' && <small>Сегодня без поста: {MISSED.find((m) => m.id === mark)?.l.toLowerCase()}. Это видишь только ты.</small>}
      {day && afterMaghrib && (() => { const w = health(state).water[today] ?? 0; const g = health(state).waterGoal; return (
        <div className="rm-water"><small>💧 Вода до сухура: {w} из {g}</small><button type="button" className="rm-chip" onClick={() => update((s) => patchHealth(s, (x) => ({ water: { ...x.water, [today]: (x.water[today] ?? 0) + 1 } })))}>+ стакан</button></div>
      ); })()}
      {kp && <small className="rm-k">Коран: {kp.done} из {kp.goal} джузов, по плану {kp.expected}. После каждого намаза примерно {kp.pagesPerPrayer} стр.</small>}
      {night && night >= 21 && night <= 30 && <small className="rm-k">{night % 2 ? `${night}-я ночь, нечётная. Ищи Ляйлят аль-Кадр` : `${night}-я ночь из последних десяти`}</small>}
    </div>
  );
}

export function Ramadan({ state, update, today, onClose }: { state: AppState; update: Update; today: string; onClose: () => void }) {
  const mon = ramadanMonth(today);
  const h = hOf(today);
  const [tab, setTab] = useState<'prep' | 'fast' | 'quran' | 'nights' | 'eid'>(h?.month === 10 ? 'eid' : mon.state === 'next' ? 'prep' : 'fast');
  const sub = mon.state === 'now' ? `День ${ramadanDay(today)} из ${mon.days.length}` : mon.state === 'past' ? `Рамадан ${mon.year} прошёл` : `До Рамадана ${mon.daysTo} дн.`;
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        <div><b>Рамадан</b><small>{sub}</small></div>
      </div>
      <div className="seg">
        {([['prep', 'Старт'], ['fast', 'Пост'], ['quran', 'Коран'], ['nights', 'Ночи'], ['eid', 'Ид']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'prep' && <Prep state={state} update={update} today={today} mon={mon} />}
        {tab === 'fast' && <Fasts state={state} update={update} today={today} mon={mon} />}
        {tab === 'quran' && <Khatm state={state} update={update} today={today} mon={mon} />}
        {tab === 'nights' && <Nights state={state} update={update} today={today} mon={mon} />}
        {tab === 'eid' && <Eid state={state} update={update} today={today} mon={mon} />}
      </div>
    </div>
  );
}

type Mon = ReturnType<typeof ramadanMonth>;
interface P { state: AppState; update: Update; today: string; mon: Mon }

function Fasts({ state, update, today, mon }: P) {
  const r = ramadanOf(state);
  const [sel, setSel] = useState<string>(mon.days.includes(today) ? today : mon.days.filter((d) => d <= today).slice(-1)[0] ?? '');
  const dbt = debt(r);
  const kept = mon.days.filter((d) => r.fasts[d] === 'fast').length;
  const madeToday = r.qada.includes(today);
  const m = sel ? r.fasts[sel] : undefined;
  return (
    <>
      {mon.state !== 'next' && (
        <div className="h-card h-hero">
          <small>Постов в этом Рамадане</small>
          <b className="h-big sm">{kept} из {mon.days.length}</b>
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
      {mon.state === 'next' && <p className="q-msg left">Рамадан начнётся примерно {fmtDay(mon.days[0])}, через {mon.daysTo} дн. Точную дату объявит твоя мечеть. Дни станут доступны по мере наступления.</p>}
      {sel && (
        <div className="h-card">
          <div className="meal-h"><b>{ramadanDay(sel)}-й день · {fmtDay(sel)}</b>{m && <button type="button" className="link-btn" onClick={() => update(setFast(sel, null))}>Снять</button>}</div>
          <button type="button" className={m === 'fast' ? 'pri-btn' : 'gold-btn'} onClick={() => update(setFast(sel, 'fast'))}>{m === 'fast' ? 'Постился ✓' : 'Постился'}</button>
          <small>Если без поста, отметь причину. Её видишь только ты, в Круг она не попадает.</small>
          <div className="choices">{MISSED.map((x) => <button type="button" key={x.id} aria-pressed={m === x.id} onClick={() => update(setFast(sel, x.id))}>{x.l}</button>)}</div>
          {m && m !== 'fast' && <small>{MISSED.find((x) => x.id === m)?.note}</small>}
        </div>
      )}
      <div className="h-card">
        <div className="meal-h"><b>Долг постов</b><small>за все годы</small></div>
        {dbt.left || dbt.made ? <b className="h-big sm">{dbt.left} {dbt.left === 1 ? 'день' : 'дн.'}</b> : <small>Долгов нет. Альхамдулиллях.</small>}
        {dbt.made > 0 && <small>Возмещено {dbt.made} из {dbt.missed}.</small>}
        {(dbt.left > 0 || madeToday) && !ramadanDay(today) && (
          <button type="button" className={madeToday ? 'pri-btn' : 'gold-btn'} onClick={() => update((s) => patchR(s, (x) => ({ qada: x.qada.includes(today) ? x.qada.filter((d) => d !== today) : [...x.qada, today] })))}>{madeToday ? 'Сегодня возмещаю ✓' : 'Сегодня возмещаю пост'}</button>
        )}
        <small>«…а кто из вас болен или в пути, пусть постится столько же дней в другое время». Коран, 2:184. Лучше возместить до следующего Рамадана.</small>
        {dbt.fidya > 0 && <small>Дней на фидью: {dbt.fidya}. За каждый день кормят одного бедного. Размер уточни в своей мечети.</small>}
      </div>
    </>
  );
}

function Khatm({ state, update, today, mon }: P) {
  const r = ramadanOf(state);
  const day = mon.state === 'now' ? ramadanDay(today) ?? 0 : mon.state === 'past' ? 30 : 0;
  const kp = khatmProgress(state, r, day);
  const k = r.khatm;
  const set = (rate: number) => update((s) => patchR(s, (x) => ({ khatm: { rate, startDay: x.khatm?.year === mon.year ? x.khatm.startDay ?? 1 : Math.max(1, day), startIdx: x.khatm?.year === mon.year ? x.khatm.startIdx : (s.quran ? ayahIdx(s) : 0), rounds: x.khatm?.year === mon.year ? x.khatm.rounds : 0, year: mon.year } })));
  return (
    <>
      <p className="q-msg left">Выбери план на месяц. Норма делится на пять частей, после каждого намаза. Прогресс считается по закладке в разделе Коран.</p>
      <div className="choices">
        {[[0.5, 'Полхатма'], [1, '1 хатм'], [2, '2 хатма'], [3, '3 хатма']].map(([v, l]) => (
          <button type="button" key={v} aria-pressed={k?.rate === v} onClick={() => set(v as number)}>{l}</button>
        ))}
      </div>
      {k && kp && (
        <>
          <div className="h-card h-hero">
            <small>Прочитано с начала плана</small>
            <b className="h-big sm">{kp.done} из {kp.goal} джузов</b>
            <div className="bar2 wide"><i style={{ width: `${Math.min(100, (kp.done / kp.goal) * 100)}%` }} /></div>
            <small>{day ? `По плану к сегодняшнему дню: ${kp.expected}` : 'Счёт пойдёт с первого дня Рамадана'}</small>
            {day > 0 && kp.done < kp.goal && kp.done < kp.expected && <small>Чтобы успеть к концу месяца: {Math.ceil(((kp.goal - kp.done) / Math.max(1, mon.days.length - day + 1)) * 10) / 10} джуза в день</small>}
          </div>
          <div className="h-card">
            <b>Каждый день</b>
            <small>{k.rate} {k.rate === 1 ? 'джуз' : 'джуза'} в день, это примерно {Math.round(k.rate * 20)} страниц. После каждого из пяти намазов около {kp.pagesPerPrayer} стр.</small>
          </div>
          {kp.nearEnd && (
            <button type="button" className="gold-btn" onClick={() => update((s) => patchR({ ...s, quran: s.quran ? { ...s.quran, surah: 1, ayah: 1 } : s.quran }, (x) => ({ khatm: x.khatm ? { ...x.khatm, rounds: x.khatm.rounds + 1 } : x.khatm })))}>Хатм завершён, начать заново с аль-Фатихи</button>
          )}
          <button type="button" className="ghost-btn" onClick={() => update((s) => patchR(s, () => ({ khatm: null })))}>Сбросить план</button>
        </>
      )}
      <p className="q-msg left tiny-note">Читать вместе с братьями и сёстрами можно в Круге: там есть общий хатм, где каждый берёт свои джузы.</p>
    </>
  );
}
const ayahIdx = (s: AppState) => (s.quran ? ayahIndex(s.quran.surah, s.quran.ayah) : 0);

function Nights({ state, update, today, mon }: P) {
  const r = ramadanOf(state);
  const q = sadaqaOf(state);
  const plan = q.ramadan ? ramadanPlan(q.ramadan.total, q.ramadan.odd2) : [];
  // Evening of day N-1 is night N; the first night is the evening before day 1.
  const evenings = mon.days.length ? [addDays(mon.days[0], -1), ...mon.days.slice(0, -1)] : [];
  const tonight = nightOf(today);
  const count = (w: string) => evenings.filter((e) => r.nights[e]?.includes(w)).length;
  return (
    <>
      <div className="h-card h-hero">
        <small>{tonight ? `Сегодня ${tonight}-я ночь` : 'Ночи Рамадана'}</small>
        <b className="h-big sm">Таравих {count('tarawih')} из {evenings.length}</b>
        <small>«Кто простоит Рамадан с верой и надеждой на награду, тому простятся прежние грехи». аль-Бухари, 37</small>
      </div>
      <div className="rm-grid">
        {evenings.map((e, i) => (
          <button type="button" key={e} disabled={e > today} data-v={r.nights[e]?.includes('tarawih') ? 'fast' : ''} className={i >= 20 && (i + 1) % 2 ? 'odd' : ''} onClick={() => update(toggleNight(e, 'tarawih'))}>{i + 1}</button>
        ))}
      </div>
      <h2 className="sub-h">Последние 10 ночей</h2>
      <div className="h-card third">
        <b>Дуа в Ляйлят аль-Кадр</b>
        <p className="ar-dua" lang="ar" dir="rtl">{QADR_DUA.ar}</p>
        <p className="dua-tr">{QADR_DUA.tr}</p>
        <p className="dua-ru">{QADR_DUA.ru}</p>
        <small className="src">{QADR_DUA.src}</small>
      </div>
      {evenings.slice(20).map((e, j) => {
        const n = 21 + j;
        const l = r.nights[e] ?? [];
        const share = plan.find((p) => p.night === n);
        return (
          <div key={e} className={`h-card rm-night${n % 2 ? ' odd' : ''}${tonight === n ? ' now' : ''}`}>
            <div className="meal-h"><b>{n}-я ночь{n % 2 ? ' · нечётная' : ''}</b><small>вечер {fmtDay(e)}</small></div>
            <div className="choices">
              {[['tarawih', 'Таравих'], ['tahajjud', 'Тахаджуд'], ['itikaf', 'Иʼтикаф']].map(([w, t]) => (
                <button type="button" key={w} disabled={e > today} aria-pressed={l.includes(w)} onClick={() => update(toggleNight(e, w))}>{t}</button>
              ))}
            </div>
            {share && <small>Садака по плану: {q.ramadan!.given.includes(n) ? 'отдана ✓' : q.secret ? 'есть в плане' : `${share.share} ${q.cur}`}</small>}
          </div>
        );
      })}
      {!plan.length && <p className="q-msg left tiny-note">План садаки на эти ночи можно задать в Практике → Садака → Рамадан.</p>}
    </>
  );
}

function Eid({ state, update, today, mon }: P) {
  const r = ramadanOf(state);
  const year = mon.year;
  const paid = r.fitr.includes(year);
  const sh = shawwalCount(state, today);
  const evenings = mon.days.length ? [addDays(mon.days[0], -1), ...mon.days.slice(0, -1)] : [];
  const kp = khatmProgress(state, r, 30);
  const sq = sadaqaOf(state);
  const [keep, setKeep] = useState(r.keep[String(year)] ?? '');
  const habits = state.habits.filter((x) => x.status === 'active' && (!x.ramadan || x.ramadan === year));
  return (
    <>
      <div className="h-card">
        <div className="meal-h"><b>Закят аль-фитр</b>{paid && <small>отдан ✓</small>}</div>
        <small>Обязателен за себя и за каждого, кого содержишь. Отдать нужно до праздничного намаза, можно за день-два до Ида. Размер равен са‘ основной еды (около 2,5–3 кг) или его стоимости. Сумму на этот год объявляет мечеть.</small>
        <button type="button" className={paid ? 'pri-btn' : 'gold-btn'} onClick={() => update((s) => patchR(s, (x) => ({ fitr: paid ? x.fitr.filter((y) => y !== year) : [...x.fitr, year] })))}>{paid ? 'Отдан ✓' : 'Отдал'}</button>
      </div>
      <div className="h-card third">
        <b>Такбир</b>
        <p className="ar-dua" lang="ar" dir="rtl">{TAKBIR.ar}</p>
        <p className="dua-tr">{TAKBIR.tr}</p>
      </div>
      <h2 className="sub-h">Сунны Ида</h2>
      <ul className="rules">{EID_SUNNA.map((x) => <li key={x}>{x}</li>)}</ul>
      {mon.state !== 'next' && (
        <>
          <h2 className="sub-h">Итоги месяца</h2>
          <div className="rm-sum">
            <div><b>{mon.days.filter((d) => r.fasts[d] === 'fast').length}</b><small>постов</small></div>
            <div><b>{evenings.filter((e) => r.nights[e]?.includes('tarawih')).length}</b><small>таравихов</small></div>
            <div><b>{kp ? kp.done : '—'}</b><small>джузов</small></div>
            <div><b>{sq.ramadan ? sq.ramadan.given.length : '—'}</b><small>ночей садаки</small></div>
          </div>
          <div className="h-card">
            <b>Какую одну привычку оставить после Рамадана?</b>
            <div className="choices">{habits.slice(0, 6).map((x) => <button type="button" key={x.id} aria-pressed={keep === x.action} onClick={() => setKeep(x.action)}>{x.action}</button>)}</div>
            <input className="j-in" value={keep} onChange={(e) => setKeep(e.target.value)} placeholder="Или напиши свою: таравих дома 2 ракаата" />
            <button type="button" className="pri-btn" disabled={!keep.trim()} onClick={() => update((s) => patchR({ ...s, habits: s.habits.map((x) => (x.ramadan && x.action === keep.trim() ? { ...x, ramadan: undefined } : x)) }, (x) => ({ keep: { ...x.keep, [String(year)]: keep.trim() } })))}>{r.keep[String(year)] === keep.trim() && keep ? 'Сохранено ✓' : 'Сохранить'}</button>
            <small>«Самые любимые Аллаху дела те, что постоянны, даже если малы». аль-Бухари, 6464</small>
          </div>
        </>
      )}
      <div className="h-card">
        <div className="meal-h"><b>6 дней Шавваля</b><small>{sh !== null ? `${sh} из 6` : 'после Ида'}</small></div>
        <small>«Кто постился в Рамадан, а потом добавил шесть дней Шавваля, будто постился весь год». Муслим, 1164. Можно подряд или вразбивку, кроме дня Ида.</small>
        {sh !== null && hOf(today)!.day > 1 && (
          <button type="button" className={health(state).fasts[today] ? 'pri-btn' : 'gold-btn'} onClick={() => update(toggleShawwal(today))}>{health(state).fasts[today] ? 'Сегодня пощусь ✓' : 'Сегодня пощусь'}</button>
        )}
      </div>
    </>
  );
}

export const PREP: { id: string; t: string; why?: string }[] = [
  { id: 'qada', t: 'Возместить долги постов', why: 'Отметка ставится сама, когда долгов нет' },
  { id: 'shaban', t: 'Поститься в Шаабан, хотя бы по понедельникам и четвергам', why: '«Я не видела, чтобы он постился в каком-то месяце больше, чем в Шаабан». аль-Бухари, 1969; Муслим, 1156' },
  { id: 'khatm', t: 'Выбрать план хатма', why: 'Вкладка «Коран»' },
  { id: 'read', t: 'Разогнать чтение Корана: каждый день хотя бы страница' },
  { id: 'sleep', t: 'Сдвигать сон: раньше ложиться, раз в неделю вставать на тахаджуд' },
  { id: 'coffee', t: 'Постепенно меньше кофе и сладкого, чтобы первые дни поста дались легче' },
  { id: 'habits', t: 'Решить, какие привычки на минимум, а какие взять на 30 дней', why: 'Ниже на этом экране' },
  { id: 'sadaqa', t: 'Составить план садаки на последние 10 ночей', why: 'Практика → Садака → Рамадан' },
  { id: 'duas', t: 'Записать свой список дуа на Рамадан' },
  { id: 'iftar', t: 'Договориться об ифтаре с братьями или сёстрами', why: 'Вкладка «Круг»' },
];

/** Preparation items done for this Ramadan, auto ones included. */
export function prepDone(s: AppState, year: number): string[] {
  const r = ramadanOf(s);
  const manual = r.prep?.[String(year)] ?? [];
  const auto: string[] = [];
  if (Object.keys(r.fasts).length && debt(r).left === 0) auto.push('qada');
  if (r.khatm?.year === year) auto.push('khatm');
  if (Object.keys(r.plan ?? {}).length || s.habits.some((h) => h.ramadan === year)) auto.push('habits');
  if (sadaqaOf(s).ramadan) auto.push('sadaqa');
  let sh = 0;
  for (const d of Object.keys(health(s).fasts)) { const x = hOf(d); if (x?.month === 8 && x.year === year) sh++; }
  if (sh >= 4) auto.push('shaban');
  return [...new Set([...manual, ...auto])];
}

const RAMADAN_HABITS: { action: string; min: string; anchor: Anchor; sphere: Sphere }[] = [
  { action: 'Утренние азкары', min: '3 зикра', anchor: 'fajr', sphere: 'faith' },
  { action: 'Садака каждый день', min: 'монета или доброе слово', anchor: 'dhuhr', sphere: 'faith' },
  { action: 'Дуа перед ифтаром', min: 'одно дуа', anchor: 'asr', sphere: 'faith' },
  { action: 'Тафсир одного аята с семьёй', min: '1 аят', anchor: 'isha', sphere: 'family' },
];

function Prep({ state, update, today, mon }: P) {
  const r = ramadanOf(state);
  const year = mon.year;
  const done = prepDone(state, year);
  const h = hOf(today);
  const plan = r.plan ?? {};
  const regular = state.habits.filter((x) => x.status === 'active' && !x.ramadan);
  const mine = state.habits.filter((x) => x.ramadan === year);
  const dbt = debt(r);
  const toggle = (id: string) => update((s) => patchR(s, (x) => { const l = x.prep?.[String(year)] ?? []; return { prep: { ...(x.prep ?? {}), [String(year)]: l.includes(id) ? l.filter((y) => y !== id) : [...l, id] } }; }));
  const setPlan = (id: string, v: 'min' | 'pause' | null) => update((s) => patchR(s, (x) => { const p = { ...(x.plan ?? {}) }; if (v) p[id] = v; else delete p[id]; return { plan: p }; }));
  const phase = h?.month === 8 ? 'Сейчас Шаабан, последний месяц перед Рамаданом. Самое время поститься чаще и закрыть долги.' : h?.month === 7 ? 'Сейчас Раджаб. Начни потихоньку: два месяца хватит, чтобы войти в Рамадан готовым.' : mon.state === 'now' ? 'Рамадан уже идёт. Здесь можно поменять план привычек.' : 'Подготовку удобно начинать за два месяца, в Раджаб. Можно и раньше.';
  return (
    <>
      <div className="h-card h-hero">
        <small>{mon.state === 'next' ? `До Рамадана ${mon.daysTo} дн.` : 'Подготовка'}</small>
        <b className="h-big sm">{done.length} из {PREP.length}</b>
        <div className="bar2 wide"><i style={{ width: `${(done.length / PREP.length) * 100}%` }} /></div>
        <small>{phase}</small>
      </div>
      {PREP.map((p) => {
        const on = done.includes(p.id);
        const auto = ['qada', 'khatm', 'habits', 'sadaqa', 'shaban'].includes(p.id) && on && !(r.prep?.[String(year)] ?? []).includes(p.id);
        return (
          <button type="button" key={p.id} className={`h-card sunna${on ? ' on' : ''}`} onClick={() => !auto && toggle(p.id)}>
            <span className="meal-h"><b>{on ? '✓ ' : ''}{p.t}</b></span>
            {p.id === 'qada' && dbt.left > 0 && <small>Осталось {dbt.left} дн. Отмечай возмещение во вкладке «Пост».</small>}
            {p.why && <small className={p.why.startsWith('«') ? 'src' : ''}>{p.why}</small>}
          </button>
        );
      })}

      <h2 className="sub-h">Привычки в Рамадан</h2>
      <p className="q-msg left">В пост сил меньше. Реши заранее, что держать как обычно, что на минимуме, а что поставить на паузу. Пауза и минимум не ломают серию.</p>
      {regular.length === 0 && <p className="q-msg left tiny-note">Активных привычек пока нет.</p>}
      {regular.map((x: Habit) => (
        <div key={x.id} className="h-card">
          <b>{x.action}</b>
          <div className="choices">
            {([[null, 'Как обычно'], ['min', `Минимум${x.min ? `: ${x.min}` : ''}`], ['pause', 'Пауза']] as const).map(([v, l]) => (
              <button type="button" key={String(v)} aria-pressed={(plan[x.id] ?? null) === v} onClick={() => setPlan(x.id, v)}>{l}</button>
            ))}
          </div>
        </div>
      ))}
      <h2 className="sub-h">Только на 30 дней</h2>
      <p className="q-msg left">Эти привычки появятся в первый день Рамадана и не занимают место в лимите из пяти. На Ид спросим, какую оставить.</p>
      {RAMADAN_HABITS.map((t) => {
        const added = mine.find((m) => m.action === t.action);
        return (
          <div key={t.action} className="h-card">
            <div className="meal-h"><b>{t.action}</b><small>минимум: {t.min}</small></div>
            <button type="button" className={added ? 'pri-btn' : 'ghost-btn'} onClick={() => update((s) => added
              ? { ...s, habits: s.habits.filter((y) => y.id !== added.id) }
              : { ...s, habits: [...s.habits, { id: uid(), action: t.action, min: t.min, anchor: t.anchor, sphere: t.sphere, status: 'active', createdAt: mon.days[0] ?? today, ramadan: year }] })}>{added ? 'Добавлено ✓' : '+ На Рамадан'}</button>
          </div>
        );
      })}
    </>
  );
}
