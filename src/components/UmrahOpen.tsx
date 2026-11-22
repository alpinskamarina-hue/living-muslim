// «Ищут людей»: open umrah groups. The list for everyone, the amir's switch for his own trip,
// and the requests the amir answers. Server side: supabase/umrah-open.sql.
import { useEffect, useState } from 'react';
import { _t, _tj } from '../i18n';
import { askAnswer, askCancel, askJoin, asksChanged, openList, openMine, openSet, type AskToMe, type OpenGroup, type Who } from '../umrahOpen';

const WHO: Record<Who, string> = { brothers: _t("Братья"), families: _t("Семьи"), sisters: _t("Сёстры"), all: _t("Все") };
const MON = () => [_t("январь"), _t("февраль"), _t("март"), _t("апрель"), _t("май"), _t("июнь"), _t("июль"), _t("август"), _t("сентябрь"), _t("октябрь"), _t("ноябрь"), _t("декабрь")];
const when = (g: OpenGroup) => (g.from ? `${MON()[Number(g.from.slice(5, 7)) - 1]} ${g.from.slice(0, 4)}` : g.month);

/** The list of open groups, loaded once per opening. */
export function useOpenList(on: boolean) {
  const [list, setList] = useState<OpenGroup[] | null>(null);
  const load = () => openList().then(setList);
  useEffect(() => { if (on) load(); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return { list, reload: load };
}

export function OpenGroups({ list, reload }: { list: OpenGroup[] | null; reload: () => void }) {
  const [who, setWho] = useState<Who | ''>('');
  const [asking, setAsking] = useState<OpenGroup | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!list) return <p className="tiny">{_t("Загружаю группы…")}</p>;
  const shown = list.filter((g) => !who || g.who === who || g.who === 'all');
  const send = async () => {
    if (!asking || busy) return;
    setBusy(true);
    const r = await askJoin(asking.host, note);
    setBusy(false);
    setMsg(r === 'ok' ? _tj("✓ Просьба отправлена. {0} ответит здесь же.", asking.amir || _t("Амир"))
      : r === 'already' ? _t("Просьба уже отправлена, ждём ответа.")
      : r === 'already_in' ? _t("Ты уже в этом круге: поездка видна в «Моя поездка».")
      : r === 'declined' ? _t("Амир уже ответил «не в этот раз». Попробуй другую группу.")
      : r === 'limit' ? _t("Сегодня уже много просьб. Попробуй завтра.")
      : r === 'closed' ? _t("Группа уже набрана.") : _t("Не получилось отправить. Проверь интернет и попробуй ещё раз."));
    if (r === 'ok') { setAsking(null); setNote(''); reload(); asksChanged(); }
  };
  const cancel = async (id: string) => { await askCancel(id); reload(); asksChanged(); };
  return (
    <div className="uo">
      <p className="uo-lead">{_t("Собираются сейчас. Можно попроситься, если не хватает людей.")}</p>
      {list.length > 0 && (
        <div className="uo-chips">
          {(['', 'brothers', 'families', 'sisters'] as const).map((k) => (
            <button key={k || 'any'} type="button" aria-pressed={who === k} onClick={() => setWho(k)}>{k ? WHO[k] : _t("Все группы")}</button>
          ))}
        </div>
      )}
      {msg && <p className="uo-msg" role="status">{msg}</p>}
      {!shown.length && (
        <div className="uo-empty">
          <b>{list.length ? _t("Здесь таких групп пока нет") : _t("Пока никто не ищет людей")}</b>
          <small>{_t("Собери свою поездку и включи «Ищем людей»: она появится здесь для других.")}</small>
        </div>
      )}
      {shown.map((g) => {
        const total = g.going + g.places;
        const st = g.mine?.status;
        return (
          <div key={g.host} className="uo-card">
            <div className="uo-h"><b>{g.title || _t("Умра")}</b><em>{_tj("нужно ещё {0}", g.places)}</em></div>
            <small className="uo-meta"><i>{WHO[g.who]}</i>{[when(g), g.city && _tj("из {0}", g.city), g.amir && _tj("амир {0}", g.amir)].filter(Boolean).join(' · ')}</small>
            <div className="uo-seats" aria-label={_tj("едут {0} из {1}", g.going, total)}>{Array.from({ length: Math.min(total, 12) }, (_, i) => <span key={i} className={i < g.going ? 'on' : ''} />)}</div>
            <small className="uo-go">{_tj("едут {0} из {1}", g.going, total)}</small>
            {g.note && <p className="uo-note">«{g.note}»</p>}
            {g.mine?.reply && st === 'pending' && <p className="uo-reply"><b>{g.amir || _t("Амир")}:</b> {g.mine.reply}</p>}
            {st === 'pending' ? (
              <div className="uo-b"><span className="uo-sent">{_t("✓ Просьба отправлена")}</span><button type="button" className="link-btn" onClick={() => cancel(g.mine!.id)}>{_t("Отменить")}</button></div>
            ) : st === 'accepted' ? (
              <p className="uo-ok">{_t("Амир принял! Приглашение в круг ждёт тебя в «Круге».")}</p>
            ) : st === 'declined' ? (
              <p className="uo-no">{_t("Амир ответил: не в этот раз.")}</p>
            ) : (
              <button type="button" className="gold-btn uo-ask" onClick={() => { setAsking(g); setMsg(''); }}>{_t("Попроситься")}</button>
            )}
          </div>
        );
      })}
      {asking && (
        <div className="uo-sheet-bg" onClick={() => setAsking(null)}>
          <div className="uo-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <b>{_tj("Попроситься в «{0}»", asking.title || _t("Умра"))}</b>
            <small>{_tj("{0} увидит твоё имя, ник и это сообщение. Если примет, тебе придёт приглашение в круг и в поездку.", asking.amir ? _tj("Амир {0}", asking.amir) : _t("Амир"))}</small>
            <textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={_t("Ассаляму алейкум! Пару слов о себе: откуда летишь, первая ли умра")} />
            <button type="button" className="gold-btn" disabled={busy} onClick={send}>{busy ? _t("Отправляю…") : _t("Отправить просьбу")}</button>
            <button type="button" className="link-btn" onClick={() => setAsking(null)}>{_t("Не сейчас")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The amir opens his trip in «Ищут людей»: how many places, who is welcome, a few words.
 *  Three clear states: a draft (one button shows it), unsaved changes (save or undo), saved (with the time and how others see it). */
type Listing = { places: number; who: Who; note: string };
export function OpenSwitch({ code, going, title, month, amir }: { code: string; going: number; title: string; month?: string; amir: string }) {
  const KEY = `lm.uoDraft.${code}`, TKEY = `lm.uoSaved.${code}`;
  const [cur, setCur] = useState<Listing | null | undefined>(undefined);
  const [draft, setDraftS] = useState<Listing>({ places: 2, who: 'brothers', note: '' });
  const [at, setAt] = useState<string>(() => { try { return localStorage.getItem(TKEY) ?? ''; } catch { return ''; } });
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const setDraft = (d: Listing) => { setDraftS(d); setSt(''); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* */ } };
  useEffect(() => {
    openMine().then((m) => {
      setCur(m ?? null);
      let kept: Listing | null = null;
      try { kept = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* */ }
      if (kept) setDraftS(kept); else if (m) setDraftS({ places: m.places, who: m.who, note: m.note });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const on = Boolean(cur);
  const dirty = on && (cur!.places !== draft.places || cur!.who !== draft.who || cur!.note.trim() !== draft.note.trim());
  // Leaving the page with unsaved changes: the browser asks.
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [dirty]);
  if (cur === undefined) return null;
  const save = async (p: Listing | null) => {
    if (busy) return;
    setBusy(true); setSt(_t("Сохраняю…"));
    const q = p ? { ...p, note: p.note.trim() } : null;
    const r = await openSet(code, q);
    setBusy(false);
    if (r === 'ok') {
      setCur(q);
      const t = new Date().toTimeString().slice(0, 5);
      setAt(t); try { localStorage.setItem(TKEY, t); localStorage.removeItem(KEY); } catch { /* */ }
      if (q) setDraftS(q);
      setSt(q ? '' : _t("Группа скрыта из списка. Текст остался, можно показать снова."));
    } else setSt(r === 'no_trip' ? _t("Сначала сохрани поездку.") : _t("Не получилось. Проверь интернет и попробуй ещё раз."));
  };
  const undo = () => { if (cur) { setDraftS(cur); setSt(''); try { localStorage.removeItem(KEY); } catch { /* */ } } };
  const state = !on ? 'draft' : dirty ? 'dirty' : 'saved';
  const pill = state === 'draft' ? _t("Черновик · никто не видит") : state === 'dirty' ? _t("● Есть несохранённые изменения") : at ? _tj("✓ Видна в «Ищут людей» · сохранено {0}", at) : _t("✓ Видна в «Ищут людей»");
  return (
    <div className="uo-open">
      <div className="uo-open-h">
        <b>{_t("Ищем людей")}</b>
        <span className={`uo-pill ${state}`} role="status">{pill}</span>
      </div>
      <label className="uo-l">{_t("Сколько ещё мест")}</label>
      <div className="uo-places">{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={draft.places === n} onClick={() => setDraft({ ...draft, places: n })}>{n}</button>)}</div>
      <label className="uo-l">{_t("Кого ждём")}</label>
      <div className="uo-who">{(['brothers', 'families', 'sisters', 'all'] as const).map((k) => <button key={k} type="button" aria-pressed={draft.who === k} onClick={() => setDraft({ ...draft, who: k })}>{WHO[k]}</button>)}</div>
      <label className="uo-l" htmlFor="uo-note">{_t("Пару слов о группе")}</label>
      <textarea id="uo-note" rows={2} maxLength={200} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder={_t("Например: билеты берём вместе в начале месяца, отель рядом с Харамом")} />
      <small className="uo-count">{draft.note.length} / 200</small>
      {state === 'draft' && (
        <>
          <button type="button" className="gold-btn uo-go" disabled={busy} onClick={() => save(draft)}>{busy ? _t("Сохраняю…") : _t("Показать группу в «Ищут людей»")}</button>
          <small className="uo-hint">{_t("Черновик хранится на телефоне, пока ты не нажмёшь")}</small>
        </>
      )}
      {state === 'dirty' && (
        <>
          <div className="uo-row">
            <button type="button" className="pri-btn uo-go" disabled={busy} onClick={() => save(draft)}>{busy ? _t("Сохраняю…") : _t("Сохранить изменения")}</button>
            <button type="button" className="ghost-btn" disabled={busy} onClick={undo}>{_t("Отменить")}</button>
          </div>
          <small className="uo-hint">{_t("Пока не сохранишь, другие видят старый текст")}</small>
        </>
      )}
      {state === 'saved' && cur && (
        <>
          <div className="uo-preview">
            <em>{_t("Так группу видят другие")}</em>
            <b>{title}{month ? ` · ${month}` : ''}</b>
            <small>{_tj("Амир {0} · едут {1} · нужно мест: {2} · {3}", amir, going, cur.places, WHO[cur.who].toLowerCase())}</small>
            {cur.note && <span>«{cur.note}»</span>}
          </div>
          <button type="button" className="ghost-btn uo-hide" disabled={busy} onClick={() => save(null)}>{_t("Скрыть группу из списка")}</button>
        </>
      )}
      {st && <small className="uo-st" role="status">{st}</small>}
      <p className="uo-lock">{_tj("🔒 Чужим видно только: название, месяц, город, твоё имя, сколько едут ({0}) и сколько мест. Остальные имена, чат, документы и касса видны только тем, кого ты примешь.", going)}</p>
    </div>
  );
}

/** Requests to my trip: accept (the circle invite goes out), write back once, or no. */
export function AsksToMe({ asks, title, onAccepted }: { asks: AskToMe[]; title: string; onAccepted: (uid: string, name: string) => void }) {
  const [writing, setWriting] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [done, setDone] = useState<Record<string, string>>({});
  // The trip chat scrolls itself down; a new request must be seen first.
  const n = asks.length;
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => document.querySelector('.uo-asks')?.scrollIntoView({ block: 'start' }), 900);
    return () => clearTimeout(t);
  }, [n > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!asks.length && !Object.keys(done).length) return null;
  const act = async (a: AskToMe, k: 'yes' | 'no' | 'reply') => {
    const r = await askAnswer(a.id, k, k === 'reply' ? text : '');
    if (r !== 'ok') { setDone({ ...done, [a.id]: r === 'full' ? _t("В круге уже 50 человек.") : _t("Не получилось. Попробуй ещё раз.") }); return; }
    if (k === 'yes') onAccepted(a.uid, a.name);
    setDone({ ...done, [a.id]: k === 'yes' ? _tj("✓ {0} получит приглашение в круг и в поездку", a.name) : k === 'no' ? _tj("{0} получит ответ «не в этот раз»", a.name) : _tj("✓ Ответ отправлен {0}", a.name) });
    setWriting(null); setText('');
    asksChanged();
  };
  const gone = Object.entries(done).filter(([id]) => !asks.some((a) => a.id === id));
  return (
    <div className="uo-asks">
      {gone.map(([id, m]) => <small key={id} className="uo-st" role="status">{m}</small>)}
      {asks.map((a) => (
        <div key={a.id} className="uo-askc">
          <small>{_tj("Просится в «{0}»", title)}</small>
          <b>{a.name || _t("Участник")}{a.nick ? ` · @${a.nick}` : ''}</b>
          {a.note && <p>«{a.note}»</p>}
          {a.reply && <p className="uo-reply"><b>{_t("Ты:")}</b> {a.reply}</p>}
          {done[a.id] ? <small className="uo-st">{done[a.id]}</small> : writing === a.id ? (
            <div className="uo-write">
              <textarea rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder={_t("Например: когда планируешь брать билет?")} autoFocus />
              <div className="uo-b"><button type="button" className="pri-btn" disabled={!text.trim()} onClick={() => act(a, 'reply')}>{_t("Отправить")}</button><button type="button" className="link-btn" onClick={() => setWriting(null)}>{_t("Отмена")}</button></div>
            </div>
          ) : (
            <div className="uo-b">
              <button type="button" className="gold-btn" onClick={() => act(a, 'yes')}>{_t("Принять")}</button>
              <button type="button" className="ghost-btn" onClick={() => { setWriting(a.id); setText(''); }}>{_t("Написать")}</button>
              <button type="button" className="ghost-btn" onClick={() => act(a, 'no')}>{_t("Нет")}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
