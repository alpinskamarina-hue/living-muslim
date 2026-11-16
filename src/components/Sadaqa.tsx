import { useState } from 'react';
import type { AppState, SadaqaDay, SadaqaState } from '../types';
import { addDays, fromKey } from '../dates';
import { hijri } from '../health';

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void }

export const sadaqaOf = (s: AppState): SadaqaState => ({ days: {}, secret: true, cur: '€', ramadan: null, jariya: [], ...(s.sadaqa ?? {}) });
const patch = (s: AppState, fn: (q: SadaqaState) => Partial<SadaqaState>): AppState => { const q = sadaqaOf(s); return { ...s, sadaqa: { ...q, ...fn(q) } }; };
const given = (d?: SadaqaDay) => Boolean(d?.money || d?.deed);

/** Good deeds that count as sadaqa, one offered per day. */
export const DEEDS: { t: string; src: string }[] = [
  { t: 'Улыбнись брату или сестре', src: '«Твоя улыбка брату — садака». ат-Тирмизи, 1956' },
  { t: 'Скажи кому-то доброе слово', src: '«Доброе слово — садака». аль-Бухари, 2989; Муслим, 1009' },
  { t: 'Убери что-то вредное с дороги', src: '«Убрать вредное с дороги — садака». аль-Бухари, 2989; Муслим, 1009' },
  { t: 'Помоги человеку донести вещи', src: '«Помочь человеку сесть на верховое животное или поднять на него поклажу — садака». аль-Бухари, 2989' },
  { t: 'Иди в мечеть пешком', src: '«Каждый шаг, который делаешь к намазу, — садака». аль-Бухари, 2989; Муслим, 1009' },
  { t: 'Потрать на семью с намерением награды', src: '«Когда человек тратит на семью, надеясь на награду, это для него садака». аль-Бухари, 55' },
  { t: 'Сделай 33 тасбиха, тахмида и такбира', src: '«Каждый тасбих — садака, каждый тахмид — садака…». Муслим, 1006' },
  { t: 'Помири двоих, кто в ссоре', src: '«Рассудить двоих по справедливости — садака». аль-Бухари, 2989' },
  { t: 'Покажи дорогу или помоги советом', src: '«Указать дорогу заблудившемуся — садака». ат-Тирмизи, 1956' },
  { t: 'Поделись водой или едой с соседом', src: '«Налить из своего ведра в ведро брата — садака». ат-Тирмизи, 1956' },
  { t: 'Первым поприветствуй салямом', src: '«Лучший ислам: кормить едой и приветствовать знакомых и незнакомых». аль-Бухари, 12' },
  { t: 'Посади растение или покорми птиц', src: '«Если мусульманин посадит растение и от него поест птица или человек, это садака». аль-Бухари, 2320; Муслим, 1553' },
  { t: 'Удержись сегодня от одного зла', src: '«Пусть удерживается от зла, это для него садака». аль-Бухари, 1445' },
];
const JARIYA_KINDS = ['Вода и колодец', 'Мечеть', 'Коран и книги', 'Обучение', 'Дерево', 'Сироты', 'Другое'];

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
  const txt = `${v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${cur}`;
  if (!secret || show) return <span className="money" onClick={() => secret && setShow(false)}>{txt}</span>;
  return <button type="button" className="money hid" onClick={() => setShow(true)} aria-label="Показать сумму">{txt}</button>;
}

export function Sadaqa({ state, update, today, onExit }: Props) {
  const [tab, setTab] = useState<'day' | 'ramadan' | 'jariya'>('day');
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

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>Садака</b><small>Понемногу, но постоянно. Об этом знаете ты и Аллах</small></div>
      </div>
      <div className="seg">
        {([['day', 'День'], ['ramadan', 'Рамадан'], ['jariya', 'Джария']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'day' && (
          <>
            <div className="h-card h-hero">
              <small>Серия</small>
              <b className="h-big sm">{streak} {streak % 10 === 1 && streak % 100 !== 11 ? 'день' : streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 10 || streak % 100 >= 20) ? 'дня' : 'дней'}</b>
              <div className="dots7">{week.map((x) => <i key={x} data-on={given(q.days[x])} />)}</div>
              <small>«Самые любимые Аллаху дела те, что постоянны, даже если малы». аль-Бухари, 6464; Муслим, 783</small>
            </div>

            <div className="h-card">
              <div className="meal-h"><b>Деньгами</b><small>сумму писать не обязательно</small></div>
              <button type="button" className={d.money ? 'pri-btn' : 'gold-btn'} onClick={() => setDay((x) => ({ ...x, money: !x.money, amt: x.money ? undefined : x.amt }))}>{d.money ? 'Сегодня дал ✓' : 'Сегодня дал'}</button>
              {d.money && (
                <div className="task-add">
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={`сумма, ${q.cur}`} className={q.secret ? 'secret-in' : ''} />
                  <button type="button" className="ghost-btn" onClick={() => setDay((x) => ({ ...x, amt: Number(amt) > 0 ? Math.round(Number(amt) * 100) / 100 : undefined }))}>Сохранить</button>
                </div>
              )}
            </div>

            <div className="h-card deed">
              <div className="meal-h"><b>Доброе дело дня</b><small>тоже садака</small></div>
              <p className="deed-t">{deed.t}</p>
              <small className="src">{deed.src}</small>
              <button type="button" className={d.deed ? 'pri-btn' : 'gold-btn'} onClick={() => setDay((x) => ({ ...x, deed: !x.deed }))}>{d.deed ? 'Сделал ✓' : 'Сделал'}</button>
            </div>

            <div className="h-card">
              <div className="meal-h"><b>Тайная садака</b>
                <label className="switch"><input type="checkbox" checked={q.secret} onChange={(e) => update((s) => patch(s, () => ({ secret: e.target.checked })))} /><span /></label>
              </div>
              <small>{q.secret ? 'Суммы скрыты, пока не нажмёшь на них. В Круг садака не попадает никогда.' : 'Суммы видны. В Круг садака всё равно не попадает.'}</small>
              <small className="src">«…так, что его левая рука не знает, что расходует правая». аль-Бухари, 1423</small>
              {monthSum > 0 && <div className="meal-h"><small>За этот месяц</small><Money v={monthSum} cur={q.cur} secret={q.secret} /></div>}
              <div className="meal-h"><small>Валюта</small>
                <select value={q.cur} onChange={(e) => update((s) => patch(s, () => ({ cur: e.target.value })))}>
                  {['€', '$', '₽', '£', '₸', 'сум', '₺', 'AED', 'SAR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <p className="q-msg left tiny-note">«Садака не уменьшает имущества». Муслим, 2588</p>
          </>
        )}

        {tab === 'ramadan' && <Ramadan q={q} update={update} today={today} />}
        {tab === 'jariya' && <Jariya q={q} update={update} today={today} />}
      </div>
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
      <p className="q-msg left">Задай сумму на последние 10 ночей Рамадана. Приложение разделит её по ночам, и часть садаки точно придётся на Ляйлят аль-Кадр.</p>
      <div className="h-card h-hero">
        <small>{now.night ? 'Сегодня' : 'До последних 10 ночей'}</small>
        <b className="h-big sm">{now.night ? `${now.night}-я ночь${now.night % 2 ? ', нечётная' : ''}` : now.daysTo != null ? `${now.daysTo} дн.` : '—'}</b>
        <small>«Ищите Ночь предопределения в нечётные ночи из последних десяти ночей Рамадана». аль-Бухари, 2017</small>
      </div>
      <div className="task-add">
        <input type="number" inputMode="decimal" min="0" value={v} onChange={(e) => setV(e.target.value)} placeholder={`всего, ${q.cur}`} className={q.secret ? 'secret-in' : ''} />
        <button type="button" className="pri-btn" disabled={!(Number(v) > 0)} onClick={() => update((s) => patch(s, (y) => ({ ramadan: { total: Number(v), odd2: y.ramadan?.odd2 ?? false, given: y.ramadan?.given ?? [] } })))}>{r ? 'Обновить' : 'Распределить'}</button>
      </div>
      {r && (
        <>
          <label className="check-row"><input type="checkbox" checked={r.odd2} onChange={(e) => update((s) => patch(s, (y) => ({ ramadan: { ...y.ramadan!, odd2: e.target.checked } })))} /> В нечётные ночи вдвое больше</label>
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
          <p className="q-msg left">Отдано {r.given.length} из 10 ночей{q.secret ? '' : `, ${Math.round(sent * 100) / 100} ${q.cur} из ${r.total} ${q.cur}`}. Ночь начинается с Магриба: садаку 21-й ночи отдают вечером 20-го дня. Удобно настроить автоплатёж в своём фонде и отмечать здесь.</p>
          <button type="button" className="ghost-btn" onClick={() => update((s) => patch(s, () => ({ ramadan: null })))}>Сбросить план</button>
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
        <b>Садака, которая продолжается</b>
        <small>«Когда человек умирает, его дела прекращаются, кроме трёх: продолжающейся садаки, знания, которое приносит пользу, и праведного ребёнка, который молится за него». Муслим, 1631</small>
        <small>Садака за умерших родителей доходит до них: Саад ибн Убада сделал садаку за мать с позволения Пророка ﷺ. аль-Бухари, 2756</small>
      </div>
      <div className="h-card">
        <b>Записать</b>
        <input className="j-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: колодец в Чаде через фонд" />
        <div className="choices">{JARIYA_KINDS.map((k) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
        <input className="j-in" value={forWhom} onChange={(e) => setFor(e.target.value)} placeholder="За кого (необязательно): за маму, за деда" />
        <button type="button" className="pri-btn" disabled={!title.trim()} onClick={() => {
          update((s) => patch(s, (y) => ({ jariya: [{ id: Date.now().toString(36), title: title.trim(), kind, forWhom: forWhom.trim() || undefined, date: today }, ...y.jariya] })));
          setTitle(''); setFor('');
        }}>Добавить</button>
      </div>
      {q.jariya.length === 0 && <p className="q-msg left">Пока пусто. Даже вклад в общий проект считается: часть колодца, страница в Коране для мечети, оплата урока.</p>}
      {q.jariya.map((j) => (
        <div key={j.id} className="h-card">
          <div className="meal-h"><b>{j.title}</b><small>{fromKey(j.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
          <small>{j.kind}{j.forWhom ? ` · ${j.forWhom}` : ''}</small>
          <button type="button" className="link-btn" onClick={() => update((s) => patch(s, (y) => ({ jariya: y.jariya.filter((x) => x.id !== j.id) })))}>Удалить</button>
        </div>
      ))}
    </>
  );
}
