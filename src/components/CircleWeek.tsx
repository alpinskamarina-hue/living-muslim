import { shareCard } from '../share';
import { useState, type ReactNode } from 'react';
import type { Member, Reacts } from '../circle';
import { plural } from '../dates';
import {
  GOAL_KINDS, valOf, askLive, askAnswers, circleStreak, ASK_DAYS, type DuaAsk, CH_KINDS, CH_DAYS, chHit, amirOf, type Challenge, type ChKind, type Amir, weekStart, weekEnd, addWeeks, isFriday, goalFor, circleTotals, supporters, rangeLabel,
  type CGoal, type GoalKind, goalKindsFor,
} from '../cweek';
import { isBizCircle, shuraTotals } from '../biz';
import { daysBetween, addDays } from '../dates';
import { _t, _tj } from '../i18n';

const dShort = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day}.${String(m).padStart(2, '0')}`; };

interface Props {
  members: Member[];
  reacts: Reacts;
  me: string | null;
  today: string;
  title: string;
  nameOf: (id: string) => string;
  onSet: (g: CGoal) => void;
}

const unit = (k: GoalKind, n: number) => plural(n, ...GOAL_KINDS[k].unit);

/** «Цель недели»: one shared target for the whole circle, Saturday to Friday. Anyone can set or change it. */
export function CircleGoal({ members, me, today, nameOf, onSet }: Props) {
  const w = weekStart(today);
  const goal = goalFor(members, w);
  const [edit, setEdit] = useState(false);
  const people = Math.max(1, members.length);
  const biz = isBizCircle();
  const first: GoalKind = biz ? 'biz' : 'fajr';
  const kinds = goalKindsFor(biz);
  const [k, setK] = useState<GoalKind>(goal?.k as GoalKind ?? first);
  const suggest = (x: GoalKind) => Math.max(GOAL_KINDS[x].step, Math.round((GOAL_KINDS[x].per * people) / GOAL_KINDS[x].step) * GOAL_KINDS[x].step);
  const [n, setN] = useState(goal?.n ?? suggest(first));
  const left = daysBetween(today, weekEnd(w));

  const save = () => { onSet({ w, k, n, at: new Date().toISOString() }); setEdit(false); };
  const clear = () => { onSet({ w, k: 'none', n: 0, at: new Date().toISOString() }); setEdit(false); };

  if (edit || !goal) {
    if (!edit) {
      return (
        <button type="button" className="cg-empty" onClick={() => { setK(first); setN(suggest(first)); setEdit(true); }}>
          <span aria-hidden="true">🎯</span>
          <span><b>{_t("Поставьте цель круга на неделю")}</b><small>{_tj("Например, {0}  {1} на всех{2}. Общая шкала, без рейтинга.", suggest(first), unit(first, suggest(first)), biz ? _t(", а намазы вовремя считаются рядом") : '')}</small></span>
          <i aria-hidden="true">›</i>
        </button>
      );
    }
    return (
      <div className="cg-card cg-edit">
        <b className="cg-h">{_t("🎯 Цель круга до пятницы")}</b>
        <div className="cg-kinds">
          {kinds.map((x) => (
            <button key={x} type="button" aria-pressed={k === x} onClick={() => { setK(x); setN(suggest(x)); }}>{GOAL_KINDS[x].ic} {GOAL_KINDS[x].label}</button>
          ))}
        </div>
        <div className="cg-num">
          <button type="button" aria-label={_t("Меньше")} onClick={() => setN((v) => Math.max(GOAL_KINDS[k].step, v - GOAL_KINDS[k].step))}>−</button>
          <span><b>{n}</b><small>{unit(k, n)}</small></span>
          <button type="button" aria-label={_t("Больше")} onClick={() => setN((v) => v + GOAL_KINDS[k].step)}>+</button>
        </div>
        <p className="tiny">{_tj("На {0}  {1} это примерно {2} на каждого за неделю. Считается всё, что отмечено с субботы.{3}", people, plural(people, _t("человека"), _t("человек"), _t("человек")), Math.round((n / people) * 10) / 10, k === 'biz' ? _t(" Деловая отметка: любая привычка из раздела «Бизнес». Без сумм и цифр выручки.") : '')}</p>
        <div className="cg-row">
          <button type="button" className="pri-btn" onClick={save}>{goal ? _t("Сохранить") : _t("Поставить цель")}</button>
          <button type="button" className="link-btn" onClick={() => setEdit(false)}>{_t("Отмена")}</button>
          {goal && <button type="button" className="link-btn cg-del" onClick={clear}>{_t("Убрать цель")}</button>}
        </div>
      </div>
    );
  }

  const gk = goal.k as GoalKind;
  if (!GOAL_KINDS[gk]) return null;
  const have = circleTotals(members, w);
  const v = valOf(have, gk);
  const pct = Math.min(100, Math.round((v / goal.n) * 100));
  const done = v >= goal.n;
  return (
    <div className={`cg-card${done ? ' done' : ''}`}>
      <div className="cg-top">
        <span className="cg-ic" aria-hidden="true">{GOAL_KINDS[gk].ic}</span>
        <span>
          <small>{_tj("Цель недели · поставил{0}", goal.by === me ? _t(" ты") : _t("(а) {0}", nameOf(goal.by)))}</small>
          <b>{goal.n} {unit(gk, goal.n)}</b>
        </span>
        <button type="button" className="link-btn" onClick={() => { setK(gk); setN(goal.n); setEdit(true); }}>{_t("Изменить")}</button>
      </div>
      <span className="cg-bar"><i style={{ width: `${pct}%` }} /></span>
      <p className="cg-sub">
        {done ? <>{_tj("✓ Цель достигнута, машаАллах! Уже {0}. Можно поднять планку.", v)}</>
          : <><b>{v}</b>{_tj(" из {0} · осталось {1} · {2}", goal.n, goal.n - v, left === 0 ? _t("сегодня последний день") : _t("ещё {0} {1} до пятницы", left, plural(left, _t("день"), _t("дня"), _t("дней"))))}</>}
      </p>
      {gk === 'biz' && have.p > 0 && <p className="cg-sub">{_tj("И вместе с этим: намазы вовремя {0}%. Дело не вместо намаза, а вокруг него.", Math.round((have.o / have.p) * 100))}</p>}
    </div>
  );
}

/** Friday summary: shown on Friday for this week, and on Saturday–Sunday for the week that just ended. */
export function WeekSummary({ members, reacts, today, title, nameOf }: Props) {
  const cur = weekStart(today);
  const dow = daysBetween(cur, today); // 0 Sat … 6 Fri
  const w = isFriday(today) ? cur : dow <= 1 ? addWeeks(cur, -1) : '';
  const [sent, setSent] = useState(false);
  const [pic, setPic] = useState('');
  if (!w || members.length < 2) return null;
  const t = circleTotals(members, w);
  if (t.p + t.h === 0) return null;
  const goal = goalFor(members, w);
  const gv = goal ? valOf(t, goal.k as GoalKind) : 0;
  const pctOn = t.p ? Math.round((t.o / t.p) * 100) : 0;
  const sup = supporters(reacts, w).slice(0, 3);
  const live = w === cur;
  const biz = isBizCircle();
  const sh = biz ? shuraTotals(members, reacts, w) : null;
  const shLine = sh && sh.shared ? _t("🧭 Шура: поделились {0} из {1}, {2} {3}, {4} дуа", sh.shared, members.length, sh.advice, plural(sh.advice, _t("совет"), _t("совета"), _t("советов")), sh.duas) : '';

  const text = [
    _t("🤝 Наш круг «{0}» {1} ({2}):", title, live ? _t("на этой неделе") : _t("за неделю"), rangeLabel(w)),
    _t("🕌 {0} {1}, из них {2}% вовремя", t.p, plural(t.p, _t("намаз"), _t("намаза"), _t("намазов")), pctOn),
    t.f ? _t("🌅 {0} {1} вовремя", t.f, plural(t.f, _t("Фаджр"), _t("Фаджра"), _t("Фаджров"))) : '',
    t.h ? _t("🌱 {0} {1} привычек", t.h, plural(t.h, _t("отметка"), _t("отметки"), _t("отметок"))) : '',
    biz && t.b ? _t("💼 {0} {1} у намазов", t.b, plural(t.b, _t("деловая отметка"), _t("деловые отметки"), _t("деловых отметок"))) : '',
    shLine,
    goal ? _t("🎯 Цель «{0} {1}»: {2}", goal.n, unit(goal.k as GoalKind, goal.n), gv >= goal.n ? _t("выполнена ✓") : _t("{0} из {1}", gv, goal.n)) : '',
    sup.length ? _t("🤲 Больше всех поддерживали: {0}", sup.map((x) => nameOf(x.id)).join(', ')) : '',
    '',
    _t("Держимся вместе в Living Muslim: https://living-muslim.vercel.app"),
  ].filter((x, i, a) => x !== '' || i === a.length - 2).join('\n');

  // The picture carries only the circle's totals: no names, so it can travel further than the circle.
  const sharePic = async () => {
    setPic(_t("Готовлю…"));
    const r = await shareCard({
      kicker: _t("Наш круг · {0}", rangeLabel(w)), title: `«${title}»`,
      stats: [[String(t.p), plural(t.p, _t("намаз"), _t("намаза"), _t("намазов"))], [`${pctOn}%`, _t("вовремя")], [String(t.f), _t("Фаджр вовремя")], [String(t.h), _t("отметок привычек")]],
      note: goal ? (gv >= goal.n ? _t("🎯 Цель недели выполнена, машаАллах") : _t("🎯 Цель недели: {0} из {1}", gv, goal.n)) : _t("В деле {0} из {1}", t.people, members.length),
      foot: _t("Держимся вместе. Общий итог, без рейтинга по поклонению"),
    }, 'nash-krug', text);
    setPic(r === 'saved' ? _t("✓ Сохранено, текст скопирован") : r === 'shared' ? _t("✓ Отправлено") : '');
  };
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ text }); setSent(true); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
  };

  return (
    <div className="ws-card">
      <small className="ws-k">{_tj("Итог недели · {0}{1}", rangeLabel(w), live ? _t(" · до вечера ещё можно добавить") : '')}</small>
      <div className="ws-grid">
        <div><b>{t.p}</b><small>{plural(t.p, _t("намаз"), _t("намаза"), _t("намазов"))}</small></div>
        <div><b>{pctOn}%</b><small>{_t("вовремя")}</small></div>
        <div><b>{t.f}</b><small>{_t("Фаджр вовремя")}</small></div>
        <div><b>{t.h}</b><small>{_t("привычек")}</small></div>
      </div>
      {goal && <p className="ws-line">🎯 {gv >= goal.n ? <>{_tj("Цель «{0}  {1}» ", goal.n, unit(goal.k as GoalKind, goal.n))}<b>{_t("выполнена")}</b>{_t(", машаАллах")}</> : <>{_tj("Цель: {0} из {1}  {2}", gv, goal.n, unit(goal.k as GoalKind, goal.n))}</>}</p>}
      {biz && (t.b ?? 0) > 0 && <p className="ws-line">{_t("💼 Деловых отметок у намазов: ")}<b>{t.b}</b></p>}
      {shLine && <p className="ws-line">{shLine}</p>}
      {sup.length > 0 && <p className="ws-line">{_t("🤲 Больше всех поддерживали: ")}<b>{sup.map((x) => nameOf(x.id)).join(', ')}</b></p>}
      <p className="ws-line ws-soft">{_tj("В деле было {0} из {1}. Общий итог, без рейтинга по поклонению.", t.people, members.length)}</p>
      <div className="ws-btns">
        <button type="button" className="pri-btn ws-share" onClick={share}>{sent ? _t("✓ Отправлено") : _t("Отправить итог текстом")}</button>
        <button type="button" className="ws-pic" onClick={sharePic}>{pic || _t("🖼 Картинкой")}</button>
      </div>
    </div>
  );
}

/** Dua requests: mine (with who answered) and the circle's, each live for 3 days. */
export function DuaAsks({ members, reacts, me, today, nameOf, myAsk, onAsk, react, biz, extra }: {
  members: Member[]; reacts: Reacts; me: string; today: string; nameOf: (id: string) => string;
  myAsk: DuaAsk | null; onAsk: (a: DuaAsk | null) => void; react: (key: string) => void;
  /** Business circle: dua for a deal, and advice under each request. */
  biz?: boolean; extra?: (asker: string, a: DuaAsk) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const others = members.filter((m) => m.id !== me && askLive(m.ask, today));
  const send = () => { const t = text.trim().slice(0, 90); if (!t) return; onAsk({ t, d: today }); setText(''); setOpen(false); };
  const got = myAsk ? askAnswers(reacts, me, myAsk) : [];

  return (
    <div className="da-wrap">
      {others.map((m) => {
        const a = m.ask!;
        const done = (reacts[me]?.[`a:${m.id}`]?.day ?? '') >= a.d;
        const n = askAnswers(reacts, m.id, a).length;
        return (
          <div key={m.id} className="da-card">
            <p>🤲 <b>{nameOf(m.id)}</b>{_tj(" просит дуа{0}{1}", biz ? _t(" за дело") : '', a.d === today ? '' : ` · ${daysBetween(a.d, today) === 1 ? _t("вчера") : _t("2 дня назад")}`)}</p>
            <q>{a.t}</q>
            <div className="da-row">
              <button type="button" className={done ? 'on' : ''} onClick={() => react(`a:${m.id}`)}>{done ? _t("✓ Ты сделал дуа") : _t("🤲 Сделал дуа")}</button>
              {n > 0 && <small>{n} {plural(n, _t("человек уже сделал"), _t("человека уже сделали"), _t("человек уже сделали"))}</small>}
            </div>
            {extra?.(m.id, a)}
          </div>
        );
      })}

      {myAsk ? (
        <div className="da-card mine">
          <p>{_t("Твоя просьба о дуа ")}<small>{_tj("видна кругу {0}", [_t("до конца дня"), _t("до завтра"), _t("до послезавтра")][Math.min(2, daysBetween(today, addDays(myAsk.d, ASK_DAYS - 1)))])}</small></p>
          <q>{myAsk.t}</q>
          {extra?.(me, myAsk)}
          <p className="da-got">{got.length ? <>{_t("🤲 Дуа за тебя: ")}<b>{got.map(nameOf).join(', ')}</b>{_t(". Аамин.")}</> : _t("Пока никто не ответил. Круг увидит просьбу на «Сегодня».")}</p>
          <button type="button" className="link-btn" onClick={() => onAsk(null)}>{_t("Снять просьбу")}</button>
        </div>
      ) : open ? (
        <div className="da-card mine">
          <p><b>{biz ? _t("Дуа за какое дело?") : _t("О чём попросить дуа?")}</b></p>
          <textarea value={text} maxLength={90} rows={2} autoFocus placeholder={biz ? _t("Например: завтра подписываем договор с поставщиком") : _t("Например: экзамен в четверг, здоровье мамы, работа")} onChange={(e) => setText(e.target.value)} />
          <small className="tiny">{_tj("Коротко, без лишних подробностей{0}. Увидят только люди этого круга, 3 дня.", biz ? _t(" и без сумм") : '')}</small>
          <div className="da-row">
            <button type="button" className="pri-btn" disabled={!text.trim()} onClick={send}>{biz ? _t("Попросить дуа за дело") : _t("Попросить дуа")}</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>{_t("Отмена")}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="da-ask" onClick={() => setOpen(true)}>{biz ? _t("🤲 Попросить дуа за сделку или дело") : _t("🤲 Попросить круг о дуа")}</button>
      )}
    </div>
  );
}

/** «🔥 Серия круга»: a line for the hero card. */
export function StreakLine({ members, today }: { members: Member[]; today: string }) {
  if (members.length < 2) return null;
  const s = circleStreak(members, today);
  if (s.n < 1 && s.got === 0) return null;
  return (
    <p className="cs-line">
      <span aria-hidden="true">🔥</span>
      {s.n >= 1 ? <><b>{_tj("Серия круга: {0}  {1}", s.n, plural(s.n, _t("день"), _t("дня"), _t("дней")))}</b>{_t(" подряд")}</> : <b>{_t("Начните серию круга сегодня")}</b>}
      <small>{s.todayOk ? _t(" · сегодня засчитано") : _t(" · сегодня {0} из {1} нужных, чтобы день засчитался", s.got, s.need)}</small>
    </p>
  );
}

/** «Вызов брату»: two people, one practice, 7 days. Accepted challenges are visible to the whole circle. */
export function Challenges({ members, me, today, nameOf, ch }: {
  members: Member[]; me: string; today: string; nameOf: (id: string) => string;
  ch: { chs: Challenge[]; acc: string[]; add: (c: Challenge) => void; remove: (id: string) => void; accept: (id: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [k, setK] = useState<ChKind>('fajr');
  const [hidden, setHidden] = useState<string[]>([]);
  const byId = (id: string) => members.find((m) => m.id === id);
  const others = members.filter((m) => m.id !== me);
  const all: (Challenge & { from: string; ok: boolean })[] = [];
  for (const m of members) for (const c of m.chs ?? []) {
    if (addDays(c.start, CH_DAYS + 1) < today || hidden.includes(c.id)) continue;
    const ok = c.to === me ? ch.acc.includes(c.id) : Boolean(byId(c.to)?.acc?.includes(c.id));
    if (!ok && addDays(c.start, 2) < today) continue; // not answered in 2 days
    all.push({ ...c, from: m.id, ok });
  }
  const busy = (id: string) => all.some((c) => (c.from === me && c.to === id) || (c.to === me && c.from === id));
  const send = () => {
    if (!to) return;
    ch.add({ id: Math.random().toString(36).slice(2, 10), to, k, start: today, at: new Date().toISOString() });
    setOpen(false); setTo('');
  };

  return (
    <div className="chl">
      {all.map((c) => {
        const mineIn = c.from === me || c.to === me;
        if (!c.ok && !mineIn) return null;
        const K = CH_KINDS[c.k];
        if (!c.ok) {
          return c.to === me ? (
            <div key={c.id} className="chl-card inv">
              <p>⚔️ <b>{nameOf(c.from)}</b>{_t(" бросает тебе вызов")}</p>
              <b className="chl-t">{K.ic} {K.label}</b>
              <small>{_tj("«Соревнуйтесь в благих делах» (Коран, 2:148). Считается с {0} по {1}.", dShort(c.start), dShort(addDays(c.start, CH_DAYS - 1)))}</small>
              <div className="da-row">
                <button type="button" className="pri-btn" onClick={() => ch.accept(c.id)}>{_t("Принять вызов")}</button>
                <button type="button" className="link-btn" onClick={() => setHidden((h) => [...h, c.id])}>{_t("Не сейчас")}</button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="chl-card">
              <p>{_t("⚔️ Ты бросил вызов ")}<b>{nameOf(c.to)}</b>: {K.label}</p>
              <small>{_t("Ждём, когда примет. ")}<button type="button" className="link-btn" onClick={() => ch.remove(c.id)}>{_t("Отменить")}</button></small>
            </div>
          );
        }
        const days = Array.from({ length: CH_DAYS }, (_, i) => addDays(c.start, i));
        const row = (id: string) => {
          const m = byId(id);
          const hit = days.filter((d) => chHit(m, c.k, d)).length;
          return (
            <div className="chl-row" key={id}>
              <span>{id === me ? _t("Ты") : nameOf(id)}</span>
              <span className="chl-dots">{days.map((d) => <i key={d} className={chHit(m, c.k, d) ? 'on' : d < today ? 'miss' : d === today ? 'now' : ''} />)}</span>
              <b>{hit}/{CH_DAYS}</b>
            </div>
          );
        };
        const end = addDays(c.start, CH_DAYS - 1);
        const both = [c.from, c.to].every((id) => days.every((d) => chHit(byId(id), c.k, d)));
        return (
          <div key={c.id} className="chl-card">
            <p>⚔️ <b>{nameOf(c.from)}</b>{_t(" и ")}<b>{nameOf(c.to)}</b> · {K.ic} {K.short}</p>
            {row(c.from)}{row(c.to)}
            <small>{today > end ? (both ? _t("Оба прошли все 7 дней, машаАллах!") : _t("Вызов закончился. Каждый день, что был, засчитан у Аллаха, ин ша Аллах.")) : _t("День {0} из {1}", Math.min(CH_DAYS, daysBetween(c.start, today) + 1), CH_DAYS)}</small>
          </div>
        );
      })}

      {open ? (
        <div className="chl-card">
          <p><b>{_t("Бросить вызов")}</b> <small>{_t("7 дней, с сегодняшнего")}</small></p>
          <div className="cg-kinds">
            {others.map((m) => <button key={m.id} type="button" disabled={busy(m.id)} aria-pressed={to === m.id} onClick={() => setTo(m.id)}>{nameOf(m.id)}{busy(m.id) ? ' ✓' : ''}</button>)}
          </div>
          <div className="cg-kinds chl-k">
            {(Object.keys(CH_KINDS) as ChKind[]).map((x) => <button key={x} type="button" aria-pressed={k === x} onClick={() => setK(x)}>{CH_KINDS[x].ic} {CH_KINDS[x].label}</button>)}
          </div>
          <div className="da-row">
            <button type="button" className="pri-btn" disabled={!to} onClick={send}>{_t("Бросить вызов")}</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>{_t("Отмена")}</button>
          </div>
        </div>
      ) : others.some((m) => !busy(m.id)) && (
        <button type="button" className="da-ask" onClick={() => setOpen(true)}>{_t("⚔️ Бросить вызов: 7 дней вместе")}</button>
      )}
    </div>
  );
}

/** «Амир недели»: one volunteer who reminds and supports the circle this week, with a short word for everyone. */
export function AmirCard({ members, me, today, nameOf, amir, onAmir }: {
  members: Member[]; me: string; today: string; nameOf: (id: string) => string; amir: Amir | null; onAmir: (a: Amir | null) => void;
}) {
  const w = weekStart(today);
  const cur = amirOf(members, w);
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(amir?.w === w ? amir.note : '');
  const iAm = cur?.id === me;
  if (!cur) {
    return (
      <button type="button" className="da-ask am-ask" onClick={() => { onAmir({ w, at: new Date().toISOString(), note: '' }); setEdit(true); }}>
        {_t("🧭 Стать амиром круга на эту неделю")}
        <small>{_t("Напоминаешь, поддерживаешь, пишешь короткое слово на неделю")}</small>
      </button>
    );
  }
  return (
    <div className="am-card">
      <p>{_t("🧭 Амир недели: ")}<b>{iAm ? _t("ты") : nameOf(cur.id)}</b> <small>{_t("до пятницы")}</small></p>
      {iAm && edit ? (
        <>
          <textarea value={note} maxLength={160} rows={2} autoFocus placeholder={_t("Слово на неделю: напоминание, хадис, цель. Например: братья, в эту неделю держимся за Фаджр")} onChange={(e) => setNote(e.target.value)} />
          <div className="da-row">
            <button type="button" className="pri-btn" onClick={() => { onAmir({ ...(amir?.w === w ? amir : { w, at: cur.a.at }), note: note.trim() }); setEdit(false); }}>{_t("Сохранить")}</button>
            <button type="button" className="link-btn" onClick={() => setEdit(false)}>{_t("Отмена")}</button>
          </div>
        </>
      ) : (
        <>
          {cur.a.note ? <q>{cur.a.note}</q> : <small className="tiny">{iAm ? _t("Напиши кругу слово на неделю.") : _t("Слова на неделю пока нет.")}</small>}
          {iAm && (
            <div className="da-row">
              <button type="button" className="link-btn" onClick={() => setEdit(true)}>{cur.a.note ? _t("Изменить слово") : _t("Написать слово")}</button>
              <button type="button" className="link-btn cg-del" onClick={() => onAmir(null)}>{_t("Сложить роль")}</button>
            </div>
          )}
        </>
      )}
      {!iAm && amir?.w === w && <small className="tiny">{_t("Ты тоже вызвался, но амиром стал тот, кто успел раньше.")}</small>}
    </div>
  );
}
