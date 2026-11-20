import { useEffect, useRef, useState } from 'react';
import { ALL_PLACES, COUNTRIES, countryOf, type Place } from '../places';
import { _t, LANG } from '../i18n';

type Pick = { name: string; lat: number; lng: number };
interface Found { name: string; lat: number; lng: number; sub: string; cc: string }

// Recently chosen places, on this phone only.
const MINE_KEY = 'lm_mycities';
const readMine = (): Found[] => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]') as Found[]; } catch { return []; } };
const saveMine = (f: Found) => {
  try {
    const list = [f, ...readMine().filter((x) => !(x.name === f.name && Math.abs(x.lat - f.lat) < 0.01))].slice(0, 6);
    localStorage.setItem(MINE_KEY, JSON.stringify(list));
  } catch { /* private mode */ }
};

const cname = (id: string) => COUNTRIES.find((x) => x.id === id)?.name ?? '';
const norm = (x: string) => x.toLowerCase().replace(/ё/g, 'е').replace(/[-‐\s']/g, '');

/** Any town or village in the world, from the open GeoNames data (Open-Meteo geocoding: free, no key). */
async function searchWorld(q: string, cc: string, signal: AbortSignal): Promise<Found[]> {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${LANG}&format=json${cc ? `&countryCode=${cc.toUpperCase()}` : ''}`;
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return (j.results ?? []).filter((x: any) => typeof x.latitude === 'number').map((x: any) => ({
    name: String(x.name),
    lat: x.latitude,
    lng: x.longitude,
    cc: String(x.country_code ?? '').toLowerCase(),
    sub: [x.country, x.admin1 && x.admin1 !== x.name ? x.admin1 : ''].filter(Boolean).join(', '),
  }));
}

/**
 * Search over every city of the world, then country → city from our list.
 * `value` may be a place outside the list (search, geolocation): it shows as the first city option.
 * `onClear`: the chosen place no longer fits the country picked.
 */
export function CityPicker({ value, onPick, onClear, exclude, cityLabel = _t("Город"), className = 'field' }: {
  value: Pick | null;
  onPick: (p: Pick) => void;
  onClear?: () => void;
  exclude?: string;
  cityLabel?: string;
  className?: string;
  /** Kept for older callers: the search is always shown now. */
  search?: boolean;
}) {
  const [country, setCountry] = useState(() => (value ? countryOf(value) : ''));
  const [q, setQ] = useState('');
  const [scoped, setScoped] = useState(false); // «Другой город…»: search only in the chosen country
  const [world, setWorld] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mine] = useState(readMine);
  const box = useRef<HTMLInputElement>(null);

  const term = q.trim();
  const inCountry = scoped && country ? country : '';
  const local: Found[] = term.length >= 2
    ? ALL_PLACES.filter((p) => p.name !== exclude && (!inCountry || p.country === inCountry) && norm(p.name).includes(norm(term))).sort((a, b) => Number(!norm(a.name).startsWith(norm(term))) - Number(!norm(b.name).startsWith(norm(term)))).slice(0, 5).map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, cc: p.country, sub: cname(p.country) }))
    : [];

  useEffect(() => {
    setWorld([]); setErr('');
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      searchWorld(term, inCountry, ctl.signal)
        .then((l) => setWorld(l))
        .catch((e) => { if ((e as Error).name !== 'AbortError') setErr(_t("Поиск по миру сейчас недоступен. Выбери из списка или определи место по GPS.")); })
        .finally(() => setBusy(false));
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term, inCountry]);

  // Online results that are not already shown from our list (same name within ~10 km).
  const extra = world.filter((w) => !local.some((l) => norm(l.name) === norm(w.name) && Math.abs(l.lat - w.lat) < 0.1 && Math.abs(l.lng - w.lng) < 0.1));
  const choose = (f: Found) => {
    saveMine(f);
    if (COUNTRIES.some((c) => c.id === f.cc)) setCountry(f.cc);
    onPick({ name: f.name, lat: f.lat, lng: f.lng });
    setQ(''); setScoped(false);
  };

  const c = COUNTRIES.find((x) => x.id === country);
  const cities: Place[] = (c?.cities ?? []).filter((p) => p.name !== exclude);
  const inList = Boolean(value && cities.some((p) => p.name === value.name));
  const outside = Boolean(value && !inList && !ALL_PLACES.some((p) => p.name === value.name));
  const showMine = !term && mine.filter((m) => m.name !== exclude && m.name !== value?.name).slice(0, 4);

  return (
    <>
      <div className="cp-search">
        <input ref={box} type="search" value={q} placeholder={inCountry ? _t("Город в стране: {0}", cname(inCountry)) : _t("Поиск любого города или села")} aria-label={_t("Поиск города")} onChange={(e) => setQ(e.target.value)} />
        {inCountry && <small className="cp-none">{_t("Ищу только в стране: {0}.", cname(inCountry))} <button type="button" className="link-btn" onClick={() => setScoped(false)}>{_t("Искать везде")}</button></small>}
        {showMine && showMine.length > 0 && (
          <div className="cp-mine"><small>{_t("Мои города")}</small>{showMine.map((m) => <button key={m.name + m.lat} type="button" onClick={() => choose(m)}>{m.name}</button>)}</div>
        )}
        {(local.length > 0 || extra.length > 0) && (
          <div className="cp-hits">
            {[...local, ...extra].slice(0, 8).map((f) => (
              <button key={`${f.name}${f.lat}${f.lng}`} type="button" onClick={() => choose(f)}><b>{f.name}</b><small>{f.sub}</small></button>
            ))}
          </div>
        )}
        {busy && <small className="cp-none">{_t("Ищу по всему миру…")}</small>}
        {err && <small className="cp-none">{err}</small>}
        {term.length >= 2 && !busy && !err && !local.length && !extra.length && <small className="cp-none">{_t("Ничего не нашлось. Проверь название или нажми «Определить, где я сейчас».")}</small>}
      </div>
      <label className={className}><span>{_t("Страна")}</span>
        <select value={country} onChange={(e) => {
          const id = e.target.value;
          setCountry(id);
          // The place found earlier (search, GPS) may be in another country: drop it, so distance is not taken from it.
          if (value && countryOf(value) !== id) onClear?.();
          const list = COUNTRIES.find((x) => x.id === id)?.cities.filter((p) => p.name !== exclude) ?? [];
          // A country with one city (Qatar, Singapore…) needs no second choice.
          if (list.length === 1) onPick(list[0]);
        }}>
          <option value="">{_t("Выбери страну")}</option>
          {COUNTRIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className={className}><span>{cityLabel}</span>
        <select disabled={!country && !outside} value={inList ? value!.name : ''} onChange={(e) => {
          if (e.target.value === '__other') { setScoped(true); setTimeout(() => { box.current?.focus(); box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50); return; }
          const p = cities.find((x) => x.name === e.target.value); if (p) onPick(p);
        }}>
          <option value="">{outside ? value!.name : country ? _t("Выбери город") : _t("Сначала страна")}</option>
          {cities.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          {country && <option value="__other">{_t("Другой город…")}</option>}
        </select>
      </label>
    </>
  );
}
