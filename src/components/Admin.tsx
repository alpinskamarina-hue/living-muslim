import { useEffect, useState } from 'react';
import { accessToken, authMe } from '../auth';
import { AdminCourses } from './AdminCourses';

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
    if (!authMe()) { setOk(false); return; }
    call<boolean>('lm_is_admin', {}).then((v) => { setOk(Boolean(v)); try { sessionStorage.setItem(CACHE, v ? '1' : '0'); } catch { /* */ } }).catch(() => { /* server without admin.sql yet */ });
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
  const [tab, setTab] = useState<'stats' | 'courses'>('stats');
  return (
    <div className="adm">
      <div className="seg adm-tabs">
        <button type="button" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>📊 Аналитика</button>
        <button type="button" aria-pressed={tab === 'courses'} onClick={() => setTab('courses')}>🎬 Видеокурсы</button>
      </div>
      {tab === 'stats' ? <AdminStats /> : <AdminCourses />}
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
