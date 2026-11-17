import { useEffect, useRef } from 'react';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { umrahOf } from './Umrah';

// "Где моя группа": while we are there, each person who turned it on shares where they are
// with the Circle, and the screen shows the group around me, north up: who, how far, which way.

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const KAABA = { lat: 21.4225, lng: 39.8262 };
const NABAWI = { lat: 24.4672, lng: 39.6112 };
const R = 6371000;
const rad = (x: number) => (x * Math.PI) / 180;
function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const SIDES = ['на север', 'на северо-восток', 'на восток', 'на юго-восток', 'на юг', 'на юго-запад', 'на запад', 'на северо-запад'];
const side = (b: number) => SIDES[Math.round(b / 45) % 8];
const meters = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10 || 10} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`);
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'сейчас' : m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`; };
// Radar scale: 0..2 km, square root so the near ones are not squeezed into the middle.
const MAXM = 2000;
const rpos = (m: number) => Math.sqrt(Math.min(m, MAXM) / MAXM) * 120;

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; api: UmrahApi; host: string; members: string[]; nameOf: (id: string) => string }

export function GroupRadar({ state, update, api, host, members, nameOf }: Props) {
  const u = umrahOf(state);
  const on = !!u.shareLoc;
  const me = api.me!;
  const last = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    if (!on || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((p) => {
      const cur = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
      const l = last.current;
      // Write when I moved 25 m or every 2 minutes, to keep the Circle quiet.
      if (l && dist(l, cur) < 25 && cur.t - l.t < 120000) return;
      last.current = cur;
      api.saveLoc({ host, lat: cur.lat, lng: cur.lng, acc: Math.round(p.coords.accuracy), t: cur.t });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [on, host]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (on) api.saveLoc(null);
    update((s) => patch(s, { shareLoc: !on }));
  };

  const mine = api.locs[me];
  const center = mine ?? KAABA;
  const near = dist(center, NABAWI) < dist(center, KAABA) ? { ...NABAWI, n: 'Мечеть Пророка' } : { ...KAABA, n: 'Кааба' };
  const others = members.filter((m) => m !== me).map((m) => ({ id: m, l: api.locs[m]?.host === host ? api.locs[m] : undefined }));
  const seen = others.filter((o) => o.l);
  const pt = (p: { lat: number; lng: number }) => { const d = dist(center, p), b = rad(bearing(center, p)); return { x: 140 + rpos(d) * Math.sin(b), y: 140 - rpos(d) * Math.cos(b), d, b: bearing(center, p) }; };
  const holy = pt(near);

  return (
    <div className="gr">
      <div className="gr-head">
        <b>Где моя группа</b>
        <button type="button" className={`gr-sw${on ? ' on' : ''}`} onClick={toggle} aria-pressed={on}>{on ? 'Я виден группе' : 'Показать меня группе'}</button>
      </div>
      <svg viewBox="0 0 280 280" className="gr-map" role="img" aria-label="Группа вокруг меня">
        {[100, 500, 2000].map((m) => <circle key={m} cx="140" cy="140" r={rpos(m)} className="gr-ring" />)}
        {[100, 500, 2000].map((m) => <text key={m} x={140} y={140 + rpos(m) - 4} className="gr-rl">{meters(m)}</text>)}
        <text x="140" y="12" className="gr-n">С</text>
        {holy.d < MAXM * 1.5 && <g transform={`translate(${holy.x} ${holy.y})`}><rect x="-7" y="-7" width="14" height="14" rx="2" className="gr-kaaba" /><text y="-11" className="gr-lbl">{near.n}</text></g>}
        {seen.map((o, i) => { const p = pt(o.l!); const old = Date.now() - o.l!.t > 15 * 60000; const nm = nameOf(o.id) || 'участник';
          return <g key={o.id} transform={`translate(${p.x} ${p.y})`} className={old ? 'gr-old' : ''}><circle r="11" className={`gr-dot c${i % 5}`} /><text y="4" className="gr-ini">{nm[0]?.toUpperCase()}</text><text y="24" className="gr-lbl">{nm.split(' ')[0]}</text></g>; })}
        <circle cx="140" cy="140" r="7" className="gr-me" /><circle cx="140" cy="140" r="13" className="gr-me-ring" />
      </svg>
      {!mine && <p className="tiny">{on ? 'Ищу, где ты… Пока в центре Кааба.' : 'Ты в центре, когда включишь «Показать меня группе». Пока в центре Кааба.'}</p>}
      <div className="gr-list">
        {others.map((o) => {
          const nm = nameOf(o.id) || 'участник';
          if (!o.l) return <div key={o.id} className="gr-row off"><b>{nm}</b><small>не показывает себя</small></div>;
          const p = pt(o.l);
          return (
            <div key={o.id} className="gr-row">
              <div><b>{nm}</b><small>{meters(p.d)} {side(p.b)} · {ago(o.l.t)}</small></div>
              <a className="bk-go" href={`https://www.google.com/maps/dir/?api=1&destination=${o.l.lat},${o.l.lng}&travelmode=walking`} target="_blank" rel="noopener">Дойти</a>
            </div>
          );
        })}
        {others.length === 0 && <p className="tiny">В поездке пока только ты. Позови группу в Круге.</p>}
      </div>
      <p className="tiny">Место видят только участники твоего Круга и только пока открыто приложение. Выключи, когда группа вместе: батарея скажет спасибо. После поездки показ выключится сам.</p>
    </div>
  );
}

/** Clear my shared place once the trip is over. */
export function useStopSharingAfter(state: AppState, update: (fn: (s: AppState) => AppState) => void, api: UmrahApi, there: boolean) {
  const on = !!umrahOf(state).shareLoc;
  useEffect(() => {
    if (there || !api.me) return;
    if (api.locs[api.me]) api.saveLoc(null);
    if (on) update((s) => patch(s, { shareLoc: false }));
  }, [there, api.me, !!(api.me && api.locs[api.me])]); // eslint-disable-line react-hooks/exhaustive-deps
}
