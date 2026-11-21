import { useEffect, useState } from 'react';
import { halalDecide, halalQueue, type QueueItem } from '../halalCloud';
import { guideDecide, guideQueue, guideReportDone, guideReports, type GuideReport, type QueueGuide } from '../guides';
import { accessToken, authMe } from '../auth';
import { AdminCourses } from './AdminCourses';
import { setOwner } from '../plan';

// Owner analytics: who comes, from where, on what, and what they do. Shown only to emails listed in lm_admins.
// The numbers come from lm_admin_stats, which checks the signed-in email on the server.

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

interface KN { k: string; n: number }
interface Stats {
  from: string; visitors_today: number; visitors: number; visits: number; new_visitors: number; returning: number; app_users: number;
  series: { d: string; v: number; a: number; s: number }[];
  refs: KN[]; utm: KN[]; countries: KN[]; cities: KN[]; devices: KN[]; langs: KN[]; pages: KN[];
  signups_total: number; signups: number; accounts_total: number; accounts: number; profiles_total: number; profiles: number;
  nicks: number; circles: number; circles_real: number; members: number; active_circle_people: number; push: number;
  recent: { name: string; email: string; lang: string; source: string; created: string }[];
  errors?: Record<string, string>;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const t = await accessToken();
  if (!t) return null;
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) { let m = ''; try { const j = await r.json(); m = j.message || j.hint || ''; } catch { /* */ } throw new Error(`${r.status} ${m}`.trim()); }
  return (await r.json()) as T;
}

const CACHE = 'lm.admin';
/** True when the signed-in email is an owner. Remembered for the session so the menu row does not flicker. */
export function useIsAdmin(): boolean {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem(CACHE) === '1'; } catch { return false; } });
  useEffect(() => {
    if (!authMe()) { setOk(false); setOwner(false); return; }
    call<boolean>('lm_is_admin', {}).then((v) => { setOk(Boolean(v)); if (v !== null) setOwner(Boolean(v)); try { sessionStorage.setItem(CACHE, v ? '1' : '0'); } catch { /* */ } }).catch(() => { /* server without admin.sql yet */ });
  }, []);
  return ok;
}

const REF: [RegExp, string][] = [
  [/^direct$/, 'Напрямую или мессенджер'], [/instagram/, 'Instagram'], [/(^|\.)t\.me$|telegram/, 'Telegram'], [/whatsapp|wa\.me/, 'WhatsApp'],
  [/google\./, 'Google'], [/yandex\.|ya\.ru/, 'Яндекс'], [/youtube|youtu\.be/, 'YouTube'], [/facebook|fb\./, 'Facebook'], [/tiktok/, 'TikTok'],
  [/vk\.com|vk\.ru/, 'ВКонтакте'], [/bing\./, 'Bing'], [/claude\.ai/, 'Claude'], [/vercel\.app$/, 'Другие ссылки Vercel'],
];
const refName = (k: string) => REF.find(([r]) => r.test(k))?.[1] ?? k;
const PAGE: Record<string, string> = { landing: 'Главная', app: 'Приложение', guide: 'Гид', privacy: 'Конфиденциальность' };
const DEV: Record<string, string> = { mobile: '📱 Телефон', tablet: '📲 Планшет', desktop: '💻 Компьютер', '?': 'Неизвестно' };
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
let regions: Intl.DisplayNames | null = null;
try { regions = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch { /* old browser */ }
const country = (cc: string) => (cc === '?' ? 'Не определено' : `${flag(cc)} ${regions?.of(cc) ?? cc}`);
let langs: Intl.DisplayNames | null = null;
try { langs = new Intl.DisplayNames(['ru'], { type: 'language' }); } catch { /* old browser */ }
const lang = (l: string) => (l === '?' ? 'Неизвестно' : langs?.of(l) ?? l);
const dShort = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day}.${String(m).padStart(2, '0')}`; };

export function AdminPage() {
  const [tab, setTab] = useState<'stats' | 'courses' | 'reports' | 'halal' | 'guides'>('stats');
  return (
    <div className="adm">
      <div className="seg adm-tabs">
        <button type="button" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>📊 Аналитика</button>
        <button type="button" aria-pressed={tab === 'courses'} onClick={() => setTab('courses')}>🎬 Курсы</button>
        <button type="button" aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}>🚩 Жалобы</button>
        <button type="button" aria-pressed={tab === 'halal'} onClick={() => setTab('halal')}>☪ Халяль</button>
        <button type="button" aria-pressed={tab === 'guides'} onClick={() => setTab('guides')}>🧭 Гиды</button>
      </div>
      {tab === 'stats' ? <AdminStats /> : tab === 'courses' ? <AdminCourses /> : tab === 'halal' ? <AdminHalal /> : tab === 'guides' ? <AdminGuides /> : <AdminReports />}
    </div>
  );
}

function AdminStats() {
  const [days, setDays] = useState(7);
  const [st, setSt] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = (d = days) => {
    setBusy(true); setErr('');
    call<Stats>('lm_admin_stats', { p_days: d }).then((x) => { if (x) setSt(x); else setErr('Нет доступа. Войди по почте владельца в Профиль → Аккаунт.'); })
      .catch((e) => setErr(`Не получилось загрузить (${e instanceof Error ? e.message : e}). Проверь интернет и что admin.sql запущен в Supabase.`)).finally(() => setBusy(false));
  };
  useEffect(() => { load(days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="adm">
      <div className="seg adm-seg">
        {[[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней'], [90, '90 дней']].map(([d, l]) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d as number)}>{l}</button>
        ))}
      </div>
      {err && <div className="warn">{err}</div>}
      {!st && !err && <p className="tiny">Загружаю…</p>}
      {st && (
        <div className={busy ? 'adm-busy' : ''}>
          <div className="adm-kpi">
            <Kpi n={st.visitors} l="посетителей" />
            <Kpi n={st.app_users} l="открыли приложение" />
            <Kpi n={st.signups} l="оставили почту" />
            <Kpi n={st.accounts} l="вошли по почте" />
          </div>
          <p className="tiny">Сегодня {st.visitors_today} · новых {st.new_visitors} · вернулись снова {st.returning} · всего заходов {st.visits}</p>

          {(st.series ?? []).length > 1 && (
            <section className="adm-box">
              <h3>По дням</h3>
              <Bars series={st.series} />
              <div className="adm-legend"><span><i className="v" />посетители</span><span><i className="a" />в приложении</span><span><i className="s" />почты</span></div>
            </section>
          )}

          <List title="Откуда пришли" rows={(st.refs ?? []).map((r) => ({ k: refName(r.k), n: r.n }))} />
          {(st.utm ?? []).length > 0 && <List title="Метки ссылок (utm_source, ref)" rows={st.utm} />}
          <List title="Страны" rows={(st.countries ?? []).map((r) => ({ k: country(r.k), n: r.n }))} />
          {(st.cities ?? []).length > 0 && <List title="Города" rows={st.cities} />}
          <List title="Устройства" rows={(st.devices ?? []).map((r) => ({ k: DEV[r.k] ?? r.k, n: r.n }))} />
          <List title="Язык браузера" rows={(st.langs ?? []).map((r) => ({ k: lang(r.k), n: r.n }))} />
          <List title="Страницы" rows={(st.pages ?? []).map((r) => ({ k: PAGE[r.k] ?? r.k, n: r.n }))} />

          <section className="adm-box">
            <h3>Пользователи за всё время</h3>
            <div className="adm-grid">
              <Fact n={st.signups_total} l="почт с лендинга" />
              <Fact n={st.accounts_total} l="аккаунтов (вход по почте)" />
              <Fact n={st.profiles_total} l="профилей в Круге" />
              <Fact n={st.nicks} l="с ником" />
              <Fact n={st.circles_real} l={`кругов от 2 человек (всего ${st.circles})`} />
              <Fact n={st.members} l="участий в кругах" />
              <Fact n={st.active_circle_people} l="активны в Круге за 7 дней" />
              <Fact n={st.push} l="включили напоминания" />
            </div>
          </section>

          {(st.recent ?? []).length > 0 && (
            <section className="adm-box">
              <h3>Последние почты с лендинга</h3>
              <div className="adm-recent">
                {st.recent.map((r) => (
                  <div key={r.email}>
                    <span><b>{r.name || '—'}</b><small>{r.email}</small></span>
                    <small>{new Date(r.created).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · {r.lang.toUpperCase()}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
          {st.errors && Object.keys(st.errors).length > 0 && <p className="tiny">Часть цифр недоступна: {Object.entries(st.errors).map(([k, v]) => `${k} (${v})`).join('; ')}</p>}
          <button type="button" className="link-btn" onClick={() => load()} disabled={busy}>{busy ? 'Обновляю…' : '↻ Обновить'}</button>
          <p className="tiny">Посещения считаются без cookies и без IP: случайный номер браузера, страна и город по сети, источник перехода. Один человек на одной странице считается раз в день. Данные начали собираться с момента запуска счётчика.</p>
        </div>
      )}
    </div>
  );
}

function Kpi({ n, l }: { n: number | null; l: string }) { return <div><b>{n == null ? '—' : n.toLocaleString('ru-RU')}</b><small>{l}</small></div>; }
function Fact({ n, l }: { n: number | null; l: string }) { return <div><b>{n == null ? '—' : n.toLocaleString('ru-RU')}</b><small>{l}</small></div>; }

function List({ title, rows }: { title: string; rows: KN[] | null }) {
  if (!rows || rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <section className="adm-box">
      <h3>{title}</h3>
      {rows.map((r) => (
        <div key={r.k} className="adm-row">
          <span className="adm-k">{r.k}</span>
          <span className="adm-bar"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b>{r.n}</b>
        </div>
      ))}
    </section>
  );
}

function Bars({ series }: { series: Stats['series'] }) {
  const max = Math.max(...series.map((x) => Math.max(x.v, x.s)), 1);
  const every = Math.ceil(series.length / 7);
  return (
    <div className="adm-chart" role="img" aria-label="Посетители по дням">
      {series.map((x, i) => (
        <div key={x.d} className="adm-col" title={`${dShort(x.d)}: ${x.v} посетителей, ${x.a} в приложении, ${x.s} почт`}>
          <div className="adm-stack">
            <i className="v" style={{ height: `${(x.v / max) * 100}%` }}><i className="a" style={{ height: x.v ? `${(x.a / x.v) * 100}%` : 0 }} /></i>
            {x.s > 0 && <em className="s" style={{ bottom: `${(x.s / max) * 100}%` }} />}
          </div>
          <small>{i % every === 0 || i === series.length - 1 ? dShort(x.d) : ''}</small>
        </div>
      ))}
    </div>
  );
}

interface Report { id: number; msg: number; reason: string; body: string; at: string; by: string; author: string; deleted: boolean }
/** Complaints about circle chat messages (supabase/chat.sql). The owner can remove the message for everyone. */
function AdminReports() {
  const [list, setList] = useState<Report[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => call<Report[]>('lm_chat_reports', {}).then((r) => setList(r ?? [])).catch((e) => setErr(/404/.test(String(e)) ? 'Сначала запусти supabase/chat.sql' : String(e.message || e)));
  useEffect(() => { load(); }, []);
  if (err) return <p className="tiny">{err}</p>;
  if (!list) return <p className="tiny">Загружаю…</p>;
  if (!list.length) return <p className="tiny">Жалоб нет, альхамдулиллях.</p>;
  return (
    <div className="adm-rep">
      {list.map((r) => (
        <div key={r.id} className="adm-card">
          <small>{new Date(r.at).toLocaleString('ru-RU')} · пожаловался {r.by || '?'} на {r.author || '?'}</small>
          <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>
          {r.deleted ? <small>Сообщение уже удалено</small> : (
            <button type="button" className="link-btn" onClick={async () => { if (!confirm('Удалить это сообщение для всех?')) return; await call('lm_chat_admin_delete', { p_id: r.msg }).catch(() => null); load(); }}>🗑 Удалить сообщение</button>
          )}
        </div>
      ))}
    </div>
  );
}

/** «Халяль-сканер», shared base: halal signs people photographed. Approved ones turn green for everyone. */
function AdminHalal() {
  const [list, setList] = useState<QueueItem[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => halalQueue().then((r) => setList(r ?? [])).catch((e) => setErr(/nosql/.test(String(e)) ? 'Сначала запусти supabase/halal.sql в Supabase → SQL Editor.' : 'Не получилось загрузить. Проверь интернет.'));
  useEffect(() => { load(); }, []);
  const decide = async (code: string, ok: boolean) => { await halalDecide(code, ok).catch(() => null); setList((l) => (l ?? []).filter((x) => x.code !== code)); };
  if (err) return <p className="tiny">{err}</p>;
  if (!list) return <p className="tiny">Загружаю…</p>;
  if (!list.length) return <p className="tiny">Новых знаков халяль на проверке нет.</p>;
  return (
    <div className="adm-rep">
      <p className="tiny">Одобряй, только если на фото виден знак халяль на упаковке именно этого товара. По правилу из макета лучше дождаться 3 подтверждений.</p>
      {list.map((x) => (
        <div key={x.code} className="adm-card adm-halal">
          <b>{x.name || 'Без названия'}</b>
          <small>штрихкод {x.code} · подтверждений: {x.signs} · {new Date(x.last).toLocaleDateString('ru-RU')}</small>
          {x.photos?.length ? <div className="adm-ph">{x.photos.map((b, i) => <img key={i} src={`data:image/jpeg;base64,${b}`} alt={`Фото знака ${i + 1}`} />)}</div> : <small>Без фото</small>}
          {x.ingredients && <small className="adm-ing">Состав: {x.ingredients}</small>}
          <div className="adm-act">
            <button type="button" className="pri-btn" onClick={() => decide(x.code, true)}>Одобрить знак</button>
            <button type="button" className="ghost-btn" onClick={() => decide(x.code, false)}>Отклонить</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** «Гиды» for umrah: applications with the diploma and licence photos. The photos are deleted after the decision. */
function AdminGuides() {
  const [list, setList] = useState<QueueGuide[] | null>(null);
  const [err, setErr] = useState('');
  const [ticks, setTicks] = useState<Record<string, Record<string, boolean>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = () => guideQueue().then((r) => setList(r ?? [])).catch((e) => setErr(/nosql/.test(String(e)) ? 'Сначала запусти supabase/guides.sql в Supabase → SQL Editor.' : 'Не получилось загрузить. Проверь интернет.'));
  useEffect(() => { load(); }, []);
  const tick = (uid: string, k: string) => setTicks((t) => ({ ...t, [uid]: { ...t[uid], [k]: !t[uid]?.[k] } }));
  const decide = async (uid: string, ok: boolean) => {
    await guideDecide(uid, ok, ticks[uid] ?? {}, notes[uid] ?? '').catch(() => null);
    setList((l) => (l ?? []).filter((x) => x.uid !== uid));
  };
  if (err) return <p className="tiny">{err}</p>;
  if (!list) return <p className="tiny">Загружаю…</p>;
  if (!list.length) return <div className="adm-rep"><GuideReportsBox /><p className="tiny">Новых заявок гидов нет.</p></div>;
  return (
    <div className="adm-rep">
      <GuideReportsBox />
      <p className="tiny">Поставь галочки только за то, что действительно проверил. После решения фото документов удаляются, остаются лишь галочки. Одобрить можно с галочкой «диплом», а гида на месте ещё и с галочкой «лицензия КСА».</p>
      {list.map((g) => {
        const t = ticks[g.uid] ?? {};
        return (
          <div key={g.uid} className="adm-card adm-halal">
            <b>{g.name}</b>
            <small>{g.email || 'без почты'} · {g.langs.join(', ')} · {new Date(g.updated).toLocaleDateString('ru-RU')}</small>
            <small><b>Вид:</b> {g.kind === 'mentor' ? 'Наставник онлайн (лицензия не нужна)' : `Гид на месте · лицензия КСА${g.lic_until ? ` до ${g.lic_until}` : ''}`}</small>
            <small><b>Знание:</b> {g.school}{g.field ? `, ${g.field}` : ''}{g.grad ? `, ${g.grad}` : ''} · {g.years} лет · {g.groups} групп</small>
            <small><b>Где:</b> {g.place === 'makkah' ? 'Мекка' : g.place === 'madinah' ? 'Медина' : `готов вылететь${g.city ? ` из ${g.city}` : ''}`}{g.until ? ` до ${g.until}` : ''}{g.sisters ? ' · для сестёр' : ''}</small>
            {g.services.length > 0 && <small><b>Услуги:</b> {g.services.map((s) => `${s.t} €${s.price}${s.per ? `/${s.per}` : ''}`).join(' · ')}</small>}
            {g.imam && <small><b>Рекомендует:</b> {g.imam}</small>}
            {g.about && <small className="adm-ing">{g.about}</small>}
            <div className="adm-ph">
              {g.diploma_photo ? <img src={`data:image/jpeg;base64,${g.diploma_photo}`} alt="Диплом" /> : <small>Фото диплома нет (могло быть удалено после прошлой проверки)</small>}
              {g.license_photo && <img src={`data:image/jpeg;base64,${g.license_photo}`} alt="Лицензия" />}
            </div>
            <label className="chk"><input type="checkbox" checked={Boolean(t.diploma)} onChange={() => tick(g.uid, 'diploma')} /> Диплом или иджаза проверены</label>
            {g.license && g.kind !== 'mentor' && <label className="chk"><input type="checkbox" checked={Boolean(t.license)} onChange={() => tick(g.uid, 'license')} /> Лицензия КСА проверена и действует</label>}
            {g.imam && <label className="chk"><input type="checkbox" checked={Boolean(t.imam)} onChange={() => tick(g.uid, 'imam')} /> Рекомендацию подтвердил</label>}
            <input placeholder="Заметка для гида (если отклоняешь)" value={notes[g.uid] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [g.uid]: e.target.value }))} />
            <div className="adm-act">
              <button type="button" className="pri-btn" disabled={!t.diploma || (g.kind !== 'mentor' && !t.license)} onClick={() => decide(g.uid, true)}>Одобрить</button>
              <button type="button" className="ghost-btn" onClick={() => decide(g.uid, false)}>Отклонить</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Reports on guides from pilgrims: close, or close and take the guide out of the list. */
function GuideReportsBox() {
  const [list, setList] = useState<GuideReport[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { guideReports().then((r) => setList(r ?? [])).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  const done = async (id: string, hide: boolean) => { await guideReportDone(id, hide, notes[id] ?? '').catch(() => null); setList((l) => (l ?? []).filter((x) => x.id !== id)); };
  return (
    <>
      <h3>⚑ Жалобы на гидов: {list.length}</h3>
      {list.map((r) => (
        <div key={r.id} className="adm-card adm-halal">
          <b>{r.gname}</b>
          <small>от {r.from} · {new Date(r.created).toLocaleDateString('ru-RU')}{r.status === 'no' ? ' · уже скрыт' : ''}</small>
          <small className="adm-ing">{r.text}</small>
          <input placeholder="Причина для гида (если скрываешь)" value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
          <div className="adm-act">
            <button type="button" className="ghost-btn" onClick={() => done(r.id, false)}>Закрыть жалобу</button>
            <button type="button" className="pri-btn" onClick={() => done(r.id, true)}>Скрыть гида</button>
          </div>
        </div>
      ))}
    </>
  );
}
