import { useEffect, useState } from 'react';
import { myCircles, kindOf, cloudMe } from '../cloud';
import type { Reacts } from '../circle';
import {
  FIELDS, STEPS, NEXT, MEET_QUESTIONS, brief, useNikahMe, refreshNikah, saveNikah, deleteNikah, answerWali, nikahFeed, nikahPeople,
  propose, answerProp, withdrawProp, useNikahReady,
  type NkData, type NkMine, type NkCard, type NkPerson, type NkProp, type NkStatus,
} from '../nikah';

const RELS = ['отец', 'брат', 'дядя', 'дедушка', 'имам', 'другой'];
const STATUS_RU: Record<NkStatus, string> = { new: 'ждёт ответа', interested: 'интересно, идёт истихара', contacts: 'семьи на связи', meet: 'встреча семей', done: 'решение принято', declined: 'с уважением, нет' };

function DataFields({ d, set, lead }: { d: NkData; set: (d: NkData) => void; lead?: string }) {
  return (
    <div className="nk-fields">
      {FIELDS.map((f) => (
        <label key={f.k} className="nk-f">
          <span>{f.k === 'age' && lead ? `${lead}, возраст` : f.label}</span>
          {f.opts ? (
            <div className="nk-opts">{f.opts.map((o) => <button key={o} type="button" aria-pressed={d[f.k] === o} onClick={() => set({ ...d, [f.k]: d[f.k] === o ? '' : o })}>{o}</button>)}</div>
          ) : (
            <input value={d[f.k] ?? ''} maxLength={f.k === 'age' ? 3 : 40} inputMode={f.k === 'age' ? 'numeric' : undefined} placeholder={f.ph} onChange={(e) => set({ ...d, [f.k]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

function Facts({ d }: { d: NkData }) {
  const list = FIELDS.filter((f) => d[f.k]);
  if (!list.length) return null;
  return <div className="nk-facts">{list.map((f) => <div key={f.k}><small>{f.label}</small><b>{d[f.k]}</b></div>)}</div>;
}

/** Profile → «Никах»: my profile, wali requests, proposals and their steps. */
export function NikahPage() {
  const ready = useNikahReady();
  const me = useNikahMe(ready);
  const [edit, setEdit] = useState(false);
  const [shared, setShared] = useState<NkCard[]>([]);
  useEffect(() => { if (ready) nikahFeed('').then(setShared); }, [ready]);
  if (!ready) return <p className="page-sub">Этот раздел скоро откроется.</p>;
  if (!me) return <p className="page-sub">Загружаю…</p>;
  const mine = me.mine;
  const asks = me.wards.filter((w) => !w.ok);

  if (edit) return <NikahForm mine={mine} onDone={() => { setEdit(false); refreshNikah(); }} />;

  return (
    <div className="nk">
      {asks.map((w) => (
        <div key={w.uid} className="nk-card nk-ask">
          <span className="k">Просьба быть вали</span>
          <p><b>{w.name}</b> просит тебя быть вали{w.rel ? ` (${w.rel})` : ''} в поиске пары для никаха. Ты увидишь анкету и все предложения, а {w.gender === 'f' ? 'её анкета без тебя не будет видна никому' : 'семьи будут говорить через тебя'}.</p>
          <Facts d={w.data} />
          <div className="da-row">
            <button type="button" className="pri-btn" onClick={async () => { await answerWali(w.uid, true); refreshNikah(); }}>Подтвердить</button>
            <button type="button" className="link-btn" onClick={async () => { await answerWali(w.uid, false); refreshNikah(); }}>Отказаться</button>
          </div>
        </div>
      ))}

      {!mine ? (
        <div className="nk-card">
          <span className="k">Ищу пару для никаха</span>
          <p>Короткая анкета без фото и контактов. Её видят только круги и люди, которых ты выберешь. Тот, кто знает подходящую семью, сначала спрашивает их, а потом отправляет анкету тебе и твоему вали. Переписки с незнакомыми людьми нет.</p>
          <button type="button" className="pri-btn big-btn" onClick={() => setEdit(true)}>Заполнить анкету</button>
        </div>
      ) : (
        <div className="nk-card">
          <span className="k">Моя анкета {mine.active ? '' : '· скрыта'}</span>
          <Facts d={mine.data} />
          {mine.about && <q className="nk-about">{mine.about}</q>}
          <p className="nk-line">{mine.wali ? <>Вали: <b>{mine.wali_name}</b>{mine.wali_rel ? `, ${mine.wali_rel}` : ''} · {mine.wali_ok ? '✓ подтвердил' : 'ждём подтверждения'}</> : 'Вали не выбран'}</p>
          {mine.gender === 'f' && !mine.wali_ok && <p className="tiny">Анкету сестры видно только после того, как вали подтвердит.</p>}
          <p className="nk-line">Видят: {[...mine.circles.map((c) => { const x = myCircles().find((y) => y.code === c); return x ? `${kindOf(x.kind)?.ic ?? '👥'} ${x.title}` : ''; }).filter(Boolean), ...mine.shared.map((s) => `👤 ${s.name}`)].join(', ') || 'пока никто'}</p>
          <div className="da-row">
            <button type="button" className="link-btn" onClick={() => setEdit(true)}>Изменить</button>
            <button type="button" className="link-btn" onClick={async () => { await saveNikah({ ...mine, shared: mine.shared.map((s) => s.uid), active: !mine.active }); refreshNikah(); }}>{mine.active ? 'Скрыть' : 'Показать снова'}</button>
            <button type="button" className="link-btn cg-del" onClick={async () => { if (confirm('Удалить анкету и все предложения к ней?')) { await deleteNikah(); refreshNikah(); } }}>Удалить</button>
          </div>
        </div>
      )}

      {me.inbox.length > 0 && <h3 className="ch-h">Предложения</h3>}
      {me.inbox.map((p) => <PropCard key={p.id} p={p} forWard={p.to !== cloudMe()?.uid ? p.to_name : ''} />)}

      {shared.length > 0 && (
        <>
          <h3 className="ch-h">Мне доверили анкеты</h3>
          {shared.map((c) => <SeekerCard key={c.uid} c={c} code="" />)}
        </>
      )}

      {me.sent.length > 0 && (
        <>
          <h3 className="ch-h">Я предложил</h3>
          {me.sent.map((s) => (
            <div key={s.id} className="nk-sent">
              <span>Для: <b>{s.to_name}</b> · {STATUS_RU[s.status]}</span>
              {s.status === 'new' && <button type="button" className="link-btn" onClick={async () => { await withdrawProp(s.id); refreshNikah(); }}>Отозвать</button>}
            </div>
          ))}
        </>
      )}
      <p className="tiny nk-priv">🔒 Фото и контакты в анкетах не показываются. Контакт вали другой семьи откроется только после истихары. Отказ мягкий: никто не узнает, о ком шла речь.</p>
    </div>
  );
}

function NikahForm({ mine, onDone }: { mine: NkMine | null; onDone: () => void }) {
  const [gender, setGender] = useState<'m' | 'f' | ''>(mine?.gender ?? '');
  const [d, setD] = useState<NkData>(mine?.data ?? {});
  const [about, setAbout] = useState(mine?.about ?? '');
  const [wali, setWali] = useState(mine?.wali ?? '');
  const [rel, setRel] = useState(mine?.wali_rel ?? 'отец');
  const [circles, setCircles] = useState<string[]>(mine?.circles ?? []);
  const [shared, setShared] = useState<string[]>(mine?.shared.map((s) => s.uid) ?? []);
  const [people, setPeople] = useState<NkPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { nikahPeople().then(setPeople); }, []);
  const toggle = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const ok = gender && d.age && d.city;
  const save = async () => {
    setBusy(true); setErr('');
    const r = await saveNikah({ gender: gender as 'm' | 'f', data: d, about, circles, shared, wali: wali || null, wali_rel: wali ? rel : '', active: mine?.active ?? true });
    setBusy(false);
    if (r === 'ok') onDone(); else setErr('Не удалось сохранить. Проверь интернет и попробуй ещё раз.');
  };
  return (
    <div className="nk">
      <button type="button" className="link-btn" onClick={onDone}>← Назад</button>
      <div className="nk-card">
        <span className="k">Кто ищет</span>
        <div className="nk-opts">
          <button type="button" aria-pressed={gender === 'm'} onClick={() => setGender('m')}>Брат, ищу жену</button>
          <button type="button" aria-pressed={gender === 'f'} onClick={() => setGender('f')}>Сестра, ищу мужа</button>
        </div>
        {gender === 'f' && <p className="tiny">Анкету сестры ведёт вали: её увидят только после его подтверждения, а все предложения приходят и ему.</p>}
      </div>
      <div className="nk-card">
        <span className="k">О себе</span>
        <DataFields d={d} set={setD} />
        <label className="nk-f"><span>Одна строка о себе (без контактов)</span>
          <textarea rows={2} maxLength={160} value={about} placeholder="Хочу семью, где намаз и Коран в центре" onChange={(e) => setAbout(e.target.value)} />
        </label>
      </div>
      <div className="nk-card">
        <span className="k">Вали</span>
        <p className="tiny">Отец, брат или другой мужчина из семьи. Он должен быть в одном из твоих кругов и подтвердить у себя.</p>
        <select value={wali} onChange={(e) => setWali(e.target.value)}>
          <option value="">{gender === 'f' ? 'Выбери вали' : 'Без вали (можно добавить позже)'}</option>
          {people.map((p) => <option key={p.uid} value={p.uid}>{p.name}{p.nick ? ` · @${p.nick}` : ''}</option>)}
        </select>
        {wali && <div className="nk-opts">{RELS.map((r) => <button key={r} type="button" aria-pressed={rel === r} onClick={() => setRel(r)}>{r}</button>)}</div>}
      </div>
      <div className="nk-card">
        <span className="k">Кто видит анкету</span>
        {myCircles().map((c) => (
          <label key={c.code} className="nk-tg"><span>{kindOf(c.kind)?.ic ?? '👥'} {c.title}</span><input type="checkbox" checked={circles.includes(c.code)} onChange={() => setCircles(toggle(circles, c.code))} /></label>
        ))}
        {!myCircles().length && <p className="tiny">Пока нет кругов. Можно выбрать доверенного человека ниже.</p>}
        <p className="tiny">Ещё до 5 доверенных людей из твоих кругов, например имам:</p>
        <div className="nk-opts">
          {people.filter((p) => p.uid !== wali).map((p) => <button key={p.uid} type="button" aria-pressed={shared.includes(p.uid)} disabled={!shared.includes(p.uid) && shared.length >= 5} onClick={() => setShared(toggle(shared, p.uid))}>{p.name}</button>)}
        </div>
      </div>
      {err && <div className="warn">{err}</div>}
      <button type="button" className="pri-btn big-btn" disabled={!ok || busy || (gender === 'f' && !wali)} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить анкету'}</button>
      {!ok && <p className="tiny">Нужно выбрать, кто ищет, и написать возраст и город.{gender === 'f' && !wali ? ' Сестре нужен вали.' : ''}</p>}
      <p className="tiny nk-priv">🔒 Фото, фамилия и контакты в анкете не показываются никогда.</p>
    </div>
  );
}

/** A proposal to me or my ward, with the steps to nikah. */
function PropCard({ p, forWard }: { p: NkProp; forWard: string }) {
  const [busy, setBusy] = useState(false);
  const idx = STEPS.findIndex((s) => s.s === p.status);
  const nxt = NEXT[p.status];
  const act = async (s: NkStatus) => {
    if (s === 'declined' && !confirm('Ответить «с уважением, нет»? Анкета исчезнет, никто не узнает, о ком шла речь.')) return;
    setBusy(true); await answerProp(p.id, s); await refreshNikah(); setBusy(false);
  };
  return (
    <div className="nk-card nk-prop">
      <span className="k">{forWard ? `Для: ${forWard} · ` : ''}предложил: {p.from_name}</span>
      <b className="nk-who">{p.data.age ? `${p.data.age} лет` : 'Кандидат'}{p.data.city ? ` · ${p.data.city}` : ''}</b>
      <p className="nk-line">{brief({ ...p.data, age: undefined, city: undefined })}</p>
      {p.note && <q className="nk-about">{p.note}</q>}
      {p.contact && <p className="nk-contact">📞 Контакт вали: <b>{p.contact}</b></p>}
      <div className="nk-steps">
        {STEPS.map((s, i) => (
          <div key={s.s} className={`nk-step${i < idx || p.status === 'done' ? ' d' : i === idx ? ' c' : ''}`}>
            <i>{i < idx || p.status === 'done' ? '✓' : i + 1}</i><span><b>{s.title}</b><small>{s.sub}</small></span>
          </div>
        ))}
      </div>
      {(p.status === 'contacts' || p.status === 'meet') && (
        <details className="nk-qs"><summary>Вопросы для встречи</summary><ul>{MEET_QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ul></details>
      )}
      {p.status !== 'done' && (
        <div className="da-row">
          {nxt && <button type="button" className="pri-btn" disabled={busy} onClick={() => act(nxt.to)}>{nxt.label}</button>}
          <button type="button" className="link-btn" disabled={busy} onClick={() => act('declined')}>С уважением, нет</button>
        </div>
      )}
      {p.status === 'done' && <p className="nk-line">МашаАллах. Пусть Аллах благословит. Для организации никаха создай круг «Семья».</p>}
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
    if (r === 'ok') { setSent(true); setOpen(false); setMsg(`Отправлено: ${c.name}${c.wali_name ? ` и вали ${c.wali_name}` : ''}. Ответ увидишь в Профиле → Никах.`); refreshNikah(); }
    else setMsg(r === 'limit' ? 'Слишком много предложений подряд. Попробуй позже.' : r === 'closed' ? 'Анкета больше не доступна.' : 'Не удалось отправить.');
  };
  const other = c.gender === 'm' ? 'сестру' : 'брата';
  return (
    <div className="nk-seek">
      <span className="k">💍 {c.gender === 'm' ? 'Ищет жену' : 'Ищет мужа'}</span>
      <div className="nk-who-row"><span className="av" style={{ background: c.color || '#1f7a4d' }}>{(c.name || '?').slice(0, 1).toUpperCase()}</span>
        <span><b>{c.name}</b><small>{c.wali_name ? `вали: ${c.wali_rel ? `${c.wali_rel}, ` : ''}${c.wali_name}` : 'без вали'}</small></span></div>
      <Facts d={c.data} />
      {c.about && <q className="nk-about">{c.about}</q>}
      {msg && <p className="nk-line">{msg}</p>}
      {open ? (
        <div className="nk-prop-f">
          <p className="tiny">Ты посредник. Сначала спроси {c.gender === 'm' ? 'её семью' : 'его семью'}. Анкету получат только {c.name}{c.wali_name ? ` и вали ${c.wali_name}` : ''}.</p>
          <DataFields d={d} set={setD} lead={c.gender === 'm' ? 'Сестра' : 'Брат'} />
          <label className="nk-f"><span>Пара слов от тебя</span><textarea rows={2} maxLength={160} value={note} placeholder="Например: знаю семью 10 лет" onChange={(e) => setNote(e.target.value)} /></label>
          <label className="nk-f"><span>Связь через (вали {c.gender === 'm' ? 'сестры' : 'брата'})</span><input value={contact} maxLength={120} placeholder="Её отец, Ибрахим, +31 6…" onChange={(e) => setContact(e.target.value)} /></label>
          <small className="tiny">Контакт увидят только после «интересно» и истихары.</small>
          <label className="nk-tg"><span>Семья знает и согласна, чтобы я предложил</span><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /></label>
          <div className="da-row">
            <button type="button" className="pri-btn" disabled={!agreed || contact.trim().length < 3} onClick={send}>Отправить{c.wali_name ? ' вали' : ''}</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <div className="bz-acts">
          {!sent && <button type="button" className="nk-btn" onClick={() => setOpen(true)}>🤝 Знаю подходящ{c.gender === 'm' ? 'ую' : 'его'} {other}</button>}
          {sent && <span className="tiny">✓ Ты уже предложил</span>}
          {dua && <button type="button" aria-pressed={dua.on} onClick={dua.tap}>🤲 Дуа{dua.n ? ` · ${dua.n}` : ''}</button>}
        </div>
      )}
      <small className="tiny">{c.props ? `${c.props} ${c.props === 1 ? 'предложение уже у семьи' : 'предложения уже у семьи'} · ` : ''}без фото и контактов, видно только этому кругу</small>
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
      {myShown && <button type="button" className="da-ask" onClick={onOpenMine}>💍 Твоя анкета видна этому кругу{duaN(me) ? ` · 🤲 ${duaN(me)} дуа сегодня` : ''} ›</button>}
    </div>
  );
}
