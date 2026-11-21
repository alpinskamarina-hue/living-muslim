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

/** The amir opens his trip in «Ищут людей»: how many places, who is welcome, a few words. */
export function OpenSwitch({ code, going }: { code: string; going: number }) {
  const [cur, setCur] = useState<{ places: number; who: Who; note: string } | null | undefined>(undefined);
  const [draft, setDraft] = useState<{ places: number; who: Who; note: string }>({ places: 2, who: 'brothers', note: '' });
  const [st, setSt] = useState('');
  useEffect(() => { openMine().then((m) => { setCur(m ?? null); if (m) setDraft({ places: m.places, who: m.who, note: m.note }); }); }, []);
  if (cur === undefined) return null;
  const on = Boolean(cur);
  const save = async (p: typeof draft | null) => {
    setSt(_t("Сохраняю…"));
    const r = await openSet(code, p);
    if (r === 'ok') { setCur(p); setSt(p ? _t("✓ Группа видна в «Ищут людей»") : _t("Группа скрыта из списка")); }
    else setSt(r === 'no_trip' ? _t("Сначала сохрани поездку.") : _t("Не получилось. Проверь интернет и попробуй ещё раз."));
  };
  const dirty = on && (cur!.places !== draft.places || cur!.who !== draft.who || cur!.note !== draft.note);
  return (
    <div className="uo-open">
      <div className="uo-open-h">
        <span><b>{_t("Ищем людей")}</b><small>{on ? _t("группа видна в «Ищут людей»") : _t("группа появится в «Ищут людей»")}</small></span>
        <button type="button" role="switch" aria-checked={on} className={`uo-sw${on ? ' on' : ''}`} aria-label={_t("Ищем людей")} onClick={() => save(on ? null : draft)}><i /></button>
      </div>
      <label className="uo-l">{_t("Сколько ещё мест")}</label>
      <div className="uo-places">{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={draft.places === n} onClick={() => setDraft({ ...draft, places: n })}>{n}</button>)}</div>
      <label className="uo-l">{_t("Кого ждём")}</label>
      <div className="uo-who">{(['brothers', 'families', 'sisters', 'all'] as const).map((k) => <button key={k} type="button" aria-pressed={draft.who === k} onClick={() => setDraft({ ...draft, who: k })}>{WHO[k]}</button>)}</div>
      <label className="uo-l">{_t("Пару слов о группе")}</label>
      <textarea rows={2} maxLength={200} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder={_t("Например: билеты берём вместе в начале месяца, отель рядом с Харамом")} />
      {dirty && <button type="button" className="pri-btn" onClick={() => save(draft)}>{_t("Сохранить")}</button>}
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
