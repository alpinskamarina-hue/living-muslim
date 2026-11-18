import { say } from '../words';
import { useEffect, useRef, useState } from 'react';
import { avatarUrl, squarePhoto, EMOJIS, PATTERNS, COLORS, type AvatarPick, type AvatarKind } from '../avatar';
import {
  getProfile, saveProfile, nickFree, findNick, findNicks, circleMates, sendInvite, inbox, answerInvite, blockUser, myCircles, kindOf, cleanNick, NICK_RE,
  type Profile, type Found, type Invite,
} from '../cloud';
import { shareInvite } from './CloudCircle';
import { authMe, signInUrl } from '../auth';
import { plural } from '../dates';
import { ProGate } from './Plan';
import { limitOf } from '../plan';
import { _t, _tj } from '../i18n';

const CACHE = 'lm.profile';
export function cachedProfile(): Partial<Profile> | null {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; }
}
function cache(p: Partial<Profile>) { try { localStorage.setItem(CACHE, JSON.stringify(p)); } catch { /* */ } }
/** Fetches my profile into the local cache; true when it changed. */
export async function refreshProfile(): Promise<boolean> {
  const r = await getProfile();
  if (!r) return false;
  const before = localStorage.getItem(CACHE);
  cache(r);
  return before !== localStorage.getItem(CACHE);
}

/** Round profile picture: photo, emoji, pattern or the first letter. */
export function Ava({ pick, color, photo, name, size = 44 }: { pick?: AvatarPick; color?: string; photo?: string; name: string; size?: number }) {
  const c = pick?.c || color || '#1f7a4d';
  const url = avatarUrl(pick, c, photo);
  const st = { width: size, height: size, minWidth: size, fontSize: Math.round(size * 0.4) };
  if (url) return <img className="nk-ava" src={url} alt="" style={st} />;
  return <span className="nk-ava" style={{ ...st, background: c }}>{(name || '?').trim().slice(0, 1).toUpperCase()}</span>;
}

const DEFAULTS: Profile = {
  name: '', nick: null, bio: '', avatar: { k: 'initials' }, photo: '', color: '#1f7a4d',
  findable: true, invite_from: 'all', gender: '', sisters_only: false, show_photo: true, email: false,
};

const KIND_RU: Record<AvatarKind, string> = { photo: _t("Фото"), initials: _t("Инициалы"), emoji: _t("Эмодзи"), pattern: _t("Узор") };

/** Profile → «Мой профиль»: picture, name, nick, about, privacy. */
export function MyProfile({ name, onName, onSex }: { name: string; onName: (n: string) => void; onSex?: (g: 'm' | 'f') => void }) {
  const [p, setP] = useState<Profile>({ ...DEFAULTS, ...cachedProfile(), name });
  const [nick, setNick] = useState(p.nick ?? '');
  const [nickState, setNickState] = useState<'' | 'checking' | 'ok' | 'taken' | 'bad' | 'mine'>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const savedNick = useRef(p.nick ?? '');
  const signed = authMe();

  useEffect(() => {
    getProfile().then((r) => {
      if (!r) return;
      const merged = { ...DEFAULTS, ...r, name: r.name || name, avatar: r.avatar?.k ? r.avatar : { k: 'initials' as const } };
      setP(merged); setNick(r.nick ?? ''); savedNick.current = r.nick ?? ''; cache(merged);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const n = cleanNick(nick);
    if (!n) { setNickState(''); return; }
    if (n === savedNick.current) { setNickState('mine'); return; }
    if (!NICK_RE.test(n) || /^[._]|[._]$/.test(n)) { setNickState('bad'); return; }
    setNickState('checking');
    const t = setTimeout(() => nickFree(n).then((r) => setNickState(r === 'ok' ? 'ok' : r === 'taken' ? 'taken' : r === 'bad' ? 'bad' : '')), 400);
    return () => clearTimeout(t);
  }, [nick]);

  const patch = (x: Partial<Profile>) => { setP((o) => ({ ...o, ...x })); setMsg(''); };
  const pick = (a: AvatarPick) => patch({ avatar: { ...p.avatar, ...a } });
  const color = p.avatar.c || p.color;

  const onFile = async (f?: File) => {
    if (!f) return;
    try { const d = await squarePhoto(f); patch({ photo: d, avatar: { ...p.avatar, k: 'photo' } }); } catch { setMsg(_t("Не получилось открыть это фото.")); }
  };

  const save = async () => {
    const n = cleanNick(nick);
    if (p.name.trim().length < 2) { setMsg(_t("Напиши имя, хотя бы две буквы.")); return; }
    if (nickState === 'bad') { setMsg(_t("Ник: от 3 до 20 латинских букв, цифр, «_» или «.».")); return; }
    if (nickState === 'taken') { setMsg(_t("Этот ник уже занят, попробуй другой.")); return; }
    setBusy(true); setMsg('');
    const body: Partial<Profile> = {
      name: p.name.trim(), nick: n || null, bio: p.bio, avatar: p.avatar, photo: p.avatar.k === 'photo' ? p.photo : '',
      findable: p.findable, invite_from: p.invite_from, gender: p.gender, sisters_only: p.gender === 'f' && p.sisters_only, show_photo: p.show_photo,
    };
    const r = await saveProfile(body, p.name.trim());
    setBusy(false);
    if (r === 'ok') {
      savedNick.current = n; setNickState(n ? 'mine' : ''); setMsg(_t("Сохранено"));
      cache({ ...p, ...body }); onName(p.name.trim()); if (p.gender === 'm' || p.gender === 'f') onSex?.(p.gender); say('profile_saved');
    } else setMsg(r === 'nick_taken' ? _t("Этот ник уже занят, попробуй другой.") : r === 'nick_bad' ? _t("Ник: от 3 до 20 латинских букв, цифр, «_» или «.».") : r === 'photo_big' ? _t("Фото слишком большое.") : _t("Не получилось сохранить. Проверь интернет и попробуй ещё раз."));
  };

  const hint = nickState === 'checking' ? <span className="nk-st">{_t("проверяю…")}</span>
    : nickState === 'ok' ? <span className="nk-st ok">{_t("✓ свободен")}</span>
    : nickState === 'mine' ? <span className="nk-st ok">{_t("✓ твой")}</span>
    : nickState === 'taken' ? <span className="nk-st bad">{_t("занят")}</span>
    : nickState === 'bad' ? <span className="nk-st bad">{_t("не подходит")}</span> : null;

  return (
    <div className="nk">
      <div className="nk-pic">
        <button type="button" className="nk-big" onClick={() => file.current?.click()} aria-label={_t("Выбрать фото")}>
          <Ava pick={p.avatar} color={p.color} photo={p.photo} name={p.name} size={96} />
          <i aria-hidden="true">📷</i>
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <div className="nk-kinds">
        {(['photo', 'initials', 'emoji', 'pattern'] as AvatarKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={p.avatar.k === k} onClick={() => (k === 'photo' && !p.photo ? file.current?.click() : pick({ k, v: k === 'emoji' ? p.avatar.v && EMOJIS.includes(p.avatar.v) ? p.avatar.v : EMOJIS[0] : k === 'pattern' ? p.avatar.v && PATTERNS.includes(p.avatar.v) ? p.avatar.v : PATTERNS[0] : undefined }))}>{KIND_RU[k]}</button>
        ))}
      </div>
      {p.avatar.k === 'emoji' && (
        <div className="nk-grid">{EMOJIS.map((e) => <button key={e} type="button" aria-pressed={p.avatar.v === e} onClick={() => pick({ v: e })}>{e}</button>)}</div>
      )}
      {p.avatar.k === 'pattern' && (
        <div className="nk-grid pat">{PATTERNS.map((x) => <button key={x} type="button" aria-pressed={p.avatar.v === x} onClick={() => pick({ v: x })}><Ava pick={{ k: 'pattern', v: x }} color={color} name="" size={40} /></button>)}</div>
      )}
      {p.avatar.k !== 'photo' && (
        <div className="nk-colors">{COLORS.map((c) => <button key={c} type="button" aria-label={_t("Цвет")} aria-pressed={color === c} style={{ background: c }} onClick={() => pick({ c })} />)}</div>
      )}

      <label className="field"><span>{_t("Имя")}</span><input value={p.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} placeholder={_t("Как тебя зовут")} /></label>
      <label className="field">
        <span>{_t("Ник, по нему тебя найдут")}</span>
        <span className="nk-in"><b>@</b><input value={nick} maxLength={21} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={_t("например nasim_ams")}
          onChange={(e) => { setNick(e.target.value.replace(/^@/, '').toLowerCase()); setMsg(''); }} />{hint}</span>
      </label>
      <label className="field"><span>{_t("О себе, по желанию")}</span><input value={p.bio} maxLength={80} onChange={(e) => patch({ bio: e.target.value })} placeholder={_t("Город, чем занимаешься")} /></label>

      <div className="nk-sec">{_t("Приватность")}</div>
      <div className="nk-grp">
        <label className="nk-r"><span>{_t("Находить меня по нику")}<small>{_t("Иначе только по ссылке-приглашению")}</small></span>
          <span className="switch"><input type="checkbox" checked={p.findable} onChange={(e) => patch({ findable: e.target.checked })} /><span /></span></label>
        <label className="nk-r"><span>{_t("Кто может звать в круги")}</span>
          <select value={p.invite_from} onChange={(e) => patch({ invite_from: e.target.value as Profile['invite_from'] })}>
            <option value="all">{_t("Все")}</option><option value="circles">{_t("Только из моих кругов")}</option><option value="none">{_t("Никто")}</option>
          </select></label>
        <label className="nk-r"><span>{_t("Я")}<small>{_t("Нужно для кругов «Братья» и «Сёстры»")}</small></span>
          <select value={p.gender} onChange={(e) => patch({ gender: e.target.value as Profile['gender'] })}>
            <option value="">{_t("Не указано")}</option><option value="m">{_t("Брат")}</option><option value="f">{_t("Сестра")}</option>
          </select></label>
        {p.gender === 'f' && (
          <label className="nk-r"><span>{_t("Приглашения только от сестёр")}<small>{_t("Братья не смогут найти тебя и позвать")}</small></span>
            <span className="switch"><input type="checkbox" checked={p.sisters_only} onChange={(e) => patch({ sisters_only: e.target.checked })} /><span /></span></label>
        )}
        <label className="nk-r"><span>{_t("Показывать фото")}<small>{_t("Только участникам моих кругов")}</small></span>
          <span className="switch"><input type="checkbox" checked={p.show_photo} onChange={(e) => patch({ show_photo: e.target.checked })} /><span /></span></label>
      </div>

      <button type="button" className="pri-btn big-btn nk-save" disabled={busy} onClick={save}>{busy ? _t("Сохраняю…") : _t("Сохранить")}</button>
      {msg && <p className={`nk-msg${msg === _t("Сохранено") ? ' ok' : ''}`}>{msg}</p>}
      <p className="tiny nk-note">
        {signed || p.email ? _t("Профиль привязан к почте, поэтому он сохранится на любом телефоне.") : <>{_t("Профиль пока живёт на этом телефоне. ")}<a href={signInUrl}>{_t("Войди по почте")}</a>{_t(", чтобы он сохранился на любом.")}</>}
      </p>
    </div>
  );
}

const SEND_ERR: Record<string, string> = {
  closed: _t("Этот человек сейчас не принимает приглашения от тебя."),
  already_in: _t("Он уже в этом круге."),
  wrong_kind: _t("Этот круг не подходит: «Братья» только для братьев, «Сёстры» только для сестёр."),
  limit: _t("Сегодня отправлено слишком много приглашений. Попробуй завтра."),
  full: _t("В круге уже 50 человек."),
  not_member: _t("Ты больше не в этом круге."),
  error: _t("Не получилось отправить. Проверь интернет и попробуй ещё раз."),
};

/** Circle → «+ Пригласить»: type the first letters of a nick, tap a person, pick a circle, send. Or share the link. */
export function InviteByNick({ code, onBack }: { code: string; onBack: () => void }) {
  const circles = myCircles();
  const cur = circles.find((c) => c.code === code);
  const [q, setQ] = useState('');
  const [list, setList] = useState<Found[] | null>(null);
  const [old, setOld] = useState(false); // server without prefix search: exact nick only
  const [found, setFound] = useState<Found | null | 'none' | 'error'>(null);
  const [mates, setMates] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [to, setTo] = useState(code);
  const [sent, setSent] = useState<Record<string, Record<string, string>>>({});
  const [mine, setMine] = useState(cachedProfile());
  const seq = useRef(0);
  useEffect(() => { refreshProfile().then((ch) => ch && setMine(cachedProfile())); }, []);
  useEffect(() => { circleMates(code).then(setMates); }, [code]);

  const pick = (r: Found) => {
    setFound(r);
    setTo(circles.find((c) => c.code === code && !r.shared.includes(c.code))?.code ?? circles.find((c) => !r.shared.includes(c.code))?.code ?? code);
  };

  // Live search as you type, from 2 letters.
  useEffect(() => {
    const n = cleanNick(q);
    if (old || n.length < 2) { setList(null); setLooking(false); return; }
    const my = ++seq.current;
    setLooking(true);
    const t = setTimeout(async () => {
      const r = await findNicks(n);
      if (my !== seq.current) return;
      setLooking(false);
      if (r === 'old') { setOld(true); setList(null); return; }
      setList(r === 'error' ? null : r);
      if (r === 'error') setFound('error');
    }, 280);
    return () => clearTimeout(t);
  }, [q, old]);

  const search = async () => {
    const n = cleanNick(q);
    const exact = list?.find((x) => x.nick === n);
    if (exact) { pick(exact); return; }
    if (n.length < 3) return;
    setBusy(true);
    const r = await findNick(n);
    setBusy(false);
    if (r && r !== 'error') pick(r); else setFound(r === 'error' ? 'error' : 'none');
  };
  const send = async (f: Found) => {
    setBusy(true);
    const r = await sendInvite(to, f.uid);
    setBusy(false);
    setSent((s) => ({ ...s, [f.uid]: { ...s[f.uid], [to]: r } }));
  };

  const title = (c: string) => circles.find((x) => x.code === c)?.title || _t("Круг");
  const f = found && typeof found === 'object' ? found : null;
  const r = f ? sent[f.uid]?.[to] : undefined;
  const n = cleanNick(q);
  const sentTo = (x: Found) => Object.entries(sent[x.uid] ?? {}).some(([, v]) => v === 'ok');

  const row = (x: Found) => (
    <button key={x.uid} type="button" className="nk-hit" onClick={() => pick(x)}>
      <Ava pick={x.avatar} color={x.color} photo={x.photo} name={x.name} size={42} />
      <span className="nk-hit-t"><b>{x.name || _t("Без имени")}</b><small>@{x.nick}{x.shared.length > 0 ? _t(" · с тобой в «{0}»{1}", title(x.shared[0]), x.shared.length > 1 ? _t(" и ещё {0}", x.shared.length - 1) : '') : ''}</small></span>
      {sentTo(x) ? <em className="ok">✓</em> : x.can !== 'ok' ? <em>🔒</em> : <em>{_t("Позвать")}</em>}
    </button>
  );

  return (
    <div className="page">
      <button type="button" className="link-btn pro-back" onClick={f ? () => setFound(null) : onBack}>← {f ? _t("К поиску") : cur?.title || _t("Круг")}</button>
      <h1 className="page-h">{_t("Позвать в круг")}</h1>
      {!f && (
        <form className="nk-search" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <span aria-hidden="true">@</span>
          <input value={q} autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={old ? _t("ник друга") : _t("начни писать ник")} onChange={(e) => { setQ(e.target.value.replace(/^@/, '').toLowerCase()); setFound(null); }} />
          {old ? <button type="submit" disabled={busy || n.length < 3}>{_t("Найти")}</button> : looking ? <i className="nk-spin" aria-label={_t("Ищу")} /> : null}
        </form>
      )}

      {!f && found === 'none' && <div className="nk-none">{_t("Никого с ником ")}<b>@{n}</b>{_t(". Проверь написание. Человек мог скрыть себя из поиска, тогда отправь ему ссылку.")}</div>}
      {!f && found === 'error' && <div className="nk-none">{_t("Не получилось найти. Проверь интернет и попробуй ещё раз.")}</div>}

      {!f && list && list.length > 0 && <div className="nk-hits">{list.map(row)}</div>}
      {!f && list && list.length === 0 && !looking && <div className="nk-none">{_t("Пока никого на ")}<b>@{n}</b>{_t(". Попробуй другие буквы или отправь ссылку. Скрытые из поиска не показываются.")}</div>}

      {!f && n.length < 2 && mates.length > 0 && (
        <>
          <div className="nk-sec">{_t("Из твоих кругов")}</div>
          <div className="nk-hits">{mates.slice(0, 12).map(row)}</div>
        </>
      )}

      {f && (
        <div className="nk-card">
          <Ava pick={f.avatar} color={f.color} photo={f.photo} name={f.name} size={72} />
          <b>{f.name || _t("Без имени")}</b>
          <span className="nk-at">@{f.nick}</span>
          {(f.bio || f.shared.length > 0) && <p>{f.bio}{f.bio && f.shared.length > 0 && <br />}{f.shared.length > 0 && <>{_tj("С тобой уже в {0}  {1}", f.shared.length > 1 ? _t("кругах") : _t("круге"), f.shared.map((c) => `«${title(c)}»`).join(', '))}</>}</p>}
          {f.can !== 'ok' ? (
            <div className="nk-none">{f.can === 'closed' ? _t("{0} сейчас не принимает приглашения в круги.", f.name || _t("Этот человек")) : _t("{0} принимает приглашения только от людей из своих кругов. Отправь ссылку.", f.name || _t("Этот человек"))}</div>
          ) : (
            <>
              <div className="nk-pick">
                {circles.map((c) => {
                  const already = f.shared.includes(c.code);
                  return <button key={c.code} type="button" disabled={already} aria-pressed={to === c.code} onClick={() => setTo(c.code)}>{kindOf(c.kind)?.ic ?? '👥'} {c.title}{already ? ' ✓' : ''}</button>;
                })}
              </div>
              {r === 'ok' ? (
                <div className="nk-done">{_tj("✓ Приглашение в «{0}» отправлено. {1} увидит его сразу в приложении и сам решит, вступать или нет.", title(to), f.name || _t("Человек"))}</div>
              ) : (
                <button type="button" className="pri-btn big-btn" disabled={busy || f.shared.includes(to)} onClick={() => send(f)}>{busy ? _t("Отправляю…") : _t("Отправить приглашение")}</button>
              )}
              {r && r !== 'ok' && <p className="nk-msg">{SEND_ERR[r] ?? SEND_ERR.error}</p>}
            </>
          )}
        </div>
      )}

      {!f && <p className="tiny nk-note">{_t("Ищем по нику, от двух букв. По имени и почте искать нельзя, а кто скрыл себя из поиска, не показывается. Человек увидит приглашение в приложении и сам решит, вступать или нет.")}</p>}
      {!mine?.nick && <p className="tiny nk-note">{_t("У тебя пока нет ника. Его можно задать в Профиле → Мой профиль, тогда тебя тоже смогут найти.")}</p>}

      <div className="nk-sec">{_t("Или по ссылке")}</div>
      <button type="button" className="nk-share" onClick={() => shareInvite(to || code)}>{_t("Поделиться ссылкой в WhatsApp, Telegram…")}</button>
    </div>
  );
}

// Invites waiting for me, shared by the Circle tab badge, the Today banner and the inbox,
// so answering one updates every place at once. Checked on open, on return to the app and every 2 minutes.
let invList: Invite[] = [];
let invAt = 0;
const invSubs = new Set<(l: Invite[]) => void>();
function setInvites(l: Invite[]) {
  invList = l;
  invSubs.forEach((f) => f(l));
  try { const n = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }; if (l.length) n.setAppBadge?.(l.length)?.catch(() => {}); else n.clearAppBadge?.()?.catch(() => {}); } catch { /* */ }
}
export function refreshInvites(force = false) {
  if (!force && Date.now() - invAt < 15000) return;
  invAt = Date.now();
  inbox().then(setInvites);
}
export function useInvites(on = true): Invite[] {
  const [l, setL] = useState(invList);
  useEffect(() => {
    if (!on) return;
    invSubs.add(setL);
    refreshInvites();
    const v = () => { if (document.visibilityState === 'visible') refreshInvites(); };
    document.addEventListener('visibilitychange', v);
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshInvites(true); }, 120000);
    return () => { invSubs.delete(setL); document.removeEventListener('visibilitychange', v); clearInterval(t); };
  }, [on]);
  return l;
}

/** Invites waiting for me, shown on top of the Circle tab. */
export function InviteInbox() {
  const list = useInvites();
  const setList = (f: (l: Invite[]) => Invite[]) => setInvites(f(invList));
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState('');
  const [gate, setGate] = useState('');
  if (!list.length) return null;

  const answer = async (inv: Invite, yes: boolean) => {
    setBusy(inv.id);
    const ok = await answerInvite(inv, yes);
    setBusy('');
    if (ok && !yes) setList((l) => l.filter((x) => x.id !== inv.id));
  };
  const block = async (inv: Invite) => {
    if (!confirm(_t("Заблокировать {0}? Он больше не сможет найти тебя и позвать в круг.", inv.from.name || _t("этого человека")))) return;
    await blockUser(inv.from.uid);
    setList((l) => l.filter((x) => x.from.uid !== inv.from.uid));
  };

  return (
    <div className="nk-inbox">
      <div className="nk-bell">🔔 <span><b>{list.length} {plural(list.length, _t("приглашение"), _t("приглашения"), _t("приглашений"))}</b>{_tj("  {0} ответа", list.length > 1 ? _t("ждут") : _t("ждёт"))}</span></div>
      {list.map((inv) => {
        const k = kindOf(inv.kind as never);
        return (
          <div key={inv.id} className="nk-req">
            <div className="nk-req-top">
              <Ava pick={inv.from.avatar} color={inv.from.color} photo={inv.from.photo} name={inv.from.name} size={44} />
              <span><b>{inv.from.name || _t("Кто-то")}</b>{_t(" зовёт тебя")}<small>{inv.from.nick ? `@${inv.from.nick}` : ''}</small></span>
              <button type="button" className="nk-more" aria-label={_t("Ещё")} onClick={() => setMenu(menu === inv.id ? '' : inv.id)}>⋯</button>
            </div>
            {menu === inv.id && <button type="button" className="link-btn nk-block" onClick={() => block(inv)}>{_tj("Заблокировать @{0}", inv.from.nick || _t("пользователя"))}</button>}
            <div className="nk-ci">{k?.ic ?? '👥'} <b>{inv.title || _t("Круг")}</b> · {inv.count} {plural(inv.count, _t("человек"), _t("человека"), _t("человек"))}{k && <small>{k.hint}</small>}</div>
            {gate === inv.id && <ProGate k="circles" have={myCircles().length} />}
            <div className="nk-row">
              <button type="button" className="pri-btn" disabled={busy === inv.id} onClick={() => (myCircles().length >= limitOf('circles') ? setGate(inv.id) : answer(inv, true))}>{_t("Вступить")}</button>
              <button type="button" className="nk-no" disabled={busy === inv.id} onClick={() => answer(inv, false)}>{_t("Не сейчас")}</button>
            </div>
          </div>
        );
      })}
      <p className="tiny nk-note">{_t("Если отказаться, человек не увидит причину.")}</p>
    </div>
  );
}
