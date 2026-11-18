import { useEffect, useState } from 'react';
import type { UmrahApi, URsvp, UStatus, UTrip } from '../umrahCircle';
import { uid } from '../store';
import { UmrahPlan } from './UmrahPlan';
import { _t, _tj } from '../i18n';

interface Props { api: UmrahApi; myReady: number; nameOf: (id: string) => string; onBack?: () => void; embedded?: boolean }

const ST: { s: UStatus; l: string }[] = [{ s: 'go', l: _t("Еду") }, { s: 'maybe', l: _t("Думаю") }, { s: 'no', l: _t("Не в этот раз") }];

export function UmrahTrips({ api, myReady, nameOf, onBack, embedded }: Props) {
  const { me, trips, rsvp } = api;
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Keep my readiness in step with my own preparation list, for every trip I am going on.
  useEffect(() => {
    if (!me) return;
    for (const [host, r] of Object.entries(rsvp[me] ?? {})) if (r.s === 'go' && r.ready !== myReady && trips[host]) api.respond(host, { ready: myReady });
  }, [myReady, me, JSON.stringify(rsvp[me ?? ''] ?? {})]); // eslint-disable-line react-hooks/exhaustive-deps

  const hosts = Object.keys(trips).sort((a, b) => (trips[b].created ?? '').localeCompare(trips[a].created ?? ''));
  const go = (h: string | null) => { setOpen(h); window.scrollTo(0, 0); };

  // One trip on its own screen.
  if (open && trips[open]) {
    return (
      <div className={embedded ? 'umrah-page' : 'page umrah-page'}>
        <button type="button" className="link-btn um-back" onClick={() => go(null)}>{_t("← Все поездки")}</button>
        <TripCard host={open} trip={trips[open]} api={api} nameOf={nameOf} myReady={myReady} open onToggle={() => go(null)} />
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'page umrah-page'}>
      {!embedded && <button type="button" className="link-btn um-back" onClick={onBack}>{_t("← Круг")}</button>}
      {embedded ? <p className="tiny">{_t("Поездка группой из Круга: даты, билеты, жильё, документы и общая касса в одном месте. Без агентства и обычно дешевле.")}</p> : (
        <div className="um-hero">
          <span>🕋</span>
          <h1 className="page-h">{_t("Умра")}</h1>
          <p>{_t("Поездка группой из Круга: даты, билеты, жильё, документы и общая касса в одном месте. Без агентства и обычно дешевле.")}</p>
        </div>
      )}
      {!api.ready && <p className="tiny">{_t("Загружаю поездки…")}</p>}
      {api.error && <div className="warn">{api.error}</div>}
      {api.ready && hosts.length === 0 && !creating && <p className="tiny">{_t("Пока никто не собирает поездку. Предложи первым: братья и сёстры из Круга смогут присоединиться, разделить задачи и готовиться вместе.")}</p>}
      <div className="umrah-c">
        {hosts.map((h) => (
          <TripCard key={h} host={h} trip={trips[h]} api={api} nameOf={nameOf} myReady={myReady} open={false} onToggle={() => go(h)} />
        ))}
      </div>
      {api.ready && me && !trips[me] && (creating
        ? <TripForm onCancel={() => setCreating(false)} onSave={(t) => { api.saveTrip(t); api.respond(me, { s: 'go', ready: myReady }); setCreating(false); go(me); }} />
        : <button type="button" className="pri-btn big-btn" onClick={() => setCreating(true)}>{_t("🕋 Собрать поездку на умру")}</button>)}
    </div>
  );
}

function TripForm({ initial, onSave, onCancel }: { initial?: UTrip; onSave: (t: UTrip) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? _t("Умра с братьями"));
  const [month, setMonth] = useState(initial?.month ?? '');
  const [city, setCity] = useState(initial?.city ?? _t("Амстердам"));
  return (
    <div className="join">
      <label className="field"><span>{_t("Название")}</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="h-row">
        <label className="field"><span>{_t("Когда")}</span><input value={month} onChange={(e) => setMonth(e.target.value)} placeholder={_t("февраль 2027")} /></label>
        <label className="field"><span>{_t("Вылет из")}</span><input value={city} onChange={(e) => setCity(e.target.value)} /></label>
      </div>
      <div className="row2 light">
        <button type="button" onClick={onCancel}>{_t("Отмена")}</button>
        <button type="button" className="pri-btn" disabled={!title.trim() || !month.trim()} onClick={() => onSave({ ...initial, title: title.trim(), month: month.trim(), city: city.trim(), amir: initial?.amir, tasks: initial?.tasks ?? [], created: initial?.created ?? new Date().toISOString() })}>{_t("Сохранить")}</button>
      </div>
    </div>
  );
}

export function TripCard({ host, trip, api, nameOf, myReady, open, onToggle }: { host: string; trip: UTrip; api: UmrahApi; nameOf: (id: string) => string; myReady: number; open: boolean; onToggle: () => void }) {
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
      <button type="button" className="trip-head" onClick={open ? undefined : onToggle} disabled={open}>
        <span className="trip-ic">🕋</span>
        <span className="q-t">
          <b>{trip.title}</b>
          <small>{_tj("{0}{1} · собирает {2}", trip.month, trip.city ? _t(" · из {0}", trip.city) : '', isHost ? _t("ты") : nameOf(host))}</small>
          <small>{_tj("Едут: {0}{1}{2}", going.length, maybe.length ? _t(" · думают: {0}", maybe.length) : '', requests.length ? _t(" · просьб о дуа: {0}", requests.length) : '')}</small>
        </span>
        {!open && <span aria-hidden="true">›</span>}
      </button>
      {open && (
        <div className="trip-body">
          <div className="h-q">
            {ST.map((x) => (
              <button type="button" key={x.s} aria-pressed={mine?.s === x.s} onClick={() => api.respond(host, { s: x.s, ready: myReady })}>{x.l}</button>
            ))}
          </div>

          <UmrahPlan host={host} trip={trip} api={api} nameOf={nameOf} going={going} />

          <h3>{_t("Кто едет")}</h3>
          {going.length === 0 && <p className="tiny">{_t("Пока никто не ответил «Еду».")}</p>}
          {going.map((id) => (
            <div key={id} className="tp">
              <span><b>{nameOf(id)}{id === me ? _t(" (ты)") : ''}</b>{trip.amir === id && <em className="amir">{_t("амир")}</em>}</span>
              <span className="tp-bar"><i style={{ width: `${resp(id)!.ready}%` }} /></span>
              <small>{resp(id)!.ready}%</small>
            </div>
          ))}
          {maybe.length > 0 && <p className="tiny">{_tj("Думают: {0}", maybe.map(nameOf).join(', '))}</p>}
          <p className="tiny">{_t("Готовность это доля пунктов подготовки в Практике → Умра. Сами пункты не видны.")}</p>

          {isHost && going.length > 0 && (
            <label className="field"><span>{_t("Амир группы")}</span>
              <select value={trip.amir ?? ''} onChange={(e) => saveTrip({ amir: e.target.value || undefined })}>
                <option value="">{_t("не выбран")}</option>
                {going.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
            </label>
          )}
          {!isHost && !trip.amir && going.length >= 3 && <p className="tiny">{_t("По сунне в поездке от трёх человек выбирают амира. Его назначает тот, кто собирает поездку.")}</p>}

          <h3>{_t("Задачи")}</h3>
          {tasks.length === 0 && <p className="tiny">{isHost ? _t("Добавь задачи и раздай их: билеты, отель, трансфер, разрешения.") : _t("Задач пока нет.")}</p>}
          {tasks.map((t) => {
            const mineTask = t.who === me;
            return (
              <label key={t.id} className="chk">
                <input type="checkbox" checked={isDone(t)} disabled={!mineTask}
                  onChange={() => { const d = mine?.done ?? []; api.respond(host, { done: d.includes(t.id) ? d.filter((x) => x !== t.id) : [...d, t.id] }); }} />
                <span><b>{t.text}</b><small>{t.who ? nameOf(t.who) + (mineTask ? _t(" (ты)") : '') : _t("не назначено")}</small></span>
                {isHost && <button type="button" className="hg-act" onClick={(e) => { e.preventDefault(); saveTrip({ tasks: tasks.filter((x) => x.id !== t.id) }); }}>{_t("Убрать")}</button>}
              </label>
            );
          })}
          {isHost && (
            <div className="task-add">
              <input value={task} onChange={(e) => setTask(e.target.value)} placeholder={_t("Например: билеты для всех")} />
              <select value={taskWho} onChange={(e) => setTaskWho(e.target.value)}>
                <option value="">{_t("кому")}</option>
                {[...going, ...maybe].map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
              <button type="button" className="pri-btn" disabled={!task.trim()} onClick={() => { saveTrip({ tasks: [...tasks, { id: uid(), text: task.trim(), who: taskWho || undefined }] }); setTask(''); setTaskWho(''); }}>+</button>
            </div>
          )}

          <h3>{_t("Просьбы о дуа")}</h3>
          <p className="tiny">{_t("Если не едешь, оставь просьбу: паломники увидят её у Каабы. Просьбу видят все в Круге.")}</p>
          {requests.map((r) => (
            <div key={r.from + r.i} className="dua-req">
              <span>🤲 {r.text}</span>
              <small>{nameOf(r.from)}{r.from === me ? _t(" (ты)") : ''}</small>
              {r.from === me && <button type="button" className="hg-act" onClick={() => api.setDuas(host, myDuas.filter((_, i) => i !== r.i))}>{_t("Убрать")}</button>}
            </div>
          ))}
          <div className="task-add">
            <input value={dua} onChange={(e) => setDua(e.target.value)} placeholder={_t("Сделайте дуа за…")} maxLength={200} />
            <button type="button" className="pri-btn" disabled={!dua.trim()} onClick={() => { api.setDuas(host, [...myDuas, dua.trim()]); setDua(''); }}>+</button>
          </div>

          {isHost && (
            <div className="row2 light">
              <button type="button" onClick={() => setEdit(true)}>{_t("Изменить")}</button>
              <button type="button" onClick={() => api.deleteTrip()}>{_t("Удалить поездку")}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
