import { Zakat } from './Zakat';
import { GiftPassCard } from './GiftPass';
import { GiftProCard, GiftPro, WhereRow, WhereToGive } from './SadaqaPay';
import { useState } from 'react';
import type { AppState, SadaqaDay, SadaqaState } from '../types';
import { addDays, fromKey } from '../dates';
import { hijri } from '../health';
import { _t, _tj, LOC } from '../i18n';

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void; startSub?: 'gift' }

export const sadaqaOf = (s: AppState): SadaqaState => ({ days: {}, secret: true, cur: '€', ramadan: null, jariya: [], ...(s.sadaqa ?? {}) });
const patch = (s: AppState, fn: (q: SadaqaState) => Partial<SadaqaState>): AppState => { const q = sadaqaOf(s); return { ...s, sadaqa: { ...q, ...fn(q) } }; };
const given = (d?: SadaqaDay) => Boolean(d?.money || d?.deed);

/** Good deeds that count as sadaqa, one offered per day. */
export const DEEDS: { t: string; src: string }[] = [
  { t: _t("Улыбнись брату или сестре"), src: _t("«Твоя улыбка брату — садака». ат-Тирмизи, 1956") },
  { t: _t("Скажи кому-то доброе слово"), src: _t("«Доброе слово — садака». аль-Бухари, 2989; Муслим, 1009") },
  { t: _t("Убери что-то вредное с дороги"), src: _t("«Убрать вредное с дороги — садака». аль-Бухари, 2989; Муслим, 1009") },
  { t: _t("Помоги человеку донести вещи"), src: _t("«Помочь человеку сесть на верховое животное или поднять на него поклажу — садака». аль-Бухари, 2989") },
  { t: _t("Иди в мечеть пешком"), src: _t("«Каждый шаг, который делаешь к намазу, — садака». аль-Бухари, 2989; Муслим, 1009") },
  { t: _t("Потрать на семью с намерением награды"), src: _t("«Когда человек тратит на семью, надеясь на награду, это для него садака». аль-Бухари, 55") },
  { t: _t("Сделай 33 тасбиха, тахмида и такбира"), src: _t("«Каждый тасбих — садака, каждый тахмид — садака…». Муслим, 1006") },
  { t: _t("Помири двоих, кто в ссоре"), src: _t("«Рассудить двоих по справедливости — садака». аль-Бухари, 2989") },
  { t: _t("Покажи дорогу или помоги советом"), src: _t("«Указать дорогу заблудившемуся — садака». ат-Тирмизи, 1956") },
  { t: _t("Поделись водой или едой с соседом"), src: _t("«Налить из своего ведра в ведро брата — садака». ат-Тирмизи, 1956") },
  { t: _t("Первым поприветствуй салямом"), src: _t("«Лучший ислам: кормить едой и приветствовать знакомых и незнакомых». аль-Бухари, 12") },
  { t: _t("Посади растение или покорми птиц"), src: _t("«Если мусульманин посадит растение и от него поест птица или человек, это садака». аль-Бухари, 2320; Муслим, 1553") },
  { t: _t("Удержись сегодня от одного зла"), src: _t("«Пусть удерживается от зла, это для него садака». аль-Бухари, 1445") },
];
const FOR_BASE = [_t("за себя"), _t("за маму"), _t("за отца"), _t("за умерших")];
const JARIYA_KINDS = [_t("Вода и колодец"), _t("Мечеть"), _t("Коран и книги"), _t("Обучение"), _t("Дерево"), _t("Сироты"), _t("Другое")];

export function deedOf(today: string) {
  const n = Math.floor(fromKey(today).getTime() / 86400000);
  return DEEDS[((n % DEEDS.length) + DEEDS.length) % DEEDS.length];
}

/** Days in a row with any sadaqa; one missed day is forgiven, two in a row end it. */
export function sadaqaStreak(q: SadaqaState, today: string) {
  let n = given(q.days[today]) ? 1 : 0, miss = 0;
  for (let i = 1; i < 800; i++) {
    if (given(q.days[addDays(today, -i)])) { n++; miss = 0; } else if (++miss >= 2) break;
  }
  return n;
}

/** Ramadan nights 21..30 as {night, share}; odd nights can weigh double. */
export function ramadanPlan(total: number, odd2: boolean) {
  const nights = Array.from({ length: 10 }, (_, i) => 21 + i);
  const w = nights.map((n) => (odd2 && n % 2 ? 2 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return nights.map((n, i) => ({ night: n, share: Math.round((total * w[i] * 100) / sum) / 100 }));
}

/** Which of the last ten nights is tonight (the night begins at Maghrib of the day before), or days until night 21. */
function ramadanNow(today: string): { night: number | null; daysTo: number | null } {
  const h = hijri(fromKey(today));
  if (h?.month === 9 && h.day >= 20) return { night: h.day + 1 <= 30 ? h.day + 1 : null, daysTo: null };
  for (let i = 1; i < 400; i++) {
    const x = hijri(fromKey(addDays(today, i)));
    if (x?.month === 9 && x.day === 20) return { night: null, daysTo: i };
  }
  return { night: null, daysTo: null };
}

function Money({ v, cur, secret }: { v: number; cur: string; secret: boolean }) {
  const [show, setShow] = useState(false);
  const txt = `${v.toLocaleString(LOC, { maximumFractionDigits: 2 })} ${cur}`;
  if (!secret || show) return <span className="money" onClick={() => secret && setShow(false)}>{txt}</span>;
  return <button type="button" className="money hid" onClick={() => setShow(true)} aria-label={_t("Показать сумму")}>{txt}</button>;
}

export function Sadaqa({ state, update, today, onExit, startSub }: Props) {
  const [tab, setTab] = useState<'day' | 'ramadan' | 'jariya' | 'zakat'>('day');
  const [sub, setSub] = useState<'' | 'gift' | 'where'>(startSub ?? '');
  const q = sadaqaOf(state);
  const d = q.days[today] ?? {};
  const [amt, setAmt] = useState(d.amt ? String(d.amt) : '');
  const setDay = (fn: (x: SadaqaDay) => SadaqaDay) => update((s) => patch(s, (y) => {
    const nd = fn({ ...(y.days[today] ?? {}) });
    const days = { ...y.days };
    if (!nd.money && !nd.deed) delete days[today]; else days[today] = nd;
    return { days };
  }));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const deed = deedOf(today);
  const streak = sadaqaStreak(q, today);
  const month = Object.entries(q.days).filter(([k]) => k.slice(0, 7) === today.slice(0, 7));
  const monthSum = month.reduce((a, [, x]) => a + (x.amt ?? 0), 0);
  const rem = state.settings.reminders;
  const remV = rem?.sadaqa ?? 'fri';
  const setRem = (v: 'fri' | 'day' | 'off') => update((s) => ({ ...s, settings: { ...s.settings, reminders: { ...(s.settings.reminders ?? { on: false, prayers: [], before: 0, muhasaba: '' }), sadaqa: v } } }));
  const forList = [...FOR_BASE, ...(q.forList ?? [])];
  const [forNew, setForNew] = useState<string | null>(null);
  const addFor = () => {
    const v = (forNew ?? '').trim().slice(0, 30);
    if (v) update((s) => patch(s, (y) => ({ forList: [...(y.forList ?? []).filter((x) => x !== v), v].slice(-6) })));
    if (v) setDay((x) => ({ ...x, for: v }));
    setForNew(null);
  };

  if (sub) return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={() => setSub('')} aria-label={_t("Назад")}>‹</button>
        <div><b>{sub === 'gift' ? _t("Подари Pro") : _t("Куда отдать")}</b><small>{sub === 'gift' ? _t("тому, кто не может заплатить") : _t("проверенные фонды")}</small></div>
      </div>
      <div className="h-wrap">
        {sub === 'gift' ? <GiftPro /> : (
          <WhereToGive
            onMark={() => setDay((x) => ({ ...x, money: true }))}
            onJariya={(c) => update((s) => patch(s, (y) => ({ jariya: y.jariya.some((j) => j.title === c.title && j.date === today) ? y.jariya : [{ id: Date.now().toString(36), title: c.title, kind: c.kind === 'water' ? JARIYA_KINDS[0] : c.kind === 'mosque' ? JARIYA_KINDS[1] : c.kind === 'orphans' ? JARIYA_KINDS[5] : JARIYA_KINDS[6], forWhom: d.for && d.for !== FOR_BASE[0] ? d.for : undefined, date: today }, ...y.jariya] })))}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Садака")}</b><small>{_t("Понемногу, но постоянно. Об этом знаете ты и Аллах")}</small></div>
      </div>
      <div className="seg">
        {([['day', _t("День")], ['ramadan', _t("Рамадан")], ['jariya', _t("Джария")], ['zakat', _t("Закят")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'day' && (
          <>
            <div className="h-card h-hero">
              <small>{_t("Серия")}</small>
              <b className="h-big sm">{streak} {streak % 10 === 1 && streak % 100 !== 11 ? _t("день") : streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 10 || streak % 100 >= 20) ? _t("дня") : _t("дней")}</b>
              <div className="dots7">{week.map((x) => <i key={x} data-on={given(q.days[x])} />)}</div>
              <small>{_t("«Самые любимые Аллаху дела те, что постоянны, даже если малы». аль-Бухари, 6464; Муслим, 783")}</small>
            </div>

            <div className="h-card">
              <div className="meal-h"><b>{_t("Деньгами")}</b><small>{_t("сумму писать не обязательно")}</small></div>
              <button type="button" className={d.money ? 'pri-btn' : 'gold-btn'} onClick={() => setDay((x) => ({ ...x, money: !x.money, amt: x.money ? undefined : x.amt }))}>{d.money ? _t("Сегодня дал ✓") : _t("Сегодня дал")}</button>
              {d.money && (
                <div className="task-add">
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={_t("сумма, {0}", q.cur)} className={q.secret ? 'secret-in' : ''} />
                  <button type="button" className="ghost-btn" onClick={() => setDay((x) => ({ ...x, amt: Number(amt) > 0 ? Math.round(Number(amt) * 100) / 100 : undefined }))}>{_t("Сохранить")}</button>
                </div>
              )}
              {(d.money || d.deed) && (
                <div className="sq-for">
                  <small>{_t("За кого")}</small>
                  <div className="choices">
                    {forList.map((f) => <button key={f} type="button" aria-pressed={d.for === f} onClick={() => setDay((x) => ({ ...x, for: x.for === f ? undefined : f }))}>{f}</button>)}
                    {forNew === null ? <button type="button" aria-label={_t("Добавить своё")} onClick={() => setForNew('')}>＋</button> : (
                      <span className="sq-for-new"><input autoFocus value={forNew} maxLength={30} onChange={(e) => setForNew(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFor()} placeholder={_t("за деда")} /><button type="button" onClick={addFor}>OK</button></span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <MonthCal q={q} today={today} />

            <GiftProCard onOpen={() => setSub('gift')} />
            <WhereRow onOpen={() => setSub('where')} />

            <div className="h-card deed">
              <div className="meal-h"><b>{_t("Доброе дело дня")}</b><small>{_t("тоже садака")}</small></div>
              <p className="deed-t">{deed.t}</p>
              <small className="src">{deed.src}</small>
              <button type="button" className={d.deed ? 'pri-btn' : 'gold-btn'} onClick={() => setDay((x) => ({ ...x, deed: !x.deed }))}>{d.deed ? _t("Сделал ✓") : _t("Сделал")}</button>
            </div>

            <GiftPassCard />

            <div className="h-card">
              <div className="meal-h"><b>{_t("Тайная садака")}</b>
                <label className="switch"><input type="checkbox" checked={q.secret} onChange={(e) => update((s) => patch(s, () => ({ secret: e.target.checked })))} /><span /></label>
              </div>
              <small>{q.secret ? _t("Суммы скрыты, пока не нажмёшь на них. Суммы в Круг не попадают никогда.") : _t("Суммы видны только тебе. В Круг они не попадают никогда.")}</small>
              <small className="src">{_t("«…так, что его левая рука не знает, что расходует правая». аль-Бухари, 1423")}</small>
              {monthSum > 0 && <div className="meal-h"><small>{_t("За этот месяц")}</small><Money v={monthSum} cur={q.cur} secret={q.secret} /></div>}
              <div className="meal-h"><small>{_t("Валюта")}</small>
                <select value={q.cur} onChange={(e) => update((s) => patch(s, () => ({ cur: e.target.value })))}>
                  {['€', '$', '₽', '£', '₸', _t("сум"), '₺', 'AED', 'SAR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="h-card">
              <div className="meal-h"><b>{_t("Напоминание")}</b></div>
              <div className="choices">
                {([['fri', _t("Пятница утром")], ['day', _t("Каждое утро")], ['off', _t("Выкл.")]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={remV === k} onClick={() => setRem(k)}>{l}</button>)}
              </div>
              {!rem?.on && remV !== 'off' && <small>{_t("Напоминания на телефоне выключены. Включи их в Профиль → Напоминания, и садака придёт вместе с ними.")}</small>}
              <small className="src">{_t("«Каждый день, когда люди просыпаются, нисходят два ангела. Один говорит: „О Аллах, дай расходующему замену“». аль-Бухари, 1442")}</small>
            </div>

            <div className="h-card">
              <div className="meal-h"><b>{_t("Садака круга")}</b>
                <label className="switch"><input type="checkbox" checked={Boolean(q.circle)} onChange={(e) => update((s) => patch(s, () => ({ circle: e.target.checked })))} /><span /></label>
              </div>
              <small>{q.circle ? _t("Круг видит только общее число: «7 из 9 отдали садаку на этой неделе». Без сумм и без имён.") : _t("Выключено: круг ничего не знает о твоей садаке. Включи, если твой круг ставит общую цель садаки.")}</small>
            </div>
            <p className="q-msg left tiny-note">{_t("«Садака не уменьшает имущества». Муслим, 2588")}</p>
          </>
        )}

        {tab === 'ramadan' && <Ramadan q={q} update={update} today={today} />}
        {tab === 'jariya' && <Jariya q={q} update={update} today={today} />}
        {tab === 'zakat' && <Zakat state={state} update={update} l={state.settings.lang ?? 'ru'} />}
      </div>
    </div>
  );
}

/** This month: each day by colour (money, deed, both). Amounts never show here. */
function MonthCal({ q, today }: { q: SadaqaState; today: string }) {
  const first = `${today.slice(0, 8)}01`;
  const lead = (fromKey(first).getDay() + 6) % 7; // weeks start on Monday
  const n = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const cells = Array.from({ length: lead + n }, (_, i) => (i < lead ? '' : addDays(first, i - lead)));
  const days = cells.filter(Boolean).filter((k) => k <= today && given(q.days[k])).length;
  return (
    <div className="h-card sq-cal">
      <div className="meal-h"><b>{_t("Этот месяц")}</b><small>{_tj("{0} из {1} дней", days, Number(today.slice(8)))}</small></div>
      <div className="sq-grid">
        {cells.map((k, i) => {
          if (!k) return <i key={i} className="pad" />;
          const x = q.days[k];
          const c = x?.money && x?.deed ? 'b' : x?.money ? 'm' : x?.deed ? 'd' : '';
          return <i key={k} className={`${c}${k === today ? ' now' : ''}${k > today ? ' fut' : ''}`} title={x?.for ?? ''}>{Number(k.slice(8))}</i>;
        })}
      </div>
      <div className="sq-leg"><span><i className="m" />{_t("деньгами")}</span><span><i className="d" />{_t("делом")}</span><span><i className="b" />{_t("и то и то")}</span></div>
    </div>
  );
}

function Ramadan({ q, update, today }: { q: SadaqaState; update: Props['update']; today: string }) {
  const [v, setV] = useState(q.ramadan ? String(q.ramadan.total) : '');
  const now = ramadanNow(today);
  const r = q.ramadan;
  const plan = r ? ramadanPlan(r.total, r.odd2) : [];
  const sent = r ? plan.filter((p) => r.given.includes(p.night)).reduce((a, p) => a + p.share, 0) : 0;
  return (
    <>
      <p className="q-msg left">{_t("Задай сумму на последние 10 ночей Рамадана. Приложение разделит её по ночам, и часть садаки точно придётся на Ляйлят аль-Кадр.")}</p>
      <div className="h-card h-hero">
        <small>{now.night ? _t("Сегодня") : _t("До последних 10 ночей")}</small>
        <b className="h-big sm">{now.night ? _t("{0}-я ночь{1}", now.night, now.night % 2 ? _t(", нечётная") : '') : now.daysTo != null ? _t("{0} дн.", now.daysTo) : '—'}</b>
        <small>{_t("«Ищите Ночь предопределения в нечётные ночи из последних десяти ночей Рамадана». аль-Бухари, 2017")}</small>
      </div>
      <div className="task-add">
        <input type="number" inputMode="decimal" min="0" value={v} onChange={(e) => setV(e.target.value)} placeholder={_t("всего, {0}", q.cur)} className={q.secret ? 'secret-in' : ''} />
        <button type="button" className="pri-btn" disabled={!(Number(v) > 0)} onClick={() => update((s) => patch(s, (y) => ({ ramadan: { total: Number(v), odd2: y.ramadan?.odd2 ?? false, given: y.ramadan?.given ?? [] } })))}>{r ? _t("Обновить") : _t("Распределить")}</button>
      </div>
      {r && (
        <>
          <label className="check-row"><input type="checkbox" checked={r.odd2} onChange={(e) => update((s) => patch(s, (y) => ({ ramadan: { ...y.ramadan!, odd2: e.target.checked } })))} />{_t(" В нечётные ночи вдвое больше")}</label>
          <div className="nights">
            {plan.map((p) => {
              const on = r.given.includes(p.night);
              return (
                <button type="button" key={p.night} className={`night${p.night % 2 ? ' odd' : ''}${on ? ' on' : ''}${now.night === p.night ? ' now' : ''}`} onClick={() => update((s) => patch(s, (y) => ({ ramadan: { ...y.ramadan!, given: on ? y.ramadan!.given.filter((n) => n !== p.night) : [...y.ramadan!.given, p.night] } })))}>
                  <b>{p.night}</b><Money v={p.share} cur={q.cur} secret={q.secret} />{on && <i>✓</i>}
                </button>
              );
            })}
          </div>
          <p className="q-msg left">{_tj("Отдано {0} из 10 ночей{1}. Ночь начинается с Магриба: садаку 21-й ночи отдают вечером 20-го дня. Удобно настроить автоплатёж в своём фонде и отмечать здесь.", r.given.length, q.secret ? '' : _t(", {0} {1} из {2} {3}", Math.round(sent * 100) / 100, q.cur, r.total, q.cur))}</p>
          <button type="button" className="ghost-btn" onClick={() => update((s) => patch(s, () => ({ ramadan: null })))}>{_t("Сбросить план")}</button>
        </>
      )}
    </>
  );
}

function Jariya({ q, update, today }: { q: SadaqaState; update: Props['update']; today: string }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(JARIYA_KINDS[0]);
  const [forWhom, setFor] = useState('');
  return (
    <>
      <div className="h-card third">
        <b>{_t("Садака, которая продолжается")}</b>
        <small>{_t("«Когда человек умирает, его дела прекращаются, кроме трёх: продолжающейся садаки, знания, которое приносит пользу, и праведного ребёнка, который молится за него». Муслим, 1631")}</small>
        <small>{_t("Садака за умерших родителей доходит до них: Саад ибн Убада сделал садаку за мать с позволения Пророка ﷺ. аль-Бухари, 2756")}</small>
      </div>
      <div className="h-card">
        <b>{_t("Записать")}</b>
        <input className="j-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={_t("Например: колодец в Чаде через фонд")} />
        <div className="choices">{JARIYA_KINDS.map((k) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
        <input className="j-in" value={forWhom} onChange={(e) => setFor(e.target.value)} placeholder={_t("За кого (необязательно): за маму, за деда")} />
        <button type="button" className="pri-btn" disabled={!title.trim()} onClick={() => {
          update((s) => patch(s, (y) => ({ jariya: [{ id: Date.now().toString(36), title: title.trim(), kind, forWhom: forWhom.trim() || undefined, date: today }, ...y.jariya] })));
          setTitle(''); setFor('');
        }}>{_t("Добавить")}</button>
      </div>
      {q.jariya.length === 0 && <p className="q-msg left">{_t("Пока пусто. Даже вклад в общий проект считается: часть колодца, страница в Коране для мечети, оплата урока.")}</p>}
      {q.jariya.map((j) => (
        <div key={j.id} className="h-card">
          <div className="meal-h"><b>{j.title}</b><small>{fromKey(j.date).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
          <small>{j.kind}{j.forWhom ? ` · ${j.forWhom}` : ''}</small>
          <button type="button" className="link-btn" onClick={() => update((s) => patch(s, (y) => ({ jariya: y.jariya.filter((x) => x.id !== j.id) })))}>{_t("Удалить")}</button>
        </div>
      ))}
    </>
  );
}
