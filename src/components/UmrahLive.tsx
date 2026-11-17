import { useEffect, useState } from 'react';

// A window to the Haram: the live broadcast from Makkah or Madinah, and the weather there.
// Weather comes from Open-Meteo (free, no key). Advice follows the heat, because heat is what
// actually hurts pilgrims.

type Place = 'makkah' | 'madinah';
const CITY: Record<Place, { name: string; lat: number; lon: number }> = {
  makkah: { name: 'Мекка', lat: 21.4225, lon: 39.8262 },
  madinah: { name: 'Медина', lat: 24.4672, lon: 39.6111 },
};
interface Wx { now: number; code: number; days: { d: string; max: number; min: number; code: number }[] }

const icon = (c: number) => (c === 0 ? '☀' : c <= 2 ? '🌤' : c <= 3 ? '☁' : c <= 48 ? '🌫' : c <= 67 || (c >= 80 && c <= 82) ? '🌧' : c >= 95 ? '⛈' : '☁');
const advice = (max: number) =>
  max >= 40 ? 'Очень жарко. Таваф и саи ночью или до рассвета, зонт от солнца, вода с солью или электролитами, сандалии на мраморе днём горячие.'
    : max >= 34 ? 'Жарко. Таваф лучше после Иша или до Фаджра, с собой вода и зонт, днём отдыхай в отеле.'
      : max >= 26 ? 'Тепло и комфортно. Днём на солнце всё равно бери воду и головной убор.'
        : 'Прохладно, особенно ночью. Возьми лёгкую кофту на вечер (сёстрам; братьям в ихраме нельзя шитую одежду).';

async function weather(p: Place): Promise<Wx> {
  const c = CITY[p];
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FRiyadh&forecast_days=7`);
  const j = await r.json();
  return {
    now: Math.round(j.current.temperature_2m), code: j.current.weather_code,
    days: j.daily.time.map((d: string, i: number) => ({ d, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), code: j.daily.weather_code[i] })),
  };
}

export function UmrahLive() {
  const [wx, setWx] = useState<Partial<Record<Place, Wx>>>({});
  const [open, setOpen] = useState<null | 'live' | Place>(null);
  const [place, setPlace] = useState<Place>('makkah');
  const [vid, setVid] = useState<Partial<Record<Place, string | null>>>({});

  useEffect(() => {
    (['makkah', 'madinah'] as Place[]).forEach((p) => weather(p).then((w) => setWx((x) => ({ ...x, [p]: w }))).catch(() => {}));
  }, []);
  useEffect(() => {
    if (open !== 'live' || vid[place] !== undefined) return;
    fetch(`/api/yt?live=${place}`).then((r) => r.json()).then((j) => setVid((v) => ({ ...v, [place]: j.id ?? null }))).catch(() => setVid((v) => ({ ...v, [place]: null })));
  }, [open, place, vid]);

  const toggle = (k: 'live' | Place) => setOpen(open === k ? null : k);
  const w = open && open !== 'live' ? wx[open] : null;
  const id = vid[place];

  return (
    <div className="ul">
      <div className="ul-chips">
        <button type="button" className="ul-chip live" aria-pressed={open === 'live'} onClick={() => toggle('live')}>Кааба сейчас</button>
        {(['makkah', 'madinah'] as Place[]).map((p) => (
          <button key={p} type="button" className="ul-chip" aria-pressed={open === p} onClick={() => toggle(p)}>
            {CITY[p].name} {wx[p] ? `${wx[p]!.now}° ${icon(wx[p]!.code)}` : '…'}
          </button>
        ))}
      </div>

      {open === 'live' && (
        <div className="ul-panel">
          <div className="um-lang ul-place">
            {(['makkah', 'madinah'] as Place[]).map((p) => <button key={p} type="button" aria-pressed={place === p} onClick={() => setPlace(p)}>{p === 'makkah' ? 'Кааба' : 'Мечеть Пророка ﷺ'}</button>)}
          </div>
          <div className="um-player">
            {id ? <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0`} title="Прямой эфир" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              : <div className="ul-wait">{id === null ? 'Эфир сейчас недоступен. Попробуй позже.' : 'Подключаемся к эфиру…'}</div>}
          </div>
          <small className="tiny">Прямая трансляция саудовского телевидения через YouTube. Звук включается в плеере.</small>
        </div>
      )}

      {w && open && open !== 'live' && (
        <div className="ul-panel">
          <div className="ul-days">
            {w.days.map((d) => (
              <span key={d.d}><small>{new Date(d.d).toLocaleDateString('ru-RU', { weekday: 'short' })}</small><i>{icon(d.code)}</i><b>{d.max}°</b><small>{d.min}°</small></span>
            ))}
          </div>
          <p className="ul-adv">{advice(Math.max(...w.days.map((d) => d.max)))}</p>
          <small className="tiny">Прогноз на 7 дней, Open-Meteo.</small>
        </div>
      )}
    </div>
  );
}
