import { useEffect, useRef, useState } from 'react';
import { cloudMe, myCircles, switchCircle, openCircleChat, blockUser, kindOf, meRpc, currentCircle, sendInvite } from '../cloud';
import { Ava } from './Nick';
import { SeekerCard } from './Nikah';
import { nikahFeed, useNikahMe, useNikahReady } from '../nikah';
import type { NkCard } from '../nikah';
import {
  INTENTS, KINDS, modeOf, ASK_LABEL, getPerson, myIntents, setIntent, setCity, intentsFeed, sendAsk, answerAsk, rangeOf,
  type Person, type Intent, type IntentKind, type AskKind, type FeedItem, type Ask, openPerson,
} from '../person';
import type { AppState } from '../types';
import { plural } from '../dates';
import { _t, _tj, LOC } from '../i18n';

const daysSince = (iso: string) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
function sinceLine(iso: string) {
  const d = daysSince(iso);
  if (d < 30) return _tj("с нами {0}  {1}", d, plural(d, _t("день"), _t("дня"), _t("дней")));
  const m = Math.round(d / 30);
  return _tj("с нами {0}  {1}", m, plural(m, _t("месяц"), _t("месяца"), _t("месяцев")));
}
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? _t("сегодня") : d === 1 ? _t("вчера") : _tj("{0}  {1} назад", d, plural(d, _t("день"), _t("дня"), _t("дней")));
};
const askTemplate = (k: AskKind, name: string, i?: Intent) => {
  const first = name.split(' ')[0];
  if (k === 'umrah') return _t("Ассаляму алейкум, {0}! Хочу на умру с вами{1}. Расскажешь подробнее?", first, i?.title ? ` (${i.title})` : '');
  if (k === 'job') return i?.mode === 'hire' ? _t("Ассаляму алейкум, {0}! Хочу откликнуться: {1}. Немного о себе: ", first, i.title || _t("на вакансию")) : _t("Ассаляму алейкум, {0}! Есть предложение по работе: ", first);
  if (k === 'biz') return _t("Ассаляму алейкум, {0}! Про «{1}»: ", first, i?.title || _t("твой проект"));
  if (k === 'study') return _t("Ассаляму алейкум, {0}! Давай учиться вместе: ", first);
  return _t("Ассаляму алейкум, {0}! ", first);
};

/** Mounted once in the app: shows a person's profile over everything when someone taps an avatar or a name. */
export function PersonHost({ state, onSeek }: { state: AppState; onSeek: () => void }) {
  const [uid, setUid] = useState('');
  const pushed = useRef(false);
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<{ uid: string }>).detail?.uid;
      if (!id) return;
      setUid(id);
      if (!pushed.current) { history.pushState({ lmPerson: 1 }, ''); pushed.current = true; }
    };
    // capture phase + stop: the back that closes the profile must not also move the Circle screen back
    const pop = (e: Event) => { if (pushed.current) { pushed.current = false; setUid(''); e.stopImmediatePropagation(); } };
    window.addEventListener('lm-person', open);
    window.addEventListener('popstate', pop, true);
    return () => { window.removeEventListener('lm-person', open); window.removeEventListener('popstate', pop, true); };
  }, []);
  useEffect(() => { document.body.classList.toggle('pp-on', Boolean(uid)); }, [uid]);
  if (!uid) return null;
  const close = () => { if (pushed.current) history.back(); else setUid(''); };
  return <PersonPage key={uid} uid={uid} state={state} onClose={close} onSeek={() => { close(); setTimeout(onSeek, 60); }} />;
}

function PersonPage({ uid, onClose, onSeek, state }: { uid: string; onClose: () => void; onSeek: () => void; state: AppState }) {
  const me = cloudMe()?.uid;
  const [p, setP] = useState<Person | null | undefined>(undefined);
  const [ask, setAsk] = useState<{ k: AskKind; i?: Intent } | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [nk, setNk] = useState<NkCard | null>(null);
  const [menu, setMenu] = useState(false);
  const nkOn = useNikahReady();
  useEffect(() => { getPerson(uid).then(setP); }, [uid]);
  // the nikah card comes from the nikah feed of a circle we share, so the wali rules stay the same
  useEffect(() => {
    if (!nkOn || !p || !p.intents.some((i) => i.kind === 'nikah')) return;
    let alive = true;
    (async () => { for (const code of p.shared) { const l = await nikahFeed(code); const c = l.find((x) => x.uid === uid); if (c) { if (alive) setNk({ ...c, code } as NkCard & { code: string }); return; } } })();
    return () => { alive = false; };
  }, [nkOn, p, uid]);

  const self = uid === me;
  const top = (
    <div className="pp-top">
      <button type="button" aria-label={_t("Назад")} onClick={onClose}>←</button>
      <b>{self ? _t("Мой профиль глазами других") : _t("Профиль")}</b>
      {!self && p && <button type="button" className="pp-more" aria-label={_t("Ещё")} onClick={() => setMenu((x) => !x)}>⋮</button>}
    </div>
  );
  if (p === undefined) return <div className="pp">{top}<p className="pp-load">{_t("Загружаю…")}</p></div>;
  if (!p) return <div className="pp">{top}<p className="pp-load">{_t("Профиль закрыт или недоступен.")}</p></div>;

  const mine = new Map(myCircles().map((c) => [c.code, c]));
  const shared = p.shared.map((c) => mine.get(c)).filter(Boolean) as ReturnType<typeof myCircles>;
  const chatRef = p.chat ? mine.get(p.chat) ?? { code: p.chat, title: p.name, kind: 'friends' as const } : null;
  const visible = p.intents.filter((i) => i.kind !== 'nikah' || nk || self);
  const sister = p.gender === 'f' && p.can.hi === 'sister';
  const cur = currentCircle();
  const canInvite = !self && cur && !p.shared.includes(cur.code) && p.can.hi !== 'sister' && p.can.hi !== 'closed';
  const startAsk = (k: AskKind, i?: Intent) => { setAsk({ k, i }); setText(askTemplate(k, p.name, i)); setMsg(''); };
  const send = async () => {
    if (!ask) return;
    const r = await sendAsk(p.uid, ask.k, text.trim());
    if (r === 'ok') { setAsk(null); setP({ ...p, asked: true }); setMsg(_t("Отправлено. Когда {0} ответит, у вас откроется чат в «Кругах».", p.name.split(' ')[0])); }
    else setMsg(r === 'already' ? _t("Ты уже написал. Ждём ответа.") : r === 'slow' ? _t("Сегодня уже много сообщений. Попробуй завтра.") : r === 'sister' ? _t("Сёстрам могут писать только сёстры.") : _t("Не удалось отправить."));
  };
  const invite = async () => {
    if (!cur) return;
    const r = await sendInvite(cur.code, p.uid);
    setMsg(r === 'ok' ? _t("Приглашение в «{0}» отправлено.", cur.title) : r === 'already_in' ? _t("Уже в этом круге.") : _t("Не получилось пригласить. Можно отправить ссылку из круга."));
  };
  const umrahHint = self ? rangeOf(state.umrah?.from, state.umrah?.to, LOC) : '';

  return (
    <div className="pp">
      {top}
      {menu && (
        <div className="pp-menu">
          <button type="button" onClick={async () => { setMenu(false); if (!confirm(_t("Заблокировать {0}? Он не сможет писать и звать тебя, и ты не увидишь его профиль.", p.name))) return; if (await blockUser(p.uid)) onClose(); }}>{_t("🚫 Заблокировать")}</button>
          <button type="button" onClick={() => setMenu(false)}>{_t("Закрыть")}</button>
        </div>
      )}
      <div className="pp-hd">
        <Ava pick={p.avatar} color={p.color} photo={p.photo} name={p.name} size={88} />
        <b>{p.name || _t("Участник")}</b>
        <small>{[p.nick && `@${p.nick}`, p.city, sinceLine(p.since)].filter(Boolean).join(' · ')}</small>
        {p.bio && <p className="pp-bio">{p.bio}</p>}
        {visible.length > 0 && <div className="pp-tags">{visible.map((i) => <span key={i.kind} className={`pp-tag t-${INTENTS[i.kind].cls}`}>{INTENTS[i.kind].ic} {i.kind === 'nikah' ? _t("Ищет никах") : modeOf(i).tag}</span>)}</div>}
        {self ? (
          <div className="pp-btns"><button type="button" onClick={onSeek}><i>✎</i>{_t("Что я ищу")}</button></div>
        ) : (
          <div className="pp-btns">
            {chatRef ? <button type="button" onClick={() => openCircleChat(chatRef)}><i>💬</i>{_t("Чат")}</button>
              : p.can.hi === 'ok' && <button type="button" disabled={p.asked} onClick={() => startAsk('hi')}><i>💬</i>{p.asked ? _t("Ждём ответа") : _t("Написать")}</button>}
            {canInvite && <button type="button" onClick={invite}><i>➕</i>{_t("В круг")}</button>}
          </div>
        )}
      </div>
      {msg && <p className="pp-msg">{msg}</p>}
      {ask && (
        <div className="pp-ask">
          <b>{ask.k === 'hi' ? _t("Первое сообщение") : _t("Сообщение {0}", ASK_LABEL[ask.k])}</b>
          <textarea rows={4} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <small>{_t("Если {0} согласится, у вас откроется чат на двоих. Номер телефона никто не увидит.", p.name.split(' ')[0])}</small>
          <div className="pp-row"><button type="button" className="link-btn" onClick={() => setAsk(null)}>{_t("Отмена")}</button><button type="button" className="pri-btn" disabled={text.trim().length < 5} onClick={send}>{_t("Отправить")}</button></div>
        </div>
      )}
      {(visible.length > 0 || self) && (
        <div className="pp-sec">
          <h4>{_t("Сейчас")}</h4>
          {self && !visible.length && <p className="pp-empty">{_t("Пока ничего. Добавь, что ищешь: умру, работу, партнёра, напарника по учёбе.")}</p>}
          {visible.map((i) => {
            const m = INTENTS[i.kind];
            if (i.kind === 'nikah') return nk ? <SeekerCard key="nk" c={nk} code={(nk as NkCard & { code: string }).code} /> : self ? <div key="nk" className="pp-it i-n"><b>💍 {_t("Ищу никах")}</b><p>{_t("Значок видят только круги из твоей анкеты «Никах»")}</p></div> : null;
            const can = !self && p.can[i.kind as AskKind] === 'ok' && !chatRef;
            return (
              <div key={i.kind} className={`pp-it i-${m.cls}`}>
                <b>{m.ic} {modeOf(i).tag}{i.title ? `: ${i.title}` : ''}</b>
                {i.note && <p>{i.note}</p>}
                {self && i.until < new Date().toISOString().slice(0, 10) && <p className="pp-old">{_t("Срок вышел, другие уже не видят. Продли в «Что я ищу».")}</p>}
                {can && <button type="button" className="go" disabled={p.asked} onClick={() => startAsk(i.kind as AskKind, i)}>{p.asked ? _t("Ждём ответа") : modeOf(i).btn}</button>}
                {chatRef && !self && <button type="button" className="go" onClick={() => openCircleChat(chatRef)}>{_t("💬 В ваш чат")}</button>}
              </div>
            );
          })}
          {self && umrahHint && !visible.some((i) => i.kind === 'umrah') && <p className="pp-empty">{_t("У тебя поездка {0}. Можно показать её в профиле.", umrahHint)}</p>}
        </div>
      )}
      {sister && <p className="pp-lock">{_t("🔒 Фото, «Написать» и сообщения от братьев закрыты. Это настройки сестры. Никах только через её вали.")}</p>}
      {shared.length > 0 && (
        <div className="pp-sec">
          <h4>{_tj("Общие круги · {0}", shared.length)}</h4>
          {shared.map((c) => (
            <button key={c.code} type="button" className="pp-cr" onClick={() => { onClose(); setTimeout(() => switchCircle(c.code), 60); }}>
              <span>{kindOf(c.kind)?.ic ?? '👥'}</span><b>{c.title}</b><i>›</i>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Profile → «Что я сейчас ищу». */
export function SeekPage({ state, onNikah }: { state: AppState; onNikah: () => void }) {
  const [list, setList] = useState<Intent[] | null>(null);
  const [city, setCityV] = useState('');
  const [open, setOpen] = useState<IntentKind | ''>('');
  const [draft, setDraft] = useState<Partial<Intent>>({});
  const [tell, setTell] = useState(true);
  const [msg, setMsg] = useState('');
  const nkOn = useNikahReady();
  const nk = useNikahMe(nkOn);
  const reload = () => myIntents().then((r) => { setList(r?.list ?? []); if (r) setCityV(r.city || ''); });
  useEffect(() => { reload(); }, []);
  if (!list) return <p className="tiny">{_t("Загружаю…")}</p>;
  const today = new Date().toISOString().slice(0, 10);
  const have = new Map(list.map((i) => [i.kind, i]));
  const edit = (k: IntentKind) => {
    const i = have.get(k);
    const um = k === 'umrah' && !i && state.umrah?.from ? rangeOf(state.umrah.from, state.umrah.to, LOC) : '';
    setDraft(i ? { ...i } : { mode: INTENTS[k].modes[0].id, title: um, note: '', vis: 'circles' });
    setTell(!i); setOpen(k); setMsg('');
  };
  /** The switch turns on at once (no title needed); the editor stays open to pick a mode or add words. */
  const turnOn = async (k: IntentKind) => {
    const um = k === 'umrah' && state.umrah?.from ? rangeOf(state.umrah.from, state.umrah.to, LOC) : '';
    const d = { mode: INTENTS[k].modes[0].id, title: um, note: '', vis: 'circles' as const };
    setList((l) => [...(l ?? []).filter((x) => x.kind !== k), { ...d, kind: k, until: '9999-12-31' } as Intent]);
    setDraft(d); setTell(true); setOpen(k); setMsg('');
    const r = await setIntent(k, d);
    if (r !== 'ok') { setMsg(_t("Не удалось сохранить.")); }
    reload();
  };
  const save = async (k: IntentKind) => {
    const r = await setIntent(k, { mode: draft.mode ?? '', title: draft.title ?? '', note: draft.note ?? '', vis: draft.vis ?? 'circles' });
    if (r !== 'ok') { setMsg(_t("Не удалось сохранить.")); return; }
    if (tell && k !== 'nikah') {
      const m = INTENTS[k];
      const mode = m.modes.find((x) => x.id === draft.mode) ?? m.modes[0];
      const body = `${mode.tag.toLowerCase()}${draft.title ? `: ${draft.title}` : ''}${draft.note ? `. ${draft.note}` : ''}`.slice(0, 300);
      const ref = { t: 'in', k, to: cloudMe()?.uid };
      await Promise.all(myCircles().filter((c) => c.kind !== 'friends').map((c) => meRpc('lm_chat_send', { p_code: c.code, p_body: body, p_ref: ref, p_kind: 'event' }).catch(() => null)));
    }
    setOpen(''); setMsg(tell && k !== 'nikah' ? _t("Сохранено. Твои круги увидят карточку в чате.") : _t("Сохранено.")); reload();
  };
  const off = async (k: IntentKind) => { await setIntent(k, null); setOpen(''); reload(); };
  const nkActive = Boolean(nk?.mine?.active);

  return (
    <div className="sk">
      <label className="sk-city"><span>{_t("Город")}</span><input value={city} maxLength={40} placeholder={_t("Например: Казань")} onChange={(e) => setCityV(e.target.value)} onBlur={() => setCity(city)} /></label>
      {msg && <p className="pp-msg">{msg}</p>}
      {KINDS.map((k) => {
        const m = INTENTS[k];
        const i = have.get(k);
        const old = i && i.until < today;
        const on = Boolean(i);
        return (
          <div key={k} className={`sk-row${open === k ? ' open' : ''}`}>
            <div className="sk-h">
              <span className={`sk-e e-${m.cls}`}>{m.ic}</span>
              <button type="button" className="sk-x" onClick={() => (k === 'nikah' ? undefined : open === k ? setOpen('') : edit(k))}>
                <b>{m.label}</b>
                <small>{i && k !== 'nikah' ? `${modeOf(i).tag}${i.title ? `: ${i.title}` : ''}` : m.sub}</small>
                {old && <small className="pp-old">{_t("Срок вышел, никто не видит. Нажми «Сохранить», чтобы продлить на 60 дней")}</small>}
              </button>
              <button type="button" role="switch" aria-checked={on} aria-label={m.label} className={`sk-sw${on ? ' on' : ''}`}
                onClick={() => { if (on) off(k); else if (k === 'nikah') { if (nkActive) setIntent('nikah', { mode: '', title: '', note: '', vis: 'circles' }).then(reload); else onNikah(); } else turnOn(k); }} />
            </div>
            {k === 'nikah' && !nkActive && <p className="sk-note">{_t("Сначала заполни анкету в Профиль → Никах. Значок увидят только круги, которые ты там выберешь.")} <button type="button" className="link-btn" onClick={onNikah}>{_t("Открыть «Никах»")}</button></p>}
            {open === k && k !== 'nikah' && (
              <div className="sk-ed">
                <div className="sk-chips">{m.modes.map((x) => <button key={x.id} type="button" aria-pressed={draft.mode === x.id} onClick={() => setDraft({ ...draft, mode: x.id })}>{x.label}</button>)}</div>
                <input value={draft.title ?? ''} maxLength={80} placeholder={m.ph} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <input value={draft.note ?? ''} maxLength={140} placeholder={m.ph2} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                <div className="sk-vis"><span>{_t("Кто видит")}</span>
                  <button type="button" aria-pressed={(draft.vis ?? 'circles') === 'circles'} onClick={() => setDraft({ ...draft, vis: 'circles' })}>{_t("Мои круги")}</button>
                  <button type="button" aria-pressed={draft.vis === 'all'} onClick={() => setDraft({ ...draft, vis: 'all' })}>{_t("Все, кто найдёт по нику")}</button>
                </div>
                <label className="sk-tell"><input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /><span>{_t("Сказать моим кругам в чате, чтобы подсказали")}</span></label>
                <div className="pp-row">
                  <button type="button" className="link-btn" onClick={() => setOpen('')}>{_t("Закрыть")}</button>
                  <button type="button" className="pri-btn" onClick={() => save(k)}>{_t("Сохранить")}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="sk-foot">{_t("Через 60 дней пункт скроется сам, и мы спросим, актуально ли ещё. Номер телефона и почта в профиле не показываются никогда: связь только через чат в приложении.")}</p>
      <button type="button" className="pri-btn sk-see" onClick={() => { const id = cloudMe()?.uid; if (id) openPerson(id); }}>{_t("👁 Как мой профиль видят другие")}</button>
    </div>
  );
}

/** «Кто что ищет» in my circles. */
export function IntentsFeed({ onBack }: { onBack?: () => void }) {
  const [list, setList] = useState<FeedItem[] | null>(null);
  const [f, setF] = useState<IntentKind | ''>('');
  useEffect(() => { intentsFeed().then(setList); }, []);
  const kinds = KINDS.filter((k) => list?.some((x) => x.kind === k));
  const shown = (list ?? []).filter((x) => !f || x.kind === f);
  const circleOf = (code: string | null) => myCircles().find((c) => c.code === code)?.title;
  return (
    <div className="page if-page">
      <div className="pp-top">{onBack && <button type="button" aria-label={_t("Назад")} onClick={onBack}>←</button>}<b>{_t("Кто что ищет")}</b></div>
      {kinds.length > 1 && (
        <div className="wa-filt">
          <button type="button" aria-pressed={!f} onClick={() => setF('')}>{_t("Все")}</button>
          {kinds.map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{INTENTS[k].ic} {INTENTS[k].label}</button>)}
        </div>
      )}
      {list === null && <p className="pp-load">{_t("Загружаю…")}</p>}
      {list && !list.length && <p className="pp-empty if-empty">{_t("В твоих кругах пока никто ничего не ищет. Добавь своё в Профиль → «Что я сейчас ищу», и братья смогут подсказать.")}</p>}
      {shown.map((x) => {
        const m = INTENTS[x.kind];
        return (
          <button key={`${x.uid}${x.kind}`} type="button" className="if-card" onClick={() => openPerson(x.uid)}>
            <span className="if-av"><Ava pick={x.avatar} color={x.color} photo={x.photo} name={x.name} size={42} /><em>{m.ic}</em></span>
            <span className="if-x">
              <b>{x.name.split(' ')[0]} {x.kind === 'nikah' ? _t("ищет никах") : modeOf(x).tag.toLowerCase()}</b>
              {x.kind !== 'nikah' && <span>{[x.title, x.note].filter(Boolean).join(' · ')}</span>}
              <small>{[circleOf(x.code), x.city, ago(x.updated)].filter(Boolean).join(' · ')}</small>
              <i className={`if-go g-${m.cls}`}>{x.kind === 'nikah' ? _t("Открыть") : modeOf(x).btn}</i>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** People who asked to get in touch with me: yes opens a chat of two. */
export function AsksBox({ list, reload }: { list: Ask[]; reload: () => void }) {
  const [busy, setBusy] = useState('');
  if (!list.length) return null;
  const answer = async (a: Ask, yes: boolean) => {
    setBusy(a.id);
    const r = await answerAsk(a.id, yes);
    setBusy('');
    if (yes && r) { openCircleChat(r); return; }
    reload();
  };
  return (
    <div className="ak-box">
      {list.map((a) => (
        <div key={a.id} className="ak">
          <button type="button" className="ak-who" onClick={() => openPerson(a.from.uid)}>
            <Ava pick={a.from.avatar} color={a.from.color} photo={a.from.photo} name={a.from.name} size={40} />
            <span><b>{a.from.name}</b><small>{a.kind === 'hi' ? ASK_LABEL.hi : _t("пишет тебе {0}", ASK_LABEL[a.kind])}</small></span>
          </button>
          {a.note && <q>{a.note}</q>}
          <div className="pp-row">
            <button type="button" className="link-btn" disabled={busy === a.id} onClick={() => answer(a, false)}>{_t("Не сейчас")}</button>
            <button type="button" className="pri-btn" disabled={busy === a.id} onClick={() => answer(a, true)}>{_t("Ответить в чате")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
