// The study circle «Учёба»: tab «Учёба» (plan, hifz with voice checks, homework, questions, the Friday quiz,
// «Сажусь учить», the certificate) and the notes part of tab «Занятия». Data: src/study.ts, supabase/study.sql.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppState } from '../types';
import { ANCHORS, type Anchor } from '../types';
import type { ChatApi, Msg } from '../chat';
import { cloudMe } from '../cloud';
import { prayerTimes } from '../prayer';
import { surahAyahs, surahName } from '../goals';
import { shareCard } from '../share';
import { anchorLabel, dueLabel } from '../bizWork';
import {
  HIFZ_PLANS, Q_TAGS, SUBJ, UNIT_L, addDays, daysBetween, doneToday, hasPlan, hhmm, hifzTotal, keyOf, lagOf, learnedSurahs, liveLeft,
  nextStep, planTitle, planWeeks, quizFriday, quizFromCards, rangeLabel, refLabel, refsOf, revDoneToday, revMark, revisionToday, unitMany,
  type StApi, type StNote, type StPlan, type StQ, type StQuizQ, type StRef, type StSub, type StTask, type Subj,
} from '../study';
import { askAssistant } from './Assistant';
import { MAX_SEC, Voice, useRecorder } from './CircleChat';
import { _t, _tj, LOC } from '../i18n';
import { useSec } from '../usage';

type Names = Record<string, { name: string } | undefined>;
type Seg = 'plan' | 'hifz' | 'hw' | 'qs' | 'quiz';
export interface StudyProps {
  st: StApi; chat: ChatApi; me: string; names: Names; people: string[]; today: string; state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  /** posts a line into the circle chat (an event card) */
  post: (body: string) => void;
  toChat: () => void;
}
const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const dm = (k: string) => D(k).toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
const first = (names: Names, me: string, id?: string | null) => (!id ? '' : id === me ? _t("Ты") : (names[id]?.name || _t("Участник")).split(' ')[0]);
const ini = (names: Names, id?: string | null) => ((id && names[id]?.name) || '?').trim().charAt(0).toUpperCase();
const AV_C = ['#2f7f7a', '#b5832a', '#b4583a', '#1f7a52', '#5b6fb0', '#8a5a9e'];
const avc = (id: string) => AV_C[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_C.length];
function Av({ id, names, big }: { id: string; names: Names; big?: boolean }) {
  return <span className={`sy-av${big ? ' big' : ''}`} style={{ background: avc(id) }} aria-hidden="true">{ini(names, id)}</span>;
}
const STATUS_L: Record<StSub['status'], () => string> = { wait: () => _t("ждёт проверки"), ok: () => _t("✓ принято"), redo: () => _t("пересдать") };

export function StudyPane(p: StudyProps) {
  useSec('study');
  const d = p.st.data;
  const plan = d?.state.plan ?? {};
  const [seg, setSeg] = useState<Seg>('plan');
  const [focus, setFocus] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!d) return <p className="tiny bw-load">{_t("Загружаю…")}</p>;
  if (!hasPlan(plan) || edit) {
    const may = d.me.lead || !hasPlan(plan);
    return <div className="bw-pane sy-pane">{may ? <SetupView {...p} onDone={() => setEdit(false)} onCancel={hasPlan(plan) ? () => setEdit(false) : undefined} />
      : <div className="bw-card bw-start"><p>{_t("Владелец круга или устаз ещё выбирает, что учим. Загляни чуть позже.")}</p></div>}</div>;
  }
  const hifz = plan.subj === 'hifz';
  const waitN = d.subs.filter((s) => s.status === 'wait' && s.uid !== p.me).length;
  const canTeach = d.me.teacher || !d.state.teachers.length;
  const S: [Seg, string, number][] = [
    ['plan', _t("План"), 0],
    ...(hifz ? [['hifz', _t("Хифз"), canTeach ? d.subs.filter((s) => s.status === 'wait' && s.uid !== p.me && s.ref).length : 0] as [Seg, string, number]] : []),
    ['hw', _t("Домашка"), canTeach ? d.subs.filter((s) => s.status === 'wait' && s.uid !== p.me && s.task).length : openHw(d.tasks, d.subs, p.me, p.today).length],
    ['qs', _t("Вопросы"), canTeach ? d.qs.filter((q) => !q.answer && !q.ans_msg && !q.mine).length : 0],
    ['quiz', _t("Квиз"), d.quiz && !d.quiz.mine ? 1 : 0],
  ];
  void waitN;
  return (
    <div className="bw-pane su-pane sy-pane">
      <div className="su-seg sy-seg" role="tablist">
        {S.map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={seg === k} onClick={() => { setSeg(k); window.scrollTo(0, 0); }}>{l}{n > 0 && <em>{n}</em>}</button>)}
      </div>
      {seg === 'plan' ? <PlanView {...p} go={setSeg} onFocus={() => setFocus(true)} onEdit={() => setEdit(true)} />
        : seg === 'hifz' ? <HifzView {...p} />
          : seg === 'hw' ? <HomeworkView {...p} />
            : seg === 'qs' ? <QuestionsView {...p} />
              : <QuizView {...p} />}
      {focus && <FocusView {...p} onClose={() => setFocus(false)} />}
    </div>
  );
}

/** Homework that is mine to hand in: not handed in yet, or sent back. */
function openHw(tasks: StTask[], subs: StSub[], me: string, today: string): StTask[] {
  return tasks.filter((t) => (!t.due || daysBetween(t.due, today) <= 0) && t.by !== me && (() => {
    const mine = subs.filter((s) => s.task === t.id && s.uid === me).sort((a, b) => b.id - a.id)[0];
    return !mine || mine.status === 'redo';
  })());
}

// ——— «Что учим» ———
function SetupView({ st, today, post, onDone, onCancel }: StudyProps & { onDone: () => void; onCancel?: () => void }) {
  const old = st.data!.state.plan;
  const [subj, setSubj] = useState<Subj>(old.subj ?? 'hifz');
  const [set, setSet] = useState(() => HIFZ_PLANS().find((h) => JSON.stringify(h.refs) === JSON.stringify(old.refs))?.id ?? 'amma');
  const [title, setTitle] = useState(old.subj && old.subj !== 'hifz' ? old.title ?? '' : '');
  const [total, setTotal] = useState(String(old.subj && old.subj !== 'hifz' ? old.total ?? '' : ''));
  const [unit, setUnit] = useState(old.unit && old.unit !== 'ayah' ? old.unit : 'lesson');
  const [pace, setPace] = useState(old.pace ?? 5);
  const [per, setPer] = useState<'d' | 'w'>(old.per ?? 'd');
  const [busy, setBusy] = useState(false);
  const hz = HIFZ_PLANS().find((h) => h.id === set) ?? HIFZ_PLANS()[1];
  const hifz = subj === 'hifz';
  useEffect(() => {
    if (hifz) { setPer('d'); if (![3, 5, 10].includes(pace)) setPace(5); }
    else if (subj === 'book') setUnit((u) => (u === 'chapter' ? u : 'page'));
    else if (subj === 'own') setUnit('step');
    else setUnit('lesson');
  }, [subj]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan: StPlan = hifz
    ? { subj, title: hz.t, refs: hz.refs, total: hifzTotal(hz.refs), unit: 'ayah', pace, per: 'd', start: old.start && old.subj === 'hifz' ? old.start : today }
    : { subj, title: title.trim() || SUBJ().find((x) => x.k === subj)!.t, total: Math.max(0, Math.min(5000, parseInt(total, 10) || 0)), unit, pace, per, start: old.start && old.subj === subj ? old.start : today };
  const weeks = planWeeks(plan);
  const end = hasPlan(plan) ? addDays(plan.start!, weeks * 7) : '';
  const paces: [number, 'd' | 'w', string][] = hifz
    ? [[3, 'd', _t("3 аята в день")], [5, 'd', _t("5 аятов в день")], [10, 'd', _t("10 аятов в день")]]
    : unit === 'page' ? [[2, 'd', _t("2 страницы в день")], [5, 'd', _t("5 страниц в день")], [10, 'd', _t("10 страниц в день")]]
      : [[1, 'd', _tj("1 {0} в день", (UNIT_L[unit] ?? UNIT_L.step)()[0])], [1, 'w', _tj("1 {0} в неделю", (UNIT_L[unit] ?? UNIT_L.step)()[0])], [2, 'w', _tj("2 в неделю")]];
  const save = async () => {
    setBusy(true);
    const ok = await st.set({ plan });
    setBusy(false);
    if (ok) { if (!old.subj) post(_tj("📚 План круга: «{0}», {1} {2}, {3} нед. Каждый день новое и повторение старого.", plan.title!, plan.total!, unitMany(plan, plan.total!), weeks)); onDone(); }
  };
  return (
    <div className="bw-card sy-setup">
      <b className="sy-h">{old.subj ? _t("Изменить план") : _t("Что учим вместе")}</b>
      <div className="sy-tiles">
        {SUBJ().map((x) => <button key={x.k} type="button" aria-pressed={subj === x.k} onClick={() => setSubj(x.k)}><i aria-hidden="true">{x.ic}</i>{x.t}</button>)}
      </div>
      {hifz ? (
        <>
          <span className="bw-sl">{_t("Что именно")}</span>
          <div className="bw-chips">{HIFZ_PLANS().map((h) => <button key={h.id} type="button" aria-pressed={set === h.id} onClick={() => setSet(h.id)}>{h.t}</button>)}</div>
          <p className="bw-sm">{_tj("{0} сур · {1} {2}. Учим от коротких сур к длинным.", hz.refs.length, hifzTotal(hz.refs), unitMany({ unit: 'ayah' }, hifzTotal(hz.refs)))}</p>
        </>
      ) : (
        <>
          <span className="bw-sl">{_t("Название")}</span>
          <input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={subj === 'book' ? _t("Например: «Сад праведных»") : subj === 'arabic' ? _t("Например: Мединский курс, том 1") : subj === 'tajwid' ? _t("Например: Таджвид для начинающих") : _t("Например: 40 хадисов ан-Навави")} />
          {subj === 'book' && <div className="bw-chips">{(['page', 'chapter'] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === 'page' ? _t("По страницам") : _t("По главам")}</button>)}</div>}
          <span className="bw-sl">{_tj("Сколько всего: {0}", unitMany({ unit }))}</span>
          <input type="number" inputMode="numeric" min={1} max={5000} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="20" />
        </>
      )}
      <span className="bw-sl">{_t("Темп")}</span>
      <div className="bw-chips">{paces.map(([n, pr, l]) => <button key={l} type="button" aria-pressed={pace === n && per === pr} onClick={() => { setPace(n); setPer(pr); }}>{l}</button>)}</div>
      {hasPlan(plan) && <div className="sy-ready">{_tj("📅 План готов: {0} нед., до {1}. Каждый день новое и повторение старого.", weeks, dm(end))}</div>}
      <div className="bw-row">
        {onCancel ? <button type="button" className="link-btn" onClick={onCancel}>{_t("Отмена")}</button> : <span />}
        <button type="button" className="pri-btn" disabled={!hasPlan(plan) || busy} onClick={save}>{old.subj ? _t("Сохранить") : _t("Создать план")}</button>
      </div>
      {!old.subj && <p className="bw-from">{_t("Устаза можно отметить потом во вкладке «План». Без устаза сдачи проверяют друг друга.")}</p>}
    </div>
  );
}

// ——— «План» ———
function PlanView(p: StudyProps & { go: (s: Seg) => void; onFocus: () => void; onEdit: () => void }) {
  const { st, me, names, people, today, post } = p;
  const d = st.data!;
  const plan = d.state.plan;
  const total = plan.total ?? 1;
  const prog = (u: string) => d.prog.find((x) => x.uid === u);
  const mine = prog(me);
  const pos = mine?.pos ?? 0;
  const step = nextStep(plan, pos);
  const done = doneToday(mine, today);
  const week = Math.min(planWeeks(plan), Math.floor(Math.max(0, daysBetween(plan.start ?? today, today)) / 7) + 1);
  const avg = people.length ? Math.round(people.reduce((a, u) => a + Math.min(total, prog(u)?.pos ?? 0), 0) / people.length / total * 100) : 0;
  const rev = revisionToday(plan, mine, today).slice(0, 2);
  const hw = openHw(d.tasks, d.subs, me, today)[0];
  const [pickT, setPickT] = useState(false);
  const teachers = d.state.teachers.filter((u) => people.includes(u));
  const live = d.live.filter((l) => liveLeft(l) > 0);
  const markStep = async () => {
    if (!step) return;
    const y = addDays(today, -1);
    const streak = done ? mine?.streak ?? 1 : mine?.day === y ? (mine?.streak ?? 0) + 1 : 1;
    await st.prog({ pos: step[1], day: today, streak });
    if (step[1] >= total) post(_tj("🎉 {0} закончил(а) план «{1}». Устаз, подтверди?", names[me]?.name || _t("Участник"), planTitle(plan)));
  };
  const undo = async () => { const back = Math.max(0, pos - (plan.pace ?? 1)); await st.prog({ pos: back, day: mine?.streak && mine.streak > 1 ? addDays(today, -1) : null, streak: Math.max(0, (mine?.streak ?? 1) - 1) }); };
  const markRev = (s: number) => st.prog({ rev: revMark(mine?.rev ?? {}, s, today) });
  const nudged = (u: string) => { try { return localStorage.getItem(`lm.stnudge.${u}`) === today; } catch { return false; } };
  const nudge = (u: string) => {
    try { localStorage.setItem(`lm.stnudge.${u}`, today); } catch { /* */ }
    post(plan.subj === 'hifz' ? _tj("🤍 {0}, круг ждёт тебя в учёбе. Даже один аят сегодня — уже шаг.", names[u]?.name || '') : _tj("🤍 {0}, круг ждёт тебя в учёбе. Даже 10 минут сегодня — уже шаг.", names[u]?.name || ''));
  };
  const finished = people.filter((u) => (prog(u)?.pos ?? 0) >= total);
  const canCert = d.me.teacher || !d.state.teachers.length;
  const pinned = d.qs.filter((q) => q.pinned && (q.answer || q.ans_msg)).slice(0, 3);
  const weekMin = d.days.filter((x) => daysBetween(x.day, today) < 7).reduce((a, x) => a + x.min, 0);
  return (
    <>
      <div className="bw-card">
        <span className="bw-k">{_tj("Неделя {0} из {1}", week, planWeeks(plan))}</span>
        <b className="sy-big">{planTitle(plan)}</b>
        <div className="bw-bar sy-bar"><i style={{ width: `${Math.round(Math.min(total, pos) / total * 100)}%` }} /></div>
        <small className="bw-sm">{_tj("Ты: {0} из {1} {2} · круг в среднем {3}%", Math.min(pos, total), total, unitMany(plan, total), avg)}</small>
        {d.me.lead && <button type="button" className="link-btn sy-editplan" onClick={p.onEdit}>{_t("✏️ Изменить план")}</button>}
      </div>

      {pos >= total ? <CertCard {...p} /> : (
        <div className="bw-card bw-today sy-today">
          <span className="bw-k">{_t("Сегодня у тебя")}</span>
          {step && (
            <div className={`bw-li${done ? ' done' : ''}`}>
              <button type="button" className={`bw-chk${done ? ' on' : ''}`} aria-label={done ? _t("Отменить") : _t("Готово")} onClick={done ? undo : markStep} />
              <span className="bw-lt">{done ? _tj("Готово: {0}", rangeLabel(plan, Math.max(1, pos - (plan.pace ?? 1) + 1), pos)) : _tj("Новое: {0}", rangeLabel(plan, step[0], step[1]))}</span>
              {(mine?.streak ?? 0) > 1 && <small>🔥 {mine!.streak}</small>}
            </div>
          )}
          {done && step && <p className="bw-sm sy-next">{_tj("Завтра: {0}", rangeLabel(plan, step[0], step[1]))}</p>}
          {rev.map((r) => {
            const ok = revDoneToday(mine, r.s, today);
            return (
              <div key={r.s} className={`bw-li${ok ? ' done' : ''}`}>
                <button type="button" className={`bw-chk${ok ? ' on' : ''}`} aria-label={_t("Повторил")} disabled={ok} onClick={() => markRev(r.s)} />
                <span className="bw-lt">{_tj("Повторить: {0}", surahName(r.s))}</span>
              </div>
            );
          })}
          {hw && <button type="button" className="bw-li sy-li-btn" onClick={() => p.go('hw')}><span className="bw-chk" /><span className="bw-lt">{_tj("Сдать: {0}", hw.title)}</span><small>{dueLabel(hw, today)}</small></button>}
          {plan.subj === 'hifz' && pos > 0 && <button type="button" className="ghost-btn sy-wide" onClick={() => p.go('hifz')}>{d.state.teachers.length ? _t("🎙 Сдать устазу голосом") : _t("🎙 Сдать напарнику голосом")}</button>}
        </div>
      )}

      <button type="button" className="sy-focus-btn" onClick={p.onFocus}>
        <span><b>{_t("⏱ Сажусь учить")}</b><small>{live.length ? _tj("Сейчас учатся: {0}", live.length) : d.state.goal_min ? _tj("Круг за неделю: {0} из {1}", hhmm(weekMin), hhmm(d.state.goal_min)) : _tj("Круг за неделю: {0}", hhmm(weekMin))}</small></span>
        {live.length > 0 && <span className="sy-stack">{live.slice(0, 4).map((l) => <Av key={l.id} id={l.uid} names={names} />)}</span>}
      </button>

      <div className="bw-card">
        <span className="bw-k">{_t("Кто где")}</span>
        {[...people].sort((a, b) => (prog(b)?.pos ?? 0) - (prog(a)?.pos ?? 0)).map((u) => {
          const pr = prog(u), at = pr?.pos ?? 0;
          const lag = lagOf(plan, at, today);
          const teacher = d.state.teachers.includes(u);
          return (
            <div key={u} className="sy-who">
              <Av id={u} names={names} />
              <span className="sy-wn">{u === me ? _t("Ты") : names[u]?.name || _t("Участник")}{teacher && <i className="sy-tch">{_t("устаз")}</i>}</span>
              <span className="sy-wr">
                {at >= total ? _t("🎉 закончил") : at > 0 ? rangeLabel(plan, at, at) : teacher ? '' : _t("ещё не начал")}
                {(pr?.streak ?? 0) > 2 && pr?.day && daysBetween(pr.day, today) <= 1 ? ` · 🔥 ${pr.streak}` : ''}
                {u !== me && !teacher && lag >= 2 && at < total && (nudged(u) ? <em className="sy-lag">{_t(" · подбодрили")}</em>
                  : <> <em className="sy-lag">{plan.per === 'w' ? _tj("· отстал на {0} нед.", lag) : _tj("· отстал на {0} дн.", lag)}</em> <button type="button" className="link-btn" onClick={() => nudge(u)}>{_t("Подбодрить")}</button></>)}
              </span>
            </div>
          );
        })}
      </div>

      {canCert && finished.some((u) => !prog(u)?.cert_at && u !== me) && (
        <div className="bw-card sy-certask">
          <span className="bw-k">{_t("Закончили план")}</span>
          {finished.filter((u) => !prog(u)?.cert_at && u !== me).map((u) => (
            <div key={u} className="sy-who"><Av id={u} names={names} /><span className="sy-wn">{names[u]?.name || _t("Участник")}</span>
              <button type="button" className="pri-btn sy-sm" onClick={async () => { if (await st.cert(u, true)) post(_tj("🎓 {0}: «{1}» — проверено и подтверждено. Машаллах!", names[u]?.name || '', planTitle(plan))); }}>{_t("Подтвердить")}</button></div>
          ))}
        </div>
      )}

      {pinned.length > 0 && (
        <div className="bw-card">
          <span className="bw-k">{_t("📌 Важно от устаза")}</span>
          {pinned.map((q) => <div key={q.id} className="sy-pin"><b>{q.body}</b>{q.answer && <p>{q.answer}</p>}</div>)}
        </div>
      )}

      <div className="bw-card">
        <div className="bw-dech"><span className="bw-k">{_t("Устаз")}</span>{d.me.owner && !pickT && teachers.length < 3 && <button type="button" className="link-btn" onClick={() => setPickT(true)}>{_t("+ Отметить")}</button>}</div>
        {teachers.length ? teachers.map((u) => (
          <div key={u} className="su-mentor"><span>👳 {names[u]?.name || _t("Участник")}{u === me ? ` (${_t("ты")})` : ''}</span>{d.me.owner && <button type="button" className="link-btn" aria-label={_t("Убрать")} onClick={() => st.set({ teachers: d.state.teachers.filter((x) => x !== u) })}>✕</button>}</div>
        )) : !pickT && <p className="bw-none">{d.me.owner ? _t("Если в круге есть учитель, отметь его: он даёт домашку, проверяет сдачи и отвечает на вопросы. Без устаза круг проверяет друг друга.") : _t("Устаза пока нет: сдачи проверяют друг друга.")}</p>}
        {pickT && (
          <div className="su-pick">
            {people.filter((u) => !teachers.includes(u)).map((u) => <button key={u} type="button" className="chip" onClick={() => { st.set({ teachers: [...d.state.teachers, u] }); setPickT(false); }}>{u === me ? _t("Я") : names[u]?.name || _t("Участник")}</button>)}
            <button type="button" className="link-btn" onClick={() => setPickT(false)}>{_t("Отмена")}</button>
          </div>
        )}
      </div>

      {d.me.lead && (
        <div className="bw-card">
          <span className="bw-k">{_t("Цель недели: учимся вместе")}</span>
          <div className="bw-chips">{[0, 180, 360, 600].map((m) => <button key={m} type="button" aria-pressed={d.state.goal_min === m} onClick={() => st.set({ goal_min: m })}>{m ? hhmm(m) : _t("Без цели")}</button>)}</div>
        </div>
      )}
    </>
  );
}

// ——— certificate ———
function CertCard({ st, me, names, today, update, state }: StudyProps) {
  const d = st.data!;
  const plan = d.state.plan;
  const mine = d.prog.find((x) => x.uid === me);
  const teacher = mine?.cert_by && d.state.teachers.includes(mine.cert_by) ? names[mine.cert_by]?.name : '';
  const quran = plan.subj === 'hifz' || plan.subj === 'tajwid';
  const k = `st:${st.code}:${plan.title}`;
  useEffect(() => {
    if (!mine?.cert_at || (state.studyDone ?? []).some((b) => b.k === k)) return;
    update((s) => ({ ...s, studyDone: [...(s.studyDone ?? []), { k, t: planTitle(plan), d: mine.cert_at!, ic: SUBJ().find((x) => x.k === plan.subj)?.ic ?? '📚' }] }));
  }, [mine?.cert_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = () => shareCard({
    theme: 'sand', kicker: _t("Living Muslim · круг «Учёба»"), title: _tj("{0}: пройдено", planTitle(plan)),
    ...(quran ? { ar: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ', body: _t("«Лучший из вас тот, кто изучал Коран и обучал ему»"), src: _t("аль-Бухари") } : {}),
    stats: [[String(plan.total), unitMany(plan, plan.total ?? 0)], [String(planWeeks(plan)), _t("недель")]],
    note: names[me]?.name, foot: teacher ? _tj("Проверил устаз {0}", teacher) : mine?.cert_at ? _t("Подтверждено кругом") : undefined,
  }, 'living-muslim-study.png', _tj("{0}: пройдено. Учимся вместе в Living Muslim", planTitle(plan)));
  return (
    <div className="sy-cert">
      <div className="sy-cert-in">
        <div className="sy-cert-s" aria-hidden="true">🌙</div>
        <span className="bw-k">{_t("Living Muslim · круг «Учёба»")}</span>
        <h3>{_tj("{0}: пройдено", planTitle(plan))}</h3>
        <p>{names[me]?.name} · {plan.total} {unitMany(plan, plan.total ?? 0)}</p>
        <small>{mine?.cert_at ? (teacher ? _tj("Проверил устаз {0} · {1}", teacher, dm(mine.cert_at)) : _tj("Подтверждено · {0}", dm(mine.cert_at))) : _t("Ждём, когда устаз проверит и подтвердит")}</small>
        {quran && <><div className="sy-ar">خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ</div><small>{_t("«Лучший из вас тот, кто изучал Коран и обучал ему» (аль-Бухари)")}</small></>}
      </div>
      <p className="sy-warn">{_t("Это знак окончания плана в приложении. Иджазу с санадом даёт только сам учитель, приложение её не выдаёт.")}</p>
      <div className="bw-row">
        <button type="button" className="ghost-btn" onClick={() => void share()}>{_t("Поделиться")}</button>
        {d.me.lead && <button type="button" className="pri-btn" onClick={() => st.set({ plan: { ...plan, start: today } }).then(() => st.prog({ pos: 0, day: null, streak: 0 }))}>{_t("Начать заново")}</button>}
      </div>
    </div>
  );
}

// ——— voice: play a chat voice message, pick one of mine, or record one here ———
function VoiceOf({ id, chat, me }: { id: number; chat: ChatApi; me: string }) {
  const m = chat.msgs.find((x) => x.id === id);
  if (!m) return <span className="bw-sm">{_t("🎙 голосовое в чате")}</span>;
  return <Voice m={m} chat={chat} mine={m.uid === me} />;
}
function VoicePick({ chat, me, value, onChange, today }: { chat: ChatApi; me: string; value: number | null; onChange: (id: number | null) => void; today: string }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const recent = chat.msgs.filter((m) => m.uid === me && m.kind === 'voice' && !m.deleted && daysBetween(keyOf(new Date(m.at)), today) <= 2).slice(-4).reverse();
  const rec = useRecorder(async (blob, sec, bars) => {
    setBusy(true); setErr('');
    const e = await chat.sendVoice(blob, sec, bars, null);
    setBusy(false);
    if (e) { setErr(e === 'voice_off' ? _t("Владелец круга выключил голосовые") : _t("Голосовое не отправилось. Попробуй ещё раз")); return; }
    const id = chat.lastVoiceId(); if (id) onChange(id);
  });
  if (!chat.ready) return <p className="bw-sm">{_t("Голосовые появятся, когда загрузится чат.")}</p>;
  return (
    <div className="sy-vp">
      {rec.rec ? (
        <div className="sy-rec"><i className="cc-dot" /> <b>0:{String(rec.sec).padStart(2, '0')}</b> <small>{_tj("до {0} сек", MAX_SEC)}</small>
          <button type="button" className="link-btn" onClick={() => rec.stop(true)}>{_t("Отмена")}</button>
          <button type="button" className="pri-btn sy-sm" onClick={() => rec.stop(false)}>{_t("Готово")}</button></div>
      ) : rec.supported && chat.voiceOn && (
        <button type="button" className="ghost-btn sy-wide" disabled={busy} onPointerDown={(e) => { e.preventDefault(); void rec.start(e.clientX); }}>{busy ? _t("Отправляю…") : _t("🎙 Записать голосом (держи или нажми)")}</button>
      )}
      {(rec.msg || err) && <p className="bw-sm sy-err">{rec.msg || err}</p>}
      {recent.length > 0 && <span className="bw-sl">{_t("Или выбери своё голосовое из чата")}</span>}
      {recent.map((m) => (
        <label key={m.id} className={`sy-vrow${value === m.id ? ' on' : ''}`}>
          <input type="radio" checked={value === m.id} onChange={() => onChange(m.id)} />
          <Voice m={m} chat={chat} mine />
          <small>{new Date(m.at).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}</small>
        </label>
      ))}
      {value && <button type="button" className="link-btn" onClick={() => onChange(null)}>{_t("Без голосового")}</button>}
      <p className="bw-from">{_tj("Голосовое до {0} секунд уходит и в чат круга. Длинное отрывок сдавай частями.", MAX_SEC)}</p>
    </div>
  );
}

// ——— hand in (recitation or homework) ———
function HandIn({ st, chat, me, today, post, task, onClose }: StudyProps & { task?: StTask; onClose: () => void }) {
  const d = st.data!;
  const plan = d.state.plan;
  const mine = d.prog.find((x) => x.uid === me);
  const pos = mine?.pos ?? 0;
  const lastRefs = refsOf(plan, Math.max(1, pos - (plan.pace ?? 1) + 1), pos);
  const learned = plan.subj === 'hifz' ? [...new Set([...learnedSurahs(plan, pos), ...lastRefs.map((r) => r.s)])] : [];
  const [ref, setRef] = useState<StRef | null>(task ? null : lastRefs[lastRefs.length - 1] ?? (plan.refs?.[0] ? { s: plan.refs[0], a1: 1, a2: Math.min(5, surahAyahs(plan.refs[0])) } : null));
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const hifz = plan.subj === 'hifz' && !task;
  const label = task ? task.title : hifz && ref ? refLabel(ref) : '';
  const ok = Boolean(label) && (msg || body.trim()) && (!hifz || (ref && ref.a1 >= 1 && ref.a2 >= ref.a1 && ref.a2 <= surahAyahs(ref.s)));
  const send = async () => {
    setBusy(true);
    const id = await st.sub(0, { label: label.slice(0, 120), ref: hifz ? ref : null, msg, task: task?.id ?? null, body: body.trim() });
    setBusy(false);
    if (id) { post(task ? _tj("📝 Сдал(а) домашку: «{0}»", task.title) : _tj("🎙 Сдаю: {0}{1}", label, msg ? _t(" · голосовое выше") : '')); onClose(); }
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet sy-sheet" role="dialog" aria-label={_t("Сдать")}>
        <b>{task ? _tj("📝 Сдать: {0}", task.title) : _t("🎙 Сдать отрывок")}</b>
        {hifz && ref && (
          <>
            <span className="bw-sl">{_t("Сура")}</span>
            <select value={ref.s} onChange={(e) => { const s = Number(e.target.value); setRef({ s, a1: 1, a2: Math.min(surahAyahs(s), 10) }); }}>
              {(learned.length ? learned : plan.refs ?? []).map((s) => <option key={s} value={s}>{surahName(s)} · {surahAyahs(s)}</option>)}
            </select>
            <span className="bw-sl">{_t("Аяты")}</span>
            <div className="sy-rng">
              <input type="number" inputMode="numeric" min={1} max={surahAyahs(ref.s)} value={ref.a1} onChange={(e) => setRef({ ...ref, a1: Math.max(1, Number(e.target.value) || 1) })} aria-label={_t("С аята")} />
              <span>–</span>
              <input type="number" inputMode="numeric" min={1} max={surahAyahs(ref.s)} value={ref.a2} onChange={(e) => setRef({ ...ref, a2: Math.min(surahAyahs(ref.s), Number(e.target.value) || 1) })} aria-label={_t("По аят")} />
            </div>
          </>
        )}
        {task?.body && <p className="bw-sm">{task.body}</p>}
        <span className="bw-sl">{_t("Голосом")}</span>
        <VoicePick chat={chat} me={me} value={msg} onChange={setMsg} today={today} />
        <span className="bw-sl">{_t("Или текстом")}</span>
        <textarea rows={2} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} placeholder={task ? _t("Ответ, ссылка или что не получилось") : _t("Комментарий для устаза, если нужно")} />
        <div className="bw-row">
          <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>
          <button type="button" className="pri-btn" disabled={!ok || busy} onClick={send}>{_t("Сдать")}</button>
        </div>
      </div>
    </>
  );
}

// ——— the teacher checks ———
function CheckSheet({ st, chat, me, names, post, sub, onClose }: StudyProps & { sub: StSub; onClose: () => void }) {
  const [marks, setMarks] = useState<number[]>(sub.marks);
  const [note, setNote] = useState(sub.note);
  const [busy, setBusy] = useState(false);
  const r = sub.ref;
  const nums = r ? Array.from({ length: Math.max(0, Math.min(60, r.a2 - r.a1 + 1)) }, (_, i) => r.a1 + i) : [];
  const save = async (status: StSub['status']) => {
    setBusy(true);
    const ok = await st.check(sub.id, status, status === 'ok' ? [] : marks, note);
    setBusy(false);
    if (ok) {
      const who = names[sub.uid]?.name || _t("Участник");
      post(status === 'ok' ? _tj("✅ Принято: {0} · {1}", who, sub.label) : _tj("🔁 {0} · {1}: пересдать{2}", who, sub.label, marks.length ? _tj(" (аяты {0})", marks.join(', ')) : ''));
      onClose();
    }
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet sy-sheet" role="dialog" aria-label={_t("Проверить")}>
        <b>{_tj("Проверка · {0}", first(names, me, sub.uid))}</b>
        <p className="sy-lbl">{sub.label}</p>
        {sub.msg && <VoiceOf id={sub.msg} chat={chat} me={me} />}
        {sub.body && <p className="sy-body">{sub.body}</p>}
        {nums.length > 0 && (
          <>
            <span className="bw-sl">{_t("Нажми на аят с ошибкой")}</span>
            <div className="sy-ay">{nums.map((n) => <button key={n} type="button" aria-pressed={marks.includes(n)} onClick={() => setMarks((m) => (m.includes(n) ? m.filter((x) => x !== n) : [...m, n].sort((a, b) => a - b)))}>{n}</button>)}</div>
          </>
        )}
        <span className="bw-sl">{_t("Заметка")}</span>
        <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={_t("Например: аят 5 пропустил слово, мадд 4 счёта")} />
        <div className="bw-row">
          <button type="button" className="ghost-btn" disabled={busy} onClick={() => save('redo')}>{_t("🔁 Пересдать")}</button>
          <button type="button" className="pri-btn" disabled={busy} onClick={() => save('ok')}>{_t("✓ Принято")}</button>
        </div>
      </div>
    </>
  );
}

function SubRow({ s, p, onCheck }: { s: StSub; p: StudyProps; onCheck?: () => void }) {
  const { names, me, chat } = p;
  const r = s.ref;
  return (
    <div className="sy-sub">
      <div className="sy-who"><Av id={s.uid} names={names} /><span className="sy-wn"><b>{first(names, me, s.uid)}</b> {s.label}</span>
        <span className={`sy-tag ${s.status}`}>{STATUS_L[s.status]()}</span></div>
      {s.msg && <VoiceOf id={s.msg} chat={chat} me={me} />}
      {s.body && <p className="sy-body">{s.body}</p>}
      {r && s.status !== 'wait' && (
        <div className="sy-ay ro">{Array.from({ length: Math.max(0, Math.min(40, r.a2 - r.a1 + 1)) }, (_, i) => r.a1 + i).map((n) => <span key={n} className={s.marks.includes(n) ? 'x' : ''}>{n}</span>)}</div>
      )}
      {s.note && <p className="sy-note">👳 «{s.note}»{s.checker && s.checker !== me ? ` · ${first(names, me, s.checker)}` : ''}</p>}
      {onCheck && <button type="button" className="pri-btn sy-sm" onClick={onCheck}>{_t("Проверить")}</button>}
    </div>
  );
}

// ——— «Хифз» ———
function HifzView(p: StudyProps) {
  const { st, me, today } = p;
  const d = st.data!;
  const plan = d.state.plan;
  const mine = d.prog.find((x) => x.uid === me);
  const canTeach = d.me.teacher || !d.state.teachers.length;
  const [hand, setHand] = useState(false);
  const [check, setCheck] = useState<StSub | null>(null);
  const hz = d.subs.filter((s) => s.ref);
  const waiting = canTeach ? hz.filter((s) => s.status === 'wait' && s.uid !== me) : [];
  const my = hz.filter((s) => s.uid === me).slice(0, 6);
  const others = hz.filter((s) => s.uid !== me && !(canTeach && s.status === 'wait')).slice(0, 6);
  const learned = learnedSurahs(plan, mine?.pos ?? 0);
  const rev = revisionToday(plan, mine, today);
  const R = mine?.rev ?? {};
  return (
    <>
      {waiting.length > 0 && (
        <div className="bw-card sy-wait">
          <span className="bw-k">{d.state.teachers.length ? _tj("Ждут проверки · {0}", waiting.length) : _tj("Проверь брата или сестру · {0}", waiting.length)}</span>
          {waiting.map((s) => <SubRow key={s.id} s={s} p={p} onCheck={() => setCheck(s)} />)}
        </div>
      )}
      <div className="bw-card">
        <span className="bw-k">{_t("Мураджаа · повторить сегодня")}</span>
        {rev.length ? rev.map((r) => {
          const ok = revDoneToday(mine, r.s, today);
          return (
            <div key={r.s} className={`bw-li${ok ? ' done' : ''}`}>
              <button type="button" className={`bw-chk${ok ? ' on' : ''}`} disabled={ok} aria-label={_t("Повторил")} onClick={() => st.prog({ rev: revMark(R, r.s, today) })} />
              <span className="bw-lt">{surahName(r.s)}</span>
              <span className={`sy-tag ${r.tag === 'weak' ? 'redo' : r.tag === 'gap' ? 'wait' : 'ok'}`}>{r.tag === 'weak' ? _t("была ошибка") : r.tag === 'gap' ? _tj("{0} дн. не читал", r.days > 60 ? '60+' : r.days) : r.tag === 'new' ? _t("впервые") : _t("крепко")}</span>
            </div>
          );
        }) : <p className="bw-none">{learned.length ? _t("На сегодня всё повторено. Машаллах!") : _t("Когда выучишь первую суру целиком, здесь появится повторение: чем слабее сура, тем чаще.")}</p>}
      </div>
      <div className="bw-card">
        <span className="bw-k">{_t("Мои сдачи")}</span>
        {my.length ? my.map((s) => <SubRow key={s.id} s={s} p={p} />) : <p className="bw-none">{_t("Прочитай выученное голосом, и устаз отметит аяты с ошибкой.")}</p>}
      </div>
      {others.length > 0 && (
        <div className="bw-card">
          <span className="bw-k">{_t("Сдачи круга")}</span>
          {others.map((s) => <SubRow key={s.id} s={s} p={p} onCheck={canTeach && s.status !== 'wait' && s.uid !== me ? undefined : undefined} />)}
        </div>
      )}
      <button type="button" className="bw-fab sy-fab" onClick={() => setHand(true)}>{_t("🎙 Сдать")}</button>
      {hand && <HandIn {...p} onClose={() => setHand(false)} />}
      {check && <CheckSheet {...p} sub={check} onClose={() => setCheck(null)} />}
    </>
  );
}

// ——— «Домашка» ———
function HomeworkView(p: StudyProps) {
  const { st, me, names, people, today, post } = p;
  const d = st.data!;
  const canTeach = d.me.teacher || !d.state.teachers.length;
  const [hand, setHand] = useState<StTask | null>(null);
  const [check, setCheck] = useState<StSub | null>(null);
  const [edit, setEdit] = useState<Partial<StTask> | null>(null);
  const [old, setOld] = useState(false);
  const learners = people.filter((u) => !d.state.teachers.includes(u));
  const lastOf = (t: StTask, u: string) => d.subs.filter((s) => s.task === t.id && s.uid === u).sort((a, b) => b.id - a.id)[0];
  const live = d.tasks.filter((t) => !t.due || daysBetween(t.due, today) <= 1);
  const past = d.tasks.filter((t) => t.due && daysBetween(t.due, today) > 1);
  const waiting = canTeach ? d.subs.filter((s) => s.task && s.status === 'wait' && s.uid !== me) : [];
  const card = (t: StTask) => {
    const handed = learners.filter((u) => lastOf(t, u));
    const mine = lastOf(t, me);
    const late = t.due && t.due < today;
    return (
      <div key={t.id} className="bw-card sy-hw">
        <div className="sy-who"><span className="sy-wn">👳 <b>{first(names, me, t.by)}</b></span><span className="sy-wr">{dm(t.created.slice(0, 10))}</span></div>
        <b className="sy-hwt">{t.title}</b>
        {t.body && <p className="bw-sm">{t.body}</p>}
        {(t.due || t.due_p) && <span className={`sy-tag ${late ? 'redo' : 'wait'}`}>⏳ {dueLabel(t, today)}</span>}
        <div className="bw-bar sy-bar"><i style={{ width: `${learners.length ? Math.round(handed.length / learners.length * 100) : 0}%` }} /></div>
        <small className="bw-sm">{_tj("Сдали {0} из {1}", handed.length, learners.length)}</small>
        <div className="sy-hwl">
          {learners.map((u) => { const s = lastOf(t, u); return (
            <div key={u} className="sy-who"><Av id={u} names={names} /><span className="sy-wn">{u === me ? _t("Ты") : names[u]?.name || _t("Участник")}</span>
              <span className="sy-wr">{s ? <span className={`sy-tag ${s.status}`}>{STATUS_L[s.status]()}</span> : _t("ещё не сдал")}
                {s && canTeach && s.uid !== me && <button type="button" className="link-btn" onClick={() => setCheck(s)}>{s.status === 'wait' ? _t("Проверить") : _t("Открыть")}</button>}</span></div>
          ); })}
        </div>
        {t.by !== me && !d.state.teachers.includes(me) && (!mine || mine.status === 'redo') && <button type="button" className="pri-btn sy-wide" onClick={() => setHand(t)}>{mine ? _t("Сдать ещё раз") : _t("Сдать")}</button>}
        {mine?.note && <p className="sy-note">👳 «{mine.note}»</p>}
        {canTeach && t.by === me && <button type="button" className="link-btn" onClick={() => setEdit(t)}>{_t("✏️ Изменить")}</button>}
      </div>
    );
  };
  return (
    <>
      {waiting.length > 0 && <div className="bw-card sy-wait"><span className="bw-k">{_tj("Ждут проверки · {0}", waiting.length)}</span>{waiting.map((s) => <SubRow key={s.id} s={s} p={p} onCheck={() => setCheck(s)} />)}</div>}
      {live.length ? live.map(card) : <div className="bw-card"><p className="bw-none">{canTeach ? _t("Дай кругу задание со сроком: «до Иши» или «до Джумы». Каждый сдаёт голосом или текстом, ты видишь, кто сдал.") : _t("Домашки пока нет. Её даёт устаз.")}</p></div>}
      {past.length > 0 && (old ? past.map(card) : <button type="button" className="link-btn sy-more" onClick={() => setOld(true)}>{_tj("Прошлые задания · {0}", past.length)}</button>)}
      {canTeach && <button type="button" className="bw-fab sy-fab" onClick={() => setEdit({ title: '', body: '', due: today, due_p: 'isha' })}>{_t("＋ Задание")}</button>}
      {hand && <HandIn {...p} task={hand} onClose={() => setHand(null)} />}
      {check && <CheckSheet {...p} sub={check} onClose={() => setCheck(null)} />}
      {edit && <TaskSheet {...p} t={edit} onClose={() => setEdit(null)} onSaved={(t, isNew) => { if (isNew) post(_tj("📝 Домашка: «{0}»{1}", t.title!, t.due || t.due_p ? ` · ${dueLabel({ due: t.due ?? null, due_p: t.due_p ?? null }, today)}` : '')); }} />}
    </>
  );
}

function TaskSheet({ st, today, t, onClose, onSaved }: StudyProps & { t: Partial<StTask>; onClose: () => void; onSaved: (t: Partial<StTask>, isNew: boolean) => void }) {
  const [x, setX] = useState(t);
  const [busy, setBusy] = useState(false);
  const fri = quizFriday(today);
  const days: [string, string][] = [[today, _t("Сегодня")], [addDays(today, 1), _t("Завтра")], ...(fri !== today && fri !== addDays(today, 1) ? [[fri, _t("До Джумы")] as [string, string]] : [])];
  const save = async () => {
    setBusy(true);
    const id = await st.setTask(x.id ?? 0, { title: (x.title ?? '').trim(), body: (x.body ?? '').trim(), due: x.due ?? null, due_p: x.due_p ?? null });
    setBusy(false);
    if (id) { onSaved(x, !x.id); onClose(); }
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet sy-sheet" role="dialog" aria-label={_t("Задание")}>
        <b>{x.id ? _t("📝 Задание") : _t("📝 Новое задание")}</b>
        <input maxLength={140} value={x.title ?? ''} onChange={(e) => setX({ ...x, title: e.target.value })} placeholder={_t("Например: выучить Ан-Наба 11–20")} autoFocus={!x.id} />
        <textarea rows={2} maxLength={600} value={x.body ?? ''} onChange={(e) => setX({ ...x, body: e.target.value })} placeholder={_t("Подробнее: как сдать, что повторить")} />
        <span className="bw-sl">{_t("Срок")}</span>
        <div className="bw-chips">
          <button type="button" aria-pressed={!x.due} onClick={() => setX({ ...x, due: null })}>{_t("Без срока")}</button>
          {days.map(([k, l]) => <button key={l} type="button" aria-pressed={x.due === k} onClick={() => setX({ ...x, due: k, due_p: k === fri && l === _t("До Джумы") ? 'dhuhr' : x.due_p })}>{l}</button>)}
          <input type="date" value={x.due ?? ''} min={today} onChange={(e) => setX({ ...x, due: e.target.value || null })} aria-label={_t("Дата")} />
        </div>
        <div className="bw-chips small">{ANCHORS.map((a: Anchor) => <button key={a} type="button" aria-pressed={x.due_p === a} onClick={() => setX({ ...x, due_p: x.due_p === a ? null : a })}>{anchorLabel(a)}</button>)}</div>
        <div className="bw-row">
          {x.id ? <button type="button" className="link-btn danger-t" onClick={async () => { if (confirm(_t("Удалить задание для всех?"))) { await st.setTask(x.id!, null); onClose(); } }}>{_t("Удалить")}</button> : <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>}
          <button type="button" className="pri-btn" disabled={!(x.title ?? '').trim() || busy} onClick={save}>{x.id ? _t("Сохранить") : _t("Дать задание")}</button>
        </div>
        {!x.id && <p className="bw-from">{_t("Круг увидит задание в чате, срок попадёт в их «Планы» с напоминанием за час.")}</p>}
      </div>
    </>
  );
}

// ——— «Сажусь учить» ———
function FocusView({ st, me, names, today, onClose, post }: StudyProps & { onClose: () => void }) {
  const d = st.data!;
  const plan = d.state.plan;
  const mine = d.live.find((l) => l.uid === me && liveLeft(l) > 0);
  const [mins, setMins] = useState(25);
  const step = nextStep(plan, d.prog.find((x) => x.uid === me)?.pos ?? 0);
  const [what, setWhat] = useState(step ? rangeLabel(plan, step[0], step[1]) : planTitle(plan));
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = mine ? liveLeft(mine, now) : 0;
  const others = d.live.filter((l) => l.uid !== me && liveLeft(l, now) > 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const minOf = (k: string) => d.days.find((x) => x.day === k)?.min ?? 0;
  const weekMin = days.reduce((a, k) => a + minOf(k), 0);
  const frac = mine ? 1 - left / (mine.mins * 60000) : 0;
  useEffect(() => { if (mine && left <= 0) void st.reload(); }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setBusy(true);
    const id = await st.focus('start', mins, what.trim());
    setBusy(false);
    if (id) {
      // one card a day in the chat, so the circle sees who sat down to study without being flooded
      let said = false; try { said = localStorage.getItem(`lm.stfocus.${st.code}`) === today; localStorage.setItem(`lm.stfocus.${st.code}`, today); } catch { /* */ }
      if (!said) post(_tj("⏱ {0} сел(а) учить {1} мин. Присоединяйтесь!", names[me]?.name || '', mins));
    }
  };
  return (
    <div className="sy-focus" role="dialog" aria-label={_t("Сажусь учить")}>
      <button type="button" className="sy-x" aria-label={_t("Закрыть")} onClick={onClose}>✕</button>
      <small className="sy-fk">{planTitle(plan)}</small>
      <b className="sy-fh">{_t("Сажусь учить")}</b>
      <div className="sy-ring" style={{ background: `conic-gradient(var(--sy-2) 0 ${Math.round(frac * 100)}%, var(--surface-2) ${Math.round(frac * 100)}% 100%)` }}>
        <div><b>{mine ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : `${mins}:00`}</b><small>{mine ? _tj("из {0} минут", mine.mins) : _t("минут")}</small></div>
      </div>
      <div className="sy-live">{others.length > 0 && <><i className="sy-dot" /><span className="sy-stack">{others.slice(0, 5).map((l) => <Av key={l.id} id={l.uid} names={names} />)}</span></>}
        <b>{others.length ? _tj("Сейчас учатся: {0}", others.length + (mine ? 1 : 0)) : mine ? _t("Ты учишься. Круг это видит") : _t("Начни первым: круг увидит")}</b></div>
      {mine ? <div className="bw-card sy-fwhat">{_t("Учу:")} <b>{mine.what || planTitle(plan)}</b> · {_t("телефон на тихий 🔕")}</div> : (
        <>
          <div className="bw-chips sy-fm">{[15, 25, 45].map((m) => <button key={m} type="button" aria-pressed={mins === m} onClick={() => setMins(m)}>{_tj("{0} мин", m)}</button>)}</div>
          <input className="sy-fin" maxLength={80} value={what} onChange={(e) => setWhat(e.target.value)} placeholder={_t("Что учу")} />
        </>
      )}
      <div className="bw-card">
        <span className="bw-k">{_t("Круг на этой неделе")}</span>
        <div className="sy-days">{days.map((k) => { const m = minOf(k); return <span key={k} className={k === today ? 'now' : m ? 'ok' : ''}>{D(k).toLocaleDateString(LOC, { weekday: 'short' })}<br />{m ? (m >= 60 ? `${Math.floor(m / 60)}ч${m % 60 ? ` ${m % 60}м` : ''}` : `${m}м`) : '·'}</span>; })}</div>
        <small className="bw-sm">{d.state.goal_min ? _tj("Вместе {0} · цель недели {1}", hhmm(weekMin), hhmm(d.state.goal_min)) : _tj("Вместе {0}", hhmm(weekMin))}{_tj(" · ты всего {0}", hhmm(d.mine_min))}</small>
      </div>
      {mine ? <button type="button" className="pri-btn sy-wide" onClick={() => st.focus('stop')}>{_t("Закончить")}</button>
        : <button type="button" className="pri-btn sy-wide" disabled={busy} onClick={start}>{_tj("Начать · {0} мин", mins)}</button>}
    </div>
  );
}

// ——— «Вопросы» ———
function QuestionsView(p: StudyProps) {
  const { st, me, names, post } = p;
  const d = st.data!;
  const canTeach = d.me.teacher || !d.state.teachers.length;
  const [ask, setAsk] = useState(false);
  const [ans, setAns] = useState<StQ | null>(null);
  const [tag, setTag] = useState('');
  const waiting = d.qs.filter((q) => !q.answer && !q.ans_msg).sort((a, b) => b.too - a.too || b.id - a.id);
  const answered = d.qs.filter((q) => q.answer || q.ans_msg);
  const tags = [...new Set(answered.map((q) => q.tag).filter(Boolean))];
  const list = tag ? answered.filter((q) => q.tag === tag) : answered;
  const who = (q: StQ) => (q.anon ? (q.mine ? _t("ты, анонимно") : _t("анонимно")) : first(names, me, q.uid));
  return (
    <>
      <div className="bw-card">
        <span className="bw-k">{_t("Ждут ответа")}</span>
        {waiting.length ? waiting.map((q) => (
          <div key={q.id} className="sy-q">
            <b>{q.body}</b>
            <div className="sy-qm">
              <button type="button" className={`sy-too${q.too_me ? ' on' : ''}`} disabled={q.mine} onClick={() => st.too(q.id)}>🙋 {q.mine ? _t("мой вопрос") : _t("у меня тоже")}{q.too ? ` · ${q.too}` : ''}</button>
              <span>{who(q)} · {dm(q.created.slice(0, 10))}</span>
              {q.priv && <span className="sy-tag u">{_t("только устазу")}</span>}
            </div>
            <div className="sy-qa">
              {canTeach && !q.mine && <button type="button" className="pri-btn sy-sm" onClick={() => setAns(q)}>{_t("Ответить")}</button>}
              {!d.state.teachers.length && <button type="button" className="link-btn" onClick={() => askAssistant(_tj("Вопрос из учебного круга: {0}. Ответь коротко и бережно, по возможности с источником, и добавь, что точный ответ лучше уточнить у знающего.", q.body))}>{_t("✨ Спросить помощника")}</button>}
              {(q.mine || d.me.lead) && <button type="button" className="link-btn" onClick={() => { if (confirm(_t("Удалить вопрос?"))) st.ask(null, q.id); }}>{_t("Удалить")}</button>}
            </div>
          </div>
        )) : <p className="bw-none">{_t("Вопросов пока нет. Спроси то, что непонятно: другим это тоже поможет.")}</p>}
      </div>
      <div className="bw-card">
        <span className="bw-k">{_t("Отвечено · база знаний круга")}</span>
        {tags.length > 1 && <div className="bw-chips">{[['', _t("все")], ...tags.map((t) => [t, `${t} ${answered.filter((q) => q.tag === t).length}`])].map(([k, l]) => <button key={k || 'all'} type="button" aria-pressed={tag === k} onClick={() => setTag(k)}>{l}</button>)}</div>}
        {list.length ? list.map((q) => (
          <div key={q.id} className="sy-q">
            <b>{q.pinned ? '📌 ' : ''}{q.body}</b>
            {q.answer && <p className="sy-ans">👳 {q.answer}</p>}
            {q.ans_msg && <VoiceOf id={q.ans_msg} chat={p.chat} me={me} />}
            <div className="sy-qm"><span>{q.tag && <span className="sy-tag ok">{q.tag}</span>} {first(names, me, q.ans_by)} · {q.ans_at ? dm(q.ans_at.slice(0, 10)) : ''}</span>
              {canTeach && <button type="button" className="link-btn" onClick={() => setAns(q)}>{_t("Изменить")}</button>}</div>
          </div>
        )) : <p className="bw-none">{_t("Здесь копятся ответы устаза. Новый человек в круге прочитает их с первого дня.")}</p>}
      </div>
      <button type="button" className="bw-fab sy-fab" onClick={() => setAsk(true)}>{_t("＋ Вопрос")}</button>
      {ask && <AskSheet {...p} onClose={() => setAsk(false)} />}
      {ans && <AnswerSheet {...p} q={ans} onClose={() => setAns(null)} onDone={(q) => post(_tj("👳 Ответ на вопрос: «{0}»", q.body.slice(0, 120)))} />}
    </>
  );
}

function AskSheet({ st, post, onClose }: StudyProps & { onClose: () => void }) {
  const d = st.data!;
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('');
  const [anon, setAnon] = useState(false);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const id = await st.ask({ body: body.trim(), tag, anon, priv });
    setBusy(false);
    if (id) { if (!priv) post(_tj("❓ Новый вопрос к устазу: «{0}»", body.trim().slice(0, 120))); onClose(); }
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet sy-sheet" role="dialog" aria-label={_t("Вопрос")}>
        <b>{_t("❓ Вопрос к устазу")}</b>
        <textarea rows={3} maxLength={400} value={body} onChange={(e) => setBody(e.target.value)} placeholder={_t("Например: как отличить ихфа от изхара на слух?")} autoFocus />
        <div className="bw-chips">{Q_TAGS().map((t) => <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>)}</div>
        <label className="sy-chk"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> {_t("Спросить анонимно: имя не увидит никто")}</label>
        {d.state.teachers.length > 0 && <label className="sy-chk"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> {_t("Только устазу: круг вопрос не увидит")}</label>}
        <div className="bw-row">
          <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>
          <button type="button" className="pri-btn" disabled={!body.trim() || busy} onClick={send}>{_t("Спросить")}</button>
        </div>
      </div>
    </>
  );
}

function AnswerSheet({ st, chat, me, today, q, onClose, onDone }: StudyProps & { q: StQ; onClose: () => void; onDone: (q: StQ) => void }) {
  const [text, setText] = useState(q.answer);
  const [msg, setMsg] = useState<number | null>(q.ans_msg);
  const [tag, setTag] = useState(q.tag);
  const [pin, setPin] = useState(q.pinned);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await st.answer(q.id, { answer: text.trim(), msg, tag, pin });
    setBusy(false);
    if (ok) { if (!q.answer && !q.ans_msg && !q.priv) onDone(q); onClose(); }
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet sy-sheet" role="dialog" aria-label={_t("Ответ")}>
        <b>{_t("👳 Ответ")}</b>
        <p className="sy-lbl">{q.body}</p>
        <textarea rows={3} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder={_t("Ответ текстом")} />
        <span className="bw-sl">{_t("Или голосом")}</span>
        <VoicePick chat={chat} me={me} value={msg} onChange={setMsg} today={today} />
        <div className="bw-chips">{Q_TAGS().map((t) => <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>)}</div>
        <label className="sy-chk"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> {_t("📌 Закрепить во вкладке «План»")}</label>
        <div className="bw-row">
          <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>
          <button type="button" className="pri-btn" disabled={(!text.trim() && !msg) || busy} onClick={save}>{_t("Ответить")}</button>
        </div>
      </div>
    </>
  );
}

// ——— «Квиз» ———
function QuizView(p: StudyProps) {
  const { st, me, names, today, state, post } = p;
  const d = st.data!;
  const z = d.quiz;
  const canTeach = d.me.teacher || !d.state.teachers.length;
  const [pick, setPick] = useState<number[]>([]);
  const [edit, setEdit] = useState<StQuizQ[] | null>(null);
  const fri = z?.week ?? quizFriday(today);
  const mg = prayerTimes(state.settings, D(fri)).maghrib.getTime();
  const open = Date.now() >= mg;
  if (edit) return <QuizEditor {...p} qs={edit} week={quizFriday(today)} onClose={() => setEdit(null)} />;
  if (!z) {
    const auto = quizFromCards(d.notes, today);
    return (
      <div className="bw-card sy-quiz0">
        <span className="bw-k">{_t("Пятничный квиз")}</span>
        <p>{_t("5 вопросов по пройденному за неделю. Каждый отвечает сам, ответы и источник открываются после Магриба в пятницу. Круг видит общий процент и слабую тему, без мест и рейтинга.")}</p>
        {canTeach ? (
          <div className="sy-qa">
            <button type="button" className="pri-btn" onClick={() => setEdit([{ q: '', o: ['', ''], ok: 0, src: '' }])}>{_t("Составить квиз")}</button>
            {auto.length > 0 && <button type="button" className="ghost-btn" onClick={() => setEdit(auto)}>{_tj("Собрать из карточек недели · {0}", auto.length)}</button>}
          </div>
        ) : <p className="bw-sm">{_t("Квиз этой недели ещё не готов. Его составляет устаз.")}</p>}
      </div>
    );
  }
  const answered = Boolean(z.mine);
  const all = z.right && z.n ? Math.round(z.right.reduce((a, b) => a + b, 0) / (z.n * z.qs.length) * 100) : 0;
  const weak = z.right && z.n ? z.qs.map((q, i) => ({ q, r: z.right![i] / z.n })).sort((a, b) => a.r - b.r)[0] : null;
  const send = async () => { if (await st.answerQuiz(z.week, pick)) { /* answers stay private */ } };
  return (
    <>
      {(!answered && !(open && canTeach)) ? (
        <div className="bw-card">
          <span className="bw-k">{_tj("Квиз недели · {0} вопр.", z.qs.length)}</span>
          {z.qs.map((q, i) => (
            <div key={i} className="sy-qz">
              <b>{i + 1}. {q.q}</b>
              {q.o.map((o, j) => <button key={j} type="button" className="sy-opt" aria-pressed={pick[i] === j} onClick={() => { const n = [...pick]; n[i] = j; setPick(n); }}>{o}</button>)}
            </div>
          ))}
          <small className="bw-sm">{_t("🔒 Твой ответ видишь только ты")}</small>
          <button type="button" className="pri-btn sy-wide" disabled={z.qs.some((_, i) => pick[i] == null)} onClick={send}>{_t("Отправить ответы")}</button>
        </div>
      ) : !open && !canTeach ? (
        <div className="bw-card sy-soft"><span className="bw-k">{_t("Ответы приняты")}</span><p>{_tj("Ответы, источники и итог круга откроются после Магриба в пятницу, {0}. Уже ответили: {1}.", new Date(mg).toLocaleString(LOC, { weekday: 'short', hour: '2-digit', minute: '2-digit' }), z.n)}</p></div>
      ) : (
        <>
          <div className="bw-card sy-soft">
            <span className="bw-k">{open ? _t("Итог круга после Магриба") : _tj("Итог пока виден только тебе · откроется в {0}", new Date(mg).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }))}</span>
            <div className="sy-res"><b>{all}%</b><span>{_t("ответов верных у круга")}<br /><small>{_tj("Ответили {0}", z.n)}{weak && weak.r < 0.7 ? _tj(" · слабое место: «{0}»", weak.q.q.slice(0, 60)) : ''}</small></span></div>
            {canTeach && weak && weak.r < 0.7 && open && <button type="button" className="link-btn" onClick={() => post(_tj("📝 Итог квиза: {0}% верных. Слабое место: «{1}». Разберём на занятии.", all, weak.q.q.slice(0, 80)))}>{_t("Написать итог в чат")}</button>}
          </div>
          <div className="bw-card">
            {z.qs.map((q, i) => (
              <div key={i} className="sy-qz">
                <b>{i + 1}. {q.q}</b>
                {q.o.map((o, j) => <span key={j} className={`sy-opt ro${j === q.ok ? ' ok' : ''}${z.mine && z.mine[i] === j && j !== q.ok ? ' bad' : ''}`}>{o}{z.mine && z.mine[i] === j ? _t(" · твой ответ") : ''}</span>)}
                {q.src && <small className="bw-sm">{_tj("Источник: {0}", q.src)}</small>}
                {z.right && z.n > 0 && <small className="bw-sm">{_tj("Верно у {0} из {1}", z.right[i], z.n)}</small>}
              </div>
            ))}
          </div>
        </>
      )}
      {canTeach && z.by === me && z.n === 0 && <button type="button" className="link-btn sy-more" onClick={() => setEdit(z.qs)}>{_t("✏️ Изменить квиз")}</button>}
      {canTeach && open && daysBetween(z.week, today) >= 0 && <button type="button" className="link-btn sy-more" onClick={() => setEdit([{ q: '', o: ['', ''], ok: 0, src: '' }])}>{_t("Квиз на следующую пятницу")}</button>}
      <p className="bw-note">{_tj("Составил(а): {0}", first(names, me, z.by))}</p>
    </>
  );
}

function QuizEditor({ st, week, qs: init, onClose, post }: StudyProps & { qs: StQuizQ[]; week: string; onClose: () => void }) {
  const [qs, setQs] = useState<StQuizQ[]>(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (i: number, q: Partial<StQuizQ>) => setQs((l) => l.map((x, j) => (j === i ? { ...x, ...q } : x)));
  const valid = qs.length > 0 && qs.every((q) => q.q.trim() && q.o.filter((o) => o.trim()).length >= 2 && q.o[q.ok ?? 0]?.trim());
  const save = async () => {
    setBusy(true); setErr('');
    const clean = qs.map((q) => { const o = q.o.map((x) => x.trim()); const okText = o[q.ok ?? 0]; const oo = o.filter(Boolean); return { q: q.q.trim().slice(0, 200), o: oo.map((x) => x.slice(0, 80)), ok: oo.indexOf(okText), ...(q.src?.trim() ? { src: q.src.trim().slice(0, 120) } : {}) }; });
    const ok = await st.setQuiz(week, clean);
    setBusy(false);
    if (ok) { post(_tj("🧩 Пятничный квиз готов: {0} вопр. Ответы откроются после Магриба в пятницу.", clean.length)); onClose(); } else setErr(_t("Не сохранилось. Если кто-то уже ответил, квиз менять нельзя."));
  };
  return (
    <div className="bw-card bw-form sy-qe">
      <span className="bw-k">{_tj("Квиз на пятницу, {0}", dm(week))}</span>
      {qs.map((q, i) => (
        <div key={i} className="sy-qeq">
          <div className="bw-dech"><b>{_tj("Вопрос {0}", i + 1)}</b>{qs.length > 1 && <button type="button" className="link-btn" onClick={() => setQs(qs.filter((_, j) => j !== i))}>✕</button>}</div>
          <input maxLength={200} value={q.q} onChange={(e) => up(i, { q: e.target.value })} placeholder={_t("Например: какое правило в слове مِنْ بَعْدِ ?")} />
          {q.o.map((o, j) => (
            <div key={j} className="sy-qeo">
              <input type="radio" name={`ok${i}`} checked={(q.ok ?? 0) === j} onChange={() => up(i, { ok: j })} aria-label={_t("Верный ответ")} />
              <input maxLength={80} value={o} onChange={(e) => up(i, { o: q.o.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={_tj("Вариант {0}", j + 1)} />
            </div>
          ))}
          {q.o.length < 4 && <button type="button" className="link-btn" onClick={() => up(i, { o: [...q.o, ''] })}>{_t("+ Вариант")}</button>}
          <input maxLength={120} value={q.src ?? ''} onChange={(e) => up(i, { src: e.target.value })} placeholder={_t("Источник: урок, аят, хадис (необязательно)")} />
        </div>
      ))}
      {qs.length < 5 && <button type="button" className="link-btn" onClick={() => setQs([...qs, { q: '', o: ['', ''], ok: 0, src: '' }])}>{_t("+ Вопрос")}</button>}
      <p className="bw-sm">{_t("Отметь кружком верный ответ. После первых ответов квиз менять нельзя.")}</p>
      {err && <p className="bw-sm sy-err">{err}</p>}
      <div className="bw-row">
        <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>
        <button type="button" className="pri-btn" disabled={!valid || busy} onClick={save}>{_t("Сохранить квиз")}</button>
      </div>
    </div>
  );
}

// ——— «Занятия»: schedule + notes ———
export function StudyLessons({ calendar, ...p }: StudyProps & { calendar: ReactNode }) {
  const [seg, setSeg] = useState<'cal' | 'notes'>('cal');
  return (
    <>
      <div className="sy-lseg" role="tablist">
        <button type="button" role="tab" aria-selected={seg === 'cal'} onClick={() => setSeg('cal')}>{_t("Расписание")}</button>
        <button type="button" role="tab" aria-selected={seg === 'notes'} onClick={() => setSeg('notes')}>{_t("Конспекты")}{p.st.data && p.st.data.notes.length > 0 && <em>{p.st.data.notes.length}</em>}</button>
      </div>
      {seg === 'cal' ? <div className="sy-cal">{calendar}</div> : <NotesView {...p} />}
    </>
  );
}

function NotesView(p: StudyProps) {
  const { st, me, names } = p;
  const d = st.data;
  const [edit, setEdit] = useState<Partial<StNote> | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [cards, setCards] = useState(false);
  if (!d) return <p className="tiny bw-load">{_t("Загружаю…")}</p>;
  const teacher = d.me.teacher;
  const hasT = d.state.teachers.length > 0;
  const allCards = d.notes.flatMap((n) => n.cards);
  return (
    <div className="bw-pane sy-pane">
      {allCards.length > 0 && <button type="button" className="sy-focus-btn" onClick={() => setCards(true)}><span><b>{_t("🃏 Повторять карточки")}</b><small>{_tj("{0} карточек из конспектов · 2 минуты в день", allCards.length)}</small></span></button>}
      {d.notes.length ? d.notes.map((n) => (
        <div key={n.id} className="bw-card sy-nt">
          <div className="bw-dech"><b>{n.title}</b><small className="bw-sm">{dm(n.day)}</small></div>
          {n.points.length > 0 ? (
            <div className="sy-ai"><b>{_t("Главные мысли")}</b><ol>{n.points.map((x, i) => <li key={i}>{x}</li>)}</ol>
              <small>{n.checked ? _t("Проверено устазом ✓") : hasT ? _t("Устаз ещё не проверил") : _t("Конспект от помощника. Устаза в круге нет: сверяй с учителем")}</small></div>
          ) : n.has_ai && <p className="bw-sm">{_t("Главные мысли появятся, когда устаз проверит конспект.")}</p>}
          {n.cards.length > 0 && <div className="sy-fc">{n.cards.map((c, i) => <span key={i}><b>{c.a}</b>{c.t}</span>)}</div>}
          {n.body && (open === n.id ? <p className="sy-body sy-full">{n.body}</p> : <button type="button" className="link-btn" onClick={() => setOpen(n.id)}>{_t("📄 Полный текст")}</button>)}
          <div className="sy-qa">
            {teacher && !n.checked && n.points.length > 0 && <button type="button" className="pri-btn sy-sm" onClick={() => st.setNote(n.id, { checked: true })}>{_t("✓ Проверено")}</button>}
            {(n.by === me || teacher || !hasT) && <button type="button" className="link-btn" onClick={() => setEdit(n)}>{_t("✏️ Изменить")}</button>}
            <small className="bw-sm">{first(names, me, n.by)}</small>
          </div>
        </div>
      )) : <div className="bw-card"><p className="bw-none">{_t("После урока сохрани конспект: текст или расшифровку голосовых. Помощник выделит 3 главные мысли и сделает карточки для повторения.")}</p></div>}
      <button type="button" className="bw-fab sy-fab" onClick={() => setEdit({ title: '', body: '', day: p.today, points: [], cards: [] })}>{_t("＋ Конспект")}</button>
      {edit && <NoteSheet {...p} n={edit} onClose={() => setEdit(null)} />}
      {cards && <CardsView cards={allCards} onClose={() => setCards(false)} />}
    </div>
  );
}

function NoteSheet({ st, chat, me, today, post, n, onClose }: StudyProps & { n: Partial<StNote>; onClose: () => void }) {
  const d = st.data!;
  const [x, setX] = useState<Partial<StNote>>({ ...n, points: n.points ?? [], cards: n.cards ?? [] });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const day = x.day || today;
  const voices = useMemo(() => chat.msgs.filter((m: Msg) => m.kind === 'voice' && !m.deleted && keyOf(new Date(m.at)) === day), [chat.msgs, day]);
  const withText = voices.filter((m) => m.body && m.body !== '…');
  const takeVoices = async () => {
    setBusy('tr'); setErr('');
    const parts: string[] = [];
    for (const m of voices) {
      let t = m.body && m.body !== '…' ? m.body : '';
      if (!t) { const r = await chat.transcribe(m.id); t = r.text && r.text !== '…' ? r.text : ''; if (r.err === 'nokey' || r.err === 'nosql') { setErr(_t("Расшифровка голосовых ещё не подключена. Вставь текст урока сам.")); break; } }
      if (t) parts.push(t);
    }
    setBusy('');
    if (parts.length) setX((v) => ({ ...v, body: [v.body, ...parts].filter(Boolean).join('\n\n').slice(0, 20000) }));
  };
  const makeAi = async () => {
    setBusy('ai'); setErr('');
    const id = cloudMe();
    const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'study', uid: id?.uid, token: id?.token, code: st.code, title: x.title, text: (x.body ?? '').slice(0, 15000) }) })
      .then((res) => res.json()).catch(() => null) as { points?: string[]; cards?: { a: string; t: string }[]; error?: string } | null;
    setBusy('');
    if (r?.points?.length) setX((v) => ({ ...v, points: r.points!.slice(0, 3), cards: (r.cards ?? []).slice(0, 8) }));
    else setErr(r?.error === 'nokey' ? _t("Помощник сейчас недоступен.") : _t("Не получилось. Попробуй ещё раз через минуту."));
  };
  const save = async () => {
    setBusy('save');
    const p = { title: (x.title ?? '').trim(), day, body: x.body ?? '', points: (x.points ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 5), cards: (x.cards ?? []).filter((c) => c.a.trim() && c.t.trim()).slice(0, 12) };
    const id = await st.setNote(x.id ?? 0, p);
    setBusy('');
    if (id) { if (!x.id) post(_tj("📄 Конспект урока: «{0}»", p.title)); onClose(); } else setErr(_t("Не сохранилось. Попробуй ещё раз."));
  };
  void me; void d;
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet bw-sheet sy-sheet" role="dialog" aria-label={_t("Конспект")}>
        <b>{x.id ? _t("📄 Конспект") : _t("📄 Новый конспект")}</b>
        <input maxLength={120} value={x.title ?? ''} onChange={(e) => setX({ ...x, title: e.target.value })} placeholder={_t("Например: Урок 6 · Нун с сукуном")} />
        <input type="date" value={day} onChange={(e) => setX({ ...x, day: e.target.value || today })} aria-label={_t("Дата урока")} />
        <textarea rows={6} maxLength={20000} value={x.body ?? ''} onChange={(e) => setX({ ...x, body: e.target.value })} placeholder={_t("Текст урока: запиши главное или вставь расшифровку")} />
        {voices.length > 0 && <button type="button" className="ghost-btn sy-wide" disabled={!!busy} onClick={takeVoices}>{busy === 'tr' ? _t("Расшифровываю…") : _tj("🎙 Взять текст голосовых за этот день · {0}{1}", voices.length, withText.length ? _tj(" ({0} уже в тексте)", withText.length) : '')}</button>}
        <button type="button" className="ghost-btn sy-wide" disabled={!!busy || (x.body ?? '').trim().length < 80} onClick={makeAi}>{busy === 'ai' ? _t("Помощник читает…") : _t("✨ 3 главные мысли и карточки")}</button>
        {(x.points ?? []).length > 0 && (
          <>
            <span className="bw-sl">{_t("Главные мысли")}</span>
            {(x.points ?? []).map((s, i) => <textarea key={i} rows={2} maxLength={300} value={s} onChange={(e) => setX({ ...x, points: x.points!.map((y, j) => (j === i ? e.target.value : y)) })} />)}
          </>
        )}
        {(x.cards ?? []).length > 0 && (
          <>
            <span className="bw-sl">{_t("Карточки: слово или вопрос · ответ")}</span>
            {(x.cards ?? []).map((c, i) => (
              <div key={i} className="sy-qeo">
                <input maxLength={80} value={c.a} onChange={(e) => setX({ ...x, cards: x.cards!.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) })} />
                <input maxLength={80} value={c.t} onChange={(e) => setX({ ...x, cards: x.cards!.map((y, j) => (j === i ? { ...y, t: e.target.value } : y)) })} />
                <button type="button" className="link-btn" onClick={() => setX({ ...x, cards: x.cards!.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
          </>
        )}
        <p className="bw-from">{d.state.teachers.length ? _t("Мысли и карточки круг увидит после галочки устаза «проверено».") : _t("Конспект от помощника может ошибаться. Сверяй с учителем.")}</p>
        {err && <p className="bw-sm sy-err">{err}</p>}
        <div className="bw-row">
          {x.id ? <button type="button" className="link-btn danger-t" onClick={async () => { if (confirm(_t("Удалить конспект?"))) { await st.setNote(x.id!, null); onClose(); } }}>{_t("Удалить")}</button> : <button type="button" className="link-btn" onClick={onClose}>{_t("Отмена")}</button>}
          <button type="button" className="pri-btn" disabled={!(x.title ?? '').trim() || !!busy} onClick={save}>{_t("Сохранить")}</button>
        </div>
      </div>
    </>
  );
}

function CardsView({ cards, onClose }: { cards: { a: string; t: string }[]; onClose: () => void }) {
  const deck = useMemo(() => [...cards].sort(() => Math.random() - 0.5), [cards]);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = deck[i % deck.length];
  return (
    <div className="sy-focus sy-cards" role="dialog" aria-label={_t("Карточки")}>
      <button type="button" className="sy-x" aria-label={_t("Закрыть")} onClick={onClose}>✕</button>
      <small className="sy-fk">{_tj("Карточка {0} из {1}", (i % deck.length) + 1, deck.length)}</small>
      <button type="button" className={`sy-card${flip ? ' back' : ''}`} onClick={() => setFlip(!flip)}>
        {flip ? <span>{c.t}</span> : <b>{c.a}</b>}
        <small>{flip ? _t("ответ") : _t("нажми, чтобы увидеть ответ")}</small>
      </button>
      <div className="bw-row">
        <button type="button" className="ghost-btn" onClick={() => { setFlip(false); setI(i + 1); }}>{_t("🔁 Ещё раз позже")}</button>
        <button type="button" className="pri-btn" onClick={() => { setFlip(false); setI(i + 1); }}>{_t("✓ Знаю")}</button>
      </div>
    </div>
  );
}
