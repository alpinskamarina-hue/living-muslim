import { useState } from 'react';
import type { Member, Reacts } from '../circle';
import { plural, addDays } from '../dates';
import { weekStart, isFriday, rangeLabel } from '../cweek';
import { daysBetween } from '../dates';
import { ANCHOR_LABEL, type AppState } from '../types';
import { activeLimit, slotsUsed } from '../store';
import { BIZ_HABITS, BIZ_DEFAULT, addBizHabits, adviceFor, shuraTotals, type Advice, type Shura } from '../biz';

const AFTER: Record<string, string> = { fajr: 'После Фаджра', dhuhr: 'После Зухра', asr: 'После Асра', maghrib: 'После Магриба', isha: 'После Иши' };

/** Checklist of business habits tied to the prayers. Used when creating or joining a business circle. */
export function BizPick({ pick, setPick }: { pick: number[]; setPick: (v: number[]) => void }) {
  return (
    <div className="bz-pick">
      <small className="bz-k">Деловые привычки для круга</small>
      <p>Каждый включает себе те, что подходят. В круге видна только галочка, без названий и сумм.</p>
      {BIZ_HABITS.map((h, i) => (
        <label key={h.action}>
          <input type="checkbox" checked={pick.includes(i)} onChange={(e) => setPick(e.target.checked ? [...pick, i].sort() : pick.filter((x) => x !== i))} />
          <span><b>{AFTER[h.anchor] ?? ANCHOR_LABEL[h.anchor]}</b> · {h.action.charAt(0).toLowerCase() + h.action.slice(1)}</span>
        </label>
      ))}
    </div>
  );
}

/** Inside a business circle: offer the business habits to whoever has none yet. */
export function BizHabitsOffer({ state, update, today }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string }) {
  const [pick, setPick] = useState<number[]>(BIZ_DEFAULT);
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('lm.bizoffer') === '1'; } catch { return false; } });
  const has = state.habits.some((h) => h.sphere === 'biz' && h.status !== 'archived');
  if (has || hide) return null;
  const used = slotsUsed(state);
  return (
    <div className="bz-card">
      <BizPick pick={pick} setPick={setPick} />
      {used + pick.length > activeLimit() && <p className="tiny">Активных привычек уже {used} из {activeLimit()}: лишние встанут в очередь и включатся, когда освободится место.</p>}
      <div className="da-row">
        <button type="button" className="pri-btn" disabled={!pick.length} onClick={() => update((s) => addBizHabits(s, pick, today, activeLimit(), slotsUsed(s)))}>Добавить себе</button>
        <button type="button" className="link-btn" onClick={() => { try { localStorage.setItem('lm.bizoffer', '1'); } catch { /* */ } setHide(true); }}>Не сейчас</button>
      </div>
    </div>
  );
}

/** Advice under a shura or a dua request: the list, and a short field to add mine. */
export function AdviceBox({ members, me, to, k, w, nameOf, mine, give }: {
  members: Member[]; me: string; to: string; k: 's' | 'a'; w: string; nameOf: (id: string) => string; mine: Advice[]; give: (a: Advice) => void;
}) {
  const list = adviceFor(members, to, k, w);
  const my = mine.find((a) => a.to === to && a.k === k && a.w === w);
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(my?.t ?? '');
  const shown = list.filter((x) => x.from !== me);
  return (
    <div className="bz-adv">
      {shown.map((x) => <p key={x.from}><b>{nameOf(x.from)}:</b> {x.t}</p>)}
      {my && !open && <p className="mine"><b>Ты:</b> {my.t}</p>}
      {to !== me && (open ? (
        <div className="bz-advf">
          <textarea value={t} maxLength={160} rows={2} autoFocus placeholder="Коротко: опыт, контакт, где посмотреть" onChange={(e) => setT(e.target.value)} />
          <div className="da-row">
            <button type="button" className="pri-btn" disabled={!t.trim()} onClick={() => { give({ to, k, w, t: t.trim(), at: new Date().toISOString() }); setOpen(false); }}>Отправить совет</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button type="button" className="bz-chip" onClick={() => setOpen(true)}>💬 {my ? 'Изменить совет' : 'Дать совет'}</button>
      ))}
    </div>
  );
}

const LINES: { k: 'ok' | 'stuck' | 'ask'; ic: string; label: string; ph: string }[] = [
  { k: 'ok', ic: '✅', label: 'Что получилось', ph: 'Например: запустил новую страницу заказов' },
  { k: 'stuck', ic: '🧱', label: 'Где застрял', ph: 'Например: не успеваю отвечать клиентам' },
  { k: 'ask', ic: '🙏', label: 'В чём нужен совет', ph: 'Например: брать помощника или автоматизировать?' },
];

/** «Шура недели»: on Thursday each one writes three lines; the brothers answer with advice, dua or МашаАллах. */
export function ShuraCard({ members, reacts, me, today, nameOf, shura, onShura, adv, give, react }: {
  members: Member[]; reacts: Reacts; me: string; today: string; nameOf: (id: string) => string;
  shura: Shura | null; onShura: (s: Shura | null) => void; adv: Advice[]; give: (a: Advice) => void; react: (key: string, e: string) => void;
}) {
  const w = weekStart(today);
  const mine = shura?.w === w ? shura : null;
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState({ ok: mine?.ok ?? '', stuck: mine?.stuck ?? '', ask: mine?.ask ?? '' });
  const dow = daysBetween(w, today); // 0 Sat … 6 Fri
  const thu = dow === 5;
  const others = members.filter((m) => m.id !== me && m.shura?.w === w && (m.shura.ok || m.shura.stuck || m.shura.ask));
  const tot = shuraTotals(members, reacts, w);
  const save = () => { onShura({ w, ok: d.ok.trim(), stuck: d.stuck.trim(), ask: d.ask.trim(), at: new Date().toISOString() }); setEdit(false); };

  const lines = (s: Shura) => LINES.filter((l) => s[l.k]).map((l) => <p key={l.k} className="bz-l"><i>{l.ic}</i><span>{s[l.k]}</span></p>);
  const myReact = (to: string) => { const r = reacts[me]?.[`s:${to}`]; return r && r.day >= w ? r.e : ''; };
  const gotOf = (to: string) => Object.entries(reacts).filter(([f, map]) => f !== to && (map?.[`s:${to}`]?.day ?? '') >= w);

  return (
    <div className="bz-shura">
      <div className="bz-sh-h">
        <b>🧭 Шура недели</b>
        <small>{rangeLabel(w)} · {thu ? 'сегодня четверг, время шуры' : dow < 5 ? `в четверг, через ${5 - dow} ${plural(5 - dow, 'день', 'дня', 'дней')}` : 'итог после Джумы'}</small>
      </div>
      <p className="bz-q">«И советуйся с ними о делах» (Коран, 3:159). Три строки, без цифр и сумм.</p>

      {edit ? (
        <div className="bz-mine">
          {LINES.map((l) => (
            <label key={l.k} className="bz-f"><span>{l.ic} {l.label}</span>
              <input value={d[l.k]} maxLength={120} placeholder={l.ph} onChange={(e) => setD({ ...d, [l.k]: e.target.value })} />
            </label>
          ))}
          <div className="da-row">
            <button type="button" className="pri-btn" disabled={!(d.ok.trim() || d.stuck.trim() || d.ask.trim())} onClick={save}>Поделиться с кругом</button>
            <button type="button" className="link-btn" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        </div>
      ) : mine ? (
        <div className="bz-mine">
          <small className="bz-k">Моя неделя</small>
          {lines(mine)}
          <AdviceBox members={members} me={me} to={me} k="s" w={w} nameOf={nameOf} mine={adv} give={give} />
          {gotOf(me).length > 0 && <small className="tiny">{gotOf(me).map(([f, map]) => `${map![`s:${me}`]!.e} ${nameOf(f)}`).join(' · ')}</small>}
          <div className="da-row">
            <button type="button" className="link-btn" onClick={() => { setD({ ok: mine.ok, stuck: mine.stuck, ask: mine.ask }); setEdit(true); }}>Изменить</button>
            <button type="button" className="link-btn cg-del" onClick={() => onShura(null)}>Убрать</button>
          </div>
        </div>
      ) : (
        <button type="button" className={`da-ask bz-write${thu ? ' now' : ''}`} onClick={() => setEdit(true)}>
          ✍️ Написать свои три строки
          <small>Что получилось, где застрял, в чём нужен совет</small>
        </button>
      )}

      {others.map((m) => {
        const r = myReact(m.id);
        return (
          <div key={m.id} className="bz-other">
            <b className="bz-who">{nameOf(m.id)}</b>
            {lines(m.shura!)}
            <AdviceBox members={members} me={me} to={m.id} k="s" w={w} nameOf={nameOf} mine={adv} give={give} />
            <div className="bz-acts">
              <button type="button" aria-pressed={r === '🤲'} onClick={() => react(`s:${m.id}`, '🤲')}>🤲 Дуа{r === '🤲' ? ' ✓' : ''}</button>
              <button type="button" aria-pressed={r === '✨'} onClick={() => react(`s:${m.id}`, '✨')}>✨ МашаАллах{r === '✨' ? ' ✓' : ''}</button>
            </div>
          </div>
        );
      })}
      {!others.length && members.length > 1 && <small className="tiny">{mine ? 'Братья ещё не написали. Их строки появятся здесь.' : 'Братья ещё не написали. Начни первым, это помогает.'}</small>}
      {isFriday(today) && tot.shared > 0 && (
        <p className="bz-sum">Итог шуры: поделились {tot.shared} из {members.length}, {tot.advice} {plural(tot.advice, 'совет', 'совета', 'советов')}, {tot.duas} дуа{tot.mash ? `, ${tot.mash} МашаАллах` : ''}.</p>
      )}
    </div>
  );
}

/** A line for the hero card of a business circle: how many marked a business habit today. */
export function bizLine(members: Member[], today: string) {
  const on = members.filter((m) => m.day === today && (m.biz?.d ?? 0) > 0).length;
  const withBiz = members.filter((m) => (m.biz?.t ?? 0) > 0).length;
  return withBiz ? `💼 Деловые привычки сегодня: ${on} из ${withBiz}` : '';
}

export const isThursdayShura = (today: string) => daysBetween(weekStart(today), today) === 5;
export const shuraWeek = (today: string) => weekStart(today);
export const shuraFresh = (s: Shura | null, today: string) => Boolean(s && s.w === weekStart(today) && s.w <= today && addDays(s.w, 7) > today);
