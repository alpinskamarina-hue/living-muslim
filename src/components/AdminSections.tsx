import { useEffect, useMemo, useState } from 'react';
import { accessToken } from '../auth';
import { actName, GROUPS, secInfo, type SecGroup } from '../sections';
import { catalog } from '../videos';

// Owner analytics by section: which parts of the app people use, whether they come back, what they do inside,
// and a short «what to develop» list. Numbers come from lm_admin_sections / lm_admin_section (supabase/usage.sql),
// which check the owner's email on the server. Counting is anonymous: a random device id, no names or content.

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

interface KN { k: string; n: number }
interface Sec { k: string; u: number; p: number; o: number; dpp: number | null; one: number; did: number }
interface Srv { n: number; u: number; p: number }
interface Data {
  from: string; days: number; since: string | null;
  active_today: number; today_prev: number; active: number; active_prev: number; wau: number; mau: number; dau_avg: number;
  series: { d: string; v: number }[];
  retention: { n: number; base: number; back: number }[] | null;
  funnel: { landing: number; app: number; account: number; circle: number; back7: number } | null;
  sections: Sec[] | null;
  courses: { k: string; st: number; hf: number; dn: number; ls: number }[] | null;
  course_marks: { k: string; dn: number; dn_all: number; avg: number | null; nr: number }[] | null;
  acts: { k: string; u: number; n: number }[] | null;
  errors?: Record<string, string>;
  [srv: `srv_${string}`]: Srv | null | undefined;
}
interface Detail {
  users: number; active: number; dpp: number | null;
  series: { d: string; v: number }[];
  acts: { k: string; u: number; n: number }[]; via: KN[]; langs: KN[]; devices: KN[];
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const t = await accessToken();
  if (!t) return null;
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) { let m = ''; try { const j = await r.json(); m = j.message || j.hint || ''; } catch { /* */ } throw new Error(`${r.status} ${m}`.trim()); }
  return (await r.json()) as T;
}

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('ru-RU'));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const dShort = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day}.${String(m).padStart(2, '0')}`; };
const DEV: Record<string, string> = { mobile: 'Телефон', tablet: 'Планшет', desktop: 'Компьютер', '?': 'Неизвестно' };
const LANG: Record<string, string> = { ru: 'Русский', en: 'Английский', '?': 'Неизвестно' };

/** Change against the previous period, in percent; null when there is nothing to compare with. */
function trend(now: number, prev: number): number | null { return prev > 0 ? Math.round(((now - prev) / prev) * 100) : null; }
function Trend({ now, prev, small }: { now: number; prev: number; small?: boolean }) {
  const t = trend(now, prev);
  if (t === null) return now > 0 ? <em className={`as-tr new${small ? ' sm' : ''}`}>новое</em> : null;
  return <em className={`as-tr ${t > 0 ? 'up' : t < 0 ? 'down' : ''}${small ? ' sm' : ''}`}>{t > 0 ? '▲' : t < 0 ? '▼' : '='} {Math.abs(t)}%</em>;
}

const SRV: [string, string, string][] = [
  ['chat', 'Чат кругов', 'сообщений'], ['dm', 'Личные сообщения', 'сообщений'], ['ai', 'Помощник', 'вопросов'],
  ['stories', 'Сторис', 'сторис'], ['posts', 'Посты в кругах', 'постов'], ['dua', 'Просьбы о дуа (общий круг)', 'просьб'],
  ['nikah', 'Никах', 'новых анкет'], ['courses', 'Курсы', 'сертификатов'], ['umrah', 'Умра: заявки в группы', 'заявок'],
];

type View = 'overview' | 'list' | 'study' | 'insights';

export function AdminSections() {
  const [days, setDays] = useState(30);
  const [view, setView] = useState<View>('overview');
  const [open, setOpen] = useState<string | null>(null);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = (n = days) => {
    setBusy(true); setErr('');
    call<Data>('lm_admin_sections', { p_days: n }).then((x) => { if (x) setD(x); else setErr('Нет доступа. Войди по почте владельца в Профиль → Аккаунт.'); })
      .catch((e) => setErr(`Не получилось загрузить (${e instanceof Error ? e.message : e}). Проверь, что usage.sql запущен в Supabase.`)).finally(() => setBusy(false));
  };
  useEffect(() => { load(days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const period = (
    <div className="seg adm-seg">
      {[[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней'], [90, '90 дней']].map(([n, l]) => (
        <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n as number)}>{l}</button>
      ))}
    </div>
  );

  if (open) return <SectionDetail k={open} days={days} period={period} onBack={() => { setOpen(null); window.scrollTo(0, 0); }} />;

  return (
    <div className="adm as">
      <div className="seg adm-seg as-views">
        {([['overview', 'Обзор'], ['list', 'Все разделы'], ['study', 'Учёба'], ['insights', 'Что развивать']] as [View, string][]).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>
      {period}
      {err && <div className="warn">{err}</div>}
      {!d && !err && <p className="tiny">Загружаю…</p>}
      {d && (
        <div className={busy ? 'adm-busy' : ''}>
          {view === 'overview' && <Overview d={d} onOpen={setOpen} />}
          {view === 'list' && <AllSections d={d} onOpen={setOpen} />}
          {view === 'study' && <Study d={d} />}
          {view === 'insights' && <Insights d={d} onOpen={setOpen} />}
          {d.errors && Object.keys(d.errors).length > 0 && <p className="tiny">Часть цифр недоступна: {Object.entries(d.errors).map(([k, v]) => `${k} (${v})`).join('; ')}</p>}
          <button type="button" className="link-btn" onClick={() => load()} disabled={busy}>{busy ? 'Обновляю…' : '↻ Обновить'}</button>
          <p className="tiny">
            Счёт анонимный: случайный номер телефона, раздел и главное действие. Без имён, почт и текстов, «Мой цикл» не считается.
            {d.since ? ` Разделы считаются с ${new Date(d.since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.` : ' Разделы начнут считаться, как только люди откроют новую версию.'} Чат, личные, сторис, никах и курсы видны и за прошлое.
          </p>
        </div>
      )}
    </div>
  );
}

function Overview({ d, onOpen }: { d: Data; onOpen: (k: string) => void }) {
  const f = d.funnel;
  const secs = d.sections ?? [];
  const top = insightsOf(d);
  const stick = d.mau > 0 ? Math.round((d.dau_avg / d.mau) * 100) : 0;
  return (
    <>
      <div className="adm-kpi as-kpi">
        <div><b>{fmt(d.active_today)}</b><small>активны сегодня</small><Trend now={d.active_today} prev={d.today_prev} small /></div>
        <div><b>{fmt(d.active)}</b><small>{d.days === 1 ? 'за сегодня' : `за ${d.days} дней`}</small><Trend now={d.active} prev={d.active_prev} small /></div>
        <div><b>{fmt(d.wau)}</b><small>за 7 дней</small></div>
        <div><b>{stick}%</b><small>заходят каждый день (из тех, кто был за 30 дней)</small></div>
      </div>
      {d.series.length > 1 && (
        <section className="adm-box">
          <h3>Люди в приложении по дням</h3>
          <Columns series={d.series} />
        </section>
      )}
      {(d.retention ?? []).some((r) => r.base > 0) && (
        <section className="adm-box">
          <h3>Вернулись после первого дня</h3>
          <div className="as-ret">
            {(d.retention ?? []).map((r) => (
              <div key={r.n}><b>{r.base ? `${pct(r.back, r.base)}%` : '—'}</b><small>через {r.n} д</small><small className="as-mute">{r.base ? `${r.back} из ${r.base}` : 'рано'}</small></div>
            ))}
          </div>
        </section>
      )}
      {f && (
        <section className="adm-box">
          <h3>Путь человека за период</h3>
          {([['Лендинг', f.landing], ['Открыли приложение', f.app], ['Вошли по почте', f.account], ['В круге', f.circle], ['Вернулись через 7 дней', f.back7]] as [string, number][]).map(([l, n], i) => {
            const base = Math.max(f.landing, f.app, 1);
            return (
              <div key={l} className="as-fun">
                <span>{l}</span>
                <span className="adm-bar"><i style={{ width: `${Math.min(100, (n / base) * 100)}%` }} /></span>
                <b>{i === 0 ? fmt(n) : `${fmt(n)}`}</b>
              </div>
            );
          })}
          <p className="tiny">Лендинг и приложение считаются по телефонам, вход и круг по аккаунтам, поэтому доли примерные.</p>
        </section>
      )}
      {top.length > 0 && (
        <section className="adm-box">
          <h3>Самое главное</h3>
          {top.slice(0, 3).map((x) => (
            <button key={x.key} type="button" className={`as-ins ${x.tone}`} onClick={() => x.sec && onOpen(x.sec)}>
              <b>{x.title}</b><small>{x.short}</small>
            </button>
          ))}
        </section>
      )}
      {secs.length > 0 && (
        <section className="adm-box">
          <h3>Чаще всего открывают</h3>
          {secs.slice(0, 6).map((s) => <SecRow key={s.k} s={s} active={d.active} onOpen={onOpen} />)}
        </section>
      )}
    </>
  );
}

function SecRow({ s, active, onOpen }: { s: Sec; active: number; onOpen: (k: string) => void }) {
  const info = secInfo(s.k);
  return (
    <button type="button" className="as-sec" onClick={() => onOpen(s.k)}>
      <i>{info.t.slice(0, 1)}</i>
      <span><b>{info.t}</b><span className="adm-bar"><i style={{ width: `${Math.max(2, pct(s.u, active))}%` }} /></span></span>
      <span className="as-num"><b>{fmt(s.u)}</b><Trend now={s.u} prev={s.p} small /></span>
    </button>
  );
}

function AllSections({ d, onOpen }: { d: Data; onOpen: (k: string) => void }) {
  const secs = d.sections ?? [];
  const by = useMemo(() => {
    const m = new Map<SecGroup, Sec[]>();
    for (const s of secs) { const g = secInfo(s.k).g; m.set(g, [...(m.get(g) ?? []), s]); }
    return m;
  }, [secs]);
  return (
    <>
      {secs.length === 0 && <p className="tiny">Пока нет данных по разделам. Они появятся, когда люди откроют приложение после выкладки.</p>}
      {GROUPS.filter(([g]) => by.get(g)?.length).map(([g, title]) => (
        <section key={g} className="adm-box">
          <h3>{title}</h3>
          {by.get(g)!.map((s) => <SecRow key={s.k} s={s} active={d.active} onOpen={onOpen} />)}
        </section>
      ))}
      <section className="adm-box">
        <h3>На сервере, с историей</h3>
        {SRV.map(([k, t, unit]) => {
          const x = d[`srv_${k}`];
          if (!x) return null;
          return (
            <div key={k} className="as-srv">
              <span><b>{t}</b><small>{fmt(x.n)} {unit}{k === 'nikah' || k === 'courses' ? ` · всего ${fmt(x.u)}` : ` · ${fmt(x.u)} чел.`}</small></span>
              <Trend now={x.n} prev={x.p} small />
            </div>
          );
        })}
      </section>
      <p className="tiny">Число у раздела: сколько человек (телефонов) открывали его за период. Полоска: доля от всех активных. Стрелка: к прошлому такому же периоду.</p>
    </>
  );
}

function SectionDetail({ k, days, period, onBack }: { k: string; days: number; period: JSX.Element; onBack: () => void }) {
  const [x, setX] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setErr('');
    call<Detail>('lm_admin_section', { p_sec: k, p_days: days }).then((v) => (v ? setX(v) : setErr('Нет доступа.'))).catch((e) => setErr(`Не получилось загрузить (${e instanceof Error ? e.message : e}).`));
  }, [k, days]);
  const info = secInfo(k);
  const acts = (x?.acts ?? []).filter((a) => a.k !== 'open');
  const opens = x?.acts.find((a) => a.k === 'open');
  const viaN = (x?.via ?? []).reduce((s, v) => s + v.n, 0);
  return (
    <div className="adm as">
      <button type="button" className="link-btn pro-back" onClick={onBack}>← Разделы</button>
      <h2 className="as-h">{info.t}</h2>
      {period}
      {err && <div className="warn">{err}</div>}
      {!x && !err && <p className="tiny">Загружаю…</p>}
      {x && (
        <>
          <div className="adm-kpi as-kpi as-kpi3">
            <div><b>{fmt(x.users)}</b><small>человек открывали</small></div>
            <div><b>{pct(x.users, x.active)}%</b><small>от активных</small></div>
            <div><b>{x.dpp == null ? '—' : String(x.dpp).replace('.', ',')}</b><small>дней на человека</small></div>
          </div>
          {x.series.length > 1 && <section className="adm-box"><h3>Люди по дням</h3><Columns series={x.series} /></section>}
          <section className="adm-box">
            <h3>Что делают внутри</h3>
            {opens && <div className="as-act"><span>Открытий раздела</span><b>{fmt(opens.n)}</b></div>}
            {acts.map((a) => <div key={a.k} className="as-act"><span>{actName(a.k)}<small>{fmt(a.u)} чел.</small></span><b>{fmt(a.n)}</b></div>)}
            {!acts.length && <p className="tiny">Пока только открытия. Действия внутри считаются для Корана, курсов, книг, тестов, азкаров, намазов, питания, здоровья и садаки.</p>}
          </section>
          {viaN > 0 && (
            <section className="adm-box">
              <h3>Пришли из</h3>
              {x.via.map((v) => <div key={v.k} className="as-act"><span>{secInfo(v.k).t}</span><b>{pct(v.n, viaN)}%</b></div>)}
            </section>
          )}
          <section className="adm-box">
            <h3>Кто</h3>
            <div className="as-act"><span>Язык</span><b>{x.langs.map((l) => `${LANG[l.k] ?? l.k} ${pct(l.n, x.users)}%`).join(' · ') || '—'}</b></div>
            <div className="as-act"><span>Устройство</span><b>{x.devices.map((l) => `${DEV[l.k] ?? l.k} ${pct(l.n, x.users)}%`).join(' · ') || '—'}</b></div>
          </section>
        </>
      )}
    </div>
  );
}

function Study({ d }: { d: Data }) {
  const titles = useMemo(() => { const m = new Map<string, string>(); try { for (const c of catalog(true)) m.set(c.id, c.title); } catch { /* */ } return m; }, []);
  const marks = new Map((d.course_marks ?? []).map((m) => [m.k, m]));
  const ids = [...new Set([...(d.courses ?? []).map((c) => c.k), ...(d.course_marks ?? []).filter((m) => m.dn > 0).map((m) => m.k)])];
  const rows = ids.map((id) => {
    const c = (d.courses ?? []).find((x) => x.k === id);
    const m = marks.get(id);
    return { id, title: titles.get(id) ?? 'Курс', st: c?.st ?? 0, hf: c?.hf ?? 0, dn: Math.max(c?.dn ?? 0, m?.dn ?? 0), avg: m?.avg ?? null, nr: m?.nr ?? 0 };
  }).sort((a, b) => b.st - a.st || b.dn - a.dn);
  const act = (k: string) => (d.acts ?? []).find((a) => a.k === k);
  const books: [string, string][] = [['books|book_add', 'Книг добавлено на полку'], ['books|chapter', 'Глав отмечено'], ['books|book_done', 'Дочитали книгу']];
  const tests: [string, string][] = [['tests', 'Что мне даётся труднее'], ['test-umrah', 'Готовность к умре'], ['test-salah', 'Намаз и Коран']];
  return (
    <>
      <section className="adm-box">
        <h3>Курсы</h3>
        {!rows.length && <p className="tiny">Пока нет данных. Начало, половина и конец курса считаются с выкладки, сертификаты видны и за прошлое.</p>}
        {rows.map((r) => (
          <div key={r.id} className="as-course">
            <div className="as-ct"><b>{r.title}</b>{r.avg != null && <small>★ {String(r.avg).replace('.', ',')} · {r.nr} {r.nr === 1 ? 'отзыв' : 'отзывов'}</small>}</div>
            <div className="as-cn">
              <span><b>{fmt(r.st)}</b><small>начали</small></span>
              <span><b>{fmt(r.hf)}</b><small>половина</small></span>
              <span><b>{fmt(r.dn)}</b><small>закончили</small></span>
            </div>
            {r.st > 0 && <div className="as-cbar"><i style={{ width: `${pct(r.hf, r.st)}%` }} /><i className="dn" style={{ width: `${pct(r.dn, r.st)}%` }} /></div>}
          </div>
        ))}
      </section>
      <section className="adm-box">
        <h3>Книги</h3>
        {books.map(([k, l]) => { const a = act(k); return <div key={k} className="as-act"><span>{l}{a && <small>{fmt(a.u)} чел.</small>}</span><b>{fmt(a?.n ?? 0)}</b></div>; })}
      </section>
      <section className="adm-box">
        <h3>Тесты</h3>
        {tests.map(([k, l]) => { const a = act(`${k}|test_done`); return <div key={k} className="as-act"><span>{l}</span><b>{fmt(a?.u ?? 0)} прошли</b></div>; })}
      </section>
    </>
  );
}

interface Ins { key: string; tone: 'up' | 'good' | 'warn' | 'down' | 'mute'; title: string; short: string; body: string; sec?: string }

/** Plain-language hints from the numbers. Only sections with at least 5 people take part, so one person cannot steer them. */
function insightsOf(d: Data): Ins[] {
  const secs = (d.sections ?? []).filter((s) => !['profile', 'practice', 'me', 'look', 'remind', 'words'].includes(s.k));
  const name = (k: string) => secInfo(k).t;
  const out: Ins[] = [];
  const big = secs.filter((s) => s.u >= 5);
  const grow = big.filter((s) => s.p >= 3 && (trend(s.u, s.p) ?? 0) >= 20).sort((a, b) => (trend(b.u, b.p) ?? 0) - (trend(a.u, a.p) ?? 0));
  if (grow.length) out.push({ key: 'grow', tone: 'up', sec: grow[0].k, title: `Растут: ${grow.slice(0, 3).map((s) => `${name(s.k)} ▲ ${trend(s.u, s.p)}%`).join(', ')}`, short: 'Сюда стоит добавлять новое.', body: 'Людей стало заметно больше, чем в прошлом таком же периоде. Здесь новые функции дадут больше всего.' });
  if (d.days >= 7) {
    const avg = big.length ? big.reduce((s, x) => s + (x.dpp ?? 0), 0) / big.length : 0;
    const sticky = big.filter((s) => (s.dpp ?? 0) >= Math.max(2, avg * 1.4)).sort((a, b) => (b.dpp ?? 0) - (a.dpp ?? 0));
    if (sticky.length) {
      const s = sticky[0];
      out.push({ key: 'sticky', tone: 'good', sec: s.k, title: `Возвращаются: ${sticky.slice(0, 2).map((x) => name(x.k)).join(', ')}`, short: `${String(s.dpp).replace('.', ',')} дня на человека, в среднем ${avg.toFixed(1).replace('.', ',')}.`, body: 'Это уже привычка. Стоит показывать раздел новичкам раньше.' });
    }
    const drop = big.filter((s) => s.one / s.u >= 0.6 && s.did / s.u < 0.4).sort((a, b) => b.one / b.u - a.one / a.u);
    if (drop.length) {
      const s = drop[0];
      out.push({ key: 'drop', tone: 'warn', sec: s.k, title: `Открывают и бросают: ${drop.slice(0, 2).map((x) => name(x.k)).join(', ')}`, short: `${pct(s.one, s.u)}% открыли один день, ${pct(s.did, s.u)}% что-то сделали внутри.`, body: 'Стоит упростить первый экран, чтобы было понятно, с чего начать.' });
    }
  }
  const courses = (d.courses ?? []).filter((c) => c.st >= 5);
  if (courses.length) {
    const c = [...courses].sort((a, b) => a.dn / a.st - b.dn / b.st)[0];
    let title = 'Курс';
    try { title = catalog(true).find((x) => x.id === c.k)?.title ?? title; } catch { /* */ }
    out.push({ key: 'course', tone: 'warn', title: `«${title}»: до конца доходят ${pct(c.dn, c.st)}%`, short: `Начали ${c.st}, половина ${c.hf}, закончили ${c.dn}.`, body: 'Посмотрите, где курс длинный или трудный.' });
  }
  if (d.active >= 30) {
    const rare = secs.filter((s) => s.u / d.active < 0.03);
    if (rare.length) out.push({ key: 'rare', tone: 'mute', sec: rare[0].k, title: `Почти не пользуются: ${rare.slice(0, 4).map((s) => name(s.k)).join(', ')}`, short: 'Меньше 3% активных.', body: 'Или сделать заметнее, или спрятать глубже.' });
  }
  const fall = big.filter((s) => s.p >= 5 && (trend(s.u, s.p) ?? 0) <= -15).sort((a, b) => (trend(a.u, a.p) ?? 0) - (trend(b.u, b.p) ?? 0));
  if (fall.length) out.push({ key: 'fall', tone: 'down', sec: fall[0].k, title: `Падают: ${fall.slice(0, 3).map((s) => `${name(s.k)} ▼ ${Math.abs(trend(s.u, s.p) ?? 0)}%`).join(', ')}`, short: 'Меньше людей, чем в прошлом периоде.', body: 'Проверьте, не сломалось ли что-то и не спрятали ли раздел.' });
  return out;
}

function Insights({ d, onOpen }: { d: Data; onOpen: (k: string) => void }) {
  const list = insightsOf(d);
  return (
    <>
      {!list.length && <p className="tiny">Пока мало данных. Подсказки появятся, когда в разделах будет хотя бы по 5 человек и пройдёт неделя.</p>}
      {list.map((x) => (
        <button key={x.key} type="button" className={`as-ins big ${x.tone}`} onClick={() => x.sec && onOpen(x.sec)}>
          <b>{x.title}</b><span>{x.body}</span><small>{x.short}</small>
        </button>
      ))}
      <p className="tiny">Подсказки считаются сами из цифр за выбранный период и сравниваются с прошлым таким же периодом. Берутся разделы, где было хотя бы 5 человек.</p>
    </>
  );
}

function Columns({ series }: { series: { d: string; v: number }[] }) {
  const max = Math.max(...series.map((x) => x.v), 1);
  const every = Math.ceil(series.length / 7);
  return (
    <div className="adm-chart as-chart" role="img" aria-label="Люди по дням">
      {series.map((x, i) => (
        <div key={x.d} className="adm-col" title={`${dShort(x.d)}: ${x.v}`}>
          <div className="adm-stack"><i className={`v${new Date(x.d).getUTCDay() === 5 ? ' fri' : ''}`} style={{ height: `${(x.v / max) * 100}%` }} /></div>
          <small>{i % every === 0 || i === series.length - 1 ? dShort(x.d) : ''}</small>
        </div>
      ))}
    </div>
  );
}
