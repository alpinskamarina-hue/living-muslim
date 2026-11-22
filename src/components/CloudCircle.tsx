import { useEffect, useState } from 'react';
import { Ic } from './LIcon';
import { InviteInbox } from './Nick';
import { BizPick } from './BizCircle';
import { BIZ_DEFAULT, rememberBizPick } from '../biz';
import { ProGate } from './Plan';
import { limitOf } from '../plan';
import { nicksReady, signupName, cloudMe, createCircle, rootOf, circleTitle, SUFFIX_MAX, inviteLink, joinCircle, leaveCircle, pendingInvite, pendingInviteMeta, setName, myCircles, kindOf, CIRCLE_KINDS, KIND_INFO, type CircleKind } from '../cloud';
import { _t, _tj } from '../i18n';
import { authMe, signInUrl } from '../auth';
import { ShareRow } from './ShareRow';

function InboxIfReady() {
  const [ok, setOk] = useState(false);
  useEffect(() => { nicksReady().then(setOk); }, []);
  return ok ? <InviteInbox /> : null;
}

/** Create a circle (title + kind) or join one by invite. First visit, or «+ Новый круг». */
/** What people usually add after the root, as a hint. */
const OWN_HINT: Partial<Record<CircleKind, string>> = {
  umrah: _t("с братьями"), family: _t("Каримовы"), brothers: _t("с работы"), sisters: _t("из мечети"), biz: _t("мойка, кафе, партнёры"), startup: _t("халяль-доставка"),
  friends: _t("со школы"), masjid: _t("по субботам"), study: _t("арабский A1"), work: _t("офис"), other: _t("Например: Бег по утрам"),
};

export function CloudSetup({ onCancel }: { onCancel?: () => void } = {}) {
  const me = cloudMe();
  const meta = pendingInviteMeta();
  const mineCodes = myCircles().map((c) => c.code);
  const inv = pendingInvite();
  const [name, setN] = useState(me?.name || signupName());
  const [code, setCode] = useState(inv && !mineCodes.includes(inv) ? inv : '');
  const [title, setTitle] = useState('');
  const [month, setMonth] = useState('');
  const [kind, setKind] = useState<CircleKind>('brothers');
  const [pick, setPick] = useState<number[]>(BIZ_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = name.trim().length >= 2;
  const full = mineCodes.length >= limitOf('circles');
  const k = kindOf(kind)!;
  const invited = Boolean(code && code === inv);
  const umrahCall = (() => { try { return Boolean(sessionStorage.getItem('lm.umrahGo')); } catch { return false; } })();
  const run = async (fn: () => Promise<boolean | string>) => {
    if (!ok) { setErr(_t("Напиши имя, хотя бы две буквы.")); return; }
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (r && (invited ? meta.kind === 'biz' : kind === 'biz') && pick.length) rememberBizPick(pick);
      if (r) { try { sessionStorage.setItem('lm.tab', 'circle'); sessionStorage.setItem('lm.autojoin', '1'); } catch { /* */ } location.reload(); return; }
      setErr(_t("Круг с таким кодом не найден. Проверь ссылку."));
    } catch {
      setErr(_t("Нет связи с сервером. Проверь интернет и попробуй ещё раз."));
    }
    setBusy(false);
  };

  return (
    <div className="page">
      {onCancel && <button type="button" className="link-btn pro-back" onClick={onCancel}>{_t("← Мои круги")}</button>}
      <h1 className="page-h">{invited ? (umrahCall ? _t("Тебя зовут на умру") : _t("Приглашение")) : onCancel ? _t("Новый круг") : _t("Круг")}</h1>
      {invited && umrahCall && <p className="page-sub">{_tj("Поездка собирается в круге «{0}». Вступи в круг, и сразу откроется поездка: даты, задачи и общий чат.", meta.title || _t("Круг друзей"))}</p>}
      {invited && !authMe() && (
        <div className="cl-acc">
          <b>{_t("Уже пользуешься Living Muslim?")}</b>
          <p>{_t("Сначала войди по почте, тогда круг и поездка попадут в твой аккаунт и будут видны в приложении на телефоне. Иначе здесь появится второй, новый профиль.")}</p>
          <a className="ghost-btn" href={signInUrl}>{_t("Войти по почте")}</a>
        </div>
      )}
      {!onCancel && !invited && <InboxIfReady />}
      {!(invited && umrahCall) && <p className="page-sub">{invited ? _t("Тебя позвали в круг. Друзья увидят только итог твоего дня: сколько намазов и привычек отмечено.") : _t("Близкие люди, которые держат друг друга в постоянстве. Друзья видят только итог дня, без названий привычек и заметок.")}</p>}
      <div className="join cl-setup">
        <label className="cl-f">
          <span>{_t("Как тебя будут видеть в кругу")}</span>
          <input value={name} maxLength={40} placeholder={_t("Имя")} onChange={(e) => setN(e.target.value)} />
        </label>
        {invited ? (
          <>
            <div className="cl-inv">
              <i>{kindOf(meta.kind)?.ic ?? '👥'}</i>
              <span><b>{meta.title || _t("Круг друзей")}</b><small>{_tj("{0} · код {1}", kindOf(meta.kind)?.ru ?? _t("Круг"), code)}</small></span>
            </div>
            {full ? <ProGate k="circles" have={mineCodes.length} /> : <>
            {meta.kind === 'biz' && <BizPick pick={pick} setPick={setPick} />}
            <button type="button" className="pri-btn big-btn" disabled={busy} onClick={() => run(() => joinCircle(name, code, meta.title, meta.kind))}>{_t("Вступить в круг")}</button>
            </>}
            <button type="button" className="link-btn" onClick={() => { setCode(''); try { sessionStorage.removeItem('lm.invite'); } catch { /* */ } }}>{_t("Нет, создать свой")}</button>
          </>
        ) : full ? (
          <ProGate k="circles" have={mineCodes.length} />
        ) : (
          <>
            <div className="cl-f"><span>{_t("Какой это круг")}</span></div>
            <div className="cl-kinds">
              {CIRCLE_KINDS.filter((x) => !x.old).map((x) => (
                <button key={x.id} type="button" aria-pressed={kind === x.id} className={x.id === 'biz' ? 'biz' : x.id === 'startup' ? 'su' : undefined} onClick={() => setKind(x.id)}><i><Ic e={x.ic} /></i>{x.ru}<small className="cl-sub">{KIND_INFO[x.id].sub}</small>{x.fresh && <em className="cl-new">{_t("новое")}</em>}</button>
              ))}
            </div>
            <div className={`cl-caps${kind === 'biz' ? ' biz' : kind === 'startup' ? ' su' : ''}`}>
              <b>{_tj("Что внутри круга «{0}»", k.ru)}</b>
              <ul>{KIND_INFO[kind].caps.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <label className="cl-f">
              <span>{rootOf(kind) ? _t("Название: «{0}» остаётся, допиши своё", rootOf(kind)) : _t("Название")}</span>
              <span className={`cl-name${rootOf(kind) ? ' has-root' : ''}`}>
                {rootOf(kind) && <em className="cl-root"><Ic e={k.ic} /> {rootOf(kind)} ·</em>}
                <input value={title} maxLength={SUFFIX_MAX(kind)} placeholder={OWN_HINT[kind] ?? k.ru} onChange={(e) => setTitle(e.target.value)} />
              </span>
            </label>
            {kind === 'biz' && <BizPick pick={pick} setPick={setPick} />}
            {kind === 'umrah' && (
              <label className="cl-f">
                <span>{_t("Когда примерно")}</span>
                <input value={month} maxLength={40} placeholder={_t("Например: март 2027")} onChange={(e) => setMonth(e.target.value)} />
              </label>
            )}
            <button type="button" className="pri-btn big-btn" disabled={busy} onClick={() => run(async () => {
              const c = await createCircle(name, circleTitle(kind, title), kind);
              // An umrah circle: after the reload the trip is made and the umrah screen opens on «Позвать».
              if (c && kind === 'umrah') { try { sessionStorage.setItem('lm.umNew', JSON.stringify({ title: circleTitle(kind, title), month: month.trim() })); sessionStorage.setItem('lm.umrahGo', '1'); } catch { /* */ } }
              return c;
            })}>{kind === 'umrah' ? _t("Собрать поездку") : _t("Создать круг")}</button>
            {kind === 'biz' && <p className="tiny bz-note">{_t("Суммы денег в круге не видны никогда.")}</p>}
            <p>{_t("Или вставь код приглашения от друга:")}</p>
            <div className="cl-row">
              <input aria-label={_t("Код круга")} placeholder={_t("например k7m2p9xq")} value={code} onChange={(e) => setCode(e.target.value.replace(/.*[?&]c=/, '').replace(/&.*/, '').trim())} />
              <button type="button" className="pri-btn" disabled={busy || code.length < 6} onClick={() => run(() => joinCircle(name, code))}>{_t("Вступить")}</button>
            </div>
          </>
        )}
        {err && <div className="warn">{err}</div>}
      </div>
      <p className="tiny">{_t("Регистрация не нужна: приложение запоминает тебя на этом устройстве.")}</p>
    </div>
  );
}

/** The invite message and link for a circle. */
export function inviteText(code: string) {
  const url = inviteLink(code);
  const c = myCircles().find((x) => x.code === code);
  return { url, text: _t("Присоединяйся к {0} в Living Muslim: {1}", c?.title ? _t("кругу «{0}»", c.title) : _t("моему кругу"), url) };
}

/** Opens the share sheet with the invite link (or copies it). */
export async function shareInvite(code: string) {
  const { url: link, text } = inviteText(code);
  try {
    if (navigator.share) { await navigator.share({ title: 'Living Muslim', text, url: link }); return true; }
    await navigator.clipboard.writeText(text); alert(_t("Ссылка скопирована. Отправь её в мессенджер."));
  } catch { /* cancelled */ }
  return false;
}

/** Invite link + name change + leaving the circle, shown under the members list. */
export function CloudInvite({ isOwner }: { isOwner: boolean }) {
  const me = cloudMe();
  const [editing, setEditing] = useState(false);
  const [name, setN] = useState(me?.name ?? '');
  if (!me?.circle) return null;

  return (
    <div className="invite">
      <b>{isOwner ? _t("Пригласи близких") : _t("Пригласить ещё кого-то")}</b>
      <p>{_t("Отправь эту ссылку. Человек откроет её, напишет имя и нажмёт «Вступить».")}</p>
      <ShareRow {...inviteText(me.circle)} />
      <p>
        {_t("Тебя видят как ")}<b>{me.name || _t("Участник")}</b>.{' '}
        {!editing && <button type="button" className="link-btn" onClick={() => setEditing(true)}>{_t("Изменить имя")}</button>}
      </p>
      {editing && (
        <div className="cl-row">
          <input value={name} maxLength={40} onChange={(e) => setN(e.target.value)} aria-label={_t("Имя")} />
          <button type="button" className="pri-btn" disabled={name.trim().length < 2} onClick={async () => { try { await setName(name.trim()); location.reload(); } catch { /* keep editing */ } }}>{_t("Сохранить")}</button>
        </div>
      )}
      <button type="button" className="link-btn" onClick={async () => { if (confirm(_t("Покинуть этот круг? Твой итог исчезнет у друзей."))) { await leaveCircle(); location.reload(); } }}>{_t("Покинуть круг")}</button>
    </div>
  );
}
