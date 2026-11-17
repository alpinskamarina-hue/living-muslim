import { GiftPassCard } from './GiftPass';
import { useState } from 'react';
import type { UmrahApi, URsvp, UTrip, URoom, UPaid } from '../umrahCircle';
import { uid } from '../store';
import { plural } from '../dates';

// The trip page: nine steps from «who is going» to «how much we saved».
// Everything lives in the existing circle documents: the host's trip doc and each person's rsvp doc.

interface Props { host: string; trip: UTrip; api: UmrahApi; nameOf: (id: string) => string; going: string[]; onOpenGuide?: () => void }

const DOCS: { id: string; t: string; sub?: string }[] = [
  { id: 'passport', t: 'Загранпаспорт', sub: 'действует ещё 6 месяцев после возвращения' },
  { id: 'visa', t: 'Виза', sub: 'туристическая eVisa онлайн или виза на умру через агента' },
  { id: 'insurance', t: 'Страховка', sub: 'часто входит в eVisa, проверь' },
  { id: 'nusuk', t: 'Разрешение на умру в Nusuk', sub: 'приложение Nusuk, слот на умру' },
  { id: 'rawda', t: 'Слот в Равду', sub: 'по желанию, тоже через Nusuk' },
  { id: 'ihram', t: 'Ихрам и вещи', sub: 'список в Практике → Умра' },
  { id: 'copies', t: 'Копии документов', sub: 'фото паспорта и визы в телефоне' },
];

const MEMO = [
  'Джидда → Мекка: такси или автобус, около часа. Ихрам надевают до миката, в самолёте объявят.',
  'Мекка ↔ Медина: скоростной поезд Харамейн, около 2,5 часа. Билеты на сайте Haramain заранее.',
  'Сим-карта в аэропорту, нужен паспорт.',
  'Договоритесь о точке встречи у Харама, если потеряетесь.',
];

const fmt = (n: number, cur: string) => `${cur}${Math.round(n).toLocaleString('ru-RU')}`;
const dLabel = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m - 1]}`; };
const nightsOf = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));

/** Per-person balances from the shared cash: positive = others owe them. */
export function balances(trip: UTrip, rsvp: UmrahApi['rsvp'], host: string, going: string[]) {
  const b: Record<string, number> = Object.fromEntries(going.map((id) => [id, 0]));
  if (!going.length) return b;
  for (const [id, m] of Object.entries(rsvp)) {
    const r = m?.[host];
    if (!r) continue;
    for (const p of r.paid ?? []) {
      b[id] = (b[id] ?? 0) + p.amt;
      for (const g of going) b[g] -= p.amt / going.length;
    }
    for (const [to, amt] of Object.entries(r.settled ?? {})) { b[id] = (b[id] ?? 0) + amt; b[to] = (b[to] ?? 0) - amt; }
  }
  return b;
}

/** Fewest transfers: who returns how much to whom. */
export function settle(b: Record<string, number>) {
  const debt = Object.entries(b).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v })).sort((x, y) => y.v - x.v);
  const cred = Object.entries(b).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v })).sort((x, y) => y.v - x.v);
  const out: { from: string; to: string; amt: number }[] = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const a = Math.min(debt[i].v, cred[j].v);
    out.push({ from: debt[i].id, to: cred[j].id, amt: a });
    debt[i].v -= a; cred[j].v -= a;
    if (debt[i].v < 0.5) i++;
    if (cred[j].v < 0.5) j++;
  }
  return out;
}

export function UmrahPlan({ host, trip, api, nameOf, going, onOpenGuide }: Props) {
  const { me, rsvp } = api;
  const isHost = me === host;
  const [open, setOpen] = useState<number | null>(null);
  // Form fields live here, not in the step bodies, so a cloud refresh does not wipe what is being typed.
  const [f, setF] = useState<Record<string, string>>({ city: 'mecca', beds: '4' });
  const fv = (k: string) => f[k] ?? '';
  const sf = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const cur = trip.cur ?? '€';
  const r = (id: string): URsvp | undefined => rsvp[id]?.[host];
  const mine = me ? r(me) : undefined;
  const save = (p: Partial<UTrip>) => api.saveTrip({ ...trip, ...p });
  const iGo = mine?.s === 'go';

  const dates = trip.dates ?? [];
  const chosen = dates.find((d) => d.id === trip.chosen);
  const rooms = trip.rooms ?? [];
  const nights = trip.nights ?? { mecca: chosen ? Math.max(1, nightsOf(chosen.from, chosen.to) - 4) : 6, medina: 4 };
  const roomPP = (x: URoom) => (x.night * (x.city === 'mecca' ? nights.mecca : nights.medina)) / Math.max(1, x.beds);
  const cheapest = (c: URoom['city']) => { const l = rooms.filter((x) => x.city === c); return l.length ? Math.min(...l.map(roomPP)) : 0; };
  const myRoom = (c: URoom['city']) => rooms.find((x) => x.city === c && me && x.people.includes(me));
  const stayPP = (myRoom('mecca') ? roomPP(myRoom('mecca')!) : cheapest('mecca')) + (myRoom('medina') ? roomPP(myRoom('medina')!) : cheapest('medina'));
  const tickets = going.map((id) => r(id)?.ticket ?? 0).filter((x) => x > 0);
  const ticketPP = mine?.ticket || (tickets.length ? tickets.reduce((a, b) => a + b, 0) / tickets.length : 0);
  const totalPP = ticketPP + stayPP + (trip.other ?? 0);
  const known = ticketPP > 0 && stayPP > 0;
  const saving = trip.agency && known ? trip.agency - totalPP : 0;

  const bought = going.filter((id) => r(id)?.bought).length;
  const docsDone = (id: string) => DOCS.filter((d) => d.id !== 'rawda').every((d) => r(id)?.docs?.includes(d.id));
  const docsReady = going.filter(docsDone).length;
  const bal = balances(trip, rsvp, host, going);
  const transfers = settle(bal);
  const spent = Object.values(rsvp).reduce((n, m) => n + (m?.[host]?.paid ?? []).reduce((a, p) => a + p.amt, 0), 0);

  const steps: { t: string; s: string; ok: boolean }[] = [
    { t: 'Сбор', s: `${going.length} ${plural(going.length, 'едет', 'едут', 'едут')}`, ok: going.length >= 2 },
    { t: 'Даты', s: chosen ? `${dLabel(chosen.from)} – ${dLabel(chosen.to)}` : dates.length ? `${dates.length} ${plural(dates.length, 'вариант', 'варианта', 'вариантов')}, голосуем` : 'предложите варианты', ok: Boolean(chosen) },
    { t: 'Билеты', s: `купили ${bought} из ${going.length}`, ok: going.length > 0 && bought === going.length },
    { t: 'Жильё', s: rooms.length ? `${rooms.length} ${plural(rooms.length, 'номер', 'номера', 'номеров')}${stayPP ? ` · ${fmt(stayPP, cur)} с человека` : ''}` : 'Мекка и Медина', ok: rooms.some((x) => x.city === 'mecca') },
    { t: 'Документы', s: `готовы у ${docsReady} из ${going.length}`, ok: going.length > 0 && docsReady === going.length },
    { t: 'Общая касса', s: spent ? `потрачено ${fmt(spent, cur)}` : 'кто за что платит', ok: spent > 0 && transfers.length === 0 },
    { t: 'Дорога', s: 'поезд, трансфер, план по дням', ok: Boolean(trip.plan) },
    { t: 'На месте', s: 'умра-гид, дуа, точка встречи', ok: false },
    { t: 'Итог', s: saving > 0 ? `экономия ${fmt(saving, cur)} с человека` : 'сколько потратили', ok: false },
  ];
  const nowStep = steps.findIndex((x) => !x.ok);

  return (
    <div className="up">
      <div className="up-save">
        <small>{known ? 'Расчёт на человека по вашим ценам' : 'Расчёт появится, когда будут цены билетов и жилья'}</small>
        {saving > 0 ? <b>Экономия {fmt(saving, cur)} · {Math.round((saving / trip.agency!) * 100)}%</b> : <b>{known ? fmt(totalPP, cur) : '—'}</b>}
        <div className="up-row"><span>Билет{mine?.ticket ? '' : ' (в среднем)'}</span><span>{ticketPP ? fmt(ticketPP, cur) : '—'}</span></div>
        <div className="up-row"><span>Жильё, {nights.mecca} + {nights.medina} {plural(nights.medina, 'ночь', 'ночи', 'ночей')}</span><span>{stayPP ? fmt(stayPP, cur) : '—'}</span></div>
        <div className="up-row"><span>Виза, поезд, трансферы</span><span>{trip.other ? fmt(trip.other, cur) : '—'}</span></div>
        {trip.agency ? <div className="up-row"><span>Пакет агентства для сравнения</span><span>{fmt(trip.agency, cur)}</span></div> : null}
        {isHost && (
          <div className="up-in">
            <label>Прочее на человека<input inputMode="decimal" defaultValue={trip.other || ''} onBlur={(e) => save({ other: Number(e.target.value) || 0 })} placeholder="200" /></label>
            <label>Цена пакета агентства<input inputMode="decimal" defaultValue={trip.agency || ''} onBlur={(e) => save({ agency: Number(e.target.value) || undefined })} placeholder="1600" /></label>
          </div>
        )}
      </div>

      <PassCard isHost={isHost} going={going.length} />

      <div className="up-steps">
        {steps.map((st, i) => (
          <div key={st.t} className={`up-st${st.ok ? ' ok' : ''}${i === nowStep ? ' now' : ''}${open === i ? ' open' : ''}`}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <em>{st.ok ? '✓' : i + 1}</em>
              <span><b>{st.t}</b><small>{st.s}</small></span>
              <i aria-hidden="true">{open === i ? '▴' : '▾'}</i>
            </button>
            {open === i && <div className="up-body">{body(i)}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  function body(i: number) {
    switch (i) {
      case 0: return Gather();
      case 1: return Dates();
      case 2: return Tickets();
      case 3: return Stay();
      case 4: return Docs();
      case 5: return Cash();
      case 6: return Road();
      case 7: return There();
      default: return Result();
    }
  }

  function Gather() {
    return (
      <>
        <p className="tiny">Ответь «Еду» выше. Кто едет, тот участвует в датах, жилье и общей кассе.</p>
        {going.map((id) => <div key={id} className="up-p"><b>{nameOf(id)}{id === me ? ' (ты)' : ''}</b><small>{r(id)?.from ? `из ${r(id)!.from}` : 'город не указан'}</small></div>)}
        {iGo && (
          <label className="field"><span>Мой город вылета</span>
            <input defaultValue={mine?.from ?? trip.city} onBlur={(e) => api.respond(host, { from: e.target.value.trim() })} />
          </label>
        )}
      </>
    );
  }

  function Dates() {
    const from = fv('from'), to = fv('to');
    const setFrom = (v: string) => sf('from', v), setTo = (v: string) => sf('to', v);
    const votes = (id: string) => going.filter((p) => r(p)?.votes?.includes(id));
    return (
      <>
        <p className="tiny">Дешевле всего вне сезона: не Рамадан, не школьные каникулы, вылет в будни. Отметь все варианты, которые тебе подходят.</p>
        {dates.map((d) => {
          const v = votes(d.id);
          const on = Boolean(mine?.votes?.includes(d.id));
          return (
            <div key={d.id} className={`up-date${trip.chosen === d.id ? ' chosen' : ''}`}>
              <span><b>{dLabel(d.from)} – {dLabel(d.to)}</b><small>{nightsOf(d.from, d.to)} {plural(nightsOf(d.from, d.to), 'ночь', 'ночи', 'ночей')} · {v.length ? `подходит: ${v.map(nameOf).join(', ')}` : 'пока никто'}</small></span>
              {iGo && <button type="button" aria-pressed={on} onClick={() => api.respond(host, { votes: on ? (mine?.votes ?? []).filter((x) => x !== d.id) : [...(mine?.votes ?? []), d.id] })}>{on ? '✓ Мне подходит' : 'Мне подходит'}</button>}
              {isHost && <button type="button" className="up-pick" onClick={() => save({ chosen: trip.chosen === d.id ? undefined : d.id, nights: { mecca: Math.max(1, nightsOf(d.from, d.to) - 4), medina: Math.min(4, Math.max(0, nightsOf(d.from, d.to) - 1)) } })}>{trip.chosen === d.id ? 'Выбрано' : 'Выбрать'}</button>}
            </div>
          );
        })}
        {isHost && (
          <div className="up-add">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Вылет" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Возвращение" />
            <button type="button" className="pri-btn" disabled={!from || !to || to <= from} onClick={() => { save({ dates: [...dates, { id: uid(), from, to }] }); setFrom(''); setTo(''); }}>+</button>
          </div>
        )}
        {!isHost && !dates.length && <p className="tiny">Варианты дат предлагает тот, кто собирает поездку.</p>}
      </>
    );
  }

  function Tickets() {
    const d = chosen;
    const q = (city: string) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${city} to Jeddah${d ? ` on ${d.from} returning ${d.to}` : ''}`)}`;
    return (
      <>
        <p className="tiny">{d ? `Прилёт в Джидду ${dLabel(d.from)}, обратно ${dLabel(d.to)}. ` : 'Сначала выберите даты. '}Старайтесь прилететь в один день, так проще с трансфером.</p>
        {going.map((id) => {
          const x = r(id);
          return <div key={id} className="up-p"><b>{nameOf(id)}{id === me ? ' (ты)' : ''}</b><small>{x?.from || 'город?'} · {x?.ticket ? fmt(x.ticket, cur) : 'цена ?'} {x?.bought ? '· купил ✓' : ''}</small></div>;
        })}
        {iGo && (
          <>
            <div className="up-in light">
              <label>Цена моего билета туда и обратно<input inputMode="decimal" defaultValue={mine?.ticket || ''} onBlur={(e) => api.respond(host, { ticket: Number(e.target.value) || undefined })} placeholder="280" /></label>
            </div>
            <label className="chk"><input type="checkbox" checked={Boolean(mine?.bought)} onChange={(e) => api.respond(host, { bought: e.target.checked })} /><span><b>Я купил билет</b></span></label>
            <a className="pri-btn up-link" href={q(mine?.from || trip.city || 'Moscow')} target="_blank" rel="noopener noreferrer">Искать билеты из {mine?.from || trip.city}</a>
          </>
        )}
        <p className="tiny">Покупка на сайте авиакомпании или поисковика. Цены там, мы ничего не продаём.</p>
      </>
    );
  }

  function Stay() {
    const city = fv('city') as URoom['city'], name = fv('name'), night = fv('night'), beds = fv('beds'), walk = fv('walk');
    const setCity = (v: string) => sf('city', v), setName = (v: string) => sf('name', v), setNight = (v: string) => sf('night', v), setBeds = (v: string) => sf('beds', v), setWalk = (v: string) => sf('walk', v);
    const book = (c: URoom['city']) => `https://www.booking.com/searchresults.html?ss=${c === 'mecca' ? 'Makkah' : 'Madinah'}${chosen ? `&checkin=${chosen.from}&checkout=${chosen.to}` : ''}&group_adults=${Math.max(1, going.length)}`;
    const toggle = (x: URoom) => { if (!me) return; const people = x.people.includes(me) ? x.people.filter((p) => p !== me) : x.people.length < x.beds ? [...x.people, me] : x.people; save({ rooms: rooms.map((y) => (y.id === x.id ? { ...y, people } : y)) }); };
    return (
      <>
        <p className="tiny">Номер на 3–4 человека в 10–15 минутах пешком от Харама обычно в разы дешевле, чем у самых ворот. Братья и сёстры живут отдельно; сёстры решают со своим махрамом.</p>
        {isHost && (
          <div className="h-q">
            <label className="field" style={{ flex: 1 }}><span>Ночей в Мекке</span><input inputMode="numeric" defaultValue={nights.mecca} onBlur={(e) => save({ nights: { ...nights, mecca: Number(e.target.value) || 0 } })} /></label>
            <label className="field" style={{ flex: 1 }}><span>В Медине</span><input inputMode="numeric" defaultValue={nights.medina} onBlur={(e) => save({ nights: { ...nights, medina: Number(e.target.value) || 0 } })} /></label>
          </div>
        )}
        {rooms.map((x) => (
          <div key={x.id} className="up-room">
            <div><b>{x.city === 'mecca' ? 'Мекка' : 'Медина'} · {x.name || 'номер'}</b><small>{fmt(x.night, cur)} за ночь · на {x.beds}{x.walk ? ` · ${x.walk} мин до ${x.city === 'mecca' ? 'Харама' : 'мечети Пророка ﷺ'}` : ''}</small></div>
            <div className="up-row"><span>С человека</span><b>{fmt(roomPP(x), cur)}</b></div>
            <div className="up-ppl">{x.people.map((p) => <span key={p}>{nameOf(p)}</span>)}{Array.from({ length: Math.max(0, x.beds - x.people.length) }, (_, k) => <span key={k} className="free">свободно</span>)}</div>
            <div className="row2 light">
              {iGo && <button type="button" onClick={() => toggle(x)}>{me && x.people.includes(me) ? 'Выйти из номера' : 'Я здесь'}</button>}
              {isHost && <button type="button" onClick={() => save({ rooms: rooms.filter((y) => y.id !== x.id) })}>Убрать</button>}
            </div>
          </div>
        ))}
        {isHost && (
          <div className="up-form">
            <div className="h-q">{(['mecca', 'medina'] as const).map((c) => <button type="button" key={c} aria-pressed={city === c} onClick={() => setCity(c)}>{c === 'mecca' ? 'Мекка' : 'Медина'}</button>)}</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Отель" />
            <div className="up-add">
              <input inputMode="decimal" value={night} onChange={(e) => setNight(e.target.value)} placeholder="за ночь" />
              <input inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value)} placeholder="мест" />
              <input inputMode="numeric" value={walk} onChange={(e) => setWalk(e.target.value)} placeholder="мин пешком" />
            </div>
            <button type="button" className="pri-btn" disabled={!(Number(night) > 0) || !(Number(beds) > 0)} onClick={() => { save({ rooms: [...rooms, { id: uid(), city, name: name.trim(), night: Number(night), beds: Number(beds), walk: Number(walk) || undefined, people: [] }] }); setName(''); setNight(''); setWalk(''); }}>Добавить номер</button>
          </div>
        )}
        <div className="row2 light">
          <a href={book('mecca')} target="_blank" rel="noopener noreferrer">Отели в Мекке</a>
          <a href={book('medina')} target="_blank" rel="noopener noreferrer">Отели в Медине</a>
        </div>
      </>
    );
  }

  function Docs() {
    const set = (id: string) => { const d = mine?.docs ?? []; api.respond(host, { docs: d.includes(id) ? d.filter((x) => x !== id) : [...d, id] }); };
    return (
      <>
        <p className="tiny">Отмечаешь только своё. Группа видит, у кого всё готово, но не видит твои документы.</p>
        {going.map((id) => <div key={id} className="up-p"><b>{nameOf(id)}{id === me ? ' (ты)' : ''}</b><small>{docsDone(id) ? 'всё готово ✓' : `${(r(id)?.docs ?? []).length} из ${DOCS.length}`}</small></div>)}
        {iGo && DOCS.map((d) => (
          <label key={d.id} className="chk"><input type="checkbox" checked={Boolean(mine?.docs?.includes(d.id))} onChange={() => set(d.id)} /><span><b>{d.t}</b>{d.sub && <small>{d.sub}</small>}</span></label>
        ))}
        <p className="tiny">Туристическая eVisa доступна гражданам многих стран, в том числе России. Узбекистан и Таджикистан с апреля 2025 года в списке нет, им нужна виза на умру через агента. Правила меняются: проверь на visa.visitsaudi.com перед поездкой.</p>
      </>
    );
  }

  function Cash() {
    const what = fv('what'), amt = fv('amt');
    const setWhat = (v: string) => sf('what', v), setAmt = (v: string) => sf('amt', v);
    const all = Object.entries(rsvp).flatMap(([id, m]) => (m?.[host]?.paid ?? []).map((p) => ({ ...p, by: id })));
    const removePaid = (p: UPaid) => api.respond(host, { paid: (mine?.paid ?? []).filter((x) => x.id !== p.id) });
    return (
      <>
        <p className="tiny">Записывай, что оплатил за всех. Сумма делится поровну между теми, кто едет. Деньги переводите друг другу сами, приложение только считает.</p>
        {all.map((p) => (
          <div key={p.id} className="up-row up-cash"><span>{nameOf(p.by)}{p.by === me ? ' (ты)' : ''}: {p.what}</span><b>{fmt(p.amt, cur)}</b>{p.by === me && <button type="button" className="hg-act" onClick={() => removePaid(p)}>×</button>}</div>
        ))}
        {iGo && (
          <div className="up-add">
            <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Отель в Мекке" />
            <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="сумма" />
            <button type="button" className="pri-btn" disabled={!what.trim() || !(Number(amt) > 0)} onClick={() => { api.respond(host, { paid: [...(mine?.paid ?? []), { id: uid(), what: what.trim(), amt: Number(amt) }] }); setWhat(''); setAmt(''); }}>+</button>
          </div>
        )}
        {transfers.length > 0 && <h3>Кто кому должен</h3>}
        {transfers.map((t) => (
          <div key={t.from + t.to} className={`up-row up-debt${t.from === me ? ' me' : ''}`}>
            <span>{nameOf(t.from)}{t.from === me ? ' (ты)' : ''} → {nameOf(t.to)}{t.to === me ? ' (ты)' : ''}</span><b>{fmt(t.amt, cur)}</b>
            {t.from === me && <button type="button" className="hg-act" onClick={() => api.respond(host, { settled: { ...(mine?.settled ?? {}), [t.to]: (mine?.settled?.[t.to] ?? 0) + Math.round(t.amt) } })}>Вернул</button>}
          </div>
        ))}
        {spent > 0 && transfers.length === 0 && <p className="tiny">Все в расчёте. Альхамдулиллях.</p>}
      </>
    );
  }

  function Road() {
    return (
      <>
        {MEMO.map((m) => <p key={m} className="up-memo">{m}</p>)}
        <label className="field"><span>План по дням{isHost ? '' : ' (пишет тот, кто собирает поездку)'}</span>
          {isHost
            ? <textarea rows={6} defaultValue={trip.plan ?? ''} onBlur={(e) => save({ plan: e.target.value.slice(0, 3000) })} placeholder={'День 1: прилёт, ихрам, умра\nДень 2–6: Мекка\nДень 7: поезд в Медину'} />
            : <div className="up-plan">{trip.plan || 'Пока пусто.'}</div>}
        </label>
      </>
    );
  }

  function There() {
    return (
      <>
        <p className="tiny">Пошаговый умра-гид с дуа лежит в Практике → Умра, он работает и без интернета. Там же список вещей.</p>
        {onOpenGuide && <button type="button" className="pri-btn" onClick={onOpenGuide}>Открыть умра-гид</button>}
        <p className="tiny">Просьбы о дуа от тех, кто остался дома, ниже на этой странице. Прочитайте их у Каабы.</p>
      </>
    );
  }

  function Result() {
    return (
      <>
        <div className="up-row"><span>Потрачено из общей кассы</span><b>{fmt(spent, cur)}</b></div>
        {going.length > 0 && spent > 0 && <div className="up-row"><span>На человека из кассы</span><b>{fmt(spent / going.length, cur)}</b></div>}
        <div className="up-row"><span>Расчёт на человека</span><b>{known ? fmt(totalPP, cur) : '—'}</b></div>
        {trip.agency ? <div className="up-row"><span>Пакет агентства</span><b>{fmt(trip.agency, cur)}</b></div> : <p className="tiny">Впиши цену пакета агентства вверху, чтобы увидеть разницу.</p>}
        {saving > 0 && <p className="up-memo">Вы сэкономили около {fmt(saving, cur)} на человека. Да примет Аллах вашу умру.</p>}
      </>
    );
  }
}

/** Umrah pass price: €10 for one person; a group of up to 4 pays €30; each person after 4 adds €7.50. */
export function passPrice(n: number) { return n <= 1 ? 10 : n <= 3 ? n * 10 : 30 + (n - 4) * 7.5; }
const eur = (x: number) => `€${Number.isInteger(x) ? x : x.toFixed(2).replace('.', ',')}`;

/** The umrah pass. A price screen only for now, nothing is charged and nothing is closed. */
export function PassCard({ isHost, going }: { isHost: boolean; going: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const n = Math.max(1, going);
  const price = passPrice(n);
  const solo = n === 1;
  const soon = (what: string) => setNote(`${what} появится, когда подключим оплату. Сейчас совместная умра открыта всем бесплатно.`);
  return (
    <div className={`up-pass${open ? ' open' : ''}`}>
      <button type="button" className="up-pass-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>🎟️</span>
        <span><b>Пропуск на умру</b><small>{solo ? '€10 на одного' : `${eur(price)} на группу из ${n} · ${eur(price / n)} с человека`}</small></span>
        <i aria-hidden="true">{open ? '▴' : '▾'}</i>
      </button>
      {open && (
        <div className="up-body">
          <div className="up-pass-price"><b>{eur(price)}</b><span>{solo ? 'один раз на поездку' : `на всю группу из ${n}, один раз`}</span><small>Один человек €10 · группа до 4 человек €30 · дальше +€7,50 за каждого</small></div>
          <ul className="up-pass-list">
            <li>{solo ? 'Весь путь умры: подготовка, обряды со счётчиком, микат, «Я потерялся», дуа у Каабы, 40 дней после' : 'Все 9 шагов для всей группы: даты, жильё, документы, общая касса, радар группы'}</li>
            <li>{solo ? 'Действует до возвращения и ещё 40 дней после' : 'Действует до возвращения и ещё 30 дней, чтобы закрыть расчёты'}</li>
            {!solo && <li>Платит собирающий или группа делит поровну</li>}
            <li><b>Часть каждого пропуска идёт в общий фонд.</b> Из каждых шести оплаченных пропусков один дарим тому, кому сейчас трудно оплатить</li>
          </ul>
          {isHost ? (
            <>
              <button type="button" className="pri-btn big-btn" onClick={() => soon('Оплата пропуска')}>Оплатить {eur(price)}</button>
              {!solo && <button type="button" className="ghost-btn" onClick={() => soon('Разделить оплату')}>Разделить на {n}: по {eur(price / n)}</button>}
            </>
          ) : (
            <p className="tiny">Пропуск оформляет тот, кто собирает поездку. Если группа решит делить, каждому придёт его доля.</p>
          )}
          <div className="pro-card soft">
            <b>Не можете оплатить?</b>
            <p>Нажмите, и пропуск придёт подарком от сообщества. Без справок и объяснений. Если фонд пуст, встанете в очередь, и мы скажем честно, какой вы по счёту.</p>
            <button type="button" className="link-btn" onClick={() => setNote('Когда подключим оплату, такие просьбы будут одобряться из фонда. Пока всё и так открыто.')}>Попросить пропуск в подарок</button>
          </div>
          {note && <p className="pro-note">{note}</p>}
          <GiftPassCard title="Подари ещё один пропуск" sub="€10 тому, кто едет, но не может оплатить" />
          <p className="tiny">Пропуск отдельно от Pro. Умра-гид и дуа всегда бесплатны.</p>
        </div>
      )}
    </div>
  );
}
