import { useEffect, useState } from 'react';
import type { AppState, Goal, GoalStepItem, Habit } from '../types';
import { ANCHOR_LABEL } from '../types';
import { activeLimit, isCounted, slotsUsed, streak, uid } from '../store';
import { addDays, daysBetween, fromKey } from '../dates';
import {
  goalLimit, TEMPLATES, RAMADAN_TPL, TPL_GROUPS, hifzName, hifzRefs, hifzStep, hifzTotal, hifzMap, hifzAyahs, stepsTick, daysLeft, progress, progressLabel, rawValue, sourceDef, weekDelta,
  todayStep, milestones, dayDots, juzDone, type Template, type TplGroup, type Step,
  BOOK_HABIT,
} from '../goals';
import { markStarted } from '../dayplan';
import { SurahPicker, SurahProgress } from './HifzSurahs';
import { ramadanMonth } from '../ramadan';
import { catalog, lessons, emptyVideos } from '../videos';
import { isCloud, myCircles, kindOf } from '../cloud';
import { _t, _tj, LOC } from '../i18n';

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

const fmt = (k: string) => fromKey(k).toLocaleDateString(LOC, { day: 'numeric', month: 'long' });
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
    update((s) => markStarted(s, today, `g:${g.id}`));
    if (st.action !== 'add') return onDo(st);
    if (g.source === 'hifz') update((s) => patchGoal(s, g.id, hifzStep(g, 1)));
    else if (g.source === 'steps') update((s) => patchGoal(s, g.id, g.steps?.length && g.steps.every((x) => x.done) ? { status: 'done', doneAt: today } : stepsTick(g, today)));
    else if (g.source === 'bookch') update((s) => patchGoal(s, g.id, g.manual >= g.target ? { status: 'done', doneAt: today } : { manual: g.manual + 1 }));
    else setOpenId(g.id);
  };

  if (wizard) return <Wizard state={state} update={update} today={today} onClose={(id) => { setWizard(false); if (id) setOpenId(id); }} />;
  if (reviewOpen) return <Review state={state} update={update} today={today} onClose={() => setReviewOpen(false)} />;
  if (open) return <GoalView goal={open} state={state} update={update} today={today} onClose={() => setOpenId(null)} onDo={(st) => act(open, st)} onCircle={onCircle} />;

  return (
    <div className="g-list">
      <h1 className="page-h">{_t("Цели")}</h1>
      <div className="g-seg">
        <button type="button" aria-pressed={seg === 'goals'} onClick={() => setSeg('goals')}>{_t("Цели")}</button>
        <button type="button" aria-pressed={seg === 'stats'} onClick={() => setSeg('stats')}>{_t("Прогресс")}</button>
      </div>
      {seg === 'stats' ? stats : (
        <>
          {isReviewDay(state, today) && (
            <button type="button" className="g-review-cta" onClick={() => setReviewOpen(true)}>
              <b>{_t("Пятница: пересмотр недели")}</b><small>{_t("2 минуты после джума: что продвинулось")}</small>
            </button>
          )}
          {active.length === 0 && <p className="tiny">{_t("Пока целей нет. Начни с одной: например, хатм Корана к Рамадану. Цель держится на системе: намерение, образ себя и привычки.")}</p>}
          {active.map((g) => <GoalCard key={g.id} g={g} state={state} today={today} onOpen={() => setOpenId(g.id)} onAct={(st) => act(g, st)} />)}
          <button type="button" className="g-new" onClick={() => setWizard(true)}>{_tj("+ Новая цель · {0}", active.length < goalLimit() ? _t("свободно {0} из {1}", goalLimit() - active.length, goalLimit()) : _t("встанет в «Потом»"))}</button>
          {active.length > 0 && !isReviewDay(state, today) && <button type="button" className="link-btn" onClick={() => setReviewOpen(true)}>{_t("Пересмотреть неделю сейчас")}</button>}
          {later.length > 0 && (
            <div className="g-later">
              <b>{_tj("Потом ({0})", later.length)}</b>
              {later.map((g) => (
                <div key={g.id} className="g-later-row">
                  <button type="button" className="link-btn" onClick={() => setOpenId(g.id)}>{g.title}</button>
                  <button type="button" className="hg-act" disabled={active.length >= goalLimit()} onClick={() => update((s) => patchGoal(s, g.id, { status: 'active' }))}>{active.length >= goalLimit() ? _t("нет места") : _t("Начать")}</button>
                </div>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <>
              <div className="g-sec">{_t("Достигнуто, альхамдулиллях")}</div>
              <div className="g-shelf">
                {done.map((g) => (
                  <button key={g.id} type="button" onClick={() => setOpenId(g.id)}>
                    <b>{shelfIcon(g)} {g.title}</b>
                    <small>{g.doneAt ? fmt(g.doneAt) : _t("достигнуто")}</small>
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
          <span className="g-mini"><span>{full} {g.source === 'prayers' ? _t("дней все 5 вовремя") : _t("дней всё сделано")}{part ? _t(" · {0} почти", part) : ''}</span><button type="button" className="link-btn" onClick={() => onAct(st)}>{st.text}</button></span>
        </>
      ) : (
        <>
          <span className="g-today">
            <span>{g.source === 'manual' || p.behind ? '' : _t("Сегодня: ")}{st.text}<small>{st.sub}</small></span>
            <button type="button" className="g-do" onClick={() => onAct(st)}>{st.btn}</button>
          </span>
          <span className="g-mini"><span>{g.source === 'quran' ? _t("{0} из 30 джузов", juzDone(p.raw)) : progressLabel(state, g, today)}</span><span>{g.due ? _t("{0} · до {1}", p.behind ? _t("отстаю на {0} дн.", p.behind) : _t("в графике"), fmt(g.due)) : _t("без срока")}</span></span>
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
  const [recount, setRecount] = useState(false);
  const habits = state.habits.filter((h) => g.habitIds.includes(h.id) && h.status !== 'archived');
  const activeCount = (state.goals ?? []).filter((x) => x.status === 'active').length;
  const left = daysLeft(g, today);
  const st = todayStep(state, g, today);
  const miles = milestones(state, g, today);
  const next = miles.find((x) => !x.ok);
  const tpl = TEMPLATES.find((t) => t.title === g.title) ?? TEMPLATES.find((t) => t.source === g.source);
  const tplHabits = g.source === 'bookch' || g.source === 'pages' ? [BOOK_HABIT[g.source]] : tpl?.habits ?? [];
  const suggest = tplHabits.filter((h) => !state.habits.some((x) => x.action === h.action && x.status !== 'archived'));
  const circles = isCloud ? myCircles() : [];
  const addHabit = (h: Template['habits'][number]) => update((s) => {
    const st2: Habit['status'] = slotsUsed(s) < activeLimit() ? 'active' : 'queued';
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
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("К целям")}>‹</button>
        <div><b>{g.title}</b><small>{g.due ? _t("до {0}{1}", fmt(g.due), left !== null && left >= 0 ? _t(" · осталось {0} дн.", left) : _t(" · срок прошёл")) : _t("без срока")}</small></div>
        <button type="button" className="icon-btn g-menu-btn" onClick={() => setMenu(!menu)} aria-label={_t("Ещё")}>⋯</button>
      </div>
      {menu && (
        <div className="g-menu">
          {g.due && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { due: addDays(g.due!, 7) })); setMenu(false); }}>{_t("Сдвинуть срок на неделю")}</button>}
          {g.status === 'active' && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { status: 'later' })); onClose(); }}>{_t("Отложить на потом")}</button>}
          {g.status === 'later' && <button type="button" disabled={activeCount >= goalLimit()} onClick={() => update((s) => patchGoal(s, g.id, { status: 'active' }))}>{_t("Начать сейчас")}</button>}
          {(g.source === 'pages' || g.source === 'bookch') && g.status !== 'done' && <button type="button" onClick={() => { setRecount(true); setMenu(false); }}>{g.source === 'pages' ? _t("Считать по главам") : _t("Считать по страницам")}</button>}
          {g.status !== 'done' && <button type="button" onClick={() => { update((s) => patchGoal(s, g.id, { status: 'done', doneAt: today })); onClose(); }}>{_t("Цель достигнута")}</button>}
          {confirm
            ? <button type="button" className="danger" onClick={() => { update((s) => ({ ...s, goals: (s.goals ?? []).filter((x) => x.id !== g.id) })); onClose(); }}>{_t("Точно удалить")}</button>
            : <button type="button" className="danger" onClick={() => setConfirm(true)}>{_t("Удалить цель")}</button>}
        </div>
      )}
      {recount && <Recount g={g} state={state} today={today} onDone={(patch) => { if (patch) update((s) => patchGoal(s, g.id, patch)); setRecount(false); }} />}
      {g.niyya && <div className="niyya"><small>{_t("Намерение")}</small>{g.niyya}</div>}
      {g.identity && <div className="ident">{g.identity}</div>}

      {g.status !== 'done' && (
        <div className="g-step">
          <small>{_t("Шаг на сегодня")}</small>
          <b>{st.text}</b>
          <p>{st.sub}</p>
          {st.action === 'add' && g.source === 'manual' ? (
            <div className="g-add">
              <input type="number" inputMode="decimal" value={add} onChange={(e) => setAdd(e.target.value)} placeholder={_t("Сколько{0}", g.unit ? ', ' + g.unit : '')} />
              <button type="button" disabled={!Number(add)} onClick={() => { update((s) => patchGoal(s, g.id, { manual: g.manual + Number(add) })); setAdd(''); }}>{_t("+ Добавить")}</button>
            </div>
          ) : <button type="button" className="g-go" onClick={() => onDo(st)}>{st.btn}{st.action !== 'add' && st.action !== 'today' ? _t(" сейчас") : ''}</button>}
          {g.source === 'bookch' && g.manual > 0 && <button type="button" className="link-btn g-undo" onClick={() => update((s) => patchGoal(s, g.id, { manual: g.manual - 1 }))}>{_t("Отметил лишнюю: −1 глава")}</button>}
        </div>
      )}

      <div className="g-big"><b>{def.identity ? `${dayDots(state, g, today).filter((x) => x === 2).length}/30` : `${p.pct}%`}</b><span>{def.identity ? (g.source === 'prayers' ? _t("дней, когда все 5 намазов вовремя") : _t("дней, когда всё сделано")) : `${progressLabel(state, g, today)}${g.due ? ` · ${p.behind ? _t("отстаю на {0} дн.", p.behind) : _t("в графике")}` : ''}`}</span></div>
      {def.identity ? <Dots state={state} g={g} today={today} /> : <div className="pbar"><i style={{ width: `${p.pct}%` }} /></div>}
      {!def.identity && miles.length > 0 && (
        <div className="g-ms">
          {miles.map((x, i) => (
            <div key={i} className={`g-m${x.ok ? ' ok' : x === next ? ' now' : ''}`}><i>{x.ok ? '✓' : ''}</i><b>{x.label}</b><small>{x.ok ? _t("есть") : x.when ? _t("к {0}", fromKey(x.when).toLocaleDateString(LOC, { day: 'numeric', month: 'short' })) : ''}</small></div>
          ))}
        </div>
      )}
      {def.counter && <p className="tiny">{_t("Считается с момента создания цели.")}</p>}
      {g.source === 'steps' && (
        <>
          <div className="g-sec">{_t("Шаги к цели")}</div>
          <StepsEditor steps={g.steps ?? []} today={today} onChange={(steps) => update((s) => patchGoal(s, g.id, { steps, target: steps.length || 1 }))} />
        </>
      )}
      {g.source === 'hifz' && (
        <SurahProgress g={g}
          onStep={(n, d) => update((s) => patchGoal(s, g.id, hifzStep(g, d, n)))}
          onOpen={(n) => onDo({ text: '', sub: '', btn: '', action: 'quran', ref: String(n) })}
          onSet={(refs) => update((s) => {
            const m = hifzMap(g);
            const kept: Record<string, number> = {};
            refs.forEach((n) => { kept[n] = Math.min(hifzAyahs(n), m[n] ?? 0); });
            const target = hifzTotal(refs);
            return patchGoal(s, g.id, { ref: refs.join(','), hifz: kept, target, manual: Math.min(target, Object.values(kept).reduce((a, x) => a + x, 0)) });
          })} />
      )}

      <div className="g-sec">{_t("Система: привычки к цели")}</div>
      <div className="g-habs">
        {habits.map((h) => <HabitLine key={h.id} h={h} state={state} today={today} />)}
        {suggest.map((h) => (
          <div key={h.action} className="card-line sug">
            <span className="c" />
            <div><b>{h.action}</b><small>{_tj("предложение · {0}{1}", ANCHOR_LABEL[h.anchor].after.toLowerCase(), h.min ? _t(" · минимум: {0}", h.min) : '')}</small></div>
            <button type="button" className="link-btn" onClick={() => addHabit(h)}>{_t("+ Добавить")}</button>
          </div>
        ))}
        {!habits.length && !suggest.length && <p className="tiny" style={{ padding: '8px 12px' }}>{_t("К цели пока не привязаны привычки.")}</p>}
      </div>
      <AttachHabit g={g} state={state} update={update} />

      {circles.length > 0 ? (
        <div className="g-circ">
          <span>🤝 <b>{_t("Показать в круге")}</b><small>{_t("Увидят название и процент, чтобы сделать за тебя дуа")}</small></span>
          <div className="g-circ-pick">
            {circles.map((c) => <button key={c.code} type="button" aria-pressed={(g.circles ?? []).includes(c.code)} onClick={() => toggleCircle(c.code)}>{kindOf(c.kind)?.ic ?? '👥'} {c.title}</button>)}
          </div>
        </div>
      ) : (
        <label className="chk">
          <input type="checkbox" checked={Boolean(g.shared)} onChange={() => update((s) => patchGoal(s, g.id, { shared: !g.shared }))} />
          <span><b>{_t("Показать в Круге")}</b><small>{_t("друзья увидят название и процент, чтобы сделать за тебя дуа")}</small></span>
        </label>
      )}
      {g.source === 'quran' && (
        <button type="button" className="g-circ g-circ-btn" onClick={onCircle}>
          <span>👥 <b>{_t("Вместе с братом")}</b><small>{_t("Общий хатм в круге: каждый читает свои джузы")}</small></span><em>{_t("Открыть ›")}</em>
        </button>
      )}
    </div>
  );
}

/** Switch a book goal between chapters and pages, keeping its title, date and habits. */
function Recount({ g, state, today, onDone }: { g: Goal; state: AppState; today: string; onDone: (patch?: Partial<Goal>) => void }) {
  const toCh = g.source === 'pages';
  const [n, setN] = useState(toCh ? 12 : 300);
  const [read, setRead] = useState(0);
  const go = () => {
    if (toCh) return onDone({ source: 'bookch', target: Math.max(1, n), manual: Math.min(n, read), unit: sourceDef('bookch').unit, start: 0 });
    const next: Goal = { ...g, source: 'pages', target: Math.max(1, n), unit: sourceDef('pages').unit, manual: 0 };
    onDone({ source: 'pages', target: next.target, unit: next.unit, manual: 0, start: rawValue(state, next, today) });
  };
  return (
    <div className="g-recount">
      <b>{toCh ? _t("Считать по главам") : _t("Считать по страницам")}</b>
      <div className="h-row">
        <label className="field"><span>{toCh ? _t("Глав в книге") : _t("Страниц в книге")}</span><input type="number" inputMode="numeric" min={1} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
        {toCh && <label className="field"><span>{_t("Уже прочитано")}</span><input type="number" inputMode="numeric" min={0} value={read} onChange={(e) => setRead(Math.max(0, Number(e.target.value)))} /></label>}
      </div>
      <p className="tiny">{toCh ? _t("Каждый день отмечаешь прочитанную главу. Срок и привычки остаются.") : _t("Страницы будут считаться из раздела Книги с этого дня.")}</p>
      <div className="cs-row">
        <button type="button" className="ghost-btn" onClick={() => onDone()}>{_t("Отмена")}</button>
        <button type="button" className="pri-btn" disabled={n < 1} onClick={go}>{_t("Сохранить")}</button>
      </div>
    </div>
  );
}

function HabitLine({ h, state, today }: { h: Habit; state: AppState; today: string }) {
  const done = isCounted(state.log[today]?.[h.id]);
  return (
    <div className="card-line">
      <span className={`c${done ? ' on' : ''}`} />
      <div><b>{h.action}</b><small>{_tj("{0} · минимум: {1}{2}", ANCHOR_LABEL[h.anchor].after.toLowerCase(), h.min || '—', h.status === 'queued' ? _t(" · в очереди") : '')}</small></div>
      <span className="tag">{_tj("{0} дн.", streak(state, h, today))}</span>
    </div>
  );
}

function AttachHabit({ g, state, update }: { g: Goal; state: AppState; update: Props['update'] }) {
  const free = state.habits.filter((h) => (h.status === 'active' || h.status === 'queued') && !g.habitIds.includes(h.id));
  if (!free.length) return null;
  return (
    <label className="field"><span>{_t("Привязать привычку")}</span>
      <select value="" onChange={(e) => e.target.value && update((s) => patchGoal(s, g.id, { habitIds: [...g.habitIds, e.target.value] }))}>
        <option value="">{_t("выбери из своих привычек")}</option>
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
  const [steps, setSteps] = useState<GoalStepItem[]>([]);
  const [already, setAlready] = useState(0);
  const def = sourceDef(source);
  const isBook = source === 'bookch' || source === 'pages';
  const bookBy = (src: 'bookch' | 'pages') => { setSource(src); setTarget(src === 'bookch' ? 12 : 300); setUnit(sourceDef(src).unit); setNewHabits([BOOK_HABIT[src]]); setAlready(0); };
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
    setTpl(t); setTitle(t.title === _t("Своя цель") ? '' : t.title); setSource(src);
    setTarget(t.target ?? (src === 'manual' && u === _t("раз") ? 30 : d.target)); setUnit(u ?? t.unit ?? d.unit); setIdentity(t.identity); setNewHabits(t.habits);
    setRef(src === 'video' ? courses[0]?.id ?? '' : '');
    if (src === 'hifz') { setTarget(0); setTitle(''); }
    if (src === 'video' && courses[0]) setTitle(_t("Пройти курс «{0}»", courses[0].title));
    setDue(t.title.includes(_t("Рамадан")) && rStart ? rStart : '');
    setStep(1);
  };

  const finish = () => {
    const id = uid();
    update((s) => {
      let used = slotsUsed(s);
      const created: Habit[] = newHabits.map((h) => {
        const st: Habit['status'] = used < activeLimit() ? 'active' : 'queued';
        if (st === 'active') used++;
        return { id: uid(), action: h.action, min: h.min, anchor: h.anchor, sphere: h.sphere, status: st, createdAt: today };
      });
      const g: Goal = {
        id, title: title.trim(), source, identity: identity.trim(), niyya: niyya.trim(), target, unit, start: 0, manual: source === 'bookch' ? Math.min(target, already) : 0,
        due: due || undefined, habitIds: [...pick, ...created.map((h) => h.id)], ref: ref || undefined,
        status: activeCount < goalLimit() ? 'active' : 'later', createdAt: today,
        ...(source === 'steps' ? { steps, target: steps.length || 1, unit: '' } : {}),
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

  const ok1 = title.trim() && target > 0 && (source !== 'video' || ref) && (source !== 'hifz' || hifzRefs(ref).length > 0);
  const hasSystem = pick.length + newHabits.length > 0 || !def.identity;
  const existing = state.habits.filter((h) => h.status === 'active' || h.status === 'queued');
  const own: Template = { group: 'life', ic: '✨', sub: '', title: _t("Своя цель"), source: 'habits', identity: '', habits: [] };
  const mine = !tpl || tpl === own;

  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={() => (step ? setStep(step - 1) : onClose())} aria-label={_t("Назад")}>{step ? '‹' : '✕'}</button>
        <div><b>{_t("Новая цель")}</b><small>{_tj("шаг {0} из 3", step + 1)}</small></div>
      </div>
      <div className="step">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <p className="q">{_t("Что хочешь достичь?")}</p>
          {activeCount >= goalLimit() && <p className="tiny">{_tj("Активных целей уже {0}. Новая встанет в «Потом».", goalLimit())}</p>}
          {showR && (
            <div className="g-season">
              <b>{_tj("🌙 К Рамадану{0}", rStart ? `, ${fmt(rStart)}` : '')}</b>
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
          <div className="g-sec">{_t("Своя цель")}</div>
          <button type="button" className="g-tp g-dream" onClick={() => choose(own, 'steps')}>
            <i>🌍</i><span><b>{_t("Мечта или жизненная цель")}</b><small>{_t("Переехать, поехать отдохнуть, свадьба, свой дом. Без привычек и чисел: просто шаги, которые отмечаешь сам")}</small></span>
          </button>
          <p className="tiny" style={{ margin: 0 }}>{_t("Или посчитать цель числом:")}</p>
          <div className="g-how">
            <button type="button" onClick={() => choose(own, 'manual', _t("раз"))}>{_t("Отмечаю сам")}</button>
            <button type="button" onClick={() => choose(own, 'habits')}>{_t("По привычкам")}</button>
            <button type="button" onClick={() => choose(own, 'manual', '')}>{_t("Своё число")}</button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="q">{_t("Сколько и к какому сроку?")}</p>
          {source === 'hifz' && (
            <div className="field"><span>{_t("Какие суры")}</span>
              <SurahPicker value={hifzRefs(ref)} onChange={(refs) => {
                setRef(refs.join(','));
                setTarget(hifzTotal(refs));
                setTitle(refs.length === 1 ? _t("Выучить суру {0}", hifzName(String(refs[0]))) : refs.length ? _t("Выучить суры: {0}", hifzName(refs.join(','))) : '');
              }} />
            </div>
          )}
          {source === 'video' && (
            <label className="field"><span>{_t("Какой курс")}</span>
              <select value={ref} onChange={(e) => { const it = courses.find((x) => x.id === e.target.value); setRef(e.target.value); setTarget(it?.count ?? 20); setTitle(_t("Пройти курс «{0}»", it?.title ?? '')); }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>{_t("Название")}</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={source === 'steps' ? _t("Например: переехать в Стамбул") : _t("Например: пробежать 5 км")} /></label>
          {source === 'steps' && (
            <div className="field"><span>{_t("Шаги (необязательно)")}</span>
              <StepsEditor steps={steps} today={today} onChange={setSteps} draft />
            </div>
          )}
          {isBook && (
            <div className="field"><span>{_t("Как считать")}</span>
              <div className="g-how g-bookby">
                <button type="button" aria-pressed={source === 'bookch'} onClick={() => bookBy('bookch')}>{_t("По главам")}</button>
                <button type="button" aria-pressed={source === 'pages'} onClick={() => bookBy('pages')}>{_t("По страницам")}</button>
              </div>
              <small className="tiny">{source === 'bookch' ? _t("Отмечаешь прочитанную главу сам. Подходит для любой книги, бумажной тоже.") : _t("Страницы считаются из раздела Книги, где ты читаешь свой PDF или текст.")}</small>
            </div>
          )}
          {source === 'bookch' && (
            <div className="h-row">
              <label className="field"><span>{_t("Глав в книге")}</span><input type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
              <label className="field"><span>{_t("Уже прочитано")}</span><input type="number" inputMode="numeric" min={0} value={already} onChange={(e) => setAlready(Math.max(0, Number(e.target.value)))} /></label>
            </div>
          )}
          {(source === 'manual' || source === 'pages' || source === 'chapters' || source === 'fasts' || source === 'workouts') && (
            <div className="h-row">
              <label className="field"><span>{source === 'pages' ? _t("Страниц в книге") : _t("Сколько")}</span><input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
              {source === 'manual' && <label className="field"><span>{_t("Единица")}</span><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={_t("€, кг, раз")} /></label>}
            </div>
          )}
          {source === 'video' && <p className="tiny">{_tj("В курсе {0}  {1}. Прогресс считается по просмотренным урокам.", target, target === 1 ? _t("урок") : _t("уроков"))}</p>}
          {source === 'quran' && <p className="tiny">{_t("Прогресс берётся из закладки в Коране. Приложение подскажет, сколько страниц читать в день.")}</p>}
          {def.identity && <p className="tiny">{_t("Прогресс: сколько дней из последних 30 всё получилось.")}</p>}
          {!def.identity && (
            <>
              <label className="field"><span>{_t("К какой дате (необязательно)")}</span><input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} /></label>
              {rStart && due !== rStart && <button type="button" className="link-btn" onClick={() => setDue(rStart)}>{_tj("К Рамадану, {0}", fmt(rStart))}</button>}
            </>
          )}
          <button type="button" className="pri-btn" disabled={!ok1} onClick={() => setStep(2)}>{_t("Дальше")}</button>
          {source === 'steps' && <button type="button" className="ghost-btn" disabled={!ok1} onClick={finish}>{_t("Сохранить цель сразу")}</button>}
        </>
      )}

      {step === 2 && (
        <>
          <p className="q">{_t("Зачем и кем ты станешь?")}</p>
          <label className="field"><span>{_t("Намерение: зачем мне это ради Аллаха и ради себя")}</span><textarea rows={2} value={niyya} onChange={(e) => setNiyya(e.target.value)} placeholder={mine ? _t("Например: чтобы семья жила спокойнее, ради довольства Аллаха") : _t("Хочу, чтобы Коран был со мной каждый день, а не только в Рамадан")} /></label>
          <label className="field"><span>{_t("Я тот, кто… (необязательно)")}</span><input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder={mine ? _t("Я тот, кто доводит начатое до конца") : _t("Я тот, кто читает Коран каждый день")} /></label>
          <div className="g-sec">{def.identity ? _t("Привычки, которые ведут к цели") : _t("Привычки, которые ведут к цели (необязательно)")}</div>
          {newHabits.map((h, i) => (
            <label key={h.action} className="chk">
              <input type="checkbox" checked onChange={() => setNewHabits(newHabits.filter((_, j) => j !== i))} />
              <span><b>{h.action}</b><small>{_tj("новая · {0}{1}", ANCHOR_LABEL[h.anchor].after.toLowerCase(), h.min ? _t(" · минимум: {0}", h.min) : '')}</small></span>
            </label>
          ))}
          {tpl?.habits.filter((h) => !newHabits.includes(h)).map((h) => (
            <label key={h.action} className="chk">
              <input type="checkbox" checked={false} onChange={() => setNewHabits([...newHabits, h])} />
              <span><b>{h.action}</b><small>{_tj("предложение · {0}", ANCHOR_LABEL[h.anchor].after.toLowerCase())}</small></span>
            </label>
          ))}
          {existing.map((h) => (
            <label key={h.id} className="chk">
              <input type="checkbox" checked={pick.includes(h.id)} onChange={() => setPick(pick.includes(h.id) ? pick.filter((x) => x !== h.id) : [...pick, h.id])} />
              <span><b>{h.action}</b><small>{_tj("моя привычка · {0}", ANCHOR_LABEL[h.anchor].after.toLowerCase())}</small></span>
            </label>
          ))}
          <QuickHabit onAdd={(h) => setNewHabits([...newHabits, h])} />
          {slotsUsed(state) + newHabits.length > activeLimit() && <p className="tiny">{_tj("Лимит {0} активных привычек: лишние встанут в очередь «Скоро».", activeLimit())}</p>}
          {!hasSystem && <p className="tiny">{_t("Эта цель считается по привычкам: выбери хотя бы одну.")}</p>}
          <button type="button" className="pri-btn" disabled={!hasSystem} onClick={finish}>{_t("Сохранить цель")}</button>
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
      <input value={action} onChange={(e) => setAction(e.target.value)} placeholder={_t("Своя привычка")} />
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
      const notes = note.trim() ? { ...s.notes, [today]: [s.notes[today], _t("Неделя: {0}", note.trim())].filter(Boolean).join('\n') } : s.notes;
      return { ...s, goals, notes, goalReview: today };
    });
    onClose();
  };
  return (
    <div className="g-view">
      <div className="g-bar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_t("Пересмотр недели")}</b><small>{_t("что продвинулось за 7 дней")}</small></div>
      </div>
      {active.map((g) => {
        const p = progress(state, g, today);
        const d = weekDelta(state, g, today);
        const def = sourceDef(g.source);
        return (
          <div key={g.id} className="rv">
            <div className="t">{g.title}<span>{d > 0 ? '+' : ''}{d}{def.unit === '%' ? _t(" п.") : g.source === 'quran' ? _t(" аятов") : g.unit ? ` ${g.unit}` : ''}</span></div>
            <small>{_tj("Сейчас {0}%{1}", p.pct, g.identity ? ` · ${g.identity}` : '')}</small>
            {p.behind > 0 && g.due ? (
              <>
                <div>{_tj("Отстаёшь на {0} дн. Без чувства вины:", p.behind)}</div>
                <div className="choices">
                  <button type="button" aria-pressed={!shift[g.id]} onClick={() => setShift({ ...shift, [g.id]: false })}>{_t("догоню")}</button>
                  <button type="button" aria-pressed={Boolean(shift[g.id])} onClick={() => setShift({ ...shift, [g.id]: true })}>{_tj("сдвинуть срок на {0} дн., иншаАллах", p.behind)}</button>
                </div>
              </>
            ) : <div className="tiny">{p.pct >= 100 ? _t("Цель достигнута, альхамдулиллях!") : _t("Идёшь в графике.")}</div>}
          </div>
        );
      })}
      <label className="field"><span>{_t("Одна мысль недели (уйдёт в мухасабу)")}</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={_t("Лучше всего получалось, когда…")} /></label>
      <button type="button" className="pri-btn" onClick={save}>{_t("Готово")}</button>
    </div>
  );
}

/** Steps of a life goal: tick, remove, add. */
function StepsEditor({ steps, today, onChange, draft }: { steps: GoalStepItem[]; today: string; onChange: (s: GoalStepItem[]) => void; draft?: boolean }) {
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (!t) return; onChange([...steps, { id: uid(), text: t }]); setText(''); };
  return (
    <div className="st-list">
      {steps.map((x) => (
        <div key={x.id} className={`st-row${x.done ? ' done' : ''}`}>
          {!draft && <input type="checkbox" checked={Boolean(x.done)} onChange={() => onChange(steps.map((y) => (y.id === x.id ? { ...y, done: y.done ? undefined : today } : y)))} aria-label={x.text} />}
          <span>{x.text}{x.done && <small>{_tj(" · {0}", fmt(x.done))}</small>}</span>
          <button type="button" className="st-del" onClick={() => onChange(steps.filter((y) => y.id !== x.id))} aria-label={_t("Убрать шаг")}>✕</button>
        </div>
      ))}
      <div className="task-add">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={steps.length ? _t("Ещё шаг") : _t("Первый шаг, например: накопить на билеты")} />
        <button type="button" className="pri-btn" disabled={!text.trim()} onClick={add}>+</button>
      </div>
    </div>
  );
}
