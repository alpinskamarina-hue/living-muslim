import { useEffect, useMemo, useState } from 'react';
import type { AppState, Masah, Trip } from '../types';
import { addDays, fromKey } from '../dates';
import {
  OPEN_TO, SHAFI_OPEN_DAYS, shafiDaysLeft, CHECKLIST, DUAS, MIN_KM, STAY_LIMIT, checkId, compassWord, distanceKm, isChecked, qibla, travelStatus, tripOn, here,
  travelPlan, masahLeft, leftLabel, roadPlan, prayerName, hhmm, tripSummary,
} from '../safar';
import { prayerTimes } from '../prayer';
import { _t, _tj } from '../i18n';
import { CityPicker } from './CityPicker';
import { Ic } from './LIcon';
import type { CircleApi } from '../circle';
import { askLive } from '../cweek';
import { useChat } from '../chat';
import { currentCircle, isCloud } from '../cloud';
import { cachedNear, findMosques, findHalal, sortNear, distLabel, wayLabel, mosqueName, routeUrl, halalSearchUrl, mapsSearchUrl, lastPos, locate, type Near, type Halal } from '../mosques';
import { hasVoice, speak, hush } from '../speech';
import { ramadanDay, patchR, ramadanOf } from '../ramadan';
import { pid } from '../plans';
import { useSec } from '../usage';

type Update = (fn: (s: AppState) => AppState) => void;
type Tab = 'trip' | 'road' | 'masah' | 'dua' | 'near' | 'qibla';

interface Props {
  state: AppState;
  update: Update;
  today: string;
  onClose: () => void;
  circle?: CircleApi;
  joined?: boolean;
}

const fmt = (k: string) => { const d = fromKey(k); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
const rangeOf = (t: { from: string; to: string; open?: unknown }) => (t.open || t.to === OPEN_TO ? _tj("с {0} · без даты возвращения", fmt(t.from)) : `${fmt(t.from)}–${fmt(t.to)}`);
const dayCount = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 864e5) + 1;
const useNow = (ms = 30000) => { const [n, setN] = useState(() => new Date()); useEffect(() => { const t = setInterval(() => setN(new Date()), ms); return () => clearInterval(t); }, [ms]); return n; };

export function Safar({ state, update, today, onClose, circle, joined }: Props) {
  useSec('safar');
  const trip = state.trip;
  const on = tripOn(state, today);
  const [tab, setTab] = useState<Tab>('trip');
  const title = state.tripBack && !trip ? _t("С возвращением!") : trip ? (on ? (trip.open ? _tj("{0} · день {1}", trip.place, dayCount(trip.from, today)) : _tj("{0} · день {1} из {2}", trip.place, dayCount(trip.from, today), dayCount(trip.from, trip.to))) : trip.place) : _t("Сафар");
  const sub = trip ? `${rangeOf(trip)}${on ? ` · ${travelStatus(state, today).traveler ? _t("ты путник") : _t("полные намазы")}` : ''}` : _t("Поездка, дорога, масх, дуа, рядом, кибла");
  const tabs: [Tab, string][] = [['trip', _t("Поездка")], ['road', _t("Дорога")], ['masah', _t("Масх")], ['dua', _t("Дуа")], ['near', _t("Рядом")], ['qibla', _t("Кибла")]];
  const pt = on ? trip! : null;
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{title}</b><small>{sub}</small></div>
      </div>
      <div className="sf-tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-pressed={tab === k} onClick={() => { hush(); setTab(k); }}>{l}</button>)}
      </div>
      <div className="h-wrap">
        {tab === 'trip' && (state.tripBack && !trip ? <BackView state={state} update={update} />
          : trip ? <TripView state={state} update={update} today={today} trip={trip} go={setTab} circle={circle} joined={joined} />
            : <TripSetup state={state} update={update} today={today} />)}
        {tab === 'road' && <RoadTab state={state} update={update} today={today} go={setTab} />}
        {tab === 'masah' && <MasahTab state={state} update={update} today={today} />}
        {tab === 'dua' && <DuaTab state={state} update={update} today={today} circle={circle} joined={joined} />}
        {tab === 'near' && <NearTab state={state} update={update} today={today} />}
        {tab === 'qibla' && <Qibla lat={pt ? pt.lat : state.settings.lat} lng={pt ? pt.lng : state.settings.lng} place={pt ? pt.place : state.settings.place} />}
      </div>
    </div>
  );
}

// ───────────── Trip: setup ─────────────

function TripSetup({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const [place, setPlace] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 3));
  const [stay, setStay] = useState(3);
  const [geo, setGeo] = useState('');
  const [toPlans, setToPlans] = useState(true);
  const [when, setWhen] = useState<'date' | 'unknown' | 'long'>('date');
  const km = place ? distanceKm(state.settings, place) : 0;

  const locateMe = () => {
    if (!navigator.geolocation) return setGeo(_t("Геолокация недоступна, выбери город из списка."));
    setGeo(_t("Определяю…"));
    navigator.geolocation.getCurrentPosition(
      (p) => { setPlace({ name: _t("Где я сейчас"), lat: p.coords.latitude, lng: p.coords.longitude }); setGeo(''); },
      () => setGeo(_t("Не получилось определить место в этом окне. Выбери город из списка.")),
      { timeout: 10000 },
    );
  };

  const start = () => {
    if (!place) return;
    const open = when === 'date' ? undefined : when;
    const end = open ? OPEN_TO : to < from ? from : to;
    const now = Date.now();
    const planIds: string[] = [];
    const plans = toPlans ? [
      { id: pid(), text: _tj("Выезд: {0}", place.name), date: from, list: undefined, made: now, upd: now },
      ...(open ? [] : [{ id: pid(), text: _tj("Возвращение из: {0}", place.name), date: end, made: now, upd: now }]),
    ] : [];
    plans.forEach((p) => planIds.push(p.id));
    const t: Trip = { place: place.name, lat: place.lat, lng: place.lng, from, to: end, stayDays: open ? 0 : stay, paused: [], checklist: [], planIds, ...(open ? { open } : {}) };
    update((s) => ({ ...s, trip: t, tripBack: null, plans: plans.length ? [...(s.plans ?? []), ...plans] : s.plans }));
  };

  return (
    <>
      <p className="q-msg left">{_t("Укажи, куда едешь. Время намазов пересчитается под это место, а дни поездки не будут считаться пропусками привычек.")}</p>
      <CityPicker value={place} onPick={setPlace} onClear={() => setPlace(null)} exclude={state.settings.place} cityLabel={_t("Куда")} />
      <button type="button" className="link-btn left" onClick={locateMe}><Ic e="pin" /> {_t("Определить, где я сейчас")}</button>
      {geo && <p className="q-msg left">{geo}</p>}
      <label className="field"><span>{_t("Выезд")}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <div className="h-card sf-when">
        <b className="sf-h">{_t("Когда вернёшься?")}</b>
        {([['date', _t("Знаю дату возвращения"), ''], ['unknown', _t("Пока не знаю"), _t("могу уехать в любой день: жду дела, документы, лечение")], ['long', _t("Остаюсь надолго"), _t("переезд, учёба, работа: решил жить там 15+ дней")]] as const).map(([k, l, sub]) => (
          <label key={k} className="chk"><input type="radio" name="sf-when" checked={when === k} onChange={() => setWhen(k)} /><span><b>{l}</b>{sub && <small>{sub}</small>}</span></label>
        ))}
      </div>
      {when === 'date' && (
        <>
          <label className="field"><span>{_t("Возвращение")}</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="field"><span>{_t("Сколько дней пробудешь на месте")}</span>
            <select value={stay} onChange={(e) => setStay(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 7, 10, 14, 15, 20, 30].map((v) => <option key={v} value={v}>{v === 0 ? _t("Не останавливаюсь") : _t("{0} дн.", v)}</option>)}
            </select>
          </label>
        </>
      )}
      {place && when !== 'date' && (
        <div className="h-card sf-gold">
          <b className="sf-h">{_t("Как будут намазы")}</b>
          <small>{km < MIN_KM ? _t("До места около {0} км. Обычно сафаром считается поездка от ~80 км, так что намазы, скорее всего, полностью.", Math.round(km))
            : when === 'long' ? _t("Около {0} км. Путник только в день дороги. На месте сразу полные намазы, джума обязательна.", Math.round(km))
              : state.settings.madhab === 'hanafi' ? _t("Около {0} км. Пока не решил пробыть 15 дней и больше, ты путник и сокращаешь, даже если ждёшь долго.", Math.round(km))
                : _t("Около {0} км. Пока не знаешь, когда уедешь, ты путник: сокращаешь и объединяешь до {1} дней, потом полностью.", Math.round(km), SHAFI_OPEN_DAYS)}</small>
          <small>{_t("Серии привычек не горят первые 3 дня, дальше привычки считаются как дома.")}</small>
        </div>
      )}
      {place && when === 'date' && (
        <p className="q-msg left">
          {km < MIN_KM
            ? _t("До места около {0} км. Обычно сафаром считается поездка от ~80 км, так что намазы, скорее всего, полностью.", Math.round(km))
            : stay >= STAY_LIMIT[state.settings.madhab]
              ? _t("Около {0} км. Но {1} дн. на месте: по {2} мазхабу сокращать можно только в дни дороги.", Math.round(km), stay, state.settings.madhab === 'hanafi' ? _t("ханафитскому") : _t("шафиитскому"))
              : _t("Около {0} км. В пути и на месте можно сокращать намазы{1}.", Math.round(km), state.settings.madhab === 'shafi' ? _t(" и объединять") : '')}
        </p>
      )}
      <label className="chk"><input type="checkbox" checked={toPlans} onChange={() => setToPlans(!toPlans)} /><span><b>{when === 'date' ? _t("Добавить выезд и возвращение в «Планы»") : _t("Добавить выезд в «Планы»")}</b><small>{_t("Можно поправить в календаре")}</small></span></label>
      <button type="button" className="pri-btn" disabled={!place} onClick={start}>{_t("Начать поездку")}</button>
      <p className="q-msg left tiny-note">{_tj("Правила зависят от мазхаба в Профиле (сейчас: {0}). В спорных случаях уточни у своего имама.", state.settings.madhab === 'hanafi' ? _t("ханафитский") : _t("шафиитский"))}</p>
      <History state={state} />
    </>
  );
}

function History({ state }: { state: AppState }) {
  const list = [...(state.pastTrips ?? [])].reverse().slice(0, 12);
  if (!list.length) return null;
  return (
    <>
      <h2 className="sub-h">{_t("Мои поездки")}</h2>
      <div className="h-card sf-list">
        {list.map((t, i) => (
          <div key={i} className="sf-row"><b>{t.place || _t("Поездка")}</b><span className="sf-sp" /><small>{fmt(t.from)}–{fmt(t.to)} · {_t("{0} дн.", dayCount(t.from, t.to))}{t.total ? ` · ${t.prayers}/${t.total}` : ''}</small></div>
        ))}
      </div>
    </>
  );
}

// ───────────── Trip: on the way ─────────────

function TripView({ state, update, today, trip, go, circle, joined }: { state: AppState; update: Update; today: string; trip: Trip; go: (t: Tab) => void; circle?: CircleApi; joined?: boolean }) {
  const st = travelStatus(state, today);
  const on = tripOn(state, today);
  const now = useNow();
  const active = state.habits.filter((h) => h.status === 'active');
  const [own, setOwn] = useState('');
  const patch = (p: Partial<Trip>) => update((s) => (s.trip ? { ...s, trip: { ...s.trip, ...p } } : s));
  const end = () => update((s) => {
    if (!s.trip) return s;
    const to = today < s.trip.to ? (today < s.trip.from ? null : today) : s.trip.to;
    if (!to) return { ...s, trip: null };
    const sum = tripSummary(s, { ...s.trip, to });
    return { ...s, trip: null, tripBack: sum, pastTrips: [...(s.pastTrips ?? []), sum] };
  });
  const times = useMemo(() => prayerTimes({ ...here(state, today), offsets: state.settings.offsets }, fromKey(today)), [state.settings, state.trip, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = on ? travelPlan(state, today, times) : [];
  const nowRow = plan.find((r) => now < r.until);
  const masah = masahLeft(state.masah, st.traveler, now.getTime());
  const asks = joined && circle ? circle.members.filter((m) => m.id !== circle.me && askLive(m.ask, today)).length : 0;
  const ticked = CHECKLIST.filter((_, i) => isChecked(trip, i)).length + (trip.extra ?? []).filter((x) => trip.checklist.includes(x)).length;
  const all = CHECKLIST.length + (trip.extra ?? []).length;

  return (
    <>
      {on && nowRow ? (
        <div className={`h-card sf-hero${st.traveler ? ' traveler' : ''}`}>
          <small>{now >= nowRow.at ? _t("Сейчас время") : _t("Следующий намаз")}</small>
          <b className="sf-big">{nowRow.a.map(prayerName).join(' + ')}{nowRow.together ? ` ${_t("вместе")}` : ''}</b>
          <small>{now >= nowRow.at ? _tj("до {0}", hhmm(nowRow.until)) : _tj("в {0}", hhmm(nowRow.at))} · {_tj("{0} ракаата", nowRow.rakats)}</small>
          <small>{st.why}</small>
        </div>
      ) : (
        <div className="h-card sf-hero">
          <small>{on ? _t("Сейчас") : today < trip.from ? _tj("Выезд {0}", fmt(trip.from)) : _t("Поездка закончилась")}</small>
          <b className="sf-big">{on ? (st.traveler ? _t("Ты путник") : _t("Полные намазы")) : trip.place}</b>
          {on && <small>{st.why}</small>}
          {!on && today < trip.from && <small>{_t("Заполни «Дорогу»: покажу, какие намазы попадут в путь.")}</small>}
        </div>
      )}

      {on && (
        <div className="h-card">
          <b className="sf-h">{st.traveler ? _t("План дня путника") : _t("Намазы сегодня")}</b>
          {plan.map((r) => (
            <div key={r.a.join()} className={`sf-row${now >= r.until ? ' done' : ''}`}>
              <b className="sf-w">{r.a.map(prayerName).join(' + ')}</b><span>{hhmm(r.at)}</span><span className="sf-sp" />
              <span className={`sf-tag${r.together ? ' gold' : ''}`}>{r.together ? _tj("вместе · {0}", r.rakats) : _tj("{0}р", r.rakats)}</span>
            </div>
          ))}
          <small>{st.traveler && state.settings.madhab === 'hanafi' ? _t("По ханафитскому мазхабу каждый намаз в своё время, без объединения.") : st.traveler ? _t("Объединять можно и в время второго намаза: Зухр с Асром до Магриба, Магриб с Ишой до полуночи.") : _tj("Время намазов: {0}, по часам телефона.", trip.place)}</small>
        </div>
      )}

      <div className="sf-mini">
        <button type="button" className="h-card" onClick={() => go('masah')}><b><Ic e="drop" /> {_t("Масх")}</b><small>{masah ? (masah.started ? _tj("ещё {0}", leftLabel(masah.left)) : _t("носки надеты")) : _t("таймер на носки")}</small></button>
        <button type="button" className="h-card" onClick={() => go('near')}><b><Ic e="mosque" /> {_t("Рядом")}</b><small>{_t("мечети и халяль")}</small></button>
        <button type="button" className="h-card" onClick={() => go('dua')}><b><Ic e="hands" /> {_t("Дуа")}</b><small>{asks ? _tj("{0} просьб Круга", asks) : _t("дуа путника")}</small></button>
      </div>

      {trip.open && on && <OpenCard state={state} trip={trip} today={today} patch={patch} />}

      {!trip.depTime && today <= trip.from && <button type="button" className="ghost-btn" onClick={() => go('road')}><Ic e="plane" /> {_t("Указать рейс или время выезда")}</button>}

      {active.length > 0 && (
        <>
          <h2 className="sub-h">{_t("Привычки в дороге")}</h2>
          <p className="q-msg left">{_t("Дни поездки не считаются пропусками, серия не сгорит. Достаточно минимума. То, что в пути невозможно, поставь на паузу.")}</p>
          {active.map((h) => {
            const paused = trip.paused.includes(h.id);
            return (
              <label key={h.id} className="chk">
                <input type="checkbox" checked={paused} onChange={() => patch({ paused: paused ? trip.paused.filter((x) => x !== h.id) : [...trip.paused, h.id] })} />
                <span><b>{h.action}</b><small>{paused ? _t("на паузе до возвращения") : _t("минимум: {0}", h.min || _t("хотя бы немного"))}</small></span>
              </label>
            );
          })}
        </>
      )}

      <h2 className="sub-h">{_t("Собрать в дорогу")}<small>{ticked} / {all}</small></h2>
      {CHECKLIST.map((c, i) => {
        const ok = isChecked(trip, i);
        return (
          <label key={c} className="chk">
            <input type="checkbox" checked={ok} onChange={() => patch({ checklist: ok ? trip.checklist.filter((x) => x !== checkId(i) && x !== c) : [...trip.checklist, checkId(i)] })} />
            <span><b>{c}</b></span>
          </label>
        );
      })}
      {(trip.extra ?? []).map((c) => {
        const ok = trip.checklist.includes(c);
        return (
          <label key={c} className="chk">
            <input type="checkbox" checked={ok} onChange={() => patch({ checklist: ok ? trip.checklist.filter((x) => x !== c) : [...trip.checklist, c] })} />
            <span><b>{c}</b></span>
            <button type="button" className="sf-x" aria-label={_t("Убрать")} onClick={(e) => { e.preventDefault(); patch({ extra: (trip.extra ?? []).filter((x) => x !== c), checklist: trip.checklist.filter((x) => x !== c) }); }}>✕</button>
          </label>
        );
      })}
      <form className="sf-add" onSubmit={(e) => { e.preventDefault(); const v = own.trim(); if (v && !(trip.extra ?? []).includes(v)) patch({ extra: [...(trip.extra ?? []), v] }); setOwn(''); }}>
        <input value={own} maxLength={60} placeholder={_t("Свой пункт, например «зарядка для часов»")} onChange={(e) => setOwn(e.target.value)} />
        <button type="submit" className="ghost-btn" disabled={!own.trim()}>{_t("Добавить")}</button>
      </form>

      <h2 className="sub-h">{_t("Даты")}</h2>
      {trip.open ? (
        <label className="field"><span>{_t("Выезд")}</span><input type="date" value={trip.from} onChange={(e) => patch({ from: e.target.value })} /></label>
      ) : (
        <div className="h-row">
          <label className="field"><span>{_t("Выезд")}</span><input type="date" value={trip.from} onChange={(e) => patch({ from: e.target.value })} /></label>
          <label className="field"><span>{_t("Возвращение")}</span><input type="date" value={trip.to} min={trip.from} onChange={(e) => patch({ to: e.target.value })} /></label>
        </div>
      )}
      <button type="button" className="danger" onClick={end}>{_t("Я вернулся, закончить поездку")}</button>
    </>
  );
}

/** A trip without a return date: how long shortening lasts, and «Узнал дату» / «Решил остаться». */
function OpenCard({ state, trip, today, patch }: { state: AppState; trip: Trip; today: string; patch: (p: Partial<Trip>) => void }) {
  const [pick, setPick] = useState(false);
  const [date, setDate] = useState(addDays(today, 3));
  const left = shafiDaysLeft(state, today);
  const settled = trip.open === 'long' || Boolean(trip.settled && trip.settled <= today);
  const ends = left !== null ? fmt(addDays(trip.from, SHAFI_OPEN_DAYS + 1)) : '';
  return (
    <div className="h-card">
      {left !== null && !settled && (
        <>
          <b className="sf-h">{left > 0 ? _tj("Шафиитский мазхаб: ещё {0} дн. путника", left) : _t("Шафиитский мазхаб: срок путника вышел")}</b>
          <small>{left > 0 ? _tj("Если не знаешь, когда уедешь, сокращать можно до {0} дней. С {1} намазы полностью.", SHAFI_OPEN_DAYS, ends) : _t("Прошло 18 дней: теперь намазы полностью, даже если не знаешь, когда уедешь.")}</small>
        </>
      )}
      {left === null && !settled && <><b className="sf-h">{_t("Без даты возвращения")}</b><small>{_t("Пока ты не решил пробыть 15 дней и больше, ты путник и сокращаешь.")}</small></>}
      {settled && <><b className="sf-h">{_t("Ты живёшь на месте")}</b><small>{_t("Намазы полностью, джума обязательна. Когда поедешь домой, нажми «Я вернулся».")}</small></>}
      <b className="sf-h" style={{ marginTop: 8 }}>{_t("Планы поменялись?")}</b>
      {pick ? (
        <div className="sf-add">
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <button type="button" className="pri-btn" onClick={() => {
            const stay = Math.max(0, Math.round((fromKey(date).getTime() - fromKey(today).getTime()) / 864e5));
            patch({ open: undefined, to: date, stayDays: stay, settled: undefined });
            setPick(false);
          }}>{_t("Сохранить")}</button>
        </div>
      ) : (
        <div className="sf-two">
          <button type="button" className="ghost-btn" onClick={() => setPick(true)}>{_t("Узнал дату")}</button>
          {!settled && <button type="button" className="ghost-btn" onClick={() => patch({ settled: today })}>{_t("Решил остаться")}</button>}
        </div>
      )}
      {!settled && !pick && <small>{_t("«Решил остаться»: с сегодняшнего дня ты не путник, намазы полностью.")}</small>}
      <small>{_t("Серии привычек не горят первые 3 дня, дальше привычки считаются как дома.")}</small>
    </div>
  );
}

// ───────────── After the trip ─────────────

const RETURN_DUA = DUAS[DUAS.length - 1];

function BackView({ state, update }: { state: AppState; update: Update }) {
  const b = state.tripBack!;
  const set = (p: Partial<NonNullable<AppState['tripBack']>>) => update((s) => {
    if (!s.tripBack) return s;
    const nb = { ...s.tripBack, ...p };
    // Keep the history entry in step with the card.
    const past = (s.pastTrips ?? []).map((t) => (t.from === nb.from && t.to === nb.to && t.place === nb.place ? nb : t));
    return { ...s, tripBack: nb, pastTrips: past };
  });
  return (
    <>
      <DuaCard d={RETURN_DUA} />
      <label className="chk"><input type="checkbox" checked={Boolean(b.sunnah)} onChange={() => set({ sunnah: !b.sunnah })} />
        <span><b>{_t("Сунна: 2 ракаата в мечети по возвращении")}</b><small>{_t("Пророк ﷺ, вернувшись из поездки, сначала заходил в мечеть и молился два ракаата (аль-Бухари, 3088)")}</small></span></label>
      <div className="h-card sf-hero">
        <small>{_tj("Итог поездки · {0}", b.place || '')}</small>
        <b className="sf-big">{b.total ? _tj("{0} намазов из {1}", b.prayers ?? 0, b.total) : _t("Поездка завершена")}</b>
        <small>{_tj("{0}–{1} · {2} дн.", fmt(b.from), fmt(b.to), dayCount(b.from, b.to))}{b.duas ? _tj(" · {0} дуа за Круг", b.duas) : ''} · {_t("серии привычек сохранены")}</small>
      </div>
      <button type="button" className="pri-btn" onClick={() => update((s) => ({ ...s, tripBack: null }))}>{_t("Альхамдулиллях, закрыть")}</button>
      <History state={state} />
    </>
  );
}

// ───────────── The road ─────────────

function RoadTab({ state, update, today, go }: { state: AppState; update: Update; today: string; go: (t: Tab) => void }) {
  const trip = state.trip;
  if (!trip) return <p className="q-msg left">{_t("Сначала начни поездку во вкладке «Поездка». Потом здесь будет видно, какие намазы попадут в дорогу.")}</p>;
  const patch = (p: Partial<Trip>) => update((s) => (s.trip ? { ...s, trip: { ...s.trip, ...p } } : s));
  const mode = trip.mode ?? 'plane';
  const dur = trip.dur ?? 0;
  const road = roadPlan(state, trip);
  const modes: [NonNullable<Trip['mode']>, string, string][] = [['plane', 'plane', _t("Самолёт")], ['train', 'walk', _t("Поезд")], ['car', 'compass', _t("Машина")]];
  return (
    <>
      <div className="sf-chips">
        {modes.map(([k, ic, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => patch({ mode: k })}><Ic e={ic} /> {l}</button>)}
      </div>
      <div className="h-row">
        <label className="field"><span>{_tj("Выезд {0}, время", fmt(trip.from))}</span><input type="time" value={trip.depTime ?? ''} onChange={(e) => patch({ depTime: e.target.value || undefined })} /></label>
        <label className="field"><span>{_t("В пути")}</span>
          <select value={dur} onChange={(e) => patch({ dur: Number(e.target.value) || undefined })}>
            <option value={0}>{_t("Сколько часов")}</option>
            {[30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480, 540, 600, 720, 840, 960, 1080, 1200].map((m) => <option key={m} value={m}>{m < 60 ? _t("{0} мин", m) : m % 60 ? _t("{0} ч {1} мин", Math.floor(m / 60), m % 60) : _t("{0} ч", m / 60)}</option>)}
          </select>
        </label>
      </div>
      <p className="q-msg left tiny-note">{_t("Время по часам телефона, как сейчас дома. Длительность из билета.")}</p>

      {road && (
        <div className="h-card">
          <b className="sf-h">{mode === 'plane' ? _t("Что попадает в полёт") : _t("Что попадает в дорогу")}</b>
          <div className="sf-tl">
            {road.steps.map((s, i) => (
              <div key={i} className={`sf-st${s.kind !== 'prayer' || s.inside ? ' fly' : ''}${s.kind !== 'prayer' ? ' edge' : ''}`}>
                {s.kind === 'dep' && <><b>{hhmm(s.at)} {mode === 'plane' ? _t("Взлёт") : _t("Выезд")}</b><small>{_t("Дуа начала пути во вкладке «Дуа»")}</small></>}
                {s.kind === 'arr' && <><b>{hhmm(s.at)} {mode === 'plane' ? _t("Посадка") : _t("Прибытие")}</b><small>{_tj("{0}, по времени дома", trip.place)}</small></>}
                {s.kind === 'prayer' && <><b>{hhmm(s.at)} {prayerName(s.a!)}{s.inside ? ` · ${_t("в пути")}` : ` · ${_t("до выезда")}`}</b><small>{s.advice}</small></>}
              </div>
            ))}
          </div>
          {road.steps.every((s) => s.kind !== 'prayer') && <small>{_t("Ни один намаз не попадает в дорогу.")}</small>}
        </div>
      )}

      <div className="h-card">
        <b className="sf-h">{mode === 'plane' ? _t("Как молиться в самолёте") : mode === 'train' ? _t("Как молиться в поезде") : _t("Намаз в дороге на машине")}</b>
        <small>{mode === 'car'
          ? _t("Останавливайся на заправке или в зоне отдыха. Если намазы можно объединить, планируй остановку на время первого из пары.")
          : _t("Если можно, стоя в проходе или у кухни, лицом к кибле. Если нельзя, сидя в кресле: поясной поклон наклоном головы, земной ещё ниже. Кибла по компасу, а если её не определить, туда, куда можешь. Нет воды для омовения: таяммум.")}</small>
        <small>{_t("Обязательный намаз, время которого закончится в пути, не пропускай: соверши как можешь.")}</small>
      </div>
      <button type="button" className="ghost-btn" onClick={() => go('qibla')}><Ic e="compass" /> {_t("Кибла по компасу")}</button>
      <p className="q-msg left tiny-note">{_tj("Положение в пути считается по прямой от дома до места, время намазов примерное. Мазхаб: {0}. В спорном уточни у имама.", state.settings.madhab === 'hanafi' ? _t("ханафитский") : _t("шафиитский"))}</p>
      {today > trip.to && null}
    </>
  );
}

// ───────────── Masah over socks ─────────────

const toLocal = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const whenLabel = (ms: number, now: Date) => {
  const d = new Date(ms);
  const day = d.toDateString() === now.toDateString() ? _t("сегодня") : new Date(now.getTime() - 864e5).toDateString() === d.toDateString() ? _t("вчера") : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${day}, ${hhmm(d)}`;
};

function MasahTab({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const now = useNow(15000);
  const traveler = travelStatus(state, today).traveler;
  const m = state.masah ?? null;
  const set = (x: Masah | null) => update((s) => ({ ...s, masah: x }));
  const left = masahLeft(m, traveler, now.getTime());
  const over = Boolean(left?.started && left.left <= 0);
  const pct = left ? Math.round((left.frac) * 100) : 0;
  return (
    <>
      <p className="q-msg left">{traveler ? _t("Ты путник: протирать носки можно 3 суток (72 часа).") : _t("Дома протирать носки можно 1 сутки (24 часа), в поездке 3 суток.")}</p>
      {!m ? (
        <>
          <div className="h-card sf-hero"><b className="sf-big">{_t("Носки не надеты")}</b><small>{_t("Надень носки после полного омовения и отметь здесь. Таймер пойдёт, когда омовение нарушится.")}</small></div>
          <button type="button" className="pri-btn" onClick={() => set({ worn: Date.now() })}>{_t("Надел носки после омовения")}</button>
        </>
      ) : (
        <>
          <div className={`sf-ring${over ? ' over' : ''}`} style={{ ['--p' as string]: `${pct}%` }}>
            <div><b>{over ? _t("Срок вышел") : left?.started ? leftLabel(left.left) : _tj("{0} ч", left!.hours)}</b><small>{over ? _t("нужно полное омовение") : left?.started ? _tj("осталось из {0} ч", left.hours) : _t("отсчёт ещё не начался")}</small></div>
          </div>
          <div className="h-card">
            <div className="sf-row"><b className="sf-w">{_t("Надел")}</b><span>{whenLabel(m.worn, now)}</span></div>
            <div className="sf-row"><b className="sf-w">{_t("Омовение нарушилось")}</b>
              {m.broke ? <input type="datetime-local" className="sf-dt" value={toLocal(m.broke)} max={toLocal(Date.now())} onChange={(e) => { const v = new Date(e.target.value).getTime(); if (v) set({ ...m, broke: Math.max(m.worn, v) }); }} /> : <span>{_t("ещё нет")}</span>}
            </div>
            {left?.end && <div className="sf-row"><b className="sf-w">{_t("Закончится")}</b><span className="sf-strong">{whenLabel(left.end, now)}</span></div>}
          </div>
          <div className="sf-two">
            {!m.broke && <button type="button" className="pri-btn" onClick={() => set({ ...m, broke: Date.now() })}>{_t("Омовение нарушилось")}</button>}
            {m.broke && <button type="button" className="pri-btn" onClick={() => set({ ...m, wipes: (m.wipes ?? 0) + 1 })}>{_tj("Сделал масх{0}", m.wipes ? ` · ${m.wipes}` : '')}</button>}
            <button type="button" className="ghost-btn" onClick={() => set(null)}>{_t("Снял носки")}</button>
          </div>
          {state.settings.reminders?.on ? <p className="q-msg left tiny-note">{_t("За 3 часа до конца срока придёт напоминание.")}</p> : <p className="q-msg left tiny-note">{_t("Включи напоминания в Профиле, и за 3 часа до конца срока придёт уведомление.")}</p>}
        </>
      )}
      <div className="h-card">
        <b className="sf-h">{_t("Коротко о правилах")}</b>
        <small>{_t("Надевать после полного омовения, с мытьём ног. Носки должны закрывать щиколотки и быть целыми. Протирать мокрой рукой верх носка один раз.")}</small>
        <small>{_t("Срок идёт с первого нарушения омовения после надевания (ханафитский и шафиитский мазхабы). Снял носок, срок вышел или нужен гусль: масх прерван, нужно полное омовение.")}</small>
        <small>{_t("О масхе на тонкие тканевые носки мнения учёных расходятся. Уточни у своего имама.")}</small>
      </div>
    </>
  );
}

// ───────────── Dua: circle requests and duas with sound ─────────────

function DuaTab({ state, update, today, circle, joined }: { state: AppState; update: Update; today: string; circle?: CircleApi; joined?: boolean }) {
  const trip = state.trip;
  const on = tripOn(state, today);
  const since = trip ? addDays(trip.from, -3) : today;
  const asks = joined && circle ? circle.members.filter((m) => m.id !== circle.me && m.ask?.t && (on ? (m.ask.d ?? "") >= since : askLive(m.ask, today))) : [];
  const done = trip?.duas ?? [];
  const nm = (id: string) => circle?.names[id]?.name || _t("Брат из Круга");
  const make = (id: string) => {
    circle?.react(`a:${id}`, '🤲', today);
    update((s) => (s.trip && !(s.trip.duas ?? []).includes(id) ? { ...s, trip: { ...s.trip, duas: [...(s.trip.duas ?? []), id] } } : s));
  };
  const code = isCloud ? currentCircle()?.code : undefined;
  return (
    <>
      <div className="h-card sf-gold">
        <b className="sf-h">{_t("Дуа путника принимается")}</b>
        <small>{_t("«Три мольбы принимаются, в этом нет сомнения», и одна из них мольба путника (Абу Дауд, 1536).")}</small>
        {joined && circle ? (asks.length ? (
          <>
            {asks.map((m) => {
              const ok = done.includes(m.id);
              return (
                <label key={m.id} className="chk sf-ask">
                  <input type="checkbox" checked={ok} disabled={ok} onChange={() => make(m.id)} />
                  <span><b>{nm(m.id)}</b><small>{m.ask!.t}</small></span>
                </label>
              );
            })}
            <small>{_t("Отметишь, и человек увидит в Круге, что ты сделал за него дуа.")}</small>
          </>
        ) : <small>{_t("Сейчас просьб о дуа в Круге нет.")}</small>) : <small>{_t("Вступи в Круг, и здесь появятся просьбы о дуа от твоих близких.")}</small>}
        {code && trip && <TellCircle code={code} trip={trip} today={today} onTold={() => update((s) => (s.trip ? { ...s, trip: { ...s.trip, told: today } } : s))} />}
      </div>
      {DUAS.map((d) => <DuaCard key={d.title} d={d} />)}
    </>
  );
}

function TellCircle({ code, trip, today, onTold }: { code: string; trip: Trip; today: string; onTold: () => void }) {
  const chat = useChat(code, false);
  const [busy, setBusy] = useState(false);
  if (trip.told === today) return <small className="sf-ok">{_t("✓ Круг знает, что ты в пути")}</small>;
  const text = _tj("🧭 Я еду в {0} ({1}–{2}). Дуа путника принимается: нажмите «🤲 Дуа» в Круге и напишите, о чём сделать дуа за вас.", trip.place, fmt(trip.from), trip.open ? '…' : fmt(trip.to));
  return (
    <button type="button" className="gold-btn sf-wide" disabled={busy || !chat.ready} onClick={async () => { setBusy(true); const ok = await chat.send(text, null, 'text'); setBusy(false); if (ok) onTold(); }}>
      {busy ? _t("Отправляю…") : _t("Сказать Кругу, что я в пути")}
    </button>
  );
}

function DuaCard({ d }: { d: (typeof DUAS)[number] }) {
  const [playing, setPlaying] = useState(false);
  const [none, setNone] = useState(false);
  const play = async () => {
    if (playing) { hush(); setPlaying(false); return; }
    if (hasVoice('ar-SA') === false) { setNone(true); return; }
    setPlaying(true);
    await speak(d.ar.replace(/\.\.\./g, '،'), true, 'ar-SA');
    setPlaying(false);
  };
  useEffect(() => () => hush(), []);
  return (
    <div className="h-card dua">
      <div className="sf-dua-top">
        <button type="button" className="sf-play" aria-label={playing ? _t("Стоп") : _t("Слушать")} onClick={play}>{playing ? '■' : '▶'}</button>
        <span><b>{d.title}</b><small>{d.when}</small></span>
      </div>
      <p className="ar-dua" lang="ar" dir="rtl">{d.ar}</p>
      <p className="dua-tr">{d.tr}</p>
      <p className="dua-ru">{d.ru}</p>
      <small className="src">{d.src}</small>
      {none && <small>{_t("На этом телефоне нет арабского голоса. Его можно добавить в настройках телефона: Язык → Синтез речи.")}</small>}
    </div>
  );
}

// ───────────── Nearby: mosques, halal, Jumu'ah, fasting ─────────────

function NearTab({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const trip = state.trip;
  const on = tripOn(state, today);
  const [kind, setKind] = useState<'mosque' | 'halal'>('mosque');
  const [pos, setPos] = useState(() => lastPos());
  // On a trip: where the phone is, if it is near the destination; else the city itself.
  const at = useMemo(() => {
    if (on && trip) return pos && distanceKm(pos, trip) < 60 ? pos : { lat: trip.lat, lng: trip.lng };
    return pos ?? { lat: state.settings.lat, lng: state.settings.lng };
  }, [on, trip, pos, state.settings.lat, state.settings.lng]);
  const place = on && trip ? trip.place : state.settings.place;
  const [mosques, setMosques] = useState<Near[] | null>(() => { const c = cachedNear(at); return c ? sortNear(c, at, 5) : null; });
  const [halal, setHalal] = useState<Halal[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setErr('');
    setBusy(true);
    const job = kind === 'mosque'
      ? findMosques(at).then((l) => { if (live) setMosques(sortNear(l, at, 5)); })
      : findHalal(at).then((l) => { if (live) setHalal(l.map((h) => ({ ...h, km: distanceKm(at, h) })).sort((a, b) => a.km - b.km) as Halal[]); });
    job.catch(() => { if (live) setErr(_t("Карта сейчас не отвечает. Попробуй позже или открой в картах.")); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [kind, at.lat, at.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const friday = fromKey(today).getDay() === 5;
  const traveler = travelStatus(state, today).traveler;
  const rDay = ramadanDay(today);
  const fast = ramadanOf(state).fasts[today];

  return (
    <>
      <p className="q-msg left">{_tj("Рядом: {0}", place)}{pos && on && trip && distanceKm(pos, trip) < 60 ? ` · ${_t("по месту телефона")}` : ''}</p>
      <div className="sf-chips">
        <button type="button" aria-pressed={kind === 'mosque'} onClick={() => setKind('mosque')}><Ic e="mosque" /> {_t("Мечети")}</button>
        <button type="button" aria-pressed={kind === 'halal'} onClick={() => setKind('halal')}><Ic e="salad" /> {_t("Халяль")}</button>
        {!pos && <button type="button" onClick={async () => { const p = await locate(); if (p) setPos(p); }}><Ic e="pin" /> {_t("Где я")}</button>}
      </div>
      <div className="h-card sf-list">
        {busy && <small>{_t("Ищу на карте…")}</small>}
        {err && <small>{err}</small>}
        {kind === 'mosque' && !busy && mosques && (mosques.length ? mosques.slice(0, 8).map((m) => (
          <a key={m.id} className="sf-pl" href={routeUrl(m, m.km)} target="_blank" rel="noreferrer">
            <span className="sf-ic"><Ic e="mosque" /></span><span className="sf-sp"><b>{mosqueName(m)}</b><small>{distLabel(m.km)} · {wayLabel(m.km)}</small></span><span className="sf-tag">{_t("Маршрут")}</span>
          </a>
        )) : <small>{_t("В 5 км на карте мечетей не нашлось.")}</small>)}
        {kind === 'halal' && !busy && halal && (halal.length ? (halal as (Halal & { km: number })[]).slice(0, 8).map((h) => (
          <a key={h.id} className="sf-pl" href={routeUrl(h, h.km)} target="_blank" rel="noreferrer">
            <span className="sf-ic"><Ic e="salad" /></span><span className="sf-sp"><b>{h.name || _t("Без названия")}</b><small>{distLabel(h.km)}{h.only ? ` · ${_t("только халяль")}` : ''}</small></span><span className="sf-tag">{_t("Маршрут")}</span>
          </a>
        )) : <small>{_t("На карте рядом нет мест с отметкой «халяль». Такие отметки ставят добровольцы, поэтому их мало.")}</small>)}
        <a className="link-btn left" href={on ? `https://www.google.com/maps/search/${encodeURIComponent(kind === 'mosque' ? _t("мечеть") : 'halal')}/@${at.lat.toFixed(4)},${at.lng.toFixed(4)},14z` : kind === 'mosque' ? mapsSearchUrl() : halalSearchUrl()} target="_blank" rel="noreferrer">{_t("Открыть поиск в картах →")}</a>
        {kind === 'halal' && <small>{_t("Отметки «халяль» на картах не гарантия: уточняй на месте.")}</small>}
      </div>

      {on && (
        <div className="h-card">
          <b className="sf-h">{friday ? _t("Сегодня пятница: джума в пути") : _t("Джума в пути")}</b>
          <small>{traveler ? _t("Путнику джума не обязательна. Если рядом мечеть, сходить хорошо, и тогда Зухр не нужен. Иначе Зухр, 2 ракаата.") : _t("Ты на месте дольше срока путника: джума для тебя обязательна, как дома.")}</small>
        </div>
      )}

      {on && traveler && rDay && (
        <div className="h-card sf-gold">
          <b className="sf-h">{_tj("Пост в пути · {0}-й день Рамадана", rDay)}</b>
          <small>{_t("Путнику можно не поститься и восполнить день позже. Если в пути легко, поститься лучше.")}</small>
          <div className="sf-two">
            <button type="button" className={fast === 'fast' ? 'pri-btn' : 'ghost-btn'} onClick={() => update((s) => patchR(s, (r) => ({ fasts: { ...r.fasts, [today]: 'fast' } })))}>{_t("Пощусь")}</button>
            <button type="button" className={fast === 'travel' ? 'pri-btn' : 'ghost-btn'} onClick={() => update((s) => patchR(s, (r) => ({ fasts: { ...r.fasts, [today]: 'travel' } })))}>{_t("Восполню потом")}</button>
          </div>
          <small>{fast === 'travel' ? _t("✓ День добавлен в «Восполнить» в Рамадане.") : _t("«Восполню потом» добавит этот день в список восполнения Рамадана.")}</small>
        </div>
      )}
    </>
  );
}

// ───────────── Qibla ─────────────

export function Qibla({ lat, lng, place }: { lat: number; lng: number; place: string }) {
  const bearing = qibla(lat, lng);
  const [heading, setHeading] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const onAbs = (e: DeviceOrientationEvent) => { if (e.absolute && e.alpha != null) setHeading((360 - e.alpha) % 360); };
    const onIos = (e: DeviceOrientationEvent) => { const h = (e as any).webkitCompassHeading; if (typeof h === 'number') setHeading(h); };
    window.addEventListener('deviceorientationabsolute' as any, onAbs);
    window.addEventListener('deviceorientation', onIos);
    return () => { window.removeEventListener('deviceorientationabsolute' as any, onAbs); window.removeEventListener('deviceorientation', onIos); };
  }, []);

  const ask = async () => {
    const D = (window as any).DeviceOrientationEvent;
    try {
      if (D?.requestPermission) { const r = await D.requestPermission(); if (r !== 'granted') setMsg(_t("Доступ к компасу не дан.")); }
      setTimeout(() => setHeading((h) => { if (h === null) setMsg(_t("Компас в этом окне недоступен. Ориентируйся по градусам: держи телефон верхом на север.")); return h; }), 2500);
    } catch { setMsg(_t("Компас в этом окне недоступен. Ориентируйся по градусам.")); }
  };

  const rot = heading === null ? bearing : bearing - heading;
  const aligned = heading !== null && Math.abs(((rot % 360) + 540) % 360 - 180) < 5;
  // A short buzz the moment the phone lines up, so the person can look up from the screen.
  useEffect(() => { if (aligned) try { navigator.vibrate?.(60); } catch { /* not supported */ } }, [aligned]);
  return (
    <>
      <div className={`qibla${aligned ? ' ok' : ''}`}>
        <div className="rose" style={{ transform: `rotate(${heading === null ? 0 : -heading}deg)` }}>
          <span className="n">{_t("С")}</span><span className="e">{_t("В")}</span><span className="s">{_t("Ю")}</span><span className="w">{_t("З")}</span>
        </div>
        <div className="needle" style={{ transform: `rotate(${rot}deg)` }}><i /><span>🕋</span></div>
      </div>
      <div className="h-card h-hero">
        <b className="h-big sm">{Math.round(bearing)}°</b>
        <small>{_tj("от севера по часовой, на {0} · {1}", compassWord(bearing), place)}</small>
        {aligned && <small><b>{_t("Ты смотришь на киблу")}</b></small>}
      </div>
      {heading === null && <button type="button" className="pri-btn" onClick={ask}>{_t("Включить компас")}</button>}
      {msg && <p className="q-msg left">{msg}</p>}
      <p className="q-msg left tiny-note">{_t("Держи телефон горизонтально, подальше от металла и магнитов. В помещении и в самолёте компас может ошибаться на несколько градусов.")}</p>
    </>
  );
}
