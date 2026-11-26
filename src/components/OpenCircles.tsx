// «Найти круг»: the common circle «Общий круг Living Muslim» on top, open circles below, a look inside before
// joining, the owner's «Открытый круг» settings with requests, and the newcomer note in an open circle's chat.
// Server side: supabase/open-circles.sql. Everything stays hidden until that file is run.
import { useEffect, useMemo, useState } from 'react';
import { _t, _tj, LANG } from '../i18n';
import { Ic } from './LIcon';
import { plural } from '../dates';
import { DAY_AYAHS } from '../ayahs';
import { usePosts, usePostsReady, postSeen } from '../posts';
import { PostFeed, PostCard } from './Posts';
import { ensureMe, enterCircle, getProfile, saveProfile, kindOf, cloudMe, signupName, isCloud, type CircleKind } from '../cloud';
import {
  OPEN_KINDS, openList, openView, openJoin, openAskCancel, openMine, openSet, openAnswer, openMe, useCommon, commonJuz, commonDuaAdd,
  commonAmin, commonReport, commonDuaDel, savedGender, rememberGender, type OpenCard, type OpenView, type OpenMine, type OpenSettings, type OpenMe, type OWho,
} from '../openCircles';
import { TOPICS, topicOf, subjectsText, useSisCirclesReady, openTopicGet, openTopicSet, myTown, sameTown, type Topic } from '../sisCircles';
import { useSec } from '../usage';

const KIND_BG: Record<string, string> = { brothers: '#e8f3ec', sisters: '#fbe8f0', friends: '#eef0f3', masjid: '#efe7fb', study: '#e6f4f6', startup: '#ece7fb', other: '#f6f0dc' };
const WHO: Record<OWho, string> = { brothers: _t("только братья"), sisters: _t("только сёстры"), all: _t("для всех, только текст") };
const nf = (n: number) => n.toLocaleString(LANG === 'en' ? 'en-GB' : 'ru-RU');

/** The gender the catalog uses: from the profile, else what was picked here. */
function useGender(fallback: '' | 'm' | 'f') {
  const [g, setG] = useState<'' | 'm' | 'f'>(() => savedGender() || fallback);
  useEffect(() => {
    if (!cloudMe()) return;
    getProfile().then((p) => { if (p?.gender === 'm' || p?.gender === 'f') { setG(p.gender); rememberGender(p.gender); } });
  }, []);
  const pick = (v: 'm' | 'f') => {
    setG(v); rememberGender(v);
    if (cloudMe()) saveProfile({ gender: v }, cloudMe()!.name).catch(() => {});
  };
  return [g, pick] as const;
}

// ---------- the common circle ----------

/** Posts of the common circle I have not seen yet. */
function useCommonNew(on: boolean) {
  const api = usePosts(on, null);
  const seen = postSeen('common');
  const fresh = (api.d?.posts ?? []).filter((p) => !p.later && !p.hidden && p.at > seen);
  return { api, fresh };
}

export function CommonCard({ today, onOpen, sis }: { today: string; onOpen: () => void; sis?: boolean }) {
  const { c } = useCommon(true, today);
  const postsOn = usePostsReady();
  const { fresh } = useCommonNew(postsOn);
  const taken = c?.khatm.length ?? 0;
  return (
    <button type="button" className={`oc-common${sis ? ' oc-csis' : ''}`} onClick={onOpen}>
      <span className="oc-ch"><i>☪</i><span><b>{_t("Общий круг Living Muslim")}</b><small>{c ? _tj("Ты уже здесь · {0} братьев и сестёр", nf(c.people)) : _t("Ты уже здесь")}</small></span></span>
      <span className="oc-nums">
        <span><b>{c ? nf(c.fajr) : '…'}</b>{_t("прочитали Фаджр сегодня")}</span>
        <span><b>{taken} / 30</b>{_t("джузов хатма месяца")}</span>
        <span><b>{c ? c.dua.length : '…'}</b>{_t("просьб о дуа")}</span>
      </span>
      {fresh.length > 0 && <span className="oc-cpost">📣 <b>{_t("Новый пост:")}</b> {fresh[0].body.replace(/\s+/g, ' ').slice(0, 90)}</span>}
    </button>
  );
}

const DUA_ERR: Record<string, string> = {
  new: _t("Просить дуа можно через сутки после регистрации. Пока можно сказать «Амин» другим."),
  often: _t("Одна просьба в сутки. Завтра можно ещё."),
  link: _t("Без ссылок, ников и телефонов: просьба анонимная."),
  short: _t("Напиши хотя бы пару слов."),
};

export function CommonCircle({ today, onBack, onFind }: { today: string; onBack: () => void; onFind: () => void }) {
  useSec('open');
  const { c, month, reload } = useCommon(true, today);
  const postsOn = usePostsReady();
  const { api: posts, fresh } = useCommonNew(postsOn);
  // Opens on «Посты» when there are any (or I write them), else on «Вместе»; a tab picked by hand is kept for the session.
  const [picked, setPicked] = useState<'posts' | 'together' | null>(() => { try { const t = sessionStorage.getItem('lm.commonTab'); return t === 'posts' || t === 'together' ? t : null; } catch { return null; } });
  const tab: 'posts' | 'together' = picked ?? (posts.d && (posts.d.posts.length || posts.d.can) ? 'posts' : 'together');
  const pickTab = (t: 'posts' | 'together') => { setPicked(t); try { sessionStorage.setItem('lm.commonTab', t); } catch { /* */ } };
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ayah = DAY_AYAHS[Math.floor(Date.parse(today) / 86400000) % DAY_AYAHS.length];
  const mine = c?.khatm.find((k) => k.mine && !k.done);
  const free = useMemo(() => { const t = new Set((c?.khatm ?? []).map((k) => k.juz)); return Array.from({ length: 30 }, (_, i) => i + 1).filter((j) => !t.has(j)); }, [c]);
  const need = async () => { if (!cloudMe()) await ensureMe(signupName()); };
  const juz = async (j: number, act: 'take' | 'done' | 'drop') => {
    setBusy(true); await need();
    const r = await commonJuz(month, j, act);
    setBusy(false);
    if (r === 'one') setMsg(_t("Сначала дочитай свой джуз, потом бери следующий."));
    else if (r === 'taken') setMsg(_t("Этот джуз уже взяли. Возьми другой."));
    else setMsg(act === 'take' ? _tj("Джуз {0} твой. Прочитай до конца месяца, иншаАллах.", j) : act === 'done' ? _t("МашаАллах! Джуз прочитан.") : '');
    reload();
  };
  const amin = async (id: number) => { await need(); await commonAmin(id); reload(); };
  const report = async (id: number) => { if (!confirm(_t("Пожаловаться на эту просьбу? Она скроется у тебя сразу."))) return; await need(); await commonReport(id); reload(); };
  const send = async () => {
    if (busy) return;
    setBusy(true); await need();
    const r = await commonDuaAdd(text);
    setBusy(false);
    if (r === 'ok') { setAsking(false); setText(''); setMsg(_t("Просьба отправлена анонимно. Братья и сёстры скажут «Амин».")); reload(); }
    else setMsg(DUA_ERR[r] ?? _t("Не получилось отправить. Проверь интернет."));
  };
  return (
    <div className="page oc-page">
      <div className="wa-ibar"><button type="button" aria-label={_t("Назад")} onClick={onBack}>←</button><b>{_t("Общий круг Living Muslim")}</b></div>
      <p className="oc-sub">{c ? _tj("{0} участников · ведёт команда приложения · без чата и личных сообщений", nf(c.people)) : _t("Ведёт команда приложения")}</p>
      {postsOn && (
        <div className="ps-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'posts'} onClick={() => pickTab('posts')}>{_t("Посты")}{fresh.length > 0 && tab !== 'posts' && <em>{fresh.length}</em>}</button>
          <button type="button" role="tab" aria-selected={tab === 'together'} onClick={() => pickTab('together')}>{_t("Вместе")}</button>
        </div>
      )}
      {postsOn && tab === 'posts' ? <PostFeed code={null} api={posts} seenKey="common" empty={_t("Здесь будут новости и напоминания от команды Living Muslim.")} /> : <>
      {msg && <p className="uo-msg" role="status">{msg}</p>}
      {ayah && (
        <div className="oc-pin">
          <small>{_t("Аят дня")}</small>
          <p lang="ar" dir="rtl" className="oc-ar">{ayah.ar}</p>
          <span>«{LANG === 'en' ? ayah.en : ayah.ru}» ({ayah.s}:{ayah.a})</span>
        </div>
      )}
      <div className="oc-pin">
        <small>{_t("Сегодня вместе")}</small>
        <span><b>{c ? nf(c.fajr) : '…'}</b> {_t("человек отметили Фаджр сегодня.")} {c?.marked ? _t("Ты тоже в деле, МашаАллах.") : _t("Отметь свой Фаджр на «Сегодня», и ты тоже попадёшь в счёт.")}</span>
        <div className="oc-bar"><i style={{ width: `${c && c.people ? Math.min(100, Math.round((c.fajr / c.people) * 100)) : 0}%` }} /></div>
      </div>
      <div className="oc-pin">
        <small>{_t("Хатм месяца")}</small>
        <span>{_tj("Взято {0} из 30 джузов, прочитано {1}.", c?.khatm.length ?? 0, c?.khatm.filter((k) => k.done).length ?? 0)}</span>
        <div className="oc-juz">{Array.from({ length: 30 }, (_, i) => i + 1).map((j) => { const k = c?.khatm.find((x) => x.juz === j); return <i key={j} title={String(j)} className={k ? (k.mine ? 'm' : k.done ? 'd' : 't') : ''} />; })}</div>
        {mine ? (
          <div className="oc-row">
            <button type="button" className="pri-btn" disabled={busy} onClick={() => juz(mine.juz, 'done')}>{_tj("Я прочитал джуз {0}", mine.juz)}</button>
            <button type="button" className="link-btn" disabled={busy} onClick={() => juz(mine.juz, 'drop')}>{_t("Отдать")}</button>
          </div>
        ) : free.length ? (
          <button type="button" className="pri-btn" disabled={busy} onClick={() => juz(free[0], 'take')}>{_tj("Взять джуз {0}", free[0])}</button>
        ) : <span className="oc-ok">{_t("Все 30 джузов разобраны. АльхамдулиЛлях!")}</span>}
      </div>
      <h3 className="oc-h">{_t("Просьбы о дуа · анонимно")}</h3>
      {!c?.dua.length && <p className="tiny">{_t("Пока просьб нет. Можно попросить первым.")}</p>}
      {c?.dua.map((d) => (
        <div key={d.id} className="oc-pin oc-dua">
          <span>«{d.body}»</span>
          <div className="oc-row">
            <button type="button" className={`oc-amin${d.said ? ' on' : ''}`} disabled={d.said || d.mine} onClick={() => amin(d.id)}>🤲 {_t("Амин")} · {d.amin}</button>
            {d.mine ? <button type="button" className="link-btn" onClick={async () => { await commonDuaDel(d.id); reload(); }}>{_t("Удалить")}</button>
              : <button type="button" className="link-btn oc-rep" aria-label={_t("Пожаловаться")} onClick={() => report(d.id)}>⚑</button>}
          </div>
        </div>
      ))}
      {asking ? (
        <div className="oc-ask">
          <textarea value={text} maxLength={200} rows={3} placeholder={_t("Например: помолитесь за маму, у неё операция в среду")} onChange={(e) => setText(e.target.value)} />
          <small>{_t("Без имени: никто не увидит, кто просит. Без ссылок и телефонов.")}</small>
          <div className="oc-row"><button type="button" className="ghost-btn" onClick={() => setAsking(false)}>{_t("Отмена")}</button><button type="button" className="pri-btn" disabled={busy} onClick={send}>{_t("Отправить")}</button></div>
        </div>
      ) : (
        <div className="oc-foot">
          <button type="button" onClick={() => { setMsg(''); setAsking(true); }}>🤲 {_t("Попросить дуа")}</button>
          <button type="button" onClick={onFind}>{_t("Найти малый круг ›")}</button>
        </div>
      )}
      </>}
    </div>
  );
}

// ---------- the catalog ----------

const KIND_FILTERS: (CircleKind | '')[] = ['', 'brothers', 'sisters', 'study', 'masjid', 'startup', 'friends', 'other'];

export function OpenCatalog({ today, g, pick, onView }: { today: string; g: '' | 'm' | 'f'; pick: (g: 'm' | 'f') => void; onView: (id: string) => void }) {
  useSec('open');
  const [list, setList] = useState<OpenCard[] | null>(null);
  const [k, setK] = useState<CircleKind | ''>('');
  const [tp, setTp] = useState<Topic | 'near' | ''>('');
  const themes = useSisCirclesReady() && g === 'f';
  const town = useMemo(myTown, []);
  useEffect(() => { if (g) openList(g, today).then(setList); }, [g, today]);
  if (!g) {
    return (
      <div className="oc-gender">
        <b>{_t("Кому показывать круги?")}</b>
        <small>{_t("Братья видят круги братьев, сёстры видят круги сестёр. Это сохранится в профиле.")}</small>
        <div className="oc-row"><button type="button" className="pri-btn" onClick={() => pick('m')}>{_t("Я брат")}</button><button type="button" className="pri-btn oc-sis" onClick={() => pick('f')}>{_t("Я сестра")}</button></div>
      </div>
    );
  }
  const kinds = KIND_FILTERS.filter((x) => !x || (g === 'f' ? x !== 'brothers' : x !== 'sisters'));
  const shown = (list ?? []).filter((c) => (!k || c.kind === k) && (!tp || (tp === 'near' ? sameTown(c.city, town) : c.topic === tp)));
  const tiles = TOPICS.filter((t) => ['moms', 'new', 'hifz', 'tajwid', 'sport'].includes(t.k) || (list ?? []).some((c) => c.topic === t.k));
  const cnt = (n: number) => (n ? _tj("{0} {1}", n, plural(n, _t("круг"), _t("круга"), _t("кругов"))) : _t("пока нет"));
  return (
    <div className={`oc-cat${g === 'f' ? ' sis' : ''}`}>
      {themes && (
        <div className="sc-tiles">
          {tiles.map((t) => (
            <button key={t.k} type="button" className="sc-tile" aria-pressed={tp === t.k} style={{ background: t.bg, color: t.fg }} onClick={() => setTp(tp === t.k ? '' : t.k)}>
              {t.l()}<small>{cnt((list ?? []).filter((c) => c.topic === t.k).length)}</small>
            </button>
          ))}
          {town && (
            <button type="button" className="sc-tile" aria-pressed={tp === 'near'} style={{ background: '#f3e6dc', color: '#9a5a33' }} onClick={() => setTp(tp === 'near' ? '' : 'near')}>
              {_t("Рядом со мной")}<small>{town}</small>
            </button>
          )}
        </div>
      )}
      {tp && <p className="sc-on">{tp === 'near' ? _tj("Круги в городе {0}", town) : topicOf(tp)?.l()} <button type="button" className="link-btn" onClick={() => setTp('')}>{_t("Показать все")}</button></p>}
      <div className="wa-filt oc-filt">{kinds.filter((x) => !x || (list ?? []).some((c) => c.kind === x)).map((x) => <button key={x || 'all'} type="button" aria-pressed={k === x} onClick={() => setK(x)}>{x ? kindOf(x)?.ru : _t("Все")}</button>)}</div>
      <div className="oc-lbl">{g === 'f' ? _t("Открытые круги для сестёр") : _t("Открытые круги")}</div>
      {!list && <p className="tiny oc-pad">{_t("Загружаю круги…")}</p>}
      {list && !shown.length && (
        <div className="uo-empty oc-pad">
          <b>{_t("Открытых кругов пока нет")}</b>
          <small>{_t("Создай свой круг и включи «Открытый круг» в «Данных круга»: он появится здесь для других.")}</small>
        </div>
      )}
      {shown.map((c) => (
        <button key={c.id} type="button" className="oc-item" onClick={() => onView(c.id)}>
          <span className="oc-av" style={{ background: KIND_BG[c.kind] ?? '#eef0f3' }}><Ic e={kindOf(c.kind)?.ic ?? '👥'} /></span>
          <span className="oc-t">
            <b>{c.title}</b>
            {c.about && <small>{c.about.length > 90 ? c.about.slice(0, 88) + '…' : c.about}</small>}
            <span className="oc-tags">
              {c.today > 0 && <em className="gr">{_tj("{0} из {1} сегодня в деле", c.today, c.n)}</em>}
              {c.teacher && <em className="gd">{g === 'f' ? _t("✓ проверенная учительница") : _t("✓ проверенный учитель")}</em>}
              {c.verified && !c.teacher && <em className="gd">{c.kind === 'masjid' ? _t("✓ проверенная мечеть") : _t("✓ проверено")}</em>}
              {c.topic && topicOf(c.topic) && !tp && <em className="tp">{topicOf(c.topic)!.l()}</em>}
              {!c.today && <em>{_tj("{0} {1}", c.n, plural(c.n, _t("человек"), _t("человека"), _t("человек")))}</em>}
              <em>{c.city || _t("онлайн")}</em>
              {c.who === 'all' && <em>{_t("только текст")}</em>}
              {c.kind === 'other' && c.post_at && Date.now() - Date.parse(c.post_at) < 3 * 86400000 && <em className="nw">📣 {_t("новый пост")}</em>}
            </span>
          </span>
          <span className={`oc-act${c.member ? ' in' : c.join === 'open' ? ' f' : ''}`}>
            {c.member ? _t("Ты здесь") : c.asked === 'pending' ? _t("Ждёт ответа") : c.asked === 'accepted' ? _t("Принят") : c.n >= c.max ? _t("Мест нет") : c.join === 'open' ? _t("Войти") : _t("Попроситься")}
          </span>
        </button>
      ))}
      {g === 'f' && <p className="oc-note">{_t("Братья этот список не видят. Писать сёстрам в личку из открытых кругов нельзя.")}</p>}
    </div>
  );
}

// ---------- a look inside before joining ----------

const JOIN_ERR: Record<string, string> = {
  full: _t("Мест в круге нет. Попробуй другой."),
  closed: _t("Этот круг сейчас закрыт для новых."),
  banned: _t("Тебя убрали из этого круга, войти снова нельзя."),
  often: _t("Сегодня уже много просьб. Попробуй завтра."),
};

export function OpenPreview({ id, today, sex: g, onBack }: { id: string; today: string; sex: '' | 'm' | 'f'; onBack: () => void }) {
  const [v, setV] = useState<OpenView | null | undefined>(undefined);
  const postsOn = usePostsReady();
  const posts = usePosts(postsOn, null, id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => openView(g, id, today).then(setV);
  useEffect(() => { load(); }, [id, g]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    if (!v || busy) return;
    setBusy(true); setMsg('');
    const me = await ensureMe(signupName()).catch(() => null);
    if (!me) { setBusy(false); setMsg(_t("Нет связи с сервером. Проверь интернет.")); return; }
    if (g && !(await getProfile())?.gender) await saveProfile({ gender: g as 'm' | 'f' }, me.name);
    const r = await openJoin(v.id, note);
    setBusy(false);
    if (r.r === 'ok' && r.code) { enterCircle({ code: r.code, title: r.title || v.title, kind: r.kind || v.kind }); return; }
    if (r.r === 'asked') { setMsg(_t("✓ Просьба отправлена. Когда амир примет, приглашение появится вверху вкладки «Круг».")); load(); return; }
    setMsg(JOIN_ERR[r.r] ?? _t("Не получилось. Проверь интернет и попробуй ещё раз."));
  };
  const cancel = async () => { setBusy(true); await openAskCancel(id); setBusy(false); setMsg(''); load(); };
  if (v === undefined) return <div className="page oc-page"><div className="wa-ibar"><button type="button" aria-label={_t("Назад")} onClick={onBack}>←</button><b>{_t("Круг")}</b></div><p className="tiny oc-pad">{_t("Загружаю…")}</p></div>;
  if (!v) return <div className="page oc-page"><div className="wa-ibar"><button type="button" aria-label={_t("Назад")} onClick={onBack}>←</button><b>{_t("Круг")}</b></div><p className="tiny oc-pad">{_t("Этот круг больше не открыт.")}</p></div>;
  const full = v.n >= v.max;
  return (
    <div className="page oc-page">
      <div className="wa-ibar"><button type="button" aria-label={_t("Назад")} onClick={onBack}>←</button><b>{_t("Открытый круг")}</b></div>
      <div className="oc-hero">
        <span className="oc-av big" style={{ background: KIND_BG[v.kind] ?? '#eef0f3' }}><Ic e={kindOf(v.kind)?.ic ?? '👥'} /></span>
        <b>{v.title}</b>
        <small>{[v.join === 'open' ? _t("вход сразу") : _t("по просьбе"), WHO[v.who], v.amir ? _tj("амир: {0}", v.amir) : ''].filter(Boolean).join(' · ')}</small>
        {v.verified && !v.teacher && <em className="oc-ver">{v.kind === 'masjid' ? _t("✓ проверенная мечеть") : _t("✓ проверено командой")}</em>}
      </div>
      {v.teacher && (
        <div className="oc-sec sc-teach">
          <b>{g === 'f' ? _t("✓ Проверенная учительница") : _t("✓ Проверенный учитель")}</b>
          <p>{subjectsText(v.tsub) ? _tj("Знания по предметам «{0}» проверены командой Living Muslim: иджаза или диплом и рекомендация.", subjectsText(v.tsub)) : _t("Иджаза или диплом и рекомендация проверены командой Living Muslim.")}</p>
        </div>
      )}
      <div className="oc-stats">
        <span><b>{v.n}</b>{plural(v.n, _t("участник"), _t("участника"), _t("участников"))}</span>
        <span><b>{v.today}</b>{_t("сегодня в деле")}</span>
        <span><b>{v.fajr}%</b>{_t("Фаджр вовремя за неделю")}</span>
      </div>
      {v.about && <div className="oc-sec"><h4>{_t("О круге")}</h4><p>{v.about}</p></div>}
      {postsOn && v.kind === 'other' && !v.member && Boolean(posts.d?.posts.length) && (
        <>
          <div className="oc-lbl">{_t("Посты круга")}</div>
          <div className="ps-guest">{posts.d!.posts.map((p) => <PostCard key={p.id} p={p} boss={false} react={false} guest onChange={() => {}} />)}</div>
        </>
      )}
      <div className="oc-sec">
        <h4>{_t("Правила круга")}</h4>
        <ul>
          {v.rules.map((r) => <li key={r}>{r}</li>)}
          <li>{_t("Новички пишут в чат через сутки, первые 3 дня без ссылок и файлов")}</li>
          {v.who === 'all' && <li>{_t("Смешанный круг: только текст, без личных сообщений")}</li>}
        </ul>
      </div>
      <div className="oc-sec"><small>{[v.city || _t("онлайн"), v.lang === 'en' ? 'English' : 'Русский', _tj("кругу {0} {1}", v.days, plural(v.days, _t("день"), _t("дня"), _t("дней")))].join(' · ')}</small></div>
      {msg && <p className="uo-msg oc-pad" role="status">{msg}</p>}
      <div className="oc-cta">
        {v.member && v.code ? (
          <button type="button" className="pri-btn big-btn" onClick={() => enterCircle({ code: v.code!, title: v.title, kind: v.kind })}>{_t("Открыть круг")}</button>
        ) : v.asked === 'pending' ? (
          <><span className="oc-ok">{_t("Просьба отправлена, ждём ответа амира.")}</span><button type="button" className="link-btn" disabled={busy} onClick={cancel}>{_t("Отменить просьбу")}</button></>
        ) : v.asked === 'accepted' ? (
          <span className="oc-ok">{_t("Амир принял тебя. Приглашение ждёт вверху вкладки «Круг».")}</span>
        ) : full ? (
          <span className="oc-ok">{_t("Мест в круге сейчас нет.")}</span>
        ) : (
          <>
            {v.join === 'ask' && <textarea value={note} maxLength={200} rows={2} placeholder={_t("Пара слов о себе для амира (необязательно)")} onChange={(e) => setNote(e.target.value)} />}
            <button type="button" className="pri-btn big-btn" disabled={busy || !isCloud} onClick={go}>{v.join === 'open' ? _t("Войти в круг") : _t("Попроситься в круг")}</button>
          </>
        )}
        <small>{v.join === 'open' ? _t("В кругу увидят твой ник и итог дня. Телефон и почта не видны никому.") : _t("Амир увидит твоё имя, ник и город. Телефон и почта не видны никому.")}</small>
      </div>
    </div>
  );
}

/** The whole «Найти круг» view: the common circle card on top, the catalog below; owns its sub-pages. */
export function FindCircle({ today, sex, onCommon }: { today: string; sex: '' | 'm' | 'f'; onCommon: () => void }) {
  const [view, setView] = useState<string | null>(null);
  const [g, pick] = useGender(sex);
  useEffect(() => {
    if (!view) return;
    history.pushState({ lmOpen: 1 }, '');
    const f = (e: Event) => { e.stopImmediatePropagation(); setView(null); };
    window.addEventListener('popstate', f, true);
    return () => window.removeEventListener('popstate', f, true);
  }, [view]);
  if (view) return <OpenPreview id={view} today={today} sex={g} onBack={() => history.back()} />;
  return (
    <>
      <CommonCard today={today} onOpen={onCommon} sis={g === 'f'} />
      <OpenCatalog today={today} g={g} pick={pick} onView={(id) => { setView(id); window.scrollTo(0, 0); }} />
    </>
  );
}

// ---------- the owner's switch in «Данные круга» ----------

const OPEN_ERR: Record<string, string> = {
  kind: _t("Этот вид круга открыть нельзя: семья, умра и бизнес остаются только для своих."),
  gender: _t("Сначала укажи в профиле, брат ты или сестра. Круг сестёр открывает только сестра."),
  not_owner: _t("Открыть круг может только тот, кто его создал."),
};

export function OpenOwnerBox({ code, kind }: { code: string; kind?: CircleKind }) {
  const [m, setM] = useState<OpenMine | null | undefined>(undefined);
  const [edit, setEdit] = useState<OpenSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => openMine(code).then((r) => { setM(r); if (r?.open) setEdit(null); });
  useEffect(() => { load(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || (!m.can && !m.open)) return null;
  if (kind && !OPEN_KINDS.includes(kind) && !m.open) return null;
  const def: OpenSettings = { about: '', rules: [''], who: m.gender === 'f' ? 'sisters' : 'brothers', join: 'ask', lang: LANG, city: '', max: 30, helpers: [] };
  const cur = edit ?? (m.open ? { ...m.open, who: (m.open.wants_all ? 'all' : m.open.who) as OWho, rules: m.open.rules.length ? m.open.rules : [''] } : null);
  const save = async (p: OpenSettings | null) => {
    setBusy(true); setMsg('');
    const r = await openSet(code, p ? { ...p, rules: p.rules.map((x) => x.trim()).filter(Boolean) } : null);
    setBusy(false);
    if (r === 'ok') { setEdit(null); setMsg(p ? (p.who === 'all' && !m.open?.verified ? _t("✓ Сохранено. «Для всех» включится после проверки командой, пока круг виден только своим по полу.") : _t("✓ Круг открыт и виден в «Найти круг».")) : _t("Круг закрыт: в «Найти круг» его больше нет.")); load(); }
    else setMsg(OPEN_ERR[r] ?? _t("Не получилось сохранить. Проверь интернет."));
  };
  const answer = async (id: string, yes: boolean) => {
    const r = await openAnswer(id, yes);
    if (r === 'full') setMsg(_t("Круг полный: увеличь «Не больше» или освободи место."));
    load();
  };
  const fixedWho = kind === 'brothers' || kind === 'sisters';
  const set = (p: Partial<OpenSettings>) => setEdit({ ...(cur ?? def), ...p });
  return (
    <div className="wa-isec oc-own" id="oc-own">
      <div className="oc-sw-row">
        <span><b>{_t("Открытый круг")}</b><small>{m.open ? _t("Виден в «Найти круг» тем, кто подходит") : _t("Сейчас круг видят только приглашённые")}</small></span>
        {m.owner && <button type="button" className={`uo-sw${m.open || edit ? " on" : ""}`} aria-pressed={Boolean(m.open || edit)} aria-label={_t("Открытый круг")} disabled={busy}
          onClick={() => (m.open ? (confirm(_t("Закрыть круг? Он пропадёт из «Найти круг», просьбы отменятся. Участники останутся.")) && save(null)) : setEdit(edit ? null : def))}><i /></button>}
      </div>
      {msg && <p className="uo-msg" role="status">{msg}</p>}
      {m.owner && cur && m.gender !== 'm' && m.gender !== 'f' && (
        <div className="oc-gender oc-in">
          <b>{_t("Кому показывать круг?")}</b>
          <small>{_t("Братья видят круги братьев, сёстры видят круги сестёр. Это сохранится в профиле.")}</small>
          <div className="oc-row">
            {(['m', 'f'] as const).map((g) => <button key={g} type="button" className={`pri-btn${g === 'f' ? ' oc-sis' : ''}`} onClick={async () => { rememberGender(g); await saveProfile({ gender: g }, cloudMe()?.name || ''); load(); }}>{g === 'm' ? _t("Я брат") : _t("Я сестра")}</button>)}
          </div>
        </div>
      )}
      {m.open && !edit && <TopicPick code={code} />}
      {m.owner && m.open && !edit && (
        <p className="oc-sum">{[m.open.join === 'open' ? _t("вход сразу") : _t("по просьбе"), WHO[m.open.who], m.open.city || _t("онлайн"), _tj("до {0} человек", m.open.max)].join(' · ')}{m.open.wants_all && !m.open.verified ? _t(" · «для всех» ждёт проверки") : ''}{' '}
          <button type="button" className="link-btn" onClick={() => setEdit(cur)}>{_t("Изменить")}</button></p>
      )}
      {m.owner && cur && (edit || !m.open) && (m.gender === 'm' || m.gender === 'f') && (
        <div className="oc-form">
          {!fixedWho && (
            <label className="cl-f"><span>{_t("Кто видит")}</span>
              <select value={cur.who} onChange={(e) => set({ who: e.target.value as OWho })}>
                <option value={m.gender === 'f' ? 'sisters' : 'brothers'}>{m.gender === 'f' ? _t("Только сёстры") : _t("Только братья")}</option>
                <option value="all">{_t("Все (после проверки командой, только текст)")}</option>
              </select>
            </label>
          )}
          {fixedWho && <p className="tiny">{kind === 'sisters' ? _t("Круг сестёр видят только сёстры.") : _t("Круг братьев видят только братья.")}</p>}
          <label className="cl-f"><span>{_t("Вход")}</span>
            <select value={cur.join} onChange={(e) => set({ join: e.target.value as 'open' | 'ask' })}>
              <option value="ask">{_t("По просьбе: я принимаю сам")}</option>
              <option value="open">{_t("Сразу, без просьбы")}</option>
            </select>
          </label>
          <label className="cl-f"><span>{_t("О круге")}</span><textarea rows={2} maxLength={300} value={cur.about} placeholder={_t("Например: вместе встаём на Фаджр в мечеть")} onChange={(e) => set({ about: e.target.value })} /></label>
          <div className="cl-f"><span>{_t("Правила круга (новичок видит их до входа)")}</span>
            {cur.rules.map((r, i) => <input key={i} value={r} maxLength={120} placeholder={i === 0 ? _t("Например: без споров и политики") : _t("Ещё правило")} onChange={(e) => set({ rules: cur.rules.map((x, j) => (j === i ? e.target.value : x)) })} />)}
            {cur.rules.length < 5 && <button type="button" className="link-btn" onClick={() => set({ rules: [...cur.rules, ''] })}>{_t("+ правило")}</button>}
          </div>
          <div className="oc-two">
            <label className="cl-f"><span>{_t("Город")}</span><input value={cur.city} maxLength={40} placeholder={_t("пусто = онлайн")} onChange={(e) => set({ city: e.target.value })} /></label>
            <label className="cl-f"><span>{_t("Язык")}</span><select value={cur.lang} onChange={(e) => set({ lang: e.target.value })}><option value="ru">Русский</option><option value="en">English</option></select></label>
            <label className="cl-f"><span>{_t("Не больше")}</span><input type="number" min={3} max={50} value={cur.max} onChange={(e) => set({ max: Math.max(3, Math.min(50, Number(e.target.value) || 30)) })} /></label>
          </div>
          {m.members.length > 0 && (
            <div className="cl-f"><span>{_t("Помощники амира (до 3): принимают людей, убирают сообщения")}</span>
              <div className="oc-helpers">{m.members.map((p) => {
                const on = cur.helpers.includes(p.uid);
                return <button key={p.uid} type="button" aria-pressed={on} disabled={!on && cur.helpers.length >= 3} onClick={() => set({ helpers: on ? cur.helpers.filter((x) => x !== p.uid) : [...cur.helpers, p.uid] })}>{p.name.split(' ')[0] || _t("Участник")}</button>;
              })}</div>
            </div>
          )}
          {(edit || !m.open) && <button type="button" className="pri-btn" disabled={busy} onClick={() => save(cur)}>{m.open ? _t("Сохранить") : _t("Открыть круг")}</button>}
          <small className="tiny">{_t("Новички пишут в чат через сутки, первые 3 дня без ссылок и файлов. Телефон и почту никто не видит.")}</small>
        </div>
      )}
      {m.asks.length > 0 && (
        <div className="oc-asks">
          <h4>{_tj("Просятся в круг · {0}", m.asks.length)}</h4>
          {m.asks.map((a) => {
            const days = Math.max(1, Math.round((Date.now() - Date.parse(a.since)) / 86400000));
            return (
              <div key={a.id} className="oc-req">
                <i style={{ background: a.color || '#2f7f7a' }}>{(a.name || '?').slice(0, 1).toUpperCase()}</i>
                <span><b>{a.nick || a.name}</b><small>{[a.city, _tj("{0} {1} в приложении", days, plural(days, _t("день"), _t("дня"), _t("дней")))].filter(Boolean).join(' · ')}</small>{a.note && <small className="oc-rn">«{a.note}»</small>}</span>
                <button type="button" className="n" aria-label={_t("Отказать")} onClick={() => answer(a.id, false)}>✕</button>
                <button type="button" className="y" aria-label={_t("Принять")} onClick={() => answer(a.id, true)}>✓</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The theme of an open circle: sisters find it by the tiles in «Найти круг». Saved at once. */
function TopicPick({ code }: { code: string }) {
  const on = useSisCirclesReady();
  const [t, setT] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (on) openTopicGet(code).then(setT); }, [on, code]);
  if (!on || t === null) return null;
  const pick = async (v: Topic) => {
    const old = t; setT(v); setMsg('');
    const r = await openTopicSet(code, v);
    if (r === 'ok') setMsg(_t("✓ Тема сохранена")); else { setT(old); setMsg(_t("Не получилось сохранить. Проверь интернет.")); }
  };
  return (
    <label className="cl-f sc-pick"><span>{_t("Тема круга (по ней сёстры находят круг)")}</span>
      <select value={t} onChange={(e) => pick(e.target.value as Topic)}>
        <option value="">{_t("Без темы")}</option>
        {TOPICS.map((x) => <option key={x.k} value={x.k}>{x.l()}</option>)}
      </select>
      {msg && <small className="tiny" role="status">{msg}</small>}
    </label>
  );
}

// ---------- the newcomer note above an open circle's chat ----------

const timeL = (iso: string) => new Date(iso).toLocaleString(LANG === 'en' ? 'en-GB' : 'ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function OpenChatNote({ code }: { code?: string }) {
  const [m, setM] = useState<OpenMe | null>(null);
  useEffect(() => { if (code) openMe(code).then(setM); else setM(null); }, [code]);
  if (!m?.open || m.boss) return null;
  const now = Date.now();
  if (m.write_at && Date.parse(m.write_at) > now) return <p className="oc-chatnote">{_tj("Ты в открытом круге новичок: писать в чат можно с {0}. Пока можно читать и ставить реакции.", timeL(m.write_at))}</p>;
  if (m.links_at && Date.parse(m.links_at) > now) return <p className="oc-chatnote">{_tj("До {0} без ссылок, фото и файлов: так круг защищён от спама.", timeL(m.links_at))}</p>;
  if (m.text_only) return <p className="oc-chatnote">{_t("Смешанный круг: только текст, без голосовых и фото.")}</p>;
  return null;
}

