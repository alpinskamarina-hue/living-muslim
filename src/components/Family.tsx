import { useState } from 'react';
import type { Anchor, AppState, Kid } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import type { CircleApi, KidSummary } from '../circle';
import { famOf, familyDays, newKid, participants, patchF, STICKERS, tasksFor, toggleKidTask, toggleTogether } from '../family';
import { plural } from '../dates';
import { uid } from '../store';
import { BRANCHES, FRUITS, LEAVES } from './Garden';
import { KidRamadan } from './KidRamadan';
import { _t, _tj } from '../i18n';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  circle: CircleApi;
  today: string;
  current: Anchor;
}

/** Family block at the top of a family circle: prayer together, children, the family garden. */
export function FamilySection({ state, update, circle, today, current }: Props) {
  const { members, names, reacts, me, isOwner } = circle;
  const fam = famOf(state);
  const [kidOpen, setKidOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editPromise, setEditPromise] = useState(false);

  const togToday = new Set<string>();
  let togWeek = 0;
  for (const m of members) {
    if (m.tog?.day === today) m.tog.a.forEach((a) => togToday.add(a));
    togWeek = Math.max(togWeek, m.tog?.week ?? 0);
  }
  const mine = fam.together[today] ?? [];
  const praisedBy = (kidId: string) =>
    Object.entries(reacts).filter(([, map]) => map?.[`p:${kidId}`]?.day === today).map(([from]) => (from === me ? _t("ты") : names[from]?.name || _t("родитель")));

  const otherKids: (KidSummary & { parent: string })[] = members
    .filter((m) => m.id !== me)
    .flatMap((m) => (m.kids ?? []).map((k) => ({ ...k, parent: names[m.id]?.name || _t("Родитель") })));

  const fd = familyDays(members, today);
  const promise = members.find((m) => m.promise)?.promise ?? null;
  const ps = participants(members);
  const colorOf = (p: (typeof ps)[number]) => (p.kid ? p.color : names[p.id]?.color || '#2f9e5f');
  const kidOpenObj = fam.kids.find((k) => k.id === kidOpen);

  return (
    <section className="fam">
      <div className="fam-tog">
        <div className="ft-h">
          <b>{_t("Намаз вместе дома")}</b>
          <small>{togWeek ? _t("{0} {1} вместе за неделю", togWeek, plural(togWeek, _t("намаз"), _t("намаза"), _t("намазов"))) : _t("Отметьте, когда помолились всей семьёй")}</small>
        </div>
        <div className="ft-row">
          {ANCHORS.map((a) => (
            <button key={a} type="button" aria-pressed={mine.includes(a) || togToday.has(a)} className={a === current ? 'now' : ''}
              onClick={() => update((s) => toggleTogether(s, today, a))}>
              {ANCHOR_LABEL[a].ru}
            </button>
          ))}
        </div>
      </div>

      <h2 className="sub-h">{_t("Дети ")}<small>{fam.kids.length + otherKids.length}</small></h2>
      {fam.kids.map((k) => {
        const done = (k.log[today] ?? []).filter((id) => k.tasks.some((t) => t.id === id)).length;
        const pr = praisedBy(k.id);
        return (
          <div key={k.id} className="kid-card">
            <div className="kc-top">
              <span className="kid-dot" style={{ background: k.color }} aria-hidden="true">{k.name.slice(0, 1).toUpperCase()}</span>
              <div className="kc-x">
                <b>{k.name}, {k.age} {plural(k.age, _t("год"), _t("года"), _t("лет"))}</b>
                <small>{_tj("Сегодня {0} из {1}{2}", done, k.tasks.length, pr.length ? _t(" · похвалили: {0}", pr.join(', ')) : '')}</small>
              </div>
            </div>
            <div className="kc-row">
              <button type="button" className="pri-btn" onClick={() => setKidOpen(k.id)}>{_t("Детский экран")}</button>
              <button type="button" className="ghost-btn" aria-pressed={pr.includes(_t("ты"))} onClick={() => circle.praise(k.id, today)}>{_t("МашаАллах")}</button>
            </div>
          </div>
        );
      })}
      {otherKids.map((k) => {
        const pr = praisedBy(k.id);
        return (
          <div key={k.id} className="kid-card">
            <div className="kc-top">
              <span className="kid-dot" style={{ background: k.color }} aria-hidden="true">{k.name.slice(0, 1).toUpperCase()}</span>
              <div className="kc-x">
                <b>{k.name}, {k.age} {plural(k.age, _t("год"), _t("года"), _t("лет"))}</b>
                <small>{_tj("Сегодня {0} из {1} · ведёт {2}{3}", k.done, k.total, k.parent, pr.length ? _t(" · похвалили: {0}", pr.join(', ')) : '')}</small>
              </div>
              <button type="button" className="ghost-btn" aria-pressed={pr.includes(_t("ты"))} onClick={() => circle.praise(k.id, today)}>{_t("МашаАллах")}</button>
            </div>
          </div>
        );
      })}
      {adding ? (
        <AddKid onCancel={() => setAdding(false)} onAdd={(name, age) => { update((s) => patchF(s, (f) => ({ kids: [...f.kids, newKid(name, age, f.kids.length + otherKids.length)] }))); setAdding(false); }} />
      ) : (
        <button type="button" className="empty" onClick={() => setAdding(true)}>{_t("+ Добавить ребёнка")}</button>
      )}
      <p className="tiny">{_t("Детский профиль живёт на телефоне того родителя, кто его добавил: он открывает детский экран и отмечает вместе с ребёнком. Своего аккаунта у детей нет, их видит только семья.")}</p>

      <h2 className="sub-h">{_t("Наш сад ")}<small>{_tj("{0}  {1} вместе", fd.days, plural(fd.days, _t("день"), _t("дня"), _t("дней")))}</small></h2>
      <FamilyTree days={fd.days} colors={ps.map(colorOf)} />
      <div className="fam-legend">
        {ps.map((p) => <span key={p.id}><i style={{ background: colorOf(p) }} />{p.kid ? p.name : names[p.id]?.name || _t("Участник")}</span>)}
      </div>
      <p className="tiny">{_tj("День семьи засчитан, когда каждый сделал своё: у взрослых свет дня наполнен хотя бы наполовину, у детей отмечено хотя бы одно дело. До {0} плода {1}  {2}.", Math.floor(fd.days / 40) ? _t("следующего") : _t("первого"), 40 - (fd.days % 40), plural(40 - (fd.days % 40), _t("день"), _t("дня"), _t("дней")))}</p>

      {promise && !editPromise && (
        <div className="promise">
          <b>{_t("Семейное обещание")}</b>
          <span>{promise.text}</span>
          <span className="bar2"><i style={{ width: `${Math.min(100, (fd.days / promise.days) * 100)}%` }} /></span>
          <small>{fd.days >= promise.days ? _t("Выполнено, машаАллах! Пора исполнять обещание.") : _t("{0} из {1} дней", fd.days, promise.days)}</small>
          {isOwner && <button type="button" className="link-btn" onClick={() => setEditPromise(true)}>{_t("Изменить")}</button>}
        </div>
      )}
      {isOwner && (!promise || editPromise) && (
        <PromiseForm value={fam.promise ?? null} onSave={(p) => { update((s) => patchF(s, () => ({ promise: p }))); setEditPromise(false); }} onCancel={promise ? () => setEditPromise(false) : undefined} />
      )}

      {kidOpenObj && <KidScreen kid={kidOpenObj} update={update} today={today} praise={praisedBy(kidOpenObj.id)} onClose={() => setKidOpen(null)} />}
    </section>
  );
}

function AddKid({ onAdd, onCancel }: { onAdd: (name: string, age: number) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState(6);
  return (
    <div className="kid-add">
      <label className="cl-f"><span>{_t("Имя ребёнка")}</span><input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
      <label className="cl-f"><span>{_t("Возраст")}</span>
        <select value={age} onChange={(e) => setAge(Number(e.target.value))}>
          {Array.from({ length: 16 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="kc-row">
        <button type="button" className="pri-btn" disabled={name.trim().length < 2} onClick={() => onAdd(name, age)}>{_t("Добавить")}</button>
        <button type="button" className="ghost-btn" onClick={onCancel}>{_t("Отмена")}</button>
      </div>
    </div>
  );
}

function PromiseForm({ value, onSave, onCancel }: { value: { text: string; days: number } | null; onSave: (p: { text: string; days: number } | null) => void; onCancel?: () => void }) {
  const [text, setText] = useState(value?.text ?? '');
  const [days, setDays] = useState(value?.days ?? 40);
  return (
    <div className="promise">
      <b>{_t("Семейное обещание")}</b>
      <small>{_t("Что получит семья, если продержится вместе. Например: «Едем в зоопарк».")}</small>
      <input value={text} maxLength={80} placeholder={_t("Едем в зоопарк")} onChange={(e) => setText(e.target.value)} aria-label={_t("Обещание")} />
      <label className="cl-f"><span>{_t("Сколько дней вместе")}</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 21, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="kc-row">
        <button type="button" className="pri-btn" disabled={text.trim().length < 3} onClick={() => onSave({ text: text.trim(), days })}>{_t("Сохранить")}</button>
        {value && <button type="button" className="ghost-btn" onClick={() => onSave(null)}>{_t("Убрать")}</button>}
        {onCancel && <button type="button" className="ghost-btn" onClick={onCancel}>{_t("Отмена")}</button>}
      </div>
    </div>
  );
}

function FamilyTree({ days, colors }: { days: number; colors: string[] }) {
  const leaves = LEAVES.slice(0, Math.min(days * Math.max(1, colors.length), LEAVES.length));
  const branches = Math.floor(days / 7), fruits = Math.floor(days / 40);
  const trunkTop = days === 0 ? 236 : days < 7 ? 190 : 120;
  return (
    <div className="garden-box">
      <svg viewBox="0 0 354 290" role="img" aria-label={_t("Семейный сад: {0} {1} вместе", days, plural(days, _t("день"), _t("дня"), _t("дней")))}>
        <rect x="0" y="250" width="354" height="40" fill="var(--green-soft)" />
        <path d={`M177 252 C175 225 179 ${trunkTop + 40} 177 ${trunkTop}`} stroke="#7a5a3a" strokeWidth={days < 7 ? 6 : 12} fill="none" strokeLinecap="round" />
        {BRANCHES.slice(0, branches).map((d, i) => <path key={i} d={d} stroke="#7a5a3a" strokeWidth={6} fill="none" strokeLinecap="round" />)}
        {days < 7
          ? leaves.slice(0, 14).map((_, i) => { const x = 177 + (i % 2 ? 9 : -9), y = trunkTop + 8 + Math.floor(i / 2) * 9; return <ellipse key={i} cx={x} cy={y} rx="9" ry="5" fill={colors[i % colors.length] || '#2f9e5f'} transform={`rotate(${i % 2 ? -25 : 25} ${x} ${y})`} />; })
          : leaves.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="10" ry="6" fill={colors[i % colors.length] || '#2f9e5f'} transform={`rotate(${r} ${x} ${y})`} />)}
        {FRUITS.slice(0, fruits).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#d9822b" stroke="#fff" strokeWidth="2" />)}
      </svg>
    </div>
  );
}

function KidScreen({ kid, update, today, praise, onClose }: { kid: Kid; update: Props['update']; today: string; praise: string[]; onClose: () => void }) {
  const [edit, setEdit] = useState(false);
  const done = kid.log[today] ?? [];
  const total = Object.values(kid.log).reduce((n, l) => n + l.length, 0);
  const got = Math.min(STICKERS.length, Math.floor(total / 3));
  const next = 3 - (total % 3);
  const setTasks = (tasks: Kid['tasks']) => update((s) => patchF(s, (f) => ({ kids: f.kids.map((k) => (k.id === kid.id ? { ...k, tasks } : k)) })));

  return (
    <div className="sess light-sess kid-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_tj("Ас-саляму алейкум, {0}!", kid.name)}</b><small>{done.length ? _t("Сегодня сделано {0} из {1}", done.length, kid.tasks.length) : _t("Что сделаем сегодня?")}</small></div>
        <button type="button" className="link-btn" onClick={() => setEdit(!edit)}>{edit ? _t("Готово") : _t("Дела")}</button>
      </div>
      <div className="h-wrap">
        {praise.length > 0 && <div className="kid-praise">{_tj("МашаАллах, {0}! Тебя похвалили: {1}.", kid.name, praise.join(', '))}</div>}

        {edit ? (
          <>
            <p className="tiny">{_tj("Выбери до 5 дел для {0}. Лучше меньше, но каждый день.", kid.name)}</p>
            <div className="kid-pick">
              {tasksFor(kid.age).map((t) => {
                const on = kid.tasks.find((x) => x.t === t.t);
                return (
                  <button key={t.t} type="button" aria-pressed={Boolean(on)} disabled={!on && kid.tasks.length >= 5}
                    onClick={() => setTasks(on ? kid.tasks.filter((x) => x !== on) : [...kid.tasks, { id: uid(), ...t }])}>
                    <span aria-hidden="true">{t.icon}</span>{t.t}
                  </button>
                );
              })}
            </div>
            <button type="button" className="danger" onClick={() => { if (confirm(_t("Удалить профиль {0}? Отметки и наклейки пропадут.", kid.name))) { update((s) => patchF(s, (f) => ({ kids: f.kids.filter((k) => k.id !== kid.id) }))); onClose(); } }}>
              {_t("Удалить профиль")}
            </button>
          </>
        ) : (
          <>
            <KidRamadan kid={kid} update={update} today={today} />
            <div className="kid-tiles">
              {kid.tasks.map((t) => {
                const on = done.includes(t.id);
                return (
                  <button key={t.id} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => update((s) => toggleKidTask(s, kid.id, today, t.id))}>
                    <span className="ic" aria-hidden="true">{t.icon}</span>
                    <b>{t.t}</b>
                    <small>{on ? _t("Сделано!") : _t("Нажми, когда сделаешь")}</small>
                  </button>
                );
              })}
            </div>

            <div className="album">
              <div className="al-h"><b>{_t("Мой альбом")}</b><small>{_tj("{0} из {1}", got, STICKERS.length)}</small></div>
              <div className="al-grid">
                {STICKERS.map((st, i) => (
                  <span key={st.t} className={i < got ? 'st on' : 'st'} title={i < got ? st.t : _t("Пока закрыта")} aria-label={i < got ? st.t : _t("Закрытая наклейка")}>
                    {i < got ? st.icon : ''}
                  </span>
                ))}
              </div>
              <small>{got < STICKERS.length ? _t("Ещё {0} {1}, и откроется наклейка «{2}». Попроси родителей рассказать эту историю.", next, plural(next, _t("дело"), _t("дела"), _t("дел")), STICKERS[got].t) : _t("Весь альбом собран, машаАллах!")}</small>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
