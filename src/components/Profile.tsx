import { LogoLockup } from './Logo';
import { useState } from 'react';
import type { AppState, Habit, MethodId } from '../types';
import { ANCHOR_LABEL } from '../types';
import { METHODS, PLACES, type DayTimes } from '../prayer';
import { hhmm } from '../dates';
import { ACTIVE_LIMIT, initialState, slotsUsed } from '../store';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
  times: DayTimes;
  onEdit: (h: Habit) => void;
}

export function Profile({ state, update, replace, times, onEdit }: Props) {
  const s = state.settings;
  const set = (patch: Partial<AppState['settings']>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const [geo, setGeo] = useState('');
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');

  const byStatus = (st: Habit['status']) => state.habits.filter((h) => h.status === st);
  const setStatus = (id: string, status: Habit['status']) =>
    update((x) => ({ ...x, habits: x.habits.map((h) => (h.id === id ? { ...h, status } : h)) }));
  const remove = (id: string) => update((x) => ({ ...x, habits: x.habits.filter((h) => h.id !== id) }));

  const locate = () => {
    if (!navigator.geolocation) return setGeo('Геолокация недоступна, выбери город из списка.');
    setGeo('Определяю…');
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: p.coords.latitude, lng: p.coords.longitude, place: 'Моё место' }); setGeo('Готово'); },
      () => setGeo('Не получилось, выбери город из списка.'),
      { timeout: 10000 },
    );
  };

  const exportData = async () => {
    const json = JSON.stringify(state);
    setIo(json);
    try { await navigator.clipboard.writeText(json); setMsg('Скопировано. Сохрани текст в заметках.'); } catch { setMsg('Скопируй текст из поля ниже.'); }
  };
  const importData = () => {
    try {
      const d = JSON.parse(io) as AppState;
      if (d.version !== 1 || !Array.isArray(d.habits)) throw new Error();
      replace({ ...initialState(), ...d });
      setMsg('Данные загружены.');
    } catch { setMsg('Не похоже на копию данных из приложения.'); }
  };

  const used = slotsUsed(state);

  return (
    <div className="page">
      <h1 className="page-h">Профиль</h1>
      <p className="page-sub">Настройки намазов, твои привычки и данные.</p>

      <label className="field">
        <span>Как к тебе обращаться</span>
        <input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Имя" />
      </label>

      <h2 className="sub-h">Время намазов</h2>
      <div className="times">
        {(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((a) => (
          <div key={a}><span className="ar">{ANCHOR_LABEL[a].ar}</span><b>{hhmm(times[a])}</b><small>{ANCHOR_LABEL[a].ru}</small></div>
        ))}
      </div>
      <label className="field">
        <span>Город</span>
        <select
          value={PLACES.some((p) => p.name === s.place) ? s.place : ''}
          onChange={(e) => { const p = PLACES.find((x) => x.name === e.target.value); if (p) set({ place: p.name, lat: p.lat, lng: p.lng }); }}
        >
          {!PLACES.some((p) => p.name === s.place) && <option value="">{s.place} ({s.lat.toFixed(2)}, {s.lng.toFixed(2)})</option>}
          {PLACES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="ghost-btn" onClick={locate}>Определить по геолокации</button>
      {geo && <p className="tiny">{geo}</p>}
      <label className="field">
        <span>Метод расчёта</span>
        <select value={s.method} onChange={(e) => set({ method: e.target.value as MethodId })}>
          {METHODS.map((m) => <option key={m.id} value={m.id}>{m.ru}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Аср по мазхабу</span>
        <select value={s.madhab} onChange={(e) => set({ madhab: e.target.value as 'shafi' | 'hanafi' })}>
          <option value="shafi">Шафии, Малики, Ханбали</option>
          <option value="hanafi">Ханафи (Аср позже)</option>
        </select>
      </label>
      <p className="tiny">Сверь время с мечетью рядом. Если расходится, попробуй другой метод.</p>

      <h2 className="sub-h">Мои привычки <small>{used} из {ACTIVE_LIMIT} мест занято</small></h2>
      <HabitGroup title="Активные" list={byStatus('active')} onEdit={onEdit} action={(h) => ['В архив', () => setStatus(h.id, 'archived')]} />
      <HabitGroup title="Очередь «Скоро»" list={byStatus('queued')} onEdit={onEdit} action={(h) => ['Убрать', () => setStatus(h.id, 'archived')]} />
      <HabitGroup
        title="Архив"
        list={byStatus('archived')}
        onEdit={onEdit}
        action={(h) => (used < ACTIVE_LIMIT ? ['Вернуть', () => setStatus(h.id, 'active')] : ['Удалить', () => remove(h.id)])}
      />

      <h2 className="sub-h">Данные</h2>
      <p className="tiny">Всё хранится только на этом устройстве. Никакой рекламы и аккаунта. Чтобы перенести на другой телефон, скопируй данные и вставь там.</p>
      <div className="row2 light">
        <button type="button" onClick={exportData}>Скопировать данные</button>
        <button type="button" onClick={importData} disabled={!io.trim()}>Загрузить из поля</button>
      </div>
      {msg && <p className="tiny">{msg}</p>}
      <textarea className="io" value={io} onChange={(e) => setIo(e.target.value)} rows={3} placeholder="Сюда вставь скопированные данные" />
      <button
        type="button"
        className="danger"
        onClick={() => { if (io === 'УДАЛИТЬ') { replace(initialState()); setIo(''); setMsg('Всё очищено.'); } else setMsg('Чтобы стереть всё, напиши в поле слово УДАЛИТЬ и нажми ещё раз.'); }}
      >
        Стереть все данные
      </button>
      <LogoLockup />
      <p className="tiny ver">Версия 0.1<br />«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»</p>
    </div>
  );
}

function HabitGroup({ title, list, onEdit, action }: {
  title: string; list: Habit[]; onEdit: (h: Habit) => void; action: (h: Habit) => [string, () => void];
}) {
  if (!list.length) return null;
  return (
    <div className="hgroup">
      <h4>{title}</h4>
      {list.map((h) => {
        const [label, fn] = action(h);
        return (
          <div className="hg" key={h.id} data-sphere={h.sphere}>
            <i />
            <button type="button" className="hg-name" onClick={() => onEdit(h)}>
              {h.action}<small>{ANCHOR_LABEL[h.anchor].after}{h.formed ? ' · закреплена' : ''}</small>
            </button>
            <button type="button" className="hg-act" onClick={fn}>{label}</button>
          </div>
        );
      })}
    </div>
  );
}
