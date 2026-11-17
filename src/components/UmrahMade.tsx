import type { AppState, UmrahState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { umrahOf } from './Umrah';

// "Your dua was made at the Kaaba": when a pilgrim ticks a request from the Circle while in Makkah,
// the person who asked sees it on their Today screen. Marks travel inside the pilgrim's own rsvp
// document, so no new table is needed.

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });

/** Everything made for me: by whom, which request, on which trip. */
export function madeForMe(api: UmrahApi) {
  const { me, rsvp, duas } = api;
  if (!me) return [];
  const out: { key: string; by: string; text: string }[] = [];
  for (const [by, trips] of Object.entries(rsvp)) {
    if (by === me) continue;
    for (const [host, r] of Object.entries(trips ?? {})) {
      for (const k of r.made ?? []) {
        const [who, h, i] = k.split(':');
        if (who !== me || h !== host) continue;
        const text = duas[me]?.[host]?.[Number(i)];
        if (text) out.push({ key: `${by}|${k}`, by, text });
      }
    }
  }
  return out;
}

export function UmrahMadeCard({ state, update, api }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; api: UmrahApi }) {
  const seen = umrahOf(state).madeSeen ?? [];
  const fresh = madeForMe(api).filter((m) => !seen.includes(m.key));
  if (!fresh.length) return null;
  const close = () => update((s) => patch(s, { madeSeen: [...(umrahOf(s).madeSeen ?? []), ...fresh.map((m) => m.key)] }));
  const by = [...new Set(fresh.map((m) => api.names[m.by] || 'Брат из Круга'))];
  return (
    <div className="mk-card" role="status">
      <span className="mk-ic">🕋</span>
      <div>
        <b>{by.join(', ')} {by.length > 1 ? 'сделали' : 'сделал'} за тебя дуа у Каабы</b>
        {fresh.slice(0, 3).map((m) => <small key={m.key}>«{m.text}»</small>)}
        <p>Скажи «Аамин» и сделай дуа в ответ за {by.length > 1 ? 'них' : by[0]}.</p>
        <button type="button" className="mk-ok" onClick={close}>Аамин 🤲</button>
      </div>
    </div>
  );
}
