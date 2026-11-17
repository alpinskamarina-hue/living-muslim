import type { AppState, UmrahState } from '../types';
import { umrahOf } from './Umrah';

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });

// "Собрать поездку": tickets, hotel near the Haram, eSIM, insurance, visa.
// Plain recommendations: the buttons open ordinary searches, no partner programmes.

interface Item { id: string; icon: string; t: string; tip: string; btn: string; url: (from?: string, to?: string) => string; when: string }
const ITEMS: Item[] = [
  {
    id: 'visa', icon: '🛂', t: 'Виза', when: 'за 1–2 месяца', btn: 'Открыть Nusuk',
    tip: 'Умру можно сделать по туристической визе или через Nusuk. Официально и без посредников.',
    url: () => 'https://umrah.nusuk.sa',
  },
  {
    id: 'flight', icon: '✈️', t: 'Билеты', when: 'за 1–3 месяца', btn: 'Найти билеты',
    tip: 'Лети в Джидду (JED) или сразу в Медину (MED). Если сначала Мекка, ихрам надевай до миката, ещё в самолёте.',
    url: (f, t) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to JED${f ? ` on ${f}` : ''}${t ? ` through ${t}` : ''}`)}`,
  },
  {
    id: 'hotel', icon: '🏨', t: 'Отель у Харама', when: 'вместе с билетами', btn: 'Отели в Мекке',
    tip: 'Смотри не на звёзды, а на минуты пешком до мечети: 5–10 минут меняют всю поездку, особенно к фаджру.',
    url: (f, t) => `https://www.booking.com/searchresults.html?ss=Makkah${f ? `&checkin=${f}` : ''}${t ? `&checkout=${t}` : ''}`,
  },
  {
    id: 'esim', icon: '📶', t: 'eSIM', when: 'за неделю', btn: 'eSIM для Саудии',
    tip: 'Интернет сразу после посадки: карта, связь с группой, такси. Ставится за 5 минут, если телефон поддерживает eSIM.',
    url: () => 'https://www.airalo.com/saudi-arabia-esim',
  },
  {
    id: 'insure', icon: '🛡️', t: 'Страховка', when: 'с билетами', btn: 'Посмотреть',
    tip: 'Медстраховка уже входит в саудовскую визу. Отдельная нужна, только если хочешь защитить отмену поездки или багаж.',
    url: () => 'https://safetywing.com/nomad-insurance',
  },
];

export function UmrahBook({ state, update, from, to, compact }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; from?: string; to?: string; compact?: boolean }) {
  const done = umrahOf(state).booked ?? [];
  const toggle = (id: string) => update((s) => { const b = umrahOf(s).booked ?? []; return patch(s, { booked: b.includes(id) ? b.filter((x) => x !== id) : [...b, id] }); });
  const open = (it: Item) => window.open(it.url(from, to), '_blank', 'noopener');
  const left = ITEMS.filter((i) => !done.includes(i.id));

  if (compact) {
    if (!left.length) return null;
    const it = left[0];
    return (
      <div className="bk-next">
        <span>{it.icon}</span>
        <div><b>Поездка: {ITEMS.length - left.length} из {ITEMS.length}</b><small>Дальше: {left.map((i) => i.t).join(', ')}</small></div>
        <button className="bk-go" onClick={() => open(it)}>{it.btn}</button>
      </div>
    );
  }

  return (
    <div className="pp-card bk">
      <div className="bk-head"><b>Собрать поездку</b><small>{done.length} из {ITEMS.length}</small></div>
      <div className="bk-bar"><i style={{ width: `${(done.length / ITEMS.length) * 100}%` }} /></div>
      {ITEMS.map((it) => {
        const ok = done.includes(it.id);
        return (
          <div key={it.id} className={`bk-row${ok ? ' ok' : ''}`}>
            <button className="bk-tick" onClick={() => toggle(it.id)} aria-label={ok ? 'Снять отметку' : 'Готово'}>{ok ? '✓' : it.icon}</button>
            <div className="bk-t">
              <b>{it.t} <small>· {it.when}</small></b>
              {!ok && <p>{it.tip}</p>}
            </div>
            {!ok && <button className="bk-go" onClick={() => open(it)}>{it.btn}</button>}
          </div>
        );
      })}
      {from && <p className="tiny">Даты поездки уже подставлены в поиск билетов и отелей.</p>}
    </div>
  );
}
