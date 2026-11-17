import { LogoLockup } from './Logo';
import { ProPlans } from './Pro';
import { authMe, signInUrl, signOut } from '../auth';
import { useRef, useState } from 'react';
import type { Anchor, AppState, Habit, MethodId } from '../types';
import { ANCHOR_LABEL } from '../types';
import { METHODS, PLACES, type DayTimes } from '../prayer';
import { addDays, dayKey, daysBetween, hhmm, plural } from '../dates';
import { ACTIVE_LIMIT, initialState, slotsUsed } from '../store';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
  times: DayTimes;
  onEdit: (h: Habit) => void;
}

export function Profile({ state, update, replace, times, onEdit }: Props) {
  const s = state.settings;
  const set = (patch: Partial<AppState['settings']>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const [page, setPage] = useState<Page>('main');
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const back = () => go('main');

  if (page === 'pro') return <ProPlans onBack={back} />;
  if (page === 'prayer') return <Sub title="Намазы" onBack={back}><PrayerSettings s={s} set={set} times={times} /></Sub>;
  if (page === 'habits') return <Sub title="Мои привычки" onBack={back}><HabitsSettings state={state} update={update} onEdit={onEdit} /></Sub>;
  if (page === 'look') return <Sub title="Внешний вид" onBack={back}><LookSettings s={s} set={set} /></Sub>;
  if (page === 'data') return <Sub title="Данные" onBack={back}><DataSettings state={state} replace={replace} /></Sub>;
  if (page === 'help') return <Sub title="Помощь" onBack={back}><HelpPage /></Sub>;
  if (page === 'account') return <Sub title="Аккаунт" onBack={back}><AccountPage s={s} set={set} /></Sub>;

  const me = authMe();
  const st = stats(state);
  const used = slotsUsed(state);
  const name = s.name.trim() || me?.name || 'Друг';
  const methodName = METHODS.find((m) => m.id === s.method)?.ru ?? '';
  const theme = s.theme === 'light' ? 'светлая' : s.theme === 'dark' ? 'тёмная' : 'как в телефоне';

  return (
    <div className="page">
      <div className="me-card">
        <div className="me-top">
          <span className="me-av" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{name}</b>
            <small>{me?.email ?? 'Вход по почте не выполнен'}</small>
            <small>С нами {st.days} {plural(st.days, 'день', 'дня', 'дней')}</small>
          </div>
        </div>
        <div className="me-stats">
          <div><b>{st.onTime}<i>/35</i></b><small>намазов вовремя за неделю</small></div>
          <div><b>{st.formed}</b><small>{plural(st.formed, 'привычка закреплена', 'привычки закреплены', 'привычек закреплено')}</small></div>
          <div><b>{st.chapters}</b><small>{plural(st.chapters, 'глава прочитана', 'главы прочитаны', 'глав прочитано')}</small></div>
        </div>
      </div>

      <button type="button" className="pro-entry" onClick={() => go('pro')}>
        <span className="pro-badge">PRO</span>
        <span><b>Living Muslim Pro</b><small>Цели, книги, курсы, большой Круг. 14 дней бесплатно</small></span>
        <i aria-hidden="true">›</i>
      </button>

      <div className="menu">
        {!onClaude && <Row icon="👤" title="Аккаунт" sub={me ? `${me.email} · имя «${name}»` : 'Войти по почте, имя'} onClick={() => go('account')} />}
        {onClaude && <Row icon="👤" title="Имя" sub={name} onClick={() => go('account')} />}
        <Row icon="🕌" title="Намазы" sub={`${s.place} · ${methodName}`} onClick={() => go('prayer')} />
        <Row icon="🌱" title="Мои привычки" sub={`${used} из ${ACTIVE_LIMIT} мест занято`} onClick={() => go('habits')} />
        <Row icon="🎨" title="Внешний вид" sub={`Тема ${theme} · текст ${s.textScale && s.textScale > 1 ? 'крупнее' : 'обычный'}`} onClick={() => go('look')} />
        <Row icon="💾" title="Данные" sub="Резервная копия, перенос, удаление" onClick={() => go('data')} />
        <Row icon="🤝" title="Помощь" sub={SUPPORT_EMAIL ? "Написать нам, поделиться, конфиденциальность" : "Поделиться приложением, конфиденциальность"} onClick={() => go('help')} />
      </div>

      <LogoLockup />
      <p className="tiny ver">Версия 0.2<br />«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»</p>
    </div>
  );
}

type Page = 'main' | 'pro' | 'account' | 'prayer' | 'habits' | 'look' | 'data' | 'help';
const onClaude = typeof location !== 'undefined' && /claude|anthropic/.test(location.hostname);
const SUPPORT_EMAIL = 'alpinskamarina@gmail.com';
const ANCHORS: Anchor[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function stats(state: AppState) {
  const today = dayKey(new Date());
  let onTime = 0;
  for (let i = 0; i < 7; i++) {
    const d = state.prayers[addDays(today, -i)] ?? {};
    for (const a of ANCHORS) if (d[a] === 'ontime') onTime++;
  }
  const keys = [...Object.keys(state.log), ...Object.keys(state.prayers), ...state.habits.map((h) => h.createdAt)].filter(Boolean).sort();
  const days = keys.length ? Math.max(1, daysBetween(keys[0], today) + 1) : 1;
  return { onTime, formed: state.habits.filter((h) => h.formed).length, chapters: state.summaryRead?.length ?? 0, days };
}

function Row({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="menu-row" onClick={onClick}>
      <span className="mi" aria-hidden="true">{icon}</span>
      <span className="mt"><b>{title}</b><small>{sub}</small></span>
      <i aria-hidden="true">›</i>
    </button>
  );
}

function Sub({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="page">
      <button type="button" className="link-btn pro-back" onClick={onBack}>← Профиль</button>
      <h1 className="page-h">{title}</h1>
      {children}
    </div>
  );
}

type SetFn = (patch: Partial<AppState['settings']>) => void;

function AccountPage({ s, set }: { s: AppState['settings']; set: SetFn }) {
  return (
    <>
      <label className="field">
        <span>Как к тебе обращаться</span>
        <input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Имя" maxLength={40} />
      </label>
      <AccountCard />
      {!onClaude && <p className="tiny">Почта нужна, чтобы не потерять доступ и получать новости приложения. Привычки и заметки пока хранятся на этом устройстве.</p>}
    </>
  );
}

function PrayerSettings({ s, set, times }: { s: AppState['settings']; set: SetFn; times: DayTimes }) {
  const [geo, setGeo] = useState('');
  const locate = () => {
    if (!navigator.geolocation) return setGeo('Геолокация недоступна, выбери город из списка.');
    setGeo('Определяю…');
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: p.coords.latitude, lng: p.coords.longitude, place: 'Моё место' }); setGeo('Готово'); },
      () => setGeo('Не получилось, выбери город из списка.'),
      { timeout: 10000 },
    );
  };
  const off = s.offsets ?? {};
  const bump = (a: Anchor, d: number) => {
    const v = Math.max(-30, Math.min(30, (off[a] ?? 0) + d));
    set({ offsets: { ...off, [a]: v } });
  };
  const anyOff = ANCHORS.some((a) => off[a]);
  return (
    <>
      <div className="adj">
        {ANCHORS.map((a) => {
          const v = off[a] ?? 0;
          return (
            <div key={a} className="adj-row">
              <span className="ar">{ANCHOR_LABEL[a].ar}</span>
              <span className="an"><b>{ANCHOR_LABEL[a].ru}</b><small>{v ? `${v > 0 ? '+' : '−'}${Math.abs(v)} мин` : 'по расчёту'}</small></span>
              <button type="button" aria-label={`${ANCHOR_LABEL[a].ru} на минуту раньше`} onClick={() => bump(a, -1)}>−</button>
              <b className="at">{hhmm(times[a])}</b>
              <button type="button" aria-label={`${ANCHOR_LABEL[a].ru} на минуту позже`} onClick={() => bump(a, 1)}>+</button>
            </div>
          );
        })}
      </div>
      <p className="tiny">Сверь время с мечетью рядом и поправь кнопками − и + по минуте.{anyOff && <> <button type="button" className="link-btn" onClick={() => set({ offsets: {} })}>Сбросить поправки</button></>}</p>

      <label className="field">
        <span>Город</span>
        <select
          value={PLACES.some((p) => p.name === s.place) ? s.place : ''}
          onChange={(e) => { const p = PLACES.find((x) => x.name === e.target.value); if (p) set({ place: p.name, lat: p.lat, lng: p.lng }); }}
        >
          {!PLACES.some((p) => p.name === s.place) && <option value="">{s.place} ({s.lat.toFixed(2)}, {s.lng.toFixed(2)})</option>}
          {PLACES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="ghost-btn" onClick={locate}>Определить по геолокации</button>
      {geo && <p className="tiny">{geo}</p>}
      <label className="field">
        <span>Метод расчёта</span>
        <select value={s.method} onChange={(e) => set({ method: e.target.value as MethodId })}>
          {METHODS.map((m) => <option key={m.id} value={m.id}>{m.ru}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Аср по мазхабу</span>
        <select value={s.madhab} onChange={(e) => set({ madhab: e.target.value as 'shafi' | 'hanafi' })}>
          <option value="shafi">Шафии, Малики, Ханбали</option>
          <option value="hanafi">Ханафи (Аср позже)</option>
        </select>
      </label>
    </>
  );
}

function HabitsSettings({ state, update, onEdit }: { state: AppState; update: Props['update']; onEdit: Props['onEdit'] }) {
  const byStatus = (st: Habit['status']) => state.habits.filter((h) => h.status === st);
  const setStatus = (id: string, status: Habit['status']) =>
    update((x) => ({ ...x, habits: x.habits.map((h) => (h.id === id ? { ...h, status } : h)) }));
  const remove = (id: string) => update((x) => ({ ...x, habits: x.habits.filter((h) => h.id !== id) }));
  const used = slotsUsed(state);
  return (
    <>
      <p className="page-sub">{used} из {ACTIVE_LIMIT} мест занято. Нажми на привычку, чтобы изменить её.</p>
      <HabitGroup title="Активные" list={byStatus('active')} onEdit={onEdit} action={(h) => ['В архив', () => setStatus(h.id, 'archived')]} />
      <HabitGroup title="Очередь «Скоро»" list={byStatus('queued')} onEdit={onEdit} action={(h) => ['Убрать', () => setStatus(h.id, 'archived')]} />
      <HabitGroup
        title="Архив"
        list={byStatus('archived')}
        onEdit={onEdit}
        action={(h) => (used < ACTIVE_LIMIT ? ['Вернуть', () => setStatus(h.id, 'active')] : ['Удалить', () => remove(h.id)])}
      />
      {!state.habits.length && <p className="tiny">Привычек пока нет. Добавь первую на экране «Сегодня».</p>}
    </>
  );
}

function LookSettings({ s, set }: { s: AppState['settings']; set: SetFn }) {
  const theme = s.theme ?? 'auto';
  const size = s.textScale ?? 1;
  return (
    <>
      <h2 className="sub-h">Тема</h2>
      <div className="seg3" role="radiogroup" aria-label="Тема">
        {([['auto', 'Как в телефоне'], ['light', 'Светлая'], ['dark', 'Тёмная']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => set({ theme: v })}>{l}</button>
        ))}
      </div>
      <h2 className="sub-h">Размер текста</h2>
      <div className="seg3" role="radiogroup" aria-label="Размер текста">
        {([[1, 'Обычный'], [1.1, 'Крупнее'], [1.2, 'Крупный']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={size === v} onClick={() => set({ textScale: v })} style={{ fontSize: `${14 * v}px` }}>{l}</button>
        ))}
      </div>
      <p className="tiny">Настройки сохраняются на этом устройстве.</p>
    </>
  );
}

function DataSettings({ state, replace }: { state: AppState; replace: Props['replace'] }) {
  const [msg, setMsg] = useState('');
  const [wipe, setWipe] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const download = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `living-muslim-${dayKey(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('Файл сохранён. Храни его в надёжном месте, например в облаке телефона.');
  };
  const load = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as AppState;
      if (d.version !== 1 || !Array.isArray(d.habits)) throw new Error();
      if (!confirm('Заменить все данные на этом устройстве данными из файла?')) return;
      replace({ ...initialState(), ...d });
      setMsg('Данные загружены из файла.');
    } catch { setMsg('Это не файл резервной копии Living Muslim.'); }
  };

  return (
    <>
      <p className="page-sub">Привычки, отметки и заметки хранятся на этом устройстве. Сохраняй резервную копию, чтобы не потерять их при смене телефона.</p>
      <div className="row2 light">
        <button type="button" onClick={download}>Скачать копию</button>
        <button type="button" onClick={() => file.current?.click()}>Загрузить из файла</button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
      {msg && <p className="tiny">{msg}</p>}
      <p className="tiny">Синхронизация между устройствами появится в Pro.</p>

      <h2 className="sub-h">Удалить всё</h2>
      <p className="tiny">Сотрёт все привычки, отметки и заметки на этом устройстве. Отменить нельзя. Чтобы подтвердить, напиши слово УДАЛИТЬ.</p>
      <div className="row2">
        <input className="wipe" value={wipe} onChange={(e) => setWipe(e.target.value)} placeholder="УДАЛИТЬ" aria-label="Подтверждение удаления" />
        <button type="button" className="danger" disabled={wipe.trim().toUpperCase() !== 'УДАЛИТЬ'} onClick={() => { replace(initialState()); setWipe(''); setMsg('Всё очищено.'); }}>Стереть</button>
      </div>
    </>
  );
}

function HelpPage() {
  const [shared, setShared] = useState('');
  const url = typeof location !== 'undefined' && !onClaude ? location.origin + '/' : 'https://living-muslim.vercel.app/';
  const share = async () => {
    const text = 'Living Muslim: привычки вокруг пяти намазов, без рекламы и без вины за пропуски.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Living Muslim', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`); setShared('Ссылка скопирована');
    } catch { /* cancelled */ }
  };
  return (
    <div className="menu">
      <button type="button" className="menu-row" onClick={share}>
        <span className="mi" aria-hidden="true">💌</span>
        <span className="mt"><b>Поделиться приложением</b><small>{shared || 'Садака джария: за каждого, кто начнёт молиться вовремя'}</small></span>
        <i aria-hidden="true">›</i>
      </button>
      {SUPPORT_EMAIL && (
        <a className="menu-row" href={`mailto:${SUPPORT_EMAIL}?subject=Living%20Muslim`}>
          <span className="mi" aria-hidden="true">✉️</span>
          <span className="mt"><b>Написать нам</b><small>Идеи, ошибки, вопросы</small></span>
          <i aria-hidden="true">›</i>
        </a>
      )}
      <a className="menu-row" href="/privacy.html" target="_blank" rel="noopener">
        <span className="mi" aria-hidden="true">🔒</span>
        <span className="mt"><b>Конфиденциальность</b><small>Что мы храним и что нет</small></span>
        <i aria-hidden="true">›</i>
      </a>
    </div>
  );
}

function HabitGroup({ title, list, onEdit, action }: {
  title: string; list: Habit[]; onEdit: (h: Habit) => void; action: (h: Habit) => [string, () => void];
}) {
  if (!list.length) return null;
  return (
    <div className="hgroup">
      <h4>{title}</h4>
      {list.map((h) => {
        const [label, fn] = action(h);
        return (
          <div className="hg" key={h.id} data-sphere={h.sphere}>
            <i />
            <button type="button" className="hg-name" onClick={() => onEdit(h)}>
              {h.action}<small>{ANCHOR_LABEL[h.anchor].after}{h.formed ? ' · закреплена' : ''}</small>
            </button>
            <button type="button" className="hg-act" onClick={fn}>{label}</button>
          </div>
        );
      })}
    </div>
  );
}

/** Email account: who is signed in, or a way to sign in. Hidden inside claude.ai, where there is no site to sign in on. */
function AccountCard() {
  const me = authMe();
  if (typeof location !== 'undefined' && /claude|anthropic/.test(location.hostname)) return null;
  if (!me) {
    return (
      <a className="acct" href={signInUrl}>
        <span><b>Войти по почте</b><small>Чтобы не потерять данные и получать новости приложения</small></span>
        <i aria-hidden="true">›</i>
      </a>
    );
  }
  return (
    <div className="acct">
      <span><b>{me.email}</b><small>Ты вошёл по почте</small></span>
      <button type="button" className="link-btn" onClick={async () => { if (confirm('Выйти из аккаунта на этом устройстве? Привычки и отметки останутся здесь.')) { await signOut(); location.reload(); } }}>Выйти</button>
    </div>
  );
}
