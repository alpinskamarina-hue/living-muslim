import { useEffect, useState } from 'react';
import type { AppState, Trip } from '../types';
import { PLACES } from '../prayer';
import { addDays, fromKey } from '../dates';
import { CHECKLIST, DUAS, MIN_KM, STAY_LIMIT, compassWord, distanceKm, qibla, travelStatus, tripOn } from '../safar';
import { _t, _tj } from '../i18n';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  onClose: () => void;
}

const fmt = (k: string) => { const d = fromKey(k); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function Safar({ state, update, today, onClose }: Props) {
  const trip = state.trip;
  const [tab, setTab] = useState<'trip' | 'qibla' | 'dua'>('trip');
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_t("Сафар")}</b><small>{trip ? `${trip.place} · ${fmt(trip.from)}–${fmt(trip.to)}` : _t("Поездка, намазы в пути, кибла, дуа")}</small></div>
      </div>
      <div className="seg">
        {([['trip', _t("Поездка")], ['qibla', _t("Кибла")], ['dua', _t("Дуа")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'trip' && (trip ? <TripView state={state} update={update} today={today} trip={trip} /> : <TripSetup state={state} update={update} today={today} />)}
        {tab === 'qibla' && <Qibla lat={tripOn(state, today) ? trip!.lat : state.settings.lat} lng={tripOn(state, today) ? trip!.lng : state.settings.lng} place={tripOn(state, today) ? trip!.place : state.settings.place} />}
        {tab === 'dua' && DUAS.map((d) => (
          <div key={d.title} className="h-card dua">
            <b>{d.title}</b>
            <small>{d.when}</small>
            <p className="ar-dua" lang="ar" dir="rtl">{d.ar}</p>
            <p className="dua-tr">{d.tr}</p>
            <p className="dua-ru">{d.ru}</p>
            <small className="src">{d.src}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function TripSetup({ state, update, today }: { state: AppState; update: Props['update']; today: string }) {
  const [place, setPlace] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 3));
  const [stay, setStay] = useState(3);
  const [geo, setGeo] = useState('');
  const km = place ? distanceKm(state.settings, place) : 0;

  const locate = () => {
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
    const t: Trip = { place: place.name, lat: place.lat, lng: place.lng, from, to: to < from ? from : to, stayDays: stay, paused: [], checklist: [] };
    update((s) => ({ ...s, trip: t }));
  };

  return (
    <>
      <p className="q-msg left">{_t("Укажи, куда едешь. Время намазов пересчитается под это место, а дни поездки не будут считаться пропусками привычек.")}</p>
      <label className="field"><span>{_t("Куда")}</span>
        <select value={place && PLACES.some((p) => p.name === place.name) ? place.name : ''} onChange={(e) => { const p = PLACES.find((x) => x.name === e.target.value); if (p) setPlace(p); }}>
          <option value="">{place && !PLACES.some((p) => p.name === place.name) ? `${place.name} (${place.lat.toFixed(2)}, ${place.lng.toFixed(2)})` : _t("Выбери город")}</option>
          {PLACES.filter((p) => p.name !== state.settings.place).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="link-btn left" onClick={locate}>{_t("📍 Определить, где я сейчас")}</button>
      {geo && <p className="q-msg left">{geo}</p>}
      <div className="h-row">
        <label className="field"><span>{_t("Выезд")}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>{_t("Возвращение")}</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label className="field"><span>{_t("Сколько дней пробудешь на месте")}</span>
        <select value={stay} onChange={(e) => setStay(Number(e.target.value))}>
          {[0, 1, 2, 3, 4, 5, 7, 10, 14, 15, 20, 30].map((v) => <option key={v} value={v}>{v === 0 ? _t("Не останавливаюсь") : _t("{0} дн.", v)}</option>)}
        </select>
      </label>
      {place && (
        <p className="q-msg left">
          {km < MIN_KM
            ? _t("До места около {0} км. Обычно сафаром считается поездка от ~80 км, так что намазы, скорее всего, полностью.", Math.round(km))
            : stay >= STAY_LIMIT[state.settings.madhab]
              ? _t("Около {0} км. Но {1} дн. на месте: по {2} мазхабу сокращать можно только в дни дороги.", Math.round(km), stay, state.settings.madhab === 'hanafi' ? _t("ханафитскому") : _t("шафиитскому"))
              : _t("Около {0} км. В пути и на месте можно сокращать намазы{1}.", Math.round(km), state.settings.madhab === 'shafi' ? _t(" и объединять") : '')}
        </p>
      )}
      <button type="button" className="pri-btn" disabled={!place} onClick={start}>{_t("Начать поездку")}</button>
      <p className="q-msg left tiny-note">{_tj("Правила зависят от мазхаба в Профиле (сейчас: {0}). В спорных случаях уточни у своего имама.", state.settings.madhab === 'hanafi' ? _t("ханафитский") : _t("шафиитский"))}</p>
    </>
  );
}

function TripView({ state, update, today, trip }: { state: AppState; update: Props['update']; today: string; trip: Trip }) {
  const st = travelStatus(state, today);
  const on = tripOn(state, today);
  const active = state.habits.filter((h) => h.status === 'active');
  const patch = (p: Partial<Trip>) => update((s) => (s.trip ? { ...s, trip: { ...s.trip, ...p } } : s));
  const end = () => update((s) => {
    if (!s.trip) return s;
    const to = today < s.trip.to ? (today < s.trip.from ? null : today) : s.trip.to;
    return { ...s, trip: null, pastTrips: to ? [...(s.pastTrips ?? []), { from: s.trip.from, to }] : s.pastTrips };
  });

  return (
    <>
      <div className={`h-card h-hero${st.traveler ? ' traveler' : ''}`}>
        <small>{on ? _t("Сейчас") : today < trip.from ? _t("Выезд {0}", fmt(trip.from)) : _t("Поездка закончилась")}</small>
        <b className="h-big sm">{on ? (st.traveler ? _t("Ты путник") : _t("Полные намазы")) : trip.place}</b>
        {on && <small>{st.why}</small>}
        {on && <small>{_tj("Время намазов: {0}, по часам телефона. На месте телефон сам переключит часовой пояс.", trip.place)}</small>}
      </div>

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

      <h2 className="sub-h">{_t("Собрать в дорогу")}</h2>
      {CHECKLIST.map((c) => {
        const ok = trip.checklist.includes(c);
        return (
          <label key={c} className="chk">
            <input type="checkbox" checked={ok} onChange={() => patch({ checklist: ok ? trip.checklist.filter((x) => x !== c) : [...trip.checklist, c] })} />
            <span><b>{c}</b></span>
          </label>
        );
      })}

      <h2 className="sub-h">{_t("Даты")}</h2>
      <div className="h-row">
        <label className="field"><span>{_t("Выезд")}</span><input type="date" value={trip.from} onChange={(e) => patch({ from: e.target.value })} /></label>
        <label className="field"><span>{_t("Возвращение")}</span><input type="date" value={trip.to} min={trip.from} onChange={(e) => patch({ to: e.target.value })} /></label>
      </div>
      <button type="button" className="danger" onClick={end}>{_t("Я вернулся, закончить поездку")}</button>
    </>
  );
}

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
      <p className="q-msg left tiny-note">{_t("Держи телефон горизонтально, подальше от металла и магнитов. В помещении компас может ошибаться на несколько градусов.")}</p>
    </>
  );
}
