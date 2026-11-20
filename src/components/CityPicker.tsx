import { useState } from 'react';
import { ALL_PLACES, COUNTRIES, countryOf, type Place } from '../places';
import { _t } from '../i18n';

type Pick = { name: string; lat: number; lng: number };

/**
 * Two selects: country, then city. `value` may be a place outside the list (geolocation);
 * then it shows as the first city option with its coordinates.
 */
export function CityPicker({ value, onPick, exclude, cityLabel = _t("Город"), className = 'field', search }: {
  value: Pick | null;
  /** A search box over all cities above the two selects. */
  search?: boolean;
  onPick: (p: Pick) => void;
  exclude?: string;
  cityLabel?: string;
  className?: string;
}) {
  const [country, setCountry] = useState(() => (value ? countryOf(value) : ''));
  const [q, setQ] = useState('');
  const norm = (x: string) => x.toLowerCase().replace(/ё/g, 'е').replace(/[-‐\s]/g, '');
  const hits = q.trim().length >= 2 ? ALL_PLACES.filter((p) => p.name !== exclude && norm(p.name).includes(norm(q))).slice(0, 6) : [];
  const cname = (id: string) => COUNTRIES.find((x) => x.id === id)?.name ?? '';
  const c = COUNTRIES.find((x) => x.id === country);
  const cities: Place[] = (c?.cities ?? []).filter((p) => p.name !== exclude);
  const inList = Boolean(value && cities.some((p) => p.name === value.name));
  const outside = value && !inList && (!country || countryOf(value) === country) && !COUNTRIES.some((x) => x.cities.some((p) => p.name === value.name));
  return (
    <>
      {search && (
        <div className="cp-search">
          <input type="search" value={q} placeholder={_t("Поиск города")} aria-label={_t("Поиск города")} onChange={(e) => setQ(e.target.value)} />
          {hits.length > 0 && <div className="cp-hits">{hits.map((p) => (
            <button key={p.country + p.name} type="button" onClick={() => { setCountry(p.country); onPick(p); setQ(''); }}><b>{p.name}</b><small>{cname(p.country)}</small></button>
          ))}</div>}
          {q.trim().length >= 2 && !hits.length && <small className="cp-none">{_t("Такого города нет в списке. Выбери ближайший или нажми «Определить, где я сейчас».")}</small>}
        </div>
      )}
      <label className={className}><span>{_t("Страна")}</span>
        <select value={country} onChange={(e) => {
          const id = e.target.value;
          setCountry(id);
          const first = COUNTRIES.find((x) => x.id === id)?.cities.filter((p) => p.name !== exclude)[0];
          // A country with one city (Qatar, Singapore…) needs no second choice.
          if (first && COUNTRIES.find((x) => x.id === id)!.cities.length === 1) onPick(first);
        }}>
          <option value="">{_t("Выбери страну")}</option>
          {COUNTRIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className={className}><span>{cityLabel}</span>
        <select disabled={!country && !outside} value={inList ? value!.name : ''} onChange={(e) => { const p = cities.find((x) => x.name === e.target.value); if (p) onPick(p); }}>
          <option value="">{outside ? `${value!.name} (${value!.lat.toFixed(2)}, ${value!.lng.toFixed(2)})` : country ? _t("Выбери город") : _t("Сначала страна")}</option>
          {cities.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
    </>
  );
}
