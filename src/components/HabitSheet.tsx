import { useState } from 'react';
import type { Anchor, AppState, Habit, Sphere } from '../types';
import { ANCHORS, ANCHOR_LABEL, SPHERES } from '../types';
import { activeLimit, slotsUsed, uid } from '../store';
import { dayKey } from '../dates';

const IDEAS: { action: string; min: string; anchor: Anchor; sphere: Sphere }[] = [
  { action: 'Утренние азкары', min: '3 зикра', anchor: 'fajr', sphere: 'faith' },
  { action: 'Читать Коран 1 страницу', min: '1 аят', anchor: 'fajr', sphere: 'faith' },
  { action: 'Зарядка 15 минут', min: '10 отжиманий', anchor: 'fajr', sphere: 'body' },
  { action: '60 минут глубокой работы', min: '15 минут', anchor: 'dhuhr', sphere: 'biz' },
  { action: 'Обед без сахара', min: 'без десерта', anchor: 'dhuhr', sphere: 'food' },
  { action: 'Чтение, 10 страниц', min: '2 страницы', anchor: 'asr', sphere: 'mind' },
  { action: 'Английский 20 минут', min: '5 новых слов', anchor: 'asr', sphere: 'mind' },
  { action: 'Прогулка 30 минут', min: '10 минут', anchor: 'asr', sphere: 'body' },
  { action: 'Час с семьёй без телефона', min: '15 минут', anchor: 'maghrib', sphere: 'family' },
  { action: 'Позвонить родителям', min: 'написать сообщение', anchor: 'maghrib', sphere: 'family' },
  { action: 'Вечерние азкары', min: '3 зикра', anchor: 'isha', sphere: 'faith' },
  { action: 'Лечь спать до 23:00', min: 'телефон убран в 22:30', anchor: 'isha', sphere: 'body' },
];

interface Props {
  state: AppState;
  editing?: Habit;
  defaultAnchor: Anchor;
  onSave: (h: Habit, replaceId?: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function HabitSheet({ state, editing, defaultAnchor, onSave, onDelete, onClose }: Props) {
  const [action, setAction] = useState(editing?.action ?? '');
  const [min, setMin] = useState(editing?.min ?? '');
  const [anchor, setAnchor] = useState<Anchor>(editing?.anchor ?? defaultAnchor);
  const [sphere, setSphere] = useState<Sphere>(editing?.sphere ?? 'faith');
  const [replace, setReplace] = useState(false);

  const used = slotsUsed(state);
  const full = !editing && used >= activeLimit();
  const queue = state.habits.filter((h) => h.status === 'queued');
  const active = state.habits.filter((h) => h.status === 'active' && !h.formed);
  const ok = action.trim().length > 0;

  const save = (replaceId?: string) => {
    if (!ok) return;
    const base = { action: action.trim(), min: min.trim(), anchor, sphere };
    if (editing) onSave({ ...editing, ...base });
    else
      onSave(
        { id: uid(), ...base, status: full && !replaceId ? 'queued' : 'active', createdAt: dayKey(new Date()) },
        replaceId,
      );
  };

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={editing ? 'Привычка' : 'Новая привычка'}>
        <div className="grab" />
        <div className="sheet-head">
          <h3>{editing ? 'Привычка' : 'Новая привычка'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <div className="phrase">
          <label>
            <span>После</span>
            <select value={anchor} onChange={(e) => setAnchor(e.target.value as Anchor)}>
              {ANCHORS.map((a) => (
                <option key={a} value={a}>{ANCHOR_LABEL[a].after.replace('После ', '')}</option>
              ))}
            </select>
          </label>
          <label>
            <span>я буду</span>
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="читать 10 страниц" autoFocus={!editing} />
          </label>
          <label className="minv">
            <span>Минимум</span>
            <input value={min} onChange={(e) => setMin(e.target.value)} placeholder="2 страницы" />
          </label>
        </div>

        <div className="lab">Сфера</div>
        <div className="spheres">
          {SPHERES.map((s) => (
            <button key={s.id} type="button" className="sph" data-sphere={s.id} aria-pressed={sphere === s.id} onClick={() => setSphere(s.id)}>
              <i />
              {s.ru}
            </button>
          ))}
        </div>

        {!editing && (
          <>
            <div className="lab">Идеи</div>
            <div className="ideas">
              {IDEAS.filter((i) => !state.habits.some((h) => h.action === i.action && h.status !== 'archived')).map((i) => (
                <button key={i.action} type="button" onClick={() => { setAction(i.action); setMin(i.min); setAnchor(i.anchor); setSphere(i.sphere); }}>
                  {i.action}
                </button>
              ))}
            </div>
          </>
        )}

        {full && (
          <div className="limit">
            <b>Активных уже {used} из {activeLimit()}</b>
            <div className="slots5">{Array.from({ length: activeLimit() }, (_, i) => <i key={i} />)}</div>
            Новая привычка встанет в очередь «Скоро» и включится сама, когда одна из текущих продержится 21 день на 80%.
            {queue.length > 0 && (
              <div className="queue">
                {queue.map((q, i) => (
                  <div className="q" key={q.id}><span className="n">{i + 1}</span>{q.action}</div>
                ))}
              </div>
            )}
            {replace && (
              <div className="queue">
                <div className="lab" style={{ margin: '6px 0 0' }}>Какую заменить? Она уйдёт в архив</div>
                {active.map((h) => (
                  <button key={h.id} type="button" className="q pick" onClick={() => save(h.id)} disabled={!ok}>{h.action}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="actions">
          {editing ? (
            <>
              <button type="button" onClick={() => onDelete?.(editing.id)}>В архив</button>
              <button type="button" className="pri" disabled={!ok} onClick={() => save()}>Сохранить</button>
            </>
          ) : full ? (
            <>
              <button type="button" onClick={() => setReplace((r) => !r)}>Заменить текущую</button>
              <button type="button" className="pri" disabled={!ok} onClick={() => save()}>В очередь</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose}>Отмена</button>
              <button type="button" className="pri" disabled={!ok} onClick={() => save()}>Добавить</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
