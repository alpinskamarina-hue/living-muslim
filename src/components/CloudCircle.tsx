import { useState } from 'react';
import { cloudMe, createCircle, inviteLink, joinCircle, leaveCircle, pendingInvite, setName } from '../cloud';

/** First visit to Circle on the standalone site: pick a name, then create a circle or join by invite. */
export function CloudSetup() {
  const me = cloudMe();
  const [name, setN] = useState(me?.name ?? '');
  const [code, setCode] = useState(pendingInvite());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = name.trim().length >= 2;

  const run = async (fn: () => Promise<boolean | string>) => {
    if (!ok) { setErr('Напиши имя, хотя бы две буквы.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (r) { try { sessionStorage.setItem('lm.tab', 'circle'); } catch { /* */ } location.reload(); return; }
      setErr('Круг с таким кодом не найден. Проверь ссылку.');
    } catch {
      setErr('Нет связи с сервером. Проверь интернет и попробуй ещё раз.');
    }
    setBusy(false);
  };

  return (
    <div className="page">
      <h1 className="page-h">Круг</h1>
      <p className="page-sub">Близкие люди, которые держат друг друга в постоянстве. Друзья видят только итог дня: сколько отмечено привычек и намазов. Названия привычек, заметки и мухасаба остаются у тебя.</p>

      <div className="join cl-setup">
        <label className="cl-f">
          <span>Как тебя будут видеть друзья</span>
          <input value={name} maxLength={40} placeholder="Имя" onChange={(e) => setN(e.target.value)} />
        </label>

        {code ? (
          <>
            <p>Тебя пригласили в круг <b>{code}</b>.</p>
            <button type="button" className="pri-btn big-btn" disabled={busy} onClick={() => run(() => joinCircle(name, code))}>Вступить в круг</button>
            <button type="button" className="link-btn" onClick={() => setCode('')}>Нет, создать свой</button>
          </>
        ) : (
          <>
            <button type="button" className="pri-btn big-btn" disabled={busy} onClick={() => run(() => createCircle(name))}>Создать свой круг</button>
            <p>Или вставь код приглашения от друга:</p>
            <div className="cl-row">
              <input aria-label="Код круга" placeholder="например k7m2p9xq" onChange={(e) => setCode(e.target.value.replace(/.*[?&]c=/, '').trim())} />
            </div>
          </>
        )}
        {err && <div className="warn">{err}</div>}
      </div>
      <p className="tiny">Регистрация не нужна: приложение запоминает тебя на этом устройстве. Если сменишь телефон, вступи в круг заново по ссылке.</p>
    </div>
  );
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
    const text = `Присоединяйся к моему кругу в Living Muslim: ${link}`;
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
