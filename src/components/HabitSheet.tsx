import { useState } from 'react';
import type { Anchor, AppState, Habit, Sphere } from '../types';
import { ANCHORS, ANCHOR_LABEL, SPHERES } from '../types';
import { activeLimit, slotsUsed, uid } from '../store';
import { Advice } from './Plan';
import { dayKey } from '../dates';
import { _t, _tj } from '../i18n';

const IDEAS: { action: string; min: string; anchor: Anchor; sphere: Sphere }[] = [
  { action: _t("Утренние азкары"), min: _t("3 зикра"), anchor: 'fajr', sphere: 'faith' },
  { action: _t("Читать Коран 1 страницу"), min: _t("1 аят"), anchor: 'fajr', sphere: 'faith' },
  { action: _t("Зарядка 15 минут"), min: _t("10 отжиманий"), anchor: 'fajr', sphere: 'body' },
  { action: _t("60 минут глубокой работы"), min: _t("15 минут"), anchor: 'dhuhr', sphere: 'biz' },
  { action: _t("Обед без сахара"), min: _t("без десерта"), anchor: 'dhuhr', sphere: 'food' },
  { action: _t("Чтение, 10 страниц"), min: _t("2 страницы"), anchor: 'asr', sphere: 'mind' },
  { action: _t("Английский 20 минут"), min: _t("5 новых слов"), anchor: 'asr', sphere: 'mind' },
  { action: _t("Прогулка 30 минут"), min: _t("10 минут"), anchor: 'asr', sphere: 'body' },
  { action: _t("Час с семьёй без телефона"), min: _t("15 минут"), anchor: 'maghrib', sphere: 'family' },
  { action: _t("Позвонить родителям"), min: _t("написать сообщение"), anchor: 'maghrib', sphere: 'family' },
  { action: _t("Вечерние азкары"), min: _t("3 зикра"), anchor: 'isha', sphere: 'faith' },
  { action: _t("Лечь спать до 23:00"), min: _t("телефон убран в 22:30"), anchor: 'isha', sphere: 'body' },
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
      <div className="sheet" role="dialog" aria-label={editing ? _t("Привычка") : _t("Новая привычка")}>
        <div className="grab" />
        <div className="sheet-head">
          <h3>{editing ? _t("Привычка") : _t("Новая привычка")}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        </div>

        <div className="phrase">
          <label>
            <span>{_t("После")}</span>
            <select value={anchor} onChange={(e) => setAnchor(e.target.value as Anchor)}>
              {ANCHORS.map((a) => (
                <option key={a} value={a}>{ANCHOR_LABEL[a].after.replace(_t("После "), '')}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{_t("я буду")}</span>
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder={_t("читать 10 страниц")} autoFocus={!editing} />
          </label>
          <label className="minv">
            <span>{_t("Минимум")}</span>
            <input value={min} onChange={(e) => setMin(e.target.value)} placeholder={_t("2 страницы")} />
          </label>
        </div>

        <div className="lab">{_t("Сфера")}</div>
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
            <div className="lab">{_t("Идеи")}</div>
            <div className="ideas">
              {IDEAS.filter((i) => !state.habits.some((h) => h.action === i.action && h.status !== 'archived')).map((i) => (
                <button key={i.action} type="button" onClick={() => { setAction(i.action); setMin(i.min); setAnchor(i.anchor); setSphere(i.sphere); }}>
                  {i.action}
                </button>
              ))}
            </div>
          </>
        )}

        {!editing && <Advice k="habits" n={used} />}
        {full && (
          <div className="limit">
            <b>{_tj("Активных уже {0} из {1}", used, activeLimit())}</b>
            <div className="slots5">{Array.from({ length: activeLimit() }, (_, i) => <i key={i} />)}</div>
            {_t("Новая привычка встанет в очередь «Скоро» и включится сама, когда одна из текущих продержится 21 день на 80%.")}
            {queue.length > 0 && (
              <div className="queue">
                {queue.map((q, i) => (
                  <div className="q" key={q.id}><span className="n">{i + 1}</span>{q.action}</div>
                ))}
              </div>
            )}
            {replace && (
              <div className="queue">
                <div className="lab" style={{ margin: '6px 0 0' }}>{_t("Какую заменить? Она уйдёт в архив")}</div>
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
              <button type="button" onClick={() => onDelete?.(editing.id)}>{_t("В архив")}</button>
              <button type="button" className="pri" disabled={!ok} onClick={() => save()}>{_t("Сохранить")}</button>
            </>
          ) : full ? (
            <>
              <button type="button" onClick={() => setReplace((r) => !r)}>{_t("Заменить текущую")}</button>
              <button type="button" className="pri" disabled={!ok} onClick={() => save()}>{_t("В очередь")}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose}>{_t("Отмена")}</button>
              <button type="button" className="pri" disabled={!ok} onClick={() => save()}>{_t("Добавить")}</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
