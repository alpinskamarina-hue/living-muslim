import { useState } from 'react';
import type { AppState, Goal, Habit } from '../types';
import { ANCHOR_LABEL } from '../types';
import { ACTIVE_LIMIT, isCounted, slotsUsed, streak, uid } from '../store';
import { addDays, daysBetween, fromKey } from '../dates';
import { GOAL_LIMIT, SOURCES, TEMPLATES, daysLeft, progress, progressLabel, rawValue, sourceDef, weekDelta, type Template } from '../goals';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  reviewOpen: boolean;
  setReviewOpen: (v: boolean) => void;
  stats?: React.ReactNode;
}

const fmt = (k: string) => fromKey(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const patchGoal = (s: AppState, id: string, p: Partial<Goal>): AppState => ({ ...s, goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...p } : g)) });

export function Ring({ pct, size = 46, gold }: { pct: number; size?: number; gold?: boolean }) {
  const r = size / 2 - 4, C = 2 * Math.PI * r;
  return (
    <span className="g-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={gold ? 'var(--gold)' : 'var(--green-2)'} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span>{pct}%</span>
    </span>
  );
}

export function isReviewDay(state: AppState, today: string) {
  const fri = fromKey(today).getDay() === 5;
  const active = (state.goals ?? []).some((g) => g.status === 'active');
  return fri && active && (!state.goalReview || daysBetween(state.goalReview, today) >= 6);
}

export function Goals({ state, update, today, openId, setOpenId, reviewOpen, setReviewOpen, stats }: Props) {
  const [wizard, setWizard] = useState(false);
  const goals = state.goals ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const later = goals.filter((g) => g.status === 'later');
  const done = goals.filter((g) => g.status === 'done');
  const open = goals.find((g) => g.id === openId);

  if (wizard) return <Wizard state={state} update={update} today={today} onClose={(id) => { setWizard(false); if (id) setOpenId(id); }} />;
  if (reviewOpen) return <Review state={state} update={update} today={today} onClose={() => setReviewOpen(false)} />;
  if (open) return <GoalView goal={open} state={state} update={update} today={today} onClose={() => setOpenId(null)} />;

  return (
    <div className="g-list">
      <h1 className="page-h">Цели</h1>
      <p className="page-sub">{active.length} из {GOAL_LIMIT} активных. Цель держится на системе: намерение, образ себя и привычки.</p>
      {isReviewDay(state, today) && (
        <button type="button" className="g-review-cta" onClick={() => setReviewOpen(true)}>
          <b>Пересмотр недели</b><small>Пятница. 2 минуты: что продвинулось и какой шаг на неделю</small>
        </button>
      )}
      {active.length === 0 && <p className="tiny">Пока целей нет. Начни с одной: например, хатм Корана к Рамадану.</p>}
      {active.map((g) => <GoalCard key={g.id} g={g} state={state} today={today} onOpen={() => setOpenId(g.id)} />)}
      <button type="button" className="pri-btn big-btn" onClick={() => setWizard(true)}>+ Новая цель</button>
      {active.length > 0 && !isReviewDay(state, today) && <button type="button" className="link-btn" onClick={() => setReviewOpen(true)}>Пересмотреть неделю сейчас</button>}
      {later.length > 0 && (
        <div className="g-later">
          <b>Потом ({later.length})</b>
          {later.map((g) => (
            <div key={g.id} className="g-later-row">
              <button type="button" className="link-btn" onClick={() => setOpenId(g.id)}>{g.title}</button>
              <button type="button" className="hg-act" disabled={active.length >= GOAL_LIMIT} onClick={() => update((s) => patchGoal(s, g.id, { status: 'active' }))}>{active.length >= GOAL_LIMIT ? 'нет места' : 'Начать'}</button>
            </div>
          ))}
        </div>
      )}
      {done.length > 0 && <p className="tiny">Достигнуто, альхамдулиллях: {done.map((g) => g.title).join(' · ')}</p>}
      <h2 className="page-h" style={{ marginTop: 28, fontSize: 28 }}>Прогресс</h2>
      {stats}
    </div>
  );
}

function GoalCard({ g, state, today, onOpen }: { g: Goal; state: AppState; today: string; onOpen: () => void }) {
  const p = progress(state, g, today);
  const left = daysLeft(g, today);
  const def = sourceDef(g.source);
  return (
    <button type="button" className="g-card" onClick={onOpen}>
      <span className="g-top"><Ring pct={p.pct} gold={p.behind > 0} /><b>{g.title}</b></span>
      {g.identity && <span className="g-who">{g.identity}</span>}
      <span className="g-meta">
        <span className="chip auto">{g.source === 'manual' ? 'вручную' : `авто · ${def.hint}`}</span>
        {g.due && <span className="chip">{left !== null && left >= 0 ? `до ${fmt(g.due)}` : 'срок прошёл'}</span>}
        {g.due && !def.identity && <span className={`chip${p.behind ? ' warn' : ''}`}>{p.behind ? `отстаю на ${p.behind} дн.` : 'в графике'}</span>}
        {def.identity && <span className="chip">образ себя</span>}
      </span>
    </button>
  );
}

function GoalView({ goal: g, state, update, today, onClose }: { goal: Goal; state: AppState; update: Props['update']; today: string; onClose: () => void }) {
  const p = progress(state, g, today);
  const def = sourceDef(g.source);
  const [add, setAdd] = useState('');
  const [confirm, setConfirm] = useState(false);
  const habits = state.habits.filter((h) => g.habitIds.includes(h.id) && h.status !== 'archived');
  const activeCount = (state.goals ?? []).filter((x) => x.status === 'active').length;
  const left = daysLeft(g, today);
  const perDay = g.due && left && left > 0 && p.pct < 100 ? (g.target - p.value) / left : 0;
  const miles = [25, 50, 75, 100].map((m) => {
    const when = g.due ? addDays(g.createdAt, Math.round((daysBetween(g.createdAt, g.due) * m) / 100)) : null;
    return { m, when, ok: p.pct >= m };
  });
  const next = miles.find((x) => !x.ok);

  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="К целям">‹</button>
        <div><b>{g.title}</b><small>{g.due ? `к ${fmt(g.due)}${left !== null && left >= 0 ? ` · ${left} дн.` : ''}` : 'без срока'}</small></div>
      </div>
      {g.niyya && <div className="niyya"><small>Намерение</small>{g.niyya}</div>}
      {g.identity && <div className="ident">{g.identity}</div>}
      <div className="g-big"><b>{p.pct}%</b><span>{progressLabel(state, g, today)}</span></div>
      <div className="pbar"><i style={{ width: `${p.pct}%` }} /></div>
      {perDay > 0 && <p className="tiny">Чтобы успеть: примерно {perDay >= 10 ? Math.ceil(perDay) : perDay.toFixed(1).replace('.', ',')} {g.unit || 'ед.'} в день.{p.behind ? ` Сейчас отставание ${p.behind} дн.` : ''}</p>}
      {g.source === 'manual' && (
        <div className="task-add">
          <input type="number" inputMode="decimal" value={add} onChange={(e) => setAdd(e.target.value)} placeholder={`Добавить ${g.unit || ''}`} />
          <button type="button" className="pri-btn" disabled={!Number(add)} onClick={() => { update((s) => patchGoal(s, g.id, { manual: g.manual + Number(add) })); setAdd(''); }}>+</button>
        </div>
      )}
      {def.counter && <p className="tiny">Считается с момента создания цели.</p>}

      <h2 className="sub-h">Система</h2>
      {habits.length === 0 && <p className="tiny">К цели не привязаны привычки. Добавь их при создании новой цели или здесь ниже.</p>}
      {habits.map((h) => <HabitLine key={h.id} h={h} state={state} today={today} />)}
      <AttachHabit g={g} state={state} update={update} />

      {g.due && !def.identity && (
        <>
          <h2 className="sub-h">Вехи</h2>
          <div className="miles">
            {miles.map((x) => (
              <div key={x.m} className="mile"><i className={x.ok ? 'on' : x === next ? 'now' : ''} /><span>{x.m === 100 ? 'Цель' : `${x.m}%`}</span><small>{x.ok ? '✓' : x.when ? `к ${fromKey(x.when).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' })}` : ''}</small></div>
            ))}
          </div>
        </>
      )}

      <label className="chk">
        <input type="checkbox" checked={Boolean(g.shared)} onChange={() => update((s) => patchGoal(s, g.id, { shared: !g.shared }))} />
        <span><b>Показать в Круге</b><small>друзья увидят название и процент, чтобы сделать за тебя дуа</small></span>
      </label>

      {g.due && (
        <div className="row2 light">
          <button type="button" onClick={() => update((s) => patchGoal(s, g.id, { due: addDays(g.due!, 7) }))}>Сдвинуть срок на неделю</button>
        </div>
      )}
      <div className="row2 light">
        {g.status === 'active'
          ? <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { status: 'later' })); onClose(); }}>Отложить на потом</button>
          : g.status === 'later' && <button type="button" disabled={activeCount >= GOAL_LIMIT} onClick={() => update((s) => patchGoal(s, g.id, { status: 'active' }))}>Начать сейчас</button>}
        {g.status !== 'done' && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { status: 'done' })); onClose(); }}>Цель достигнута</button>}
      </div>
      {confirm
        ? <div className="row2 light"><button type="button" onClick={() => setConfirm(false)}>Оставить</button><button type="button" className="danger" onClick={() => { update((s) => ({ ...s, goals: (s.goals ?? []).filter((x) => x.id !== g.id) })); onClose(); }}>Удалить цель</button></div>
        : <button type="button" className="link-btn" onClick={() => setConfirm(true)}>Удалить цель</button>}
    </div>
  );
}

function HabitLine({ h, state, today }: { h: Habit; state: AppState; today: string }) {
  const done = isCounted(state.log[today]?.[h.id]);
  return (
    <div className="card-line">
      <span className={`c${done ? ' on' : ''}`} />
      <div><b>{h.action}</b><small>{ANCHOR_LABEL[h.anchor].after.toLowerCase()} · минимум: {h.min || '—'}{h.status === 'queued' ? ' · в очереди' : ''}</small></div>
      <span className="tag">{streak(state, h, today)} дн.</span>
    </div>
  );
}

function AttachHabit({ g, state, update }: { g: Goal; state: AppState; update: Props['update'] }) {
  const free = state.habits.filter((h) => (h.status === 'active' || h.status === 'queued') && !g.habitIds.includes(h.id));
  if (!free.length) return null;
  return (
    <label className="field"><span>Привязать привычку</span>
      <select value="" onChange={(e) => e.target.value && update((s) => patchGoal(s, g.id, { habitIds: [...g.habitIds, e.target.value] }))}>
        <option value="">выбери из своих привычек</option>
        {free.map((h) => <option key={h.id} value={h.id}>{h.action}</option>)}
      </select>
    </label>
  );
}

function Wizard({ state, update, today, onClose }: { state: AppState; update: Props['update']; today: string; onClose: (id?: string) => void }) {
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<Goal['source']>('habits');
  const [target, setTarget] = useState(100);
  const [unit, setUnit] = useState('');
  const [due, setDue] = useState('');
  const [niyya, setNiyya] = useState('');
  const [identity, setIdentity] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [newHabits, setNewHabits] = useState<Template['habits']>([]);
  const def = sourceDef(source);
  const activeCount = (state.goals ?? []).filter((g) => g.status === 'active').length;

  const choose = (t: Template) => {
    const d = sourceDef(t.source);
    setTpl(t); setTitle(t.source === 'habits' ? '' : t.title); setSource(t.source);
    setTarget(t.target ?? d.target); setUnit(t.unit ?? d.unit); setIdentity(t.identity); setNewHabits(t.habits);
    setStep(1);
  };

  const finish = () => {
    const id = uid();
    update((s) => {
      let used = slotsUsed(s);
      const created: Habit[] = newHabits.map((h) => {
        const st: Habit['status'] = used < ACTIVE_LIMIT ? 'active' : 'queued';
        if (st === 'active') used++;
        return { id: uid(), action: h.action, min: h.min, anchor: h.anchor, sphere: h.sphere, status: st, createdAt: today };
      });
      const g: Goal = {
        id, title: title.trim(), source, identity: identity.trim(), niyya: niyya.trim(), target, unit, start: 0, manual: 0,
        due: due || undefined, habitIds: [...pick, ...created.map((h) => h.id)],
        status: activeCount < GOAL_LIMIT ? 'active' : 'later', createdAt: today,
      };
      g.start = rawValue({ ...s, habits: [...s.habits, ...created] }, g, today);
      return { ...s, habits: [...s.habits, ...created], goals: [...(s.goals ?? []), g] };
    });
    onClose(id);
  };

  const ok1 = title.trim() && target > 0;
  const hasSystem = pick.length + newHabits.length > 0;
  const existing = state.habits.filter((h) => h.status === 'active' || h.status === 'queued');

  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={() => (step ? setStep(step - 1) : onClose())} aria-label="Назад">{step ? '‹' : '✕'}</button>
        <div><b>Новая цель</b><small>шаг {step + 1} из 4</small></div>
      </div>
      <div className="step">{[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <p className="q">Что хочешь достичь?</p>
          {activeCount >= GOAL_LIMIT && <p className="tiny">Активных целей уже {GOAL_LIMIT}. Новая встанет в «Потом».</p>}
          {TEMPLATES.map((t) => (
            <button type="button" key={t.title} className="opt" onClick={() => choose(t)}>
              <b>{t.title}</b><small>{t.source === 'habits' ? 'любая цель, прогресс по привычкам или своё число' : sourceDef(t.source).label}</small>
            </button>
          ))}
        </>
      )}

      {step === 1 && (
        <>
          <p className="q">Как поймём, что продвигаемся?</p>
          <label className="field"><span>Название</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: выучить суру аль-Мульк" /></label>
          {tpl?.source === 'habits' && (
            <label className="field"><span>Как считать</span>
              <select value={source} onChange={(e) => { const d = sourceDef(e.target.value as Goal['source']); setSource(d.id); setTarget(d.target); setUnit(d.unit); }}>
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.hint}</option>)}
              </select>
            </label>
          )}
          {source !== 'quran' && def.unit !== '%' && (
            <div className="h-row">
              <label className="field"><span>Сколько</span><input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
              <label className="field"><span>Единица</span><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="€, кг, раз" /></label>
            </div>
          )}
          {def.unit === '%' && <p className="tiny">{def.identity ? 'Прогресс это доля дней за последние 30 дней.' : 'Прогресс в процентах считает приложение.'}</p>}
          {source === 'quran' && <p className="tiny">Прогресс берётся из закладки в разделе Коран: от начала до конца мусхафа.</p>}
          {!def.identity && (
            <label className="field"><span>К какой дате (необязательно)</span><input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} /></label>
          )}
          <button type="button" className="pri-btn" disabled={!ok1} onClick={() => setStep(2)}>Дальше</button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="q">Зачем и кем ты станешь?</p>
          <label className="field"><span>Намерение: зачем мне это ради Аллаха и ради себя</span><textarea rows={2} value={niyya} onChange={(e) => setNiyya(e.target.value)} placeholder="Хочу, чтобы Коран был со мной каждый день, а не только в Рамадан" /></label>
          <label className="field"><span>Я тот, кто…</span><input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="Я тот, кто читает Коран каждый день" /></label>
          <p className="tiny">Главное в цели не результат, а то, кем ты становишься. Каждое выполненное действие это голос за этого человека.</p>
          <button type="button" className="pri-btn" disabled={!identity.trim()} onClick={() => setStep(3)}>Дальше</button>
        </>
      )}

      {step === 3 && (
        <>
          <p className="q">Какие привычки ведут к цели?</p>
          <p className="tiny">Что каждый день делал бы {identity.trim() ? `человек, про которого сказано «${identity.trim().replace(/^Я /, '')}»` : 'такой человек'}? Без системы цель не сохраняется.</p>
          {newHabits.map((h, i) => (
            <label key={h.action} className="chk">
              <input type="checkbox" checked onChange={() => setNewHabits(newHabits.filter((_, j) => j !== i))} />
              <span><b>{h.action}</b><small>новая · {ANCHOR_LABEL[h.anchor].after.toLowerCase()} · минимум: {h.min}</small></span>
            </label>
          ))}
          {tpl?.habits.filter((h) => !newHabits.includes(h)).map((h) => (
            <label key={h.action} className="chk">
              <input type="checkbox" checked={false} onChange={() => setNewHabits([...newHabits, h])} />
              <span><b>{h.action}</b><small>предложение · {ANCHOR_LABEL[h.anchor].after.toLowerCase()}</small></span>
            </label>
          ))}
          {existing.map((h) => (
            <label key={h.id} className="chk">
              <input type="checkbox" checked={pick.includes(h.id)} onChange={() => setPick(pick.includes(h.id) ? pick.filter((x) => x !== h.id) : [...pick, h.id])} />
              <span><b>{h.action}</b><small>моя привычка · {ANCHOR_LABEL[h.anchor].after.toLowerCase()}</small></span>
            </label>
          ))}
          <QuickHabit onAdd={(h) => setNewHabits([...newHabits, h])} />
          {slotsUsed(state) + newHabits.length > ACTIVE_LIMIT && <p className="tiny">Лимит 5 активных привычек: лишние встанут в очередь «Скоро».</p>}
          <button type="button" className="pri-btn" disabled={!hasSystem} onClick={finish}>Сохранить цель</button>
        </>
      )}
    </div>
  );
}

function QuickHabit({ onAdd }: { onAdd: (h: Template['habits'][number]) => void }) {
  const [action, setAction] = useState('');
  const [anchor, setAnchor] = useState<Template['habits'][number]['anchor']>('fajr');
  return (
    <div className="task-add">
      <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Своя привычка" />
      <select value={anchor} onChange={(e) => setAnchor(e.target.value as typeof anchor)}>
        {(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((a) => <option key={a} value={a}>{ANCHOR_LABEL[a].ru}</option>)}
      </select>
      <button type="button" className="pri-btn" disabled={!action.trim()} onClick={() => { onAdd({ action: action.trim(), min: '', anchor, sphere: 'faith' }); setAction(''); }}>+</button>
    </div>
  );
}

function Review({ state, update, today, onClose }: { state: AppState; update: Props['update']; today: string; onClose: () => void }) {
  const active = (state.goals ?? []).filter((g) => g.status === 'active');
  const [shift, setShift] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const save = () => {
    update((s) => {
      let goals = s.goals ?? [];
      for (const g of active) {
        const b = progress(s, g, today).behind;
        if (shift[g.id] && g.due && b) goals = goals.map((x) => (x.id === g.id ? { ...x, due: addDays(g.due!, b) } : x));
      }
      const notes = note.trim() ? { ...s.notes, [today]: [s.notes[today], `Неделя: ${note.trim()}`].filter(Boolean).join('\n') } : s.notes;
      return { ...s, goals, notes, goalReview: today };
    });
    onClose();
  };
  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        <div><b>Пересмотр недели</b><small>что продвинулось за 7 дней</small></div>
      </div>
      {active.map((g) => {
        const p = progress(state, g, today);
        const d = weekDelta(state, g, today);
        const def = sourceDef(g.source);
        return (
          <div key={g.id} className="rv">
            <div className="t">{g.title}<span>{d > 0 ? '+' : ''}{d}{def.unit === '%' ? ' п.' : g.source === 'quran' ? ' аятов' : g.unit ? ` ${g.unit}` : ''}</span></div>
            <small>Сейчас {p.pct}%{g.identity ? ` · ${g.identity}` : ''}</small>
            {p.behind > 0 && g.due ? (
              <>
                <div>Отстаёшь на {p.behind} дн. Без чувства вины:</div>
                <div className="choices">
                  <button type="button" aria-pressed={!shift[g.id]} onClick={() => setShift({ ...shift, [g.id]: false })}>догоню</button>
                  <button type="button" aria-pressed={Boolean(shift[g.id])} onClick={() => setShift({ ...shift, [g.id]: true })}>сдвинуть срок на {p.behind} дн., иншаАллах</button>
                </div>
              </>
            ) : <div className="tiny">{p.pct >= 100 ? 'Цель достигнута, альхамдулиллях!' : 'Идёшь в графике.'}</div>}
          </div>
        );
      })}
      <label className="field"><span>Одна мысль недели (уйдёт в мухасабу)</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Лучше всего получалось, когда…" /></label>
      <button type="button" className="pri-btn" onClick={save}>Готово</button>
    </div>
  );
}
