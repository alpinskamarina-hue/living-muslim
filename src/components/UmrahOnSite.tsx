import { useEffect, useState } from 'react';
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';
import type { AppState, UmrahState } from '../types';
import { umrahOf } from './Umrah';
import { _t, _tj, LOC } from '../i18n';

// On the ground in Makkah or Madinah: when to leave the hotel for the next prayer, a card to show
// if lost, and where the group meets. Everything works offline once filled in.

type Site = NonNullable<UmrahState['site']>;
const CITY = { makkah: { name: _t("Мекка"), ar: 'مكة المكرمة', mosque: _t("Харам"), c: new Coordinates(21.4225, 39.8262) }, madinah: { name: _t("Медина"), ar: 'المدينة المنورة', mosque: _t("мечеть Пророка ﷺ"), c: new Coordinates(24.4672, 39.6111) } };
const NAMES: Record<string, string> = { fajr: _t("Фаджр"), dhuhr: _t("Зухр"), asr: _t("Аср"), maghrib: _t("Магриб"), isha: _t("Иша") };
const EARLY = 20; // the Haram fills up: be inside 20 minutes before the adhan
const sa = (d: Date) => d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });

/** Today's five prayers in Makkah or Madinah with when to leave the hotel (walk + time to find a place). */
export function prayersToday(city: 'makkah' | 'madinah', walk: number, now: Date) {
  const t = new PrayerTimes(CITY[city].c, now, CalculationMethod.UmmAlQura());
  return (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((k) => ({ k, name: NAMES[k], at: t[k], leave: new Date(t[k].getTime() - (walk + EARLY) * 60000), time: sa(t[k]), leaveTime: sa(new Date(t[k].getTime() - (walk + EARLY) * 60000)) }));
}
export const cityName = (c: 'makkah' | 'madinah') => CITY[c].name;

function nextPrayer(city: keyof typeof CITY, now: Date) {
  const p = (d: Date) => new PrayerTimes(CITY[city].c, d, CalculationMethod.UmmAlQura());
  for (const day of [now, new Date(now.getTime() + 86400000)]) {
    const t = p(day);
    for (const k of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) if (t[k] > now) return { name: NAMES[k], at: t[k] };
  }
  return null;
}

export function LeaveForPrayer({ state }: { state: AppState }) {
  const site = umrahOf(state).site;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const city = site?.city ?? 'makkah';
  const walk = site?.walk ?? 10;
  const n = nextPrayer(city, now);
  if (!n) return null;
  const leave = new Date(n.at.getTime() - (walk + EARLY) * 60000);
  const mins = Math.round((leave.getTime() - now.getTime()) / 60000);
  return (
    <div className={`os-pray${mins <= 5 ? ' go' : ''}`}>
      <b>{_tj("{0} в {1} · {2}", n.name, sa(n.at), mins <= 0 ? _t("выходи сейчас") : _t("выходи в {0}", sa(leave)))}</b>
      <small>{_tj("{0}: {1} мин пешком + {2} мин, чтобы найти место. Время по Мекке.", CITY[city].mosque, walk, EARLY)}</small>
    </div>
  );
}

export function LostCard({ state, onClose }: { state: AppState; onClose: () => void }) {
  const s = umrahOf(state).site ?? {} as Site;
  return (
    <div className="sess os-lost" onClick={onClose}>
      <p className="os-ar" lang="ar" dir="rtl">أنا تائه، من فضلك ساعدني في الوصول إلى فندقي</p>
      <p className="os-ru">{_t("Я потерялся, пожалуйста, помогите мне добраться до отеля")}</p>
      <div className="os-box">
        <small>{_t("Отель · الفندق")}</small>
        <b>{s.hotel || _t("Отель не указан")}</b>
        {s.hotelAr && <b lang="ar" dir="rtl">{s.hotelAr}</b>}
        {s.address && <span>{s.address}</span>}
        <small>{CITY[s.city ?? 'makkah'].ar}</small>
      </div>
      {s.amir && (
        <div className="os-box">
          <small>{_t("Руководитель группы · رئيس المجموعة")}</small>
          <a href={`tel:${s.amir.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>{s.amirName ? `${s.amirName}: ` : ''}{s.amir}</a>
        </div>
      )}
      {s.meet && <div className="os-box"><small>{_t("Точка встречи · نقطة اللقاء")}</small><b>{s.meet}</b></div>}
      <div className="os-box"><small>{_t("Экстренная помощь в Саудии")}</small><a href="tel:911" onClick={(e) => e.stopPropagation()}>911</a></div>
      <small className="os-hint">{_t("Покажи этот экран полицейскому, сотруднику Харама или таксисту. Нажми, чтобы закрыть.")}</small>
    </div>
  );
}

export function OnSiteSetup({ state, update }: { state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const s = umrahOf(state).site ?? {} as Site;
  const set = (p: Partial<Site>) => update((x) => patch(x, { site: { ...(umrahOf(x).site ?? {}), ...p } as Site }));
  const f = (k: keyof Site, label: string, ph: string, extra?: object) => (
    <label className="field"><span>{label}</span><input defaultValue={(s[k] as string) ?? ''} placeholder={ph} onChange={(e) => set({ [k]: e.target.value || undefined } as Partial<Site>)} {...extra} /></label>
  );
  return (
    <div className="pp-card">
      <div className="pp-top"><b>{_t("На месте")}</b><small>{_t("для карточки «Я потерялся»")}</small></div>
      <div className="sv-quick">{(['makkah', 'madinah'] as const).map((c) => <button key={c} type="button" aria-pressed={(s.city ?? 'makkah') === c} onClick={() => set({ city: c })}>{CITY[c].name}</button>)}</div>
      {f('hotel', _t("Отель"), _t("Например: Swissôtel Makkah"))}
      {f('hotelAr', _t("Название отеля по-арабски (с брони или вывески)"), 'سويس أوتيل مكة', { dir: 'rtl', lang: 'ar' })}
      {f('address', _t("Адрес или ориентир"), _t("Ибрахим аль-Халиль, рядом с воротами 1"))}
      <label className="field"><span>{_tj("Сколько минут пешком до {0}", CITY[s.city ?? 'makkah'].mosque)}</span>
        <input type="number" inputMode="numeric" min={1} defaultValue={s.walk ?? 10} onChange={(e) => set({ walk: Number(e.target.value) || undefined })} /></label>
      {f('meet', _t("Точка встречи группы"), _t("Ворота 79 (Короля Фахда), у часов"))}
      {f('amirName', _t("Руководитель группы"), _t("Ильяс"))}
      {f('amir', _t("Его телефон"), '+966 5…', { type: 'tel' })}
    </div>
  );
}
