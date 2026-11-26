// «Личные» in Circles: the tab, «✎ Написать», the chat header menu, report, «Кто может мне писать» (src/dm.ts, supabase/dm.sql).
import { useEffect, useState, type ReactNode } from 'react';
import type { Msg } from '../chat';
import { readStateOf } from '../chat';
import type { CircleRef } from '../cloud';
import { _t, _tj, LOC } from '../i18n';
import { openPerson } from '../person';
import { Ava } from './Nick';
import { Ticks, shortOf } from './CircleChat';
import {
  type Dm, type DmPerson, type DmSettings, srcLine, dmPeople, openDm, dmWhy, dmPref, dmReport, dmSettings, dmSettingsSet, dmBlocked, dmUnblock, loadDms,
} from '../dm';
import { useSec } from '../usage';

interface Row { last: Msg | null; rd: [number, number] | null }

function timeOf(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return _t("Вчера");
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString(LOC, { weekday: 'short' });
  return d.toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
}

/** The «Личные» tab of «Круги». */
export function DmTab({ list, rows, unread, me, circles, onOpen, asks }: {
  list: Dm[]; rows: Record<string, Row | undefined>; unread: Record<string, number>; me: string | null; circles: CircleRef[];
  onOpen: (c: CircleRef) => void; asks: ReactNode;
}) {
  useSec('dm');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(false);
  const mine = new Map(circles.map((c) => [c.code, c]));
  const s = q.trim().toLowerCase();
  const shown = list
    .filter((d) => !d.blocked && mine.has(d.code))
    .filter((d) => (s ? `${d.name} ${d.nick ?? ''}`.toLowerCase().includes(s) : !d.hidden || (unread[d.code] ?? 0) > 0))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (rows[b.code]?.last?.id ?? 0) - (rows[a.code]?.last?.id ?? 0));
  if (pick) return <NewDm onClose={() => setPick(false)} />;
  return (
    <>
      <input className="wa-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={_t("🔍 Поиск по имени или нику")} />
      {asks}
      <div className="wa-rows dm-rows">
        {shown.map((d) => {
          const r = rows[d.code];
          const m = r?.last;
          const n = unread[d.code] ?? 0;
          const text = !m ? _t("Сообщений пока нет") : `${m.uid === me ? `${_t("Ты")}: ` : ''}${shortOf(m, 60)}`;
          return (
            <button key={d.code} type="button" className="wa-row dm-row" onClick={() => onOpen(mine.get(d.code)!)}>
              <span className="dm-av"><Ava pick={d.avatar} color={d.color} photo={d.photo} name={d.name} size={50} /></span>
              <span className="wa-rt">
                <span className="wa-l1"><b>{d.pinned ? '📌 ' : ''}{d.name || _t("Участник")}{d.muted ? ' 🔕' : ''}</b>{m && <time className={n ? 'new' : ''}>{timeOf(m.at)}</time>}</span>
                <span className="wa-l2"><span>{m?.uid === me && m.kind !== 'event' ? <><Ticks s={r?.rd ? readStateOf(r.rd[0], r.rd[1]) : 'sent'} /> </> : ''}{text}</span>{n > 0 && <em>{n > 99 ? '99+' : n}</em>}</span>
                {srcLine(d.src) && <span className="dm-src">{srcLine(d.src)}</span>}
              </span>
            </button>
          );
        })}
        {!shown.length && (s ? <p className="wa-none">{_t("Ничего не найдено")}</p> : (
          <div className="dm-empty">
            <b>{_t("Личных чатов пока нет")}</b>
            <p>{_t("Нажми «✎ Написать» и выбери брата или сестру из своих кругов. Тем, кто в одном круге с тобой, можно писать сразу, остальным уходит просьба с темой.")}</p>
          </div>
        ))}
      </div>
      <button type="button" className="dm-fab" onClick={() => setPick(true)}>{_t("✎ Написать")}</button>
    </>
  );
}

/** «✎ Написать»: people of my circles. */
function NewDm({ onClose }: { onClose: () => void }) {
  const [l, setL] = useState<DmPerson[] | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { dmPeople().then(setL); }, []);
  useEffect(() => { history.pushState({ lmDmNew: 1 }, ''); const f = (e: Event) => { e.stopImmediatePropagation(); onClose(); }; window.addEventListener('popstate', f, true); return () => window.removeEventListener('popstate', f, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = q.trim().toLowerCase();
  const shown = (l ?? []).filter((p) => !s || `${p.name} ${p.nick ?? ''}`.toLowerCase().includes(s));
  const go = async (p: DmPerson) => {
    if (p.mode === 'ask') { openPerson(p.uid); return; }
    if (p.mode !== 'direct' && p.mode !== 'chat') { setMsg(dmWhy(p.mode, p.name.split(' ')[0])); return; }
    setBusy(p.uid);
    const e = await openDm(p.uid);
    if (e) { setBusy(''); setMsg(e === 'ask' ? '' : dmWhy(e, p.name.split(' ')[0])); if (e === 'ask') openPerson(p.uid); }
  };
  const label = (p: DmPerson) => (p.mode === 'chat' ? _t("Чат") : p.mode === 'direct' ? _t("Написать") : p.mode === 'ask' ? _t("Просьба") : '');
  return (
    <div className="dm-new">
      <div className="dm-newbar">
        <button type="button" aria-label={_t("Назад")} onClick={() => history.back()}>←</button>
        <b>{_t("Новое сообщение")}</b>
      </div>
      <p className="dm-hint">{_t("Брату или сестре из своего круга пишешь сразу. Остальным уходит просьба с темой, и человек сам решает.")}</p>
      <input className="wa-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={_t("🔍 Имя или ник")} autoFocus />
      {msg && <p className="pp-msg">{msg}</p>}
      {l === null ? <p className="wa-none">{_t("Загружаю…")}</p> : !shown.length ? <p className="wa-none">{s ? _t("Ничего не найдено") : _t("В твоих кругах пока нет других людей. Позови кого-нибудь в круг.")}</p> : (
        <div className="wa-rows">
          {shown.map((p) => (
            <button key={p.uid} type="button" className="wa-row dm-row" disabled={busy === p.uid} onClick={() => go(p)}>
              <span className="dm-av"><Ava pick={p.avatar} color={p.color} photo={p.photo} name={p.name} size={46} /></span>
              <span className="wa-rt">
                <span className="wa-l1"><b>{p.name || _t("Участник")}</b>{label(p) && <span className={`dm-act${p.mode === 'ask' ? ' ask' : ''}`}>{label(p)}</span>}</span>
                <span className="wa-l2"><span>{[p.nick && `@${p.nick}`, p.circle && _t("Круг «{0}»", p.circle)].filter(Boolean).join(' · ')}</span></span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The header of a chat of two: their picture, where you know each other from, and ⋯. */
export function DmHead({ d: d0, code, title, onBack, back }: { d: Dm | undefined; code?: string; title: string; onBack?: () => void; back?: ReactNode }) {
  const [d1, setD1] = useState<Dm | undefined>(undefined);
  const d = d1 ?? d0;
  // a chat opened just now (an accepted request) may not be in the cached list yet; prefs change from the menu
  useEffect(() => {
    if (!code) return;
    const f = () => loadDms().then((l) => { const x = l?.find((y) => y.code === code); if (x) setD1(x); });
    if (!d0) f();
    window.addEventListener('lm-dms-changed', f);
    return () => window.removeEventListener('lm-dms-changed', f);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const [menu, setMenu] = useState(false);
  const [rep, setRep] = useState(false);
  const [note, setNote] = useState('');
  const name = d?.name || title;
  const first = name.split(' ')[0];
  const pref = async (p: { muted?: boolean; pinned?: boolean; hide?: boolean }) => { setMenu(false); if (!d) return; await dmPref(d.code, p); if (p.hide) { setNote(_t("Чат убран из списка. Вернётся, когда придёт новое сообщение.")); onBack?.(); } };
  const block = async () => {
    setMenu(false);
    if (!d || !confirm(_t("Заблокировать {0}? Он не сможет писать тебе и слать просьбы. Он об этом не узнает.", first))) return;
    if (await dmReport(d.code, '', true)) { setNote(_t("{0} заблокирован.", first)); onBack?.(); }
  };
  return (
    <>
      <header className="wa-head dm-head">
        {back}
        <button type="button" className="wa-who" onClick={() => d && openPerson(d.uid)}>
          <span className="dm-hav">{d ? <Ava pick={d.avatar} color={d.color} photo={d.photo} name={name} size={38} /> : <span className="nk-ava" style={{ width: 38, height: 38, background: '#1f7a4d' }}>{name.slice(0, 1)}</span>}</span>
          <span className="wa-ht"><b>{name}</b><small>{d ? srcLine(d.src) || _t("Личный чат") : _t("Личный чат")}</small></span>
        </button>
        {d && <button type="button" className="wa-hbtn" aria-label={_t("Ещё")} onClick={() => setMenu((x) => !x)}>⋯</button>}
      </header>
      {menu && d && (
        <div className="dm-menu" role="menu">
          <button type="button" onClick={() => { setMenu(false); openPerson(d.uid); }}>{_t("👤 Профиль")}</button>
          <button type="button" onClick={() => pref({ muted: !d.muted })}>{d.muted ? _t("🔔 Включить звук") : _t("🔕 Без звука")}</button>
          <button type="button" onClick={() => pref({ pinned: !d.pinned })}>{d.pinned ? _t("📌 Открепить") : _t("📌 Закрепить сверху")}</button>
          <button type="button" onClick={() => pref({ hide: true })}>{_t("🗂 Убрать из списка")}</button>
          <hr />
          <button type="button" className="red" onClick={() => { setMenu(false); setRep(true); }}>{_t("⚠️ Пожаловаться")}</button>
          <button type="button" className="red" onClick={block}>{_t("⛔ Заблокировать")}</button>
        </div>
      )}
      {rep && d && <DmReport d={d} onClose={(done) => { setRep(false); if (done) { setNote(_t("Спасибо. Мы посмотрим. {0} не узнает, кто пожаловался.", first)); if (done === 'block') onBack?.(); } }} />}
      {note && <p className="pp-msg dm-note" onClick={() => setNote('')}>{note}</p>}
    </>
  );
}

const REASONS = () => [_t("Спам или реклама"), _t("Грубость или оскорбления"), _t("Неуместно (брат/сестра, харам)"), _t("Обман, просит деньги")];
function DmReport({ d, onClose }: { d: Dm; onClose: (done: '' | 'yes' | 'block') => void }) {
  const [why, setWhy] = useState<string[]>([]);
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const first = d.name.split(' ')[0];
  const send = async () => { setBusy(true); const ok = await dmReport(d.code, why.join(', '), block); setBusy(false); onClose(ok ? (block ? 'block' : 'yes') : ''); };
  return (
    <div className="dm-dim" onClick={() => onClose('')}>
      <div className="dm-dlg" role="dialog" aria-label={_t("Жалоба")} onClick={(e) => e.stopPropagation()}>
        <b>{_tj("Пожаловаться на {0}?", first)}</b>
        <p>{_tj("Мы увидим последние 20 сообщений этого чата. {0} не узнает, кто пожаловался.", first)}</p>
        {REASONS().map((r) => (
          <label key={r} className="dm-ck"><input type="checkbox" checked={why.includes(r)} onChange={(e) => setWhy((w) => (e.target.checked ? [...w, r] : w.filter((x) => x !== r)))} />{r}</label>
        ))}
        <label className="dm-ck"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />{_t("И заблокировать")}</label>
        <div className="dm-bb">
          <button type="button" className="ghost-btn" onClick={() => onClose('')}>{_t("Отмена")}</button>
          <button type="button" className="dm-red" disabled={busy || !why.length} onClick={send}>{_t("Отправить")}</button>
        </div>
      </div>
    </div>
  );
}

/** Above the composer in a chat of two. */
export function DmNote({ msgs, me }: { msgs: Msg[]; me: string | null }) {
  const real = msgs.filter((m) => m.kind !== 'event' && !m.deleted);
  const theyWrote = real.some((m) => m.uid !== me);
  if (!real.length) return <p className="oc-chatnote">{_t("🔒 Личный чат: видите только вы двое. Ссылки, фото и файлы можно после первого ответа.")}</p>;
  if (!theyWrote) return <p className="oc-chatnote">{_t("Ссылки, фото и файлы можно после первого ответа собеседника.")}</p>;
  return null;
}

/** Profile → «Личные сообщения»: who can write to me. */
export function DmSettingsPage() {
  const [s, setS] = useState<DmSettings | null>(null);
  const [bl, setBl] = useState<{ uid: string; name: string; nick: string | null; color: string }[] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { dmSettings().then(setS); }, []);
  if (!s) return <p className="tiny">{_t("Загружаю…")}</p>;
  const set = async (p: Partial<DmSettings>) => { setS({ ...s, ...p }); setSaved(false); if (await dmSettingsSet(p)) setSaved(true); };
  const sister = s.gender === 'f';
  const R = ({ k, v, l, sub }: { k: 'circles' | 'others'; v: string; l: string; sub?: string }) => (
    <label className="dm-opt"><input type="radio" name={k} checked={s[k] === v} onChange={() => set({ [k]: v } as Partial<DmSettings>)} /><span>{l}{sub && <small>{sub}</small>}</span></label>
  );
  return (
    <div className="dm-set">
      {s.locked && <p className="note">{_t("Личные сообщения сейчас закрыты: на тебя пожаловались несколько человек. Мы посмотрим и откроем, если всё в порядке.")}</p>}
      <div className="dm-grp">
        <h4>{sister ? _t("Сёстры из моих кругов") : _t("Братья из моих кругов")}</h4>
        <R k="circles" v="direct" l={_t("Пишут сразу")} sub={_t("по умолчанию")} />
        <R k="circles" v="ask" l={_t("Сначала просьба")} />
        <R k="circles" v="none" l={_t("Не пишут")} />
      </div>
      <div className="dm-grp">
        <h4>{_t("Остальные люди")}</h4>
        <R k="others" v="all" l={_t("Просьба с темой")} sub={_t("ты решаешь, принять ли её")} />
        <R k="others" v="circles" l={_t("Только люди из моих кругов, просьбой")} />
        <R k="others" v="none" l={_t("Никто")} />
      </div>
      {sister && (
        <div className="dm-grp">
          <label className="dm-tg"><span>{_t("Просьбы по делу от братьев")}<small>{_t("Вопрос, умра, учёба, работа, бизнес. Знакомство для никаха только через «Никах» и вали.")}</small></span>
            <input type="checkbox" role="switch" checked={s.bro && !s.sisters_only} disabled={s.sisters_only} onChange={(e) => set({ bro: e.target.checked })} /></label>
          {s.sisters_only && <small className="dm-sub">{_t("Сейчас включено «только сёстры» в «Аккаунт и приватность», поэтому братья не пишут совсем.")}</small>}
        </div>
      )}
      <div className="dm-grp">
        <label className="dm-tg"><span>{_t("Показывать «прочитано» ✓✓")}<small>{_t("Если выключить, ты тоже не увидишь, прочитали ли тебя.")}</small></span>
          <input type="checkbox" role="switch" checked={s.ticks} onChange={(e) => set({ ticks: e.target.checked })} /></label>
        <p className="dm-sub">{_t("Во время намаза уведомления о сообщениях приходят через 20 минут. Отдельный чат можно сделать «Без звука» в его меню ⋯.")}</p>
      </div>
      <div className="dm-grp">
        <button type="button" className="dm-blk" onClick={() => (bl ? setBl(null) : dmBlocked().then(setBl))}><span>{_tj("Заблокированные · {0}", s.blocked)}</span><i>{bl ? '▾' : '›'}</i></button>
        {bl && !bl.length && <p className="dm-sub">{_t("Никого нет.")}</p>}
        {bl?.map((u) => (
          <div key={u.uid} className="dm-bl"><Ava color={u.color} name={u.name} size={34} /><b>{u.name || (u.nick ? `@${u.nick}` : _t("Участник"))}</b>
            <button type="button" className="link-btn" onClick={async () => { if (await dmUnblock(u.uid)) { setBl(bl.filter((x) => x.uid !== u.uid)); setS({ ...s, blocked: Math.max(0, s.blocked - 1) }); } }}>{_t("Разблокировать")}</button></div>
        ))}
      </div>
      <p className="dm-sub">{_t("Брат и сестра пишут друг другу только просьбой по делу. Новые люди могут писать в личку через сутки после регистрации, не больше 10 новых чатов в день. Первое сообщение без ссылок и файлов.")}</p>
      {saved && <p className="dm-sub ok">{_t("Сохранено")}</p>}
    </div>
  );
}
