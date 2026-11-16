import { useEffect, useState } from 'react';
import type { UmrahApi, URsvp, UStatus, UTrip } from '../umrahCircle';
import { uid } from '../store';

interface Props { api: UmrahApi; myReady: number; nameOf: (id: string) => string }

const ST: { s: UStatus; l: string }[] = [{ s: 'go', l: 'Еду' }, { s: 'maybe', l: 'Думаю' }, { s: 'no', l: 'Не в этот раз' }];

export function UmrahTrips({ api, myReady, nameOf }: Props) {
  const { me, trips, rsvp } = api;
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Keep my readiness in step with my own preparation list, for every trip I am going on.
  useEffect(() => {
    if (!me) return;
    for (const [host, r] of Object.entries(rsvp[me] ?? {})) if (r.s === 'go' && r.ready !== myReady && trips[host]) api.respond(host, { ready: myReady });
  }, [myReady, me, JSON.stringify(rsvp[me ?? ''] ?? {})]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api.ready) return null;
  const hosts = Object.keys(trips).sort((a, b) => (trips[b].created ?? '').localeCompare(trips[a].created ?? ''));

  return (
    <section className="umrah-c">
      <h2 className="sub-h">Совместная умра</h2>
      {api.error && <div className="warn">{api.error}</div>}
      {hosts.length === 0 && !creating && <p className="tiny">Пока никто не собирает поездку. Предложи первым: братья и сёстры из Круга смогут присоединиться, разделить задачи и готовиться вместе.</p>}
      {hosts.map((h) => (
        <TripCard key={h} host={h} trip={trips[h]} api={api} nameOf={nameOf} myReady={myReady} open={open === h} onToggle={() => setOpen(open === h ? null : h)} />
      ))}
      {me && !trips[me] && (creating
        ? <TripForm onCancel={() => setCreating(false)} onSave={(t) => { api.saveTrip(t); api.respond(me, { s: 'go', ready: myReady }); setCreating(false); setOpen(me); }} />
        : <button type="button" className="pri-btn big-btn" onClick={() => setCreating(true)}>🕋 Собрать поездку на умру</button>)}
    </section>
  );
}

function TripForm({ initial, onSave, onCancel }: { initial?: UTrip; onSave: (t: UTrip) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? 'Умра с братьями');
  const [month, setMonth] = useState(initial?.month ?? '');
  const [city, setCity] = useState(initial?.city ?? 'Амстердам');
  return (
    <div className="join">
      <label className="field"><span>Название</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="h-row">
        <label className="field"><span>Когда</span><input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="февраль 2027" /></label>
        <label className="field"><span>Вылет из</span><input value={city} onChange={(e) => setCity(e.target.value)} /></label>
      </div>
      <div className="row2 light">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="button" className="pri-btn" disabled={!title.trim() || !month.trim()} onClick={() => onSave({ title: title.trim(), month: month.trim(), city: city.trim(), amir: initial?.amir, tasks: initial?.tasks ?? [], created: initial?.created ?? new Date().toISOString() })}>Сохранить</button>
      </div>
    </div>
  );
}

function TripCard({ host, trip, api, nameOf, myReady, open, onToggle }: { host: string; trip: UTrip; api: UmrahApi; nameOf: (id: string) => string; myReady: number; open: boolean; onToggle: () => void }) {
  const { me, rsvp, duas } = api;
  const isHost = me === host;
  const [edit, setEdit] = useState(false);
  const [task, setTask] = useState('');
  const [taskWho, setTaskWho] = useState('');
  const [dua, setDua] = useState('');
  const resp = (id: string): URsvp | undefined => rsvp[id]?.[host];
  const people = Object.keys(rsvp).filter((id) => resp(id));
  const going = people.filter((id) => resp(id)!.s === 'go');
  const maybe = people.filter((id) => resp(id)!.s === 'maybe');
  const mine = me ? resp(me) : undefined;
  const tasks = trip.tasks ?? [];
  const isDone = (t: { id: string; who?: string }) => Boolean(t.who && resp(t.who)?.done?.includes(t.id));
  const requests = Object.entries(duas).flatMap(([from, m]) => (m?.[host] ?? []).map((text, i) => ({ from, text, i })));
  const myDuas = (me && duas[me]?.[host]) || [];
  const saveTrip = (p: Partial<UTrip>) => api.saveTrip({ ...trip, ...p });

  if (edit) return <TripForm initial={trip} onCancel={() => setEdit(false)} onSave={(t) => { api.saveTrip(t); setEdit(false); }} />;

  return (
    <div className="trip">
      <button type="button" className="trip-head" onClick={onToggle} aria-expanded={open}>
        <span className="trip-ic">🕋</span>
        <span className="q-t">
          <b>{trip.title}</b>
          <small>{trip.month}{trip.city ? ` · из ${trip.city}` : ''} · собирает {isHost ? 'ты' : nameOf(host)}</small>
          <small>Едут: {going.length}{maybe.length ? ` · думают: ${maybe.length}` : ''}{requests.length ? ` · просьб о дуа: ${requests.length}` : ''}</small>
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="trip-body">
          <div className="h-q">
            {ST.map((x) => (
              <button type="button" key={x.s} aria-pressed={mine?.s === x.s} onClick={() => api.respond(host, { s: x.s, ready: myReady })}>{x.l}</button>
            ))}
          </div>

          <h3>Кто едет</h3>
          {going.length === 0 && <p className="tiny">Пока никто не ответил «Еду».</p>}
          {going.map((id) => (
            <div key={id} className="tp">
              <span><b>{nameOf(id)}{id === me ? ' (ты)' : ''}</b>{trip.amir === id && <em className="amir">амир</em>}</span>
              <span className="tp-bar"><i style={{ width: `${resp(id)!.ready}%` }} /></span>
              <small>{resp(id)!.ready}%</small>
            </div>
          ))}
          {maybe.length > 0 && <p className="tiny">Думают: {maybe.map(nameOf).join(', ')}</p>}
          <p className="tiny">Готовность это доля пунктов подготовки в Практике → Умра. Сами пункты не видны.</p>

          {isHost && going.length > 0 && (
            <label className="field"><span>Амир группы</span>
              <select value={trip.amir ?? ''} onChange={(e) => saveTrip({ amir: e.target.value || undefined })}>
                <option value="">не выбран</option>
                {going.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
            </label>
          )}
          {!isHost && !trip.amir && going.length >= 3 && <p className="tiny">По сунне в поездке от трёх человек выбирают амира. Его назначает тот, кто собирает поездку.</p>}

          <h3>Задачи</h3>
          {tasks.length === 0 && <p className="tiny">{isHost ? 'Добавь задачи и раздай их: билеты, отель, трансфер, разрешения.' : 'Задач пока нет.'}</p>}
          {tasks.map((t) => {
            const mineTask = t.who === me;
            return (
              <label key={t.id} className="chk">
                <input type="checkbox" checked={isDone(t)} disabled={!mineTask}
                  onChange={() => { const d = mine?.done ?? []; api.respond(host, { done: d.includes(t.id) ? d.filter((x) => x !== t.id) : [...d, t.id] }); }} />
                <span><b>{t.text}</b><small>{t.who ? nameOf(t.who) + (mineTask ? ' (ты)' : '') : 'не назначено'}</small></span>
                {isHost && <button type="button" className="hg-act" onClick={(e) => { e.preventDefault(); saveTrip({ tasks: tasks.filter((x) => x.id !== t.id) }); }}>Убрать</button>}
              </label>
            );
          })}
          {isHost && (
            <div className="task-add">
              <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Например: билеты для всех" />
              <select value={taskWho} onChange={(e) => setTaskWho(e.target.value)}>
                <option value="">кому</option>
                {[...going, ...maybe].map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
              <button type="button" className="pri-btn" disabled={!task.trim()} onClick={() => { saveTrip({ tasks: [...tasks, { id: uid(), text: task.trim(), who: taskWho || undefined }] }); setTask(''); setTaskWho(''); }}>+</button>
            </div>
          )}

          <h3>Просьбы о дуа</h3>
          <p className="tiny">Если не едешь, оставь просьбу: паломники увидят её у Каабы. Просьбу видят все в Круге.</p>
          {requests.map((r) => (
            <div key={r.from + r.i} className="dua-req">
              <span>🤲 {r.text}</span>
              <small>{nameOf(r.from)}{r.from === me ? ' (ты)' : ''}</small>
              {r.from === me && <button type="button" className="hg-act" onClick={() => api.setDuas(host, myDuas.filter((_, i) => i !== r.i))}>Убрать</button>}
            </div>
          ))}
          <div className="task-add">
            <input value={dua} onChange={(e) => setDua(e.target.value)} placeholder="Сделайте дуа за…" maxLength={200} />
            <button type="button" className="pri-btn" disabled={!dua.trim()} onClick={() => { api.setDuas(host, [...myDuas, dua.trim()]); setDua(''); }}>+</button>
          </div>

          {isHost && (
            <div className="row2 light">
              <button type="button" onClick={() => setEdit(true)}>Изменить</button>
              <button type="button" onClick={() => api.deleteTrip()}>Удалить поездку</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
