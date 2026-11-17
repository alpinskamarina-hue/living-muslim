import { GuidePage } from './Guide';
import { AdminPage, useIsAdmin } from './Admin';
import type { GoTo } from '../guide';
import { WordCard } from './Words';
import { LogoLockup } from './Logo';
import { ProPlans } from './Pro';
import { GiftPass } from './GiftPass';
import { Garden } from './Garden';
import { garden, journey } from '../gamify';
import { authMe, signInUrl, signOut } from '../auth';
import { useEffect, useRef, useState } from 'react';
import { RamadanPushFields } from './Ramadan';
import { canPrompt, DEFAULT_PREFS, disablePush, enablePush, isIOS, isStandalone, onInstallChange, promptInstall, pushSupported } from '../push';
import { isCloud, nicksReady } from '../cloud';
import { MyProfile, Ava, cachedProfile, refreshProfile } from './Nick';
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
  start?: Page;
  onGo?: (t: GoTo) => void;
}

export function Profile({ state, update, replace, times, onEdit, start, onGo }: Props) {
  const s = state.settings;
  const set = (patch: Partial<AppState['settings']>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const [page, setPage] = useState<Page>(start ?? 'main');
  const [, bump] = useState(0);
  const [nicks, setNicks] = useState(false);
  const admin = useIsAdmin();
  useEffect(() => { nicksReady().then(setNicks); }, []);
  useEffect(() => { if (isCloud && page === 'main') refreshProfile().then((ch) => ch && bump((n) => n + 1)); }, [page]);
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const back = () => go('main');

  if (page === 'garden') return <Sub title="Мой сад" onBack={back}><Garden state={state} today={dayKey(new Date())} /><WordCard t="garden" state={state} today={dayKey(new Date())} /></Sub>;
  if (page === 'pro') return <ProPlans onBack={back} />;
  if (page === 'gift') return <Sub title="Садака" onBack={back}><GiftPass /></Sub>;
  if (page === 'prayer') return <Sub title="Намазы" onBack={back}><PrayerSettings s={s} set={set} times={times} /></Sub>;
  if (page === 'habits') return <Sub title="Мои привычки" onBack={back}><HabitsSettings state={state} update={update} onEdit={onEdit} /></Sub>;
  if (page === 'remind') return <Sub title="Напоминания" onBack={back}><RemindPage s={s} set={set} times={times} /></Sub>;
  if (page === 'words') return <Sub title="Фразы и напоминания" onBack={back}><WordsSettings s={s} set={set} /></Sub>;
  if (page === 'look') return <Sub title="Внешний вид" onBack={back}><LookSettings s={s} set={set} /></Sub>;
  if (page === 'data') return <Sub title="Данные" onBack={back}><DataSettings state={state} replace={replace} /></Sub>;
  if (page === 'admin') return <Sub title="Аналитика" onBack={back}><AdminPage /></Sub>;
  if (page === 'guide') return <Sub title="Как пользоваться" onBack={back}><GuidePage go={(t) => onGo?.(t)} /></Sub>;
  if (page === 'help') return <Sub title="Помощь" onBack={back}><HelpPage /></Sub>;
  if (page === 'me') return <Sub title="Мой профиль" onBack={back}><MyProfile name={s.name.trim() || authMe()?.name || ''} onName={(n) => set({ name: n })} onSex={(g) => set({ me: g })} /></Sub>;
  if (page === 'account') return <Sub title="Аккаунт" onBack={back}><AccountPage s={s} set={set} /></Sub>;

  const me = authMe();
  const prof = isCloud ? cachedProfile() : null;
  const st = stats(state);
  const gd = garden(journey(state, dayKey(new Date())).lit);
  const used = slotsUsed(state);
  const name = s.name.trim() || me?.name || 'Друг';
  const methodName = METHODS.find((m) => m.id === s.method)?.ru ?? '';
  const theme = s.theme === 'light' ? 'светлая' : s.theme === 'dark' ? 'тёмная' : 'как в телефоне';

  return (
    <div className="page">
      <div className="me-card">
        <button type="button" className="me-top me-edit" onClick={() => go(isCloud && nicks ? 'me' : 'account')} aria-label="Изменить профиль">
          {isCloud && nicks && prof?.avatar ? <Ava pick={prof.avatar} color={prof.color} photo={prof.photo} name={name} size={56} />
            : <span className="me-av" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
          <span className="me-txt">
            <b>{name}</b>
            <small>{prof?.nick ? `@${prof.nick}` : me?.email ?? 'Вход по почте не выполнен'}</small>
            {prof?.bio ? <small>{prof.bio}</small> : <small>С нами {st.days} {plural(st.days, 'день', 'дня', 'дней')}</small>}
          </span>
          <span className="me-pen">✎ Изменить</span>
        </button>
        <div className="me-stats">
          <div><b>{st.onTime}<i>/35</i></b><small>намазов вовремя за неделю</small></div>
          <div><b>{st.formed}</b><small>{plural(st.formed, 'привычка закреплена', 'привычки закреплены', 'привычек закреплено')}</small></div>
          <div><b>{st.chapters}</b><small>{plural(st.chapters, 'глава прочитана', 'главы прочитаны', 'глав прочитано')}</small></div>
        </div>
      </div>

      {admin && (
        <button type="button" className="pro-entry adm-entry" onClick={() => go('admin')}>
          <span className="pro-badge adm-badge">📊</span>
          <span><b>Аналитика</b><small>Кто заходит, откуда, сколько регистраций. Видно только тебе</small></span>
          <i aria-hidden="true">›</i>
        </button>
      )}

      <button type="button" className="pro-entry" onClick={() => go('pro')}>
        <span className="pro-badge">PRO</span>
        <span><b>Living Muslim Pro</b><small>Цели, книги, курсы, большой Круг. 14 дней бесплатно</small></span>
        <i aria-hidden="true">›</i>
      </button>

      <button type="button" className="pro-entry gp-pentry" onClick={() => go('gift')}>
        <span className="pro-badge gp-badge">€10</span>
        <span><b>Подари пропуск на умру</b><small>Садака тому, кто едет к Каабе, но не может оплатить</small></span>
        <i aria-hidden="true">›</i>
      </button>

      <div className="menu">
        <Row icon="📖" title="Как пользоваться" sub="Гид по всем разделам и частые вопросы" onClick={() => go('guide')} />
        <Row icon="🌳" title="Мой сад" sub={`${gd.leaves} ${plural(gd.leaves, 'лист', 'листа', 'листьев')} · до плода ${gd.toFruit} ${plural(gd.toFruit, 'день', 'дня', 'дней')} · вехи`} onClick={() => go('garden')} />
        {isCloud && nicks && <Row icon="🪪" title="Мой профиль" sub={prof?.nick ? `@${prof.nick} · фото, приватность` : 'Ник, фото, кто может звать в круги'} onClick={() => go('me')} />}
        {!onClaude && <Row icon="👤" title="Аккаунт" sub={me ? `${me.email} · имя «${name}»` : 'Войти по почте, имя'} onClick={() => go('account')} />}
        {onClaude && <Row icon="👤" title="Имя" sub={name} onClick={() => go('account')} />}
        <Row icon="🕌" title="Намазы" sub={`${s.place} · ${methodName}`} onClick={() => go('prayer')} />
        {isCloud && <Row icon="🔔" title="Напоминания" sub={s.reminders?.on ? `Включены · ${s.reminders.prayers.length} из 5 намазов` : (isStandalone() ? 'Выключены' : 'Установить на телефон, напоминания')} onClick={() => go('remind')} />}
        <Row icon="🌱" title="Мои привычки" sub={`${used} из ${ACTIVE_LIMIT} мест занято`} onClick={() => go('habits')} />
        <Row icon="🤲" title="Фразы и напоминания" sub={`${s.me === 'f' ? 'Я сестра' : s.me === 'm' ? 'Я брат' : 'Брат или сестра?'} · ${(s.words ?? 'calm') === 'normal' ? 'обычно' : (s.words ?? 'calm') === 'calm' ? 'спокойно' : 'только фразы'}`} onClick={() => go('words')} />
        <Row icon="🎨" title="Внешний вид" sub={`Тема ${theme} · текст ${s.textScale && s.textScale > 1 ? 'крупнее' : 'обычный'}`} onClick={() => go('look')} />
        <Row icon="💾" title="Данные" sub="Резервная копия, перенос, удаление" onClick={() => go('data')} />
        <Row icon="🤝" title="Помощь" sub={SUPPORT_EMAIL ? "Написать нам, поделиться, конфиденциальность" : "Поделиться приложением, конфиденциальность"} onClick={() => go('help')} />
      </div>

      <LogoLockup />
      <p className="tiny ver">Версия 0.2<br />«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»</p>
    </div>
  );
}

export type Page = 'admin' | 'guide' | 'main' | 'gift' | 'words' | 'me' | 'garden' | 'remind' | 'pro' | 'account' | 'prayer' | 'habits' | 'look' | 'data' | 'help';
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

function WordsSettings({ s, set }: { s: AppState['settings']; set: SetFn }) {
  const mode = s.words ?? 'calm';
  const sex = s.me ?? '';
  return (
    <>
      <p className="page-sub">Исламские фразы на твои дела, аяты и хадисы с источником, ответы братьям и сёстрам в Круге.</p>
      <h2 className="sub-h">Я</h2>
      <div className="seg3" role="radiogroup" aria-label="Я">
        {([['m', 'Брат'], ['f', 'Сестра']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={sex === v} onClick={() => set({ me: v })}>{l}</button>
        ))}
      </div>
      <p className="tiny">От этого зависят формы: «{sex === 'f' ? 'выполнила' : 'выполнил'}», «БаракАллаху {sex === 'f' ? 'фики' : 'фик'}».</p>
      <h2 className="sub-h">Как часто</h2>
      <div className="seg3" role="radiogroup" aria-label="Как часто">
        {([['normal', 'Обычно'], ['calm', 'Спокойно'], ['phrases', 'Только фразы']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => set({ words: v })}>{l}</button>
        ))}
      </div>
      <p className="tiny">{mode === 'normal' ? 'Короткая фраза на каждое дело, до 3 аятов или хадисов в день.' : mode === 'calm' ? 'Короткая фраза на дело, аят или хадис изредка, не больше 2 в день.' : 'Только короткие фразы: Альхамдулиллях, МашаАллах. Без аятов и хадисов.'} Коран, Садака и другие разделы встречают одним напоминанием в день. Внизу экранов Сегодня и Цели есть напоминание дня, его можно скрыть. Один и тот же текст не повторяется чаще раза в неделю.</p>
      <div className="wc" style={{ margin: '14px 0' }}>
        <div className="wc-top"><em>Хадис</em></div>
        <p>Самые любимые дела у Аллаха — самые постоянные, даже если их мало.</p>
        <small className="wd-src">аль-Бухари, 6464; Муслим, 783</small>
      </div>
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

function RemindPage({ s, set, times }: { s: AppState['settings']; set: SetFn; times: DayTimes }) {
  const [, tick] = useState(0);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const r = { ...DEFAULT_PREFS, ...s.reminders };
  const setR = (patch: Partial<typeof r>) => set({ reminders: { ...r, ...patch } });
  const standalone = isStandalone();
  const ios = isIOS();

  const turnOn = async () => {
    setBusy(true); setMsg('');
    try {
      const e = await enablePush(s, { ...r, on: true });
      if (!e) { setR({ on: true }); setMsg('Готово. Первое напоминание придёт к ближайшему намазу.'); }
      else if (e === 'ios-install') setMsg('На iPhone напоминания работают только после установки на экран «Домой». Сначала установи приложение, как написано выше.');
      else if (e === 'denied') setMsg('Уведомления запрещены. Разреши их для этого сайта в настройках браузера или телефона и попробуй снова.');
      else setMsg('Этот браузер не умеет присылать напоминания. Попробуй Chrome на Android или установи приложение на iPhone.');
    } catch { setMsg('Не получилось связаться с сервером. Проверь интернет и попробуй ещё раз.'); }
    setBusy(false);
  };
  const turnOff = async () => { setBusy(true); await disablePush(); setR({ on: false }); setMsg('Напоминания выключены.'); setBusy(false); };
  const togglePrayer = (a: Anchor) => setR({ prayers: r.prayers.includes(a) ? r.prayers.filter((x) => x !== a) : ANCHORS.filter((x) => x === a || r.prayers.includes(x)) });

  return (
    <>
      <div className="inst">
        {standalone ? (
          <p><b>✓ Приложение установлено.</b> Оно открывается с экрана телефона, как обычное приложение.</p>
        ) : canPrompt() ? (
          <>
            <p><b>Установи Living Muslim на телефон.</b> Иконка на экране, открывается без браузера и работает без интернета.</p>
            <button type="button" className="pri-btn big-btn" onClick={() => promptInstall()}>Установить</button>
          </>
        ) : ios ? (
          <>
            <p><b>Установи на iPhone в два касания.</b> Без этого iPhone не присылает напоминания.</p>
            <ol><li>Открой сайт в Safari и нажми <b>Поделиться</b> (квадрат со стрелкой внизу экрана).</li><li>Выбери <b>«На экран „Домой“»</b> и нажми «Добавить».</li><li>Открой Living Muslim с иконки и вернись сюда.</li></ol>
          </>
        ) : (
          <>
            <p><b>Установи на телефон.</b> В Chrome открой меню <b>⋮</b> и выбери <b>«Установить приложение»</b> или «Добавить на главный экран».</p>
          </>
        )}
      </div>

      <h2 className="sub-h">Напоминания о намазах</h2>
      <div className="chips5">
        {ANCHORS.map((a) => (
          <button key={a} type="button" aria-pressed={r.prayers.includes(a)} onClick={() => togglePrayer(a)}>
            <span className="ar">{ANCHOR_LABEL[a].ar}</span>{ANCHOR_LABEL[a].ru}<small>{hhmm(times[a])}</small>
          </button>
        ))}
      </div>
      <label className="field">
        <span>Когда напоминать</span>
        <select value={r.before} onChange={(e) => setR({ before: Number(e.target.value) })}>
          <option value={0}>В момент намаза</option>
          <option value={5}>За 5 минут</option>
          <option value={10}>За 10 минут</option>
          <option value={15}>За 15 минут</option>
          <option value={30}>За 30 минут</option>
        </select>
      </label>
      <label className="field">
        <span>Вечерняя мухасаба</span>
        <select value={r.muhasaba} onChange={(e) => setR({ muhasaba: e.target.value })}>
          <option value="">Не напоминать</option>
          {['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'].map((t) => <option key={t} value={t}>В {t}</option>)}
        </select>
      </label>

      <h2 className="sub-h">Рамадан</h2>
      <p className="tiny">Приходят только в Рамадан. Язык этих напоминаний можно сменить на экране Рамадана (RU/EN).</p>
      <RamadanPushFields l={s.lang ?? 'ru'} prefs={r} onChange={(x) => setR({ ramadan: x })} />

      {r.on ? (
        <button type="button" className="ghost-btn" disabled={busy} onClick={turnOff}>Выключить напоминания</button>
      ) : (
        <button type="button" className="pri-btn big-btn" disabled={busy} onClick={turnOn}>{busy ? 'Включаю…' : 'Включить напоминания'}</button>
      )}
      {msg && <p className="tiny">{msg}</p>}
      {!pushSupported() && !msg && <p className="tiny">{ios && !standalone ? 'На iPhone сначала установи приложение на экран «Домой».' : 'В этом браузере напоминания могут не работать.'}</p>}
      <p className="tiny">Сервер знает только твой город и время намазов, чтобы прислать напоминание. Привычки и заметки остаются на телефоне.</p>
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
