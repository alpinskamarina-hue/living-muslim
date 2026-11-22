import { useEffect, useState } from 'react';
import { myCircles, kindOf, cloudMe } from '../cloud';
import type { Reacts } from '../circle';
import {
  FIELDS, STEPS, NEXT, MEET_QUESTIONS, brief, where, countryName, useNikahMe, refreshNikah, saveNikah, deleteNikah, answerWali, nikahFeed, nikahPeople,
  propose, answerProp, withdrawProp, useNikahReady,
  type NkData, type NkMine, type NkCard, type NkPerson, type NkProp, type NkStatus,
} from '../nikah';
import { _t, _tj } from '../i18n';
import { COUNTRIES } from '../places';

const RELS = [_t("отец"), _t("брат"), _t("дядя"), _t("дедушка"), _t("имам"), _t("другой")];
const STATUS_RU: Record<NkStatus, string> = { new: _t("ждёт ответа"), interested: _t("интересно, идёт истихара"), contacts: _t("семьи на связи"), meet: _t("встреча семей"), done: _t("решение принято"), declined: _t("с уважением, нет") };

function DataFields({ d, set, lead }: { d: NkData; set: (d: NkData) => void; lead?: string }) {
  return (
    <div className="nk-fields">
      {FIELDS.map((f) => (
        <label key={f.k} className="nk-f">
          <span>{f.k === 'age' && lead ? _t("{0}, возраст", lead) : f.label}</span>
          {f.k === 'country' ? <CountryField v={d.country ?? ''} set={(v) => set({ ...d, country: v })} />
          : f.opts ? (
            <div className="nk-opts">{f.opts.map((o) => <button key={o} type="button" aria-pressed={d[f.k] === o} onClick={() => set({ ...d, [f.k]: d[f.k] === o ? '' : o })}>{o}</button>)}</div>
          ) : (
            <input value={d[f.k] ?? ''} maxLength={f.k === 'age' ? 3 : 40} inputMode={f.k === 'age' ? 'numeric' : undefined} placeholder={f.ph} onChange={(e) => set({ ...d, [f.k]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

/** Country from our list, or «Другая страна» typed by hand. */
function CountryField({ v, set }: { v: string; set: (v: string) => void }) {
  const listed = COUNTRIES.some((c) => c.id === v);
  const [other, setOther] = useState(Boolean(v) && !listed);
  return (
    <>
      <select className="nk-country" value={listed ? v : other ? '_other' : ''} onChange={(e) => { const x = e.target.value; setOther(x === '_other'); set(x === '_other' || !x ? '' : x); }}>
        <option value="">{_t("Выбери страну")}</option>
        {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value="_other">{_t("Другая страна…")}</option>
      </select>
      {other && <input value={listed ? '' : v} maxLength={40} placeholder={_t("Название страны")} onChange={(e) => set(e.target.value)} />}
    </>
  );
}

function Facts({ d }: { d: NkData }) {
  const list = FIELDS.filter((f) => d[f.k]);
  if (!list.length) return null;
  return <div className="nk-facts">{list.map((f) => <div key={f.k}><small>{f.label}</small><b>{f.k === 'country' ? countryName(d.country) : d[f.k]}</b></div>)}</div>;
}

/** Profile → «Никах»: my profile, wali requests, proposals and their steps. */
export function NikahPage() {
  const ready = useNikahReady();
  const me = useNikahMe(ready);
  const [edit, setEdit] = useState(false);
  const [shared, setShared] = useState<NkCard[]>([]);
  useEffect(() => { if (ready) nikahFeed('').then(setShared); }, [ready]);
  if (!ready) return <p className="page-sub">{_t("Этот раздел скоро откроется.")}</p>;
  if (!me) return <p className="page-sub">{_t("Загружаю…")}</p>;
  const mine = me.mine;
  const asks = me.wards.filter((w) => !w.ok);

  if (edit) return <NikahForm mine={mine} onDone={() => { setEdit(false); refreshNikah(); }} />;

  return (
    <div className="nk">
      {asks.map((w) => (
        <div key={w.uid} className="nk-card nk-ask">
          <span className="k">{_t("Просьба быть вали")}</span>
          <p><b>{w.name}</b>{_tj(" просит тебя быть вали{0} в поиске пары для никаха. Ты увидишь анкету и все предложения, а {1}.", w.rel ? ` (${w.rel})` : '', w.gender === 'f' ? _t("её анкета без тебя не будет видна никому") : _t("семьи будут говорить через тебя"))}</p>
          <Facts d={w.data} />
          <div className="da-row">
            <button type="button" className="pri-btn" onClick={async () => { await answerWali(w.uid, true); refreshNikah(); }}>{_t("Подтвердить")}</button>
            <button type="button" className="link-btn" onClick={async () => { await answerWali(w.uid, false); refreshNikah(); }}>{_t("Отказаться")}</button>
          </div>
        </div>
      ))}

      {!mine ? (
        <div className="nk-card">
          <span className="k">{_t("Ищу пару для никаха")}</span>
          <p>{_t("Короткая анкета без фото и контактов. Её видят только круги и люди, которых ты выберешь. Тот, кто знает подходящую семью, сначала спрашивает их, а потом отправляет анкету тебе и твоему вали. Переписки с незнакомыми людьми нет.")}</p>
          <button type="button" className="pri-btn big-btn" onClick={() => setEdit(true)}>{_t("Заполнить анкету")}</button>
        </div>
      ) : (
        <div className="nk-card">
          <span className="k">{_tj("Моя анкета {0}", mine.active ? '' : _t("· скрыта"))}</span>
          <Facts d={mine.data} />
          {mine.about && <q className="nk-about">{mine.about}</q>}
          <p className="nk-line">{mine.wali ? <>{_t("Вали: ")}<b>{mine.wali_name}</b>{mine.wali_rel ? `, ${mine.wali_rel}` : ''} · {mine.wali_ok ? _t("✓ подтвердил") : _t("ждём подтверждения")}</> : _t("Вали не выбран")}</p>
          {mine.gender === 'f' && !mine.wali_ok && <p className="tiny">{_t("Анкету сестры видно только после того, как вали подтвердит.")}</p>}
          <p className="nk-line">{_tj("Видят: {0}", [...mine.circles.map((c) => { const x = myCircles().find((y) => y.code === c); return x ? `${kindOf(x.kind)?.ic ?? '👥'} ${x.title}` : ''; }).filter(Boolean), ...mine.shared.map((s) => `👤 ${s.name}`)].join(', ') || _t("пока никто"))}</p>
          <div className="da-row">
            <button type="button" className="link-btn" onClick={() => setEdit(true)}>{_t("Изменить")}</button>
            <button type="button" className="link-btn" onClick={async () => { await saveNikah({ ...mine, shared: mine.shared.map((s) => s.uid), active: !mine.active }); refreshNikah(); }}>{mine.active ? _t("Скрыть") : _t("Показать снова")}</button>
            <button type="button" className="link-btn cg-del" onClick={async () => { if (confirm(_t("Удалить анкету и все предложения к ней?"))) { await deleteNikah(); refreshNikah(); } }}>{_t("Удалить")}</button>
          </div>
        </div>
      )}

      {me.inbox.length > 0 && <h3 className="ch-h">{_t("Предложения")}</h3>}
      {me.inbox.map((p) => <PropCard key={p.id} p={p} forWard={p.to !== cloudMe()?.uid ? p.to_name : ''} />)}

      {shared.length > 0 && (
        <>
          <h3 className="ch-h">{_t("Мне доверили анкеты")}</h3>
          {shared.map((c) => <SeekerCard key={c.uid} c={c} code="" />)}
        </>
      )}

      {me.sent.length > 0 && (
        <>
          <h3 className="ch-h">{_t("Я предложил")}</h3>
          {me.sent.map((s) => (
            <div key={s.id} className="nk-sent">
              <span>{_t("Для: ")}<b>{s.to_name}</b> · {STATUS_RU[s.status]}</span>
              {s.status === 'new' && <button type="button" className="link-btn" onClick={async () => { await withdrawProp(s.id); refreshNikah(); }}>{_t("Отозвать")}</button>}
            </div>
          ))}
        </>
      )}
      <p className="tiny nk-priv">{_t("🔒 Фото и контакты в анкетах не показываются. Контакт вали другой семьи откроется только после истихары. Отказ мягкий: никто не узнает, о ком шла речь.")}</p>
    </div>
  );
}

function NikahForm({ mine, onDone }: { mine: NkMine | null; onDone: () => void }) {
  const [gender, setGender] = useState<'m' | 'f' | ''>(mine?.gender ?? '');
  const [d, setD] = useState<NkData>(mine?.data ?? {});
  const [about, setAbout] = useState(mine?.about ?? '');
  const [wali, setWali] = useState(mine?.wali ?? '');
  const [rel, setRel] = useState(mine?.wali_rel ?? _t("отец"));
  const [circles, setCircles] = useState<string[]>(mine?.circles ?? []);
  const [shared, setShared] = useState<string[]>(mine?.shared.map((s) => s.uid) ?? []);
  const [people, setPeople] = useState<NkPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { nikahPeople().then(setPeople); }, []);
  const toggle = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const ok = gender && d.age && d.country && d.city;
  const save = async () => {
    setBusy(true); setErr('');
    const r = await saveNikah({ gender: gender as 'm' | 'f', data: d, about, circles, shared, wali: wali || null, wali_rel: wali ? rel : '', active: mine?.active ?? true });
    setBusy(false);
    if (r === 'ok') onDone(); else setErr(_t("Не удалось сохранить. Проверь интернет и попробуй ещё раз."));
  };
  return (
    <div className="nk">
      <button type="button" className="link-btn" onClick={onDone}>{_t("← Назад")}</button>
      <div className="nk-card">
        <span className="k">{_t("Кто ищет")}</span>
        <div className="nk-opts">
          <button type="button" aria-pressed={gender === 'm'} onClick={() => setGender('m')}>{_t("Брат, ищу жену")}</button>
          <button type="button" aria-pressed={gender === 'f'} onClick={() => setGender('f')}>{_t("Сестра, ищу мужа")}</button>
        </div>
        {gender === 'f' && <p className="tiny">{_t("Анкету сестры ведёт вали: её увидят только после его подтверждения, а все предложения приходят и ему.")}</p>}
      </div>
      <div className="nk-card">
        <span className="k">{_t("О себе")}</span>
        <DataFields d={d} set={setD} />
        <label className="nk-f"><span>{_t("Одна строка о себе (без контактов)")}</span>
          <textarea rows={2} maxLength={160} value={about} placeholder={_t("Хочу семью, где намаз и Коран в центре")} onChange={(e) => setAbout(e.target.value)} />
        </label>
      </div>
      <div className="nk-card">
        <span className="k">{_t("Вали")}</span>
        <p className="tiny">{_t("Отец, брат или другой мужчина из семьи. Он должен быть в одном из твоих кругов и подтвердить у себя.")}</p>
        <select value={wali} onChange={(e) => setWali(e.target.value)}>
          <option value="">{gender === 'f' ? _t("Выбери вали") : _t("Без вали (можно добавить позже)")}</option>
          {people.map((p) => <option key={p.uid} value={p.uid}>{p.name}{p.nick ? ` · @${p.nick}` : ''}</option>)}
        </select>
        {wali && <div className="nk-opts">{RELS.map((r) => <button key={r} type="button" aria-pressed={rel === r} onClick={() => setRel(r)}>{r}</button>)}</div>}
      </div>
      <div className="nk-card">
        <span className="k">{_t("Кто видит анкету")}</span>
        {myCircles().map((c) => (
          <label key={c.code} className="nk-tg"><span>{kindOf(c.kind)?.ic ?? '👥'} {c.title}</span><input type="checkbox" checked={circles.includes(c.code)} onChange={() => setCircles(toggle(circles, c.code))} /></label>
        ))}
        {!myCircles().length && <p className="tiny">{_t("Пока нет кругов. Можно выбрать доверенного человека ниже.")}</p>}
        <p className="tiny">{_t("Ещё до 5 доверенных людей из твоих кругов, например имам:")}</p>
        <div className="nk-opts">
          {people.filter((p) => p.uid !== wali).map((p) => <button key={p.uid} type="button" aria-pressed={shared.includes(p.uid)} disabled={!shared.includes(p.uid) && shared.length >= 5} onClick={() => setShared(toggle(shared, p.uid))}>{p.name}</button>)}
        </div>
      </div>
      {err && <div className="warn">{err}</div>}
      <button type="button" className="pri-btn big-btn" disabled={!ok || busy || (gender === 'f' && !wali)} onClick={save}>{busy ? _t("Сохраняю…") : _t("Сохранить анкету")}</button>
      {!ok && <p className="tiny">{_tj("Нужно выбрать, кто ищет, страну, и написать возраст и город.{0}", gender === 'f' && !wali ? _t(" Сестре нужен вали.") : '')}</p>}
      <p className="tiny nk-priv">{_t("🔒 Фото, фамилия и контакты в анкете не показываются никогда.")}</p>
    </div>
  );
}

/** A proposal to me or my ward, with the steps to nikah. */
function PropCard({ p, forWard }: { p: NkProp; forWard: string }) {
  const [busy, setBusy] = useState(false);
  const idx = STEPS.findIndex((s) => s.s === p.status);
  const nxt = NEXT[p.status];
  const act = async (s: NkStatus) => {
    if (s === 'declined' && !confirm(_t("Ответить «с уважением, нет»? Анкета исчезнет, никто не узнает, о ком шла речь."))) return;
    setBusy(true); await answerProp(p.id, s); await refreshNikah(); setBusy(false);
  };
  return (
    <div className="nk-card nk-prop">
      <span className="k">{_tj("{0}предложил: {1}", forWard ? _t("Для: {0} · ", forWard) : '', p.from_name)}</span>
      <b className="nk-who">{p.data.age ? _t("{0} лет", p.data.age) : _t("Кандидат")}{where(p.data) ? ` · ${where(p.data)}` : ''}</b>
      <p className="nk-line">{brief({ ...p.data, age: undefined, city: undefined, country: undefined })}</p>
      {p.note && <q className="nk-about">{p.note}</q>}
      {p.contact && <p className="nk-contact">{_t("📞 Контакт вали: ")}<b>{p.contact}</b></p>}
      <div className="nk-steps">
        {STEPS.map((s, i) => (
          <div key={s.s} className={`nk-step${i < idx || p.status === 'done' ? ' d' : i === idx ? ' c' : ''}`}>
            <i>{i < idx || p.status === 'done' ? '✓' : i + 1}</i><span><b>{s.title}</b><small>{s.sub}</small></span>
          </div>
        ))}
      </div>
      {(p.status === 'contacts' || p.status === 'meet') && (
        <details className="nk-qs"><summary>{_t("Вопросы для встречи")}</summary><ul>{MEET_QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ul></details>
      )}
      {p.status !== 'done' && (
        <div className="da-row">
          {nxt && <button type="button" className="pri-btn" disabled={busy} onClick={() => act(nxt.to)}>{nxt.label}</button>}
          <button type="button" className="link-btn" disabled={busy} onClick={() => act('declined')}>{_t("С уважением, нет")}</button>
        </div>
      )}
      {p.status === 'done' && <p className="nk-line">{_t("МашаАллах. Пусть Аллах благословит. Для организации никаха создай круг «Семья».")}</p>}
    </div>
  );
}

/** A seeker's card: in a circle, or shared with me directly (code ''). */
export function SeekerCard({ c, code, dua }: { c: NkCard; code: string; dua?: { on: boolean; n: number; tap: () => void } }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<NkData>({});
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(c.sent);
  const send = async () => {
    const r = await propose(c.uid, code, { data: d, note, contact, agreed });
    if (r === 'ok') { setSent(true); setOpen(false); setMsg(_t("Отправлено: {0}{1}. Ответ увидишь в Профиле → Никах.", c.name, c.wali_name ? _t(" и вали {0}", c.wali_name) : '')); refreshNikah(); }
    else setMsg(r === 'limit' ? _t("Слишком много предложений подряд. Попробуй позже.") : r === 'closed' ? _t("Анкета больше не доступна.") : _t("Не удалось отправить."));
  };
  const other = c.gender === 'm' ? _t("сестру") : _t("брата");
  return (
    <div className="nk-seek">
      <span className="k">💍 {c.gender === 'm' ? _t("Ищет жену") : _t("Ищет мужа")}</span>
      <div className="nk-who-row"><span className="av" style={{ background: c.color || '#1f7a4d' }}>{(c.name || '?').slice(0, 1).toUpperCase()}</span>
        <span><b>{c.name}</b><small>{c.wali_name ? _t("вали: {0}{1}", c.wali_rel ? `${c.wali_rel}, ` : '', c.wali_name) : _t("без вали")}</small></span></div>
      <Facts d={c.data} />
      {c.about && <q className="nk-about">{c.about}</q>}
      {msg && <p className="nk-line">{msg}</p>}
      {open ? (
        <div className="nk-prop-f">
          <p className="tiny">{_tj("Ты посредник. Сначала спроси {0}. Анкету получат только {1}{2}.", c.gender === 'm' ? _t("её семью") : _t("его семью"), c.name, c.wali_name ? _t(" и вали {0}", c.wali_name) : '')}</p>
          <DataFields d={d} set={setD} lead={c.gender === 'm' ? _t("Сестра") : _t("Брат")} />
          <label className="nk-f"><span>{_t("Пара слов от тебя")}</span><textarea rows={2} maxLength={160} value={note} placeholder={_t("Например: знаю семью 10 лет")} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="nk-f"><span>{_tj("Связь через (вали {0})", c.gender === 'm' ? _t("сестры") : _t("брата"))}</span><input value={contact} maxLength={120} placeholder={_t("Её отец, Ибрахим, +31 6…")} onChange={(e) => setContact(e.target.value)} /></label>
          <small className="tiny">{_t("Контакт увидят только после «интересно» и истихары.")}</small>
          <label className="nk-tg"><span>{_t("Семья знает и согласна, чтобы я предложил")}</span><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /></label>
          <div className="da-row">
            <button type="button" className="pri-btn" disabled={!agreed || contact.trim().length < 3} onClick={send}>{_tj("Отправить{0}", c.wali_name ? _t(" вали") : '')}</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>{_t("Отмена")}</button>
          </div>
        </div>
      ) : (
        <div className="bz-acts">
          {!sent && <button type="button" className="nk-btn" onClick={() => setOpen(true)}>{_tj("🤝 Знаю подходящ{0}  {1}", c.gender === 'm' ? _t("ую") : _t("его"), other)}</button>}
          {sent && <span className="tiny">{_t("✓ Ты уже предложил")}</span>}
          {dua && <button type="button" aria-pressed={dua.on} onClick={dua.tap}>{_tj("🤲 Дуа{0}", dua.n ? ` · ${dua.n}` : '')}</button>}
        </div>
      )}
      <small className="tiny">{_tj("{0}без фото и контактов, видно только этому кругу", c.props ? `${c.props} ${c.props === 1 ? _t("предложение уже у семьи") : _t("предложения уже у семьи")} · ` : '')}</small>
    </div>
  );
}

/** «Ищем пару» cards inside a circle. */
export function NikahInCircle({ code, me, reacts, react, today, onOpenMine }: { code: string; me: string; reacts: Reacts; react: (key: string) => void; today: string; onOpenMine: () => void }) {
  const ready = useNikahReady();
  const [list, setList] = useState<NkCard[]>([]);
  const mine = useNikahMe(ready);
  useEffect(() => { if (ready && code) nikahFeed(code).then(setList); }, [ready, code]);
  if (!ready) return null;
  const myShown = Boolean(mine?.mine?.active && mine.mine.circles.includes(code));
  const duaN = (uid: string) => Object.entries(reacts).filter(([f, m]) => f !== uid && m?.[`nk:${uid}`]?.day === today).length;
  if (!list.length && !myShown) return null;
  return (
    <div className="nk-circle">
      {list.map((c) => <SeekerCard key={c.uid} c={c} code={code} dua={{ on: reacts[me]?.[`nk:${c.uid}`]?.day === today, n: duaN(c.uid), tap: () => react(`nk:${c.uid}`) }} />)}
      {myShown && <button type="button" className="da-ask" onClick={onOpenMine}>{_tj("💍 Твоя анкета видна этому кругу{0} ›", duaN(me) ? _t(" · 🤲 {0} дуа сегодня", duaN(me)) : '')}</button>}
    </div>
  );
}
