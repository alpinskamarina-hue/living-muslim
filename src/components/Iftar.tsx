import { useState } from 'react';
import type { Iftar, IftarApi } from '../iftar';
import { addDays, fromKey } from '../dates';
import { inRamadan, hMonth } from '../rplan';

const fmt = (k: string) => fromKey(k).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

/** Iftars in the circle: shown in Sha'ban and Ramadan, or whenever someone has planned one. */
export function IftarSection({ api, today, nameOf }: { api: IftarApi; today: string; nameOf: (id: string) => string }) {
  const [form, setForm] = useState(false);
  if (!api.ready) return null;
  const { me, events, rsvp } = api;
  const hosts = Object.keys(events).filter((h) => events[h].date >= addDays(today, -1)).sort((a, b) => events[a].date.localeCompare(events[b].date));
  const season = inRamadan(today) || hMonth(today)?.month === 8 || inRamadan(addDays(today, 7));
  if (!season && !hosts.length) return null;
  return (
    <section className="umrah-c">
      <h2 className="sub-h">Ифтар вместе</h2>
      <p className="tiny">«Кто накормит постящегося, получит награду, как у него, и награда постящегося не уменьшится». ат-Тирмизи, 807</p>
      {api.error && <div className="warn">{api.error}</div>}
      {hosts.map((h) => <IftarCard key={h} host={h} e={events[h]} api={api} nameOf={nameOf} />)}
      {me && !events[me] && (form
        ? <IftarForm today={today} onCancel={() => setForm(false)} onSave={(e) => { api.save(e); setForm(false); }} />
        : <button type="button" className="pri-btn big-btn" onClick={() => setForm(true)}>🌙 Позвать на ифтар</button>)}
      {me && events[me] && Object.keys(rsvp).length === 0 && <p className="tiny">Друзья увидят приглашение во вкладке «Круг».</p>}
    </section>
  );
}

function IftarForm({ today, initial, onSave, onCancel }: { today: string; initial?: Iftar; onSave: (e: Iftar) => void; onCancel: () => void }) {
  const [date, setDate] = useState(initial?.date ?? addDays(today, 1));
  const [place, setPlace] = useState(initial?.place ?? '');
  const [time, setTime] = useState(initial?.time ?? 'к Магрибу');
  const [note, setNote] = useState(initial?.note ?? '');
  const [bring, setBring] = useState((initial?.bring ?? ['Финики', 'Вода и напитки', 'Салат', 'Сладкое']).join(', '));
  return (
    <div className="join">
      <div className="h-row">
        <label className="field"><span>Когда</span><input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Во сколько</span><input value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="field"><span>Где</span><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="У меня дома, или мечеть на …" /></label>
      <label className="field"><span>Кто что приносит (через запятую)</span><input value={bring} onChange={(e) => setBring(e.target.value)} /></label>
      <label className="field"><span>Заметка</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Потом таравих в мечети" /></label>
      <div className="row2 light">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="button" className="pri-btn" disabled={!date || !place.trim()} onClick={() => onSave({ date, time: time.trim(), place: place.trim(), note: note.trim(), bring: bring.split(',').map((x) => x.trim()).filter(Boolean), created: initial?.created ?? new Date().toISOString() })}>Позвать</button>
      </div>
    </div>
  );
}

function IftarCard({ host, e, api, nameOf }: { host: string; e: Iftar; api: IftarApi; nameOf: (id: string) => string }) {
  const { me, rsvp } = api;
  const [edit, setEdit] = useState(false);
  const isHost = me === host;
  const guests = Object.entries(rsvp).filter(([, m]) => m[host]?.s === 'go').map(([id, m]) => ({ id, bring: m[host].bring }));
  const my = me ? rsvp[me]?.[host] : undefined;
  const taken = (b: string) => guests.find((g) => g.bring === b);
  if (edit && isHost) return <IftarForm today={e.date} initial={e} onCancel={() => setEdit(false)} onSave={(x) => { api.save(x); setEdit(false); }} />;
  return (
    <div className="trip if-card">
      <div className="meal-h"><b>{isHost ? 'Твой ифтар' : `Ифтар у ${nameOf(host)}`}</b><small>{fmt(e.date)}</small></div>
      <small>{e.place}{e.time ? ` · ${e.time}` : ''}{e.note ? ` · ${e.note}` : ''}</small>
      <small>Идут: {guests.length ? guests.map((g) => nameOf(g.id)).join(', ') : 'пока никто'}</small>
      {e.bring.length > 0 && (
        <div className="choices">
          {e.bring.map((b) => {
            const t = taken(b);
            const mine = my?.bring === b;
            return (
              <button type="button" key={b} aria-pressed={Boolean(t)} disabled={isHost || (Boolean(t) && !mine)} onClick={() => api.respond(host, { s: 'go', bring: mine ? undefined : b })}>
                {b}{t ? ` · ${t.id === me ? 'ты' : nameOf(t.id)}` : ''}
              </button>
            );
          })}
        </div>
      )}
      {isHost ? (
        <div className="row2 light">
          <button type="button" onClick={() => setEdit(true)}>Изменить</button>
          <button type="button" onClick={() => api.remove()}>Отменить ифтар</button>
        </div>
      ) : (
        <div className="row2 light">
          <button type="button" className={my?.s === 'go' ? 'pri-btn' : ''} onClick={() => api.respond(host, my?.s === 'go' ? null : { s: 'go' })}>{my?.s === 'go' ? 'Иду ✓' : 'Приду'}</button>
          <button type="button" className={my?.s === 'no' ? 'pri-btn' : ''} onClick={() => api.respond(host, { s: 'no' })}>Не смогу</button>
        </div>
      )}
    </div>
  );
}
