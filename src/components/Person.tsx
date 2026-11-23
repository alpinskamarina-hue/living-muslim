import { Ic } from './LIcon';
import { useEffect, useRef, useState } from 'react';
import { cloudMe, myCircles, switchCircle, openCircleChat, blockUser, kindOf, meRpc, currentCircle, sendInvite } from '../cloud';
import { Ava } from './Nick';
import { SeekerCard } from './Nikah';
import { nikahFeed, useNikahMe, useNikahReady } from '../nikah';
import type { NkCard } from '../nikah';
import {
  INTENTS, KINDS, modeOf, ASK_LABEL, getPerson, reportAsk, myIntents, setIntent, setCity, intentsFeed, sendAsk, answerAsk, rangeOf,
  type Person, type Intent, type IntentKind, type AskKind, type FeedItem, type Ask, openPerson,
} from '../person';
import type { AppState } from '../types';
import { plural } from '../dates';
import { guideMine, guidesOk, type MyGuide } from '../guides';
import { _t, _tj, LOC } from '../i18n';
import { PathView, PathSettingsPage, TOPICS, topicLabel } from './PathView';
import { useDmReady, dmCan, openDm, dmWhy, type DmMode } from '../dm';
import { dayKey } from '../dates';
import { foundersReady, founderOf, type Tier } from '../founders';
import { tierName } from './Founders';

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
const PRACTICAL = ['question', 'umrah', 'learn', 'job', 'biz'];
const askTemplate = (k: AskKind, name: string, i?: Intent) => {
  const first = name.split(' ')[0];
  if (k === 'umrah') return _t("Ассаляму алейкум, {0}! Хочу на умру с вами{1}. Расскажешь подробнее?", first, i?.title ? ` (${i.title})` : '');
  if (k === 'job') return i?.mode === 'hire' ? _t("Ассаляму алейкум, {0}! Хочу откликнуться: {1}. Немного о себе: ", first, i.title || _t("на вакансию")) : _t("Ассаляму алейкум, {0}! Есть предложение по работе: ", first);
  if (k === 'biz') return _t("Ассаляму алейкум, {0}! Про «{1}»: ", first, i?.title || _t("твой проект"));
  if (k === 'study') return _t("Ассаляму алейкум, {0}! Давай учиться вместе: ", first);
  return _t("Ассаляму алейкум, {0}! ", first);
};

/** Mounted once in the app: shows a person's profile over everything when someone taps an avatar or a name. */
export function PersonHost({ state, update, onSeek }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; onSeek: () => void }) {
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
  return <PersonPage key={uid} uid={uid} state={state} update={update} onClose={close} onSeek={() => { close(); setTimeout(onSeek, 60); }} />;
}

function PersonPage({ uid, onClose, onSeek, state, update }: { uid: string; onClose: () => void; onSeek: () => void; state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const [settings, setSettings] = useState(false);
  const [topic, setTopic] = useState('');
  const me = cloudMe()?.uid;
  const [p, setP] = useState<Person | null | undefined>(undefined);
  const [ask, setAsk] = useState<{ k: AskKind; i?: Intent } | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [nk, setNk] = useState<NkCard | null>(null);
  const [menu, setMenu] = useState(false);
  const nkOn = useNikahReady();
  const dmOn = useDmReady();
  const [dmc, setDmc] = useState<{ mode: DmMode; chat: string | null; ask: string; hi: string } | null>(null);
  const [biz, setBiz] = useState(false);
  useEffect(() => { getPerson(uid).then(setP); }, [uid]);
  const [founder, setFounder] = useState<Tier | null>(null);
  useEffect(() => { setFounder(null); foundersReady().then((ok) => { if (ok) founderOf(uid).then(setFounder); }); }, [uid]);
  useEffect(() => { if (dmOn && uid !== me) dmCan(uid).then(setDmc); }, [dmOn, uid, me]);
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
  const canInvite = !self && cur && !p.shared.includes(cur.code) && !['sister', 'sister_topic', 'closed'].includes(p.can.hi ?? '');
  // «Написать» starts with a topic: the person sees what you want and decides; about a published intent the topic is known.
  const startAsk = (k: AskKind, i?: Intent, practical = false) => { setBiz(practical); setAsk({ k, i }); setTopic(''); setText(k === 'hi' ? '' : askTemplate(k, p.name, i)); setMsg(''); };
  const first = p.name.split(' ')[0];
  const minLen = ask?.k === 'hi' ? 20 : 10;
  const send = async (kind?: AskKind) => {
    const k = kind ?? ask?.k;
    if (!k || k === 'hi') return;
    const r = await sendAsk(p.uid, k, text.trim());
    if (r === 'ok') { setAsk(null); setP({ ...p, asked: true }); setMsg(_t("Просьба отправлена. Когда {0} примет её, у вас откроется чат в «Кругах».", first)); }
    else setMsg(r === 'sister_topic' ? _t("Сестре можно написать только по делу: вопрос, умра, учёба, работа или бизнес.") : r === 'new' ? dmWhy('new') : r === 'locked' ? dmWhy('locked') : r === 'already' ? _t("Ты уже написал. Ждём ответа.") : r === 'slow' ? _t("Сегодня уже 5 просьб. Попробуй завтра.") : r === 'sister' ? _t("Сёстрам могут писать только сёстры.")
      : r === 'later' ? _t("{0} уже ответил «не сейчас». Написать снова можно через 30 дней.", first) : r === 'circles' ? _t("{0} принимает просьбы только от людей из своих кругов.", first)
      : r === 'short' ? _t("Напиши чуть подробнее, что ты хочешь.") : r === 'closed' ? _t("{0} сейчас не принимает просьбы.", first) : _t("Не удалось отправить."));
  };
  if (settings) return <PathSettingsPage state={state} update={update} today={dayKey(new Date())} onBack={() => setSettings(false)} />;
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
        {founder && <div className="pp-tags"><span className={`pp-tag t-founder t-${founder}`}>◆ {_t("Основатель Living Muslim")} · {tierName(founder)}</span></div>}
        {visible.length > 0 && <div className="pp-tags">{visible.map((i) => <span key={i.kind} className={`pp-tag t-${INTENTS[i.kind].cls}`}>{INTENTS[i.kind].ic} {i.kind === 'nikah' ? _t("Ищет никах") : modeOf(i).tag}</span>)}</div>}
        {self ? (
          <div className="pp-btns"><button type="button" onClick={onSeek}><i>✎</i>{_t("Что я ищу")}</button></div>
        ) : (
          <div className="pp-btns">
            {chatRef ? <button type="button" onClick={() => openCircleChat(chatRef)}><i>💬</i>{_t("Чат")}</button>
              : dmc?.mode === 'direct' ? <button type="button" onClick={async () => { const e = await openDm(p.uid); if (e) setMsg(dmWhy(e, first)); }}><i>💬</i>{_t("Написать")}</button>
                : p.can.hi === 'ok' ? <button type="button" disabled={p.asked} onClick={() => startAsk('hi')}><i>💬</i>{p.asked ? _t("Ждём ответа") : _t("Написать")}</button>
                  : dmc?.ask === 'ok' && <button type="button" disabled={p.asked} onClick={() => startAsk('hi', undefined, true)}><i>💬</i>{p.asked ? _t("Ждём ответа") : _t("Написать по делу")}</button>}
            {canInvite && <button type="button" onClick={invite}><i>➕</i>{_t("В круг")}</button>}
          </div>
        )}
      </div>
      {msg && <p className="pp-msg">{msg}</p>}
      {ask && ask.k === 'hi' && (
        <div className="pp-ask pp-topic">
          <b>{_t("О чём ты хочешь написать?")}</b>
          {biz && <p className="note">{_tj("🤍 Переписка брата и сестры только по делу. {0} сама решит, принять ли просьбу. Хочешь познакомиться для никаха? Это делается через раздел «Никах», с вали.", first)}</p>}
          <small>{_t("Выбери тему. {0} увидит тему, твоё имя и это сообщение, и сам решит, отвечать или нет.", first)}</small>
          <div className="pp-why" role="radiogroup" aria-label={_t("Тема")}>
            {TOPICS.filter((t) => !biz || PRACTICAL.includes(t.k)).map((t) => <button key={t.k} type="button" role="radio" aria-checked={topic === t.k} onClick={() => setTopic(t.k)}>{t.l}</button>)}
          </div>
          <textarea rows={4} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder={_t("Ассаляму алейкум! Коротко: кто ты и чего хочешь")} />
          <small className="pp-cnt">{_tj("{0} / 300 · минимум {1} знаков", text.trim().length, minLen)}</small>
          <div className="pp-row"><button type="button" className="link-btn" onClick={() => setAsk(null)}>{_t("Отмена")}</button><button type="button" className="gold-btn" disabled={!topic || text.trim().length < minLen} onClick={() => send(topic as AskKind)}>{_t("Отправить просьбу")}</button></div>
          <small>{_t("🔒 Номер телефона и почту никто не видит. В день можно отправить 5 просьб. После «Не сейчас» тому же человеку можно написать снова через 30 дней.")}</small>
        </div>
      )}
      {ask && ask.k !== 'hi' && (
        <div className="pp-ask">
          <b>{_t("Сообщение {0}", ASK_LABEL[ask.k])}</b>
          <textarea rows={4} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <small>{_t("Если {0} согласится, у вас откроется чат на двоих. Номер телефона никто не увидит.", first)}</small>
          <div className="pp-row"><button type="button" className="link-btn" onClick={() => setAsk(null)}>{_t("Отмена")}</button><button type="button" className="pri-btn" disabled={text.trim().length < 10} onClick={() => send()}>{_t("Отправить")}</button></div>
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
      <PathView uid={p.uid} self={self} onSettings={() => setSettings(true)} />
      {sister && <p className="pp-lock">{_t("🔒 Фото, «Написать» и сообщения от братьев закрыты. Это настройки сестры. Никах только через её вали.")}</p>}
      {shared.length > 0 && (
        <div className="pp-sec">
          <h4>{_tj("Общие круги · {0}", shared.length)}</h4>
          {shared.map((c) => (
            <button key={c.code} type="button" className="pp-cr" onClick={() => { onClose(); setTimeout(() => switchCircle(c.code), 60); }}>
              <span><Ic e={kindOf(c.kind)?.ic ?? '👥'} /></span><b>{c.title}</b><i>›</i>
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
  const [gd, setGd] = useState<MyGuide | null | undefined>(undefined);
  useEffect(() => { guideMine().then((m) => { if (guidesOk !== false) setGd(m ?? null); }); }, []);
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
      {gd !== undefined && (
        <a className="sk-row sk-guide" href="/app/?umrah=become"><span className="sk-h">
          <span className="sk-e">🧭</span>
          <span className="sk-x"><b>{_t("Я гид по умре")}</b><small>{gd ? (gd.status === 'ok' ? _t("✓ Ты в списке гидов · открыть") : gd.status === 'no' ? _t("Заявка не прошла · исправить") : _t("Заявка на проверке · открыть")) : _t("Подать заявку: проверим диплом и рекомендацию ›")}</small></span>
        </span></a>
      )}
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

/** «Просят написать»: the topic, the note and what helps to decide; nothing reaches me until I accept. */
export function AsksBox({ list, reload }: { list: Ask[]; reload: () => void }) {
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState('');
  const [note, setNote] = useState('');
  if (!list.length) return note ? <p className="pp-msg">{note}</p> : null;
  const answer = async (a: Ask, yes: boolean) => {
    setBusy(a.id);
    const r = await answerAsk(a.id, yes);
    setBusy('');
    window.dispatchEvent(new Event('lm-asks-changed'));
    if (yes && r) { openCircleChat(r); return; }
    if (!yes) setNote(_t("Хорошо. {0} не узнает причину, а снова написать сможет через 30 дней.", a.from.name.split(' ')[0]));
    reload();
  };
  const report = async (a: Ask) => {
    setMenu('');
    if (!confirm(_t("Пожаловаться на {0}? Просьба закроется, и он больше не сможет тебе писать.", a.from.name))) return;
    if (await reportAsk(a.id)) { window.dispatchEvent(new Event('lm-asks-changed')); setNote(_t("Спасибо. Мы посмотрим, а {0} больше не сможет писать тебе.", a.from.name.split(' ')[0])); reload(); }
  };
  const block = async (a: Ask) => {
    setMenu('');
    if (!confirm(_t("Заблокировать {0}? Он не сможет писать и звать тебя, и ты не увидишь его профиль.", a.from.name))) return;
    if (await blockUser(a.from.uid)) { window.dispatchEvent(new Event('lm-asks-changed')); reload(); }
  };
  const mine = new Map(myCircles().map((c) => [c.code, c.title]));
  return (
    <div className="ak-box" id="lm-asks">
      <h4 className="ak-h">{_tj("📩 Просят написать · {0}", list.length)}</h4>
      <small className="ak-sub">{_t("Пока ты не примешь, сообщение не придёт и чата не будет.")}</small>
      {list.map((a) => {
        const sh = (a.from.shared ?? []).map((c) => mine.get(c)).filter(Boolean);
        return (
          <div key={a.id} className="ak">
            <div className="ak-top">
              <button type="button" className="ak-who" onClick={() => openPerson(a.from.uid)}>
                <Ava pick={a.from.avatar} color={a.from.color} photo={a.from.photo} name={a.from.name} size={40} />
                <span><b>{a.from.name}</b><small>{[a.from.city, a.from.since && sinceLine(a.from.since), ago(a.created)].filter(Boolean).join(' · ')}</small></span>
              </button>
              <button type="button" className="ak-more" aria-label={_t("Ещё")} onClick={() => setMenu(menu === a.id ? '' : a.id)}>⋯</button>
            </div>
            {menu === a.id && (
              <div className="pp-menu ak-menu">
                <button type="button" onClick={() => report(a)}>{_t("⚠️ Пожаловаться")}</button>
                <button type="button" onClick={() => block(a)}>{_t("🚫 Заблокировать")}</button>
                <button type="button" onClick={() => setMenu('')}>{_t("Закрыть")}</button>
              </div>
            )}
            <span className="ak-topic">{topicLabel(a.kind) ?? (a.kind === 'hi' ? _t("💬 Написать") : `${ASK_LABEL[a.kind]}`)}</span>
            {a.note && <q>{a.note}</q>}
            <small className="ak-ctx">{sh.length ? _t("👥 Общий круг: {0}", sh.join(', ')) : _t("Нет общих кругов")}</small>
            <div className="pp-row">
              <button type="button" className="link-btn" disabled={busy === a.id} onClick={() => answer(a, false)}>{_t("Не сейчас")}</button>
              <button type="button" className="pri-btn" disabled={busy === a.id} onClick={() => answer(a, true)}>{_t("Принять и ответить")}</button>
            </div>
          </div>
        );
      })}
      {note && <p className="pp-msg">{note}</p>}
    </div>
  );
}
