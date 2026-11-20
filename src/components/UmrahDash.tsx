import { useEffect, useState } from 'react';
import { Ic } from './LIcon';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi, URsvp } from '../umrahCircle';
import { DOCS, passPrice } from './UmrahPlan';
import { umrahOf } from './Umrah';
import { prayersToday, cityName } from './UmrahOnSite';
import { uid } from '../store';
import { plural } from '../dates';
import { _t, _tj } from '../i18n';

// The flagship parts of the umrah app: the group dashboard on «Сейчас», the group pass with shares,
// the roll call «Все на месте?» and the day plan on site. All in the existing trip documents, no new tables.

const eur = (x: number) => `€${Number.isInteger(x) ? x : x.toFixed(2).replace('.', ',')}`;
const dLabel = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${[_t("янв"), _t("фев"), _t("мар"), _t("апр"), _t("мая"), _t("июн"), _t("июл"), _t("авг"), _t("сен"), _t("окт"), _t("ноя"), _t("дек")][m - 1]}`; };
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const MUST = DOCS.filter((d) => d.id !== 'rawda' && d.id !== 'ihram' && d.id !== 'copies').map((d) => d.id);

/** Numbers of the group trip, for the dashboard and the documents table. */
export function groupStats(api: UmrahApi, host: string, going: string[]) {
  const trip = api.trips[host];
  const r = (id: string): URsvp | undefined => api.rsvp[id]?.[host];
  const chosen = trip?.dates?.find((d) => d.id === trip.chosen);
  const rooms = trip?.rooms ?? [];
  const n = Math.max(1, going.length);
  const bought = going.filter((id) => r(id)?.bought);
  const visas = going.filter((id) => r(id)?.docs?.includes('visa'));
  const docsOk = (id: string) => MUST.every((d) => r(id)?.docs?.includes(d));
  const docs = going.filter(docsOk);
  const mecca = rooms.some((x) => x.city === 'mecca'), medina = rooms.some((x) => x.city === 'medina');
  const spent = Object.values(api.rsvp).reduce((s, m) => s + (m?.[host]?.paid ?? []).reduce((a, p) => a + p.amt, 0), 0);
  const ready = going.reduce((s, id) => s + (r(id)?.ready ?? 0), 0) / n;
  const pct = Math.round(((chosen ? 1 : 0) + bought.length / n + ((mecca ? 0.6 : 0) + (medina ? 0.4 : 0)) + visas.length / n + docs.length / n + ready / 100) / 6 * 100);
  // Who the group waits for: the first missing piece of each person.
  const waits = going.map((id) => {
    const miss = [!r(id)?.bought && _t("билет"), !r(id)?.docs?.includes('visa') && _t("виза"), !docsOk(id) && r(id)?.docs?.includes('visa') && _t("документы")].filter(Boolean) as string[];
    return { id, miss };
  }).filter((w) => w.miss.length);
  return { trip, chosen, rooms, bought, visas, docs, docsOk, mecca, medina, spent, pct, waits, cur: trip?.cur ?? '€' };
}

/** «Сейчас» for a group: six tiles, each opens its place, and the group readiness. */
export function GroupDash({ api, host, going, me, nameOf, onStep, onDocs }: { api: UmrahApi; host: string; going: string[]; me: string | null; nameOf: (id: string) => string; onStep: (i: number) => void; onDocs: () => void }) {
  const g = groupStats(api, host, going);
  const n = going.length;
  const votes = g.trip?.dates?.length ?? 0;
  const tiles: { ic: string; t: string; v: string; ok: boolean; go: () => void }[] = [
    { ic: '📅', t: _t("Даты"), v: g.chosen ? `${dLabel(g.chosen.from)} – ${dLabel(g.chosen.to)}` : votes ? _tj("голосуем, {0}", votes) : _t("не выбраны"), ok: Boolean(g.chosen), go: () => onStep(1) },
    { ic: '✈', t: _t("Билеты"), v: `${g.bought.length}/${n}`, ok: n > 0 && g.bought.length === n, go: () => onStep(2) },
    { ic: '🏨', t: _t("Отель"), v: g.mecca || g.medina ? `${g.mecca ? _t("Мекка ✓") : _t("Мекка ?")} · ${g.medina ? _t("Медина ✓") : _t("Медина ?")}` : _t("не выбран"), ok: g.mecca && g.medina, go: () => onStep(3) },
    { ic: '🛂', t: _t("Визы"), v: `${g.visas.length}/${n}`, ok: n > 0 && g.visas.length === n, go: onDocs },
    { ic: '📁', t: _t("Документы"), v: `${g.docs.length}/${n}`, ok: n > 0 && g.docs.length === n, go: onDocs },
    { ic: '💰', t: _t("Касса"), v: g.spent ? `${g.cur}${Math.round(g.spent).toLocaleString()}` : _t("пусто"), ok: g.spent > 0, go: () => onStep(5) },
  ];
  const wait = g.waits.filter((w) => w.id !== me).slice(0, 2);
  const mine = me ? g.waits.find((w) => w.id === me) : undefined;
  return (
    <div className="ud">
      <div className="ud-ready">
        <span><b>{g.pct}%</b><small>{_t("готовность группы")}</small></span>
        <i><em style={{ width: `${g.pct}%` }} /></i>
      </div>
      <div className="ud-tiles">
        {tiles.map((x) => (
          <button key={x.t} type="button" className={x.ok ? 'ok' : ''} onClick={x.go}>
            <i aria-hidden="true">{x.ok ? '✓' : <Ic e={x.ic} />}</i><small>{x.t}</small><b>{x.v}</b>
          </button>
        ))}
      </div>
      {mine && <button type="button" className="ud-wait me" onClick={() => (mine.miss[0] === _t("билет") ? onStep(2) : onDocs())}>{_tj("Твой шаг: {0}", mine.miss.join(', '))}<em>›</em></button>}
      {wait.length > 0 && <p className="ud-wait">{_tj("Ждём: {0}", wait.map((w) => `${nameOf(w.id).split(' ')[0] || _t("Участник")} (${w.miss.join(', ')})`).join(' · '))}</p>}
    </div>
  );
}

/** The group pass: total, my share, who has paid. Payment is not connected yet, so nothing is charged. */
export function GroupPass({ going, nameOf, me }: { going: string[]; nameOf: (id: string) => string; me: string | null }) {
  const [note, setNote] = useState('');
  const n = Math.max(1, going.length);
  const price = passPrice(n);
  const share = price / n;
  return (
    <div className="ud-pass">
      <div className="ud-pass-h">
        <span>🎟️</span>
        <span><b>{_tj("Пропуск группы · {0}", eur(price))}</b><small>{n > 1 ? _tj("{0} {1} · по {2}", n, plural(n, _t("человек"), _t("человека"), _t("человек")), eur(share)) : _t("на одного, один раз на поездку")}</small></span>
      </div>
      <div className="ud-dots">
        {going.map((id) => (
          <span key={id} title={nameOf(id)}><i>{(nameOf(id) || '?').slice(0, 1).toUpperCase()}</i><small>{id === me ? _t("ты") : (nameOf(id) || '').split(' ')[0]}</small></span>
        ))}
      </div>
      <button type="button" className="pri-btn" onClick={() => setNote(_t("Оплата появится скоро. Пока всё открыто бесплатно, пользуйтесь."))}>{_tj("Оплатить свою долю {0}", eur(share))}<em className="ud-soon">{_t("скоро")}</em></button>
      <p className="tiny">{_t("Из каждых 6 оплаченных пропусков один дарим тому, кому трудно оплатить. «Я потерялся», гид и обряды всегда бесплатны.")}</p>
      {note && <p className="pro-note">{note}</p>}
    </div>
  );
}

const ROLL_MIN = 45; // a roll call stays open this long

/** The latest open roll call of the trip, from anyone's rsvp. */
export function activeRoll(api: UmrahApi, host: string, now = Date.now()) {
  let best: { by: string; id: string; at: number } | null = null;
  for (const [id, m] of Object.entries(api.rsvp)) {
    const r = m?.[host]?.roll;
    if (r && now - r.at < ROLL_MIN * 60000 && (!best || r.at > best.at)) best = { by: id, ...r };
  }
  return best;
}

/** «Все на месте?»: the amir calls, everyone answers «Я здесь» or «Нужна помощь». */
export function RollCall({ api, host, going, me, nameOf, canCall, emit }: { api: UmrahApi; host: string; going: string[]; me: string | null; nameOf: (id: string) => string; canCall: boolean; emit: (text: string) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const roll = activeRoll(api, host);
  if (!me) return null;
  const ans = (id: string) => (id === roll?.by ? roll.id : api.rsvp[id]?.[host]?.here);
  const here = roll ? going.filter((id) => ans(id) === roll.id) : [];
  const help = roll ? going.filter((id) => ans(id) === `${roll.id}!`) : [];
  const silent = roll ? going.filter((id) => !here.includes(id) && !help.includes(id)) : [];
  const start = () => { const id = uid(); api.respond(host, { roll: { id, at: Date.now() }, here: id }); emit(_t("📣 Перекличка: все на месте? Ответь в Умре «Я здесь»")); };
  const stop = () => api.respond(host, { roll: undefined });
  const answer = (h: boolean) => { if (!roll) return; api.respond(host, { here: h ? roll.id : `${roll.id}!` }); emit(h ? _t("на месте ✓") : _t("🆘 нужна помощь")); };

  if (roll && me !== roll.by && going.includes(me)) {
    const mine = ans(me);
    return (
      <div className={`ud-roll${mine ? ' done' : ' ask'}`}>
        <b>{_tj("📣 {0}: все на месте?", nameOf(roll.by).split(' ')[0] || _t("Амир"))}</b>
        {mine ? <small>{mine === roll.id ? _t("Ты отметился: на месте ✓") : _t("Группа видит, что тебе нужна помощь")}</small> : (
          <div className="ud-roll-b">
            <button type="button" className="pri-btn" onClick={() => answer(true)}>{_t("Я здесь ✓")}</button>
            <button type="button" className="ghost-btn" onClick={() => answer(false)}>{_t("Нужна помощь")}</button>
          </div>
        )}
        <small>{_tj("На месте {0} из {1}", here.length, going.length)}</small>
      </div>
    );
  }
  if (!canCall) return null;
  if (!roll) return <button type="button" className="ud-roll-go" onClick={start}><b>{_t("📣 Все на месте?")}</b><small>{_t("Перекличка: каждому придёт «Я здесь»")}</small></button>;
  return (
    <div className="ud-roll">
      <b>{_tj("📣 Перекличка: на месте {0} из {1}", here.length, going.length)}</b>
      {help.length > 0 && <small className="ud-help">{_tj("🆘 Нужна помощь: {0}", help.map(nameOf).join(', '))}</small>}
      {silent.length > 0 ? <small>{_tj("Ещё не ответили: {0}", silent.map((id) => nameOf(id) || _t("Участник")).join(', '))}</small> : <small>{_t("Все ответили, альхамдулиллях")}</small>}
      <button type="button" className="link-btn" onClick={stop}>{_t("Закончить перекличку")}</button>
    </div>
  );
}

const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh', hourCycle: 'h23' });
const PRESETS = [_t("Равда"), _t("Таваф"), _t("Зиярат"), _t("Отдых"), _t("Встреча группы")];

/** The day on site: the five prayers with when to leave the hotel, and my own items (Rawdah slot, ziyarah, rest). */
export function DayPlan({ state, update, today }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string }) {
  const u = umrahOf(state);
  const city = u.site?.city ?? 'makkah';
  const walk = u.site?.walk ?? 10;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const [t, setT] = useState('');
  const [text, setText] = useState('');
  const mine = (u.dayPlan ?? []).filter((x) => x.d === today);
  const rows = [
    ...prayersToday(city, walk, now).map((p) => ({ id: p.k, key: hm.format(p.leave), main: _tj("{0} в {1}", p.name, p.time), sub: _tj("выйти в {0}", p.leaveTime), mine: false })),
    ...mine.map((x) => ({ id: x.id, key: x.t, main: x.text, sub: _t("моё"), mine: true })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  const cur = hm.format(now);
  const nextId = rows.find((r) => r.key >= cur)?.id;
  const add = () => { if (!t || !text.trim()) return; update((s) => patch(s, { dayPlan: [...(umrahOf(s).dayPlan ?? []).filter((x) => x.d >= today), { id: uid(), d: today, t, text: text.trim() }] })); setText(''); setT(''); };
  const del = (id: string) => update((s) => patch(s, { dayPlan: (umrahOf(s).dayPlan ?? []).filter((x) => x.id !== id) }));
  const setCity = (c: 'makkah' | 'madinah') => update((s) => patch(s, { site: { ...umrahOf(s).site, city: c } }));
  return (
    <div className="ud-day">
      <div className="ud-day-h">
        <b>{_tj("План дня · {0}", cityName(city))}</b>
        <div className="um-lang">{(['makkah', 'madinah'] as const).map((c) => <button key={c} type="button" aria-pressed={city === c} onClick={() => setCity(c)}>{cityName(c)}</button>)}</div>
      </div>
      <small className="tiny">{_tj("Время по Мекке. Выход: {0} мин пешком + 20 мин найти место.", walk)}</small>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={`${r.mine ? 'mine' : ''}${r.id === nextId ? ' next' : ''}`}>
            <em>{r.key}</em><span><b>{r.main}</b><small>{r.sub}</small></span>
            {r.mine && <button type="button" onClick={() => del(r.id)} aria-label={_t("Убрать")}>✕</button>}
          </li>
        ))}
      </ul>
      <div className="ud-day-chips">{PRESETS.map((p) => <button key={p} type="button" onClick={() => setText(p)}>{p}</button>)}</div>
      <div className="up-add">
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} aria-label={_t("Время")} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={_t("Например: слот в Равду")} />
        <button type="button" className="pri-btn" disabled={!t || !text.trim()} onClick={add}>+</button>
      </div>
    </div>
  );
}
