import { useState } from 'react';
import { InviteInbox } from './Nick';
import { signupName, cloudMe, createCircle, inviteLink, joinCircle, leaveCircle, pendingInvite, pendingInviteMeta, setName, myCircles, kindOf, CIRCLE_KINDS, type CircleKind } from '../cloud';

/** Create a circle (title + kind) or join one by invite. First visit, or «+ Новый круг». */
export function CloudSetup({ onCancel }: { onCancel?: () => void } = {}) {
  const me = cloudMe();
  const meta = pendingInviteMeta();
  const mineCodes = myCircles().map((c) => c.code);
  const inv = pendingInvite();
  const [name, setN] = useState(me?.name || signupName());
  const [code, setCode] = useState(inv && !mineCodes.includes(inv) ? inv : '');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CircleKind>('brothers');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = name.trim().length >= 2;
  const k = kindOf(kind)!;
  const run = async (fn: () => Promise<boolean | string>) => {
    if (!ok) { setErr('Напиши имя, хотя бы две буквы.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (r) { try { sessionStorage.setItem('lm.tab', 'circle'); sessionStorage.setItem('lm.autojoin', '1'); } catch { /* */ } location.reload(); return; }
      setErr('Круг с таким кодом не найден. Проверь ссылку.');
    } catch {
      setErr('Нет связи с сервером. Проверь интернет и попробуй ещё раз.');
    }
    setBusy(false);
  };
  const invited = Boolean(code && code === inv);

  return (
    <div className="page">
      {onCancel && <button type="button" className="link-btn pro-back" onClick={onCancel}>← Мои круги</button>}
      <h1 className="page-h">{invited ? 'Приглашение' : onCancel ? 'Новый круг' : 'Круг'}</h1>
      {!onCancel && !invited && <InviteInbox />}
      <p className="page-sub">{invited ? 'Тебя позвали в круг. Друзья увидят только итог твоего дня: сколько намазов и привычек отмечено.' : 'Близкие люди, которые держат друг друга в постоянстве. Друзья видят только итог дня, без названий привычек и заметок.'}</p>
      <div className="join cl-setup">
        <label className="cl-f">
          <span>Как тебя будут видеть в кругу</span>
          <input value={name} maxLength={40} placeholder="Имя" onChange={(e) => setN(e.target.value)} />
        </label>
        {invited ? (
          <>
            <div className="cl-inv">
              <i>{kindOf(meta.kind)?.ic ?? '👥'}</i>
              <span><b>{meta.title || 'Круг друзей'}</b><small>{kindOf(meta.kind)?.ru ?? 'Круг'} · код {code}</small></span>
            </div>
            <button type="button" className="pri-btn big-btn" disabled={busy} onClick={() => run(() => joinCircle(name, code, meta.title, meta.kind))}>Вступить в круг</button>
            <button type="button" className="link-btn" onClick={() => { setCode(''); try { sessionStorage.removeItem('lm.invite'); } catch { /* */ } }}>Нет, создать свой</button>
          </>
        ) : (
          <>
            <div className="cl-f"><span>Какой это круг</span></div>
            <div className="cl-kinds">
              {CIRCLE_KINDS.map((x) => (
                <button key={x.id} type="button" aria-pressed={kind === x.id} onClick={() => setKind(x.id)}><i>{x.ic}</i>{x.ru}</button>
              ))}
            </div>
            <p className="tiny">{k.hint}</p>
            <label className="cl-f">
              <span>Название</span>
              <input value={title} maxLength={40} placeholder={kind === 'family' ? 'Например: Семья Насима' : kind === 'masjid' ? 'Например: Халака по субботам' : `Например: ${k.ru}`} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button type="button" className="pri-btn big-btn" disabled={busy} onClick={() => run(() => createCircle(name, title || k.ru, kind))}>Создать круг</button>
            <p>Или вставь код приглашения от друга:</p>
            <div className="cl-row">
              <input aria-label="Код круга" placeholder="например k7m2p9xq" value={code} onChange={(e) => setCode(e.target.value.replace(/.*[?&]c=/, '').replace(/&.*/, '').trim())} />
              <button type="button" className="pri-btn" disabled={busy || code.length < 6} onClick={() => run(() => joinCircle(name, code))}>Вступить</button>
            </div>
          </>
        )}
        {err && <div className="warn">{err}</div>}
      </div>
      <p className="tiny">Регистрация не нужна: приложение запоминает тебя на этом устройстве.</p>
    </div>
  );
}

/** Opens the share sheet with the invite link (or copies it). */
export async function shareInvite(code: string) {
  const link = inviteLink(code);
  const c = myCircles().find((x) => x.code === code);
  const text = `Присоединяйся к ${c?.title ? `кругу «${c.title}»` : 'моему кругу'} в Living Muslim: ${link}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Living Muslim', text, url: link }); return true; }
    await navigator.clipboard.writeText(text); alert('Ссылка скопирована. Отправь её в мессенджер.');
  } catch { /* cancelled */ }
  return false;
}

/** Invite link + name change + leaving the circle, shown under the members list. */
export function CloudInvite({ isOwner }: { isOwner: boolean }) {
  const me = cloudMe();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setN] = useState(me?.name ?? '');
  if (!me?.circle) return null;
  const link = inviteLink(me.circle);

  const share = async () => {
    const t = myCircles().find((x) => x.code === me.circle)?.title;
    const text = `Присоединяйся к ${t ? `кругу «${t}»` : 'моему кругу'} в Living Muslim: ${link}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Living Muslim', text, url: link }); return; }
      await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled */ }
  };

  return (
    <div className="invite">
      <b>{isOwner ? 'Пригласи близких' : 'Пригласить ещё кого-то'}</b>
      <p>Отправь эту ссылку. Человек откроет её, напишет имя и нажмёт «Вступить».</p>
      <div className="cl-row">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Ссылка-приглашение" />
        <button type="button" className="pri-btn" onClick={share}>{copied ? 'Скопировано' : 'Поделиться'}</button>
      </div>
      <p>
        Тебя видят как <b>{me.name || 'Участник'}</b>.{' '}
        {!editing && <button type="button" className="link-btn" onClick={() => setEditing(true)}>Изменить имя</button>}
      </p>
      {editing && (
        <div className="cl-row">
          <input value={name} maxLength={40} onChange={(e) => setN(e.target.value)} aria-label="Имя" />
          <button type="button" className="pri-btn" disabled={name.trim().length < 2} onClick={async () => { try { await setName(name.trim()); location.reload(); } catch { /* keep editing */ } }}>Сохранить</button>
        </div>
      )}
      <button type="button" className="link-btn" onClick={async () => { if (confirm('Покинуть этот круг? Твой итог исчезнет у друзей.')) { await leaveCircle(); location.reload(); } }}>Покинуть круг</button>
    </div>
  );
}
