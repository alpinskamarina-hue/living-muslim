import { useEffect, useState } from 'react';
import type { AppState, Goal, Habit } from '../types';
import { ANCHOR_LABEL } from '../types';
import { ACTIVE_LIMIT, isCounted, slotsUsed, streak, uid } from '../store';
import { addDays, daysBetween, fromKey } from '../dates';
import {
  GOAL_LIMIT, TEMPLATES, RAMADAN_TPL, TPL_GROUPS, HIFZ, surahAyahs, hifzName, daysLeft, progress, progressLabel, rawValue, sourceDef, weekDelta,
  todayStep, milestones, dayDots, juzDone, type Template, type TplGroup, type Step,
} from '../goals';
import { ramadanMonth } from '../ramadan';
import { catalog, lessons, emptyVideos } from '../videos';
import { isCloud, myCircles, kindOf } from '../cloud';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  reviewOpen: boolean;
  setReviewOpen: (v: boolean) => void;
  stats?: React.ReactNode;
  /** Opens the place where today's step is done (Practice section, Today tab). */
  onDo: (step: Step) => void;
  onCircle: () => void;
}

const fmt = (k: string) => fromKey(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const patchGoal = (s: AppState, id: string, p: Partial<Goal>): AppState => ({ ...s, goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...p } : g)) });

export function Ring({ pct, size = 46, gold, label }: { pct: number; size?: number; gold?: boolean; label?: string }) {
  const r = size / 2 - 4, C = 2 * Math.PI * r;
  return (
    <span className="g-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={gold ? 'var(--gold)' : 'var(--green-2)'} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span>{label ?? `${pct}%`}</span>
    </span>
  );
}

export function isReviewDay(state: AppState, today: string) {
  const fri = fromKey(today).getDay() === 5;
  const active = (state.goals ?? []).some((g) => g.status === 'active');
  return fri && active && (!state.goalReview || daysBetween(state.goalReview, today) >= 6);
}

export function Goals({ state, update, today, openId, setOpenId, reviewOpen, setReviewOpen, stats, onDo, onCircle }: Props) {
  const [wizard, setWizard] = useState(false);
  const [seg, setSeg] = useState<'goals' | 'stats'>('goals');
  const goals = state.goals ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const later = goals.filter((g) => g.status === 'later');
  const done = goals.filter((g) => g.status === 'done');
  const open = goals.find((g) => g.id === openId);
  const act = (g: Goal, st: Step) => {
    if (st.action !== 'add') return onDo(st);
    if (g.source === 'hifz') update((s) => patchGoal(s, g.id, { manual: Math.min(g.target, g.manual + 1) }));
    else setOpenId(g.id);
  };

  if (wizard) return <Wizard state={state} update={update} today={today} onClose={(id) => { setWizard(false); if (id) setOpenId(id); }} />;
  if (reviewOpen) return <Review state={state} update={update} today={today} onClose={() => setReviewOpen(false)} />;
  if (open) return <GoalView goal={open} state={state} update={update} today={today} onClose={() => setOpenId(null)} onDo={(st) => act(open, st)} onCircle={onCircle} />;

  return (
    <div className="g-list">
      <h1 className="page-h">Цели</h1>
      <div className="g-seg">
        <button type="button" aria-pressed={seg === 'goals'} onClick={() => setSeg('goals')}>Цели</button>
        <button type="button" aria-pressed={seg === 'stats'} onClick={() => setSeg('stats')}>Прогресс</button>
      </div>
      {seg === 'stats' ? stats : (
        <>
          {isReviewDay(state, today) && (
            <button type="button" className="g-review-cta" onClick={() => setReviewOpen(true)}>
              <b>Пятница: пересмотр недели</b><small>2 минуты после джума: что продвинулось</small>
            </button>
          )}
          {active.length === 0 && <p className="tiny">Пока целей нет. Начни с одной: например, хатм Корана к Рамадану. Цель держится на системе: намерение, образ себя и привычки.</p>}
          {active.map((g) => <GoalCard key={g.id} g={g} state={state} today={today} onOpen={() => setOpenId(g.id)} onAct={(st) => act(g, st)} />)}
          <button type="button" className="g-new" onClick={() => setWizard(true)}>+ Новая цель · {active.length < GOAL_LIMIT ? `свободно ${GOAL_LIMIT - active.length} из ${GOAL_LIMIT}` : 'встанет в «Потом»'}</button>
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
          {done.length > 0 && (
            <>
              <div className="g-sec">Достигнуто, альхамдулиллях</div>
              <div className="g-shelf">
                {done.map((g) => (
                  <button key={g.id} type="button" onClick={() => setOpenId(g.id)}>
                    <b>{shelfIcon(g)} {g.title}</b>
                    <small>{g.doneAt ? fmt(g.doneAt) : 'достигнуто'}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function shelfIcon(g: Goal) {
  const t = TEMPLATES.find((x) => x.title === g.title) ?? TEMPLATES.find((x) => x.source === g.source);
  return t && !t.ar ? t.ic : g.source === 'quran' || g.source === 'hifz' ? '📖' : '✓';
}

function Dots({ state, g, today }: { state: AppState; g: Goal; today: string }) {
  const d = dayDots(state, g, today);
  return <span className="g-dots">{d.map((x, i) => <i key={i} className={x === 2 ? 'on' : x === 1 ? 'h' : ''} />)}</span>;
}

function GoalCard({ g, state, today, onOpen, onAct }: { g: Goal; state: AppState; today: string; onOpen: () => void; onAct: (st: Step) => void }) {
  const p = progress(state, g, today);
  const def = sourceDef(g.source);
  const st = todayStep(state, g, today);
  const full = def.identity ? dayDots(state, g, today).filter((x) => x === 2).length : 0;
  const part = def.identity ? dayDots(state, g, today).filter((x) => x === 1).length : 0;
  return (
    <div className="g-card">
      <button type="button" className="g-top" onClick={onOpen}>
        <Ring pct={def.identity ? Math.round((full / 30) * 100) : p.pct} gold={p.behind > 0} label={def.identity ? `${full}/30` : undefined} />
        <span><b>{g.title}</b>{g.identity && <small className="g-who">{g.identity}</small>}</span>
      </button>
      {def.identity ? (
        <>
          <Dots state={state} g={g} today={today} />
          <span className="g-mini"><span>{full} {g.source === 'prayers' ? 'дней все 5 вовремя' : 'дней всё сделано'}{part ? ` · ${part} почти` : ''}</span><button type="button" className="link-btn" onClick={() => onAct(st)}>{st.text}</button></span>
        </>
      ) : (
        <>
          <span className="g-today">
            <span>{g.source === 'manual' || p.behind ? '' : 'Сегодня: '}{st.text}<small>{st.sub}</small></span>
            <button type="button" className="g-do" onClick={() => onAct(st)}>{st.btn}</button>
          </span>
          <span className="g-mini"><span>{g.source === 'quran' ? `${juzDone(p.raw)} из 30 джузов` : progressLabel(state, g, today)}</span><span>{g.due ? `${p.behind ? `отстаю на ${p.behind} дн.` : 'в графике'} · до ${fmt(g.due)}` : 'без срока'}</span></span>
        </>
      )}
    </div>
  );
}

function GoalView({ goal: g, state, update, today, onClose, onDo, onCircle }: { goal: Goal; state: AppState; update: Props['update']; today: string; onClose: () => void; onDo: (st: Step) => void; onCircle: () => void }) {
  const p = progress(state, g, today);
  const def = sourceDef(g.source);
  const [add, setAdd] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const habits = state.habits.filter((h) => g.habitIds.includes(h.id) && h.status !== 'archived');
  const activeCount = (state.goals ?? []).filter((x) => x.status === 'active').length;
  const left = daysLeft(g, today);
  const st = todayStep(state, g, today);
  const miles = milestones(state, g, today);
  const next = miles.find((x) => !x.ok);
  const tpl = TEMPLATES.find((t) => t.title === g.title) ?? TEMPLATES.find((t) => t.source === g.source);
  const suggest = (tpl?.habits ?? []).filter((h) => !state.habits.some((x) => x.action === h.action && x.status !== 'archived'));
  const circles = isCloud ? myCircles() : [];
  const addHabit = (h: Template['habits'][number]) => update((s) => {
    const st2: Habit['status'] = slotsUsed(s) < ACTIVE_LIMIT ? 'active' : 'queued';
    const nh: Habit = { id: uid(), action: h.action, min: h.min, anchor: h.anchor, sphere: h.sphere, status: st2, createdAt: today };
    return { ...patchGoal({ ...s, habits: [...s.habits, nh] }, g.id, { habitIds: [...g.habitIds, nh.id] }) };
  });
  const toggleCircle = (code: string) => {
    const cur = g.circles ?? [];
    const nextC = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
    update((s) => patchGoal(s, g.id, { circles: nextC, shared: nextC.length > 0 }));
  };

  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="К целям">‹</button>
        <div><b>{g.title}</b><small>{g.due ? `до ${fmt(g.due)}${left !== null && left >= 0 ? ` · осталось ${left} дн.` : ' · срок прошёл'}` : 'без срока'}</small></div>
        <button type="button" className="icon-btn g-menu-btn" onClick={() => setMenu(!menu)} aria-label="Ещё">⋯</button>
      </div>
      {menu && (
        <div className="g-menu">
          {g.due && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { due: addDays(g.due!, 7) })); setMenu(false); }}>Сдвинуть срок на неделю</button>}
          {g.status === 'active' && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { status: 'later' })); onClose(); }}>Отложить на потом</button>}
          {g.status === 'later' && <button type="button" disabled={activeCount >= GOAL_LIMIT} onClick={() => update((s) => patchGoal(s, g.id, { status: 'active' }))}>Начать сейчас</button>}
          {g.status !== 'done' && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { status: 'done', doneAt: today })); onClose(); }}>Цель достигнута</button>}
          {confirm
            ? <button type="button" className="danger" onClick={() => { update((s) => ({ ...s, goals: (s.goals ?? []).filter((x) => x.id !== g.id) })); onClose(); }}>Точно удалить</button>
            : <button type="button" className="danger" onClick={() => setConfirm(true)}>Удалить цель</button>}
        </div>
      )}
      {g.niyya && <div className="niyya"><small>Намерение</small>{g.niyya}</div>}
      {g.identity && <div className="ident">{g.identity}</div>}

      {g.status !== 'done' && (
        <div className="g-step">
          <small>Шаг на сегодня</small>
          <b>{st.text}</b>
          <p>{st.sub}</p>
          {st.action === 'add' && g.source === 'manual' ? (
            <div className="g-add">
              <input type="number" inputMode="decimal" value={add} onChange={(e) => setAdd(e.target.value)} placeholder={`Сколько${g.unit ? ', ' + g.unit : ''}`} />
              <button type="button" disabled={!Number(add)} onClick={() => { update((s) => patchGoal(s, g.id, { manual: g.manual + Number(add) })); setAdd(''); }}>+ Добавить</button>
            </div>
          ) : <button type="button" className="g-go" onClick={() => onDo(st)}>{st.btn}{st.action !== 'add' && st.action !== 'today' ? ' сейчас' : ''}</button>}
        </div>
      )}

      <div className="g-big"><b>{def.identity ? `${dayDots(state, g, today).filter((x) => x === 2).length}/30` : `${p.pct}%`}</b><span>{def.identity ? (g.source === 'prayers' ? 'дней, когда все 5 намазов вовремя' : 'дней, когда всё сделано') : `${progressLabel(state, g, today)}${g.due ? ` · ${p.behind ? `отстаю на ${p.behind} дн.` : 'в графике'}` : ''}`}</span></div>
      {def.identity ? <Dots state={state} g={g} today={today} /> : <div className="pbar"><i style={{ width: `${p.pct}%` }} /></div>}
      {!def.identity && (
        <div className="g-ms">
          {miles.map((x, i) => (
            <div key={i} className={`g-m${x.ok ? ' ok' : x === next ? ' now' : ''}`}><i>{x.ok ? '✓' : ''}</i><b>{x.label}</b><small>{x.ok ? 'есть' : x.when ? `к ${fromKey(x.when).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : ''}</small></div>
          ))}
        </div>
      )}
      {def.counter && <p className="tiny">Считается с момента создания цели.</p>}
      {g.source === 'hifz' && g.manual > 0 && <button type="button" className="link-btn" onClick={() => update((s) => patchGoal(s, g.id, { manual: g.manual - 1 }))}>−1 аят (ошибся)</button>}

      <div className="g-sec">Система: привычки к цели</div>
      <div className="g-habs">
        {habits.map((h) => <HabitLine key={h.id} h={h} state={state} today={today} />)}
        {suggest.map((h) => (
          <div key={h.action} className="card-line sug">
            <span className="c" />
            <div><b>{h.action}</b><small>предложение · {ANCHOR_LABEL[h.anchor].after.toLowerCase()}{h.min ? ` · минимум: ${h.min}` : ''}</small></div>
            <button type="button" className="link-btn" onClick={() => addHabit(h)}>+ Добавить</button>
          </div>
        ))}
        {!habits.length && !suggest.length && <p className="tiny" style={{ padding: '8px 12px' }}>К цели пока не привязаны привычки.</p>}
      </div>
      <AttachHabit g={g} state={state} update={update} />

      {circles.length > 0 ? (
        <div className="g-circ">
          <span>🤝 <b>Показать в круге</b><small>Увидят название и процент, чтобы сделать за тебя дуа</small></span>
          <div className="g-circ-pick">
            {circles.map((c) => <button key={c.code} type="button" aria-pressed={(g.circles ?? []).includes(c.code)} onClick={() => toggleCircle(c.code)}>{kindOf(c.kind)?.ic ?? '👥'} {c.title}</button>)}
          </div>
        </div>
      ) : (
        <label className="chk">
          <input type="checkbox" checked={Boolean(g.shared)} onChange={() => update((s) => patchGoal(s, g.id, { shared: !g.shared }))} />
          <span><b>Показать в Круге</b><small>друзья увидят название и процент, чтобы сделать за тебя дуа</small></span>
        </label>
      )}
      {g.source === 'quran' && (
        <button type="button" className="g-circ g-circ-btn" onClick={onCircle}>
          <span>👥 <b>Вместе с братом</b><small>Общий хатм в круге: каждый читает свои джузы</small></span><em>Открыть ›</em>
        </button>
      )}
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
  const [group, setGroup] = useState<TplGroup>('faith');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<Goal['source']>('habits');
  const [target, setTarget] = useState(100);
  const [unit, setUnit] = useState('');
  const [due, setDue] = useState('');
  const [ref, setRef] = useState('');
  const [niyya, setNiyya] = useState('');
  const [identity, setIdentity] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [newHabits, setNewHabits] = useState<Template['habits']>([]);
  const [seed, setSeed] = useState<string[]>([]);
  const def = sourceDef(source);
  const activeCount = (state.goals ?? []).filter((g) => g.status === 'active').length;
  const rm = ramadanMonth(today);
  const rStart = rm.state === 'next' ? rm.days[0] : '';
  const showR = rm.state === 'next' && rm.daysTo <= 60;
  const courses = [...(state.videos?.mine ?? []), ...catalog()].filter((x) => x.kind === 'list');

  // video course: real lesson count, and lessons already watched count from the start
  useEffect(() => {
    if (source !== 'video' || !ref) return;
    const it = courses.find((x) => x.id === ref);
    if (!it) return;
    let live = true;
    lessons(it).then((l) => {
      if (!live || !l.items.length) return;
      setTarget(l.items.length);
      setSeed(l.items.filter((x) => state.videos?.pos[x.id]?.done).map((x) => x.id));
    }).catch(() => { /* keep the guess */ });
    return () => { live = false; };
  }, [source, ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (t: Template, how?: Goal['source'], u?: string) => {
    const src = how ?? t.source;
    const d = sourceDef(src);
    setTpl(t); setTitle(t.title === 'Своя цель' ? '' : t.title); setSource(src);
    setTarget(t.target ?? (src === 'manual' && u === 'раз' ? 30 : d.target)); setUnit(u ?? t.unit ?? d.unit); setIdentity(t.identity); setNewHabits(t.habits);
    setRef(src === 'video' ? courses[0]?.id ?? '' : src === 'hifz' ? '67' : '');
    if (src === 'hifz') { setTarget(surahAyahs(67)); setTitle('Выучить суру аль-Мульк'); }
    if (src === 'video' && courses[0]) setTitle(`Пройти курс «${courses[0].title}»`);
    setDue(t.title.includes('Рамадан') && rStart ? rStart : '');
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
        due: due || undefined, habitIds: [...pick, ...created.map((h) => h.id)], ref: ref || undefined,
        status: activeCount < GOAL_LIMIT ? 'active' : 'later', createdAt: today,
      };
      let next: AppState = { ...s, habits: [...s.habits, ...created] };
      if (source === 'video' && ref && seed.length) {
        const v = next.videos ?? emptyVideos();
        next = { ...next, videos: { ...v, byCourse: { ...(v.byCourse ?? {}), [ref]: [...new Set([...(v.byCourse?.[ref] ?? []), ...seed])] } } };
      }
      g.start = rawValue(next, g, today);
      return { ...next, goals: [...(next.goals ?? []), g] };
    });
    onClose(id);
  };

  const ok1 = title.trim() && target > 0 && (source !== 'video' || ref);
  const hasSystem = pick.length + newHabits.length > 0 || !def.identity;
  const existing = state.habits.filter((h) => h.status === 'active' || h.status === 'queued');
  const own: Template = { group: 'life', ic: '✨', sub: '', title: 'Своя цель', source: 'habits', identity: '', habits: [] };

  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={() => (step ? setStep(step - 1) : onClose())} aria-label="Назад">{step ? '‹' : '✕'}</button>
        <div><b>Новая цель</b><small>шаг {step + 1} из 3</small></div>
      </div>
      <div className="step">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <p className="q">Что хочешь достичь?</p>
          {activeCount >= GOAL_LIMIT && <p className="tiny">Активных целей уже {GOAL_LIMIT}. Новая встанет в «Потом».</p>}
          {showR && (
            <div className="g-season">
              <b>🌙 К Рамадану{rStart ? `, ${fmt(rStart)}` : ''}</b>
              {RAMADAN_TPL.map((t) => <button key={t.title} type="button" onClick={() => choose(t)}>{t.ar ? <i className="ar">{t.ic}</i> : <i>{t.ic}</i>}{t.title}</button>)}
            </div>
          )}
          <div className="g-tabs">
            {TPL_GROUPS.map((x) => <button key={x.id} type="button" aria-pressed={group === x.id} onClick={() => setGroup(x.id)}>{x.ru}</button>)}
          </div>
          {TEMPLATES.filter((t) => t.group === group).map((t) => (
            <button type="button" key={t.title} className="g-tp" onClick={() => choose(t)}>
              <i className={t.ar ? 'ar' : ''}>{t.ic}</i><span><b>{t.title}</b><small>{t.sub}</small></span>
            </button>
          ))}
          <div className="g-sec">Своя цель</div>
          <p className="tiny" style={{ margin: 0 }}>Как считать?</p>
          <div className="g-how">
            <button type="button" onClick={() => choose(own, 'manual', 'раз')}>Отмечаю сам</button>
            <button type="button" onClick={() => choose(own, 'habits')}>По привычкам</button>
            <button type="button" onClick={() => choose(own, 'manual', '')}>Своё число</button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="q">Сколько и к какому сроку?</p>
          {source === 'hifz' && (
            <label className="field"><span>Какую суру</span>
              <select value={ref} onChange={(e) => { const n = Number(e.target.value); setRef(e.target.value); setTarget(n === 2 ? 2 : surahAyahs(n)); setTitle(`Выучить суру ${hifzName(e.target.value)}`); }}>
                {HIFZ.map((h) => <option key={h.n} value={h.n}>{h.ru} · {h.n === 2 ? 2 : surahAyahs(h.n)} аятов</option>)}
              </select>
            </label>
          )}
          {source === 'video' && (
            <label className="field"><span>Какой курс</span>
              <select value={ref} onChange={(e) => { const it = courses.find((x) => x.id === e.target.value); setRef(e.target.value); setTarget(it?.count ?? 20); setTitle(`Пройти курс «${it?.title ?? ''}»`); }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Название</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: пробежать 5 км" /></label>
          {(source === 'manual' || source === 'pages' || source === 'chapters' || source === 'fasts' || source === 'workouts') && (
            <div className="h-row">
              <label className="field"><span>Сколько</span><input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
              {source === 'manual' && <label className="field"><span>Единица</span><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="€, кг, раз" /></label>}
            </div>
          )}
          {source === 'video' && <p className="tiny">В курсе {target} {target === 1 ? 'урок' : 'уроков'}. Прогресс считается по просмотренным урокам.</p>}
          {source === 'quran' && <p className="tiny">Прогресс берётся из закладки в Коране. Приложение подскажет, сколько страниц читать в день.</p>}
          {def.identity && <p className="tiny">Прогресс: сколько дней из последних 30 всё получилось.</p>}
          {!def.identity && (
            <>
              <label className="field"><span>К какой дате (необязательно)</span><input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} /></label>
              {rStart && due !== rStart && <button type="button" className="link-btn" onClick={() => setDue(rStart)}>К Рамадану, {fmt(rStart)}</button>}
            </>
          )}
          <button type="button" className="pri-btn" disabled={!ok1} onClick={() => setStep(2)}>Дальше</button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="q">Зачем и кем ты станешь?</p>
          <label className="field"><span>Намерение: зачем мне это ради Аллаха и ради себя</span><textarea rows={2} value={niyya} onChange={(e) => setNiyya(e.target.value)} placeholder="Хочу, чтобы Коран был со мной каждый день, а не только в Рамадан" /></label>
          <label className="field"><span>Я тот, кто…</span><input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="Я тот, кто читает Коран каждый день" /></label>
          <div className="g-sec">Привычки, которые ведут к цели</div>
          {newHabits.map((h, i) => (
            <label key={h.action} className="chk">
              <input type="checkbox" checked onChange={() => setNewHabits(newHabits.filter((_, j) => j !== i))} />
              <span><b>{h.action}</b><small>новая · {ANCHOR_LABEL[h.anchor].after.toLowerCase()}{h.min ? ` · минимум: ${h.min}` : ''}</small></span>
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
          {!hasSystem && <p className="tiny">Эта цель считается по привычкам: выбери хотя бы одну.</p>}
          <button type="button" className="pri-btn" disabled={!identity.trim() || !hasSystem} onClick={finish}>Сохранить цель</button>
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
