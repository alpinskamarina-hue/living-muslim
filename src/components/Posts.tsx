// Posts: the feed of a circle (or of the common circle), one post card, the «Новый пост» sheet and the pinned bar
// over a circle's chat. Server side: supabase/posts.sql.
import { useEffect, useRef, useState } from 'react';
import { _t, _tj, LANG } from '../i18n';
import { ensureMe, signupName, cloudMe } from '../cloud';
import { postAdd, postPhoto, postReact, postReport, postSet, shrinkPhoto, usePosts, markPostSeen, type Post, type PostRx } from '../posts';

const RX: PostRx[] = ['🤲', '❤', '👍'];
const RX_LABEL: Record<PostRx, string> = { '🤲': _t("Амин"), '❤': _t("Джазак Аллах"), '👍': _t("Буду") };

function when(iso: string) {
  const d = new Date(iso), now = new Date();
  const loc = LANG === 'en' ? 'en-GB' : 'ru-RU';
  const hm = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  const day = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (day === 0) return _tj("сегодня, {0}", hm);
  if (day === 1) return _tj("вчера, {0}", hm);
  if (day === -1) return _tj("завтра, {0}", hm);
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + `, ${hm}`;
}

function Photo({ id }: { id: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let on = true; postPhoto(id).then((s) => { if (on) setSrc(s); }); return () => { on = false; }; }, [id]);
  return src ? <img className="ps-img" src={src} alt="" loading="lazy" /> : <span className="ps-img ps-img0" />;
}

const go = (u: string) => { if (u.startsWith('/app/')) location.href = u; else window.open(u, '_blank', 'noopener'); };

export function PostCard({ p, boss, react, onChange, share, guest }: {
  p: Post; boss: boolean; react: boolean; onChange: (p?: Post) => void; share?: boolean; guest?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const team = p.role === 'team';
  const doReact = async (e: PostRx) => { if (!cloudMe()) await ensureMe(signupName()); const r = await postReact(p.id, e); if (r) onChange(r); };
  const act = async (a: 'pin' | 'unpin' | 'del' | 'edit') => {
    setMenu(false);
    if (a === 'del' && !confirm(_t("Удалить пост? Его не будет и в чате."))) return;
    if (a === 'edit') { setEdit(p.body); return; }
    if (await postSet(p.id, a)) onChange();
  };
  const [reported, setReported] = useState(false);
  const report = async () => { setMenu(false); if (!confirm(_t("Пожаловаться на пост? Команда посмотрит. После 3 жалоб пост скрывается."))) return; await postReport(p.id); setReported(true); };
  const doShare = () => {
    const text = `${p.body.slice(0, 400)}\n\nLiving Muslim`;
    if (navigator.share) navigator.share({ text, url: location.origin + '/app/' }).catch(() => {});
    else navigator.clipboard?.writeText(text).catch(() => {});
  };
  return (
    <article className={`ps-card${p.pinned ? ' pin' : ''}${p.hidden ? ' off' : ''}`} data-id={p.id}>
      <header className="ps-by">
        <i className={team ? 'team' : ''}>{team ? '☪' : (p.by || '?').trim().charAt(0).toUpperCase()}</i>
        <span>
          <b>{team ? _t("Команда Living Muslim") : `${p.by || _t("Участник")} · ${p.role === 'owner' ? _t("амир") : _t("помощник")}`}</b>
          <small>
            {when(p.at)}
            {!team && !guest && (p.vis === 'public' ? ` · 🌍 ${_t("видят все")}` : ` · 👥 ${_t("только участникам")}`)}
            {team && boss && p.who !== 'all' && ` · ${p.who === 'brothers' ? _t("только братьям") : _t("только сёстрам")}`}
            {p.edited && ` · ${_t("изменён")}`}
          </small>
        </span>
        {p.pinned && <em className="ps-pinb">📌{team ? ` ${_t("Закреплено")}` : ''}</em>}
        {!guest && (boss || !p.mine) && <button type="button" className="ps-more" aria-label={_t("Ещё")} onClick={() => setMenu((v) => !v)}>⋯</button>}
      </header>
      {boss && p.later && <p className="ps-flag">🕒 {_tj("Выйдет {0}", when(p.at))}</p>}
      {boss && p.hidden && <p className="ps-flag">⚑ {_t("Скрыт после жалоб. Решение в админке → «Открытые круги».")}</p>}
      {menu && (
        <div className="ps-menu">
          {boss ? <>
            <button type="button" onClick={() => act(p.pinned ? 'unpin' : 'pin')}>{p.pinned ? _t("Открепить") : _t("📌 Закрепить сверху")}</button>
            <button type="button" onClick={() => act('edit')}>{_t("Изменить текст")}</button>
            <button type="button" className="del" onClick={() => act('del')}>{_t("Удалить")}</button>
          </> : <button type="button" onClick={report}>⚑ {_t("Пожаловаться")}</button>}
        </div>
      )}
      {edit !== null ? (
        <div className="ps-edit">
          <textarea value={edit} rows={4} maxLength={2000} onChange={(e) => setEdit(e.target.value)} />
          <div className="oc-row">
            <button type="button" className="ghost-btn" onClick={() => setEdit(null)}>{_t("Отмена")}</button>
            <button type="button" className="pri-btn" disabled={edit.trim().length < 2} onClick={async () => { const ok = await postSet(p.id, 'edit', edit); if (ok) { setEdit(null); onChange(); } else alert(_t("Не сохранилось. В открытом посте ссылки можно только кругам с галочкой.")); }}>{_t("Сохранить")}</button>
          </div>
        </div>
      ) : <p className="ps-body">{p.body}</p>}
      {p.photo && <Photo id={p.id} />}
      {p.link && <button type="button" className="ps-link" onClick={() => go(p.link!.u)}><span>{p.link.l}</span><span>›</span></button>}
      {reported && <p className="ps-flag">{_t("Спасибо, жалоба отправлена.")}</p>}
      <div className="ps-rx">
        {RX.filter((e) => react || (p.rx[e] ?? 0) > 0).filter((e) => team ? e !== '👍' : true).map((e) => (
          <button key={e} type="button" className={p.my === e ? 'on' : ''} disabled={!react} aria-label={RX_LABEL[e]} onClick={() => doReact(e)}>
            {(() => { const n = p.rx[e] ?? 0; const lbl = p.my === e || !n; return `${e} ${lbl ? RX_LABEL[e] : ''}${n ? `${lbl ? ' · ' : ''}${n.toLocaleString(LANG === 'en' ? 'en-GB' : 'ru-RU')}` : ''}`; })()}
          </button>
        ))}
        {share && <button type="button" onClick={doShare}>{_t("Поделиться")}</button>}
      </div>
    </article>
  );
}

const ERR: Record<string, string> = {
  empty: _t("Напиши хотя бы пару слов."),
  often: _t("Сегодня в круге уже 3 поста. Следующий можно завтра."),
  link: _t("Ссылки в постах «видят все» можно только кругам с галочкой. Ссылка должна начинаться с https://"),
  text: _t("Смешанный круг: в постах только текст, без фото."),
  photo: _t("Фото не подошло. Попробуй другое (JPEG или PNG)."),
  later: _t("Отложить можно не больше чем на 30 дней."),
  auth: _t("Писать посты могут только амир и помощники."),
};

/** «Новый пост». team = the common circle (who, push, later); open = the circle is in «Найти круг» (public or members). */
export function PostComposer({ code, team, open, onClose, onDone }: { code: string | null; team?: boolean; open?: boolean; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<{ mime: string; b64: string; url: string } | null>(null);
  const [linkOn, setLinkOn] = useState(false);
  const [ll, setLl] = useState('');
  const [lu, setLu] = useState('');
  const [vis, setVis] = useState<'public' | 'members'>(open ? 'public' : 'members');
  const [who, setWho] = useState<'all' | 'brothers' | 'sisters'>('all');
  const [pin, setPin] = useState(false);
  const [push, setPush] = useState(false);
  const [laterOn, setLaterOn] = useState(false);
  const [later, setLater] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const send = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await postAdd(code, {
      body, photo: photo ? { mime: photo.mime, b64: photo.b64 } : null, link: linkOn && lu.trim() ? { l: ll.trim(), u: lu.trim() } : null,
      vis, who, pin, push: team && push, at: team && laterOn && later ? new Date(later).toISOString() : null,
    });
    setBusy(false);
    if (r.r === 'ok') { if (team && push && !r.push) alert(_t("Пост вышел. Пуш сегодня уже был, этот пост без пуша.")); onDone(); return; }
    setMsg(ERR[r.r] ?? _t("Не получилось отправить. Проверь интернет."));
  };
  const Sw = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <button type="button" className={`uo-sw${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => set(!on)}><i /></button>
  );
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet ps-sheet" role="dialog" aria-label={_t("Новый пост")}>
        <div className="sheet-head"><h3>{_t("Новый пост")}</h3><button type="button" className="link-btn" onClick={onClose}>✕</button></div>
        <textarea className="ps-ta" rows={5} maxLength={2000} value={body} autoFocus onChange={(e) => setBody(e.target.value)}
          placeholder={team ? _t("Например: Ассаляму алейкум! Начинаем «10 дней Зуль-хиджи»…") : _t("Например: Сбор в субботу после Фаджра, потом завтрак")} />
        {photo && <div className="ps-prev"><img src={photo.url} alt="" /><button type="button" className="link-btn" onClick={() => setPhoto(null)}>{_t("Убрать фото")}</button></div>}
        <div className="ps-chips">
          <button type="button" aria-pressed={Boolean(photo)} onClick={() => file.current?.click()}>📷 {_t("Фото")}</button>
          <button type="button" aria-pressed={linkOn} onClick={() => setLinkOn((v) => !v)}>🔗 {_t("Кнопка-ссылка")}</button>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto(await shrinkPhoto(f)); }} />
        {linkOn && (
          <div className="ps-linkf">
            <input value={ll} maxLength={40} placeholder={_t("Текст кнопки, например: Открыть курс")} onChange={(e) => setLl(e.target.value)} />
            <input value={lu} maxLength={300} placeholder={_t("Ссылка: /app/?course=… или https://…")} onChange={(e) => setLu(e.target.value)} />
          </div>
        )}
        {team && <>
          <div className="oc-lbl ps-lbl">{_t("Кому показать")}</div>
          <div className="ps-chips">
            {([['all', _t("Всем")], ['brothers', _t("Только братьям")], ['sisters', _t("Только сёстрам")]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}
          </div>
        </>}
        {!team && open && <>
          <div className="oc-lbl ps-lbl">{_t("Кто увидит")}</div>
          <div className="ps-chips">
            <button type="button" aria-pressed={vis === 'public'} onClick={() => setVis('public')}>🌍 {_t("Все в «Найти круг»")}</button>
            <button type="button" aria-pressed={vis === 'members'} onClick={() => setVis('members')}>👥 {_t("Только участники")}</button>
          </div>
        </>}
        <div className="ps-opt"><span>📌 {_t("Закрепить сверху")}<small>{_t("Старый закреплённый пост уйдёт в ленту")}</small></span><Sw on={pin} set={setPin} label={_t("Закрепить сверху")} /></div>
        {team && <>
          <div className="ps-opt"><span>🔔 {_t("Пуш всем")}<small>{_t("Не чаще 1 раза в день, чтобы люди не отключали уведомления")}</small></span><Sw on={push} set={setPush} label={_t("Пуш всем")} /></div>
          <div className="ps-opt"><span>🕒 {_t("Отложить")}<small>{_t("Например, на завтра после Фаджра")}</small></span><Sw on={laterOn} set={setLaterOn} label={_t("Отложить")} /></div>
          {laterOn && <input className="ps-when" type="datetime-local" value={later} onChange={(e) => setLater(e.target.value)} />}
        </>}
        {!team && <p className="tiny">{_t("Участники увидят карточку «📣 Новый пост» в чате. Не больше 3 постов в день.")}</p>}
        {msg && <p className="uo-msg" role="status">{msg}</p>}
        <button type="button" className="pri-btn big-btn" disabled={busy || body.trim().length < 2} onClick={send}>{busy ? _t("Отправляю…") : _t("Опубликовать")}</button>
      </div>
    </>
  );
}

/** A whole feed: the common circle (code null) or one of my circles. */
export function PostFeed({ code, open, empty, seenKey, api }: { code: string | null; open?: boolean; empty?: string; seenKey: string; api?: ReturnType<typeof usePosts> }) {
  const own = usePosts(!api, code);
  const { d, load, patch } = api ?? own;
  const [compose, setCompose] = useState(false);
  const team = code === null;
  useEffect(() => { const top = d?.posts.filter((p) => !p.later).map((p) => p.at).sort().pop(); if (top) markPostSeen(seenKey, top); }, [d, seenKey]);
  return (
    <div className="ps-feed">
      {d?.can && <button type="button" className="ps-new" onClick={() => setCompose(true)}>＋ {_t("Новый пост")}</button>}
      {!d && <p className="tiny oc-pad">{_t("Загружаю…")}</p>}
      {d && !d.posts.length && empty !== '' && <p className="tiny oc-pad ps-empty">{empty ?? _t("Постов пока нет.")}</p>}
      {d?.posts.map((p) => <PostCard key={p.id} p={p} boss={d.can} react onChange={(x) => (x ? patch(x) : load())} share={team} />)}
      {compose && <PostComposer code={code} team={team} open={open} onClose={() => setCompose(false)} onDone={() => { setCompose(false); load(); }} />}
    </div>
  );
}

/** The pinned post as a strip over a circle's chat. */
export function PinBar({ post, onOpen }: { post: Post; onOpen: () => void }) {
  return (
    <button type="button" className="ps-pinbar" onClick={onOpen}>
      <i>📌</i><span><b>{_t("Закреплённый пост")}</b>{post.body.replace(/\s+/g, ' ')}</span><em>›</em>
    </button>
  );
}
